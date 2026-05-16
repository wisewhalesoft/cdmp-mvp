import { IsOptional, IsBoolean } from 'class-validator';

/**
 * F061 v1.2 §5.1：POST /api/v1/assignment/runs request body
 *
 * Body 為空（或可選 `{ confirm: true }` 二階段呼叫）。
 * 本 DTO 用於 ValidationPipe 將任意請求轉成空物件；保留 confirm 為將來擴充。
 */
export class TriggerRunDto {
  @IsOptional()
  @IsBoolean()
  confirm?: boolean;
}
