import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Users,
  Database,
  ArrowDownToLine,
  LogOut,
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  List,
  BarChart3,
  ClipboardList,
  Loader,
  CheckCircle,
  XCircle,
  Percent,
  Pencil,
  Play,
  FileText,
  ToggleRight,
  ToggleLeft,
  Trash2,
  ExternalLink,
  Workflow,
} from 'lucide-react';
import { clearAuth, getUser } from '@/stores/auth-store';
import { logout } from '@/api/auth';
import { getExtractionTasks, getDatasourceOptions, toggleExtractionTask, runExtractionTask, deleteExtractionTask } from '@/api/extraction-tasks';
import type { DatasourceOption } from '@/api/extraction-tasks';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { formatDateTW } from '@/utils/date-utils';
import { ToggleTaskDialog } from './toggle-task-dialog';
import { DeleteTaskDialog } from './delete-task-dialog';
import { ExtractionLogDrawer } from './extraction-log-drawer';
import { ExtractionDashboardTab } from './extraction-dashboard-tab';
import type {
  ExtractionTaskListItem,
  ExtractionTaskListSummary,
  ExtractionMode,
  ExtractionStatus,
} from '@cdmp/shared';

function ModeBadge({ mode }: { mode: ExtractionMode }) {
  const config: Record<ExtractionMode, { bg: string; text: string; label: string }> = {
    full: { bg: 'bg-purple-100', text: 'text-purple-700', label: '全量' },
    incremental: { bg: 'bg-orange-100', text: 'text-orange-700', label: '增量' },
  };
  const c = config[mode];
  return (
    <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  );
}

function StatusBadge({ status }: { status: ExtractionStatus }) {
  const config: Record<
    ExtractionStatus,
    { dot: string; bg: string; text: string; animate?: boolean }
  > = {
    running: { dot: 'bg-blue-500', bg: 'bg-blue-100', text: 'text-blue-700', animate: true },
    scheduled: { dot: 'bg-gray-400', bg: 'bg-gray-100', text: 'text-gray-600' },
    completed: { dot: 'bg-green-500', bg: 'bg-green-100', text: 'text-green-700' },
    failed: { dot: 'bg-red-500', bg: 'bg-red-100', text: 'text-red-700' },
    disabled: { dot: 'bg-gray-400', bg: 'bg-gray-100', text: 'text-gray-600' },
  };
  const c = config[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded ${c.bg} ${c.text}`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${c.dot} ${c.animate ? 'animate-pulse' : ''}`}
      />
      {status}
    </span>
  );
}

