import { IsString, Matches } from 'class-validator';

/**
 * F118 v1.1 §5.1.1 / AD-E07-48 §5.1 —
 * `GET /api/v1/assignment/lists/copy-duplicate-check` query params。
 *
 * 兩者皆必填、格式 YYYYMM（6 碼數字）。格式違反或缺漏 → class-validator 400
 * → HttpExceptionFilter 轉 422 `VALIDATION_ERROR`（沿用本 controller 既有 `ym` 慣例；
 * F118 §5.2 明訂本 feature 不新增錯誤碼）。
 *
 * `currentYm` 由呼叫端帶入（F097 作業月語意），後端**不得**自行推導系統當月（AC-5）。
 */
export class CopyDuplicateCheckQueryDto {
  /** 上月（候選來源月）。 */
  @IsString()
  @Matches(/^\d{6}$/, { message: 'INVALID_YM_FORMAT' })
  prevYm: string;

  /** 本作業月（判定目標月）。 */
  @IsString()
  @Matches(/^\d{6}$/, { message: 'INVALID_YM_FORMAT' })
  currentYm: string;
}
