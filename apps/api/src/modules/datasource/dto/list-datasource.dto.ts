import { IsOptional, IsInt, Min, Max, IsString, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

export class ListDatasourceDto {
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
  limit?: number = 20;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(['mysql', 'postgresql', 'sqlserver'])
  type?: 'mysql' | 'postgresql' | 'sqlserver';

  @IsOptional()
  @IsIn(['connected', 'disconnected', 'unknown'])
  status?: 'connected' | 'disconnected' | 'unknown';
}
