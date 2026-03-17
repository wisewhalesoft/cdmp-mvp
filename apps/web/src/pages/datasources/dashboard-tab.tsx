import { useState, useEffect, useCallback, useRef } from 'react';
import { Database, CheckCircle, XCircle, HelpCircle, RefreshCw } from 'lucide-react';
import { PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { getDashboard, getMetrics, getAlerts, testDatasourceConnection } from '@/api/datasources';
import { useToast } from '@/components/ui/toast';
import { formatDateTW, formatTimeTW } from '@/utils/date-utils';
import type { DashboardResponse, MetricsResponse, AlertsResponse, DashboardDatasource, DatasourceType } from '@cdmp/shared';

const STATUS_COLORS = {
  connected: '#22C55E',
  disconnected: '#EF4444',
  unknown: '#9CA3AF',
} as const;

const TYPE_COLORS: Record<string, string> = {
  mysql: '#F97316',
  postgresql: '#3B82F6',
  sqlserver: '#8B5CF6',
};

const TYPE_LABELS: Record<string, string> = {
  mysql: 'MySQL',
  postgresql: 'PostgreSQL',
  sqlserver: 'SQL Server',
};

function DatasourceTypeBadge({ type }: { type: DatasourceType }) {
  const config: Record<DatasourceType, { bg: string; text: string; label: string }> = {
    mysql: { bg: 'bg-orange-100', text: 'text-orange-700', label: 'MySQL' },
    postgresql: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'PostgreSQL' },
    sqlserver: { bg: 'bg-purple-100', text: 'text-purple-700', label: 'SQL Server' },
  };
  const c = config[type];
  return (
    <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  );
}

