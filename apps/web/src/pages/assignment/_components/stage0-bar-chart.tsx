import { BarChart3 } from 'lucide-react';
import type { SkipReason } from '@/api/assignment-run';

/**
 * F049 v1.3 + AD-E07-8：每日預估筆數 bar chart（純 div）
 *
 * 對應 prototype 30-stage0-estimate.html `recompute()` chart innerHTML（L420-435）。
 *
 * 演算法分工（Design A，§13.3）：
 *   - 後端 daily-estimate 回傳每日 `ratioPerMille`（千分位 ratio，calendar 相依）
 *   - 前端以 `estimate = round(ratioPerMille / 1000 × total)` 計算件數（total 相依）
 *   - `isBonus` = 該工作日 ratioPerMille > baseRatio（即餘數補 +1 的日子）
 *
 * 不採用 recharts — 直接用 div height percentage 渲染，對齊 prototype。
 */

export interface Stage0DayInput {
  date: string;
  weekday: string;
  isWorkday: boolean;
  /** 後端千分位 ratio（工作日=baseRatio 或 baseRatio+1；非工作日=0） */
  ratioPerMille: number;
  /** 後端跳過原因（工作日為 null） */
  skipReason?: SkipReason | null;
}

export interface Stage0Row extends Stage0DayInput {
  estimate: number;
  /** AD-E07-8 餘數補上的日子（顯示為深色） */
  isBonus: boolean;
  /** 累積筆數 */
  cumulative: number;
}

/**
 * 消費後端 ratioPerMille + 前端 total → 每日件數（Design A）。
 *
 * @param total 選取名單之 per-list COUNT（前端輸入）
 * @param days  後端 dailyEstimates（含 ratioPerMille / isWorkday）
 */
export function computeAdE07Distribution(
  total: number,
  days: Stage0DayInput[],
): Stage0Row[] {
  // baseRatio = 工作日中最小的 ratioPerMille（餘數補日 = baseRatio+1）
  const workdayRatios = days
    .filter((d) => d.isWorkday)
    .map((d) => d.ratioPerMille);
  const baseRatio = workdayRatios.length > 0 ? Math.min(...workdayRatios) : 0;

  let cumulative = 0;
  return days.map((d) => {
    if (!d.isWorkday || total <= 0) {
      return { ...d, estimate: 0, isBonus: false, cumulative };
    }
    const estimate = Math.round((d.ratioPerMille / 1000) * total);
    const isBonus = d.ratioPerMille > baseRatio;
    cumulative += estimate;
    return { ...d, estimate, isBonus, cumulative };
  });
}

export interface Stage0BarChartProps {
  rows: Stage0Row[];
}

export function Stage0BarChart({ rows }: Stage0BarChartProps) {
  if (rows.length === 0) {
    return (
      <div
        data-testid="bar-chart-empty"
        className="bg-white rounded-lg border border-gray-200 p-6 text-center text-sm text-gray-400"
      >
        無試算資料
      </div>
    );
  }

  const max = rows.reduce((m, r) => Math.max(m, r.estimate), 0) || 1;

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
      <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-primary" />
          每日預估筆數
        </h3>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span className="inline-flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded bg-blue-500" />
            工作日 (base)
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded bg-blue-700" />
            工作日 (base+1)
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded bg-gray-300" />
            跳過
          </span>
        </div>
      </div>
      <div className="p-5 grid grid-cols-7 gap-2 auto-rows-fr">
        {rows.map((r) => {
          const heightPct = (r.estimate / max) * 100;
          const isWorkday = r.isWorkday;
          const barColor = !isWorkday
            ? 'bg-gray-300'
            : r.isBonus
              ? 'bg-blue-700'
              : 'bg-blue-500';
          // 跳過日固定低高度灰 bar（對齊 prototype recompute() heightPct=12）
          const barHeight = isWorkday ? Math.max(heightPct, 8) : 12;
          return (
            <div
              key={r.date}
              data-testid={`bar-${r.date}`}
              className="flex flex-col items-center gap-1.5"
            >
              {/* 件數標籤（在上，對齊 prototype 順序：件數 → bar → 日期 → 星期） */}
              <div
                className={`text-[10px] font-mono ${
                  isWorkday ? 'text-gray-700 font-semibold' : 'text-gray-300'
                }`}
              >
                {isWorkday ? r.estimate : '—'}
              </div>
              <div className="h-20 w-full flex items-end">
                <div
                  className={`w-full rounded-t ${barColor} transition-all`}
                  style={{ height: `${barHeight}%` }}
                  title={`${r.date} ${r.weekday}：${
                    isWorkday ? `${r.estimate}件` : (r.skipReason ?? '跳過')
                  }`}
                />
              </div>
              <div className="text-[10px] font-mono text-gray-500 tabular-nums">
                {r.date.slice(8)}
              </div>
              <div className="text-[10px] text-gray-400">{r.weekday}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
