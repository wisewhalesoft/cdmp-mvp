import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Search,
  AlertTriangle,
  Info,
  ChevronsDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import {
  listFields,
  listOptions,
  createOption,
  deactivateOption,
  reactivateOption,
  type PooldataField,
  type PooldataOption,
} from '@/api/pooldata-fields';
import { OptionAccordion } from './option-accordion';
import { getEffectiveIdentity } from '@/stores/auth-store';

/**
 * F050 v2.1 Phase 5d 波 5：OptionsTab（F076 類別型欄位可選值管理）
 *
 * 對應 prototype: /prototypes/37-base-code.html line 242-323 Tab 2
 *
 * 來源：移植自 field-options-page.tsx 之 main content（v1.4.5 accordion 邏輯保留）
 * 容器：由 FieldBasePage 提供 AppLayout + breadcrumb；本 component 只渲染內容
 *
 * Diff vs field-options-page.tsx：
 *   - 移除 AppLayout + headerLeft breadcrumb（由 FieldBasePage 提供）
 *   - F076 商業規則 footer 對齊 prototype L313-319：
 *     - v1.5 新增「caseyear / case_status / prod_kind / spec_tp / settle_src
 *       之可選值統一在此管理（取代 F068 ob_code_df）」
 *   - 沿用 ?col=XX deep link hint（v1.4.5 行為）
 */

const LS_PREFIX = 'cdmp.f076.acc.';

function getAccordionLsKey(col: string): string {
  return `${LS_PREFIX}${col}.expanded`;
}

function safeLsGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeLsSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

