import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Download,
  AlertTriangle,
  AlertOctagon,
  CheckCircle2,
  ShieldAlert,
  BarChart2,
  Building2,
  Layers,
  Settings,
  UserPlus,
  UserMinus,
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
import { RunPageBreadcrumb } from './_components/run-page-breadcrumb';

/**
 * F067 NFR-005 不一致率警示閾值（與後端 MISMATCH_ALERT_THRESHOLD 一致）。
 * personnelMismatch.rate（0–1）> 0.03 → algorithm-changed 警示。
 */
const NFR005_THRESHOLD = 0.03;

const PREVIEW_LIMIT = 50;

/**
 * F067 — 兩個月跑比對頁
 *
 * 對應 prototype: /prototypes/36-run-compare.html（6 區塊）
 *
 * ⚠️ 2026-06-26 重寫：原頁面以虛構契約（summary.totalA / personnelMismatch[]）渲染，
 * 與後端 CompareResponse 完全不符 → `undefined.toLocaleString()` 整頁白屏。
 * 本版改為消費後端真實 shape（base/compare、summary.deptDiff/levelDiff、
 * personnelMismatch.{list,rate,alert}、configDiff、customerDiff.{added,removed}）。
 *
 * RBAC: DirectorOrSectionChiefRoute
 */
