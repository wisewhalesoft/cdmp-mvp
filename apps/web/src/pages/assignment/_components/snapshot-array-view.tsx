import { Info } from 'lucide-react';

/**
 * F066 Snapshot input_list / result 共用陣列 view
 *
 * 從 payload 中取指定 arrayKey（'cases' / 'assignments'），
 * 自動萃取 columns（從第一筆 row 取 keys），渲染表格。
 *
 * 超過 100 列只顯示前 100 + 提示總數（避免渲染過多 row 拖慢頁面；
 * 完整資料請使用「下載 JSON」功能或匯出 endpoint）。
 */

export interface SnapshotArrayViewProps {
  payload: Record<string, unknown> | null;
  /** payload 中的陣列 key（cases / assignments） */
  arrayKey: string;
  title: string;
  /** 最多渲染列數（預設 100） */
  maxRows?: number;
}

function formatCell(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'boolean') return v ? '✓' : '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export function SnapshotArrayView({
  payload,
  arrayKey,
  title,
  maxRows = 100,
}: SnapshotArrayViewProps) {
  if (!payload) {
    return (
      <div
        data-testid="snapshot-array-empty"
        className="p-8 text-center text-sm text-gray-500"
      >
        {title} 快照不存在或尚未寫入
      </div>
    );
  }

  const rows = (payload as Record<string, unknown>)[arrayKey];
  if (!Array.isArray(rows) || rows.length === 0) {
    return (
      <div
        data-testid="snapshot-array-empty-rows"
        className="p-8 text-center text-sm text-gray-500"
      >
        {title} 無紀錄
      </div>
    );
  }

  const total = rows.length;
  const visible = rows.slice(0, maxRows) as Array<Record<string, unknown>>;
  const columns = Object.keys(visible[0] ?? {});
  const truncated = total > maxRows;

  return (
    <div className="space-y-3">
      {truncated && (
        <div
          data-testid="snapshot-array-truncate-notice"
          className="rounded-md p-3 bg-blue-50 border border-blue-200 flex items-start gap-2 text-xs text-blue-800"
        >
          <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>
            顯示前 <strong>{maxRows}</strong> 列 / 共{' '}
            <strong>{total.toLocaleString()}</strong> 列。
            完整資料請使用「下載 JSON」或匯出 endpoint。
          </span>
        </div>
      )}
      <div
        data-testid="snapshot-array-table"
        className="border border-gray-200 rounded-lg overflow-x-auto"
      >
        <table className="min-w-full text-xs">
          <thead className="bg-gray-50/60 text-gray-500">
            <tr>
              {columns.map((c) => (
                <th
                  key={c}
                  className="text-left px-3 py-2 font-semibold whitespace-nowrap"
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {visible.map((row, i) => (
              <tr key={i}>
                {columns.map((c) => (
                  <td key={c} className="px-3 py-1.5 font-mono whitespace-nowrap">
                    {formatCell(row[c])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
