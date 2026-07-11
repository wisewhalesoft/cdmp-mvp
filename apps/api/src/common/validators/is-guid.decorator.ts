import { Matches, ValidationOptions } from 'class-validator';

/**
 * GUID 格式驗證裝飾器（8-4-4-4-12 hex）。
 *
 * 🔴 取代 class-validator 之 `@IsUUID` —— `@IsUUID()`（預設查 RFC v1–5）/ `@IsUUID('4')`（僅 v4）
 *    會擋 **MSSQL uniqueidentifier**：`NEWID()` 或 TypeORM `@PrimaryGeneratedColumn('uuid')` 在 MSSQL
 *    產生之 id（如 assignment_run.run_id `4E035775-BB7C-F111-…`）version nibble 非 RFC-4122 v4 →
 *    DTO/query 驗證回 422（例：比對頁 `runA must be a UUID`、建立擷取任務 `datasourceId` 誤擋）。
 *    路徑參數（`:id`）無此驗證故不受影響，但 DTO/@Query 會。
 *
 * 本裝飾器只驗「格式」（8-4-4-4-12 hex，不分大小寫）、不驗 RFC 版本 → 接受 MSSQL guid，仍防注入/亂碼。
 * 對齊 `@/common/uuid.util` 之 `isUuid`。凡驗 MSSQL 產生之 id 一律用本裝飾器，勿用 `@IsUUID`。
 */
const GUID_HEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function IsGuid(validationOptions?: ValidationOptions): PropertyDecorator {
  return Matches(GUID_HEX, {
    message: ({ property }) => `${property} 必須為合法 GUID 格式`,
    ...validationOptions,
  });
}
