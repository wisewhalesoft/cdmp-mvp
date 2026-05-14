import { IsIn, IsOptional, IsString } from 'class-validator';

/**
 * F069 §5.1: GET /api/v1/assignment/scoring/card-types 查詢參數
 *
 * - status：選填，預設 `'active'`；可傳 `'all'` 取得含 inactive 之全部紀錄（保留給管理視圖）。
 */
export class ListCardTypesQueryDto {
  @IsOptional()
  @IsString()
  @IsIn(['active', 'all'], {
    message: 'status 必須為 active 或 all',
  })
  status?: 'active' | 'all';
}
