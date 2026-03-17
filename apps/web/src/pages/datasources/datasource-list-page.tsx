import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Database, LogOut, Plus, Search, ChevronLeft, ChevronRight, List, LayoutGrid, AlertTriangle, BarChart3 } from 'lucide-react';
import { clearAuth, getUser } from '@/stores/auth-store';
import { logout } from '@/api/auth';
import { getDatasources, deleteDatasource, testDatasourceConnection } from '@/api/datasources';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { DashboardTab } from './dashboard-tab';
import { formatDateTW } from '@/utils/date-utils';
import type { DatasourceListItem, DatasourceType, DatasourceStatus } from '@cdmp/shared';

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

function DatasourceStatusBadge({ status }: { status: DatasourceStatus }) {
  const config: Record<DatasourceStatus, { dot: string; bg: string; text: string; label: string }> = {
    connected: { dot: 'bg-green-500', bg: 'bg-green-100', text: 'text-green-700', label: 'connected' },
    disconnected: { dot: 'bg-red-500', bg: 'bg-red-100', text: 'text-red-700', label: 'disconnected' },
    unknown: { dot: 'bg-gray-400', bg: 'bg-gray-100', text: 'text-gray-600', label: 'unknown' },
  };
  const c = config[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded ${c.bg} ${c.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
}

function getInitialViewMode(): 'list' | 'card' {
  try {
    const stored = localStorage.getItem('datasource-view-mode');
    if (stored === 'card') return 'card';
  } catch {
    // Ignore localStorage errors
  }
  return 'list';
}

export function DatasourceListPage() {
  const navigate = useNavigate();
  const user = getUser();
  const { showToast } = useToast();

  // Tab state: 'overview' (dashboard) or 'list'
  const [activeTab, setActiveTab] = useState<'overview' | 'list'>('overview');

  // List state
  const [datasources, setDatasources] = useState<DatasourceListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'list' | 'card'>(getInitialViewMode);

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<DatasourceListItem | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  // Test connection state
  const [testingId, setTestingId] = useState<string | null>(null);

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

  const fetchDatasources = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getDatasources({
        page,
        limit,
        search: debouncedSearch || undefined,
        type: (typeFilter as DatasourceType) || undefined,
        status: (statusFilter as DatasourceStatus) || undefined,
      });
      setDatasources(result.data);
      setTotal(result.pagination.total);
      setTotalPages(result.pagination.totalPages);
    } catch {
      // Error handling — graceful degradation
    } finally {
      setLoading(false);
    }
  }, [page, limit, debouncedSearch, typeFilter, statusFilter]);

  useEffect(() => {
    if (activeTab === 'list') {
      fetchDatasources();
    }
  }, [fetchDatasources, activeTab]);

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

  const handleTypeChange = (value: string) => {
    setTypeFilter(value);
    setPage(1);
  };

  const handleStatusChange = (value: string) => {
    setStatusFilter(value);
    setPage(1);
  };

  const handleViewModeChange = (mode: 'list' | 'card') => {
    setViewMode(mode);
    try {
      localStorage.setItem('datasource-view-mode', mode);
    } catch {
      // Ignore localStorage errors
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    setDeleteError('');
    try {
      await deleteDatasource(deleteTarget.id);
      setDatasources((prev) => prev.filter((ds) => ds.id !== deleteTarget.id));
      setTotal((prev) => prev - 1);
      setDeleteTarget(null);
    } catch {
      setDeleteError('系統發生錯誤，請稍後再試');
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleTestConnection = async (ds: DatasourceListItem) => {
    if (testingId) return;
    setTestingId(ds.id);
    try {
      const result = await testDatasourceConnection(ds.id);
      if (result.success) {
        showToast(result.message, 'success');
        setDatasources((prev) =>
          prev.map((item) =>
            item.id === ds.id
              ? { ...item, status: 'connected' as DatasourceStatus, lastTestedAt: new Date().toISOString() }
              : item,
          ),
        );
      } else {
        const isTimeout = result.message.includes('逾時');
        showToast(result.message, isTimeout ? 'warning' : 'error');
        setDatasources((prev) =>
          prev.map((item) =>
            item.id === ds.id
              ? { ...item, status: 'disconnected' as DatasourceStatus, lastTestedAt: new Date().toISOString() }
              : item,
          ),
        );
      }
    } catch {
      showToast('測試連線時發生錯誤', 'error');
    } finally {
      setTestingId(null);
    }
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
            className="flex items-center gap-3 px-5 py-2.5 text-sm text-primary bg-blue-50 border-l-[3px] border-primary font-medium"
            aria-current="page"
          >
            <Database size={20} />
            資料來源
          </a>
        </nav>
      </aside>

      {/* Main Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6 shrink-0">
          <h2 className="text-lg font-semibold text-gray-900">資料來源管理</h2>
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
              onClick={() => setActiveTab('overview')}
              role="tab"
              aria-selected={activeTab === 'overview'}
              className={`px-5 py-3 text-sm font-medium border-b-2 ${
                activeTab === 'overview'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
              data-testid="tab-overview"
            >
              <span className="flex items-center gap-2">
                <BarChart3 size={16} />
                狀態總覽
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
                資料來源清單
              </span>
            </button>
          </nav>
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' ? (
          <DashboardTab />
        ) : (
          <main className="flex-1 p-6">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-3 mb-5">
              <Button onClick={() => navigate('/datasources/new')}>
                <span className="flex items-center gap-2">
                  <Plus size={16} />
                  新增資料來源
                </span>
              </Button>
              <div className="relative flex-1 min-w-[200px] max-w-xs">
                <Search
                  size={16}
                  className="text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                />
                <input
                  type="text"
                  placeholder="搜尋資料來源名稱"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>
              <select
                value={typeFilter}
                onChange={(e) => handleTypeChange(e.target.value)}
                className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              >
                <option value="">全部類型</option>
                <option value="mysql">MySQL</option>
                <option value="postgresql">PostgreSQL</option>
                <option value="sqlserver">SQL Server</option>
              </select>
              <select
                value={statusFilter}
                onChange={(e) => handleStatusChange(e.target.value)}
                className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              >
                <option value="">全部狀態</option>
                <option value="connected">connected</option>
                <option value="disconnected">disconnected</option>
                <option value="unknown">unknown</option>
              </select>
              <div className="flex border border-gray-200 rounded-lg overflow-hidden">
                <button
                  onClick={() => handleViewModeChange('list')}
                  className={`p-2 ${viewMode === 'list' ? 'bg-primary text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                  title="清單檢視"
                  aria-label="清單檢視"
                >
                  <List size={16} />
                </button>
                <button
                  onClick={() => handleViewModeChange('card')}
                  className={`p-2 ${viewMode === 'card' ? 'bg-primary text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                  title="卡片檢視"
                  aria-label="卡片檢視"
                >
                  <LayoutGrid size={16} />
                </button>
              </div>
            </div>

            {/* Content */}
            {loading ? (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center text-gray-400">
                載入中...
              </div>
            ) : datasources.length === 0 ? (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
                <Database size={48} className="mx-auto text-gray-300 mb-4" />
                <p className="text-gray-500 font-medium">尚未設定任何資料來源</p>
                <p className="text-sm text-gray-400 mt-1 mb-4">點擊下方按鈕新增第一個資料來源</p>
                <Button onClick={() => navigate('/datasources/new')}>
                  <span className="flex items-center gap-2">
                    <Plus size={16} />
                    新增資料來源
                  </span>
                </Button>
              </div>
            ) : viewMode === 'list' ? (
              /* Table View */
              <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50/60">
                        <th className="text-left px-5 py-3 font-semibold text-gray-600">名稱</th>
                        <th className="text-left px-5 py-3 font-semibold text-gray-600">類型</th>
                        <th className="text-left px-5 py-3 font-semibold text-gray-600">主機</th>
                        <th className="text-left px-5 py-3 font-semibold text-gray-600">資料庫名稱</th>
                        <th className="text-left px-5 py-3 font-semibold text-gray-600">狀態</th>
                        <th className="text-left px-5 py-3 font-semibold text-gray-600">最後測試時間</th>
                        <th className="text-left px-5 py-3 font-semibold text-gray-600">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {datasources.map((ds) => (
                        <tr key={ds.id} className="border-b border-gray-200 hover:bg-gray-50/50">
                          <td className="px-5 py-3 font-medium text-gray-900">{ds.name}</td>
                          <td className="px-5 py-3">
                            <DatasourceTypeBadge type={ds.type} />
                          </td>
                          <td className="px-5 py-3 text-gray-600">{ds.host}</td>
                          <td className="px-5 py-3 text-gray-600">{ds.databaseName}</td>
                          <td className="px-5 py-3">
                            <DatasourceStatusBadge status={ds.status} />
                          </td>
                          <td className="px-5 py-3 text-gray-500">
                            {ds.lastTestedAt ? formatDateTW(ds.lastTestedAt) : '-'}
                          </td>
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => navigate(`/datasources/${ds.id}/edit`)}
                                className="text-xs text-primary hover:text-blue-700 font-medium"
                              >
                                編輯
                              </button>
                              <button
                                onClick={() => handleTestConnection(ds)}
                                disabled={testingId === ds.id}
                                className="text-xs text-emerald-600 hover:text-emerald-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {testingId === ds.id ? '測試中...' : '測試連線'}
                              </button>
                              <button
                                onClick={() => setDeleteTarget(ds)}
                                className="text-xs text-red-500 hover:text-red-700 font-medium"
                              >
                                刪除
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
            ) : (
              /* Card View */
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {datasources.map((ds) => (
                    <div key={ds.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
                      <div className="flex items-start justify-between mb-3">
                        <h3 className="font-medium text-gray-900 truncate pr-2">{ds.name}</h3>
                        <DatasourceStatusBadge status={ds.status} />
                      </div>
                      <div className="space-y-2 text-sm text-gray-600">
                        <div className="flex items-center gap-2">
                          <DatasourceTypeBadge type={ds.type} />
                        </div>
                        <p>主機: {ds.host}:{ds.port}</p>
                        <p>資料庫: {ds.databaseName}</p>
                        {ds.description && <p className="text-gray-400">{ds.description}</p>}
                        <p className="text-xs text-gray-400">
                          最後測試: {ds.lastTestedAt ? formatDateTW(ds.lastTestedAt) : '-'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 pt-3 mt-3 border-t border-gray-200">
                        <button
                          onClick={() => navigate(`/datasources/${ds.id}/edit`)}
                          className="text-xs text-primary hover:text-blue-700 font-medium"
                        >
                          編輯
                        </button>
                        <button
                          onClick={() => handleTestConnection(ds)}
                          disabled={testingId === ds.id}
                          className="text-xs text-emerald-600 hover:text-emerald-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {testingId === ds.id ? '測試中...' : '測試連線'}
                        </button>
                        <button
                          onClick={() => setDeleteTarget(ds)}
                          className="text-xs text-red-500 hover:text-red-700 font-medium"
                        >
                          刪除
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Pagination for card view */}
                {total > 0 && (
                  <div className="flex items-center justify-between mt-4">
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
              </>
            )}
          </main>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={(e) => { if (e.target === e.currentTarget && !deleteLoading) setDeleteTarget(null); }}
        >
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
            <div className="flex justify-center mb-4">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-red-500" />
              </div>
            </div>
            <h3 className="text-lg font-semibold text-gray-800 text-center mb-2">刪除資料來源</h3>
            <p className="text-sm text-gray-600 text-center mb-6">
              您確定要刪除 <span className="font-semibold">{deleteTarget.name}</span> 嗎？刪除後將不再顯示於清單中。
            </p>
            {deleteError && (
              <p className="text-sm text-red-500 text-center mb-4">{deleteError}</p>
            )}
            <div className="flex justify-end gap-3">
              <button
                onClick={() => { setDeleteTarget(null); setDeleteError(''); }}
                disabled={deleteLoading}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={handleDeleteConfirm}
                disabled={deleteLoading}
                className="px-4 py-2 text-sm font-medium text-white bg-red-500 rounded-lg hover:bg-red-600 disabled:opacity-50"
              >
                {deleteLoading ? '刪除中...' : '確認刪除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
