import { useState, useEffect, useMemo } from 'react';
import {
  Table2,
  ChevronRight,
  ChevronDown,
  AlertTriangle,
  Info,
  ChevronsDownUp,
  ChevronsUpDown,
} from 'lucide-react';
import { getPivot, type PivotResponse } from '@/api/assignment-run';

/**
 * F116 — 快照詳情「樞紐分析」頁籤
 *
 * 對應 prototype: prototypes/35-snapshot-detail.html（第 4 頁籤）。
 * 部門名稱（外層，可展開）→ 員編（+姓名，內層）× 名單代號（欄）之案號計數交叉表；
 * 含總計行/列、計數/佔比 toggle、sticky 首欄與表頭。資料由 GET :runId/pivot（只回計數）。
 */

type Mode = 'count' | 'pct';

/** 依模式格式化：count → 數字（0/空→'-'）；pct → value/parent %（0/0→'-'）。 */
function fmt(value: number | undefined, mode: Mode, parent: number): string {
  const v = value ?? 0;
  if (mode === 'count') return v ? v.toLocaleString() : '-';
  if (!parent) return '-';
  return `${((v / parent) * 100).toFixed(1)}%`;
}

export function SnapshotPivotView({ runId }: { runId: string }) {
  const [data, setData] = useState<PivotResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('count');
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

  return (
    <div className="space-y-3" data-testid="snapshot-pivot-view">
      {/* Toolbar */}
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <div className="flex items-center gap-2">
            <Table2 className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold text-gray-700">樞紐分析</span>
            <span className="text-xs text-gray-400">
              值：{mode === 'count' ? '計數 - 案號' : '佔比 - 案號（占父層比）'}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            各部門／承辦人員（列）× 名單代號（欄）的分派案件數交叉表；可展開部門檢視所屬人員。
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5 flex items-center gap-1">
            <Info className="w-3 h-3" />
            對應「結果摘要」匯出 Excel 的樞紐分析頁。
          </p>
        </div>
        <div className="flex items-center gap-2">
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
          {/* 計數 / 佔比 segmented toggle */}
          <div className="inline-flex rounded-md border border-gray-200 overflow-hidden">
            <button
              type="button"
              data-testid="pivot-mode-count"
              onClick={() => setMode('count')}
              className={`px-3 py-1.5 text-xs font-medium ${
                mode === 'count' ? 'bg-primary text-white' : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              計數
            </button>
            <button
              type="button"
              data-testid="pivot-mode-pct"
              onClick={() => setMode('pct')}
              className={`px-3 py-1.5 text-xs font-medium ${
                mode === 'pct' ? 'bg-primary text-white' : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              佔比
            </button>
          </div>
        </div>
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
              <tr>
                <th className="sticky top-0 left-0 z-20 bg-gray-100 text-left px-3 py-2 font-semibold text-gray-600 border-b border-r border-gray-200 min-w-[16rem]">
                  {mode === 'count' ? '計數 - 案號' : '佔比 - 案號'}
                  <span className="text-gray-400 font-normal">（部門／員編）</span>
                </th>
                {listNos.map((l) => (
                  <th
                    key={l}
                    className="sticky top-0 z-10 bg-gray-100 text-right px-3 py-2 font-semibold text-gray-600 border-b border-gray-200 min-w-[7rem]"
                  >
                    {l}
                  </th>
                ))}
                <th className="sticky top-0 z-10 bg-blue-50 text-right px-3 py-2 font-semibold text-gray-700 border-b border-l border-gray-200 min-w-[7rem]">
                  總計
                </th>
              </tr>
            </thead>
            <tbody>
              {depts.map((d) => {
                const isOpen = expanded.has(d.deptName);
                return (
                  <>
                    <tr key={d.deptName} className="hover:bg-gray-50/60">
                      <td className="sticky left-0 z-10 bg-white px-3 py-1.5 border-b border-r border-gray-200">
                        <button
                          type="button"
                          data-testid={`pivot-dept-${d.deptName}`}
                          onClick={() => toggleDept(d.deptName)}
                          className="inline-flex items-center gap-1.5 font-medium text-gray-800"
                        >
                          {isOpen ? (
                            <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
                          )}
                          {d.deptName}
                          <span className="text-[10px] text-gray-400">
                            {d.emplids.length} 位員編
                          </span>
                        </button>
                      </td>
                      {listNos.map((l) => (
                        <td key={l} className="px-3 py-1.5 text-right font-mono text-gray-700 border-b border-gray-100">
                          {fmt(d.byList[l], mode, data!.grandByList[l] ?? 0)}
                        </td>
                      ))}
                      <td className="px-3 py-1.5 text-right font-mono font-semibold text-gray-800 bg-blue-50/40 border-b border-l border-gray-200">
                        {fmt(d.total, mode, data!.grandTotal)}
                      </td>
                    </tr>
                    {isOpen &&
                      d.emplids.map((e) => (
                        <tr key={`${d.deptName}-${e.emplid}`} className="hover:bg-gray-50/60">
                          <td className="sticky left-0 z-10 bg-white px-3 py-1.5 border-b border-r border-gray-200">
                            <span className="inline-flex items-center gap-1.5 pl-6">
                              <span className="font-mono text-[11px] text-gray-500">{e.emplid}</span>
                              <span className="text-gray-800">{e.empNm ?? '—'}</span>
                            </span>
                          </td>
                          {listNos.map((l) => (
                            <td key={l} className="px-3 py-1.5 text-right font-mono text-gray-600 border-b border-gray-100">
                              {fmt(e.byList[l], mode, d.byList[l] ?? 0)}
                            </td>
                          ))}
                          <td className="px-3 py-1.5 text-right font-mono text-gray-700 bg-blue-50/30 border-b border-l border-gray-200">
                            {fmt(e.total, mode, d.total)}
                          </td>
                        </tr>
                      ))}
                  </>
                );
              })}
              {/* 總計列 */}
              <tr className="bg-blue-50 font-semibold">
                <td className="sticky left-0 z-10 bg-blue-50 px-3 py-2 text-gray-800 border-t border-r border-gray-200">
                  總計
                </td>
                {listNos.map((l) => (
                  <td key={l} className="px-3 py-2 text-right font-mono text-gray-800 border-t border-gray-200">
                    {fmt(data!.grandByList[l], mode, data!.grandByList[l] ?? 0)}
                  </td>
                ))}
                <td className="px-3 py-2 text-right font-mono text-gray-900 bg-blue-100/60 border-t border-l border-gray-200">
                  {fmt(data!.grandTotal, mode, data!.grandTotal)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
