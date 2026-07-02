import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Save,
  Plus,
  X,
  AlertTriangle,
  Archive,
  ChevronRight,
  ChevronDown,
  ShieldCheck,
  Hash,
  Lock,
  Filter,
  Trash2,
  Info,
  UndoDot,
  ArrowLeft,
  Folder,
  Contact,
} from 'lucide-react';
import { AppLayout } from '@/components/layout/app-layout';
import { Button } from '@/components/ui/button';
import { StageBadge, type Stage } from '@/components/e07/StageBadge';
import { useToast } from '@/components/ui/toast';
import {
  listLists,
  updateList,
  type AssignmentListItem,
  type ConditionItem,
  type ConditionPayload,
} from '@/api/assignment-list';
import {
  listFields,
  listOptions,
  type PooldataField,
  type PooldataOption,
  type FieldType,
} from '@/api/pooldata-fields';
import { listCardTypes, type CardTypeListItem } from '@/api/card-type';

/**
 * F051 v2.1 — 編輯草稿名單頁（Phase 5d 波 9 全重寫）
 *
 * 對應 prototype: /prototypes/27b-list-edit-draft.html
 *
 * 4 場景（依 stage + conditionPayload 分流，對齊 prototype L487-545）：
 *   ① draft + 新名單 (conditionPayload != null) → 條件 builder 可編輯
 *   ② draft + 含 INACTIVE values → 琥珀警示 + 可編輯
 *   ③ draft + LEGACY (conditionPayload == null) → 條件 read-only + LegacyBanner
 *   ④ stage != draft → 全頁 NotDraftBanner，主表單隱藏（K1 約束）
 *
 * 區塊順序對齊 27a（不換序）：
 *   1. 基本資訊
 *   2. 撈案期間（一級保留欄位）
 *   3. 篩選條件（兩種模式：可編輯 / LEGACY 唯讀）
 *   4. CR 回分規則
 *
 * 5d 紅線：whitelist source of truth 為 listFields/listOptions；F068 已廢除。
 * LEGACY 名單儲存時前端主動 omit conditionPayload（後端 LEGACY_LIST_CONDITION_READONLY 為 defense-in-depth）。
 */

type ConditionFieldType = FieldType;

interface BuilderCondition {
  id: number;
  columnName: string;
  fieldType: ConditionFieldType;
  values?: string[];
  min?: number | '';
  max?: number | '';
  dateStart?: string;
  dateEnd?: string;
}

function toConditionItem(c: BuilderCondition): ConditionItem {
  const base: ConditionItem = { columnName: c.columnName, fieldType: c.fieldType };
  if (c.fieldType === 'categorical') base.values = c.values ?? [];
  else if (c.fieldType === 'numeric') {
    base.min = typeof c.min === 'number' ? c.min : Number(c.min);
    base.max = typeof c.max === 'number' ? c.max : Number(c.max);
  } else if (c.fieldType === 'date') {
    base.dateStart = c.dateStart;
    base.dateEnd = c.dateEnd;
  }
  return base;
}

function isConditionComplete(c: BuilderCondition): boolean {
  if (c.fieldType === 'categorical') return (c.values?.length ?? 0) >= 1;
  if (c.fieldType === 'numeric') {
    if (c.min === '' || c.max === '' || c.min === undefined || c.max === undefined) return false;
    return Number(c.max) >= Number(c.min);
  }
  if (c.fieldType === 'date') {
    if (!c.dateStart || !c.dateEnd) return false;
    return c.dateEnd >= c.dateStart;
  }
  return false;
}

// LEGACY entity column display map（對齊 prototype 27b L835-841）
const LEGACY_ENTITY_DISPLAY: Record<string, string> = {
  prod_kind: '產品類別',
  caseyear: '進件 / 滿期年數',
  spec_tp: '專案類別',
  case_status: '案件結清期別',
  settle_src: '他行代償',
};

/**
 * F109 / US-172 AC-3：「新增條件」選單依 dataSource 分組（prototype 27b，同 27a L647-676）。
 */
const SOURCE_GROUPS: ReadonlyArray<{
  key: 'ob_pool_data' | 'customer_core';
  label: string;
  table: string;
  Icon: typeof Folder;
}> = [
  { key: 'ob_pool_data', label: '案件資料', table: 'ob_pool_data', Icon: Folder },
  { key: 'customer_core', label: '客戶資料', table: 'customer_core', Icon: Contact },
];

