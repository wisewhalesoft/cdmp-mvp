import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  Database,
  ArrowDownToLine,
  Workflow,
  LogOut,
  Search,
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  Loader,
  FileEdit,
  Hash,
  Plus,
  Pencil,
  Play,
  RotateCcw,
  ToggleRight,
  ToggleLeft,
  FileText,
  Trash2,
} from 'lucide-react';
import { clearAuth, getUser } from '@/stores/auth-store';
import { logout } from '@/api/auth';
import {
  getPipelines,
  getPipelineStats,
  executePipeline,
  testPipeline,
  getPipelineProgress,
} from '@/api/etl-pipelines';
import { CreatePipelineModal } from './create-pipeline-modal';
import type {
  PipelineListItem,
  PipelineStatsResponse,
  PipelineListPagination,
  EtlPipelineStatus,
  PipelineProgressResponse,
} from '@cdmp/shared';
import { formatDateTW } from '@/utils/date-utils';

function PipelineStatusBadge({ status }: { status: EtlPipelineStatus }) {
  const config: Record<EtlPipelineStatus, { bg: string; text: string }> = {
    draft: { bg: 'bg-gray-100', text: 'text-gray-600' },
    active: { bg: 'bg-green-50', text: 'text-green-700' },
    running: { bg: 'bg-blue-50', text: 'text-blue-700' },
    failed: { bg: 'bg-red-50', text: 'text-red-700' },
    disabled: { bg: 'bg-gray-100', text: 'text-gray-500' },
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

export function PipelineListPage() {
  const navigate = useNavigate();
  const user = getUser();

  const [pipelines, setPipelines] = useState<PipelineListItem[]>([]);
  const [pagination, setPagination] = useState<PipelineListPagination>({
    page: 1,
    pageSize: 10,
    total: 0,
    totalPages: 0,
  });
  const [stats, setStats] = useState<PipelineStatsResponse>({
    total: 0,
    active: 0,
    running: 0,
    draft: 0,
    todayProcessed: 0,
  });
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<EtlPipelineStatus | ''>('');
  const [page, setPage] = useState(1);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Execution state
  const [executingIds, setExecutingIds] = useState<Set<string>>(new Set());
  const [progressMap, setProgressMap] = useState<Record<string, PipelineProgressResponse>>({});
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [listRes, statsRes] = await Promise.all([
        getPipelines({
          page,
          pageSize: 10,
          keyword: keyword || undefined,
          status: statusFilter || undefined,
        }),
        getPipelineStats(),
      ]);
      setPipelines(listRes.data);
      setPagination(listRes.pagination);
      setStats(statsRes);
    } catch {
      // Error handled by API client interceptor
    } finally {
      setLoading(false);
    }
  }, [page, keyword, statusFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Polling for running pipelines
  useEffect(() => {
    const runningPipelines = pipelines.filter((p) => p.status === 'running');

    if (runningPipelines.length === 0) {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      return;
    }

    const poll = async () => {
      const updates: Record<string, PipelineProgressResponse> = {};
      let hasFinished = false;

      for (const p of runningPipelines) {
        try {
          const progress = await getPipelineProgress(p.id);
          updates[p.id] = progress;
          if (progress.status === 'completed' || progress.status === 'failed') {
            hasFinished = true;
          }
        } catch {
          // ignore
        }
      }

      setProgressMap((prev) => ({ ...prev, ...updates }));

      if (hasFinished) {
        fetchData();
      }
    };

    poll();
    pollingRef.current = setInterval(poll, 5000);

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [pipelines, fetchData]);

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      clearAuth();
      navigate('/login');
    }
  };

  const handleSearch = (value: string) => {
    setKeyword(value);
    setPage(1);
  };

  const handleStatusFilter = (value: string) => {
    setStatusFilter(value as EtlPipelineStatus | '');
    setPage(1);
  };

  const handleExecute = async (pipelineId: string, status: EtlPipelineStatus) => {
    setExecutingIds((prev) => new Set(prev).add(pipelineId));
    try {
      if (status === 'draft') {
        await testPipeline(pipelineId);
      } else {
        await executePipeline(pipelineId);
      }
      await fetchData();
    } catch {
      // Error handled by API client interceptor
    } finally {
      setExecutingIds((prev) => {
        const next = new Set(prev);
        next.delete(pipelineId);
        return next;
      });
    }
  };

  const renderActionButtons = (pipeline: PipelineListItem) => {
    const isRunning = pipeline.status === 'running';
    const isExecuting = executingIds.has(pipeline.id);
    const disabled = isRunning || isExecuting;

    return (
      <div className="flex items-center justify-end gap-1">
        {/* Edit */}
        {isRunning ? (
          <button className="p-1.5 rounded text-gray-300 cursor-not-allowed" disabled title="執行中">
            <Pencil className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={() => navigate(`/etl-pipelines/${pipeline.id}/editor`)}
            className="p-1.5 hover:bg-gray-100 rounded text-gray-500 hover:text-blue-600"
            title="編輯"
            data-testid={`edit-pipeline-${pipeline.id}`}
          >
            <Pencil className="w-4 h-4" />
          </button>
        )}

        {/* Execute / Test Execute / Retry */}
        {pipeline.status === 'failed' ? (
          <button
            onClick={() => handleExecute(pipeline.id, pipeline.status)}
            className="p-1.5 hover:bg-gray-100 rounded text-amber-500 hover:text-orange-600"
            title="重新執行"
            disabled={isExecuting}
            data-testid={`retry-pipeline-${pipeline.id}`}
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        ) : isRunning ? (
          <button className="p-1.5 rounded text-gray-300 cursor-not-allowed" disabled title="執行中">
            <Play className="w-4 h-4" />
          </button>
        ) : pipeline.status === 'draft' ? (
          <button
            onClick={() => handleExecute(pipeline.id, pipeline.status)}
            className="p-1.5 hover:bg-gray-100 rounded text-gray-500 hover:text-amber-500"
            title="測試執行"
            disabled={isExecuting}
            data-testid={`test-pipeline-${pipeline.id}`}
          >
            <Play className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={() => handleExecute(pipeline.id, pipeline.status)}
            className="p-1.5 hover:bg-gray-100 rounded text-gray-500 hover:text-blue-600"
            title="執行"
            disabled={disabled}
            data-testid={`execute-pipeline-${pipeline.id}`}
          >
            <Play className="w-4 h-4" />
          </button>
        )}

        {/* Toggle */}
        {isRunning ? (
          <button className="p-1.5 rounded text-gray-300 cursor-not-allowed" disabled title="執行中">
            <ToggleRight className="w-4 h-4" />
          </button>
        ) : pipeline.status === 'draft' ? (
          <button
            className="p-1.5 rounded text-gray-300 cursor-not-allowed relative group"
            disabled
            title="需先發布 Pipeline 才能啟用"
          >
            <ToggleLeft className="w-4 h-4" />
            <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 text-xs text-white bg-gray-800 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition pointer-events-none">
              需先發布 Pipeline 才能啟用
            </span>
          </button>
        ) : pipeline.status === 'disabled' ? (
          <button
            className="p-1.5 hover:bg-gray-100 rounded text-gray-400"
            title="啟用"
          >
            <ToggleLeft className="w-4 h-4" />
          </button>
        ) : (
          <button
            className="p-1.5 hover:bg-gray-100 rounded text-green-500"
            title="停用"
          >
            <ToggleRight className="w-4 h-4" />
          </button>
        )}

        {/* Logs */}
        <button
          className="p-1.5 hover:bg-gray-100 rounded text-gray-500 hover:text-blue-600"
          title="日誌"
        >
          <FileText className="w-4 h-4" />
        </button>

        {/* Delete */}
        {isRunning ? (
          <button className="p-1.5 rounded text-gray-300 cursor-not-allowed" disabled title="執行中無法刪除">
            <Trash2 className="w-4 h-4" />
          </button>
        ) : (
          <button
            className="p-1.5 hover:bg-gray-100 rounded text-gray-500 hover:text-red-500"
            title="刪除"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
    );
  };

  const renderPipelineRows = (pipeline: PipelineListItem) => {
    const isRunning = pipeline.status === 'running';
    const progress = progressMap[pipeline.id];
    const rowBg = isRunning ? 'bg-blue-50/30' : 'hover:bg-gray-50';

    return (
      <>
        <tr
          key={pipeline.id}
          className={`border-b border-gray-200 ${rowBg} transition`}
          data-testid={`pipeline-row-${pipeline.id}`}
        >
          <td className="px-4 py-3 font-medium text-gray-900">
            {pipeline.name}
          </td>
          <td className="px-4 py-3 text-gray-600">v{pipeline.version}</td>
          <td className="px-4 py-3 text-center text-gray-600">{pipeline.stepCount}</td>
          <td className="px-4 py-3">
            <PipelineStatusBadge status={pipeline.status} />
          </td>
          <td className="px-4 py-3 text-gray-600">
            {pipeline.schedule ?? '-'}
          </td>
          <td className="px-4 py-3 text-gray-500">
            {pipeline.lastExecutionAt
              ? formatDateTW(pipeline.lastExecutionAt)
              : '-'}
          </td>
          <td className="px-4 py-3 text-gray-500">
            {pipeline.nextExecutionAt
              ? formatDateTW(pipeline.nextExecutionAt)
              : '-'}
          </td>
          <td className="px-4 py-3 text-right text-gray-600">
            {pipeline.processedCount.toLocaleString()}
          </td>
          <td className="px-4 py-3 text-gray-600">{pipeline.createdBy}</td>
          <td className="px-4 py-3 text-right">
            {renderActionButtons(pipeline)}
          </td>
        </tr>
        {/* Running progress bar row — per prototype design */}
        {isRunning && progress && (
          <tr
            key={`${pipeline.id}-progress`}
            className="border-b border-gray-200 bg-blue-50/30"
            data-testid={`pipeline-progress-${pipeline.id}`}
          >
            <td colSpan={10} className="px-4 pb-3 pt-0">
              <div className="flex items-center gap-3">
                <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                  <div
                    className="bg-blue-600 rounded-full h-1.5 animate-pulse"
                    style={{ width: `${progress.progressPercent}%` }}
                  />
                </div>
                <span className="text-xs font-medium text-blue-600">
                  {progress.progressPercent}%
                </span>
                <span className="text-xs text-gray-500">
                  {progress.currentNodeName
                    ? `目前節點：${progress.currentNodeName}（${progress.processedCount.toLocaleString()}/${progress.totalCount.toLocaleString()} 筆）`
                    : `${progress.processedCount.toLocaleString()}/${progress.totalCount.toLocaleString()} 筆`}
                </span>
              </div>
            </td>
          </tr>
        )}
      </>
    );
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
            className="flex items-center gap-3 px-5 py-2.5 text-sm text-gray-600 hover:bg-gray-50"
          >
            <ArrowDownToLine size={20} />
            資料擷取
          </a>
          <a
            href="/etl-pipelines"
            className="flex items-center gap-3 px-5 py-2.5 text-sm text-primary bg-blue-50 border-l-[3px] border-primary font-medium"
            aria-current="page"
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
          <h2 className="text-lg font-semibold text-gray-900">ETL Pipeline 管理</h2>
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
        {/* Stats Cards */}
        <div className="grid grid-cols-5 gap-4 mb-6" data-testid="stats-cards">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="flex items-center gap-2 text-gray-500 mb-1">
              <Workflow className="w-4 h-4" />
              <span className="text-xs">總 Pipeline 數</span>
            </div>
            <p className="text-2xl font-bold" data-testid="stat-total">
              {stats.total}
            </p>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="flex items-center gap-2 text-green-500 mb-1">
              <CheckCircle className="w-4 h-4" />
              <span className="text-xs">啟用中</span>
            </div>
            <p className="text-2xl font-bold text-green-500" data-testid="stat-active">
              {stats.active}
            </p>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="flex items-center gap-2 text-blue-500 mb-1">
              <Loader className="w-4 h-4" />
              <span className="text-xs">執行中</span>
            </div>
            <p className="text-2xl font-bold text-blue-500" data-testid="stat-running">
              {stats.running}
            </p>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="flex items-center gap-2 text-gray-400 mb-1">
              <FileEdit className="w-4 h-4" />
              <span className="text-xs">草稿</span>
            </div>
            <p className="text-2xl font-bold text-gray-500" data-testid="stat-draft">
              {stats.draft}
            </p>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="flex items-center gap-2 text-purple-500 mb-1">
              <Hash className="w-4 h-4" />
              <span className="text-xs">今日處理筆數</span>
            </div>
            <p className="text-2xl font-bold text-purple-600" data-testid="stat-today-processed">
              {stats.todayProcessed.toLocaleString()}
            </p>
          </div>
        </div>

        {/* Search & Filter & Create Button */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="搜尋 Pipeline 名稱..."
                className="pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg w-64 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                value={keyword}
                onChange={(e) => handleSearch(e.target.value)}
                data-testid="search-input"
              />
            </div>
            <select
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              value={statusFilter}
              onChange={(e) => handleStatusFilter(e.target.value)}
              data-testid="status-filter"
            >
              <option value="">所有狀態</option>
              <option value="draft">草稿 (draft)</option>
              <option value="active">啟用中 (active)</option>
              <option value="running">執行中 (running)</option>
              <option value="failed">失敗 (failed)</option>
              <option value="disabled">已停用 (disabled)</option>
            </select>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
            data-testid="create-pipeline-btn"
          >
            <Plus size={16} />
            建立 Pipeline
          </button>
        </div>

        {/* Pipeline List */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-gray-500">載入中...</div>
          ) : pipelines.length === 0 ? (
            <div className="p-12 text-center" data-testid="empty-state">
              <Workflow className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 mb-2">尚無 Pipeline 資料</p>
              <p className="text-sm text-gray-400">
                {keyword || statusFilter
                  ? '無符合條件的 Pipeline'
                  : '建立第一個 Pipeline 來開始資料處理'}
              </p>
            </div>
          ) : (
            <>
              <table className="w-full text-sm" data-testid="pipeline-table">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">名稱</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">版本</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-500">步驟數</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">狀態</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">排程</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">最後執行</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">下次執行</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-500">處理筆數</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">建立者</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-500">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {pipelines.map((pipeline) => renderPipelineRows(pipeline))}
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
            </>
          )}
        </div>
        </main>
      </div>

      <CreatePipelineModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={() => {
          setShowCreateModal(false);
          fetchData();
        }}
      />
    </div>
  );
}
