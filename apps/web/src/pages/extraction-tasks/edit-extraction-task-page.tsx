import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Users, Database, ArrowDownToLine, LogOut, ChevronRight, CalendarClock, AlertTriangle } from 'lucide-react';
import {
  createExtractionTaskSchema,
  type CreateExtractionTaskFormData,
} from './create-extraction-task-schema';
import {
  getExtractionTask,
  updateExtractionTask,
  getDatasourceOptions,
  type DatasourceOption,
  type CreateExtractionTaskResponse,
} from '@/api/extraction-tasks';
import { getDatasourceSchemas, getDatasourceTables } from '@/api/datasources';
import { clearAuth, getUser } from '@/stores/auth-store';
import { logout } from '@/api/auth';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';

type Frequency = '' | 'hourly' | 'daily' | 'weekly' | 'monthly';

const HOURLY_INTERVALS = [1, 2, 3, 4, 6, 8, 12];
const WEEKDAYS = [
  { value: 1, label: '一' },
  { value: 2, label: '二' },
  { value: 3, label: '三' },
  { value: 4, label: '四' },
  { value: 5, label: '五' },
  { value: 6, label: '六' },
  { value: 0, label: '日' },
];

function cronToReadable(expr: string): string | null {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [min, hour, dom, mon, dow] = parts;
  const dayNames = ['日', '一', '二', '三', '四', '五', '六'];

  // Every N hours
  if (min === '0' && /^\*\/\d+$/.test(hour) && dom === '*' && mon === '*' && dow === '*') {
    return `每 ${hour.split('/')[1]} 小時執行`;
  }
  if (min === '0' && hour === '*' && dom === '*' && mon === '*' && dow === '*') {
    return '每小時執行';
  }
  // Daily
  if (/^\d+$/.test(min) && /^\d+$/.test(hour) && dom === '*' && mon === '*' && dow === '*') {
    return `每日 ${hour.padStart(2, '0')}:${min.padStart(2, '0')} 執行`;
  }
  // Weekly
  if (/^\d+$/.test(min) && /^\d+$/.test(hour) && dom === '*' && mon === '*' && dow !== '*') {
    const dowParts = dow.split(',');
    if (dow === '1-5') {
      return `週一至週五 ${hour.padStart(2, '0')}:${min.padStart(2, '0')} 執行`;
    }
    if (dow === '0,6' || dow === '6,0') {
      return `週六、日 ${hour.padStart(2, '0')}:${min.padStart(2, '0')} 執行`;
    }
    const dayLabels = dowParts.map((d) => {
      const ranges = d.split('-');
      if (ranges.length === 2) {
        return `${dayNames[Number(ranges[0])]}至${dayNames[Number(ranges[1])]}`;
      }
      return `週${dayNames[parseInt(d)]}`;
    });
    return `${dayLabels.join('、')} ${hour.padStart(2, '0')}:${min.padStart(2, '0')} 執行`;
  }
  // Monthly
  if (/^\d+$/.test(min) && /^\d+$/.test(hour) && /^\d+$/.test(dom) && mon === '*' && dow === '*') {
    return `每月 ${dom} 日 ${hour.padStart(2, '0')}:${min.padStart(2, '0')} 執行`;
  }
  return `自定義排程: ${expr}`;
}

/**
 * Reverse-parse a cron expression into simple mode settings.
 * Returns null if the cron cannot be represented in simple mode.
 */
