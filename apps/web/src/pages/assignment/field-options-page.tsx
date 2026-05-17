import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Plus,
  Search,
  Ban,
  RotateCcw,
  Tags,
  AlertTriangle,
  Info,
} from 'lucide-react';
import { AppLayout } from '@/components/layout/app-layout';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import {
  listOptions,
  createOption,
  deactivateOption,
  reactivateOption,
  type PooldataOption,
} from '@/api/pooldata-fields';
import { getEffectiveIdentity } from '@/stores/auth-store';

/**
 * F076 — 類別型欄位可選值管理頁
 *
 * 對應 prototype: /prototypes/37b-categorical-field-values.html
 *
 * Deep link: /assignment/base-codes/options?col=COLUMN_NAME
 *
 * 功能：
 *   - 列表 active + inactive 可選值（toggle 顯示）
 *   - 新增可選值
 *   - 停用（reason 必填 ≤ 200 字）
 *   - 重新啟用（直接 PATCH）
 *
 * RBAC: DirectorGuard（寫入）— backend 攔截。
 */

export function FieldOptionsPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [searchParams] = useSearchParams();
  const columnName = searchParams.get('col') ?? '';
  const identity = getEffectiveIdentity();
  const canWrite = identity === 'admin' || identity === 'director';

  const [options, setOptions] = useState<PooldataOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [search, setSearch] = useState('');

  // Create option modal state
  const [showCreate, setShowCreate] = useState(false);
  const [newValue, setNewValue] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // Deactivate modal state
  const [deactivateTarget, setDeactivateTarget] = useState<PooldataOption | null>(null);
  const [deactivateReason, setDeactivateReason] = useState('');
  const [deactivating, setDeactivating] = useState(false);

  // Reactivate (no modal — direct call)
  const [reactivatingValue, setReactivatingValue] = useState<string | null>(null);

  const fetchOptions = useCallback(async () => {
    if (!columnName) {
      setError('缺少 col query 參數');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await listOptions(columnName, {
        includeInactive: includeInactive ? 'true' : 'false',
      });
      setOptions(data.options ?? []);
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: { message?: string } } };
      if (e.response?.status === 404) {
        setError(`找不到欄位 ${columnName}`);
      } else {
        setError(e?.response?.data?.message ?? '載入可選值失敗');
      }
    } finally {
      setLoading(false);
    }
  }, [columnName, includeInactive]);

  useEffect(() => {
    void fetchOptions();
  }, [fetchOptions]);

  const filteredOptions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.optionValue.toLowerCase().includes(q) ||
        o.optionLabel.toLowerCase().includes(q),
    );
  }, [options, search]);

  // Phase 4 P3-4：統計列
  const optionStats = useMemo(() => {
    const active = options.filter((o) => o.isActive).length;
    return {
      total: options.length,
      active,
      inactive: options.length - active,
    };
  }, [options]);

  const handleCreate = async () => {
    setCreateError(null);
    const valTrim = newValue.trim();
    const labelTrim = newLabel.trim();
    if (!valTrim || !labelTrim) {
      setCreateError('optionValue 與 optionLabel 為必填');
      return;
    }
    setCreating(true);
    try {
      await createOption(columnName, { optionValue: valTrim, optionLabel: labelTrim });
      showToast(`可選值 ${valTrim} 已建立`, 'success');
      setShowCreate(false);
      setNewValue('');
      setNewLabel('');
      void fetchOptions();
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
      await deactivateOption(columnName, deactivateTarget.optionValue, {
        isActive: false,
        reason: reasonTrim,
      });
      showToast(`可選值 ${deactivateTarget.optionValue} 已停用`, 'success');
      setDeactivateTarget(null);
      setDeactivateReason('');
      void fetchOptions();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      showToast(e?.response?.data?.message ?? '停用失敗', 'error');
    } finally {
      setDeactivating(false);
    }
  };

  const handleReactivate = async (option: PooldataOption) => {
    setReactivatingValue(option.optionValue);
    try {
      await reactivateOption(columnName, option.optionValue);
      showToast(`可選值 ${option.optionValue} 已重新啟用`, 'success');
      void fetchOptions();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      showToast(e?.response?.data?.message ?? '啟用失敗', 'error');
    } finally {
      setReactivatingValue(null);
    }
  };

  return (
    <AppLayout
      headerLeft={
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/assignment/whitelist')}
            className="text-gray-400 hover:text-gray-700"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-base font-semibold text-gray-800">
            可選值管理
          </h1>
          {columnName && (
            <code className="font-mono text-primary text-sm px-2 py-0.5 bg-blue-50 rounded">
              {columnName}
            </code>
          )}
        </div>
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

        <div className="flex items-center justify-between flex-wrap gap-2">
          <p className="text-sm text-gray-500">
            管理欄位 <code className="font-mono text-primary">{columnName}</code> 之可選值（F076）
          </p>
          <Button
            type="button"
            variant="primary"
            data-testid="btn-create-option"
            disabled={!canWrite}
            onClick={() => {
              setNewValue('');
              setNewLabel('');
              setCreateError(null);
              setShowCreate(true);
            }}
          >
            <span className="inline-flex items-center gap-1.5">
              <Plus className="w-4 h-4" />
              新增可選值
            </span>
          </Button>
        </div>

        <section className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜尋 value / label"
                className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                data-testid="toggle-include-inactive"
                checked={includeInactive}
                onChange={(e) => setIncludeInactive(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-2 focus:ring-primary/20"
              />
              <span className="text-sm text-gray-700">顯示已停用</span>
            </label>
            {/* Phase 4 P3-4：統計列 */}
            <div
              data-testid="option-stats"
              className="ml-auto text-xs text-gray-500"
            >
              總計 <span className="font-mono font-medium text-gray-700">{optionStats.total}</span> 筆
              <span className="mx-1 text-gray-300">·</span>
              啟用 <span className="font-mono font-medium text-green-600">{optionStats.active}</span>
              <span className="mx-1 text-gray-300">/</span>
              停用 <span className="font-mono font-medium text-gray-500">{optionStats.inactive}</span>
            </div>
          </div>
        </section>

        <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-gray-400" data-testid="options-loading">
              載入中...
            </div>
          ) : filteredOptions.length === 0 ? (
            <div
              className="p-12 flex flex-col items-center text-center"
              data-testid="options-empty"
            >
              <Tags className="w-8 h-8 text-gray-400 mb-2" />
              <p className="text-sm text-gray-500">尚無可選值</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase">
                  <tr>
                    <th className="text-left px-5 py-3 font-semibold w-[25%]">option_value</th>
                    <th className="text-left px-5 py-3 font-semibold w-[28%]">option_label</th>
                    <th className="text-left px-5 py-3 font-semibold w-[10%]">狀態</th>
                    <th className="text-left px-5 py-3 font-semibold w-[20%]">停用原因</th>
                    <th className="text-right px-5 py-3 font-semibold w-[17%]">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredOptions.map((o) => (
                    <tr key={o.optionValue} className="hover:bg-gray-50/50">
                      <td className="px-5 py-3 font-mono text-primary">
                        {o.optionValue}
                      </td>
                      <td className="px-5 py-3 text-gray-900">{o.optionLabel}</td>
                      <td className="px-5 py-3">
                        {o.isActive ? (
                          <span className="inline-flex px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-700">
                            啟用中
                          </span>
                        ) : (
                          <span className="inline-flex px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-600">
                            已停用
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-xs text-gray-500">
                        {o.deactivatedReason ?? '—'}
                      </td>
                      <td className="px-5 py-3 text-right">
                        {o.isActive ? (
                          <button
                            type="button"
                            disabled={!canWrite}
                            onClick={() => {
                              setDeactivateTarget(o);
                              setDeactivateReason('');
                            }}
                            data-testid={`btn-deactivate-${o.optionValue}`}
                            className="inline-flex items-center gap-1 text-xs text-danger hover:bg-red-50 px-2 py-1 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <Ban className="w-3.5 h-3.5" />
                            停用
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={!canWrite || reactivatingValue === o.optionValue}
                            onClick={() => void handleReactivate(o)}
                            data-testid={`btn-reactivate-${o.optionValue}`}
                            className="inline-flex items-center gap-1 text-xs text-primary hover:bg-blue-50 px-2 py-1 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            重新啟用
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Phase 4 P3-4：F076 商業規則摘要 footer */}
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

      {/* Create option modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50" data-testid="create-option-modal">
          <div className="absolute inset-0 bg-black/50" onClick={() => !creating && setShowCreate(false)} />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-base font-semibold text-gray-800">新增可選值</h3>
                <p className="text-xs text-gray-500 mt-0.5">F076 §5.2 · 欄位 {columnName}</p>
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
                    placeholder="例：M3"
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
                    placeholder="例：第三類卡別"
                    className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>
              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
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

      {/* Deactivate modal — reason required */}
      {deactivateTarget && (
        <div className="fixed inset-0 z-50" data-testid="deactivate-modal">
          <div className="absolute inset-0 bg-black/50" onClick={() => !deactivating && setDeactivateTarget(null)} />
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
                  即將停用{' '}
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
    </AppLayout>
  );
}
