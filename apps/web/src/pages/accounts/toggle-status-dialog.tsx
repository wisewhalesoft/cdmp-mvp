import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ToggleStatusDialogProps {
  open: boolean;
  mode: 'disable' | 'enable';
  accountName: string;
  loading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ToggleStatusDialog({
  open,
  mode,
  accountName,
  loading,
  onConfirm,
  onCancel,
}: ToggleStatusDialogProps) {
  if (!open) return null;

  const isDisable = mode === 'disable';

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onCancel}
        data-testid="dialog-backdrop"
      />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm relative">
          <div className="px-6 pt-6 pb-2 text-center">
            {isDisable && (
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-6 h-6 text-danger" />
              </div>
            )}
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {isDisable ? '停用帳號' : '啟用帳號'}
            </h3>
            <p className="text-sm text-gray-500">
              {isDisable
                ? `您確定要停用 ${accountName} 的帳號嗎？停用後該使用者將無法登入系統。`
                : `確定要啟用 ${accountName} 的帳號嗎？`}
            </p>
          </div>
          <div className="flex items-center justify-end gap-3 px-6 py-4">
            <Button type="button" variant="secondary" onClick={onCancel}>
              取消
            </Button>
            <Button
              type="button"
              variant={isDisable ? 'danger' : 'primary'}
              loading={loading}
              loadingText={isDisable ? '停用中...' : '啟用中...'}
              onClick={onConfirm}
            >
              {isDisable ? '停用' : '啟用'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
