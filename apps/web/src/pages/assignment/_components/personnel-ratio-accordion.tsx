import { useState, useEffect } from 'react';
import {
  ChevronDown,
  ChevronUp,
  ChevronsDown,
  ChevronsUp,
  CheckCircle2,
  AlertCircle,
  Users,
} from 'lucide-react';

/**
 * 29b/29c 多部門個別比例 accordion 包裝器
 *
 * 對應 prototypes：
 *   - 29b-personnel-ratio-config.html L282（編輯模式 deptAccordionContainer）
 *   - 29c-approval-review.html L281（唯讀模式 deptAccordionContainer）
 *   - 29d-ready-summary.html L341（唯讀模式 detailAccordionContainer）
 *
 * 設計：
 *   - 接 dept list，每個 dept 渲染一個可摺疊 panel
 *   - panel header 顯示 dept 名稱 + 加總 + 完成標記
 *   - panel body 由父層 renderDept callback 提供（編輯 / 唯讀皆可）
 *   - 全部展開 / 全部摺疊；單一 dept 也可獨立 toggle
 *   - 可選顯示整體完成進度（X / Y）
 */

export interface AccordionDept {
  deptCode: string;
  deptName: string;
  /** 該部門員工比例加總（用於 header 顯示） */
  sum?: number;
  /** 該部門是否已完成（加總 = 100，用於 header badge） */
  complete?: boolean;
  /** 標示部門已下線；header 文字會加註 */
  offline?: boolean;
}

export interface PersonnelRatioAccordionProps<T extends AccordionDept = AccordionDept> {
  depts: T[];
  /** 每個 dept 的 panel body 由父層提供 */
  renderDept: (dept: T) => React.ReactNode;
  /** 預設展開（true）或摺疊（false）；預設 true */
  defaultOpen?: boolean;
  /** 是否顯示整體完成進度（complete=true 計數 / 總數）；預設 false */
  showProgress?: boolean;
  /** 整體業務員總數（顯示在頂部右側；可選） */
  totalEmployees?: number;
}

export function PersonnelRatioAccordion<T extends AccordionDept = AccordionDept>({
  depts,
  renderDept,
  defaultOpen = true,
  showProgress = false,
  totalEmployees,
}: PersonnelRatioAccordionProps<T>) {
  const [openMap, setOpenMap] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const d of depts) init[d.deptCode] = defaultOpen;
    return init;
  });

  // depts 變化（首次載入）時同步初始 openMap
  useEffect(() => {
    setOpenMap((prev) => {
      const next: Record<string, boolean> = {};
      for (const d of depts) {
        next[d.deptCode] = prev[d.deptCode] ?? defaultOpen;
      }
      return next;
    });
  }, [depts, defaultOpen]);

  if (depts.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 p-8 flex flex-col items-center text-center">
        <Users className="w-8 h-8 text-gray-400 mb-2" />
        <p className="text-sm text-gray-500">無部門設定（或您的轄區尚無可見部門）</p>
      </div>
    );
  }

  const completeCount = depts.filter((d) => d.complete === true).length;

  const expandAll = () => {
    const next: Record<string, boolean> = {};
    for (const d of depts) next[d.deptCode] = true;
    setOpenMap(next);
  };
  const collapseAll = () => {
    const next: Record<string, boolean> = {};
    for (const d of depts) next[d.deptCode] = false;
    setOpenMap(next);
  };
  const toggle = (deptCode: string) => {
    setOpenMap((prev) => ({ ...prev, [deptCode]: !prev[deptCode] }));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {showProgress ? (
          <div
            data-testid="overall-progress"
            className="text-xs text-gray-600 inline-flex items-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4 text-green-600" />
            <span>
              部門完成進度：<strong>{completeCount}</strong> /{' '}
              <strong>{depts.length}</strong>
            </span>
            {typeof totalEmployees === 'number' && (
              <span className="ml-2 text-gray-500">
                · 業務員總數 <strong>{totalEmployees}</strong> 人
              </span>
            )}
          </div>
        ) : (
          <div />
        )}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={expandAll}
            className="text-xs text-gray-500 hover:text-primary inline-flex items-center gap-1"
          >
            <ChevronsDown className="w-3 h-3" />
            全部展開
          </button>
          <span className="text-gray-300">/</span>
          <button
            type="button"
            onClick={collapseAll}
            className="text-xs text-gray-500 hover:text-primary inline-flex items-center gap-1"
          >
            <ChevronsUp className="w-3 h-3" />
            全部摺疊
          </button>
        </div>
      </div>

      {depts.map((dept) => {
        const open = openMap[dept.deptCode] ?? defaultOpen;
        const sumDisplay =
          typeof dept.sum === 'number' ? `${Math.round(dept.sum * 100) / 100}%` : '';
        return (
          <div
            key={dept.deptCode}
            className="rounded-lg border border-gray-200 bg-white overflow-hidden"
          >
            <button
              type="button"
              data-testid={`dept-accordion-header-${dept.deptCode}`}
              aria-expanded={open}
              onClick={() => toggle(dept.deptCode)}
              className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition"
            >
              {open ? (
                <ChevronUp className="w-4 h-4 text-gray-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-gray-400" />
              )}
              <span className="font-mono text-sm text-gray-600">
                {dept.deptCode}
              </span>
              <span className="text-sm text-gray-800 font-medium">
                {dept.deptName}
              </span>
              {dept.offline && (
                <span className="text-[10px] text-amber-700 px-1.5 py-0.5 bg-amber-50 border border-amber-200 rounded">
                  已下線
                </span>
              )}
              <div className="ml-auto flex items-center gap-2 text-xs">
                {sumDisplay && (
                  <span
                    className={
                      dept.complete
                        ? 'text-green-700 font-mono'
                        : 'text-amber-700 font-mono'
                    }
                  >
                    加總 {sumDisplay}
                  </span>
                )}
                {dept.complete === true && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-100 text-green-700">
                    <CheckCircle2 className="w-3 h-3" />
                    已完成
                  </span>
                )}
                {dept.complete === false && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-800">
                    <AlertCircle className="w-3 h-3" />
                    未完成
                  </span>
                )}
              </div>
            </button>
            {open && (
              <div className="border-t border-gray-200 p-4 bg-white">
                {renderDept(dept)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
