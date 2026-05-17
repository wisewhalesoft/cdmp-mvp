import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  History,
  Search,
  RefreshCw,
  FileBarChart,
  Camera,
  GitCompare,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Loader2,
} from 'lucide-react';
import { AppLayout } from '@/components/layout/app-layout';
import { Button } from '@/components/ui/button';
import { MonthPicker } from '@/components/e07/MonthPicker';
import { listRuns, type RunListItem, type RunStatus } from '@/api/assignment-run';

/**
 * F065 — 月跑歷史頁
 *
 * 對應 prototype: /prototypes/34-run-history.html
 *
 * RBAC: DirectorOrSectionChiefRoute（讀；含處長）
 *
 * 功能：
 *   - MonthPicker 選擇月份 → fetch /assignment/runs?ym=
 *   - 表格列出所有 runs（status badge + 觸發人/時間/完成時間）
 *   - 每列 action: 進度 / 結果摘要 / 快照 / 與另一 run 比對
 *   - 多選 2 個 run → 比對按鈕
 */

const STATUS_CFG: Record<RunStatus, { label: string; bg: string; text: string; icon: typeof Activity }> = {
  pending: { label: '排程中', bg: 'bg-gray-100', text: 'text-gray-600', icon: Clock },
  running: { label: '執行中', bg: 'bg-blue-100', text: 'text-blue-800', icon: Loader2 },
  completed: { label: '已完成', bg: 'bg-green-100', text: 'text-green-700', icon: CheckCircle2 },
  failed: { label: '失敗', bg: 'bg-red-100', text: 'text-red-700', icon: AlertTriangle },
};

function StatusBadge({ status }: { status: RunStatus }) {
  const cfg = STATUS_CFG[status] ?? STATUS_CFG.pending;
  const Icon = cfg.icon;
  return (
    <span
      data-testid={`run-row-status-${status}`}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}
    >
      <Icon className={`w-3 h-3 ${status === 'running' ? 'animate-spin' : ''}`} />
      {cfg.label}
    </span>
  );
}

function toYYYYMM(yyyymm: string): string {
  return `${yyyymm.slice(0, 4)}-${yyyymm.slice(4, 6)}`;
}
function toYYYYMMRaw(yyyyMm: string): string {
  return yyyyMm.replace('-', '');
}
function currentYmDisplay(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}
function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso ?? '—';
  }
}

// Phase 3 P2-4：耗時 helper
function formatDuration(
  triggeredAt: string,
  finishedAt: string | null | undefined,
): string {
  if (!finishedAt) return '—';
  try {
    const ms = new Date(finishedAt).getTime() - new Date(triggeredAt).getTime();
    if (Number.isNaN(ms) || ms <= 0) return '—';
    const s = Math.floor(ms / 1000);
    const hh = Math.floor(s / 3600);
    const mm = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    if (hh > 0) return `${pad(hh)}:${pad(mm)}:${pad(ss)}`;
    return `${pad(mm)}:${pad(ss)}`;
  } catch {
    return '—';
  }
}

