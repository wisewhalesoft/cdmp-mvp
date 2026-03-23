import { Rocket, Loader2 } from 'lucide-react';

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
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onCancel();
      }}
      data-testid="publish-confirm-dialog"
    >
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex justify-center mb-4">
          <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
            <Rocket className="w-6 h-6 text-green-600" />
          </div>
        </div>
        <h3 className="text-lg font-semibold text-gray-800 text-center mb-2">
          確認發布版本
        </h3>
        <p className="text-sm text-gray-600 text-center mb-2">
          確定要發布版本 v{versionNumber} 嗎？
        </p>
        <p className="text-sm text-gray-500 text-center mb-6">
          發布後此版本將成為排程執行的版本。Pipeline 狀態將可設為啟用。
        </p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition disabled:opacity-50"
            data-testid="publish-cancel-btn"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition flex items-center gap-1.5 disabled:opacity-50"
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
