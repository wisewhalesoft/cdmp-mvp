/**
 * Cron 表達式的中文顯示工具。
 *
 * 後端排程器（pipeline-scheduler / extraction-scheduler）以 `tz: 'Asia/Taipei'`
 * 解讀 cron，因此可解析的排程一律標註 (UTC+8)。
 */

/** 星期數字 → 中文（cron 的 0 = 週日） */
const DAY_NAMES = ['日', '一', '二', '三', '四', '五', '六'];

const TZ_SUFFIX = ' (UTC+8)';

const isNumericField = (field: string): boolean => /^\d+$/.test(field);

const pad2 = (field: string): string => field.padStart(2, '0');

/** 將 cron 的時、分欄轉成 "HH:mm"，超出合理範圍時回傳 null */
function toClockTime(minute: string, hour: string): string | null {
  if (!isNumericField(minute) || !isNumericField(hour)) return null;
  if (Number(minute) > 59 || Number(hour) > 23) return null;
  return `${pad2(hour)}:${pad2(minute)}`;
}

/** 單一星期段（`1` 或 `2-4`）轉中文，越界或非數字時回傳 null */
function toWeekdaySegment(segment: string): string | null {
  const range = /^([0-6])-([0-6])$/.exec(segment);
  if (range) return `週${DAY_NAMES[Number(range[1])]}至週${DAY_NAMES[Number(range[2])]}`;
  if (/^[0-6]$/.test(segment)) return `週${DAY_NAMES[Number(segment)]}`;
  return null;
}

/**
 * 將 cron 的星期欄轉成中文前綴，無法辨識時回傳 null。
 *
 * 擷取任務表單的「每週」是多選（selectedWeekdays.join(',')），
 * 因此 `1,3,5`、`2-4` 這類清單／範圍都是 UI 產得出來的合法排程。
 */
function toWeekdayLabel(dayOfWeek: string): string | null {
  if (dayOfWeek === '1-5') return '週一至週五';
  if (dayOfWeek === '0,6' || dayOfWeek === '6,0') return '週六、日';
  // 單一數字獨自出現時是「每週一」，出現在清單中時是「週一」
  if (/^[0-6]$/.test(dayOfWeek)) return `每週${DAY_NAMES[Number(dayOfWeek)]}`;

  const labels = dayOfWeek.split(',').map(toWeekdaySegment);
  return labels.every((label) => label !== null) ? labels.join('、') : null;
}

/** 回傳可讀描述（不含時區後綴），無法解析時回傳 null */
function describeCron(parts: string[]): string | null {
  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  if (month !== '*') return null;

  // 每 N 小時：0 *\/6 * * *
  const everyNHours = /^\*\/(\d+)$/.exec(hour);
  if (
    everyNHours &&
    minute === '0' &&
    dayOfMonth === '*' &&
    dayOfWeek === '*'
  ) {
    return `每 ${everyNHours[1]} 小時`;
  }

  // 每小時：15 * * * *
  if (
    hour === '*' &&
    dayOfMonth === '*' &&
    dayOfWeek === '*' &&
    isNumericField(minute) &&
    Number(minute) <= 59
  ) {
    return `每小時 ${pad2(minute)} 分`;
  }

  const clock = toClockTime(minute, hour);
  if (!clock) return null;

  // 每月 N 日：0 1 1 * *
  if (isNumericField(dayOfMonth) && dayOfWeek === '*') {
    const day = Number(dayOfMonth);
    if (day < 1 || day > 31) return null;
    return `每月 ${dayOfMonth} 日 ${clock}`;
  }

  if (dayOfMonth !== '*') return null;

  // 每日：0 2 * * *
  if (dayOfWeek === '*') return `每日 ${clock}`;

  // 每週 / 週間 / 週末
  const weekday = toWeekdayLabel(dayOfWeek);
  return weekday ? `${weekday} ${clock}` : null;
}

/**
 * 將 cron 表達式轉為中文可讀排程並標註時區。
 *
 * - 可解析：例如 `0 2 * * *` → `每日 02:00 (UTC+8)`
 * - 無排程（null / undefined / 空白）：`-`
 * - 無法解析：原樣回傳修剪後的 cron 字串，不加時區後綴
 *
 * 純函式：不依賴目前時間與 locale。
 */
export function formatCronTW(expr: string | null | undefined): string {
  if (expr === null || expr === undefined) return '-';

  const trimmed = expr.trim();
  if (trimmed === '') return '-';

  const parts = trimmed.split(/\s+/);
  if (parts.length !== 5) return trimmed;

  const description = describeCron(parts);
  return description ? `${description}${TZ_SUFFIX}` : trimmed;
}
