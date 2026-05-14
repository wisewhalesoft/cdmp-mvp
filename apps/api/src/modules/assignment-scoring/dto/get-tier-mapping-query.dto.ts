import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * F056 v1.5 §5.1: GET /api/v1/assignment/scoring/tier-mapping 查詢參數
 *
 * v1.5 重大變更（AC-9）：cardType 由選填改為**必填**，作為 CARD_TYPE 範圍鎖。
 *   - 後端再驗證該 cardType 對應 ob_card_type.status='active'，否則 404 CARD_TYPE_NOT_FOUND
 */
export class GetTierMappingQueryDto {
  @IsString({ message: 'cardType 必須為字串' })
  @IsNotEmpty({ message: '請提供 cardType' })
  @MaxLength(5, { message: 'cardType 不得超過 5 字元' })
  cardType: string;
}
