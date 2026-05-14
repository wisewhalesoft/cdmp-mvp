import {
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

/**
 * F056 §5.3: POST /api/v1/assignment/scoring/tier-mapping 請求體
 *
 * 單筆 INSERT；DB 中 (card_type, card_level) 已存在 → 422 TIER_LEVEL_DUPLICATE。
 */
export class CreateTierMappingDto {
  @IsString()
  @IsNotEmpty({ message: '請提供 cardType' })
  @MaxLength(5)
  cardType: string;

  @ValidateIf((_o, v) => v !== null)
  @IsString({ message: 'cardLevel 必須為字串或 null' })
  @MaxLength(5)
  cardLevel: string | null;

  @IsString()
  @IsNotEmpty({ message: '請提供 tierLevel' })
  @MaxLength(5)
  tierLevel: string;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString({ message: 'listNm 必須為字串或 null' })
  @MaxLength(30)
  listNm?: string | null;
}
