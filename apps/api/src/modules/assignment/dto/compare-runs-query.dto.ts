import { IsIn, IsOptional } from 'class-validator';
import { IsGuid } from '@/common/validators/is-guid.decorator';

/**
 * F067 GET /api/v1/assignment/runs/compare?runA=&runB=&export=xlsx
 *
 * 兩個 run_id 必填，且必須為合法 GUID 格式。
 * export 為可選參數；若指定 'xlsx'，回傳 streaming xlsx 檔案（3 sheet：
 * summary / personnelMismatch / customerDiff），否則回 JSON。
 *
 * 🔴 用 @IsGuid 而非 @IsUUID：run_id 為 MSSQL uniqueidentifier（NEWID/非 RFC-v4）→ @IsUUID 會 422。
 */
export class CompareRunsQueryDto {
  @IsGuid({ message: 'runA must be a GUID' })
  runA: string;

  @IsGuid({ message: 'runB must be a GUID' })
  runB: string;

  @IsOptional()
  @IsIn(['xlsx'])
  export?: 'xlsx';
}
