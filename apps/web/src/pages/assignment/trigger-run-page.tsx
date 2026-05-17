import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  PlayCircle,
  AlertTriangle,
  AlertOctagon,
  Layers,
  Eye,
  Activity,
  Clock,
  GitBranch,
} from 'lucide-react';
import { AppLayout } from '@/components/layout/app-layout';
import { Button } from '@/components/ui/button';
import { ConfirmModal } from '@/components/e07/ConfirmModal';
import { useToast } from '@/components/ui/toast';
import {
  getReadiness,
  triggerRun,
  type ReadinessResponse,
} from '@/api/assignment-run';
import {
  listLists,
  type AssignmentListItem,
} from '@/api/assignment-list';
import {
  PreCheckList,
  buildPreChecksFromReadiness,
} from './_components/pre-check-list';
import {
  RunSummaryPanel,
  type RunSummaryListItem,
} from './_components/run-summary-panel';
import { getBusinessRole, getUser } from '@/stores/auth-store';

/**
 * F061 觸發月跑頁（Phase 2 全面改造）
 *
 * 對應 prototype 31-trigger-run.html
 *
 * 主要區塊（依 prototype 由上而下）：
 *   - 處長唯讀 banner（businessRole='section_chief'）
 *   - 月跑執行中 banner（monthlyRunStatus='running'/'pending'）
 *   - 標題列 + CTA「啟動月跑」
 *   - 三份快照原子性提示
 *   - 左 7 欄：6 項 pre-check（PreCheckList）
 *   - 右 5 欄：本次執行摘要（RunSummaryPanel）
 *
 * RBAC：DirectorRoute（route guard 已掛）；section_chief 可進但顯示 readonly banner。
 */

