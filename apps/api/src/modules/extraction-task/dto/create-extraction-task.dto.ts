import { IsString, IsNotEmpty, IsIn, IsOptional, MaxLength, IsUUID, ValidateIf } from 'class-validator';

export class CreateExtractionTaskDto {
  @IsString({ message: '名稱必須為字串' })
  @IsNotEmpty({ message: '請輸入任務名稱' })
  @MaxLength(255, { message: '名稱不得超過 255 個字元' })
  name: string;

  @IsUUID('4', { message: '資料來源 ID 格式不正確' })
  @IsNotEmpty({ message: '請選擇資料來源' })
  datasourceId: string;

  @IsIn(['full', 'incremental'], { message: '擷取模式必須為 full 或 incremental' })
  mode: 'full' | 'incremental';

  @IsString({ message: '來源資料表必須為字串' })
  @IsNotEmpty({ message: '請輸入來源資料表名稱' })
  @MaxLength(255, { message: '來源資料表名稱不得超過 255 個字元' })
  sourceTable: string;

  @IsOptional()
  @IsString({ message: '來源 Schema 必須為字串' })
  @MaxLength(255, { message: '來源 Schema 名稱不得超過 255 個字元' })
  sourceSchema?: string;

  @IsString({ message: '排程必須為字串' })
  @IsNotEmpty({ message: '請輸入排程 cron 表達式' })
  @MaxLength(100, { message: '排程不得超過 100 個字元' })
  schedule: string;

  @ValidateIf((o) => o.mode === 'incremental')
  @IsString({ message: '增量欄位必須為字串' })
  @IsNotEmpty({ message: '增量模式必須指定增量欄位' })
  @MaxLength(255, { message: '增量欄位名稱不得超過 255 個字元' })
  incrementalColumn?: string;

  @IsOptional()
  @IsString({ message: '增量起始值必須為字串' })
  @MaxLength(255, { message: '增量起始值不得超過 255 個字元' })
  lastIncrementalValue?: string;
}
