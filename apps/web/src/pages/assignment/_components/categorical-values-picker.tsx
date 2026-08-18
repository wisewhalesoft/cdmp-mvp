import { AlertTriangle, Check, Info, Lightbulb, Plus, X } from 'lucide-react';
import type { PooldataOption } from '@/api/pooldata-fields';
import {
  CATEGORICAL_OPERATORS,
  KEYWORD_MAX_LEN,
  OPERATOR_LABEL,
  TEXT_OP_PERF_HINT,
  isTextOperator,
  isTextOperatorExcluded,
  resolveCategoricalOperator,
  trimKeyword,
  type CategoricalOperator,
} from '../_utils/labels';

/**
 * 類別型（categorical）條件之值編輯區——建立草稿名單頁與編輯草稿名單頁**共用同一元件**
 * （F119 AC-18；對齊 `prototypes/27a-list-create-draft.html` / `27b-list-edit-draft.html`
 * 之 `renderCategoricalValueUI()`，兩份原型該區塊逐字相同）。
 *
 * F119 / US-183：
 *   - AC-1：運算子四選一（IN / 包含 / 不包含 / 完全等於），預設 IN
 *   - AC-5 / BR-3：IN 核取清單與關鍵字輸入框**互斥**、不同時出現；跨形態切換清除另一側輸入
 *     （被清除之值不得殘留於表單狀態、不得隨 payload 送出）；文字運算子彼此切換不清除關鍵字（C-6）
 *   - AC-8 / BR-2：關鍵字就地驗證（必填 / 純空白 / 超長）；必填錯誤等 blur 或送出才出現（C-9）
 *   - AC-11 / BR-14：零可選值欄位於 IN 形態顯示指引，主動指路到文字運算子
 *   - AC-12：文字運算子顯示效能提示（灰字 info，非警示色；切回 IN 即消失）
 *   - I-CATOP-CASEYEAR-EXCLUDE-01：`caseyear` 之三個文字選項 `disabled` + 列內說明；
 *     setter 端另有 guard（disabled 只擋滑鼠，鍵盤 / 程式路徑仍可觸及）
 */

/** 本元件所需之條件最小結構（兩頁之 BuilderCondition 皆為其超集）。 */
export interface PickerCondition {
  id: number;
  columnName: string;
  fieldType: 'categorical' | 'numeric' | 'date';
  values?: string[];
  operator?: CategoricalOperator;
  keyword?: string;
}

/**
 * AC-8：關鍵字驗證訊息（空字串＝通過）。錯誤訊息以**欄位顯示名稱**開頭，供多條件表單定位列
 * （附錄 C C-10）。
 *
 * @param force true 時忽略「尚未離開焦點」——供儲存前檢查使用；剛切到文字運算子的空輸入框
 *              不應立刻變紅（C-9），否則正常操作路徑一開始就滿版錯誤。
 * @param touched 該列關鍵字是否已離開焦點
 */
export function keywordError(
  cond: PickerCondition,
  displayName: string,
  force: boolean,
  touched: boolean = false,
): string {
  if (cond.fieldType !== 'categorical' || !isTextOperator(cond.operator)) return '';
  // I-CATOP-CASEYEAR-EXCLUDE-01（下拉已 disabled，此為 defense-in-depth）
  if (isTextOperatorExcluded(cond.columnName)) {
    return `「${displayName}」不支援文字比對運算子，請改用「IN」勾選可選值`;
  }
  const kw = trimKeyword(cond.keyword);
  if (kw.length > KEYWORD_MAX_LEN) {
    return `「${displayName}」關鍵字長度不得超過 ${KEYWORD_MAX_LEN} 個字元（目前 ${kw.length} 個）`;
  }
  if (kw === '') {
    return force || touched
      ? `「${displayName}」使用文字比對運算子時，關鍵字為必填且不得為空白`
      : '';
  }
  return '';
}

