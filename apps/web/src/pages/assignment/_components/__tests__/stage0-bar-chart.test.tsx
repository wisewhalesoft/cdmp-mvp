import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  Stage0BarChart,
  computeAdE07Distribution,
  type Stage0Row,
} from '../stage0-bar-chart';

/**
 * F049 + AD-E07-8 演算法：每日預估筆數
 *
 * 對應 prototype 30-stage0-estimate.html L304-318
 *
 * AD-E07-8：
 *   base = FLOOR(total / workingDays)
 *   rem = total mod workingDays
 *   per_date = base
 *   最後 rem 個工作日: per_date = base + 1
 */

describe('computeAdE07Distribution (pure)', () => {
  it('100 筆 / 4 工作日 → base=25 rem=0 全部 base', () => {
    const rows = computeAdE07Distribution(100, [
      { date: '2026-05-01', weekday: '五', isWorkday: true },
      { date: '2026-05-04', weekday: '一', isWorkday: true },
      { date: '2026-05-05', weekday: '二', isWorkday: true },
      { date: '2026-05-06', weekday: '三', isWorkday: true },
    ]);
    expect(rows.map((r) => r.estimate)).toEqual([25, 25, 25, 25]);
  });

  it('103 筆 / 4 工作日 → base=25 rem=3 最後 3 天 = base+1', () => {
    const rows = computeAdE07Distribution(103, [
      { date: '2026-05-01', weekday: '五', isWorkday: true },
      { date: '2026-05-04', weekday: '一', isWorkday: true },
      { date: '2026-05-05', weekday: '二', isWorkday: true },
      { date: '2026-05-06', weekday: '三', isWorkday: true },
    ]);
    expect(rows.map((r) => r.estimate)).toEqual([25, 26, 26, 26]);
  });

  it('週末（isWorkday=false）跳過 estimate=0', () => {
    const rows = computeAdE07Distribution(40, [
      { date: '2026-05-01', weekday: '五', isWorkday: true },
      { date: '2026-05-02', weekday: '六', isWorkday: false },
      { date: '2026-05-03', weekday: '日', isWorkday: false },
      { date: '2026-05-04', weekday: '一', isWorkday: true },
    ]);
    expect(rows[1].estimate).toBe(0);
    expect(rows[2].estimate).toBe(0);
    expect(rows[0].estimate + rows[3].estimate).toBe(40);
  });

  it('累積值 cumulative 正確', () => {
    const rows = computeAdE07Distribution(40, [
      { date: '2026-05-01', weekday: '五', isWorkday: true },
      { date: '2026-05-04', weekday: '一', isWorkday: true },
    ]);
    expect(rows[0].cumulative).toBe(20);
    expect(rows[1].cumulative).toBe(40);
  });

  it('isBonus 標記：最後 rem 個工作日', () => {
    const rows = computeAdE07Distribution(11, [
      { date: '2026-05-01', weekday: '五', isWorkday: true },
      { date: '2026-05-04', weekday: '一', isWorkday: true },
      { date: '2026-05-05', weekday: '二', isWorkday: true },
    ]);
    // base=3 rem=2 → 後 2 個工作日為 bonus
    expect(rows[0].isBonus).toBe(false);
    expect(rows[1].isBonus).toBe(true);
    expect(rows[2].isBonus).toBe(true);
    expect(rows.map((r) => r.estimate)).toEqual([3, 4, 4]);
  });

  it('total=0 → 全部 0', () => {
    const rows = computeAdE07Distribution(0, [
      { date: '2026-05-01', weekday: '五', isWorkday: true },
    ]);
    expect(rows[0].estimate).toBe(0);
  });

  it('workingDays=0 → estimate 全部 0', () => {
    const rows = computeAdE07Distribution(100, [
      { date: '2026-05-02', weekday: '六', isWorkday: false },
      { date: '2026-05-03', weekday: '日', isWorkday: false },
    ]);
    expect(rows.every((r) => r.estimate === 0)).toBe(true);
  });
});

describe('Stage0BarChart (component)', () => {
  const ROWS: Stage0Row[] = [
    { date: '2026-05-01', weekday: '五', isWorkday: true, estimate: 25, isBonus: false, cumulative: 25 },
    { date: '2026-05-02', weekday: '六', isWorkday: false, estimate: 0, isBonus: false, cumulative: 25 },
    { date: '2026-05-04', weekday: '一', isWorkday: true, estimate: 26, isBonus: true, cumulative: 51 },
  ];

  it('rows=[] 顯示「無資料」', () => {
    render(<Stage0BarChart rows={[]} />);
    expect(screen.getByTestId('bar-chart-empty')).toBeInTheDocument();
  });

  it('每 row 渲染對應 bar', () => {
    render(<Stage0BarChart rows={ROWS} />);
    const bars = screen.getAllByTestId(/^bar-/);
    expect(bars.length).toBe(ROWS.length);
  });

  it('legend 顯示 3 色說明', () => {
    const { container } = render(<Stage0BarChart rows={ROWS} />);
    const text = container.textContent ?? '';
    expect(text).toContain('工作日 (base)');
    expect(text).toContain('工作日 (base+1)');
    expect(text).toContain('跳過');
  });
});
