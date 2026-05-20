import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Plus,
  Search,
  Ban,
  ListChecks,
  Hash,
  Calendar,
  Tags,
  Info,
  ChevronDown,
  Sparkles,
  UserCheck,
  Inbox,
  SearchX,
  Loader2,
  Pencil,
  RotateCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import {
  listFields,
  listAvailableColumns,
  createField,
  updateField,
  disableField as apiDisableField,
  getActiveOptionsCount,
  type FieldType,
  type PooldataField,
  type AvailableColumn,
} from '@/api/pooldata-fields';
import { CategorySwitchConfirmModal } from './category-switch-confirm-modal';
import { EditFieldModal } from './edit-field-modal';
import { ConfirmModal } from '@/components/e07/ConfirmModal';
import { getEffectiveIdentity } from '@/stores/auth-store';

/**
 * F050 v2.1 Phase 5d 波 4：FieldsTab（F075 欄位管理）
 *
 * 對應 prototype: /prototypes/37-base-code.html line 166-240 Tab 1
 *
 * 來源：移植自 field-whitelist-page.tsx 之 main content（v1.4.7 完整邏輯保留）
 * 容器：由 FieldBasePage 提供 AppLayout + breadcrumb；本 component 只渲染內容
 *
 * Diff vs field-whitelist-page.tsx：
 *   - 移除 AppLayout + headerLeft breadcrumb（由 FieldBasePage 提供）
 *   - 移除「管理可選值」navigate 之 `/assignment/whitelist/options?col=...`
 *     改為 navigate(`/assignment/field-base?tab=options&col=...`)（V2.1 新路由）
 *   - F075 商業規則 footer 補 **BR-8（v1.5）**：list_period_* 為一級保留欄位（J8 / prototype L234）
 *   - 保留所有既有 testid（field-whitelist-toolbar / btn-create-field / 等）
 */

const FIELD_TYPE_CONFIG: Record<
  FieldType,
  { label: string; icon: typeof Tags; bg: string; text: string }
> = {
  categorical: {
    label: '類別',
    icon: Tags,
    bg: 'bg-blue-100',
    text: 'text-blue-700',
  },
  numeric: {
    label: '數值',
    icon: Hash,
    bg: 'bg-purple-100',
    text: 'text-purple-700',
  },
  date: {
    label: '日期',
    icon: Calendar,
    bg: 'bg-emerald-100',
    text: 'text-emerald-700',
  },
};

function FieldTypeBadge({ type }: { type: FieldType }) {
  const cfg = FIELD_TYPE_CONFIG[type];
  const Icon = cfg.icon;
  return (
    <span
      data-testid={`field-type-${type}`}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}
    >
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  );
}

