import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ChevronRight,
  ChevronDown,
  Database,
  AlertTriangle,
} from 'lucide-react';
import { AppLayout } from '@/components/layout/app-layout';
import {
  getTargetTables,
  getTargetTableSchema,
  getTargetTableStats,
} from '@/api/etl-pipelines';
import type {
  TargetTableSummary,
  TargetTableColumn,
  TargetTableStat,
} from '@cdmp/shared';

const DOMAIN_COLORS: Record<string, { bg: string; text: string }> = {
  core: { bg: 'bg-blue-50', text: 'text-blue-700' },
  interaction: { bg: 'bg-green-50', text: 'text-green-700' },
  financial: { bg: 'bg-amber-50', text: 'text-amber-700' },
  service: { bg: 'bg-purple-50', text: 'text-purple-700' },
};

export function TargetTablesPage() {
  const navigate = useNavigate();
  const [tables, setTables] = useState<TargetTableSummary[]>([]);
  const [expandedTable, setExpandedTable] = useState<string | null>(null);
  const [columns, setColumns] = useState<Record<string, TargetTableColumn[]>>({});
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<TargetTableStat[]>([]);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    getTargetTables()
      .then((res) => setTables(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
    getTargetTableStats()
      .then((res) => setStats(res.data))
      .catch(() => {})
      .finally(() => setStatsLoading(false));
  }, []);

  const handleToggle = async (tableName: string) => {
    if (expandedTable === tableName) {
      setExpandedTable(null);
      return;
    }
    setExpandedTable(tableName);
    if (!columns[tableName]) {
      try {
        const schema = await getTargetTableSchema(tableName);
        setColumns((prev) => ({ ...prev, [tableName]: schema.columns }));
      } catch {
        // ignore
      }
    }
  };

  const headerLeft = (
    <div className="flex items-center gap-2 text-sm">
      <button
        onClick={() => navigate('/etl-pipelines')}
        className="text-gray-400 hover:text-[#2563EB]"
        data-testid="back-button"
      >
        <ArrowLeft size={16} />
      </button>
      <nav className="flex items-center text-gray-500">
        <a
          href="/etl-pipelines"
          className="hover:text-[#2563EB]"
        >
          ETL Pipeline
        </a>
        <ChevronRight size={16} className="mx-1" />
        <span className="text-[#2563EB] font-medium">目標表定義</span>
      </nav>
    </div>
  );

  return (
    <AppLayout headerLeft={headerLeft}>
        <main className="flex-1 p-6 overflow-auto">
          {/* ETL 資料表現況：真實筆數 + 上次載入（比照「資料擷取」；一眼看出「log 完成但表為空」） */}
          <div
            className="mb-6 bg-white rounded-lg shadow-sm border border-border overflow-hidden"
            data-testid="target-table-stats"
          >
            <div className="px-5 py-4 border-b border-border flex items-center gap-2">
              <Database size={18} className="text-[#2563EB]" />
              <div>
                <h2 className="text-base font-semibold text-gray-800">
                  ETL 資料表現況
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  各 Pipeline 目標資料表目前實際存在資料庫的筆數（0 筆代表空表 / 尚未載入，需重新執行 ETL）
                </p>
              </div>
            </div>
            {statsLoading ? (
              <div className="text-center text-gray-400 py-8 text-sm">
                載入中...
              </div>
            ) : stats.length === 0 ? (
              <div className="text-center text-gray-400 py-8 text-sm">
                尚無 ETL Pipeline 目標資料表
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-border">
                    <tr>
                      <th className="text-left px-5 py-2.5 font-medium text-gray-500">
                        目標資料表
                      </th>
                      <th className="text-right px-5 py-2.5 font-medium text-gray-500 w-40">
                        資料筆數
                      </th>
                      <th className="text-left px-5 py-2.5 font-medium text-gray-500 w-48">
                        上次載入
                      </th>
                      <th className="text-left px-5 py-2.5 font-medium text-gray-500">
                        Pipeline
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.map((s) => {
                      const empty = s.rowCount === 0;
                      return (
                        <tr
                          key={s.tableName}
                          data-testid={`stat-row-${s.tableName}`}
                          className={`border-b border-border ${empty ? 'bg-red-50/60' : ''}`}
                        >
                          <td className="px-5 py-2.5">
                            <code className="text-xs font-mono text-gray-700">
                              {s.tableName}
                            </code>
                          </td>
                          <td className="px-5 py-2.5 text-right">
                            {empty ? (
                              <span
                                className="inline-flex items-center gap-1 font-semibold text-danger"
                                data-testid={`stat-empty-${s.tableName}`}
                              >
                                <AlertTriangle size={13} />0 筆
                              </span>
                            ) : (
                              <span className="font-medium text-gray-800">
                                {s.rowCount.toLocaleString()} 筆
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-2.5 text-gray-600">
                            {s.lastLoadedAt ? (
                              <span>
                                {s.lastLoadedAt.slice(0, 16).replace('T', ' ')}
                                {s.lastLoadStatus && (
                                  <span
                                    className={`ml-1.5 text-xs ${
                                      s.lastLoadStatus === 'completed'
                                        ? 'text-green-600'
                                        : s.lastLoadStatus === 'failed'
                                          ? 'text-danger'
                                          : 'text-gray-400'
                                    }`}
                                  >
                                    (
                                    {s.lastLoadStatus === 'completed'
                                      ? '完成'
                                      : s.lastLoadStatus === 'failed'
                                        ? '失敗'
                                        : '執行中'}
                                    )
                                  </span>
                                )}
                              </span>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                          <td className="px-5 py-2.5 text-gray-600">
                            {s.pipelineName}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="mb-6">
            <h2 className="text-xl font-semibold text-gray-800" data-testid="page-title">
              Domain-Oriented 目標表定義
            </h2>
            <p className="text-sm text-gray-500 mt-1" data-testid="page-subtitle">
              Phase 1 MVP 預定義 1 個 Domain Data Product 目標表，由 ETL Pipeline Load 節點寫入
            </p>
          </div>

          {loading ? (
            <div className="text-center text-gray-400 py-12">載入中...</div>
          ) : (
            <div className="space-y-4" data-testid="target-table-cards">
              {tables.map((table) => {
                const domainColor = DOMAIN_COLORS[table.domain] || {
                  bg: 'bg-gray-50',
                  text: 'text-gray-700',
                };
                const isExpanded = expandedTable === table.tableName;
                const tableCols = columns[table.tableName] || [];

                return (
                  <div
                    key={table.tableName}
                    className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden"
                    data-testid={`card-${table.domain}`}
                  >
                    {/* Collapsed header */}
                    <button
                      onClick={() => handleToggle(table.tableName)}
                      className="w-full px-5 py-4 flex items-center justify-between hover:bg-gray-50 transition"
                      data-testid={`toggle-${table.domain}`}
                    >
                      <div className="flex items-center gap-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${domainColor.bg} ${domainColor.text}`}
                          data-testid={`badge-${table.domain}`}
                        >
                          {table.domain}
                        </span>
                        <div className="text-left">
                          <h3 className="text-base font-semibold text-gray-800">
                            {table.tableName}
                          </h3>
                          <p className="text-sm text-gray-500">
                            {table.displayName} - {table.description}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-gray-400">
                          {table.columnCount} 欄位
                        </span>
                        <ChevronDown
                          size={20}
                          className={`text-gray-400 transition-transform duration-200 ${
                            isExpanded ? 'rotate-180' : ''
                          }`}
                          data-testid={`chevron-${table.domain}`}
                        />
                      </div>
                    </button>

                    {/* Expanded table */}
                    {isExpanded && tableCols.length > 0 && (
                      <div
                        className="border-t border-gray-200"
                        data-testid={`table-${table.domain}`}
                      >
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                              <th className="text-left px-4 py-2.5 font-medium text-gray-500 w-1/4">
                                欄位名稱
                              </th>
                              <th className="text-left px-4 py-2.5 font-medium text-gray-500 w-1/6">
                                型別
                              </th>
                              <th className="text-center px-4 py-2.5 font-medium text-gray-500 w-20">
                                Nullable
                              </th>
                              <th className="text-center px-4 py-2.5 font-medium text-gray-500 w-16">
                                PK
                              </th>
                              <th className="text-left px-4 py-2.5 font-medium text-gray-500">
                                說明
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {tableCols.map((col, idx) => (
                              <tr
                                key={col.name}
                                className={`${
                                  idx < tableCols.length - 1
                                    ? 'border-b border-gray-200'
                                    : ''
                                } ${col.isEtlTracking ? 'bg-[#F9FAFB]' : ''}`}
                                data-testid={
                                  col.isEtlTracking
                                    ? `etl-tracking-row-${col.name}`
                                    : `row-${col.name}`
                                }
                              >
                                <td className="px-4 py-2">
                                  {col.isPrimaryKey && (
                                    <span className="text-[#EF4444]">* </span>
                                  )}
                                  <code
                                    className={`text-xs font-mono ${
                                      col.isEtlTracking ? 'text-gray-500' : ''
                                    }`}
                                  >
                                    {col.name}
                                  </code>
                                </td>
                                <td
                                  className={`px-4 py-2 ${
                                    col.isEtlTracking
                                      ? 'text-gray-500'
                                      : 'text-gray-600'
                                  }`}
                                >
                                  {col.type}
                                </td>
                                <td className="px-4 py-2 text-center text-gray-400">
                                  {col.nullable ? '是' : '否'}
                                </td>
                                <td className="px-4 py-2 text-center">
                                  {col.isPrimaryKey && (
                                    <span className="text-[#EF4444] font-bold">
                                      PK
                                    </span>
                                  )}
                                </td>
                                <td
                                  className={`px-4 py-2 ${
                                    col.isEtlTracking
                                      ? 'text-gray-500'
                                      : 'text-gray-600'
                                  }`}
                                >
                                  {col.description}
                                  {col.isEtlTracking && (
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-gray-200 text-gray-500 ml-1">
                                      系統自動填充
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </main>
    </AppLayout>
  );
}
