/**
 * F054 v1.3 BR-9 — CHAR/VARCHAR 欄位規一化共用 util
 *
 * 用途：
 *   - ETL 從舊 OB DB 載入 CHAR(N) 欄位時清除 SQL Server CHAR padding 殘留
 *     （例：`"A         "` → `"A"`；`""` → `null`）
 *   - F054 API 接收 level1 欄位時統一 trim + 空字串轉 null
 *
 * 對應 spec：
 *   - F054 v1.3 BR-9：API '' → NULL、TRIM 前後空白、比對等價
 *   - F054 v1.3 §交叉參考：ETL 載入 OBLEVELCARD_SCORE 時對 level1 執行 RTRIM
 *   - architecture-spec.md §E07-C ETL 設計（待 system-architect 同步）
 *
 * 設計原則：
 *   - pure function，no IO，no side effect
 *   - 非字串輸入直接回傳（避免破壞 number / boolean / Date）
 *   - 不修改原始物件
 */

/**
 * 規一化單一字串欄位：RTRIM + 空字串轉 NULL。
 *
 * @param value 任意值；非字串直接回傳
 * @returns 規一化後的值；空字串 / 純空白 → null
 */
export function normalizeCharField<T>(value: T): T | null {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  return trimmed as unknown as T;
}

/**
 * 規一化物件中指定欄位（淺拷貝後回傳新物件）。
 *
 * @param obj    輸入物件
 * @param fields 需規一化的欄位名稱清單
 * @returns      新物件，指定欄位已規一化
 *
 * @example
 *   normalizeCharFields(row, ['level1', 'spec_tp'])
 */
export function normalizeCharFields<T extends Record<string, unknown>>(
  obj: T,
  fields: ReadonlyArray<keyof T>,
): T {
  const out = { ...obj };
  for (const f of fields) {
    const v = out[f];
    if (typeof v === 'string') {
      const norm = normalizeCharField(v);
      out[f] = norm as T[keyof T];
    }
  }
  return out;
}
