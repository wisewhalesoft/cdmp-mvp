import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  Inbox,
  Loader2,
  ListChecks,
  PlayCircle,
  Eye,
  Database,
  UserCheck,
  CalendarDays,
  Shield,
  SlidersHorizontal,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import type {
  OverviewBlock,
  RunReadinessBlock,
  EtlSourceStatus,
} from '@cdmp/shared';
import { OverviewBlockStatus } from './overview-block-status';

/**
 * F111 區塊二：月名單分派就緒狀態 + ETL 前置檢查（AC-6 / AC-7 / AC-8 / BR-7）。
 *
 * 就緒燈號與月跑狀態徽章為不同維度（BR-7，兩個獨立 DOM 節點）；4 項 ETL 來源 + 計分卡狀態；
 * 「前往觸發月名單分派」連結僅 `canNavigateToTrigger`（director/admin）時存在（AC-8，非 disabled）。
 */

const TRIGGER_PATH = '/assignment/run';

const RUN_STATUS_LABEL: Record<RunReadinessBlock['monthlyRunStatus'], string> = {
  none: '尚未執行',
  pending: '等待中',
  running: '執行中',
  completed: '已完成',
  failed: '失敗',
};

const RUN_STATUS_CLS: Record<RunReadinessBlock['monthlyRunStatus'], string> = {
  none: 'bg-gray-100 text-gray-600',
  pending: 'bg-blue-100 text-blue-700',
  running: 'bg-amber-100 text-amber-700',
  completed: 'bg-green-100 text-[#22C55E]',
  failed: 'bg-red-100 text-red-700',
};

type EtlKey = 'pooldata' | 'emphire' | 'calendar' | 'arreturndf';

const ETL_SOURCES: Array<{
  key: EtlKey;
  label: string;
  table: string;
  icon: LucideIcon;
}> = [
  { key: 'pooldata', label: '客戶名單池', table: 'ob_pool_data', icon: Database },
  { key: 'emphire', label: '在職名單', table: 'ob_emphire', icon: UserCheck },
  { key: 'calendar', label: '工作日曆', table: 'ob_calendar', icon: CalendarDays },
  { key: 'arreturndf', label: '最低回收上限', table: 'ob_arreturndf', icon: Shield },
];

function etlNote(st: EtlSourceStatus): string {
  if (st.status === 'running') return '同步中';
  if (st.status === 'failed') return '同步失敗';
  if (st.status === 'missing') return '無紀錄';
  if (st.rowCount === 0) return '空表';
  return '已同步';
}

function EtlChip({
  src,
  st,
}: {
  src: (typeof ETL_SOURCES)[number];
  st: EtlSourceStatus;
}) {
  const warn = st.status !== 'completed' || st.rowCount === 0;
  const Icon = src.icon;
  const cnt = st.status === 'running' ? '—' : st.rowCount.toLocaleString();
  return (
    <div
      data-testid={`etl-chip-${src.key}`}
      aria-invalid={warn}
      className={`rounded-lg border p-3 ${
        warn ? 'border-amber-200 bg-amber-50' : 'border-green-200 bg-green-50'
      }`}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <Icon className="w-4 h-4 text-gray-400" />
        <span className="text-xs font-medium text-gray-700">{src.label}</span>
        {warn ? (
          <AlertTriangle className="w-4 h-4 text-[#F59E0B] ml-auto" />
        ) : (
          <CheckCircle2 className="w-4 h-4 text-[#22C55E] ml-auto" />
        )}
      </div>
      <div className="flex items-baseline justify-between">
        <span
          className={`text-lg font-bold tabular-nums ${
            warn ? 'text-amber-700' : 'text-gray-700'
          }`}
        >
          {cnt}
        </span>
        <span
          className={`text-[10px] ${
            warn ? 'text-amber-700 font-medium' : 'text-gray-400'
          }`}
        >
          {etlNote(st)}
        </span>
      </div>
      <div className="text-[10px] text-gray-400 mt-0.5 font-mono truncate">
        {src.table}
      </div>
    </div>
  );
}

export interface RunReadinessPanelProps {
  block: OverviewBlock<RunReadinessBlock> | undefined;
  loading: boolean;
  onRetry: () => void;
}

