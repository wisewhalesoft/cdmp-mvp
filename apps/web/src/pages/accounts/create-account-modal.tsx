import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ShieldCheck } from 'lucide-react';
import { createAccountSchema, type CreateAccountFormData } from './create-account-schema';
import { createAccount } from '@/api/accounts';
import type { CreateAccountRequest } from '@cdmp/shared';
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
  { value: 'admin', label: '管理者（Admin）' },
  { value: 'user', label: '使用者（User）' },
];

export function CreateAccountModal({ open, onClose, onSuccess }: CreateAccountModalProps) {
  const [apiError, setApiError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    watch,
    setValue,
    formState: { errors },
  } = useForm<CreateAccountFormData>({
    resolver: zodResolver(createAccountSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
      role: 'user',
      isSalesManager: false,
    },
  });

  const role = watch('role');
  const showSalesManagerCheckbox = role === 'user';

  const handleClose = () => {
    reset();
    setApiError(null);
    onClose();
  };

  // 角色 select 的 register（保留 RHF 控制）
  const roleRegister = register('role');

  const onSubmit = async (data: CreateAccountFormData) => {
    setApiError(null);
    setIsSubmitting(true);
    try {
      // F004 BR-9: admin 角色時 isSalesManager 強制為 false（前後端雙重保險）
      // F113 / US-179: 員工編號選填——留空（trim 後為空）時不送出該欄位。
      const empNo = data.employeeNo?.trim();
      const payload: CreateAccountRequest = {
        name: data.name,
        email: data.email,
        password: data.password,
        role: data.role,
        isSalesManager: data.role === 'user' ? (data.isSalesManager ?? false) : false,
        ...(empNo ? { employeeNo: empNo } : {}),
      };
      await createAccount(payload);
      reset();
      onSuccess();
    } catch (err: unknown) {
      const error = err as { response?: { status?: number; data?: { error?: string; message?: string } } };
      const status = error.response?.status;
      if (status === 409) {
        // F113: 依錯誤碼區分 Email 重複 vs 員工編號重複
        if (error.response?.data?.error === 'ACCOUNT_EMPLOYEE_NO_EXISTS') {
          setError('employeeNo', { message: '此員工編號已被使用' });
        } else {
          setError('email', { message: '此 Email 已有帳號存在' });
        }
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

              {/* F113 / US-179: 員工編號（選填，可作為登入帳號；無必填星號） */}
              <div>
                <Input
                  label="員工編號"
                  type="text"
                  maxLength={32}
                  placeholder="請輸入員工編號（選填）"
                  error={errors.employeeNo?.message}
                  {...register('employeeNo')}
                />
                <p className="text-xs text-gray-400 mt-1">
                  選填；可作為登入帳號（英數、-、_，最多 32 字，不含 @）
                </p>
              </div>

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
                {...roleRegister}
                onChange={(e) => {
                  // F004 AC-6 / BR-9: 角色切換為非 user 時重置 SM checkbox
                  roleRegister.onChange(e);
                  if (e.target.value !== 'user') {
                    setValue('isSalesManager', false);
                  }
                }}
              />

              {/* F004 AC-6: 業務主管權限 checkbox（僅當 role=user 時顯示） */}
              {showSalesManagerCheckbox && (
                <div
                  data-testid="create-sales-manager-wrap"
                  className="rounded-lg border border-amber-200 bg-amber-50/50 p-3"
                >
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      data-testid="create-sales-manager-flag"
                      className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary focus:ring-2 focus:ring-primary/20"
                      {...register('isSalesManager')}
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
