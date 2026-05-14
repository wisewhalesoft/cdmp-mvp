import { Transform } from 'class-transformer';
import { IsInt, IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * F055 §5.3: DELETE /api/v1/assignment/scoring/card-levels 查詢參數
 *
 * 三個 query 參數皆必填：
 *   - cardType（VARCHAR(5)）
 *   - cardVersion（整數；顯式必填，避免誤刪 active 版本，spec PO 2026-05-14）
 *   - cardLevel（VARCHAR(1)）
 */
export class DeleteCardLevelQueryDto {
  @IsString()
  @IsNotEmpty({ message: '請提供 cardType' })
  @MaxLength(5)
  cardType: string;

  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return value;
    const n = Number(value);
    return Number.isFinite(n) ? n : value;
  })
  @IsInt({ message: 'cardVersion 必須為整數' })
  cardVersion: number;

  @IsString()
  @IsNotEmpty({ message: '請提供 cardLevel' })
  @MaxLength(1, { message: 'cardLevel 最多 1 字元（VARCHAR(1)）' })
  cardLevel: string;
}
