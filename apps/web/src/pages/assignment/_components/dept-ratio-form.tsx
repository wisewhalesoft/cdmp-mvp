import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import {
  Save,
  Building2,
  Archive,
  UserCog,
  UserX,
  X,
  ArrowRight,
  Undo2,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  Lock,
  Info,
  Calculator,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RatioInput } from '@/components/e07/RatioInput';
import { useToast } from '@/components/ui/toast';
import {
  getDeptRatios,
  setDeptRatios,
  type DeptRatioItem,
} from '@/api/assignment-stage';

/**
 * M03a — 部門比例設定表單（F079 + F117）
 *
 * 對應 prototype: /prototypes/29a-dept-ratio-config.html
 * 對應 spec:      F079 §5.1 / §5.2、F117 §4（AC-1 / AC-3~AC-8）/ §7
 *
 * 範圍：
 *   - 後端 GET（帶 `requireDirector=true`）回的部門列即為可呈現集合，前端不再自行過濾。
 *     後端已依 F117 BR-2 完成三分類：
 *       * 有處長部門 → 可編輯列（`isRatioEditable = true`）
 *       * 孤兒部門（無在職處長但既有 ration > 0）→ 唯讀鎖定列（`isRatioEditable = false`，AC-3）
 *       * 無關部門（無在職處長且 ration = 0）→ 不在回應中，僅以 `hiddenNoDirectorCount` 告知（AC-8）
 *   - 使用者僅能改「可編輯列」之 ration，不能新增/刪除部門列、不能改 obdeptId/Nm。
 *   - 表格欄位：部門代碼 / 部門名稱（含「已下線」徽章） / 處長（含「無在職處長」徽章） /
 *     RATION (%) / 預估案件數 / 操作（清空；鎖定列不渲染任何寫入動作，AC-4）。
 *   - 加總即時校驗以獨立 Sum Banner 顯示，範圍涵蓋可編輯列 ＋ 孤兒鎖定列（AC-5）。
 *   - 提交 PUT /assignment/ratios/dept/:listNo（覆寫式；孤兒列由後端依 BR-4 保留）。
 *
 * 狀態標示互不混淆（F117 BR-10 / §7）：
 *   「已下線」灰徽章（`isActive = false`，部門無在職員工，F079 既有）
 *   「無在職處長」琥珀徽章（`hasActiveDirector = false`，F117 新增）
 *   兩者為正交維度，可於同一列並存。
 *
 * RBAC: Director / Admin（嵌入頁面已由 route guard 攔截；處長唯讀於頁面層處理）。
 */

export interface DeptRatioFormProps {
  listNo: string;
  /** 名單預估命中總數，用於計算各部門「預估案件數」(= totalEstimate × ration / 100)。
   *  尚無 Stage 0 整合時可省略或傳 null，UI 改顯示「—」。 */
  totalEstimate?: number | null;
  /** 完成寫入後通知父層（用於 refresh + 推進邏輯）。 */
  onSaved?: () => void;
  /** 唯讀（stage !== 'dept_ratio' 或 status !== 'active' 時鎖定）。 */
  readOnly?: boolean;
  /** 「儲存並推進」按鈕點擊；父層負責 modal 與 advance API。 */
  onRequestAdvance?: () => void;
  /** 「退回草稿」按鈕點擊；父層負責 modal 與 rollback API。 */
  onRequestRollback?: () => void;
  /** 「取消」按鈕點擊（返回名單列表）；父層提供導航。 */
  onCancel?: () => void;
}

/**
 * forwardRef 對外契約：父層可呼叫 saveCurrent() 取得「將目前表單值 PUT 至後端」
 * 的能力，用於「儲存並推進」一鍵流（先 save 再 advance；任一步失敗中止）。
 *
 * - 加總非 100% / 無可編輯部門 → 拋 Error（與 btn-save-dept-ratio disable 條件對齊）
 * - 後端 4xx/5xx → 透傳 axios 錯誤；呼叫者自行決定 UX
 * - 成功不觸發 toast / onSaved；交由呼叫者決定（避免「儲存 toast + 推進 toast」雙跳）
 */
export interface DeptRatioFormHandle {
  saveCurrent: () => Promise<void>;
}

/**
 * F117 AC-3：孤兒鎖定列判定。
 * 一律以後端 `isRatioEditable === false` 為準（`undefined` = F117 實作前之舊回應 → 可編輯）；
 * **不得**以 `directorName` 字串自行推導（F117 §5.1 欄位語意）。
 */
