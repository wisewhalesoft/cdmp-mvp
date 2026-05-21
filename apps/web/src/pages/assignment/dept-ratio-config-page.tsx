import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Eye, AlertTriangle, Check, GitBranch } from 'lucide-react';
import { AppLayout } from '@/components/layout/app-layout';
import { ConfirmModal } from '@/components/e07/ConfirmModal';
import { StageBadge, type Stage } from '@/components/e07/StageBadge';
import { useToast } from '@/components/ui/toast';
import {
  listLists,
  type AssignmentListItem,
} from '@/api/assignment-list';
import {
  advanceToPersonnelRatio,
  rollbackToDraft,
} from '@/api/assignment-stage';
import { DeptRatioForm } from './_components/dept-ratio-form';
import { ListSummaryCard } from './_components/list-summary-card';
import { getBusinessRole } from '@/stores/auth-store';
import { writePendingToast } from './_utils/pending-toast';

/**
 * F079 / F080 / F081 — 部門比例設定獨立頁
 *
 * 對應 prototype: /prototypes/29a-dept-ratio-config.html
 *
 * 路由：/assignment/lists/:listNo/dept-ratio
 * RBAC：DirectorRoute（寫入）；section_chief 可進入但只能讀（透過 readOnly）
 *
 * 主要區塊（由上至下）：
 *   - 5-step stage breadcrumb
 *   - 處長唯讀 banner（businessRole='section_chief'）
 *   - ListSummaryCard（名單摘要 + 篩選條件 chips + CR 開關）
 *   - DeptRatioForm（部門比例編輯表 + Sum Banner + 操作 bar）
 *
 * 階段守衛：list.stage 必為 'dept_ratio'，否則顯示 stage-mismatch-warning
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

function formatDate(iso: string): string {
  if (!iso) return '—';
  try {
    return iso.slice(0, 10);
  } catch {
    return iso;
  }
}

type StepState = 'done' | 'current' | 'todo';

function StageStep({ state, idx, label }: { state: StepState; idx: number; label: string }) {
  const dotClass = {
    done: 'bg-green-100 text-green-700',
    current: 'bg-blue-100 text-blue-700 ring-2 ring-blue-300',
    todo: 'bg-gray-100 text-gray-400',
  }[state];
  const labelClass = {
    done: 'text-gray-500',
    current: 'font-semibold text-primary',
    todo: 'text-gray-400',
  }[state];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span
        className={`inline-flex items-center justify-center w-[18px] h-[18px] rounded-full text-[10px] font-semibold ${dotClass}`}
        data-testid={`stage-step-${idx}-${state}`}
      >
        {state === 'done' ? <Check className="w-3 h-3" /> : idx}
      </span>
      <span className={labelClass}>{label}</span>
    </span>
  );
}

function StageBreadcrumb({ currentStage }: { currentStage: string }) {
  // 5 階段順序（與 prototype 29a 對齊）
  const stages = [
    { key: 'draft', label: '草稿' },
    { key: 'dept_ratio', label: '部門比例' },
    { key: 'personnel_ratio', label: '個別業務比例' },
    { key: 'approval', label: '簽核' },
    { key: 'ready', label: '準備完成' },
  ];
  const currentIdx = stages.findIndex((s) => s.key === currentStage);
  return (
    <div
      className="bg-white border border-gray-200 rounded-lg px-6 py-3 flex items-center gap-3 flex-wrap"
      data-testid="stage-breadcrumb"
    >
      <span className="text-xs text-gray-400 mr-1">階段路徑：</span>
      {stages.map((s, i) => {
        const state: StepState = i < currentIdx ? 'done' : i === currentIdx ? 'current' : 'todo';
        return (
          <span key={s.key} className="inline-flex items-center gap-2">
            <StageStep state={state} idx={i + 1} label={s.label} />
            {i < stages.length - 1 && <span className="text-gray-300 text-sm">›</span>}
          </span>
        );
      })}
      <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-gray-400">
        <GitBranch className="w-3 h-3" />F079 / F080 / F081
      </span>
    </div>
  );
}

export function DeptRatioConfigPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { listNo } = useParams<{ listNo: string }>();

  const [loading, setLoading] = useState(true);
  const [list, setList] = useState<AssignmentListItem | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [showAdvance, setShowAdvance] = useState(false);
  const [showRollback, setShowRollback] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [rollbacking, setRollbacking] = useState(false);

  const businessRole = getBusinessRole();
  const isSectionChief = businessRole === 'section_chief';
  const canWrite = !isSectionChief; // director / admin

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

  const stageMismatch = list && list.stage !== 'dept_ratio';

  const handleAdvanceConfirm = async () => {
    if (!listNo) return;
    setAdvancing(true);
    try {
      await advanceToPersonnelRatio(listNo);
      writePendingToast({
        type: 'success',
        msg: `名單 ${listNo} 部門比例已儲存`,
        sub: '已推進至個別比例設定階段',
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
      await rollbackToDraft(listNo);
      writePendingToast({
        type: 'info',
        msg: `名單 ${listNo} 已退回草稿`,
        sub: '部門比例已清空',
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
          <h1 className="text-base font-semibold text-gray-800">部門比例設定</h1>
          {list && <StageBadge stage={list.stage as Stage} />}
        </div>
      }
    >
      <main className="flex-1 p-6 space-y-4">
        {loading && (
          <div className="text-center text-gray-400 py-12" data-testid="dept-ratio-page-loading">
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
              找不到 listNo = <code className="font-mono">{listNo}</code>，可能已被停用或尚未建立。
            </p>
          </div>
        )}

        {!loading && list && (
          <>
            <StageBreadcrumb currentStage={list.stage} />

            {isSectionChief && (
              <div
                data-testid="director-readonly-banner"
                className="rounded-lg p-3 bg-purple-50 border border-purple-200 flex items-start gap-2 text-sm"
              >
                <Eye className="w-4 h-4 text-purple-700 mt-0.5 shrink-0" />
                <div className="flex-1">
                  <p className="font-semibold text-purple-900">
                    處長僅可查看部門比例，無編輯權
                  </p>
                  <p className="text-xs text-purple-700 mt-0.5">
                    部門比例由部長 / Admin 設定；您將於下一階段（個別業務比例）為本部門業務員分配比例。
                  </p>
                </div>
              </div>
            )}

            {stageMismatch && (
              <div
                data-testid="stage-mismatch-warning"
                className="rounded-lg p-3 bg-amber-50 border border-amber-200 flex items-start gap-2 text-sm"
              >
                <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                <div className="flex-1">
                  <p className="font-semibold text-amber-900">
                    名單目前階段為 <strong>{list.stage}</strong>，不在部門比例設定階段
                  </p>
                  <p className="text-xs text-amber-800 mt-0.5">
                    請至名單列表查看；若需編輯部門比例請先確認名單已推進至 dept_ratio 階段。
                  </p>
                </div>
              </div>
            )}

            <ListSummaryCard
              listNo={list.listNo}
              listNm={list.listNm}
              title="部門比例設定"
              description="為本名單之各在職部門設定 RATION，加總須 = 100%；推進後比例將鎖定（如需修改請 Rollback 至草稿）。"
              createdBy={list.createdBy}
              createdAt={formatDate(list.createdAt)}
              conditions={splitConditionsFromList(list)}
              crEnabled={true}
            />

            <DeptRatioForm
              listNo={list.listNo}
              totalEstimate={null}
              readOnly={!canWrite || !!stageMismatch}
              onRequestAdvance={canWrite && !stageMismatch ? () => setShowAdvance(true) : undefined}
              onRequestRollback={canWrite && !stageMismatch ? () => setShowRollback(true) : undefined}
              onCancel={() => navigate('/assignment/list-definitions')}
            />
          </>
        )}
      </main>

      {/* 推進 modal */}
      <ConfirmModal
        open={showAdvance}
        variant="info"
        title="推進至個別業務比例設定階段？"
        description={
          <div className="space-y-2 text-xs text-gray-600">
            <p>
              名單 <code className="font-mono text-primary">{listNo}</code>{' '}
              將推進至 <strong>個別業務比例</strong> 階段。
            </p>
            <p>
              推進後：部門比例鎖定；轄區處長將收到通知，並開始為本部門業務員設定個別比例。
            </p>
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

      {/* Rollback modal */}
      <ConfirmModal
        open={showRollback}
        variant="danger"
        title="退回草稿階段？資料將清空且無法復原"
        description={
          <div className="space-y-2 text-xs text-red-700">
            <p>
              所有部門 RATION 設定（<code className="font-mono">ob_dept_pct</code> 對應紀錄）將被刪除。
            </p>
            <p>
              Rollback 後可重新編輯篩選條件與 CR 開關，並可再次推進至部門比例設定階段。
            </p>
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
