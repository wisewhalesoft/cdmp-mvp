import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  PreCheckList,
  buildPreChecksFromReadiness,
} from '../pre-check-list';
import type { ReadinessResponse } from '@/api/assignment-run';

/**
 * F061 6 項 pre-check 列表（trigger-run 頁用）
 *
 * 對應 prototype 31-trigger-run.html L237-329
 *
 * 6 項：
 *   1. 名單定義已建立
 *   2. 部門比例加總 = 100%（透過 stage=ready 隱含驗證）
 *   3. 人員比例加總 = 100%（透過 stage=ready 隱含驗證）
 *   4. 計分版本 active
 *   5. 無 pending/running 月跑
 *   6. ETL 同步狀態（pooldata/emphire/calendar/arreturndf 均 completed）
 */

function makeReadiness(overrides: Partial<ReadinessResponse> = {}): ReadinessResponse {
  return {
    workYm: '202605',
    totalActiveLists: 3,
    readyCount: 3,
    notReadyLists: [],
    allReady: true,
    monthlyRunStatus: 'none',
    scoringActive: true,
    etlStatus: {
      pooldata: { status: 'completed', lastRunAt: '2026-05-15T03:00:00Z' },
      emphire: { status: 'completed', lastRunAt: '2026-05-15T03:00:00Z' },
      calendar: { status: 'completed', lastRunAt: '2026-05-15T03:00:00Z' },
      arreturndf: { status: 'completed', lastRunAt: '2026-05-15T03:00:00Z' },
    },
    ...overrides,
  };
}

describe('buildPreChecksFromReadiness (pure function)', () => {
  it('全部 ready 時回傳 6 項 check 且全部 pass', () => {
    const checks = buildPreChecksFromReadiness(makeReadiness());
    expect(checks).toHaveLength(6);
    for (const c of checks) {
      expect(c.status).toBe('pass');
    }
  });

  it('totalActiveLists=0 → check 1 fail', () => {
    const checks = buildPreChecksFromReadiness(
      makeReadiness({ totalActiveLists: 0, readyCount: 0 }),
    );
    expect(checks[0].id).toBe('list-defined');
    expect(checks[0].status).toBe('fail');
  });

  it('allReady=false（部分名單未 ready）→ check 2/3 fail', () => {
    const checks = buildPreChecksFromReadiness(
      makeReadiness({
        totalActiveLists: 3,
        readyCount: 1,
        allReady: false,
        notReadyLists: [
          { listNo: 'L2', listNm: 'B', stage: 'dept_ratio' },
          { listNo: 'L3', listNm: 'C', stage: 'personnel_ratio' },
        ],
      }),
    );
    const dept = checks.find((c) => c.id === 'dept-ratio-100');
    expect(dept?.status).toBe('fail');
    const personnel = checks.find((c) => c.id === 'personnel-ratio-100');
    expect(personnel?.status).toBe('fail');
  });

  it('scoringActive=false → check 4 fail', () => {
    const checks = buildPreChecksFromReadiness(
      makeReadiness({ scoringActive: false }),
    );
    const score = checks.find((c) => c.id === 'scoring-active');
    expect(score?.status).toBe('fail');
  });

  it('monthlyRunStatus="running" → check 5 fail', () => {
    const checks = buildPreChecksFromReadiness(
      makeReadiness({ monthlyRunStatus: 'running' }),
    );
    const noRunning = checks.find((c) => c.id === 'no-running-run');
    expect(noRunning?.status).toBe('fail');
  });

  it('monthlyRunStatus="completed" → check 5 pass（已完成不算 running）', () => {
    const checks = buildPreChecksFromReadiness(
      makeReadiness({ monthlyRunStatus: 'completed' }),
    );
    const noRunning = checks.find((c) => c.id === 'no-running-run');
    expect(noRunning?.status).toBe('pass');
  });

  it('任一 ETL 為 failed/missing → check 6 fail', () => {
    const checks = buildPreChecksFromReadiness(
      makeReadiness({
        etlStatus: {
          pooldata: { status: 'completed', lastRunAt: '2026-05-15T03:00:00Z' },
          emphire: { status: 'missing', lastRunAt: null },
          calendar: { status: 'completed', lastRunAt: '2026-05-15T03:00:00Z' },
          arreturndf: { status: 'completed', lastRunAt: '2026-05-15T03:00:00Z' },
        },
      }),
    );
    const etl = checks.find((c) => c.id === 'etl-synced');
    expect(etl?.status).toBe('fail');
  });
});

describe('PreCheckList (component)', () => {
  it('render 6 items', () => {
    render(<PreCheckList readiness={makeReadiness()} />);
    expect(screen.getAllByTestId(/^pre-check-item-/).length).toBe(6);
  });

  it('全部 pass 時 summary 顯示 6/6', () => {
    render(<PreCheckList readiness={makeReadiness()} />);
    const summary = screen.getByTestId('pre-check-summary');
    expect(summary.textContent).toContain('6/6');
  });

  it('1 失敗時 summary 顯示 5/6', () => {
    render(
      <PreCheckList
        readiness={makeReadiness({ scoringActive: false })}
      />,
    );
    const summary = screen.getByTestId('pre-check-summary');
    expect(summary.textContent).toContain('5/6');
  });

  it('loading 顯示載入中', () => {
    render(<PreCheckList readiness={null} loading />);
    expect(screen.getByText('載入前置檢查中...')).toBeInTheDocument();
  });

  it('readiness=null + loading=false 顯示空狀態', () => {
    render(<PreCheckList readiness={null} loading={false} />);
    expect(screen.getByText(/前置檢查無法載入/)).toBeInTheDocument();
  });
});
