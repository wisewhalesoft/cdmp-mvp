import {
  Equals,
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * F076 §5.3: PATCH /api/v1/pooldata-fields/:columnName/options/:optionValue 請求體（啟用用途）
 *
 * 限制（依 F076 §5.3）：
 *   - 本端點僅接受 isActive=true（重新啟用）；service 層自動清空 deactivation_reason 為 NULL
 *   - 若需停用，必須改呼叫專屬 deactivate 端點（§5.4 / DeactivatePooldataOptionDto）
 *   - 防呆：傳 isActive=false → 422 VALIDATION_ERROR（提示「停用請改用 deactivate 端點」）
 *
 * optionLabel：可選；若一併提供則同步更新。
 */
export class UpdatePooldataOptionDto {
  /**
   * 必填且必須為 true；false 由 Equals 攔截 → 422
   * （DTO 層級防呆，避免 service 端誤用此端點停用而繞過 reason 必填）
   */
  @IsBoolean({ message: 'isActive 必須為 boolean' })
  @Equals(true, {
    message: '此端點僅支援重新啟用（isActive=true）；停用請改用 /deactivate 端點',
  })
  isActive: true;

  @IsOptional()
  @IsString({ message: 'optionLabel 必須為字串' })
  @MaxLength(100, { message: 'optionLabel 不得超過 100 字元' })
  optionLabel?: string;
}
