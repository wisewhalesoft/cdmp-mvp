import { useEffect, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp, X } from 'lucide-react';

/**
 * RejectBanner — 退件提示橫幅（折疊 + LocalStorage 記憶 dismiss 狀態）
 *
 * 對應 prototype: /prototypes/27-list-definition.html / 27b-list-edit-draft.html
 *
 * 行為：
 *   - 預設展開顯示退件原因與時間
 *   - 使用者點 X 後 dismiss；以 storageKey 寫入 LocalStorage 記憶
 *     （即「該 list_no + reject id 組合」之 dismiss 狀態跨 session 持久化）
 *   - 點折疊 icon 切換摘要 / 完整描述
 *
 * 使用情境：F086/F087 簽核退件 — list edit draft 頁載入時，若 latestRejection 存在
 * 即 mount 此 banner。
 */

export interface RejectBannerProps {
  /** LocalStorage key — 通常為 `reject-banner:<listNo>:<rejectId>` 形式。 */
  storageKey: string;
  /** 標題（例：「此名單已被退件」）。 */
  title: string;
  /** 退件原因（顯示於展開段）。 */
  reason: string;
  /** 退件者（顯示於 meta 行）。 */
  rejectedBy?: string;
  /** 退件時間（顯示於 meta 行；可為 ISO 字串或已格式化字串）。 */
  rejectedAt?: string;
}

export function RejectBanner({
  storageKey,
  title,
  reason,
  rejectedBy,
  rejectedAt,
}: RejectBannerProps) {
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(storageKey) === 'dismissed';
  });
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    if (dismissed && typeof window !== 'undefined') {
      window.localStorage.setItem(storageKey, 'dismissed');
    }
  }, [dismissed, storageKey]);

  if (dismissed) return null;

  return (
    <div
      data-testid="reject-banner"
      className="rounded-lg p-3 bg-red-50 border border-red-200 flex items-start gap-2 text-sm"
    >
      <AlertTriangle className="w-4 h-4 text-danger mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="font-semibold text-red-800">{title}</p>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              aria-label={expanded ? '折疊' : '展開'}
              data-testid="reject-banner-toggle"
              onClick={() => setExpanded((v) => !v)}
              className="p-1 hover:bg-red-100 rounded-md text-red-700"
            >
              {expanded ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>
            <button
              type="button"
              aria-label="關閉"
              data-testid="reject-banner-dismiss"
              onClick={() => setDismissed(true)}
              className="p-1 hover:bg-red-100 rounded-md text-red-700"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        {expanded && (
          <>
            <p className="text-xs text-red-700 mt-1 leading-relaxed">{reason}</p>
            {(rejectedBy || rejectedAt) && (
              <p className="text-[11px] text-red-600 mt-1 font-mono">
                {rejectedBy && <span>{rejectedBy}</span>}
                {rejectedBy && rejectedAt && <span> · </span>}
                {rejectedAt && <span>{rejectedAt}</span>}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
