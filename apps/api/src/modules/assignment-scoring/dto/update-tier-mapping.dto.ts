import {
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TIER_LEVEL_ENUM } from '../constants/card-type.constants';

/**
 * F056 v1.5 §5.2: PUT /api/v1/assignment/scoring/tier-mapping 請求體
 *
 * 批次 UPSERT，以 (card_type, card_level) 複合 PK 為對應鍵：
 *   - body 內 PK 重複 → 422 TIER_LEVEL_DUPLICATE
 *   - DB 已存在 → UPDATE；否則 INSERT
 *   - request 中未列出的既有對應不會被刪除
 *
 * v1.5 重大變更：
 *   - tierLevel 採 T1~T10 列舉約束（@IsIn DTO 層阻擋；service 額外再 assert
 *     以應付 client 跳過 pipe 的情境）
 *   - body 內所有 mapping 之 cardType 必須與 query cardType 一致（service 檢查）
 *   - Fallback / Standard 互斥（service 檢查）
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

  // v1.5：tierLevel 必須為 T1~T10 列舉值
  @IsString({ message: 'tierLevel 必須為字串' })
  @IsNotEmpty({ message: '請提供 tierLevel' })
  @MaxLength(5, { message: 'tierLevel 不得超過 5 字元' })
  @IsIn(TIER_LEVEL_ENUM as unknown as readonly string[], {
    message: 'tierLevel 必須為 T1~T10 之一',
  })
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

/**
 * F056 v1.5 §5.2: PUT 查詢參數
 *
 * cardType 必填（與 GET 端點一致）；body 內所有 mapping 必須與此值一致。
 */
export class UpdateTierMappingQueryDto {
  @IsString({ message: 'cardType 必須為字串' })
  @IsNotEmpty({ message: '請提供 cardType' })
  @MaxLength(5, { message: 'cardType 不得超過 5 字元' })
  cardType: string;
}
