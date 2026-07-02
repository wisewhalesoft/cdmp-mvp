import { useState, useMemo, useEffect } from 'react';
import { X, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { updatePipeline } from '@/api/etl-pipelines';
import type { PipelineListItem } from '@cdmp/shared';

interface EditPipelineModalProps {
  open: boolean;
  pipeline: PipelineListItem;
  onClose: () => void;
  onSuccess: () => void;
}

type ScheduleFrequency = 'none' | 'hourly' | 'daily' | 'weekly' | 'monthly';

const FREQUENCY_OPTIONS: { value: ScheduleFrequency; label: string }[] = [
  { value: 'none', label: '不設定排程' },
  { value: 'hourly', label: '每小時' },
  { value: 'daily', label: '每日' },
  { value: 'weekly', label: '每週' },
  { value: 'monthly', label: '每月' },
];

const WEEKDAY_OPTIONS = [
  { value: 0, label: '日' },
  { value: 1, label: '一' },
  { value: 2, label: '二' },
  { value: 3, label: '三' },
  { value: 4, label: '四' },
  { value: 5, label: '五' },
  { value: 6, label: '六' },
];

function buildCronExpression(
  frequency: ScheduleFrequency,
  minute: number,
  hour: number,
  weekday: number,
  dayOfMonth: number,
): string | null {
  switch (frequency) {
    case 'none':
      return null;
    case 'hourly':
      return `${minute} * * * *`;
    case 'daily':
      return `${minute} ${hour} * * *`;
    case 'weekly':
      return `${minute} ${hour} * * ${weekday}`;
    case 'monthly':
      return `${minute} ${hour} ${dayOfMonth} * *`;
    default:
      return null;
  }
}

function describeCron(
  frequency: ScheduleFrequency,
  minute: number,
  hour: number,
  weekday: number,
  dayOfMonth: number,
): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  switch (frequency) {
    case 'hourly':
      return `每小時的第 ${pad(minute)} 分 (UTC+8)`;
    case 'daily':
      return `每日 ${pad(hour)}:${pad(minute)} (UTC+8)`;
    case 'weekly':
      return `每週${WEEKDAY_OPTIONS[weekday]?.label || weekday} ${pad(hour)}:${pad(minute)} (UTC+8)`;
    case 'monthly':
      return `每月 ${dayOfMonth} 日 ${pad(hour)}:${pad(minute)} (UTC+8)`;
    default:
      return '';
  }
}

interface CronBuilderState {
  frequency: ScheduleFrequency;
  hour: number;
  minute: number;
  weekday: number;
  dayOfMonth: number;
  manualCron: string;
  useManualCron: boolean;
}

const DEFAULT_BUILDER: CronBuilderState = {
  frequency: 'none',
  hour: 2,
  minute: 0,
  weekday: 1,
  dayOfMonth: 1,
  manualCron: '',
  useManualCron: false,
};

/**
 * Best-effort reverse-map an existing cron string into the simple shapes the
 * builder produces. Falls back to manual-cron mode for anything else.
 * - null / empty → frequency none
 * - "m * * * *"  → hourly
 * - "m h * * *"  → daily
 * - "m h * * d"  → weekly
 * - "m h dom * *"→ monthly
 */
function parseScheduleToBuilder(schedule: string | null): CronBuilderState {
  if (!schedule || schedule.trim() === '') {
    return { ...DEFAULT_BUILDER, frequency: 'none' };
  }

  const parts = schedule.trim().split(/\s+/);
  // Only the 5-field shapes the builder generates are reverse-mappable.
  if (parts.length === 5) {
    const [m, h, dom, mon, dow] = parts;
    const minute = Number(m);
    const hour = Number(h);
    const dayOfMonth = Number(dom);
    const weekday = Number(dow);
    const isInt = (s: string) => /^\d+$/.test(s);

    // hourly: m * * * *
    if (isInt(m) && h === '*' && dom === '*' && mon === '*' && dow === '*') {
      return { ...DEFAULT_BUILDER, frequency: 'hourly', minute };
    }
    // daily: m h * * *
    if (isInt(m) && isInt(h) && dom === '*' && mon === '*' && dow === '*') {
      return { ...DEFAULT_BUILDER, frequency: 'daily', minute, hour };
    }
    // weekly: m h * * d
    if (isInt(m) && isInt(h) && dom === '*' && mon === '*' && isInt(dow)) {
      return { ...DEFAULT_BUILDER, frequency: 'weekly', minute, hour, weekday };
    }
    // monthly: m h dom * *
    if (isInt(m) && isInt(h) && isInt(dom) && mon === '*' && dow === '*') {
      return { ...DEFAULT_BUILDER, frequency: 'monthly', minute, hour, dayOfMonth };
    }
  }

  // Unknown shape → manual cron mode showing the raw expression.
  return { ...DEFAULT_BUILDER, useManualCron: true, manualCron: schedule };
}

