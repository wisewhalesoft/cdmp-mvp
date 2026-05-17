import { BarChart3 } from 'lucide-react';

/**
 * F049 + AD-E07-8：每日預估筆數 bar chart（純 div）
 *
 * 對應 prototype 30-stage0-estimate.html L304-318
 *
 * 演算法（pure function `computeAdE07Distribution`）：
 *   base = FLOOR(total / workingDays)
 *   rem = total mod workingDays
 *   per_date = base
 *   最後 rem 個工作日: per_date = base + 1
 *
 * 不採用 recharts — 直接用 div height percentage 渲染，簡潔且不依賴 chart lib
 * （與 prototype 對齊；recharts 用於更複雜的 chart 場景如 run-summary chart）。
 */

export interface Stage0DayInput {
  date: string;
  weekday: string;
  isWorkday: boolean;
}

export interface Stage0Row extends Stage0DayInput {
  estimate: number;
  /** AD-E07-8 餘數補上的日子（顯示為深色） */
  isBonus: boolean;
  /** 累積筆數 */
  cumulative: number;
}

export function computeAdE07Distribution(
  total: number,
  days: Stage0DayInput[],
): Stage0Row[] {
  const workdayIdxs: number[] = days.reduce<number[]>((acc, d, idx) => {
    if (d.isWorkday) acc.push(idx);
    return acc;
  }, []);
  const workingDays = workdayIdxs.length;

  if (workingDays === 0 || total <= 0) {
    return days.map((d) => ({
      ...d,
      estimate: 0,
      isBonus: false,
      cumulative: 0,
    }));
  }

  const base = Math.floor(total / workingDays);
  const rem = total - base * workingDays;
  const bonusFromIdx = workingDays - rem; // 第 bonusFromIdx 個工作日開始 +1

  let cumulative = 0;
  return days.map((d, idx) => {
    if (!d.isWorkday) {
      return { ...d, estimate: 0, isBonus: false, cumulative };
    }
    const workdayRank = workdayIdxs.indexOf(idx); // 第幾個工作日
    const isBonus = workdayRank >= bonusFromIdx;
    const estimate = isBonus ? base + 1 : base;
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
          return (
            <div
              key={r.date}
              data-testid={`bar-${r.date}`}
              className="flex flex-col items-center"
            >
              <div className="h-32 w-full flex items-end justify-center">
                <div
                  className={`w-6 rounded-t ${barColor} transition-all`}
                  style={{ height: `${Math.max(heightPct, isWorkday ? 8 : 4)}%` }}
                  title={`${r.date} ${r.weekday}：${r.estimate}`}
                />
              </div>
              <div className="mt-1 text-[10px] text-gray-500 tabular-nums">
                {r.date.slice(5)}
              </div>
              <div className="text-[10px] text-gray-400">{r.weekday}</div>
              <div className="text-[11px] font-mono text-gray-700 mt-0.5">
                {r.estimate}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
