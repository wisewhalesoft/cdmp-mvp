/**
 * F049 v1.1 + F061 v1.4 — Ready 欄頂 CTA Banner
 *
 * 對應 prototype: /prototypes/27-list-definition.html v2.3.1 第 713-753 行
 *
 * 渲染條件：
 *   - Ready 欄有 ≥1 名單（stageCounts.ready ≥ 1）
 *   - 非歷史月份
 *
 * 兩個按鈕：
 *   - 主按鈕「執行月跑」：F061 v1.4 § 9 / US-132 AC-3
 *   - secondary「試算」：F049 v1.1 AC-Banner-Entry，連結至 /assignment/estimate
 *     對齊 prototype 30-stage0-estimate.html
 *
 * 月跑鎖中：兩個按鈕均 disabled，Banner 改琥珀色 disabled 樣式（仍渲染）。
 *
 * Banner 不渲染（ready=0 或歷史月份）→ 父層條件不渲染本元件（DOM 完全不存在）。
 */

import { Link } from 'react-router-dom';
import { CheckCircle2, AlertTriangle, PlayCircle, Calculator, Lock } from 'lucide-react';

export interface ReadyCtaBannerProps {
  readyCount: number;
  workYm: string;
  isLocked: boolean;
  onTriggerRun: () => void;
}

export function ReadyCtaBanner({
  readyCount,
  workYm,
  isLocked,
  onTriggerRun,
}: ReadyCtaBannerProps) {
  if (isLocked) {
    return (
      <div
        data-testid="ready-cta-banner"
        className="px-3 py-2 border-y bg-amber-50 border-amber-200"
      >
        <div className="flex items-center gap-2 mb-1.5">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-800" />
          <span className="text-[11px] font-semibold text-amber-800">
            {readyCount} 份名單已準備完成
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="btn-trigger-run"
            disabled
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold rounded bg-gray-300 text-gray-500 cursor-not-allowed"
          >
            <Lock className="w-3 h-3" />
            分派執行中，無法重新觸發
          </button>
          <button
            type="button"
            data-testid="btn-estimate"
            disabled
            className="shrink-0 inline-flex items-center justify-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold rounded border border-gray-300 bg-gray-50 text-gray-400 cursor-not-allowed"
          >
            <Calculator className="w-3 h-3" />
            試算
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="ready-cta-banner"
      className="px-3 py-2 border-y bg-green-50 border-green-200"
    >
      <div className="flex items-center gap-1.5 mb-1.5">
        <CheckCircle2 className="w-3.5 h-3.5 text-green-700" />
        <span className="text-[11px] font-semibold text-green-700">
          {readyCount} 份名單已準備完成
        </span>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          data-testid="btn-trigger-run"
          onClick={onTriggerRun}
          className="flex-1 inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold rounded bg-blue-700 text-white hover:bg-blue-800 shadow-sm transition"
        >
          <PlayCircle className="w-3 h-3" />
          執行 {workYm} 月跑
        </button>
        <Link
          to="/assignment/estimate"
          data-testid="btn-estimate"
          className="shrink-0 inline-flex items-center justify-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold rounded border border-blue-700 text-blue-700 bg-white hover:bg-blue-50 transition"
          title="Stage 0 試算（預估月跑筆數與分配）"
        >
          <Calculator className="w-3 h-3" />
          試算
        </Link>
      </div>
    </div>
  );
}
