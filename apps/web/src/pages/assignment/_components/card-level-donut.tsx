import { PieChart } from 'lucide-react';
import type { SummaryLevelRow } from '@/api/assignment-run';

/**
 * F063 CARD_LEVEL 等級佔比 donut chart
 *
 * 對應 prototype 33-run-summary.html L278-293
 *
 * 用 conic-gradient + legend 實作 donut，不引入 chart 套件依賴。
 * TIER_LEVEL 分佈由 sibling 元件 TierLevelChart 呈現（並列於 grid-cols-2）。
 */

const COLORS = [
  '#2563EB', // 藍
  '#22C55E', // 綠
  '#F59E0B', // 橙
  '#8B5CF6', // 紫
  '#EF4444', // 紅
  '#06B6D4', // 青
  '#84CC16', // 萊姆
];

export interface CardLevelDonutProps {
  rows: SummaryLevelRow[];
}

export function CardLevelDonut({ rows }: CardLevelDonutProps) {
  if (rows.length === 0) {
    return (
      <div
        data-testid="card-level-empty"
        className="bg-white rounded-lg border border-gray-200 p-6 text-center text-sm text-gray-400"
      >
        無 CARD_LEVEL 分佈資料
      </div>
    );
  }

  const totalCount = rows.reduce((s, r) => s + r.count, 0);

  // conic-gradient stop accumulator
  let acc = 0;
  const stops = rows
    .map((r, i) => {
      const start = acc * 360;
      acc += r.ratio;
      const end = acc * 360;
      const color = COLORS[i % COLORS.length];
      return `${color} ${start.toFixed(2)}deg ${end.toFixed(2)}deg`;
    })
    .join(', ');

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
      <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <PieChart className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold text-gray-800">
            CARD_LEVEL 等級佔比
          </h3>
        </div>
      </div>
      <div className="p-5 grid grid-cols-2 gap-5">
        <div className="flex items-center justify-center">
          <div
            className="relative"
            style={{
              width: 160,
              height: 160,
              borderRadius: '50%',
              background: `conic-gradient(${stops})`,
            }}
          >
            <div
              className="absolute inset-0 m-auto bg-white rounded-full flex flex-col items-center justify-center"
              style={{ width: 96, height: 96 }}
            >
              <div className="text-[10px] text-gray-500">總計</div>
              <div
                data-testid="card-level-total"
                className="text-lg font-bold text-gray-900 tabular-nums"
              >
                {totalCount.toLocaleString()}
              </div>
            </div>
          </div>
        </div>
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div
              key={r.cardLevel}
              data-testid={`card-legend-${r.cardLevel}`}
              className="flex items-center gap-2 text-xs"
            >
              <span
                className="w-3 h-3 rounded-sm shrink-0"
                style={{ background: COLORS[i % COLORS.length] }}
              />
              <span className="font-mono font-semibold text-gray-700 w-12">
                {r.cardLevel}
              </span>
              <span className="text-gray-600 tabular-nums flex-1">
                {r.count.toLocaleString()} 筆
              </span>
              <span className="font-mono text-primary tabular-nums">
                {(r.ratio * 100).toFixed(2)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
