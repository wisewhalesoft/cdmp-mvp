import { Link } from 'react-router-dom';
import {
  CheckCircle2,
  AlertCircle,
  FileBarChart,
  History,
  BarChart3,
  Layers,
  Award,
  CalendarX,
  Loader2,
  XCircle,
  Clock,
} from 'lucide-react';
import type { OverviewBlock, RecentRunBlock } from '@cdmp/shared';
import { OverviewBlockStatus } from './overview-block-status';

/**
 * F111 區塊四：最近一次月跑結果回顧（AC-13 / AC-14 / BR-5 / BR-8 / NFR-005）。
 *
 * 有完成月跑：部門設定 vs 實際偏差（偏差 > 門檻紅色警示）+ CARD_LEVEL / TIER 分布 + 導覽連結。
 * 空狀態：依 `emptyReason`（noRun / noCompletedRun + latestRunStatus）差異化文案，
 * 且**不** fallback 顯示其他月份之月跑資料（AC-14）。
 */

const SUMMARY_PATH = '/assignment/run-summary';
const HISTORY_PATH = '/assignment/history';

function deviationCls(dev: number): { fill: string; text: string; tag: string } {
  const a = Math.abs(dev);
  if (a > 3) return { fill: 'bg-[#EF4444]', text: 'text-[#EF4444]', tag: '警示' };
  if (a > 1) return { fill: 'bg-[#F59E0B]', text: 'text-[#F59E0B]', tag: '輕微' };
  return { fill: 'bg-[#22C55E]', text: 'text-[#22C55E]', tag: '正常' };
}

function DistBar({
  testId,
  label,
  count,
  ratio,
  max,
  color,
}: {
  testId: string;
  label: string;
  count: number;
  ratio: number;
  max: number;
  color: string;
}) {
  return (
    <div data-testid={testId} className="flex items-center gap-3">
      <span className="w-10 text-xs font-mono font-semibold text-gray-700">
        {label}
      </span>
      <div className="flex-1 h-3.5 rounded-md bg-gray-100 overflow-hidden">
        <div
          className="h-full rounded-md"
          style={{ width: `${(count / max) * 100}%`, background: color }}
        />
      </div>
      <span className="text-xs font-mono text-gray-600 w-16 text-right tabular-nums">
        {count.toLocaleString()}
      </span>
      <span className="text-xs text-gray-500 w-12 text-right tabular-nums">
        {ratio.toFixed(1)}%
      </span>
    </div>
  );
}

const LEVEL_COLORS = ['#2563EB', '#06B6D4', '#22C55E', '#F59E0B', '#8B5CF6'];
const TIER_COLORS = ['#6366F1', '#0EA5E9', '#14B8A6', '#84CC16', '#F59E0B'];

export interface RecentRunPanelProps {
  block: OverviewBlock<RecentRunBlock> | undefined;
  loading: boolean;
  onRetry: () => void;
}

