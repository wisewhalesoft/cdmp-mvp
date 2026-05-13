import { IsOptional, IsString, IsNotEmpty, MaxLength } from 'class-validator';

/**
 * F068 §5.3: PUT /api/v1/assignment/codes/:tblId/:tblCd 請求體
 *
 * 僅允許更新 tbl_desc1 / tbl_desc2；
 * 代碼值 tbl_cd 為 PK 不可改（spec AC-3 / prototype Modal 編輯時 disabled）。
 */
export class UpdateCodeDto {
  @IsString({ message: 'tblDesc1 必須為字串' })
  @IsNotEmpty({ message: '請提供 tblDesc1' })
  @MaxLength(40, { message: 'tblDesc1 不得超過 40 字元' })
  tblDesc1: string;

  @IsOptional()
  @IsString({ message: 'tblDesc2 必須為字串' })
  @MaxLength(40, { message: 'tblDesc2 不得超過 40 字元' })
  tblDesc2?: string;
}