export function FieldsTab() {
  const { showToast } = useToast();
  const identity = getEffectiveIdentity();
  const canWrite = identity === 'admin' || identity === 'director';

  const [fields, setFields] = useState<PooldataField[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | FieldType>('all');

  // Create modal state
  const [showCreate, setShowCreate] = useState(false);
  const [newDisplay, setNewDisplay] = useState('');
  const [newType, setNewType] = useState<FieldType>('categorical');
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [availableColumns, setAvailableColumns] = useState<AvailableColumn[]>([]);
  const [availableLoading, setAvailableLoading] = useState(false);
  type AvailableColumnsError =
    | { kind: 'not_ready'; message: string }
    | { kind: 'feature_disabled'; message: string }
    | { kind: 'generic_error'; message: string };
  const [availableColumnsError, setAvailableColumnsError] =
    useState<AvailableColumnsError | null>(null);
  const [selectedColumnMeta, setSelectedColumnMeta] = useState<AvailableColumn | null>(null);
  const [hasUserOverridden, setHasUserOverridden] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [dropdownSearch, setDropdownSearch] = useState('');
  const [showAutofilledHint, setShowAutofilledHint] = useState(false);

  const [disableTarget, setDisableTarget] = useState<PooldataField | null>(null);
  const [disableActiveCount, setDisableActiveCount] = useState<number | null>(null);
  const [disableLoading, setDisableLoading] = useState(false);
  const [simpleConfirmTarget, setSimpleConfirmTarget] = useState<PooldataField | null>(null);

  const [editTarget, setEditTarget] = useState<PooldataField | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [pendingEditPayload, setPendingEditPayload] = useState<{
    columnName: string;
    displayName: string;
    fieldType: FieldType;
    activeCount: number;
  } | null>(null);

  const [reactivatingColumn, setReactivatingColumn] = useState<string | null>(null);

  const fetchFields = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const queryActive =
        activeFilter === 'active' ? 'true' : activeFilter === 'inactive' ? 'false' : undefined;
      const data = await listFields(queryActive ? { active: queryActive } : {});
      setFields(data.fields ?? []);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e?.response?.data?.message ?? '載入欄位清單失敗');
    } finally {
      setLoading(false);
    }
  }, [activeFilter]);

  useEffect(() => {
    void fetchFields();
  }, [fetchFields]);

  const filteredFields = useMemo(() => {
    let list = fields;
    if (typeFilter !== 'all') {
      list = list.filter((f) => f.fieldType === typeFilter);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (f) =>
          f.columnName.toLowerCase().includes(q) || f.displayName.toLowerCase().includes(q),
      );
    }
    return list;
  }, [fields, search, typeFilter]);

  const fieldStats = useMemo(() => {
    const active = fields.filter((f) => f.isActive).length;
    return {
      total: fields.length,
      active,
      inactive: fields.length - active,
    };
  }, [fields]);

  const resetCreateForm = () => {
    setNewDisplay('');
    setNewType('categorical');
    setCreateError(null);
    setSelectedColumnMeta(null);
    setHasUserOverridden(false);
    setDropdownOpen(false);
    setDropdownSearch('');
    setAvailableColumns([]);
    setAvailableColumnsError(null);
    setShowAutofilledHint(false);
  };

  const autoFillDisplayNameFromColumn = (meta: AvailableColumn | null) => {
    if (!meta) return;
    if (newDisplay.trim().length > 0) return;
    if (!meta.columnDescription) return;
    setNewDisplay(meta.columnDescription);
    setShowAutofilledHint(true);
  };

  const loadAvailableColumns = async () => {
    setAvailableLoading(true);
    setAvailableColumnsError(null);
    try {
      const res = await listAvailableColumns();
      setAvailableColumns(res.availableColumns ?? []);
    } catch (err: unknown) {
      const e = err as {
        response?: { status?: number; data?: { error?: string; message?: string } };
      };
      const code = e?.response?.data?.error;
      if (code === 'OBPOOLDATA_NOT_READY') {
        setAvailableColumnsError({
          kind: 'not_ready',
          message: 'OBPOOLDATA 資料尚未由 ETL 同步至本系統，請聯繫系統管理員確認 ETL 狀態',
        });
      } else if (code === 'FEATURE_NOT_ENABLED') {
        setAvailableColumnsError({
          kind: 'feature_disabled',
          message: 'F075 功能尚未啟用',
        });
      } else {
        setAvailableColumnsError({
          kind: 'generic_error',
          message: '載入欄位清單失敗,請稍後重試',
        });
      }
      setAvailableColumns([]);
    } finally {
      setAvailableLoading(false);
    }
  };

  const openCreateModal = async () => {
    resetCreateForm();
    setShowCreate(true);
    await loadAvailableColumns();
  };

  const onColumnSelected = (col: AvailableColumn) => {
    setSelectedColumnMeta(col);
    setNewType(col.suggestedFieldType);
    setHasUserOverridden(false);
    setDropdownOpen(false);
    setDropdownSearch('');
    setCreateError(null);
    autoFillDisplayNameFromColumn(col);
  };

  const onFieldTypeChange = (t: FieldType) => {
    setNewType(t);
    setHasUserOverridden(true);
  };

  const filteredAvailableColumns = useMemo(() => {
    const q = dropdownSearch.trim().toLowerCase();
    if (!q) return availableColumns;
    return availableColumns.filter((c) => c.columnName.toLowerCase().includes(q));
  }, [availableColumns, dropdownSearch]);

  const handleCreate = async () => {
    setCreateError(null);
    if (!selectedColumnMeta) {
      setCreateError('請於下拉選單選擇欄位');
      return;
    }
    const dispTrim = newDisplay.trim();
    if (!dispTrim) {
      setCreateError('displayName 為必填');
      return;
    }
    setCreating(true);
    try {
      const result = await createField({
        columnName: selectedColumnMeta.columnName,
        displayName: dispTrim,
        fieldType: newType,
      });
      const displayForToast = result?.displayName ?? dispTrim;
      showToast(`欄位『${displayForToast}』已新增`, 'success');
      setShowCreate(false);
      resetCreateForm();
      void fetchFields();
    } catch (err: unknown) {
      const e = err as {
        response?: { status?: number; data?: { error?: string; message?: string } };
      };
      const status = e?.response?.status;
      let msg = e?.response?.data?.message ?? '建立失敗';
      if (status === 409) msg = e?.response?.data?.message ?? '此 columnName 已存在';
      setCreateError(msg);
    } finally {
      setCreating(false);
    }
  };

  const startDisable = async (field: PooldataField) => {
    if (field.fieldType === 'categorical') {
      try {
        const res = await getActiveOptionsCount(field.columnName);
        setDisableActiveCount(res.activeCount);
      } catch {
        setDisableActiveCount(0);
      }
      setDisableTarget(field);
    } else {
      setSimpleConfirmTarget(field);
    }
  };

  const doDisable = async (field: PooldataField) => {
    setDisableLoading(true);
    try {
      await apiDisableField(field.columnName);
      showToast(`欄位『${field.displayName}』已停用`, 'success');
      setDisableTarget(null);
      setSimpleConfirmTarget(null);
      setDisableActiveCount(null);
      void fetchFields();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      showToast(e?.response?.data?.message ?? '停用失敗', 'error');
    } finally {
      setDisableLoading(false);
    }
  };

  const startEdit = (field: PooldataField) => {
    setEditError(null);
    setPendingEditPayload(null);
    setEditTarget(field);
  };

  const applyEditPatch = async (
    columnName: string,
    body: { displayName?: string; fieldType?: FieldType },
    originalDisplayName: string,
  ) => {
    setEditSubmitting(true);
    try {
      const updated = await updateField(columnName, body);
      const toastDisplay = updated?.displayName ?? body.displayName ?? originalDisplayName;
      showToast(`欄位『${toastDisplay}』已編輯`, 'success');
      setEditTarget(null);
      setPendingEditPayload(null);
      void fetchFields();
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: { message?: string } } };
      setEditError(e?.response?.data?.message ?? '編輯失敗');
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleEditSubmit = async (payload: { displayName: string; fieldType: FieldType }) => {
    if (!editTarget) return;
    setEditError(null);
    const isCascading =
      editTarget.fieldType === 'categorical' && payload.fieldType !== 'categorical';
    if (isCascading) {
      let activeCount = 0;
      try {
        const res = await getActiveOptionsCount(editTarget.columnName);
        activeCount = res.activeCount;
      } catch {
        activeCount = 0;
      }
      setPendingEditPayload({
        columnName: editTarget.columnName,
        displayName: payload.displayName,
        fieldType: payload.fieldType,
        activeCount,
      });
      return;
    }
    await applyEditPatch(
      editTarget.columnName,
      { displayName: payload.displayName, fieldType: payload.fieldType },
      editTarget.displayName,
    );
  };

  const confirmCascadingEdit = async () => {
    if (!pendingEditPayload || !editTarget) return;
    await applyEditPatch(
      pendingEditPayload.columnName,
      {
        displayName: pendingEditPayload.displayName,
        fieldType: pendingEditPayload.fieldType,
      },
      editTarget.displayName,
    );
  };

  const handleReactivate = async (field: PooldataField) => {
    setReactivatingColumn(field.columnName);
    try {
      const updated = await updateField(field.columnName, { isActive: true });
      const toastDisplay = updated?.displayName ?? field.displayName;
      showToast(`欄位『${toastDisplay}』已啟用`, 'success');
      void fetchFields();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      showToast(e?.response?.data?.message ?? '啟用失敗', 'error');
    } finally {
      setReactivatingColumn(null);
    }
  };

  const clearFilters = () => {
    setSearch('');
    setTypeFilter('all');
    setActiveFilter('all');
  };

  const submitDisabled =
    availableLoading ||
    availableColumns.length === 0 ||
    !selectedColumnMeta ||
    !newDisplay.trim() ||
    creating;

  // 切換到 OptionsTab 並指定欄位（取代既有 /assignment/whitelist/options?col=...）
  const navigateToOptions = (columnName: string) => {
    const params = new URLSearchParams({ tab: 'options', col: columnName });
    window.history.pushState({}, '', `/assignment/field-base?${params.toString()}`);
    // 觸發 React Router 重新讀取 search params（dispatch popstate event）
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  return (
    <div className="p-4 space-y-4">
      <p className="text-sm text-gray-500">
        管理 OBPOOLDATA 表可用的篩選欄位清單（F075）。類別型欄位可進一步管理可選值（F076）。
      </p>

      {error && (
        <div
          data-testid="fields-error"
          className="rounded-lg p-3 bg-red-50 border border-red-200 text-sm text-red-800"
        >
          {error}
        </div>
      )}

      {/* 工具列 */}
      <section className="bg-white rounded-xl border border-gray-200 p-4">
        <div
          data-testid="field-whitelist-toolbar"
          className="flex items-center gap-3 flex-wrap"
        >
          <div className="relative flex-1 max-w-md min-w-[200px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜尋 columnName / displayName"
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <select
            data-testid="filter-type"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as 'all' | FieldType)}
            className="px-3 py-2 border border-gray-200 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="all">類別：全部</option>
            <option value="categorical">categorical（類別型）</option>
            <option value="numeric">numeric（數值型）</option>
            <option value="date">date（日期型）</option>
          </select>
          <select
            data-testid="filter-active"
            value={activeFilter}
            onChange={(e) =>
              setActiveFilter(e.target.value as 'all' | 'active' | 'inactive')
            }
            className="px-3 py-2 border border-gray-200 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="all">狀態：全部</option>
            <option value="active">僅顯示啟用</option>
            <option value="inactive">僅顯示停用</option>
          </select>
          <button
            type="button"
            data-testid="btn-clear-filters"
            onClick={clearFilters}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            清除
          </button>
          <div data-testid="field-stats" className="ml-auto text-xs text-gray-500">
            總計 <span className="font-mono font-medium text-gray-700">{fieldStats.total}</span> 筆
            <span className="mx-1 text-gray-300">·</span>
            啟用 <span className="font-mono font-medium text-green-600">{fieldStats.active}</span>
            <span className="mx-1 text-gray-300">/</span>
            停用 <span className="font-mono font-medium text-gray-500">{fieldStats.inactive}</span>
          </div>
          <Button
            type="button"
            variant="primary"
            data-testid="btn-create-field"
            disabled={!canWrite}
            onClick={() => {
              void openCreateModal();
            }}
          >
            <span className="inline-flex items-center gap-1.5">
              <Plus className="w-4 h-4" />
              新增篩選欄位
            </span>
          </Button>
        </div>
      </section>

      <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-400" data-testid="fields-loading">
            載入中...
          </div>
        ) : filteredFields.length === 0 ? (
          <div
            className="p-12 flex flex-col items-center text-center"
            data-testid="fields-empty"
          >
            <ListChecks className="w-8 h-8 text-gray-400 mb-2" />
            <p className="text-sm text-gray-500">無符合條件之欄位</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase">
                <tr>
                  <th className="text-left px-5 py-3 font-semibold w-[20%]">columnName</th>
                  <th className="text-left px-5 py-3 font-semibold w-[22%]">displayName</th>
                  <th className="text-left px-5 py-3 font-semibold w-[12%]">fieldType</th>
                  <th className="text-left px-5 py-3 font-semibold w-[10%]">狀態</th>
                  <th className="text-left px-5 py-3 font-semibold w-[14%]">建立時間</th>
                  <th className="text-right px-5 py-3 font-semibold w-[22%]">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredFields.map((f) => (
                  <tr
                    key={f.columnName}
                    className={`hover:bg-gray-50/50 ${!f.isActive ? 'bg-gray-50/30 opacity-80' : ''}`}
                  >
                    <td className="px-5 py-3 font-mono text-primary">{f.columnName}</td>
                    <td className="px-5 py-3 text-gray-900">{f.displayName}</td>
                    <td className="px-5 py-3">
                      <FieldTypeBadge type={f.fieldType} />
                    </td>
                    <td className="px-5 py-3">
                      {f.isActive ? (
                        <span className="inline-flex px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-700">
                          啟用
                        </span>
                      ) : (
                        <span className="inline-flex px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-600">
                          停用
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-gray-500 text-xs font-mono">
                      {(f.createdAt ?? '').slice(0, 10)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        {f.fieldType === 'categorical' && (
                          <button
                            type="button"
                            data-testid={`btn-options-${f.columnName}`}
                            title="管理可選值"
                            onClick={() => navigateToOptions(f.columnName)}
                            className="p-1.5 text-gray-500 hover:text-primary hover:bg-blue-50 rounded transition"
                          >
                            <ListChecks className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={!canWrite}
                          onClick={() => startEdit(f)}
                          data-testid={`btn-edit-${f.columnName}`}
                          title="編輯"
                          className="p-1.5 text-gray-500 hover:text-primary hover:bg-blue-50 rounded transition disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        {f.isActive ? (
                          <button
                            type="button"
                            disabled={!canWrite}
                            onClick={() => void startDisable(f)}
                            data-testid={`btn-disable-${f.columnName}`}
                            title="停用"
                            className="p-1.5 text-gray-500 hover:text-[#F59E0B] hover:bg-amber-50 rounded transition disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <Ban className="w-4 h-4" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={!canWrite || reactivatingColumn === f.columnName}
                            onClick={() => void handleReactivate(f)}
                            data-testid={`btn-reactivate-${f.columnName}`}
                            title="啟用"
                            className="p-1.5 text-gray-500 hover:text-[#22C55E] hover:bg-green-50 rounded transition disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <RotateCcw className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/*
       * F075 v1.5 商業規則摘要 footer
       * 對齊 prototype 37-base-code.html line 226-237
       * BR-1 / BR-3 / BR-4 沿用 v1.4；BR-8 為 v1.5 新增（list_period_* 為一級保留欄位 J8）
       */}
      <div
        data-testid="field-whitelist-rules-footer"
        className="rounded-lg p-3 bg-blue-50/50 border border-blue-100 text-xs text-gray-600 flex items-start gap-2"
      >
        <Info className="w-4 h-4 text-primary mt-0.5 shrink-0" />
        <div>
          <p className="font-medium text-gray-700 mb-0.5">F075 v1.5 商業規則摘要</p>
          <ul className="list-disc list-inside space-y-0.5">
            <li>
              <strong>BR-1</strong>：<code className="font-mono">column_name</code> 為唯一鍵，
              新增時不分啟用 / 停用一律檢查重複
              （違反回 409 <code className="font-mono">POOLDATA_FIELD_DUPLICATE</code>）。
            </li>
            <li>
              <strong>BR-3</strong>：停用「不回溯」既有名單條件，F050/F051 寫入時驗證
              <code className="font-mono"> is_active = true</code>；F048 列表頁讀取既有名單時不阻擋。
            </li>
            <li>
              <strong>BR-4</strong>：<code className="font-mono">field_type</code> 由 categorical 改為其他類別時，
              <strong>不自動刪除</strong> F076 既有可選值
              （軟停用，<code className="font-mono">deactivation_reason = 'field_type_changed'</code>）。
            </li>
            <li>
              <strong>BR-8（v1.5）</strong>：
              <code className="font-mono">list_period_start</code> /{' '}
              <code className="font-mono">list_period_end</code> /{' '}
              <code className="font-mono">list_interval</code> 為一級保留欄位，
              禁止入白名單（J8）。
            </li>
          </ul>
        </div>
      </div>

      {/* ===== Create field modal ===== */}
      {showCreate && (
        <div className="fixed inset-0 z-50" data-testid="create-field-modal">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => !creating && setShowCreate(false)}
          />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-base font-semibold text-gray-800">新增篩選欄位</h3>
                <p className="text-xs text-gray-500 mt-0.5">POST /api/v1/pooldata-fields</p>
              </div>
              <div className="p-6 space-y-4">
                {createError && (
                  <div
                    data-testid="create-error"
                    className="rounded-md p-2.5 bg-red-50 border border-red-200 text-xs text-red-800"
                  >
                    {createError}
                  </div>
                )}

                <div data-testid="field-column-name-section">
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    columnName <span className="text-danger">*</span>
                  </label>
                  <div className="relative">
                    <button
                      type="button"
                      data-testid="dropdown-column-name-trigger"
                      aria-haspopup="listbox"
                      aria-expanded={dropdownOpen}
                      data-state={dropdownOpen ? 'open' : 'closed'}
                      onClick={() => setDropdownOpen((v) => !v)}
                      className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-left"
                    >
                      <span
                        className={`font-mono ${
                          selectedColumnMeta ? 'text-gray-800' : 'text-gray-400'
                        }`}
                      >
                        {selectedColumnMeta?.columnName ?? '請選擇欄位…'}
                      </span>
                      <ChevronDown
                        className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${
                          dropdownOpen ? 'rotate-180' : ''
                        }`}
                      />
                    </button>

                    {dropdownOpen && (
                      <div
                        data-testid="dropdown-column-name-panel"
                        className="absolute left-0 right-0 top-[calc(100%+4px)] z-10 bg-white border border-gray-200 rounded-lg shadow-lg max-h-72 overflow-hidden flex flex-col"
                      >
                        <div className="p-2 border-b border-gray-200">
                          <div className="relative">
                            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                            <input
                              type="text"
                              data-testid="dropdown-column-name-search"
                              value={dropdownSearch}
                              onChange={(e) => setDropdownSearch(e.target.value)}
                              placeholder="搜尋 columnName…"
                              className="w-full pl-7 pr-2 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary font-mono"
                            />
                          </div>
                        </div>

                        {availableLoading ? (
                          <div className="px-3 py-6 text-center text-xs text-gray-400">
                            <Loader2 className="w-4 h-4 inline-block animate-spin" />
                            <span className="ml-1.5">載入欄位清單中…</span>
                          </div>
                        ) : availableColumnsError !== null ? (
                          <div
                            data-testid="available-columns-error"
                            data-error-kind={availableColumnsError.kind}
                            className="px-3 py-6 text-center space-y-2"
                          >
                            <p className="text-xs text-red-700 leading-relaxed">
                              {availableColumnsError.message}
                            </p>
                            <button
                              type="button"
                              data-testid="available-columns-retry"
                              onClick={() => void loadAvailableColumns()}
                              className="text-xs text-primary hover:underline"
                            >
                              重試
                            </button>
                          </div>
                        ) : availableColumns.length === 0 ? (
                          <div
                            data-testid="dropdown-column-name-empty"
                            className="px-3 py-8 text-center"
                          >
                            <Inbox className="w-6 h-6 text-gray-300 mx-auto" />
                            <p className="mt-2 text-xs text-gray-500">
                              OBPOOLDATA 所有欄位皆已列入篩選欄位清單
                            </p>
                            <p className="mt-0.5 text-[11px] text-gray-400">
                              如需新增，請先於 ETL 端確認 OBPOOLDATA 是否有新欄位
                            </p>
                          </div>
                        ) : filteredAvailableColumns.length === 0 ? (
                          <div className="px-3 py-8 text-center text-xs text-gray-400">
                            <SearchX className="w-5 h-5 text-gray-300 mx-auto mb-1" />
                            <span>無符合搜尋關鍵字的欄位</span>
                          </div>
                        ) : (
                          <ul role="listbox" className="flex-1 overflow-y-auto py-1">
                            {filteredAvailableColumns.map((col) => (
                              <li
                                key={col.columnName}
                                role="option"
                                aria-selected={
                                  selectedColumnMeta?.columnName === col.columnName
                                }
                                data-testid={`dropdown-option-${col.columnName}`}
                                onClick={() => onColumnSelected(col)}
                                className="px-3 py-1.5 text-sm hover:bg-blue-50 cursor-pointer flex items-center justify-between gap-2"
                              >
                                <span className="font-mono text-gray-800">
                                  {col.columnName}
                                </span>
                                <span className="text-[10px] text-gray-400 font-mono">
                                  {col.dataType}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    自 OBPOOLDATA 既有但尚未加入清單之欄位中選擇；停用欄位亦不會出現（防繞過唯一性檢查）
                  </p>
                </div>

                {selectedColumnMeta && (
                  <div
                    data-testid="field-type-hint"
                    data-state={hasUserOverridden ? 'user-overridden' : 'suggested'}
                  >
                    {!hasUserOverridden ? (
                      <div
                        data-hint-variant="suggested"
                        className="flex items-start gap-2 px-3 py-2 rounded-lg bg-blue-50 border border-blue-100 text-xs"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                        <span className="text-gray-700 leading-relaxed">
                          <span className="font-semibold text-primary">系統推斷：</span>
                          <code className="font-mono text-primary font-semibold">
                            {selectedColumnMeta.suggestedFieldType}
                          </code>
                          <span className="text-gray-500">（依 dataType=</span>
                          <code className="font-mono text-gray-600">
                            {selectedColumnMeta.dataType}
                          </code>
                          <span className="text-gray-500">）；請確認是否正確</span>
                        </span>
                      </div>
                    ) : (
                      <div
                        data-hint-variant="user-overridden"
                        className="flex items-start gap-2 px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-xs"
                      >
                        <UserCheck className="w-3.5 h-3.5 text-gray-500 mt-0.5 shrink-0" />
                        <span className="text-gray-600 leading-relaxed">
                          <span className="font-semibold text-gray-700">使用者選擇</span>
                          <span className="text-gray-400">（系統原推斷 </span>
                          <code className="font-mono text-gray-500">
                            {selectedColumnMeta.suggestedFieldType}
                          </code>
                          <span className="text-gray-400">）</span>
                        </span>
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    fieldType <span className="text-danger">*</span>
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['categorical', 'numeric', 'date'] as const).map((t) => (
                      <label
                        key={t}
                        className={`flex items-center gap-2 p-2.5 border rounded-md cursor-pointer ${
                          newType === t
                            ? 'border-primary bg-blue-50/40'
                            : 'border-gray-200 hover:bg-gray-50'
                        }`}
                      >
                        <input
                          type="radio"
                          name="fieldType"
                          value={t}
                          data-testid={`field-type-radio-${t}`}
                          checked={newType === t}
                          onChange={() => onFieldTypeChange(t)}
                          className="text-primary"
                        />
                        <FieldTypeBadge type={t} />
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    displayName <span className="text-danger">*</span>
                  </label>
                  <input
                    type="text"
                    data-testid="input-display-name"
                    value={newDisplay}
                    onChange={(e) => {
                      setNewDisplay(e.target.value);
                      if (showAutofilledHint) setShowAutofilledHint(false);
                    }}
                    maxLength={100}
                    placeholder="例：風險等級"
                    className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  {showAutofilledHint && (
                    <p
                      data-testid="displayname-autofilled-hint"
                      className="text-[11px] text-primary mt-1 inline-flex items-center gap-1"
                    >
                      <Sparkles className="w-3 h-3" />
                      已從 OBPOOLDATA <code className="font-mono">columnDescription</code> 自動填入，可直接覆寫
                    </p>
                  )}
                  <p className="text-[10px] text-gray-400 mt-1">
                    業務可讀中文標籤，最多 100 字元（toast 與表格顯示以此為主）
                  </p>
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
                <button
                  type="button"
                  data-testid="btn-submit-create-field"
                  disabled={submitDisabled}
                  onClick={handleCreate}
                  className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-blue-700 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {creating ? '建立中…' : '建立'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <EditFieldModal
        open={editTarget !== null && pendingEditPayload === null}
        field={editTarget}
        submitting={editSubmitting}
        errorMessage={editError}
        onSubmit={(payload) => void handleEditSubmit(payload)}
        onCancel={() => {
          if (editSubmitting) return;
          setEditTarget(null);
          setEditError(null);
        }}
      />

      <CategorySwitchConfirmModal
        open={disableTarget !== null && disableTarget.fieldType === 'categorical'}
        columnName={disableTarget?.columnName ?? ''}
        displayName={disableTarget?.displayName ?? ''}
        activeOptionsCount={disableActiveCount ?? 0}
        loading={disableLoading}
        onConfirm={() => disableTarget && void doDisable(disableTarget)}
        onCancel={() => {
          if (disableLoading) return;
          setDisableTarget(null);
          setDisableActiveCount(null);
        }}
      />

      <CategorySwitchConfirmModal
        open={pendingEditPayload !== null}
        columnName={pendingEditPayload?.columnName ?? ''}
        displayName={editTarget?.displayName ?? ''}
        activeOptionsCount={pendingEditPayload?.activeCount ?? 0}
        loading={editSubmitting}
        onConfirm={() => void confirmCascadingEdit()}
        onCancel={() => {
          if (editSubmitting) return;
          setPendingEditPayload(null);
        }}
      />

      <ConfirmModal
        open={simpleConfirmTarget !== null}
        variant="danger"
        title={`停用欄位 ${simpleConfirmTarget?.columnName ?? ''}？`}
        description={
          <p className="text-xs text-gray-600">
            此操作將軟刪除欄位 <strong>{simpleConfirmTarget?.displayName}</strong>。
            停用後不可用於新建名單篩選；既有名單繼續可讀。
          </p>
        }
        confirmLabel="確認停用"
        loading={disableLoading}
        loadingText="停用中..."
        onConfirm={() => simpleConfirmTarget && void doDisable(simpleConfirmTarget)}
        onCancel={() => setSimpleConfirmTarget(null)}
      />
    </div>
  );
}
