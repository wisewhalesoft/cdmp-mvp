import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * F093: 編輯 Pipeline 中繼資料（名稱 / 描述 / 排程）
 *
 * PATCH 語意：所有欄位皆 optional，僅有傳入的欄位才會被覆寫。
 * - name 有傳入時必須為非空字串（trim 後），且不超過 255 字元
 * - description 與 schedule 允許 null（清除）
 */
export class UpdatePipelineDto {
  @IsOptional()
  @IsNotEmpty({ message: '此欄位為必填' })
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsString()
  schedule?: string | null;
}
