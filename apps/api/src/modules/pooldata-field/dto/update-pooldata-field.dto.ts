import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * F075 §5.3: PATCH /api/v1/pooldata-fields/:columnName 請求體
 *
 * 部分更新，三欄皆可選；至少需提供一項由 service 層保證（無變更時可 noop）。
 *
 * 欄位約束（依 F075 §5.3 / AC-6）：
 *   - displayName：可選，VARCHAR(100)
 *   - fieldType：可選，'numeric' / 'categorical' / 'date'
 *     若由 categorical 切離 → service 層批次軟停用對應 options（F076-C / BR-7）
 *   - isActive：可選 boolean；MVP 由專屬路徑啟用 / 停用整欄位（沿用 F075 §5.4 DELETE 端點），
 *     但保留此欄位以利日後重新啟用（PATCH isActive=true）；UI 仍呼叫 DELETE 端點停用
 */
export class UpdatePooldataFieldDto {
  @IsOptional()
  @IsString({ message: 'displayName 必須為字串' })
  @MaxLength(100, { message: 'displayName 不得超過 100 字元' })
  displayName?: string;

  @IsOptional()
  @IsString({ message: 'fieldType 必須為字串' })
  @IsIn(['numeric', 'categorical', 'date'], {
    message: 'fieldType 必須為 numeric、categorical 或 date',
  })
  fieldType?: 'numeric' | 'categorical' | 'date';

  @IsOptional()
  @IsBoolean({ message: 'isActive 必須為 boolean' })
  isActive?: boolean;
}
