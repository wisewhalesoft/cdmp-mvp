import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'react-router-dom';
import {
  forgotPasswordSchema,
  type ForgotPasswordFormData,
} from './forgot-password-schema';
import { forgotPassword } from '@/api/auth';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';

export function ForgotPasswordPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSent, setIsSent] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordFormData>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = async (data: ForgotPasswordFormData) => {
    setApiError(null);
    setIsSubmitting(true);
    try {
      await forgotPassword({ email: data.email });
      setIsSent(true);
    } catch {
      setApiError('發生錯誤，請稍後再試。');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 成功發送後顯示確認畫面
  if (isSent) {
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
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
          </div>

          <h1 className="text-xl font-bold text-gray-900 mb-3">
            若此 Email 存在，重設連結已寄出
          </h1>
          <p className="text-sm text-gray-500 leading-relaxed mb-8">
            請檢查您的信箱，並點擊信中的連結重設密碼。重設連結有效時間為 24 小時。
          </p>

          <Link
            to="/login"
            className="inline-flex items-center justify-center w-full bg-primary text-white font-medium py-2 px-4 rounded-md text-sm hover:bg-primary-700 transition-colors"
          >
            返回登入
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-full max-w-md mx-auto bg-surface rounded-lg shadow-sm p-8">
        <div className="text-center mb-6">
          <h1 className="text-xl font-bold text-gray-900">忘記密碼</h1>
          <p className="text-sm text-gray-500 mt-2">
            請輸入您的 Email 地址，我們將寄送密碼重設連結給您。
          </p>
        </div>

        {apiError && (
          <Alert variant="error" className="mb-4">
            {apiError}
          </Alert>
        )}

        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className="space-y-4">
            <Input
              label="Email"
              type="email"
              autoComplete="email"
              placeholder="user@example.com"
              error={errors.email?.message}
              {...register('email')}
            />

            <Button
              type="submit"
              className="w-full"
              loading={isSubmitting}
              loadingText="發送中..."
            >
              發送重設連結
            </Button>
          </div>
        </form>

        <div className="text-center mt-4">
          <Link
            to="/login"
            className="text-sm text-primary hover:text-primary-700"
          >
            返回登入
          </Link>
        </div>
      </div>
    </div>
  );
}
