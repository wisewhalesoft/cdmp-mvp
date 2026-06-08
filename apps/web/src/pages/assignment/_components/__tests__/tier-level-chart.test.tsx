import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

import { TierLevelChart } from '../tier-level-chart';

describe('TierLevelChart (F063 gap fix — 對齊 prototype 33-run-summary.html TIER_LEVEL 分佈)', () => {
  it('每個 tier 渲染一條 bar，含 count 與百分比（pct = count / 合計）', () => {
    render(
      <TierLevelChart
        rows={[
          { tierLevel: 'T1', count: 40, ratio: 40 },
          { tierLevel: 'T2', count: 60, ratio: 60 },
        ]}
      />,
    );
    expect(screen.getByText('TIER_LEVEL 分佈')).toBeInTheDocument();
    expect(screen.getByText('fn_calc_tier_level 計算結果')).toBeInTheDocument();

    const t1 = screen.getByTestId('tier-row-T1');
    const t2 = screen.getByTestId('tier-row-T2');
    expect(t1.textContent).toContain('T1');
    expect(t1.textContent).toContain('40');
    expect(t1.textContent).toContain('40.0%');
    expect(t2.textContent).toContain('60');
    expect(t2.textContent).toContain('60.0%');
  });

  it('無資料時顯示空狀態（不再顯示「待 Track D」placeholder）', () => {
    render(<TierLevelChart rows={[]} />);
    expect(screen.getByTestId('tier-level-empty')).toBeInTheDocument();
    expect(screen.getByText('無 TIER_LEVEL 分佈資料')).toBeInTheDocument();
    expect(screen.queryByText(/Track D/)).toBeNull();
  });
});
