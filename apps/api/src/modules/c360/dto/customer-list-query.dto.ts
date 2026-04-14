import { IsOptional, IsString, MinLength, IsNumberString } from 'class-validator';
import { Transform } from 'class-transformer';

export class CustomerListQueryDto {
  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @IsString()
  idNumber?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @Transform(({ value }) => (value ? parseInt(value, 10) : 1))
  page?: number = 1;

  @IsOptional()
  @Transform(({ value }) => (value ? Math.min(parseInt(value, 10), 100) : 20))
  pageSize?: number = 20;
}
