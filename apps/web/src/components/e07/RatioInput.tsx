import { forwardRef } from 'react';

/**
 * RatioInput — 比例輸入（小數 0~100，最多 2 位）
 *
 * 用途：F079 部門比例 / F082 個別比例之 ration 欄位
 * 規範（spec）：
 *   - 範圍 0.00 ~ 100.00
 *   - 最多 2 位小數（DTO 端 @IsNumber({ maxDecimalPlaces: 2 })）
 *   - 加總應為 100（容忍 ±0.01 浮點誤差；由父層 RatioSumIndicator 顯示）
 */

export interface RatioInputProps {
  value: number | '';
  onChange: (value: number) => void;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
  placeholder?: string;
  'aria-label'?: string;
}

export const RatioInput = forwardRef<HTMLInputElement, RatioInputProps>(
  function RatioInput(
    { value, onChange, disabled, invalid, className = '', placeholder = '0.00', ...rest },
    ref,
  ) {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      if (raw === '') {
        onChange(0);
        return;
      }
      const parsed = parseFloat(raw);
      if (Number.isNaN(parsed)) return;
      // Clamp [0, 100]
      const clamped = Math.max(0, Math.min(100, parsed));
      // Round to 2 decimals
      const rounded = Math.round(clamped * 100) / 100;
      onChange(rounded);
    };

    return (
      <div className="relative inline-flex items-center">
        <input
          ref={ref}
          type="number"
          step="0.01"
          min={0}
          max={100}
          value={value}
          disabled={disabled}
          onChange={handleChange}
          placeholder={placeholder}
          className={`w-24 px-3 py-1.5 pr-7 text-right text-sm font-mono border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:bg-gray-50 disabled:text-gray-500 ${
            invalid ? 'border-danger ring-1 ring-danger/30' : 'border-gray-200'
          } ${className}`}
          {...rest}
        />
        <span className="absolute right-2 text-xs text-gray-400 pointer-events-none">%</span>
      </div>
    );
  },
);

export interface RatioSumIndicatorProps {
  values: number[];
  /** Tolerance for sum=100 check（預設 0.01）。 */
  tolerance?: number;
}

/**
 * RatioSumIndicator — 即時顯示加總與目標（100）對齊狀態。
 * 加總 ≠ 100 (容忍誤差外) → 紅色警告；= 100 → 綠色 OK。
 */
export function RatioSumIndicator({ values, tolerance = 0.01 }: RatioSumIndicatorProps) {
  const sum = values.reduce((acc, v) => acc + (Number.isFinite(v) ? v : 0), 0);
  const rounded = Math.round(sum * 100) / 100;
  const diff = Math.abs(rounded - 100);
  const valid = diff <= tolerance;
  return (
    <span
      data-testid="ratio-sum-indicator"
      data-valid={valid}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium font-mono ${
        valid
          ? 'bg-green-50 text-green-700 border border-green-200'
          : 'bg-red-50 text-red-700 border border-red-200'
      }`}
    >
      {valid ? '✓' : '✗'} 加總 {rounded.toFixed(2)}%
      {!valid && (
        <span className="text-[10px] text-red-600">
          （差 {(rounded - 100).toFixed(2)}）
        </span>
      )}
    </span>
  );
}
