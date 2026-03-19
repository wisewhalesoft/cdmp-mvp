const dateFormatter = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Taipei',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const timeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Taipei',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/**
 * Convert ISO 8601 UTC string to UTC+8 (Asia/Taipei) display format.
 * @param isoString - ISO 8601 UTC string, e.g. "2026-01-15T14:30:00.000Z"
 * @returns Formatted string "YYYY-MM-DD HH:mm" in UTC+8
 */
export function formatDateTW(isoString: string): string {
  const date = new Date(isoString);
  // sv-SE locale outputs "YYYY-MM-DD HH:mm" format natively
  return dateFormatter.format(date);
}

/**
 * Convert ISO 8601 UTC string to UTC+8 time-only format (for chart X-axis).
 * @param isoString - ISO 8601 UTC string
 * @returns Formatted string "HH:mm" in UTC+8
 */
export function formatTimeTW(isoString: string): string {
  const date = new Date(isoString);
  return timeFormatter.format(date);
}

/**
 * Format duration in milliseconds to human-readable string (BR-5).
 * - >= 60000ms → "Xm Ys" (e.g. "3m 45s")
 * - >= 1000ms → "Xs" (e.g. "45s")
 * - < 1000ms → "Xms" (e.g. "120ms")
 * - null → "-"
 */
export function formatDuration(ms: number | null): string {
  if (ms === null) return '-';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${Math.floor(ms / 1000)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}
