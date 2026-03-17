import { IsOptional, IsIn } from 'class-validator';

export class MetricsQueryDto {
  @IsOptional()
  @IsIn(['24h', '7d', '30d'])
  range?: string = '24h';
}
