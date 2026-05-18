import {
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ScoreIntervalDto } from './update-dimensions.dto';
import { MATCH_TYPE_VALUES, MatchType } from './match-type.enum';

/**
 * F054 §5.2: POST /api/v1/assignment/scoring/dimensions 請求體
 *
 * 新增單一計分維度 + 對應分數區間。column_name 已存在於 active 版本 → 422 SCORING_COLUMN_DUPLICATE。
 *
 * v1.3：matchType 必填欄位（BR-8），列舉 CATEGORY / RANGE / COMPOSITE。
 */
export class CreateDimensionDto {
  @IsString()
  @IsNotEmpty({ message: '請提供 cardType' })
  @MaxLength(5)
  cardType: string;

  @IsInt({ message: 'cardVersion 必須為整數' })
  cardVersion: number;

  @IsString()
  @IsNotEmpty({ message: '請提供 columnName' })
  @MaxLength(30)
  columnName: string;

  @IsString()
  @IsNotEmpty({ message: '請提供 columnLabel' })
  @MaxLength(30)
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
