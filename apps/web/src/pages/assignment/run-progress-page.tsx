import { useEffect, useState, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Activity,
  CheckCircle2,
  CheckCircle,
  AlertTriangle,
  Clock,
  Loader2,
  ArrowLeft,
  XOctagon,
  FileBarChart,
  Camera,
  Download,
  RotateCw,
  Percent,
  XCircle,
  Eye,
} from 'lucide-react';
import { AppLayout } from '@/components/layout/app-layout';
import { Button } from '@/components/ui/button';
import { ConfirmModal } from '@/components/e07/ConfirmModal';
import { useToast } from '@/components/ui/toast';
import {
  getRun,
  cancelRun as apiCancelRun,
  type RunProgressResponse,
  type RunStatus,
} from '@/api/assignment-run';
import {
  StageStepper,
  type StepperStage,
} from './_components/stage-stepper';
import { ElapsedTimer } from './_components/elapsed-timer';
import { getBusinessRole } from '@/stores/auth-store';

/**
 * F062 月跑進度頁（Phase 2 全面改造）
 *
 * 對應 prototype 32-run-progress.html
 *
 * 主要區塊：
 *   - Run Summary Card：status badge + runId + 已執行 elapsed timer + 取消按鈕（director）
 *   - 完成 / 失敗 / 待執行 banner（含跳轉連結）
 *   - 橫向 5-step Stage Stepper
 *   - 總體進度條 + 階段細項列表
 */

const POLL_INTERVAL_MS = 3000;

// 期望 5 個 stages（Stage 0~4），若 backend 回傳少於 5 個，補齊 pending 確保 stepper 視覺完整
const EXPECTED_STAGES: Array<{ name: string; subtitle: string }> = [
  { name: 'Stage 0', subtitle: '日比例試算' },
  { name: 'Stage 1', subtitle: '案件池篩選' },
  { name: 'Stage 2', subtitle: '計分' },
  { name: 'Stage 3', subtitle: '部門分派' },
  { name: 'Stage 4', subtitle: '個別分派' },
];

const STATUS_CONFIG: Record<
  RunStatus,
  { label: string; bg: string; text: string; icon: typeof Activity }
> = {
  pending: { label: '排程中', bg: 'bg-gray-100', text: 'text-gray-600', icon: Clock },
  running: { label: '執行中', bg: 'bg-blue-100', text: 'text-blue-800', icon: Loader2 },
  completed: {
    label: '已完成',
    bg: 'bg-green-100',
    text: 'text-green-700',
    icon: CheckCircle2,
  },
  failed: { label: '失敗', bg: 'bg-red-100', text: 'text-red-700', icon: AlertTriangle },
};

function StatusBadge({ status }: { status: RunStatus }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  const Icon = cfg.icon;
  return (
    <span
      data-testid={`run-status-${status}`}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}
    >
      <Icon className={`w-3.5 h-3.5 ${status === 'running' ? 'animate-spin' : ''}`} />
      {cfg.label}
    </span>
  );
}

function buildStepperStages(
  apiStages: RunProgressResponse['stages'],
): StepperStage[] {
  const apiByName = new Map<string, NonNullable<RunProgressResponse['stages']>[number]>();
  for (const s of apiStages ?? []) {
    apiByName.set(s.name, s);
  }
  return EXPECTED_STAGES.map((exp) => {
    const found = apiByName.get(exp.name);
    return {
      name: exp.name,
      subtitle: exp.subtitle,
      status: (found?.status ?? 'pending') as StepperStage['status'],
    };
  });
}

