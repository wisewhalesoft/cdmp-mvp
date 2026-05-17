import { useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * MonthPicker — 月份切換器（YYYY-MM）
 *
 * 對應 prototype: /prototypes/27-list-definition.html 第 91-100 行
 *
 * 範圍：相對 currentYm 前後 1 年（共 25 個月選項）。
 * 結構：prev button + select dropdown + next button
 */

export interface MonthPickerProps {
  /** 當前選定月份（YYYY-MM 格式）。 */
  value: string;
  /** 選擇變更時觸發。 */
  onChange: (ym: string) => void;
  /** 系統當月（YYYY-MM）— 用以計算可選範圍中心。預設取 value。 */
  currentYm?: string;
  /** 可選範圍上限月數（相對 currentYm；預設 12 = 後 1 年）。 */
  rangeForward?: number;
  /** 可選範圍下限月數（相對 currentYm；預設 12 = 前 1 年）。 */
  rangeBackward?: number;
  /** 是否禁用整個元件。 */
  disabled?: boolean;
}

function ymToInt(ym: string): number {
  const [y, m] = ym.split('-').map((v) => parseInt(v, 10));
  return y * 12 + (m - 1);
}

function intToYm(n: number): string {
  const y = Math.floor(n / 12);
  const m = (n % 12) + 1;
  return `${y}-${String(m).padStart(2, '0')}`;
}

export function MonthPicker({
  value,
  onChange,
  currentYm,
  rangeForward = 12,
  rangeBackward = 12,
  disabled = false,
}: MonthPickerProps) {
  const center = currentYm ?? value;
  const options = useMemo(() => {
    const centerInt = ymToInt(center);
    const min = centerInt - rangeBackward;
    const max = centerInt + rangeForward;
    const out: string[] = [];
    for (let i = min; i <= max; i++) out.push(intToYm(i));
    return out;
  }, [center, rangeForward, rangeBackward]);

  const valueInt = ymToInt(value);
  const centerInt = ymToInt(center);
  const minInt = centerInt - rangeBackward;
  const maxInt = centerInt + rangeForward;
  const isPrevDisabled = disabled || valueInt <= minInt;
  const isNextDisabled = disabled || valueInt >= maxInt;

  const shift = (delta: number) => {
    const next = valueInt + delta;
    if (next < minInt || next > maxInt) return;
    onChange(intToYm(next));
  };

  return (
    <div className="flex items-center gap-1" data-testid="month-picker">
      <button
        type="button"
        aria-label="上個月"
        data-testid="month-picker-prev"
        disabled={isPrevDisabled}
        onClick={() => shift(-1)}
        className="w-8 h-8 inline-flex items-center justify-center border border-gray-200 rounded-md text-gray-600 hover:bg-white hover:border-primary hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      <select
        aria-label="月份"
        data-testid="month-picker-select"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="px-3 py-1.5 border border-gray-200 rounded-md text-sm font-medium bg-white focus:outline-none focus:ring-2 focus:ring-primary"
      >
        {options.map((ym) => (
          <option key={ym} value={ym}>
            {ym}
          </option>
        ))}
      </select>
      <button
        type="button"
        aria-label="下個月"
        data-testid="month-picker-next"
        disabled={isNextDisabled}
        onClick={() => shift(1)}
        className="w-8 h-8 inline-flex items-center justify-center border border-gray-200 rounded-md text-gray-600 hover:bg-white hover:border-primary hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}
