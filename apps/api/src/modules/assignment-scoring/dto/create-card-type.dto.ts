import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

/**
 * F070 §5.1: POST /api/v1/assignment/scoring/card-types 請求體
 *
 * 欄位約束（依 F070 §5.1 / data-model.md #ob-card-type-entity）：
 *   - cardType：必填，VARCHAR(5)，^[A-Z0-9]{1,5}$（與 DB chk_ob_card_type_code_format 一致）
 *   - cardName：必填，VARCHAR(20)
 *   - prodKind：必填；後端再驗證須存在於 `ob_code_df WHERE tbl_id='PROD_KIND'` 啟用期間內
 */
export class CreateCardTypeDto {
  @IsString({ message: 'cardType 必須為字串' })
  @IsNotEmpty({ message: '請提供 cardType' })
  @MaxLength(5, { message: 'cardType 不得超過 5 字元' })
  @Matches(/^[A-Z0-9]{1,5}$/, {
    message: 'cardType 僅允許 1~5 個大寫英數字字元（A-Z / 0-9）',
  })
  cardType: string;

  @IsString({ message: 'cardName 必須為字串' })
  @IsNotEmpty({ message: '請提供 cardName' })
  @MaxLength(20, { message: 'cardName 不得超過 20 字元' })
  cardName: string;

  @IsString({ message: 'prodKind 必須為字串' })
  @IsNotEmpty({ message: '請提供 prodKind' })
  @MaxLength(4, { message: 'prodKind 不得超過 4 字元' })
  prodKind: string;
}
