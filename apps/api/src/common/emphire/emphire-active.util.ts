/**
 * OB emphire「在職 / 離職」語意共用工具（single source of truth）。
 *
 * 對齊 legacy SP（SP_INFOT_ASSIGNEXPORTNAMELIST_st2_dept：`WHERE B.RESIGN_DATE < @SYS_DT` = 離職）：
 *   - 離職 = resign_date 有值且「嚴格小於」名單／系統日期
 *   - 在職 = resign_date 為 NULL，或 resign_date >= 名單／系統日期
 *   - 真實來源資料以哨兵值 '9999-12-31' 表「從未離職」（= 永久在職）
 *
 * ⚠️ 歷史地雷（memory feedback_mock_real_system_contract）：
 *   舊程式多處以 `resign_date IS NULL` 當在職，但真實 contract 是哨兵 '9999-12-31'（NULL 筆數為 0）。
 *   測試 fixture 又以 null=active，導致 unit test 全綠但真機把「全部門／全員」判為離職 → 頁面空白
 *   （F079 部門比例「目前無在職部門可設定」、F082 個別比例、F049 Stage 0、處長轄區）。
 *   本工具統一 SQL 與 JS 判定，任何 emphire 在職判定都應改用此處，避免再次 drift。
 */

/**
 * Date /（ISO datetime 或 'YYYY-MM-DD'）字串正規化為 'YYYY-MM-DD'；null / undefined → null。
 *
 * 採字串比較策略（memory feedback_typeorm_between_timezone）：避免 Date 物件跨時區序列化漏邊界日。
 */
export function toYmd(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, '0');
    const d = String(value.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  // 字串：取前 10 碼（'YYYY-MM-DD' 或 ISO datetime 前綴）
  return String(value).slice(0, 10);
}

/** 今日 'YYYY-MM-DD'（UTC）。 */
export function todayYmd(): string {
  return toYmd(new Date())!;
}

/**
 * emphire 是否在職。
 *
 * 離職 = resign_date 有值且嚴格小於 sysDate；NULL 或 >= sysDate（含哨兵 '9999-12-31'）皆為在職。
 *
 * @param resignDate ob_emphire.resign_date（Date / 'YYYY-MM-DD' 字串 / null）
 * @param sysDate    比較基準（'YYYY-MM-DD'），預設今日
 */
export function isEmphireActive(
  resignDate: Date | string | null | undefined,
  sysDate: string = todayYmd(),
): boolean {
  const ymd = toYmd(resignDate);
  if (ymd === null) return true;
  return ymd >= sysDate;
}

/**
 * QueryBuilder「在職」SQL 條件片段。呼叫端須綁定同名 `:<param>`（'YYYY-MM-DD' 字串）。
 * 刻意不使用 `::date` cast 以相容 SQLite e2e（PG / SQLite 皆為字串比較）。
 *
 * @example
 *   qb.where(activeEmphireCondition('e'), { sysDate: todayYmd() })
 *   qb.andWhere(activeEmphireCondition('e'), { sysDate: todayYmd() })
 */
export function activeEmphireCondition(alias: string, param = 'sysDate'): string {
  return `(${alias}.resign_date IS NULL OR ${alias}.resign_date >= :${param})`;
}
