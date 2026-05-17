import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';

/**
 * F062 elapsed timer（mm:ss / hh:mm:ss）
 *
 * 對應 prototype 32-run-progress.html L204-206
 *
 * 行為：
 *   - status='running'：每秒更新顯示為 `now - startTime`
 *   - status='completed' | 'failed'：固定顯示 `finishedAt - startTime`
 *   - status='pending'：顯示 '--:--'
 *   - 格式：< 60 min → mm:ss；≥ 60 min → hh:mm:ss
 */

export function formatElapsed(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '00:00';
  const s = Math.floor(totalSeconds);
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (hh > 0) return `${pad(hh)}:${pad(mm)}:${pad(ss)}`;
  return `${pad(mm)}:${pad(ss)}`;
}

export interface ElapsedTimerProps {
  /** ISO datetime — 計時起點（通常為 run.triggeredAt 或 startedAt） */
  startTime: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  /** completed / failed 必填 — 計時終點 */
  finishedAt?: string | null;
}

function diffSeconds(startIso: string, endIso: string): number {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  return Math.floor((end - start) / 1000);
}

export function ElapsedTimer({
  startTime,
  status,
  finishedAt,
}: ElapsedTimerProps) {
  const [now, setNow] = useState(() => new Date().toISOString());

  useEffect(() => {
    if (status !== 'running') return;
    const id = setInterval(() => {
      setNow(new Date().toISOString());
    }, 1000);
    return () => clearInterval(id);
  }, [status]);

  let displayText: string;
  if (status === 'pending') {
    displayText = '--:--';
  } else if (status === 'completed' || status === 'failed') {
    const end = finishedAt ?? now;
    displayText = formatElapsed(diffSeconds(startTime, end));
  } else {
    // running
    displayText = formatElapsed(diffSeconds(startTime, now));
  }

  return (
    <span
      data-testid="elapsed-timer"
      className="inline-flex items-center gap-1 font-mono tabular-nums text-sm font-semibold text-primary"
    >
      <Clock className="w-3.5 h-3.5 text-gray-400" />
      {displayText}
    </span>
  );
}