function isLockedRow(row: DeptRatioItem): boolean {
  return row.isRatioEditable === false;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

const sumRations = (rows: DeptRatioItem[]): number =>
  round2(rows.reduce((acc, r) => acc + (r.ration ?? 0), 0));

/** AC-8：已隱藏之「無關部門」資訊列（純告知，不阻擋操作）。 */
function HiddenDeptsNotice({ count }: { count: number }) {
  return (
    <div
      role="status"
      data-testid="hidden-depts-notice"
      className="rounded-lg p-3 bg-blue-50 border border-blue-200 flex items-start gap-2 text-sm"
    >
      <Info className="w-4 h-4 text-primary mt-0.5 shrink-0" />
      <div className="flex-1">
        <p className="text-blue-900">
          有 <span className="font-semibold">{count}</span> 個部門因目前無在職處長而未列出
        </p>
        <p className="text-xs text-blue-700 mt-0.5">
          此類部門本月無既有分派比例（比例為 0），未列出不影響加總；待處長派任後即會自動出現於清單。
        </p>
      </div>
    </div>
  );
}

/**
 * AC-7：可編輯部門數 = 0 之空狀態。
 * 文案不得沿用「目前無在職部門可設定」（會誤導為 ob_emphire 同步異常），
 * 且孤兒鎖定列仍依 AC-3 顯示於上方表格（空狀態僅針對「可編輯部門數 = 0」）。
 */
function NoActiveDirectorEmptyState() {
  return (
    <section
      data-testid="no-active-director-empty-state"
      className="bg-white rounded-xl border border-gray-200 p-10 flex flex-col items-center text-center"
    >
      <div className="w-16 h-16 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center mb-4">
        <UserX className="w-8 h-8 text-amber-600" />
      </div>
      <h3 className="text-lg font-semibold text-gray-800 mb-1">
        目前沒有任何部門具在職處長，無法設定分派比例
      </h3>
      <p className="text-sm text-gray-600 max-w-xl">
        本頁只提供「目前有在職處長」的部門設定比例。系統已完成查詢，
        <strong>這並非資料同步問題</strong>——而是目前所有部門都查不到在職處長。
      </p>
      <p className="text-sm text-gray-600 max-w-xl mt-2">
        在至少一個部門完成處長派任之前，本名單<strong>無法推進至「個別業務比例」階段</strong>
        （下一階段須由各部門處長為其業務員設定比例，無處長即無人可承接）。
      </p>
    </section>
  );
}

/** AC-3 末句：使用者須知悉孤兒列為何無法調整，以及後續處理路徑。 */
function OrphanLockedExplain({ count }: { count: number }) {
  return (
    <div
      data-testid="orphan-locked-explain"
      className="px-5 py-3 border-t border-gray-200 bg-amber-50/60 flex items-start gap-2"
    >
      <UserX className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" />
      <div className="text-xs text-amber-900">
        <p className="font-semibold">
          有 {count} 個部門目前無在職處長，但本月已有既有分派比例
        </p>
        <p className="mt-0.5 text-amber-800">
          此類部門之比例維持既有值、<strong>不會因本次儲存而被清除</strong>，但在處長派任前無法於本頁調整。
          如需變更，請先完成該部門之處長派任（派任後該列即恢復可編輯），或以「退回草稿」重設本名單全部比例。
        </p>
      </div>
    </div>
  );
}

interface DeptRatioTableRowProps {
  row: DeptRatioItem;
  readOnly?: boolean;
  caseCount: string;
  onRationChange: (obdeptId: string, ration: number) => void;
}

/** 單一部門列：三分類（可編輯 / 孤兒鎖定 / 已下線徽章）之渲染歸戶於此。 */
function DeptRatioTableRow({ row, readOnly, caseCount, onRationChange }: DeptRatioTableRowProps) {
  const locked = isLockedRow(row);
  return (
    <tr
      data-testid={`dept-row-${row.obdeptId}`}
      data-row-kind={locked ? 'orphan-locked' : 'editable'}
      className={`hover:bg-blue-50/30 ${
        locked ? 'bg-amber-50/40' : !row.isActive ? 'bg-gray-50' : ''
      }`}
    >
      <td className="px-5 py-3 font-mono text-sm text-gray-700">{row.obdeptId}</td>
      <td className="px-5 py-3">
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-sm font-medium text-gray-800">{row.obdeptNm}</span>
          {/* 「已下線」灰徽章：部門無在職員工（F079 AC-2）。與「無在職處長」正交，可並存（BR-10）。 */}
          {!row.isActive && (
            <span
              data-testid={`dept-inactive-badge-${row.obdeptId}`}
              title="部門已無在職員工（F079 AC-2）"
              className="ml-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-200 text-gray-600"
            >
              <Archive className="w-2.5 h-2.5" />已下線
            </span>
          )}
        </div>
      </td>
      <td className="px-5 py-3">
        {locked ? (
          /* 「無在職處長」琥珀膠囊徽章（F117 新增，AC-3） */
          <span
            data-testid="no-active-director-badge"
            title="查無在職處長（jfun_nm = '處長' 且在職）"
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-100 text-amber-800 border border-amber-300"
          >
            <UserX className="w-3 h-3" />無在職處長
          </span>
        ) : row.directorName ? (
          <span
            data-testid={`dept-director-${row.obdeptId}`}
            className="text-xs text-gray-600 inline-flex items-center gap-1"
          >
            <UserCog className="w-3 h-3 text-purple-600" />
            {row.directorName}
          </span>
        ) : (
          <span data-testid={`dept-director-none-${row.obdeptId}`} className="text-xs text-gray-400">
            —
          </span>
        )}
      </td>
      <td className="px-5 py-3 text-right">
        {locked ? (
          /* AC-3：孤兒列比例輸入框 disabled，既有值原樣顯示並計入加總 */
          <span className="inline-flex items-center gap-1.5 justify-end">
            <Lock className="w-3.5 h-3.5 text-amber-600" aria-hidden="true" />
            <input
              type="number"
              data-testid="ration-input-locked"
              value={row.ration ?? 0}
              disabled
              readOnly
              aria-label={`${row.obdeptNm} 分派比例（唯讀鎖定：無在職處長）`}
              className="w-24 px-3 py-1.5 text-right text-sm font-mono border border-amber-300 rounded-md bg-amber-50/60 text-amber-800 cursor-not-allowed"
            />
          </span>
        ) : (
          <RatioInput
            value={row.ration}
            disabled={readOnly}
            onChange={(v) => onRationChange(row.obdeptId, v)}
            aria-label={`ratio-${row.obdeptId}`}
          />
        )}
      </td>
      <td
        className="px-5 py-3 text-right text-sm text-gray-600 tabular-nums"
        data-testid={`dept-case-count-${row.obdeptId}`}
      >
        {caseCount}
      </td>
      <td className="px-5 py-3 text-right">
        {/* AC-4：孤兒鎖定列不渲染任何寫入動作（含既有「清空」鈕），以免暗示不存在之出場操作 */}
        {!readOnly && !locked ? (
          <button
            type="button"
            data-testid={`btn-clear-${row.obdeptId}`}
            onClick={() => onRationChange(row.obdeptId, 0)}
            aria-label={`清空 ${row.obdeptNm}`}
            className="inline-flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-red-600 hover:bg-red-50 rounded"
            title="清空"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        ) : (
          <span className="text-xs text-gray-300" title={locked ? '無在職處長，無法調整' : undefined}>
            —
          </span>
        )}
      </td>
    </tr>
  );
}

interface DeptRatioSumBannerProps {
  editableSum: number;
  lockedSum: number;
}

/**
 * AC-5：即時加總 Banner。加總範圍 = 可編輯列 ＋ 孤兒鎖定列
 * （已隱藏之無關部門 ration 恆 0，對加總零影響，BR-3），
 * 與後端「最終持久化集合」之加總驗證基準一致（BR-7）。
 */
function DeptRatioSumBanner({ editableSum, lockedSum }: DeptRatioSumBannerProps) {
  const sum = round2(editableSum + lockedSum);
  const sumValid = Math.abs(sum - 100) <= 0.01;
  const diff = sum - 100;
  return (
    <section
      data-testid="dept-ratio-sum-banner"
      data-valid={sumValid ? 'true' : 'false'}
      data-sum-editable={editableSum.toFixed(1)}
      data-sum-locked={lockedSum.toFixed(1)}
      role="status"
      aria-live="polite"
      className={`rounded-xl border-2 p-4 transition-colors flex items-center justify-between gap-4 ${
        sumValid ? 'bg-green-50 border-green-300' : 'bg-red-50 border-red-300'
      }`}
    >
      <div className="flex items-center gap-3">
        <div
          className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-white ${
            sumValid ? 'bg-green-500' : 'bg-red-500'
          }`}
        >
          {sumValid ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
        </div>
        <div>
          <p className={`text-base font-semibold ${sumValid ? 'text-green-700' : 'text-red-700'}`}>
            {sumValid
              ? `目前總和：${sum.toFixed(1)}% ✓`
              : `目前總和：${sum.toFixed(1)}%（${diff > 0 ? `超 ${diff.toFixed(1)}%` : `差 ${(-diff).toFixed(1)}%`} 需調整至 100%）`}
          </p>
          <p className={`text-xs mt-0.5 ${sumValid ? 'text-green-700' : 'text-red-700'}`}>
            {sumValid
              ? '所有將被儲存的部門 RATION 加總落於容忍範圍 [99.99, 100.01]，可儲存並推進。'
              : lockedSum > 0
              ? `加總含鎖定部門之 ${lockedSum.toFixed(1)}%（不可調整）；請以可編輯部門補足或調降至 100%。`
              : diff > 0
              ? '加總超過 100%，請調降部分部門 RATION（或將某些部門設為 0%）。'
              : '加總未達 100%，請補足剩餘比例（0% 為合法值表示該部門本月不分派）。'}
          </p>
          {/* AC-5：加總組成說明——讓使用者理解為何加總含一個不可編輯的值 */}
          {lockedSum > 0 && (
            <p
              data-testid="dept-ratio-sum-breakdown"
              className="text-xs mt-1 inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-white/70 border border-gray-200 text-gray-600"
            >
              <Calculator className="w-3 h-3" />
              <span>
                加總組成：可編輯部門 <span className="font-semibold tabular-nums">{editableSum.toFixed(1)}</span>%
                ＋ 鎖定部門 <span className="font-semibold tabular-nums">{lockedSum.toFixed(1)}</span>%
                （無在職處長，值不可調整但計入加總）
              </span>
            </p>
          )}
        </div>
      </div>
      <div className="text-right">
        <p className="text-[10px] text-gray-400 uppercase tracking-wider">即時加總</p>
        <p className={`text-3xl font-bold tabular-nums ${sumValid ? 'text-green-700' : 'text-red-700'}`}>
          {sum.toFixed(1)}<span className="text-base font-normal">%</span>
        </p>
      </div>
    </section>
  );
}

export const DeptRatioForm = forwardRef<DeptRatioFormHandle, DeptRatioFormProps>(function DeptRatioForm({
  listNo,
  totalEstimate,
  onSaved,
  readOnly,
  onRequestAdvance,
  onRequestRollback,
  onCancel,
}: DeptRatioFormProps, ref) {
  const { showToast } = useToast();
  const [rows, setRows] = useState<DeptRatioItem[]>([]);
  const [hiddenNoDirectorCount, setHiddenNoDirectorCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let aborted = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        // F117 AC-1：設定頁一律帶 requireDirector=true（其餘既有消費端不帶，AC-10 回歸）。
        const data = await getDeptRatios(listNo, { requireDirector: true });
        if (aborted) return;
        setRows(data.deptRatios ?? []);
        setHiddenNoDirectorCount(data.hiddenNoDirectorCount ?? 0);
      } catch (err: unknown) {
        const e = err as { response?: { data?: { message?: string } } };
        if (!aborted) setError(e?.response?.data?.message ?? '載入部門比例失敗');
      } finally {
        if (!aborted) setLoading(false);
      }
    })();
    return () => {
      aborted = true;
    };
  }, [listNo]);

  const lockedRows = useMemo(() => rows.filter(isLockedRow), [rows]);
  const editableRows = useMemo(() => rows.filter((r) => !isLockedRow(r)), [rows]);
  const editableSum = useMemo(() => sumRations(editableRows), [editableRows]);
  const lockedSum = useMemo(() => sumRations(lockedRows), [lockedRows]);

  const sum = round2(editableSum + lockedSum);
  const sumValid = Math.abs(sum - 100) <= 0.01;
  /** AC-7：可編輯部門數 = 0 → 無任何可儲存之變更（孤兒列之值由伺服器依 BR-4 / BR-5 保留）。 */
  const hasEditableDept = editableRows.length > 0;
  const canSubmit = sumValid && hasEditableDept;

  const updateRation = (obdeptId: string, ration: number) =>
    setRows((prev) => prev.map((r) => (r.obdeptId === obdeptId ? { ...r, ration } : r)));

  /** 核心 PUT 流程（共用於「儲存」按鈕與「儲存並推進」一鍵流）。
   *  - 前置條件不符 → throw（呼叫者自行 toast）
   *  - 後端錯誤 → 透傳 axios 錯誤
   *  - 成功 → 不 toast、不呼叫 onSaved（由呼叫者決定 UX 連動）
   *
   *  payload 僅含可編輯列：孤兒鎖定列之值不可由前端變更（AC-4），其保留為伺服器端不變式
   *  （BR-4：不論是否出現於 payload 皆原樣寫回；BR-5：payload 帶入之值一律忽略）。
   *  前端加總校驗涵蓋鎖定列（AC-5），故與後端「最終持久化集合」之判定基準一致（BR-7）。 */
  const performSave = async (): Promise<void> => {
    if (!hasEditableDept) {
      throw new Error('目前沒有任何部門具在職處長，無可設定之部門比例');
    }
    if (!sumValid) {
      throw new Error(`加總須為 100%，目前為 ${sum.toFixed(2)}%`);
    }
    const payload = editableRows.map((r) => ({
      obdeptId: r.obdeptId,
      obdeptNm: r.obdeptNm,
      ration: Number(r.ration ?? 0),
    }));
    setSaving(true);
    try {
      await setDeptRatios(listNo, { deptRatios: payload });
    } finally {
      setSaving(false);
    }
  };

  useImperativeHandle(ref, () => ({ saveCurrent: performSave }), [rows, sumValid, sum, listNo]);

  const handleSave = async () => {
    setError(null);
    try {
      await performSave();
      const lockedNote =
        lockedRows.length > 0
          ? `（含 ${lockedRows.length} 個無在職處長之鎖定部門，既有比例原樣保留）`
          : '';
      showToast(
        `部門比例已儲存（${editableRows.length} 部門 / 加總 ${sum}%）${lockedNote}`,
        'success',
      );
      onSaved?.();
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: { message?: string } } };
      const msg = e?.response?.data?.message ?? (err instanceof Error ? err.message : '儲存失敗，請稍後再試');
      setError(msg);
      showToast(msg, 'error');
    }
  };

  if (loading) {
    return (
      <div className="p-6 text-center text-gray-400" data-testid="dept-ratio-loading">
        載入部門比例中...
      </div>
    );
  }

  const caseCountFor = (ration: number): string => {
    if (totalEstimate == null) return '—';
    return Math.round((totalEstimate * ration) / 100).toLocaleString();
  };

  return (
    /* `dept-ratio-form` 錨點僅於「有部門列可呈現」時掛載：回應為空陣列時本區不構成一份可填寫的
       表單，畫面等同 prototype 29a 之 `tableSection` 隱藏 + `emptyState` 顯示，此時唯一的畫面
       錨點為 AC-7 空狀態（`no-active-director-empty-state`），兩者不並存。
       注意：AC-7 末句之「可編輯部門數 = 0 但仍有孤兒鎖定列」屬 rows.length > 0，
       表格與空狀態依 spec 並存，故此處條件為 rows（可呈現列）而非 editableRows。 */
    <div className="space-y-4" data-testid={rows.length > 0 ? 'dept-ratio-form' : undefined}>
      {error && (
        <div
          data-testid="dept-ratio-error"
          className="rounded-md p-3 bg-red-50 border border-red-200 text-xs text-red-800"
        >
          {error}
        </div>
      )}

      {/* AC-8：已隱藏部門資訊列（hiddenNoDirectorCount > 0 才渲染） */}
      {hiddenNoDirectorCount > 0 && <HiddenDeptsNotice count={hiddenNoDirectorCount} />}

      {/* ===== 部門表格區（後端回空陣列時整區不渲染，改以 AC-7 空狀態呈現） ===== */}
      {rows.length > 0 && (
        <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-200 bg-gray-50/40 flex items-center gap-3 flex-wrap">
            <h2 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
              <Building2 className="w-4 h-4 text-primary" />各部門 RATION 設定
            </h2>
            <span className="text-xs text-gray-400">
              資料表 <code className="font-mono">ob_dept_pct</code> · per-LIST_NO
            </span>
            <span className="ml-auto text-[11px] text-gray-500">
              在職判定 <code className="font-mono">emphire-active.util</code> · 處長判定{' '}
              <code className="font-mono">TRIM(jfun_nm) = &apos;處長&apos;</code>（同部門取最早到職）
            </span>
          </div>

          {/* 三分類圖例（F117 §7：三種列狀態互不混淆） */}
          <div className="px-5 py-2 border-b border-gray-200 bg-white flex items-center gap-4 flex-wrap text-[11px] text-gray-500">
            <span className="text-gray-400">列狀態：</span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-green-500" />可編輯（有在職處長）
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-500" />唯讀鎖定（無在職處長，但有既有比例）
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-gray-300" />已下線（部門無在職員工，與處長判定正交）
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">
                各部門分派比例設定表；鎖定列表示該部門目前無在職處長，比例維持既有值不可調整。
              </caption>
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/30 text-xs text-gray-500 uppercase tracking-wider">
                  <th scope="col" className="text-left px-5 py-2.5 font-medium" style={{ width: '13%' }}>部門代碼</th>
                  <th scope="col" className="text-left px-5 py-2.5 font-medium" style={{ width: '24%' }}>部門名稱</th>
                  <th scope="col" className="text-left px-5 py-2.5 font-medium" style={{ width: '22%' }}>處長</th>
                  <th scope="col" className="text-right px-5 py-2.5 font-medium" style={{ width: '18%' }}>RATION (%)</th>
                  <th scope="col" className="text-right px-5 py-2.5 font-medium" style={{ width: '13%' }}>預估案件數</th>
                  <th scope="col" className="text-right px-5 py-2.5 font-medium" style={{ width: '10%' }}>操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r) => (
                  <DeptRatioTableRow
                    key={r.obdeptId}
                    row={r}
                    readOnly={readOnly}
                    caseCount={caseCountFor(r.ration ?? 0)}
                    onRationChange={updateRation}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {lockedRows.length > 0 && <OrphanLockedExplain count={lockedRows.length} />}
        </section>
      )}

      {/* ===== AC-7：可編輯部門數 = 0 之空狀態（孤兒鎖定列仍依 AC-3 顯示於上方表格） =====
          外層沿用 F079 既有 test-id `dept-ratio-empty` 作為「無可設定部門」之回歸錨點。 */}
      {!error && !hasEditableDept && (
        <div data-testid="dept-ratio-empty">
          <NoActiveDirectorEmptyState />
        </div>
      )}

      {/* ===== 即時加總 Sum Banner（AC-5） ===== */}
      {rows.length > 0 && (
        <DeptRatioSumBanner editableSum={editableSum} lockedSum={lockedSum} />
      )}

      {/* ===== 操作按鈕區（空 deptRatios 時仍顯示 cancel/rollback；save/advance 才條件 gated） ===== */}
      {!readOnly && (
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-4 flex items-center justify-between gap-3">
          {onCancel ? (
            <button
              type="button"
              onClick={onCancel}
              className="text-sm text-gray-500 hover:text-gray-700 inline-flex items-center gap-1"
            >
              <X className="w-4 h-4" />取消（返回名單列表）
            </button>
          ) : <span />}
          <div className="flex items-center gap-2">
            {/* AC-7：畫面說明無法推進之原因 */}
            {!hasEditableDept && (
              <p
                data-testid="advance-blocked-hint"
                className="text-xs text-amber-700 mr-1 inline-flex items-center gap-1"
              >
                <AlertTriangle className="w-3.5 h-3.5" />無可編輯部門，無法推進至個別業務比例
              </p>
            )}
            {onRequestRollback && (
              <Button
                type="button"
                variant="warning"
                data-testid="btn-rollback-draft"
                onClick={onRequestRollback}
              >
                <span className="inline-flex items-center gap-1.5">
                  <Undo2 className="w-4 h-4" />退回草稿
                </span>
              </Button>
            )}
            {rows.length > 0 && (
              <Button
                type="button"
                variant="secondary"
                data-testid="btn-save-dept-ratio"
                loading={saving}
                loadingText="儲存中..."
                disabled={!canSubmit}
                onClick={handleSave}
              >
                <span className="inline-flex items-center gap-1.5">
                  <Save className="w-4 h-4" />儲存
                </span>
              </Button>
            )}
            {rows.length > 0 && onRequestAdvance && (
              <Button
                type="button"
                variant="primary"
                data-testid="btn-advance-personnel-ratio"
                disabled={!canSubmit}
                onClick={onRequestAdvance}
              >
                <span className="inline-flex items-center gap-1.5">
                  <ArrowRight className="w-4 h-4" />儲存並推進至個別業務比例
                </span>
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
});
