import { IsIn, IsOptional, Matches } from 'class-validator';

/**
 * F067 GET /api/v1/assignment/runs/compare?runA=&runB=&export=xlsx
 *
 * 兩個 run_id 必填，且必須為合法 GUID 格式。
 * export 為可選參數；若指定 'xlsx'，回傳 streaming xlsx 檔案（3 sheet：
 * summary / personnelMismatch / customerDiff），否則回 JSON。
 */
// 🔴 不可用 @IsUUID：MSSQL uniqueidentifier（NEWID() 產生之 run_id，如 4E035775-BB7C-F111-…）
//   version nibble 非 RFC-4122 v4 → @IsUUID 誤擋（422「must be a UUID」）→ 比對頁打不開。
//   改以「8-4-4-4-12 hex」格式驗證（對齊 @/common/uuid.util isUuid；仍防注入/亂碼）。
const GUID_HEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class CompareRunsQueryDto {
  @Matches(GUID_HEX, { message: 'runA must be a GUID' })
  runA: string;

  @Matches(GUID_HEX, { message: 'runB must be a GUID' })
  runB: string;

  @IsOptional()
  @IsIn(['xlsx'])
  export?: 'xlsx';
}
