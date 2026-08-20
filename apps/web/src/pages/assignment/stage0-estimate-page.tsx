import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarCheck,
  Inbox,
  Gauge,
  Users,
  GitPullRequestDraft,
  Eye,
  ScanEye,
  Lock,
  Building2,
  CalendarDays,
  Calendar,
  Layers,
  FileText,
  UserX,
  Table,
  ChevronDown,
  Info,
  Loader2,
  Hourglass,
} from 'lucide-react';
import { AppLayout } from '@/components/layout/app-layout';
import { MonthPicker } from '@/components/e07/MonthPicker';
import { useAssignmentWorkYm } from '@/contexts/assignment-work-ym-context';
import {
  getDeptEstimate,
  getListEstimateOverview,
  type DeptEstimateResponse,
  type DeptEstimateDay,
  type ListEstimateOverviewResponse,
  type CalendarSource,
} from '@/api/assignment-run';
import { listLists } from '@/api/assignment-list';
import { ListEstimateOverviewSection } from './_components/list-estimate-overview-section';

/**
 * F049 v2.0 Stage 0 試算頁（部門維度每日分派可行性）
 *
 * 對應 prototype 30-stage0-estimate.html（業務化重設計版）/ US-166~170 / AD-E07-v3.6。
 *
 * 主視角：本月全名單彙總後，各部門每天要分派幾件、平均每位電訪員一天要打幾通。
 *   - 預設「全名單彙總」；名單篩選可鑽探單一名單（US-166）。
 *   - 月曆 + 部門切換器（全部門合計顯示總量＋缺口；單一部門顯示件數＋人均）。
 *   - 處長唯讀、僅見轄區、不見全部門合計；scope=null 友善降級（US-168）。
 *   - 已移除所有技術術語（US-170）：底層計算保留，不暴露給使用者。
 */

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

const CALENDAR_OPTIONS: Array<{
  value: CalendarSource;
  label: string;
  help: string;
}> = [
  {
    value: 'weekday',
    label: '只排上班日',
    help: '僅安排週一至週五的正常上班日，排除週末與國定假日。',
  },
  {
    value: 'weekday-only',
    label: '也排連假日（週末除外）',
    help: '安排週一至週五，含國定假日（連假當天照樣派案）。',
  },
  {
    value: 'all',
    label: '連週末都排（全月每天）',
    help: '整個月每天都安排派案，含週末與假日；可評估假日派案情境。',
  },
];

function toYYYYMMRaw(yyyyMm: string): string {
  return yyyyMm.replace('-', '');
}
function toHyphen(yyyymm: string): string {
  if (!yyyymm || yyyymm.length < 6) return '';
  return `${yyyymm.slice(0, 4)}-${yyyymm.slice(4, 6)}`;
}

interface DeptStat {
  deptCode: string;
  deptName: string;
  headcount: number;
  monthCases: number;
  peak: number | null;
  avg: number | null;
}

/** 由 days[] 聚合各部門本月件數、尖峰／平均人均。 */
function computeDeptStats(data: DeptEstimateResponse): DeptStat[] {
  const workdays = data.days.filter((d) => d.isWorkday);
  return data.departments.map((dep) => {
    const dailyCases = workdays.map(
      (d) => d.deptCells.find((c) => c.deptCode === dep.deptCode)?.cases ?? 0,
    );
    const monthCases = dailyCases.reduce((s, v) => s + v, 0);
    let peak: number | null = null;
    let avg: number | null = null;
    if (dep.activeHeadcount > 0 && workdays.length) {
      const pps = dailyCases.map((c) => Math.round(c / dep.activeHeadcount));
      peak = Math.max(...pps);
      avg = Math.round(pps.reduce((a, b) => a + b, 0) / pps.length);
    }
    return {
      deptCode: dep.deptCode,
      deptName: dep.deptName,
      headcount: dep.activeHeadcount,
      monthCases,
      peak,
      avg,
    };
  });
}

