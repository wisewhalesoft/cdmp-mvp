import { IsOptional, IsIn } from 'class-validator';

export class DashboardTrendDto {
  @IsOptional()
  @IsIn(['7d', '14d', '30d'])
  range?: string = '7d';
}
