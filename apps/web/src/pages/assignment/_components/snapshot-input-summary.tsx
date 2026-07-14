import { useMemo, useState } from 'react';
import { Search, CheckCircle2, XCircle } from 'lucide-react';
import { CardTypeBadge } from './card-type-badge';
import type { RunSummaryResponse } from '@/api/assignment-run';

/**
 * F066 — 輸入名單快照面板（對齊 prototype 35 輸入名單分頁）
 *
 * 由 input_list 快照之 cases（每列 listNo/applNo/orgno/cardType）聚合：
 *   - 3 張摘要卡：候選客戶總筆數 / 使用中名單數 / 最終分派筆數（+ 覆蓋率）
 *   - 各名單筆數明細表（名單編號 / 名單名稱 / 計分卡 / 候選筆數 / 佔比 + 合計）
 *   - 案號查詢：輸入案號，判斷是否在候選名單中
 *
 * 名單名稱來自 config 快照之 listDefinitions（listNo→listNm）；查無則以代碼呈現。
 */

interface InputCase {
  listNo?: string;
  applNo?: string;
  orgno?: string;
  cardType?: string;
}
interface ListDef {
  listNo?: string;
  listNm?: string;
  cardType?: string | null;
}

export interface SnapshotInputSummaryProps {
  payload: { cases?: unknown[] } | null;
  listDefs?: ListDef[];
  summary?: RunSummaryResponse | null;
  run?: { totalCases?: number | null } | null;
}

function StatCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone: 'blue' | 'gray' | 'green';
}) {
  const valueCls =
    tone === 'blue' ? 'text-primary' : tone === 'green' ? 'text-success' : 'text-gray-700';
  const boxCls =
    tone === 'blue'
      ? 'bg-blue-50 border-blue-100'
      : tone === 'green'
        ? 'bg-green-50 border-green-100'
        : 'bg-gray-50 border-gray-200';
  return (
    <div className={`rounded-lg border p-4 ${boxCls}`}>
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`text-2xl font-bold tabular-nums ${valueCls}`}>{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
    </div>
  );
}

function pct(n: number, total: number): string {
  if (!total) return '0.0%';
  return `${((n / total) * 100).toFixed(1)}%`;
}

export function SnapshotInputSummary({
  payload,
  listDefs,
  summary,
  run,
}: SnapshotInputSummaryProps) {
  const cases = (payload?.cases ?? []) as InputCase[];

  const nameByList = useMemo(() => {
    const m = new Map<string, { listNm?: string; cardType?: string | null }>();
    for (const d of listDefs ?? []) {
      if (d.listNo) m.set(d.listNo, { listNm: d.listNm, cardType: d.cardType });
    }
    return m;
  }, [listDefs]);

  const byList = useMemo(() => {
    const counts = new Map<string, { count: number; cardType?: string }>();
    for (const c of cases) {
      const k = c.listNo ?? '—';
      const cur = counts.get(k) ?? { count: 0, cardType: c.cardType };
      cur.count += 1;
      counts.set(k, cur);
    }
    return [...counts.entries()]
      .map(([listNo, v]) => ({
        listNo,
        count: v.count,
        cardType: nameByList.get(listNo)?.cardType ?? v.cardType ?? null,
        listNm: nameByList.get(listNo)?.listNm ?? null,
      }))
      .sort((a, b) => a.listNo.localeCompare(b.listNo));
  }, [cases, nameByList]);

  const applIndex = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of cases) if (c.applNo) m.set(c.applNo, c.listNo ?? '');
    return m;
  }, [cases]);

  const total = cases.length;
  const [q, setQ] = useState('');
  const [lookup, setLookup] = useState<{ appl: string; listNo: string | null } | null>(null);
  const doLookup = () => {
    const key = q.trim();
    if (!key) {
      setLookup(null);
      return;
    }
    setLookup({ appl: key, listNo: applIndex.has(key) ? applIndex.get(key) ?? '' : null });
  };

  const finalAssigned = summary?.stage4Count ?? run?.totalCases ?? null;
  const coverage =
    summary && summary.coverageRate != null
      ? `覆蓋率 ${(summary.coverageRate * 100).toFixed(1)}%`
      : undefined;

  if (!payload) {
    return (
      <div data-testid="snapshot-input-empty" className="p-8 text-center text-sm text-gray-500">
        輸入名單快照尚未建立
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="snapshot-input-summary">
      {/* 摘要卡 */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <StatCard
          label="候選客戶總筆數"
          value={total.toLocaleString()}
          sub="分派前篩選出的候選名單"
          tone="blue"
        />
        <StatCard
          label="使用中名單數"
          value={byList.length.toLocaleString()}
          sub="本月納入分派的名單"
          tone="gray"
        />
        <StatCard
          label="最終分派筆數"
          value={finalAssigned != null ? finalAssigned.toLocaleString() : '—'}
          sub={coverage}
          tone="green"
        />
      </div>

      {/* 各名單明細 */}
      <div className="bg-white border border-gray-200 rounded-lg">
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between flex-wrap gap-2">
          <span className="text-sm font-semibold text-gray-700">各名單筆數明細</span>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                data-testid="input-search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') doLookup();
                }}
                placeholder="輸入案號，查詢是否在候選名單中…"
                className="pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-md w-72 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
            <button
              type="button"
              data-testid="input-search-btn"
              onClick={doLookup}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-primary rounded-md hover:bg-blue-700 transition"
            >
              查詢
            </button>
          </div>
        </div>

        {lookup && (
          <div
            data-testid="input-lookup-result"
            className={`px-4 py-2 text-xs flex items-center gap-2 border-b border-gray-200 ${
              lookup.listNo ? 'bg-green-50 text-green-800' : 'bg-gray-50 text-gray-600'
            }`}
          >
            {lookup.listNo ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                案號 <span className="font-mono">{lookup.appl}</span> 在候選名單
                <span className="font-mono">{lookup.listNo}</span> 中
              </>
            ) : (
              <>
                <XCircle className="w-3.5 h-3.5 text-gray-400" />
                案號 <span className="font-mono">{lookup.appl}</span> 不在本次候選名單
              </>
            )}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50/60 text-xs text-gray-500">
              <tr>
                <th className="text-left px-4 py-2 font-semibold">名單編號</th>
                <th className="text-left px-4 py-2 font-semibold">名單名稱</th>
                <th className="text-left px-4 py-2 font-semibold">計分卡</th>
                <th className="text-right px-4 py-2 font-semibold">候選筆數</th>
                <th className="text-right px-4 py-2 font-semibold">佔比</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {byList.map((r) => (
                <tr key={r.listNo}>
                  <td className="px-4 py-2 font-mono text-xs text-gray-700">{r.listNo}</td>
                  <td className="px-4 py-2">{r.listNm ?? '—'}</td>
                  <td className="px-4 py-2">
                    <CardTypeBadge code={r.cardType} />
                  </td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums">
                    {r.count.toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-gray-500">
                    {pct(r.count, total)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50/60 font-semibold">
                <td colSpan={3} className="px-4 py-2 text-right">
                  合計
                </td>
                <td className="px-4 py-2 text-right font-mono tabular-nums">
                  {total.toLocaleString()}
                </td>
                <td className="px-4 py-2 text-right font-mono text-gray-500">100.0%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
