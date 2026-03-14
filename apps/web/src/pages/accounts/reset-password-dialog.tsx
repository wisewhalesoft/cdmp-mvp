import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { PasswordInput } from '@/components/ui/password-input';
import { adminResetPasswordSchema, type AdminResetPasswordFormData } from './reset-password-schema';

interface ResetPasswordDialogProps {
  open: boolean;
  accountName: string;
  loading: boolean;
  onConfirm: (newPassword: string) => void;
  onCancel: () => void;
}

export function ResetPasswordDialog({
  open,
  accountName,
  loading,
  onConfirm,
  onCancel,
}: ResetPasswordDialogProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<AdminResetPasswordFormData>({
    resolver: zodResolver(adminResetPasswordSchema),
    defaultValues: {
      newPassword: '',
      confirmPassword: '',
    },
  });

  if (!open) return null;

  const onSubmit = (data: AdminResetPasswordFormData) => {
    onConfirm(data.newPassword);
  };

  const handleCancel = () => {
    reset();
    onCancel();
  };

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={handleCancel}
        data-testid="dialog-backdrop"
      />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-md relative">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">重設使用者密碼</h3>
          </div>
          <form onSubmit={handleSubmit(onSubmit)}>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">帳號名稱</label>
                <p className="text-sm font-medium text-gray-900">{accountName}</p>
              </div>
              <PasswordInput
                label="新密碼"
                {...register('newPassword')}
                error={errors.newPassword?.message}
              />
              <PasswordInput
                label="確認密碼"
                {...register('confirmPassword')}
                error={errors.confirmPassword?.message}
              />
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200">
              <Button type="button" variant="secondary" onClick={handleCancel}>
                取消
              </Button>
              <Button
                type="submit"
                variant="danger"
                loading={loading}
                loadingText="重設中..."
              >
                重設密碼
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
