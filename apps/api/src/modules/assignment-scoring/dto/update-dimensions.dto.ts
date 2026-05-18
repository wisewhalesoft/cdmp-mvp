import {
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { MATCH_TYPE_VALUES, MatchType } from './match-type.enum';

/**
 * F054 §5.1: PUT /api/v1/assignment/scoring/dimensions 請求體
 *
 * 覆寫式編輯：以 (cardType, cardVersion, columnName) 三欄定位，覆蓋既有 ob_levelcard_score
 * 區間並更新 ob_levelcard_column（如 columnLabel 變更）。
 *
 * v1.3：matchType 必填欄位（BR-8）；列舉 CATEGORY / RANGE / COMPOSITE。
 */

export class ScoreIntervalDto {
  @IsOptional()
  @IsString()
  @MaxLength(10)
  level1?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  level2S?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  level2E?: string | null;

  @IsInt({ message: 'score 必須為整數' })
  score: number;
}

export class DimensionUpdateItemDto {
  @IsString()
  @IsNotEmpty({ message: '請提供 columnName' })
  @MaxLength(30, { message: 'columnName 不得超過 30 字元' })
  columnName: string;

  @IsString()
  @IsNotEmpty({ message: '請提供 columnLabel' })
  @MaxLength(30, { message: 'columnLabel 不得超過 30 字元' })
  columnLabel: string;

  // F054 v1.3 BR-8：matchType 為必填欄位；列舉 CATEGORY / RANGE / COMPOSITE
  @IsIn(MATCH_TYPE_VALUES as unknown as string[], {
    message: 'matchType 必須為 CATEGORY / RANGE / COMPOSITE 其中之一',
  })
  matchType: MatchType;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScoreIntervalDto)
  scores: ScoreIntervalDto[];
}

export class UpdateDimensionsDto {
  @IsString()
  @IsNotEmpty({ message: '請提供 cardType' })
  @MaxLength(5)
  cardType: string;

  @IsInt({ message: 'cardVersion 必須為整數' })
  cardVersion: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DimensionUpdateItemDto)
  dimensions: DimensionUpdateItemDto[];
}
