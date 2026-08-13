import { useState, useEffect, useMemo, Fragment } from 'react';
import {
  Table2,
  ChevronRight,
  ChevronDown,
  AlertTriangle,
  Info,
  ChevronsDownUp,
  ChevronsUpDown,
  UserPlus,
} from 'lucide-react';
import { getPivot, type PivotResponse } from '@/api/assignment-run';

/**
 * F116 — 快照詳情「樞紐分析」頁籤
 *
 * 對應 prototype: prototypes/35-snapshot-detail.html（第 4 頁籤 #panel-pivot）。
 * 部門名稱（外層，可展開）→ 員編（+姓名+職稱+新人標註，內層）× 名單代號（欄）之案號計數交叉表；
 * 含總計欄（最左）／總計列（最下）、整月/工作天 toggle、計數/佔比 toggle、sticky 首欄與表頭。
 *
 * v1.1（US-182）：
 *   - AC-6：員編列顯示「員編 → 姓名 → 職稱」（職稱來源為 API jfunNm，即 ob_emphire.jfun_nm）
 *   - AC-7：isNewcomer=true → 顯示「新人」標註（判定於後端，前端不重算）
 *   - AC-9 / BR-11：總計「欄」移至最左（列標籤欄之後、名單代號欄之前）；總計「列」維持最下
 *   - AC-10 / BR-13、BR-14：工作天模式每格 = ceil(整月計數 ÷ workingDays)，逐格獨立進位
 *     （I-F116-CEIL-PER-CELL-01：總計欄/列不必然等於各格相加，屬預期行為）
 *   - AC-11 / BR-15：workingDays = 0 → 全表數值格顯示 '-' 並顯示提示，不得出現 NaN/Infinity
 *   - BR-16：合法組合僅「整月-計數」「整月-佔比」「工作天-計數」；工作天下佔比 disabled
 *   - I-F116-CLIENT-STATE-01：維度／值狀態為純前端記憶體 state，不落地、不進 URL/session
 */

type Mode = 'count' | 'pct';
/** 期間維度：整月（v1.0 既有語意）／工作天（v1.1 新增）。 */
type Dim = 'full' | 'workday';

/**
 * 依「期間維度 × 值模式」格式化單格。
 *
 * - 無分派案件（byList 無該 key）→ '-'（三種合法組合皆同，對齊 prototype pvVal）
 * - 工作天：workingDays <= 0 → '-'（BR-15，禁止除以零 / NaN / Infinity）；
 *   否則 ceil(cnt ÷ workingDays)，逐格獨立計算（BR-13 / BR-14）
 * - 整月-計數：0 → '-'（v1.0 既有）；整月-佔比：value / parent %（parent = 0 → '-'）
 */
function fmt(
  value: number | undefined,
  dim: Dim,
  mode: Mode,
  parent: number,
  workingDays: number,
): string {
  if (dim === 'workday') {
    if (workingDays <= 0) return '-';
    if (value == null) return '-';
    return Math.ceil(value / workingDays).toLocaleString();
  }
  const v = value ?? 0;
  if (mode === 'count') return v ? v.toLocaleString() : '-';
  if (!parent) return '-';
  return `${((v / parent) * 100).toFixed(1)}%`;
}

/** 表頭左上角與工具列之值標籤（三種合法組合，BR-16）。 */
function cornerLabel(dim: Dim, mode: Mode): string {
  if (dim === 'workday') return '每工作天 - 案號';
  return mode === 'pct' ? '佔比 - 案號' : '計數 - 案號';
}
function valueLabelLong(dim: Dim, mode: Mode, workingDays: number): string {
  if (dim === 'workday') {
    return workingDays > 0
      ? `每工作天 - 案號（÷ ${workingDays} 個工作日，無條件進位）`
      : '每工作天 - 案號（本月無工作日資料）';
  }
  return mode === 'pct' ? '佔比 - 案號（占父層比）' : '計數 - 案號';
}

/** segmented 按鈕樣式（含 disabled 樣態，對齊 prototype pvSeg）。 */
function segClass(on: boolean, disabled: boolean, extra = ''): string {
  const base = `px-3 py-1.5 text-xs font-medium ${extra} `;
  if (disabled) return `${base}text-gray-300 bg-gray-50 cursor-not-allowed`;
  return base + (on ? 'bg-primary text-white' : 'bg-white text-gray-700 hover:bg-gray-50');
}