/**
 * AC-5 / BR-3：套用運算子切換後之新條件狀態（純函式，兩頁共用）。
 *
 * 跨形態（IN ↔ 文字運算子）切換時清除另一側輸入——**自條件物件移除該 key**，
 * 確保不殘留於表單狀態、不隨 payload 送出；同形態（文字↔文字）切換保留關鍵字（C-6）。
 * `caseyear` 等排除欄位切至文字運算子時直接忽略（setter 端 guard）。
 */
export function applyOperatorSwitch<T extends PickerCondition>(
  cond: T,
  nextRaw: unknown,
): T {
  const cur = resolveCategoricalOperator(cond.operator);
  const next = resolveCategoricalOperator(nextRaw);
  if (next === cur) return cond;
  if (isTextOperatorExcluded(cond.columnName) && isTextOperator(next)) return cond;

  const crossForm = isTextOperator(cur) !== isTextOperator(next);
  const nextCond = { ...cond, operator: next } as T;
  if (!crossForm) return nextCond;

  if (isTextOperator(next)) {
    delete nextCond.values; // 核取清單被清除，且不得殘留於表單狀態
    nextCond.keyword = ''; // 切至文字運算子後輸入框為空（不預填任何值）
  } else {
    delete nextCond.keyword; // 關鍵字被清除，且不得殘留於表單狀態
    nextCond.values = [];
  }
  return nextCond;
}

/**
 * AC-5 / 附錄 C C-3：是否需要二次確認。
 *
 * 只有「跨形態（IN ↔ 文字運算子）切換」**且**另一側**有內容**時才確認——剛加入條件的常態路徑
 * （兩側皆空）不該被彈窗打斷；只有真的會丟資料時才攔截。同形態切換（文字↔文字）永不確認（C-6）。
 */
export function needsOperatorSwitchConfirm(
  cond: PickerCondition,
  nextRaw: unknown,
): boolean {
  const cur = resolveCategoricalOperator(cond.operator);
  const next = resolveCategoricalOperator(nextRaw);
  if (next === cur) return false;
  if (isTextOperatorExcluded(cond.columnName) && isTextOperator(next)) return false;
  if (isTextOperator(cur) === isTextOperator(next)) return false; // 同形態不跨界
  return isTextOperator(cur)
    ? trimKeyword(cond.keyword) !== ''
    : (cond.values ?? []).length > 0;
}

