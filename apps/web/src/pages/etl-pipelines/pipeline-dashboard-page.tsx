import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Workflow,
  Loader,
  CheckCircle,
  XCircle,
  Percent,
  BarChart3,
  Timer,
  List,
} from 'lucide-react';
import { AppLayout } from '@/components/layout/app-layout';
import {
  getDashboardStats,
  getDashboardTrend,
  getDashboardRunning,
  getDashboardFailures,
  getDashboardSlowest,
  executePipeline,
} from '@/api/etl-pipelines';
import type {
  EtlDashboardStatsResponse,
  EtlDashboardTrendDatapoint,
  EtlDashboardRunningItem,
  EtlDashboardFailureItem,
  EtlDashboardSlowestItem,
} from '@cdmp/shared';
import { formatDateTW, formatDuration } from '@/utils/date-utils';

const POLL_INTERVAL = 5000;

export function PipelineDashboardPage() {
  const navigate = useNavigate();

  const [stats, setStats] = useState<EtlDashboardStatsResponse | null>(null);
  const [trendRange, setTrendRange] = useState<'7d' | '14d' | '30d'>('7d');
  const [trendData, setTrendData] = useState<EtlDashboardTrendDatapoint[]>([]);
  const [runningItems, setRunningItems] = useState<EtlDashboardRunningItem[]>([]);
  const [failures, setFailures] = useState<EtlDashboardFailureItem[]>([]);
  const [slowest, setSlowest] = useState<EtlDashboardSlowestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadDashboardData = useCallback(async () => {
    try {
      const [statsData, trendData, runningData, failuresData, slowestData] =
        await Promise.all([
          getDashboardStats(),
          getDashboardTrend(trendRange),
          getDashboardRunning(),
          getDashboardFailures(),
          getDashboardSlowest(),
        ]);
      setStats(statsData);
      setTrendData(trendData.datapoints);
      setRunningItems(runningData.data);
      setFailures(failuresData.data);
      setSlowest(slowestData.data);
    } catch {
      // API error handled by interceptor
    } finally {
      setLoading(false);
    }
  }, [trendRange]);

  const pollRunning = useCallback(async () => {
    try {
      const runningData = await getDashboardRunning();
      setRunningItems(runningData.data);
    } catch {
      // ignore polling errors
    }
  }, []);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  // Polling for running items
  useEffect(() => {
    pollingRef.current = setInterval(pollRunning, POLL_INTERVAL);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [pollRunning]);

  // Reload trend when range changes
  useEffect(() => {
    getDashboardTrend(trendRange)
      .then((data) => setTrendData(data.datapoints))
      .catch(() => {});
  }, [trendRange]);

  const handleReExecute = async (pipelineId: string) => {
    try {
      await executePipeline(pipelineId);
      // Refresh dashboard
      loadDashboardData();
    } catch {
      // Error handled by interceptor
    }
  };

  // Compute trend chart max value
  const maxTrendValue = Math.max(
    ...trendData.map((d) => d.success + d.failed),
    1,
  );

  return (
    <AppLayout title="ETL Pipeline 管理">
        {/* Tab Navigation */}
        <div className="bg-white border-b border-gray-200 px-6" data-testid="pipeline-tabs">
          <nav className="flex space-x-1" role="tablist">
            <button
              className="flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 border-primary text-primary"
              role="tab"
              aria-selected="true"
              data-testid="tab-dashboard"
            >
              <BarChart3 className="w-4 h-4" />
              監控儀表板
            </button>
            <button
              onClick={() => navigate('/etl-pipelines/list')}
              className="flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700"
              role="tab"
              aria-selected="false"
              data-testid="tab-list"
            >
              <List className="w-4 h-4" />
              Pipeline 清單
            </button>
          </nav>
        </div>

        {/* Main Content */}
        <main className="flex-1 p-6 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader className="w-8 h-8 text-gray-400 animate-spin" />
          </div>
        ) : (
          <>
            {/* Stats Cards */}
            <div className="grid grid-cols-5 gap-4 mb-6" data-testid="stats-cards">
              <StatCard
                icon={<Workflow className="w-4 h-4 text-purple-500" />}
                label="總 Pipeline 數"
                value={stats?.totalPipelines ?? 0}
              />
              <StatCard
                icon={<Loader className="w-4 h-4 text-blue-500" />}
                label="執行中"
                value={stats?.running ?? 0}
                valueColor="text-blue-500"
              />
              <StatCard
                icon={<CheckCircle className="w-4 h-4 text-green-500" />}
                label="今日成功"
                value={stats?.todaySuccess ?? 0}
                valueColor="text-green-500"
              />
              <StatCard
                icon={<XCircle className="w-4 h-4 text-red-500" />}
                label="今日失敗"
                value={stats?.todayFailed ?? 0}
                valueColor="text-red-500"
              />
              <StatCard
                icon={<Percent className="w-4 h-4 text-green-500" />}
                label="成功率"
                value={`${stats?.successRate ?? 0}%`}
                valueColor="text-green-500"
              />
            </div>

            {/* Middle Row: Trend Chart + Running Pipelines */}
            <div className="grid grid-cols-2 gap-6 mb-6">
              {/* Trend Chart */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5" data-testid="trend-chart">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-gray-800">執行趨勢</h3>
                  <div className="flex gap-1" data-testid="trend-range-buttons">
                    {(['7d', '14d', '30d'] as const).map((r) => (
                      <button
                        key={r}
                        onClick={() => setTrendRange(r)}
                        className={`px-3 py-1 text-xs rounded-md ${
                          trendRange === r
                            ? 'bg-primary text-white'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                        data-testid={`trend-range-${r}`}
                      >
                        {r.replace('d', ' 天')}
                      </button>
                    ))}
                  </div>
                </div>

                {trendData.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-gray-400" data-testid="trend-empty">
                    <BarChart3 className="w-12 h-12 mb-3" />
                    <p className="text-sm">尚無執行紀錄</p>
                  </div>
                ) : (
                  <div className="flex items-end gap-1 h-48" data-testid="trend-bars">
                    {trendData.map((dp) => {
                      const successH = maxTrendValue > 0 ? (dp.success / maxTrendValue) * 100 : 0;
                      const failedH = maxTrendValue > 0 ? (dp.failed / maxTrendValue) * 100 : 0;
                      return (
                        <div
                          key={dp.date}
                          className="flex-1 flex flex-col items-center gap-0"
                          title={`${dp.date}: ${dp.success} 成功 / ${dp.failed} 失敗`}
                        >
                          <div className="w-full flex flex-col-reverse gap-px" style={{ height: '160px' }}>
                            <div
                              className="w-full rounded-t-sm"
                              style={{ height: `${successH}%`, backgroundColor: '#22C55E', minHeight: dp.success > 0 ? '2px' : 0 }}
                            />
                            <div
                              className="w-full rounded-t-sm"
                              style={{ height: `${failedH}%`, backgroundColor: '#EF4444', minHeight: dp.failed > 0 ? '2px' : 0 }}
                            />
                          </div>
                          <span className="text-[10px] text-gray-400 mt-1 truncate w-full text-center">
                            {dp.date.slice(5)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: '#22C55E' }} />
                    成功
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: '#EF4444' }} />
                    失敗
                  </span>
                </div>
              </div>

              {/* Running Pipelines */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5" data-testid="running-section">
                <h3 className="text-sm font-semibold text-gray-800 mb-4">執行中 Pipeline</h3>

                {runningItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-gray-400" data-testid="running-empty">
                    <Loader className="w-12 h-12 mb-3" />
                    <p className="text-sm">目前無執行中的 Pipeline</p>
                  </div>
                ) : (
                  <div className="space-y-4" data-testid="running-list">
                    {runningItems.map((item) => (
                      <div key={item.id} className="border border-gray-200 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium">{item.name}</span>
                          <span className="text-xs text-gray-500">開始：{formatDateTW(item.startedAt)}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex-1 bg-gray-200 rounded-full h-2">
                            <div
                              className="rounded-full h-2 animate-progress"
                              style={{
                                width: `${item.progressPercent}%`,
                                backgroundColor: '#2563EB',
                              }}
                              data-testid="progress-bar"
                            />
                          </div>
                          <span className="text-xs font-medium text-primary">{item.progressPercent}%</span>
                        </div>
                        {item.currentNodeName && (
                          <p className="text-xs text-gray-500 mt-1">
                            目前節點：{item.currentNodeName}（{item.processedCount.toLocaleString()}/{item.totalCount.toLocaleString()} 筆）
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Bottom Row: Failures + Slowest */}
            <div className="grid grid-cols-2 gap-6">
              {/* Today Failures */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5" data-testid="failures-section">
                <h3 className="text-sm font-semibold text-gray-800 mb-4">今日失敗清單</h3>

                {failures.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-gray-400" data-testid="failures-empty">
                    <CheckCircle className="w-10 h-10 mb-2" />
                    <p className="text-sm">今日無失敗紀錄</p>
                  </div>
                ) : (
                  <table className="w-full text-sm" data-testid="failures-table">
                    <thead>
                      <tr className="border-b border-gray-200 text-left">
                        <th className="pb-2 font-medium text-gray-500">Pipeline 名稱</th>
                        <th className="pb-2 font-medium text-gray-500">失敗時間</th>
                        <th className="pb-2 font-medium text-gray-500">錯誤摘要</th>
                        <th className="pb-2 font-medium text-gray-500 text-right">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {failures.map((f) => (
                        <tr key={f.logId} className="border-b border-gray-200">
                          <td className="py-3 font-medium">{f.pipelineName}</td>
                          <td className="py-3 text-gray-500">{formatDateTW(f.failedAt)}</td>
                          <td className="py-3 text-red-500 text-xs">{f.errorSummary}</td>
                          <td className="py-3 text-right">
                            <button
                              onClick={() => navigate(`/etl-pipelines/${f.pipelineId}/logs`)}
                              className="text-xs text-gray-500 hover:text-primary mr-2"
                              data-testid={`view-log-${f.logId}`}
                            >
                              查看日誌
                            </button>
                            <button
                              onClick={() => handleReExecute(f.pipelineId)}
                              className="text-xs bg-primary text-white px-2 py-1 rounded hover:bg-blue-700"
                              data-testid={`re-execute-${f.pipelineId}`}
                            >
                              重新執行
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Slowest Top 5 */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5" data-testid="slowest-section">
                <h3 className="text-sm font-semibold text-gray-800 mb-4">效能最差 Top 5</h3>

                {slowest.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-gray-400" data-testid="slowest-empty">
                    <Timer className="w-10 h-10 mb-2" />
                    <p className="text-sm">尚無執行紀錄</p>
                  </div>
                ) : (
                  <table className="w-full text-sm" data-testid="slowest-table">
                    <thead>
                      <tr className="border-b border-gray-200 text-left">
                        <th className="pb-2 font-medium text-gray-500 w-8">#</th>
                        <th className="pb-2 font-medium text-gray-500">Pipeline 名稱</th>
                        <th className="pb-2 font-medium text-gray-500">平均執行時間</th>
                        <th className="pb-2 font-medium text-gray-500 text-right">累計執行次數</th>
                      </tr>
                    </thead>
                    <tbody>
                      {slowest.map((s, idx) => (
                        <tr key={s.pipelineId} className={idx < slowest.length - 1 ? 'border-b border-gray-200' : ''}>
                          <td className="py-2.5 text-gray-400">{idx + 1}</td>
                          <td className="py-2.5 font-medium">{s.pipelineName}</td>
                          <td className="py-2.5 text-gray-600">{formatDuration(s.avgDurationMs)}</td>
                          <td className="py-2.5 text-right text-gray-600">{s.executionCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </>
        )}
        </main>

      {/* animate-progress CSS */}
      <style>{`
        @keyframes progress-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
        .animate-progress {
          animation: progress-pulse 2s ease-in-out infinite;
        }
      `}</style>
    </AppLayout>
  );
}

function StatCard({
  icon,
  label,
  value,
  valueColor,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  valueColor?: string;
}) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4" data-testid={`stat-card-${label}`}>
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <p className={`text-2xl font-bold ${valueColor || ''}`}>{value}</p>
    </div>
  );
}