export function RunProgressPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [searchParams] = useSearchParams();
  const runId = searchParams.get('runId') ?? '';
  const businessRole = getBusinessRole();
  const canCancel = businessRole !== 'section_chief';
  const isSectionChief = businessRole === 'section_chief';

  const [data, setData] = useState<RunProgressResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCancel, setShowCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!runId) {
      setError('缺少 runId 參數');
      setLoading(false);
      return;
    }

    let aborted = false;

    const poll = async () => {
      try {
        const result = await getRun(runId);
        if (aborted) return;
        setData(result);
        setLoading(false);
        if (result.status === 'completed' || result.status === 'failed') {
          if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
        }
      } catch (err: unknown) {
        const e = err as { response?: { data?: { message?: string } } };
        if (!aborted) {
          setError(e?.response?.data?.message ?? '取得月跑進度失敗');
          setLoading(false);
        }
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      }
    };

    void poll();
    pollRef.current = setInterval(() => void poll(), POLL_INTERVAL_MS);
    return () => {
      aborted = true;
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [runId]);

  const handleCancel = async () => {
    if (!runId) return;
    setCancelling(true);
    try {
      await apiCancelRun(runId);
      showToast('月跑已取消（status=failed）', 'warning');
      setShowCancel(false);
      // poll 會自然撈到新 status
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      showToast(e?.response?.data?.message ?? '取消失敗', 'error');
    } finally {
      setCancelling(false);
    }
  };

  const totalProgress = data?.totals?.progressPercent ?? 0;
  const stepperStages = data ? buildStepperStages(data.stages) : [];
  const showCancelBtn =
    canCancel &&
    (data?.status === 'pending' || data?.status === 'running');

  return (
    <AppLayout
      headerLeft={
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/assignment/history')}
            className="text-gray-400 hover:text-gray-700"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-base font-semibold text-gray-800">月跑執行進度</h1>
          {data && <StatusBadge status={data.status} />}
        </div>
      }
    >
      <main className="flex-1 p-6">
        <div className="max-w-5xl mx-auto space-y-4">
          {/* P3-2 Phase 4：處長唯讀提示 banner */}
          {isSectionChief && (
            <div
              data-testid="director-readonly-banner"
              className="rounded-lg p-3 bg-purple-50 border border-purple-200 flex items-start gap-2 text-sm"
            >
              <Eye className="w-4 h-4 text-purple-700 mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="font-semibold text-purple-900">處長角色為唯讀檢視</p>
                <p className="text-xs text-purple-800 mt-0.5">
                  您可查看月跑執行進度與三份快照規劃，但無法取消月跑（僅部長 / Admin 可執行）。
                </p>
              </div>
            </div>
          )}

          {loading && !data && (
            <div className="p-12 text-center text-gray-400" data-testid="run-loading">
              載入月跑資料中...
            </div>
          )}

          {error && (
            <div
              data-testid="run-error"
              className="rounded-lg p-3 bg-red-50 border border-red-200 flex items-start gap-2 text-sm"
            >
              <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
              <span className="text-red-800">{error}</span>
            </div>
          )}

          {data && (
            <>
              {/* Run summary card */}
              <section className="bg-white rounded-lg border border-gray-200 shadow-sm">
                <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-3">
                    <StatusBadge status={data.status} />
                    <span className="text-xs text-gray-500">Run ID</span>
                    <span className="font-mono text-xs font-semibold text-gray-700 bg-gray-100 px-2 py-0.5 rounded">
                      {data.runId.slice(0, 13)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 inline-flex items-center gap-1">
                      <RotateCw className="w-3 h-3" />
                      Polling 3 秒自動更新
                    </span>
                    {showCancelBtn && (
                      <Button
                        type="button"
                        variant="danger"
                        data-testid="btn-cancel-run"
                        onClick={() => setShowCancel(true)}
                      >
                        <span className="inline-flex items-center gap-1 text-xs">
                          <XOctagon className="w-3.5 h-3.5" />
                          取消月跑
                        </span>
                      </Button>
                    )}
                  </div>
                </div>
                <div className="px-5 py-4 grid grid-cols-5 gap-4">
                  <div>
                    <div className="text-xs text-gray-500 mb-1">作業年月</div>
                    <div className="text-sm font-semibold text-gray-800 font-mono">
                      {data.ym}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">觸發者</div>
                    <div className="text-sm font-medium text-gray-800">
                      {data.triggeredBy}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">觸發時間</div>
                    <div className="text-sm text-gray-700 font-mono">
                      {new Date(data.triggeredAt).toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">已執行</div>
                    <ElapsedTimer
                      startTime={data.triggeredAt}
                      status={data.status}
                      finishedAt={data.finishedAt ?? null}
                    />
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">總筆數</div>
                    <div className="text-sm font-semibold text-gray-800 tabular-nums">
                      {data.totals?.totalCount?.toLocaleString() ?? '—'}
                    </div>
                  </div>
                </div>
              </section>

              {/* Banners */}
              {data.status === 'completed' && (
                <div
                  data-testid="completed-banner"
                  className="flex items-start gap-3 p-4 bg-green-50 border border-green-200 rounded-lg"
                >
                  <CheckCircle className="w-5 h-5 text-green-700 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <p className="font-semibold text-green-800">
                      執行完成（共分派 {data.totals?.processedCount?.toLocaleString() ?? '—'} 筆）
                    </p>
                    <p className="text-xs text-gray-600 mt-0.5">
                      三份快照（config / input_list / result）已寫入。建議下一步：
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          navigate(`/assignment/run-summary?runId=${runId}`)
                        }
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-primary bg-white border border-blue-200 rounded-md hover:bg-blue-50"
                      >
                        <FileBarChart className="w-3.5 h-3.5" />
                        結果摘要
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          navigate(`/assignment/run-summary?runId=${runId}#export`)
                        }
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-primary bg-white border border-blue-200 rounded-md hover:bg-blue-50"
                      >
                        <Download className="w-3.5 h-3.5" />
                        匯出結果
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          navigate(`/assignment/snapshots?runId=${runId}`)
                        }
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-primary bg-white border border-blue-200 rounded-md hover:bg-blue-50"
                      >
                        <Camera className="w-3.5 h-3.5" />
                        快照詳情
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {data.status === 'failed' && (
                <div
                  data-testid="failed-banner"
                  className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg"
                >
                  <XCircle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <p className="font-semibold text-red-700">執行失敗</p>
                    {data.errorMessage && (
                      <p className="text-xs text-gray-600 mt-1 font-mono bg-white border border-red-100 rounded p-2 leading-relaxed">
                        {data.errorMessage}
                      </p>
                    )}
                    <div className="mt-2 flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => navigate('/assignment/run')}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-red-600 rounded-md hover:bg-red-700"
                      >
                        <RotateCw className="w-3.5 h-3.5" />
                        重新觸發
                      </button>
                      <button
                        type="button"
                        onClick={() => navigate('/assignment/list-definitions')}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-md hover:bg-gray-50"
                      >
                        <Percent className="w-3.5 h-3.5" />
                        前往名單列表（檢查比例）
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {data.status === 'pending' && (
                <div
                  data-testid="pending-banner"
                  className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg"
                >
                  <Clock className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                  <div>
                    <p className="font-semibold text-primary">
                      月跑已排入佇列，等待 Worker 開始執行
                    </p>
                    <p className="text-xs text-gray-600 mt-0.5">
                      通常於 30 秒內會進入 running 狀態。本頁將每 3 秒自動重新整理。
                    </p>
                  </div>
                </div>
              )}

              {/* Stage Stepper */}
              <StageStepper stages={stepperStages} />

              {/* Total progress + stage list */}
              <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-800">總體進度</h3>
                  <span
                    className="text-xs text-gray-500 font-mono"
                    data-testid="total-progress"
                  >
                    {data.totals?.processedCount ?? 0} / {data.totals?.totalCount ?? 0} 筆
                  </span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                  <div
                    data-testid="total-progress-bar"
                    className={`h-3 transition-all duration-300 ${
                      data.status === 'completed'
                        ? 'bg-green-500'
                        : data.status === 'failed'
                          ? 'bg-red-500'
                          : 'bg-primary'
                    }`}
                    style={{
                      width: `${Math.max(0, Math.min(100, totalProgress))}%`,
                    }}
                  />
                </div>
                <p className="text-xs text-gray-500 text-right font-mono">
                  {totalProgress.toFixed(1)}%
                </p>

                {data.stages && data.stages.length > 0 && (
                  <div className="mt-3 space-y-2" data-testid="stage-list">
                    {data.stages.map((stage) => (
                      <div
                        key={stage.name}
                        data-testid={`stage-row-${stage.name}`}
                        className="flex items-center gap-3 p-3 bg-gray-50/50 rounded-md"
                      >
                        <StatusBadge status={stage.status as RunStatus} />
                        <span className="text-sm text-gray-800 flex-1">
                          {stage.name}
                        </span>
                        <span className="text-xs text-gray-500 font-mono">
                          {stage.processedCount ?? 0} / {stage.totalCount ?? 0}
                        </span>
                        <span className="text-xs text-gray-600 w-12 text-right font-mono">
                          {(stage.progressPercent ?? 0).toFixed(0)}%
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {data.status === 'completed' && (
                <section className="flex items-center justify-end gap-3">
                  <Button
                    type="button"
                    variant="primary"
                    onClick={() =>
                      navigate(`/assignment/run-summary?runId=${runId}`)
                    }
                  >
                    查看結果摘要
                  </Button>
                </section>
              )}
            </>
          )}
        </div>
      </main>

      <ConfirmModal
        open={showCancel}
        variant="danger"
        title={`確認取消月跑 ${runId.slice(0, 13)}？`}
        description={
          <div className="space-y-2 text-xs text-gray-600">
            <p>
              月跑將標記為 <strong>failed</strong>（errorMessage='使用者取消'）。
            </p>
            <p>注意：背景 pipeline 不會立即中斷；下一輪 polling（3 秒）即會收到 failed 狀態。</p>
          </div>
        }
        confirmLabel="確認取消"
        loading={cancelling}
        loadingText="取消中..."
        onConfirm={handleCancel}
        onCancel={() => !cancelling && setShowCancel(false)}
        testId="confirm-cancel-modal"
        confirmTestId="btn-confirm-cancel"
      />
    </AppLayout>
  );
}
