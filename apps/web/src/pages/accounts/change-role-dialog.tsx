import { useState, useEffect } from 'react';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ChangeRoleDialogProps {
  open: boolean;
  accountName: string;
  currentRole: 'admin' | 'user';
  loading: boolean;
  onConfirm: (newRole: 'admin' | 'user') => void;
  onCancel: () => void;
}

export function ChangeRoleDialog({
  open,
  accountName,
  currentRole,
  loading,
  onConfirm,
  onCancel,
}: ChangeRoleDialogProps) {
  const [selectedRole, setSelectedRole] = useState<'admin' | 'user'>(
    currentRole === 'admin' ? 'user' : 'admin',
  );

  // Reset selected role when dialog opens with a new currentRole
  useEffect(() => {
    if (open) {
      setSelectedRole(currentRole === 'admin' ? 'user' : 'admin');
    }
  }, [open, currentRole]);

  if (!open) return null;

  const displayCurrentRole = currentRole === 'admin' ? 'Admin' : 'User';

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onCancel}
        data-testid="dialog-backdrop"
      />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-md relative">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">變更角色</h3>
          </div>
          <div className="px-6 py-5 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">帳號名稱</label>
                <p className="text-sm font-medium text-gray-900">{accountName}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">目前角色</label>
                <p className="text-sm font-medium text-gray-900">{displayCurrentRole}</p>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">新角色</label>
              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value as 'admin' | 'user')}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              >
                <option value="admin">Admin</option>
                <option value="user">User</option>
              </select>
            </div>
            <div className="flex items-start gap-2 p-3 bg-amber-50 rounded-lg">
              <AlertCircle className="w-4 h-4 text-warning mt-0.5 shrink-0" />
              <p className="text-xs text-amber-700">
                變更角色將立即影響該使用者的系統權限。Admin 擁有完整管理權限，User 僅具備基本操作權限。
              </p>
            </div>
          </div>
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200">
            <Button type="button" variant="secondary" onClick={onCancel}>
              取消
            </Button>
            <Button
              type="button"
              variant="primary"
              loading={loading}
              loadingText="變更中..."
              onClick={() => onConfirm(selectedRole)}
            >
              確認變更
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
