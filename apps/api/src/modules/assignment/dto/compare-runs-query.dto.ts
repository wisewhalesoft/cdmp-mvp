import { IsUUID } from 'class-validator';

/**
 * F067 GET /api/v1/assignment/runs/compare?runA=&runB=
 *
 * 兩個 run_id 必填，且必須為合法 UUID。
 */
export class CompareRunsQueryDto {
  @IsUUID()
  runA: string;

  @IsUUID()
  runB: string;
}
