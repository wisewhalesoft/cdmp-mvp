import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CardLevelDonut } from '../card-level-donut';
import type { SummaryLevelRow } from '@/api/assignment-run';

/**
 * F063 CARD_LEVEL 等級佔比 donut chart
 *
 * 對應 prototype 33-run-summary.html L278-293
 *
 * 純 div + conic-gradient（避免引入 recharts 依賴；與 stage0-bar 一致風格）
 */

const ROWS: SummaryLevelRow[] = [
  { cardLevel: 'A', count: 800, ratio: 0.4 },
  { cardLevel: 'B', count: 700, ratio: 0.35 },
  { cardLevel: 'C', count: 500, ratio: 0.25 },
];

describe('CardLevelDonut', () => {
  it('空陣列顯示「無資料」', () => {
    render(<CardLevelDonut rows={[]} />);
    expect(screen.getByTestId('card-level-empty')).toBeInTheDocument();
  });

  it('每 row 渲染 legend item', () => {
    render(<CardLevelDonut rows={ROWS} />);
    expect(screen.getByTestId('card-legend-A')).toBeInTheDocument();
    expect(screen.getByTestId('card-legend-B')).toBeInTheDocument();
    expect(screen.getByTestId('card-legend-C')).toBeInTheDocument();
  });

  it('legend 顯示 cardLevel + count + ratio', () => {
    render(<CardLevelDonut rows={ROWS} />);
    const a = screen.getByTestId('card-legend-A');
    expect(a.textContent).toContain('A');
    expect(a.textContent).toContain('800');
    expect(a.textContent).toContain('40');
  });

  it('總計顯示加總 count', () => {
    render(<CardLevelDonut rows={ROWS} />);
    const total = screen.getByTestId('card-level-total');
    expect(total.textContent).toContain('2,000');
  });
});
