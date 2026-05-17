import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Undo2, AlertTriangle } from 'lucide-react';
import { AppLayout } from '@/components/layout/app-layout';
import { Button } from '@/components/ui/button';
import { ConfirmModal } from '@/components/e07/ConfirmModal';
import { StageBadge, type Stage } from '@/components/e07/StageBadge';
import { useToast } from '@/components/ui/toast';
import {
  listLists,
  type AssignmentListItem,
} from '@/api/assignment-list';
import {
  advanceToApproval,
  getDeptRatios,
  getPersonnelRatios,
  rollbackToDeptRatio,
  type DeptRatioItem,
} from '@/api/assignment-stage';
import { PersonnelRatioForm } from './_components/personnel-ratio-form';
import { ListSummaryCard } from './_components/list-summary-card';
import {
  RejectionBanner,
  type LatestRejection,
} from './_components/rejection-banner';
import {
  PersonnelRatioAccordion,
  type AccordionDept,
} from './_components/personnel-ratio-accordion';
import { getBusinessRole } from '@/stores/auth-store';

/**
 * F082 / F083 / F084 / F085 — 個別業務比例設定獨立頁
 *
 * 對應 prototype: /prototypes/29b-personnel-ratio-config.html
 *
 * 路由：/assignment/lists/:listNo/personnel-ratio
 * RBAC：DirectorOrSectionChiefRoute（讀寫；section_chief 只能設定自己轄區）
 *
 * 主要區塊：
 *   - RejectionBanner（latestRejection 非 null 時顯示）
 *   - ListSummaryCard（名單摘要 + 篩選條件 chips）
 *   - PersonnelRatioAccordion（多部門 accordion，每 dept body 套 PersonnelRatioForm）
 *   - 操作 bar：返回 / 退回部門比例（director only） / 推進至簽核
 *
 * 階段守衛：list.stage 必為 'personnel_ratio'
 */

function splitConditionsFromList(list: AssignmentListItem): string[] {
  const conditions: string[] = [];
  if (list.prodKind) conditions.push(`PROD_KIND = ${list.prodKind}`);
  if (list.specTp) {
    const items = list.specTp.split('$$').filter(Boolean);
    conditions.push(`SPEC_TP in (${items.join(', ')})`);
  }
  if (list.caseYear) {
    const items = list.caseYear.split('$$').filter(Boolean);
    conditions.push(`CASEYEAR in (${items.join(', ')})`);
  }
  if (list.cardType) conditions.push(`CARD_TYPE = ${list.cardType}`);
  if (list.settleSrc) conditions.push(`SETTLE_SRC = ${list.settleSrc}`);
  return conditions;
}

interface DeptWithProgress extends AccordionDept {
  obdeptId: string;
  obdeptNm: string;
}