export function Stage0EstimatePage() {
  const { currentWorkYm, targetWorkYm, setTargetWorkYm } = useAssignmentWorkYm();
  const ym = toHyphen(targetWorkYm); // YYYY-MM（顯示用）

  const [data, setData] = useState<DeptEstimateResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lists, setLists] = useState<Array<{ listNo: string; listNm: string }>>(
    [],
  );
  const [listFilter, setListFilter] = useState<string>('ALL');
  const [calendarSource, setCalendarSource] = useState<CalendarSource>('weekday');
  const [selectedDept, setSelectedDept] = useState<string>('ALL');
  // F120：名單基礎預估數量總覽（獨立端點、獨立降級——不與部門矩陣共用 loading / error 狀態，
  //   對齊 AD-E07-51 §4.1「獨立降級」之設計意圖）
  const [listOverview, setListOverview] =
    useState<ListEstimateOverviewResponse | null>(null);

  // 載入當月 active 名單（供名單篩選下拉）
  useEffect(() => {
    if (!ym) return;
    let aborted = false;
    void (async () => {
      try {
        const resp = await listLists({ ym: toYYYYMMRaw(ym) });
        if (aborted) return;
        const active = (resp.lists ?? [])
          .filter((l) => l.status === 'active')
          .map((l) => ({ listNo: l.listNo, listNm: l.listNm }));
        setLists(active);
      } catch {
        if (!aborted) setLists([]);
      }
    })();
    return () => {
      aborted = true;
    };
  }, [ym]);

  // F120：載入名單基礎預估數量總覽（隨同一個名單篩選器與作業月份連動，AC-LIST-02；
  //   本區塊無日曆維度，故不隨 calendarSource 重抓）
  useEffect(() => {
    if (!ym) return;
    let aborted = false;
    void (async () => {
      try {
        const resp = await getListEstimateOverview(toYYYYMMRaw(ym), {
          listNo: listFilter === 'ALL' ? undefined : listFilter,
        });
        if (!aborted) setListOverview(resp ?? null);
      } catch {
        // 獨立降級：本區塊失敗不影響部門矩陣之呈現（反之亦然）
        if (!aborted) setListOverview(null);
      }
    })();
    return () => {
      aborted = true;
    };
  }, [ym, listFilter]);

  // 載入部門維度試算矩陣（ym / calendarSource / listFilter 變化即重抓）
  useEffect(() => {
    if (!ym) return;
    let aborted = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const resp = await getDeptEstimate(toYYYYMMRaw(ym), {
          calendarSource,
          listNo: listFilter === 'ALL' ? undefined : listFilter,
        });
        if (!aborted) setData(resp);
      } catch (err: unknown) {
        const e = err as { response?: { data?: { message?: string } } };
        if (!aborted)
          setError(e?.response?.data?.message ?? '試算失敗，請稍後再試');
      } finally {
        if (!aborted) setLoading(false);
      }
    })();
    return () => {
      aborted = true;
    };
  }, [ym, calendarSource, listFilter]);

  const isSectionChief = data?.scope.scoped === true;
  const scopeUnresolved =
    isSectionChief &&
    (data?.warnings.some((w) => w.code === 'SCOPE_UNRESOLVED') ?? false);
  const hasActiveList = lists.length > 0;

  /**
   * F119 / AC-13 / BR-13（AD-E07-50 §3.7）：`STAGE0_LIST_ESTIMATE_PARTIAL` 逐筆渲染。
   *
   * 沿用既有 `warnings[]` 陣列迭代管道（不另建平行機制）；不分觸發原因一律渲染
   * （後端同一 warning code、同一產生路徑，無從區分是文字運算子 LIKE 全表掃描逾時
   * 或既有 IN 條件在寬鬆篩選下逾時）。多名單同時逾時時**逐筆**可辨識。
   */
  const listPartialWarnings = useMemo(
    () =>
      (data?.warnings ?? []).filter(
        (w) => w.code === 'STAGE0_LIST_ESTIMATE_PARTIAL',
      ),
    [data],
  );
  /** AC-13：件數 KPI 之「不完整」徽章提示文字（列出逾時名單編號）。 */
  const partialBadgeTitle =
    listPartialWarnings.length > 0
      ? `未涵蓋 ${listPartialWarnings.length} 張估算逾時的名單：${listPartialWarnings
          .map((w) => w.listNo ?? '')
          .join('、')}`
      : undefined;

  const deptStats = useMemo<DeptStat[]>(
    () => (data ? computeDeptStats(data) : []),
    [data],
  );

  // 處長鎖定轄區；部長預設「全部門合計」，部門被移除時退回 ALL
  useEffect(() => {
    if (!data) return;
    if (isSectionChief) {
      setSelectedDept(data.departments[0]?.deptCode ?? '');
    } else if (
      selectedDept !== 'ALL' &&
      !data.departments.some((d) => d.deptCode === selectedDept)
    ) {
      setSelectedDept('ALL');
    }
  }, [data, isSectionChief]); // eslint-disable-line react-hooks/exhaustive-deps

  const workingDays = data?.days.filter((d) => d.isWorkday).length ?? 0;
  const calLabel =
    CALENDAR_OPTIONS.find((o) => o.value === calendarSource)?.label ?? '';
  const calHelp =
    CALENDAR_OPTIONS.find((o) => o.value === calendarSource)?.help ?? '';

  // F049 v2.1 §16.5 / AC-DEPT-3 / BR-17：月層級全名單總量**直接取用後端欄位**
  //   （`Σ_L 名單估算件數` 之整數精確和）。
  //   ⚠️ 不得改回客戶端 `Σ_d days[].orgTotal`（逐日捨入和）作為值或 fallback——該值與
  //   F120「名單基礎預估數量總覽」之預估數量總計不會嚴格相等（殘差 ≤ 工作日數 × 0.5）。
  const orgMonthTotal = data?.orgMonthTotal ?? 0;
  const gapMonth = useMemo(() => {
    if (!data) return 0;
    return data.days
      .filter((d) => d.isWorkday)
      .reduce((s, d) => s + (d.gap ?? 0), 0);
  }, [data]);
  const scopeMonthCases = deptStats[0]?.monthCases ?? 0;
  const peakAll = useMemo(() => {
    const peaks = deptStats.map((s) => s.peak).filter((v): v is number => v !== null);
    return peaks.length ? Math.max(...peaks) : null;
  }, [deptStats]);
  const threshold = data?.threshold ?? null;
  const peakOver = threshold !== null && peakAll !== null && peakAll > threshold;
  const zeroHeadcountDepts = data?.departments.filter((d) => d.activeHeadcount === 0) ?? [];

  const monthPicker = ym ? (
    <div className="flex items-center gap-2" data-testid="stage0-month-picker">
      <span className="text-xs text-gray-500 whitespace-nowrap">
        分派作業月份
      </span>
      <MonthPicker
        value={ym}
        currentYm={toHyphen(currentWorkYm) || ym}
        onChange={(next) => setTargetWorkYm(next.replace('-', ''))}
      />
    </div>
  ) : undefined;

  // ---- 試算計算中 → 載入提示（對齊 ready-summary；試算可能因去重/pool 查詢較久，避免使用者誤以為 0 資料）----
  if (loading) {
    return (
      <AppLayout title="Stage 0 試算" actions={monthPicker}>
        <main className="flex-1 p-6">
          <div
            data-testid="stage0-loading-card"
            className="bg-white rounded-xl border border-gray-200 p-10 flex flex-col items-center justify-center text-center min-h-[240px]"
          >
            <Loader2 className="w-8 h-8 text-blue-500 animate-spin mb-4" />
            <h3 className="text-base font-semibold text-gray-800 mb-1">
              試算計算中…
            </h3>
            <p className="text-sm text-gray-500 max-w-md">
              正在依工作日曆與部門比例計算每日分派工作量，資料量較大時可能需要數秒，請稍候。
            </p>
          </div>
        </main>
      </AppLayout>
    );
  }

  // ---- 處長 scope=null 友善降級 ----
  if (scopeUnresolved) {
    return (
      <AppLayout title="Stage 0 試算" actions={monthPicker}>
        <main className="flex-1 p-6">
          <div
            data-testid="scope-unresolved-card"
            className="bg-white rounded-xl border border-gray-200 p-10 flex flex-col items-center text-center"
          >
            <div className="w-14 h-14 rounded-full bg-amber-50 flex items-center justify-center mb-4">
              <UserX className="w-7 h-7 text-amber-500" />
            </div>
            <h3 className="text-base font-semibold text-gray-800 mb-1">
              無法識別您的轄區部門
            </h3>
            <p className="text-sm text-gray-500 max-w-md">
              系統找不到您對應的轄區部門資料，因此無法顯示估算結果。請聯繫系統管理員確認您的帳號設定。
            </p>
            <div className="mt-5 grid grid-cols-4 gap-3 w-full max-w-md opacity-60">
              {['可分派天數', '轄區件數', '尖峰人均', '在職人數'].map((lbl) => (
                <div
                  key={lbl}
                  className="bg-gray-50 rounded-lg border border-gray-200 p-3 text-center"
                >
                  <div className="text-xl font-bold text-gray-300">—</div>
                  <div className="text-[10px] text-gray-400 mt-1">{lbl}</div>
                </div>
              ))}
            </div>
          </div>
          {/* F120 §10.2：名單層總量本就不依轄區，轄區辨識失敗不影響其可算性——
              本區塊仍完整呈現（含 AC-LIST-11 之三個語意標示），不降級。 */}
          {listOverview && (
            <div className="mt-4">
              <ListEstimateOverviewSection data={listOverview} />
            </div>
          )}
        </main>
      </AppLayout>
    );
  }

  // ---- 處長 scope 命中但轄區整期 0 件 → 友善空狀態（AC-DEPT-2）----
  if (isSectionChief && data && data.departments.length === 0) {
    return (
      <AppLayout title="Stage 0 試算" actions={monthPicker}>
        <main className="flex-1 p-6">
          <div
            data-testid="scope-empty-card"
            className="bg-white rounded-xl border border-gray-200 p-10 flex flex-col items-center text-center"
          >
            <div className="w-14 h-14 rounded-full bg-gray-50 flex items-center justify-center mb-4">
              <Inbox className="w-7 h-7 text-gray-400" />
            </div>
            <h3 className="text-base font-semibold text-gray-800 mb-1">
              本月您的轄區尚無分派預估
            </h3>
            <p className="text-sm text-gray-500 max-w-md">
              目前沒有名單分派到您的轄區部門，因此沒有可顯示的每日工作量。待名單設定部門比例後即會顯示。
            </p>
          </div>
          {/* F120 §10.2 同上：本區塊為全公司名單層總量，與轄區有無分派無關 */}
          {listOverview && (
            <div className="mt-4">
              <ListEstimateOverviewSection data={listOverview} />
            </div>
          )}
        </main>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Stage 0 試算" actions={monthPicker}>
      <main className="flex-1 p-6 space-y-4">
        {/* 處長唯讀提示 banner */}
        {isSectionChief && (
          <div
            data-testid="section-chief-readonly-banner"
            className="rounded-lg p-3 bg-purple-50 border border-purple-200 flex items-start gap-2 text-sm"
          >
            <Eye className="w-4 h-4 text-purple-700 mt-0.5 shrink-0" />
            <div className="flex-1">
              {/* F049 v2.2 §24.2 #7a：限定語「部門相關區塊」為必要條件——F120 之
                  「名單基礎預估數量總覽」為全公司口徑，若此處仍寫「本頁僅顯示轄區」
                  會與該區塊正面矛盾（逐字以 prototype 30-stage0-estimate.html 為準）。 */}
              <p className="font-semibold text-purple-900">
                唯讀模式：部門相關區塊僅顯示您轄區部門
                {data?.departments[0] ? `（${data.departments[0].deptName}）` : ''}
                的預估資料
              </p>
              <p className="text-xs text-purple-700 mt-0.5">
                此頁僅供檢視，不提供任何修改設定的操作；上方部門區塊呈現的是您轄區部門的每日工作量與人均負荷。頁面最下方的「名單基礎預估數量總覽」則為全公司名單層總量，不受轄區限制。
              </p>
            </div>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0 bg-purple-100 text-purple-700">
              <ScanEye className="w-3 h-3" />
              轄區檢視
            </span>
          </div>
        )}

        {/* 頁面說明 + 顯示模式 chip */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">
              本月每日分派工作量試算
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">
              彙總本月所有啟用名單，預估各部門每天要分派幾件、平均每位電訪員一天要打幾通，協助判斷工作量是否合理。
            </p>
          </div>
          <span
            data-testid="mode-indicator"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-50 text-primary border border-blue-100"
          >
            {listFilter === 'ALL' ? (
              <>
                <Layers className="w-3.5 h-3.5" />
                顯示模式：所有啟用名單彙總
              </>
            ) : (
              <>
                <FileText className="w-3.5 h-3.5" />
                顯示模式：單一名單{' '}
                {lists.find((l) => l.listNo === listFilter)?.listNm ?? ''}（
                {listFilter}）
              </>
            )}
          </span>
        </div>

        {/* 控制列：名單篩選 + 派案日曆 */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 grid grid-cols-2 gap-5">
          <div>
            <label
              htmlFor="stage0-list-filter"
              className="block text-sm font-medium text-gray-700 mb-1.5"
            >
              名單篩選
            </label>
            <div className="relative">
              <select
                id="stage0-list-filter"
                data-testid="list-filter"
                value={listFilter}
                disabled={!hasActiveList}
                onChange={(e) => setListFilter(e.target.value)}
                className="w-full pl-3 pr-9 py-2 text-sm border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary appearance-none disabled:bg-gray-50 disabled:text-gray-400"
              >
                <option value="ALL">全部名單（彙總）</option>
                {lists.map((l) => (
                  <option key={l.listNo} value={l.listNo}>
                    {l.listNm}（{l.listNo}）
                  </option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-gray-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
            <p className="text-xs text-gray-400 mt-1">
              預設彙總本月所有啟用名單；可改為查看單一名單。
            </p>
          </div>
          <div>
            <label
              htmlFor="stage0-calendar"
              className="block text-sm font-medium text-gray-700 mb-1.5"
            >
              派案日曆
            </label>
            <div className="relative">
              <select
                id="stage0-calendar"
                data-testid="calendar-select"
                value={calendarSource}
                onChange={(e) =>
                  setCalendarSource(e.target.value as CalendarSource)
                }
                className="w-full pl-3 pr-9 py-2 text-sm border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary appearance-none"
              >
                {CALENDAR_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-gray-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
            <p className="text-xs text-gray-400 mt-1">{calHelp}</p>
          </div>
        </div>

        {error && (
          <div
            data-testid="stage0-error"
            className="rounded-lg p-3 bg-red-50 border border-red-200 flex items-start gap-2 text-sm"
          >
            <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
            <span className="text-red-800">{error}</span>
          </div>
        )}

        {/* F119 / AC-13：名單估算逾時 → 本頁合計不完整（置於警告堆疊最上方 —— 它影響本頁
            「所有」數字的可信度，其餘警告僅影響局部）。不阻擋其餘內容渲染（BR-13）。 */}
        {listPartialWarnings.length > 0 && (
          <div
            data-testid="stage0-list-partial-warning"
            data-warning-count={listPartialWarnings.length}
            className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-300 rounded-lg text-sm text-gray-700"
          >
            <Hourglass className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-amber-900">
                本頁合計未涵蓋 {listPartialWarnings.length} 張名單（估算逾時）
              </p>
              <ul className="mt-1.5 space-y-1">
                {listPartialWarnings.map((w, idx) => {
                  const listNm = lists.find((l) => l.listNo === w.listNo)?.listNm;
                  return (
                    <li
                      key={`${w.listNo ?? 'unknown'}-${idx}`}
                      data-testid="stage0-partial-item"
                      data-warning-code={w.code}
                      data-list-no={w.listNo}
                      className="flex items-start gap-1.5 flex-wrap"
                    >
                      <code className="font-mono text-[11px] text-amber-900 bg-amber-100 border border-amber-300 px-1 py-0.5 rounded shrink-0">
                        {w.listNo}
                      </code>
                      <span className="text-xs text-amber-900" data-warning-message>
                        {w.message}
                      </span>
                      {listNm && (
                        <span className="text-[11px] text-amber-700">（{listNm}）</span>
                      )}
                    </li>
                  );
                })}
              </ul>
              <p className="text-xs text-amber-800 mt-2">
                下方件數、人均與每日明細皆<strong>不含</strong>
                上列名單，請勿據以判定整體工作量。可改以「名單篩選」單獨試算該名單，或聯繫 IT
                檢查索引後重新整理。
              </p>
            </div>
          </div>
        )}

        {/* 工作日曆無資料 → 無法計算（明確提示，取代靜默顯示 0） */}
        {data?.warnings.some((w) => w.code === 'CALENDAR_EMPTY') && (
          <div
            data-testid="calendar-empty-warning"
            className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-gray-700"
          >
            <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-red-700">
                工作日曆無資料，無法計算每日分派量
              </p>
              <p className="text-xs text-gray-600 mt-0.5">
                {data.warnings.find((w) => w.code === 'CALENDAR_EMPTY')
                  ?.message ??
                  '本月工作日曆（ob_calendar）無資料，請先執行「行事曆 ETL」載入後再試算。'}
              </p>
            </div>
          </div>
        )}

        {/* 系統資料池偏低警示（業務語言） */}
        {data?.poolWarning === 'POOL_COUNT_LOW' && (
          <div
            data-testid="pool-low-warning"
            className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-gray-700"
          >
            <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-amber-700">
                系統資料池筆數偏低（目前 {data.poolCount.toLocaleString()} 筆）
              </p>
              <p className="text-xs text-gray-600 mt-0.5">
                可能影響估算準確度，請聯繫 IT 確認本月資料是否已完成更新。
              </p>
            </div>
          </div>
        )}

        {/* 缺口提示 banner（部長 / Admin；gap>0 才渲染） */}
        {!isSectionChief && gapMonth > 0 && (
          <div
            data-testid="gap-row"
            className="flex items-start gap-2 p-3 bg-orange-50 border border-orange-200 rounded-lg text-sm text-gray-700"
          >
            <GitPullRequestDraft className="w-4 h-4 text-orange-500 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-orange-700">
                本月尚有 {gapMonth.toLocaleString()} 件未分派到任何部門
              </p>
              <p className="text-xs text-gray-600 mt-0.5">
                部分名單的部門比例未設定或未達 100%。系統不會自動補差；如需分派，請至各名單的部門比例設定補齊。
              </p>
            </div>
          </div>
        )}

        {/* 人員資料警示（在職人數為 0） */}
        {zeroHeadcountDepts.length > 0 && (
          <div
            data-testid="headcount-zero-warning"
            className="flex items-start gap-2 p-3 bg-orange-50 border border-orange-200 rounded-lg text-sm text-gray-700"
          >
            <UserX className="w-4 h-4 text-orange-500 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-orange-700">
                部分部門在職人數為 0，無法計算人均
              </p>
              <p className="text-xs text-gray-600 mt-0.5">
                {zeroHeadcountDepts
                  .map((d) => `${d.deptName}（${d.deptCode}）`)
                  .join('、')}{' '}
                在職人數為 0，請確認人員資料是否已同步；該部門暫不顯示人均。
              </p>
            </div>
          </div>
        )}

        {/* KPI 卡片 */}
        <div className="grid grid-cols-4 gap-3" data-testid="kpi-grid">
          <KpiCard
            testId="kpi-working-days"
            label="本月可分派天數"
            value={hasActiveList ? String(workingDays) : '—'}
            sub={`依「${calLabel}」計算`}
            icon={<CalendarCheck className="w-4 h-4 text-blue-500" />}
          />
          {isSectionChief ? (
            <KpiCard
              testId="kpi-scope-cases"
              label="轄區本月件數"
              value={hasActiveList ? scopeMonthCases.toLocaleString() : '—'}
              sub="您轄區部門本月分派合計"
              icon={<Inbox className="w-4 h-4 text-emerald-500" />}
              incompleteTitle={partialBadgeTitle}
            />
          ) : (
            <KpiCard
              testId="kpi-total-cases"
              label="本月全名單總量"
              value={hasActiveList ? orgMonthTotal.toLocaleString() : '—'}
              sub={
                listFilter === 'ALL'
                  ? '本月所有啟用名單合計'
                  : '本名單預估件數'
              }
              icon={<Inbox className="w-4 h-4 text-emerald-500" />}
              incompleteTitle={partialBadgeTitle}
            />
          )}
          <KpiCard
            testId="kpi-peak-per-person"
            label="尖峰人均／日"
            value={!hasActiveList || peakAll === null ? '—' : String(peakAll)}
            sub={
              threshold !== null
                ? `每人每日上限 ${threshold} 件`
                : '尚未設定上限'
            }
            icon={
              <Gauge
                className={`w-4 h-4 ${peakOver ? 'text-red-500' : 'text-emerald-500'}`}
              />
            }
            danger={peakOver}
          />
          {isSectionChief ? (
            <KpiCard
              testId="kpi-headcount"
              label="轄區在職人數"
              value={
                hasActiveList
                  ? String(data?.departments[0]?.activeHeadcount ?? 0)
                  : '—'
              }
              sub="在職電訪人員"
              icon={<Users className="w-4 h-4 text-purple-500" />}
            />
          ) : (
            <KpiCard
              testId="kpi-unassigned"
              label="尚未分派件數"
              value={hasActiveList ? gapMonth.toLocaleString() : '—'}
              sub={
                gapMonth > 0
                  ? '部分名單比例未設定或未達 100%'
                  : '所有件數已分派至部門'
              }
              icon={
                <GitPullRequestDraft
                  className={`w-4 h-4 ${gapMonth > 0 ? 'text-orange-500' : 'text-emerald-500'}`}
                />
              }
              warn={gapMonth > 0}
            />
          )}
        </div>

        {/* 空狀態：本月無啟用名單 */}
        {!hasActiveList && !loading && (
          <div
            data-testid="empty-state"
            className="bg-white rounded-xl border border-gray-200 p-10 text-center"
          >
            <p className="text-sm text-gray-500">
              本月尚無啟用名單，請先於名單定義頁建立並啟用名單。
            </p>
          </div>
        )}

        {/* 部門負載總覽 */}
        {hasActiveList && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-200 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-semibold text-gray-800">
                部門負載總覽
              </h3>
              <span className="text-xs text-gray-400">
                {isSectionChief
                  ? '您的轄區部門負載概況'
                  : '點部門列可在下方月曆查看該課每日明細'}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table
                className="w-full text-sm"
                data-testid="dept-summary-table"
              >
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50/40 text-xs text-gray-500 uppercase tracking-wider">
                    <th className="text-left px-5 py-2.5 font-medium">部門</th>
                    <th className="text-right px-5 py-2.5 font-medium">
                      在職人數
                    </th>
                    <th className="text-right px-5 py-2.5 font-medium">
                      本月件數
                    </th>
                    <th className="text-right px-5 py-2.5 font-medium">
                      平均人均·日
                    </th>
                    <th className="text-right px-5 py-2.5 font-medium">
                      尖峰人均·日
                    </th>
                    <th className="text-center px-5 py-2.5 font-medium">
                      負載狀態
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {deptStats.map((s) => {
                    const over =
                      threshold !== null && s.peak !== null && s.peak > threshold;
                    const badge = loadBadge(s.peak, threshold);
                    const clickable = !isSectionChief;
                    return (
                      <tr
                        key={s.deptCode}
                        data-testid={`dept-row-${s.deptCode}`}
                        onClick={
                          clickable
                            ? () => setSelectedDept(s.deptCode)
                            : undefined
                        }
                        className={`${clickable ? 'cursor-pointer' : ''} hover:bg-blue-50/30`}
                      >
                        <td className="px-5 py-3">
                          <div className="text-sm font-medium text-gray-800">
                            {s.deptName}
                            {clickable && selectedDept === s.deptCode && (
                              <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium bg-blue-100 text-primary">
                                月曆檢視中
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-gray-400 font-mono">
                            {s.deptCode}
                          </div>
                        </td>
                        <td
                          className={`px-5 py-3 text-right tabular-nums ${s.headcount === 0 ? 'text-orange-600 font-semibold' : 'text-gray-700'}`}
                        >
                          {s.headcount === 0 ? '0（待同步）' : s.headcount}
                        </td>
                        <td
                          data-testid={`cases-${s.deptCode}`}
                          className="px-5 py-3 text-right tabular-nums text-gray-700"
                        >
                          {s.monthCases.toLocaleString()}
                        </td>
                        <td className="px-5 py-3 text-right tabular-nums text-gray-600">
                          {s.avg === null ? '—' : s.avg}
                        </td>
                        <td
                          data-testid={`per-person-${s.deptCode}`}
                          title={
                            over
                              ? `超過每人每日上限 ${threshold} 件`
                              : undefined
                          }
                          className={`px-5 py-3 text-right tabular-nums ${over ? 'text-red-600 font-semibold' : 'text-gray-700'}`}
                        >
                          {s.peak === null ? '—' : s.peak}
                        </td>
                        <td className="px-5 py-3 text-center">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${badge.cls}`}
                          >
                            {badge.txt}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  {deptStats.length === 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-5 py-6 text-center text-sm text-gray-400"
                      >
                        本月名單尚未設定任何部門比例，所有件數歸入未分派缺口。
                      </td>
                    </tr>
                  )}
                </tbody>
                {/* 全名單總量合計列（處長不顯示，BR-13） */}
                {!isSectionChief && (
                  <tfoot>
                    <tr
                      data-testid="org-total-row"
                      className="border-t-2 border-gray-200 bg-gray-50/70 text-sm font-bold"
                    >
                      <td className="px-5 py-2.5 text-gray-700">全名單總量</td>
                      <td></td>
                      <td className="px-5 py-2.5 text-right tabular-nums text-gray-900">
                        {orgMonthTotal.toLocaleString()}
                      </td>
                      <td></td>
                      <td></td>
                      <td className="px-5 py-2.5 text-center text-xs text-gray-500">
                        {gapMonth > 0 ? `缺口 ${gapMonth.toLocaleString()}` : '—'}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        )}

        {/* 部門每日分派明細（月曆 + 部門切換） */}
        {hasActiveList && data && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-200 flex items-center gap-3 flex-wrap">
              <CalendarDays className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-semibold text-gray-800">
                部門每日分派明細
              </h3>
            </div>
            <div className="p-5 space-y-4">
              {/* 部門切換器 */}
              <div
                className="flex items-center gap-2 flex-wrap"
                data-testid="dept-switcher"
              >
                <span className="text-xs text-gray-500 mr-1">檢視部門</span>
                {isSectionChief ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-cyan-200 bg-cyan-50 text-cyan-700">
                    <Lock className="w-3.5 h-3.5" />
                    {data.departments[0]?.deptName ?? '—'}（轄區）
                  </span>
                ) : (
                  [{ deptCode: 'ALL', deptName: '全部門合計' }, ...data.departments].map(
                    (p) => {
                      const active = selectedDept === p.deptCode;
                      return (
                        <button
                          key={p.deptCode}
                          data-testid={`dept-pill-${p.deptCode}`}
                          onClick={() => setSelectedDept(p.deptCode)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition ${
                            active
                              ? 'border-primary bg-blue-50 text-primary'
                              : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          {p.deptCode === 'ALL' && (
                            <Layers className="w-3.5 h-3.5" />
                          )}
                          {p.deptName}
                        </button>
                      );
                    },
                  )
                )}
              </div>

              {/* 月曆 */}
              <CalendarGrid
                ym={ym}
                days={data.days}
                selectedDept={isSectionChief ? data.departments[0]?.deptCode ?? '' : selectedDept}
                deptName={
                  isSectionChief
                    ? data.departments[0]?.deptName
                    : data.departments.find((d) => d.deptCode === selectedDept)
                        ?.deptName
                }
                isAll={!isSectionChief && selectedDept === 'ALL'}
                threshold={threshold}
              />

              {/* 輔助每日明細表 */}
              <details className="border border-gray-200 rounded-lg">
                <summary className="cursor-pointer select-none px-4 py-2.5 text-xs font-medium text-gray-600 flex items-center gap-1.5 hover:bg-gray-50">
                  <Table className="w-3.5 h-3.5" />
                  每日明細表（點擊展開）
                </summary>
                <AuxDailyTable
                  days={data.days}
                  selectedDept={
                    isSectionChief
                      ? data.departments[0]?.deptCode ?? ''
                      : selectedDept
                  }
                  isAll={!isSectionChief && selectedDept === 'ALL'}
                  threshold={threshold}
                />
              </details>
            </div>
          </div>
        )}

        {/* F120 / AC-LIST-01：名單基礎預估數量總覽（第三區塊，位於既有兩區塊之後、頁尾提示之前） */}
        {listOverview && <ListEstimateOverviewSection data={listOverview} />}

        {/* footer note（業務語言） */}
        <div className="flex items-start gap-2 p-3 bg-blue-50/50 border border-blue-100 rounded-lg text-xs text-gray-600">
          <Info className="w-4 h-4 text-primary mt-0.5 shrink-0" />
          <p>
            此試算不觸發正式分派，僅供工作量評估參考；實際分派件數以月名單分派執行結果為準。
          </p>
        </div>
      </main>
    </AppLayout>
  );
}

// ---------------------------------------------------------------------------
// 子元件
// ---------------------------------------------------------------------------

interface KpiCardProps {
  testId: string;
  label: string;
  value: string;
  sub: string;
  icon: React.ReactNode;
  danger?: boolean;
  warn?: boolean;
  /**
   * F119 / AC-13：合計數字本身標示「不完整」，避免只掃 KPI 的使用者錯過上方警告
   * （附錄 C C-18 之第二觸點）。undefined = 不渲染徽章。
   */
  incompleteTitle?: string;
}
function KpiCard({
  testId,
  label,
  value,
  sub,
  icon,
  danger,
  warn,
  incompleteTitle,
}: KpiCardProps) {
  const valClass = danger
    ? 'text-red-600'
    : warn
      ? 'text-orange-600'
      : 'text-gray-900';
  return (
    <div
      data-testid={testId}
      className="bg-white rounded-xl border border-gray-200 shadow-sm p-4"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-gray-500">{label}</span>
        {icon}
      </div>
      <div className={`text-2xl font-bold tabular-nums ${valClass}`}>
        {value}
        {incompleteTitle && (
          <span
            data-testid="kpi-incomplete-badge"
            title={incompleteTitle}
            className="ml-2 align-middle inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-300"
          >
            <Hourglass className="w-2.5 h-2.5" />
            不完整
          </span>
        )}
      </div>
      <p className="text-xs text-gray-400 mt-1">{sub}</p>
    </div>
  );
}

function loadBadge(
  peak: number | null,
  threshold: number | null,
): { txt: string; cls: string } {
  if (peak === null) return { txt: '待補人力', cls: 'bg-orange-100 text-orange-700' };
  if (threshold !== null && peak > threshold)
    return { txt: '偏高', cls: 'bg-red-100 text-red-700' };
  if (threshold !== null && peak > threshold * 0.8)
    return { txt: '適中', cls: 'bg-amber-100 text-amber-700' };
  return { txt: '正常', cls: 'bg-emerald-100 text-emerald-700' };
}

interface CalendarGridProps {
  ym: string; // YYYY-MM
  days: DeptEstimateDay[];
  selectedDept: string;
  isAll: boolean;
  threshold: number | null;
  /** 已解析的部門名稱（顯示用；selectedDept 為代號，由父層以 departments 對照） */
  deptName?: string;
}
function CalendarGrid({ ym, days, selectedDept, isAll, threshold, deptName }: CalendarGridProps) {
  const map = new Map<string, DeptEstimateDay>();
  for (const d of days) map.set(d.date, d);
  const [y, m] = ym.split('-').map(Number);
  const firstDow = new Date(y, m - 1, 1).getDay();
  const dim = new Date(y, m, 0).getDate();
  const depName = isAll
    ? '全部門合計（全名單總量）'
    : deptName || selectedDept || '—';

  const cells: React.ReactNode[] = [];
  for (let i = 0; i < firstDow; i++)
    cells.push(<div key={`blank-${i}`} className="min-h-[80px]" />);
  for (let dn = 1; dn <= dim; dn++) {
    const ymd = `${ym}-${String(dn).padStart(2, '0')}`;
    const d = map.get(ymd);
    if (!d || !d.isWorkday) {
      cells.push(
        <div
          key={ymd}
          className="min-h-[80px] border border-gray-200 rounded-lg p-1.5 bg-gray-50 flex flex-col"
        >
          <span className="text-[11px] font-semibold text-gray-400">{dn}</span>
          <div className="flex-1 flex items-center justify-center text-[11px] text-gray-400 text-center leading-tight">
            休息日
            <br />
            （不派案）
          </div>
        </div>,
      );
      continue;
    }
    if (isAll) {
      cells.push(
        <div
          key={ymd}
          className="min-h-[80px] border border-gray-200 rounded-lg p-1.5 flex flex-col"
        >
          <span className="text-[11px] font-semibold text-gray-500">{dn}</span>
          <div className="flex-1 flex flex-col items-center justify-center">
            <div className="text-base font-bold text-gray-900 tabular-nums">
              {(d.orgTotal ?? 0).toLocaleString()}
            </div>
            {(d.gap ?? 0) > 0 && (
              <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-100 text-orange-600 mt-1">
                缺口 {(d.gap ?? 0).toLocaleString()}
              </span>
            )}
          </div>
        </div>,
      );
    } else {
      const cell = d.deptCells.find((c) => c.deptCode === selectedDept);
      const cases = cell?.cases ?? 0;
      const pp = cell?.perPerson ?? null;
      const over = pp !== null && threshold !== null && pp > threshold;
      cells.push(
        <div
          key={ymd}
          className={`min-h-[80px] border rounded-lg p-1.5 flex flex-col ${over ? 'bg-red-50 border-red-200' : 'border-gray-200'}`}
        >
          <span className="text-[11px] font-semibold text-gray-500">{dn}</span>
          <div className="flex-1 flex flex-col items-center justify-center gap-1">
            <div
              className={`text-base font-bold tabular-nums ${over ? 'text-red-700' : 'text-gray-900'}`}
            >
              {cases.toLocaleString()}
            </div>
            <span
              className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${
                pp === null
                  ? 'bg-orange-100 text-orange-600'
                  : over
                    ? 'bg-red-100 text-red-700'
                    : 'bg-gray-100 text-gray-500'
              }`}
            >
              人均 {pp === null ? '—' : pp}
            </span>
          </div>
        </div>,
      );
    }
  }

  return (
    <div data-testid="calendar-grid">
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <Calendar className="w-3.5 h-3.5" />
          {ym} 月曆 · 目前檢視：
          <span className="font-semibold text-gray-700">{depName}</span>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-gray-500 flex-wrap">
          <span className="inline-flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-white border border-gray-300" />
            工作日
          </span>
          {isAll ? (
            <span className="inline-flex items-center gap-1">
              <span className="inline-flex px-1 rounded bg-orange-100 text-orange-600 text-[10px] font-medium">
                缺口
              </span>
              未分派到部門
            </span>
          ) : (
            <span className="inline-flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-red-100 border border-red-200" />
              人均超過每日上限
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-gray-200" />
            休息日（不派案）
          </span>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1.5 mb-1.5">
        {WEEKDAYS.map((w, i) => (
          <div
            key={w}
            className={`text-center text-[11px] font-semibold py-0.5 ${i === 0 ? 'text-rose-500' : i === 6 ? 'text-blue-500' : 'text-gray-400'}`}
          >
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5">{cells}</div>
    </div>
  );
}

interface AuxDailyTableProps {
  days: DeptEstimateDay[];
  selectedDept: string;
  isAll: boolean;
  threshold: number | null;
}
function AuxDailyTable({ days, selectedDept, isAll, threshold }: AuxDailyTableProps) {
  let cum = 0;
  return (
    <div className="overflow-x-auto border-t border-gray-200">
      <table className="w-full text-sm" data-testid="aux-daily-table">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50/40 text-xs text-gray-500">
            <th className="text-left px-4 py-2 font-medium">日期</th>
            <th className="text-center px-3 py-2 font-medium">星期</th>
            <th className="text-right px-3 py-2 font-medium">
              {isAll ? '全名單總量' : '預估件數'}
            </th>
            <th className="text-right px-3 py-2 font-medium">
              {isAll ? '缺口' : '人均·日'}
            </th>
            <th className="text-right px-3 py-2 font-medium">累積</th>
          </tr>
        </thead>
        <tbody>
          {days.map((d) => {
            if (!d.isWorkday) {
              return (
                <tr
                  key={d.date}
                  className="border-b border-gray-200 bg-gray-50/50"
                >
                  <td className="px-4 py-1.5 font-mono text-xs text-gray-400">
                    {d.date.slice(5)}
                  </td>
                  <td className="px-3 py-1.5 text-center text-xs text-gray-500">
                    {d.weekday}
                  </td>
                  <td
                    colSpan={3}
                    className="px-3 py-1.5 text-center text-xs text-gray-400"
                  >
                    休息日（不派案）
                  </td>
                </tr>
              );
            }
            if (isAll) {
              cum += d.orgTotal ?? 0;
              return (
                <tr key={d.date} className="border-b border-gray-200">
                  <td className="px-4 py-1.5 font-mono text-xs text-gray-700">
                    {d.date.slice(5)}
                  </td>
                  <td className="px-3 py-1.5 text-center text-xs text-gray-600">
                    {d.weekday}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-gray-800 font-medium">
                    {(d.orgTotal ?? 0).toLocaleString()}
                  </td>
                  <td
                    className={`px-3 py-1.5 text-right tabular-nums ${(d.gap ?? 0) > 0 ? 'text-orange-600' : 'text-gray-300'}`}
                  >
                    {(d.gap ?? 0) > 0 ? (d.gap ?? 0).toLocaleString() : '—'}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-xs text-gray-400">
                    {cum.toLocaleString()}
                  </td>
                </tr>
              );
            }
            const cell = d.deptCells.find((c) => c.deptCode === selectedDept);
            const cases = cell?.cases ?? 0;
            const pp = cell?.perPerson ?? null;
            const over = pp !== null && threshold !== null && pp > threshold;
            cum += cases;
            return (
              <tr key={d.date} className="border-b border-gray-200">
                <td className="px-4 py-1.5 font-mono text-xs text-gray-700">
                  {d.date.slice(5)}
                </td>
                <td className="px-3 py-1.5 text-center text-xs text-gray-600">
                  {d.weekday}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums text-gray-800 font-medium">
                  {cases.toLocaleString()}
                </td>
                <td
                  className={`px-3 py-1.5 text-right tabular-nums ${pp === null ? 'text-orange-600' : over ? 'text-red-600 font-semibold' : 'text-gray-600'}`}
                >
                  {pp === null ? '—' : pp}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums text-xs text-gray-400">
                  {cum.toLocaleString()}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