function parseCronToSimple(cron: string): {
  frequency: Frequency;
  hourlyInterval: string;
  schedHour: string;
  schedMinute: string;
  selectedWeekdays: number[];
  dayOfMonth: string;
} | null {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [min, hour, dom, mon, dow] = parts;

  // Hourly: 0 * * * * or 0 */N * * *
  if (min === '0' && dom === '*' && mon === '*' && dow === '*') {
    if (hour === '*') {
      return { frequency: 'hourly', hourlyInterval: '1', schedHour: '2', schedMinute: '0', selectedWeekdays: [], dayOfMonth: '1' };
    }
    const hourlyMatch = hour.match(/^\*\/(\d+)$/);
    if (hourlyMatch) {
      return { frequency: 'hourly', hourlyInterval: hourlyMatch[1], schedHour: '2', schedMinute: '0', selectedWeekdays: [], dayOfMonth: '1' };
    }
  }

  // Daily: M H * * *
  if (/^\d+$/.test(min) && /^\d+$/.test(hour) && dom === '*' && mon === '*' && dow === '*') {
    return { frequency: 'daily', hourlyInterval: '1', schedHour: hour, schedMinute: min, selectedWeekdays: [], dayOfMonth: '1' };
  }

  // Weekly: M H * * D,D,...
  if (/^\d+$/.test(min) && /^\d+$/.test(hour) && dom === '*' && mon === '*' && dow !== '*') {
    const days = dow.split(',').map(Number).filter((n) => !isNaN(n));
    if (days.length > 0) {
      return { frequency: 'weekly', hourlyInterval: '1', schedHour: hour, schedMinute: min, selectedWeekdays: days, dayOfMonth: '1' };
    }
  }

  // Monthly: M H D * *
  if (/^\d+$/.test(min) && /^\d+$/.test(hour) && /^\d+$/.test(dom) && mon === '*' && dow === '*') {
    return { frequency: 'monthly', hourlyInterval: '1', schedHour: hour, schedMinute: min, selectedWeekdays: [], dayOfMonth: dom };
  }

  return null;
}

