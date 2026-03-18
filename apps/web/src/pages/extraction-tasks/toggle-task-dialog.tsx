import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ToggleTaskDialogProps {
  open: boolean;
  taskName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ToggleTaskDialog({ open, taskName, onConfirm, onCancel }: ToggleTaskDialogProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
      data-testid="toggle-task-dialog"
    >
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex justify-center mb-4">
          <div className="w-12 h-12 rounded-full bg-yellow-100 flex items-center justify-center">
            <AlertTriangle className="w-6 h-6 text-yellow-600" />
          </div>
        </div>
        <h3 className="text-lg font-semibold text-gray-800 text-center mb-2">確認停用擷取任務</h3>
        <p className="text-sm text-gray-600 text-center mb-6">
          確定要停用擷取任務「<span className="font-medium">{taskName}</span>
          」嗎？停用後排程將不再自動觸發此任務。
        </p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition"
          >
            取消
          </button>
          <Button
            onClick={onConfirm}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            確認停用
          </Button>
        </div>
      </div>
    </div>
  );
}
