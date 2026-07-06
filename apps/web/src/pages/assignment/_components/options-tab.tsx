import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Search,
  AlertTriangle,
  Plus,
  Ban,
  RotateCcw,
  List,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import {
  listFields,
  listOptions,
  createOption,
  deactivateOption,
  reactivateOption,
  reorderOptions,
  type PooldataField,
  type PooldataOption,
} from '@/api/pooldata-fields';
import { getEffectiveIdentity } from '@/stores/auth-store';

/**
 * F050 v2.1 Phase 5d 波 5：OptionsTab（F076 類別型欄位可選值管理）
 *
 * 對應 prototype: /prototypes/37-base-code.html L242-323 Tab 2（master-detail 兩欄）
 *
 * 版面（2026-05-20 重構，對齊 prototype）：
 *   - 左 col-span-4：類別型欄位清單（搜尋 + 選中態 highlight + 計數 badge）
 *   - 右 col-span-8：當前欄位 header + 顯示已停用值 toggle + 新增可選值 button + options table
 *   - URL ?col=XX 同步：點選欄位即 push history
 *
 * 三種狀態徽章（prototype L363-371）：
 *   - 啟用：isActive=true
 *   - 自動停用（類別變更）：isActive=false + deactivationReason='field_type_changed'
 *   - 手動停用：isActive=false + 其他 reason
 */

interface CategoricalFieldWithOptions {
  field: PooldataField;
  options: PooldataOption[];
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

export function OptionsTab() {
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const hintCol = searchParams.get('col') ?? '';
  const identity = getEffectiveIdentity();
  const canWrite = identity === 'admin' || identity === 'director';

  const [items, setItems] = useState<CategoricalFieldWithOptions[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [colSearch, setColSearch] = useState('');

  const [selectedCol, setSelectedCol] = useState<string | null>(null);

  const [showAddModal, setShowAddModal] = useState(false);
  const [newValue, setNewValue] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [deactivateTarget, setDeactivateTarget] = useState<PooldataOption | null>(null);
  const [deactivateReason, setDeactivateReason] = useState('');
  const [deactivating, setDeactivating] = useState(false);

  const [reactivatingValue, setReactivatingValue] = useState<string | null>(null);
  const [reordering, setReordering] = useState(false);

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

  // 預設選中第一個欄位（或 ?col= 指定者）
  useEffect(() => {
    if (items.length === 0) {
      if (selectedCol !== null) setSelectedCol(null);
      return;
    }
    const cols = items.map((it) => it.field.columnName);
    if (selectedCol && cols.includes(selectedCol)) return;
    const next = hintCol && cols.includes(hintCol) ? hintCol : cols[0];
    setSelectedCol(next);
  }, [items, hintCol, selectedCol]);

  const filteredCols = useMemo(() => {
    const kw = colSearch.trim().toLowerCase();
    if (!kw) return items;
    return items.filter(
      ({ field }) =>
        field.columnName.toLowerCase().includes(kw) ||
        field.displayName.toLowerCase().includes(kw),
    );
  }, [items, colSearch]);

  const currentItem = useMemo(
    () => items.find((it) => it.field.columnName === selectedCol) ?? null,
    [items, selectedCol],
  );

  const visibleOptions = useMemo(() => {
    if (!currentItem) return [];
    return showInactive
      ? currentItem.options
      : currentItem.options.filter((o) => o.isActive);
  }, [currentItem, showInactive]);

  const selectColumn = (col: string) => {
    setSelectedCol(col);
    const next = new URLSearchParams(searchParams);
    next.set('tab', 'options');
    next.set('col', col);
    setSearchParams(next, { replace: true });
  };

  const openAddModal = () => {
    setNewValue('');
    setNewLabel('');
    setCreateError(null);
    setShowAddModal(true);
  };

  const handleCreate = async () => {
    if (!selectedCol) return;
    setCreateError(null);
    const valTrim = newValue.trim();
    const labelTrim = newLabel.trim();
    if (!valTrim || !labelTrim) {
      setCreateError('顯示名稱與欄位值為必填');
      return;
    }
    setCreating(true);
    try {
      await createOption(selectedCol, {
        optionValue: valTrim,
        optionLabel: labelTrim,
      });
      showToast(`可選值『${labelTrim}』已建立`, 'success');
      setShowAddModal(false);
      void fetchAll();
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: { message?: string } } };
      let msg = e?.response?.data?.message ?? '建立失敗';
      if (e?.response?.status === 409) msg = '此欄位值已存在';
      setCreateError(msg);
    } finally {
      setCreating(false);
    }
  };

