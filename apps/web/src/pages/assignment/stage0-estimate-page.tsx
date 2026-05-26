import { useEffect, useMemo, useState } from 'react';
import {
  Calculator,
  AlertTriangle,
  CalendarCheck,
  Users,
  Divide,
  PlusCircle,
  Table,
  Eye,
  Check,
  X,
  Plus,
} from 'lucide-react';
import { AppLayout } from '@/components/layout/app-layout';
import { MonthPicker } from '@/components/e07/MonthPicker';
import {
  getDailyEstimate,
  getListEstimate,
  type DailyEstimateResponse,
} from '@/api/assignment-run';
import { listLists } from '@/api/assignment-list';
import {
  Stage0InputPanel,
  type Stage0Input,
} from './_components/stage0-input-panel';
import {
  Stage0BarChart,
  computeAdE07Distribution,
  type Stage0Row,
} from './_components/stage0-bar-chart';
import { getBusinessRole } from '@/stores/auth-store';

/**
 * F049 Stage 0 試算頁（Phase 2 全面改造）
 *
 * 對應 prototype 30-stage0-estimate.html
 *
 * 區塊：
 *   - 處長唯讀提示 banner（businessRole='section_chief'）
 *   - 試算說明 banner
 *   - 左 4 欄：Stage0InputPanel（LIST_NO/總筆數/起訖日/工作日來源）
 *   - 右 8 欄：4 KPI + Pool 警示 + bar chart + 明細表（calendar_date/星期/工作日/預估件數/累積/餘數補）
 */

