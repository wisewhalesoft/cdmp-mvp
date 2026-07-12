import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { DISTINCT_VALUES_CAP } from '../pooldata-field.constants';

/**
 * F112 §5.2 / AD-E07-47 §3.11：POST /api/v1/pooldata-fields/:columnName/options/bulk 請求體
 *
 * 欄位約束（逐字複製既有 `CreatePooldataOptionDto`，避免單筆／批次兩條路徑之驗證規則漂移）：
 *   - options：陣列，minLength 1（ArrayMinSize）、maxLength DISTINCT_VALUES_CAP（ArrayMaxSize）
 *     - `ArrayMaxSize` 直接 import `DISTINCT_VALUES_CAP` 同一常數（非字面量 200），確保 GET distinct-values
 *       回傳上限與 POST bulk 接受上限於 env 覆寫（`POOLDATA_DISTINCT_VALUES_CAP`）情境下恆一致（AD §3.11）。
 *   - options[].optionValue：必填，VARCHAR(64)（對齊 `pooldata_field_option.option_value` PK）
 *   - options[].optionLabel：必填，VARCHAR(100)（對齊 `option_label`）
 *
 * 驗證失敗走 class-validator 預設陣列格式 → 全域 `HttpExceptionFilter` 重映為 422 VALIDATION_ERROR
 * （無需額外程式碼）。columnName 由 URL path 提供（不在 body）。
 */
export class BulkOptionItemDto {
  @IsString({ message: 'optionValue 必須為字串' })
  @IsNotEmpty({ message: '請提供 optionValue' })
  @MaxLength(64, { message: 'optionValue 不得超過 64 字元' })
  optionValue: string;

  @IsString({ message: 'optionLabel 必須為字串' })
  @IsNotEmpty({ message: '請提供 optionLabel' })
  @MaxLength(100, { message: 'optionLabel 不得超過 100 字元' })
  optionLabel: string;
}

export class BulkCreateOptionsDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'options 至少需 1 筆' })
  @ArrayMaxSize(DISTINCT_VALUES_CAP, {
    message: `options 不得超過 ${DISTINCT_VALUES_CAP} 筆`,
  })
  @ValidateNested({ each: true })
  @Type(() => BulkOptionItemDto)
  options: BulkOptionItemDto[];
}
