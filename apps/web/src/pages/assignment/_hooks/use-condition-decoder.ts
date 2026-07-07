import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import {
  listFields,
  listOptions,
  type PooldataField,
} from '@/api/pooldata-fields';
import { listCardTypes } from '@/api/card-type';
import { fieldDisplayName } from '../_utils/labels';

/**
 * 篩選條件 chip「代碼 → 中文」共用解碼器（名單卡片 / Detail Drawer /
 * 從上月複製 modal / 準備完成詳情 四處共用）。
 *
 * 需求：condition chip 過去對「欄位代碼」與「值代碼」皆裸露開發者代碼
 * （如 `PROD_KIND = 02`）。本 hook 一次解出使用者友善中文：
 *   - 欄位名稱 → pooldata-fields whitelist（listFields）之 displayName
 *   - 值標籤   → pooldata-fields options（listOptions，per 類別欄位）之 optionLabel
 *   - card_type（不在 whitelist）→ listCardTypes 之 cardName
 *
 * 快取策略：module-level cache + in-flight 去重 + useSyncExternalStore 訂閱。
 * 全站 listFields / listCardTypes 各僅發一次；options 依「實際被引用」之類別欄位
 * 延遲載入並逐欄快取。刻意不採 react-query：CopyFromPrevMonthModal 為純呈現元件，
 * 由無 QueryClientProvider 的建立名單頁測試渲染，module 快取可免 provider 佈線且
 * 同樣達成快取／去重。
 *
 * Fallback（強制）：任一代碼查無對照一律回傳「原始代碼」——欄位名另有
 * labels.ts 靜態表作為首屏 / 載入中 fallback，永不空白、不臆測翻譯。
 */

// card_type 不在 pooldata-fields whitelist；欄位中文沿用建立 / 編輯名單頁術語「卡別」。
const CARD_TYPE_COLUMN = 'card_type';
const CARD_TYPE_FIELD_LABEL = '卡別';

/**
 * camelCase 扁平欄位 → whitelist snake_case 正規化表。
 * 注意 caseYear → caseyear 為特例（whitelist 欄位無底線），不可走一般 camel→snake。
 */
const CAMEL_TO_SNAKE: Record<string, string> = {
  prodKind: 'prod_kind',
  specTp: 'spec_tp',
  caseYear: 'caseyear',
  caseStatus: 'case_status',
  settleSrc: 'settle_src',
  cardType: 'card_type',
  bestCase: 'best_case',
  prodBest: 'prod_best',
  monthCnt: 'month_cnt',
};

/** 將欄位代碼正規化為 whitelist snake_case（已是 snake_case / 無大寫者原樣回傳）。 */
export function normalizeColumnName(col: string): string {
  if (!col) return col;
  if (col in CAMEL_TO_SNAKE) return CAMEL_TO_SNAKE[col];
  if (/[A-Z]/.test(col)) {
    return col.replace(/([A-Z])/g, (m) => `_${m.toLowerCase()}`);
  }
  return col;
}

// ---------------------------------------------------------------------------
// module-level cache
// ---------------------------------------------------------------------------
type FieldMap = Map<string, PooldataField>;
type ValueMap = Map<string, string>; // optionValue → optionLabel（或 cardType → cardName）

let fieldsCache: FieldMap | null = null;
let cardTypesCache: ValueMap | null = null;
const optionsCache = new Map<string, ValueMap>(); // columnName(snake) → (value → label)

const inFlight = new Map<string, Promise<unknown>>();
const listeners = new Set<() => void>();
let version = 0;

function bump(): void {
  version += 1;
  for (const l of listeners) l();
}
function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
function getSnapshot(): number {
  return version;
}

function ensureFields(): void {
  if (fieldsCache || inFlight.has('__fields__')) return;
  const p = Promise.resolve(listFields())
    .then((res) => {
      const m: FieldMap = new Map();
      for (const f of res?.fields ?? []) m.set(f.columnName, f);
      fieldsCache = m;
    })
    .catch(() => {
      // 失敗亦標記已載入以免無限重試；decodeField 走 labels.ts 靜態 fallback。
      fieldsCache = new Map();
    })
    .finally(() => {
      inFlight.delete('__fields__');
      bump();
    });
  inFlight.set('__fields__', p);
}