function safeLsRemove(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

interface CategoricalFieldWithOptions {
  field: PooldataField;
  options: PooldataOption[];
}

export function OptionsTab() {
  const { showToast } = useToast();
  const [searchParams] = useSearchParams();
  const hintCol = searchParams.get('col') ?? '';
  const identity = getEffectiveIdentity();
  const canWrite = identity === 'admin' || identity === 'director';

  const [items, setItems] = useState<CategoricalFieldWithOptions[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [search, setSearch] = useState('');

  const [expandedMap, setExpandedMap] = useState<Record<string, boolean>>({});

  const [addColumnName, setAddColumnName] = useState<string | null>(null);
  const [newValue, setNewValue] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [deactivateTarget, setDeactivateTarget] = useState<{
    columnName: string;
    option: PooldataOption;
  } | null>(null);
  const [deactivateReason, setDeactivateReason] = useState('');
  const [deactivating, setDeactivating] = useState(false);

  const [, setReactivatingKey] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listFields({ active: 'true' });
      const categoricalFields = (data.fields ?? []).filter(
        (f) => f.fieldType === 'categorical',
      );
      const incInactiveQuery = showInactive ? 'true' : 'false';
      const optionsResults = await Promise.all(
        categoricalFields.map(async (f) => {
          try {
            const r = await listOptions(f.columnName, {
              includeInactive: incInactiveQuery,
            });
            return { field: f, options: r.options ?? [] };
          } catch {
            return { field: f, options: [] as PooldataOption[] };
          }
        }),
      );
      setItems(optionsResults);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e?.response?.data?.message ?? '載入欄位清單失敗');
    } finally {
      setLoading(false);
    }
  }, [showInactive]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    if (items.length === 0) return;
    setExpandedMap((prev) => {
      const next: Record<string, boolean> = { ...prev };
      let changed = false;
      for (const { field } of items) {
        if (next[field.columnName] === undefined) {
          if (hintCol && hintCol === field.columnName) {
            next[field.columnName] = true;
            safeLsSet(getAccordionLsKey(field.columnName), '1');
            changed = true;
            continue;
          }
          if (safeLsGet(getAccordionLsKey(field.columnName)) === '1') {
            next[field.columnName] = true;
            changed = true;
            continue;
          }
          next[field.columnName] = false;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [items, hintCol]);

  const setAccordionExpanded = (col: string, next: boolean) => {
    setExpandedMap((m) => ({ ...m, [col]: next }));
    if (next) safeLsSet(getAccordionLsKey(col), '1');
    else safeLsRemove(getAccordionLsKey(col));
  };

  const expandAll = () => {
    setExpandedMap((m) => {
      const next: Record<string, boolean> = { ...m };
      for (const { field } of items) {
        next[field.columnName] = true;
        safeLsSet(getAccordionLsKey(field.columnName), '1');
      }
      return next;
    });
  };

  const globalStats = useMemo(() => {
    let active = 0;
    let inactive = 0;
    for (const { options } of items) {
      for (const o of options) {
        if (o.isActive) active += 1;
        else inactive += 1;
      }
    }
    return { fields: items.length, active, inactive };
  }, [items]);

  const openAddModal = (columnName: string) => {
    setNewValue('');
    setNewLabel('');
    setCreateError(null);
    setAddColumnName(columnName);
  };

  const handleCreate = async () => {
    if (!addColumnName) return;
    setCreateError(null);
    const valTrim = newValue.trim();
    const labelTrim = newLabel.trim();
    if (!valTrim || !labelTrim) {
      setCreateError('optionValue 與 optionLabel 為必填');
      return;
    }
    setCreating(true);
    try {
      await createOption(addColumnName, {
        optionValue: valTrim,
        optionLabel: labelTrim,
      });
      showToast(`可選值 ${valTrim} 已建立`, 'success');
      setAccordionExpanded(addColumnName, true);
      setAddColumnName(null);
      void fetchAll();
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: { message?: string } } };
      let msg = e?.response?.data?.message ?? '建立失敗';
      if (e?.response?.status === 409) msg = '此 optionValue 已存在';
      setCreateError(msg);
    } finally {
      setCreating(false);
    }
  };

  const handleDeactivate = async () => {
    if (!deactivateTarget) return;
    const reasonTrim = deactivateReason.trim();
    if (!reasonTrim) return;
    setDeactivating(true);
    try {
      await deactivateOption(
        deactivateTarget.columnName,
        deactivateTarget.option.optionValue,
        { isActive: false, reason: reasonTrim },
      );
      showToast(`可選值 ${deactivateTarget.option.optionValue} 已停用`, 'success');
      setDeactivateTarget(null);
      setDeactivateReason('');
      void fetchAll();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      showToast(e?.response?.data?.message ?? '停用失敗', 'error');
    } finally {
      setDeactivating(false);
    }
  };

  const handleReactivate = async (columnName: string, option: PooldataOption) => {
    const key = `${columnName}|${option.optionValue}`;
    setReactivatingKey(key);
    try {
      await reactivateOption(columnName, option.optionValue);
      showToast(`可選值 ${option.optionValue} 已重新啟用`, 'success');
      void fetchAll();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      showToast(e?.response?.data?.message ?? '啟用失敗', 'error');
    } finally {
      setReactivatingKey(null);
    }
  };

  const handleBlockedReactivate = (option: PooldataOption) => {
    showToast(
      `無法直接啟用 ${option.optionValue}：因類別變更而停用。請先於「欄位管理」Tab 將欄位類別改回 categorical`,
      'warning',
    );
  };

  return (
    <div className="p-4 space-y-4">
      {error && (
        <div
          data-testid="options-error"
          className="rounded-lg p-3 bg-red-50 border border-red-200 text-sm text-red-800"
        >
          {error}
        </div>
      )}

      <p className="text-sm text-gray-500">
        管理 F075 篩選欄位中 categorical 型欄位之可選值（F076），供新名單定義表單之多選元件動態載入。
      </p>

      <section className="bg-white rounded-xl border border-gray-200 p-4">
        <div
          data-testid="field-options-toolbar"
          className="flex items-center gap-3 flex-wrap"
        >
          <div className="relative flex-1 max-w-md min-w-[200px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜尋 column_name / value / label..."
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <label className="inline-flex items-center gap-2 cursor-pointer select-none px-3 py-2 border border-gray-200 rounded-md hover:bg-gray-50 text-sm text-gray-700">
            <input
              type="checkbox"
              data-testid="toggle-include-inactive"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-2 focus:ring-primary/20"
            />
            顯示已停用值
          </label>
          <div
            data-testid="option-stats"
            className="ml-auto flex items-center gap-3 text-xs text-gray-500"
          >
            <span>
              欄位{' '}
              <span
                data-testid="stats-fields-count"
                className="font-mono font-medium text-gray-700"
              >
                {globalStats.fields}
              </span>
            </span>
            <span>
              啟用值{' '}
              <span
                data-testid="stats-active-count"
                className="font-mono font-medium text-green-600"
              >
                {globalStats.active}
              </span>
            </span>
            <span>
              停用值{' '}
              <span
                data-testid="stats-inactive-count"
                className="font-mono font-medium text-gray-500"
              >
                {globalStats.inactive}
              </span>
            </span>
          </div>
          <button
            type="button"
            data-testid="btn-expand-all"
            onClick={expandAll}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50"
          >
            <ChevronsDown className="w-3.5 h-3.5" />
            全部展開
          </button>
        </div>
      </section>

      <section className="space-y-3">
        {loading ? (
          <div className="p-12 text-center text-gray-400" data-testid="options-loading">
            載入中...
          </div>
        ) : items.length === 0 ? (
          <div
            data-testid="options-empty"
            className="p-12 flex flex-col items-center text-center bg-white rounded-xl border border-gray-200"
          >
            <p className="text-sm text-gray-500">
              目前沒有 categorical 欄位；請先於「欄位管理」Tab 新增。
            </p>
          </div>
        ) : (
          items.map(({ field, options }) => (
            <OptionAccordion
              key={field.columnName}
              columnName={field.columnName}
              displayName={field.displayName}
              options={options}
              expanded={!!expandedMap[field.columnName]}
              canWrite={canWrite}
              searchKeyword={search}
              showInactive={showInactive}
              onToggle={(next) => setAccordionExpanded(field.columnName, next)}
              onAdd={() => openAddModal(field.columnName)}
              onDeactivate={(opt) => {
                setDeactivateTarget({ columnName: field.columnName, option: opt });
                setDeactivateReason('');
              }}
              onReactivate={(opt) => void handleReactivate(field.columnName, opt)}
              onBlockedReactivate={(opt) => handleBlockedReactivate(opt)}
            />
          ))
        )}
      </section>

      {/*
       * F076 v1.5 商業規則摘要 footer
       * 對齊 prototype 37-base-code.html line 310-320
       */}
      <div
        data-testid="field-options-rules-footer"
        className="rounded-lg p-3 bg-blue-50/50 border border-blue-100 text-xs text-gray-600 flex items-start gap-2"
      >
        <Info className="w-4 h-4 text-primary mt-0.5 shrink-0" />
        <div>
          <p className="font-medium text-gray-700 mb-0.5">F076 v1.5 商業規則摘要</p>
          <ul className="list-disc list-inside space-y-0.5">
            <li>
              <strong>BR-1</strong>：
              <code className="font-mono">(column_name, option_value)</code> 複合唯一鍵；
              違反回 422 <code className="font-mono">OPTION_VALUE_DUPLICATE</code>。
            </li>
            <li>
              <strong>BR-3 / BR-4</strong>：停用「不回溯」既有名單；inactive 值保留供歷史追溯與「上月複製」UI 警示。
            </li>
            <li>
              <strong>v1.5 新增</strong>：caseyear / case_status / prod_kind / spec_tp / settle_src
              之可選值統一在此管理（取代 F068 <code className="font-mono">ob_code_df</code>）。
            </li>
          </ul>
        </div>
      </div>

      {/* ===== Create option modal ===== */}
      {addColumnName !== null && (
        <div className="fixed inset-0 z-50" data-testid="create-option-modal">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => !creating && setAddColumnName(null)}
          />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-base font-semibold text-gray-800">新增可選值</h3>
                <p className="text-xs text-gray-500 mt-0.5 font-mono">
                  欄位 {addColumnName} · POST /api/v1/pooldata-fields/{addColumnName}/options
                </p>
              </div>
              <div className="p-6 space-y-3">
                {createError && (
                  <div
                    data-testid="create-option-error"
                    className="rounded-md p-2.5 bg-red-50 border border-red-200 text-xs text-red-800"
                  >
                    {createError}
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    option_value <span className="text-danger">*</span>
                  </label>
                  <input
                    type="text"
                    data-testid="input-option-value"
                    value={newValue}
                    onChange={(e) => setNewValue(e.target.value)}
                    maxLength={64}
                    placeholder="例：04"
                    className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    option_label <span className="text-danger">*</span>
                  </label>
                  <input
                    type="text"
                    data-testid="input-option-label"
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    maxLength={100}
                    placeholder="例：房屋貸款"
                    className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>
              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setAddColumnName(null)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  取消
                </button>
                <Button
                  type="button"
                  variant="primary"
                  loading={creating}
                  loadingText="建立中..."
                  onClick={handleCreate}
                >
                  建立
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== Deactivate modal ===== */}
      {deactivateTarget && (
        <div className="fixed inset-0 z-50" data-testid="deactivate-modal">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => !deactivating && setDeactivateTarget(null)}
          />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
              <div className="px-6 py-4 border-b border-gray-200 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-danger" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-gray-800">停用可選值</h3>
                  <p className="text-xs text-gray-500 mt-0.5">F076 §5.4 · reason 必填</p>
                </div>
              </div>
              <div className="p-6 space-y-3">
                <p className="text-sm text-gray-700">
                  即將停用欄位{' '}
                  <code className="font-mono text-primary px-1.5 py-0.5 bg-blue-50 rounded text-xs">
                    {deactivateTarget.columnName}
                  </code>{' '}
                  的{' '}
                  <code className="font-mono text-primary px-1.5 py-0.5 bg-blue-50 rounded text-xs">
                    {deactivateTarget.option.optionValue}
                  </code>{' '}
                  （<strong>{deactivateTarget.option.optionLabel}</strong>）
                </p>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    停用原因 <span className="text-danger">*</span>
                  </label>
                  <textarea
                    data-testid="input-deactivate-reason"
                    rows={3}
                    maxLength={200}
                    value={deactivateReason}
                    onChange={(e) => setDeactivateReason(e.target.value)}
                    placeholder="例：與新系統代碼合併"
                    className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <p className="text-[10px] text-gray-400 mt-1">
                    {deactivateReason.length} / 200
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setDeactivateTarget(null)}
                  disabled={deactivating}
                  className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                >
                  取消
                </button>
                <Button
                  type="button"
                  variant="danger"
                  loading={deactivating}
                  loadingText="停用中..."
                  disabled={!deactivateReason.trim()}
                  onClick={handleDeactivate}
                >
                  確認停用
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
