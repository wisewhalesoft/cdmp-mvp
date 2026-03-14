import { IsString, IsNotEmpty, IsInt, IsOptional, IsIn, MaxLength, Min, Max } from 'class-validator';

export class CreateDatasourceDto {
  @IsString({ message: '名稱必須為字串' })
  @IsNotEmpty({ message: '請輸入資料來源名稱' })
  @MaxLength(100, { message: '名稱不得超過 100 個字元' })
  name: string;

  @IsIn(['mysql', 'postgresql', 'sqlserver'], { message: '資料來源類型必須為 mysql、postgresql 或 sqlserver' })
  type: 'mysql' | 'postgresql' | 'sqlserver';

  @IsString({ message: '主機位址必須為字串' })
  @IsNotEmpty({ message: '請輸入主機位址' })
  @MaxLength(255, { message: '主機位址不得超過 255 個字元' })
  host: string;

  @IsInt({ message: '連接埠必須為整數' })
  @Min(1, { message: '連接埠必須介於 1 到 65535 之間' })
  @Max(65535, { message: '連接埠必須介於 1 到 65535 之間' })
  port: number;

  @IsString({ message: '資料庫名稱必須為字串' })
  @IsNotEmpty({ message: '請輸入資料庫名稱' })
  @MaxLength(100, { message: '資料庫名稱不得超過 100 個字元' })
  databaseName: string;

  @IsString({ message: '使用者名稱必須為字串' })
  @IsNotEmpty({ message: '請輸入使用者名稱' })
  @MaxLength(100, { message: '使用者名稱不得超過 100 個字元' })
  username: string;

  @IsString({ message: '密碼必須為字串' })
  @IsNotEmpty({ message: '請輸入密碼' })
  password: string;

  @IsOptional()
  @IsString({ message: '描述必須為字串' })
  @MaxLength(500, { message: '描述不得超過 500 個字元' })
  description?: string;
}
