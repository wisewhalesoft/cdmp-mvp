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

/**
 * F066 v1.3：欄位 key → 中文表頭字典（使用者友善）。未收錄的 key 回退顯示原 key。
 * 涵蓋輸入名單 / 分派結果快照常見欄位。
 */
const COLUMN_LABELS: Record<string, string> = {
  listNo: '名單編號',
  list_no: '名單編號',
  listNm: '名單名稱',
  custoNo: '客戶編號',
  custo_no: '客戶編號',
  applNo: '案號',
  appl_no: '案號',
  orgno: '機構',
  cardType: '計分卡',
  card_type: '計分卡',
  cardLevel: '等級',
  card_level: '等級',
  tierLevel: '分級',
  tier_level: '分級',
  score: '分數',
  deptId: '部門代號',
  dept_id: '部門代號',
  emplid: '員編',
  emplidDeptid: '人員所屬部門',
  emplid_deptid: '人員所屬部門',
  staCode: '狀態碼',
  sta_code: '狀態碼',
  isCr: '是否分配CR',
  is_cr: '是否分配CR',
  crId: 'CR_ID',
  cr_id: 'CR_ID',
  crNm: 'CR_NM',
  cr_nm: 'CR_NM',
  assignday: '指派日',
  status: '狀態',
  settleSrc: '結清來源',
  settle_src: '結清來源',
};

function columnLabel(key: string): string {
  return COLUMN_LABELS[key] ?? key;
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
                  {columnLabel(c)}
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
