import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { TIER_LEVEL_ENUM } from '../constants/card-type.constants';

/**
 * F056 v1.5 §5.3: POST /api/v1/assignment/scoring/tier-mapping 請求體
 *
 * 單筆 INSERT；DB 中 (card_type, card_level) 已存在 → 422 TIER_LEVEL_DUPLICATE。
 *
 * v1.5 重大變更：
 *   - tierLevel 採 T1~T10 列舉約束（@IsIn DTO 層阻擋；service 額外再 assert）
 *   - cardType 範圍鎖（service 端檢查 ob_card_type.status='active'）
 *   - Fallback / Standard 互斥（service 端檢查）
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

  // v1.5：tierLevel 必須為 T1~T10 列舉值
  @IsString()
  @IsNotEmpty({ message: '請提供 tierLevel' })
  @MaxLength(5)
  @IsIn(TIER_LEVEL_ENUM as unknown as readonly string[], {
    message: 'tierLevel 必須為 T1~T10 之一',
  })
  tierLevel: string;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString({ message: 'listNm 必須為字串或 null' })
  @MaxLength(30)
  listNm?: string | null;
}
