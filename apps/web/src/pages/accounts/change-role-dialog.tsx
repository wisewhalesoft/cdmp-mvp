import { useState, useEffect } from 'react';
import { AlertCircle, Info, ShieldCheck, ArrowRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { type UserRole, getRoleDisplayName } from '@cdmp/shared';

interface ChangeRoleDialogProps {
  open: boolean;
  accountName: string;
  currentRole: UserRole;
  loading: boolean;
  onConfirm: (newRole: UserRole) => void;
  onCancel: () => void;
}

const BUSINESS_ROLES: UserRole[] = [
  'business',
  'marketing',
  'customer_service',
  'analyst',
  'supervisor',
  'backend_ops',
];

function isBusinessRole(role: UserRole): boolean {
  return BUSINESS_ROLES.includes(role);
}

export function ChangeRoleDialog({
  open,
  accountName,
  currentRole,
  loading,
  onConfirm,
  onCancel,
}: ChangeRoleDialogProps) {
  const [selectedRole, setSelectedRole] = useState<UserRole>('user');
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    if (open) {
      const defaultRole: UserRole = currentRole === 'admin' ? 'user' : 'admin';
      setSelectedRole(defaultRole);
      setShowConfirm(false);
    }
  }, [open, currentRole]);

  if (!open) return null;

  const displayCurrentRole = getRoleDisplayName(currentRole);
  const displayNewRole = getRoleDisplayName(selectedRole);
  const selectedIsBusinessRole = isBusinessRole(selectedRole);
  const selectedIsSystemRole = !selectedIsBusinessRole;

  const handleNextStep = () => {
    if (selectedRole === currentRole) return;
    setShowConfirm(true);
  };

  const handleConfirm = () => {
    onConfirm(selectedRole);
    setShowConfirm(false);
  };

  // ===== Step 2: 確認對話框 (max-w-sm, 居中圖標, badge 樣式) =====
  if (showConfirm) {
    const showBusinessNote = isBusinessRole(selectedRole) || isBusinessRole(currentRole);

    return (
      <div className="fixed inset-0 z-[60]">
        <div
          className="modal-backdrop absolute inset-0 bg-black/50"
          onClick={onCancel}
          data-testid="confirm-backdrop"
        />
        <div className="absolute inset-0 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm relative">
            <div className="px-6 pt-6 pb-2 text-center">
              <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-4">
                <ShieldCheck className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3">確認角色變更</h3>
              <div className="flex items-center justify-center gap-3 mb-3">
                <div className="text-center">
                  <p className="text-xs text-gray-400 mb-1">目前角色</p>
                  <span className="inline-flex px-2.5 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-700">
                    {displayCurrentRole}
                  </span>
                </div>
                <ArrowRight className="w-5 h-5 text-gray-400" />
                <div className="text-center">
                  <p className="text-xs text-gray-400 mb-1">新角色</p>
                  <span className="inline-flex px-2.5 py-1 text-xs font-medium rounded-full bg-primary/10 text-primary">
                    {displayNewRole}
                  </span>
                </div>
              </div>
              <p className="text-sm text-gray-500 mb-1">
                確定要變更 <strong className="text-gray-900">{accountName}</strong> 的角色嗎？
              </p>
              {showBusinessNote && (
                <p className="text-xs text-amber-600">
                  此變更將影響使用者在 Customer 360 模組中的存取權限
                </p>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4">
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                取消
              </button>
              <Button
                type="button"
                variant="primary"
                loading={loading}
                loadingText="變更中..."
                onClick={handleConfirm}
              >
                確認變更
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ===== Step 1: 選擇新角色 =====
  return (
    <div className="fixed inset-0 z-50">
      <div
        className="modal-backdrop absolute inset-0 bg-black/50"
        onClick={onCancel}
        data-testid="dialog-backdrop"
      />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-md relative">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">變更角色</h3>
            <button
              onClick={onCancel}
              className="p-1 hover:bg-gray-100 rounded-md transition-colors"
              aria-label="關閉"
            >
              <X className="w-5 h-5 text-gray-400" />
            </button>
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
                onChange={(e) => setSelectedRole(e.target.value as UserRole)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
              >
                <optgroup label="系統角色">
                  <option value="admin">管理者（Admin）</option>
                  <option value="user">使用者（User）</option>
                </optgroup>
                <optgroup label="業務角色">
                  <option value="business">業務</option>
                  <option value="marketing">行銷（企劃）</option>
                  <option value="customer_service">客服</option>
                  <option value="analyst">分析師</option>
                  <option value="supervisor">主管</option>
                  <option value="backend_ops">後端作業（作服）</option>
                </optgroup>
              </select>
            </div>
            {/* 系統角色提示 */}
            {selectedIsSystemRole && (
              <div className="flex items-start gap-2 p-3 bg-amber-50 rounded-lg">
                <AlertCircle className="w-4 h-4 text-warning mt-0.5 shrink-0" />
                <p className="text-xs text-amber-700">
                  變更角色將立即影響該使用者的系統權限。Admin 擁有完整管理權限，User 僅具備基本操作權限。
                </p>
              </div>
            )}
            {/* 業務角色提示 */}
            {selectedIsBusinessRole && (
              <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-lg">
                <Info className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                <p className="text-xs text-primary">
                  變更業務角色將影響使用者在 Customer 360 模組中的存取權限，包含欄位可見性、遮罩規則與功能開關。
                </p>
              </div>
            )}
          </div>
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              取消
            </button>
            <Button
              type="button"
              variant="primary"
              disabled={selectedRole === currentRole}
              onClick={handleNextStep}
            >
              下一步
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
