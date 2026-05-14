import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * F071 §5.1: PUT /api/v1/assignment/scoring/card-types/:cardType 請求體
 *
 * 欄位約束（依 F071 §5.1 / AC-2）：
 *   - cardName：必填，VARCHAR(20)
 *   - prodKind：必填，必須存在於 `ob_code_df WHERE tbl_id='PROD_KIND'` 啟用期間內
 *   - cardType：請求體**不接受**修改；若傳入則後端忽略，以 URL path param 為準。
 *     此處宣告為 optional + 不做驗證，由 service 顯式忽略此欄位。
 *
 * 注意：`whitelist + forbidNonWhitelisted` 全域 pipe 會拒絕未宣告欄位；
 *   宣告 cardType 為 optional 是為了讓 F071 TC-F071-02（body 含 cardType）能通過 pipe，
 *   但 service 不採用此值。
 */
export class UpdateCardTypeDto {
  @IsString({ message: 'cardName 必須為字串' })
  @IsNotEmpty({ message: '請提供 cardName' })
  @MaxLength(20, { message: 'cardName 不得超過 20 字元' })
  cardName: string;

  @IsString({ message: 'prodKind 必須為字串' })
  @IsNotEmpty({ message: '請提供 prodKind' })
  @MaxLength(4, { message: 'prodKind 不得超過 4 字元' })
  prodKind: string;

  /**
   * AC-2：cardType 為系統 join 鍵不可修改；若 client 傳入，後端忽略此值（以 URL path 為準）。
   * 宣告為 optional string，service 不讀取此值。
   */
  @IsOptional()
  @IsString()
  @MaxLength(5)
  cardType?: string;
}
