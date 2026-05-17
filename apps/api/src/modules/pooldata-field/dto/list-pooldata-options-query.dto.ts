import { IsBooleanString, IsOptional } from 'class-validator';

/**
 * F076 §5.1: GET /api/v1/pooldata-fields/:columnName/options query params
 *
 * - active          : 'true' | 'false'（可選；不帶則回啟用值；F050 多選來源用）
 * - includeInactive : 'true'（v1.3 / 2026-05-17 新增）；回傳全部含 inactive（F076 維護頁、
 *                     F051 名單編輯顯示既有條件值 label 用）；與 active 互斥（同時帶以 includeInactive 優先）
 */
export class ListPooldataOptionsQueryDto {
  @IsOptional()
  @IsBooleanString({ message: 'active 必須為 true 或 false' })
  active?: 'true' | 'false';

  @IsOptional()
  @IsBooleanString({ message: 'includeInactive 必須為 true 或 false' })
  includeInactive?: 'true' | 'false';
}
