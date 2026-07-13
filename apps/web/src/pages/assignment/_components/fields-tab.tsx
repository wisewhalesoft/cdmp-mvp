import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Plus,
  Search,
  Ban,
  ListChecks,
  Hash,
  Calendar,
  Tags,
  ChevronDown,
  Inbox,
  SearchX,
  Loader2,
  Pencil,
  RotateCcw,
  Lock,
  Folder,
  Contact,
  Wallet,
  Sparkles,
  AlertTriangle,
  ArrowRight,
  CloudOff,
  RefreshCw,
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
  getDistinctValues,
  createOptionsBulk,
  type FieldType,
  type PooldataField,
  type AvailableColumn,
  type DistinctValueItem,
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

/**
 * F109 / US-172 AC-2：資料來源 badge（prototype 37-base-code.html L650-656）。
 *   customer_core → 綠色「客戶資料」；ob_pool_data → 灰色「案件資料」。依 dataSource 旗標渲染。
 */
const DATA_SOURCE_CONFIG: Record<
  'ob_pool_data' | 'customer_core' | 'customer_financial',
  { label: string; icon: typeof Folder; bg: string; text: string }
> = {
  ob_pool_data: { label: '案件資料', icon: Folder, bg: 'bg-slate-100', text: 'text-slate-600' },
  customer_core: { label: '客戶資料', icon: Contact, bg: 'bg-emerald-100', text: 'text-emerald-700' },
  // F114：交易資料（customer_financial）
  customer_financial: { label: '交易資料', icon: Wallet, bg: 'bg-amber-100', text: 'text-amber-700' },
};

function DataSourceBadge({
  source,
  columnName,
}: {
  source: 'ob_pool_data' | 'customer_core' | 'customer_financial';
  columnName: string;
}) {
  // 防呆 fallback：未知來源退回案件資料 badge，避免整頁 render 崩潰（F114 前空白畫面根因）
  const cfg = DATA_SOURCE_CONFIG[source] ?? DATA_SOURCE_CONFIG.ob_pool_data;
  const Icon = cfg.icon;
  return (
    <span
      data-testid={`data-source-badge-${columnName}`}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}
    >
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  );
}

/**
 * F112 / US-178：進入點 1 distinct 偵測之狀態機（AC-9/11/12/13/14，BR-11）。
 * 五態各自獨立、互不混淆；error 依 kind 分流呈現（503 未就緒 / 500 逾時 / 一般）。
 * 「禁止任何狀態以無提示空白清單呈現」（BR-11）。
 */
type DistinctErrorKind = 'not_ready' | 'timeout' | 'generic';

type DistinctState =
  | { status: 'idle' }
  | { status: 'loading' }
  | {
      status: 'ready';
      values: DistinctValueItem[];
      truncated: boolean;
      cap: number;
    }
  | { status: 'empty' }
  | { status: 'error'; kind: DistinctErrorKind; message: string };

/**
 * 依後端回傳之 `error` 代碼字串分流錯誤呈現（AD §6：非依 HTTP status 數值）。
 *   - 503 OBPOOLDATA_NOT_READY / CUSTOMER_CORE_NOT_READY → 來源未就緒
 *   - 500 DISTINCT_VALUES_QUERY_TIMEOUT → 逾時（文案與未就緒明確區隔，AC-13）
 *   - 其餘 → 一般失敗
 */
