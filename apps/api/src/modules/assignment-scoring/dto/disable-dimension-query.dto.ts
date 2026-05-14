import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * F054 §5.3: PUT /api/v1/assignment/scoring/dimensions/:columnName/disable 查詢參數
 *
 * cardType 必填 query 參數（columnName 為 path 參數）。
 */
export class DisableDimensionQueryDto {
  @IsString()
  @IsNotEmpty({ message: '請提供 cardType' })
  @MaxLength(5)
  cardType: string;
}