function currentWorkYm(): string {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function buildRunSummaryLists(
  lists: AssignmentListItem[],
): RunSummaryListItem[] {
  return lists
    .filter((l) => l.stage === 'ready' && l.status === 'active')
    .map((l) => ({
      listNo: l.listNo,
      listNm: l.listNm,
      // estimatedCount 預設 0（後端尚未在 listLists 提供 per-list 預估數）；
      // P3 可改用 Stage 0 single-list estimate batch 補上實際數字
      estimatedCount: 0,
    }));
}

export function TriggerRunPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const businessRole = getBusinessRole();
  const isSectionChief = businessRole === 'section_chief';
  const canWrite = !isSectionChief;
  const triggeredByName = getUser()?.name ?? '當前使用者';

  const ym = currentWorkYm();
  const [readiness, setReadiness] = useState<ReadinessResponse | null>(null);
  const [readinessLoading, setReadinessLoading] = useState(true);
  const [summaryLists, setSummaryLists] = useState<RunSummaryListItem[]>([]);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [showConfirm, setShowConfirm] = useState(false);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    let aborted = false;
    void (async () => {
      setReadinessLoading(true);
      try {
        const r = await getReadiness(ym);
        if (!aborted) setReadiness(r);
      } catch {
        if (!aborted) setReadiness(null);
      } finally {
        if (!aborted) setReadinessLoading(false);
      }
    })();
    void (async () => {
      setSummaryLoading(true);
      try {
        const data = await listLists({ ym });
        if (!aborted) setSummaryLists(buildRunSummaryLists(data.lists ?? []));
      } catch {
        if (!aborted) setSummaryLists([]);
      } finally {
        if (!aborted) setSummaryLoading(false);
      }
    })();
    return () => {
      aborted = true;
    };
  }, [ym]);

  const checks = readiness ? buildPreChecksFromReadiness(readiness) : [];
  const allChecksPass =
    checks.length > 0 && checks.every((c) => c.status === 'pass');
  const isBlockingRun =
    readiness?.monthlyRunStatus === 'running' ||
    readiness?.monthlyRunStatus === 'pending';

  const triggerDisabled =
    !canWrite || readinessLoading || !allChecksPass || isBlockingRun;

  const handleTrigger = async () => {
    setRunning(true);
    try {
      const result = await triggerRun();
      showToast(`月跑已觸發（runId: ${result.runId}）`, 'success');
      setShowConfirm(false);
      navigate(`/assignment/run-progress?runId=${result.runId}`);
    } catch (err: unknown) {
      const e = err as {
        response?: {
          status?: number;
          data?: { error?: string; message?: string };
        };
      };
      const status = e?.response?.status;
      let msg = e?.response?.data?.message ?? '月跑觸發失敗';
      if (status === 409) msg = '當月已有月跑執行中或已完成';
      else if (status === 503) msg = '功能未啟用（ENABLE_E07_REFACTOR_PHASE3=false）';
      showToast(msg, 'error');
      setShowConfirm(false);
    } finally {
      setRunning(false);
    }
  };

  return (
    <AppLayout title="觸發月跑">
      <main className="flex-1 p-6">
        <div className="max-w-6xl mx-auto space-y-4">
          {/* 處長唯讀 banner */}
          {isSectionChief && (
            <div
              data-testid="director-readonly-banner"
              className="rounded-lg p-3 bg-purple-50 border border-purple-200 flex items-start gap-2 text-sm"
            >
              <Eye className="w-4 h-4 text-purple-700 mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="font-semibold text-purple-900">處長角色為唯讀檢視</p>
                <p className="text-xs text-purple-800 mt-0.5">
                  您可查看本月月跑前置檢查與三份快照規劃，但無法觸發月跑（僅部長 / Admin 可執行）。
                </p>
              </div>
            </div>
          )}

          {/* 月跑執行中 banner */}
          {isBlockingRun && (
            <div
              data-testid="running-banner"
              className="rounded-lg p-4 bg-amber-50 border-2 border-amber-200 flex items-start gap-2"
            >
              <AlertOctagon className="w-5 h-5 text-amber-700 mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="font-semibold text-amber-900">
                  月跑執行中（無法重複觸發）
                </p>
                <p className="text-xs text-amber-800 mt-1">
                  本月（{ym}）assignment_run 處於{' '}
                  <span className="font-semibold">
                    {readiness?.monthlyRunStatus}
                  </span>{' '}
                  狀態；同月僅允許一個 pending/running 月跑（BR-2）。
                </p>
                <button
                  type="button"
                  onClick={() => navigate('/assignment/history')}
                  className="mt-2 inline-flex items-center gap-1 text-sm text-primary hover:underline font-medium"
                >
                  <Activity className="w-4 h-4" />
                  前往執行歷史查看
                </button>
              </div>
            </div>
          )}

          {/* 標題列 + CTA */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
            <div className="flex items-start justify-between gap-6 flex-wrap">
              <div className="flex-1 min-w-[300px]">
                <div className="flex items-center gap-2 mb-2">
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded-full bg-blue-100 text-primary">
                    <Clock className="w-3 h-3" />
                    作業年月 {ym}
                  </span>
                  <span className="text-xs text-gray-400">project_workym</span>
                </div>
                <h2 className="text-xl font-bold text-gray-900">
                  觸發 {ym.slice(0, 4)}-{ym.slice(4, 6)} 月跑
                </h2>
                <p className="text-sm text-gray-600 mt-1">
                  啟動全流程 Stage 0~4 + 三份快照原子性寫入。
                  本次將處理{' '}
                  <span className="font-semibold text-gray-900">
                    {summaryLists.length}
                  </span>{' '}
                  個 ready 名單。
                </p>
                <div className="mt-3 flex items-center gap-4 text-xs text-gray-500 flex-wrap">
                  <span>
                    <Eye className="w-3 h-3 inline mr-0.5" />
                    觸發者 {triggeredByName}
                  </span>
                  <span>
                    <Clock className="w-3 h-3 inline mr-0.5" />
                    預估執行時間 &lt; 30 分鐘 (NFR-003, 10 萬筆)
                  </span>
                  <span>
                    <GitBranch className="w-3 h-3 inline mr-0.5" />
                    計分版本{' '}
                    {readiness?.scoringActive ? 'active' : 'inactive'}
                  </span>
                </div>
              </div>

              {canWrite && (
                <div className="flex flex-col items-end gap-2">
                  <Button
                    type="button"
                    variant="danger"
                    data-testid="btn-start-run"
                    disabled={triggerDisabled}
                    onClick={() => setShowConfirm(true)}
                  >
                    <span className="inline-flex items-center gap-2 text-base font-semibold">
                      <PlayCircle className="w-5 h-5" />
                      啟動月跑
                    </span>
                  </Button>
                  <p className="text-xs text-gray-400">POST /api/v1/assignment/runs</p>
                </div>
              )}
            </div>
          </div>

          {/* 三份快照原子性提示 */}
          <div className="flex items-start gap-2 p-3 bg-blue-50/60 border border-blue-100 rounded-lg text-sm text-gray-700">
            <Layers className="w-4 h-4 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-primary">
                啟動後將原子性寫入三份快照（AD-E07-2）
              </p>
              <p className="text-xs text-gray-600 mt-0.5">
                於同一 DB Transaction 中：
                <code className="font-mono">config</code>（本次設定）+{' '}
                <code className="font-mono">input_list</code>（候選名單）+{' '}
                <code className="font-mono">result</code>（最終分派）。
                任一失敗整體 Rollback，
                <code className="font-mono">assignment_run.status = 'failed'</code>。
                歷史快照不可變，不被覆蓋（BR-3）。
              </p>
            </div>
          </div>

          {/* 主體：pre-check + summary 兩欄 */}
          <div className="grid grid-cols-12 gap-5">
            <div className="col-span-7">
              <PreCheckList readiness={readiness} loading={readinessLoading} />
            </div>
            <div className="col-span-5">
              <RunSummaryPanel
                workYm={ym}
                triggeredBy={triggeredByName}
                lists={summaryLists}
                loading={summaryLoading}
              />
            </div>
          </div>
        </div>
      </main>

      <ConfirmModal
        open={showConfirm}
        variant="warning"
        title={`確認觸發 ${ym} 月跑？`}
        description={
          <div className="space-y-2 text-xs text-gray-600">
            <p>
              將執行 <strong>{summaryLists.length}</strong> 個 ready 名單之客戶分派計算並寫入 3 份快照。
            </p>
            <p className="flex items-center gap-1 justify-center text-amber-700">
              <AlertTriangle className="w-3 h-3" />
              觸發後可至執行進度頁取消（director only）
            </p>
          </div>
        }
        confirmLabel="確認觸發"
        loading={running}
        loadingText="觸發中..."
        onConfirm={handleTrigger}
        onCancel={() => !running && setShowConfirm(false)}
        testId="confirm-trigger-modal"
        confirmTestId="btn-confirm-trigger"
      />
    </AppLayout>
  );
}
