import { useState, useEffect, useCallback, Fragment } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import {
  Users,
  Database,
  ArrowDownToLine,
  Workflow,
  LogOut,
  ArrowLeft,
  ChevronRight,
  ChevronLeft,
  FileText,
  X,
  AlertCircle,
  RotateCcw,
} from 'lucide-react';
import { clearAuth, getUser } from '@/stores/auth-store';
import { logout } from '@/api/auth';
import { getPipelineLogs, getLogDetail, executePipeline } from '@/api/etl-pipelines';
import { formatDateTW, formatDuration } from '@/utils/date-utils';
import type {
  PipelineLogListItem,
  PipelineLogDetailResponse,
  PipelineLogStatus,
  PipelineLogTriggeredBy,
} from '@cdmp/shared';

function LogStatusBadge({ status }: { status: PipelineLogStatus }) {
  const config: Record<PipelineLogStatus, { bg: string; text: string }> = {
    running: { bg: 'bg-blue-50', text: 'text-blue-700' },
    completed: { bg: 'bg-green-50', text: 'text-green-700' },
    failed: { bg: 'bg-red-50', text: 'text-red-700' },
  };
  const c = config[status];
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${c.bg} ${c.text}`}
    >
      {status}
    </span>
  );
}

function TriggerBadge({ triggeredBy }: { triggeredBy: PipelineLogTriggeredBy }) {
  const config: Record<PipelineLogTriggeredBy, { border: string; text: string; bg: string }> = {
    schedule: { border: 'border-blue-200', text: 'text-blue-600', bg: 'bg-blue-50' },
    manual: { border: 'border-gray-200', text: 'text-gray-600', bg: 'bg-white' },
    test: { border: 'border-amber-200', text: 'text-amber-600', bg: 'bg-amber-50' },
    retry: { border: 'border-purple-200', text: 'text-purple-600', bg: 'bg-purple-50' },
  };
  const c = config[triggeredBy];
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium ${c.border} ${c.text} ${c.bg}`}
    >
      {triggeredBy}
    </span>
  );
}

function getNodeTypeLabel(nodeType: string): { label: string; className: string } {
  if (nodeType === 'extract') return { label: 'Extract', className: 'text-blue-600' };
  if (nodeType === 'load') return { label: 'Load', className: 'text-green-600' };
  return { label: 'Transform', className: 'text-amber-600' };
}

