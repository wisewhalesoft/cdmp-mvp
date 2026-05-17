import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DeptDeviationChart } from '../dept-deviation-chart';
import type { SummaryDeptRow } from '@/api/assignment-run';

/**
 * F063 部門分配偏差 chart（純 div + recharts BarChart 二選一；
 * Phase 3 採純 div bar 以保持與 stage0-bar-chart 一致風格）
 *
 * 對應 prototype 33-run-summary.html L247-262
 */

const ROWS: SummaryDeptRow[] = [
  {
    deptId: 'D01',
    configRatio: 0.3,
    actualCount: 285,
    actualRatio: 0.285,
    deviation: -0.015,
    alert: false,
  },
  {
    deptId: 'D02',
    configRatio: 0.25,
    actualCount: 290,
    actualRatio: 0.29,
    deviation: 0.04,
    alert: true,
  },
];

describe('DeptDeviationChart', () => {
  it('空陣列顯示「無資料」', () => {
    render(<DeptDeviationChart rows={[]} />);
    expect(screen.getByTestId('dept-deviation-empty')).toBeInTheDocument();
  });

  it('每 row 渲染 1 個 chart-row', () => {
    render(<DeptDeviationChart rows={ROWS} />);
    expect(screen.getByTestId('dept-deviation-D01')).toBeInTheDocument();
    expect(screen.getByTestId('dept-deviation-D02')).toBeInTheDocument();
  });

  it('alert=true 標示警示樣式（紅色 data-alert）', () => {
    render(<DeptDeviationChart rows={ROWS} />);
    const d02 = screen.getByTestId('dept-deviation-D02');
    expect(d02.getAttribute('data-alert')).toBe('true');
    const d01 = screen.getByTestId('dept-deviation-D01');
    expect(d01.getAttribute('data-alert')).toBe('false');
  });

  it('顯示設定比例 vs 實際比例 + deviation', () => {
    render(<DeptDeviationChart rows={ROWS} />);
    const d01 = screen.getByTestId('dept-deviation-D01');
    // 0.3 → 30.00%；0.285 → 28.50%；deviation -1.50%
    expect(d01.textContent).toContain('30.00');
    expect(d01.textContent).toContain('28.50');
  });

  it('legend 顯示 3 色（正常/偏差/警示）', () => {
    const { container } = render(<DeptDeviationChart rows={ROWS} />);
    const text = container.textContent ?? '';
    expect(text).toContain('正常');
    expect(text).toContain('警示');
  });
});