export function DashboardTab() {
  const { showToast } = useToast();

  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [metrics, setMetrics] = useState<MetricsResponse | null>(null);
  const [alerts, setAlerts] = useState<AlertsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Metrics controls
  const [selectedDsId, setSelectedDsId] = useState<string>('');
  const [timeRange, setTimeRange] = useState<'24h' | '7d' | '30d'>('24h');

  // Refresh / Test state
  const [refreshing, setRefreshing] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);

  // Polling ref
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchDashboard = useCallback(async () => {
    try {
      const [dashData, alertsData] = await Promise.all([getDashboard(), getAlerts()]);
      setDashboard(dashData);
      setAlerts(alertsData);
      setError('');

      // Auto-select first datasource for metrics if not yet selected
      if (!selectedDsId && dashData.datasources.length > 0) {
        setSelectedDsId(dashData.datasources[0].id);
      }
    } catch {
      setError('無法載入儀表板資料，請重新整理頁面');
    } finally {
      setLoading(false);
    }
  }, [selectedDsId]);

  const fetchMetrics = useCallback(async () => {
    if (!selectedDsId) return;
    try {
      const metricsData = await getMetrics(selectedDsId, timeRange);
      setMetrics(metricsData);
    } catch {
      setMetrics(null);
    }
  }, [selectedDsId, timeRange]);

  // Initial load
  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  // Fetch metrics when selection changes
  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  // Polling every 30s
  useEffect(() => {
    pollingRef.current = setInterval(() => {
      fetchDashboard();
      if (selectedDsId) fetchMetrics();
    }, 30000);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [fetchDashboard, fetchMetrics, selectedDsId]);

  const handleRefreshAll = async () => {
    if (refreshing || !dashboard) return;
    setRefreshing(true);

    try {
      // Test all datasources in parallel
      await Promise.allSettled(
        dashboard.datasources.map((ds) => testDatasourceConnection(ds.id)),
      );
      // Refresh dashboard data
      await fetchDashboard();
      if (selectedDsId) await fetchMetrics();
      showToast('全部重新整理完成', 'success');
    } catch {
      showToast('部分資料來源測試失敗', 'warning');
    } finally {
      setRefreshing(false);
    }
  };

  const handleTestNow = async (ds: DashboardDatasource) => {
    if (testingId) return;
    setTestingId(ds.id);
    try {
      const result = await testDatasourceConnection(ds.id);
      if (result.success) {
        showToast(`${ds.name}: 連線成功`, 'success');
      } else {
        showToast(`${ds.name}: ${result.message}`, 'error');
      }
      // Refresh dashboard
      await fetchDashboard();
      if (selectedDsId === ds.id) await fetchMetrics();
    } catch {
      showToast(`${ds.name}: 測試連線時發生錯誤`, 'error');
    } finally {
      setTestingId(null);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center text-gray-400">
          載入中...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center text-red-500">
          {error}
        </div>
      </div>
    );
  }

  if (!dashboard) return null;

  const { summary, datasources } = dashboard;

  // Prepare pie chart data
  const pieData = Object.entries(summary.typeCounts).map(([type, count]) => ({
    name: TYPE_LABELS[type] || type,
    value: count,
    color: TYPE_COLORS[type] || '#6B7280',
  }));

  // Prepare line chart data
  const lineData = metrics?.datapoints.map((dp) => ({
    time: formatTimeTW(dp.timestamp),
    responseTimeMs: dp.responseTimeMs,
    success: dp.success,
  })) || [];

  return (
    <div className="p-6 space-y-6">
      {/* Summary Cards + Refresh Button */}
      <div className="flex items-start gap-4">
        <div className="flex-1 grid grid-cols-4 gap-4">
          {/* Total */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
            <div className="flex items-center gap-2 text-gray-500 mb-2">
              <Database size={20} />
              <span className="text-sm">總數</span>
            </div>
            <p className="text-3xl font-bold" data-testid="card-total">{summary.total}</p>
          </div>
          {/* Connected */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
            <div className="flex items-center gap-2 mb-2" style={{ color: STATUS_COLORS.connected }}>
              <CheckCircle size={20} />
              <span className="text-sm">已連線</span>
            </div>
            <p className="text-3xl font-bold" style={{ color: STATUS_COLORS.connected }} data-testid="card-connected">{summary.connected}</p>
          </div>
          {/* Disconnected */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
            <div className="flex items-center gap-2 mb-2" style={{ color: STATUS_COLORS.disconnected }}>
              <XCircle size={20} />
              <span className="text-sm">已斷線</span>
            </div>
            <p className="text-3xl font-bold" style={{ color: STATUS_COLORS.disconnected }} data-testid="card-disconnected">{summary.disconnected}</p>
          </div>
          {/* Unknown */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
            <div className="flex items-center gap-2 mb-2" style={{ color: STATUS_COLORS.unknown }}>
              <HelpCircle size={20} />
              <span className="text-sm">未知</span>
            </div>
            <p className="text-3xl font-bold" style={{ color: STATUS_COLORS.unknown }} data-testid="card-unknown">{summary.unknown}</p>
          </div>
        </div>
        <button
          onClick={handleRefreshAll}
          disabled={refreshing}
          className="bg-primary text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center gap-2 whitespace-nowrap disabled:opacity-50"
          data-testid="btn-refresh-all"
        >
          <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
          {refreshing ? '重新整理中...' : '全部重新整理'}
        </button>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-2 gap-6">
        {/* Pie Chart */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-base font-semibold mb-4">資料來源類型分佈</h3>
          {pieData.length > 0 ? (
            <div className="flex justify-center" data-testid="pie-chart">
              <ResponsiveContainer width={280} height={280}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    dataKey="value"
                    label={({ name, value, percent }) => `${name} ${value} (${(percent * 100).toFixed(0)}%)`}
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-center text-gray-400 py-8">暫無資料</p>
          )}
        </div>

        {/* Line Chart */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold">回應時間趨勢</h3>
          </div>
          <div className="flex items-center gap-3 mb-4">
            <div className="flex border border-gray-200 rounded-lg overflow-hidden">
              {(['24h', '7d', '30d'] as const).map((range) => (
                <button
                  key={range}
                  onClick={() => setTimeRange(range)}
                  className={`px-3 py-1.5 text-xs font-medium ${
                    timeRange === range
                      ? 'bg-primary text-white'
                      : 'bg-white text-gray-600 border-l border-gray-200 hover:bg-gray-50'
                  }`}
                  data-testid={`range-${range}`}
                >
                  {range}
                </button>
              ))}
            </div>
            <select
              value={selectedDsId}
              onChange={(e) => setSelectedDsId(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-700 bg-white"
              data-testid="ds-selector"
            >
              {datasources.map((ds) => (
                <option key={ds.id} value={ds.id}>
                  {ds.name}
                </option>
              ))}
            </select>
          </div>
          {lineData.length > 0 ? (
            <div data-testid="line-chart">
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={lineData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} unit="ms" />
                  <Tooltip />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="responseTimeMs"
                    stroke="#2563EB"
                    name="回應時間 (ms)"
                    dot={{ r: 3 }}
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-center text-gray-400 py-8" data-testid="no-metrics">無法載入效能資料</p>
          )}
        </div>
      </div>

      {/* Datasource Status Cards */}
      <div>
        <h3 className="text-base font-semibold mb-4">資料來源狀態</h3>
        <div className="grid grid-cols-3 gap-4" data-testid="status-cards">
          {datasources.map((ds) => (
            <div key={ds.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
              <div className="flex items-start justify-between mb-3">
                <h4 className="font-medium text-gray-900 truncate pr-2">{ds.name}</h4>
                <span
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded"
                  style={{
                    backgroundColor: `${STATUS_COLORS[ds.status as keyof typeof STATUS_COLORS]}20`,
                    color: STATUS_COLORS[ds.status as keyof typeof STATUS_COLORS],
                  }}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: STATUS_COLORS[ds.status as keyof typeof STATUS_COLORS] }}
                  />
                  {ds.status}
                </span>
              </div>
              <div className="space-y-1 text-sm text-gray-600 mb-3">
                <DatasourceTypeBadge type={ds.type} />
                <p className="text-xs text-gray-400 mt-1">
                  最後測試: {ds.lastTestedAt ? formatDateTW(ds.lastTestedAt) : '-'}
                </p>
                {ds.lastErrorMessage && (
                  <p className="text-xs text-red-500 truncate">{ds.lastErrorMessage}</p>
                )}
              </div>
              <button
                onClick={() => handleTestNow(ds)}
                disabled={testingId === ds.id}
                className="text-xs text-primary hover:text-blue-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                data-testid={`test-now-${ds.id}`}
              >
                {testingId === ds.id ? '測試中...' : 'Test Now'}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Alert List */}
      <div>
        <h3 className="text-base font-semibold mb-4">告警列表</h3>
        {alerts && alerts.alerts.length > 0 ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden" data-testid="alert-table">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/60">
                  <th className="text-left px-5 py-3 font-semibold text-gray-600">名稱</th>
                  <th className="text-left px-5 py-3 font-semibold text-gray-600">類型</th>
                  <th className="text-left px-5 py-3 font-semibold text-gray-600">連續失敗次數</th>
                  <th className="text-left px-5 py-3 font-semibold text-gray-600">首次失敗時間</th>
                  <th className="text-left px-5 py-3 font-semibold text-gray-600">最後錯誤訊息</th>
                </tr>
              </thead>
              <tbody>
                {alerts.alerts.map((alert) => (
                  <tr key={alert.datasourceId} className="border-b border-gray-200">
                    <td className="px-5 py-3 font-medium text-gray-900">{alert.name}</td>
                    <td className="px-5 py-3">
                      <DatasourceTypeBadge type={alert.type} />
                    </td>
                    <td className="px-5 py-3 text-red-600 font-semibold">{alert.consecutiveFailures}</td>
                    <td className="px-5 py-3 text-gray-500">
                      {alert.firstFailureTime ? formatDateTW(alert.firstFailureTime) : '-'}
                    </td>
                    <td className="px-5 py-3 text-gray-600 truncate max-w-xs">
                      {alert.lastErrorMessage || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center text-gray-400" data-testid="no-alerts">
            所有資料來源運作正常
          </div>
        )}
      </div>
    </div>
  );
}
