import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  GitCompare,
  Download,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Users,
} from 'lucide-react';
import { AppLayout } from '@/components/layout/app-layout';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import {
  compareRuns,
  downloadCompareExport,
  type CompareRunsResponse,
} from '@/api/assignment-run';

/**
 * F067 — 兩個月跑比對頁
 *
 * 對應 prototype: /prototypes/36-run-compare.html
 *
 * 範圍：
 *   - 從 URL ?runA=&runB= 取兩個 runId
 *   - 顯示 summary 卡（total / delta / customers added/removed/reassigned）
 *   - personnelMismatch 表
 *   - customerDiff 表（前 100 列；完整匯出 xlsx）
 *   - 匯出 xlsx (3 sheet: summary / personnelMismatch / customerDiff)
 *
 * RBAC: DirectorOrSectionChiefRoute
 */

export function RunComparePage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [searchParams] = useSearchParams();
  const runA = searchParams.get('runA') ?? '';
  const runB = searchParams.get('runB') ?? '';

  const [data, setData] = useState<CompareRunsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!runA || !runB) {
      setError('缺少 runA 或 runB 參數');
      setLoading(false);
      return;
    }
    let aborted = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await compareRuns(runA, runB);
        if (!aborted) setData(result);
      } catch (err: unknown) {
        const e = err as { response?: { data?: { message?: string } } };
        if (!aborted)
          setError(e?.response?.data?.message ?? '比對失敗');
      } finally {
        if (!aborted) setLoading(false);
      }
    })();
    return () => {
      aborted = true;
    };
  }, [runA, runB]);

  const handleExport = async () => {
    setExporting(true);
    try {
      await downloadCompareExport(runA, runB);
      showToast('比對結果 XLSX 已下載', 'success');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      showToast(e?.response?.data?.message ?? '匯出失敗', 'error');
    } finally {
      setExporting(false);
    }
  };

  const deltaTotal = data?.summary.deltaTotal ?? 0;
  const deltaPositive = deltaTotal > 0;

  return (
    <AppLayout
      headerLeft={
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/assignment/history')}
            className="text-gray-400 hover:text-gray-700"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-base font-semibold text-gray-800">結果比對</h1>
        </div>
      }
    >
      <main className="flex-1 p-6 space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-gray-600">比對：</span>
          <code className="font-mono text-xs text-primary px-2 py-0.5 bg-blue-50 rounded">
            {runA || '—'}
          </code>
          <GitCompare className="w-4 h-4 text-gray-400" />
          <code className="font-mono text-xs text-primary px-2 py-0.5 bg-blue-50 rounded">
            {runB || '—'}
          </code>
          {data && (
            <Button
              type="button"
              variant="secondary"
              className="ml-auto"
              data-testid="btn-export-compare"
              loading={exporting}
              loadingText="匯出中..."
              onClick={handleExport}
            >
              <span className="inline-flex items-center gap-1.5">
                <Download className="w-4 h-4" />
                匯出 XLSX
              </span>
            </Button>
          )}
        </div>

        {loading && (
          <div className="p-12 text-center text-gray-400" data-testid="compare-loading">
            比對載入中...
          </div>
        )}

        {error && (
          <div
            data-testid="compare-error"
            className="rounded-lg p-3 bg-red-50 border border-red-200 flex items-start gap-2 text-sm"
          >
            <AlertTriangle className="w-4 h-4 text-danger mt-0.5 shrink-0" />
            <span className="text-red-800">{error}</span>
          </div>
        )}

        {data && (
          <>
            {/* Summary cards */}
            <section
              className="grid grid-cols-5 gap-3"
              data-testid="compare-summary"
            >
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-[11px] text-gray-500">Run A 總數</p>
                <p className="text-2xl font-mono font-semibold text-gray-900">
                  {data.summary.totalA.toLocaleString()}
                </p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-[11px] text-gray-500">Run B 總數</p>
                <p className="text-2xl font-mono font-semibold text-gray-900">
                  {data.summary.totalB.toLocaleString()}
                </p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-[11px] text-gray-500">差異</p>
                <p
                  data-testid="delta-total"
                  className={`text-2xl font-mono font-bold flex items-center gap-1 ${
                    deltaPositive
                      ? 'text-green-700'
                      : deltaTotal < 0
                        ? 'text-red-700'
                        : 'text-gray-600'
                  }`}
                >
                  {deltaPositive ? (
                    <TrendingUp className="w-5 h-5" />
                  ) : deltaTotal < 0 ? (
                    <TrendingDown className="w-5 h-5" />
                  ) : null}
                  {deltaTotal >= 0 ? '+' : ''}
                  {deltaTotal.toLocaleString()}
                </p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-[11px] text-gray-500">新增/移除</p>
                <p className="text-sm text-gray-700 font-mono">
                  <span className="text-green-700">+{data.summary.customersAddedCount}</span>
                  {' / '}
                  <span className="text-red-700">-{data.summary.customersRemovedCount}</span>
                </p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-[11px] text-gray-500">重新分派</p>
                <p
                  data-testid="reassigned-count"
                  className="text-2xl font-mono font-semibold text-amber-700"
                >
                  {data.summary.customersChangedAssigneeCount}
                </p>
              </div>
            </section>

            {/* Personnel mismatch */}
            {data.personnelMismatch && data.personnelMismatch.length > 0 && (
              <section
                className="bg-white rounded-xl border border-gray-200 overflow-hidden"
                data-testid="personnel-mismatch"
              >
                <div className="px-5 py-3 border-b border-gray-200 flex items-center gap-2">
                  <Users className="w-4 h-4 text-cyan-800" />
                  <h3 className="text-sm font-semibold text-gray-800">個別業務分派差異</h3>
                  <span className="text-xs text-gray-400">
                    （{data.personnelMismatch.length} 員工有差異）
                  </span>
                </div>
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                    <tr>
                      <th className="text-left px-5 py-2 font-medium w-[20%]">員工編號</th>
                      <th className="text-left px-5 py-2 font-medium">姓名</th>
                      <th className="text-right px-5 py-2 font-medium w-[15%]">Run A</th>
                      <th className="text-right px-5 py-2 font-medium w-[15%]">Run B</th>
                      <th className="text-right px-5 py-2 font-medium w-[15%]">差異</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.personnelMismatch.map((p) => (
                      <tr key={p.empId}>
                        <td className="px-5 py-2 font-mono text-primary">{p.empId}</td>
                        <td className="px-5 py-2 text-gray-900">{p.empName ?? '—'}</td>
                        <td className="px-5 py-2 text-right font-mono">
                          {p.countA.toLocaleString()}
                        </td>
                        <td className="px-5 py-2 text-right font-mono">
                          {p.countB.toLocaleString()}
                        </td>
                        <td
                          className={`px-5 py-2 text-right font-mono font-semibold ${
                            p.delta > 0 ? 'text-green-700' : p.delta < 0 ? 'text-red-700' : 'text-gray-500'
                          }`}
                        >
                          {p.delta > 0 ? '+' : ''}
                          {p.delta}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            {/* Customer diff */}
            {data.customerDiff && data.customerDiff.length > 0 && (
              <section
                className="bg-white rounded-xl border border-gray-200 overflow-hidden"
                data-testid="customer-diff"
              >
                <div className="px-5 py-3 border-b border-gray-200">
                  <h3 className="text-sm font-semibold text-gray-800">
                    客戶分派差異
                    <span className="text-xs text-gray-400 ml-1">
                      （顯示前 {Math.min(100, data.customerDiff.length)} /
                      共 {data.customerDiff.length} 筆，完整資料請匯出 XLSX）
                    </span>
                  </h3>
                </div>
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                    <tr>
                      <th className="text-left px-5 py-2 font-medium w-[24%]">customer_id</th>
                      <th className="text-left px-5 py-2 font-medium w-[24%]">Run A 分派</th>
                      <th className="text-left px-5 py-2 font-medium w-[24%]">Run B 分派</th>
                      <th className="text-left px-5 py-2 font-medium w-[14%]">類型</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.customerDiff.slice(0, 100).map((c) => (
                      <tr key={c.customerId}>
                        <td className="px-5 py-2 font-mono text-xs text-primary">
                          {c.customerId}
                        </td>
                        <td className="px-5 py-2 text-xs text-gray-700">
                          {c.assigneeA ?? '—'}
                        </td>
                        <td className="px-5 py-2 text-xs text-gray-700">
                          {c.assigneeB ?? '—'}
                        </td>
                        <td className="px-5 py-2">
                          <DiffTypeBadge type={c.diffType} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}
          </>
        )}
      </main>
    </AppLayout>
  );
}

function DiffTypeBadge({ type }: { type: 'added' | 'removed' | 'reassigned' }) {
  const config = {
    added: { label: '新增', bg: 'bg-green-100', text: 'text-green-700' },
    removed: { label: '移除', bg: 'bg-red-100', text: 'text-red-700' },
    reassigned: { label: '重派', bg: 'bg-amber-100', text: 'text-amber-700' },
  }[type];
  return (
    <span
      className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${config.bg} ${config.text}`}
    >
      {config.label}
    </span>
  );
}
