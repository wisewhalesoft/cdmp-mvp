import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  Search,
  AlertTriangle,
  Info,
  ChevronRight,
  ChevronsDown,
} from 'lucide-react';
import { AppLayout } from '@/components/layout/app-layout';
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
import { OptionAccordion } from './_components/option-accordion';
import { getEffectiveIdentity } from '@/stores/auth-store';

/**
 * F076 v1.4.5 — 類別型欄位可選值管理頁
 *
 * 對應 prototype: /prototypes/37b-categorical-field-values.html
 *
 * v1.4.5 prototype 對齊翻新（main content 架構翻新）：
 *   - 從單欄位 detail page 改為多欄位 accordion master page
 *   - 自動載入所有 categorical 欄位（listFields filter categorical）→ Promise.all listOptions
 *   - 每個 accordion 內部底部「新增可選值」按鈕（per-column context）
 *   - 全頁統計：欄位數 / 啟用值總和 / 停用值總和
 *   - 「全部展開」按鈕 + localStorage persist accordion state
 *   - `?col=XX` query 改為可選 hint（自動展開特定 accordion，不再為必填）
 *   - 三種狀態徽章：啟用 / 自動停用（類別變更） / 手動停用
 *   - 自動停用（field_type_changed）啟用攔阻：顯示 warning toast
 *
 * [DEFERRED] archived 欄位（field_type 曾為 categorical 但已切換）暫不實作（方案 C）
 *   - 理由：完全不動 backend；F051 既有 includeInactive=true 已可滿足歷史查詢
 *   - 詳見 F076 spec v1.4.5 §7 [DEFERRED] 區段
 *
 * Deep link: /assignment/whitelist/options?col=COLUMN_NAME（可選 hint）
 *
 * RBAC: DirectorGuard（寫入）— backend 攔截。
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
    /* ignore quota errors */
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

export function FieldOptionsPage() {
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

  // accordion 展開狀態（key = columnName, value = expanded?）
  const [expandedMap, setExpandedMap] = useState<Record<string, boolean>>({});

  // Create option modal state（per-column context）
  const [addColumnName, setAddColumnName] = useState<string | null>(null);
  const [newValue, setNewValue] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // Deactivate modal state（含 columnName context）
  const [deactivateTarget, setDeactivateTarget] = useState<{
    columnName: string;
    option: PooldataOption;
  } | null>(null);
  const [deactivateReason, setDeactivateReason] = useState('');
  const [deactivating, setDeactivating] = useState(false);

  // Reactivate（直接呼叫，無 modal）
  const [, setReactivatingKey] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 取所有 active categorical 欄位
      const data = await listFields({ active: 'true' });
      const categoricalFields = (data.fields ?? []).filter(
        (f) => f.fieldType === 'categorical',
      );

      // 為每個 categorical 欄位平行載入 options
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

  // 載入後依 localStorage + URL hint 初始化展開狀態
  useEffect(() => {
    if (items.length === 0) return;
    setExpandedMap((prev) => {
      const next: Record<string, boolean> = { ...prev };
      let changed = false;
      for (const { field } of items) {
        if (next[field.columnName] === undefined) {
          // 1. URL hint 命中 → 展開
          if (hintCol && hintCol === field.columnName) {
            next[field.columnName] = true;
            safeLsSet(getAccordionLsKey(field.columnName), '1');
            changed = true;
            continue;
          }
          // 2. localStorage 有 → 展開
          if (safeLsGet(getAccordionLsKey(field.columnName)) === '1') {
            next[field.columnName] = true;
            changed = true;
            continue;
          }
          // 3. 預設 collapsed
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

  // 全頁統計
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
      // 保持該 accordion 展開
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
      `無法直接啟用 ${option.optionValue}：因類別變更而停用。請先於 F075 將欄位類別改回 categorical`,
      'warning',
    );
  };

  return (
    <AppLayout
      headerLeft={
        <nav aria-label="麵包屑" className="flex items-center gap-2 text-sm">
          <Link
            to="/assignment/base-codes"
            className="text-gray-500 hover:text-primary transition"
          >
            代碼維護
          </Link>
          <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
          <Link
            to="/assignment/whitelist"
            className="text-gray-500 hover:text-primary transition"
          >
            篩選欄位管理
          </Link>
          <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
          <span className="font-semibold text-gray-800">類別型欄位可選值</span>
        </nav>
      }
    >
      <main className="flex-1 p-6 space-y-4">
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

        {/* ===== 工具列 ===== */}
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

        {/* ===== Accordions container ===== */}
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
                目前沒有 categorical 欄位；請先於 F075 新增。
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
                onReactivate={(opt) =>
                  void handleReactivate(field.columnName, opt)
                }
                onBlockedReactivate={(opt) => handleBlockedReactivate(opt)}
              />
            ))
          )}
        </section>

        {/* ===== Footer：F076 商業規則摘要 ===== */}
        <div
          data-testid="field-options-rules-footer"
          className="rounded-lg p-3 bg-blue-50/50 border border-blue-100 text-xs text-gray-600 flex items-start gap-2"
        >
          <Info className="w-4 h-4 text-primary mt-0.5 shrink-0" />
          <div>
            <p className="font-medium text-gray-700 mb-0.5">
              F076 v1.1 商業規則摘要（含 PO 決議 F076-C）
            </p>
            <ul className="list-disc list-inside space-y-0.5">
              <li>
                <strong>BR-1</strong>：
                <code className="font-mono">(column_name, option_value)</code> 複合唯一鍵，
                新增時不分啟用 / 停用一律檢查重複
                （違反回 422 <code className="font-mono">OPTION_VALUE_DUPLICATE</code>）。
              </li>
              <li>
                <strong>BR-3 / BR-10</strong>：停用「不回溯」既有名單；
                inactive 值保留供歷史追溯，月跑 Stage 1 不阻擋。
              </li>
              <li>
                <strong>BR-7（v1.1）</strong>：F075 將欄位{' '}
                <code className="font-mono">field_type</code> 從 categorical 改為其他類別時，
                本表既有可選值<strong>批次軟停用</strong>（
                <code className="font-mono">is_active = false</code>，
                <code className="font-mono">deactivation_reason = 'field_type_changed'</code>），
                不 CASCADE 刪除。
              </li>
              <li>
                <strong>BR-9</strong>：MVP 不支援可選值排序；
                列表依 <code className="font-mono">option_value</code> 升冪排列。
              </li>
            </ul>
          </div>
        </div>
      </main>

      {/* ===== Create option modal (per-column context) ===== */}
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

      {/* ===== Deactivate modal — reason required ===== */}
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
    </AppLayout>
  );
}
