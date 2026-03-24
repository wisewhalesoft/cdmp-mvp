import { Rocket, Loader2, X } from 'lucide-react';

interface PublishConfirmDialogProps {
  open: boolean;
  versionNumber: number;
  loading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function PublishConfirmDialog({
  open,
  versionNumber,
  loading,
  onConfirm,
  onCancel,
}: PublishConfirmDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50" data-testid="publish-confirm-dialog">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={() => {
          if (!loading) onCancel();
        }}
      />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-xl w-[440px]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold">確認發布版本</h2>
          <button
            onClick={onCancel}
            disabled={loading}
            className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
            data-testid="publish-close-btn"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-6 py-5">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-green-50 rounded-full flex items-center justify-center flex-shrink-0">
              <Rocket className="w-5 h-5 text-green-500" />
            </div>
            <div>
              <p className="text-sm text-gray-700">
                確定要發布版本 <span className="font-semibold">v{versionNumber}</span> 嗎？
              </p>
              <p className="text-sm text-gray-500 mt-2">
                發布後此版本將成為排程執行的版本。Pipeline 狀態將可設為啟用。
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200">
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="publish-cancel-btn"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="px-4 py-2 text-sm bg-green-500 text-white rounded-lg hover:bg-green-600 flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
            data-testid="publish-confirm-btn"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                發布中...
              </>
            ) : (
              '確認發布'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
