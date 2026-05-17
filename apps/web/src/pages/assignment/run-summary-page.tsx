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
} from 'lucide-react';
import { AppLayout } from '@/components/layout/app-layout';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import {
  getRunSummary,
  downloadRunExport,
  type RunSummaryResponse,
} from '@/api/assignment-run';

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
            {/* Header card */}
            <section className="bg-white rounded-xl border border-gray-200 p-6 flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center">
                <FileBarChart className="w-6 h-6 text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-xs text-gray-500">月份</p>
                <p className="text-2xl font-mono font-semibold text-gray-900">{data.ym}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">總分派數</p>
                <p
                  data-testid="total-assigned"
                  className="text-3xl font-bold text-primary"
                >
                  {data.totalAssigned.toLocaleString()}
                </p>
                <p className="text-[11px] text-gray-400 text-right">筆</p>
              </div>
              <div className="flex flex-col gap-2 ml-4">
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
                    <Download className="w-3.5 h-3.5" />
                    CSV
                  </span>
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  data-testid="btn-export-xlsx"
                  loading={exporting === 'xlsx'}
                  loadingText="匯出中..."
                  disabled={exporting !== null}
                  onClick={() => void handleExport('xlsx')}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Download className="w-3.5 h-3.5" />
                    XLSX
                  </span>
                </Button>
                <button
                  type="button"
                  data-testid="btn-snapshot"
                  onClick={() => navigate(`/assignment/snapshots?runId=${runId}`)}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs text-primary border border-blue-200 rounded-md hover:bg-blue-50"
                >
                  <Camera className="w-3.5 h-3.5" />
                  快照詳情
                </button>
              </div>
            </section>

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
