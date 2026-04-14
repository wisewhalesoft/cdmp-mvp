import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Users, Database, ArrowDownToLine, LogOut, ChevronRight, Plug, Workflow, Contact, } from 'lucide-react';
import { editDatasourceSchema, type EditDatasourceFormData } from './edit-datasource-schema';
import { getDatasource, updateDatasource, testDatasourceConnection } from '@/api/datasources';
import { clearAuth, getUser } from '@/stores/auth-store';
import { logout } from '@/api/auth';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import type { DatasourceDetailResponse } from '@cdmp/shared';

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

export function EditDatasourcePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const user = getUser();
  const { showToast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<string | null>(null);
  const [testedBeforeSave, setTestedBeforeSave] = useState(false);
  const initialTypeRef = useRef<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<EditDatasourceFormData>({
    resolver: zodResolver(editDatasourceSchema),
    mode: 'onBlur',
    defaultValues: {
      name: '',
      type: '' as EditDatasourceFormData['type'],
      host: '',
      port: undefined as unknown as number,
      databaseName: '',
      username: '',
      password: '',
      description: '',
    },
  });

  const selectedType = watch('type');

  // Load datasource data
  useEffect(() => {
    if (!id) return;

    let cancelled = false;
    getDatasource(id)
      .then((data: DatasourceDetailResponse) => {
        if (cancelled) return;
        initialTypeRef.current = data.type;
        reset({
          name: data.name,
          type: data.type as EditDatasourceFormData['type'],
          host: data.host,
          port: data.port,
          databaseName: data.databaseName,
          username: data.username,
          password: '',
          description: data.description ?? '',
        });
        setConnectionStatus(data.status);
        setIsLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLoadError('無法載入資料來源');
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id, reset]);

  // Auto-fill port when type changes (only after initial load, not on first load)
  useEffect(() => {
    if (
      selectedType &&
      initialTypeRef.current !== null &&
      selectedType !== initialTypeRef.current &&
      DEFAULT_PORTS[selectedType]
    ) {
      setValue('port', DEFAULT_PORTS[selectedType]);
    }
    // After a type change, update the ref so subsequent changes also trigger
    if (selectedType && initialTypeRef.current !== null && selectedType !== initialTypeRef.current) {
      initialTypeRef.current = selectedType;
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

  const handleTestConnection = async () => {
    if (!id || isTesting) return;
    setIsTesting(true);
    try {
      const result = await testDatasourceConnection(id);
      if (result.success) {
        showToast(result.message, 'success');
      } else {
        const isTimeout = result.message.includes('逾時');
        showToast(result.message, isTimeout ? 'warning' : 'error');
      }
      // Update connection status from authoritative API response
      setConnectionStatus(result.status);
      setTestedBeforeSave(true);
    } catch {
      showToast('測試連線時發生錯誤', 'error');
    } finally {
      setIsTesting(false);
    }
  };

  const onSubmit = async (data: EditDatasourceFormData) => {
    if (!id) return;
    setIsSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        name: data.name,
        type: data.type,
        host: data.host,
        port: data.port,
        databaseName: data.databaseName,
        username: data.username,
        description: data.description || undefined,
      };
      // Only include password if user typed something
      if (data.password) {
        payload.password = data.password;
      }
      await updateDatasource(id, payload as any);
      // BR-4: updateDatasource resets status to 'unknown'.
      // If user tested connection before saving, re-test to persist the status.
      if (testedBeforeSave) {
        try {
          await testDatasourceConnection(id);
        } catch {
          // Best-effort re-test; don't block navigation on failure
        }
      }
      showToast('資料來源已更新', 'success');
      navigate('/datasources', { replace: true });
    } catch (err: unknown) {
      const error = err as { response?: { status?: number; data?: { error?: string; message?: string } } };
      if (error.response?.status === 409) {
        showToast('相同資料庫下已存在此名稱的資料來源', 'error');
      } else {
        showToast('發生未知錯誤，請稍後再試', 'error');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-gray-500">載入中...</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-danger-600">{loadError}</p>
      </div>
    );
  }

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
            href="/datasources"
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
          <a
            href="/etl-pipelines"
            className="flex items-center gap-3 px-5 py-2.5 text-sm text-gray-600 hover:bg-gray-50"
          >
            <Workflow size={20} />
            ETL Pipeline
          </a>
<a            href="/c360/customers"            className="flex items-center gap-3 px-5 py-2.5 text-sm text-gray-600 hover:bg-gray-50"          >            <Contact size={20} />            Customer 360          </a>
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
            <span className="text-gray-900 font-medium">編輯資料來源</span>
          </nav>

          {/* Form Card */}
          <div className="max-w-2xl mx-auto bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-6">編輯資料來源</h3>

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
                    placeholder="留空以保留現有密碼"
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

              {connectionStatus && (
                <div className="mt-4 flex items-center gap-2" data-testid="connection-status">
                  <span className="text-sm text-gray-600">連線狀態：</span>
                  <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded ${
                    connectionStatus === 'connected'
                      ? 'bg-green-100 text-green-700'
                      : connectionStatus === 'disconnected'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-gray-100 text-gray-600'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      connectionStatus === 'connected'
                        ? 'bg-green-500'
                        : connectionStatus === 'disconnected'
                          ? 'bg-red-500'
                          : 'bg-gray-400'
                    }`} />
                    {connectionStatus}
                  </span>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-gray-200">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => navigate('/datasources', { replace: true })}
                >
                  取消
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleTestConnection}
                  loading={isTesting}
                  loadingText="測試中..."
                  className="inline-flex items-center gap-1.5"
                >
                  <Plug size={16} />
                  測試連線
                </Button>
                <Button
                  type="submit"
                  loading={isSubmitting}
                  loadingText="處理中..."
                >
                  儲存
                </Button>
              </div>
            </form>
          </div>
        </main>
      </div>
    </div>
  );
}