export function RunHistoryPage() {
  const navigate = useNavigate();
  const [ym, setYm] = useState(currentYmDisplay());
  const [runs, setRuns] = useState<RunListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Phase 3 P2-4：新增 filter
  const [statusFilter, setStatusFilter] = useState<'all' | RunStatus>('all');
  const [triggeredByFilter, setTriggeredByFilter] = useState<string>('all');

  const fetchRuns = useCallback(async (selectedYm: string) => {
    setLoading(true);
    setError(null);
    setSelected(new Set());
    try {
      const data = await listRuns(toYYYYMMRaw(selectedYm));
      setRuns(data.runs ?? []);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e?.response?.data?.message ?? '載入月跑歷史失敗');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchRuns(ym);
  }, [ym, fetchRuns]);

  const filteredRuns = useMemo(() => {
    let list = runs;
    if (statusFilter !== 'all') {
      list = list.filter((r) => r.status === statusFilter);
    }
    if (triggeredByFilter !== 'all') {
      list = list.filter((r) => r.triggeredBy === triggeredByFilter);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.runId.toLowerCase().includes(q) ||
          (r.triggeredBy ?? '').toLowerCase().includes(q),
      );
    }
    return list;
  }, [runs, search, statusFilter, triggeredByFilter]);

  // 觸發者下拉的 options（從現有 runs 萃取 unique）
  const triggeredByOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of runs) {
      if (r.triggeredBy) set.add(r.triggeredBy);
    }
    return Array.from(set).sort();
  }, [runs]);

  const toggleSelect = (runId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(runId)) next.delete(runId);
      else if (next.size < 2) next.add(runId);
      return next;
    });
  };

  // Phase 3 P2-4：全選（取 filtered 前 2 個 completed runs）
  const handleSelectAll = () => {
    setSelected((prev) => {
      if (prev.size > 0) {
        // 已有選擇 → 全清
        return new Set();
      }
      const completedRuns = filteredRuns
        .filter((r) => r.status === 'completed')
        .slice(0, 2);
      return new Set(completedRuns.map((r) => r.runId));
    });
  };

  const canCompare = selected.size === 2;

  const handleCompare = () => {
    if (!canCompare) return;
    const [runA, runB] = Array.from(selected);
    navigate(`/assignment/compare?runA=${runA}&runB=${runB}`);
  };

  return (
    <AppLayout
      title="執行歷史"
      actions={<MonthPicker value={ym} onChange={setYm} />}
    >
      <main className="flex-1 p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <p className="text-sm text-gray-500">
            月份 <code className="font-mono text-primary">{toYYYYMM(toYYYYMMRaw(ym))}</code> 之所有月跑。可選 2 個進行比對。
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => void fetchRuns(ym)}
              disabled={loading}
            >
              <span className="inline-flex items-center gap-1.5">
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                重新整理
              </span>
            </Button>
            <Button
              type="button"
              variant="primary"
              data-testid="btn-compare-selected"
              disabled={!canCompare}
              onClick={handleCompare}
            >
              <span className="inline-flex items-center gap-1.5">
                <GitCompare className="w-4 h-4" />
                比對 ({selected.size}/2)
              </span>
            </Button>
          </div>
        </div>

        {error && (
          <div
            data-testid="history-error"
            className="rounded-lg p-3 bg-red-50 border border-red-200 text-sm text-red-800"
          >
            {error}
          </div>
        )}

        <section className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[240px] max-w-md">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜尋 runId / 觸發人"
                className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <select
              data-testid="filter-status"
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as 'all' | RunStatus)
              }
              className="px-3 py-2 text-sm border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="all">狀態：全部</option>
              <option value="completed">completed — 已完成</option>
              <option value="failed">failed — 失敗</option>
              <option value="running">running — 執行中</option>
              <option value="pending">pending — 待執行</option>
            </select>
            <select
              data-testid="filter-triggered-by"
              value={triggeredByFilter}
              onChange={(e) => setTriggeredByFilter(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="all">觸發者：全部</option>
              {triggeredByOptions.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
            {(statusFilter !== 'all' ||
              triggeredByFilter !== 'all' ||
              search) && (
              <button
                type="button"
                onClick={() => {
                  setStatusFilter('all');
                  setTriggeredByFilter('all');
                  setSearch('');
                }}
                className="text-xs text-gray-500 hover:text-primary underline"
              >
                清除篩選
              </button>
            )}
          </div>
        </section>

        <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-gray-400" data-testid="history-loading">
              載入中...
            </div>
          ) : filteredRuns.length === 0 ? (
            <div
              className="p-12 flex flex-col items-center text-center"
              data-testid="history-empty"
            >
              <History className="w-8 h-8 text-gray-400 mb-2" />
              <p className="text-sm text-gray-500">本月尚無月跑紀錄</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead
                  data-testid="history-table-head"
                  className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase"
                >
                  <tr>
                    <th className="text-left px-3 py-3 font-semibold w-[4%]">
                      <input
                        type="checkbox"
                        data-testid="checkbox-select-all"
                        checked={selected.size > 0}
                        onChange={handleSelectAll}
                        title="全選 / 全清（最多 2 個 completed run）"
                        className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-2 focus:ring-primary/20"
                      />
                    </th>
                    <th className="text-left px-3 py-3 font-semibold w-[18%]">runId</th>
                    <th className="text-left px-3 py-3 font-semibold w-[8%]">月份</th>
                    <th className="text-left px-3 py-3 font-semibold w-[9%]">狀態</th>
                    <th className="text-left px-3 py-3 font-semibold w-[10%]">觸發人</th>
                    <th className="text-left px-3 py-3 font-semibold w-[13%]">觸發時間</th>
                    <th className="text-left px-3 py-3 font-semibold w-[13%]">完成時間</th>
                    <th className="text-right px-3 py-3 font-semibold w-[8%]">耗時</th>
                    <th className="text-right px-3 py-3 font-semibold w-[9%]">分派筆數</th>
                    <th className="text-right px-3 py-3 font-semibold w-[8%]">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredRuns.map((r) => {
                    const isSelected = selected.has(r.runId);
                    return (
                      <tr
                        key={r.runId}
                        data-testid={`run-row-${r.runId}`}
                        className={`hover:bg-gray-50/50 ${isSelected ? 'bg-blue-50/30' : ''}`}
                      >
                        <td className="px-3 py-3">
                          <input
                            type="checkbox"
                            data-testid={`run-checkbox-${r.runId}`}
                            checked={isSelected}
                            onChange={() => toggleSelect(r.runId)}
                            disabled={!isSelected && selected.size >= 2}
                            className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-2 focus:ring-primary/20"
                          />
                        </td>
                        <td className="px-3 py-3 font-mono text-xs text-primary">
                          {r.runId}
                        </td>
                        <td className="px-3 py-3 font-mono text-xs text-gray-700">
                          {r.ym}
                        </td>
                        <td className="px-3 py-3">
                          <StatusBadge status={r.status} />
                        </td>
                        <td className="px-3 py-3 text-gray-600 text-xs">
                          {r.triggeredBy}
                        </td>
                        <td className="px-3 py-3 text-gray-500 text-xs font-mono">
                          {formatDateTime(r.triggeredAt)}
                        </td>
                        <td className="px-3 py-3 text-gray-500 text-xs font-mono">
                          {formatDateTime(r.finishedAt)}
                        </td>
                        <td className="px-3 py-3 text-right text-gray-700 text-xs font-mono tabular-nums">
                          {formatDuration(r.triggeredAt, r.finishedAt)}
                        </td>
                        <td className="px-3 py-3 text-right text-gray-700 text-xs font-mono tabular-nums">
                          {r.totalCount?.toLocaleString() ?? '—'}
                        </td>
                        <td className="px-3 py-3 text-right">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              title="進度"
                              onClick={() =>
                                navigate(`/assignment/run-progress?runId=${r.runId}`)
                              }
                              className="p-1.5 text-primary hover:bg-blue-50 rounded"
                            >
                              <Activity className="w-3.5 h-3.5" />
                            </button>
                            {r.status === 'completed' && (
                              <>
                                <button
                                  type="button"
                                  title="結果摘要"
                                  onClick={() =>
                                    navigate(`/assignment/run-summary?runId=${r.runId}`)
                                  }
                                  className="p-1.5 text-primary hover:bg-blue-50 rounded"
                                >
                                  <FileBarChart className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  title="快照詳情"
                                  onClick={() =>
                                    navigate(`/assignment/snapshots?runId=${r.runId}`)
                                  }
                                  className="p-1.5 text-primary hover:bg-blue-50 rounded"
                                >
                                  <Camera className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </AppLayout>
  );
}
