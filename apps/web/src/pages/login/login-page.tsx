import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from 'react-router-dom';
import { loginSchema, type LoginFormData } from './login-schema';
import { login } from '@/api/auth';
import { setAuth, getDefaultHomePath } from '@/stores/auth-store';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';

export function LoginPage() {
  const navigate = useNavigate();
  const [apiError, setApiError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
      rememberMe: false,
    },
  });

  const onSubmit = async (data: LoginFormData) => {
    setApiError(null);
    setIsSubmitting(true);
    try {
      const result = await login({
        email: data.email,
        password: data.password,
        rememberMe: data.rememberMe,
      });
      setAuth(result.token, result.user);
      // F002 v2.1.0 / US-177 / F111 登入後角色感知導向（§4.5 矩陣 / BR-Redirect）：
      //   admin                    → /（帳號管理）
      //   director / section_chief → /assignment/overview（分派總覽）
      //   一般使用者               → /c360/customers（Customer 360）
      // 須在 setAuth 之後呼叫 getDefaultHomePath()，才能讀到剛登入的身份。
      navigate(getDefaultHomePath());
    } catch (err: unknown) {
      const error = err as { response?: { status?: number } };
      const status = error.response?.status;
      if (status === 401) {
        setValue('password', '');
        setApiError('Email 或密碼錯誤');
      } else if (status === 403) {
        setApiError('您的帳號已被停用，請聯絡管理員。');
      } else if (status === 429) {
        setApiError('登入嘗試過於頻繁，請稍後再試。');
      } else {
        setApiError('發生未知錯誤，請稍後再試。');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-full max-w-md mx-auto mt-20 bg-surface rounded-lg shadow-sm p-8">
        <h1 className="text-2xl font-bold text-center mb-8">CDMP 企業客戶資料治理平台</h1>

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
              error={errors.email?.message}
              {...register('email')}
            />

            <PasswordInput
              label="密碼"
              autoComplete="current-password"
              error={errors.password?.message}
              {...register('password')}
            />

            <div className="flex items-center justify-between">
              <Checkbox label="記住我" {...register('rememberMe')} />
              <Link
                to="/forgot-password"
                className="text-sm text-primary hover:text-primary-700"
              >
                忘記密碼？
              </Link>
            </div>

            <Button
              type="submit"
              className="w-full"
              loading={isSubmitting}
              loadingText="登入中..."
            >
              登入
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