function ensureCardTypes(): void {
  if (cardTypesCache || inFlight.has('__cardTypes__')) return;
  const p = Promise.resolve(listCardTypes('all'))
    .then((res) => {
      const m: ValueMap = new Map();
      for (const ct of res?.cardTypes ?? []) m.set(ct.cardType, ct.cardName);
      cardTypesCache = m;
    })
    .catch(() => {
      cardTypesCache = new Map();
    })
    .finally(() => {
      inFlight.delete('__cardTypes__');
      bump();
    });
  inFlight.set('__cardTypes__', p);
}

function ensureOptions(col: string): void {
  const key = `opt:${col}`;
  if (optionsCache.has(col) || inFlight.has(key)) return;
  const p = Promise.resolve(listOptions(col, { includeInactive: 'true' }))
    .then((res) => {
      const m: ValueMap = new Map();
      for (const o of res?.options ?? []) m.set(o.optionValue, o.optionLabel);
      optionsCache.set(col, m);
    })
    .catch(() => {
      optionsCache.set(col, new Map());
    })
    .finally(() => {
      inFlight.delete(key);
      bump();
    });
  inFlight.set(key, p);
}

/** 測試用：清空 module-level 快取（跨測試隔離，正式流程不呼叫）。 */
export function __resetConditionDecoderCache(): void {
  fieldsCache = null;
  cardTypesCache = null;
  optionsCache.clear();
  inFlight.clear();
  version = 0;
}

// ---------------------------------------------------------------------------
// hook
// ---------------------------------------------------------------------------
export interface ConditionDecoder {
  /** 欄位代碼 → 中文顯示名稱（查無回傳原始代碼）。 */
  decodeField: (col: string) => string;
  /** (欄位, 值代碼) → 中文值標籤（查無回傳原始值）。 */
  decodeValue: (col: string, value: string) => string;
  /** decodeValue 的多值便利版。 */
  decodeValues: (col: string, values: string[]) => string[];
}

/**
 * @param columns 本畫面實際引用的欄位代碼（camelCase 或 snake_case 皆可）；
 *   用於延遲載入對應類別欄位之 options。card_type 由 listCardTypes 解，毋須列入。
 */
export function useConditionDecoder(columns: string[] = []): ConditionDecoder {
  // 訂閱 module cache 版本：任一 fetch 完成即觸發本元件 re-render。
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  // 正規化 + 去重欲載入 options 的類別欄位（排除 card_type，其走 listCardTypes）。
  const normCols = useMemo(() => {
    const set = new Set<string>();
    for (const c of columns) {
      const n = normalizeColumnName(c);
      if (n && n !== CARD_TYPE_COLUMN) set.add(n);
    }
    return Array.from(set);
    // 以內容為 dep（columns 每次 render 為新陣列參考）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns.join('|')]);

  useEffect(() => {
    ensureFields();
    ensureCardTypes();
    for (const c of normCols) ensureOptions(c);
  }, [normCols]);

  const decodeField = useCallback((col: string): string => {
    const n = normalizeColumnName(col);
    if (n === CARD_TYPE_COLUMN) {
      return fieldsCache?.get(n)?.displayName ?? CARD_TYPE_FIELD_LABEL;
    }
    return fieldsCache?.get(n)?.displayName ?? fieldDisplayName(n);
  }, []);

  const decodeValue = useCallback((col: string, value: string): string => {
    const n = normalizeColumnName(col);
    if (n === CARD_TYPE_COLUMN) {
      return cardTypesCache?.get(value) ?? value;
    }
    return optionsCache.get(n)?.get(value) ?? value;
  }, []);

  const decodeValues = useCallback(
    (col: string, values: string[]): string[] =>
      values.map((v) => decodeValue(col, v)),
    [decodeValue],
  );

  return { decodeField, decodeValue, decodeValues };
}
