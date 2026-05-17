import { IsIn, IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

/**
 * F075 §5.2: POST /api/v1/pooldata-fields 請求體
 *
 * 欄位約束（依 F075 §5.2 / §6 BR-1 / BR-2）：
 *   - columnName：必填，VARCHAR(64)，限大寫英數與底線（OBPOOLDATA 欄位命名慣例）
 *   - displayName：必填，VARCHAR(100)
 *   - fieldType：必填，'numeric' / 'categorical' / 'date'（違反 → 422 POOLDATA_FIELD_TYPE_INVALID）
 */
export class CreatePooldataFieldDto {
  @IsString({ message: 'columnName 必須為字串' })
  @IsNotEmpty({ message: '請提供 columnName' })
  @MaxLength(64, { message: 'columnName 不得超過 64 字元' })
  @Matches(/^[A-Z][A-Z0-9_]{0,63}$/, {
    message:
      'columnName 僅允許大寫英文起頭，後接大寫英數或底線（OBPOOLDATA 欄位命名慣例）',
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
