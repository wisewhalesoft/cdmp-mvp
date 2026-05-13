import { ShieldCheck } from 'lucide-react';

/**
 * F002SM: Sales Manager 旗標 Badge — 顯示於 Top Bar
 *
 * 對應 prototype: /prototypes/27-list-definition.html 第 122-126 行
 * className 必須與 prototype 完全一致；icon 為 lucide shield-check，
 * 尺寸 w-3.5 h-3.5。
 *
 * 嚴格比對 isSalesManager === true（避免 truthy 誤判 e.g. "true" 字串）。
 * undefined / null / false / 其他 → 不渲染（DOM 中完全不存在，非 CSS 隱藏）。
 */
export interface SalesManagerBadgeProps {
  isSalesManager: boolean | null | undefined;
}

export function SalesManagerBadge({ isSalesManager }: SalesManagerBadgeProps) {
  // 嚴格比對：僅 boolean true 才渲染
  if (isSalesManager !== true) {
    return null;
  }

  return (
    <span
      data-testid="sales-manager-badge"
      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-amber-50 text-warning rounded-md border border-amber-200"
    >
      <ShieldCheck className="w-3.5 h-3.5" />
      Sales Manager
    </span>
  );
}
