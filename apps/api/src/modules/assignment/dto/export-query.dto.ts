import { IsIn, IsOptional } from 'class-validator';

/**
 * F064 GET /api/v1/assignment/runs/:runId/export?format=csv|xlsx
 *
 * MVP 範圍：僅實作 csv（xlsx 標記為 v2.0，回傳 EXPORT_FORMAT_NOT_SUPPORTED）。
 */
export class ExportQueryDto {
  @IsOptional()
  @IsIn(['csv', 'xlsx'])
  format?: 'csv' | 'xlsx';
}
