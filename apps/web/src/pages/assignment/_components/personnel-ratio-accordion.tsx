import { useState, useEffect } from 'react';
import {
  ChevronDown,
  ChevronUp,
  ChevronsDown,
  ChevronsUp,
  CheckCircle2,
  Edit3,
  Circle,
  Users,
  UserCog,
  Archive,
} from 'lucide-react';

/**
 * 29b/29c/29d 多部門個別比例 accordion 包裝器
 *
 * 對應 prototypes：
 *   - 29b-personnel-ratio-config.html L282（編輯模式 deptAccordionContainer）
 *   - 29c-approval-review.html L281（唯讀模式）
 *   - 29d-ready-summary.html L341（唯讀模式）
 *
 * 設計：
 *   - 接 dept list，每個 dept 渲染一個可摺疊 panel
 *   - panel header 顯示 dept 名稱 + 處長 + 部門配額 + 在職人數 + 加總 + 三狀態 chip
 *   - panel body 由父層 renderDept callback 提供（編輯 / 唯讀皆可）
 *   - 全部展開 / 全部摺疊；單一 dept 也可獨立 toggle
 */

export type DeptStatus = 'todo' | 'pending' | 'done';

export interface AccordionDept {
  deptCode: string;
  deptName: string;
  /** 處長姓名（無對應人員時 null） */
  directorName?: string | null;
  /** 部門配額 RATION (%)（從 ob_dept_pct 帶入；可選） */
  deptRatio?: number | null;
  /** 在職員工人數 */
  activeCount?: number;
  /** 該部門員工比例加總（用於 header 顯示） */
  sum?: number;
  /**
   * 部門狀態三態：
   *   - 'todo'    未設定（所有員工 ration 為 null 或 0）
   *   - 'pending' 待儲存（有 ration 值但加總不等於 100）
   *   - 'done'    已完成（加總 = 100 或全員離職）
   */
  status?: DeptStatus;
  /** 標示部門全員離職；header 文字會加註 */
  offline?: boolean;
}

export interface PersonnelRatioAccordionProps<T extends AccordionDept = AccordionDept> {
  depts: T[];
  /** 每個 dept 的 panel body 由父層提供 */
  renderDept: (dept: T) => React.ReactNode;
  /** 預設展開（true）或摺疊（false）；預設 true */
  defaultOpen?: boolean;
}

function StatusChip({ status }: { status: DeptStatus }) {
  const meta = {
    todo: {
      cls: 'bg-gray-100 text-gray-500',
      icon: <Circle className="w-2.5 h-2.5" />,
      label: '未設定',
    },
    pending: {
      cls: 'bg-blue-50 text-primary',
      icon: <Edit3 className="w-2.5 h-2.5" />,
      label: '待儲存',
    },
    done: {
      cls: 'bg-green-100 text-green-700',
      icon: <CheckCircle2 className="w-2.5 h-2.5" />,
      label: '已完成',
    },
  }[status];
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${meta.cls}`}
      data-testid={`dept-status-chip-${status}`}
    >
      {meta.icon}
      {meta.label}
    </span>
  );
}

export function PersonnelRatioAccordion<T extends AccordionDept = AccordionDept>({
  depts,
  renderDept,
  defaultOpen = true,
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
      <div className="flex items-center justify-end gap-2">
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

      {depts.map((dept) => {
        const open = openMap[dept.deptCode] ?? defaultOpen;
        const sumDisplay =
          typeof dept.sum === 'number' ? `${Math.round(dept.sum * 100) / 100}%` : '';
        const sumOk =
          typeof dept.sum === 'number' && Math.abs(dept.sum - 100) <= 0.01;
        return (
          <div
            key={dept.deptCode}
            className="rounded-lg border border-gray-200 bg-white overflow-hidden"
            data-testid={`dept-accordion-${dept.deptCode}`}
          >
            <button
              type="button"
              data-testid={`dept-accordion-header-${dept.deptCode}`}
              aria-expanded={open}
              onClick={() => toggle(dept.deptCode)}
              className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition text-left flex-wrap"
            >
              {open ? (
                <ChevronUp className="w-4 h-4 text-gray-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-gray-400" />
              )}
              <span className="font-mono text-sm text-gray-600">{dept.deptCode}</span>
              <span className="text-sm text-gray-800 font-medium">{dept.deptName}</span>
              {dept.directorName ? (
                <span
                  data-testid={`dept-director-${dept.deptCode}`}
                  className="inline-flex items-center gap-1 text-xs text-gray-600"
                >
                  <UserCog className="w-3 h-3 text-purple-600" />
                  {dept.directorName}
                </span>
              ) : null}
              {dept.offline && (
                <span
                  data-testid={`dept-offline-${dept.deptCode}`}
                  className="text-[10px] text-amber-700 px-1.5 py-0.5 bg-amber-50 border border-amber-200 rounded inline-flex items-center gap-1"
                >
                  <Archive className="w-2.5 h-2.5" />全員離職
                </span>
              )}
              <div className="ml-auto flex items-center gap-2 text-xs flex-wrap justify-end">
                {typeof dept.deptRatio === 'number' && (
                  <span className="text-gray-500">
                    部門配額{' '}
                    <strong className="font-semibold text-gray-800 tabular-nums">
                      {dept.deptRatio}%
                    </strong>
                  </span>
                )}
                {typeof dept.activeCount === 'number' && (
                  <>
                    <span className="text-gray-300">·</span>
                    <span className="text-gray-500">
                      在職{' '}
                      <strong className="font-semibold text-gray-800 tabular-nums">
                        {dept.activeCount}
                      </strong>{' '}
                      人
                    </span>
                  </>
                )}
                {sumDisplay && (
                  <>
                    <span className="text-gray-300">·</span>
                    <span className="text-gray-500">
                      加總{' '}
                      <strong
                        className={`font-semibold tabular-nums ${
                          sumOk ? 'text-green-700' : 'text-gray-700'
                        }`}
                      >
                        {sumDisplay}
                      </strong>
                    </span>
                  </>
                )}
                {dept.status && <StatusChip status={dept.status} />}
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
