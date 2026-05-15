/**
 * F069 CardTypeSwitcher RTL tests
 *
 * 對應 prototype 28 line 1206~1267（renderCardSwitcherList / toggleCardSwitcher /
 * switchCardType / outside-click / ESC）。
 *
 * 涵蓋：
 *   - trigger button 顯示「切換」字 + repeat icon
 *   - 點 trigger → panel 顯示，列全部 6 張卡
 *   - 當前選中那筆 bg-primary text-white + 「目前」label + aria-current
 *   - 點他張卡 → onSwitchCardType('X') + panel close
 *   - 點當前卡 → onSwitchCardType 未被呼叫
 *   - outside-click → panel close
 *   - ESC → panel close
 *   - monthRunLocked=true → button disabled + opacity-40
 *   - selectedCardType=null 時切換器仍可見可開
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CardTypeSwitcher } from '../_components/card-type-switcher';

// Iter 9：CardTypeListItem 新增 metadata 欄位（switcher 不讀此值，僅 satisfy 型別）
const META_NULL = {
  cardVersion: null,
  sdate: null,
  edate: null,
  createdBy: null,
  createdAt: null,
};

const SIX_CARDS = [
  { cardType: 'E', cardName: '滿期', prodKind: '01', prodKindName: '汽車', status: 'active' as const, ...META_NULL },
  { cardType: 'H', cardName: '期中', prodKind: '01', prodKindName: '汽車', status: 'active' as const, ...META_NULL },
  { cardType: 'M', cardName: '機車', prodKind: '02', prodKindName: '機車', status: 'active' as const, ...META_NULL },
  { cardType: 'M5', cardName: '機車中結滿期', prodKind: '02', prodKindName: '機車', status: 'active' as const, ...META_NULL },
  { cardType: 'S', cardName: '一般商品', prodKind: '03', prodKindName: '商品', status: 'active' as const, ...META_NULL },
  { cardType: 'S5', cardName: '一般商品中結', prodKind: '03', prodKindName: '商品', status: 'active' as const, ...META_NULL },
];

function renderSwitcher(overrides: Partial<{
  selectedCardType: string | null;
  availableCardTypes: typeof SIX_CARDS;
  monthRunLocked: boolean;
  onSwitchCardType: (code: string) => void;
}> = {}) {
  return render(
    <CardTypeSwitcher
      selectedCardType={
        overrides.selectedCardType === undefined ? 'H' : overrides.selectedCardType
      }
      availableCardTypes={overrides.availableCardTypes ?? SIX_CARDS}
      monthRunLocked={overrides.monthRunLocked ?? false}
      onSwitchCardType={overrides.onSwitchCardType ?? vi.fn()}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('CardTypeSwitcher — F069', () => {
  it('trigger button 顯示 repeat icon + 「切換」字', () => {
    renderSwitcher();
    const btn = screen.getByTestId('card-switcher-trigger');
    expect(btn).toBeInTheDocument();
    expect(btn.textContent).toContain('切換');
    // lucide repeat icon
    expect(btn.querySelector('svg')).toBeInTheDocument();
  });

  it('點 trigger → panel 顯示，列全部 6 張卡', () => {
    renderSwitcher();
    expect(screen.queryByTestId('card-switcher-panel')).toBeNull();
    fireEvent.click(screen.getByTestId('card-switcher-trigger'));
    expect(screen.getByTestId('card-switcher-panel')).toBeInTheDocument();

    SIX_CARDS.forEach((c) => {
      const item = screen.getByTestId(`card-switcher-item-${c.cardType}`);
      expect(item.textContent).toContain(c.cardName);
    });
  });

  it('當前選中那筆 tile bg-primary text-white + 容器 bg-blue-50/70 + 「目前」label', () => {
    renderSwitcher({ selectedCardType: 'H' });
    fireEvent.click(screen.getByTestId('card-switcher-trigger'));

    const currentItem = screen.getByTestId('card-switcher-item-H');
    expect(currentItem.className).toContain('bg-blue-50/70');
    expect(currentItem.className).toContain('cursor-default');
    expect(currentItem.getAttribute('aria-current')).toBe('true');

    const tile = currentItem.querySelector(
      '[data-testid="card-switcher-tile-H"]',
    );
    expect(tile?.className).toContain('bg-primary');
    expect(tile?.className).toContain('text-white');

    // 「目前」label
    expect(currentItem.textContent).toContain('目前');
  });

  it('點他張卡 → onSwitchCardType("M") + panel close', () => {
    const onSwitchCardType = vi.fn();
    renderSwitcher({ selectedCardType: 'H', onSwitchCardType });

    fireEvent.click(screen.getByTestId('card-switcher-trigger'));
    fireEvent.click(screen.getByTestId('card-switcher-item-M'));

    expect(onSwitchCardType).toHaveBeenCalledWith('M');
    expect(screen.queryByTestId('card-switcher-panel')).toBeNull();
  });

  it('點當前那張卡 → onSwitchCardType 未被呼叫（early return）', () => {
    const onSwitchCardType = vi.fn();
    renderSwitcher({ selectedCardType: 'H', onSwitchCardType });

    fireEvent.click(screen.getByTestId('card-switcher-trigger'));
    fireEvent.click(screen.getByTestId('card-switcher-item-H'));

    expect(onSwitchCardType).not.toHaveBeenCalled();
  });

  it('outside-click → panel close', () => {
    renderSwitcher();
    fireEvent.click(screen.getByTestId('card-switcher-trigger'));
    expect(screen.getByTestId('card-switcher-panel')).toBeInTheDocument();

    // 模擬 document body click（外部點擊）
    fireEvent.mouseDown(document.body);
    fireEvent.click(document.body);

    expect(screen.queryByTestId('card-switcher-panel')).toBeNull();
  });

  it('ESC → panel close', () => {
    renderSwitcher();
    fireEvent.click(screen.getByTestId('card-switcher-trigger'));
    expect(screen.getByTestId('card-switcher-panel')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('card-switcher-panel')).toBeNull();
  });

  it('monthRunLocked=true → button disabled + opacity-40 + 點擊不展開', () => {
    renderSwitcher({ monthRunLocked: true });
    const btn = screen.getByTestId('card-switcher-trigger');
    expect(btn).toBeDisabled();
    expect(btn.className).toContain('disabled:opacity-40');
    expect(btn.className).toContain('disabled:cursor-not-allowed');

    // 強行 click（disabled button 不會觸發 onClick）
    fireEvent.click(btn);
    expect(screen.queryByTestId('card-switcher-panel')).toBeNull();
  });

  it('selectedCardType=null 時切換器仍可見可開（讓使用者直接挑卡）', () => {
    renderSwitcher({ selectedCardType: null });
    const btn = screen.getByTestId('card-switcher-trigger');
    expect(btn).toBeInTheDocument();
    expect(btn).not.toBeDisabled();

    fireEvent.click(btn);
    expect(screen.getByTestId('card-switcher-panel')).toBeInTheDocument();
    // 沒有 aria-current=true 的 item
    SIX_CARDS.forEach((c) => {
      const item = screen.getByTestId(`card-switcher-item-${c.cardType}`);
      expect(item.getAttribute('aria-current')).not.toBe('true');
    });
  });

  it('Style：trigger button 含 px-2.5 py-1 text-xs（非舊版 px-3 py-1.5 text-sm）', () => {
    renderSwitcher();
    const btn = screen.getByTestId('card-switcher-trigger');
    expect(btn.className).toContain('px-2.5');
    expect(btn.className).toContain('py-1');
    expect(btn.className).toContain('text-xs');
    expect(btn.className).not.toContain('px-3 py-1.5 text-sm');
  });
});
