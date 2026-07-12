import { useNavigate } from 'react-router-dom';
import {
  FileText,
  Building2,
  Users,
  FileCheck,
  CheckCircle2,
  ListTodo,
  PartyPopper,
  ClipboardList,
  Plus,
  ArrowRight,
  ChevronRight,
  type LucideIcon,
} from 'lucide-react';
import type { OverviewBlock, StageTodoBlock } from '@cdmp/shared';
import { OverviewBlockStatus } from './overview-block-status';

/**
 * F111 區塊一：名單階段待辦（AC-4 / AC-5 / BR-11）。
 *
 * 5 張階段 KPI 卡（點擊導向名單定義並聚焦該階段）+ 未完成名單待辦清單
 * （>50 筆顯示前 50 + 查看全部）。兩種空狀態明確區分（AC-4 引導建立 vs AC-5 正向提示）。
 */

const LIST_DEF_PATH = '/assignment/list-definitions';

type StageKey =
  | 'draft'
  | 'dept_ratio'
  | 'personnel_ratio'
  | 'approval'
  | 'ready';

const STAGE_CARDS: Array<{
  key: StageKey;
  label: string;
  icon: LucideIcon;
  box: string;
  ic: string;
}> = [
  { key: 'draft', label: '草稿', icon: FileText, box: 'bg-gray-100', ic: 'text-gray-500' },
  { key: 'dept_ratio', label: '待部門比例', icon: Building2, box: 'bg-blue-50', ic: 'text-blue-600' },
  { key: 'personnel_ratio', label: '待個別比例', icon: Users, box: 'bg-indigo-50', ic: 'text-indigo-600' },
  { key: 'approval', label: '待簽核', icon: FileCheck, box: 'bg-amber-50', ic: 'text-amber-600' },
  { key: 'ready', label: '準備完成', icon: CheckCircle2, box: 'bg-emerald-50', ic: 'text-emerald-600' },
];

const STAGE_BADGE: Record<string, { label: string; cls: string }> = {
  draft: { label: '草稿', cls: 'bg-gray-100 text-gray-600' },
  dept_ratio: { label: '部門比例', cls: 'bg-blue-100 text-blue-700' },
  personnel_ratio: { label: '個別比例', cls: 'bg-indigo-100 text-indigo-700' },
  approval: { label: '待簽核', cls: 'bg-amber-100 text-amber-700' },
};

const TODO_LIMIT = 50;

export interface StageTodoPanelProps {
  block: OverviewBlock<StageTodoBlock> | undefined;
  loading: boolean;
  onRetry: () => void;
}

