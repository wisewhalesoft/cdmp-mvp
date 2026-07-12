import {
  PhoneOutgoing,
  Info,
  CalendarOff,
  BarChart3,
  Gauge,
  AlertTriangle,
  Calendar,
} from 'lucide-react';
import type {
  OverviewBlock,
  DialingVolumeBlock,
  MonthTotal,
  DeptEstimateProjection,
} from '@cdmp/shared';
import { OverviewBlockStatus } from './overview-block-status';

/**
 * F111 區塊三：預計撥打量（AC-9 ~ AC-12 / BR-6）。
 *
 * (a) 本月/次月固定對比 headline（不受月份選擇器影響，BR-6；total=null → 「—」，empty≠zero）
 * (b) 選定月份每日撥打量圖表（非工作日視覺區分、hover 顯示明細）
 * (c) 部門預計撥打量分佈（處長 ratio=null → 隱藏佔比、標「（僅本部門）」）
 * (d) 人均每日可行性（overThreshold 紅色警示；perPerson=null → 「—」；threshold=null → 不警示）
 */

function fmtYmCompact(ym: string): string {
  return ym.replace('-', '');
}

/** 每日代表值：director 用 orgTotal；處長 orgTotal=null → 用 deptCells 加總（僅本部門）。 */
function dayValue(d: DeptEstimateProjection['days'][number]): number {
  if (d.orgTotal !== null && d.orgTotal !== undefined) return d.orgTotal;
  return d.deptCells.reduce((s, c) => s + c.cases, 0);
}

function HeadlineCard({
  testId,
  title,
  data,
}: {
  testId: string;
  title: string;
  data: MonthTotal;
}) {
  const isEmpty = data.total === null;
  return (
    <div
      data-testid={testId}
      className="rounded-xl border border-[#E5E7EB] p-4"
    >
      <div className="flex items-center justify-between mb-2">
        <div>
          <span className="text-xs text-gray-500">{title}</span>
          <span className="ml-1 font-mono text-[10px] text-gray-400">
            {fmtYmCompact(data.ym)}
          </span>
          {data.scopedToDept && (
            <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium bg-purple-100 text-purple-700">
              （僅本部門）
            </span>
          )}
        </div>
        <span className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
          <PhoneOutgoing className="w-4 h-4 text-blue-600" />
        </span>
      </div>
      {isEmpty ? (
        <>
          <div className="text-3xl font-bold text-gray-300 tabular-nums">—</div>
          <p className="text-xs text-[#F59E0B] mt-1 inline-flex items-center gap-1">
            <Info className="w-3 h-3" />
            本月尚無啟用名單
          </p>
        </>
      ) : (
        <>
          <div className="text-3xl font-bold text-gray-900 tabular-nums">
            {data.total!.toLocaleString()}
            <span className="text-sm font-medium text-gray-400 ml-1">件</span>
          </div>
          <p className="text-xs text-gray-400 mt-1">預估撥打總量</p>
        </>
      )}
    </div>
  );
}