export function EditExtractionTaskPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const user = getUser();
  const { showToast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [datasources, setDatasources] = useState<DatasourceOption[]>([]);
  const [isAdvancedMode, setIsAdvancedMode] = useState(false);

  // Simple mode state
  const [frequency, setFrequency] = useState<Frequency>('');
  const [hourlyInterval, setHourlyInterval] = useState('1');
  const [schedHour, setSchedHour] = useState('2');
  const [schedMinute, setSchedMinute] = useState('0');
  const [selectedWeekdays, setSelectedWeekdays] = useState<number[]>([]);
  const [dayOfMonth, setDayOfMonth] = useState('1');
  const [advancedCron, setAdvancedCron] = useState('');

  // Cascade dropdown state
  const [schemas, setSchemas] = useState<string[]>([]);
  const [tables, setTables] = useState<string[]>([]);
  const [schemasLoading, setSchemasLoading] = useState(false);
  const [tablesLoading, setTablesLoading] = useState(false);
  const [schemasError, setSchemasError] = useState<string | null>(null);
  const [tablesError, setTablesError] = useState<string | null>(null);

  // Warning modal state
  const [showChangeWarningModal, setShowChangeWarningModal] = useState(false);
  const [taskData, setTaskData] = useState<CreateExtractionTaskResponse | null>(null);
  const originalSourceSchema = useRef<string>('');
  const originalSourceTable = useRef<string>('');
  const pendingSchemaValue = useRef<string | null>(null);
  const pendingTableValue = useRef<string | null>(null);

  // Track whether initial load has completed cascade setup
  const cascadeInitialized = useRef(false);

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<CreateExtractionTaskFormData>({
    resolver: zodResolver(createExtractionTaskSchema),
    mode: 'onBlur',
    defaultValues: {
      name: '',
      datasourceId: '',
      mode: 'full',
      sourceSchema: '',
      sourceTable: '',
      schedule: '',
      incrementalColumn: '',
      lastIncrementalValue: '',
    },
  });

  const selectedMode = watch('mode');
  const scheduleValue = watch('schedule');
  const watchedDatasourceId = watch('datasourceId');
  const watchedSourceSchema = watch('sourceSchema');

  // Track whether initial load has set the simple mode state
  const [initialized, setInitialized] = useState(false);

  // Load datasources and task data
  useEffect(() => {
    const loadData = async () => {
      try {
        const [dsOptions, task] = await Promise.all([
          getDatasourceOptions(),
          getExtractionTask(id!),
        ]);
        setDatasources(dsOptions);
        setTaskData(task);

        // Store original values for change detection
        originalSourceSchema.current = task.sourceSchema ?? '';
        originalSourceTable.current = task.sourceTable;

        // Load schemas and tables in parallel for pre-selection
        const taskDsId = task.datasourceId;
        const taskSchema = task.sourceSchema ?? '';

        try {
          const [schemasRes, tablesRes] = await Promise.all([
            getDatasourceSchemas(taskDsId),
            taskSchema ? getDatasourceTables(taskDsId, taskSchema) : Promise.resolve({ tables: [] }),
          ]);
          setSchemas(schemasRes.schemas);
          setTables(tablesRes.tables);
        } catch {
          setSchemasError('無法連線至資料來源，請至資料來源設定頁面確認連線設定');
        }

        // Reset form with task data
        reset({
          name: task.name,
          datasourceId: task.datasourceId,
          mode: task.mode,
          sourceSchema: task.sourceSchema ?? '',
          sourceTable: task.sourceTable,
          schedule: task.schedule,
          incrementalColumn: task.incrementalColumn ?? '',
          lastIncrementalValue: task.lastIncrementalValue ?? '',
        });

        // Reverse-parse cron to simple mode
        const simpleMode = parseCronToSimple(task.schedule);
        if (simpleMode) {
          setFrequency(simpleMode.frequency);
          setHourlyInterval(simpleMode.hourlyInterval);
          setSchedHour(simpleMode.schedHour);
          setSchedMinute(simpleMode.schedMinute);
          setSelectedWeekdays(simpleMode.selectedWeekdays);
          setDayOfMonth(simpleMode.dayOfMonth);
          setIsAdvancedMode(false);
        } else {
          setAdvancedCron(task.schedule);
          setIsAdvancedMode(true);
        }

        cascadeInitialized.current = true;
        setInitialized(true);
      } catch {
        showToast('載入任務資料失敗', 'error');
        navigate('/extraction-tasks', { replace: true });
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cascade: reload schemas when datasource changes (user-triggered only)
  const handleDatasourceChange = useCallback((newDsId: string) => {
    if (!cascadeInitialized.current) return;

    setValue('datasourceId', newDsId, { shouldValidate: false });

    if (!newDsId) {
      setSchemas([]);
      setTables([]);
      setSchemasError(null);
      setTablesError(null);
      setValue('sourceSchema', '', { shouldValidate: false });
      setValue('sourceTable', '', { shouldValidate: false });
      return;
    }

    setSchemasLoading(true);
    setSchemasError(null);
    setSchemas([]);
    setTables([]);
    setTablesError(null);
    setValue('sourceSchema', '', { shouldValidate: false });
    setValue('sourceTable', '', { shouldValidate: false });

    getDatasourceSchemas(newDsId)
      .then((res) => {
        setSchemas(res.schemas);
      })
      .catch(() => {
        setSchemasError('無法連線至資料來源，請至資料來源設定頁面確認連線設定');
      })
      .finally(() => setSchemasLoading(false));
  }, [setValue]);

  // Cascade: reload tables when schema changes (user-triggered only)
  const handleSchemaChange = useCallback((newSchema: string) => {
    if (!cascadeInitialized.current) return;

    const executionCount = taskData?.executionCount ?? 0;

    // Check if we need a warning modal
    if (executionCount > 0 && newSchema !== originalSourceSchema.current) {
      pendingSchemaValue.current = newSchema;
      pendingTableValue.current = null;
      setShowChangeWarningModal(true);
      return;
    }

    applySchemaChange(newSchema);
  }, [taskData]); // eslint-disable-line react-hooks/exhaustive-deps

  const applySchemaChange = useCallback((newSchema: string) => {
    setValue('sourceSchema', newSchema, { shouldValidate: false });
    setValue('sourceTable', '', { shouldValidate: false });
    setTables([]);
    setTablesError(null);

    if (!newSchema || !watchedDatasourceId) return;

    setTablesLoading(true);
    getDatasourceTables(watchedDatasourceId, newSchema)
      .then((res) => {
        setTables(res.tables);
      })
      .catch(() => {
        setTablesError('無法載入資料表列表');
      })
      .finally(() => setTablesLoading(false));
  }, [watchedDatasourceId, setValue]);

  // Handle table change with warning modal
  const handleTableChange = useCallback((newTable: string) => {
    const executionCount = taskData?.executionCount ?? 0;

    if (executionCount > 0 && newTable !== originalSourceTable.current) {
      pendingTableValue.current = newTable;
      pendingSchemaValue.current = null;
      setShowChangeWarningModal(true);
      return;
    }

    setValue('sourceTable', newTable, { shouldValidate: false });
  }, [taskData, setValue]);

  // Warning modal handlers
  const handleConfirmChange = () => {
    setShowChangeWarningModal(false);
    if (pendingSchemaValue.current !== null) {
      applySchemaChange(pendingSchemaValue.current);
      pendingSchemaValue.current = null;
    }
    if (pendingTableValue.current !== null) {
      setValue('sourceTable', pendingTableValue.current, { shouldValidate: false });
      pendingTableValue.current = null;
    }
  };

  const handleCancelChange = () => {
    setShowChangeWarningModal(false);
    if (pendingSchemaValue.current !== null) {
      // Revert schema to original
      setValue('sourceSchema', originalSourceSchema.current, { shouldValidate: false });
      pendingSchemaValue.current = null;
    }
    if (pendingTableValue.current !== null) {
      // Revert table to original
      setValue('sourceTable', originalSourceTable.current, { shouldValidate: false });
      pendingTableValue.current = null;
    }
  };

  // Build cron from simple mode selections
  const buildCronFromSimple = useCallback(() => {
    if (!frequency) {
      setValue('schedule', '', { shouldValidate: false });
      return;
    }

    let cron = '';
    switch (frequency) {
      case 'hourly':
        cron = hourlyInterval === '1' ? '0 * * * *' : `0 */${hourlyInterval} * * *`;
        break;
      case 'daily':
        cron = `${schedMinute} ${schedHour} * * *`;
        break;
      case 'weekly': {
        if (selectedWeekdays.length === 0) {
          setValue('schedule', '', { shouldValidate: false });
          return;
        }
        cron = `${schedMinute} ${schedHour} * * ${selectedWeekdays.join(',')}`;
        break;
      }
      case 'monthly':
        cron = `${schedMinute} ${schedHour} ${dayOfMonth} * *`;
        break;
    }
    setValue('schedule', cron, { shouldValidate: false });
  }, [frequency, hourlyInterval, schedHour, schedMinute, selectedWeekdays, dayOfMonth, setValue]);

  useEffect(() => {
    if (initialized && !isAdvancedMode) {
      buildCronFromSimple();
    }
  }, [initialized, isAdvancedMode, buildCronFromSimple]);

  const handleAdvancedCronChange = (value: string) => {
    setAdvancedCron(value);
    setValue('schedule', value.trim(), { shouldValidate: false });
  };

  const toggleScheduleMode = () => {
    if (!isAdvancedMode) {
      setAdvancedCron(scheduleValue || '');
    }
    setIsAdvancedMode(!isAdvancedMode);
  };

  const toggleWeekday = (day: number) => {
    setSelectedWeekdays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    );
  };

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

  const onSubmit = async (data: CreateExtractionTaskFormData) => {
    setIsSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        name: data.name,
        datasourceId: data.datasourceId,
        mode: data.mode,
        sourceSchema: data.sourceSchema || undefined,
        sourceTable: data.sourceTable,
        schedule: data.schedule,
      };

      if (data.mode === 'incremental') {
        payload.incrementalColumn = data.incrementalColumn || undefined;
        payload.lastIncrementalValue = data.lastIncrementalValue || undefined;
      }

      await updateExtractionTask(id!, payload);
      showToast('擷取任務已更新', 'success');
      navigate('/extraction-tasks', { replace: true });
    } catch (err: unknown) {
      const error = err as {
        response?: { status?: number; data?: { error?: string; message?: string } };
      };
      if (error.response?.status === 409) {
        const errCode = error.response.data?.error;
        if (errCode === 'EXTRACTION_RUNNING') {
          showToast('任務執行中，無法編輯', 'error');
        } else if (errCode === 'EXTRACTION_NAME_EXISTS') {
          showToast('此名稱的擷取任務已存在', 'error');
        } else {
          showToast('發生衝突，請稍後再試', 'error');
        }
      } else if (error.response?.status === 404) {
        showToast('找不到指定的擷取任務', 'error');
        navigate('/extraction-tasks', { replace: true });
      } else {
        showToast('發生未知錯誤，請稍後再試', 'error');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const cronPreview = scheduleValue ? cronToReadable(scheduleValue) : null;

  // Generate hour/minute/day options
  const hourOptions = Array.from({ length: 24 }, (_, i) => i);
  const minuteOptions = Array.from({ length: 12 }, (_, i) => i * 5);
  const dayOptions = Array.from({ length: 28 }, (_, i) => i + 1);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-gray-500">載入中...</p>
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
            className="flex items-center gap-3 px-5 py-2.5 text-sm text-gray-600 hover:bg-gray-50"
          >
            <Database size={20} />
            資料來源
          </a>
          <a
            href="/extraction-tasks"
            className="flex items-center gap-3 px-5 py-2.5 text-sm text-primary bg-blue-50 border-r-2 border-primary font-medium"
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
          <h2 className="text-lg font-semibold text-gray-900">編輯擷取任務</h2>
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
            <span className="text-gray-500">資料擷取</span>
            <ChevronRight size={14} className="text-gray-400" />
            <span className="text-gray-900 font-medium">編輯擷取任務</span>
          </nav>

          {/* Form Card */}
          <div className="max-w-2xl mx-auto bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-6">編輯擷取任務</h3>

            <form onSubmit={handleSubmit(onSubmit)} noValidate>
              <div className="space-y-5">
                {/* 任務名稱 */}
                <Input
                  label="任務名稱"
                  placeholder="例如：每日客戶同步"
                  maxLength={255}
                  error={errors.name?.message}
                  {...register('name')}
                />

                {/* 資料來源 */}
                <div className="w-full">
                  <label htmlFor="datasourceId" className="block text-sm font-medium text-gray-700 mb-1">
                    資料來源
                  </label>
                  <select
                    id="datasourceId"
                    className={`w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary ${
                      errors.datasourceId ? 'border-danger-600' : 'border-border'
                    }`}
                    value={watchedDatasourceId}
                    onChange={(e) => handleDatasourceChange(e.target.value)}
                  >
                    <option value="">請選擇</option>
                    {datasources.map((ds) => (
                      <option key={ds.id} value={ds.id}>
                        {ds.name} ({ds.type})
                      </option>
                    ))}
                  </select>
                  {/* Hidden input to register with react-hook-form */}
                  <input type="hidden" {...register('datasourceId')} />
                  {errors.datasourceId && (
                    <p className="mt-1 text-sm text-danger-600">{errors.datasourceId.message}</p>
                  )}
                </div>

                {/* 擷取模式 */}
                <Controller
                  name="mode"
                  control={control}
                  render={({ field }) => (
                    <div className="w-full">
                      <label className="block text-sm font-medium text-gray-700 mb-1">擷取模式</label>
                      <div className="flex gap-3">
                        <label className="flex-1 cursor-pointer">
                          <input
                            type="radio"
                            value="full"
                            checked={field.value === 'full'}
                            onChange={() => field.onChange('full')}
                            className="hidden"
                          />
                          <div
                            className={`border rounded-lg p-3 transition ${
                              field.value === 'full'
                                ? 'border-primary bg-blue-50'
                                : 'border-border'
                            }`}
                          >
                            <div className="text-sm font-medium text-gray-800">全量</div>
                            <div className="text-xs text-gray-500 mt-0.5">
                              擷取整個資料表的所有記錄
                            </div>
                          </div>
                        </label>
                        <label className="flex-1 cursor-pointer">
                          <input
                            type="radio"
                            value="incremental"
                            checked={field.value === 'incremental'}
                            onChange={() => field.onChange('incremental')}
                            className="hidden"
                          />
                          <div
                            className={`border rounded-lg p-3 transition ${
                              field.value === 'incremental'
                                ? 'border-primary bg-blue-50'
                                : 'border-border'
                            }`}
                          >
                            <div className="text-sm font-medium text-gray-800">增量</div>
                            <div className="text-xs text-gray-500 mt-0.5">
                              僅擷取自上次擷取後新增或更新的記錄
                            </div>
                          </div>
                        </label>
                      </div>
                      {errors.mode && (
                        <p className="mt-1 text-sm text-danger-600">{errors.mode.message}</p>
                      )}
                    </div>
                  )}
                />

                {/* 來源 Schema */}
                <div className="w-full">
                  <label htmlFor="sourceSchema" className="block text-sm font-medium text-gray-700 mb-1">
                    來源 Schema
                  </label>
                  <div className="relative">
                    <select
                      id="sourceSchema"
                      disabled={!watchedDatasourceId || schemasLoading || !!schemasError}
                      className={`w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary bg-white disabled:opacity-50 disabled:cursor-not-allowed ${
                        schemasError ? 'border-red-500' : 'border-border'
                      }`}
                      value={watchedSourceSchema || ''}
                      onChange={(e) => handleSchemaChange(e.target.value)}
                    >
                      <option value="">
                        {schemasLoading
                          ? '載入中...'
                          : !watchedDatasourceId
                            ? '請先選擇資料來源'
                            : '請選擇'}
                      </option>
                      {schemas.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                    {/* Hidden input to register with react-hook-form */}
                    <input type="hidden" {...register('sourceSchema')} />
                    {schemasLoading && (
                      <div className="absolute right-8 top-1/2 -translate-y-1/2">
                        <svg className="animate-spin w-4 h-4 text-blue-600" viewBox="0 0 24 24" fill="none">
                          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
                          <path d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" fill="currentColor" className="opacity-75" />
                        </svg>
                      </div>
                    )}
                  </div>
                  {schemasError && (
                    <p className="mt-1 text-xs text-red-500">{schemasError}</p>
                  )}
                </div>

                {/* 來源資料表 */}
                <div className="w-full">
                  <label htmlFor="sourceTable" className="block text-sm font-medium text-gray-700 mb-1">
                    來源資料表
                  </label>
                  <div className="relative">
                    <select
                      id="sourceTable"
                      disabled={!watchedSourceSchema || tablesLoading || !!tablesError}
                      className={`w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary bg-white disabled:opacity-50 disabled:cursor-not-allowed ${
                        tablesError ? 'border-red-500' : errors.sourceTable ? 'border-danger-600' : 'border-border'
                      }`}
                      value={watch('sourceTable') || ''}
                      onChange={(e) => handleTableChange(e.target.value)}
                    >
                      <option value="">
                        {tablesLoading
                          ? '載入中...'
                          : !watchedSourceSchema
                            ? '請先選擇 Schema'
                            : '請選擇'}
                      </option>
                      {tables.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                    {/* Hidden input to register with react-hook-form */}
                    <input type="hidden" {...register('sourceTable')} />
                    {tablesLoading && (
                      <div className="absolute right-8 top-1/2 -translate-y-1/2">
                        <svg className="animate-spin w-4 h-4 text-blue-600" viewBox="0 0 24 24" fill="none">
                          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
                          <path d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" fill="currentColor" className="opacity-75" />
                        </svg>
                      </div>
                    )}
                  </div>
                  {tablesError && (
                    <p className="mt-1 text-xs text-red-500">{tablesError}</p>
                  )}
                  {errors.sourceTable && !tablesError && (
                    <p className="mt-1 text-sm text-danger-600">{errors.sourceTable.message}</p>
                  )}
                </div>

                {/* 排程設定 */}
                <div className="w-full">
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-sm font-medium text-gray-700">排程設定</label>
                    <button
                      type="button"
                      onClick={toggleScheduleMode}
                      className="text-xs text-primary hover:underline"
                    >
                      {isAdvancedMode
                        ? '← 切換至簡易模式'
                        : '切換至進階模式 (Cron 表達式) →'}
                    </button>
                  </div>

                  {/* Hidden schedule field for form */}
                  <input type="hidden" {...register('schedule')} />

                  {!isAdvancedMode ? (
                    /* Simple Mode */
                    <div>
                      {/* Frequency */}
                      <div className="mb-3">
                        <label htmlFor="frequency" className="sr-only">頻率</label>
                        <select
                          id="frequency"
                          value={frequency}
                          onChange={(e) => setFrequency(e.target.value as Frequency)}
                          className="w-full border border-border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                          aria-label="頻率"
                        >
                          <option value="">請選擇頻率</option>
                          <option value="hourly">每小時</option>
                          <option value="daily">每日</option>
                          <option value="weekly">每週</option>
                          <option value="monthly">每月</option>
                        </select>
                      </div>

                      {/* Hourly interval */}
                      {frequency === 'hourly' && (
                        <div className="mb-3">
                          <label htmlFor="hourlyInterval" className="block text-xs text-gray-500 mb-1">
                            每隔
                          </label>
                          <div className="flex items-center gap-2">
                            <select
                              id="hourlyInterval"
                              value={hourlyInterval}
                              onChange={(e) => setHourlyInterval(e.target.value)}
                              className="w-24 border border-border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                              aria-label="每隔"
                            >
                              {HOURLY_INTERVALS.map((h) => (
                                <option key={h} value={String(h)}>
                                  {h}
                                </option>
                              ))}
                            </select>
                            <span className="text-sm text-gray-600">小時執行一次</span>
                          </div>
                        </div>
                      )}

                      {/* Time selection (daily/weekly/monthly) */}
                      {(frequency === 'daily' || frequency === 'weekly' || frequency === 'monthly') && (
                        <div className="mb-3">
                          <label className="block text-xs text-gray-500 mb-1">執行時間</label>
                          <div className="flex items-center gap-1">
                            <select
                              value={schedHour}
                              onChange={(e) => setSchedHour(e.target.value)}
                              className="w-20 border border-border rounded-md px-2 py-2 text-center focus:outline-none focus:ring-2 focus:ring-primary"
                              aria-label="時"
                            >
                              {hourOptions.map((h) => (
                                <option key={h} value={String(h)}>
                                  {String(h).padStart(2, '0')}
                                </option>
                              ))}
                            </select>
                            <span className="text-sm text-gray-500 font-medium">:</span>
                            <select
                              value={schedMinute}
                              onChange={(e) => setSchedMinute(e.target.value)}
                              className="w-20 border border-border rounded-md px-2 py-2 text-center focus:outline-none focus:ring-2 focus:ring-primary"
                              aria-label="分"
                            >
                              {minuteOptions.map((m) => (
                                <option key={m} value={String(m)}>
                                  {String(m).padStart(2, '0')}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      )}

                      {/* Weekly day selection */}
                      {frequency === 'weekly' && (
                        <div className="mb-3">
                          <label className="block text-xs text-gray-500 mb-1">選擇星期</label>
                          <div className="flex gap-1.5">
                            {WEEKDAYS.map((wd) => (
                              <button
                                key={wd.value}
                                type="button"
                                onClick={() => toggleWeekday(wd.value)}
                                className={`w-9 h-9 text-sm rounded-lg border transition ${
                                  selectedWeekdays.includes(wd.value)
                                    ? 'bg-primary text-white border-primary'
                                    : 'border-border hover:bg-gray-50'
                                }`}
                              >
                                {wd.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Monthly day selection */}
                      {frequency === 'monthly' && (
                        <div className="mb-3">
                          <label htmlFor="dayOfMonth" className="block text-xs text-gray-500 mb-1">
                            每月第幾日
                          </label>
                          <select
                            id="dayOfMonth"
                            value={dayOfMonth}
                            onChange={(e) => setDayOfMonth(e.target.value)}
                            className="w-24 border border-border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                            aria-label="每月第幾日"
                          >
                            {dayOptions.map((d) => (
                              <option key={d} value={String(d)}>
                                {d} 日
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  ) : (
                    /* Advanced Mode */
                    <div>
                      <input
                        type="text"
                        value={advancedCron}
                        onChange={(e) => handleAdvancedCronChange(e.target.value)}
                        placeholder="例如：0 2 * * *"
                        className="w-full border border-border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary font-mono"
                      />
                      <p className="mt-1 text-xs text-gray-400">
                        格式：分 時 日 月 星期（5 個欄位，以空格分隔）
                      </p>
                    </div>
                  )}

                  {/* Cron Preview */}
                  {cronPreview && (
                    <div
                      data-testid="cron-preview"
                      className="mt-2 px-3 py-2 bg-blue-50 border border-blue-100 rounded-lg flex items-center gap-2"
                    >
                      <CalendarClock size={16} className="text-primary shrink-0" />
                      <span className="text-sm text-primary">
                        {cronPreview} (UTC+8)
                      </span>
                    </div>
                  )}

                  {errors.schedule && (
                    <p className="mt-1 text-sm text-danger-600">{errors.schedule.message}</p>
                  )}
                </div>

                {/* 增量欄位 (conditional) */}
                {selectedMode === 'incremental' && (
                  <div className="space-y-4">
                    <Input
                      label="增量欄位"
                      placeholder="例如：updated_at"
                      maxLength={255}
                      error={errors.incrementalColumn?.message}
                      {...register('incrementalColumn')}
                    />
                    <Input
                      label="增量起始值"
                      placeholder="選填，例如：2026-01-01 00:00:00"
                      maxLength={255}
                      error={errors.lastIncrementalValue?.message}
                      {...register('lastIncrementalValue')}
                    />
                    <p className="text-xs text-gray-500 -mt-3">
                      選填，首次擷取時的起始條件值
                    </p>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-gray-200">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => navigate('/extraction-tasks', { replace: true })}
                >
                  取消
                </Button>
                <Button type="submit" loading={isSubmitting} loadingText="處理中...">
                  儲存變更
                </Button>
              </div>
            </form>
          </div>
        </main>
      </div>

      {/* Change Source Table Warning Modal */}
      {showChangeWarningModal && (
        <div className="fixed inset-0 z-[100]">
          <div className="absolute inset-0 bg-black/50" onClick={handleCancelChange} />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full mx-4 relative z-10">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0">
                  <AlertTriangle className="w-5 h-5 text-red-500" />
                </div>
                <h3 className="text-base font-bold text-gray-800">確認變更來源資料表</h3>
              </div>
              <p className="text-sm text-gray-600 mb-6 leading-relaxed">
                變更來源資料表後，下次執行擷取任務時將重建 Raw Data 表，現有已擷取的資料將被清除。確定要繼續嗎？
              </p>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={handleCancelChange}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleConfirmChange}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-500 rounded-lg hover:bg-red-600 transition-colors"
                >
                  確認變更
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
