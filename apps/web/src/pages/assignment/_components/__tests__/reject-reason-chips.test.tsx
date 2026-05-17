import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  RejectReasonChips,
  DEFAULT_REJECT_REASONS,
} from '../reject-reason-chips';

/**
 * 29c 拒絕原因快速套用 chips
 *
 * 對應 prototype 29c-approval-review.html L417-421
 *
 * 行為：
 *   - 渲染 5 個 chip（預設 reasons）
 *   - 點 chip → 觸發 onApply(reason) 並帶入該 chip 對應的字串
 *   - 父層可自訂 reasons
 */

describe('RejectReasonChips', () => {
  it('預設渲染 5 個 chip', () => {
    render(<RejectReasonChips onApply={() => {}} />);
    const chips = screen.getAllByRole('button');
    expect(chips.length).toBe(5);
  });

  it('預設 5 個 reasons 與原型對齊', () => {
    expect(DEFAULT_REJECT_REASONS).toHaveLength(5);
    expect(DEFAULT_REJECT_REASONS[0].label).toBe('比例分配不均');
    expect(DEFAULT_REJECT_REASONS[4].label).toBe('拒絕原因待補充');
  });

  it('點 chip 觸發 onApply 並帶入完整 reason 文字（不是 label）', () => {
    const onApply = vi.fn();
    render(<RejectReasonChips onApply={onApply} />);
    fireEvent.click(screen.getByText('比例分配不均'));
    expect(onApply).toHaveBeenCalledWith(
      '比例分配不均，請參考 4 月慣例調整為均衡分配',
    );
  });

  it('父層自訂 reasons 時渲染對應數量', () => {
    const custom = [
      { label: 'A', value: 'reason A' },
      { label: 'B', value: 'reason B' },
    ];
    render(<RejectReasonChips reasons={custom} onApply={() => {}} />);
    expect(screen.getAllByRole('button').length).toBe(2);
    expect(screen.getByText('A')).toBeInTheDocument();
  });

  it('點自訂 chip 觸發 onApply 帶入 value', () => {
    const onApply = vi.fn();
    const custom = [{ label: 'X', value: 'reason X full text' }];
    render(<RejectReasonChips reasons={custom} onApply={onApply} />);
    fireEvent.click(screen.getByText('X'));
    expect(onApply).toHaveBeenCalledWith('reason X full text');
  });

  it('disabled 時所有 chip 都 disabled 且點擊不觸發 onApply', () => {
    const onApply = vi.fn();
    render(<RejectReasonChips onApply={onApply} disabled />);
    const chip = screen.getByText('比例分配不均');
    expect(chip.closest('button')).toBeDisabled();
    fireEvent.click(chip);
    expect(onApply).not.toHaveBeenCalled();
  });
});