function toYYYYMMRaw(yyyyMm: string): string {
  return yyyyMm.replace('-', '');
}
function currentYmDisplay(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function Stage0EstimatePage() {
  const businessRole = getBusinessRole();
  const isSectionChief = businessRole === 'section_chief';

  const [ym, setYm] = useState(currentYmDisplay());
  const [dailyData, setDailyData] = useState<DailyEstimateResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lists, setLists] = useState<Array<{ listNo: string; listNm: string }>>(
    [],
  );
  const hasActiveList = lists.length > 0;

  const [input, setInput] = useState<Stage0Input>({
    listNo: '',
    totalCount: 0, // F049 v1.3：移除寫死 9500；total 一律來自選取名單 per-list COUNT
    startDate: '',
    endDate: '',
    calendarSource: 'weekday',
  });
  const [listEstimating, setListEstimating] = useState(false);

  // 載入 lists（依 ym）→ 自動選第一筆 active 名單（AC-4-Default）
  useEffect(() => {
    let aborted = false;
    void (async () => {
      try {
        const data = await listLists({ ym: toYYYYMMRaw(ym) });
        if (aborted) return;
        const active = (data.lists ?? [])
          .filter((l) => l.status === 'active')
          .map((l) => ({ listNo: l.listNo, listNm: l.listNm }));
        setLists(active);
        // 自動選第一筆 active 名單（input.listNo 未設或不在清單中時）
        setInput((prev) => {
          const stillValid = active.some((l) => l.listNo === prev.listNo);
          if (stillValid) return prev;
          return {
            ...prev,
            listNo: active[0]?.listNo ?? '',
            totalCount: active.length === 0 ? 0 : prev.totalCount,
          };
        });
      } catch {
        if (!aborted) setLists([]);
      }
    })();
    return () => {
      aborted = true;
    };
  }, [ym]);

  // 載入 daily-estimate（calendarSource / startDate / endDate 納入依賴 → 切換即重抓重算）
  useEffect(() => {
    let aborted = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await getDailyEstimate(toYYYYMMRaw(ym), {
          calendarSource: input.calendarSource,
          startDate: input.startDate || undefined,
          endDate: input.endDate || undefined,
        });
        if (!aborted) {
          setDailyData(result);
          // 起訖日未設時，以後端回顯之整月範圍回填（供 input 顯示，不再觸發重抓）
          setInput((prev) => ({
            ...prev,
            startDate: prev.startDate || result.startDate,
            endDate: prev.endDate || result.endDate,
          }));
        }
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
  }, [ym, input.calendarSource, input.startDate, input.endDate]);

  // input.listNo 變化 → 呼叫 list-estimate 取得該 LIST_NO COUNT，套用到 totalCount
  useEffect(() => {
    if (!input.listNo) {
      setInput((prev) => (prev.totalCount === 0 ? prev : { ...prev, totalCount: 0 }));
      return;
    }
    let aborted = false;
    setListEstimating(true);
    void (async () => {
      try {
        const r = await getListEstimate(input.listNo);
        if (!aborted) {
          const count = r.count ?? r.estimatedCount ?? 0;
          setInput((prev) => ({ ...prev, totalCount: count }));
        }
      } catch {
        // 忽略；保留既有 totalCount
      } finally {
        if (!aborted) setListEstimating(false);
      }
    })();
    return () => {
      aborted = true;
    };
  }, [input.listNo]);

  // 每日件數 = round(ratioPerMille/1000 × total)（前端消費後端 ratioPerMille）
  const distribution = useMemo<Stage0Row[]>(() => {
    if (!dailyData?.dailyEstimates) return [];
    return computeAdE07Distribution(input.totalCount, dailyData.dailyEstimates);
  }, [dailyData, input.totalCount]);

  const workingDays = dailyData?.workingDays ?? 0;
  // KPI base / remainder 直接採後端千分位值（AD-E07-8）
  const base = dailyData?.baseRatio ?? 0;
  const remainder = dailyData?.remainder ?? 0;
  // 空狀態：無 active 名單 → KPI total 顯示「—」
  const totalDisplay = hasActiveList ? input.totalCount.toLocaleString() : '—';

  return (
    <AppLayout
      title="Stage 0 試算"
      actions={<MonthPicker value={ym} onChange={setYm} />}
    >
      <main className="flex-1 p-6 space-y-4">
        {isSectionChief && (
          <div
            data-testid="director-readonly-banner"
            className="rounded-lg p-3 bg-purple-50 border border-purple-200 flex items-start gap-2 text-sm"
          >
            <Eye className="w-4 h-4 text-purple-700 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="font-semibold text-purple-900">
                處長角色為唯讀檢視（Stage 0 為部長 / Admin 月跑前置試算）
              </p>
              <p className="text-xs text-purple-800 mt-0.5">
                您可查看試算結果，但部長 / Admin 才能依此調整月跑參數。
              </p>
            </div>
          </div>
        )}

        <div className="flex items-start gap-2 p-3 bg-blue-50/50 border border-blue-100 rounded-lg text-sm text-gray-700">
          <Calculator className="w-4 h-4 text-primary mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold text-primary">
              Daily estimate 不寫入 ob_assign_set
            </p>
            <p className="text-xs text-gray-600 mt-0.5">
              本頁為 F049 試算預覽，演算法 = FLOOR(1000/工作日) + 餘數補最近日期（AD-E07-8）。
              實際寫入由月跑 Stage 0 正式執行（F061）。
            </p>
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

        <div className="grid grid-cols-12 gap-5">
          {/* 左：輸入面板 */}
          <div className="col-span-4">
            <Stage0InputPanel
              lists={lists}
              value={input}
              onChange={setInput}
              disabled={!hasActiveList}
            />
          </div>

          {/* 右：KPI + Pool warn + bar chart + table */}
          <div className="col-span-8 space-y-4">
            {/* Pool 偏低警示 */}
            {dailyData?.warning === 'POOL_COUNT_LOW' && (
              <div
                data-testid="pool-low-warning"
                className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-gray-700"
              >
                <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold text-amber-800">
                    Pool 資料筆數偏低（現有 {dailyData.poolCount} 筆）
                  </p>
                  <p className="text-xs text-gray-600 mt-0.5">
                    低於閾值 STAGE0_POOL_WARN_THRESHOLD = 1000，
                    請確認資料擷取任務（OBPOOLDATA）已正常執行。
                  </p>
                </div>
              </div>
            )}

            {/* 4 KPI 卡 */}
            <div className="grid grid-cols-4 gap-3">
              <div
                data-testid="kpi-working-days"
                className="bg-white rounded-lg border border-gray-200 shadow-sm p-4"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-500">working_days 工作日</span>
                  <CalendarCheck className="w-4 h-4 text-blue-500" />
                </div>
                <div className="text-2xl font-bold text-gray-900 tabular-nums">
                  {workingDays}
                </div>
                <p className="text-xs text-gray-400 mt-1">本月可分派天數</p>
              </div>
              <div
                data-testid="kpi-total-estimate"
                className="bg-white rounded-lg border border-gray-200 shadow-sm p-4"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-500">total 總筆數</span>
                  <Users className="w-4 h-4 text-emerald-500" />
                </div>
                <div className="text-2xl font-bold text-gray-900 tabular-nums">
                  {totalDisplay}
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  {!hasActiveList
                    ? '無 active 名單'
                    : listEstimating
                      ? '即時試算中...'
                      : '符合 LIST_NO 篩選條件'}
                </p>
              </div>
              <div
                data-testid="kpi-base"
                className="bg-white rounded-lg border border-gray-200 shadow-sm p-4"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-500">base ratio</span>
                  <Divide className="w-4 h-4 text-purple-500" />
                </div>
                <div className="text-2xl font-bold text-gray-900 tabular-nums">
                  {hasActiveList ? base : '—'}
                </div>
                <p className="text-xs text-gray-400 mt-1">FLOOR(1000/工作日) ‰</p>
              </div>
              <div
                data-testid="kpi-remainder"
                className="bg-white rounded-lg border border-gray-200 shadow-sm p-4"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-500">remainder 餘數</span>
                  <PlusCircle className="w-4 h-4 text-amber-500" />
                </div>
                <div className="text-2xl font-bold text-gray-900 tabular-nums">
                  {hasActiveList ? remainder : '—'}
                </div>
                <p className="text-xs text-gray-400 mt-1">補至最近 N 個工作日</p>
              </div>
            </div>

            {/* Bar chart */}
            <Stage0BarChart rows={distribution} />

            {/* Daily detail table */}
            <div
              data-testid="stage0-daily-table"
              className="bg-white rounded-lg border border-gray-200 shadow-sm"
            >
              <div className="px-5 py-3 border-b border-gray-200 flex items-center gap-2">
                <Table className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-semibold text-gray-800">
                  每日試算明細
                </h3>
                <span className="text-xs text-gray-400 ml-2">
                  GET /api/v1/assignment/stage0/daily-estimate?ym=
                  {toYYYYMMRaw(ym)}
                </span>
              </div>
              <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-50/95 backdrop-blur z-10">
                    <tr className="border-b border-gray-200">
                      <th className="text-left px-5 py-2 font-semibold text-gray-600">
                        calendar_date
                      </th>
                      <th className="text-left px-5 py-2 font-semibold text-gray-600">
                        星期
                      </th>
                      <th className="text-left px-5 py-2 font-semibold text-gray-600">
                        工作日
                      </th>
                      <th className="text-right px-5 py-2 font-semibold text-gray-600">
                        預估件數
                      </th>
                      <th className="text-right px-5 py-2 font-semibold text-gray-600">
                        累積
                      </th>
                      <th className="text-left px-5 py-2 font-semibold text-gray-600">
                        餘數補
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {loading && (
                      <tr>
                        <td colSpan={6} className="px-5 py-6 text-center text-gray-400">
                          試算中...
                        </td>
                      </tr>
                    )}
                    {!loading && distribution.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-5 py-6 text-center text-gray-400">
                          無試算資料
                        </td>
                      </tr>
                    )}
                    {distribution.map((r) => (
                      <tr
                        key={r.date}
                        className={r.isWorkday ? '' : 'bg-gray-50/50'}
                      >
                        <td
                          className={`px-5 py-2 font-mono text-xs ${
                            r.isWorkday ? 'text-gray-700' : 'text-gray-400'
                          }`}
                        >
                          {r.date}
                        </td>
                        <td className="px-5 py-2 text-xs text-gray-600">
                          {r.weekday}
                        </td>
                        <td className="px-5 py-2 text-xs">
                          {r.isWorkday ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-100 text-emerald-700">
                              <Check className="w-3 h-3" />Y (rest_flg=0)
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-500">
                              <X className="w-3 h-3" />N ({r.skipReason})
                            </span>
                          )}
                        </td>
                        <td
                          className={`px-5 py-2 text-right font-mono ${
                            r.isWorkday
                              ? 'text-gray-900 font-semibold'
                              : 'text-gray-300'
                          }`}
                        >
                          {r.isWorkday ? r.estimate : '—'}
                        </td>
                        <td
                          className={`px-5 py-2 text-right font-mono ${
                            r.isWorkday ? 'text-gray-600' : 'text-gray-300'
                          }`}
                        >
                          {r.isWorkday ? r.cumulative.toLocaleString() : '—'}
                        </td>
                        <td className="px-5 py-2 text-xs">
                          {r.isBonus ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-medium">
                              <Plus className="w-3 h-3" />
                              base+1（餘數補）
                            </span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </main>
    </AppLayout>
  );
}
