import { IsIn, IsOptional, IsString, Matches } from 'class-validator';

/**
 * F048 v2.0 / F077 v1.2 GET /api/v1/assignment/lists
 *
 * Query:
 *   - ym（YYYYMM，選填；省略 → service 取 currentWorkYm）
 *   - stage（多階段 comma-separated，選填）
 *   - includeDisabled（boolean，預設 false）
 *
 * 範圍驗證（current_work_ym ± 12）於 service 層做（current_work_ym 依時鐘計算）。
 */
export class ListListsQueryDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d{6}$/, { message: 'INVALID_YM_FORMAT' })
  ym?: string;

  @IsOptional()
  @IsString()
  stage?: string; // comma-separated（service 拆分）

  @IsOptional()
  @IsIn(['true', 'false', true, false], {
    message: 'includeDisabled 必須為 boolean',
  } as any)
  includeDisabled?: 'true' | 'false' | boolean;
}
