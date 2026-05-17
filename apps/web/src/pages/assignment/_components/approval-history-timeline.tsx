import { Check, X, Clock } from 'lucide-react';
import type { ApprovalHistoryItem } from '@/api/assignment-stage';

/**
 * 29c §4 / 29d §4 簽核歷史時間軸
 *
 * 對應 prototype 29c-approval-review.html L284-295。
 *
 * 行為：
 *   - history = [] 顯示「尚無簽核紀錄」
 *   - loading 顯示「載入中...」
 *   - approve 紀錄：綠色圈 + 「核准」標籤
 *   - reject 紀錄：紅色圈 + 「拒絕」標籤 + rejectReason
 *   - 由 service 端依 approved_at DESC 排序回傳，本元件直接渲染
 */

export interface ApprovalHistoryTimelineProps {
  history: ApprovalHistoryItem[];
  loading?: boolean;
}

function roleLabel(role: string | null): string {
  if (role === 'director' || role === 'admin') return '部長';
  if (role === 'section_chief') return '處長';
  return role ?? '';
}

function formatDateTime(iso: string): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${y}-${mo}-${day} ${h}:${mi}`;
  } catch {
    return iso;
  }
}

export function ApprovalHistoryTimeline({
  history,
  loading = false,
}: ApprovalHistoryTimelineProps) {
  if (loading) {
    return (
      <div className="p-6 text-center text-sm text-gray-400">載入中...</div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-gray-500">尚無簽核紀錄</div>
    );
  }

  return (
    <div>
      <div className="mb-2 text-xs text-gray-500 inline-flex items-center gap-1">
        <span data-testid="approval-history-count">
          共 <strong>{history.length}</strong> 筆
        </span>
      </div>
      <div className="space-y-3">
        {history.map((item) => {
          const isApprove = item.action === 'approve';
          const name = item.approverName ?? item.approverId;
          const role = roleLabel(item.approverRole);
          return (
            <div
              key={item.approvalId}
              data-testid={`approval-history-item-${item.approvalId}`}
              className={
                isApprove
                  ? 'rounded-lg bg-green-50/60 border border-green-200 p-3 flex items-start gap-3'
                  : 'rounded-lg bg-red-50/60 border border-red-200 p-3 flex items-start gap-3'
              }
            >
              <div
                className={
                  isApprove
                    ? 'w-7 h-7 rounded-full bg-green-100 flex items-center justify-center shrink-0'
                    : 'w-7 h-7 rounded-full bg-red-100 flex items-center justify-center shrink-0'
                }
              >
                {isApprove ? (
                  <Check className="w-4 h-4 text-green-700" />
                ) : (
                  <X className="w-4 h-4 text-red-700" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p
                  className={
                    isApprove
                      ? 'text-sm font-semibold text-green-900'
                      : 'text-sm font-semibold text-red-900'
                  }
                >
                  {name}
                  {role ? `（${role}）` : ''}{' '}
                  <span
                    className={
                      isApprove
                        ? 'text-xs font-normal text-green-700'
                        : 'text-xs font-normal text-red-700'
                    }
                  >
                    {isApprove ? '核准' : '拒絕'}
                  </span>
                </p>
                <p
                  className={
                    isApprove
                      ? 'text-xs text-green-700 mt-0.5'
                      : 'text-xs text-red-700 mt-0.5'
                  }
                >
                  <Clock className="w-3 h-3 inline mr-0.5" />
                  {formatDateTime(item.approvedAt)}
                </p>
                {!isApprove && item.rejectReason && (
                  <p className="text-xs text-red-800 mt-1 bg-white/60 border border-red-200 rounded px-2 py-1.5 font-mono leading-relaxed">
                    {item.rejectReason}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
