import { ShieldCheck } from 'lucide-react';

/**
 * F046 / F047 Phase 3 — C360 PII 遮罩提示 banner
 *
 * 對齊後端 `canSeeFullPii(userRole, businessRole)` 邏輯：
 *   - admin / director / section_chief → 不顯示（完整 PII）
 *   - 其他（plain user, businessRole=null）→ 顯示「您看到的是 masked 資料」
 *
 * 對應 prototype: 26-customer-360-detail.html L305 之 `isUser` 概念
 *（Phase 3 進一步限縮為「businessRole=null 才視為 plain user」）。
 */

export function isPiiMasked(
  userRole: string | null | undefined,
  businessRole: string | null | undefined,
): boolean {
  const r = (userRole ?? '').toLowerCase();
  if (r === 'admin') return false;
  const br = (businessRole ?? '').toLowerCase();
  if (br === 'director' || br === 'section_chief') return false;
  return true;
}

export interface PiiMaskBannerProps {
  userRole: string | null | undefined;
  businessRole: string | null | undefined;
}

export function PiiMaskBanner({
  userRole,
  businessRole,
}: PiiMaskBannerProps) {
  if (!isPiiMasked(userRole, businessRole)) return null;
  return (
    <div
      data-testid="pii-mask-banner"
      role="status"
      className="rounded-lg p-3 bg-blue-50 border border-blue-200 flex items-start gap-2 text-sm"
    >
      <ShieldCheck className="w-4 h-4 text-primary mt-0.5 shrink-0" />
      <div className="flex-1">
        <p className="font-semibold text-blue-900">
          您看到的是已遮罩（masked）的客戶資料
        </p>
        <p className="text-xs text-blue-800 mt-0.5">
          依資料治理規範，<strong>身分證</strong>、<strong>行動電話</strong>、<strong>Email</strong>{' '}
          等敏感欄位已部分遮罩。如需完整資料請聯絡部長或處長。
        </p>
      </div>
    </div>
  );
}
