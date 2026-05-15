import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Repeat } from 'lucide-react';
import type { CardTypeListItem } from '@/api/card-type';

/**
 * F069 排列 B：CARD_TYPE 快速切換 dropdown
 *
 * 對應 prototype 28 line 1206~1267（renderCardSwitcherList / toggleCardSwitcher /
 * switchCardType / outside-click / ESC）。
 *
 * 行為：
 *   - 點 trigger button → panel 顯示 / 隱藏
 *   - 列出 props.availableCardTypes 全部卡片（含當前那筆）
 *   - 當前選中那筆 tile bg-primary text-white、容器 bg-blue-50/70 cursor-default
 *     + aria-current=true + 右側「目前」label
 *   - 點當前那筆 → early return（不觸發 onSwitchCardType）
 *   - 點他張卡 → onSwitchCardType(code) + panel close
 *   - outside-click → panel close
 *   - ESC → panel close
 *   - monthRunLocked=true → trigger disabled
 *   - selectedCardType=null 時切換器仍可見可開（讓使用者直接挑卡）
 *
 * Style：button px-2.5 py-1 text-xs（小型 trigger）；panel w-72 max-h-80 + scrollbar
 */

export interface CardTypeSwitcherProps {
  /** 當前選中的 cardType code；null 代表未選中（切換器仍可見可開） */
  selectedCardType: string | null;
  /** 全部可挑選的計分卡列表（含當前那筆） */
  availableCardTypes: CardTypeListItem[];
  /** 月跑鎖（trigger disabled） */
  monthRunLocked?: boolean;
  /** 切換到他張卡時呼叫 */
  onSwitchCardType: (code: string) => void;
}

export function CardTypeSwitcher({
  selectedCardType,
  availableCardTypes,
  monthRunLocked = false,
  onSwitchCardType,
}: CardTypeSwitcherProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // outside-click close
  useEffect(() => {
    if (!open) return;
    function handleDocMouseDown(ev: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(ev.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleDocMouseDown);
    document.addEventListener('click', handleDocMouseDown);
    return () => {
      document.removeEventListener('mousedown', handleDocMouseDown);
      document.removeEventListener('click', handleDocMouseDown);
    };
  }, [open]);

  // ESC close
  useEffect(() => {
    if (!open) return;
    function handleKey(ev: KeyboardEvent) {
      if (ev.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open]);

  const handleItemClick = (code: string) => {
    if (code === selectedCardType) {
      // early return：點當前選中那筆，不觸發 callback
      return;
    }
    onSwitchCardType(code);
    setOpen(false);
  };

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        data-testid="card-switcher-trigger"
        onClick={() => setOpen((v) => !v)}
        disabled={monthRunLocked}
        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-gray-700 bg-white border border-border rounded-md hover:bg-gray-50 transition disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
      >
        <Repeat className="w-3 h-3" />
        <span>切換</span>
        <ChevronDown className="w-3 h-3 text-gray-400" />
      </button>

      {open && (
        <div
          data-testid="card-switcher-panel"
          className="absolute right-0 mt-2 w-72 bg-white border border-border rounded-lg shadow-lg z-20 overflow-hidden"
        >
          <div className="px-3 py-2 border-b border-border bg-gray-50/60 text-xs font-semibold text-gray-500">
            切換至其他計分卡
          </div>
          <div className="max-h-80 overflow-y-auto py-1">
            {availableCardTypes.map((c) => {
              const isCurrent = c.cardType === selectedCardType;
              return (
                <button
                  key={c.cardType}
                  type="button"
                  data-testid={`card-switcher-item-${c.cardType}`}
                  aria-current={isCurrent ? 'true' : undefined}
                  onClick={() => handleItemClick(c.cardType)}
                  className={
                    'w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm transition ' +
                    (isCurrent
                      ? 'bg-blue-50/70 cursor-default'
                      : 'hover:bg-gray-50')
                  }
                >
                  <span
                    data-testid={`card-switcher-tile-${c.cardType}`}
                    className={
                      'inline-flex items-center justify-center w-7 h-7 rounded-md font-mono text-xs font-bold shrink-0 ' +
                      (isCurrent
                        ? 'bg-primary text-white'
                        : 'bg-gray-100 text-gray-700')
                    }
                  >
                    {c.cardType}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block font-medium text-gray-900 truncate">
                      {c.cardName}
                    </span>
                    <span className="block text-[11px] text-gray-500 truncate">
                      {c.prodKindName ?? c.prodKind} · v1
                    </span>
                  </span>
                  {isCurrent && (
                    <span className="text-[10px] font-semibold text-primary uppercase tracking-wide">
                      目前
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
