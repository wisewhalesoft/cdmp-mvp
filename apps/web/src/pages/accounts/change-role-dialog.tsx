import { useState, useEffect } from 'react';
import { AlertTriangle, AlertCircle, ArrowRight, ShieldCheck, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RoleBadge } from '@/components/e07/RoleBadge';
import type { EffectiveIdentity } from '@cdmp/shared';

interface ChangeRoleDialogProps {
  open: boolean;
  accountName: string;
  // F006a / AD-E07 v3.0：目標帳號當前實質身份（admin/director/section_chief/user）
  currentIdentity: EffectiveIdentity;
  loading: boolean;
  // 父層依差異呼叫 PATCH /role 與/或 PATCH /business-role
  onConfirm: (newIdentity: EffectiveIdentity) => void;
  onCancel: () => void;
}

const OPTIONS: { value: EffectiveIdentity; description: string }[] = [
  { value: 'admin', description: 'role=admin（business_role=NULL）' },
  { value: 'director', description: 'role=user + business_role=director' },
  { value: 'section_chief', description: 'role=user + business_role=section_chief' },
  { value: 'user', description: 'role=user + business_role=NULL' },
];

export function ChangeRoleDialog({
  open,
  accountName,
  currentIdentity,
  loading,
  onConfirm,
  onCancel,
}: ChangeRoleDialogProps) {
  const [selected, setSelected] = useState<EffectiveIdentity | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    if (open) {
      setSelected(null);
      setShowConfirm(false);
    }
  }, [open]);

  if (!open) return null;

  const noChange = selected === null || selected === currentIdentity;

  const handleNextStep = () => {
    if (noChange) return;
    setShowConfirm(true);
  };

  const handleConfirm = () => {
    if (selected) onConfirm(selected);
  };

  if (showConfirm && selected) {
    return (
      <div className="fixed inset-0 z-[60]">
        <div
          className="modal-backdrop absolute inset-0 bg-black/50"
          onClick={onCancel}
          data-testid="confirm-backdrop"
        />
        <div className="absolute inset-0 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md relative">
            <div className="px-6 pt-6 pb-2 text-center">
              <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-4">
                <ShieldCheck className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3">確認角色變更</h3>
              <div className="flex items-center justify-center gap-3 mb-3">
                <div className="text-center">
                  <p className="text-xs text-gray-400 mb-1">目前角色</p>
                  <RoleBadge identity={currentIdentity} />
                </div>
                <ArrowRight className="w-5 h-5 text-gray-400" />
                <div className="text-center">
                  <p className="text-xs text-gray-400 mb-1">新角色</p>
                  <RoleBadge identity={selected} />
                </div>
              </div>
              <p className="text-sm text-gray-500 mb-1">
                確定要變更 <strong className="text-gray-900">{accountName}</strong> 的角色嗎？
              </p>
              <p className="text-[11px] text-amber-700 mt-2 flex items-start gap-1 justify-center">
                <AlertCircle className="w-3 h-3 mt-0.5" />
                <span>此帳號需重新登入後新角色才生效</span>
              </p>
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

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="modal-backdrop absolute inset-0 bg-black/50"
        onClick={onCancel}
        data-testid="dialog-backdrop"
      />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg relative">
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
                <RoleBadge identity={currentIdentity} />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                新角色（4 選 1）
              </label>
              <div className="space-y-1.5" role="radiogroup" aria-label="新角色">
                {OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className="flex items-center gap-2 cursor-pointer p-2 rounded-lg border border-gray-200 hover:border-primary/40 hover:bg-blue-50/40 transition-colors"
                  >
                    <input
                      type="radio"
                      name="newRole"
                      value={opt.value}
                      data-testid={`new-role-${opt.value}`}
                      checked={selected === opt.value}
                      onChange={() => setSelected(opt.value)}
                      className="h-4 w-4 border-gray-300 text-primary focus:ring-2 focus:ring-primary/20"
                    />
                    <RoleBadge identity={opt.value} />
                    <span className="text-xs text-gray-500 ml-auto">{opt.description}</span>
                  </label>
                ))}
              </div>
            </div>

            {selected && selected !== currentIdentity && (
              <div
                data-testid="role-preview-box"
                className="p-3 rounded-lg bg-gray-50 border border-gray-200"
              >
                <p className="text-xs text-gray-500 mb-2 font-medium">變更摘要</p>
                <div className="flex items-center justify-center gap-3">
                  <RoleBadge identity={currentIdentity} />
                  <ArrowRight className="w-4 h-4 text-gray-400" />
                  <RoleBadge identity={selected} />
                </div>
              </div>
            )}

            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
              <div className="text-xs text-amber-700 leading-relaxed">
                <p className="font-medium">該帳號需重新登入</p>
                <p className="mt-0.5">
                  變更角色將觸發 <code className="text-[10px]">password_changed_at</code> 更新，舊 JWT 立即失效（依 token-revoke 機制，回 401 AUTH_TOKEN_REVOKED）。
                </p>
              </div>
            </div>

            <p className="text-[11px] text-gray-400 font-mono">
              PATCH /accounts/:id/business-role（v3.0 唯一寫入入口）
            </p>
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
              disabled={noChange}
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
