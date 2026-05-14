import { Transform } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * F055 §5.1.1: GET /api/v1/assignment/scoring/card-levels 查詢參數
 *
 * - cardType 必填
 * - cardVersion 選填，未傳則 service 取該 cardType 之 active 版本
 */
export class GetCardLevelsQueryDto {
  @IsString()
  @IsNotEmpty({ message: '請提供 cardType' })
  @MaxLength(5)
  cardType: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    const n = Number(value);
    return Number.isFinite(n) ? n : value;
  })
  @IsInt({ message: 'cardVersion 必須為整數' })
  cardVersion?: number;
}
