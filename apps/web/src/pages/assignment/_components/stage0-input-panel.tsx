import { Settings2, ChevronDown, FunctionSquare } from 'lucide-react';

/**
 * F049 Stage 0 試算輸入面板（左側 sticky col）
 *
 * 對應 prototype 30-stage0-estimate.html L174-253
 *
 * 控制項：
 *   - LIST_NO select（active lists）
 *   - 預估總筆數 input
 *   - 起始日 / 結束日 date inputs
 *   - 工作日來源 select（weekday / weekday-only / all）
 *
 * 設計：受控元件，state 由父層管理；onChange 帶出完整 Stage0Input 物件。
 */

export type CalendarSource = 'weekday' | 'weekday-only' | 'all';

export interface Stage0Input {
  listNo: string;
  totalCount: number;
  startDate: string;
  endDate: string;
  calendarSource: CalendarSource;
}

export interface Stage0ListOption {
  listNo: string;
  listNm: string;
}

export interface Stage0InputPanelProps {
  lists: Stage0ListOption[];
  value: Stage0Input;
  onChange: (next: Stage0Input) => void;
  /** F049 v1.3 空狀態：無 active 名單時 selector disabled、KPI/total 顯示「—」 */
  disabled?: boolean;
}

export function Stage0InputPanel({
  lists,
  value,
  onChange,
  disabled = false,
}: Stage0InputPanelProps) {
  const update = (patch: Partial<Stage0Input>) => onChange({ ...value, ...patch });

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm sticky top-20">
      <div className="px-5 py-4 border-b border-gray-200 bg-gradient-to-br from-blue-50/40 to-white">
        <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
          <Settings2 className="w-4 h-4 text-primary" />
          試算輸入
        </h3>
        <p className="text-xs text-gray-500 mt-0.5">調整參數即時預覽結果</p>
      </div>

      <div className="p-5 space-y-4">
        {/* LIST_NO */}
        <div>
          <label
            htmlFor="stage0-list-no"
            className="block text-sm font-medium text-gray-700 mb-1.5"
          >
            名單 LIST_NO
          </label>
          <div className="relative">
            <select
              id="stage0-list-no"
              data-testid="input-list-no"
              value={value.listNo}
              disabled={disabled || lists.length === 0}
              onChange={(e) => update({ listNo: e.target.value })}
              className="w-full pl-3 pr-9 py-2 text-sm border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary appearance-none disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
            >
              {lists.length === 0 ? (
                // F049 v1.3 AC-4-Default：無 active 名單 → 空狀態（無「— 請選擇 —」空選項）
                <option value="">尚無可選名單</option>
              ) : (
                // 對齊 prototype：直接從第一個 option 開始（無空選項），由父層預設選第一筆
                lists.map((l) => (
                  <option key={l.listNo} value={l.listNo}>
                    {l.listNo} — {l.listNm}
                  </option>
                ))
              )}
            </select>
            <ChevronDown className="w-4 h-4 text-gray-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
          <p className="text-xs text-gray-400 mt-1">
            僅顯示 status='active' 的名單
          </p>
        </div>

        {/* 預估總筆數 */}
        <div>
          <label
            htmlFor="stage0-total-count"
            className="block text-sm font-medium text-gray-700 mb-1.5"
          >
            預估總筆數
          </label>
          <input
            id="stage0-total-count"
            data-testid="input-total-count"
            type="number"
            min={0}
            value={value.totalCount}
            onChange={(e) =>
              update({ totalCount: Number(e.target.value) || 0 })
            }
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md font-mono focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
          <p className="text-xs text-gray-400 mt-1">
            來自 ob_pool_data 篩選結果（LIST_NO 條件 COUNT）
          </p>
        </div>

        {/* 起訖日 */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label
              htmlFor="stage0-start-date"
              className="block text-sm font-medium text-gray-700 mb-1.5"
            >
              起始日
            </label>
            <input
              id="stage0-start-date"
              data-testid="input-start-date"
              type="date"
              value={value.startDate}
              onChange={(e) => update({ startDate: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>
          <div>
            <label
              htmlFor="stage0-end-date"
              className="block text-sm font-medium text-gray-700 mb-1.5"
            >
              結束日
            </label>
            <input
              id="stage0-end-date"
              data-testid="input-end-date"
              type="date"
              value={value.endDate}
              onChange={(e) => update({ endDate: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>
        </div>

        {/* 工作日來源 */}
        <div>
          <label
            htmlFor="stage0-calendar-source"
            className="block text-sm font-medium text-gray-700 mb-1.5"
          >
            工作日來源
          </label>
          <div className="relative">
            <select
              id="stage0-calendar-source"
              data-testid="input-calendar-source"
              value={value.calendarSource}
              onChange={(e) =>
                update({ calendarSource: e.target.value as CalendarSource })
              }
              className="w-full pl-3 pr-9 py-2 text-sm border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary appearance-none"
            >
              <option value="weekday">
                工作日（rest_flg='0'）— 排除週末與國定假日
              </option>
              <option value="weekday-only">僅排除週末</option>
              <option value="all">不排除（含週末與國定假日）</option>
            </select>
            <ChevronDown className="w-4 h-4 text-gray-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
          <p className="text-xs text-gray-400 mt-1">
            資料表 <code className="font-mono">ob_calendar</code>（E04+E05 ETL 同步）
          </p>
        </div>

        {/* 演算法說明 */}
        <div
          data-testid="algorithm-explain"
          className="p-3 bg-gray-50 rounded-lg text-xs text-gray-600 font-mono leading-relaxed"
        >
          <div className="flex items-center gap-1.5 text-gray-500 font-sans font-medium mb-1.5">
            <FunctionSquare className="w-3.5 h-3.5" />
            AD-E07-8 演算法
          </div>
          base = FLOOR(1000 / working_days)
          <br />
          rem = 1000 mod working_days
          <br />
          per_date = base
          <br />
          <span className="text-primary">最後 rem 個工作日: per_date = base + 1</span>
        </div>
      </div>
    </div>
  );
}
