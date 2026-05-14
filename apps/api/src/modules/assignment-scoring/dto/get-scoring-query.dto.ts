import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * F053 §5.1: GET /api/v1/assignment/scoring 查詢參數
 *
 * 查詢目前 active 計分版本（`ob_levelcard_version.status = 'active'`）的計分維度。
 *
 * - cardType 選填：未傳則由 service 視為查預設 / 多卡別行為（BE-F053-003 預期 200）
 */
export class GetScoringQueryDto {
  @IsOptional()
  @IsString({ message: 'cardType 必須為字串' })
  @MaxLength(5, { message: 'cardType 不得超過 5 字元' })
  cardType?: string;
}
