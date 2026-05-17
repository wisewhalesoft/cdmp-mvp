import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * F076-C — Categorical 欄位停用時的 cascade 確認 Modal
 *
 * 對應 spec: F075 v1.3 AC-6（UI 預查 → 顯示「將自動停用 N 個可選值」）
 *
 * 用途：
 *   - 使用者點「停用」categorical 欄位 → 先呼叫 GET active-options-count
 *   - 此 modal 顯示 active count 與級聯影響
 *   - 確認後 backend 一併軟停用該欄位下所有 active options
 */

export interface CategorySwitchConfirmModalProps {
  open: boolean;
  columnName: string;
  displayName: string;
  activeOptionsCount: number;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function CategorySwitchConfirmModal({
  open,
  columnName,
  displayName,
  activeOptionsCount,
  loading = false,
  onConfirm,
  onCancel,
}: CategorySwitchConfirmModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50" data-testid="category-switch-modal">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={loading ? undefined : onCancel}
      />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-warning" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-800">
                停用類別型欄位（F076-C 級聯）
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">F075 v1.3 AC-6</p>
            </div>
          </div>

          <div className="p-6 space-y-3">
            <p className="text-sm text-gray-700">
              即將停用欄位{' '}
              <code className="font-mono text-primary px-1.5 py-0.5 bg-blue-50 rounded text-xs">
                {columnName}
              </code>{' '}
              （<strong>{displayName}</strong>）
            </p>

            <div
              data-testid="cascade-warning"
              className="rounded-lg p-3 bg-amber-50 border border-amber-200 text-sm text-amber-900"
            >
              <p className="font-semibold mb-1">將自動級聯停用此欄位下所有 active 可選值</p>
              <p className="text-xs text-amber-800">
                共{' '}
                <span
                  data-testid="active-count"
                  className="font-mono font-bold text-amber-900 text-base"
                >
                  {activeOptionsCount}
                </span>{' '}
                個可選值將被軟停用。既有名單之 condition_payload 不受影響（資料保留），
                但新建名單將不再可選此欄位之可選值。
              </p>
            </div>

            <p className="text-xs text-gray-500">
              此操作為軟刪除；如需復原請聯絡 Admin。
            </p>
          </div>

          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              取消
            </button>
            <Button
              type="button"
              variant="danger"
              loading={loading}
              loadingText="停用中..."
              onClick={onConfirm}
            >
              確認停用（含 {activeOptionsCount} 個可選值）
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
