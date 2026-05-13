import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { SalesManagerBadge } from '../sales-manager-badge';

/**
 * F002SM: Sales Manager 旗標顯示於 Top Bar
 * 對應 test spec docs/test-specs/features/F002SM-test.md：
 *   - TS-F002SM-007: isSalesManager=true 時顯示 Badge
 *   - TS-F002SM-008: className 完全符合 prototype 27 第 123 行
 *   - TS-F002SM-009: icon 使用 shield-check（lucide-react）尺寸 w-3.5 h-3.5
 *   - TS-F002SM-010: isSalesManager=false 時不渲染 Badge
 *   - TS-F002SM-011: isSalesManager=undefined 時不渲染 Badge
 *   - TS-F002SM-012: isSalesManager=null 時不渲染 Badge
 *   - TS-F002SM-013: Admin 角色不渲染 Badge（嚴格比對 isSalesManager === true）
 */
describe('SalesManagerBadge', () => {
  // TS-F002SM-007: 顯示 Badge
  it('renders the badge when isSalesManager === true', () => {
    render(<SalesManagerBadge isSalesManager={true} />);
    const badge = screen.getByTestId('sales-manager-badge');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent('Sales Manager');
  });

  // TS-F002SM-008: className 完全符合 prototype 27 第 123 行
  it('applies the exact className from prototype 27 line 123', () => {
    render(<SalesManagerBadge isSalesManager={true} />);
    const badge = screen.getByTestId('sales-manager-badge');

    const requiredClasses = [
      'inline-flex',
      'items-center',
      'gap-1.5',
      'px-2.5',
      'py-1',
      'text-xs',
      'font-medium',
      'bg-amber-50',
      'text-warning',
      'rounded-md',
      'border',
      'border-amber-200',
    ];

    for (const cls of requiredClasses) {
      expect(badge.className.split(/\s+/)).toContain(cls);
    }
  });

  // TS-F002SM-009: icon 使用 shield-check（Lucide），尺寸 w-3.5 h-3.5
  it('uses the shield-check icon at w-3.5 h-3.5', () => {
    const { container } = render(<SalesManagerBadge isSalesManager={true} />);

    // lucide-react renders the icon as an <svg> with class `lucide-shield-check`
    const icon = container.querySelector('svg');
    expect(icon).not.toBeNull();
    expect(icon?.classList.contains('lucide-shield-check')).toBe(true);
    expect(icon?.classList.contains('w-3.5')).toBe(true);
    expect(icon?.classList.contains('h-3.5')).toBe(true);
  });

  // TS-F002SM-010: isSalesManager=false → 不渲染
  it('does not render the badge when isSalesManager === false', () => {
    const { container } = render(<SalesManagerBadge isSalesManager={false} />);
    expect(container.querySelector('[data-testid="sales-manager-badge"]')).toBeNull();
    expect(screen.queryByText('Sales Manager')).not.toBeInTheDocument();
  });

  // TS-F002SM-011: isSalesManager=undefined → 不渲染
  it('does not render the badge when isSalesManager is undefined', () => {
    const { container } = render(<SalesManagerBadge isSalesManager={undefined} />);
    expect(container.querySelector('[data-testid="sales-manager-badge"]')).toBeNull();
  });

  // TS-F002SM-012: isSalesManager=null → 不渲染（嚴格比對）
  it('does not render the badge when isSalesManager is null', () => {
    // null 在型別簽章上被視為非 boolean，但 props 來源可能來自 JSON.parse
    // 故此處明確驗證執行期行為以滿足 TS-F002SM-012
    const { container } = render(
      <SalesManagerBadge isSalesManager={null as unknown as boolean} />,
    );
    expect(container.querySelector('[data-testid="sales-manager-badge"]')).toBeNull();
  });

  // TS-F002SM-013: 非嚴格比對保護 — 字串 "true" 不應觸發顯示
  it('does not render the badge when isSalesManager is the string "true" (strict comparison)', () => {
    const { container } = render(
      <SalesManagerBadge isSalesManager={'true' as unknown as boolean} />,
    );
    expect(container.querySelector('[data-testid="sales-manager-badge"]')).toBeNull();
  });
});
