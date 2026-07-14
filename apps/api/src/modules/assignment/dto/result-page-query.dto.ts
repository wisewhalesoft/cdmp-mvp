import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min, MaxLength } from 'class-validator';

/**
 * F066 v1.3 §5.3：分派結果分頁查詢參數。
 *   - page：頁碼（1-based，預設 1）
 *   - pageSize：每頁列數（預設 50、上限 200；service 端亦二次夾限）
 *   - q：搜尋字串（比對 custo_no / emplid / appl_no）
 */
export class ResultPageQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}
