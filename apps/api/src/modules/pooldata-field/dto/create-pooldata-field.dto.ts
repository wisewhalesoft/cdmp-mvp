import { IsIn, IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

/**
 * F075 §5.2: POST /api/v1/pooldata-fields 請求體
 *
 * 欄位約束（依 F075 §5.2 / §6 BR-1 / BR-2 / v1.4.3 case 對齊）：
 *   - columnName：必填，VARCHAR(64)，限小寫英數與底線（`ob_pool_data` PostgreSQL snake_case 命名）
 *   - displayName：必填，VARCHAR(100)
 *   - fieldType：必填，'numeric' / 'categorical' / 'date'（違反 → 422 POOLDATA_FIELD_TYPE_INVALID）
 *
 * v1.4.3（2026-05-19）：regex 從 `/^[A-Z][A-Z0-9_]{0,63}$/`（SQL Server `OBPOOLDATA` 大寫慣例）
 *   改為 `/^[a-z][a-z0-9_]{0,63}$/`，對齊 PostgreSQL `ob_pool_data` ETL 後表之 snake_case
 *   實際欄位命名；防止從 `GET /available-columns` dropdown 選擇小寫欄位後 DTO 422 拒絕。
 */
export class CreatePooldataFieldDto {
  @IsString({ message: 'columnName 必須為字串' })
  @IsNotEmpty({ message: '請提供 columnName' })
  @MaxLength(64, { message: 'columnName 不得超過 64 字元' })
  @Matches(/^[a-z][a-z0-9_]{0,63}$/, {
    message:
      'columnName 僅允許小寫英文起頭，後接小寫英數或底線（ob_pool_data PostgreSQL snake_case 命名）',
  })
  columnName: string;

  @IsString({ message: 'displayName 必須為字串' })
  @IsNotEmpty({ message: '請提供 displayName' })
  @MaxLength(100, { message: 'displayName 不得超過 100 字元' })
  displayName: string;

  @IsString({ message: 'fieldType 必須為字串' })
  @IsIn(['numeric', 'categorical', 'date'], {
    message: 'fieldType 必須為 numeric、categorical 或 date',
  })
  fieldType: 'numeric' | 'categorical' | 'date';
}