export function StageTodoPanel({ block, loading, onRetry }: StageTodoPanelProps) {
  const navigate = useNavigate();

  return (
    <OverviewBlockStatus
      testId="block-stage-todo"
      num={1}
      title="名單階段待辦"
      sub="點卡片前往名單定義聚焦該階段"
      loading={loading}
      block={block}
      onRetry={onRetry}
    >
      {(data) => {
        const shown = data.notReadyLists.slice(0, TODO_LIMIT);
        return (
          <>
            <div className="grid grid-cols-5 gap-3 mb-4">
              {STAGE_CARDS.map((c) => {
                const Icon = c.icon;
                return (
                  <button
                    key={c.key}
                    type="button"
                    data-testid={`stage-kpi-${c.key}`}
                    onClick={() =>
                      navigate(`${LIST_DEF_PATH}?stage=${c.key}`)
                    }
                    className="text-left bg-white rounded-xl border border-[#E5E7EB] p-4 hover:shadow-md hover:border-blue-200 transition cursor-pointer group"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-gray-500">{c.label}</span>
                      <span
                        className={`w-8 h-8 rounded-lg ${c.box} flex items-center justify-center`}
                      >
                        <Icon className={`w-4 h-4 ${c.ic}`} />
                      </span>
                    </div>
                    <div className="text-2xl font-bold tabular-nums text-gray-900">
                      {data.stageCounts[c.key]}
                    </div>
                    <div className="mt-1 text-[11px] text-gray-400 inline-flex items-center gap-0.5 group-hover:text-primary">
                      前往名單定義
                      <ArrowRight className="w-3 h-3" />
                    </div>
                  </button>
                );
              })}
            </div>

            {!data.hasAnyList ? (
              <div
                data-testid="stage-todo-empty"
                className="rounded-lg border border-dashed border-[#E5E7EB] p-8 flex flex-col items-center text-center"
              >
                <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                  <ClipboardList className="w-6 h-6 text-gray-400" />
                </div>
                <p className="text-sm font-semibold text-gray-700">
                  本月尚無名單定義
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  請至名單定義頁建立本月分派名單。
                </p>
                <button
                  type="button"
                  data-testid="stage-todo-create"
                  onClick={() => navigate(LIST_DEF_PATH)}
                  className="mt-3 inline-flex items-center gap-1.5 px-3.5 py-2 bg-primary text-white text-xs rounded-md hover:bg-blue-700"
                >
                  <Plus className="w-3.5 h-3.5" />
                  前往建立
                </button>
              </div>
            ) : shown.length === 0 ? (
              <div
                data-testid="stage-todo-all-ready"
                className="rounded-lg bg-green-50/60 border border-green-200 p-6 flex items-center gap-3"
              >
                <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                  <PartyPopper className="w-5 h-5 text-[#22C55E]" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-green-900">
                    目前無未完成名單
                  </p>
                  <p className="text-xs text-green-700 mt-0.5">
                    本月所有名單皆已進入「準備完成」階段。
                  </p>
                </div>
              </div>
            ) : (
              <div data-testid="stage-todo-list">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-gray-700 inline-flex items-center gap-1.5">
                    <ListTodo className="w-4 h-4 text-[#F59E0B]" />
                    未完成名單待辦清單
                  </h3>
                  <span className="text-xs text-gray-400">
                    共{' '}
                    <span className="font-semibold text-gray-600">
                      {data.notReadyCount}
                    </span>{' '}
                    筆未就緒
                  </span>
                </div>
                <div
                  className="space-y-2 overflow-y-auto pr-1"
                  style={{ maxHeight: 260 }}
                >
                  {shown.map((l) => {
                    const badge = STAGE_BADGE[l.stage] ?? {
                      label: l.stage,
                      cls: 'bg-gray-100 text-gray-600',
                    };
                    return (
                      <button
                        key={l.listNo}
                        type="button"
                        data-testid={`todo-row-${l.listNo}`}
                        onClick={() =>
                          navigate(`${LIST_DEF_PATH}?listNo=${l.listNo}`)
                        }
                        className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg border border-[#E5E7EB] hover:border-blue-200 hover:bg-blue-50/40 transition cursor-pointer"
                      >
                        <span className="font-mono text-xs text-gray-500 w-28 shrink-0">
                          {l.listNo}
                        </span>
                        <span className="flex-1 text-sm text-gray-800 truncate">
                          {l.listNm}
                        </span>
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${badge.cls}`}
                        >
                          {badge.label}
                        </span>
                        <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
                      </button>
                    );
                  })}
                </div>
                {data.notReadyCount > TODO_LIMIT && (
                  <div className="mt-2 flex items-center justify-between px-1">
                    <span className="text-xs text-gray-400">
                      顯示前 {TODO_LIMIT} 筆 · 共{' '}
                      <span className="font-semibold text-gray-600">
                        {data.notReadyCount}
                      </span>{' '}
                      筆
                    </span>
                    <button
                      type="button"
                      data-testid="todo-view-all"
                      onClick={() => navigate(LIST_DEF_PATH)}
                      className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                    >
                      查看全部
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        );
      }}
    </OverviewBlockStatus>
  );
}
