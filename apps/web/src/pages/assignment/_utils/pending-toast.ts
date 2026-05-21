/**
 * F050 v2.2 §7 BR-13 / US-133 — sessionStorage Signal Protocol（cdmp.pendingToast）
 *
 * 跨頁 toast 訊號協定，限「子頁工作流完成後返回 M01 主頁」之情境使用。
 *
 * BR-13 規範摘要：
 * - Key：cdmp.pendingToast（全小寫、點分隔）
 * - Payload：{ type, msg, sub? }，type ∈ { success / info / warning / error }
 * - Producer（F079 / F082 / F086 / F087 等子頁）：成功 / 取消後、navigate 前 setItem
 * - Consumer（F048 v2.0 M01 主頁）：mount 時讀取 → 顯示 toast → 立即 removeItem
 * - Consume-once：同一 payload 不因 F5 / browser back / 多分頁重複顯示
 *
 * 失敗處理：以 try/catch 包覆，sessionStorage 不可用（無痕模式 / 配額耗盡）時
 * 靜默吞 exception，不阻擋跳轉。
 *
 * 不適用：同頁面內操作 toast（直接用 useToast）、Detail Drawer 操作回饋、
 * 橫向跨模組跳頁（如 M01 → M02）。
 */

export const PENDING_TOAST_KEY = 'cdmp.pendingToast';

export type PendingToastType = 'success' | 'info' | 'warning' | 'error';

export interface PendingToastPayload {
  type: PendingToastType;
  msg: string;
  sub?: string;
}

/**
 * Producer：子頁完成後寫入 sessionStorage，於 navigate 前呼叫。
 *
 * 例：
 *   writePendingToast({ type: 'success', msg: '車貸名單 OB202605001 部門比例已儲存',
 *                       sub: '已推進至個別比例設定階段' });
 *   navigate('/assignment/list-definitions');
 */
export function writePendingToast(payload: PendingToastPayload): void {
  try {
    if (typeof window === 'undefined' || !window.sessionStorage) return;
    window.sessionStorage.setItem(PENDING_TOAST_KEY, JSON.stringify(payload));
  } catch {
    // BR-13 (3)：sessionStorage API 不可用時靜默吞 exception，不阻擋跳轉
  }
}

/**
 * Consumer：M01 主頁 mount 時呼叫；讀取後立即 removeItem 確保 consume-once。
 *
 * @returns 解析後 payload；無 key / 無效 JSON / 例外均回 null
 */
export function readAndClearPendingToast(): PendingToastPayload | null {
  try {
    if (typeof window === 'undefined' || !window.sessionStorage) return null;
    const raw = window.sessionStorage.getItem(PENDING_TOAST_KEY);
    if (raw === null) return null;
    // 不論 parse 成功與否，consume-once 語意均需先 remove
    window.sessionStorage.removeItem(PENDING_TOAST_KEY);
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (
        parsed &&
        typeof parsed === 'object' &&
        'type' in parsed &&
        'msg' in parsed &&
        typeof (parsed as { msg: unknown }).msg === 'string'
      ) {
        const type = (parsed as { type: unknown }).type;
        if (
          type === 'success' ||
          type === 'info' ||
          type === 'warning' ||
          type === 'error'
        ) {
          return parsed as PendingToastPayload;
        }
      }
      return null;
    } catch {
      // 無效 JSON：BR-13 (4) 靜默不顯示
      return null;
    }
  } catch {
    return null;
  }
}
