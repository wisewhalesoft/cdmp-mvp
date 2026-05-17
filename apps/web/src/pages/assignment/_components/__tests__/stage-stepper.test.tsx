import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StageStepper, type StepperStage } from '../stage-stepper';

/**
 * F062 5-step Stage Stepper（橫向 dot + 連線）
 *
 * 對應 prototype 32-run-progress.html L278+
 *
 * 5 stages：Stage 0 / Stage 1 / Stage 2 / Stage 3 / Stage 4
 * 每 stage status：'pending' | 'running' | 'completed' | 'failed'
 */

const STAGES: StepperStage[] = [
  { name: 'Stage 0', subtitle: '日比例試算', status: 'completed' },
  { name: 'Stage 1', subtitle: '案件池篩選', status: 'completed' },
  { name: 'Stage 2', subtitle: '計分', status: 'running' },
  { name: 'Stage 3', subtitle: '部門分派', status: 'pending' },
  { name: 'Stage 4', subtitle: '個別分派', status: 'pending' },
];

describe('StageStepper', () => {
  it('渲染所有 stages 的 dot 與名稱', () => {
    render(<StageStepper stages={STAGES} />);
    expect(screen.getByText('Stage 0')).toBeInTheDocument();
    expect(screen.getByText('Stage 4')).toBeInTheDocument();
    expect(screen.getByText('日比例試算')).toBeInTheDocument();
  });

  it('completed stage dot 含勾選 testid', () => {
    render(<StageStepper stages={STAGES} />);
    const dot0 = screen.getByTestId('stage-dot-0');
    expect(dot0.getAttribute('data-status')).toBe('completed');
  });

  it('running stage dot 含 spinner', () => {
    render(<StageStepper stages={STAGES} />);
    const dot2 = screen.getByTestId('stage-dot-2');
    expect(dot2.getAttribute('data-status')).toBe('running');
  });

  it('pending stage dot 顯示 pending', () => {
    render(<StageStepper stages={STAGES} />);
    const dot3 = screen.getByTestId('stage-dot-3');
    expect(dot3.getAttribute('data-status')).toBe('pending');
  });

  it('連線數量 = stages.length - 1', () => {
    render(<StageStepper stages={STAGES} />);
    const lines = screen.getAllByTestId(/^stage-line-/);
    expect(lines.length).toBe(STAGES.length - 1);
  });

  it('failed stage dot 顯示 failed', () => {
    const failed: StepperStage[] = [
      { name: 'S0', subtitle: 's0', status: 'completed' },
      { name: 'S1', subtitle: 's1', status: 'failed' },
      { name: 'S2', subtitle: 's2', status: 'pending' },
    ];
    render(<StageStepper stages={failed} />);
    const dot1 = screen.getByTestId('stage-dot-1');
    expect(dot1.getAttribute('data-status')).toBe('failed');
  });

  it('顯示「完成 X / Y」summary', () => {
    render(<StageStepper stages={STAGES} />);
    const progress = screen.getByTestId('stage-stepper-progress');
    expect(progress.textContent).toContain('2 / 5');
  });

  it('空 stages 不報錯', () => {
    render(<StageStepper stages={[]} />);
    expect(screen.getByTestId('stage-stepper-empty')).toBeInTheDocument();
  });
});