export function SnapshotPivotView({ runId }: { runId: string }) {
  const [data, setData] = useState<PivotResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('count');
  const [dim, setDim] = useState<Dim>('full');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!runId) return;
    let aborted = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await getPivot(runId);
        if (!aborted) {
          setData(res);
          // 預設展開第一個部門（對齊 prototype）
          setExpanded(new Set(res.depts[0] ? [res.depts[0].deptName] : []));
        }
      } catch (err: unknown) {
        const e = err as { response?: { data?: { message?: string } } };
        if (!aborted) setError(e?.response?.data?.message ?? '載入樞紐分析失敗');
      } finally {
        if (!aborted) setLoading(false);
      }
    })();
    return () => {
      aborted = true;
    };
  }, [runId]);

  const listNos = data?.listNos ?? [];
  const depts = data?.depts ?? [];
  const workingDays = data?.workingDays ?? 0;

  const allDeptNames = useMemo(() => depts.map((d) => d.deptName), [depts]);
  const toggleDept = (name: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };
  const expandAll = () => setExpanded(new Set(allDeptNames));
  const collapseAll = () => setExpanded(new Set());
  // BR-16：切至「工作天」時值自動回落計數（工作天-佔比為非法組合）；切換維度不重置展開狀態（AC-3）
  const selectDim = (next: Dim) => {
    setDim(next);
    if (next === 'workday') setMode('count');
  };

  const pctDisabled = dim === 'workday';
  const showWorkdayInfo = dim === 'workday' && workingDays > 0;
  const showWorkdayWarn = dim === 'workday' && workingDays <= 0;

  return (
    <div className="space-y-3" data-testid="snapshot-pivot-view">
      {/* Toolbar */}
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <div className="flex items-center gap-2">
            <Table2 className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold text-gray-700">樞紐分析</span>
            <span className="text-xs text-gray-400">值：{valueLabelLong(dim, mode, workingDays)}</span>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            各部門／承辦人員（列）× 名單代號（欄）的分派案件數交叉表；可展開部門檢視所屬人員。「總計」欄固定於最左側。
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5 flex items-center gap-1">
            <Info className="w-3 h-3" />
            對應「結果摘要」匯出 Excel 的樞紐分析頁。
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <button
            type="button"
            data-testid="pivot-expand-all"
            onClick={expandAll}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs text-gray-700 border border-gray-200 rounded-md hover:bg-gray-50"
          >
            <ChevronsUpDown className="w-3.5 h-3.5" />
            全部展開
          </button>
          <button
            type="button"
            data-testid="pivot-collapse-all"
            onClick={collapseAll}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs text-gray-700 border border-gray-200 rounded-md hover:bg-gray-50"
          >
            <ChevronsDownUp className="w-3.5 h-3.5" />
            全部收合
          </button>
          {/* 整月 / 工作天 segmented toggle（v1.1） */}
          <div className="inline-flex items-center gap-1.5">
            <span className="text-[10px] font-medium text-gray-400">期間</span>
            <div
              role="group"
              aria-label="整月或工作天切換"
              className="inline-flex rounded-md border border-gray-200 overflow-hidden"
            >
              <button
                type="button"
                data-testid="pivot-dim-full"
                aria-pressed={dim === 'full'}
                onClick={() => selectDim('full')}
                className={segClass(dim === 'full', false)}
              >
                整月
              </button>
              <button
                type="button"
                data-testid="pivot-dim-workday"
                aria-pressed={dim === 'workday'}
                onClick={() => selectDim('workday')}
                className={segClass(dim === 'workday', false, 'border-l border-gray-200')}
              >
                工作天
              </button>
            </div>
          </div>
          {/* 計數 / 佔比 segmented toggle */}
          <div className="inline-flex items-center gap-1.5">
            <span className="text-[10px] font-medium text-gray-400">值</span>
            <div
              role="group"
              aria-label="計數或佔比切換"
              className="inline-flex rounded-md border border-gray-200 overflow-hidden"
            >
              <button
                type="button"
                data-testid="pivot-mode-count"
                aria-pressed={mode === 'count'}
                onClick={() => setMode('count')}
                className={segClass(mode === 'count', false)}
              >
                計數
              </button>
              <button
                type="button"
                data-testid="pivot-mode-pct"
                aria-pressed={mode === 'pct'}
                disabled={pctDisabled}
                title={pctDisabled ? '「工作天」模式不提供佔比' : undefined}
                onClick={() => setMode('pct')}
                className={segClass(mode === 'pct', pctDisabled, 'border-l border-gray-200')}
              >
                佔比
              </button>
            </div>
          </div>
        </div>
        {/* 工作天模式說明／缺工作日資料提示（僅於「工作天」模式顯示，AC-11） */}
        {showWorkdayInfo && (
          <div
            data-testid="pivot-workday-info"
            className="basis-full w-full flex items-start gap-1.5 px-3 py-2 rounded-md bg-blue-50 border border-blue-100 text-[11px] text-gray-600"
          >
            <Info className="w-3.5 h-3.5 text-primary mt-px shrink-0" />
            <span>
              {`本月工作日 ${workingDays} 天；每格 = 整月計數 ÷ ${workingDays} 後無條件進位。進位是逐格獨立計算，因此「總計」欄與「總計」列不會等於各格相加，屬正常現象。`}
            </span>
          </div>
        )}
        {showWorkdayWarn && (
          <div
            data-testid="pivot-workday-warning"
            className="basis-full w-full flex items-start gap-1.5 px-3 py-2 rounded-md bg-amber-50 border border-amber-200 text-[11px] text-amber-800"
          >
            <AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0" />
            <span>本月無工作日資料，無法換算每工作天數量。請改用「整月」檢視。</span>
          </div>
        )}
      </div>

      {loading && (
        <div className="p-12 text-center text-gray-400" data-testid="pivot-loading">
          載入樞紐分析中…
        </div>
      )}

      {error && !loading && (
        <div
          data-testid="pivot-error"
          className="rounded-lg p-3 bg-red-50 border border-red-200 flex items-start gap-2 text-sm"
        >
          <AlertTriangle className="w-4 h-4 text-danger mt-0.5 shrink-0" />
          <span className="text-red-800">{error}</span>
        </div>
      )}

      {!loading && !error && depts.length === 0 && (
        <div data-testid="pivot-empty" className="p-12 text-center text-sm text-gray-500">
          本次分派無可供樞紐分析的結果
        </div>
      )}

      {!loading && !error && depts.length > 0 && (
        <div
          className="border border-gray-200 rounded-lg overflow-auto max-h-[560px]"
          data-testid="pivot-table"
        >
          <table className="text-xs border-separate border-spacing-0 whitespace-nowrap">
            <thead>
              {/* BR-11 欄序：列標籤 → 總計 → 名單代號（升冪） */}
              <tr>
                <th
                  data-testid="pivot-header-label"
                  className="sticky top-0 left-0 z-20 bg-gray-100 text-left px-3 py-2 font-semibold text-gray-600 border-b border-r border-gray-200 min-w-[16rem]"
                >
                  {cornerLabel(dim, mode)}
                  <span className="text-gray-400 font-normal">（部門／員編）</span>
                </th>
                <th
                  data-testid="pivot-header-total"
                  className="sticky top-0 z-10 bg-blue-50 text-right px-3 py-2 font-semibold text-gray-700 border-b border-r border-gray-200 min-w-[7rem]"
                >
                  總計
                </th>
                {listNos.map((l) => (
                  <th
                    key={l}
                    data-testid={`pivot-header-list-${l}`}
                    className="sticky top-0 z-10 bg-gray-100 text-right px-3 py-2 font-semibold text-gray-600 border-b border-gray-200 min-w-[7rem]"
                  >
                    {l}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {depts.map((d) => {
                const isOpen = expanded.has(d.deptName);
                return (
                  <Fragment key={d.deptName}>
                    <tr
                      data-testid={`pivot-dept-${d.deptName}`}
                      aria-expanded={isOpen}
                      onClick={() => toggleDept(d.deptName)}
                      className="hover:bg-gray-50/60 cursor-pointer"
                    >
                      <td className="sticky left-0 z-10 bg-white px-3 py-1.5 border-b border-r border-gray-200">
                        <button
                          type="button"
                          onClick={(ev) => {
                            ev.stopPropagation();
                            toggleDept(d.deptName);
                          }}
                          className="inline-flex items-center gap-1.5 font-medium text-gray-800"
                        >
                          {isOpen ? (
                            <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
                          )}
                          {d.deptName}
                          <span className="text-[10px] text-gray-400">{d.emplids.length} 位員編</span>
                        </button>
                      </td>
                      <td
                        data-testid="pivot-cell-total"
                        className="px-3 py-1.5 text-right font-mono font-semibold text-gray-800 bg-blue-50/40 border-b border-r border-gray-200"
                      >
                        {fmt(d.total, dim, mode, data!.grandTotal, workingDays)}
                      </td>
                      {listNos.map((l) => (
                        <td
                          key={l}
                          data-testid={`pivot-cell-list-${l}`}
                          className="px-3 py-1.5 text-right font-mono text-gray-700 border-b border-gray-100"
                        >
                          {fmt(d.byList[l], dim, mode, data!.grandByList[l] ?? 0, workingDays)}
                        </td>
                      ))}
                    </tr>
                    {isOpen &&
                      d.emplids.map((e) => (
                        <tr
                          key={`${d.deptName}-${e.emplid}`}
                          data-testid={`pivot-emp-${e.emplid}`}
                          className="hover:bg-gray-50/60"
                        >
                          <td className="sticky left-0 z-10 bg-white px-3 py-1.5 border-b border-r border-gray-200">
                            {/* AC-6：員編 → 姓名 → 職稱；AC-8：無值者省略不留空位 */}
                            <span className="inline-flex items-center gap-1.5 pl-6">
                              <span className="font-mono text-[11px] text-gray-500">{e.emplid}</span>
                              {e.empNm && (
                                <>
                                  <span className="text-gray-300" aria-hidden="true">
                                    -
                                  </span>
                                  <span className="text-gray-800">{e.empNm}</span>
                                </>
                              )}
                              {e.jfunNm && (
                                <>
                                  <span className="text-gray-300" aria-hidden="true">
                                    -
                                  </span>
                                  <span className="text-[11px] text-gray-500">{e.jfunNm}</span>
                                </>
                              )}
                              {e.isNewcomer && (
                                <span
                                  data-testid="pivot-newcomer-badge"
                                  className="shrink-0 whitespace-nowrap inline-flex items-center gap-0.5 ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200"
                                >
                                  <UserPlus className="w-2.5 h-2.5" />
                                  新人
                                </span>
                              )}
                            </span>
                          </td>
                          <td
                            data-testid="pivot-cell-total"
                            className="px-3 py-1.5 text-right font-mono text-gray-700 bg-blue-50/30 border-b border-r border-gray-200"
                          >
                            {fmt(e.total, dim, mode, d.total, workingDays)}
                          </td>
                          {listNos.map((l) => (
                            <td
                              key={l}
                              data-testid={`pivot-cell-list-${l}`}
                              className="px-3 py-1.5 text-right font-mono text-gray-600 border-b border-gray-100"
                            >
                              {fmt(e.byList[l], dim, mode, d.byList[l] ?? 0, workingDays)}
                            </td>
                          ))}
                        </tr>
                      ))}
                  </Fragment>
                );
              })}
              {/* 總計列（BR-11：維持在表格最下方，不隨總計欄移動） */}
              <tr data-testid="pivot-total-row" className="bg-blue-50 font-semibold">
                <td className="sticky left-0 z-10 bg-blue-50 px-3 py-2 text-gray-800 border-t border-r border-gray-200">
                  總計
                </td>
                <td
                  data-testid="pivot-cell-total"
                  className="px-3 py-2 text-right font-mono text-gray-900 bg-blue-100/60 border-t border-r border-gray-200"
                >
                  {fmt(data!.grandTotal, dim, mode, data!.grandTotal, workingDays)}
                </td>
                {listNos.map((l) => (
                  <td
                    key={l}
                    data-testid={`pivot-cell-list-${l}`}
                    className="px-3 py-2 text-right font-mono text-gray-800 border-t border-gray-200"
                  >
                    {fmt(data!.grandByList[l], dim, mode, data!.grandByList[l] ?? 0, workingDays)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
