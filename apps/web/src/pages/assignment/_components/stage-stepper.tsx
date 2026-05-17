import { Check, Loader2, X, GitFork } from 'lucide-react';

/**
 * F062 5-step Stage Stepper（橫向視覺化）
 *
 * 對應 prototype 32-run-progress.html L278+
 *
 * 5 stages 順序：Stage 0 / 1 / 2 / 3 / 4
 * 每 stage status：'pending' | 'running' | 'completed' | 'failed'
 *
 * 視覺：dot（圓圈含 icon）+ subtitle，stages 間以橫線連接，
 * 上游完成 → 連線變綠；當前 running → 連線藍色。
 */

export type StepperStageStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed';

export interface StepperStage {
  name: string;
  subtitle: string;
  status: StepperStageStatus;
}

const DOT_CONFIG: Record<
  StepperStageStatus,
  { bg: string; text: string; ring: string }
> = {
  completed: {
    bg: 'bg-green-500',
    text: 'text-white',
    ring: 'ring-green-200',
  },
  running: {
    bg: 'bg-blue-500',
    text: 'text-white',
    ring: 'ring-blue-200',
  },
  failed: { bg: 'bg-red-500', text: 'text-white', ring: 'ring-red-200' },
  pending: {
    bg: 'bg-gray-200',
    text: 'text-gray-500',
    ring: 'ring-gray-100',
  },
};

function lineColor(prevStatus: StepperStageStatus): string {
  if (prevStatus === 'completed') return 'bg-green-500';
  if (prevStatus === 'running') return 'bg-blue-300';
  if (prevStatus === 'failed') return 'bg-red-300';
  return 'bg-gray-200';
}

export interface StageStepperProps {
  stages: StepperStage[];
}

export function StageStepper({ stages }: StageStepperProps) {
  if (stages.length === 0) {
    return (
      <div
        data-testid="stage-stepper-empty"
        className="bg-white rounded-lg border border-gray-200 p-6 text-center text-sm text-gray-400"
      >
        無階段資料
      </div>
    );
  }

  const completedCount = stages.filter((s) => s.status === 'completed').length;

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
      <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GitFork className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold text-gray-800">執行階段進度</h3>
          <span className="text-xs text-gray-400">
            Stage {stages[0]?.name?.replace(/[^0-9]/g, '') || '0'} → Stage{' '}
            {stages[stages.length - 1]?.name?.replace(/[^0-9]/g, '') ||
              String(stages.length - 1)}
          </span>
        </div>
        <div
          data-testid="stage-stepper-progress"
          className="text-xs text-gray-500"
        >
          完成{' '}
          <span className="font-semibold text-gray-700">
            {completedCount} / {stages.length}
          </span>
        </div>
      </div>

      <div className="px-5 py-5 bg-gray-50/40">
        <div className="flex items-center">
          {stages.map((s, idx) => {
            const cfg = DOT_CONFIG[s.status];
            const Icon =
              s.status === 'completed'
                ? Check
                : s.status === 'running'
                  ? Loader2
                  : s.status === 'failed'
                    ? X
                    : null;
            return (
              <div key={`${s.name}-${idx}`} className="flex items-center" style={{ flex: idx === stages.length - 1 ? '0 0 auto' : '1 0 auto' }}>
                <div className="flex flex-col items-center shrink-0">
                  <div
                    data-testid={`stage-dot-${idx}`}
                    data-status={s.status}
                    className={`w-9 h-9 rounded-full ${cfg.bg} ${cfg.text} flex items-center justify-center shadow-sm ring-4 ${cfg.ring}`}
                  >
                    {Icon ? (
                      <Icon
                        className={`w-5 h-5 ${
                          s.status === 'running' ? 'animate-spin' : ''
                        }`}
                      />
                    ) : (
                      <span className="text-xs font-bold">{idx}</span>
                    )}
                  </div>
                  <div className="mt-2 text-xs font-medium text-gray-700 text-center">
                    {s.name}
                  </div>
                  <div className="text-[11px] text-gray-500 text-center">
                    {s.subtitle}
                  </div>
                </div>
                {idx < stages.length - 1 && (
                  <div
                    data-testid={`stage-line-${idx}`}
                    className={`h-1 flex-1 mx-1 rounded ${lineColor(s.status)}`}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
