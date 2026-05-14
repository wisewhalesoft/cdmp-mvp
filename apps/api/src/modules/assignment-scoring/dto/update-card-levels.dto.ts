import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsString,
  Length,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * F055 §5.1: PUT /api/v1/assignment/scoring/card-levels 請求體
 *
 * 寫入語意：依 (cardType, cardVersion, cardLevel) 三欄複合鍵定位 ob_levelcard_level
 * 紀錄並執行 UPDATE；request 不傳 surrogate id，PK 三欄為唯一比對鍵。
 * levels 陣列長度由前端依當前 CARD_TYPE 既有等級數動態決定（S5=2、H/S/E/E5/M=4）。
 */
export class CardLevelUpdateItemDto {
  @IsString()
  @IsNotEmpty({ message: '請提供 cardLevel' })
  @Length(1, 1, { message: 'cardLevel 必須為 1 字元（A/B/C/D/E）' })
  cardLevel: string;

  @IsInt({ message: 'scoreS 必須為整數' })
  scoreS: number;

  @IsInt({ message: 'scoreE 必須為整數' })
  scoreE: number;
}

export class UpdateCardLevelsDto {
  @IsString()
  @IsNotEmpty({ message: '請提供 cardType' })
  @MaxLength(5)
  cardType: string;

  @IsInt({ message: 'cardVersion 必須為整數' })
  cardVersion: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CardLevelUpdateItemDto)
  levels: CardLevelUpdateItemDto[];
}
