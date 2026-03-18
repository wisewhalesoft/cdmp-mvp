import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Users, Database, ArrowDownToLine, LogOut, ChevronRight } from 'lucide-react';
import { createDatasourceSchema, type CreateDatasourceFormData } from './create-datasource-schema';
import { createDatasource } from '@/api/datasources';
import { clearAuth, getUser } from '@/stores/auth-store';
import { logout } from '@/api/auth';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';

const TYPE_OPTIONS = [
  { value: '', label: '請選擇類型' },
  { value: 'mysql', label: 'MySQL' },
  { value: 'postgresql', label: 'PostgreSQL' },
  { value: 'sqlserver', label: 'SQL Server' },
];

const DEFAULT_PORTS: Record<string, number> = {
  mysql: 3306,
  postgresql: 5432,
  sqlserver: 1433,
};

export function AddDatasourcePage() {
  const navigate = useNavigate();
  const user = getUser();
  const { showToast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors },
  } = useForm<CreateDatasourceFormData>({
    resolver: zodResolver(createDatasourceSchema),
    mode: 'onBlur',
    defaultValues: {
      name: '',
      type: '' as CreateDatasourceFormData['type'],
      host: '',
      port: undefined as unknown as number,
      databaseName: '',
      username: '',
      password: '',
      description: '',
    },
  });

  const selectedType = watch('type');

  useEffect(() => {
    if (selectedType && DEFAULT_PORTS[selectedType]) {
      setValue('port', DEFAULT_PORTS[selectedType]);
    }
  }, [selectedType, setValue]);

  const handleLogout = async () => {
    try {
      await logout();
    } catch {
      // Graceful degradation
    } finally {
      clearAuth();
      navigate('/login');
    }
  };

  const onSubmit = async (data: CreateDatasourceFormData) => {
    setIsSubmitting(true);
    try {
      const payload = {
        ...data,
        description: data.description || undefined,
      };
      await createDatasource(payload);
      showToast('資料來源已新增', 'success');
      navigate('/datasources', { replace: true });
    } catch (err: unknown) {
      const error = err as { response?: { status?: number; data?: { error?: string; message?: string } } };
      if (error.response?.status === 409) {
        showToast('此名稱的資料來源已存在', 'error');
      } else {
        showToast('發生未知錯誤，請稍後再試', 'error');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside className="w-56 bg-white border-r border-gray-200 flex flex-col shrink-0">
        <div className="px-5 py-5 border-b border-gray-200">
          <h1 className="text-xl font-bold text-primary tracking-wide">CDMP</h1>
          <p className="text-xs text-gray-500 mt-0.5">資料治理平台</p>
        </div>
        <nav className="flex-1 py-3">
          <a
            href="/"
            className="flex items-center gap-3 px-5 py-2.5 text-sm text-gray-600 hover:bg-gray-50"
          >
            <Users size={20} />
            帳號管理
          </a>
          <a
            href="/datasources/new"
            className="flex items-center gap-3 px-5 py-2.5 text-sm text-primary bg-blue-50 border-l-[3px] border-primary font-medium"
          >
            <Database size={20} />
            資料來源
          </a>
          <a
            href="/extraction-tasks"
            className="flex items-center gap-3 px-5 py-2.5 text-sm text-gray-600 hover:bg-gray-50"
          >
            <ArrowDownToLine size={20} />
            資料擷取
          </a>
        </nav>
      </aside>

      {/* Main Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6 shrink-0">
          <h2 className="text-lg font-semibold text-gray-900">資料來源</h2>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-700">{user?.name}</span>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
            >
              <LogOut size={16} />
              登出
            </button>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 p-6">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-1.5 text-sm mb-6" aria-label="breadcrumb">
            <span className="text-gray-500">資料來源</span>
            <ChevronRight size={14} className="text-gray-400" />
            <span className="text-gray-900 font-medium">新增資料來源</span>
          </nav>

          {/* Form Card */}
          <div className="max-w-2xl mx-auto bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-6">新增資料來源</h3>

            <form onSubmit={handleSubmit(onSubmit)} noValidate>
              <div className="space-y-4">
                <Input
                  label="名稱"
                  placeholder="請輸入資料來源名稱"
                  maxLength={100}
                  error={errors.name?.message}
                  {...register('name')}
                />

                <Select
                  label="類型"
                  options={TYPE_OPTIONS}
                  error={errors.type?.message}
                  {...register('type')}
                />

                <Input
                  label="主機位址"
                  placeholder="例如：localhost 或 192.168.1.1"
                  maxLength={255}
                  error={errors.host?.message}
                  {...register('host')}
                />

                <Controller
                  name="port"
                  control={control}
                  render={({ field }) => (
                    <Input
                      label="連接埠"
                      type="number"
                      placeholder="例如：3306"
                      error={errors.port?.message}
                      value={field.value ?? ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        field.onChange(val === '' ? undefined : Number(val));
                      }}
                      onBlur={field.onBlur}
                      ref={field.ref}
                    />
                  )}
                />

                <Input
                  label="資料庫名稱"
                  placeholder="請輸入資料庫名稱"
                  maxLength={100}
                  error={errors.databaseName?.message}
                  {...register('databaseName')}
                />

                <Input
                  label="使用者名稱"
                  placeholder="請輸入使用者名稱"
                  maxLength={100}
                  error={errors.username?.message}
                  {...register('username')}
                />

                <div className="w-full">
                  <PasswordInput
                    label="密碼"
                    placeholder="請輸入密碼"
                    hint="此密碼將以加密方式儲存"
                    error={errors.password?.message}
                    {...register('password')}
                  />
                </div>

                <div className="w-full">
                  <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">描述</label>
                  <textarea
                    id="description"
                    placeholder="選填，最多 500 字"
                    maxLength={500}
                    rows={3}
                    className={`w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary ${
                      errors.description ? 'border-danger-600' : 'border-border'
                    }`}
                    {...register('description')}
                  />
                  {errors.description && (
                    <p className="mt-1 text-sm text-danger-600">{errors.description.message}</p>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-gray-200">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => navigate('/datasources', { replace: true })}
                >
                  取消
                </Button>
                <Button
                  type="submit"
                  loading={isSubmitting}
                  loadingText="新增中..."
                >
                  新增資料來源
                </Button>
              </div>
            </form>
          </div>
        </main>
      </div>
    </div>
  );
}