export function RunComparePage() {
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const runA = searchParams.get('runA') ?? '';
  const runB = searchParams.get('runB') ?? '';

  const [data, setData] = useState<CompareRunsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [availableRuns, setAvailableRuns] = useState<RunListItem[]>([]);

  // 載入可比對的 runs（status=completed）供 selector 使用
  useEffect(() => {
    let aborted = false;
    void (async () => {
      try {
        const res = await listRuns();
        if (!aborted) {
          setAvailableRuns(
            (res.runs ?? []).filter((r) => r.status === 'completed'),
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
        if (!aborted) setError(e?.response?.data?.message ?? '比對失敗');
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

  // ----- 衍生值（後端 rate 為 0–1 比例；alert 由後端裁定） -----
  const pm = data?.personnelMismatch;
  const mismatchRate = pm?.rate ?? 0;
  const ratePct = mismatchRate * 100;
  const customerDiff = data?.customerDiff;
  const isIdentical =
    !!data &&
    (pm?.mismatchCount ?? 0) === 0 &&
    (customerDiff?.added.length ?? 0) === 0 &&
    (customerDiff?.removed.length ?? 0) === 0;
  const algorithmChanged = !!pm?.alert && !isIdentical;

  return (
    <AppLayout
      headerLeft={<RunPageBreadcrumb leaf="結果比對" />}
    >
      <main className="flex-1 p-6 space-y-4">
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
                <span className="font-mono">{ratePct.toFixed(2)}%</span>
                （&gt; NFR-005 警示閾值 {(NFR005_THRESHOLD * 100).toFixed(0)}%）
              </p>
              <p className="text-xs text-gray-600 mt-1">
                此次變更影響大量案件分派結果。可能因演算法版本變更或設定差異所致，
                建議檢視「設定差異」區塊與下載不一致案件清單。
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
            <SummarySection data={data} />
            <PersonnelMismatchSection
              data={data}
              ratePct={ratePct}
              onExport={handleExport}
              exporting={exporting}
            />
            <DeptCompareSection deptDiff={data.summary.deptDiff} />
            <LevelCompareSection levelDiff={data.summary.levelDiff} />
            <ConfigDiffSection configDiff={data.configDiff} />
            <CustomerDiffSection customerDiff={data.customerDiff} />
          </>
        )}
      </main>
    </AppLayout>
  );
}

// =====================================================================
// Section 1：Summary 比對（總筆數 / 部門數 / 等級數）
// =====================================================================
function SummarySection({ data }: { data: CompareRunsResponse }) {
  const deptCountA = data.summary.deptDiff.filter((d) => d.baseCount > 0).length;
  const deptCountB = data.summary.deptDiff.filter(
    (d) => d.compareCount > 0,
  ).length;
  const levelCountA = data.summary.levelDiff.filter(
    (l) => l.baseCount > 0,
  ).length;
  const levelCountB = data.summary.levelDiff.filter(
    (l) => l.compareCount > 0,
  ).length;

  return (
    <section
      data-testid="compare-summary"
      className="bg-white rounded-xl border border-gray-200 overflow-hidden"
    >
      <div className="px-5 py-4 border-b border-gray-200 flex items-center gap-2">
        <BarChart2 className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold text-gray-800">Summary 比對</h3>
        <span className="text-xs text-gray-400">總筆數 / 部門數 / 等級數</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-0 divide-y sm:divide-y-0 sm:divide-x divide-gray-200">
        <SummaryStat
          label="總分派筆數"
          a={data.base.totalCases}
          b={data.compare.totalCases}
          diff={data.summary.totalDiff}
          testid="summary-stat-total"
        />
        <SummaryStat
          label="部門數"
          a={deptCountA}
          b={deptCountB}
          diff={deptCountB - deptCountA}
        />
        <SummaryStat
          label="等級數"
          a={levelCountA}
          b={levelCountB}
          diff={levelCountB - levelCountA}
        />
      </div>
    </section>
  );
}

function SummaryStat({
  label,
  a,
  b,
  diff,
  testid,
}: {
  label: string;
  a: number;
  b: number;
  diff: number;
  testid?: string;
}) {
  const diffClass =
    diff > 0 ? 'text-green-700' : diff < 0 ? 'text-red-700' : 'text-gray-400';
  return (
    <div className="px-5 py-4" data-testid={testid}>
      <div className="text-xs text-gray-500 mb-2">{label}</div>
      <div className="grid grid-cols-2 gap-4 mb-2">
        <div>
          <div className="text-[10px] font-bold text-primary mb-0.5">A (Base)</div>
          <div className="text-2xl font-bold text-gray-800 tabular-nums font-mono">
            {a.toLocaleString()}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-bold text-green-700 mb-0.5">
            B (Compare)
          </div>
          <div className="text-2xl font-bold text-gray-800 tabular-nums font-mono">
            {b.toLocaleString()}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-500">差異</span>
        <span className={`font-mono font-semibold ${diffClass}`}>
          {diff > 0 ? '+' : ''}
          {diff.toLocaleString()}
        </span>
      </div>
    </div>
  );
}

// =====================================================================
// Section 2：人員配對一致性（NFR-005 主驗收區）
// =====================================================================
function PersonnelMismatchSection({
  data,
  ratePct,
  onExport,
  exporting,
}: {
  data: CompareRunsResponse;
  ratePct: number;
  onExport: () => void;
  exporting: boolean;
}) {
  const pm = data.personnelMismatch;
  const rateColor =
    ratePct > 3 ? 'text-red-700' : ratePct > 1 ? 'text-amber-600' : 'text-green-700';
  const barColor =
    ratePct > 3 ? 'bg-red-500' : ratePct > 1 ? 'bg-amber-500' : 'bg-green-500';
  const barWidth = Math.max(2, Math.min(100, (ratePct / 5) * 100));
  const rows = pm.list.slice(0, 10);

  return (
    <section
      data-testid="personnel-mismatch"
      className="bg-white rounded-xl border-2 border-amber-300 overflow-hidden"
    >
      <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between bg-amber-50/50">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-amber-500" />
          <h3 className="text-sm font-semibold text-gray-800">
            人員配對一致性 diff
          </h3>
          <span className="text-xs px-1.5 py-0.5 bg-amber-500 text-white rounded-full font-bold">
            NFR-005
          </span>
        </div>
        <Button
          type="button"
          variant="primary"
          data-testid="btn-download-mismatch"
          loading={exporting}
          loadingText="匯出中..."
          onClick={onExport}
        >
          <span className="inline-flex items-center gap-1.5">
            <Download className="w-3.5 h-3.5" />
            下載不一致案件清單
          </span>
        </Button>
      </div>
      <div className="px-5 py-5">
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div>
            <div className="text-xs text-gray-500 mb-1">同批次總案件數</div>
            <div className="text-2xl font-bold text-gray-800 tabular-nums font-mono">
              {pm.totalCount.toLocaleString()}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">不一致案件數</div>
            <div
              data-testid="mismatch-count"
              className="text-2xl font-bold text-gray-800 tabular-nums font-mono"
            >
              {pm.mismatchCount.toLocaleString()}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">人員配對不一致率</div>
            <div
              data-testid="mismatch-rate"
              className={`text-2xl font-bold tabular-nums font-mono ${rateColor}`}
            >
              {ratePct.toFixed(2)}%
            </div>
            <div className="mt-1.5 h-3 bg-gray-100 rounded overflow-hidden">
              <div
                className={`h-full rounded ${barColor}`}
                style={{ width: `${barWidth}%` }}
              />
            </div>
            <div className="text-[10px] text-gray-400 mt-0.5">
              NFR-005 警示門檻 3.00%
            </div>
          </div>
        </div>

        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="text-left px-3 py-2 font-semibold">appl_no</th>
                <th className="text-left px-3 py-2 font-semibold text-primary">
                  A：業務員
                </th>
                <th className="text-center px-3 py-2 text-gray-300">→</th>
                <th className="text-left px-3 py-2 font-semibold text-green-700">
                  B：業務員
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 font-mono">
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-3 py-6 text-center text-green-700 text-sm"
                  >
                    兩次月跑配對 100% 相同 — 演算法 deterministic 驗證通過
                  </td>
                </tr>
              ) : (
                rows.map((m) => (
                  <tr key={m.applNo} className="hover:bg-amber-50/30">
                    <td className="px-3 py-2 font-semibold text-gray-700">
                      {m.applNo}
                    </td>
                    <td className="px-3 py-2">
                      <span className="px-2 py-0.5 rounded bg-red-100 text-red-700">
                        {m.baseEmplId ?? '—'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center text-gray-300">→</td>
                    <td className="px-3 py-2">
                      <span className="px-2 py-0.5 rounded bg-violet-100 text-violet-700">
                        {m.compareEmplId ?? '—'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          {pm.mismatchCount > rows.length && (
            <div className="px-3 py-2 border-t border-gray-200 text-xs text-gray-500 bg-gray-50/40">
              顯示前 {rows.length} 筆 — 完整 {pm.mismatchCount.toLocaleString()}{' '}
              筆請下載 Excel 清單
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// =====================================================================
// Section 3：部門分配比對
// =====================================================================
function DeptCompareSection({
  deptDiff,
}: {
  deptDiff: CompareRunsResponse['summary']['deptDiff'];
}) {
  const max = Math.max(
    1,
    ...deptDiff.map((d) => Math.max(d.baseCount, d.compareCount)),
  );
  return (
    <section
      data-testid="dept-compare"
      className="bg-white rounded-xl border border-gray-200 overflow-hidden"
    >
      <div className="px-5 py-4 border-b border-gray-200 flex items-center gap-2">
        <Building2 className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold text-gray-800">部門分配比對</h3>
        <span className="text-xs text-gray-400">A vs B 各部門分派筆數</span>
      </div>
      <div className="px-5 py-5 space-y-4">
        {deptDiff.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">無部門分配資料</p>
        ) : (
          deptDiff.map((d) => (
            <div key={d.deptId}>
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono text-xs font-semibold text-gray-600">
                  {d.deptId}
                </span>
                <div className="flex items-center gap-3 text-xs font-mono">
                  <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-700">
                    A: {d.baseCount.toLocaleString()}
                  </span>
                  <span className="text-gray-300">vs</span>
                  <span className="px-2 py-0.5 rounded bg-green-100 text-green-700">
                    B: {d.compareCount.toLocaleString()}
                  </span>
                  <span
                    className={`font-semibold ${
                      d.diff > 0
                        ? 'text-green-700'
                        : d.diff < 0
                          ? 'text-red-700'
                          : 'text-gray-400'
                    }`}
                  >
                    {d.diff > 0 ? '+' : ''}
                    {d.diff.toLocaleString()}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="h-3 bg-gray-100 rounded overflow-hidden">
                  <div
                    className="h-full bg-primary rounded"
                    style={{ width: `${(d.baseCount / max) * 100}%` }}
                  />
                </div>
                <div className="h-3 bg-gray-100 rounded overflow-hidden">
                  <div
                    className="h-full bg-green-500 rounded"
                    style={{ width: `${(d.compareCount / max) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

// =====================================================================
// Section 4：等級（card_level）分佈比對
// =====================================================================
function LevelCompareSection({
  levelDiff,
}: {
  levelDiff: CompareRunsResponse['summary']['levelDiff'];
}) {
  return (
    <section
      data-testid="level-compare"
      className="bg-white rounded-xl border border-gray-200 overflow-hidden"
    >
      <div className="px-5 py-4 border-b border-gray-200 flex items-center gap-2">
        <Layers className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold text-gray-800">
          CARD_LEVEL 分佈比對
        </h3>
      </div>
      <div className="px-5 py-5">
        {levelDiff.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">無等級分佈資料</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-gray-500">
              <tr>
                <th className="text-left px-3 py-2 font-medium">等級</th>
                <th className="text-right px-3 py-2 font-medium text-primary">
                  A (Base)
                </th>
                <th className="text-right px-3 py-2 font-medium text-green-700">
                  B (Compare)
                </th>
                <th className="text-right px-3 py-2 font-medium">差異</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 font-mono">
              {levelDiff.map((l) => (
                <tr key={l.cardLevel}>
                  <td className="px-3 py-2 font-semibold text-gray-700">
                    {l.cardLevel || '—'}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {l.baseCount.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {l.compareCount.toLocaleString()}
                  </td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums font-semibold ${
                      l.diff > 0
                        ? 'text-green-700'
                        : l.diff < 0
                          ? 'text-red-700'
                          : 'text-gray-400'
                    }`}
                  >
                    {l.diff > 0 ? '+' : ''}
                    {l.diff.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

// =====================================================================
// Section 5：設定差異（config 快照 diff）
// =====================================================================
function ConfigDiffSection({
  configDiff,
}: {
  configDiff: CompareRunsResponse['configDiff'];
}) {
  const fmtRatio = (v: number | null) => (v === null ? '—' : String(v));
  const rows: Array<{
    key: string;
    label: string;
    from: string;
    to: string;
    critical?: boolean;
  }> = [];

  if (configDiff.cardVersionChanged) {
    rows.push({
      key: 'card_version',
      label: 'card_version',
      from: fmtRatio(configDiff.cardVersionChanged.from),
      to: fmtRatio(configDiff.cardVersionChanged.to),
      critical: true,
    });
  }
  for (const d of configDiff.deptRatioChanges) {
    rows.push({
      key: `${d.listNo}__${d.deptId}`,
      label: `${d.listNo} / ${d.deptId} 比例`,
      from: fmtRatio(d.from),
      to: fmtRatio(d.to),
    });
  }
  if (configDiff.crRuleChanged) {
    rows.push({
      key: 'cr_rule',
      label: 'cr_rule_enabled',
      from: String(configDiff.crRuleChanged.from),
      to: String(configDiff.crRuleChanged.to),
    });
  }

  return (
    <section
      data-testid="config-diff"
      className="bg-white rounded-xl border border-gray-200 overflow-hidden"
    >
      <div className="px-5 py-4 border-b border-gray-200 flex items-center gap-2">
        <Settings className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold text-gray-800">
          設定差異（config 快照 diff）
        </h3>
      </div>
      {rows.length === 0 ? (
        <p
          data-testid="config-diff-empty"
          className="px-5 py-6 text-sm text-gray-400 text-center"
        >
          兩次月跑設定完全相同 — 無設定差異
        </p>
      ) : (
        <div className="divide-y divide-gray-100">
          {rows.map((r) => (
            <div
              key={r.key}
              className={`px-5 py-3 flex items-center gap-4 ${
                r.critical ? 'bg-red-50/40' : 'bg-amber-50/30'
              }`}
            >
              <span className="text-sm font-mono font-semibold text-gray-800 flex-1">
                {r.label}
                {r.critical && (
                  <span className="ml-1.5 px-1.5 py-0.5 text-[10px] font-bold rounded bg-red-500 text-white">
                    關鍵變更
                  </span>
                )}
              </span>
              <span className="px-2 py-0.5 rounded font-mono text-xs bg-blue-100 text-blue-700">
                A: {r.from}
              </span>
              <span className="text-gray-400">→</span>
              <span className="px-2 py-0.5 rounded font-mono text-xs bg-green-100 text-green-700">
                B: {r.to}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// =====================================================================
// Section 6：客戶層級差異（集合運算，依 appl_no）
// =====================================================================
function CustomerDiffSection({
  customerDiff,
}: {
  customerDiff: CompareRunsResponse['customerDiff'];
}) {
  return (
    <section
      data-testid="customer-diff"
      className="bg-white rounded-xl border border-gray-200 overflow-hidden"
    >
      <div className="px-5 py-4 border-b border-gray-200 flex items-center gap-2">
        <UserPlus className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold text-gray-800">
          客戶層級差異（集合運算）
        </h3>
      </div>
      <div className="px-5 py-5 grid grid-cols-1 md:grid-cols-2 gap-4">
        <DiffList
          title="僅在 A — 已移除"
          icon={<UserMinus className="w-4 h-4" />}
          tone="red"
          items={customerDiff.removed}
          testid="customer-removed"
        />
        <DiffList
          title="僅在 B — 新增"
          icon={<UserPlus className="w-4 h-4" />}
          tone="violet"
          items={customerDiff.added}
          testid="customer-added"
        />
      </div>
    </section>
  );
}

function DiffList({
  title,
  icon,
  tone,
  items,
  testid,
}: {
  title: string;
  icon: React.ReactNode;
  tone: 'red' | 'violet';
  items: Array<{ applNo: string }>;
  testid: string;
}) {
  const head =
    tone === 'red'
      ? 'bg-red-50 border-red-200 text-red-700'
      : 'bg-violet-50 border-violet-200 text-violet-700';
  const border = tone === 'red' ? 'border-red-200' : 'border-violet-200';
  const preview = items.slice(0, PREVIEW_LIMIT);
  return (
    <div className={`border ${border} rounded-lg overflow-hidden`}>
      <div
        className={`px-3 py-2 border-b ${head} flex items-center justify-between`}
      >
        <span className="text-sm font-semibold inline-flex items-center gap-1">
          {icon}
          {title}
        </span>
        <span
          data-testid={`${testid}-count`}
          className="text-xs font-mono font-semibold"
        >
          {items.length.toLocaleString()} 筆
        </span>
      </div>
      <div className="divide-y divide-gray-100 max-h-48 overflow-y-auto">
        {items.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-gray-400">
            無{tone === 'red' ? '移除' : '新增'}案件
          </div>
        ) : (
          preview.map((c) => (
            <div
              key={c.applNo}
              className="px-3 py-2 flex items-center gap-3 text-xs font-mono text-gray-700"
            >
              {c.applNo}
            </div>
          ))
        )}
      </div>
      {items.length > preview.length && (
        <div className="px-3 py-2 border-t border-gray-200 text-[11px] text-gray-500 bg-gray-50/40">
          顯示前 {preview.length} 筆 — 完整 {items.length.toLocaleString()}{' '}
          筆請匯出 XLSX
        </div>
      )}
    </div>
  );
}