export function ListEditDraftPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { listNo } = useParams<{ listNo: string }>();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [list, setList] = useState<AssignmentListItem | null>(null);

  // Form state
  const [listNm, setListNm] = useState('');
  const [cardType, setCardType] = useState('');
  const [listPeriodStart, setListPeriodStart] = useState<string>('');
  const [listPeriodEnd, setListPeriodEnd] = useState<string>('');
  const [listInterval, setListInterval] = useState<string>('');
  const [crEnabled, setCrEnabled] = useState(true);
  const [conditions, setConditions] = useState<BuilderCondition[]>([]);
  const [condIdSeq, setCondIdSeq] = useState(1);

  // UI state
  const [addDropdownOpen, setAddDropdownOpen] = useState(false);
  const [valueDropdownOpen, setValueDropdownOpen] = useState<number | null>(null);

  // Whitelist
  const [fields, setFields] = useState<PooldataField[]>([]);
  const [optionsByColumn, setOptionsByColumn] = useState<Record<string, PooldataOption[]>>({});

  // v2.1.1（US-127 / AC-16）：cardTypes 下拉資料 + fallback 狀態
  // 編輯模式呼叫 listCardTypes('all') 取得 active + inactive 卡別
  const [cardTypes, setCardTypes] = useState<CardTypeListItem[]>([]);
  const [cardTypesLoadFailed, setCardTypesLoadFailed] = useState(false);

  // 載入 fields
  useEffect(() => {
    let aborted = false;
    void (async () => {
      try {
        const data = await listFields({ active: 'true' });
        if (!aborted) setFields(data.fields ?? []);
      } catch {
        if (!aborted) setFields([]);
      }
    })();
    return () => {
      aborted = true;
    };
  }, []);

  // v2.1.1（US-127 / AC-16）：載入 cardTypes('all') — 編輯模式含 inactive 卡別
  // 前端側 filter：active 正常可選；名單現存 inactive 值 → disabled option 保留
  useEffect(() => {
    let aborted = false;
    void (async () => {
      try {
        const data = await listCardTypes('all');
        if (!aborted) {
          const sorted = [...(data.cardTypes ?? [])].sort((a, b) =>
            a.cardType.localeCompare(b.cardType),
          );
          setCardTypes(sorted);
          setCardTypesLoadFailed(false);
        }
      } catch {
        if (!aborted) {
          setCardTypes([]);
          setCardTypesLoadFailed(true);
        }
      }
    })();
    return () => {
      aborted = true;
    };
  }, []);

  // 載入名單
  useEffect(() => {
    if (!listNo) return;
    let aborted = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        // F097：名單 project_workym 可能為未來月（作業月＝下月）；listNo 內嵌 YYYYMM
        // （OB + YYYYMM + NNN），以此查詢對應月份，避免 listLists 預設當月找不到下月名單。
        const ymFromListNo = listNo.match(/^OB(\d{6})/)?.[1];
        const data = await listLists(ymFromListNo ? { ym: ymFromListNo } : {});
        if (aborted) return;
        const found = data.lists.find((l) => l.listNo === listNo);
        if (!found) {
          setError(`找不到名單 ${listNo}`);
          return;
        }
        setList(found);
        setListNm(found.listNm);
        setCardType(found.cardType ?? '');
        setListPeriodStart(
          found.listPeriodStart != null ? String(found.listPeriodStart) : '',
        );
        setListPeriodEnd(
          found.listPeriodEnd != null ? String(found.listPeriodEnd) : '',
        );
        setListInterval(
          found.listInterval != null ? String(found.listInterval) : '',
        );
        setCrEnabled(found.crEnabled ?? true);

        // 條件預填（僅當 stage='draft' 且 conditionPayload != null）
        if (found.stage === 'draft' && found.conditionPayload) {
          let seq = 1;
          const newConds: BuilderCondition[] = found.conditionPayload.conditions.map(
            (src) => {
              const c: BuilderCondition = {
                id: seq++,
                columnName: src.columnName,
                fieldType: src.fieldType,
              };
              if (src.fieldType === 'categorical') c.values = [...(src.values ?? [])];
              else if (src.fieldType === 'numeric') {
                c.min = src.min;
                c.max = src.max;
              } else if (src.fieldType === 'date') {
                c.dateStart = src.dateStart;
                c.dateEnd = src.dateEnd;
              }
              return c;
            },
          );
          setCondIdSeq(seq);
          setConditions(newConds);
        }
      } catch (err: unknown) {
        const e = err as { response?: { data?: { message?: string } } };
        if (!aborted) setError(e?.response?.data?.message ?? '載入名單失敗');
      } finally {
        if (!aborted) setLoading(false);
      }
    })();
    return () => {
      aborted = true;
    };
  }, [listNo]);

  // ensureOptions for categorical columns（載入後對所有條件 ensure）
  const ensureOptions = useCallback(async (columnName: string) => {
    setOptionsByColumn((prev) => {
      if (prev[columnName]) return prev;
      return prev; // 不變更，下面 fetch
    });
    if (optionsByColumn[columnName]) return;
    try {
      const data = await listOptions(columnName, { active: 'true' });
      setOptionsByColumn((prev) => ({ ...prev, [columnName]: data.options ?? [] }));
    } catch {
      setOptionsByColumn((prev) => ({ ...prev, [columnName]: [] }));
    }
  }, [optionsByColumn]);

  // 條件初始化後，ensure categorical options
  useEffect(() => {
    conditions.forEach((c) => {
      if (c.fieldType === 'categorical') void ensureOptions(c.columnName);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conditions.length]);

  // US-144 AC-3：載入名單後，後端注入的 best_case 會出現在 conditionPayload；
  //   系統固定欄位改以鎖定列渲染，故自使用者 conditions 陣列移除（依 fields isSystemFixed 旗標，
  //   fields 載入後執行；避免重複列 + 不計入最低條件數）。
  useEffect(() => {
    if (fields.length === 0) return;
    const systemFixedCols = new Set(
      fields.filter((f) => f.isSystemFixed).map((f) => f.columnName),
    );
    if (systemFixedCols.size === 0) return;
    setConditions((prev) => {
      const filtered = prev.filter((c) => !systemFixedCols.has(c.columnName));
      return filtered.length === prev.length ? prev : filtered;
    });
  }, [fields, conditions]);

  // 場景判定
  const isDraft = list?.stage === 'draft';
  const isLegacy = list?.conditionPayload == null && list?.stage === 'draft';
  const showMainForm = isDraft;

  // 條件操作 helper
  const usedCols = useMemo(
    () => new Set(conditions.map((c) => c.columnName)),
    [conditions],
  );
  // US-144 AC-4：系統固定欄位（best_case）以鎖定列恆顯示，從「新增條件」dropdown 排除
  const availableFields = useMemo(
    () =>
      fields.filter(
        (f) => f.isActive && !f.isSystemFixed && !usedCols.has(f.columnName),
      ),
    [fields, usedCols],
  );

  // US-144 AC-3：系統固定欄位清單，渲染為鎖定列
  const systemFixedFields = useMemo(
    () => fields.filter((f) => f.isActive && f.isSystemFixed),
    [fields],
  );

  const systemFixedValueLabel = (columnName: string): string =>
    columnName === 'best_case' ? 'Y · 優質案件' : 'Y';

  const addConditionByCol = useCallback(
    (col: string) => {
      const f = fields.find((x) => x.columnName === col);
      if (!f) return;
      const id = condIdSeq;
      setCondIdSeq((s) => s + 1);
      const c: BuilderCondition = {
        id,
        columnName: col,
        fieldType: f.fieldType,
      };
      if (f.fieldType === 'categorical') {
        c.values = [];
        void ensureOptions(col);
      } else if (f.fieldType === 'numeric') {
        c.min = '';
        c.max = '';
      } else if (f.fieldType === 'date') {
        c.dateStart = '';
        c.dateEnd = '';
      }
      setConditions((prev) => [...prev, c]);
      setAddDropdownOpen(false);
    },
    [fields, condIdSeq, ensureOptions],
  );

  const removeCondition = useCallback((id: number) => {
    setConditions((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const toggleCatValue = useCallback((id: number, val: string) => {
    setConditions((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c;
        const current = c.values ?? [];
        const next = current.includes(val)
          ? current.filter((v) => v !== val)
          : [...current, val];
        return { ...c, values: next };
      }),
    );
  }, []);

  const updateNumeric = useCallback((id: number, key: 'min' | 'max', v: string) => {
    setConditions((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, [key]: v === '' ? '' : Number(v) } : c,
      ),
    );
  }, []);

  const updateDate = useCallback((id: number, key: 'dateStart' | 'dateEnd', v: string) => {
    setConditions((prev) =>
      prev.map((c) => (c.id === id ? { ...c, [key]: v } : c)),
    );
  }, []);

  // INACTIVE 偵測
  const inactiveDetails = useMemo(() => {
    const details: Array<{ columnName: string; value: string; label: string }> = [];
    conditions.forEach((c) => {
      if (c.fieldType !== 'categorical') return;
      const opts = optionsByColumn[c.columnName] ?? [];
      (c.values ?? []).forEach((v) => {
        const opt = opts.find((o) => o.optionValue === v);
        if (opt && !opt.isActive) {
          details.push({ columnName: c.columnName, value: v, label: opt.optionLabel });
        }
      });
    });
    return details;
  }, [conditions, optionsByColumn]);

  const hasInactive = inactiveDetails.length > 0;

  // submit
  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!listNo || !list) return;
      setError(null);

      if (!listNm.trim()) {
        setError('請輸入名單名稱');
        showToast('請輸入名單名稱', 'error');
        return;
      }
      if (listPeriodStart === '' || listPeriodEnd === '' || listInterval === '') {
        setError('撈案期間三欄皆為必填');
        showToast('撈案期間三欄皆為必填', 'error');
        return;
      }
      if (Number(listPeriodEnd) < Number(listPeriodStart)) {
        setError('結束期數需大於等於開始期數');
        return;
      }

      const dto: Record<string, unknown> = {
        listNm: listNm.trim(),
        listPeriodStart: Number(listPeriodStart),
        listPeriodEnd: Number(listPeriodEnd),
        listInterval: Number(listInterval),
        crEnabled,
      };
      if (cardType) dto.cardType = cardType;

      // 非 LEGACY 才送 conditionPayload；LEGACY 主動 omit（defense-in-depth）
      if (!isLegacy) {
        // US-144 AC-10：最低條件數只計入非系統固定條件（best_case 鎖定列不計入）。
        //   conditions 已於載入後移除系統固定欄位，故 length 即非固定條件數。
        if (conditions.length === 0) {
          const msg = '請至少新增 1 個篩選條件（優質案件為系統固定，不計入）';
          setError(msg);
          showToast(msg, 'error');
          return;
        }
        const incomplete = conditions.find((c) => !isConditionComplete(c));
        if (incomplete) {
          setError('部分條件尚未填寫完整');
          showToast('部分條件尚未填寫完整', 'error');
          return;
        }
        const payload: ConditionPayload = {
          conditions: conditions.map(toConditionItem),
          logic: 'AND',
        };
        dto.conditionPayload = payload;
      }

      setSubmitting(true);
      try {
        await updateList(listNo, dto);
        showToast(
          `${listNo} 已儲存`,
          'success',
        );
        navigate('/assignment/list-definitions');
      } catch (err: unknown) {
        const e = err as { response?: { data?: { message?: string } } };
        const msg = e?.response?.data?.message ?? '更新失敗，請稍後再試';
        setError(msg);
        showToast(msg, 'error');
      } finally {
        setSubmitting(false);
      }
    },
    [
      listNo,
      list,
      listNm,
      listPeriodStart,
      listPeriodEnd,
      listInterval,
      crEnabled,
      cardType,
      isLegacy,
      conditions,
      showToast,
      navigate,
    ],
  );

  function renderTypeBadge(fieldType: ConditionFieldType) {
    const colors: Record<ConditionFieldType, { bg: string; text: string }> = {
      categorical: { bg: 'bg-blue-100', text: 'text-blue-700' },
      numeric: { bg: 'bg-violet-100', text: 'text-violet-700' },
      date: { bg: 'bg-cyan-100', text: 'text-cyan-700' },
    };
    const c = colors[fieldType];
    return (
      <span
        className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${c.bg} ${c.text}`}
      >
        {fieldType}
      </span>
    );
  }

  return (
    <AppLayout
      headerLeft={
        <div className="flex items-center gap-2 text-sm">
          <Link
            to="/assignment/list-definitions"
            className="text-gray-500 hover:text-primary transition"
          >
            名單定義
          </Link>
          <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
          <span className="font-semibold text-gray-800">編輯草稿名單</span>
          {listNo && (
            <code className="ml-1 font-mono text-primary text-xs">{listNo}</code>
          )}
          {list && <StageBadge stage={list.stage as Stage} className="ml-2" />}
          {isLegacy && (
            <span
              data-testid="legacy-tag"
              className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-slate-200 text-slate-600 border border-slate-300"
            >
              <Archive className="w-3 h-3 mr-0.5" />
              LEGACY v2.0
            </span>
          )}
        </div>
      }
    >
      <main className="flex-1 p-6">
        <div className="space-y-4">
          {loading && (
            <div className="text-center text-gray-400 py-12" data-testid="edit-loading">
              載入中...
            </div>
          )}

          {!loading && error && !list && (
            <div
              data-testid="form-error"
              className="rounded-lg p-3 bg-red-50 border border-red-200 text-sm text-red-800"
            >
              {error}
            </div>
          )}

          {/* 場景④：非 draft → 全頁 banner */}
          {!loading && list && !isDraft && (
            <div data-testid="not-draft-banner" className="bg-white rounded-xl border border-amber-200 p-8 flex items-start gap-4">
              <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6 text-warning" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-semibold text-amber-900">無法編輯篩選條件</h3>
                <p className="text-sm text-gray-700 mt-1">
                  名單 <code className="font-mono text-primary">{list.listNo}</code> 已進入「
                  <span className="font-semibold">{list.stage}</span>」階段，根據 F051 v2.1 規格僅 draft 階段可寫入 conditionPayload（K1 約束）。
                </p>
                <p className="text-sm text-gray-700 mt-2">
                  如需修改篩選條件，請先執行{' '}
                  <span className="font-semibold text-danger">Rollback</span> 回到草稿階段（K3：rollback 後 conditionPayload 重新可寫入），再回此頁編輯。
                </p>
                <div className="mt-4 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => navigate('/assignment/list-definitions')}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-white text-sm rounded-md hover:bg-blue-700"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    返回名單定義
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      showToast('Rollback 流程：從名單列表頁的對應階段管理頁觸發；rollback 將清空當前 stage 之比例 / 簽核資料。', 'warning')
                    }
                    className="inline-flex items-center gap-1.5 px-4 py-2 border border-danger text-danger text-sm rounded-md hover:bg-red-50"
                  >
                    <UndoDot className="w-4 h-4" />
                    了解 Rollback 流程
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 主表單（僅 draft 顯示） */}
          {!loading && list && showMainForm && (
            <>
              {error && (
                <div
                  data-testid="form-error"
                  className="rounded-lg p-3 bg-red-50 border border-red-200 text-sm text-red-800"
                >
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* 1: 基本資訊 */}
                <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-primary text-white text-xs font-semibold inline-flex items-center justify-center">
                      1
                    </span>
                    <h2 className="text-base font-semibold text-gray-800">基本資訊</h2>
                  </div>
                  <div className="grid grid-cols-12 gap-4">
                    <div className="col-span-3">
                      <label className="block text-xs text-gray-500 mb-1">LIST_NO（唯讀）</label>
                      <div className="inline-flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-md font-mono text-sm text-gray-700 w-full">
                        <Hash className="w-4 h-4 text-gray-400" />
                        <span>{list.listNo}</span>
                        <Lock className="w-3 h-3 text-gray-400 ml-auto" />
                      </div>
                    </div>
                    <div className="col-span-6">
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        名單名稱 <span className="text-danger">*</span>
                      </label>
                      <input
                        data-testid="input-listNm"
                        type="text"
                        required
                        maxLength={50}
                        value={listNm}
                        onChange={(e) => setListNm(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                    {/* v2.1.1（US-127 / AC-16）：卡別由 <input> 改為 <select>；options 來自
                        ob_card_type（status=all，含 active + inactive）；前端 filter：
                          - active 卡別正常可選
                          - 名單現存 inactive 值 → disabled option + 附「（已停用 — 僅供保留舊值）」
                        首選項「— 未選擇 —」（空值）；API 失敗時顯示 fallback。 */}
                    <div className="col-span-6">
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        卡別 <span className="text-[10px] text-gray-400 font-normal">選填</span>
                      </label>
                      <select
                        data-testid="select-cardType"
                        value={cardType}
                        onChange={(e) => setCardType(e.target.value)}
                        disabled={cardTypesLoadFailed}
                        className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary"
                      >
                        <option value="">— 未選擇 —</option>
                        {cardTypes.map((c) => {
                          const isInactive = c.status === 'inactive';
                          // 編輯模式 filter 規則：active 卡別正常顯示；inactive 卡別僅在
                          //   等於名單現存 cardType 時才顯示（disabled），保留舊值
                          if (isInactive && c.cardType !== cardType) {
                            return null;
                          }
                          const label = `${c.cardType} — ${c.cardName}（${c.prodKindName ?? c.prodKind}）${isInactive ? '（已停用 — 僅供保留舊值）' : ''}`;
                          return (
                            <option
                              key={c.cardType}
                              value={c.cardType}
                              disabled={isInactive}
                            >
                              {label}
                            </option>
                          );
                        })}
                      </select>
                      {cardTypesLoadFailed && (
                        <div
                          data-testid="card-type-fallback"
                          className="mt-2 flex items-start gap-2 px-3 py-2 rounded-md bg-amber-50 border border-amber-200 text-xs"
                        >
                          <AlertTriangle className="w-3.5 h-3.5 text-warning mt-0.5 shrink-0" />
                          <div className="flex-1">
                            <p className="font-semibold text-amber-900">
                              卡別資料載入失敗，請重新整理頁面
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </section>

                {/* 2: 撈案期間 */}
                <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-primary text-white text-xs font-semibold inline-flex items-center justify-center">
                      2
                    </span>
                    <h2 className="text-base font-semibold text-gray-800">撈案期間</h2>
                    <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-50 text-purple-700 border border-purple-200">
                      <ShieldCheck className="w-3 h-3 mr-0.5" />
                      一級保留欄位
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        開始撈取期數 <span className="text-danger">*</span>
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          data-testid="input-listPeriodStart"
                          type="number"
                          min={0}
                          max={999}
                          step={1}
                          required
                          value={listPeriodStart}
                          onChange={(e) => setListPeriodStart(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                        <span className="text-xs text-gray-500 shrink-0">個月</span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        結束撈取期數 <span className="text-danger">*</span>
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          data-testid="input-listPeriodEnd"
                          type="number"
                          min={0}
                          max={999}
                          step={1}
                          required
                          value={listPeriodEnd}
                          onChange={(e) => setListPeriodEnd(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                        <span className="text-xs text-gray-500 shrink-0">個月</span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        間隔期數 <span className="text-danger">*</span>
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          data-testid="input-listInterval"
                          type="number"
                          min={0}
                          max={999}
                          step={1}
                          required
                          value={listInterval}
                          onChange={(e) => setListInterval(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                        <span className="text-xs text-gray-500 shrink-0">個月</span>
                      </div>
                    </div>
                  </div>
                </section>

                {/* 3: 篩選條件（兩種模式） */}
                <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-primary text-white text-xs font-semibold inline-flex items-center justify-center">
                        3
                      </span>
                      <h2 className="text-base font-semibold text-gray-800">篩選條件</h2>
                      {!isLegacy && (
                        <span className="text-[10px] text-gray-400 ml-1">
                          條件間以「且」（AND）連接
                        </span>
                      )}
                    </div>
                    {!isLegacy && (
                      <div className="relative">
                        <button
                          type="button"
                          data-testid="btn-add-condition"
                          onClick={() => setAddDropdownOpen((v) => !v)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-primary text-primary rounded-md hover:bg-blue-50"
                        >
                          <Plus className="w-4 h-4" />
                          新增條件
                          <ChevronDown className="w-3.5 h-3.5" />
                        </button>
                        {addDropdownOpen && (
                          <div
                            data-testid="add-field-dropdown"
                            className="absolute right-0 top-full mt-1 w-80 bg-white border border-gray-200 rounded-lg shadow-lg z-20 max-h-80 overflow-y-auto"
                          >
                            <ul className="py-1">
                              {availableFields.length === 0 ? (
                                <li className="px-3 py-4 text-center text-xs text-gray-400">
                                  所有 active 欄位皆已加入條件中
                                </li>
                              ) : (
                                // F109 / US-172 AC-3：依 dataSource 分組（案件資料 / 客戶資料），空群組不渲染標題
                                SOURCE_GROUPS.map((g) => {
                                  const items = availableFields.filter(
                                    (f) => (f.dataSource ?? 'ob_pool_data') === g.key,
                                  );
                                  if (items.length === 0) return null;
                                  return (
                                    <li key={g.key}>
                                      <div
                                        data-testid={`add-field-group-${g.key}`}
                                        className="px-3 pt-2 pb-1 flex items-center gap-1.5 bg-gray-50/70 border-b border-gray-100"
                                      >
                                        <g.Icon className="w-3 h-3 text-gray-400" />
                                        <span className="text-[0.7rem] font-semibold text-gray-400 uppercase tracking-wider">
                                          {g.label}
                                        </span>
                                        <span className="ml-auto text-[10px] font-mono text-gray-300 normal-case">
                                          {g.table}
                                        </span>
                                      </div>
                                      <ul>
                                        {items.map((f) => (
                                          <li key={f.columnName}>
                                            <button
                                              type="button"
                                              data-testid={`add-field-${f.columnName}`}
                                              onClick={() => addConditionByCol(f.columnName)}
                                              className="w-full text-left px-3 py-2 hover:bg-blue-50 flex items-center gap-2"
                                            >
                                              <div className="flex-1 min-w-0">
                                                <div className="text-sm font-medium text-gray-800">
                                                  {f.displayName}
                                                </div>
                                                <code className="text-[10px] font-mono text-gray-500">
                                                  {f.columnName}
                                                </code>
                                              </div>
                                              {renderTypeBadge(f.fieldType)}
                                            </button>
                                          </li>
                                        ))}
                                      </ul>
                                    </li>
                                  );
                                })
                              )}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* LEGACY banner（對齊 prototype 27b L293-301） */}
                  {isLegacy && (
                    <div
                      data-testid="legacy-condition-banner"
                      className="rounded-lg p-4 bg-slate-50 border border-slate-300 flex items-start gap-3"
                    >
                      <div className="w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center shrink-0">
                        <Info className="w-5 h-5 text-slate-600" />
                      </div>
                      <div className="flex-1">
                        <p className="font-semibold text-slate-800">
                          此名單使用舊格式儲存，篩選條件暫時無法編輯
                        </p>
                        <p className="text-xs text-slate-600 mt-1">
                          系統將於 Phase 3a 完成資料轉換（E2 backfill migration）後恢復編輯。目前您仍可調整名單名稱、撈案期間與 CR 設定，並可推進階段 / 停用名單（US-123 AC-2 / 拍板 2）。
                        </p>
                      </div>
                    </div>
                  )}

                  {/* LEGACY 唯讀摘要 */}
                  {isLegacy && (
                    <ReadOnlyConditionSummary list={list} />
                  )}

                  {/* US-144 AC-3：系統固定條件鎖定列（best_case → Y），恆顯示於使用者條件之上 */}
                  {!isLegacy &&
                    systemFixedFields.map((f) => (
                      <div
                        key={`sysfixed-${f.columnName}`}
                        data-testid={`condition-row-${f.columnName}`}
                        data-system-fixed="true"
                        className="p-3 bg-blue-50/40 border border-blue-200 rounded-lg space-y-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Lock className="w-3.5 h-3.5 text-primary shrink-0" />
                            <span className="font-medium text-sm text-gray-800">
                              {f.displayName}（系統固定）
                            </span>
                            <code className="text-[10px] font-mono text-gray-500">
                              {f.columnName}
                            </code>
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-700">
                              系統固定
                            </span>
                          </div>
                          {/* US-144 AC-3：刻意不渲染 remove-condition-{columnName}（不可移除） */}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs text-gray-500 font-mono">IN</span>
                          <div className="flex-1 flex items-center gap-2 flex-wrap min-h-[36px] px-2 py-1 border border-blue-200 rounded-md bg-blue-50/60">
                            <span
                              data-testid={`value-${f.columnName}`}
                              aria-disabled="true"
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-100 text-blue-800"
                            >
                              <Lock className="w-2.5 h-2.5" />
                              {systemFixedValueLabel(f.columnName)}
                            </span>
                            <span
                              className="ml-auto inline-flex items-center gap-1 text-[10px] text-gray-400"
                              aria-disabled="true"
                            >
                              <Lock className="w-3 h-3" />
                              唯讀
                            </span>
                          </div>
                        </div>
                        <p className="text-[11px] text-gray-500">
                          此條件由系統固定為 Y（優質案件），無法移除或修改。
                        </p>
                      </div>
                    ))}

                  {/* 一般模式 condition list */}
                  {!isLegacy && conditions.length === 0 && (
                    <div className="rounded-lg border border-dashed border-gray-200 p-8 flex flex-col items-center text-center">
                      <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                        <Filter className="w-6 h-6 text-gray-400" />
                      </div>
                      <p className="text-sm text-gray-500">
                        除系統固定的「優質案件」外，此名單尚無其他篩選條件
                      </p>
                    </div>
                  )}
                  {!isLegacy && conditions.length > 0 && (
                    <div className="space-y-2">
                      {conditions.map((c, idx) => {
                        const f = fields.find((x) => x.columnName === c.columnName);
                        if (!f) return null;
                        return (
                          <div key={c.id}>
                            {idx > 0 && (
                              <div className="flex items-center gap-2 py-1 -mb-1">
                                <div className="flex-1 h-px bg-gray-200" />
                                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                                  且 AND
                                </span>
                                <div className="flex-1 h-px bg-gray-200" />
                              </div>
                            )}
                            <div
                              data-testid={`condition-row-${idx}`}
                              className="p-3 bg-gray-50/50 border border-gray-200 rounded-lg space-y-2"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] font-mono text-gray-400 w-6">
                                    #{idx + 1}
                                  </span>
                                  <span className="font-medium text-sm text-gray-800">
                                    {f.displayName}
                                  </span>
                                  <code className="text-[10px] font-mono text-gray-500">
                                    {f.columnName}
                                  </code>
                                  {renderTypeBadge(f.fieldType)}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => removeCondition(c.id)}
                                  data-testid={`btn-remove-condition-${idx}`}
                                  className="p-1.5 text-gray-400 hover:text-danger hover:bg-red-50 rounded transition shrink-0"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>

                              {f.fieldType === 'categorical' && (
                                <CategoricalValuesPicker
                                  idx={idx}
                                  cond={c}
                                  options={optionsByColumn[c.columnName] ?? []}
                                  dropdownOpen={valueDropdownOpen === c.id}
                                  onToggleDropdown={() =>
                                    setValueDropdownOpen((v) =>
                                      v === c.id ? null : c.id,
                                    )
                                  }
                                  onToggleValue={(v) => toggleCatValue(c.id, v)}
                                />
                              )}
                              {f.fieldType === 'numeric' && (
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-xs text-gray-500 font-mono">BETWEEN</span>
                                  <input
                                    type="number"
                                    data-testid={`input-numeric-min-${idx}`}
                                    min={0}
                                    step={1}
                                    value={c.min ?? ''}
                                    onChange={(e) => updateNumeric(c.id, 'min', e.target.value)}
                                    placeholder="min"
                                    className="w-24 px-2.5 py-1.5 border border-gray-200 rounded-md text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
                                  />
                                  <span className="text-xs text-gray-400">~</span>
                                  <input
                                    type="number"
                                    data-testid={`input-numeric-max-${idx}`}
                                    min={0}
                                    step={1}
                                    value={c.max ?? ''}
                                    onChange={(e) => updateNumeric(c.id, 'max', e.target.value)}
                                    placeholder="max"
                                    className="w-24 px-2.5 py-1.5 border border-gray-200 rounded-md text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
                                  />
                                </div>
                              )}
                              {f.fieldType === 'date' && (
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-xs text-gray-500 font-mono">BETWEEN</span>
                                  <input
                                    type="date"
                                    data-testid={`input-date-start-${idx}`}
                                    value={c.dateStart ?? ''}
                                    onChange={(e) => updateDate(c.id, 'dateStart', e.target.value)}
                                    className="px-2.5 py-1.5 border border-gray-200 rounded-md text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
                                  />
                                  <span className="text-xs text-gray-400">~</span>
                                  <input
                                    type="date"
                                    data-testid={`input-date-end-${idx}`}
                                    value={c.dateEnd ?? ''}
                                    onChange={(e) => updateDate(c.id, 'dateEnd', e.target.value)}
                                    className="px-2.5 py-1.5 border border-gray-200 rounded-md text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
                                  />
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* INACTIVE 警示 */}
                  {!isLegacy && hasInactive && (
                    <div
                      data-testid="inactive-warning-banner"
                      className="rounded-lg p-3 bg-amber-50 border border-amber-200 flex items-start gap-2 text-sm"
                    >
                      <AlertTriangle className="w-4 h-4 text-warning mt-0.5 shrink-0" />
                      <div className="flex-1">
                        <p className="font-semibold text-amber-900">
                          {inactiveDetails.length} 個可選值已停用，將被保留但月跑 Stage 1 不會匹配
                        </p>
                        <p className="text-xs text-amber-800 mt-0.5">
                          {inactiveDetails
                            .map((d) => `${d.columnName}.${d.value}（${d.label}）`)
                            .join('、')}
                        </p>
                        <p className="text-xs text-amber-700 mt-1">
                          如需重新啟用請至{' '}
                          <Link
                            to="/assignment/field-base?tab=options"
                            className="underline font-medium"
                          >
                            「篩選欄位 &gt; 可選值管理」
                          </Link>
                          。
                        </p>
                      </div>
                    </div>
                  )}
                </section>

                {/* 4: CR 回分規則 */}
                <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-primary text-white text-xs font-semibold inline-flex items-center justify-center">
                      4
                    </span>
                    <h2 className="text-base font-semibold text-gray-800">CR 回分規則</h2>
                  </div>
                  <label className="flex items-center gap-3 cursor-pointer p-3 bg-gray-50/50 rounded-lg border border-gray-200">
                    <input
                      type="checkbox"
                      data-testid="input-crEnabled"
                      checked={crEnabled}
                      onChange={(e) => setCrEnabled(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-2 focus:ring-primary/20"
                    />
                    <div>
                      <span className="text-sm font-medium text-gray-700">
                        本名單啟用 CR 回分
                      </span>
                      <p
                        className={`text-xs mt-0.5 ${crEnabled ? 'text-success' : 'text-gray-500'}`}
                      >
                        {crEnabled
                          ? '啟用中：曾被分派但未成交的客戶將重新納入分派'
                          : '已停用：僅納入新增及尚未被分派的客戶'}
                      </p>
                    </div>
                  </label>
                </section>

                {/* Footer */}
                <div className="sticky bottom-0 bg-white/95 backdrop-blur border-t border-gray-200 -mx-6 px-6 py-3 flex items-center justify-between">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => navigate('/assignment/list-definitions')}
                  >
                    取消
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    data-testid="btn-save"
                    loading={submitting}
                    loadingText="儲存中..."
                    title={
                      isLegacy
                        ? '僅儲存名單名稱、撈案期間、CR 設定。篩選條件需待系統完成資料轉換後方可修改。'
                        : undefined
                    }
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <Save className="w-4 h-4" />
                      {isLegacy ? '儲存（不含篩選條件）' : '儲存變更'}
                    </span>
                  </Button>
                </div>
              </form>
            </>
          )}
        </div>
      </main>
    </AppLayout>
  );
}

// ============================================================================
// Sub-component: ReadOnlyConditionSummary（LEGACY 唯讀摘要）
//   對齊 prototype 27b L842-882 5 個 entity column fallback 顯示
// ============================================================================
function ReadOnlyConditionSummary({ list }: { list: AssignmentListItem }) {
  const fallback: Array<{ col: keyof typeof LEGACY_ENTITY_DISPLAY; values: string }> = [];
  if (list.prodKind) fallback.push({ col: 'prod_kind', values: list.prodKind });
  if (list.caseYear) fallback.push({ col: 'caseyear', values: list.caseYear });
  if (list.specTp) fallback.push({ col: 'spec_tp', values: list.specTp });
  if (list.caseStatus) fallback.push({ col: 'case_status', values: list.caseStatus });
  if (list.settleSrc) fallback.push({ col: 'settle_src', values: list.settleSrc });

  if (fallback.length === 0) {
    return (
      <div
        data-testid="readonly-condition-summary"
        className="rounded-lg border border-slate-200 p-6 text-center text-sm text-slate-400 bg-slate-50"
      >
        舊格式名單無 entity column fallback 值
      </div>
    );
  }

  return (
    <div data-testid="readonly-condition-summary" className="space-y-2">
      {fallback.map((row, idx) => {
        const displayName = LEGACY_ENTITY_DISPLAY[row.col];
        const rawVals = row.values.split('$$').filter(Boolean);
        return (
          <div key={row.col}>
            {idx > 0 && (
              <div className="flex items-center gap-2 py-1 -mb-1">
                <div className="flex-1 h-px bg-slate-200" />
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                  且 AND
                </span>
                <div className="flex-1 h-px bg-slate-200" />
              </div>
            )}
            <div
              className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2"
              aria-disabled="true"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-slate-400 w-6">
                    #{idx + 1}
                  </span>
                  <span className="font-medium text-sm text-slate-700">
                    {displayName}
                  </span>
                  <code className="text-[10px] font-mono text-slate-500">{row.col}</code>
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-slate-200 text-slate-600">
                    LEGACY
                  </span>
                </div>
                <span className="text-xs text-slate-400 italic">read-only</span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-slate-500 font-mono">IN</span>
                <div className="flex-1 flex items-center gap-2 flex-wrap min-h-[36px] px-2 py-1 border border-slate-200 rounded-md bg-slate-100/50">
                  {rawVals.length === 0 ? (
                    <span className="text-xs text-slate-400">無值</span>
                  ) : (
                    rawVals.map((v) => (
                      <span
                        key={v}
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-200 text-slate-600"
                      >
                        {v}
                      </span>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================================
// Sub-component: CategoricalValuesPicker（與 list-create-draft-page 同實作）
// ============================================================================
interface CategoricalValuesPickerProps {
  idx: number;
  cond: BuilderCondition;
  options: PooldataOption[];
  dropdownOpen: boolean;
  onToggleDropdown: () => void;
  onToggleValue: (v: string) => void;
}

function CategoricalValuesPicker({
  idx,
  cond,
  options,
  dropdownOpen,
  onToggleDropdown,
  onToggleValue,
}: CategoricalValuesPickerProps) {
  const selected = cond.values ?? [];
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs text-gray-500 font-mono">IN</span>
      <div className="flex-1 flex items-center gap-2 flex-wrap min-h-[36px] px-2 py-1 border border-gray-200 rounded-md bg-white">
        {selected.length === 0 ? (
          <span className="text-xs text-gray-400">未選擇任何值</span>
        ) : (
          selected.map((v) => {
            const opt = options.find((o) => o.optionValue === v);
            const isInactive = opt ? !opt.isActive : false;
            const label = opt ? opt.optionLabel : v;
            return (
              <span
                key={v}
                data-testid={`value-chip-${idx}-${v}`}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${
                  isInactive
                    ? 'bg-amber-100 text-amber-800 border border-amber-300'
                    : 'bg-blue-100 text-blue-800'
                }`}
              >
                {isInactive && <AlertTriangle className="w-2.5 h-2.5" />}
                {v} · {label}
                <button
                  type="button"
                  onClick={() => onToggleValue(v)}
                  className="hover:text-blue-900"
                  aria-label={`移除 ${v}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            );
          })
        )}
        <div className="relative ml-auto">
          <button
            type="button"
            data-testid={`btn-open-values-${idx}`}
            onClick={onToggleDropdown}
            className="text-xs px-2 py-1 border border-gray-200 rounded-md text-primary hover:bg-blue-50 inline-flex items-center gap-1"
          >
            <Plus className="w-3 h-3" />
            選擇值
            <span className="text-gray-400">({options.filter((o) => o.isActive).length})</span>
          </button>
          {dropdownOpen && (
            <div
              data-testid={`values-dropdown-${idx}`}
              className="absolute right-0 top-full mt-1 w-72 bg-white border border-gray-200 rounded-md shadow-lg z-10 max-h-60 overflow-y-auto"
            >
              {options.length === 0 ? (
                <div className="px-3 py-4 text-center text-xs text-gray-400">
                  無可選值
                </div>
              ) : (
                options.map((o) => (
                  <label
                    key={o.optionValue}
                    className={`flex items-center gap-2 px-2.5 py-1.5 hover:bg-gray-50 cursor-pointer text-sm ${!o.isActive ? 'opacity-70' : ''}`}
                  >
                    <input
                      type="checkbox"
                      data-testid={`value-checkbox-${idx}-${o.optionValue}`}
                      checked={selected.includes(o.optionValue)}
                      onChange={() => onToggleValue(o.optionValue)}
                      className="rounded text-primary"
                    />
                    <span className="font-mono text-xs text-gray-500 w-8">
                      {o.optionValue}
                    </span>
                    <span className="text-gray-700">
                      {o.optionLabel}
                      {!o.isActive && (
                        <span className="text-amber-600 ml-1">(已停用)</span>
                      )}
                    </span>
                  </label>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
