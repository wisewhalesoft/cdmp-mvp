import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Users, Database, ArrowDownToLine, LogOut, ChevronRight, CalendarClock } from 'lucide-react';
import {
  createExtractionTaskSchema,
  type CreateExtractionTaskFormData,
} from './create-extraction-task-schema';
import {
  createExtractionTask,
  getDatasourceOptions,
  type DatasourceOption,
} from '@/api/extraction-tasks';
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

export function AddExtractionTaskPage() {
  const navigate = useNavigate();
  const user = getUser();
  const { showToast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
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

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors },
  } = useForm<CreateExtractionTaskFormData>({
    resolver: zodResolver(createExtractionTaskSchema),
    mode: 'onBlur',
    defaultValues: {
      name: '',
      datasourceId: '',
      mode: 'full',
      targetTable: '',
      schedule: '',
      incrementalColumn: '',
      lastIncrementalValue: '',
    },
  });

  const selectedMode = watch('mode');
  const scheduleValue = watch('schedule');

  // Load datasources
  useEffect(() => {
    getDatasourceOptions().then(setDatasources).catch(() => {});
  }, []);

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
    if (!isAdvancedMode) {
      buildCronFromSimple();
    }
  }, [isAdvancedMode, buildCronFromSimple]);

  const handleAdvancedCronChange = (value: string) => {
    setAdvancedCron(value);
    setValue('schedule', value.trim(), { shouldValidate: false });
  };

  const toggleScheduleMode = () => {
    if (!isAdvancedMode) {
      // switching to advanced, sync current value
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
      const payload = {
        name: data.name,
        datasourceId: data.datasourceId,
        mode: data.mode,
        targetTable: data.targetTable,
        schedule: data.schedule,
        incrementalColumn: data.incrementalColumn || undefined,
        lastIncrementalValue: data.lastIncrementalValue || undefined,
      };
      await createExtractionTask(payload);
      showToast('擷取任務已建立', 'success');
      navigate('/extraction-tasks', { replace: true });
    } catch (err: unknown) {
      const error = err as {
        response?: { status?: number; data?: { error?: string; message?: string } };
      };
      if (error.response?.status === 409) {
        showToast('此名稱的擷取任務已存在', 'error');
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
          <h2 className="text-lg font-semibold text-gray-900">新增擷取任務</h2>
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
            <span className="text-gray-900 font-medium">新增擷取任務</span>
          </nav>

          {/* Form Card */}
          <div className="max-w-2xl mx-auto bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-6">新增擷取任務</h3>

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
                    {...register('datasourceId')}
                  >
                    <option value="">請選擇</option>
                    {datasources.map((ds) => (
                      <option key={ds.id} value={ds.id}>
                        {ds.name} ({ds.type})
                      </option>
                    ))}
                  </select>
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

                {/* 目標資料表 */}
                <Input
                  label="目標資料表"
                  placeholder="例如：customers"
                  maxLength={255}
                  error={errors.targetTable?.message}
                  {...register('targetTable')}
                />

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
                  建立任務
                </Button>
              </div>
            </form>
          </div>
        </main>
      </div>
    </div>
  );
}
