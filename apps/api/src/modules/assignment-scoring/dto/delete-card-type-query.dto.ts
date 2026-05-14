import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

/**
 * F072 §5.2: DELETE /api/v1/assignment/scoring/card-types/:cardType 查詢參數
 *
 * - confirmCascade：必為 boolean true；缺漏或 false 由 service 拋 422
 *   `CARD_TYPE_CASCADE_NOT_CONFIRMED`（spec 規範由業務層回 422 而非由 pipe 阻擋）。
 *
 * 將字串 `'true'/'false'` 轉為 boolean；其他值維持原樣以利後續判斷。
 */
export class DeleteCardTypeQueryDto {
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return value;
  })
  @IsBoolean({ message: 'confirmCascade 必須為布林值' })
  confirmCascade?: boolean;
}
