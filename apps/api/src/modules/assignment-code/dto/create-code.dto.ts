import { IsOptional, IsString, IsNotEmpty, Matches, MaxLength } from 'class-validator';

/**
 * F068 §5.2: POST /api/v1/assignment/codes 請求體
 *
 * - tblId 由 Service 驗 ALLOWED_TBL_IDS（PROD_KIND / SPEC_TP / CASE_STATUS）
 * - stadt / enddt 為 YYYYMMDD 8 字元；若 stadt 省略則 Service 自動填 Asia/Taipei 今日
 */
export class CreateCodeDto {
  @IsString({ message: 'tblId 必須為字串' })
  @IsNotEmpty({ message: '請提供 tblId' })
  tblId: string;

  @IsString({ message: 'tblCd 必須為字串' })
  @IsNotEmpty({ message: '請提供 tblCd' })
  @MaxLength(4, { message: 'tblCd 不得超過 4 字元' })
  tblCd: string;

  @IsString({ message: 'tblDesc1 必須為字串' })
  @IsNotEmpty({ message: '請提供 tblDesc1' })
  @MaxLength(40, { message: 'tblDesc1 不得超過 40 字元' })
  tblDesc1: string;

  @IsOptional()
  @IsString({ message: 'tblDesc2 必須為字串' })
  @MaxLength(40, { message: 'tblDesc2 不得超過 40 字元' })
  tblDesc2?: string;

  @IsOptional()
  @IsString({ message: 'stadt 必須為字串' })
  @Matches(/^\d{8}$/, { message: 'stadt 格式為 YYYYMMDD（8 位數字）' })
  stadt?: string;

  @IsOptional()
  @IsString({ message: 'enddt 必須為字串' })
  @Matches(/^\d{8}$/, { message: 'enddt 格式為 YYYYMMDD（8 位數字）' })
  enddt?: string;
}
