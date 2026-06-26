import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RunSelector } from '../run-selector';
import type { RunListItem } from '@/api/assignment-run';

/**
 * F067 Run Compare 雙下拉 selector
 *
 * 對應 prototype 36-run-compare.html L174-232
 *
 * 行為：
 *   - 兩個 select（Run A / Run B）+ 摘要
 *   - 「交換 A/B」按鈕
 *   - 「重新比對」按鈕觸發 onCompare(runA, runB)
 *   - runs=[] → 顯示無資料訊息
 */

// 對齊真實後端契約：projectWorkym / totalCases（非 ym / totalCount）。
const RUNS: RunListItem[] = [
  {
    runId: '7a1b2c3d-4e5f',
    projectWorkym: '202604',
    status: 'completed',
    triggeredBy: 'uuid-a',
    triggeredByName: '張部長',
    triggeredAt: '2026-04-24T10:00:00Z',
    finishedAt: '2026-04-24T11:02:00Z',
    totalCases: 9120,
  },
  {
    runId: '550e8400-e29b',
    projectWorkym: '202605',
    status: 'completed',
    triggeredBy: 'uuid-a',
    triggeredByName: '張部長',
    triggeredAt: '2026-05-09T12:00:00Z',
    finishedAt: '2026-05-09T12:30:00Z',
    totalCases: 9500,
  },
  {
    runId: 'ad4e5f6a-7b8c',
    projectWorkym: '202603',
    status: 'completed',
    triggeredBy: 'uuid-b',
    triggeredByName: '李處長',
    triggeredAt: '2026-03-20T09:00:00Z',
    finishedAt: '2026-03-20T09:45:00Z',
    totalCases: 8780,
  },
];

describe('RunSelector', () => {
  it('渲染兩個 select 元素', () => {
    render(
      <RunSelector
        runs={RUNS}
        runA={RUNS[0].runId}
        runB={RUNS[1].runId}
        onCompare={() => {}}
      />,
    );
    expect(screen.getByTestId('select-run-a')).toBeInTheDocument();
    expect(screen.getByTestId('select-run-b')).toBeInTheDocument();
  });

  it('select A 預選 runA prop 對應的 run', () => {
    render(
      <RunSelector
        runs={RUNS}
        runA={RUNS[0].runId}
        runB={RUNS[1].runId}
        onCompare={() => {}}
      />,
    );
    const selA = screen.getByTestId('select-run-a') as HTMLSelectElement;
    expect(selA.value).toBe(RUNS[0].runId);
  });

  it('select B 預選 runB prop 對應的 run', () => {
    render(
      <RunSelector
        runs={RUNS}
        runA={RUNS[0].runId}
        runB={RUNS[1].runId}
        onCompare={() => {}}
      />,
    );
    const selB = screen.getByTestId('select-run-b') as HTMLSelectElement;
    expect(selB.value).toBe(RUNS[1].runId);
  });

  it('「重新比對」按鈕觸發 onCompare(runA, runB)', () => {
    const onCompare = vi.fn();
    render(
      <RunSelector
        runs={RUNS}
        runA={RUNS[0].runId}
        runB={RUNS[1].runId}
        onCompare={onCompare}
      />,
    );
    fireEvent.click(screen.getByTestId('btn-recompare'));
    expect(onCompare).toHaveBeenCalledWith(RUNS[0].runId, RUNS[1].runId);
  });

  it('「交換 A/B」按鈕觸發 onCompare(B, A)', () => {
    const onCompare = vi.fn();
    render(
      <RunSelector
        runs={RUNS}
        runA={RUNS[0].runId}
        runB={RUNS[1].runId}
        onCompare={onCompare}
      />,
    );
    fireEvent.click(screen.getByTestId('btn-swap'));
    expect(onCompare).toHaveBeenCalledWith(RUNS[1].runId, RUNS[0].runId);
  });

  it('runs=[] 顯示無資料訊息', () => {
    render(
      <RunSelector runs={[]} runA="" runB="" onCompare={() => {}} />,
    );
    expect(screen.getByTestId('run-selector-empty')).toBeInTheDocument();
  });

  // 回歸：F067 比對功能異常根因 = formatYm(undefined) 崩潰（projectWorkym 缺值）。
  it('run.projectWorkym 缺值時不崩潰（formatYm 防呆）', () => {
    const badRuns = [
      {
        runId: 'bad-1',
        status: 'completed',
        triggeredBy: 'uuid-x',
        triggeredAt: '2026-05-09T12:00:00Z',
        finishedAt: '2026-05-09T12:30:00Z',
      } as unknown as RunListItem,
    ];
    expect(() =>
      render(
        <RunSelector
          runs={badRuns}
          runA="bad-1"
          runB="bad-1"
          onCompare={() => {}}
        />,
      ),
    ).not.toThrow();
    expect(screen.getByTestId('select-run-a')).toBeInTheDocument();
  });

  it('A/B 選相同 run 時「重新比對」按鈕 disabled', () => {
    render(
      <RunSelector
        runs={RUNS}
        runA={RUNS[0].runId}
        runB={RUNS[0].runId}
        onCompare={() => {}}
      />,
    );
    expect(screen.getByTestId('btn-recompare')).toBeDisabled();
  });

  it('change select A → 觸發 onChangeA', () => {
    const onChangeA = vi.fn();
    render(
      <RunSelector
        runs={RUNS}
        runA={RUNS[0].runId}
        runB={RUNS[1].runId}
        onCompare={() => {}}
        onChangeA={onChangeA}
      />,
    );
    fireEvent.change(screen.getByTestId('select-run-a'), {
      target: { value: RUNS[2].runId },
    });
    expect(onChangeA).toHaveBeenCalledWith(RUNS[2].runId);
  });
});
