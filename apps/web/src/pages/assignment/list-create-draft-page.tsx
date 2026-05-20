import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Hash,
  Save,
  Plus,
  X,
  Copy,
  CheckCircle2,
  ChevronRight,
  ChevronDown,
  ShieldCheck,
  AlertTriangle,
  Filter,
  ArrowRight,
  ArrowRightCircle,
  Trash2,
  HelpCircle,
  Calculator,
} from 'lucide-react';
import { AppLayout } from '@/components/layout/app-layout';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import {
  createList,
  listLists,
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
import {
  CopyFromPrevMonthModal,
  computePrevYm,
} from './_components/copy-from-prev-month-modal';

/**
 * F050 v2.1 — 建立草稿名單頁（Phase 5d 波 8 重寫）
 *
 * 對應 prototype: /prototypes/27a-list-create-draft.html L173-348（4 section）
 *                + L386-433（AdvanceConfirmModal 含 UI-Q1 INACTIVE 確認）
 *
 * 區塊順序（嚴格對齊 prototype 不換序）：
 *   1. 基本資訊（list_nm + cardType + prodBest）
 *   2. 撈案期間（listPeriodStart/End/Interval；一級保留欄位 BR-8 / J8）
 *   3. 篩選條件（condition_payload-driven，dynamic builder）
 *   4. CR 回分規則（per-LIST）
 *
 * Whitelist source of truth：
 *   - listFields({ active: 'true' }) — 5d 後唯一篩選欄位來源（F068 廢除）
 *   - listOptions(columnName, { active: 'true' }) — categorical 欄位值
 *   - list_period_* 為一級保留欄位，不在 condition_payload 中（BR-8）
 *
 * DTO 對應：v2.1 CreateListRequest（5a backend 落地）
 *   - 必填：listNm + conditionPayload + listPeriodStart/End/Interval
 *   - 移除：prodKind / caseYear / specTp / caseStatus / settleSrc（5 個 v2.0 一級欄位）
 *   - 衍生規則 §18.6 由後端執行（前端不傳）
 *
 * 拍板 UI-Q1：含 INACTIVE 推進需 checkbox 雙重確認
 */

type ConditionFieldType = FieldType;

interface BuilderCondition {
  /** 內部 stable id，用於 React key 與 testid */
  id: number;
  columnName: string;
  fieldType: ConditionFieldType;
  /** categorical only */
  values?: string[];
  /** numeric only */
  min?: number | '';
  max?: number | '';
  /** date only */
  dateStart?: string;
  dateEnd?: string;
}

/** 對應 ConditionItem（送 API 用） */
function toConditionItem(c: BuilderCondition): ConditionItem {
  const base: ConditionItem = { columnName: c.columnName, fieldType: c.fieldType };
  if (c.fieldType === 'categorical') {
    base.values = c.values ?? [];
  } else if (c.fieldType === 'numeric') {
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

export function ListCreateDraftPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [searchParams] = useSearchParams();
  const fromYm = searchParams.get('ym') ?? '';

  // ─── Form state ───
  const [listNm, setListNm] = useState('');
  const [cardType, setCardType] = useState('');
  // v2.1.1（US-128 / D2 / Q-B B3）：prodBest 一級欄位移除；業務語意改由
  //   condition_payload.conditions[columnName='best_case'] 承接（BR-12）。
  //   state / DTO 寫入 / input element 全部移除。
  const [listPeriodStart, setListPeriodStart] = useState<string>('');
  const [listPeriodEnd, setListPeriodEnd] = useState<string>('');
  const [listInterval, setListInterval] = useState<string>('');
  const [crEnabled, setCrEnabled] = useState(true);

  // v2.1.1（US-126 / AC-16）：cardType 下拉資料 + fallback 狀態
  const [cardTypes, setCardTypes] = useState<CardTypeListItem[]>([]);
  const [cardTypesLoadFailed, setCardTypesLoadFailed] = useState(false);

  const [conditions, setConditions] = useState<BuilderCondition[]>([]);
  const [condIdSeq, setCondIdSeq] = useState(1);

  // ─── UI state ───
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addDropdownOpen, setAddDropdownOpen] = useState(false);
  const [valueDropdownOpen, setValueDropdownOpen] = useState<number | null>(null);
  const [advanceModalOpen, setAdvanceModalOpen] = useState(false);
  const [inactiveAcknowledged, setInactiveAcknowledged] = useState(false);
  const [crTooltipOpen, setCrTooltipOpen] = useState(false);

  // ─── Whitelist fields / options ───
  const [fields, setFields] = useState<PooldataField[]>([]);
  const [optionsByColumn, setOptionsByColumn] = useState<Record<string, PooldataOption[]>>({});
  const [copyFromListNo, setCopyFromListNo] = useState<string | null>(null);

  // ─── 從上月複製 modal state ───
  const currentYm = fromYm
    ? fromYm.replace('-', '')
    : (() => {
        const now = new Date();
        return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
      })();
  const prevYm = computePrevYm(currentYm);
  const currentYmDisplay =
    currentYm.length === 6 ? `${currentYm.slice(0, 4)}-${currentYm.slice(4)}` : currentYm;
  const prevYmDisplay =
    prevYm.length === 6 ? `${prevYm.slice(0, 4)}-${prevYm.slice(4)}` : prevYm;
  const [copyModalOpen, setCopyModalOpen] = useState(false);
  const [prevLists, setPrevLists] = useState<AssignmentListItem[]>([]);
  const [prevLoading, setPrevLoading] = useState(false);

  // 載入 active fields（whitelist source of truth；list_period_* 不在 whitelist）
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

  // v2.1.1（US-126 / AC-16）：載入 cardTypes（建立模式只列 status=active）
  // API 失敗時設 cardTypesLoadFailed=true → 渲染 fallback 提示，不阻擋儲存
  useEffect(() => {
    let aborted = false;
    void (async () => {
      try {
        const data = await listCardTypes('active');
        if (!aborted) {
          // 對齊 prototype 27a — 依 cardType 升冪
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

  // ─── 載入某欄位的 options（categorical 才需要） ───
  const ensureOptions = useCallback(
    async (columnName: string) => {
      if (optionsByColumn[columnName]) return;
      try {
        const data = await listOptions(columnName, { active: 'true' });
        setOptionsByColumn((prev) => ({ ...prev, [columnName]: data.options ?? [] }));
      } catch {
        setOptionsByColumn((prev) => ({ ...prev, [columnName]: [] }));
      }
    },
    [optionsByColumn],
  );

  // ─── 條件操作 helper ───
  const usedCols = useMemo(
    () => new Set(conditions.map((c) => c.columnName)),
    [conditions],
  );
  const availableFields = useMemo(
    () => fields.filter((f) => f.isActive && !usedCols.has(f.columnName)),
    [fields, usedCols],
  );

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

  const updateNumeric = useCallback(
    (id: number, key: 'min' | 'max', v: string) => {
      setConditions((prev) =>
        prev.map((c) =>
          c.id === id ? { ...c, [key]: v === '' ? '' : Number(v) } : c,
        ),
      );
    },
    [],
  );

  const updateDate = useCallback(
    (id: number, key: 'dateStart' | 'dateEnd', v: string) => {
      setConditions((prev) =>
        prev.map((c) => (c.id === id ? { ...c, [key]: v } : c)),
      );
    },
    [],
  );

  // ─── INACTIVE 偵測（prototype 27a L750-765 / BR-9 / AC-13） ───
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

  // ─── Stage 0 預覽 mock（對齊 prototype 27a L767-775） ───
  const previewCount = useMemo(() => {
    const valid = conditions.filter(isConditionComplete);
    if (valid.length === 0) return null;
    let n = 12500;
    valid.forEach((_c, i) => {
      n = Math.floor(n * (0.85 - i * 0.08));
    });
    return Math.max(0, n);
  }, [conditions]);

  // ─── validation ───
  const validate = useCallback((): string | null => {
    if (!listNm.trim()) return '請輸入名單名稱';
    if (listPeriodStart === '' || listPeriodEnd === '' || listInterval === '') {
      return '撈案期間三欄皆為必填';
    }
    if (Number(listPeriodEnd) < Number(listPeriodStart)) {
      return '結束期數需大於等於開始期數';
    }
    if (conditions.length === 0) {
      return '請至少設定一個篩選條件';
    }
    const incomplete = conditions.find((c) => !isConditionComplete(c));
    if (incomplete) {
      return '部分條件尚未填寫完整（categorical 需至少 1 個值；numeric 需 min/max；date 需起迄）';
    }
    return null;
  }, [listNm, listPeriodStart, listPeriodEnd, listInterval, conditions]);

  // ─── 送出 ───
  const buildPayload = useCallback((): ConditionPayload => {
    return {
      conditions: conditions.map(toConditionItem),
      logic: 'AND',
    };
  }, [conditions]);

  const submitDraft = useCallback(async () => {
    setError(null);
    const err = validate();
    if (err) {
      setError(err);
      showToast(err, 'error');
      return;
    }
    setSubmitting(true);
    try {
      const dto: Record<string, unknown> = {
        listNm: listNm.trim(),
        listPeriodStart: Number(listPeriodStart),
        listPeriodEnd: Number(listPeriodEnd),
        listInterval: Number(listInterval),
        crEnabled,
        conditionPayload: buildPayload(),
      };
      if (cardType) dto.cardType = cardType;
      // v2.1.1（US-128）：prodBest 不再從 DTO 送出（業務語意改由 condition_payload
      //   conditions[columnName='best_case'] 承接，BR-12）
      if (copyFromListNo) dto.copyFromListNo = copyFromListNo;

      const result = (await createList(dto)) as { listNo: string };
      showToast(`名單 ${result.listNo} 已建立`, 'success');
      navigate('/assignment/list-definitions');
    } catch (err: unknown) {
      const e = err as {
        response?: { status?: number; data?: { error?: string; message?: string } };
      };
      const msg = e?.response?.data?.message ?? '建立失敗，請稍後再試';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  }, [
    validate,
    listNm,
    listPeriodStart,
    listPeriodEnd,
    listInterval,
    crEnabled,
    cardType,
    // v2.1.1（US-128）：prodBest 已移除
    copyFromListNo,
    buildPayload,
    showToast,
    navigate,
  ]);

  const handleSaveDraft = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault();
      void submitDraft();
    },
    [submitDraft],
  );

  const openAdvanceModal = useCallback(() => {
    setError(null);
    const err = validate();
    if (err) {
      setError(err);
      showToast(err, 'error');
      return;
    }
    setInactiveAcknowledged(false);
    setAdvanceModalOpen(true);
  }, [validate, showToast]);

  const confirmAdvance = useCallback(async () => {
    // 推進＝先存草稿（後端會處理 stage 升級；MVP 此處沿用 createList）
    await submitDraft();
    setAdvanceModalOpen(false);
  }, [submitDraft]);

  // ─── 從上月複製 ───
  const handleOpenCopyModal = useCallback(async () => {
    setCopyModalOpen(true);
    if (prevLists.length > 0 || !prevYm) return;
    setPrevLoading(true);
    try {
      const data = await listLists({ ym: prevYm });
      // 拍板 Q4 / AC-5：僅顯示 conditionPayload IS NOT NULL 之名單
      setPrevLists(
        (data.lists ?? []).filter(
          (l) => l.status === 'active' && l.conditionPayload != null,
        ),
      );
    } catch {
      setPrevLists([]);
    } finally {
      setPrevLoading(false);
    }
  }, [prevLists.length, prevYm]);

  const handleCopyApply = useCallback(
    (src: AssignmentListItem) => {
      const payload = src.conditionPayload;
      if (!payload) return;
      // 帶入 CR + 篩選條件；名稱不帶
      setCrEnabled(src.crEnabled ?? true);
      if (src.listPeriodStart != null) setListPeriodStart(String(src.listPeriodStart));
      if (src.listPeriodEnd != null) setListPeriodEnd(String(src.listPeriodEnd));
      if (src.listInterval != null) setListInterval(String(src.listInterval));

      // 重建 conditions，並 ensureOptions
      let nextSeq = condIdSeq;
      const newConds: BuilderCondition[] = payload.conditions.map((src) => {
        const c: BuilderCondition = {
          id: nextSeq++,
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
      });
      setCondIdSeq(nextSeq);
      setConditions(newConds);
      // load options for categorical columns
      newConds.forEach((c) => {
        if (c.fieldType === 'categorical') void ensureOptions(c.columnName);
      });

      setCopyFromListNo(src.listNo);
      setCopyModalOpen(false);
      showToast(`已從 ${src.listNo} 帶入欄位`, 'success');
    },
    [condIdSeq, ensureOptions, showToast],
  );

  // ─── Render helpers ───
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
          <span className="font-semibold text-gray-800">建立草稿名單</span>
          <span
            className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium"
            style={{ background: '#F3F4F6', color: '#6B7280' }}
          >
            草稿階段
          </span>
        </div>
      }
    >
      <main className="flex-1 p-6">
        <div className="space-y-4">
          {/* 主標題列：H1 + 月份副標 + 從上月複製 CTA（對齊 prototype 27a L146-156） */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-semibold text-gray-800">建立草稿名單</h1>
              <p className="text-sm text-gray-500 mt-1">
                月份 <code className="font-mono text-primary">{currentYmDisplay}</code> ·
                將以草稿階段建立，可隨後推進至部門比例。
              </p>
            </div>
            <button
              type="button"
              data-testid="btn-open-copy-modal"
              onClick={handleOpenCopyModal}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm border border-primary text-primary rounded-md hover:bg-blue-50 shrink-0"
            >
              <Copy className="w-4 h-4" />
              從上月複製
              <span className="text-[10px] text-gray-400 ml-1">{prevYmDisplay}</span>
            </button>
          </div>

          {/* 從上月複製成功 banner */}
          {copyFromListNo && (
            <div
              data-testid="copy-applied-banner"
              className="rounded-lg p-3 bg-green-50 border border-green-200 flex items-start gap-2 text-sm"
            >
              <CheckCircle2 className="w-4 h-4 text-green-700 mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="font-semibold text-green-900">
                  已從 <code className="font-mono">{copyFromListNo}</code> 複製篩選條件
                </p>
                <p className="text-xs text-green-800 mt-0.5">
                  名稱欄位需自行命名；CR 開關已恢復為「啟用」預設值；條件可繼續編輯。
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCopyFromListNo(null)}
                aria-label="關閉"
                className="text-green-700 hover:bg-green-100 p-1 rounded"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {error && (
            <div
              data-testid="form-error"
              className="rounded-lg p-3 bg-red-50 border border-red-200 text-sm text-red-800"
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSaveDraft} className="space-y-4">
            {/* ─────────── 1: 基本資訊 ─────────── */}
            <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-primary text-white text-xs font-semibold inline-flex items-center justify-center">
                  1
                </span>
                <h2 className="text-base font-semibold text-gray-800">基本資訊</h2>
              </div>

              {/* LIST_NO 預覽（對齊 prototype 27a L180-187） */}
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  LIST_NO（系統自動產生）
                </label>
                <div className="inline-flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-md font-mono text-sm text-gray-500">
                  <Hash className="w-4 h-4 text-gray-400" />
                  OB{currentYm}
                  <span className="text-gray-400">XXX</span>
                  <span className="text-[10px] text-gray-400 ml-1 font-sans">
                    儲存時依當月序號產生
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-12 gap-4">
                <div className="col-span-6">
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    名單名稱 <span className="text-danger">*</span>
                    <span className="text-[10px] text-gray-400 font-normal ml-1">1~50 字</span>
                  </label>
                  <input
                    data-testid="input-listNm"
                    type="text"
                    required
                    maxLength={50}
                    value={listNm}
                    onChange={(e) => setListNm(e.target.value)}
                    placeholder="例：2026-05 業務一部 主力催收"
                    className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                {/* v2.1.1（US-126 / AC-16）：卡別由 <input> 改為 <select>；options 來自
                    ob_card_type（GET /api/v1/assignment/scoring/card-types，建立模式僅列
                    status=active）；首選項「— 未選擇 —」（空值，預設選中）；API 失敗時
                    顯示 fallback 提示（不阻擋儲存）。v2.0 之 maxLength={2} 限制由下拉
                    自然消除（後端 @MaxLength(5) 對齊 ob_card_type.card_type VARCHAR(5)）。 */}
                <div className="col-span-6">
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    卡別{' '}
                    <span className="text-[10px] text-gray-400 font-normal">選填</span>
                  </label>
                  <select
                    data-testid="select-cardType"
                    value={cardType}
                    onChange={(e) => setCardType(e.target.value)}
                    disabled={cardTypesLoadFailed}
                    className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="">— 未選擇 —</option>
                    {cardTypes.map((c) => (
                      <option key={c.cardType} value={c.cardType}>
                        {c.cardType} — {c.cardName}（{c.prodKindName ?? c.prodKind}）
                      </option>
                    ))}
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
                        <p className="text-amber-800 mt-0.5">
                          卡別為選填欄位，您仍可不選卡別完成建立。
                        </p>
                      </div>
                    </div>
                  )}
                </div>
                {/* v2.1.1（US-128 / D2 / Q-B B3）：「最佳產品」prodBest input 已移除；
                    業務語意改由篩選條件區 best_case categorical condition（Y/N）承接（BR-12）。 */}
              </div>
            </section>

            {/* ─────────── 2: 撈案期間（一級保留欄位 BR-8 / J8） ─────────── */}
            <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-primary text-white text-xs font-semibold inline-flex items-center justify-center">
                  2
                </span>
                <h2 className="text-base font-semibold text-gray-800">撈案期間</h2>
                <span
                  className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-50 text-purple-700 border border-purple-200"
                  title="list_period_start / list_period_end / list_interval 為名單一級保留欄位，系統獨立處理，不可作為動態篩選條件（BR-8 / J8）"
                >
                  <ShieldCheck className="w-3 h-3 mr-0.5" />
                  一級保留欄位
                </span>
              </div>
              <p className="text-xs text-gray-500 -mt-2">
                以下三欄為名單一級保留欄位，與「篩選條件」分開設定。
              </p>
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
                  {listPeriodStart !== '' &&
                    listPeriodEnd !== '' &&
                    Number(listPeriodEnd) < Number(listPeriodStart) && (
                      <p
                        data-testid="period-error"
                        className="text-xs text-danger mt-1"
                      >
                        結束期數需大於等於開始期數
                      </p>
                    )}
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

            {/* ─────────── 3: 篩選條件（condition_payload-driven） ─────────── */}
            <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-primary text-white text-xs font-semibold inline-flex items-center justify-center">
                    3
                  </span>
                  <h2 className="text-base font-semibold text-gray-800">篩選條件</h2>
                  <span className="text-[10px] text-gray-400 ml-1">
                    條件間以「且」（AND）連接
                  </span>
                </div>
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
                          availableFields.map((f) => (
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
                          ))
                        )}
                      </ul>
                    </div>
                  )}
                </div>
              </div>

              {conditions.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-200 p-8 flex flex-col items-center text-center">
                  <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                    <Filter className="w-6 h-6 text-gray-400" />
                  </div>
                  <p className="text-sm text-gray-500">尚未新增任何篩選條件</p>
                  <p className="text-xs text-gray-400 mt-1">
                    至少需要 1 個條件方可儲存。白名單提供{' '}
                    <span data-testid="active-fields-count">
                      {fields.filter((f) => f.isActive).length}
                    </span>{' '}
                    個 active 欄位可選。
                  </p>
                </div>
              ) : (
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
                          className="cond-row p-3 bg-gray-50/50 border border-gray-200 rounded-lg space-y-2"
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
                              title="移除條件"
                              className="p-1.5 text-gray-400 hover:text-danger hover:bg-red-50 rounded transition shrink-0"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>

                          {/* 值編輯區（依 fieldType 分支） */}
                          {f.fieldType === 'categorical' && (
                            <CategoricalValuesPicker
                              idx={idx}
                              cond={c}
                              options={optionsByColumn[c.columnName] ?? []}
                              dropdownOpen={valueDropdownOpen === c.id}
                              onToggleDropdown={() =>
                                setValueDropdownOpen((v) => (v === c.id ? null : c.id))
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
                              {c.min !== '' &&
                                c.max !== '' &&
                                c.min !== undefined &&
                                c.max !== undefined &&
                                Number(c.max) < Number(c.min) && (
                                  <span className="text-[11px] text-danger ml-1">
                                    max 需 ≥ min
                                  </span>
                                )}
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
                              {c.dateStart &&
                                c.dateEnd &&
                                c.dateEnd < c.dateStart && (
                                  <span className="text-[11px] text-danger ml-1">
                                    end 需 ≥ start
                                  </span>
                                )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* INACTIVE 警示 banner（BR-9 / AC-13 / 對齊 prototype 27a L297-304） */}
              {hasInactive && (
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

              {/* Stage 0 預覽 banner（mock，對齊 prototype 27a L307-316） */}
              {previewCount !== null && (
                <div
                  data-testid="stage0-preview-banner"
                  className="rounded-lg p-3 bg-blue-50 border border-blue-200 flex items-center gap-3 text-sm"
                >
                  <Calculator className="w-5 h-5 text-primary shrink-0" />
                  <div className="flex-1">
                    <p className="font-semibold text-primary">
                      依此條件預估命中{' '}
                      <span data-testid="stage0-preview-count" className="text-lg">
                        {previewCount.toLocaleString()}
                      </span>{' '}
                      筆案件
                    </p>
                    <p className="text-xs text-blue-700/80 mt-0.5">
                      基於上月 POOLDATA 樣本估算（mock）。完整試算請使用 Stage 0 試算頁。
                    </p>
                  </div>
                  <Link
                    to="/assignment/estimate"
                    className="text-xs px-2.5 py-1 border border-primary text-primary rounded-md hover:bg-blue-100"
                  >
                    開啟 Stage 0 試算
                  </Link>
                </div>
              )}
            </section>

            {/* ─────────── 4: CR 回分規則（對齊 prototype 27a L319-345） ─────────── */}
            <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-primary text-white text-xs font-semibold inline-flex items-center justify-center">
                  4
                </span>
                <h2 className="text-base font-semibold text-gray-800">CR 回分規則</h2>
                <span className="text-[10px] text-gray-400 ml-1">per-LIST 設定</span>
              </div>
              <div className="flex items-start justify-between gap-4 p-3 bg-gray-50/50 rounded-lg border border-gray-200">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-700">本名單啟用 CR 回分</span>
                    <button
                      type="button"
                      data-testid="btn-cr-help"
                      onClick={() => setCrTooltipOpen((v) => !v)}
                      className="text-gray-400 hover:text-primary"
                      aria-label="CR 名詞解釋"
                    >
                      <HelpCircle className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p
                    className={`text-xs mt-0.5 ${crEnabled ? 'text-success' : 'text-gray-500'}`}
                  >
                    {crEnabled
                      ? '啟用中：曾被分派但未成交的客戶將重新納入分派'
                      : '已停用：僅納入新增及尚未被分派的客戶'}
                  </p>
                </div>
                {/* Toggle switch（Tailwind peer pattern，對齊 prototype CR switch） */}
                <label className="relative inline-block w-10 h-[22px] shrink-0 mt-1 cursor-pointer">
                  <input
                    type="checkbox"
                    data-testid="input-crEnabled"
                    checked={crEnabled}
                    onChange={(e) => setCrEnabled(e.target.checked)}
                    className="peer sr-only"
                  />
                  <span className="absolute inset-0 rounded-full bg-gray-300 transition peer-checked:bg-success" />
                  <span className="absolute top-[3px] left-[3px] w-4 h-4 rounded-full bg-white shadow transition peer-checked:translate-x-[18px]" />
                </label>
              </div>
              {crTooltipOpen && (
                <div
                  data-testid="cr-tooltip-box"
                  className="text-xs text-gray-600 bg-blue-50/50 border border-blue-100 rounded-md p-3"
                >
                  <p className="font-semibold text-primary mb-1">
                    CR = Customer Recycling（客戶回分）
                  </p>
                  <p>
                    啟用時，過去月份曾被分派但未成交（未進入結案流程）的客戶將被重新納入本次分派候選名單。停用則僅納入新增及尚未被分派的客戶。
                  </p>
                </div>
              )}
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
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  data-testid="btn-advance"
                  onClick={openAdvanceModal}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm border border-gray-200 text-gray-700 rounded-md hover:bg-gray-50"
                >
                  <ArrowRight className="w-4 h-4" />
                  儲存並推進至部門比例
                </button>
                <Button
                  type="submit"
                  variant="primary"
                  data-testid="btn-save-draft"
                  loading={submitting}
                  loadingText="儲存中..."
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Save className="w-4 h-4" />
                    儲存草稿
                  </span>
                </Button>
              </div>
            </div>
          </form>
        </div>
      </main>

      {/* 從上月複製 modal */}
      <CopyFromPrevMonthModal
        open={copyModalOpen}
        prevYm={prevYm}
        lists={prevLists}
        loading={prevLoading}
        onCopy={handleCopyApply}
        onClose={() => setCopyModalOpen(false)}
      />

      {/* AdvanceConfirmModal — 對齊 prototype 27a L387-433 */}
      {advanceModalOpen && (
        <AdvanceConfirmModal
          listNm={listNm}
          condCount={conditions.length}
          crEnabled={crEnabled}
          inactiveDetails={inactiveDetails}
          inactiveAcknowledged={inactiveAcknowledged}
          onToggleAck={setInactiveAcknowledged}
          loading={submitting}
          onCancel={() => setAdvanceModalOpen(false)}
          onConfirm={() => void confirmAdvance()}
        />
      )}
    </AppLayout>
  );
}

// ============================================================================
// Sub-component: CategoricalValuesPicker
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

// ============================================================================
// Sub-component: AdvanceConfirmModal
// ============================================================================
interface AdvanceConfirmModalProps {
  listNm: string;
  condCount: number;
  crEnabled: boolean;
  inactiveDetails: Array<{ columnName: string; value: string; label: string }>;
  inactiveAcknowledged: boolean;
  onToggleAck: (v: boolean) => void;
  loading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

function AdvanceConfirmModal({
  listNm,
  condCount,
  crEnabled,
  inactiveDetails,
  inactiveAcknowledged,
  onToggleAck,
  loading,
  onCancel,
  onConfirm,
}: AdvanceConfirmModalProps) {
  const hasInactive = inactiveDetails.length > 0;
  const confirmDisabled = loading || (hasInactive && !inactiveAcknowledged);

  return (
    <div
      className="fixed inset-0 z-50"
      data-testid="advance-confirm-modal"
      role="dialog"
      aria-modal="true"
    >
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
          <div className="px-5 py-4 border-b border-gray-200 flex items-center gap-2">
            <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center">
              <ArrowRightCircle className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-800">
                儲存並推進至部門比例階段？
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">F078 原子性上線約束流程</p>
            </div>
          </div>
          <div className="p-5 space-y-3">
            <p className="text-sm text-gray-700">推進後將同時：</p>
            <ul className="text-sm text-gray-600 space-y-1.5 pl-5 list-disc">
              <li>建立 LIST_NO 並寫入草稿快照</li>
              <li>鎖定篩選條件與 CR 開關（僅能 Rollback 退回後再修改）</li>
              <li>進入部門比例設定階段，處長將收到通知</li>
            </ul>
            <div className="rounded-md bg-gray-50 border border-gray-200 p-3 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-gray-500">名稱</span>
                <span className="text-gray-800 font-medium">{listNm || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">條件數</span>
                <span className="text-gray-800 font-medium">{condCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">CR 狀態</span>
                <span className="text-gray-800 font-medium">
                  {crEnabled ? '啟用' : '停用'}
                </span>
              </div>
            </div>
            {hasInactive && (
              <div
                data-testid="advance-inactive-warn"
                className="rounded-md bg-amber-50 border border-amber-300 p-3 text-xs space-y-2"
              >
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-warning mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <p className="font-semibold text-amber-900">
                      條件含已停用選項，推進後月跑 Stage 1 將忽略這些值
                    </p>
                    <p className="mt-1 text-amber-800">
                      推進後條件即被固化（離化），如需重填需先{' '}
                      <strong>Rollback 至草稿</strong>。
                    </p>
                    <p className="mt-1 text-amber-700">
                      {inactiveDetails
                        .map((d) => `${d.columnName}.${d.value}（${d.label}）`)
                        .join('、')}
                    </p>
                  </div>
                </div>
                <label className="flex items-center gap-2 mt-2 pl-6 cursor-pointer">
                  <input
                    type="checkbox"
                    data-testid="checkbox-inactive-acknowledge"
                    checked={inactiveAcknowledged}
                    onChange={(e) => onToggleAck(e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-xs text-amber-900 font-medium">
                    我已了解推進後條件將被固化
                  </span>
                </label>
              </div>
            )}
          </div>
          <div className="px-5 py-3 border-t border-gray-200 flex items-center justify-end gap-2 bg-gray-50/50">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-sm text-gray-600 hover:bg-white rounded-md border border-gray-200"
            >
              取消
            </button>
            <button
              type="button"
              data-testid="btn-confirm-advance"
              onClick={onConfirm}
              disabled={confirmDisabled}
              className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
            >
              <ArrowRight className="w-4 h-4" />
              確認推進
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
