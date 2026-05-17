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
  AlertOctagon,
  CheckCircle2,
  ShieldAlert,
} from 'lucide-react';
import { AppLayout } from '@/components/layout/app-layout';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import {
  compareRuns,
  downloadCompareExport,
  listRuns,
  type CompareRunsResponse,
  type RunListItem,
} from '@/api/assignment-run';
import { RunSelector } from './_components/run-selector';

/**
 * F067 NFR-005 不一致率警示閾值
 *
 * 不一致率 = customersChangedAssigneeCount / totalB；超過則顯示 algorithm-changed banner。
 */
const NFR005_THRESHOLD = 0.03;

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
  const [searchParams, setSearchParams] = useSearchParams();
  const runA = searchParams.get('runA') ?? '';
  const runB = searchParams.get('runB') ?? '';

  const [data, setData] = useState<CompareRunsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [availableRuns, setAvailableRuns] = useState<RunListItem[]>([]);

  // 載入可比對的 runs（status=completed）
  useEffect(() => {
    let aborted = false;
    void (async () => {
      try {
        const data = await listRuns();
        if (!aborted) {
          setAvailableRuns(
            (data.runs ?? []).filter((r) => r.status === 'completed'),
          );
        }
      } catch {
        // 無 runs 不致命
      }
    })();
    return () => {
      aborted = true;
    };
  }, []);

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

  const handleCompare = (a: string, b: string) => {
    setSearchParams({ runA: a, runB: b }, { replace: true });
  };

  const handleChangeA = (a: string) => setSearchParams({ runA: a, runB });
  const handleChangeB = (b: string) => setSearchParams({ runA, runB: b });

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

  // F067 不一致率（algorithm-changed 警示）
  const mismatchRate = (() => {
    if (!data) return 0;
    const totalB = data.summary.totalB ?? 0;
    if (totalB <= 0) return 0;
    return (data.summary.customersChangedAssigneeCount ?? 0) / totalB;
  })();
  // F067 identical 判定：personnelMismatch + customerDiff + changedAssignee 全為 0
  //（addedCount/removedCount 可能反映兩 run 的客戶集合差異，不屬演算法不一致）
  const isIdentical =
    !!data &&
    (data.summary.customersChangedAssigneeCount ?? 0) === 0 &&
    (data.personnelMismatch?.length ?? 0) === 0 &&
    (data.customerDiff?.length ?? 0) === 0;
  const algorithmChanged = !!data && !isIdentical && mismatchRate > NFR005_THRESHOLD;

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
        {/* Run Selector */}
        <RunSelector
          runs={availableRuns}
          runA={runA}
          runB={runB}
          onCompare={handleCompare}
          onChangeA={handleChangeA}
          onChangeB={handleChangeB}
          loading={loading}
        />

        <div className="flex items-center justify-end">
          {data && (
            <Button
              type="button"
              variant="secondary"
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

        {/* Algorithm-changed warning（不一致率 > 3%） */}
        {algorithmChanged && (
          <div
            data-testid="algorithm-changed-banner"
            role="alert"
            className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg"
          >
            <AlertOctagon className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="font-semibold text-red-700">
                人員配對不一致率{' '}
                <span className="font-mono">
                  {(mismatchRate * 100).toFixed(2)}%
                </span>
                （&gt; NFR-005 警示閾值 {(NFR005_THRESHOLD * 100).toFixed(0)}%）
              </p>
              <p className="text-xs text-gray-600 mt-1">
                此次變更影響大量案件分派結果。可能因演算法版本變更或設定差異所致，
                建議檢視設定差異區塊與下載不一致案件清單。
              </p>
              <div className="mt-2 inline-flex items-center gap-1 text-xs text-red-700">
                <ShieldAlert className="w-3.5 h-3.5" />
                F067 為 NFR-005 主驗收工具
              </div>
            </div>
          </div>
        )}

        {/* Identical banner（100% 相同） */}
        {isIdentical && (
          <div
            data-testid="identical-banner"
            className="flex items-start gap-3 p-4 bg-green-50 border border-green-200 rounded-lg"
          >
            <CheckCircle2 className="w-5 h-5 text-green-700 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="font-semibold text-green-700">
                兩次月跑配對 100% 相同 — 分派演算法 deterministic 驗證通過
              </p>
              <p className="text-xs text-gray-600 mt-1">
                人員配對不一致率 0.00%（NFR-005 通過）。
                此結果代表演算法在相同輸入與設定下能產生穩定可重現的結果。
              </p>
            </div>
          </div>
        )}

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
