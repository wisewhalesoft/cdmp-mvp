import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Users,
  User,
  Building2,
  Globe,
  Database,
  Search,
  SearchX,
  ChevronLeft,
  ChevronRight,
  Eye,
  RotateCcw,
} from 'lucide-react';
import { AppLayout } from '@/components/layout/app-layout';
import {
  getCustomerStats,
  getCustomers,
  type CustomerStats,
  type CustomerListResponse,
  type CustomerListParams,
} from '@/api/c360';
import { PiiMaskBanner } from './_components/pii-mask-banner';
import { getUserRole, getBusinessRole } from '@/stores/auth-store';

const TYPE_OPTIONS = [
  { value: '', label: '全部類型' },
  { value: '01', label: '個人' },
  { value: '02', label: '企業' },
  { value: '04', label: '外籍' },
];

function formatNumber(n: number): string {
  return n.toLocaleString('zh-TW');
}

export function CustomerListPage() {
  const navigate = useNavigate();

  const [stats, setStats] = useState<CustomerStats>({
    total: 0,
    individual: 0,
    corporate: 0,
    foreign: 0,
  });
  const [listResponse, setListResponse] = useState<CustomerListResponse>({
    data: [],
    pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
  });
  const [keyword, setKeyword] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [searchHint, setSearchHint] = useState('');
  const [hasSearched, setHasSearched] = useState(false);

  const fetchStats = useCallback(async () => {
    try {
      const data = await getCustomerStats();
      setStats(data);
    } catch {
      // Stats error: graceful degradation
    }
  }, []);

  const fetchCustomers = useCallback(
    async (params: CustomerListParams = {}) => {
      setLoading(true);
      try {
        const data = await getCustomers(params);
        setListResponse(data);
      } catch {
        // Error handling
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    fetchStats();
    fetchCustomers();
  }, [fetchStats, fetchCustomers]);

  const handleSearch = () => {
    setSearchHint('');
    if (keyword && keyword.length < 2) {
      setSearchHint('請輸入至少 2 個字元');
      return;
    }
    setCurrentPage(1);
    setHasSearched(true);
    const params: CustomerListParams = { page: 1, pageSize: 20 };
    if (keyword.length >= 2) params.keyword = keyword;
    if (typeFilter) params.type = typeFilter;
    fetchCustomers(params);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const handleSearchInput = (value: string) => {
    setKeyword(value);
    if (value.length > 0 && value.length < 2) {
      setSearchHint('請輸入至少 2 個字元');
    } else {
      setSearchHint('');
    }
  };

  const handleTypeChange = (value: string) => {
    setTypeFilter(value);
    setCurrentPage(1);
    const params: CustomerListParams = { page: 1, pageSize: 20 };
    if (keyword.length >= 2) params.keyword = keyword;
    if (value) params.type = value;
    fetchCustomers(params);
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    const params: CustomerListParams = { page, pageSize: 20 };
    if (keyword.length >= 2) params.keyword = keyword;
    if (typeFilter) params.type = typeFilter;
    fetchCustomers(params);
  };

  const handleClearFilters = () => {
    setKeyword('');
    setTypeFilter('');
    setSearchHint('');
    setCurrentPage(1);
    setHasSearched(false);
    fetchCustomers();
  };

  const { data: customers, pagination } = listResponse;
  const isNoData = stats.total === 0 && customers.length === 0 && !loading;
  const isEmptySearch = hasSearched && customers.length === 0 && !isNoData && !loading;

  // Build page numbers for pagination
  const buildPageNumbers = (): (number | '...')[] => {
    const { page, totalPages } = pagination;
    if (totalPages <= 5) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const pages: (number | '...')[] = [];
    pages.push(1);
    if (page > 3) pages.push('...');
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) {
      pages.push(i);
    }
    if (page < totalPages - 2) pages.push('...');
    if (totalPages > 1) pages.push(totalPages);
    return pages;
  };

  const startItem = customers.length > 0 ? (pagination.page - 1) * pagination.pageSize + 1 : 0;
  const endItem = Math.min(pagination.page * pagination.pageSize, pagination.total);

  return (
    <AppLayout title="Customer 360">
      <main className="flex-1 p-6">
          {/* P2-1 Phase 3：plain user 顯示 PII masked 提示 banner */}
          <div className="mb-4">
            <PiiMaskBanner
              userRole={getUserRole()}
              businessRole={getBusinessRole()}
            />
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            <StatCard
              icon={<Users size={20} className="text-[#2563EB]" />}
              label="總客戶數"
              value={formatNumber(stats.total)}
              bgColor="bg-blue-50"
            />
            <StatCard
              icon={<User size={20} className="text-[#2563EB]" />}
              label="個人客戶"
              value={formatNumber(stats.individual)}
              bgColor="bg-blue-50"
            />
            <StatCard
              icon={<Building2 size={20} className="text-[#22C55E]" />}
              label="企業客戶"
              value={formatNumber(stats.corporate)}
              bgColor="bg-green-50"
            />
            <StatCard
              icon={<Globe size={20} className="text-purple-600" />}
              label="外籍客戶"
              value={formatNumber(stats.foreign)}
              bgColor="bg-purple-50"
            />
          </div>

          {/* Search & Filter */}
          <div className="bg-white rounded-lg border border-[#E5E7EB] p-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <Search size={16} className="text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  placeholder="搜尋客戶姓名或身分證/統編..."
                  className="w-full pl-9 pr-3 py-2 text-sm border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] transition"
                  value={keyword}
                  onChange={(e) => handleSearchInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                />
                {searchHint && (
                  <div className="absolute left-0 top-full mt-1 text-xs text-gray-400 pl-1">{searchHint}</div>
                )}
              </div>
              <select
                className="px-3 py-2 text-sm border border-[#E5E7EB] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] transition min-w-[120px]"
                value={typeFilter}
                onChange={(e) => handleTypeChange(e.target.value)}
              >
                {TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <button
                onClick={handleSearch}
                className="inline-flex items-center gap-2 px-4 py-2 bg-[#2563EB] text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition shadow-sm"
              >
                <Search size={16} />
                搜尋
              </button>
            </div>
          </div>

          {/* No Data State */}
          {isNoData && (
            <div className="bg-white rounded-lg border border-[#E5E7EB] shadow-sm p-16 text-center">
              <div className="w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-4">
                <Database size={32} className="text-[#F59E0B]" />
              </div>
              <h3 className="text-base font-semibold text-gray-700 mb-2">客戶資料尚未載入</h3>
              <p className="text-sm text-gray-500">請聯絡管理員執行 ETL Pipeline</p>
            </div>
          )}

          {/* Empty Search State */}
          {isEmptySearch && (
            <div className="bg-white rounded-lg border border-[#E5E7EB] shadow-sm p-16 text-center">
              <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
                <SearchX size={32} className="text-gray-400" />
              </div>
              <h3 className="text-base font-semibold text-gray-700 mb-2">找不到符合條件的客戶</h3>
              <p className="text-sm text-gray-500 mb-4">請嘗試調整搜尋條件或篩選類型</p>
              <button
                onClick={handleClearFilters}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-[#2563EB] border border-[#2563EB] rounded-lg hover:bg-blue-50 transition"
              >
                <RotateCcw size={16} />
                清除篩選條件
              </button>
            </div>
          )}

          {/* Table */}
          {!isNoData && !isEmptySearch && customers.length > 0 && (
            <div className="bg-white rounded-lg border border-[#E5E7EB] shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#E5E7EB] bg-gray-50/60">
                      <th className="text-left px-5 py-3 font-semibold text-gray-600">客戶姓名</th>
                      <th className="text-left px-5 py-3 font-semibold text-gray-600">客戶類型</th>
                      <th className="text-left px-5 py-3 font-semibold text-gray-600">身分證/統編</th>
                      <th className="text-left px-5 py-3 font-semibold text-gray-600">行動電話</th>
                      <th className="text-left px-5 py-3 font-semibold text-gray-600">公司名稱</th>
                      <th className="text-left px-5 py-3 font-semibold text-gray-600">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customers.map((c) => (
                      <tr
                        key={c.customerId}
                        className="border-b border-[#E5E7EB] hover:bg-gray-50/50 transition cursor-pointer"
                        onClick={() => navigate(`/c360/customers/${c.customerId}`)}
                      >
                        <td className="px-5 py-3 font-medium text-gray-900">{c.name}</td>
                        <td className="px-5 py-3">
                          <TypeBadge code={c.customerTypeCode} desc={c.customerTypeDesc} />
                        </td>
                        <td className="px-5 py-3 text-gray-600 font-mono text-xs">{c.sourceCustomerNo}</td>
                        <td className="px-5 py-3 text-gray-600">{c.mobilePhone ?? '\u2014'}</td>
                        <td className="px-5 py-3 text-gray-600">{c.companyName ?? '\u2014'}</td>
                        <td className="px-5 py-3">
                          <Link
                            to={`/c360/customers/${c.customerId}`}
                            className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium text-[#2563EB] border border-[#2563EB]/30 rounded-md hover:bg-blue-50 transition"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Eye size={14} />
                            查看
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination — inside table card */}
              <div className="flex items-center justify-between px-5 py-3 border-t border-[#E5E7EB]">
                <span className="text-sm text-gray-500">
                  顯示 {startItem}-{endItem} / 共 {formatNumber(pagination.total)} 筆
                </span>
                <div className="flex items-center gap-1">
                  <button
                    disabled={pagination.page <= 1}
                    onClick={() => handlePageChange(pagination.page - 1)}
                    className="px-3 py-1.5 text-sm border border-[#E5E7EB] rounded-md bg-white disabled:text-gray-300 disabled:cursor-not-allowed hover:bg-gray-50"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  {buildPageNumbers().map((p, idx) =>
                    p === '...' ? (
                      <span key={`dots-${idx}`} className="px-2 text-gray-400">...</span>
                    ) : (
                      <button
                        key={p}
                        onClick={() => handlePageChange(p)}
                        className={`px-3 py-1.5 text-sm border rounded-md font-medium ${
                          p === pagination.page
                            ? 'border-[#2563EB] text-white bg-[#2563EB]'
                            : 'border-[#E5E7EB] text-gray-600 bg-white hover:bg-gray-50'
                        }`}
                      >
                        {p}
                      </button>
                    ),
                  )}
                  <button
                    disabled={pagination.page >= pagination.totalPages}
                    onClick={() => handlePageChange(pagination.page + 1)}
                    className="px-3 py-1.5 text-sm border border-[#E5E7EB] rounded-md bg-white disabled:text-gray-300 disabled:cursor-not-allowed hover:bg-gray-50"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            </div>
          )}
      </main>
    </AppLayout>
  );
}

function StatCard({
  icon,
  label,
  value,
  bgColor,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  bgColor: string;
}) {
  return (
    <div className="bg-white rounded-lg border border-[#E5E7EB] p-4 flex items-center gap-4">
      <div className={`w-10 h-10 rounded-lg ${bgColor} flex items-center justify-center`}>
        {icon}
      </div>
      <div>
        <div className="text-xs text-gray-500">{label}</div>
        <div className="text-xl font-bold text-gray-900">{value}</div>
      </div>
    </div>
  );
}

function TypeBadge({ code, desc }: { code: string; desc: string | null }) {
  const styles: Record<string, string> = {
    '01': 'bg-blue-100 text-blue-700',
    '02': 'bg-green-100 text-green-700',
    '04': 'bg-purple-100 text-purple-700',
  };
  return (
    <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${styles[code] ?? 'bg-gray-100 text-gray-700'}`}>
      {desc ?? code}
    </span>
  );
}
