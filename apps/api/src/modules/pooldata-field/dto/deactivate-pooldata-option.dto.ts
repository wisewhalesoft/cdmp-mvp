import {
  Equals,
  IsBoolean,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * F076 §5.4: PATCH /api/v1/pooldata-fields/:columnName/options/:optionValue/deactivate 請求體
 *
 * 停用專屬端點（v1.3 / 2026-05-17 / OQ-E07-21 Resolved）。
 *
 * 欄位約束（依 F076 §5.4 / BR-13）：
 *   - isActive：必填且必須為 false（防呆，避免端點誤用）
 *   - reason  ：必填字串，1 ≤ length ≤ 200（中文以 1 字計）
 *
 * 違反 → 422 VALIDATION_ERROR（field: 'reason' | 'isActive'）。
 */
export class DeactivatePooldataOptionDto {
  /**
   * 必填且必須為 false；其他值（true / undefined）由 Equals 攔截 → 422
   */
  @IsBoolean({ message: 'isActive 必須為 boolean' })
  @Equals(false, {
    message: '此端點僅支援停用（isActive=false）；重新啟用請改用 PATCH 端點',
  })
  isActive: false;

  @IsString({ message: 'reason 必須為字串' })
  @IsNotEmpty({ message: '請填寫停用原因' })
  @MinLength(1, { message: '停用原因不得為空' })
  @MaxLength(200, { message: '停用原因不得超過 200 字' })
  reason: string;
}
