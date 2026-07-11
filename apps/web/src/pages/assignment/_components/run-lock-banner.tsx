import { AlertTriangle } from 'lucide-react';

/**
 * F069 AC-6 / F070 AC-6 / F071 AC-7 / F072 AC-8：月名單分派鎖警告 banner
 *
 * 對應 prototype 28 line 170~177（`monthLockBanner` 區塊）：
 *   - 當 assignment_run.status IN ('pending', 'running') 時顯示
 *   - 樣式：bg-amber-50 + border-amber-200 + text-amber-800
 *   - 文案：「分派執行中（assignment_run.status = running）」+ 提示
 *
 * 寫入按鈕的 disabled 邏輯由各 Tab 元件依 `isLocked` prop 各自處理。
 */

interface Props {
  /** 是否顯示 banner（依 assignment_run 狀態） */
  isLocked: boolean;
  /**
   * 月名單分派狀態文字（可選；預設 "running"）。
   * 若後端回傳 status='pending' 可帶入此 prop 客製顯示。
   */
  status?: string;
}

export function RunLockBanner({ isLocked, status = 'running' }: Props) {
  if (!isLocked) return null;

  return (
    <div
      role="alert"
      data-testid="run-lock-banner"
      className="mb-4 rounded-lg p-3 bg-amber-50 border border-amber-200 flex items-start gap-2 text-sm text-amber-800"
    >
      <AlertTriangle
        size={16}
        className="text-amber-600 mt-0.5 shrink-0"
      />
      <div>
        <p className="font-semibold">
          分派執行中（assignment_run.status = {status}）
        </p>
        <p className="text-xs mt-0.5">
          所有寫入功能（新增 / 編輯 / 停用）已暫時鎖定，鎖定將於月名單分派完成後自動解除
        </p>
      </div>
    </div>
  );
}
