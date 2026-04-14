import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Users,
  Database,
  ArrowDownToLine,
  LogOut,
  ArrowLeft,
  ChevronsUpDown,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  AlertTriangle,
  Play,
  Workflow,
Contact, } from 'lucide-react';
import { clearAuth, getUser } from '@/stores/auth-store';
import { logout } from '@/api/auth';
import { getRawData } from '@/api/extraction-tasks';
import { formatDateTW } from '@/utils/date-utils';
import type { RawDataResponse, RawDataColumn } from '@cdmp/shared';

type SortState = {
  sortBy: string | undefined;
  sortOrder: 'asc' | 'desc' | undefined;
};

export function RawDataPreviewPage() {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const user = getUser();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<RawDataResponse | null>(null);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [sort, setSort] = useState<SortState>({ sortBy: undefined, sortOrder: undefined });

  const fetchData = useCallback(async () => {
    if (!taskId) return;
    setLoading(true);
    try {
      const result = await getRawData(taskId, {
        page,
        limit,
        sortBy: sort.sortBy,
        sortOrder: sort.sortOrder,
      });
      setData(result);
    } catch {
      // Graceful degradation
    } finally {
      setLoading(false);
    }
  }, [taskId, page, limit, sort]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSort = (colName: string) => {
    setSort((prev) => {
      if (prev.sortBy === colName) {
        if (prev.sortOrder === 'asc') return { sortBy: colName, sortOrder: 'desc' };
        if (prev.sortOrder === 'desc') return { sortBy: undefined, sortOrder: undefined };
      }
      return { sortBy: colName, sortOrder: 'asc' };
    });
    setPage(1);
  };

  const handlePageSizeChange = (newLimit: number) => {
    setLimit(newLimit);
    setPage(1);
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

  const meta = data?.meta;
  const columns = data?.columns ?? [];
  const rows = data?.data ?? [];
  const totalPages = meta?.totalPages ?? 0;
  const totalCount = meta?.totalCount ?? 0;

  const getSortIcon = (colName: string) => {
    if (sort.sortBy === colName) {
      if (sort.sortOrder === 'asc') return <ChevronUp className="w-3 h-3 text-blue-600" />;
      if (sort.sortOrder === 'desc') return <ChevronDown className="w-3 h-3 text-blue-600" />;
    }
    return <ChevronsUpDown className="w-3 h-3 text-gray-400" />;
  };

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-56 bg-white border-r border-gray-200 flex flex-col shrink-0">
        <div className="px-5 py-5 border-b border-gray-200">
          <h1 className="text-xl font-bold text-primary tracking-wide">CDMP</h1>
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
<a            href="/c360/customers"            className="flex items-center gap-3 px-5 py-2.5 text-sm text-gray-600 hover:bg-gray-50"          >            <Contact size={20} />            Customer 360          </a>
        </nav>
      </aside>

      {/* Main Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6 shrink-0">
          <h2 className="text-lg font-semibold text-gray-900">擷取資料預覽</h2>
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

        {/* Content */}
        <main className="flex-1 p-6">
          {/* Breadcrumb */}
          <nav className="mb-5 text-sm">
            <ol className="flex items-center gap-1.5 text-gray-500">
              <li>
                <Link to="/extraction-tasks" className="hover:text-blue-600 transition">
                  資料擷取
                </Link>
              </li>
              <li className="text-gray-400">/</li>
              <li className="text-gray-800 font-medium">擷取資料預覽</li>
            </ol>
          </nav>

          {/* Back Button */}
          <div className="mb-5">
            <Link
              to="/extraction-tasks"
              className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-blue-600 transition"
            >
              <ArrowLeft className="w-4 h-4" />
              返回任務清單
            </Link>
          </div>

          {loading ? (
            <LoadingSkeleton />
          ) : !data || totalCount === 0 ? (
            <EmptyState taskId={taskId!} />
          ) : (
            <>
              {/* Summary Card */}
              <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
                <div className="flex items-center gap-6">
                  <div>
                    <div className="text-xs text-gray-400 mb-0.5">任務名稱</div>
                    <div className="text-sm font-semibold text-gray-800">{meta!.taskName}</div>
                  </div>
                  <div className="w-px h-10 bg-gray-200" />
                  <div>
                    <div className="text-xs text-gray-400 mb-0.5">來源資料表</div>
                    <div className="text-sm font-medium text-gray-700">
                      {meta!.sourceSchema
                        ? `${meta!.sourceSchema}.${meta!.sourceTable}`
                        : meta!.sourceTable}
                    </div>
                  </div>
                  <div className="w-px h-10 bg-gray-200" />
                  <div>
                    <div className="text-xs text-gray-400 mb-0.5">Raw Data 表名</div>
                    <div className="text-sm font-mono text-gray-600">{meta!.rawTableName}</div>
                  </div>
                  <div className="w-px h-10 bg-gray-200" />
                  <div>
                    <div className="text-xs text-gray-400 mb-0.5">最後更新時間</div>
                    <div className="text-sm text-gray-700">
                      {meta!.lastUpdatedAt ? formatDateTW(meta!.lastUpdatedAt) : '-'}
                    </div>
                  </div>
                  <div className="w-px h-10 bg-gray-200" />
                  <div>
                    <div className="text-xs text-gray-400 mb-0.5">總筆數</div>
                    <div className="text-sm font-semibold text-gray-800">
                      {totalCount.toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>

              {/* Warning Banner */}
              {totalCount > 100000 && (
                <div className="mb-4">
                  <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-center gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
                    <p className="text-sm text-amber-700">
                      資料量較大（超過 100,000 筆），查詢可能需要較長時間。非索引欄位排序可能影響效能。
                    </p>
                  </div>
                </div>
              )}

              {/* Data Table */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        {columns.map((col) => (
                          <th
                            key={col.name}
                            className={`sort-header px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer select-none hover:bg-gray-100 ${
                              col.isSystem ? 'cdmp-sys-col bg-gray-100' : ''
                            }`}
                            onClick={() => handleSort(col.name)}
                          >
                            <span className="inline-flex items-center gap-1">
                              {col.name}
                              {getSortIcon(col.name)}
                            </span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {rows.map((row, rowIdx) => (
                        <tr key={rowIdx} className="hover:bg-gray-50 transition">
                          {columns.map((col) => (
                            <td
                              key={col.name}
                              className={`px-4 py-3 ${
                                col.isSystem
                                  ? 'text-xs font-mono text-gray-400 cdmp-sys-col bg-gray-50'
                                  : 'text-sm text-gray-700'
                              }`}
                            >
                              {row[col.name] != null ? String(row[col.name]) : ''}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination Footer */}
                <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between bg-white">
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-500">
                      第 {page} 頁，共 {totalPages} 頁（共 {totalCount.toLocaleString()} 筆）
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <label htmlFor="page-size-select" className="text-xs text-gray-500">每頁筆數</label>
                      <select
                        id="page-size-select"
                        aria-label="每頁筆數"
                        value={limit}
                        onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                        className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      >
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                        <option value={200}>200</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        aria-label="第一頁"
                        disabled={page === 1}
                        onClick={() => setPage(1)}
                        className="px-2 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <ChevronsLeft className="w-4 h-4" />
                      </button>
                      <button
                        aria-label="上一頁"
                        disabled={page === 1}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        className="px-2 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <span className="px-3 py-1.5 text-sm text-gray-700 font-medium">
                        {page} / {totalPages}
                      </span>
                      <button
                        aria-label="下一頁"
                        disabled={page >= totalPages}
                        onClick={() => setPage((p) => p + 1)}
                        className="px-2 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                      <button
                        aria-label="最後一頁"
                        disabled={page >= totalPages}
                        onClick={() => setPage(totalPages)}
                        className="px-2 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <ChevronsRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div data-testid="raw-data-loading">
      {/* Skeleton Summary */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <div className="flex items-center gap-6">
          <div className="space-y-2">
            <div className="skeleton w-16 h-3" />
            <div className="skeleton w-28 h-5" />
          </div>
          <div className="w-px h-10 bg-gray-200" />
          <div className="space-y-2">
            <div className="skeleton w-16 h-3" />
            <div className="skeleton w-20 h-5" />
          </div>
          <div className="w-px h-10 bg-gray-200" />
          <div className="space-y-2">
            <div className="skeleton w-20 h-3" />
            <div className="skeleton w-24 h-5" />
          </div>
          <div className="w-px h-10 bg-gray-200" />
          <div className="space-y-2">
            <div className="skeleton w-20 h-3" />
            <div className="skeleton w-32 h-5" />
          </div>
          <div className="w-px h-10 bg-gray-200" />
          <div className="space-y-2">
            <div className="skeleton w-12 h-3" />
            <div className="skeleton w-16 h-5" />
          </div>
        </div>
      </div>
      {/* Skeleton Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="bg-gray-50 border-b border-gray-200 px-4 py-3 flex gap-6">
          {[20, 12, 16, 24, 20, 20, 32].map((w, i) => (
            <div key={i} className={`skeleton w-${w} h-4`} />
          ))}
        </div>
        <div className="divide-y divide-gray-200">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="px-4 py-3.5 flex gap-6">
              {[20, 12, 24, 36, 24, 24, 32].map((w, j) => (
                <div key={j} className={`skeleton w-${w} h-4`} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function EmptyState({ taskId }: { taskId: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-16 text-center">
      <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
        <Database className="w-8 h-8 text-gray-300" />
      </div>
      <h3 className="text-base font-semibold text-gray-700 mb-2">尚未執行擷取任務</h3>
      <p className="text-sm text-gray-400 mb-6">
        此任務尚無已擷取的資料，請先執行擷取任務以取得資料。
      </p>
      <button className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition">
        <Play className="w-4 h-4" />
        立即執行
      </button>
    </div>
  );
}
