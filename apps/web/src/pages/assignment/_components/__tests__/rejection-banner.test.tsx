import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RejectionBanner } from '../rejection-banner';

/**
 * 29b 拒絕 banner（full ↔ slim 折疊）
 *
 * 對應 prototype 29b-personnel-ratio-config.html L183-223
 *
 * 行為：
 *   - latestRejection = null → 不渲染
 *   - 初始為 full 模式
 *   - 點「折疊」→ slim 模式
 *   - 點「展開查看」→ 回 full 模式
 *   - 點「關閉」→ 觸發 onClose callback（父層可選擇隱藏）
 */

const REJECTION = {
  rejectReason: '南一處對 EMP011 配 35% 過高，請參考 4 月慣例調整為 25-30% 區間',
  rejectorId: 'dir-001',
  rejectorName: '張部長',
  rejectorRole: 'director',
  rejectedAt: '2026-05-15T13:42:00Z',
};

describe('RejectionBanner', () => {
  it('latestRejection = null 時不渲染', () => {
    const { container } = render(<RejectionBanner latestRejection={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('初始顯示 full 模式：拒絕原因 + 拒絕者 + 拒絕時間', () => {
    render(<RejectionBanner latestRejection={REJECTION} />);
    expect(screen.getByTestId('rejection-banner-full')).toBeInTheDocument();
    expect(screen.queryByTestId('rejection-banner-slim')).not.toBeInTheDocument();
    expect(screen.getByText(/南一處對 EMP011/)).toBeInTheDocument();
    expect(screen.getByText(/張部長/)).toBeInTheDocument();
  });

  it('rejectorRole=director 顯示 "部長" 標籤', () => {
    render(<RejectionBanner latestRejection={REJECTION} />);
    const banner = screen.getByTestId('rejection-banner-full');
    expect(banner.textContent).toContain('部長');
  });

  it('rejectorRole=section_chief 顯示 "處長" 標籤', () => {
    render(
      <RejectionBanner
        latestRejection={{ ...REJECTION, rejectorRole: 'section_chief' }}
      />,
    );
    const banner = screen.getByTestId('rejection-banner-full');
    expect(banner.textContent).toContain('處長');
  });

  it('rejectorName=null 時顯示 rejectorId 作為 fallback', () => {
    render(
      <RejectionBanner
        latestRejection={{ ...REJECTION, rejectorName: null }}
      />,
    );
    expect(screen.getByText(/dir-001/)).toBeInTheDocument();
  });

  it('點「折疊」按鈕 → 切到 slim 模式', () => {
    render(<RejectionBanner latestRejection={REJECTION} />);
    fireEvent.click(screen.getByTestId('btn-collapse'));
    expect(screen.queryByTestId('rejection-banner-full')).not.toBeInTheDocument();
    expect(screen.getByTestId('rejection-banner-slim')).toBeInTheDocument();
  });

  it('slim 模式點「展開查看」→ 回 full 模式', () => {
    render(<RejectionBanner latestRejection={REJECTION} />);
    fireEvent.click(screen.getByTestId('btn-collapse'));
    fireEvent.click(screen.getByTestId('btn-expand'));
    expect(screen.getByTestId('rejection-banner-full')).toBeInTheDocument();
    expect(screen.queryByTestId('rejection-banner-slim')).not.toBeInTheDocument();
  });

  it('點「關閉」→ 觸發 onClose callback', () => {
    const onClose = vi.fn();
    render(<RejectionBanner latestRejection={REJECTION} onClose={onClose} />);
    fireEvent.click(screen.getByTestId('btn-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('未提供 onClose 時點「關閉」不報錯（本地隱藏）', () => {
    render(<RejectionBanner latestRejection={REJECTION} />);
    expect(() => fireEvent.click(screen.getByTestId('btn-close'))).not.toThrow();
  });
});