function DailyChart({ selected }: { selected: DeptEstimateProjection }) {
  const workdays = selected.days.filter((d) => d.isWorkday);
  const hasData = selected.departments.length > 0 && workdays.length > 0;
  if (!hasData) {
    return (
      <div
        data-testid="daily-chart-empty"
        className="rounded-lg border border-dashed border-[#E5E7EB] p-8 flex flex-col items-center text-center"
      >
        <CalendarOff className="w-8 h-8 text-gray-300 mb-2" />
        <p className="text-sm font-semibold text-gray-600">本月尚無啟用名單</p>
        <p className="text-xs text-gray-400 mt-0.5">
          無每日撥打量可估算（empty ≠ 0）。
        </p>
      </div>
    );
  }
  const max = Math.max(1, ...workdays.map(dayValue));
  return (
    <div data-testid="daily-chart">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-gray-500">
          每日預估撥打量 · {fmtYmCompact(selected.ym)} · 共{' '}
          <span className="font-semibold text-gray-700">{workdays.length}</span>{' '}
          個上班日
        </span>
        <span className="flex items-center gap-3 text-[11px] text-gray-500">
          <span className="inline-flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-blue-500" />
            上班日
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-red-500" />
            人均超上限
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-gray-200" />
            休息日
          </span>
        </span>
      </div>
      <div
        className="flex items-end gap-[3px] overflow-x-auto pb-1"
        style={{ height: 172 }}
      >
        {selected.days.map((d) => {
          if (!d.isWorkday) {
            return (
              <div
                key={d.date}
                data-testid={`daily-col-${d.date}`}
                data-workday="false"
                title={`${d.date.slice(5)}（${d.weekday}）· 休息日`}
                className="flex flex-col items-center justify-end shrink-0"
                style={{ minWidth: 20, flex: '1 1 0', height: '100%' }}
              >
                <div
                  className="rounded-sm bg-gray-200"
                  style={{ width: '66%', maxWidth: 20, height: 6 }}
                />
                <span className="text-[9px] mt-1 text-gray-400">
                  {d.date.slice(8)}
                </span>
              </div>
            );
          }
          const v = dayValue(d);
          const over = d.deptCells.some((c) => c.overThreshold);
          const h = Math.round(8 + (v / max) * 150);
          return (
            <div
              key={d.date}
              data-testid={`daily-col-${d.date}`}
              data-workday="true"
              data-over={over}
              title={`${d.date.slice(5)}（${d.weekday}）：${v.toLocaleString()} 件`}
              className="flex flex-col items-center justify-end shrink-0"
              style={{ minWidth: 20, flex: '1 1 0', height: '100%' }}
            >
              <div
                className={`rounded-t-sm ${over ? 'bg-red-500' : 'bg-blue-500'}`}
                style={{ width: '66%', maxWidth: 20, height: h }}
              />
              <span className="text-[9px] mt-1 text-gray-400">
                {d.date.slice(8)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface FeasRow {
  deptCode: string;
  deptName: string;
  headcount: number;
  peakPer: number | null;
  over: boolean;
}

function deriveFeas(selected: DeptEstimateProjection): FeasRow[] {
  const workdays = selected.days.filter((d) => d.isWorkday);
  return selected.departments.map((dep) => {
    const perPersons: number[] = [];
    let over = false;
    for (const d of workdays) {
      const cell = d.deptCells.find((c) => c.deptCode === dep.deptCode);
      if (!cell) continue;
      if (cell.perPerson !== null && cell.perPerson !== undefined)
        perPersons.push(cell.perPerson);
      if (cell.overThreshold) over = true;
    }
    const peakPer =
      dep.activeHeadcount > 0 && perPersons.length
        ? Math.max(...perPersons)
        : null;
    return {
      deptCode: dep.deptCode,
      deptName: dep.deptName,
      headcount: dep.activeHeadcount,
      peakPer,
      over,
    };
  });
}

export interface DialingVolumePanelProps {
  block: OverviewBlock<DialingVolumeBlock> | undefined;
  loading: boolean;
  onRetry: () => void;
}

export function DialingVolumePanel({
  block,
  loading,
  onRetry,
}: DialingVolumePanelProps) {
  const content = block && block.error === false ? block : null;
  const selectedYm = content?.selected.ym ?? '';

  const right = content ? (
    <span
      data-testid="dialing-selected-month"
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-blue-50 text-primary border border-blue-100"
    >
      <Calendar className="w-3.5 h-3.5" />
      選定月份 {fmtYmCompact(selectedYm)}
    </span>
  ) : undefined;

  return (
    <OverviewBlockStatus
      testId="block-dialing-volume"
      num={3}
      title="預計撥打量"
      numBg="#DCFCE7"
      numFg="#15803D"
      right={right}
      loading={loading}
      block={block}
      onRetry={onRetry}
    >
      {(data) => {
        const selected = data.selected;
        const dist = selected.deptDistribution;
        const distMax = Math.max(1, ...dist.map((d) => d.totalCases));
        const feas = deriveFeas(selected);
        const threshold = selected.threshold;

        return (
          <>
            {/* (a) headline 本月 / 次月（固定） */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <HeadlineCard
                testId="headline-current"
                title="本月預計撥打量"
                data={data.headline.currentMonth}
              />
              <HeadlineCard
                testId="headline-next"
                title="次月預計撥打量"
                data={data.headline.nextMonth}
              />
            </div>

            {/* (b) 每日圖表 */}
            <div className="rounded-xl border border-[#E5E7EB] p-4 mb-4">
              <DailyChart selected={selected} />
            </div>

            {/* (c) 部門分佈 + (d) 人均可行性 */}
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl border border-[#E5E7EB] p-4">
                <div className="flex items-center gap-2 mb-3">
                  <BarChart3 className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-semibold text-gray-700">
                    部門預計撥打量分佈
                  </h3>
                </div>
                <div className="space-y-2.5" data-testid="dept-distribution">
                  {dist.length === 0 ? (
                    <p className="text-xs text-gray-400">本月尚無部門分佈資料。</p>
                  ) : (
                    dist.map((d) => (
                      <div
                        key={d.deptCode}
                        data-testid={`dist-row-${d.deptCode}`}
                        className="flex items-center gap-3"
                      >
                        <span className="w-16 text-xs text-gray-700 truncate">
                          {d.deptName}
                        </span>
                        <div className="flex-1 h-3.5 rounded-md bg-gray-100 overflow-hidden">
                          <div
                            className="h-full rounded-md bg-primary"
                            style={{
                              width: `${(d.totalCases / distMax) * 100}%`,
                            }}
                          />
                        </div>
                        <span className="text-xs font-mono text-gray-700 w-16 text-right tabular-nums">
                          {d.totalCases.toLocaleString()}
                        </span>
                        {d.ratio === null ? (
                          <span className="text-[10px] text-gray-400 w-12 text-right">
                            （僅本部門）
                          </span>
                        ) : (
                          <span className="text-xs text-gray-500 w-12 text-right tabular-nums">
                            {d.ratio}%
                          </span>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-[#E5E7EB] p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Gauge className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-semibold text-gray-700">
                    人均每日可行性
                  </h3>
                  <span className="text-xs text-gray-400">
                    尖峰人均/日 ·{' '}
                    {threshold !== null ? `上限 ${threshold} 件` : '未設定上限'}
                  </span>
                </div>
                <div className="space-y-2" data-testid="feasibility">
                  {feas.length === 0 ? (
                    <p className="text-xs text-gray-400">本月尚無可行性資料。</p>
                  ) : (
                    feas.map((f) => {
                      let badge;
                      if (f.headcount === 0) {
                        badge = (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-orange-100 text-orange-700">
                            — 待補人力
                          </span>
                        );
                      } else if (f.over) {
                        badge = (
                          <span
                            title={
                              threshold !== null
                                ? `超過每人每日上限 ${threshold} 件`
                                : undefined
                            }
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-100 text-red-700"
                          >
                            <AlertTriangle className="w-3 h-3" />
                            {f.peakPer} · 超上限
                          </span>
                        );
                      } else {
                        badge = (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-100 text-emerald-700">
                            {f.peakPer === null ? '—' : f.peakPer} · 正常
                          </span>
                        );
                      }
                      return (
                        <div
                          key={f.deptCode}
                          data-testid={`feas-row-${f.deptCode}`}
                          className={`flex items-center justify-between px-3 py-2 rounded-lg border ${
                            f.over
                              ? 'border-red-200 bg-red-50/50'
                              : 'border-[#E5E7EB]'
                          }`}
                        >
                          <div>
                            <span className="text-sm text-gray-800">
                              {f.deptName}
                            </span>
                            <span className="ml-2 text-[11px] text-gray-400">
                              在職{' '}
                              {f.headcount === 0
                                ? '0（待同步）'
                                : f.headcount}{' '}
                              人
                            </span>
                          </div>
                          {badge}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            <p className="mt-3 text-[11px] text-gray-400 inline-flex items-center gap-1">
              <Info className="w-3 h-3" />
              上方「本月 / 次月」為固定營運節奏對比（不受月份選擇器影響）；每日圖表 /
              部門分佈 / 可行性依選定月份。
            </p>
          </>
        );
      }}
    </OverviewBlockStatus>
  );
}
