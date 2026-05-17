import { BarChart3, AlertTriangle } from 'lucide-react';
import type { SummaryDeptRow } from '@/api/assignment-run';

/**
 * F063 部門分配偏差 chart
 *
 * 對應 prototype 33-run-summary.html L247-262
 *
 * 視覺：每個部門 1 row，含
 *   - 設定比例 bar（藍）
 *   - 實際比例 bar（綠 / 橙 / 紅 依 deviation）
 *   - 偏差顯示 + alert badge（abs(deviation) > 3% → 紅色）
 */

export interface DeptDeviationChartProps {
  rows: SummaryDeptRow[];
}

/**
 * 警示閾值：3%（NFR-005）
 */
const ALERT_THRESHOLD = 0.03;

function pct(n: number): string {
  return (n * 100).toFixed(2) + '%';
}

function deviationColor(deviation: number, alert: boolean): string {
  if (alert) return 'bg-red-500';
  if (Math.abs(deviation) <= 0.01) return 'bg-green-500';
  return 'bg-amber-500';
}

export function DeptDeviationChart({ rows }: DeptDeviationChartProps) {
  if (rows.length === 0) {
    return (
      <div
        data-testid="dept-deviation-empty"
        className="bg-white rounded-lg border border-gray-200 p-6 text-center text-sm text-gray-400"
      >
        無部門分配資料
      </div>
    );
  }

  // bar 寬度標準化：取最大 ratio（config / actual）為 100% baseline
  const maxRatio = rows.reduce(
    (m, r) => Math.max(m, r.configRatio, r.actualRatio),
    0.01,
  );

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
      <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold text-gray-800">部門分配偏差</h3>
          <span className="text-xs text-gray-400">
            設定比例 vs 實際比例
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="inline-flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-green-500" />
            正常 ≤ 1%
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-amber-500" />
            偏差 1~3%
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-red-500" />
            警示 &gt; {Math.round(ALERT_THRESHOLD * 100)}% (NFR-005)
          </span>
        </div>
      </div>
      <div className="p-5 space-y-4">
        {rows.map((r) => {
          const configPctWidth = (r.configRatio / maxRatio) * 100;
          const actualPctWidth = (r.actualRatio / maxRatio) * 100;
          return (
            <div
              key={r.deptId}
              data-testid={`dept-deviation-${r.deptId}`}
              data-alert={r.alert ? 'true' : 'false'}
              className={`p-3 rounded-lg border ${
                r.alert
                  ? 'bg-red-50/60 border-red-200'
                  : 'bg-gray-50/40 border-gray-200'
              }`}
            >
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="font-mono font-semibold text-gray-800">
                  {r.deptId}
                </span>
                <span className="inline-flex items-center gap-2 text-gray-600">
                  <span>
                    設定 <strong>{pct(r.configRatio)}</strong>
                  </span>
                  <span>
                    實際 <strong>{pct(r.actualRatio)}</strong>
                  </span>
                  <span
                    className={
                      r.alert
                        ? 'text-red-700 font-semibold inline-flex items-center gap-0.5'
                        : Math.abs(r.deviation) > 0.01
                          ? 'text-amber-700 font-semibold'
                          : 'text-gray-500'
                    }
                  >
                    {r.alert && <AlertTriangle className="w-3 h-3" />}
                    偏差 {r.deviation >= 0 ? '+' : ''}
                    {pct(r.deviation)}
                  </span>
                </span>
              </div>
              <div className="space-y-1">
                {/* config bar */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-400 w-12">設定</span>
                  <div className="flex-1 h-2 bg-gray-100 rounded">
                    <div
                      className="h-2 bg-blue-400 rounded"
                      style={{ width: `${configPctWidth}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-gray-500 font-mono w-14 text-right">
                    {r.actualCount.toLocaleString()} 筆
                  </span>
                </div>
                {/* actual bar */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-400 w-12">實際</span>
                  <div className="flex-1 h-2 bg-gray-100 rounded">
                    <div
                      className={`h-2 rounded ${deviationColor(r.deviation, r.alert)}`}
                      style={{ width: `${actualPctWidth}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-gray-500 w-14 text-right">
                    {/* spacer keep alignment */}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
