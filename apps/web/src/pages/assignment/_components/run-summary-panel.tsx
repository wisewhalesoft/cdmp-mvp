import {
  LayoutDashboard,
  Calendar,
  User,
  ClipboardList,
  Loader2,
} from 'lucide-react';

/**
 * F061 「本次執行摘要」面板（trigger-run 頁右側）
 *
 * 對應 prototype 31-trigger-run.html L332+
 *
 * 顯示：
 *   - 作業年月 + 觸發者
 *   - 本次將執行的 active 名單列表（含 listNo / listNm / estimated count）
 *   - 加總「總筆數」
 */

export interface RunSummaryListItem {
  listNo: string;
  listNm: string;
  estimatedCount: number;
}

export interface RunSummaryPanelProps {
  workYm: string;
  triggeredBy: string;
  lists: RunSummaryListItem[];
  loading?: boolean;
}

function formatYm(ym: string): string {
  if (ym.length === 6) return `${ym.slice(0, 4)}-${ym.slice(4, 6)}`;
  return ym;
}

export function RunSummaryPanel({
  workYm,
  triggeredBy,
  lists,
  loading = false,
}: RunSummaryPanelProps) {
  const totalEstimated = lists.reduce(
    (sum, l) => sum + (l.estimatedCount ?? 0),
    0,
  );

  if (loading) {
    return (
      <div
        data-testid="run-summary-loading"
        className="bg-white rounded-lg border border-gray-200 p-6 text-sm text-gray-400 flex items-center justify-center gap-2"
      >
        <Loader2 className="w-4 h-4 animate-spin" />
        載入名單摘要中...
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
      <div className="px-5 py-4 border-b border-gray-200 flex items-center gap-2">
        <LayoutDashboard className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold text-gray-800">本次執行摘要</h3>
      </div>
      <div className="p-5 space-y-3">
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <p className="text-gray-400 inline-flex items-center gap-1 mb-0.5">
              <Calendar className="w-3 h-3" />
              分派作業月份
            </p>
            <p className="font-mono text-sm font-semibold text-gray-900">
              {formatYm(workYm)}
            </p>
          </div>
          <div>
            <p className="text-gray-400 inline-flex items-center gap-1 mb-0.5">
              <User className="w-3 h-3" />
              觸發者
            </p>
            <p className="text-sm font-medium text-gray-800">{triggeredBy}</p>
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 bg-gray-50/40">
          <div className="px-3 py-2 flex items-center justify-between text-xs text-gray-600 border-b border-gray-200">
            <span className="inline-flex items-center gap-1">
              <ClipboardList className="w-3 h-3 text-gray-500" />
              將執行的名單
              <span
                data-testid="active-list-count"
                className="ml-1 px-1.5 py-0.5 bg-blue-50 text-primary rounded font-medium"
              >
                {lists.length}
              </span>
            </span>
            <span>
              預估總筆數{' '}
              <strong
                data-testid="total-estimated"
                className="text-primary tabular-nums"
              >
                {totalEstimated.toLocaleString()}
              </strong>
            </span>
          </div>
          {lists.length === 0 ? (
            <div className="p-6 text-xs text-center text-gray-400">
              本月尚無可執行名單（無法觸發月跑）
            </div>
          ) : (
            <ul className="divide-y divide-gray-200">
              {lists.map((l) => (
                <li
                  key={l.listNo}
                  className="px-3 py-2 flex items-center justify-between text-xs"
                >
                  <div className="flex-1 min-w-0">
                    <span className="font-mono text-primary mr-2">
                      {l.listNo}
                    </span>
                    <span className="text-gray-700">{l.listNm}</span>
                  </div>
                  <span className="text-gray-600 font-mono tabular-nums shrink-0 ml-2">
                    {l.estimatedCount.toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
