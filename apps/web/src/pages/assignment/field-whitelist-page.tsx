import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Search,
  Ban,
  ListChecks,
  Hash,
  Calendar,
  Tags,
  Info,
} from 'lucide-react';
import { AppLayout } from '@/components/layout/app-layout';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import {
  listFields,
  createField,
  disableField as apiDisableField,
  getActiveOptionsCount,
  type FieldType,
  type PooldataField,
} from '@/api/pooldata-fields';
import { CategorySwitchConfirmModal } from './_components/category-switch-confirm-modal';
import { ConfirmModal } from '@/components/e07/ConfirmModal';
import { getEffectiveIdentity } from '@/stores/auth-store';

/**
 * F075 — POOLDATA 篩選欄位白名單頁
 *
 * 對應 prototype: /prototypes/37a-pooldata-whitelist.html
 *
 * RBAC: DirectorOrSectionChiefRoute（讀），DirectorGuard（寫入 — 由 backend 攔截）
 *
 * 功能：
 *   - 列表所有 pooldata-fields（含搜尋 + active filter）
 *   - 新增欄位 modal（column_name / display_name / field_type radio）
 *   - 停用欄位（categorical 觸發 F076-C confirm modal）
 *   - 點 categorical 欄位的 row → 跳轉至 field-options-page 管理可選值
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

export function FieldWhitelistPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const identity = getEffectiveIdentity();
  const canWrite = identity === 'admin' || identity === 'director';

  const [fields, setFields] = useState<PooldataField[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('active');
  // Phase 4 P3-3：type filter
  const [typeFilter, setTypeFilter] = useState<'all' | FieldType>('all');

  // Create modal state
  const [showCreate, setShowCreate] = useState(false);
  const [newColumn, setNewColumn] = useState('');
  const [newDisplay, setNewDisplay] = useState('');
  const [newType, setNewType] = useState<FieldType>('categorical');
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // Disable confirm modal state (categorical with active options → F076-C cascade)
  const [disableTarget, setDisableTarget] = useState<PooldataField | null>(null);
  const [disableActiveCount, setDisableActiveCount] = useState<number | null>(null);
  const [disableLoading, setDisableLoading] = useState(false);

  // Simple confirm modal state (non-categorical or zero options)
  const [simpleConfirmTarget, setSimpleConfirmTarget] = useState<PooldataField | null>(null);

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
          f.columnName.toLowerCase().includes(q) ||
          f.displayName.toLowerCase().includes(q),
      );
    }
    return list;
  }, [fields, search, typeFilter]);

  // Phase 4 P3-3：總計 / 啟用 / 停用 統計
  const fieldStats = useMemo(() => {
    const active = fields.filter((f) => f.isActive).length;
    return {
      total: fields.length,
      active,
      inactive: fields.length - active,
    };
  }, [fields]);

  const resetCreateForm = () => {
    setNewColumn('');
    setNewDisplay('');
    setNewType('categorical');
    setCreateError(null);
  };

  const handleCreate = async () => {
    setCreateError(null);
    const colTrim = newColumn.trim();
    const dispTrim = newDisplay.trim();
    if (!colTrim || !dispTrim) {
      setCreateError('column_name 與 display_name 為必填');
      return;
    }
    if (!/^[A-Z][A-Z0-9_]{0,63}$/.test(colTrim)) {
      setCreateError('column_name 僅允許大寫英文開頭 + 大寫英數或底線');
      return;
    }
    setCreating(true);
    try {
      await createField({
        columnName: colTrim,
        displayName: dispTrim,
        fieldType: newType,
      });
      showToast(`欄位 ${colTrim} 已建立`, 'success');
      setShowCreate(false);
      resetCreateForm();
      void fetchFields();
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: { error?: string; message?: string } } };
      const status = e?.response?.status;
      let msg = e?.response?.data?.message ?? '建立失敗';
      if (status === 409) msg = e?.response?.data?.message ?? '此 column_name 已存在';
      setCreateError(msg);
    } finally {
      setCreating(false);
    }
  };

  const startDisable = async (field: PooldataField) => {
    // categorical → 先預查 active options count (F076-C UI 預查)
    if (field.fieldType === 'categorical') {
      try {
        const res = await getActiveOptionsCount(field.columnName);
        setDisableActiveCount(res.activeCount);
      } catch {
        setDisableActiveCount(0);
      }
      setDisableTarget(field);
    } else {
      // 非 categorical 直接走 simple confirm
      setSimpleConfirmTarget(field);
    }
  };

  const doDisable = async (field: PooldataField) => {
    setDisableLoading(true);
    try {
      await apiDisableField(field.columnName);
      showToast(`欄位 ${field.columnName} 已停用`, 'success');
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

  return (
    <AppLayout title="客戶名單分派 — 代碼維護 / 白名單">
      <main className="flex-1 p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <p className="text-sm text-gray-500">
            管理 OBPOOLDATA 表可用的篩選欄位白名單（F075）。類別型欄位可進一步管理可選值（F076）。
          </p>
          <Button
            type="button"
            variant="primary"
            data-testid="btn-create-field"
            disabled={!canWrite}
            onClick={() => {
              resetCreateForm();
              setShowCreate(true);
            }}
          >
            <span className="inline-flex items-center gap-1.5">
              <Plus className="w-4 h-4" />
              新增欄位
            </span>
          </Button>
        </div>

        {error && (
          <div
            data-testid="fields-error"
            className="rounded-lg p-3 bg-red-50 border border-red-200 text-sm text-red-800"
          >
            {error}
          </div>
        )}

        <section className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 max-w-md min-w-[200px]">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜尋 column_name / display_name"
                className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <select
              data-testid="filter-type"
              value={typeFilter}
              onChange={(e) =>
                setTypeFilter(e.target.value as 'all' | FieldType)
              }
              className="px-3 py-2 border border-gray-200 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="all">類型：全部</option>
              <option value="categorical">categorical</option>
              <option value="numeric">numeric</option>
              <option value="date">date</option>
            </select>
            <select
              data-testid="filter-active"
              value={activeFilter}
              onChange={(e) =>
                setActiveFilter(e.target.value as 'all' | 'active' | 'inactive')
              }
              className="px-3 py-2 border border-gray-200 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="active">啟用中</option>
              <option value="inactive">已停用</option>
              <option value="all">全部</option>
            </select>
            {/* Phase 4 P3-3：統計列 */}
            <div
              data-testid="field-stats"
              className="ml-auto text-xs text-gray-500"
            >
              總計 <span className="font-mono font-medium text-gray-700">{fieldStats.total}</span> 筆
              <span className="mx-1 text-gray-300">·</span>
              啟用 <span className="font-mono font-medium text-green-600">{fieldStats.active}</span>
              <span className="mx-1 text-gray-300">/</span>
              停用 <span className="font-mono font-medium text-gray-500">{fieldStats.inactive}</span>
            </div>
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
                    <th className="text-left px-5 py-3 font-semibold w-[20%]">column_name</th>
                    <th className="text-left px-5 py-3 font-semibold w-[22%]">display_name</th>
                    <th className="text-left px-5 py-3 font-semibold w-[12%]">field_type</th>
                    <th className="text-left px-5 py-3 font-semibold w-[10%]">狀態</th>
                    <th className="text-left px-5 py-3 font-semibold w-[14%]">建立時間</th>
                    <th className="text-right px-5 py-3 font-semibold w-[22%]">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredFields.map((f) => (
                    <tr key={f.columnName} className="hover:bg-gray-50/50">
                      <td className="px-5 py-3 font-mono text-primary">{f.columnName}</td>
                      <td className="px-5 py-3 text-gray-900">{f.displayName}</td>
                      <td className="px-5 py-3">
                        <FieldTypeBadge type={f.fieldType} />
                      </td>
                      <td className="px-5 py-3">
                        {f.isActive ? (
                          <span className="inline-flex px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-700">
                            啟用中
                          </span>
                        ) : (
                          <span className="inline-flex px-2 py-0.5 text-xs rounded-full bg-red-100 text-red-700">
                            已停用
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-gray-500 text-xs font-mono">
                        {(f.createdAt ?? '').slice(0, 10)}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="inline-flex items-center gap-2">
                          {f.fieldType === 'categorical' && (
                            <button
                              type="button"
                              data-testid={`btn-options-${f.columnName}`}
                              onClick={() =>
                                navigate(
                                  `/assignment/whitelist/options?col=${encodeURIComponent(f.columnName)}`,
                                )
                              }
                              className="text-xs text-primary hover:underline"
                            >
                              管理可選值
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={!canWrite || !f.isActive}
                            onClick={() => void startDisable(f)}
                            data-testid={`btn-disable-${f.columnName}`}
                            className="inline-flex items-center gap-1 text-xs text-danger hover:bg-red-50 px-2 py-1 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <Ban className="w-3.5 h-3.5" />
                            停用
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Phase 4 P3-3：F075 商業規則摘要 footer */}
        <div
          data-testid="field-whitelist-rules-footer"
          className="rounded-lg p-3 bg-blue-50/50 border border-blue-100 text-xs text-gray-600 flex items-start gap-2"
        >
          <Info className="w-4 h-4 text-primary mt-0.5 shrink-0" />
          <div>
            <p className="font-medium text-gray-700 mb-0.5">F075 商業規則摘要</p>
            <ul className="list-disc list-inside space-y-0.5">
              <li>
                <strong>BR-1</strong>：<code className="font-mono">column_name</code> 為唯一鍵，
                新增時不分啟用 / 停用一律檢查重複
                （違反回 422 <code className="font-mono">WHITELIST_FIELD_DUPLICATE</code>）。
              </li>
              <li>
                <strong>BR-3</strong>：停用「不回溯」既有名單條件；
                月跑 Stage 1 直接讀 <code className="font-mono">ob_list_definition</code> JSONB，
                不 join <code className="font-mono">field_whitelist</code> 驗證。
              </li>
              <li>
                <strong>BR-4</strong>：<code className="font-mono">field_type</code> 由 categorical 改為其他類別時，
                <strong>不自動刪除</strong> F076 既有可選值
                （軟停用，<code className="font-mono">deactivation_reason = 'field_type_changed'</code>，
                PO 決議 F076-C）。
              </li>
              <li>
                <strong>BR-7</strong>：舊名單（F050 / F051）沿用固定欄位邏輯；
                本白名單僅影響 US-106 後續新名單定義。
              </li>
            </ul>
          </div>
        </div>
      </main>

      {/* Create field modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50" data-testid="create-field-modal">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => !creating && setShowCreate(false)}
          />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-base font-semibold text-gray-800">新增 POOLDATA 欄位</h3>
                <p className="text-xs text-gray-500 mt-0.5">F075 §5.2</p>
              </div>
              <div className="p-6 space-y-3">
                {createError && (
                  <div
                    data-testid="create-error"
                    className="rounded-md p-2.5 bg-red-50 border border-red-200 text-xs text-red-800"
                  >
                    {createError}
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    column_name <span className="text-danger">*</span>
                  </label>
                  <input
                    type="text"
                    data-testid="input-column-name"
                    value={newColumn}
                    onChange={(e) => setNewColumn(e.target.value.toUpperCase())}
                    maxLength={64}
                    placeholder="例：CARD_TYPE"
                    className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <p className="text-[10px] text-gray-400 mt-1">
                    大寫英文開頭 + 大寫英數或底線（最長 64 字）
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    display_name <span className="text-danger">*</span>
                  </label>
                  <input
                    type="text"
                    data-testid="input-display-name"
                    value={newDisplay}
                    onChange={(e) => setNewDisplay(e.target.value)}
                    maxLength={100}
                    placeholder="例：卡片類別"
                    className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    field_type <span className="text-danger">*</span>
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
                          onChange={() => setNewType(t)}
                          className="text-primary"
                        />
                        <FieldTypeBadge type={t} />
                      </label>
                    ))}
                  </div>
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

      {/* F076-C: Categorical disable confirm modal */}
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

      {/* Non-categorical disable confirm */}
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
    </AppLayout>
  );
}
