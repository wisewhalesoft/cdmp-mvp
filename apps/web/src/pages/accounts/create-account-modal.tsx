import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createAccountSchema, type CreateAccountFormData } from './create-account-schema';
import { createAccount } from '@/api/accounts';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { X } from 'lucide-react';

interface CreateAccountModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const ROLE_OPTIONS = [
  { value: '', label: '── 系統角色 ──', disabled: true },
  { value: 'admin', label: '管理者（Admin）' },
  { value: 'user', label: '使用者（User）' },
  { value: '', label: '── 業務角色 ──', disabled: true },
  { value: 'business', label: '業務' },
  { value: 'marketing', label: '行銷（企劃）' },
  { value: 'customer_service', label: '客服' },
  { value: 'analyst', label: '分析師' },
  { value: 'supervisor', label: '主管' },
  { value: 'backend_ops', label: '後端作業（作服）' },
];

export function CreateAccountModal({ open, onClose, onSuccess }: CreateAccountModalProps) {
  const [apiError, setApiError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<CreateAccountFormData>({
    resolver: zodResolver(createAccountSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
      role: 'user',
    },
  });

  const handleClose = () => {
    reset();
    setApiError(null);
    onClose();
  };

  const onSubmit = async (data: CreateAccountFormData) => {
    setApiError(null);
    setIsSubmitting(true);
    try {
      await createAccount(data);
      reset();
      onSuccess();
    } catch (err: unknown) {
      const error = err as { response?: { status?: number; data?: { error?: string; message?: string } } };
      const status = error.response?.status;
      if (status === 409) {
        setError('email', { message: '此 Email 已有帳號存在' });
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
            <h3 className="text-lg font-semibold text-gray-900">建立帳號</h3>
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

              <PasswordInput
                label="密碼"
                placeholder="請輸入密碼"
                error={errors.password?.message}
                {...register('password')}
              />

              <Select
                label="角色"
                options={ROLE_OPTIONS}
                error={errors.role?.message}
                {...register('role')}
              />
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200">
              <Button type="button" variant="secondary" onClick={handleClose}>
                取消
              </Button>
              <Button type="submit" loading={isSubmitting} loadingText="建立中...">
                建立
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
