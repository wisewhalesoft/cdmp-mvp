import { createContext, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type {
  CardTypeCode,
  CardTypeListItem,
} from '@/api/card-type';

/**
 * F069 AC-2 / AC-3：Tab 1 ↔ Tab 2~5 聯動 Context
 *
 * 提供：
 *   - selectedCardType：目前 Tab 1 選中的 CARD_TYPE 代碼（cardType=null 表示未選中）
 *   - selectedCardName：對應名稱（供 banner / 各 Tab 標題顯示）
 *   - setSelected：Tab 1 click row 觸發更新
 *
 * Iter 5a 範圍：本 hook 為 Tab 1 + Tab 2~5 共用基礎；
 * Iter 5b 會擴充 Tab 5（F056）取用 selectedCardType 作為 query 參數。
 */

export interface SelectedCardTypeContextValue {
  selectedCardType: CardTypeCode | null;
  selectedCardName: string | null;
  selectedCardItem: CardTypeListItem | null;
  setSelected: (item: CardTypeListItem | null) => void;
}

const SelectedCardTypeContext =
  createContext<SelectedCardTypeContextValue | null>(null);

export function SelectedCardTypeProvider({
  children,
  initialCardType = null,
}: {
  children: ReactNode;
  initialCardType?: CardTypeListItem | null;
}) {
  const [selected, setSelected] = useState<CardTypeListItem | null>(
    initialCardType,
  );

  const value = useMemo<SelectedCardTypeContextValue>(
    () => ({
      selectedCardType: selected?.cardType ?? null,
      selectedCardName: selected?.cardName ?? null,
      selectedCardItem: selected,
      setSelected,
    }),
    [selected],
  );

  return (
    <SelectedCardTypeContext.Provider value={value}>
      {children}
    </SelectedCardTypeContext.Provider>
  );
}

export function useSelectedCardType(): SelectedCardTypeContextValue {
  const ctx = useContext(SelectedCardTypeContext);
  if (!ctx) {
    throw new Error(
      'useSelectedCardType must be used within SelectedCardTypeProvider',
    );
  }
  return ctx;
}
