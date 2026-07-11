import { GitCompare, Repeat, Search, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { RunListItem } from '@/api/assignment-run';

/**
 * F067 Run Compare 雙下拉 selector
 *
 * 對應 prototype 36-run-compare.html L174-232
 *
 * 行為：
 *   - 兩個 select（Run A Base / Run B Compare）
 *   - 摘要：作業年月 / 總筆數 / 完成時間
 *   - 「交換 A/B」：A↔B
 *   - 「重新比對」：觸發 onCompare(runA, runB)
 *   - A=B 時「重新比對」disabled
 */

export interface RunSelectorProps {
  /** 可選的 runs（建議僅 status='completed'） */
  runs: RunListItem[];
  runA: string;
  runB: string;
  onCompare: (runA: string, runB: string) => void;
  /** 選 A 變化通知（不傳則純展示型） */
  onChangeA?: (runId: string) => void;
  /** 選 B 變化通知 */
  onChangeB?: (runId: string) => void;
  /** 是否處理中（重新比對 loading） */
  loading?: boolean;
}

function formatYm(ym: string | null | undefined): string {
  if (!ym) return '—';
  if (ym.length === 6) return `${ym.slice(0, 4)}-${ym.slice(4, 6)}`;
  return ym;
}

function formatDateTime(iso?: string | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${m}-${day} ${h}:${mi}`;
  } catch {
    return iso;
  }
}

function RunSummary({ run, label }: { run: RunListItem | undefined; label: 'A' | 'B' }) {
  if (!run) {
    return (
      <p className="text-xs text-gray-400 mt-3">尚未選擇 Run {label}</p>
    );
  }
  return (
    <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
      <div>
        <span className="text-gray-500">作業年月</span>
        <div className="font-mono font-semibold text-gray-700">
          {formatYm(run.projectWorkym)}
        </div>
      </div>
      <div>
        <span className="text-gray-500">總筆數</span>
        <div className="font-mono font-semibold text-gray-700 tabular-nums">
          {(run.totalCases ?? 0).toLocaleString()}
        </div>
      </div>
      <div>
        <span className="text-gray-500">完成時間</span>
        <div className="font-mono text-gray-700">
          {formatDateTime(run.finishedAt)}
        </div>
      </div>
    </div>
  );
}

export function RunSelector({
  runs,
  runA,
  runB,
  onCompare,
  onChangeA,
  onChangeB,
  loading = false,
}: RunSelectorProps) {
  if (runs.length === 0) {
    return (
      <div
        data-testid="run-selector-empty"
        className="bg-white rounded-lg border border-gray-200 p-6 text-sm text-gray-500"
      >
        <Info className="w-4 h-4 inline mr-1 text-gray-400" />
        無可用的 completed 月名單分派紀錄；請先完成至少 2 次月名單分派後方可比對。
      </div>
    );
  }

  const findRun = (id: string) => runs.find((r) => r.runId === id);
  const runAObj = findRun(runA);
  const runBObj = findRun(runB);
  const sameRun = runA === runB;

  const handleSwap = () => {
    onCompare(runB, runA);
  };
  const handleRecompare = () => {
    if (!sameRun) onCompare(runA, runB);
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
      <div className="px-5 py-4 border-b border-gray-200 flex items-center gap-2">
        <GitCompare className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold text-gray-800">
          選擇要比對的兩次月名單分派
        </h3>
      </div>
      <div className="grid grid-cols-2 gap-0 divide-x divide-gray-200">
        {/* Run A */}
        <div className="px-5 py-4 bg-blue-50/30">
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-primary text-white">
              A
            </span>
            <span className="text-sm font-semibold text-primary">Base Run</span>
          </div>
          <select
            data-testid="select-run-a"
            value={runA}
            onChange={(e) => onChangeA?.(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          >
            {runs.map((r) => (
              <option key={r.runId} value={r.runId}>
                {r.runId.slice(0, 13)} — {formatYm(r.projectWorkym)}（
                {(r.totalCases ?? 0).toLocaleString()} 筆）
              </option>
            ))}
          </select>
          <RunSummary run={runAObj} label="A" />
        </div>

        {/* Run B */}
        <div className="px-5 py-4 bg-green-50/30">
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-green-600 text-white">
              B
            </span>
            <span className="text-sm font-semibold text-green-700">
              Compare Run
            </span>
          </div>
          <select
            data-testid="select-run-b"
            value={runB}
            onChange={(e) => onChangeB?.(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          >
            {runs.map((r) => (
              <option key={r.runId} value={r.runId}>
                {r.runId.slice(0, 13)} — {formatYm(r.projectWorkym)}（
                {(r.totalCases ?? 0).toLocaleString()} 筆）
              </option>
            ))}
          </select>
          <RunSummary run={runBObj} label="B" />
        </div>
      </div>
      <div className="px-5 py-3 border-t border-gray-200 bg-gray-50/40 flex items-center justify-between">
        <div className="text-xs text-gray-500 inline-flex items-center gap-1">
          <Info className="w-3.5 h-3.5" />
          僅 status = completed 的月名單分派可比對；同月比對常用於重跑調參驗證
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="btn-swap"
            onClick={handleSwap}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-200 rounded-md hover:bg-white transition"
          >
            <Repeat className="w-3.5 h-3.5" />
            交換 A / B
          </button>
          <Button
            type="button"
            variant="primary"
            data-testid="btn-recompare"
            disabled={sameRun}
            loading={loading}
            loadingText="比對中..."
            onClick={handleRecompare}
          >
            <span className="inline-flex items-center gap-1.5">
              <Search className="w-3.5 h-3.5" />
              重新比對
            </span>
          </Button>
        </div>
      </div>
    </div>
  );
}
