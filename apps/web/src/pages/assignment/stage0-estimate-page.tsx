import { useEffect, useState } from 'react';
import { Calculator, RefreshCw, AlertTriangle } from 'lucide-react';
import { AppLayout } from '@/components/layout/app-layout';
import { Button } from '@/components/ui/button';
import { MonthPicker } from '@/components/e07/MonthPicker';
import { getDailyEstimate, type DailyEstimateResponse } from '@/api/assignment-run';

/**
 * F049 — Stage 0 每日試算頁
 *
 * 對應 prototype: /prototypes/30-stage0-estimate.html
 *
 * RBAC: DirectorRoute（M03 director-only per F002 §4.6.2）
 *
 * MVP：MonthPicker + 試算結果摘要卡 + 重新試算按鈕。
 * 詳細 details 區塊（依 backend 回傳 details 結構動態渲染）為 P2 補完。
 */

function toYYYYMM(yyyymm: string): string {
  return `${yyyymm.slice(0, 4)}-${yyyymm.slice(4, 6)}`;
}
function toYYYYMMRaw(yyyyMm: string): string {
  return yyyyMm.replace('-', '');
}
function currentYmDisplay(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function Stage0EstimatePage() {
  const [ym, setYm] = useState(currentYmDisplay());
  const [data, setData] = useState<DailyEstimateResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEstimate = async (selectedYm: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await getDailyEstimate(toYYYYMMRaw(selectedYm));
      setData(result);
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: { message?: string } } };
      setError(e?.response?.data?.message ?? '試算失敗，請稍後再試');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchEstimate(ym);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ym]);

  return (
    <AppLayout
      title="Stage 0 試算"
      actions={<MonthPicker value={ym} onChange={setYm} />}
    >
      <main className="flex-1 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            月跑前置試算：依當月各 LIST_NO 條件試算可分派客戶總數，協助於正式月跑前估算工作量。
          </p>
          <Button
            type="button"
            variant="secondary"
            onClick={() => void fetchEstimate(ym)}
            disabled={loading}
          >
            <span className="inline-flex items-center gap-1.5">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              重新試算
            </span>
          </Button>
        </div>

        {error && (
          <div
            data-testid="stage0-error"
            className="rounded-lg p-3 bg-red-50 border border-red-200 flex items-start gap-2 text-sm"
          >
            <AlertTriangle className="w-4 h-4 text-danger mt-0.5 shrink-0" />
            <span className="text-red-800">{error}</span>
          </div>
        )}

        {loading && !data && (
          <div className="p-12 text-center text-gray-400" data-testid="stage0-loading">
            試算中...
          </div>
        )}

        {data && (
          <section
            className="bg-white rounded-xl border border-gray-200 p-6 space-y-4"
            data-testid="stage0-result"
          >
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center">
                <Calculator className="w-6 h-6 text-blue-800" />
              </div>
              <div>
                <p className="text-xs text-gray-500">月份</p>
                <p className="text-2xl font-semibold text-gray-900 font-mono">
                  {data.ym ? toYYYYMM(data.ym) : '—'}
                </p>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  工作天數：{data.workingDays ?? 0} 天
                </p>
              </div>
              <div className="ml-auto text-right">
                <p className="text-xs text-gray-500">預估月總分派量</p>
                <p
                  data-testid="stage0-total-count"
                  className="text-3xl font-bold text-primary"
                >
                  {(data.totalEstimate ?? 0).toLocaleString()}
                </p>
                <p className="text-[11px] text-gray-400">筆</p>
              </div>
            </div>

            {data.dailyEstimates && data.dailyEstimates.length > 0 && (
              <div
                className="rounded-md bg-gray-50 border border-gray-200 p-3 max-h-72 overflow-y-auto"
                data-testid="stage0-daily-table"
              >
                <p className="text-xs text-gray-500 mb-2">每日試算明細</p>
                <table className="w-full text-xs font-mono">
                  <thead className="text-gray-500">
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-1.5 font-medium">日期</th>
                      <th className="text-left py-1.5 font-medium">星期</th>
                      <th className="text-right py-1.5 font-medium">預估量</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.dailyEstimates.map((r) => (
                      <tr key={r.date} className="border-b border-gray-100">
                        <td className="py-1 text-gray-700">{r.date}</td>
                        <td className="py-1 text-gray-600">{r.weekday}</td>
                        <td className="py-1 text-right text-gray-900">
                          {(r.estimate ?? 0).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </main>
    </AppLayout>
  );
}
