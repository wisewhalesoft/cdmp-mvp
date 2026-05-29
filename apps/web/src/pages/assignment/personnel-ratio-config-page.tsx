import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Undo2, AlertTriangle, Save, X } from 'lucide-react';
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
  getPersonnelRatios,
  rollbackToDeptRatio,
  type PersonnelRatioDepartment,
  type SetPersonnelRatiosResponse,
} from '@/api/assignment-stage';
import {
  PersonnelRatioForm,
  type PersonnelRatioFormHandle,
} from './_components/personnel-ratio-form';
import { ListSummaryCard } from './_components/list-summary-card';
import { StageBreadcrumb } from './_components/stage-breadcrumb';
import { PersonnelProgressBanner } from './_components/personnel-progress-banner';
import {
  RejectionBanner,
  type LatestRejection,
} from './_components/rejection-banner';
import {
  PersonnelRatioAccordion,
  type AccordionDept,
  type DeptStatus,
} from './_components/personnel-ratio-accordion';
import { getBusinessRole } from '@/stores/auth-store';
import { writePendingToast } from './_utils/pending-toast';

/**
 * F082 / F083 / F084 / F085 — 個別業務比例設定獨立頁
 *
 * 對應 prototype: /prototypes/29b-personnel-ratio-config.html
 *
 * 主要區塊（由上至下）：
 *   - 5-step stage breadcrumb（current=personnel_ratio）
 *   - RejectionBanner（latestRejection 非 null 時顯示）
 *   - ListSummaryCard（名單摘要 + 篩選條件 chips）
 *   - PersonnelProgressBanner（整體完成進度 + 業務員總數）
 *   - PersonnelRatioAccordion（多部門 accordion；每 dept body 套 PersonnelRatioForm）
 *   - 操作 bar：取消 / 退回部門比例 / 儲存全部 / 儲存並推進至簽核
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
  department: PersonnelRatioDepartment;
}

function deriveStatus(d: PersonnelRatioDepartment): DeptStatus {
  if (d.allResigned) return 'done';
  if (d.deptSum === 0) return 'todo';
  if (d.sumValidated) return 'done';
  return 'pending';
}

export function PersonnelRatioConfigPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { listNo } = useParams<{ listNo: string }>();

  const [loading, setLoading] = useState(true);
  const [list, setList] = useState<AssignmentListItem | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [departments, setDepartments] = useState<PersonnelRatioDepartment[]>([]);
  const [latestRejection, setLatestRejection] = useState<LatestRejection | null>(null);
  // F084 v2.0：GET personnel ratios 回傳之 isReadOnly（歷史月份 / 非 personnel_ratio / 已停用）
  // 與 stage，用於 fallback 手動推進按鈕的渲染守衛（§7.2 / AC-7）
  const [ratiosReadOnly, setRatiosReadOnly] = useState(false);
  const [ratiosStage, setRatiosStage] = useState<string | null>(null);
  const [showAdvance, setShowAdvance] = useState(false);
  const [showRollback, setShowRollback] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [rollbacking, setRollbacking] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [savingAll, setSavingAll] = useState(false);
  // F084 v2.0：auto-advance 因月跑 guard 跳過時，退回顯示 fallback 手動推進按鈕（§7.1 月跑分支 / §7.2）
  const [guardSkippedShowFallback, setGuardSkippedShowFallback] = useState(false);

  // form refs（依 deptCode 收集；給「儲存全部」遍歷使用）
  const formRefs = useRef<Map<string, PersonnelRatioFormHandle>>(new Map());

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
        // F097：名單 project_workym 可能為未來月（作業月＝下月）；listNo 內嵌 YYYYMM
        // （OB + YYYYMM + NNN），以此查詢對應月份，避免 listLists 預設當月找不到下月名單。
        const ymFromListNo = listNo.match(/^OB(\d{6})/)?.[1];
        const data = await listLists(ymFromListNo ? { ym: ymFromListNo } : {});
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

  // 載入 departments 與 latestRejection（單一 endpoint）
  useEffect(() => {
    if (!listNo) return;
    let aborted = false;
    void (async () => {
      try {
        const data = await getPersonnelRatios(listNo);
        if (aborted) return;
        setDepartments(data.departments ?? []);
        setLatestRejection(data.latestRejection ?? null);
        setRatiosReadOnly(!!data.isReadOnly);
        setRatiosStage(data.stage ?? null);
      } catch (err: unknown) {
        if (!aborted) {
          const e = err as { response?: { data?: { message?: string } } };
          showToast(e?.response?.data?.message ?? '載入部門資料失敗', 'error');
        }
      }
    })();
    return () => {
      aborted = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listNo, refreshTick]);

  const stageMismatch = list && list.stage !== 'personnel_ratio';

  const handleAdvanceConfirm = async () => {
    if (!listNo) return;
    setAdvancing(true);
    try {
      await advanceToApproval(listNo);
      writePendingToast({
        type: 'success',
        msg: `名單『${list?.listNm ?? listNo}』已推進至簽核階段`,
        sub: '等待部長核准（手動推進 fallback）',
      });
      setShowAdvance(false);
      navigate('/assignment/list-definitions');
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
      writePendingToast({
        type: 'info',
        msg: `名單 ${listNo} 已退回部門比例`,
        sub: '處長設定將清空',
      });
      setShowRollback(false);
      navigate('/assignment/list-definitions');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      showToast(e?.response?.data?.message ?? '退回失敗', 'error');
    } finally {
      setRollbacking(false);
    }
  };

  const handleSaveAll = async () => {
    setSavingAll(true);
    try {
      const entries = Array.from(formRefs.current.entries());
      const savable = entries.filter(([, ref]) => ref.isSavable());
      if (savable.length === 0) {
        showToast('無可儲存部門（加總非 100% 或全員離職）', 'warning');
        return;
      }
      const results = await Promise.all(savable.map(([, ref]) => ref.save()));
      const okCount = results.filter((r) => r != null).length;
      if (okCount === savable.length) {
        showToast(`已儲存全部 ${okCount} 個部門`, 'success');
      } else {
        showToast(`部分儲存失敗（${okCount}/${savable.length} 成功）`, 'warning');
      }
      // F084 v2.0：Promise.all 並發存多部門 → 依任一 response 的 auto-advance 結果分支
      const handled = handleAutoAdvanceResult(results);
      // auto-advance 成功（已 redirect）時不需 refresh（頁面即將離開）
      if (!handled.redirected) {
        setRefreshTick((t) => t + 1);
      }
    } finally {
      setSavingAll(false);
    }
  };

  /**
   * F084 v2.0 auto-advance response 分支（§7.1 / AC-5 / AC-6；前端 response-driven，無 flag）。
   *
   * 「儲存全部」為 Promise.all 並發存多部門，故收集所有 response 後：
   *   - 任一 autoAdvanced=true → 自動推進成功 toast + 跨頁 pendingToast + redirect 名單列表
   *   - 否則任一 autoAdvanceFailReason=ASSIGNMENT_RUN_ALREADY_RUNNING → 月跑 warning toast +
   *     退回顯示 fallback 手動按鈕（不 redirect）
   *   - 否則（部分完成 / flag off → autoAdvanced:false 無 failReason）→ 不額外 toast
   *     （子元件已顯示各部門「已儲存」toast）
   *
   * @returns { redirected } 是否已觸發 redirect（呼叫端據此決定是否 refresh）
   */
  const handleAutoAdvanceResult = (
    results: Array<SetPersonnelRatiosResponse | null>,
  ): { redirected: boolean } => {
    const responses = results.filter((r): r is SetPersonnelRatiosResponse => r != null);
    const listNm = list?.listNm ?? listNo ?? '';

    if (responses.some((r) => r.autoAdvanced)) {
      // auto-advance 成功（§7.1 / AC-6）
      writePendingToast({
        type: 'success',
        msg: `名單『${listNm}』已自動推進至簽核階段`,
        sub: '等待部長核准（auto-advance）',
      });
      showToast(`名單『${listNm}』已自動推進至簽核階段，等待部長核准`, 'success');
      navigate('/assignment/list-definitions');
      return { redirected: true };
    }

    if (
      responses.some(
        (r) => r.autoAdvanceFailReason === 'ASSIGNMENT_RUN_ALREADY_RUNNING',
      )
    ) {
      // 月跑 guard 跳過（§7.1 月跑分支 / AC-5）：退回 fallback 手動按鈕
      setGuardSkippedShowFallback(true);
      showToast('比例已儲存；因分派執行中，請待月跑完成後手動推進至簽核', 'warning');
      return { redirected: false };
    }

    // 部分完成 / flag off：不額外 toast（子元件已顯示「已儲存」）
    return { redirected: false };
  };

  const accordionDepts: DeptWithProgress[] = useMemo(
    () =>
      departments.map((d) => ({
        deptCode: d.deptCode,
        deptName: d.deptName,
        directorName: d.directorName,
        deptRatio: d.deptRatio,
        activeCount: d.activeCount,
        sum: d.deptSum,
        status: deriveStatus(d),
        offline: d.allResigned,
        department: d,
      })),
    [departments],
  );

  const totalEmployees = useMemo(
    () => departments.reduce((acc, d) => acc + d.activeCount, 0),
    [departments],
  );

  const doneCount = useMemo(
    () => accordionDepts.filter((d) => d.status === 'done').length,
    [accordionDepts],
  );

  const allDone = doneCount === accordionDepts.length && accordionDepts.length > 0;

  // 處長本部門（isInScope）是否完成（§7.2 / AC-7：處長本部門未完成時 fallback 按鈕 disabled）
  const ownDeptDone = useMemo(() => {
    if (!isSectionChief) return true;
    const own = departments.filter((d) => d.isInScope);
    if (own.length === 0) return false;
    return own.every((d) => d.allResigned || d.sumValidated);
  }, [isSectionChief, departments]);

  // F084 v2.0 fallback 手動推進按鈕渲染 / disabled 守衛（response-driven，對齊 prototype renderActionBar）
  //   - 渲染條件（§7.2 / AC-7）：stage=personnel_ratio 且非唯讀（歷史 / 停用 / 非此階段 → 完全不渲染）
  //     且（allDone 或 月跑 guard 跳過退回 fallback）。flag off 時 response 永遠 autoAdvanced:false
  //     無 failReason → allDone 時自然顯示手動按鈕（= 既有手動行為）。
  //   - disabled：月跑進行中（guard 跳過）/ 處長本部門未完成 / 尚有部門未完成。
  const fallbackStageOk = (ratiosStage ?? list?.stage) === 'personnel_ratio' && !ratiosReadOnly;
  const showFallbackAdvance = fallbackStageOk && (allDone || guardSkippedShowFallback);
  const fallbackDisabled =
    guardSkippedShowFallback || (isSectionChief && !ownDeptDone) || !allDone;
  const fallbackTip = guardSkippedShowFallback
    ? '分派執行中，無法推進'
    : isSectionChief && !ownDeptDone
    ? '本部門業務員比例尚未設定完成'
    : !allDone
    ? '尚有部門的個別業務比例未完成設定'
    : '';

  const handleFormSaved = useCallback(
    (res: SetPersonnelRatiosResponse) => {
      // 單一部門儲存（含處長存自己最後一個部門）→ 同樣依 response 觸發 auto-advance 分支
      const handled = handleAutoAdvanceResult([res]);
      if (!handled.redirected) {
        setRefreshTick((t) => t + 1);
      }
    },
    // handleAutoAdvanceResult 依賴 list / listNo / navigate / showToast，皆為穩定或 page 級值
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [list, listNo],
  );

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
          <h1 className="text-base font-semibold text-gray-800">個別業務比例設定</h1>
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
            <StageBreadcrumb
              currentStage={list.stage}
              featureIds="F082 / F083 / F084 / F085 / F087"
            />

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

            {accordionDepts.length > 0 && (
              <PersonnelProgressBanner
                doneCount={doneCount}
                totalCount={accordionDepts.length}
                totalEmployees={totalEmployees}
              />
            )}

            <PersonnelRatioAccordion
              depts={accordionDepts}
              defaultOpen
              renderDept={(d) => (
                <PersonnelRatioForm
                  ref={(handle) => {
                    if (handle) formRefs.current.set(d.deptCode, handle);
                    else formRefs.current.delete(d.deptCode);
                  }}
                  listNo={list.listNo}
                  department={d.department}
                  readOnly={!!stageMismatch}
                  onSaved={handleFormSaved}
                />
              )}
            />

            {!stageMismatch && (
              <div className="bg-white rounded-xl border border-gray-200 px-5 py-4 flex items-center justify-between gap-3 flex-wrap">
                <button
                  type="button"
                  onClick={() => navigate('/assignment/list-definitions')}
                  className="text-sm text-gray-500 hover:text-gray-700 inline-flex items-center gap-1"
                >
                  <X className="w-4 h-4" />取消（返回名單列表）
                </button>
                <div className="flex items-center gap-2 flex-wrap">
                  {canRollbackDept && (
                    <Button
                      type="button"
                      variant="warning"
                      data-testid="btn-rollback-dept-ratio"
                      onClick={() => setShowRollback(true)}
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <Undo2 className="w-4 h-4" />退回部門比例
                      </span>
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="secondary"
                    data-testid="btn-save-all"
                    loading={savingAll}
                    loadingText="儲存中..."
                    disabled={!allDone}
                    onClick={handleSaveAll}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <Save className="w-4 h-4" />儲存全部
                    </span>
                  </Button>
                  {showFallbackAdvance && (
                    <span title={fallbackTip || undefined} className="inline-flex">
                      <Button
                        type="button"
                        variant="primary"
                        data-testid="btn-advance-approval"
                        disabled={fallbackDisabled}
                        onClick={() => setShowAdvance(true)}
                      >
                        <span className="inline-flex items-center gap-1.5">
                          <ArrowRight className="w-4 h-4" />推進至簽核
                        </span>
                      </Button>
                    </span>
                  )}
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
