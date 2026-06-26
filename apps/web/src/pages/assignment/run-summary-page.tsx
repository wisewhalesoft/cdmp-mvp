import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  CheckCircle,
  History,
  Download,
  Camera,
  Users,
  Building2,
  UserCheck,
  AlertTriangle,
  AlertCircle,
  Lock,
  Clock,
  TrendingUp,
  FileSpreadsheet,
  FileText,
  Filter,
} from 'lucide-react';
import { AppLayout } from '@/components/layout/app-layout';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import {
  getRunSummary,
  downloadRunExport,
  type RunSummaryResponse,
} from '@/api/assignment-run';
import { DeptDeviationChart } from './_components/dept-deviation-chart';
import { CardLevelDonut } from './_components/card-level-donut';
import { TierLevelChart } from './_components/tier-level-chart';
import { RunPageBreadcrumb } from './_components/run-page-breadcrumb';
import {
  ScoringWarningBanner,
  type ScoringWarningSummary,
} from './_components/scoring-warning-banner';

/**
 * F063 — 月跑結果摘要頁
 *
 * 對應 prototype: /prototypes/33-run-summary.html
 *
 * 版面順序（嚴格對齊 prototype）：
 *   1. Run Info Bar（狀態 / Run ID / 5 欄統計 + 快照 / 歷史導覽）
 *   2. 3 Stat Cards（總分派客戶數 / 分派部門數 / 分派業務員數）
 *   3. F063 警示橫幅（計分完整性 / BR-12 SKIPPED）
 *   4. 部門分配偏差 chart
 *   5. 等級分佈 grid（TIER_LEVEL bar + CARD_LEVEL donut）
 *   6. 匯出區（F064 streaming xlsx / csv + AD-E07-11 注意事項）
 *   7. NFR-005 偏差警示 footer note
 *
 * RBAC: DirectorOrSectionChiefRoute（處長限轄區 — backend filter）
 */

function formatPct(n: number | undefined): string {
  if (n === undefined || Number.isNaN(n)) return '—';
  return `${(n * 100).toFixed(2)}%`;
}

/**
 * F063：將後端 RunSummaryResponse.warnings 轉換為 ScoringWarningBanner 所需結構。
 * 後端目前以 `warning_summary` 為逗號分隔碼字串，未來會擴充為結構化 issue 列表。
 */
function extractWarningSummary(
  data: RunSummaryResponse,
): ScoringWarningSummary | null {
  const w = data.warnings;
  if (!w) return null;
  const code = w.summaryCode;
  if (!code) return null;
  // 後端目前以逗號分隔字串保存（VARCHAR(100)）→ 拆分為多筆 issue
  const codes = code
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (codes.length === 0) return null;
  return {
    issueCount: codes.length,
    issues: codes.map((c) => ({
      type: c,
      // 若 skippedCases 內帶 columnName 等 metadata，可於未來擴充傳入
    })),
  };
}

function formatDuration(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms <= 0) return '—';
  const s = Math.floor(ms / 1000);
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (hh > 0) return `${hh} 時 ${mm} 分 ${ss} 秒`;
  if (mm > 0) return `${mm} 分 ${ss} 秒`;
  return `${ss} 秒`;
}