export function RunReadinessPanel({
  block,
  loading,
  onRetry,
}: RunReadinessPanelProps) {
  const content = block && block.error === false ? block : null;

  const right = content ? (
    content.canNavigateToTrigger ? (
      <Link
        to={TRIGGER_PATH}
        data-testid="trigger-link"
        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-primary border border-blue-200 bg-blue-50 rounded-md hover:bg-blue-100"
      >
        <PlayCircle className="w-4 h-4" />
        前往觸發月名單分派
      </Link>
    ) : (
      <span
        data-testid="trigger-readonly"
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-gray-100 text-gray-500"
      >
        <Eye className="w-3.5 h-3.5" />
        唯讀 · 無觸發權限
      </span>
    )
  ) : undefined;

  return (
    <OverviewBlockStatus
      testId="block-run-readiness"
      num={2}
      title="月名單分派就緒狀態"
      sub="名單就緒與月跑狀態為不同維度"
      numBg="#EDE9FE"
      numFg="#6D28D9"
      right={right}
      loading={loading}
      block={block}
      onRetry={onRetry}
    >
      {(data) => {
        const notReady = data.totalActiveLists - data.readyCount;
        const chipCls = RUN_STATUS_CLS[data.monthlyRunStatus];
        const chipLabel = RUN_STATUS_LABEL[data.monthlyRunStatus];
        const emptySources = ETL_SOURCES.filter((s) => {
          const st = data.etlStatus[s.key];
          return st.status !== 'completed' || st.rowCount === 0;
        });
        const scoringBad = !data.scoringActive;

        let banner;
        if (data.totalActiveLists === 0) {
          banner = (
            <div
              data-testid="readiness-banner"
              data-ready="none"
              className="rounded-lg bg-gray-50 border border-[#E5E7EB] p-4 flex items-center gap-3"
            >
              <div className="w-11 h-11 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                <Inbox className="w-5 h-5 text-gray-400" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-700">
                  本月尚無啟用名單
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  尚無可執行月名單分派的名單。
                </p>
              </div>
              <span
                data-testid="run-status-chip"
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${chipCls}`}
              >
                月跑：{chipLabel}
              </span>
            </div>
          );
        } else if (data.allReady) {
          banner = (
            <div
              data-testid="readiness-banner"
              data-ready="all"
              className="rounded-lg bg-green-50/60 border border-green-200 p-4 flex items-center gap-3"
            >
              <div className="w-11 h-11 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-6 h-6 text-[#22C55E]" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-green-900">
                  本月所有名單已就緒 · 可執行月名單分派
                </p>
                <p className="text-xs text-green-700 mt-0.5">
                  <span data-testid="readiness-count" className="font-semibold tabular-nums">
                    {data.readyCount} / {data.totalActiveLists}
                  </span>{' '}
                  已就緒
                </p>
              </div>
              <span
                data-testid="run-status-chip"
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${chipCls}`}
              >
                月跑：{chipLabel}
              </span>
            </div>
          );
        } else {
          banner = (
            <div
              data-testid="readiness-banner"
              data-ready="partial"
              className="rounded-lg bg-amber-50/70 border border-amber-200 p-4 flex items-center gap-3"
            >
              <div className="w-11 h-11 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6 text-[#F59E0B]" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-amber-900">
                  尚有 <span className="tabular-nums">{notReady}</span> 筆未就緒
                </p>
                <p className="text-xs text-amber-800 mt-0.5">
                  <span data-testid="readiness-count" className="font-semibold tabular-nums">
                    {data.readyCount} / {data.totalActiveLists}
                  </span>{' '}
                  已就緒，待全部就緒方可執行月名單分派
                </p>
              </div>
              <span
                data-testid="run-status-chip"
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${chipCls}`}
              >
                月跑：{chipLabel}
              </span>
            </div>
          );
        }

        return (
          <>
            {banner}
            {data.monthlyRunStatus === 'running' && (
              <div
                data-testid="running-hint"
                className="mt-2 rounded-lg bg-amber-50/50 border border-amber-100 p-2.5 flex items-center gap-2 text-xs text-amber-800"
              >
                <Loader2 className="w-3.5 h-3.5 text-[#F59E0B] animate-spin" />
                月名單分派執行中，本頁資料仍可檢視。
              </div>
            )}

            <div className="mt-4">
              <div className="flex items-center gap-2 mb-2">
                <ListChecks className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-semibold text-gray-700">
                  來源資料前置檢查
                </h3>
                <span className="text-xs text-gray-400">4 張來源表 + 計分卡</span>
              </div>
              <div className="grid grid-cols-5 gap-3">
                {ETL_SOURCES.map((s) => (
                  <EtlChip key={s.key} src={s} st={data.etlStatus[s.key]} />
                ))}
                <div
                  data-testid="scoring-chip"
                  aria-invalid={scoringBad}
                  className={`rounded-lg border p-3 ${
                    scoringBad
                      ? 'border-red-200 bg-red-50'
                      : 'border-green-200 bg-green-50'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <SlidersHorizontal className="w-4 h-4 text-gray-400" />
                    <span className="text-xs font-medium text-gray-700">
                      計分卡
                    </span>
                    {scoringBad ? (
                      <XCircle className="w-4 h-4 ml-auto text-[#EF4444]" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4 ml-auto text-[#22C55E]" />
                    )}
                  </div>
                  <div
                    className={`text-sm font-semibold ${
                      scoringBad ? 'text-red-700' : 'text-[#22C55E]'
                    }`}
                  >
                    {scoringBad ? '未啟用' : '已啟用'}
                  </div>
                  <div className="text-[10px] text-gray-400 mt-0.5">
                    計分版本 {scoringBad ? '無 active' : 'active'}
                  </div>
                </div>
              </div>
            </div>

            {(emptySources.length > 0 || scoringBad) && (
              <div
                data-testid="readiness-warn"
                className="mt-3 rounded-lg bg-amber-50 border border-amber-200 p-3 flex items-start gap-2 text-xs text-amber-900"
              >
                <AlertTriangle className="w-4 h-4 text-[#F59E0B] mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold">前置檢查未全數通過</p>
                  <p className="mt-0.5 text-amber-800">
                    {[
                      ...emptySources.map((s) => {
                        const st = data.etlStatus[s.key];
                        return st.status === 'failed'
                          ? `${s.label}同步失敗`
                          : st.status === 'running'
                            ? `${s.label}同步中`
                            : `${s.label}為空表`;
                      }),
                      ...(scoringBad ? ['計分卡未啟用'] : []),
                    ].join('、')}
                    。請確認來源資料已完成同步後再執行月名單分派。
                  </p>
                </div>
              </div>
            )}
          </>
        );
      }}
    </OverviewBlockStatus>
  );
}
