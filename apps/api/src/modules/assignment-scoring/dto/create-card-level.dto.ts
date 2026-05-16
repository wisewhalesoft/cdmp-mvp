import { Transform } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * F055 v1.5 §5.4: POST /api/v1/assignment/scoring/card-levels 請求體
 *
 * 對應 spec：F055-edit-card-level-thresholds.md v1.5 §5.4 / AC-8 ~ AC-8f / BR-8
 *
 *   - cardType        必填（VARCHAR(10) — F069 已放寬至 10）
 *   - cardLevel       必填，pattern ^[A-Z]$（單一大寫英文字元，BR-8）
 *   - scoreS          必填，整數 >= 0
 *   - scoreE          必填，整數（業務驗證 scoreE >= scoreS 於 service 層）
 *
 * 注意：cardVersion **不**由 request 傳遞；後端依 cardType 查 active 計分版本自動帶入。
 */
export class CreateCardLevelDto {
  @IsString()
  @IsNotEmpty({ message: '請提供 cardType' })
  @MaxLength(10)
  cardType: string;

  @IsString()
  @IsNotEmpty({ message: '請提供 cardLevel' })
  @Matches(/^[A-Z]$/, {
    message: '等級代碼必須為單一大寫英文字元（A~Z）',
  })
  cardLevel: string;

  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return value;
    const n = Number(value);
    return Number.isFinite(n) ? n : value;
  })
  @IsInt({ message: 'scoreS 必須為整數' })
  @Min(0, { message: 'scoreS 必須 ≥ 0' })
  scoreS: number;

  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return value;
    const n = Number(value);
    return Number.isFinite(n) ? n : value;
  })
  @IsInt({ message: 'scoreE 必須為整數' })
  scoreE: number;
}
