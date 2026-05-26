import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  Stage0BarChart,
  computeAdE07Distribution,
  type Stage0DayInput,
  type Stage0Row,
} from '../stage0-bar-chart';

/**
 * F049 v1.3 + AD-E07-8：每日預估筆數（Design A — 前端消費後端 ratioPerMille）
 *
 * 對應 prototype 30-stage0-estimate.html recompute()。
 *
 * Design A：
 *   - 後端回 ratioPerMille（千分位 ratio）
 *   - 前端件數 = round(ratioPerMille / 1000 × total)
 *   - isBonus = ratioPerMille > baseRatio（餘數補 +1）
 */

// helper：組裝 day input（含 ratioPerMille）
function wd(date: string, weekday: string, ratioPerMille: number): Stage0DayInput {
  return { date, weekday, isWorkday: true, ratioPerMille, skipReason: null };
}
function skip(
  date: string,
  weekday: string,
  skipReason: '週末' | '國定假日',
): Stage0DayInput {
  return { date, weekday, isWorkday: false, ratioPerMille: 0, skipReason };
}

describe('computeAdE07Distribution (Design A 純函式)', () => {
  // TS-F049-V13F-006a：基本驗證（total=9500，workingDays=20，remainder=0）
  it('TS-F049-V13F-006a：全工作日 ratio=50 / total=9500 → 每日 estimate=475；無 bonus', () => {
    const days: Stage0DayInput[] = [];
    for (let i = 4; i <= 7; i++) days.push(wd(`2026-05-0${i}`, '一', 50));
    const rows = computeAdE07Distribution(9500, days);
    expect(rows.every((r) => r.estimate === 475)).toBe(true);
    expect(rows.every((r) => r.isBonus === false)).toBe(true);
  });

  // TS-F049-V13F-006b：有餘數補（baseRatio=47，bonus=48）
  it('TS-F049-V13F-006b：ratio 48（bonus）→ estimate=456；ratio 47（base）→ estimate=447；isBonus 正確', () => {
    const days: Stage0DayInput[] = [
      wd('2026-05-04', '一', 47),
      wd('2026-05-05', '二', 47),
      wd('2026-05-29', '五', 48), // bonus
    ];
    const rows = computeAdE07Distribution(9500, days);
    // round(47/1000 × 9500) = round(446.5) = 447（half-up）
    expect(rows[0].estimate).toBe(447);
    expect(rows[0].isBonus).toBe(false);
    // round(48/1000 × 9500) = round(456) = 456
    expect(rows[2].estimate).toBe(456);
    expect(rows[2].isBonus).toBe(true);
  });

  it('跳過日（isWorkday=false）estimate=0、不累加', () => {
    const rows = computeAdE07Distribution(1000, [
      wd('2026-05-01', '五', 250),
      skip('2026-05-02', '六', '週末'),
      skip('2026-05-03', '日', '週末'),
      wd('2026-05-04', '一', 250),
    ]);
    expect(rows[1].estimate).toBe(0);
    expect(rows[2].estimate).toBe(0);
    expect(rows[1].cumulative).toBe(rows[0].cumulative); // 跳過日不累加
  });

  it('cumulative 累積正確', () => {
    const rows = computeAdE07Distribution(1000, [
      wd('2026-05-04', '一', 500),
      wd('2026-05-05', '二', 500),
    ]);
    expect(rows[0].cumulative).toBe(500);
    expect(rows[1].cumulative).toBe(1000);
  });

  it('total=0 → 全部 estimate=0', () => {
    const rows = computeAdE07Distribution(0, [wd('2026-05-04', '一', 1000)]);
    expect(rows[0].estimate).toBe(0);
  });

  it('無工作日（全跳過）→ estimate 全部 0', () => {
    const rows = computeAdE07Distribution(1000, [
      skip('2026-05-02', '六', '週末'),
      skip('2026-05-03', '日', '週末'),
    ]);
    expect(rows.every((r) => r.estimate === 0)).toBe(true);
  });
});

describe('Stage0BarChart (component — v1.3 對齊 prototype)', () => {
  const ROWS: Stage0Row[] = [
    {
      date: '2026-05-01',
      weekday: '五',
      isWorkday: false,
      skipReason: '國定假日',
      ratioPerMille: 0,
      estimate: 0,
      isBonus: false,
      cumulative: 0,
    },
    {
      date: '2026-05-04',
      weekday: '一',
      isWorkday: true,
      skipReason: null,
      ratioPerMille: 50,
      estimate: 475,
      isBonus: false,
      cumulative: 475,
    },
    {
      date: '2026-05-29',
      weekday: '五',
      isWorkday: true,
      skipReason: null,
      ratioPerMille: 51,
      estimate: 476,
      isBonus: true,
      cumulative: 9500,
    },
  ];

  it('rows=[] 顯示「無資料」', () => {
    render(<Stage0BarChart rows={[]} />);
    expect(screen.getByTestId('bar-chart-empty')).toBeInTheDocument();
  });

  it('每 row 渲染對應 bar（含跳過日）', () => {
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

  // TS-F049-V13F-007：bar w-full、跳過日灰 bar、bonus 深藍、標籤順序件數在上
  it('TS-F049-V13F-007a：工作日 bar 為 w-full（非 w-6）', () => {
    render(<Stage0BarChart rows={ROWS} />);
    const cell = screen.getByTestId('bar-2026-05-04');
    const bar = cell.querySelector('div[style]') as HTMLElement;
    expect(bar.className).toContain('w-full');
    expect(bar.className).not.toContain('w-6');
  });

  it('TS-F049-V13F-007b：跳過日渲染灰 bar（bg-gray-300）', () => {
    render(<Stage0BarChart rows={ROWS} />);
    const cell = screen.getByTestId('bar-2026-05-01');
    const bar = cell.querySelector('div[style]') as HTMLElement;
    expect(bar).toBeTruthy();
    expect(bar.className).toContain('bg-gray-300');
  });

  it('TS-F049-V13F-007c：base 工作日 bar=bg-blue-500；bonus 工作日 bar=bg-blue-700', () => {
    render(<Stage0BarChart rows={ROWS} />);
    const base = screen
      .getByTestId('bar-2026-05-04')
      .querySelector('div[style]') as HTMLElement;
    expect(base.className).toContain('bg-blue-500');
    const bonus = screen
      .getByTestId('bar-2026-05-29')
      .querySelector('div[style]') as HTMLElement;
    expect(bonus.className).toContain('bg-blue-700');
  });

  it('TS-F049-V13F-007d：件數標籤在 DOM 中先於 bar div（件數在上）', () => {
    render(<Stage0BarChart rows={ROWS} />);
    const cell = screen.getByTestId('bar-2026-05-04');
    const children = Array.from(cell.children);
    // 第一個子節點為件數標籤（含 475），bar 包在後面的容器內
    expect(children[0].textContent).toContain('475');
    // bar 容器（含 div[style]）位於件數標籤之後
    const barWrapperIdx = children.findIndex((c) => c.querySelector('div[style]'));
    expect(barWrapperIdx).toBeGreaterThan(0);
  });

  it('TS-F049-V13F-007e：跳過日件數標籤顯示「—」', () => {
    render(<Stage0BarChart rows={ROWS} />);
    const cell = screen.getByTestId('bar-2026-05-01');
    expect(cell.textContent).toContain('—');
  });
});
