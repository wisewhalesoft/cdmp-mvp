import {
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * F056 §5.2: PUT /api/v1/assignment/scoring/tier-mapping 請求體
 *
 * 批次 UPSERT，以 (card_type, card_level) 複合 PK 為對應鍵：
 *   - body 內 PK 重複 → 422 TIER_LEVEL_DUPLICATE
 *   - DB 已存在 → UPDATE；否則 INSERT
 *   - request 中未列出的既有對應不會被刪除
 */
export class TierMappingItemDto {
  @IsString({ message: 'cardType 必須為字串' })
  @IsNotEmpty({ message: '請提供 cardType' })
  @MaxLength(5, { message: 'cardType 不得超過 5 字元' })
  cardType: string;

  // cardLevel 允許 null（fallback 場景，如 M5）
  @ValidateIf((_o, v) => v !== null)
  @IsString({ message: 'cardLevel 必須為字串或 null' })
  @MaxLength(5, { message: 'cardLevel 不得超過 5 字元' })
  cardLevel: string | null;

  @IsString({ message: 'tierLevel 必須為字串' })
  @IsNotEmpty({ message: '請提供 tierLevel' })
  @MaxLength(5, { message: 'tierLevel 不得超過 5 字元' })
  tierLevel: string;

  // listNm optional；省略時保留現有值，明確傳 null 則清空
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString({ message: 'listNm 必須為字串或 null' })
  @MaxLength(30, { message: 'listNm 不得超過 30 字元' })
  listNm?: string | null;
}

export class UpdateTierMappingDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TierMappingItemDto)
  mappings: TierMappingItemDto[];
}
