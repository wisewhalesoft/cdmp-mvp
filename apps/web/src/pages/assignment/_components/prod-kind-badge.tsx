import { AlertCircle, Bike, Car, Package } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  PROD_KIND_FALLBACK_STYLE,
  PROD_KIND_STYLES,
  type ProdKindStyle,
} from '@/api/card-type';

/**
 * F069 AC-4：PROD_KIND badge 元件
 *
 * 對應 prototype 28 line 1014~1026 `prodKindBadge()` 函式：
 *   - 01 → 藍色（汽車，car icon）
 *   - 02 → 翠綠（機車，bike icon）
 *   - 03 → 紫色（一般商品，package icon）
 *   - fallback（PROD_KIND 已停用 / 對照不存在）→ 灰色 + alert-circle
 *
 * Size：
 *   - 'md'（預設）：rounded-full + px-2 + text-xs（表格列、Modal 使用）
 *   - 'sm'：rounded + px-1.5 + text-[10px]（banner / 標題列旁使用）
 */

type Size = 'sm' | 'md';

interface Props {
  /** PROD_KIND code（如 '01' / '02' / '03'） */
  prodKind: string | null | undefined;
  /** 對應名稱（若為 null 視為 PROD_KIND 已停用，顯示 fallback 樣式） */
  prodKindName?: string | null;
  size?: Size;
  /** 是否在 badge 內顯示 code（true）或僅顯示名稱（false） */
  showCode?: boolean;
}

const ICON_MAP: Record<ProdKindStyle['icon'], LucideIcon> = {
  car: Car,
  bike: Bike,
  package: Package,
  'alert-circle': AlertCircle,
};

export function ProdKindBadge({
  prodKind,
  prodKindName,
  size = 'md',
  showCode = true,
}: Props) {
  // 判定是否走 fallback：
  //   - prodKind 為空，或
  //   - prodKindName 顯式傳 null（後端 join 結果為 null）
  const styleKey = prodKind ?? '';
  const matched = PROD_KIND_STYLES[styleKey];
  const isFallback = !matched || prodKindName === null;
  const style = isFallback ? PROD_KIND_FALLBACK_STYLE : matched;
  const Icon = ICON_MAP[style.icon];

  // 顯示文字
  const displayName = isFallback
    ? style.name
    : prodKindName ?? style.name;

  // Iter 8（prototype B 排列）：sm 改為 px-2 py-0.5 text-xs font-semibold rounded，
  // 對齊 SelectedCardTypeBanner 身分區 badge 樣式。
  const containerClasses =
    size === 'sm'
      ? `inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded ${style.bg} ${style.text}`
      : `inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${style.bg} ${style.text}`;

  const iconSize = size === 'sm' ? 12 : 12;

  return (
    <span
      className={isFallback ? `${containerClasses} italic` : containerClasses}
      data-testid="prod-kind-badge"
      data-prod-kind={prodKind ?? 'fallback'}
    >
      <Icon size={iconSize} />
      {showCode && !isFallback ? `${prodKind} ${displayName}` : displayName}
    </span>
  );
}
