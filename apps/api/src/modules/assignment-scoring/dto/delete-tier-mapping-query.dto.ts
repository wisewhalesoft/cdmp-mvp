import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * F056 §5.4: DELETE /api/v1/assignment/scoring/tier-mapping 查詢參數
 *
 *   - cardType 必填（VARCHAR(5)）
 *   - cardLevel 選填；省略 = 刪除 card_level IS NULL 的 fallback 紀錄
 *     注意：不可使用空字串（與 BR-9 一致，空字串非合法 PK 值）。
 *     Controller 層由 service 將 undefined 轉成 null 傳入。
 */
export class DeleteTierMappingQueryDto {
  @IsString()
  @IsNotEmpty({ message: '請提供 cardType' })
  @MaxLength(5)
  cardType: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'cardLevel 不可為空字串（省略則為 fallback NULL）' })
  @MaxLength(5)
  cardLevel?: string;
}
