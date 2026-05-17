import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  PiiMaskBanner,
  isPiiMasked,
} from '../pii-mask-banner';

/**
 * F046 / F047 Phase 3 — C360 PII 遮罩提示 banner
 *
 * 規則（對齊後端 canSeeFullPii）：
 *   - admin → 不顯示（完整 PII）
 *   - businessRole='director' / 'section_chief' → 不顯示
 *   - 其他（plain user, businessRole=null）→ 顯示「您看到的是 masked 資料」
 */

describe('isPiiMasked (pure)', () => {
  it('admin → false', () => {
    expect(isPiiMasked('admin', null)).toBe(false);
    expect(isPiiMasked('admin', 'director')).toBe(false);
  });

  it('user + director → false（業務管理需要完整 PII）', () => {
    expect(isPiiMasked('user', 'director')).toBe(false);
  });

  it('user + section_chief → false', () => {
    expect(isPiiMasked('user', 'section_chief')).toBe(false);
  });

  it('user + null → true（plain user mask）', () => {
    expect(isPiiMasked('user', null)).toBe(true);
  });

  it('user + undefined → true', () => {
    expect(isPiiMasked('user', undefined)).toBe(true);
  });
});

describe('PiiMaskBanner (component)', () => {
  it('userRole=admin → 不渲染（null）', () => {
    const { container } = render(<PiiMaskBanner userRole="admin" businessRole={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('director → 不渲染', () => {
    const { container } = render(
      <PiiMaskBanner userRole="user" businessRole="director" />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('section_chief → 不渲染', () => {
    const { container } = render(
      <PiiMaskBanner userRole="user" businessRole="section_chief" />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('plain user → 渲染 banner（含「masked 資料」字樣）', () => {
    render(<PiiMaskBanner userRole="user" businessRole={null} />);
    const banner = screen.getByTestId('pii-mask-banner');
    expect(banner).toBeInTheDocument();
    expect(banner.textContent).toMatch(/masked|遮罩/);
  });

  it('plain user 顯示說明哪些欄位被遮罩', () => {
    render(<PiiMaskBanner userRole="user" businessRole={null} />);
    const banner = screen.getByTestId('pii-mask-banner');
    expect(banner.textContent).toContain('身分證');
  });
});
