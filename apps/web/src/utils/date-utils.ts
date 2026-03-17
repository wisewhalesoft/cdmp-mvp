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
