import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * F054 §5.1: PUT /api/v1/assignment/scoring/dimensions 請求體
 *
 * 覆寫式編輯：以 (cardType, cardVersion, columnName) 三欄定位，覆蓋既有 ob_levelcard_score
 * 區間並更新 ob_levelcard_column（如 columnLabel 變更）。
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
