import { Plus, Ban, RotateCcw, ChevronRight } from 'lucide-react';
import type { PooldataOption } from '@/api/pooldata-fields';

/**
 * F076 v1.4.5 — Option Accordion
 *
 * 對應 prototype: /prototypes/37b-categorical-field-values.html L405-465
 *
 * 單一 categorical 欄位之 accordion：
 *   - summary 顯示 columnName / displayName / activeCount / inactiveCount 統計
 *   - body 顯示 options 列表（行內 ban / rotate-ccw 按鈕）
 *   - 底部「新增可選值」按鈕（per-column context）
 *
 * 三種狀態徽章（prototype L363-371）：
 *   - 啟用：isActive=true
 *   - 自動停用（類別變更）：isActive=false + deactivationReason='field_type_changed'
 *   - 手動停用：isActive=false + deactivationReason!='field_type_changed'
 */

export interface OptionAccordionProps {
  columnName: string;
  displayName: string;
  options: PooldataOption[];
  expanded: boolean;
  canWrite: boolean;
  onToggle: (next: boolean) => void;
  onAdd: () => void;
  onDeactivate: (option: PooldataOption) => void;
  onReactivate: (option: PooldataOption) => void;
  onBlockedReactivate: (option: PooldataOption) => void;
  searchKeyword?: string;
  showInactive: boolean;
}

function StatusBadgeOpt({ option }: { option: PooldataOption }) {
  if (option.isActive) {
    return (
      <span
        data-testid={`status-badge-${option.optionValue}`}
        className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-700"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
        啟用
      </span>
    );
  }
  if (option.deactivatedReason === 'field_type_changed') {
    return (
      <span
        data-testid={`status-badge-${option.optionValue}`}
        title="F075 將欄位類別改為非 categorical 時自動軟停用"
        className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-amber-100 text-amber-700 border border-amber-200"
      >
        自動停用（類別變更）
      </span>
    );
  }
  return (
    <span
      data-testid={`status-badge-${option.optionValue}`}
      className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-500"
    >
      <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
      手動停用
    </span>
  );
}

export function OptionAccordion({
  columnName,
  displayName,
  options,
  expanded,
  canWrite,
  onToggle,
  onAdd,
  onDeactivate,
  onReactivate,
  onBlockedReactivate,
  searchKeyword = '',
  showInactive,
}: OptionAccordionProps) {
  const kw = searchKeyword.trim().toLowerCase();
  const activeOpts = options.filter((o) => o.isActive);
  const inactiveOpts = options.filter((o) => !o.isActive);

  // search 過濾
  const matchedAll = options.filter((o) => {
    if (!kw) return true;
    return (
      columnName.toLowerCase().includes(kw) ||
      displayName.toLowerCase().includes(kw) ||
      o.optionValue.toLowerCase().includes(kw) ||
      o.optionLabel.toLowerCase().includes(kw)
    );
  });
  // 是否顯示 inactive
  const displayed = matchedAll.filter((o) => showInactive || o.isActive);

  // 若 kw 過濾後該欄位完全無 match，整個 accordion 隱藏（prototype L402-403）
  if (kw && matchedAll.length === 0) return null;

  return (
    <div
      data-testid={`accordion-${columnName}`}
      data-state={expanded ? 'open' : 'closed'}
      className="bg-white rounded-lg border border-gray-200 shadow-sm"
    >
      <button
        type="button"
        data-testid={`accordion-summary-${columnName}`}
        onClick={() => onToggle(!expanded)}
        className="w-full px-4 py-3 flex items-center justify-between gap-3 hover:bg-gray-50/50 transition"
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <ChevronRight
            className={`w-4 h-4 text-gray-400 transition-transform shrink-0 ${
              expanded ? 'rotate-90' : ''
            }`}
          />
          <code className="font-mono text-sm font-semibold text-gray-900">
            {columnName}
          </code>
          <span className="text-sm text-gray-600 truncate">（{displayName}）</span>
        </div>
        <div className="flex items-center gap-2 shrink-0 text-xs">
          <span
            data-testid={`accordion-stats-active-${columnName}`}
            className="px-2 py-0.5 bg-green-50 text-green-600 rounded font-mono"
          >
            {activeOpts.length} 啟用
          </span>
          <span
            data-testid={`accordion-stats-inactive-${columnName}`}
            className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded font-mono"
          >
            {inactiveOpts.length} 停用
          </span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-200">
          {displayed.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-gray-400">
              {showInactive ? '無可選值' : '無啟用值（勾選「顯示已停用值」可查看歷史）'}
            </div>
          ) : (
            <div>
              {displayed.map((o) => {
                const isFieldTypeChanged =
                  !o.isActive && o.deactivatedReason === 'field_type_changed';
                return (
                  <div
                    key={o.optionValue}
                    className={`flex items-center justify-between px-4 py-2.5 border-b border-gray-200 last:border-b-0 hover:bg-gray-50/50 ${
                      !o.isActive ? 'bg-gray-50/30 opacity-80' : ''
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <code className="font-mono text-sm font-semibold text-gray-900 min-w-[40px]">
                        {o.optionValue}
                      </code>
                      <span className="text-sm text-gray-800 truncate">
                        {o.optionLabel}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <StatusBadgeOpt option={o} />
                      <div className="inline-flex items-center">
                        {o.isActive ? (
                          <button
                            type="button"
                            disabled={!canWrite}
                            onClick={() => onDeactivate(o)}
                            data-testid={`btn-deactivate-${o.optionValue}`}
                            title="停用"
                            className="p-1.5 text-gray-500 hover:text-warning hover:bg-amber-50 rounded transition disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <Ban className="w-4 h-4" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={!canWrite}
                            onClick={() =>
                              isFieldTypeChanged
                                ? onBlockedReactivate(o)
                                : onReactivate(o)
                            }
                            data-testid={`btn-reactivate-${o.optionValue}`}
                            data-blocked={isFieldTypeChanged ? 'true' : 'false'}
                            title={
                              isFieldTypeChanged
                                ? '此值因類別變更而停用；如需重新啟用請先於 F075 將欄位類別改回 categorical'
                                : '啟用'
                            }
                            className={`p-1.5 text-gray-500 hover:text-success hover:bg-green-50 rounded transition disabled:opacity-30 disabled:cursor-not-allowed ${
                              isFieldTypeChanged ? 'opacity-50' : ''
                            }`}
                          >
                            <RotateCcw className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* per-column 新增按鈕（prototype L436-437） */}
          <button
            type="button"
            data-testid={`btn-add-option-${columnName}`}
            disabled={!canWrite}
            onClick={onAdd}
            className="w-full px-4 py-2.5 border-t border-gray-200 border-dashed text-xs text-primary hover:bg-blue-50/40 transition inline-flex items-center justify-center gap-1.5 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Plus className="w-3.5 h-3.5" />
            新增可選值
          </button>
        </div>
      )}
    </div>
  );
}
