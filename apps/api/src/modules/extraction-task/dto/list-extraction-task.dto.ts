import { IsOptional, IsInt, Min, Max, IsString, IsIn, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';

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
  @IsUUID()
  datasourceId?: string;
}
