import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * F055 §5.2: GET /api/v1/assignment/scoring/card-levels/preview
 *
 * - cardType 必填
 * - levels：URL-encoded JSON 陣列字串，service 層 JSON.parse 並驗證結構
 */
export class PreviewCardLevelsQueryDto {
  @IsString()
  @IsNotEmpty({ message: '請提供 cardType' })
  @MaxLength(5)
  cardType: string;

  @IsString()
  @IsNotEmpty({ message: '請提供 levels' })
  levels: string;
}
