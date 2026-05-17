import { IsIn, IsOptional } from 'class-validator';

/**
 * F066 GET /api/v1/assignment/runs/:runId/snapshot?type=config|input_list|result
 *
 * `type` 省略時回傳三份快照（對齊 spec §5.1 響應結構：snapshots: {config, inputList, result}）。
 */
export class SnapshotQueryDto {
  @IsOptional()
  @IsIn(['config', 'input_list', 'result'])
  type?: 'config' | 'input_list' | 'result';
}
