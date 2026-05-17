import {
  Pencil,
  Building2,
  Users,
  Stamp,
  CheckCircle2,
  Ban,
  type LucideIcon,
} from 'lucide-react';

/**
 * StageBadge — 5 階段 + disabled 之色票徽章
 *
 * 對應 prototype: /prototypes/27-list-definition.html 第 230-244 行
 *
 * Stage 與配色：
 *   - draft           灰   #F3F4F6 / #6B7280   pencil
 *   - dept_ratio      藍   #DBEAFE / #1E40AF   building-2
 *   - personnel_ratio 青   #CFFAFE / #0E7490   users
 *   - approval        琥珀 #FEF3C7 / #92400E   stamp
 *   - ready           綠   #DCFCE7 / #15803D   check-circle-2
 *   - disabled        紅灰 #FECACA / #991B1B   ban (額外狀態，spec §status='inactive')
 */

export type Stage =
  | 'draft'
  | 'dept_ratio'
  | 'personnel_ratio'
  | 'approval'
  | 'ready'
  | 'disabled';

const CONFIG: Record<
  Stage,
  { label: string; bg: string; text: string; border: string; icon: LucideIcon }
> = {
  draft: {
    label: '草稿',
    bg: 'bg-gray-100',
    text: 'text-gray-600',
    border: 'border-gray-200',
    icon: Pencil,
  },
  dept_ratio: {
    label: '部門比例',
    bg: 'bg-blue-100',
    text: 'text-blue-800',
    border: 'border-blue-200',
    icon: Building2,
  },
  personnel_ratio: {
    label: '個別比例',
    bg: 'bg-cyan-100',
    text: 'text-cyan-800',
    border: 'border-cyan-200',
    icon: Users,
  },
  approval: {
    label: '待簽核',
    bg: 'bg-amber-100',
    text: 'text-amber-800',
    border: 'border-amber-200',
    icon: Stamp,
  },
  ready: {
    label: '準備完成',
    bg: 'bg-green-100',
    text: 'text-green-800',
    border: 'border-green-200',
    icon: CheckCircle2,
  },
  disabled: {
    label: '已停用',
    bg: 'bg-red-100',
    text: 'text-red-700',
    border: 'border-red-200',
    icon: Ban,
  },
};

export interface StageBadgeProps {
  stage: Stage;
  withCount?: number;
  className?: string;
}

export function StageBadge({ stage, withCount, className }: StageBadgeProps) {
  const cfg = CONFIG[stage];
  const Icon = cfg.icon;
  return (
    <span
      data-testid={`stage-badge-${stage}`}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${cfg.bg} ${cfg.text} ${cfg.border} ${className ?? ''}`}
    >
      <Icon className="w-3 h-3" />
      {cfg.label}
      {typeof withCount === 'number' && (
        <span className="ml-1 px-1.5 py-0.5 bg-white/60 rounded-full text-[10px]">
          {withCount}
        </span>
      )}
    </span>
  );
}

export const STAGE_ORDER: Stage[] = [
  'draft',
  'dept_ratio',
  'personnel_ratio',
  'approval',
  'ready',
];
