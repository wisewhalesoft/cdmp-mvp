import { useEffect, useState, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Activity, CheckCircle2, AlertTriangle, Clock, Loader2, ArrowLeft } from 'lucide-react';
import { AppLayout } from '@/components/layout/app-layout';
import { Button } from '@/components/ui/button';
import { getRun, type RunProgressResponse, type RunStatus } from '@/api/assignment-run';

/**
 * F062 — 月跑進度頁（polling 3 秒一次，BR-1）
 *
 * 對應 prototype: /prototypes/32-run-progress.html
 *
 * RBAC: DirectorOrSectionChiefRoute（讀取 OK，所有人可看）
 *
 * 行為：
 *   - 從 URL query string 取 runId
 *   - mount 後啟動 polling（3 秒間隔）
 *   - status = completed / failed 時停止 polling
 *   - 顯示總體進度 + 每個 stage 的狀態
 */

const POLL_INTERVAL_MS = 3000;

const STATUS_CONFIG: Record<
  RunStatus,
  { label: string; bg: string; text: string; icon: typeof Activity }
> = {
  pending: { label: '排程中', bg: 'bg-gray-100', text: 'text-gray-600', icon: Clock },
  running: { label: '執行中', bg: 'bg-blue-100', text: 'text-blue-800', icon: Loader2 },
  completed: { label: '已完成', bg: 'bg-green-100', text: 'text-green-700', icon: CheckCircle2 },
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

export function RunProgressPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const runId = searchParams.get('runId') ?? '';

  const [data, setData] = useState<RunProgressResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
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

  const totalProgress = data?.totals?.progressPercent ?? 0;

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
            月跑執行進度
          </h1>
          {data && <StatusBadge status={data.status} />}
        </div>
      }
    >
      <main className="flex-1 p-6">
        <div className="max-w-4xl mx-auto space-y-4">
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
              <AlertTriangle className="w-4 h-4 text-danger mt-0.5 shrink-0" />
              <span className="text-red-800">{error}</span>
            </div>
          )}

          {data && (
            <>
              {/* Meta info */}
              <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                    <Activity className="w-5 h-5 text-blue-800" />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs text-gray-500">Run ID</p>
                    <p className="text-sm font-mono text-gray-900">{data.runId}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">月份</p>
                    <p className="text-base font-mono font-semibold text-gray-900">
                      {data.ym}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 text-xs text-gray-600 pt-2 border-t border-gray-100">
                  <div>
                    <p className="text-[11px] text-gray-400">觸發人</p>
                    <p>{data.triggeredBy}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-gray-400">觸發時間</p>
                    <p className="font-mono">{new Date(data.triggeredAt).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-gray-400">完成時間</p>
                    <p className="font-mono">
                      {data.finishedAt ? new Date(data.finishedAt).toLocaleString() : '—'}
                    </p>
                  </div>
                </div>

                {data.errorMessage && (
                  <div className="rounded-md p-3 bg-red-50 border border-red-200 text-xs text-red-800">
                    <p className="font-semibold mb-1">執行錯誤</p>
                    <p>{data.errorMessage}</p>
                  </div>
                )}
              </section>

              {/* Total progress */}
              <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-800">總體進度</h3>
                  <span className="text-xs text-gray-500 font-mono" data-testid="total-progress">
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
                    style={{ width: `${Math.max(0, Math.min(100, totalProgress))}%` }}
                  />
                </div>
                <p className="text-xs text-gray-500 text-right font-mono">
                  {totalProgress.toFixed(1)}%
                </p>
              </section>

              {/* Stage breakdown */}
              {data.stages && data.stages.length > 0 && (
                <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
                  <h3 className="text-sm font-semibold text-gray-800">階段進度</h3>
                  <div className="space-y-2" data-testid="stage-list">
                    {data.stages.map((stage) => (
                      <div
                        key={stage.name}
                        data-testid={`stage-row-${stage.name}`}
                        className="flex items-center gap-3 p-3 bg-gray-50/50 rounded-md"
                      >
                        <StatusBadge status={stage.status as RunStatus} />
                        <span className="text-sm text-gray-800 flex-1">{stage.name}</span>
                        <span className="text-xs text-gray-500 font-mono">
                          {stage.processedCount ?? 0} / {stage.totalCount ?? 0}
                        </span>
                        <span className="text-xs text-gray-600 w-12 text-right font-mono">
                          {(stage.progressPercent ?? 0).toFixed(0)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Completed actions */}
              {data.status === 'completed' && (
                <section className="flex items-center justify-end gap-3">
                  <Button
                    type="button"
                    variant="primary"
                    onClick={() => navigate(`/assignment/run-summary?runId=${runId}`)}
                  >
                    查看結果摘要
                  </Button>
                </section>
              )}
            </>
          )}
        </div>
      </main>
    </AppLayout>
  );
}
