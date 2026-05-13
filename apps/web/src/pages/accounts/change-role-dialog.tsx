import { useState, useEffect } from 'react';
import { AlertCircle, ShieldCheck, ArrowRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { type UserRole, getRoleDisplayName } from '@cdmp/shared';

interface ChangeRoleDialogProps {
  open: boolean;
  accountName: string;
  currentRole: UserRole;
  // F008 v3.2 AC-10: 目前的業務主管旗標值（user 角色才有意義）
  currentIsSalesManager: boolean;
  loading: boolean;
  // F008 v3.2 BR-12 / AC-11: onConfirm 同時帶 newRole 與 newIsSalesManager
  // 呼叫端依差異決定呼叫哪些 API
  onConfirm: (newRole: UserRole, newIsSalesManager: boolean) => void;
  onCancel: () => void;
}

export function ChangeRoleDialog({
  open,
  accountName,
  currentRole,
  currentIsSalesManager,
  loading,
  onConfirm,
  onCancel,
}: ChangeRoleDialogProps) {
  const [selectedRole, setSelectedRole] = useState<UserRole>(currentRole);
  // ASSUMPTION 4: admin 帳號預設 checkbox 為未勾選；user 帳號預填當前值
  const initialSm = currentRole === 'user' ? currentIsSalesManager : false;
  const [selectedSm, setSelectedSm] = useState<boolean>(initialSm);
  const [showConfirm, setShowConfirm] = useState(false);

  // 每次 open 時重置 state
  useEffect(() => {
    if (open) {
      setSelectedRole(currentRole);
      setSelectedSm(currentRole === 'user' ? currentIsSalesManager : false);
      setShowConfirm(false);
    }
  }, [open, currentRole, currentIsSalesManager]);

  if (!open) return null;

  const displayCurrentRole = getRoleDisplayName(currentRole);
  const displayNewRole = getRoleDisplayName(selectedRole);

  const newRoleIsUser = selectedRole === 'user';
  const roleChanged = selectedRole !== currentRole;
  // user → user 才比對 flag；其他情境不視為 flag 變動（避免「admin→admin」誤判）
  const flagChanged =
    newRoleIsUser &&
    selectedSm !== (currentRole === 'user' ? currentIsSalesManager : false);

  // F008 v3.2 ASSUMPTION 2 / TS-F008-SM-INT-006: 情境 F — 無任何變更時 disable 下一步
  const nothingChanged = !roleChanged && !flagChanged;

  // 角色 select onChange：切換為非 user 時重置 checkbox
  const handleRoleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = e.target.value as UserRole;
    setSelectedRole(next);
    if (next !== 'user') {
      // ASSUMPTION 4：切回 user 時也預設未勾選（在 next === 'user' 時不主動設值；
      // 但若 next !== 'user' 必須重置為 false 避免 confirm 摘要殘留）
      setSelectedSm(false);
    } else {
      // 從非 user 切回 user：依 ASSUMPTION 4 預設未勾
      // 若 currentRole === 'user' 且 user 切回 user（沒變），仍維持先前值
      if (currentRole !== 'user') {
        setSelectedSm(false);
      }
    }
  };

  const handleNextStep = () => {
    if (nothingChanged) return;
    setShowConfirm(true);
  };

  const handleConfirm = () => {
    onConfirm(selectedRole, selectedSm);
    setShowConfirm(false);
  };

  // ===== Step 2: 確認對話框 =====
  if (showConfirm) {
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

              {/* F008 v3.2 AC-11: 業務主管權限摘要（僅當新角色 = User 時顯示） */}
              {newRoleIsUser && (
                <p
                  data-testid="confirm-sales-manager-summary"
                  className="text-xs mt-1"
                >
                  <span className="text-gray-500">業務主管權限：</span>
                  {selectedSm ? (
                    <span
                      data-testid="confirm-sales-manager-summary-value"
                      className="text-green-600 font-medium"
                    >
                      ✓ 啟用
                    </span>
                  ) : (
                    <span
                      data-testid="confirm-sales-manager-summary-value"
                      className="text-gray-500"
                    >
                      未啟用
                    </span>
                  )}
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

  // ===== Step 1: 選擇新角色 + 業務主管 checkbox =====
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
                onChange={handleRoleSelectChange}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
              >
                <option value="admin">管理者（Admin）</option>
                <option value="user">使用者（User）</option>
              </select>
            </div>

            {/* F008 v3.2 AC-10: 業務主管權限 checkbox（僅當新角色=User 時顯示） */}
            {newRoleIsUser && (
              <div
                data-testid="role-dialog-sales-manager-wrap"
                className="rounded-lg border border-amber-200 bg-amber-50/50 p-3"
              >
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    data-testid="role-dialog-sales-manager-flag"
                    checked={selectedSm}
                    onChange={(e) => setSelectedSm(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary focus:ring-2 focus:ring-primary/20"
                  />
                  <span className="flex-1">
                    <span className="flex items-center gap-1.5 text-sm font-medium text-gray-800">
                      <ShieldCheck className="w-3.5 h-3.5 text-warning" />
                      業務主管權限
                    </span>
                    <span className="block text-xs text-gray-500 mt-0.5 leading-relaxed">
                      啟用後此帳號可存取 E07 客戶名單分派與 E06 Customer 360
                    </span>
                  </span>
                </label>
              </div>
            )}

            <div className="flex items-start gap-2 p-3 bg-amber-50 rounded-lg">
              <AlertCircle className="w-4 h-4 text-warning mt-0.5 shrink-0" />
              <p className="text-xs text-amber-700">
                變更角色將立即影響該使用者的系統權限。Admin 擁有完整管理權限，User 僅具備基本操作權限。
              </p>
            </div>
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
              disabled={nothingChanged}
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
