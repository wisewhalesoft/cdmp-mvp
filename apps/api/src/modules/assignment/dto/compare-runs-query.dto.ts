import { IsIn, IsOptional, IsUUID } from 'class-validator';

/**
 * F067 GET /api/v1/assignment/runs/compare?runA=&runB=&export=xlsx
 *
 * 兩個 run_id 必填，且必須為合法 UUID。
 * export 為可選參數；若指定 'xlsx'，回傳 streaming xlsx 檔案（3 sheet：
 * summary / personnelMismatch / customerDiff），否則回 JSON。
 */
export class CompareRunsQueryDto {
  @IsUUID()
  runA: string;

  @IsUUID()
  runB: string;

  @IsOptional()
  @IsIn(['xlsx'])
  export?: 'xlsx';
}
