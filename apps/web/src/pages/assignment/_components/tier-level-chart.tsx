import { Layers } from 'lucide-react';
import type { SummaryTierRow } from '@/api/assignment-run';

/**
 * F063 TIER_LEVEL 分佈 bar chart
 *
 * 對應 prototype 33-run-summary.html L263-275（「TIER_LEVEL 分佈」/ renderTierChart）。
 * 資料來源：getSummary.tierDistribution（tier_level 由 F100/F101 月跑計分 score→card_level→tier 寫入）。
 * 與 CARD_LEVEL donut 並列於 grid-cols-2（取代舊「待 Track D」placeholder）。
 */

const COLORS = [
  '#2563EB', // 藍
  '#06B6D4', // 青
  '#14B8A6', // 藍綠
  '#22C55E', // 綠
  '#84CC16', // 萊姆
  '#F59E0B', // 橙
  '#F97316', // 深橙
  '#8B5CF6', // 紫
  '#EC4899', // 桃
  '#EF4444', // 紅
];

export interface TierLevelChartProps {
  rows: SummaryTierRow[];
}

export function TierLevelChart({ rows }: TierLevelChartProps) {
  const total = rows.reduce((s, r) => s + r.count, 0);
  const max = rows.reduce((m, r) => Math.max(m, r.count), 0);

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
      <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold text-gray-800">TIER_LEVEL 分佈</h3>
        </div>
        <span className="text-xs text-gray-400">fn_calc_tier_level 計算結果</span>
      </div>
      {rows.length === 0 ? (
        <div
          data-testid="tier-level-empty"
          className="px-5 py-8 text-center text-sm text-gray-400"
        >
          無 TIER_LEVEL 分佈資料
        </div>
      ) : (
        <div className="px-5 py-5 space-y-3">
          {rows.map((r, i) => {
            const pct = total === 0 ? 0 : (r.count / total) * 100;
            const w = max === 0 ? 0 : (r.count / max) * 100;
            return (
              <div
                key={r.tierLevel}
                data-testid={`tier-row-${r.tierLevel}`}
                className="flex items-center gap-3"
              >
                <span className="w-12 text-xs font-mono font-semibold text-gray-700">
                  {r.tierLevel}
                </span>
                <div className="flex-1 h-3.5 rounded-md bg-gray-100 overflow-hidden">
                  <div
                    className="h-full rounded-md transition-[width] duration-300"
                    style={{ width: `${w}%`, background: COLORS[i % COLORS.length] }}
                  />
                </div>
                <span className="w-16 text-right text-xs font-mono text-gray-600 tabular-nums">
                  {r.count.toLocaleString()}
                </span>
                <span className="w-12 text-right text-xs text-gray-500 tabular-nums">
                  {pct.toFixed(1)}%
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
