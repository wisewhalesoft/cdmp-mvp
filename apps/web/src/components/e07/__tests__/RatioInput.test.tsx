import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { RatioInput, RatioSumIndicator } from '../RatioInput';

describe('RatioInput', () => {
  afterEach(() => cleanup());

  it('renders value', () => {
    render(<RatioInput value={25.5} onChange={vi.fn()} aria-label="ratio" />);
    expect((screen.getByLabelText('ratio') as HTMLInputElement).value).toBe('25.5');
  });

  it('onChange clamps to 100 max', () => {
    const onChange = vi.fn();
    render(<RatioInput value={50} onChange={onChange} aria-label="ratio" />);
    fireEvent.change(screen.getByLabelText('ratio'), { target: { value: '150' } });
    expect(onChange).toHaveBeenCalledWith(100);
  });

  it('onChange clamps to 0 min', () => {
    const onChange = vi.fn();
    render(<RatioInput value={50} onChange={onChange} aria-label="ratio" />);
    fireEvent.change(screen.getByLabelText('ratio'), { target: { value: '-5' } });
    expect(onChange).toHaveBeenCalledWith(0);
  });

  it('rounds to 2 decimals', () => {
    const onChange = vi.fn();
    render(<RatioInput value={0} onChange={onChange} aria-label="ratio" />);
    fireEvent.change(screen.getByLabelText('ratio'), { target: { value: '33.333' } });
    expect(onChange).toHaveBeenCalledWith(33.33);
  });

  it('empty string → onChange(0)', () => {
    const onChange = vi.fn();
    render(<RatioInput value={50} onChange={onChange} aria-label="ratio" />);
    fireEvent.change(screen.getByLabelText('ratio'), { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith(0);
  });
});

describe('RatioSumIndicator', () => {
  afterEach(() => cleanup());

  it('values 加總 = 100 顯示 green valid', () => {
    render(<RatioSumIndicator values={[40, 30, 30]} />);
    const el = screen.getByTestId('ratio-sum-indicator');
    expect(el.dataset.valid).toBe('true');
    expect(el).toHaveTextContent('100.00%');
  });

  it('values 加總 = 99.99 (容忍 ±0.01 內) 仍視為 valid', () => {
    render(<RatioSumIndicator values={[33.33, 33.33, 33.34]} />);
    expect(screen.getByTestId('ratio-sum-indicator').dataset.valid).toBe('true');
  });

  it('values 加總 ≠ 100 顯示 red invalid', () => {
    render(<RatioSumIndicator values={[40, 30, 20]} />);
    const el = screen.getByTestId('ratio-sum-indicator');
    expect(el.dataset.valid).toBe('false');
    expect(el).toHaveTextContent('90.00%');
  });
});
