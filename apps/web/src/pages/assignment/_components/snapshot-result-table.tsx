import { useState, useEffect, useCallback } from 'react';
import { Search, UploadCloud, AlertTriangle, Info, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  getResultPage,
  type ResultPageResponse,
} from '@/api/assignment-run';
import { getEffectiveIdentity } from '@/stores/auth-store';
import { WritebackModal } from './writeback-modal';

/**
 * F066 v1.3 §5.3 / AC-8 — 分派結果友善表格
 *
 * 呼叫 GET /assignment/runs/:runId/result（分頁端點），以與 F064 匯出一致的 23 欄呈現
 * （含部門名稱 / 姓名 / 名單名稱等 join decode）。提供分頁與後端搜尋（客戶編號 / 人員工號 / 案號）。
 *
 * F115 回寫按鈕：本輪為 disabled 佔位（標「下一階段」），實作見 F115。
 */

const PAGE_SIZE = 50;

/** 代碼型欄位以 mono 呈現。 */
const CODE_KEYS = new Set(['applNo', 'listNo', 'emplid', 'crId', 'deptId']);

function CellValue({ colKey, value }: { colKey: string; value: string }) {
  if (colKey === 'isCr') {
    return value === 'Y' ? (
      <span className="inline-flex px-1.5 py-0.5 text-[11px] font-semibold rounded bg-amber-100 text-amber-700">
        是
      </span>
    ) : (
      <span className="text-gray-400">否</span>
    );
  }
  if (colKey === 'tierLevel' && value) {
    return (
      <span className="inline-flex px-1.5 py-0.5 text-[11px] font-semibold rounded bg-green-100 text-success">
        {value}
      </span>
    );
  }
  if (!value) return <span className="text-gray-300">—</span>;
  return (
    <span className={CODE_KEYS.has(colKey) ? 'font-mono text-gray-700' : ''}>
      {value}
    </span>
  );
}

export function SnapshotResultTable({ runId }: { runId: string }) {
  const [qInput, setQInput] = useState('');
  const [submittedQ, setSubmittedQ] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ResultPageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showWriteback, setShowWriteback] = useState(false);

  // F115：回寫為部長專屬（後端 DirectorGuard 允許 admin / director）。
  const canWriteback = ['admin', 'director'].includes(getEffectiveIdentity());

  useEffect(() => {
    if (!runId) return;
    let aborted = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await getResultPage(runId, {
          page,
          pageSize: PAGE_SIZE,
          q: submittedQ || undefined,
        });
        if (!aborted) setData(res);
      } catch (err: unknown) {
        const e = err as { response?: { data?: { message?: string } } };
        if (!aborted) setError(e?.response?.data?.message ?? '載入分派結果失敗');
      } finally {
        if (!aborted) setLoading(false);
      }
    })();
    return () => {
      aborted = true;
    };
  }, [runId, page, submittedQ]);

  const doSearch = useCallback(() => {
    setPage(1);
    setSubmittedQ(qInput.trim());
  }, [qInput]);

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(total, page * PAGE_SIZE);
  const columns = data?.columns ?? [];
  const rows = data?.rows ?? [];

  return (
    <div className="space-y-3" data-testid="snapshot-result-table">
      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-700">分派明細</span>
          <span className="text-xs text-gray-400">欄位與「結果摘要」匯出 Excel 一致</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              data-testid="result-search-input"
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') doSearch();
              }}
              placeholder="搜尋 客戶編號 / 人員工號 / 案號…"
              className="pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-md w-72 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>
          <button
            type="button"
            data-testid="result-search-btn"
            onClick={doSearch}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-primary rounded-md hover:bg-blue-700 transition"
          >
            查詢
          </button>
          {/* F115 回寫按鈕（部長 / admin 專屬） */}
          {canWriteback && (
            <button
              type="button"
              data-testid="btn-writeback"
              onClick={() => setShowWriteback(true)}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-primary rounded-md hover:bg-blue-700 transition"
            >
              <UploadCloud className="w-3.5 h-3.5" />
              回寫業務系統
            </button>
          )}
        </div>
      </div>

      {loading && (
        <div className="p-12 text-center text-gray-400" data-testid="result-loading">
          載入分派結果中…
        </div>
      )}

      {error && !loading && (
        <div
          data-testid="result-error"
          className="rounded-lg p-3 bg-red-50 border border-red-200 flex items-start gap-2 text-sm"
        >
          <AlertTriangle className="w-4 h-4 text-danger mt-0.5 shrink-0" />
          <span className="text-red-800">{error}</span>
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <div
          data-testid="result-empty"
          className="p-12 text-center text-sm text-gray-500 flex flex-col items-center gap-2"
        >
          <Info className="w-6 h-6 text-gray-300" />
          {submittedQ ? '查無符合搜尋條件的分派紀錄' : '本次分派無結果紀錄'}
        </div>
      )}

      {!loading && !error && rows.length > 0 && (
        <>
          <div className="border border-gray-200 rounded-lg overflow-x-auto">
            <table className="min-w-full text-xs whitespace-nowrap">
              <thead className="bg-gray-50/60 text-gray-500">
                <tr>
                  {columns.map((c) => (
                    <th key={c.key} className="text-left px-3 py-2 font-semibold">
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-gray-700">
                {rows.map((row, i) => (
                  <tr key={i} className="hover:bg-gray-50/50 transition">
                    {columns.map((c) => (
                      <td key={c.key} className="px-3 py-1.5">
                        <CellValue colKey={c.key} value={row[c.key] ?? ''} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 分頁控制 */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="text-xs text-gray-500" data-testid="result-range">
              顯示第 <strong>{from.toLocaleString()}</strong>–
              <strong>{to.toLocaleString()}</strong> 筆 / 共{' '}
              <strong className="tabular-nums">{total.toLocaleString()}</strong> 筆
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                data-testid="result-prev"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs border border-gray-200 rounded-md text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                上一頁
              </button>
              <span className="px-2 text-xs text-gray-500">
                第 {page} / {totalPages} 頁
              </span>
              <button
                type="button"
                data-testid="result-next"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs border border-gray-200 rounded-md text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                下一頁
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </>
      )}

      {showWriteback && (
        <WritebackModal runId={runId} onClose={() => setShowWriteback(false)} />
      )}
    </div>
  );
}
