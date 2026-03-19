import { useState, useEffect, useCallback, useRef } from 'react';
import {
  ClipboardList,
  Loader,
  CheckCircle,
  XCircle,
  Percent,
  FileText,
  Play,
} from 'lucide-react';
import { getExtractionDashboard, getExtractionDashboardTrend, runExtractionTask } from '@/api/extraction-tasks';
import { useToast } from '@/components/ui/toast';
import { formatDuration, formatDateTW } from '@/utils/date-utils';
import { ExtractionLogDrawer } from './extraction-log-drawer';
import type {
  ExtractionDashboardResponse,
  ExtractionDashboardTrendDatapoint,
} from '@cdmp/shared';

type TrendRange = '7d' | '14d' | '30d';

export function ExtractionDashboardTab() {
  const { showToast } = useToast();
  const [dashboard, setDashboard] = useState<ExtractionDashboardResponse | null>(null);
  const [trendData, setTrendData] = useState<ExtractionDashboardTrendDatapoint[]>([]);
  const [trendRange, setTrendRange] = useState<TrendRange>('7d');
  const [loading, setLoading] = useState(true);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Log drawer state
  const [logDrawerOpen, setLogDrawerOpen] = useState(false);
  const [logDrawerTarget, setLogDrawerTarget] = useState<{ id: string; name: string } | null>(null);

  const fetchDashboard = useCallback(async () => {
    try {
      const data = await getExtractionDashboard();
      setDashboard(data);
    } catch {
      // Graceful degradation
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchTrend = useCallback(async (range: TrendRange) => {
    try {
      const data = await getExtractionDashboardTrend(range);
      setTrendData(data.datapoints);
    } catch {
      // Graceful degradation
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchDashboard();
    fetchTrend(trendRange);
  }, [fetchDashboard, fetchTrend, trendRange]);

  // Polling: 5 second interval when running tasks exist
  useEffect(() => {
    if (dashboard && dashboard.summary.running > 0) {
      pollingRef.current = setInterval(() => {
        fetchDashboard();
      }, 5000);
    } else {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    }
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [dashboard, fetchDashboard]);

  const handleTrendRangeChange = (range: TrendRange) => {
    setTrendRange(range);
  };

  const handleRetry = async (taskId: string) => {
    try {
      await runExtractionTask(taskId, 'retry');
      showToast('擷取任務已開始重新執行', 'success');
      fetchDashboard();
    } catch {
      showToast('發生錯誤，請稍後再試', 'error');
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center text-gray-400">
        載入中...
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center text-gray-400">
        載入失敗，請重新整理頁面
      </div>
    );
  }

  const { summary, runningTasks, todayFailures, slowestTasks } = dashboard;

  // Compute max for trend chart bar scaling
  const trendMax = Math.max(1, ...trendData.map((d) => d.success + d.failed));

  return (
    <div className="space-y-6" data-testid="dashboard-tab">
      {/* Summary Cards */}
      <div className="grid grid-cols-5 gap-4">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4" data-testid="dash-total">
          <div className="flex items-center gap-2 text-gray-500 mb-1">
            <ClipboardList size={16} />
            <span className="text-xs font-medium">總任務數</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{summary.totalTasks}</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4" data-testid="dash-running">
          <div className="flex items-center gap-2 text-blue-500 mb-1">
            <Loader size={16} />
            <span className="text-xs font-medium">執行中</span>
            {summary.running > 0 && (
              <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            )}
          </div>
          <p className="text-2xl font-bold text-blue-600">{summary.running}</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4" data-testid="dash-success">
          <div className="flex items-center gap-2 text-green-500 mb-1">
            <CheckCircle size={16} />
            <span className="text-xs font-medium">今日成功</span>
          </div>
          <p className="text-2xl font-bold text-green-600">{summary.todaySuccess}</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4" data-testid="dash-failed">
          <div className="flex items-center gap-2 text-red-500 mb-1">
            <XCircle size={16} />
            <span className="text-xs font-medium">今日失敗</span>
          </div>
          <p className="text-2xl font-bold text-red-600">{summary.todayFailed}</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4" data-testid="dash-rate">
          <div className="flex items-center gap-2 text-gray-500 mb-1">
            <Percent size={16} />
            <span className="text-xs font-medium">成功率</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{summary.successRate}%</p>
        </div>
      </div>

      {/* Two-column: Trend Chart + Running Tasks */}
      <div className="grid grid-cols-2 gap-6">
        {/* Trend Chart */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold">執行趨勢</h3>
            <div className="flex border border-gray-200 rounded-lg overflow-hidden">
              {(['7d', '14d', '30d'] as TrendRange[]).map((range) => (
                <button
                  key={range}
                  onClick={() => handleTrendRangeChange(range)}
                  data-testid={`trend-range-${range}`}
                  className={`px-3 py-1.5 text-xs font-medium ${
                    trendRange === range
                      ? 'bg-primary text-white'
                      : 'bg-white text-gray-600 hover:bg-gray-50'
                  } ${range !== '7d' ? 'border-l border-gray-200' : ''}`}
                >
                  {range}
                </button>
              ))}
            </div>
          </div>
          {trendData.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-sm">
              尚無執行紀錄
            </div>
          ) : (
            <div className="space-y-1.5" data-testid="trend-chart">
              {/* Legend */}
              <div className="flex items-center gap-4 text-xs text-gray-500 mb-3">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm bg-green-500" />
                  成功
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm bg-red-500" />
                  失敗
                </span>
              </div>
              {/* Bars */}
              {trendData.map((dp) => (
                <div key={dp.date} className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 w-12 shrink-0 text-right">
                    {dp.date.slice(5)}
                  </span>
                  <div className="flex-1 flex h-5 gap-px">
                    {dp.success > 0 && (
                      <div
                        className="bg-green-500 rounded-sm"
                        style={{ width: `${(dp.success / trendMax) * 100}%` }}
                        title={`成功: ${dp.success}`}
                      />
                    )}
                    {dp.failed > 0 && (
                      <div
                        className="bg-red-500 rounded-sm"
                        style={{ width: `${(dp.failed / trendMax) * 100}%` }}
                        title={`失敗: ${dp.failed}`}
                      />
                    )}
                  </div>
                  <span className="text-xs text-gray-400 w-8 shrink-0">
                    {dp.success + dp.failed}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Running Tasks */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-base font-semibold mb-4">執行中任務</h3>
          {runningTasks.length === 0 ? (
            <div className="text-center py-10 text-gray-400" data-testid="running-empty">
              <CheckCircle size={32} className="mx-auto mb-2 text-gray-300" />
              <p className="text-sm">目前無執行中任務</p>
            </div>
          ) : (
            <div className="space-y-4" data-testid="running-tasks">
              {runningTasks.map((task) => (
                <div key={task.id} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <span className="font-medium text-sm text-gray-800">{task.name}</span>
                      <span className="text-xs text-gray-400 ml-2">{task.datasourceName}</span>
                    </div>
                    <span className="text-sm font-medium text-blue-600">
                      {task.progressPercent}%
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2 mb-1">
                    <div
                      className="bg-blue-500 h-2 rounded-full transition-all duration-500"
                      style={{ width: `${task.progressPercent}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-400">
                    {task.extractedCount.toLocaleString()} / {task.totalCount.toLocaleString()} 筆
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Two-column: Failed List + Slowest Top 5 */}
      <div className="grid grid-cols-2 gap-6">
        {/* Today's Failures */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-base font-semibold mb-4">今日失敗清單</h3>
          {todayFailures.length === 0 ? (
            <div className="text-center py-10 text-gray-400" data-testid="failures-empty">
              <CheckCircle size={32} className="mx-auto mb-2 text-gray-300" />
              <p className="text-sm">今日無失敗紀錄</p>
            </div>
          ) : (
            <div className="space-y-3" data-testid="failures-list">
              {todayFailures.map((failure) => (
                <div
                  key={failure.logId}
                  className="border border-red-200 rounded-lg p-4 bg-red-50/30"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-sm text-gray-800">{failure.taskName}</span>
                    <span className="text-xs text-gray-400">
                      {failure.failedAt ? formatDateTW(failure.failedAt).split(' ')[1] || formatDateTW(failure.failedAt) : ''}
                    </span>
                  </div>
                  <p className="text-xs text-red-600 mb-3">{failure.errorSummary}</p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setLogDrawerTarget({ id: failure.taskId, name: failure.taskName });
                        setLogDrawerOpen(true);
                      }}
                      className="px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
                    >
                      <span className="flex items-center gap-1">
                        <FileText size={12} />
                        查看日誌
                      </span>
                    </button>
                    <button
                      onClick={() => handleRetry(failure.taskId)}
                      className="px-3 py-1.5 text-xs font-medium text-white bg-primary rounded-lg hover:bg-blue-700"
                    >
                      <span className="flex items-center gap-1">
                        <Play size={12} />
                        重新執行
                      </span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Slowest Tasks Top 5 */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-base font-semibold mb-4">最慢任務 Top 5</h3>
          {slowestTasks.length === 0 ? (
            <div className="text-center py-10 text-gray-400" data-testid="slowest-empty">
              <p className="text-sm">尚無足夠執行紀錄</p>
            </div>
          ) : (
            <table className="w-full text-sm" data-testid="slowest-table">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 font-medium text-gray-500">排名</th>
                  <th className="text-left py-2 font-medium text-gray-500">任務名稱</th>
                  <th className="text-left py-2 font-medium text-gray-500">平均執行時間</th>
                  <th className="text-left py-2 font-medium text-gray-500">累計執行次數</th>
                </tr>
              </thead>
              <tbody>
                {slowestTasks.map((task, index) => (
                  <tr key={task.taskId} className={index < slowestTasks.length - 1 ? 'border-b border-gray-200' : ''}>
                    <td className="py-2.5 text-gray-400">{index + 1}</td>
                    <td className="py-2.5 font-medium text-gray-800">{task.taskName}</td>
                    <td className="py-2.5 text-gray-600">{formatDuration(task.avgDurationMs)}</td>
                    <td className="py-2.5 text-gray-600">{task.executionCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Log Drawer */}
      {logDrawerTarget && (
        <ExtractionLogDrawer
          open={logDrawerOpen}
          taskId={logDrawerTarget.id}
          taskName={logDrawerTarget.name}
          onClose={() => {
            setLogDrawerOpen(false);
            setLogDrawerTarget(null);
          }}
        />
      )}
    </div>
  );
}