export interface OperatorSwitchConfirmModalProps {
  /** 欄位中文顯示名稱 */
  displayName: string;
  fromOperator: CategoricalOperator;
  toOperator: CategoricalOperator;
  /** 將被清除的內容本身（關鍵字 1 筆 / 已勾選可選值 N 筆），附錄 C C-5 要求逐項列出 */
  lossItems: string[];
  /** 被清除的是哪一側 */
  lossKind: 'keyword' | 'values';
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * AC-5 / BR-3 / 附錄 C C-3~C-5：切換比對方式之二次確認。
 *
 * **刻意不做 undo**（C-4）：AC-5 要求被清除的輸入「不得殘留於表單狀態並隨送出 payload 一併
 * 儲存」，undo 必須把舊值留在某處，與該條文正面衝突；確認式在切換**之前**攔截，切換後狀態乾淨。
 * 預設焦點放在「取消」（C-5）。
 */
export function OperatorSwitchConfirmModal({
  displayName,
  fromOperator,
  toOperator,
  lossItems,
  lossKind,
  onCancel,
  onConfirm,
}: OperatorSwitchConfirmModalProps) {
  return (
    <div className="fixed inset-0 z-50" data-testid="operator-switch-confirm-modal">
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div
          role="alertdialog"
          aria-labelledby="opSwitchTitle"
          aria-describedby="opSwitchDesc"
          className="bg-white rounded-xl shadow-2xl w-full max-w-md"
        >
          <div className="px-6 py-4 border-b border-gray-200 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-warning" />
            </div>
            <div>
              <h3 id="opSwitchTitle" className="text-base font-semibold text-gray-800">
                切換比對方式將清除目前設定
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                「勾選可選值」與「關鍵字比對」不能並存
              </p>
            </div>
          </div>

          <div className="p-6 space-y-3" id="opSwitchDesc">
            <p className="text-sm text-gray-700">
              <strong>{displayName}</strong> 的比對方式將由「{OPERATOR_LABEL[fromOperator]}
              」改為「{OPERATOR_LABEL[toOperator]}」。
            </p>
            <div className="rounded-lg p-3 bg-amber-50 border border-amber-200 text-sm text-amber-900">
              <p className="font-semibold mb-1.5">
                {lossKind === 'keyword'
                  ? '目前輸入的關鍵字將被清除'
                  : `目前已勾選的 ${lossItems.length} 個可選值將被清除`}
              </p>
              <div
                data-testid="operator-switch-loss"
                className="flex flex-wrap gap-1"
              >
                {lossItems.map((item, i) => (
                  <span
                    key={`${item}-${i}`}
                    className="inline-flex items-center px-2 py-0.5 rounded-full bg-white border border-amber-300 text-[11px] font-medium text-amber-900"
                  >
                    {item}
                  </span>
                ))}
              </div>
              <p className="text-xs text-amber-800 mt-2">
                清除後不會隨名單一併儲存；如需復原請重新設定。
              </p>
            </div>
            <p className="text-xs text-gray-500">
              若只是想調整目前的設定值，請按「取消」。
            </p>
          </div>

          {/* C-5：預設焦點放「取消」（合法操作，非破壞性紅；主要按鈕為 primary 藍） */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200">
            <button
              type="button"
              data-testid="operator-switch-cancel"
              autoFocus
              onClick={onCancel}
              className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              取消
            </button>
            <button
              type="button"
              data-testid="operator-switch-confirm"
              onClick={onConfirm}
              className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary-700"
            >
              確定切換並清除
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export interface CategoricalValuesPickerProps {
  idx: number;
  cond: PickerCondition;
  /** 欄位中文顯示名稱（驗證訊息 / aria-label 用）。 */
  displayName: string;
  options: PooldataOption[];
  dropdownOpen: boolean;
  onToggleDropdown: () => void;
  onToggleValue: (v: string) => void;
  /** 全選（僅啟用值 ∪ 已選停用值） */
  onSelectAll: () => void;
  /** 清除（清空所有已選值，含停用） */
  onClear: () => void;
  /** 完成（明確關閉值清單，不改動已選值） */
  onDone: () => void;
  /** F119 AC-1 / AC-5：切換比對方式 */
  onChangeOperator: (next: CategoricalOperator) => void;
  /** F119 AC-8：關鍵字輸入（輸入中保留原樣，trim 於送出時進行，避免游標跳動） */
  onChangeKeyword: (v: string) => void;
  /** F119 AC-8 / C-9：關鍵字離開焦點 */
  onBlurKeyword: () => void;
  /** F119 AC-8：該列關鍵字是否已離開焦點（必填錯誤之顯示時機） */
  keywordTouched: boolean;
  /** F119 AC-8：是否已嘗試儲存（忽略 touched，強制顯示必填錯誤） */
  forceKeywordError: boolean;
}

export function CategoricalValuesPicker({
  idx,
  cond,
  displayName,
  options,
  dropdownOpen,
  onToggleDropdown,
  onToggleValue,
  onSelectAll,
  onClear,
  onDone,
  onChangeOperator,
  onChangeKeyword,
  onBlurKeyword,
  keywordTouched,
  forceKeywordError,
}: CategoricalValuesPickerProps) {
  const col = cond.columnName;
  const selected = cond.values ?? [];
  const activeCount = options.filter((o) => o.isActive).length;
  const selectedCount = selected.length;
  // BR-11：operator 之解讀一律經唯一 fallback 落點（`_utils/labels.ts`）
  const operator = resolveCategoricalOperator(cond.operator);
  const textMode = isTextOperator(operator);
  const excluded = isTextOperatorExcluded(col);
  const rowLabel = `第 ${idx + 1} 列條件（${displayName}）`;
  const err = keywordError(cond, displayName, forceKeywordError, keywordTouched);
  const kwLen = trimKeyword(cond.keyword).length;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* AC-1：運算子四選一，接手原本靜態「IN」標籤之位置（附錄 C C-1） */}
      <label className="sr-only" htmlFor={`condOp-${cond.id}`}>
        {rowLabel}比對方式
      </label>
      <select
        id={`condOp-${cond.id}`}
        data-testid={`condition-operator-${col}`}
        data-operator={operator}
        value={operator}
        onChange={(e) => onChangeOperator(e.target.value as CategoricalOperator)}
        title={
          excluded
            ? '此欄位對應整數欄位 year_cnt，僅支援「IN」勾選可選值'
            : '選擇此條件的比對方式'
        }
        className={`shrink-0 ${textMode ? 'self-start ' : ''}w-[104px] px-2 py-1.5 border border-gray-200 rounded-md text-xs font-medium text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-primary`}
      >
        {CATEGORICAL_OPERATORS.map((o) => (
          <option key={o} value={o} disabled={excluded && o !== 'in'}>
            {OPERATOR_LABEL[o]}
          </option>
        ))}
      </select>

      {textMode ? (
        /* 文字運算子形態：單一關鍵字輸入框 + 就地錯誤（AC-8）+ 效能提示（AC-12）+ 字數計數 */
        <div
          className="flex-1 min-w-[260px]"
          data-operator-panel="text"
          data-testid={`condition-keyword-panel-${col}`}
        >
          <input
            type="text"
            data-testid={`condition-keyword-${col}`}
            value={cond.keyword ?? ''}
            onChange={(e) => onChangeKeyword(e.target.value)}
            onBlur={onBlurKeyword}
            placeholder="輸入單一關鍵字，例如：勁便利"
            aria-label={`${rowLabel}關鍵字`}
            aria-invalid={err ? 'true' : 'false'}
            aria-describedby={`condKwHint-${cond.id}`}
            className={`w-full px-2.5 py-1.5 border rounded-md text-sm focus:outline-none focus:ring-2 ${
              err
                ? 'border-danger bg-red-50/40 focus:ring-danger'
                : 'border-gray-200 focus:ring-primary'
            }`}
          />
          {err && (
            <p
              data-testid={`condition-keyword-error-${col}`}
              role="alert"
              className="mt-1 text-[11px] text-danger flex items-start gap-1"
            >
              <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
              <span>{err}</span>
            </p>
          )}
          <div className="mt-1 flex items-start gap-2">
            <p
              id={`condKwHint-${cond.id}`}
              data-testid={`condition-perf-hint-${col}`}
              className="flex-1 text-[11px] text-gray-500 flex items-start gap-1"
            >
              <Info className="w-3 h-3 mt-0.5 shrink-0" />
              <span>{TEXT_OP_PERF_HINT}</span>
            </p>
            <span
              className={`text-[10px] tabular-nums shrink-0 ${
                kwLen > KEYWORD_MAX_LEN ? 'text-danger font-semibold' : 'text-gray-400'
              }`}
            >
              {kwLen} / {KEYWORD_MAX_LEN}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-gray-400">
            關鍵字以字面值比對，<code className="font-mono">%</code>、
            <code className="font-mono">_</code>{' '}
            等符號不具萬用字元意義；一列僅能設定一個關鍵字，需要多個請新增多列條件（列間以「且」連接）。
          </p>
        </div>
      ) : (
        <>
          {/* IN 形態：既有核取清單（本 feature 上線前之唯一形態，行為完全未變 —— AC-1 / AC-17） */}
          <div
            data-operator-panel="in"
            data-testid={`condition-values-panel-${col}`}
            className="flex-1 flex items-center gap-2 flex-wrap min-h-[36px] px-2 py-1 border border-gray-200 rounded-md bg-white"
          >
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
                <span className="text-gray-400">({activeCount})</span>
              </button>
              {dropdownOpen && (
                <div
                  data-testid={`value-dropdown-${col}`}
                  className="absolute right-0 top-full mt-1 w-72 bg-white border border-gray-200 rounded-md shadow-lg z-10 overflow-hidden"
                >
                  {/* 批次操作 header：全選（僅啟用值）/ 清除，sticky 於清單頂部 */}
                  <div className="sticky top-0 bg-white border-b border-gray-200 px-2.5 py-1.5 flex items-center justify-between gap-2 z-10">
                    <span className="text-[10px] text-gray-400 leading-tight">
                      全選僅含啟用值
                    </span>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button
                        type="button"
                        data-testid={`value-select-all-${col}`}
                        onClick={onSelectAll}
                        disabled={activeCount === 0}
                        className="text-[11px] px-1.5 py-0.5 rounded text-primary font-medium hover:bg-blue-50 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        全選
                      </button>
                      <span className="text-gray-200 text-[10px]">|</span>
                      <button
                        type="button"
                        data-testid={`value-clear-${col}`}
                        onClick={onClear}
                        disabled={selectedCount === 0}
                        className="text-[11px] px-1.5 py-0.5 rounded text-gray-500 font-medium hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        清除
                      </button>
                    </div>
                  </div>

                  {/* 可選值清單（中段可捲動；長清單如職業別 / 居住城市時 header/footer 仍可觸及） */}
                  <div className="max-h-64 overflow-y-auto py-0.5">
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

                  {/* footer：已選計數 + 完成（明確關閉清單，不改動已選值），sticky 於清單底部 */}
                  <div className="sticky bottom-0 bg-white border-t border-gray-200 px-2.5 py-1.5 flex items-center justify-between gap-2 z-10">
                    <span className="text-[10px] text-gray-400">
                      已選{' '}
                      <span
                        className="font-semibold text-gray-600"
                        data-testid={`value-selected-count-${col}`}
                      >
                        {selectedCount}
                      </span>{' '}
                      項
                    </span>
                    <button
                      type="button"
                      data-testid={`value-done-${col}`}
                      onClick={onDone}
                      className="text-xs px-3 py-1 bg-primary text-white rounded-md hover:bg-blue-700 font-medium inline-flex items-center gap-1"
                    >
                      <Check className="w-3 h-3" />
                      完成
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {excluded ? (
            /* AD-E07-50 §3.8：不支援文字運算子之欄位，於列內說明原因 */
            <p
              data-testid={`condition-operator-excluded-${col}`}
              className="w-full text-[11px] text-gray-500 flex items-start gap-1"
            >
              <Info className="w-3 h-3 mt-0.5 shrink-0" />
              <span>
                「{displayName}」對應整數欄位 <code className="font-mono">year_cnt</code>
                ，僅支援「IN」勾選可選值，不提供文字比對運算子。
              </span>
            </p>
          ) : (
            /* AC-11 / BR-14：零可選值欄位於 IN 形態主動指路到文字運算子 */
            options.length === 0 && (
              <p
                data-testid={`condition-zero-option-hint-${col}`}
                className="w-full text-[11px] text-amber-700 flex items-start gap-1"
              >
                <Lightbulb className="w-3 h-3 mt-0.5 shrink-0" />
                <span>
                  「{displayName}
                  」尚未登錄任何可選值。此類值域極廣、無法窮舉的欄位，請將比對方式改為「包含 /
                  不包含 / 完全等於」，直接以關鍵字設定條件。
                </span>
              </p>
            )
          )}
        </>
      )}
    </div>
  );
}
