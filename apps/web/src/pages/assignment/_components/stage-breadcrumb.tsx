import { Check, GitBranch } from 'lucide-react';

/**
 * 5-step E07 名單階段路徑視覺
 *
 * 對應 prototype: 29a / 29b / 29c / 29d 共用 stage path step bar
 * （draft → dept_ratio → personnel_ratio → approval → ready）
 *
 * 給 prototype 29a L120-149 / 29b L126-140 / 29c / 29d 對齊用。
 */

const STAGES: Array<{ key: string; label: string }> = [
  { key: 'draft', label: '草稿' },
  { key: 'dept_ratio', label: '部門比例' },
  { key: 'personnel_ratio', label: '個別業務比例' },
  { key: 'approval', label: '簽核' },
  { key: 'ready', label: '準備完成' },
];

type StepState = 'done' | 'current' | 'todo';

function StageStep({ state, idx, label }: { state: StepState; idx: number; label: string }) {
  const dotClass = {
    done: 'bg-green-100 text-green-700',
    current: 'bg-blue-100 text-blue-700 ring-2 ring-blue-300',
    todo: 'bg-gray-100 text-gray-400',
  }[state];
  const labelClass = {
    done: 'text-gray-500',
    current: 'font-semibold text-primary',
    todo: 'text-gray-400',
  }[state];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span
        className={`inline-flex items-center justify-center w-[18px] h-[18px] rounded-full text-[10px] font-semibold ${dotClass}`}
        data-testid={`stage-step-${idx}-${state}`}
      >
        {state === 'done' ? <Check className="w-3 h-3" /> : idx}
      </span>
      <span className={labelClass}>{label}</span>
    </span>
  );
}

export interface StageBreadcrumbProps {
  currentStage: string;
  /** 右側顯示的 feature IDs (例如「F079 / F080 / F081」)。 */
  featureIds?: string;
}

export function StageBreadcrumb({ currentStage, featureIds }: StageBreadcrumbProps) {
  const currentIdx = STAGES.findIndex((s) => s.key === currentStage);
  return (
    <div
      className="bg-white border border-gray-200 rounded-lg px-6 py-3 flex items-center gap-3 flex-wrap"
      data-testid="stage-breadcrumb"
    >
      <span className="text-xs text-gray-400 mr-1">階段路徑：</span>
      {STAGES.map((s, i) => {
        const state: StepState =
          i < currentIdx ? 'done' : i === currentIdx ? 'current' : 'todo';
        return (
          <span key={s.key} className="inline-flex items-center gap-2">
            <StageStep state={state} idx={i + 1} label={s.label} />
            {i < STAGES.length - 1 && <span className="text-gray-300 text-sm">›</span>}
          </span>
        );
      })}
      {featureIds && (
        <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-gray-400">
          <GitBranch className="w-3 h-3" />
          {featureIds}
        </span>
      )}
    </div>
  );
}