export function RecentRunPanel({ block, loading, onRetry }: RecentRunPanelProps) {
  const content = block && block.error === false ? block : null;
  const present = content && content.hasCompletedRun ? content : null;

  const right = present ? (
    <div className="flex items-center gap-2">
      <Link
        to={`${SUMMARY_PATH}?runId=${present.runId}`}
        data-testid="view-summary"
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 border border-[#E5E7EB] rounded-md hover:bg-gray-50"
      >
        <FileBarChart className="w-3.5 h-3.5" />
        查看完整結果摘要
      </Link>
      <Link
        to={HISTORY_PATH}
        data-testid="view-history"
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 border border-[#E5E7EB] rounded-md hover:bg-gray-50"
      >
        <History className="w-3.5 h-3.5" />
        執行歷史
      </Link>
    </div>
  ) : undefined;

  return (
    <OverviewBlockStatus
      testId="block-recent-run"
      num={4}
      title="最近一次月跑結果（回顧）"
      sub={present ? '選定月份最近一次完成月跑' : undefined}
      numBg="#FEF3C7"
      numFg="#B45309"
      right={right}
      loading={loading}
      block={block}
      onRetry={onRetry}
    >
      {(data) => {
        if (!data.hasCompletedRun) {
          const reason = data.emptyReason;
          let Icon = CalendarX;
          let iconCls = 'text-gray-400';
          let title = '本月尚無已完成的月名單分派結果';
          let sub =
            '選定月份沒有任何月跑紀錄（不會顯示其他月份結果）。';
          if (reason === 'noCompletedRun') {
            if (data.latestRunStatus === 'running') {
              Icon = Loader2;
              iconCls = 'text-[#F59E0B] animate-spin';
              title = '本月月名單分派執行中，尚無可回顧結果';
              sub = '待本次月跑完成後，此處將顯示部門偏差與等級分布。';
            } else if (data.latestRunStatus === 'failed') {
              Icon = XCircle;
              iconCls = 'text-[#EF4444]';
              title = '本月最近一次月名單分派執行失敗，尚無可回顧結果';
              sub =
                '請至執行歷史檢視失敗原因後重新觸發（不會顯示其他月份結果）。';
            } else {
              Icon = Clock;
              iconCls = 'text-blue-500';
              title = '本月月名單分派等待執行中，尚無可回顧結果';
              sub = '待本次月跑完成後，此處將顯示部門偏差與等級分布。';
            }
          }
          return (
            <div
              data-testid="recent-run-empty"
              data-empty-reason={reason}
              data-latest-status={data.latestRunStatus ?? ''}
              className="rounded-lg border border-dashed border-[#E5E7EB] p-8 flex flex-col items-center text-center"
            >
              <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                <Icon className={`w-6 h-6 ${iconCls}`} />
              </div>
              <p className="text-sm font-semibold text-gray-700">{title}</p>
              <p className="text-xs text-gray-500 mt-1 max-w-md">{sub}</p>
              <Link
                to={HISTORY_PATH}
                data-testid="view-history"
                className="mt-3 inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-gray-700 border border-[#E5E7EB] rounded-md hover:bg-gray-50"
              >
                <History className="w-3.5 h-3.5" />
                查看執行歷史
              </Link>
            </div>
          );
        }

        const anyAlert = data.deptSummary.some((d) => d.alert);
        const maxRatio =
          Math.max(
            1,
            ...data.deptSummary.map((d) => Math.max(d.configRatio, d.actualRatio)),
          ) * 1.15;
        const levelMax = Math.max(1, ...data.levelDistribution.map((x) => x.count));
        const tierMax = Math.max(1, ...data.tierDistribution.map((x) => x.count));

        return (
          <>
            <div
              data-testid="run-meta"
              className="flex items-center flex-wrap gap-x-5 gap-y-1 mb-4 text-xs text-gray-500"
            >
              <span>
                Run ID{' '}
                <span className="font-mono text-gray-700 bg-gray-100 px-1.5 py-0.5 rounded">
                  {data.runId.slice(0, 8)}
                </span>
              </span>
              {data.finishedAt && (
                <span>
                  完成時間{' '}
                  <span className="font-mono text-gray-700">
                    {data.finishedAt.replace('T', ' ').slice(0, 16)}
                  </span>
                </span>
              )}
              <span>
                總分派{' '}
                <span className="font-semibold text-gray-800 tabular-nums">
                  {(data.totalCases ?? 0).toLocaleString()}
                </span>{' '}
                件
              </span>
              <span>
                名單覆蓋率{' '}
                <span className="font-semibold text-[#22C55E] tabular-nums">
                  {(data.coverageRate * 100).toFixed(1)}%
                </span>
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-[#22C55E] font-medium">
                <CheckCircle2 className="w-3 h-3" />
                已完成
              </span>
            </div>

            {anyAlert && (
              <div
                data-testid="deviation-alert"
                className="rounded-lg bg-red-50/60 border border-red-200 p-3 flex items-start gap-2 text-xs text-red-900 mb-4"
              >
                <AlertCircle className="w-4 h-4 text-[#EF4444] mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold">部門偏差警示（NFR-005）</p>
                  <p className="mt-0.5 text-red-800">
                    偵測到部門實際比例與設定比例偏差超過門檻。建議檢查部門比例設定或前往結果摘要比對。
                  </p>
                </div>
              </div>
            )}

            <div className="rounded-xl border border-[#E5E7EB] overflow-hidden mb-4">
              <div className="px-4 py-3 border-b border-[#E5E7EB] flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-semibold text-gray-700">
                  部門設定 vs 實際偏差
                </h3>
              </div>
              <div className="px-4 py-4 space-y-4" data-testid="dept-deviation">
                {data.deptSummary.map((d) => {
                  const s = deviationCls(d.deviation);
                  const cfgW = (d.configRatio / maxRatio) * 100;
                  const actW = (d.actualRatio / maxRatio) * 100;
                  return (
                    <div
                      key={d.deptId}
                      data-testid={`dev-row-${d.deptId}`}
                      data-alert={d.alert}
                      className={
                        d.alert
                          ? 'rounded-lg border border-red-200 bg-red-50/40 p-2'
                          : ''
                      }
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-semibold text-gray-600">
                            {d.deptId}
                          </span>
                          <span className="text-sm font-medium text-gray-800">
                            {d.deptName ?? d.deptId}
                          </span>
                          <span
                            className={`inline-flex px-2 py-0.5 text-[10px] font-semibold rounded-full ${s.fill} text-white`}
                          >
                            {s.tag}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-gray-500">
                            設定{' '}
                            <span className="font-mono text-gray-700">
                              {d.configRatio.toFixed(1)}%
                            </span>
                          </span>
                          <span className="text-gray-300">/</span>
                          <span className="text-gray-500">
                            實際{' '}
                            <span className="font-mono text-gray-700">
                              {d.actualRatio.toFixed(1)}%
                            </span>
                          </span>
                          <span className={`font-mono ${s.text} font-semibold`}>
                            {d.deviation > 0 ? '+' : ''}
                            {d.deviation.toFixed(1)}%
                          </span>
                          <span className="text-gray-400 tabular-nums">
                            ({d.actualCount.toLocaleString()})
                          </span>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span className="w-8 text-[10px] text-gray-400">
                            設定
                          </span>
                          <div className="flex-1 h-3.5 rounded-md bg-gray-100 overflow-hidden">
                            <div
                              className="h-full rounded-md bg-gray-300"
                              style={{ width: `${cfgW}%` }}
                            />
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="w-8 text-[10px] text-gray-400">
                            實際
                          </span>
                          <div className="flex-1 h-3.5 rounded-md bg-gray-100 overflow-hidden relative">
                            <div
                              className={`h-full rounded-md ${s.fill}`}
                              style={{ width: `${actW}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl border border-[#E5E7EB] p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Layers className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-semibold text-gray-700">
                    CARD_LEVEL 分布
                  </h3>
                </div>
                <div className="space-y-2.5" data-testid="level-distribution">
                  {data.levelDistribution.map((x, i) => (
                    <DistBar
                      key={x.cardLevel}
                      testId={`level-row-${x.cardLevel}`}
                      label={x.cardLevel}
                      count={x.count}
                      ratio={x.ratio}
                      max={levelMax}
                      color={LEVEL_COLORS[i % LEVEL_COLORS.length]}
                    />
                  ))}
                </div>
              </div>
              <div className="rounded-xl border border-[#E5E7EB] p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Award className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-semibold text-gray-700">
                    TIER 分布
                  </h3>
                </div>
                <div className="space-y-2.5" data-testid="tier-distribution">
                  {data.tierDistribution.map((x, i) => (
                    <DistBar
                      key={x.tierLevel}
                      testId={`tier-row-${x.tierLevel}`}
                      label={x.tierLevel}
                      count={x.count}
                      ratio={x.ratio}
                      max={tierMax}
                      color={TIER_COLORS[i % TIER_COLORS.length]}
                    />
                  ))}
                </div>
              </div>
            </div>
          </>
        );
      }}
    </OverviewBlockStatus>
  );
}
