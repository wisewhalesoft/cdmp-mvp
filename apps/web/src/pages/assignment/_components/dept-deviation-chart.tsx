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
 * 警示閾值：3 個百分點（NFR-005）。
 * ⚠️ 後端 configRatio / actualRatio / deviation 皆為 **0–100 百分比尺度**（F063 §5.1 契約、
 *    後端測試 TC-M05-SUMMARY 鎖定 configRatio:50 / actualRatio:60 / deviation:10）。閾值同尺度。
 */
const ALERT_THRESHOLD = 3;

/**
 * 後端值已是 0–100 百分比 → 直接格式化、**不可再 ×100**（否則 >1000% 顯示 bug）。
 * 對齊 prototype 33-run-summary.html renderDeptChart 之 `toFixed(1)`。
 */
function pct(n: number): string {
  return n.toFixed(1) + '%';
}

/** 偏差色階（對齊 prototype deviationStyle，0–100 尺度）：≤1 綠 / 1~3 橙 / >3 紅。 */
function deviationColor(deviation: number, alert: boolean): string {
  if (alert || Math.abs(deviation) > ALERT_THRESHOLD) return 'bg-red-500';
  if (Math.abs(deviation) <= 1) return 'bg-green-500';
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
            警示 &gt; {ALERT_THRESHOLD}% (NFR-005)
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
                {/* 部門名稱為主、代號為輔（代號對 user 無意義）；查無名稱時退回顯示代號。 */}
                <span className="inline-flex items-baseline gap-1.5">
                  <span className="font-semibold text-gray-800">
                    {r.deptName ?? r.deptId}
                  </span>
                  {r.deptName && (
                    <span className="font-mono text-[10px] text-gray-400">
                      {r.deptId}
                    </span>
                  )}
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
                        : Math.abs(r.deviation) > 1
                          ? 'text-amber-700 font-semibold'
                          : 'text-gray-500'
                    }
                  >
                    {r.alert && <AlertTriangle className="w-3 h-3" />}
                    偏差 {r.deviation >= 0 ? '+' : ''}
                    {pct(r.deviation)}
                  </span>
                  {/* 實際分派筆數（對齊 prototype renderDeptChart 標題列「(X 筆)」） */}
                  <span className="text-gray-500 tabular-nums font-mono">
                    （{r.actualCount.toLocaleString()} 筆）
                  </span>
                </span>
              </div>
              <div className="space-y-1">
                {/* config bar（淺色） */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-400 w-12">設定</span>
                  <div className="flex-1 h-2 bg-gray-100 rounded">
                    <div
                      className="h-2 bg-blue-400 rounded"
                      style={{ width: `${configPctWidth}%` }}
                    />
                  </div>
                </div>
                {/* actual bar（依偏差變色） */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-400 w-12">實際</span>
                  <div className="flex-1 h-2 bg-gray-100 rounded">
                    <div
                      className={`h-2 rounded ${deviationColor(r.deviation, r.alert)}`}
                      style={{ width: `${actualPctWidth}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