export function PersonnelRatioConfigPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { listNo } = useParams<{ listNo: string }>();

  const [loading, setLoading] = useState(true);
  const [list, setList] = useState<AssignmentListItem | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [depts, setDepts] = useState<DeptRatioItem[]>([]);
  const [latestRejection, setLatestRejection] = useState<LatestRejection | null>(
    null,
  );
  const [showAdvance, setShowAdvance] = useState(false);
  const [showRollback, setShowRollback] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [rollbacking, setRollbacking] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);

  const businessRole = getBusinessRole();
  const isSectionChief = businessRole === 'section_chief';
  const canRollbackDept = !isSectionChief; // F085 director only

  useEffect(() => {
    if (!listNo) return;
    let aborted = false;
    void (async () => {
      setLoading(true);
      setNotFound(false);
      try {
        const data = await listLists({});
        if (aborted) return;
        const found = data.lists.find((l) => l.listNo === listNo);
        if (!found) {
          setNotFound(true);
          setList(null);
        } else {
          setList(found);
        }
      } catch (err: unknown) {
        const e = err as { response?: { data?: { message?: string } } };
        showToast(e?.response?.data?.message ?? '載入名單失敗', 'error');
      } finally {
        if (!aborted) setLoading(false);
      }
    })();
    return () => {
      aborted = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listNo]);

  // 載入 dept list（accordion header 用）
  useEffect(() => {
    if (!listNo) return;
    let aborted = false;
    void (async () => {
      try {
        const data = await getDeptRatios(listNo);
        if (!aborted) setDepts(data.deptRatios ?? []);
      } catch {
        // 靜默；form 內部會自行 retry
      }
    })();
    return () => {
      aborted = true;
    };
  }, [listNo, refreshTick]);

  // 載入 latestRejection（從 personnel-ratio GET response）
  useEffect(() => {
    if (!listNo) return;
    let aborted = false;
    void (async () => {
      try {
        const data = await getPersonnelRatios(listNo);
        if (aborted) return;
        const rej = (data as { latestRejection?: LatestRejection | null })
          .latestRejection;
        if (rej) setLatestRejection(rej);
        else setLatestRejection(null);
      } catch {
        // 忽略；banner 可不顯示
      }
    })();
    return () => {
      aborted = true;
    };
  }, [listNo]);

  const stageMismatch = list && list.stage !== 'personnel_ratio';

  const handleAdvanceConfirm = async () => {
    if (!listNo) return;
    setAdvancing(true);
    try {
      await advanceToApproval(listNo);
      showToast(`名單 ${listNo} 已推進至簽核階段`, 'success');
      setShowAdvance(false);
      navigate(`/assignment/lists/${listNo}/approval`);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      showToast(e?.response?.data?.message ?? '推進失敗', 'error');
    } finally {
      setAdvancing(false);
    }
  };

  const handleRollbackConfirm = async () => {
    if (!listNo) return;
    setRollbacking(true);
    try {
      await rollbackToDeptRatio(listNo);
      showToast(`名單 ${listNo} 已退回部門比例階段`, 'warning');
      setShowRollback(false);
      navigate(`/assignment/lists/${listNo}/dept-ratio`);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      showToast(e?.response?.data?.message ?? '退回失敗', 'error');
    } finally {
      setRollbacking(false);
    }
  };

  const accordionDepts: DeptWithProgress[] = depts.map((d) => ({
    deptCode: d.obdeptId,
    deptName: d.obdeptNm,
    obdeptId: d.obdeptId,
    obdeptNm: d.obdeptNm,
  }));

  const handleFormSaved = useCallback(() => {
    setRefreshTick((t) => t + 1);
  }, []);

  return (
    <AppLayout
      headerLeft={
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/assignment/list-definitions')}
            className="text-gray-400 hover:text-gray-700"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-base font-semibold text-gray-800">
            個別業務比例設定
          </h1>
          {list && <StageBadge stage={list.stage as Stage} />}
        </div>
      }
    >
      <main className="flex-1 p-6 space-y-4">
        {loading && (
          <div
            className="text-center text-gray-400 py-12"
            data-testid="personnel-ratio-page-loading"
          >
            載入中...
          </div>
        )}

        {notFound && (
          <div
            data-testid="list-not-found"
            className="rounded-lg p-6 bg-red-50 border border-red-200 text-sm text-red-800"
          >
            <p className="font-semibold mb-1">找不到名單</p>
            <p className="text-xs">
              找不到 listNo = <code className="font-mono">{listNo}</code>。
            </p>
          </div>
        )}

        {!loading && list && (
          <>
            <RejectionBanner latestRejection={latestRejection} />

            {stageMismatch && (
              <div
                data-testid="stage-mismatch-warning"
                className="rounded-lg p-3 bg-amber-50 border border-amber-200 flex items-start gap-2 text-sm"
              >
                <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                <div className="flex-1">
                  <p className="font-semibold text-amber-900">
                    名單目前階段為 <strong>{list.stage}</strong>，不在個別業務比例設定階段
                  </p>
                  <p className="text-xs text-amber-800 mt-0.5">
                    請至名單列表查看當前階段；若需編輯個別業務比例請先確認名單處於 personnel_ratio 階段。
                  </p>
                </div>
              </div>
            )}

            <ListSummaryCard
              listNo={list.listNo}
              listNm={list.listNm}
              title="個別業務比例設定"
              description="為每個部門的在職業務員分配 RATION（每部門加總須 = 100%）。離職員工不計入分母。"
              createdBy={list.createdBy}
              createdAt={list.createdAt.slice(0, 10)}
              conditions={splitConditionsFromList(list)}
              crEnabled={true}
            />

            <PersonnelRatioAccordion
              depts={accordionDepts}
              defaultOpen
              showProgress
              renderDept={() => (
                <PersonnelRatioForm
                  listNo={list.listNo}
                  readOnly={!!stageMismatch}
                  onSaved={handleFormSaved}
                />
              )}
            />

            {!stageMismatch && (
              <div className="bg-white rounded-xl border border-gray-200 px-5 py-4 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => navigate('/assignment/list-definitions')}
                  className="text-sm text-gray-500 hover:text-gray-700 inline-flex items-center gap-1"
                >
                  <ArrowLeft className="w-4 h-4" />
                  返回名單列表
                </button>
                <div className="flex items-center gap-2">
                  {canRollbackDept && (
                    <Button
                      type="button"
                      variant="warning"
                      data-testid="btn-rollback-dept-ratio"
                      onClick={() => setShowRollback(true)}
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <Undo2 className="w-4 h-4" />
                        退回部門比例
                      </span>
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="primary"
                    data-testid="btn-advance-approval"
                    onClick={() => setShowAdvance(true)}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <ArrowRight className="w-4 h-4" />
                      儲存並推進至簽核
                    </span>
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      <ConfirmModal
        open={showAdvance}
        variant="info"
        title="推進至簽核階段？"
        description={
          <div className="space-y-2 text-xs text-gray-600">
            <p>
              名單 <code className="font-mono text-primary">{listNo}</code>{' '}
              將提交至 <strong>簽核審閱</strong> 階段；後端會檢查所有部門個別比例加總 = 100%。
            </p>
            <p>推進後個別比例將鎖定，僅能透過拒絕或 Rollback 重新編輯。</p>
          </div>
        }
        confirmLabel="確認推進"
        loading={advancing}
        loadingText="推進中..."
        onConfirm={handleAdvanceConfirm}
        onCancel={() => !advancing && setShowAdvance(false)}
        testId="confirm-advance-modal"
        confirmTestId="btn-confirm-advance"
      />

      <ConfirmModal
        open={showRollback}
        variant="warning"
        title="退回部門比例階段？"
        description={
          <div className="space-y-2 text-xs text-amber-700">
            <p>
              所有個別業務員 RATION 設定（<code className="font-mono">ob_empl_set</code>）將被刪除；
              部門比例保留不變。
            </p>
            <p>Rollback 後可重新編輯部門比例，並再次推進。</p>
          </div>
        }
        confirmLabel="確認 Rollback"
        loading={rollbacking}
        loadingText="退回中..."
        onConfirm={handleRollbackConfirm}
        onCancel={() => !rollbacking && setShowRollback(false)}
        testId="confirm-rollback-modal"
        confirmTestId="btn-confirm-rollback"
      />
    </AppLayout>
  );
}