export function RunSummaryPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [searchParams] = useSearchParams();
  const runId = searchParams.get('runId') ?? '';

  const [data, setData] = useState<RunSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<'csv' | 'xlsx' | null>(null);

  useEffect(() => {
    if (!runId) {
      setError('缺少 runId 參數');
      setLoading(false);
      return;
    }
    let aborted = false;
    void (async () => {
      setLoading(true);
      try {
        const result = await getRunSummary(runId);
        if (!aborted) setData(result);
      } catch (err: unknown) {
        const e = err as { response?: { status?: number; data?: { message?: string } } };
        if (!aborted)
          setError(e?.response?.data?.message ?? '載入結果摘要失敗');
      } finally {
        if (!aborted) setLoading(false);
      }
    })();
    return () => {
      aborted = true;
    };
  }, [runId]);

  const handleExport = async (format: 'csv' | 'xlsx') => {
    setExporting(format);
    try {
      await downloadRunExport(runId, format);
      showToast(`${format.toUpperCase()} 已下載`, 'success');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      showToast(e?.response?.data?.message ?? '匯出失敗', 'error');
    } finally {
      setExporting(null);
    }
  };

  // 派生統計（對齊 prototype stat cards / 匯出計數 / NFR-005 警示）
  const stage4Count =
    data?.stage4Count ?? data?.totalCases ?? data?.totalAssigned ?? 0;
  const emplCount = data?.emplCount ?? 0;
  const avgPerEmpl = emplCount > 0 ? Math.round(stage4Count / emplCount) : null;
  const hasDeviationAlert = (data?.deptSummary ?? []).some((d) => d.alert);

  return (
    <AppLayout
      headerLeft={<RunPageBreadcrumb leaf="結果摘要" />}
    >
      <main className="flex-1 p-6 space-y-4">
        {loading && (
          <div className="p-12 text-center text-gray-400" data-testid="summary-loading">
            載入中...
          </div>
        )}

        {error && (
          <div
            data-testid="summary-error"
            className="rounded-lg p-3 bg-red-50 border border-red-200 flex items-start gap-2 text-sm"
          >
            <AlertTriangle className="w-4 h-4 text-danger mt-0.5 shrink-0" />
            <span className="text-red-800">{error}</span>
          </div>
        )}

        {data && (
          <>
            {/* 1. Run Info Bar — READ-ONLY + 月份 / 完成時間 / 耗時 / Stage1 / 覆蓋率 */}
            <section className="bg-white rounded-lg border border-gray-200 shadow-sm">
              <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-700">
                    <CheckCircle className="w-3.5 h-3.5" />
                    已完成
                  </span>
                  <span className="text-xs text-gray-500">Run ID</span>
                  <code className="font-mono text-xs font-semibold text-gray-700 bg-gray-100 px-2 py-0.5 rounded">
                    {data.runId.slice(0, 13)}
                  </code>
                  <span
                    data-testid="readonly-badge"
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-600 border border-gray-200"
                  >
                    <Lock className="w-3 h-3" />
                    READ-ONLY 不可變
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    data-testid="btn-snapshot"
                    onClick={() => navigate(`/assignment/snapshots?runId=${runId}`)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs text-gray-700 border border-gray-200 rounded-md hover:bg-gray-50"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    查看快照詳情
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate('/assignment/history')}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs text-gray-700 border border-gray-200 rounded-md hover:bg-gray-50"
                  >
                    <History className="w-3.5 h-3.5" />
                    執行歷史
                  </button>
                </div>
              </div>
              <div className="px-5 py-4 grid grid-cols-5 gap-4">
                <div>
                  <div className="text-xs text-gray-500 mb-1">分派作業月份</div>
                  <div className="text-sm font-semibold text-gray-800 font-mono">
                    {data.projectWorkym ?? data.ym ?? '—'}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">完成時間</div>
                  <div className="text-sm text-gray-700 font-mono">
                    {data.finishedAt
                      ? new Date(data.finishedAt).toLocaleString()
                      : '—'}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1 inline-flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    執行耗時
                  </div>
                  <div className="text-sm font-semibold text-primary tabular-nums">
                    {formatDuration(data.durationMs)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">Stage 1 原始名單</div>
                  <div className="text-sm font-semibold text-gray-800 tabular-nums">
                    {(data.stage1Count ?? 0).toLocaleString()} 筆
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1 inline-flex items-center gap-1">
                    <TrendingUp className="w-3 h-3" />
                    名單覆蓋率
                  </div>
                  <div className="text-sm font-semibold text-green-700 tabular-nums">
                    {data.coverageRate != null
                      ? (data.coverageRate * 100).toFixed(1) + '%'
                      : '—'}
                  </div>
                </div>
              </div>
            </section>

            {/* 2. 3 stat cards — 總分派客戶數 / 分派部門數 / 分派業務員數 */}
            <section className="grid grid-cols-3 gap-4">
              <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-medium text-gray-500">總分派客戶數</div>
                  <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                    <Users className="w-4 h-4 text-primary" />
                  </div>
                </div>
                <div
                  data-testid="total-assigned"
                  className="text-3xl font-bold text-gray-900 tabular-nums"
                >
                  {stage4Count.toLocaleString()}
                </div>
                <div className="text-xs text-gray-500 mt-1">Stage 4 最終分派數</div>
              </div>
              <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-medium text-gray-500">分派部門數</div>
                  <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center">
                    <Building2 className="w-4 h-4 text-purple-600" />
                  </div>
                </div>
                <div
                  data-testid="dept-count"
                  className="text-3xl font-bold text-gray-900 tabular-nums"
                >
                  {data.deptSummary?.length ?? data.deptBreakdown?.length ?? 0}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {(data.deptSummary ?? []).slice(0, 5).map((d) => d.deptId).join(' / ') || '—'}
                </div>
              </div>
              <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-medium text-gray-500">分派業務員數</div>
                  <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
                    <UserCheck className="w-4 h-4 text-warning" />
                  </div>
                </div>
                <div
                  data-testid="empl-count"
                  className="text-3xl font-bold text-gray-900 tabular-nums"
                >
                  {emplCount.toLocaleString()}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {avgPerEmpl != null
                    ? `平均每人 ${avgPerEmpl.toLocaleString()} 案`
                    : '尚無人員分派資料'}
                </div>
              </div>
            </section>

            {/* 3. F063 警示橫幅 — 計分完整性 / BR-12 SKIPPED */}
            <ScoringWarningBanner
              warningSummary={extractWarningSummary(data)}
              runStatus={(data as { status?: 'completed' | 'failed' }).status ?? 'completed'}
            />

            {/* 3b. skipped_cases.lists（5b ITP-006 / IT-M01-017） */}
            {(() => {
              const skippedLists =
                (data.warnings?.skippedCases as
                  | { lists?: Array<{ listNo: string; listNm?: string; reason?: string }> }
                  | null
                  | undefined)?.lists;
              if (!skippedLists || skippedLists.length === 0) return null;
              return (
                <section
                  className="bg-white rounded-xl border border-amber-200 overflow-hidden"
                  data-testid="skipped-lists-section"
                >
                  <div className="px-5 py-3 border-b border-amber-200 bg-amber-50/50 flex items-center gap-2">
                    <Filter className="w-4 h-4 text-amber-700" />
                    <h3 className="text-sm font-semibold text-amber-900">
                      Stage 1 跳過名單
                    </h3>
                    <span className="text-xs text-amber-700">
                      （{skippedLists.length} 份名單因條件為空或舊格式未轉換而跳過）
                    </span>
                  </div>
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                      <tr>
                        <th className="text-left px-5 py-2 font-medium w-[20%]">LIST_NO</th>
                        <th className="text-left px-5 py-2 font-medium">名單名稱</th>
                        <th className="text-left px-5 py-2 font-medium w-[28%]">跳過原因</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {skippedLists.map((l) => (
                        <tr key={l.listNo}>
                          <td className="px-5 py-2 font-mono text-primary">{l.listNo}</td>
                          <td className="px-5 py-2 text-gray-900">{l.listNm ?? '—'}</td>
                          <td className="px-5 py-2 text-xs text-amber-700 font-mono">
                            {l.reason ?? 'UNKNOWN'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              );
            })()}

            {/* 4. 部門分配偏差 chart（取代 deptBreakdown table） */}
            {data.deptSummary && data.deptSummary.length > 0 && (
              <DeptDeviationChart rows={data.deptSummary} />
            )}

            {/* 5. 等級分佈：TIER_LEVEL 分佈 + CARD_LEVEL 等級佔比（prototype L263-292） */}
            {((data.tierDistribution && data.tierDistribution.length > 0) ||
              (data.levelDistribution && data.levelDistribution.length > 0)) && (
              <div className="grid grid-cols-2 gap-4">
                <TierLevelChart rows={data.tierDistribution ?? []} />
                <CardLevelDonut rows={data.levelDistribution ?? []} />
              </div>
            )}

            {/* 6. 匯出區（F064 streaming xlsx + csv） — prototype L294-344 */}
            <section className="bg-white rounded-lg border border-gray-200 shadow-sm">
              <div className="px-5 py-4 border-b border-gray-200 flex items-center gap-2">
                <Download className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-semibold text-gray-800">
                  匯出分派結果（F064）
                </h3>
              </div>
              <div className="px-5 py-5">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex-1 min-w-[280px]">
                    <p className="text-sm text-gray-700 font-medium mb-1">
                      將分派結果匯出為檔案
                    </p>
                    <p className="text-xs text-gray-500 leading-relaxed">
                      包含{' '}
                      <strong>{stage4Count.toLocaleString()}</strong>{' '}
                      筆分派紀錄，對齊 legacy 分派名單 23 欄明細（分處 / 案號 / 指派日 /
                      名單代號 / 名單名稱 / 進件日 / CR_ID / CR_NM / 是否分配CR / TIER /
                      部門代號 / 部門名稱 / 員編 / 姓名 / 職級 / 專案類別 / 專案名稱 /
                      逾期天數 / 客戶利率 / STA_CODE / 案件狀態 / 廠牌名稱 / 名單週期月數）。
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="primary"
                      data-testid="btn-export-xlsx"
                      loading={exporting === 'xlsx'}
                      loadingText="匯出中..."
                      disabled={exporting !== null}
                      onClick={() => void handleExport('xlsx')}
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <FileSpreadsheet className="w-3.5 h-3.5" />
                        匯出 Excel (streaming)
                      </span>
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      data-testid="btn-export-csv"
                      loading={exporting === 'csv'}
                      loadingText="匯出中..."
                      disabled={exporting !== null}
                      onClick={() => void handleExport('csv')}
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5" />
                        匯出 CSV
                      </span>
                    </Button>
                  </div>
                </div>
              </div>
            </section>

            {/* 7. NFR-005 偏差警示 footer note（任一部門偏差 > 3% 時顯示） */}
            {hasDeviationAlert && (
              <div
                data-testid="nfr005-alert-note"
                className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-gray-700"
              >
                <AlertCircle className="w-4 h-4 text-danger mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold text-danger mb-0.5">
                    NFR-005 警示：偏差超過閾值
                  </p>
                  <p>
                    本次月跑存在偏差超過 3% 的部門。建議檢查 ob_dept_pct 設定，或前往 F067
                    比對近月結果確認分派演算法表現。
                  </p>
                </div>
              </div>
            )}

            {/* Legacy dept breakdown table（舊 response shape 向後相容） */}
            {data.deptBreakdown && data.deptBreakdown.length > 0 && (
              <section
                className="bg-white rounded-xl border border-gray-200 overflow-hidden"
                data-testid="dept-breakdown"
              >
                <div className="px-5 py-3 border-b border-gray-200 flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-blue-800" />
                  <h3 className="text-sm font-semibold text-gray-800">部門分派分布</h3>
                  <span className="text-xs text-gray-400">
                    （{data.deptBreakdown.length} 部門）
                  </span>
                </div>
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                    <tr>
                      <th className="text-left px-5 py-2 font-medium w-[20%]">部門</th>
                      <th className="text-left px-5 py-2 font-medium">部門名稱</th>
                      <th className="text-right px-5 py-2 font-medium w-[20%]">分派數</th>
                      <th className="text-right px-5 py-2 font-medium w-[15%]">比例</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.deptBreakdown.map((d) => (
                      <tr key={d.deptCode}>
                        <td className="px-5 py-2 font-mono text-primary">{d.deptCode}</td>
                        <td className="px-5 py-2 text-gray-900">{d.deptName ?? '—'}</td>
                        <td className="px-5 py-2 text-right font-mono">
                          {d.assignedCount.toLocaleString()}
                        </td>
                        <td className="px-5 py-2 text-right font-mono text-xs text-gray-600">
                          {formatPct(d.ratio)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            {/* Legacy personnel breakdown table（舊 response shape 向後相容） */}
            {data.personnelBreakdown && data.personnelBreakdown.length > 0 && (
              <section
                className="bg-white rounded-xl border border-gray-200 overflow-hidden"
                data-testid="personnel-breakdown"
              >
                <div className="px-5 py-3 border-b border-gray-200 flex items-center gap-2">
                  <Users className="w-4 h-4 text-cyan-800" />
                  <h3 className="text-sm font-semibold text-gray-800">個別業務分派分布</h3>
                  <span className="text-xs text-gray-400">
                    （{data.personnelBreakdown.length} 員工）
                  </span>
                </div>
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                    <tr>
                      <th className="text-left px-5 py-2 font-medium w-[20%]">員工編號</th>
                      <th className="text-left px-5 py-2 font-medium">員工姓名</th>
                      <th className="text-right px-5 py-2 font-medium w-[20%]">分派數</th>
                      <th className="text-right px-5 py-2 font-medium w-[15%]">比例</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.personnelBreakdown.map((e) => (
                      <tr key={e.empId}>
                        <td className="px-5 py-2 font-mono text-primary">{e.empId}</td>
                        <td className="px-5 py-2 text-gray-900">{e.empName ?? '—'}</td>
                        <td className="px-5 py-2 text-right font-mono">
                          {e.assignedCount.toLocaleString()}
                        </td>
                        <td className="px-5 py-2 text-right font-mono text-xs text-gray-600">
                          {formatPct(e.ratio)}
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
