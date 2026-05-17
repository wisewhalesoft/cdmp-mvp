import { Zap } from 'lucide-react';

/**
 * 29c 拒絕原因快速套用 chips
 *
 * 對應 prototype 29c-approval-review.html L417-421
 *
 * 提供 5 個預設拒絕原因 chip；點擊後將完整 reason 字串透過 onApply 回傳父層
 * （父層自行將 reason 填入 textarea）。
 *
 * 父層可透過 reasons prop 自訂 chip 清單。
 */

export interface RejectReason {
  /** chip 顯示用標籤（短） */
  label: string;
  /** 點擊後實際套用的完整 reason 文字 */
  value: string;
}

export const DEFAULT_REJECT_REASONS: ReadonlyArray<RejectReason> = [
  {
    label: '比例分配不均',
    value: '比例分配不均，請參考 4 月慣例調整為均衡分配',
  },
  {
    label: '需重新評估部門權重',
    value: '需重新評估部門權重，部分部門配額與當前產品線重點不符',
  },
  {
    label: '業務員比例需依新政策調整',
    value: '業務員比例需依新政策調整：新進員工 ≤ 15%、資深員工 ≥ 25%',
  },
  {
    label: '績效未達標，下調 RATION',
    value: '部分業務員年度績效未達標，請下調 RATION 至 10-15% 區間',
  },
  {
    label: '拒絕原因待補充',
    value: '拒絕原因待補充',
  },
];

export interface RejectReasonChipsProps {
  /** 父層套用 reason 的 callback；帶入完整 reason 文字 */
  onApply: (reason: string) => void;
  /** 自訂 chip 清單；不提供時使用 DEFAULT_REJECT_REASONS */
  reasons?: ReadonlyArray<RejectReason>;
  /** 是否 disable 全部 chip（例如送出中） */
  disabled?: boolean;
  /** 是否顯示左側「常用原因快速套用」leader text；預設 true */
  showLeader?: boolean;
}

export function RejectReasonChips({
  onApply,
  reasons = DEFAULT_REJECT_REASONS,
  disabled = false,
  showLeader = true,
}: RejectReasonChipsProps) {
  return (
    <div data-testid="reject-reason-chips">
      {showLeader && (
        <p className="text-xs text-gray-500 mb-1.5 inline-flex items-center gap-1">
          <Zap className="w-3 h-3 text-amber-500" />
          常用原因快速套用：
        </p>
      )}
      <div className="flex flex-wrap gap-1.5">
        {reasons.map((r) => (
          <button
            key={r.label}
            type="button"
            disabled={disabled}
            onClick={() => onApply(r.value)}
            className="px-2.5 py-1 text-xs rounded border border-amber-200 bg-amber-50/60 text-amber-800 hover:bg-amber-100 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {r.label}
          </button>
        ))}
      </div>
    </div>
  );
}
