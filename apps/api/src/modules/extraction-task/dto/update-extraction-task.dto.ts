import { IsString, IsOptional, IsIn, MaxLength, IsNotEmpty } from 'class-validator';
import { IsGuid } from '@/common/validators/is-guid.decorator';

export class UpdateExtractionTaskDto {
  @IsOptional()
  @IsString({ message: '名稱必須為字串' })
  @IsNotEmpty({ message: '請輸入任務名稱' })
  @MaxLength(255, { message: '名稱不得超過 255 個字元' })
  name?: string;

  @IsOptional()
  // @IsGuid：datasource.id 於 MSSQL 執行期新建為非 v4 uniqueidentifier（見 create DTO 說明）。
  @IsGuid({ message: '資料來源 ID 格式不正確' })
  datasourceId?: string;

  @IsOptional()
  @IsIn(['full', 'incremental'], { message: '擷取模式必須為 full 或 incremental' })
  mode?: 'full' | 'incremental';

  @IsOptional()
  @IsString({ message: '來源資料表必須為字串' })
  @IsNotEmpty({ message: '請輸入來源資料表名稱' })
  @MaxLength(255, { message: '來源資料表名稱不得超過 255 個字元' })
  sourceTable?: string;

  @IsOptional()
  @IsString({ message: '來源 Schema 必須為字串' })
  @MaxLength(255, { message: '來源 Schema 名稱不得超過 255 個字元' })
  sourceSchema?: string;

  @IsOptional()
  @IsString({ message: '排程必須為字串' })
  @IsNotEmpty({ message: '請輸入排程 cron 表達式' })
  @MaxLength(100, { message: '排程不得超過 100 個字元' })
  schedule?: string;

  @IsOptional()
  @IsString({ message: '增量欄位必須為字串' })
  @MaxLength(255, { message: '增量欄位名稱不得超過 255 個字元' })
  incrementalColumn?: string;

  @IsOptional()
  @IsString({ message: '增量起始值必須為字串' })
  @MaxLength(255, { message: '增量起始值不得超過 255 個字元' })
  lastIncrementalValue?: string;
}
