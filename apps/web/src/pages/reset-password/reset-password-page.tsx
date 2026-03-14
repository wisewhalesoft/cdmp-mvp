import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useSearchParams } from 'react-router-dom';
import {
  resetPasswordSchema,
  type ResetPasswordFormData,
} from './reset-password-schema';
import { resetPassword } from '@/api/auth';
import { PasswordInput } from '@/components/ui/password-input';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';

type PageState = 'form' | 'success' | 'expired' | 'invalid';

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';

  const [pageState, setPageState] = useState<PageState>(
    token ? 'form' : 'invalid',
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordFormData>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { newPassword: '', confirmPassword: '' },
  });

  const onSubmit = async (data: ResetPasswordFormData) => {
    setApiError(null);
    setIsSubmitting(true);
    try {
      await resetPassword({ token, newPassword: data.newPassword });
      setPageState('success');
    } catch (err: unknown) {
      const error = err as {
        response?: { data?: { error?: string; message?: string } };
      };
      const errorCode = error.response?.data?.error;
      if (
        errorCode === 'AUTH_RESET_TOKEN_EXPIRED' ||
        errorCode === 'AUTH_RESET_TOKEN_USED'
      ) {
        setPageState('expired');
      } else if (errorCode === 'AUTH_RESET_TOKEN_INVALID') {
        setPageState('invalid');
      } else {
        setApiError(
          error.response?.data?.message || '發生錯誤，請稍後再試。',
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // 成功重設
  if (pageState === 'success') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-full max-w-md mx-auto bg-surface rounded-lg shadow-sm p-8 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-green-50 rounded-full mb-5">
            <svg
              className="w-8 h-8 text-green-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>

          <h1 className="text-xl font-bold text-gray-900 mb-3">
            密碼已成功重設
          </h1>
          <p className="text-sm text-gray-500 leading-relaxed mb-8">
            您的密碼已成功重設，請使用新密碼重新登入。
          </p>

          <Link
            to="/login"
            className="inline-flex items-center justify-center w-full bg-primary text-white font-medium py-2 px-4 rounded-md text-sm hover:bg-primary-700 transition-colors"
          >
            前往登入
          </Link>
        </div>
      </div>
    );
  }

  // 過期或已使用
  if (pageState === 'expired') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-full max-w-md mx-auto bg-surface rounded-lg shadow-sm p-8 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-red-50 rounded-full mb-5">
            <svg
              className="w-8 h-8 text-red-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <circle cx="12" cy="12" r="10" strokeWidth={2} />
              <polyline points="12 6 12 12 16 14" strokeWidth={2} />
            </svg>
          </div>

          <h1 className="text-xl font-bold text-gray-900 mb-3">連結已過期</h1>
          <p className="text-sm text-gray-500 leading-relaxed mb-6">
            此連結已過期，請重新申請密碼重設。
          </p>

          <Link
            to="/forgot-password"
            className="inline-flex items-center justify-center w-full bg-primary text-white font-medium py-2 px-4 rounded-md text-sm hover:bg-primary-700 transition-colors"
          >
            重新申請密碼重設
          </Link>
        </div>
      </div>
    );
  }

  // 無效 Token
  if (pageState === 'invalid') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-full max-w-md mx-auto bg-surface rounded-lg shadow-sm p-8 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-red-50 rounded-full mb-5">
            <svg
              className="w-8 h-8 text-red-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <circle cx="12" cy="12" r="10" strokeWidth={2} />
              <line x1="15" y1="9" x2="9" y2="15" strokeWidth={2} />
              <line x1="9" y1="9" x2="15" y2="15" strokeWidth={2} />
            </svg>
          </div>

          <h1 className="text-xl font-bold text-gray-900 mb-3">
            重設連結無效
          </h1>
          <p className="text-sm text-gray-500 leading-relaxed mb-6">
            此重設連結無效，請重新申請密碼重設。
          </p>

          <Link
            to="/forgot-password"
            className="inline-flex items-center justify-center w-full bg-primary text-white font-medium py-2 px-4 rounded-md text-sm hover:bg-primary-700 transition-colors"
          >
            重新申請密碼重設
          </Link>
        </div>
      </div>
    );
  }

  // 正常表單
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-full max-w-md mx-auto bg-surface rounded-lg shadow-sm p-8">
        <div className="text-center mb-6">
          <h1 className="text-xl font-bold text-gray-900">重設密碼</h1>
        </div>

        {apiError && (
          <Alert variant="error" className="mb-4">
            {apiError}
          </Alert>
        )}

        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className="space-y-4">
            <PasswordInput
              label="新密碼"
              autoComplete="new-password"
              error={errors.newPassword?.message}
              {...register('newPassword')}
            />

            <PasswordInput
              label="確認密碼"
              autoComplete="new-password"
              error={errors.confirmPassword?.message}
              {...register('confirmPassword')}
            />

            <Button
              type="submit"
              className="w-full"
              loading={isSubmitting}
              loadingText="重設中..."
            >
              重設密碼
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
