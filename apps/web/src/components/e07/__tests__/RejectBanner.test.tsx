import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { RejectBanner } from '../RejectBanner';

describe('RejectBanner', () => {
  beforeEach(() => {
    window.localStorage.clear();
    cleanup();
  });

  it('預設展開顯示 reason + meta', () => {
    render(
      <RejectBanner
        storageKey="reject:test:1"
        title="此名單已被退件"
        reason="部門比例不符合常理"
        rejectedBy="王部長"
        rejectedAt="2026-05-10"
      />,
    );
    expect(screen.getByTestId('reject-banner')).toBeInTheDocument();
    expect(screen.getByText('此名單已被退件')).toBeInTheDocument();
    expect(screen.getByText('部門比例不符合常理')).toBeInTheDocument();
    expect(screen.getByText(/王部長/)).toBeInTheDocument();
  });

  it('點折疊按鈕後 reason 隱藏', () => {
    render(
      <RejectBanner storageKey="reject:test:2" title="退件" reason="ABC" />,
    );
    fireEvent.click(screen.getByTestId('reject-banner-toggle'));
    expect(screen.queryByText('ABC')).toBeNull();
  });

  it('點 X 後 dismiss + 寫入 LocalStorage', () => {
    render(
      <RejectBanner storageKey="reject:test:3" title="退件" reason="ABC" />,
    );
    fireEvent.click(screen.getByTestId('reject-banner-dismiss'));
    expect(screen.queryByTestId('reject-banner')).toBeNull();
    expect(window.localStorage.getItem('reject:test:3')).toBe('dismissed');
  });

  it('已 dismiss 過的 storageKey 在 re-mount 後不渲染', () => {
    window.localStorage.setItem('reject:test:4', 'dismissed');
    render(
      <RejectBanner storageKey="reject:test:4" title="退件" reason="ABC" />,
    );
    expect(screen.queryByTestId('reject-banner')).toBeNull();
  });
});
