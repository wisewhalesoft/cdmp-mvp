import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MonthPicker } from '../MonthPicker';

describe('MonthPicker', () => {
  it('renders select with default ±12 months around currentYm', () => {
    render(<MonthPicker value="2026-05" onChange={vi.fn()} currentYm="2026-05" />);
    const select = screen.getByTestId('month-picker-select') as HTMLSelectElement;
    // 25 options total (12 prev + current + 12 next)
    expect(select.options.length).toBe(25);
    // current value selected
    expect(select.value).toBe('2026-05');
  });

  it('prev button decrements YYYY-MM', () => {
    const onChange = vi.fn();
    render(<MonthPicker value="2026-05" onChange={onChange} currentYm="2026-05" />);
    fireEvent.click(screen.getByTestId('month-picker-prev'));
    expect(onChange).toHaveBeenCalledWith('2026-04');
  });

  it('next button increments YYYY-MM', () => {
    const onChange = vi.fn();
    render(<MonthPicker value="2026-05" onChange={onChange} currentYm="2026-05" />);
    fireEvent.click(screen.getByTestId('month-picker-next'));
    expect(onChange).toHaveBeenCalledWith('2026-06');
  });

  it('wraps year boundary correctly (2025-12 → 2026-01)', () => {
    const onChange = vi.fn();
    render(<MonthPicker value="2025-12" onChange={onChange} currentYm="2025-12" />);
    fireEvent.click(screen.getByTestId('month-picker-next'));
    expect(onChange).toHaveBeenCalledWith('2026-01');
  });

  it('disables prev when at minimum range', () => {
    render(
      <MonthPicker value="2025-05" onChange={vi.fn()} currentYm="2026-05" rangeBackward={12} />,
    );
    expect(screen.getByTestId('month-picker-prev')).toBeDisabled();
  });

  it('disables next when at maximum range', () => {
    render(
      <MonthPicker value="2027-05" onChange={vi.fn()} currentYm="2026-05" rangeForward={12} />,
    );
    expect(screen.getByTestId('month-picker-next')).toBeDisabled();
  });

  it('select onChange triggers onChange callback', () => {
    const onChange = vi.fn();
    render(<MonthPicker value="2026-05" onChange={onChange} currentYm="2026-05" />);
    fireEvent.change(screen.getByTestId('month-picker-select'), {
      target: { value: '2026-03' },
    });
    expect(onChange).toHaveBeenCalledWith('2026-03');
  });
});
