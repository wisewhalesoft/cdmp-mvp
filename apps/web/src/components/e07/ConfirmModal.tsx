import type { ReactNode } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * ConfirmModal — 4 變體確認對話框（info / warning / danger / success）
 *
 * 對應 prototype: /prototypes/27-list-definition.html 停用 / 推進 / Rollback modal 結構
 *
 * 模式：
 *   - info     藍色 — 中性確認（推進、複製等）
 *   - warning  琥珀 — 注意操作（停用、停權等）
 *   - danger   紅色 — 不可逆破壞性（Rollback、刪除）
 *   - success  綠色 — 成功訊息確認
 */

export type ConfirmVariant = 'info' | 'warning' | 'danger' | 'success';

const VARIANT_CONFIG: Record<
  ConfirmVariant,
  {
    icon: typeof Info;
    iconBg: string;
    iconColor: string;
    confirmVariant: 'primary' | 'warning' | 'danger';
  }
> = {
  info: {
    icon: Info,
    iconBg: 'bg-blue-100',
    iconColor: 'text-primary',
    confirmVariant: 'primary',
  },
  warning: {
    icon: AlertTriangle,
    iconBg: 'bg-amber-100',
    iconColor: 'text-warning',
    confirmVariant: 'warning',
  },
  danger: {
    icon: AlertCircle,
    iconBg: 'bg-red-100',
    iconColor: 'text-danger',
    confirmVariant: 'danger',
  },
  success: {
    icon: CheckCircle2,
    iconBg: 'bg-green-100',
    iconColor: 'text-success',
    confirmVariant: 'primary',
  },
};

export interface ConfirmModalProps {
  open: boolean;
  variant?: ConfirmVariant;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  loadingText?: string;
  disabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  /** 自訂 modal 容器 testId（預設 `confirm-modal-${variant}`） */
  testId?: string;
  /** 自訂確認按鈕 testId（預設 undefined） */
  confirmTestId?: string;
}

export function ConfirmModal({
  open,
  variant = 'info',
  title,
  description,
  confirmLabel = '確認',
  cancelLabel = '取消',
  loading = false,
  loadingText = '處理中...',
  disabled = false,
  onConfirm,
  onCancel,
  testId,
  confirmTestId,
}: ConfirmModalProps) {
  if (!open) return null;
  const cfg = VARIANT_CONFIG[variant];
  const Icon = cfg.icon;

  return (
    <div className="fixed inset-0 z-50" data-testid={testId ?? `confirm-modal-${variant}`}>
      <div
        className="modal-backdrop absolute inset-0 bg-black/50"
        onClick={onCancel}
        data-testid="confirm-modal-backdrop"
      />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm relative">
          <div className="flex items-center justify-end px-2 pt-2">
            <button
              type="button"
              onClick={onCancel}
              aria-label="關閉"
              className="p-1 hover:bg-gray-100 rounded-md transition-colors"
            >
              <X className="w-4 h-4 text-gray-400" />
            </button>
          </div>
          <div className="px-6 pb-2 text-center">
            <div
              className={`w-12 h-12 rounded-full ${cfg.iconBg} flex items-center justify-center mx-auto mb-4`}
            >
              <Icon className={`w-6 h-6 ${cfg.iconColor}`} />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
            {description && (
              <div className="text-sm text-gray-500">{description}</div>
            )}
          </div>
          <div className="flex items-center justify-end gap-3 px-6 py-4">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              {cancelLabel}
            </button>
            <Button
              type="button"
              variant={cfg.confirmVariant}
              loading={loading}
              loadingText={loadingText}
              disabled={disabled}
              onClick={onConfirm}
              data-testid={confirmTestId}
            >
              {confirmLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
