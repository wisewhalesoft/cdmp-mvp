/**
 * UUID 格式守門。
 *
 * 🔴 varchar 稽核欄（`created_by` / `updated_by` 等）可能存**非 GUID** 標記：seed 之 `'PROD_SEED'`、
 *    legacy 匯入之 `'A_USERID'` / `'legacy-import'` 等。將其直接餵入 `users.id`（uniqueidentifier）
 *    查詢（`userRepo.find({ where: { id: In(auditValues) } })`）會使 MSSQL tedious 拋
 *    「Validation failed for parameter '0'. Invalid GUID.」（PG 亦拋 `invalid input syntax for type uuid`）
 *    → 整個列表 / 詳情端點 500。
 *
 * 故凡「以稽核欄值 join `users`（或任何 uuid PK 表）」之前，一律以本函式過濾出合法 UUID 格式之值；
 * 非 UUID 者略過（顯示名稱解析為 null，端點退回原值 / 預設，不再 500）。
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 是否為合法 UUID 格式字串（type guard；非字串 / null / 非 UUID 皆回 false）。 */
export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}