function classifyDistinctError(err: unknown): {
  kind: DistinctErrorKind;
  message: string;
} {
  const e = err as { response?: { data?: { error?: string } } };
  const code = e?.response?.data?.error;
  if (code === 'OBPOOLDATA_NOT_READY' || code === 'CUSTOMER_CORE_NOT_READY') {
    return {
      kind: 'not_ready',
      message: '來源資料尚未就緒，請稍後再試或聯繫系統管理員',
    };
  }
  if (code === 'DISTINCT_VALUES_QUERY_TIMEOUT') {
    return { kind: 'timeout', message: '讀取可選值逾時，請稍後重試' };
  }
  return { kind: 'generic', message: '讀取可選值失敗，請稍後重試' };
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
  // F109 / US-172：資料來源篩選（案件資料 / 客戶資料）
  const [sourceFilter, setSourceFilter] = useState<
    'all' | 'ob_pool_data' | 'customer_core' | 'customer_financial'
  >('all');

  // Create modal state
  const [showCreate, setShowCreate] = useState(false);
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
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [dropdownSearch, setDropdownSearch] = useState('');
  // 顯示名稱：可編輯，選欄位後自動帶入 ETL 欄位描述（無描述則留空供手動輸入）
  const [newDisplay, setNewDisplay] = useState('');
  const [showAutofilledHint, setShowAutofilledHint] = useState(false);

  /**
   * 下拉選單瀏覽用之欄位標籤：優先以 OBPOOLDATA 欄位描述呈現，無描述時退回欄位名稱。
   * （實際存入的顯示名稱以下方可編輯欄位 newDisplay 為準）
   */
  const columnDisplayName = (col: AvailableColumn): string =>
    col.columnDescription?.trim() || col.columnName;

  /**
   * 選定 / 重選欄位後自動帶入「顯示名稱」= 該欄位 ETL 描述（columnDescription）。
   *   - 使用者「手動輸入」過則不覆寫（尊重使用者輸入）
   *   - 先前為「自動帶入且未經修改」→ 重選欄位時更新為新欄位描述（修正：舊值殘留 bug）
   *   - 該欄位無描述 → 清掉先前自動帶入值後留空，供使用者自行輸入
   *
   * 以 showAutofilledHint 區分「自動帶入未改」(true) 與「使用者手動輸入」(false，見輸入框 onChange)。
   */
  const autoFillDisplayNameFromColumn = (meta: AvailableColumn | null) => {
    if (!meta) return;
    // 使用者手動輸入過（非空且非自動帶入狀態）→ 不覆寫
    const userTyped = newDisplay.trim().length > 0 && !showAutofilledHint;
    if (userTyped) return;
    const desc = meta.columnDescription?.trim();
    if (!desc) {
      // 新欄位無描述：清除先前自動帶入的舊欄位名稱，避免殘留
      if (showAutofilledHint) {
        setNewDisplay('');
        setShowAutofilledHint(false);
      }
      return;
    }
    setNewDisplay(desc);
    setShowAutofilledHint(true);
  };

  // F112 / US-178 進入點 1：distinct 偵測狀態 + 勾選集合
  const [distinctState, setDistinctState] = useState<DistinctState>({
    status: 'idle',
  });
  const [selectedValues, setSelectedValues] = useState<Set<string>>(new Set());
  // 防止 stale 回應覆寫（快速切換欄位 / 類型時，只有最後一次請求可寫入狀態）
  const distinctReqId = useRef(0);

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
    // F109 / US-172：資料來源篩選（缺值防呆為 'ob_pool_data'）
    if (sourceFilter !== 'all') {
      list = list.filter((f) => (f.dataSource ?? 'ob_pool_data') === sourceFilter);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (f) =>
          f.columnName.toLowerCase().includes(q) || f.displayName.toLowerCase().includes(q),
      );
    }
    return list;
  }, [fields, search, typeFilter, sourceFilter]);

  const fieldStats = useMemo(() => {
    const active = fields.filter((f) => f.isActive).length;
    return {
      total: fields.length,
      active,
      inactive: fields.length - active,
    };
  }, [fields]);

  const resetCreateForm = () => {
    setNewType('categorical');
    setCreateError(null);
    setSelectedColumnMeta(null);
    setDropdownOpen(false);
    setDropdownSearch('');
    setAvailableColumns([]);
    setAvailableColumnsError(null);
    setNewDisplay('');
    setShowAutofilledHint(false);
    // F112：重置偵測區塊
    distinctReqId.current += 1;
    setDistinctState({ status: 'idle' });
    setSelectedValues(new Set());
  };

  const loadAvailableColumns = async () => {
    setAvailableLoading(true);
    setAvailableColumnsError(null);
    try {
      const res = await listAvailableColumns();
      // 僅提供「有 ETL 欄位描述」的欄位供選擇：無描述者僅有原始欄位名、對業務無辨識度，予以隱藏
      const described = (res.availableColumns ?? []).filter(
        (c) => (c.columnDescription ?? '').trim().length > 0,
      );
      setAvailableColumns(described);
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
    setDropdownOpen(false);
    setDropdownSearch('');
    setCreateError(null);
    autoFillDisplayNameFromColumn(col);
  };

  const onFieldTypeChange = (t: FieldType) => {
    setNewType(t);
  };

  const filteredAvailableColumns = useMemo(() => {
    const q = dropdownSearch.trim().toLowerCase();
    if (!q) return availableColumns;
    // 依欄位名稱或顯示名稱（欄位描述）搜尋
    return availableColumns.filter(
      (c) =>
        c.columnName.toLowerCase().includes(q) ||
        (c.columnDescription ?? '').toLowerCase().includes(q),
    );
  }, [availableColumns, dropdownSearch]);

  /**
   * F112 進入點 1：呼叫 distinct-values 偵測（AC-1）。以 reqId 防止 stale 覆寫。
   * 空值（values:[]）→ 空狀態（AC-14，與錯誤路徑明確區隔）；錯誤 → 依 kind 分流（BR-11）。
   */
  const fetchDistinct = useCallback(async (columnName: string) => {
    const reqId = ++distinctReqId.current;
    setDistinctState({ status: 'loading' });
    setSelectedValues(new Set());
    try {
      const res = await getDistinctValues(columnName);
      if (reqId !== distinctReqId.current) return; // stale，丟棄
      if (!res.values || res.values.length === 0) {
        setDistinctState({ status: 'empty' });
        return;
      }
      setDistinctState({
        status: 'ready',
        values: res.values,
        truncated: res.truncated,
        cap: res.cap,
      });
      // 全部預設勾選（AC-1）
      setSelectedValues(new Set(res.values.map((v) => v.value)));
    } catch (err: unknown) {
      if (reqId !== distinctReqId.current) return;
      const { kind, message } = classifyDistinctError(err);
      setDistinctState({ status: 'error', kind, message });
    }
  }, []);

  // 選定欄位且類型為 categorical → 偵測 distinct；切為 numeric/date 或未選欄位 → 清除、不呼叫 API（AC-2）
  useEffect(() => {
    if (!showCreate) return;
    const col = selectedColumnMeta?.columnName;
    if (!col || newType !== 'categorical') {
      distinctReqId.current += 1; // 使任何 in-flight 請求失效
      setDistinctState({ status: 'idle' });
      setSelectedValues(new Set());
      return;
    }
    void fetchDistinct(col);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showCreate, selectedColumnMeta?.columnName, newType]);

  const toggleDistinctValue = (value: string) => {
    setSelectedValues((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  };

  const setAllDistinctSelected = (all: boolean) => {
    if (distinctState.status !== 'ready') return;
    setSelectedValues(
      all ? new Set(distinctState.values.map((v) => v.value)) : new Set(),
    );
  };

  // 儲存動作提示（AC-4 / AC-5）：依欄位類型 + 偵測狀態 + 勾選數動態呈現
  const cfSaveHint = useMemo(() => {
    if (!selectedColumnMeta) return '';
    if (newType !== 'categorical') {
      return '儲存後將建立此欄位（數值 / 日期型不含可選值）。';
    }
    if (distinctState.status === 'loading') return '正在讀取可選值…';
    const n = distinctState.status === 'ready' ? selectedValues.size : 0;
    if (n > 0) {
      return `儲存後將建立此欄位，並一併新增 ${n} 筆已勾選的可選值。`;
    }
    return '儲存後將僅建立此欄位（未勾選可選值，可稍後於「可選值管理」新增）。';
  }, [selectedColumnMeta, newType, distinctState, selectedValues.size]);

  const handleCreate = async () => {
    setCreateError(null);
    if (!selectedColumnMeta) {
      setCreateError('請於下拉選單選擇欄位');
      return;
    }
    const dispTrim = newDisplay.trim();
    if (!dispTrim) {
      setCreateError('顯示名稱為必填');
      return;
    }
    setCreating(true);
    try {
      // 步驟 1：建立欄位（既有 F075 端點，§5.3）
      const result = await createField({
        columnName: selectedColumnMeta.columnName,
        displayName: dispTrim,
        fieldType: newType,
      });
      const displayForToast = result?.displayName ?? dispTrim;

      // 步驟 2（AC-5 / §5.3）：僅類別型、偵測就緒且有 ≥1 勾選值時，批次帶入勾選值。
      //   optionValue = optionLabel = distinct 值本身（AC-10）；依偵測原始順序，非勾選插入順序。
      let bulkFailed = false;
      if (
        newType === 'categorical' &&
        distinctState.status === 'ready' &&
        selectedValues.size > 0
      ) {
        const picked = distinctState.values
          .filter((v) => selectedValues.has(v.value))
          .map((v) => ({ optionValue: v.value, optionLabel: v.value }));
        try {
          await createOptionsBulk(selectedColumnMeta.columnName, picked);
        } catch {
          // 欄位建立成功、bulk 失敗 → 欄位保留為有效狀態（categorical 允許零可選值），
          // 顯示非阻斷警告（AC-5 第 3 句 / BR-9），欄位建立仍視為成功。
          bulkFailed = true;
        }
      }

      if (bulkFailed) {
        showToast(
          '欄位已建立，但可選值帶入失敗，請至『可選值管理』重試',
          'warning',
        );
      } else {
        showToast(`欄位『${displayForToast}』已新增`, 'success');
      }
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
    setSourceFilter('all');
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
              placeholder="搜尋顯示名稱 / 欄位名稱"
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <select
            data-testid="filter-type"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as 'all' | FieldType)}
            className="px-3 py-2 border border-gray-200 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="all">欄位類型：全部</option>
            <option value="categorical">類別型（categorical）</option>
            <option value="numeric">數值型（numeric）</option>
            <option value="date">日期型（date）</option>
          </select>
          {/* F109 / US-172：資料來源篩選（prototype 37-base-code.html L190-194） */}
          <select
            data-testid="filter-data-source"
            value={sourceFilter}
            onChange={(e) =>
              setSourceFilter(
                e.target.value as 'all' | 'ob_pool_data' | 'customer_core',
              )
            }
            className="px-3 py-2 border border-gray-200 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="all">來源：全部</option>
            <option value="ob_pool_data">案件資料</option>
            <option value="customer_core">客戶資料</option>
            <option value="customer_financial">交易資料</option>
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
                  <th className="text-left px-5 py-3 font-semibold w-[18%]">顯示名稱</th>
                  <th className="text-left px-5 py-3 font-semibold w-[18%]">欄位名稱</th>
                  <th className="text-left px-5 py-3 font-semibold w-[11%]">欄位類型</th>
                  <th className="text-left px-5 py-3 font-semibold w-[12%]">資料來源</th>
                  <th className="text-left px-5 py-3 font-semibold w-[9%]">狀態</th>
                  <th className="text-left px-5 py-3 font-semibold w-[13%]">建立時間</th>
                  <th className="text-right px-5 py-3 font-semibold w-[19%]">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredFields.map((f) => (
                  <tr
                    key={f.columnName}
                    data-testid={`field-row-${f.columnName}`}
                    data-system-fixed={f.isSystemFixed ? 'true' : 'false'}
                    className={`hover:bg-gray-50/50 ${!f.isActive ? 'bg-gray-50/30 opacity-80' : ''}`}
                  >
                    <td className="px-5 py-3 text-gray-900">
                      <span className="inline-flex items-center gap-1.5">
                        {f.displayName}
                        {/* F075 v1.7 / US-144 AC-6：系統固定欄位標記 */}
                        {f.isSystemFixed && (
                          <span
                            data-testid={`system-fixed-badge-${f.columnName}`}
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-700"
                          >
                            <Lock className="w-2.5 h-2.5" />
                            系統固定
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-5 py-3 font-mono text-gray-500 text-xs">{f.columnName}</td>
                    <td className="px-5 py-3">
                      <FieldTypeBadge type={f.fieldType} />
                    </td>
                    <td className="px-5 py-3">
                      <DataSourceBadge
                        source={f.dataSource ?? 'ob_pool_data'}
                        columnName={f.columnName}
                      />
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
                            // F075 v1.7 / US-144 AC-6：系統固定欄位停用按鈕 disabled（aria-disabled）；
                            //   依 isSystemFixed 旗標，不 hardcode 'best_case'。後端亦有 422 guard（defense-in-depth）。
                            disabled={!canWrite || f.isSystemFixed}
                            aria-disabled={f.isSystemFixed ? 'true' : undefined}
                            onClick={() => {
                              if (f.isSystemFixed) return;
                              void startDisable(f);
                            }}
                            data-testid={`btn-disable-${f.columnName}`}
                            title={f.isSystemFixed ? '系統固定欄位無法停用' : '停用'}
                            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] text-warning border border-amber-200 rounded-md hover:bg-amber-50 transition disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <Ban className="w-3 h-3" />
                            停用
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={!canWrite || reactivatingColumn === f.columnName}
                            onClick={() => void handleReactivate(f)}
                            data-testid={`btn-reactivate-${f.columnName}`}
                            title="啟用"
                            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] text-success border border-green-200 rounded-md hover:bg-green-50 transition disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <RotateCcw className="w-3 h-3" />
                            啟用
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
                    選擇欄位 <span className="text-danger">*</span>
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
                      <span className={selectedColumnMeta ? 'text-gray-800' : 'text-gray-400'}>
                        {selectedColumnMeta
                          ? columnDisplayName(selectedColumnMeta)
                          : '請選擇欄位…'}
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
                              placeholder="搜尋顯示名稱 / 欄位名稱…"
                              className="w-full pl-7 pr-2 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
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
                                className="px-3 py-2 text-sm hover:bg-blue-50 cursor-pointer flex items-center justify-between gap-2"
                              >
                                <div className="min-w-0">
                                  <div className="text-gray-800 truncate">
                                    {columnDisplayName(col)}
                                  </div>
                                  {columnDisplayName(col) !== col.columnName && (
                                    <div className="text-[11px] text-gray-400 font-mono truncate">
                                      {col.columnName}
                                    </div>
                                  )}
                                </div>
                                <FieldTypeBadge type={col.suggestedFieldType} />
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {selectedColumnMeta && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      欄位名稱
                    </label>
                    <div
                      className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 text-gray-700 font-mono"
                      data-testid="readonly-column-name"
                    >
                      <Lock className="w-3.5 h-3.5 text-gray-400" />
                      <span>{selectedColumnMeta.columnName}</span>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    欄位類型 <span className="text-danger">*</span>
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
                    顯示名稱 <span className="text-danger">*</span>
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
                  {showAutofilledHint ? (
                    <p
                      data-testid="displayname-autofilled-hint"
                      className="text-[11px] text-primary mt-1 inline-flex items-center gap-1"
                    >
                      <Sparkles className="w-3 h-3" />
                      已自動帶入欄位描述，可直接修改
                    </p>
                  ) : (
                    <p className="text-[10px] text-gray-400 mt-1">
                      選欄位後自動帶入該欄位描述；若無描述請自行輸入
                    </p>
                  )}
                </div>

                {/* ===== F112 / US-178 進入點 1：從實際資料偵測可選值（僅類別型 + 已選欄位顯示） ===== */}
                {distinctState.status !== 'idle' && (
                  <div
                    data-testid="cf-distinct-section"
                    className="border border-gray-200 rounded-lg overflow-hidden"
                  >
                    <div className="px-3 py-2.5 bg-blue-50/60 border-b border-gray-200 flex items-center gap-1.5 text-sm font-medium text-gray-700">
                      <Sparkles className="w-4 h-4 text-primary" />
                      從實際資料偵測可選值
                    </div>

                    {distinctState.status === 'loading' && (
                      <div
                        data-testid="cf-distinct-loading"
                        className="px-4 py-5 flex flex-col items-center justify-center text-center gap-2"
                      >
                        <Loader2 className="w-5 h-5 text-primary animate-spin" />
                        <p className="text-sm text-gray-500">
                          正在讀取實際資料的可選值…
                        </p>
                      </div>
                    )}

                    {distinctState.status === 'ready' && (
                      <div data-testid="cf-distinct-ready">
                        {distinctState.truncated && (
                          <div
                            data-testid="cf-distinct-truncated-warning"
                            className="px-3 py-2 bg-amber-50 border-b border-amber-200 flex items-start gap-2"
                          >
                            <AlertTriangle className="w-3.5 h-3.5 text-warning mt-0.5 shrink-0" />
                            <p className="text-[11px] text-amber-700 leading-relaxed">
                              可選值過多，僅顯示前 {distinctState.cap} 筆。此欄位相異值數量偏高，可能不適合作為類別型欄位，請確認欄位選型是否正確。
                            </p>
                          </div>
                        )}
                        <p className="px-3 pt-2.5 pb-1 text-sm text-gray-700">
                          偵測到{' '}
                          <b className="text-primary" data-testid="cf-heading-count">
                            {distinctState.values.length}
                          </b>{' '}
                          個可選值，是否一併新增為此欄位的可選值？
                        </p>
                        <div className="px-3 pb-1.5 flex items-center justify-between">
                          <div className="flex items-center gap-2 text-xs">
                            <button
                              type="button"
                              data-testid="cf-select-all"
                              onClick={() => setAllDistinctSelected(true)}
                              className="text-primary hover:underline"
                            >
                              全選
                            </button>
                            <span className="text-gray-300">|</span>
                            <button
                              type="button"
                              data-testid="cf-select-clear"
                              onClick={() => setAllDistinctSelected(false)}
                              className="text-gray-500 hover:underline"
                            >
                              全部清除
                            </button>
                          </div>
                          <span className="text-xs text-gray-500">
                            已勾選{' '}
                            <span
                              data-testid="cf-sel-count"
                              className="font-semibold text-primary"
                            >
                              {selectedValues.size}
                            </span>{' '}
                            / <span data-testid="cf-sel-total">{distinctState.values.length}</span>
                          </span>
                        </div>
                        <div
                          data-testid="cf-distinct-list"
                          className="max-h-48 overflow-y-auto border-t border-gray-200"
                        >
                          {distinctState.values.map((item) => (
                            <label
                              key={item.value}
                              className="flex items-center gap-2.5 px-3 py-2 hover:bg-blue-50/40 cursor-pointer border-b border-gray-100 last:border-0"
                            >
                              <input
                                type="checkbox"
                                data-testid={`cf-distinct-check-${item.value}`}
                                checked={selectedValues.has(item.value)}
                                onChange={() => toggleDistinctValue(item.value)}
                                className="rounded border-gray-300 text-primary focus:ring-2 focus:ring-primary/30"
                              />
                              <span className="font-mono text-[11px] text-gray-500 min-w-[3.5rem] shrink-0">
                                {item.value}
                              </span>
                              <ArrowRight className="w-3 h-3 text-gray-300 shrink-0" />
                              <span className="text-sm text-gray-700 truncate">
                                {item.value}
                              </span>
                            </label>
                          ))}
                        </div>
                        <div className="px-3 py-2 bg-gray-50/70 border-t border-gray-200">
                          <p className="text-[11px] text-gray-400 leading-relaxed">
                            帶入的可選值「欄位值」= 偵測到的實際值、「顯示名稱」預設同為該值，之後可於「可選值管理」重新命名。
                          </p>
                        </div>
                      </div>
                    )}

                    {distinctState.status === 'empty' && (
                      <div
                        data-testid="cf-distinct-empty"
                        className="px-4 py-6 flex flex-col items-center text-center gap-1.5"
                      >
                        <Inbox className="w-6 h-6 text-gray-300" />
                        <p className="text-sm text-gray-600">未偵測到任何可選值</p>
                        <p className="text-[11px] text-gray-400 max-w-xs">
                          來源資料表此欄位無任何非空值，無法自動帶入。您仍可建立欄位，稍後於「可選值管理」手動新增可選值。
                        </p>
                      </div>
                    )}

                    {distinctState.status === 'error' && (
                      <div
                        data-testid="cf-distinct-error"
                        data-error-kind={distinctState.kind}
                        className="px-4 py-6 flex flex-col items-center text-center gap-2"
                      >
                        <CloudOff className="w-6 h-6 text-danger" />
                        <p className="text-sm text-gray-600">{distinctState.message}</p>
                        <button
                          type="button"
                          data-testid="cf-distinct-retry"
                          onClick={() => {
                            if (selectedColumnMeta) {
                              void fetchDistinct(selectedColumnMeta.columnName);
                            }
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary border border-primary/40 rounded-md hover:bg-blue-50"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          重試
                        </button>
                      </div>
                    )}
                  </div>
                )}
                {/* ===== /F112 進入點 1 ===== */}
              </div>
              <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-gray-200">
                <p
                  data-testid="cf-save-hint"
                  className="text-[11px] text-gray-500 leading-snug flex-1 min-w-0"
                >
                  {cfSaveHint}
                </p>
                <div className="flex items-center gap-3 shrink-0">
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
