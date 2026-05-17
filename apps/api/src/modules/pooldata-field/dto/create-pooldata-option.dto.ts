import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * F076 §5.2: POST /api/v1/pooldata-fields/:columnName/options 請求體
 *
 * 欄位約束（依 F076 §5.2 / BR-1）：
 *   - optionValue：必填，VARCHAR(64)（同欄位內唯一；違反 → 409 POOLDATA_OPTION_DUPLICATE）
 *   - optionLabel：必填，VARCHAR(100)
 *
 * 注意：columnName 由 URL path 提供（不在 body）。
 */
export class CreatePooldataOptionDto {
  @IsString({ message: 'optionValue 必須為字串' })
  @IsNotEmpty({ message: '請提供 optionValue' })
  @MaxLength(64, { message: 'optionValue 不得超過 64 字元' })
  optionValue: string;

  @IsString({ message: 'optionLabel 必須為字串' })
  @IsNotEmpty({ message: '請提供 optionLabel' })
  @MaxLength(100, { message: 'optionLabel 不得超過 100 字元' })
  optionLabel: string;
}