export function EditPipelineModal({ open, pipeline, onClose, onSuccess }: EditPipelineModalProps) {
  const [name, setName] = useState(pipeline.name);
  const [description, setDescription] = useState(pipeline.description ?? '');
  const initialBuilder = useMemo(() => parseScheduleToBuilder(pipeline.schedule), [pipeline.schedule]);
  const [frequency, setFrequency] = useState<ScheduleFrequency>(initialBuilder.frequency);
  const [hour, setHour] = useState(initialBuilder.hour);
  const [minute, setMinute] = useState(initialBuilder.minute);
  const [weekday, setWeekday] = useState(initialBuilder.weekday);
  const [dayOfMonth, setDayOfMonth] = useState(initialBuilder.dayOfMonth);
  const [manualCron, setManualCron] = useState(initialBuilder.manualCron);
  const [useManualCron, setUseManualCron] = useState(initialBuilder.useManualCron);

  const [apiError, setApiError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset form to the pipeline's current values whenever the modal (re)opens
  // or the target pipeline changes — avoids stale values / leftover errors.
  useEffect(() => {
    if (!open) return;
    const builder = parseScheduleToBuilder(pipeline.schedule);
    setName(pipeline.name);
    setDescription(pipeline.description ?? '');
    setFrequency(builder.frequency);
    setHour(builder.hour);
    setMinute(builder.minute);
    setWeekday(builder.weekday);
    setDayOfMonth(builder.dayOfMonth);
    setManualCron(builder.manualCron);
    setUseManualCron(builder.useManualCron);
    setApiError(null);
  }, [open, pipeline]);

  const cronExpression = useMemo(() => {
    if (useManualCron) return manualCron || null;
    return buildCronExpression(frequency, minute, hour, weekday, dayOfMonth);
  }, [useManualCron, manualCron, frequency, minute, hour, weekday, dayOfMonth]);

  const cronDescription = useMemo(() => {
    if (useManualCron) return manualCron ? `Cron: ${manualCron}` : '';
    return describeCron(frequency, minute, hour, weekday, dayOfMonth);
  }, [useManualCron, manualCron, frequency, minute, hour, weekday, dayOfMonth]);

  const handleClose = () => {
    setApiError(null);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setApiError(null);
    setIsSubmitting(true);

    try {
      await updatePipeline(pipeline.id, {
        name: name.trim(),
        description: description.trim() || null,
        schedule: cronExpression || null,
      });
      handleClose();
      onSuccess();
    } catch (err: unknown) {
      const error = err as { response?: { status?: number; data?: { error?: string; message?: string } } };
      const errorCode = error.response?.data?.error;
      const errorMessage = error.response?.data?.message;

      if (errorCode === 'PIPELINE_NAME_EXISTS') {
        setApiError('此名稱的 Pipeline 已存在');
      } else if (errorCode === 'VALIDATION_INVALID_CRON') {
        setApiError('排程格式不正確，請輸入合法的 cron 表達式');
      } else if (errorCode === 'PIPELINE_RUNNING') {
        setApiError('Pipeline 正在執行中，無法編輯');
      } else if (error.response?.status === 422) {
        setApiError(errorMessage || '欄位驗證失敗');
      } else {
        setApiError('系統發生非預期錯誤，請稍後再試');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!open) return null;

  const isNameEmpty = name.trim().length === 0;

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={handleClose}
        data-testid="modal-backdrop"
      />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-[520px] relative" data-testid="edit-pipeline-modal">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">編輯 Pipeline</h3>
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

          <form onSubmit={handleSubmit} noValidate>
            <div className="px-6 py-5 space-y-5">
              {/* Pipeline Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Pipeline 名稱 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={255}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  placeholder="輸入 Pipeline 名稱"
                  data-testid="pipeline-name-input"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  描述
                </label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none"
                  placeholder="輸入 Pipeline 描述（選填）"
                  data-testid="pipeline-description-input"
                />
              </div>

              {/* Schedule */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  排程設定（選填）
                </label>
                <div className="space-y-3">
                  {/* Toggle manual cron */}
                  <div className="flex items-center justify-between">
                    <select
                      value={useManualCron ? '__manual__' : frequency}
                      onChange={(e) => {
                        if (e.target.value === '__manual__') {
                          setUseManualCron(true);
                        } else {
                          setUseManualCron(false);
                          setFrequency(e.target.value as ScheduleFrequency);
                        }
                      }}
                      className="text-sm border border-gray-200 rounded-lg px-3 py-2"
                      data-testid="schedule-frequency-select"
                    >
                      {FREQUENCY_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                      <option value="__manual__">手動輸入 Cron</option>
                    </select>

                    {!useManualCron && frequency !== 'none' && (
                      <div className="flex items-center gap-1">
                        {frequency !== 'hourly' && (
                          <>
                            <input
                              type="number"
                              min={0}
                              max={23}
                              value={hour}
                              onChange={(e) => setHour(Math.min(23, Math.max(0, Number(e.target.value))))}
                              className="w-16 text-sm border border-gray-200 rounded-lg px-2 py-2 text-center"
                              data-testid="schedule-hour-input"
                            />
                            <span className="text-gray-500">:</span>
                          </>
                        )}
                        <input
                          type="number"
                          min={0}
                          max={59}
                          value={minute}
                          onChange={(e) => setMinute(Math.min(59, Math.max(0, Number(e.target.value))))}
                          className="w-16 text-sm border border-gray-200 rounded-lg px-2 py-2 text-center"
                          data-testid="schedule-minute-input"
                        />
                      </div>
                    )}
                  </div>

                  {/* Weekly: weekday select */}
                  {!useManualCron && frequency === 'weekly' && (
                    <select
                      value={weekday}
                      onChange={(e) => setWeekday(Number(e.target.value))}
                      className="text-sm border border-gray-200 rounded-lg px-3 py-2"
                      data-testid="schedule-weekday-select"
                    >
                      {WEEKDAY_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          星期{opt.label}
                        </option>
                      ))}
                    </select>
                  )}

                  {/* Monthly: day of month */}
                  {!useManualCron && frequency === 'monthly' && (
                    <input
                      type="number"
                      min={1}
                      max={31}
                      value={dayOfMonth}
                      onChange={(e) => setDayOfMonth(Math.min(31, Math.max(1, Number(e.target.value))))}
                      className="w-24 text-sm border border-gray-200 rounded-lg px-2 py-2 text-center"
                      placeholder="日"
                      data-testid="schedule-day-input"
                    />
                  )}

                  {/* Manual cron input */}
                  {useManualCron && (
                    <input
                      type="text"
                      value={manualCron}
                      onChange={(e) => setManualCron(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-mono"
                      placeholder="0 2 * * *"
                      data-testid="manual-cron-input"
                    />
                  )}

                  {/* Preview */}
                  {((!useManualCron && frequency !== 'none') || (useManualCron && manualCron)) && (
                    <div className="bg-gray-50 rounded-lg p-3 text-sm" data-testid="schedule-preview">
                      <p className="text-gray-600">
                        <Clock className="w-3.5 h-3.5 inline mr-1" />
                        {cronDescription}
                      </p>
                      {cronExpression && (
                        <p className="text-xs text-gray-400 mt-1">
                          Cron: <code className="bg-gray-200 px-1 rounded">{cronExpression}</code>
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200">
              <Button type="button" variant="secondary" onClick={handleClose}>
                取消
              </Button>
              <Button
                type="submit"
                disabled={isNameEmpty}
                loading={isSubmitting}
                loadingText="儲存中..."
                data-testid="edit-pipeline-submit"
              >
                儲存
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
