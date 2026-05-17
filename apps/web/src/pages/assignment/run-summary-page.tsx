import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  FileBarChart,
  Download,
  Camera,
  Users,
  Building2,
  AlertTriangle,
  Lock,
  Clock,
  TrendingUp,
  FileSpreadsheet,
  FileText,
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

/**
 * F063 — 月跑結果摘要頁
 *
 * 對應 prototype: /prototypes/33-run-summary.html
 *
 * 範圍：
 *   - 總分派數
 *   - 部門 breakdown 表（deptCode / deptName / 分派數 / ratio%）
 *   - 個別 breakdown 表（empId / empName / 分派數 / ratio%）
 *   - 匯出 CSV / XLSX (F064)
 *   - 跳轉至快照詳情頁
 *
 * RBAC: DirectorOrSectionChiefRoute（處長限轄區 — backend filter）
 */

function formatPct(n: number | undefined): string {
  if (n === undefined || Number.isNaN(n)) return '—';
  return `${(n * 100).toFixed(2)}%`;
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
          <h1 className="text-base font-semibold text-gray-800">結果摘要</h1>
          {data && (
            <code className="font-mono text-xs text-primary px-2 py-0.5 bg-blue-50 rounded">
              {data.runId}
            </code>
          )}
        </div>
      }
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
            {/* Run Info Bar — READ-ONLY + 月份 / 完成時間 / 耗時 / Stage1 / 覆蓋率 */}
            <section className="bg-white rounded-lg border border-gray-200 shadow-sm">
              <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-700">
                    <FileBarChart className="w-3.5 h-3.5" />
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
                    快照詳情
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate('/assignment/history')}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs text-gray-700 border border-gray-200 rounded-md hover:bg-gray-50"
                  >
                    <FileBarChart className="w-3.5 h-3.5" />
                    執行歷史
                  </button>
                </div>
              </div>
              <div className="px-5 py-4 grid grid-cols-5 gap-4">
                <div>
                  <div className="text-xs text-gray-500 mb-1">作業年月</div>
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

            {/* 3 stat cards */}
            <section className="grid grid-cols-3 gap-4">
              <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-medium text-gray-500">總分派客戶數</div>
                  <Users className="w-4 h-4 text-primary" />
                </div>
                <div
                  data-testid="total-assigned"
                  className="text-3xl font-bold text-gray-900 tabular-nums"
                >
                  {(data.stage4Count ?? data.totalCases ?? data.totalAssigned ?? 0).toLocaleString()}
                </div>
                <div className="text-xs text-gray-500 mt-1">Stage 4 最終分派數</div>
              </div>
              <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-medium text-gray-500">分派部門數</div>
                  <Building2 className="w-4 h-4 text-purple-600" />
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
                  <div className="text-xs font-medium text-gray-500">CARD_LEVEL 種類</div>
                  <FileBarChart className="w-4 h-4 text-amber-600" />
                </div>
                <div
                  data-testid="level-count"
                  className="text-3xl font-bold text-gray-900 tabular-nums"
                >
                  {data.levelDistribution?.length ?? 0}
                </div>
                <div className="text-xs text-gray-500 mt-1">分派結果之等級數</div>
              </div>
            </section>

            {/* 匯出區（streaming xlsx + csv） */}
            <section className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex-1 min-w-[260px]">
                  <p className="text-sm font-semibold text-gray-800 mb-1 inline-flex items-center gap-1.5">
                    <Download className="w-4 h-4 text-primary" />
                    匯出分派結果（F064）
                  </p>
                  <p className="text-xs text-gray-500 leading-relaxed">
                    包含{' '}
                    <strong>
                      {(data.stage4Count ?? data.totalAssigned ?? 0).toLocaleString()}
                    </strong>{' '}
                    筆分派紀錄；欄位含 list_no / appl_no / card_level / tier_level / dept_id / emplid 等。
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
            </section>

            {/* Phase 3 P2-3 部門偏差 chart（取代 deptBreakdown table） */}
            {data.deptSummary && data.deptSummary.length > 0 && (
              <DeptDeviationChart rows={data.deptSummary} />
            )}

            {/* Phase 3 P2-3 CARD_LEVEL 圓餅 + TIER placeholder */}
            {data.levelDistribution && data.levelDistribution.length > 0 && (
              <CardLevelDonut rows={data.levelDistribution} />
            )}

            {/* Dept breakdown */}
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

            {/* Personnel breakdown */}
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