export function ExtractionTaskListPage() {
  const navigate = useNavigate();
  const user = getUser();
  const { showToast } = useToast();

  // Tab state
  const [activeTab, setActiveTab] = useState<'dashboard' | 'list'>('dashboard');

  // Toggle dialog state
  const [toggleDialogOpen, setToggleDialogOpen] = useState(false);
  const [toggleTarget, setToggleTarget] = useState<{ id: string; name: string } | null>(null);

  // Delete dialog state
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Log drawer state
  const [logDrawerOpen, setLogDrawerOpen] = useState(false);
  const [logDrawerTarget, setLogDrawerTarget] = useState<{ id: string; name: string } | null>(null);

  // List state
  const [tasks, setTasks] = useState<ExtractionTaskListItem[]>([]);
  const [summary, setSummary] = useState<ExtractionTaskListSummary>({
    totalTasks: 0,
    running: 0,
    todaySuccess: 0,
    todayFailed: 0,
    successRate: 0,
  });
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [modeFilter, setModeFilter] = useState('');
  const [datasourceFilter, setDatasourceFilter] = useState('');
  const [loading, setLoading] = useState(true);

  // Datasource options
  const [datasourceOptions, setDatasourceOptions] = useState<DatasourceOption[]>([]);

  // Polling ref
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Debounce ref
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [search]);

  // Load datasource options on mount
  useEffect(() => {
    getDatasourceOptions()
      .then(setDatasourceOptions)
      .catch(() => {});
  }, []);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getExtractionTasks({
        page,
        limit,
        search: debouncedSearch || undefined,
        status: (statusFilter as ExtractionStatus) || undefined,
        mode: (modeFilter as ExtractionMode) || undefined,
        datasourceId: datasourceFilter || undefined,
      });
      setTasks(result.data);
      setTotal(result.meta.total);
      setTotalPages(result.meta.totalPages);
      setSummary(result.summary);
    } catch {
      // Graceful degradation
    } finally {
      setLoading(false);
    }
  }, [page, limit, debouncedSearch, statusFilter, modeFilter, datasourceFilter]);

  useEffect(() => {
    if (activeTab === 'list') {
      fetchTasks();
    }
  }, [fetchTasks, activeTab]);

  // Polling: auto-refresh when any task is running
  useEffect(() => {
    const hasRunning = tasks.some((t) => t.status === 'running');
    if (hasRunning) {
      pollingRef.current = setInterval(() => {
        fetchTasks();
      }, 3000);
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
  }, [tasks, fetchTasks]);

  const handleRun = async (task: ExtractionTaskListItem) => {
    const triggeredBy = task.status === 'failed' ? 'retry' : 'manual';
    try {
      await runExtractionTask(task.id, triggeredBy);
      showToast('擷取任務已開始執行', 'success');
      fetchTasks();
    } catch (err: unknown) {
      const error = err as { response?: { status?: number; data?: { error?: string } } };
      if (error.response?.status === 409) {
        showToast('任務正在執行中，請等待完成', 'error');
      } else {
        showToast('發生未知錯誤，請稍後再試', 'error');
      }
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
    } catch {
      // Graceful degradation
    } finally {
      clearAuth();
      navigate('/login');
    }
  };

  const handleStatusChange = (value: string) => {
    setStatusFilter(value);
    setPage(1);
  };

  const handleModeChange = (value: string) => {
    setModeFilter(value);
    setPage(1);
  };

  const handleDatasourceChange = (value: string) => {
    setDatasourceFilter(value);
    setPage(1);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      await deleteExtractionTask(deleteTarget.id);
      showToast('擷取任務已刪除', 'success');
      fetchTasks();
    } catch {
      showToast('發生未知錯誤，請稍後再試', 'error');
    } finally {
      setDeleteLoading(false);
      setDeleteTarget(null);
    }
  };

  const handleToggle = async (task: ExtractionTaskListItem) => {
    if (task.enabled) {
      // Disabling → show confirmation dialog
      setToggleTarget({ id: task.id, name: task.name });
      setToggleDialogOpen(true);
    } else {
      // Enabling → call API directly
      try {
        await toggleExtractionTask(task.id, true);
        showToast('擷取任務已啟用', 'success');
        fetchTasks();
      } catch {
        showToast('發生未知錯誤，請稍後再試', 'error');
      }
    }
  };

  const handleConfirmDisable = async () => {
    if (!toggleTarget) return;
    setToggleDialogOpen(false);
    try {
      await toggleExtractionTask(toggleTarget.id, false);
      showToast('擷取任務已停用', 'success');
      fetchTasks();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      if (error.response?.data?.error === 'EXTRACTION_RUNNING') {
        showToast('任務執行中，請等待完成後再停用', 'error');
      } else {
        showToast('發生未知錯誤，請稍後再試', 'error');
      }
    }
    setToggleTarget(null);
  };

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside className="w-56 bg-white border-r border-gray-200 flex flex-col shrink-0">
        <div className="px-5 py-5 border-b border-gray-200">
          <h1 className="text-xl font-bold text-primary tracking-wide">CDMP</h1>
          <p className="text-xs text-gray-500 mt-0.5">資料治理平台</p>
        </div>
        <nav className="flex-1 py-3">
          <a
            href="/"
            className="flex items-center gap-3 px-5 py-2.5 text-sm text-gray-600 hover:bg-gray-50"
          >
            <Users size={20} />
            帳號管理
          </a>
          <a
            href="/datasources"
            className="flex items-center gap-3 px-5 py-2.5 text-sm text-gray-600 hover:bg-gray-50"
          >
            <Database size={20} />
            資料來源
          </a>
          <a
            href="/extraction-tasks"
            className="flex items-center gap-3 px-5 py-2.5 text-sm text-primary bg-blue-50 border-l-[3px] border-primary font-medium"
            aria-current="page"
          >
            <ArrowDownToLine size={20} />
            資料擷取
          </a>
          <a
            href="/etl-pipelines"
            className="flex items-center gap-3 px-5 py-2.5 text-sm text-gray-600 hover:bg-gray-50"
          >
            <Workflow size={20} />
            ETL Pipeline
          </a>
        </nav>
      </aside>

      {/* Main Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6 shrink-0">
          <h2 className="text-lg font-semibold text-gray-900">資料擷取管理</h2>
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

        {/* Tab Navigation */}
        <div className="bg-white border-b border-gray-200 px-6">
          <nav className="flex space-x-1" role="tablist">
            <button
              onClick={() => setActiveTab('dashboard')}
              role="tab"
              aria-selected={activeTab === 'dashboard'}
              className={`px-5 py-3 text-sm font-medium border-b-2 ${
                activeTab === 'dashboard'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
              data-testid="tab-dashboard"
            >
              <span className="flex items-center gap-2">
                <BarChart3 size={16} />
                監控儀表板
              </span>
            </button>
            <button
              onClick={() => setActiveTab('list')}
              role="tab"
              aria-selected={activeTab === 'list'}
              className={`px-5 py-3 text-sm font-medium border-b-2 ${
                activeTab === 'list'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
              data-testid="tab-list"
            >
              <span className="flex items-center gap-2">
                <List size={16} />
                任務清單
              </span>
            </button>
          </nav>
        </div>

        {/* Tab Content */}
        {activeTab === 'dashboard' ? (
          <main className="flex-1 p-6">
            <ExtractionDashboardTab />
          </main>
        ) : (
          <main className="flex-1 p-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-5 gap-4 mb-5">
              <div
                className="bg-white rounded-lg shadow-sm border border-gray-200 p-4"
                data-testid="summary-total"
              >
                <div className="flex items-center gap-2 text-gray-500 mb-1">
                  <ClipboardList size={16} />
                  <span className="text-xs font-medium">總任務數</span>
                </div>
                <p className="text-2xl font-bold text-gray-900">{summary.totalTasks}</p>
              </div>
              <div
                className="bg-white rounded-lg shadow-sm border border-gray-200 p-4"
                data-testid="summary-running"
              >
                <div className="flex items-center gap-2 text-blue-500 mb-1">
                  <Loader size={16} />
                  <span className="text-xs font-medium">執行中</span>
                  {summary.running > 0 && (
                    <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                  )}
                </div>
                <p className="text-2xl font-bold text-gray-900">{summary.running}</p>
              </div>
              <div
                className="bg-white rounded-lg shadow-sm border border-gray-200 p-4"
                data-testid="summary-success"
              >
                <div className="flex items-center gap-2 text-green-500 mb-1">
                  <CheckCircle size={16} />
                  <span className="text-xs font-medium">今日成功</span>
                </div>
                <p className="text-2xl font-bold text-gray-900">{summary.todaySuccess}</p>
              </div>
              <div
                className="bg-white rounded-lg shadow-sm border border-gray-200 p-4"
                data-testid="summary-failed"
              >
                <div className="flex items-center gap-2 text-red-500 mb-1">
                  <XCircle size={16} />
                  <span className="text-xs font-medium">今日失敗</span>
                </div>
                <p className="text-2xl font-bold text-gray-900">{summary.todayFailed}</p>
              </div>
              <div
                className="bg-white rounded-lg shadow-sm border border-gray-200 p-4"
                data-testid="summary-rate"
              >
                <div className="flex items-center gap-2 text-gray-500 mb-1">
                  <Percent size={16} />
                  <span className="text-xs font-medium">成功率</span>
                </div>
                <p className="text-2xl font-bold text-gray-900">{summary.successRate}%</p>
              </div>
            </div>

            {/* Search + Filters Toolbar */}
            <div className="flex flex-wrap items-center gap-3 mb-5">
              <div className="relative flex-1 min-w-[200px] max-w-xs">
                <Search
                  size={16}
                  className="text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                />
                <input
                  type="text"
                  placeholder="搜尋任務名稱..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => handleStatusChange(e.target.value)}
                className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              >
                <option value="">全部狀態</option>
                <option value="running">running</option>
                <option value="scheduled">scheduled</option>
                <option value="completed">completed</option>
                <option value="failed">failed</option>
                <option value="disabled">disabled</option>
              </select>
              <select
                value={modeFilter}
                onChange={(e) => handleModeChange(e.target.value)}
                className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              >
                <option value="">全部模式</option>
                <option value="full">全量</option>
                <option value="incremental">增量</option>
              </select>
              <select
                value={datasourceFilter}
                onChange={(e) => handleDatasourceChange(e.target.value)}
                className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              >
                <option value="">全部資料來源</option>
                {datasourceOptions.map((ds) => (
                  <option key={ds.id} value={ds.id}>
                    {ds.name}
                  </option>
                ))}
              </select>
              <Button onClick={() => navigate('/extraction-tasks/new')}>
                <span className="flex items-center gap-2">
                  <Plus size={16} />
                  新增擷取任務
                </span>
              </Button>
            </div>

            {/* Content */}
            {loading ? (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center text-gray-400">
                載入中...
              </div>
            ) : tasks.length === 0 ? (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
                <ClipboardList size={48} className="mx-auto text-gray-300 mb-4" />
                <p className="text-gray-500 font-medium">尚未建立任何擷取任務</p>
                <p className="text-sm text-gray-400 mt-1 mb-4">
                  建立您的第一個擷取任務以開始擷取資料
                </p>
                <Button onClick={() => navigate('/extraction-tasks/new')}>
                  <span className="flex items-center gap-2">
                    <Plus size={16} />
                    建立第一個擷取任務
                  </span>
                </Button>
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50/60">
                        <th className="text-left px-5 py-3 font-semibold text-gray-600">名稱</th>
                        <th className="text-left px-5 py-3 font-semibold text-gray-600">
                          資料來源
                        </th>
                        <th className="text-left px-5 py-3 font-semibold text-gray-600">模式</th>
                        <th className="text-left px-5 py-3 font-semibold text-gray-600">狀態</th>
                        <th className="text-left px-5 py-3 font-semibold text-gray-600">排程</th>
                        <th className="text-left px-5 py-3 font-semibold text-gray-600">
                          上次執行
                        </th>
                        <th className="text-left px-5 py-3 font-semibold text-gray-600">
                          擷取筆數
                        </th>
                        <th className="text-left px-5 py-3 font-semibold text-gray-600">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tasks.map((task) => (
                        <tr
                          key={task.id}
                          className="border-b border-gray-200 hover:bg-gray-50/50"
                        >
                          <td className="px-5 py-3 font-medium text-gray-900">{task.name}</td>
                          <td className="px-5 py-3 text-gray-600">{task.datasourceName}</td>
                          <td className="px-5 py-3">
                            <ModeBadge mode={task.mode} />
                          </td>
                          <td className="px-5 py-3">
                            <StatusBadge status={task.status} />
                            {task.status === 'running' && (
                              <div className="mt-1" data-testid={`progress-bar-${task.id}`}>
                                <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                  <div
                                    className="h-full rounded-full"
                                    style={{
                                      width: `${task.progressPercent}%`,
                                      backgroundColor: '#3B82F6',
                                    }}
                                  />
                                </div>
                                <span className="text-xs text-gray-500 mt-0.5 block">
                                  {task.extractedCount}/{task.totalCount} ({task.progressPercent}%)
                                </span>
                              </div>
                            )}
                          </td>
                          <td className="px-5 py-3 font-mono text-xs text-gray-600">
                            {task.schedule}
                          </td>
                          <td className="px-5 py-3 text-gray-500">
                            {task.lastExecutionAt ? formatDateTW(task.lastExecutionAt) : '-'}
                          </td>
                          <td className="px-5 py-3 text-gray-600">
                            <div>{task.extractedCount}/{task.totalCount}</div>
                            {task.status !== 'running' && task.extractedCount > 0 && (
                              <div className="mt-1 pt-1 border-t border-gray-100">
                                <Link
                                  to={`/extraction-tasks/${task.id}/raw-data`}
                                  className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                  預覽資料
                                </Link>
                              </div>
                            )}
                          </td>
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-1.5">
                              <button
                                title={task.status === 'running' ? '任務執行中，無法編輯' : '編輯'}
                                disabled={task.status === 'running'}
                                onClick={() => navigate(`/extraction-tasks/${task.id}/edit`)}
                                className="p-1 text-gray-500 hover:text-primary rounded disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                <Pencil size={14} />
                              </button>
                              <button
                                title={task.status === 'failed' ? '重新執行' : '立即執行'}
                                disabled={task.status === 'running'}
                                onClick={() => handleRun(task)}
                                className="p-1 text-gray-500 hover:text-blue-600 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                <Play size={14} />
                              </button>
                              <button
                                title="查看日誌"
                                onClick={() => {
                                  setLogDrawerTarget({ id: task.id, name: task.name });
                                  setLogDrawerOpen(true);
                                }}
                                className="p-1 text-gray-500 hover:text-gray-700 rounded"
                              >
                                <FileText size={14} />
                              </button>
                              <button
                                title={task.enabled ? '停用' : '啟用'}
                                disabled={task.status === 'running'}
                                onClick={() => handleToggle(task)}
                                className="p-1 text-gray-500 hover:text-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {task.enabled ? (
                                  <ToggleRight size={14} />
                                ) : (
                                  <ToggleLeft size={14} />
                                )}
                              </button>
                              <button
                                title="刪除"
                                disabled={task.status === 'running'}
                                onClick={() => setDeleteTarget({ id: task.id, name: task.name })}
                                className="p-1 text-gray-500 hover:text-red-500 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {total > 0 && (
                  <div className="flex items-center justify-between px-5 py-3 border-t border-gray-200">
                    <span className="text-sm text-gray-500">
                      共 {total} 筆，第 {page} 頁，共 {totalPages} 頁
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        aria-label="上一頁"
                        disabled={page <= 1}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                      >
                        <ChevronLeft size={14} />
                        上一頁
                      </button>
                      <button
                        aria-label="下一頁"
                        disabled={page >= totalPages}
                        onClick={() => setPage((p) => p + 1)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                      >
                        下一頁
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </main>
        )}
      </div>

      <ToggleTaskDialog
        open={toggleDialogOpen}
        taskName={toggleTarget?.name ?? ''}
        onConfirm={handleConfirmDisable}
        onCancel={() => {
          setToggleDialogOpen(false);
          setToggleTarget(null);
        }}
      />

      <DeleteTaskDialog
        open={deleteTarget !== null}
        taskName={deleteTarget?.name ?? ''}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
        loading={deleteLoading}
      />

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
