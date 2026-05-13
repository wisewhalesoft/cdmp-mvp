import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ShieldCheck, ShieldOff, X } from 'lucide-react';
import { editAccountSchema, type EditAccountFormData } from './edit-account-schema';
import { updateAccount } from '@/api/accounts';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import type { AccountListItem } from '@cdmp/shared';

interface EditAccountModalProps {
  open: boolean;
  account: AccountListItem | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function EditAccountModal({ open, account, onClose, onSuccess }: EditAccountModalProps) {
  const [apiError, setApiError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<EditAccountFormData>({
    resolver: zodResolver(editAccountSchema),
    defaultValues: {
      name: '',
      email: '',
    },
  });

  // Reset form when account changes
  useEffect(() => {
    if (account) {
      reset({
        name: account.name,
        email: account.email,
      });
    }
    setApiError(null);
  }, [account, reset]);

  const handleClose = () => {
    setApiError(null);
    onClose();
  };

  const onSubmit = async (data: EditAccountFormData) => {
    if (!account) return;

    setApiError(null);
    setIsSubmitting(true);
    try {
      // F006 BR-6: 僅送出 name 與 email，不含 isSalesManager
      await updateAccount(account.id, data);
      onSuccess();
    } catch (err: unknown) {
      const error = err as { response?: { status?: number; data?: { error?: string; message?: string } } };
      const status = error.response?.status;
      if (status === 409) {
        setError('email', { message: '此 Email 已被使用' });
      } else if (status === 404) {
        setApiError('找不到指定的帳號');
      } else if (status === 422) {
        setApiError(error.response?.data?.message || '欄位驗證失敗');
      } else {
        setApiError('發生未知錯誤，請稍後再試。');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!open) return null;

  // F006 SM: chip 雙狀態判定，嚴格比對 true（null/undefined 視同 false）
  const isSalesManager = account?.is_sales_manager === true;
  // F006 AC-5: Admin 帳號不顯示 chip
  const showSalesManagerChip = account?.role === 'user';

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={handleClose}
        data-testid="modal-backdrop"
      />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-md relative">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">編輯帳號</h3>
            <button
              onClick={handleClose}
              className="p-1 hover:bg-gray-100 rounded-md"
              aria-label="關閉"
            >
              <X size={20} className="text-gray-400" />
            </button>
          </div>

          {apiError && (
            <div className="px-6 pt-4">
              <Alert variant="error">{apiError}</Alert>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <div className="px-6 py-5 space-y-4">
              <Input
                label="姓名"
                placeholder="請輸入姓名"
                maxLength={100}
                error={errors.name?.message}
                {...register('name')}
              />

              <Input
                label="Email"
                type="email"
                placeholder="請輸入 Email"
                error={errors.email?.message}
                {...register('email')}
              />

              {/* F006 SM: 業務主管權限 read-only chip（僅 user 角色顯示） */}
              {showSalesManagerChip && (
                <div data-testid="edit-sales-manager-wrap">
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    業務主管權限
                  </label>
                  <div className="flex items-center gap-2 flex-wrap">
                    {isSalesManager ? (
                      <span
                        data-testid="edit-sales-manager-chip"
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full bg-amber-50 text-amber-700 border border-amber-200"
                      >
                        <ShieldCheck className="w-3.5 h-3.5" />
                        業務主管權限：已啟用
                      </span>
                    ) : (
                      <span
                        data-testid="edit-sales-manager-chip"
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-600"
                      >
                        <ShieldOff className="w-3.5 h-3.5" />
                        業務主管權限：未啟用
                      </span>
                    )}
                    <span className="text-xs text-gray-400">
                      需變更請至變更角色 dialog
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200">
              <Button type="button" variant="secondary" onClick={handleClose}>
                取消
              </Button>
              <Button type="submit" loading={isSubmitting} loadingText="儲存中...">
                儲存
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
