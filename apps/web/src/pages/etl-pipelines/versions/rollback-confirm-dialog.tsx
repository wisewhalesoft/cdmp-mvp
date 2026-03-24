import { History, X } from 'lucide-react';

interface RollbackConfirmDialogProps {
  open: boolean;
  versionNumber: number;
  onConfirm: () => void;
  onCancel: () => void;
}

export function RollbackConfirmDialog({
  open,
  versionNumber,
  onConfirm,
  onCancel,
}: RollbackConfirmDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50" data-testid="rollback-confirm-dialog">
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-xl w-[440px]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold">確認回滾版本</h2>
          <button
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-600"
            data-testid="rollback-close-btn"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-6 py-5">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-amber-50 rounded-full flex items-center justify-center flex-shrink-0">
              <History className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <p className="text-sm text-gray-700">
                將回滾至版本{' '}
                <span className="font-semibold" data-testid="rollback-version-label">
                  v{versionNumber}
                </span>
                ，系統將建立一個新的草稿版本。
              </p>
              <p className="text-sm text-gray-500 mt-2">
                回滾不會修改現有版本，而是複製該版本的定義建立新版本。
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
            data-testid="rollback-cancel-btn"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            data-testid="rollback-confirm-btn"
          >
            確認回滾
          </button>
        </div>
      </div>
    </div>
  );
}
