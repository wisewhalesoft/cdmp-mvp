import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * F106 §5.2 / §5.3: PUT /api/v1/assignment/scoring/dimensions/:columnName/enable 查詢參數
 *
 * 鏡像既有 DisableDimensionQueryDto（相同驗證規則）：
 *   cardType 必填 query 參數（columnName 為 path 參數）。
 */
export class EnableDimensionQueryDto {
  @IsString()
  @IsNotEmpty({ message: '請提供 cardType' })
  @MaxLength(5)
  cardType: string;
}