export function PipelineLogsPage() {
  const { id: pipelineId } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const user = getUser();

  // Pipeline info from navigation state
  const navState = location.state as {
    pipelineId?: string;
    pipelineName?: string;
    pipelineStatus?: string;
  } | null;

  const pipelineName = navState?.pipelineName ?? '';

  const [logs, setLogs] = useState<PipelineLogListItem[]>([]);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 10, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  // Drawer state
  const [selectedLog, setSelectedLog] = useState<PipelineLogDetailResponse | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const fetchLogs = useCallback(async () => {
    if (!pipelineId) return;
    setLoading(true);
    try {
      const res = await getPipelineLogs(pipelineId, { page, pageSize: 10 });
      setLogs(res.data);
      setPagination(res.pagination);
    } catch {
      // handled by API client
    } finally {
      setLoading(false);
    }
  }, [pipelineId, page]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      clearAuth();
      navigate('/login');
    }
  };

  const handleLogClick = async (logId: string) => {
    setDrawerLoading(true);
    try {
      const detail = await getLogDetail(logId);
      setSelectedLog(detail);
    } catch {
      // handled by API client
    } finally {
      setDrawerLoading(false);
    }
  };

  const handleRetry = async () => {
    if (!pipelineId) return;
    setRetrying(true);
    try {
      await executePipeline(pipelineId);
      setSelectedLog(null);
      await fetchLogs();
    } catch {
      // handled
    } finally {
      setRetrying(false);
    }
  };

  const closeDrawer = () => {
    setSelectedLog(null);
  };

  const renderLogRow = (log: PipelineLogListItem) => {
    const isRunning = log.status === 'running';
    const rowBg = isRunning ? 'bg-blue-50/30' : 'hover:bg-gray-50';

    return (
      <tr
        key={log.id}
        className={`border-b border-gray-200 ${rowBg} cursor-pointer transition`}
        data-testid={`log-row-${log.id}`}
        onClick={() => handleLogClick(log.id)}
      >
        <td className="px-4 py-3 text-gray-700">
          {log.startedAt ? formatDateTW(log.startedAt) : '-'}
        </td>
        <td className="px-4 py-3 text-gray-600">v{log.version}</td>
        <td className="px-4 py-3">
          <LogStatusBadge status={log.status} />
        </td>
        <td className="px-4 py-3 text-right text-gray-600">
          {log.processedCount != null && !isRunning
            ? log.processedCount.toLocaleString()
            : '-'}
        </td>
        <td className="px-4 py-3 text-right text-gray-600">
          {formatDuration(log.durationMs)}
        </td>
        <td className="px-4 py-3">
          <TriggerBadge triggeredBy={log.triggeredBy} />
        </td>
        <td className="px-4 py-3">
          {log.isTestRun && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700">
              測試
            </span>
          )}
        </td>
      </tr>
    );
  };

  const renderDrawer = () => {
    if (!selectedLog) return null;

    return (
      <div className="fixed inset-0 z-40" data-testid="log-drawer">
        <div
          className="absolute inset-0 bg-black/30"
          onClick={closeDrawer}
        />
        <div className="absolute top-0 right-0 h-full w-[480px] bg-white shadow-xl border-l border-gray-200 overflow-y-auto">
          {/* Drawer Header */}
          <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
            <h3 className="text-base font-semibold text-gray-800">執行日誌詳情</h3>
            <button
              onClick={closeDrawer}
              className="text-gray-400 hover:text-gray-600"
              data-testid="drawer-close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 space-y-6">
            {/* Summary Grid */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-500">執行時間</p>
                <p className="text-sm font-medium mt-0.5">
                  {selectedLog.startedAt ? formatDateTW(selectedLog.startedAt) : '-'}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500">版本</p>
                <p className="text-sm font-medium mt-0.5">v{selectedLog.version}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">狀態</p>
                <div className="mt-0.5">
                  <LogStatusBadge status={selectedLog.status} />
                </div>
              </div>
              <div>
                <p className="text-xs text-gray-500">觸發方式</p>
                <div className="mt-0.5">
                  <TriggerBadge triggeredBy={selectedLog.triggeredBy} />
                </div>
              </div>
              {selectedLog.status !== 'running' && (
                <>
                  <div>
                    <p className="text-xs text-gray-500">處理筆數</p>
                    <p className="text-sm font-medium mt-0.5">
                      {selectedLog.processedCount.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">耗時</p>
                    <p className="text-sm font-medium mt-0.5">
                      {formatDuration(selectedLog.durationMs)}
                    </p>
                  </div>
                </>
              )}
            </div>

            {/* Running Progress */}
            {selectedLog.status === 'running' && (
              <div>
                <p className="text-xs text-gray-500 mb-2">執行進度</p>
                <div className="flex items-center gap-3">
                  <div className="flex-1 bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-600 rounded-full h-2 animate-pulse"
                      style={{ width: '0%' }}
                    />
                  </div>
                  <span className="text-sm font-medium text-blue-600">執行中</span>
                </div>
              </div>
            )}

            {/* Error Message */}
            {selectedLog.status === 'failed' && selectedLog.errorMessage && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-red-500">執行錯誤</p>
                    <p className="text-xs text-red-600 mt-1">{selectedLog.errorMessage}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Node Logs */}
            {selectedLog.nodeLogs && selectedLog.nodeLogs.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-3">節點執行記錄</h4>
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium text-gray-500 text-xs">節點名稱</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-500 text-xs">類型</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-500 text-xs">狀態</th>
                        <th className="text-right px-3 py-2 font-medium text-gray-500 text-xs">筆數</th>
                        <th className="text-right px-3 py-2 font-medium text-gray-500 text-xs">耗時</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedLog.nodeLogs.map((node, idx) => {
                        const isFailed = node.status === 'failed';
                        const typeInfo = getNodeTypeLabel(node.nodeType);

                        return (
                          <Fragment key={node.nodeId}>
                            <tr
                              className={`border-b border-gray-200 ${isFailed ? 'bg-red-50' : ''}`}
                            >
                              <td className={`px-3 py-2 font-medium ${isFailed ? 'text-red-500' : ''}`}>
                                {node.nodeName}
                              </td>
                              <td className="px-3 py-2">
                                <span className={`text-xs ${typeInfo.className}`}>{typeInfo.label}</span>
                              </td>
                              <td className="px-3 py-2">
                                <span
                                  className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs ${
                                    isFailed
                                      ? 'bg-red-50 text-red-700'
                                      : 'bg-green-50 text-green-700'
                                  }`}
                                >
                                  {node.status}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-right">
                                {node.processedCount.toLocaleString()}
                              </td>
                              <td className="px-3 py-2 text-right text-gray-500">
                                {formatDuration(node.durationMs)}
                              </td>
                            </tr>
                            {isFailed && node.errorMessage && (
                              <tr key={`${node.nodeId}-error`} className="bg-red-50">
                                <td colSpan={5} className="px-3 py-2">
                                  <p className="text-xs text-red-500 flex items-center gap-1">
                                    <AlertCircle className="w-3 h-3 inline" />
                                    {node.errorMessage}
                                  </p>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Retry Button for failed logs */}
            {selectedLog.status === 'failed' && (
              <button
                className="w-full py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2 disabled:opacity-50"
                onClick={handleRetry}
                disabled={retrying}
                data-testid="retry-button"
              >
                <RotateCcw className="w-4 h-4" />
                重新執行
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-56 bg-white border-r border-gray-200 flex flex-col shrink-0">
        <div className="px-5 py-5 border-b border-gray-200">
          <h1 className="text-xl font-bold text-blue-600 tracking-wide">CDMP</h1>
          <p className="text-xs text-gray-500 mt-0.5">資料治理平台</p>
        </div>
        <nav className="flex-1 py-3">
          <a href="/" className="flex items-center gap-3 px-5 py-2.5 text-sm text-gray-600 hover:bg-gray-50">
            <Users size={20} />
            帳號管理
          </a>
          <a href="/datasources" className="flex items-center gap-3 px-5 py-2.5 text-sm text-gray-600 hover:bg-gray-50">
            <Database size={20} />
            資料來源
          </a>
          <a href="/extraction-tasks" className="flex items-center gap-3 px-5 py-2.5 text-sm text-gray-600 hover:bg-gray-50">
            <ArrowDownToLine size={20} />
            資料擷取
          </a>
          <a
            href="/etl-pipelines"
            className="flex items-center gap-3 px-5 py-2.5 text-sm text-blue-600 bg-blue-50 border-l-[3px] border-blue-600 font-medium"
            aria-current="page"
          >
            <Workflow size={20} />
            ETL Pipeline
          </a>
        </nav>
      </aside>

      {/* Main Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header with Breadcrumb */}
        <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-2 text-sm">
            <button
              onClick={() => navigate('/etl-pipelines')}
              className="text-gray-400 hover:text-blue-600"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <nav className="flex items-center text-gray-500">
              <a href="/etl-pipelines/list" className="hover:text-blue-600">Pipeline 清單</a>
              <ChevronRight className="w-4 h-4 mx-1" />
              <span className="text-gray-800 font-medium">{pipelineName}</span>
              <ChevronRight className="w-4 h-4 mx-1" />
              <span className="text-blue-600 font-medium">執行日誌</span>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-700">{user?.name}</span>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
            >
              <LogOut size={16} />
              登出
            </button>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 p-6 overflow-auto">
          {/* Pipeline Summary Card */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-800">{pipelineName}</h2>
              </div>
            </div>
          </div>

          {/* Logs Table */}
          {loading ? (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center text-gray-500">
              載入中...
            </div>
          ) : logs.length === 0 ? (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-16 text-center" data-testid="empty-state">
              <FileText className="w-16 h-16 mx-auto text-gray-300 mb-4" />
              <h3 className="text-lg font-medium text-gray-600 mb-2">尚無執行紀錄</h3>
              <p className="text-sm text-gray-400">此 Pipeline 尚未被執行過</p>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <table className="w-full text-sm" data-testid="logs-table">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">執行時間</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">版本</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">狀態</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-500">處理筆數</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-500">耗時</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">觸發方式</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">標記</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => renderLogRow(log))}
                </tbody>
              </table>

              {/* Pagination */}
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
                <span className="text-sm text-gray-600" data-testid="pagination-info">
                  共 {pagination.total} 筆
                </span>
                <div className="flex items-center gap-2">
                  <button
                    className="p-1 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    data-testid="prev-page"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <span className="text-sm text-gray-600">
                    {pagination.page} / {pagination.totalPages || 1}
                  </span>
                  <button
                    className="p-1 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={page >= pagination.totalPages}
                    onClick={() => setPage((p) => p + 1)}
                    data-testid="next-page"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Drawer */}
      {renderDrawer()}
    </div>
  );
}
