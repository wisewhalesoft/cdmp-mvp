import { Users } from 'lucide-react';

/**
 * 個別業務比例頁的整體完成進度 banner（prototype 29b L252-272）
 *
 * 視覺：左 icon + 完成進度文字 + 中間進度條 + 右側「業務員總數」
 */

export interface PersonnelProgressBannerProps {
  doneCount: number;
  totalCount: number;
  totalEmployees: number;
}

export function PersonnelProgressBanner({
  doneCount,
  totalCount,
  totalEmployees,
}: PersonnelProgressBannerProps) {
  const pct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;
  return (
    <section
      data-testid="personnel-progress-banner"
      className="bg-white rounded-xl border border-gray-200 px-5 py-3 flex items-center justify-between gap-4 flex-wrap"
    >
      <div className="flex items-center gap-3">
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center"
          style={{ background: '#EDE9FE', color: '#6D28D9' }}
        >
          <Users className="w-5 h-5" />
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-800">
            部門完成進度：
            <span data-testid="progress-text">
              {doneCount} / {totalCount}
            </span>
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            每部門在職員工 RATION 加總 = 100% 才視為完成；全部完成方可推進至簽核
          </p>
        </div>
      </div>
      <div className="flex-1 max-w-xs min-w-[160px]">
        <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
          <div
            data-testid="progress-bar"
            className="h-full bg-green-500 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      <div className="text-right">
        <p className="text-[10px] text-gray-400 uppercase tracking-wider">本批業務員總數</p>
        <p
          className="text-base font-semibold text-gray-800 tabular-nums"
          data-testid="total-employees"
        >
          {totalEmployees} 人
        </p>
      </div>
    </section>
  );
}
