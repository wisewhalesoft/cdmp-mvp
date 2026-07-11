import { IsOptional, IsInt, Min, Max, IsString, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { IsGuid } from '@/common/validators/is-guid.decorator';

export class ListExtractionTaskDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(['running', 'scheduled', 'completed', 'failed', 'disabled'])
  status?: string;

  @IsOptional()
  @IsIn(['full', 'incremental'])
  mode?: string;

  @IsOptional()
  // @IsGuid：datasource.id 於 MSSQL 執行期新建為非 v4 uniqueidentifier（見 create DTO 說明）。
  @IsGuid()
  datasourceId?: string;
}
