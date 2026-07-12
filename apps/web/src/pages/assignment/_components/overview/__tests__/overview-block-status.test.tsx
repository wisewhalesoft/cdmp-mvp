import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { OverviewBlock } from '@cdmp/shared';
import { OverviewBlockStatus } from '../overview-block-status';

/**
 * F111 FE-STATE-005：OverviewBlockStatus 共用 wrapper 三態（loading / empty / error）
 * 各自具備獨立 data-state 屬性且互斥（AC-15）。
 */

interface Sample {
  value: string;
}

function renderStatus(props: {
  loading: boolean;
  block: OverviewBlock<Sample> | undefined;
  isEmpty?: boolean;
}) {
  return render(
    <OverviewBlockStatus<Sample>
      testId="blk"
      num={1}
      title="測試區塊"
      loading={props.loading}
      block={props.block}
      isEmpty={props.isEmpty}
      emptyContent={<div>本區塊目前無資料</div>}
      onRetry={vi.fn()}
    >
      {(data) => <div data-testid="content-body">{data.value}</div>}
    </OverviewBlockStatus>,
  );
}

describe('OverviewBlockStatus（AC-15 三態 wrapper）', () => {
  it('TS-F111-FE-STATE-005（loading）：query pending → data-state=loading，內容/錯誤/空狀態皆不存在', () => {
    renderStatus({ loading: true, block: undefined });
    const el = screen.getByTestId('blk');
    expect(el.getAttribute('data-state')).toBe('loading');
    expect(screen.getByTestId('blk-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('blk-error')).toBeNull();
    expect(screen.queryByTestId('blk-empty')).toBeNull();
    expect(screen.queryByTestId('content-body')).toBeNull();
  });

  it('TS-F111-FE-STATE-005（error）：block.error=true → data-state=error + message + 重試，內容不存在', () => {
    renderStatus({
      loading: false,
      block: {
        error: true,
        errorCode: 'STAGE_TODO_UNAVAILABLE',
        message: '本區塊資料暫時無法取得，請稍後重試。',
      },
    });
    const el = screen.getByTestId('blk');
    expect(el.getAttribute('data-state')).toBe('error');
    expect(screen.getByTestId('blk-error').textContent).toContain(
      '本區塊資料暫時無法取得，請稍後重試。',
    );
    expect(screen.getByTestId('blk-retry')).toBeInTheDocument();
    expect(screen.queryByTestId('content-body')).toBeNull();
    expect(screen.queryByTestId('blk-loading')).toBeNull();
  });

  it('TS-F111-FE-STATE-005（empty）：合法空狀態 → data-state=empty，與 error 明確不同', () => {
    renderStatus({
      loading: false,
      block: { error: false, value: 'X' },
      isEmpty: true,
    });
    const el = screen.getByTestId('blk');
    expect(el.getAttribute('data-state')).toBe('empty');
    expect(screen.getByTestId('blk-empty').textContent).toContain(
      '本區塊目前無資料',
    );
    expect(screen.queryByTestId('blk-error')).toBeNull();
    expect(screen.queryByTestId('content-body')).toBeNull();
  });

  it('content 態：block.error=false 且非空 → data-state=content，渲染子內容', () => {
    renderStatus({ loading: false, block: { error: false, value: '就緒' } });
    const el = screen.getByTestId('blk');
    expect(el.getAttribute('data-state')).toBe('content');
    expect(screen.getByTestId('content-body').textContent).toBe('就緒');
    expect(screen.queryByTestId('blk-loading')).toBeNull();
    expect(screen.queryByTestId('blk-error')).toBeNull();
    expect(screen.queryByTestId('blk-empty')).toBeNull();
  });

  it('三態互斥：任一時刻僅一個 data-state（loading/error/empty/content）存在於 DOM', () => {
    const { rerender } = renderStatus({ loading: true, block: undefined });
    expect(screen.getByTestId('blk').getAttribute('data-state')).toBe('loading');
    rerender(
      <OverviewBlockStatus<Sample>
        testId="blk"
        num={1}
        title="測試區塊"
        loading={false}
        block={{ error: true, errorCode: 'RUN_READINESS_UNAVAILABLE', message: 'E' }}
        onRetry={vi.fn()}
      >
        {(d) => <div data-testid="content-body">{d.value}</div>}
      </OverviewBlockStatus>,
    );
    expect(screen.getByTestId('blk').getAttribute('data-state')).toBe('error');
    // 同時只會有一個狀態 body
    const bodies = [
      screen.queryByTestId('blk-loading'),
      screen.queryByTestId('blk-error'),
      screen.queryByTestId('blk-empty'),
      screen.queryByTestId('content-body'),
    ].filter(Boolean);
    expect(bodies.length).toBe(1);
  });
});
