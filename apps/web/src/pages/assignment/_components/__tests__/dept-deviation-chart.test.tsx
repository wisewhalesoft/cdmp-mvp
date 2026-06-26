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

// 尺度對齊真實後端契約（F063 §5.1）：configRatio / actualRatio / deviation 皆為 0–100 百分比。
// deptName：D01 有名稱（名稱為主+代號為輔）；D02 為 null（fallback 顯示代號）。
const ROWS: SummaryDeptRow[] = [
  {
    deptId: 'D01',
    deptName: '業務一部',
    configRatio: 30,
    actualCount: 285,
    actualRatio: 28.5,
    deviation: -1.5,
    alert: false,
  },
  {
    deptId: 'D02',
    deptName: null,
    configRatio: 25,
    actualCount: 290,
    actualRatio: 29,
    deviation: 4,
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

  it('顯示設定比例 vs 實際比例（0–100 尺度，不重複 ×100）', () => {
    render(<DeptDeviationChart rows={ROWS} />);
    const d01 = screen.getByTestId('dept-deviation-D01');
    // 後端回 0–100 百分比 → 直接顯示 30.0% / 28.5%；不可再 ×100（>1000% bug 防護）
    expect(d01.textContent).toContain('30.0');
    expect(d01.textContent).toContain('28.5');
    expect(d01.textContent).not.toContain('3000');
    expect(d01.textContent).not.toContain('2850');
  });

  it('於標題列顯示實際分派筆數（actualCount）', () => {
    render(<DeptDeviationChart rows={ROWS} />);
    const d01 = screen.getByTestId('dept-deviation-D01');
    expect(d01.textContent).toContain('285');
  });

  it('部門以名稱為主、代號為輔；查無名稱退回顯示代號', () => {
    render(<DeptDeviationChart rows={ROWS} />);
    const d01 = screen.getByTestId('dept-deviation-D01');
    expect(d01.textContent).toContain('業務一部'); // 名稱為主
    expect(d01.textContent).toContain('D01'); // 代號為輔
    const d02 = screen.getByTestId('dept-deviation-D02');
    expect(d02.textContent).toContain('D02'); // deptName=null → fallback 顯示代號
  });

  it('legend 顯示 3 色（正常/偏差/警示）', () => {
    const { container } = render(<DeptDeviationChart rows={ROWS} />);
    const text = container.textContent ?? '';
    expect(text).toContain('正常');
    expect(text).toContain('警示');
  });
});
