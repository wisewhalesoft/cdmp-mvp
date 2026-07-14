import { IsBoolean, IsOptional } from 'class-validator';

/**
 * F115 §7.1：分派結果回寫執行 body。
 *   - confirm：二次確認旗標；缺 / false → 422 WRITEBACK_CONFIRM_REQUIRED（防跳過預覽誤觸）。
 */
export class WritebackExecuteDto {
  @IsOptional()
  @IsBoolean()
  confirm?: boolean;
}
