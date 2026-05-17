import { IsBooleanString, IsOptional } from 'class-validator';

/**
 * F075 §5.1: GET /api/v1/pooldata-fields query params
 *
 * - active: 'true' | 'false'（可選；不帶則回傳全部，與 v1.2 既有行為一致）
 */
export class ListPooldataFieldsQueryDto {
  @IsOptional()
  @IsBooleanString({ message: 'active 必須為 true 或 false' })
  active?: 'true' | 'false';
}
