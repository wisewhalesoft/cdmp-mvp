import { IsOptional, IsString, Matches } from 'class-validator';

/**
 * F111 / AD-E07-46 §3.3 — GET /api/v1/assignment/overview query DTO。
 *
 * `ym` 選填；格式須為 YYYYMM（6 位數字），否則由全域 ValidationPipe → HttpExceptionFilter
 * 轉為 VALIDATION_ERROR（F111 §5.1 / §5.4）。缺省時由 controller 以
 * SystemService.getCurrentWorkYm() 補值。
 */
export class OverviewQueryDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d{6}$/, { message: 'INVALID_YM_FORMAT' })
  ym?: string;
}
