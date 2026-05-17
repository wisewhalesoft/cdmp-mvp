import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { ElapsedTimer, formatElapsed } from '../elapsed-timer';

/**
 * F062 elapsed timer（mm:ss）
 *
 * 對應 prototype 32-run-progress.html L204-206
 *
 * 行為：
 *   - 接 startTime: ISO string；每秒更新顯示
 *   - status='running' → 計時中；status='completed' / 'failed' → 顯示固定值（startTime → endTime）
 *   - 格式：mm:ss（< 60 min）；hh:mm:ss（≥ 60 min）
 */

describe('formatElapsed (pure)', () => {
  it('0 秒 → 00:00', () => {
    expect(formatElapsed(0)).toBe('00:00');
  });

  it('45 秒 → 00:45', () => {
    expect(formatElapsed(45)).toBe('00:45');
  });

  it('60 秒 → 01:00', () => {
    expect(formatElapsed(60)).toBe('01:00');
  });

  it('272 秒（04:32）', () => {
    expect(formatElapsed(272)).toBe('04:32');
  });

  it('3600+ 秒 → hh:mm:ss', () => {
    expect(formatElapsed(3661)).toBe('01:01:01');
  });

  it('負數 → 00:00（容錯）', () => {
    expect(formatElapsed(-5)).toBe('00:00');
  });
});

describe('ElapsedTimer (component)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('status=running → 每秒更新', () => {
    const start = new Date('2026-05-15T10:00:00Z').toISOString();
    vi.setSystemTime(new Date('2026-05-15T10:00:30Z'));
    render(<ElapsedTimer startTime={start} status="running" />);
    expect(screen.getByTestId('elapsed-timer').textContent).toContain('00:30');

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByTestId('elapsed-timer').textContent).toContain('00:32');
  });

  it('status=completed + finishedAt → 顯示 finishedAt - startTime 固定值', () => {
    const start = new Date('2026-05-15T10:00:00Z').toISOString();
    const end = new Date('2026-05-15T10:30:12Z').toISOString();
    render(
      <ElapsedTimer
        startTime={start}
        status="completed"
        finishedAt={end}
      />,
    );
    expect(screen.getByTestId('elapsed-timer').textContent).toContain('30:12');
  });

  it('status=failed + finishedAt → 顯示固定值', () => {
    const start = new Date('2026-05-15T10:00:00Z').toISOString();
    const end = new Date('2026-05-15T10:05:00Z').toISOString();
    render(
      <ElapsedTimer startTime={start} status="failed" finishedAt={end} />,
    );
    expect(screen.getByTestId('elapsed-timer').textContent).toContain('05:00');
  });

  it('status=pending → 顯示 --:--', () => {
    const start = new Date('2026-05-15T10:00:00Z').toISOString();
    render(<ElapsedTimer startTime={start} status="pending" />);
    expect(screen.getByTestId('elapsed-timer').textContent).toContain('--:--');
  });
});