  const handleDeactivate = async () => {
    if (!deactivateTarget || !selectedCol) return;
    const reasonTrim = deactivateReason.trim();
    if (!reasonTrim) return;
    setDeactivating(true);
    try {
      await deactivateOption(selectedCol, deactivateTarget.optionValue, {
        isActive: false,
        reason: reasonTrim,
      });
      showToast(`可選值 ${deactivateTarget.optionValue} 已停用`, 'success');
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

  const handleReactivate = async (option: PooldataOption) => {
    if (!selectedCol) return;
    if (option.deactivatedReason === 'field_type_changed') {
      showToast(
        `無法直接啟用 ${option.optionValue}：因類別變更而停用。請先於「欄位管理」Tab 將欄位類別改回 categorical`,
        'warning',
      );
      return;
    }
    setReactivatingValue(option.optionValue);
    try {
      await reactivateOption(selectedCol, option.optionValue);
      showToast(`可選值 ${option.optionValue} 已重新啟用`, 'success');
      void fetchAll();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      showToast(e?.response?.data?.message ?? '啟用失敗', 'error');
    } finally {
      setReactivatingValue(null);
    }
  };

  /**
   * #12 可選值排序：上/下移一位。以完整 options 清單（含停用）為排序基準，
   * 僅在目前可見的相鄰項之間交換位置，套用後之順序即 F050/F051 名單定義多選元件之顯示順序。
   * 樂觀更新本地狀態，失敗則重新載入還原。
   */
  const moveOption = async (optionValue: string, direction: 'up' | 'down') => {
    if (!currentItem || !selectedCol || reordering) return;
    const full = currentItem.options;
    const visibleIndices = full
      .map((o, i) => ({ o, i }))
      .filter(({ o }) => showInactive || o.isActive)
      .map(({ i }) => i);
    const posInVisible = visibleIndices.findIndex(
      (i) => full[i].optionValue === optionValue,
    );
    if (posInVisible < 0) return;
    const targetPos = direction === 'up' ? posInVisible - 1 : posInVisible + 1;
    if (targetPos < 0 || targetPos >= visibleIndices.length) return;

    const a = visibleIndices[posInVisible];
    const b = visibleIndices[targetPos];
    const nextFull = [...full];
    [nextFull[a], nextFull[b]] = [nextFull[b], nextFull[a]];

    // 樂觀更新
    setItems((prev) =>
      prev.map((it) =>
        it.field.columnName === selectedCol ? { ...it, options: nextFull } : it,
      ),
    );
    setReordering(true);
    try {
      await reorderOptions(
        selectedCol,
        nextFull.map((o) => o.optionValue),
      );
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      showToast(e?.response?.data?.message ?? '排序更新失敗', 'error');
      void fetchAll(); // 還原為伺服器狀態
    } finally {
      setReordering(false);
    }
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

      <section
        data-testid="field-options-master-detail"
        className="bg-white rounded-xl border border-gray-200 overflow-hidden"
      >
        {loading ? (
          <div className="p-12 text-center text-gray-400" data-testid="options-loading">
            載入中...
          </div>
        ) : items.length === 0 ? (
          <div
            data-testid="options-empty"
            className="p-12 flex flex-col items-center text-center"
          >
            <p className="text-sm text-gray-500">
              目前沒有 categorical 欄位；請先於「欄位管理」Tab 新增。
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-12 border-t border-gray-200">
            {/* === 左欄：categorical 欄位清單（prototype L263-274） === */}
            <aside
              data-testid="categorical-columns-panel"
              className="col-span-4 border-r border-gray-200 bg-gray-50/40"
            >
              <div className="px-4 py-3 border-b border-gray-200">
                <div className="text-xs font-semibold text-gray-700 mb-1">
                  類別型欄位
                </div>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    data-testid="input-column-search"
                    value={colSearch}
                    onChange={(e) => setColSearch(e.target.value)}
                    placeholder="搜尋欄位..."
                    className="w-full pl-8 pr-2 py-1.5 text-xs border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>
              </div>
              {filteredCols.length === 0 ? (
                <div
                  data-testid="column-list-empty"
                  className="px-4 py-6 text-center text-xs text-gray-400"
                >
                  無符合欄位
                </div>
              ) : (
                <ul className="divide-y divide-gray-200">
                  {filteredCols.map(({ field, options }) => {
                    const isActive = field.columnName === selectedCol;
                    return (
                      <li key={field.columnName}>
                        <button
                          type="button"
                          data-testid={`column-item-${field.columnName}`}
                          data-state={isActive ? 'active' : 'inactive'}
                          onClick={() => selectColumn(field.columnName)}
                          className={`w-full text-left px-4 py-2.5 flex items-center gap-2 border-l-2 transition ${
                            isActive
                              ? 'bg-blue-50 border-primary'
                              : 'hover:bg-gray-50 border-transparent'
                          }`}
                        >
                          <List
                            className={`w-3.5 h-3.5 shrink-0 ${
                              isActive ? 'text-primary' : 'text-gray-400'
                            }`}
                          />
                          <div className="flex-1 min-w-0">
                            <div
                              className={`text-xs truncate ${
                                isActive
                                  ? 'text-primary font-semibold'
                                  : 'text-gray-700'
                              }`}
                            >
                              {field.displayName}
                            </div>
                            <div className="text-[11px] text-gray-400 font-mono truncate">
                              {field.columnName}
                            </div>
                          </div>
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded ${
                              isActive
                                ? 'bg-primary text-white'
                                : 'bg-gray-100 text-gray-500'
                            }`}
                          >
                            {options.length}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </aside>

            {/* === 右欄：detail（prototype L276-307） === */}
            <section data-testid="options-detail-panel" className="col-span-8">
              <div
                data-testid="options-detail-toolbar"
                className="px-5 py-3 border-b border-gray-200 flex items-center gap-3 flex-wrap"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs text-gray-500 shrink-0">當前欄位：</span>
                  <span
                    data-testid="current-column-display"
                    className="text-sm font-semibold text-primary truncate"
                  >
                    {currentItem?.field.displayName ?? '—'}
                  </span>
                  {currentItem && (
                    <code
                      data-testid="current-column-name"
                      className="font-mono text-xs text-gray-400 shrink-0"
                    >
                      （{currentItem.field.columnName}）
                    </code>
                  )}
                </div>
                <label className="ml-auto inline-flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    data-testid="toggle-include-inactive"
                    checked={showInactive}
                    onChange={(e) => setShowInactive(e.target.checked)}
                    className="rounded h-3.5 w-3.5 border-gray-300 text-primary focus:ring-2 focus:ring-primary/20"
                  />
                  顯示已停用值
                </label>
                <button
                  type="button"
                  data-testid="btn-create-option"
                  disabled={!canWrite || !currentItem}
                  onClick={openAddModal}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white text-xs font-medium rounded-md hover:bg-blue-700 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Plus className="w-3.5 h-3.5" />
                  新增可選值
                </button>
              </div>

              {!currentItem ? (
                <div
                  data-testid="options-detail-empty"
                  className="p-12 text-center text-sm text-gray-400"
                >
                  請從左側選擇一個類別型欄位
                </div>
              ) : visibleOptions.length === 0 ? (
                <div
                  data-testid="options-table-empty"
                  className="p-12 text-center text-sm text-gray-400"
                >
                  尚無可選值
                  {!showInactive && '（含已停用值，請勾選上方 toggle 查看）'}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" data-testid="options-table">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50/60">
                        <th className="text-left px-5 py-2.5 font-semibold text-gray-600 w-[28%]">
                          顯示名稱
                        </th>
                        <th className="text-left px-5 py-2.5 font-semibold text-gray-600 w-[16%]">
                          欄位值
                        </th>
                        <th className="text-left px-5 py-2.5 font-semibold text-gray-600 w-[16%]">
                          狀態
                        </th>
                        <th className="text-left px-5 py-2.5 font-semibold text-gray-600 w-[16%]">
                          停用原因
                        </th>
                        <th className="text-right px-5 py-2.5 font-semibold text-gray-600 w-[24%]">
                          操作
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleOptions.map((o, idx) => {
                        const isFieldTypeChanged =
                          !o.isActive && o.deactivatedReason === 'field_type_changed';
                        return (
                          <tr
                            key={o.optionValue}
                            className={`border-b border-gray-200 hover:bg-blue-50/20 ${
                              o.isActive ? '' : 'opacity-70'
                            }`}
                          >
                            <td className="px-5 py-2.5 text-sm text-gray-800">
                              {o.optionLabel}
                            </td>
                            <td className="px-5 py-2.5">
                              <code className="font-mono text-xs text-gray-500">
                                {o.optionValue}
                              </code>
                            </td>
                            <td className="px-5 py-2.5">
                              <StatusBadgeOpt option={o} />
                            </td>
                            <td className="px-5 py-2.5 text-xs text-gray-500">
                              {o.deactivatedReason ? (
                                o.deactivatedReason
                              ) : (
                                <span className="text-gray-300">—</span>
                              )}
                            </td>
                            <td className="px-5 py-2.5 text-right">
                              <div className="inline-flex items-center gap-1">
                                <button
                                  type="button"
                                  data-testid={`btn-move-up-${o.optionValue}`}
                                  disabled={!canWrite || reordering || idx === 0}
                                  onClick={() => void moveOption(o.optionValue, 'up')}
                                  title="上移"
                                  className="p-1 text-gray-400 hover:text-primary hover:bg-blue-50 rounded transition disabled:opacity-30 disabled:cursor-not-allowed"
                                >
                                  <ChevronUp className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  data-testid={`btn-move-down-${o.optionValue}`}
                                  disabled={
                                    !canWrite ||
                                    reordering ||
                                    idx === visibleOptions.length - 1
                                  }
                                  onClick={() => void moveOption(o.optionValue, 'down')}
                                  title="下移"
                                  className="p-1 text-gray-400 hover:text-primary hover:bg-blue-50 rounded transition disabled:opacity-30 disabled:cursor-not-allowed"
                                >
                                  <ChevronDown className="w-4 h-4" />
                                </button>
                                {o.isActive ? (
                                <button
                                  type="button"
                                  disabled={!canWrite}
                                  onClick={() => {
                                    setDeactivateTarget(o);
                                    setDeactivateReason('');
                                  }}
                                  data-testid={`btn-deactivate-${o.optionValue}`}
                                  title="停用"
                                  className="inline-flex items-center gap-1 px-2 py-1 text-[11px] text-warning border border-amber-200 rounded-md hover:bg-amber-50 transition disabled:opacity-30 disabled:cursor-not-allowed"
                                >
                                  <Ban className="w-3 h-3" />
                                  停用
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  disabled={
                                    !canWrite ||
                                    reactivatingValue === o.optionValue
                                  }
                                  onClick={() => void handleReactivate(o)}
                                  data-testid={`btn-reactivate-${o.optionValue}`}
                                  data-blocked={isFieldTypeChanged ? 'true' : 'false'}
                                  title={
                                    isFieldTypeChanged
                                      ? '此值因類別變更而停用；如需重新啟用請先於 F075 將欄位類別改回 categorical'
                                      : '啟用'
                                  }
                                  className={`inline-flex items-center gap-1 px-2 py-1 text-[11px] text-success border border-green-200 rounded-md hover:bg-green-50 transition disabled:opacity-30 disabled:cursor-not-allowed ${
                                    isFieldTypeChanged ? 'opacity-60' : ''
                                  }`}
                                >
                                  <RotateCcw className="w-3 h-3" />
                                  啟用
                                </button>
                              )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        )}
      </section>

      {/* 全域統計（補充資訊，prototype 無但對 UX 有幫助） */}
      {!loading && items.length > 0 && (
        <div
          data-testid="option-stats"
          className="flex items-center gap-3 text-xs text-gray-500 px-1"
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
          <span className="text-gray-300">·</span>
          <span>
            啟用值{' '}
            <span
              data-testid="stats-active-count"
              className="font-mono font-medium text-green-600"
            >
              {globalStats.active}
            </span>
          </span>
          <span className="text-gray-300">/</span>
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
      )}

      {/* ===== Create option modal ===== */}
      {showAddModal && (
        <div className="fixed inset-0 z-50" data-testid="create-option-modal">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => !creating && setShowAddModal(false)}
          />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-base font-semibold text-gray-800">新增可選值</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  欄位：{currentItem?.field.displayName ?? selectedCol}
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
                    顯示名稱 <span className="text-danger">*</span>
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
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    欄位值 <span className="text-danger">*</span>
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
              </div>
              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
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
                  <p className="text-xs text-gray-500 mt-0.5">請填寫停用原因</p>
                </div>
              </div>
              <div className="p-6 space-y-3">
                <p className="text-sm text-gray-700">
                  即將停用欄位{' '}
                  <code className="font-mono text-primary px-1.5 py-0.5 bg-blue-50 rounded text-xs">
                    {selectedCol}
                  </code>{' '}
                  的{' '}
                  <code className="font-mono text-primary px-1.5 py-0.5 bg-blue-50 rounded text-xs">
                    {deactivateTarget.optionValue}
                  </code>{' '}
                  （<strong>{deactivateTarget.optionLabel}</strong>）
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
