import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Stage0InputPanel } from '../stage0-input-panel';

/**
 * F049 Stage 0 試算輸入區（左側）
 *
 * 對應 prototype 30-stage0-estimate.html L174-253
 *
 * 行為：
 *   - LIST_NO select（可從 active lists 中選）
 *   - 預估總筆數 input（number）
 *   - 起訖日 date inputs
 *   - 工作日來源 select
 *   - 變更時 onChange 通知父層
 */

const LISTS = [
  { listNo: 'OB202605001', listNm: '汽車期中名單' },
  { listNo: 'OB202605002', listNm: '機車期中名單' },
];

describe('Stage0InputPanel', () => {
  it('渲染所有輸入元素', () => {
    render(
      <Stage0InputPanel
        lists={LISTS}
        value={{
          listNo: '',
          totalCount: 9500,
          startDate: '2026-05-01',
          endDate: '2026-05-31',
          calendarSource: 'weekday',
        }}
        onChange={() => {}}
      />,
    );
    expect(screen.getByTestId('input-list-no')).toBeInTheDocument();
    expect(screen.getByTestId('input-total-count')).toBeInTheDocument();
    expect(screen.getByTestId('input-start-date')).toBeInTheDocument();
    expect(screen.getByTestId('input-end-date')).toBeInTheDocument();
    expect(screen.getByTestId('input-calendar-source')).toBeInTheDocument();
  });

  it('LIST_NO select 顯示所有可選名單', () => {
    render(
      <Stage0InputPanel
        lists={LISTS}
        value={{
          listNo: 'OB202605001',
          totalCount: 5000,
          startDate: '2026-05-01',
          endDate: '2026-05-31',
          calendarSource: 'weekday',
        }}
        onChange={() => {}}
      />,
    );
    const sel = screen.getByTestId('input-list-no') as HTMLSelectElement;
    expect(sel.value).toBe('OB202605001');
    expect(sel.options.length).toBeGreaterThanOrEqual(2);
  });

  it('change LIST_NO → onChange 帶入新 listNo', () => {
    const onChange = vi.fn();
    render(
      <Stage0InputPanel
        lists={LISTS}
        value={{
          listNo: 'OB202605001',
          totalCount: 5000,
          startDate: '2026-05-01',
          endDate: '2026-05-31',
          calendarSource: 'weekday',
        }}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByTestId('input-list-no'), {
      target: { value: 'OB202605002' },
    });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ listNo: 'OB202605002' }),
    );
  });

  it('change totalCount → onChange 帶入新值（number）', () => {
    const onChange = vi.fn();
    render(
      <Stage0InputPanel
        lists={LISTS}
        value={{
          listNo: 'OB202605001',
          totalCount: 5000,
          startDate: '2026-05-01',
          endDate: '2026-05-31',
          calendarSource: 'weekday',
        }}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByTestId('input-total-count'), {
      target: { value: '8000' },
    });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ totalCount: 8000 }),
    );
  });

  it('lists=[] 時 LIST_NO select 顯示 "尚無可選名單"', () => {
    render(
      <Stage0InputPanel
        lists={[]}
        value={{
          listNo: '',
          totalCount: 0,
          startDate: '',
          endDate: '',
          calendarSource: 'weekday',
        }}
        onChange={() => {}}
      />,
    );
    const sel = screen.getByTestId('input-list-no') as HTMLSelectElement;
    expect(sel.textContent).toContain('尚無可選名單');
  });

  // TS-F049-V13F-001（panel 層）：lists 非空時 selector 無「— 請選擇 —」空選項
  it('TS-F049-V13F-001：lists 非空 → 無空選項（option[value=""] 不存在）', () => {
    const { container } = render(
      <Stage0InputPanel
        lists={LISTS}
        value={{
          listNo: 'OB202605001',
          totalCount: 5000,
          startDate: '2026-05-01',
          endDate: '2026-05-31',
          calendarSource: 'weekday',
        }}
        onChange={() => {}}
      />,
    );
    const sel = screen.getByTestId('input-list-no') as HTMLSelectElement;
    // 第一個 option 即第一筆名單，無「— 請選擇 —」
    expect(sel.textContent).not.toContain('請選擇');
    expect(container.querySelector('option[value=""]')).toBeNull();
    expect(sel.options.length).toBe(LISTS.length);
  });

  // TS-F049-V13F-009（panel 層）：disabled 時 selector disabled
  it('TS-F049-V13F-009：disabled prop → selector disabled', () => {
    render(
      <Stage0InputPanel
        lists={[]}
        disabled
        value={{
          listNo: '',
          totalCount: 0,
          startDate: '',
          endDate: '',
          calendarSource: 'weekday',
        }}
        onChange={() => {}}
      />,
    );
    const sel = screen.getByTestId('input-list-no') as HTMLSelectElement;
    expect(sel.disabled).toBe(true);
  });

  it('顯示 AD-E07-8 演算法說明', () => {
    render(
      <Stage0InputPanel
        lists={LISTS}
        value={{
          listNo: 'OB202605001',
          totalCount: 5000,
          startDate: '2026-05-01',
          endDate: '2026-05-31',
          calendarSource: 'weekday',
        }}
        onChange={() => {}}
      />,
    );
    expect(screen.getByTestId('algorithm-explain')).toBeInTheDocument();
    expect(screen.getByText(/AD-E07-8/)).toBeInTheDocument();
  });
});
