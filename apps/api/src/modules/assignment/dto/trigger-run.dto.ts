import { IsOptional, IsString } from 'class-validator';

/**
 * F061 / F097 §5.2：POST /api/v1/assignment/runs request body
 *
 * F097（breaking change）：新增 `workYm`（目標分派月，YYYYMM）。
 *
 * ⚠️ 三分支驗證刻意不交由 ValidationPipe 預設處理（§5.6「或等效 DTO / guard 兜底」），
 *    因全域 ValidationPipe + HttpExceptionFilter 會把所有 class-validator 失敗統一映為
 *    422 VALIDATION_ERROR，無法區分「缺省 → 400」與「格式錯 → 422 WORK_YM_INVALID_FORMAT」。
 *    故 DTO 僅做型別寬鬆通過（whitelist 放行 workYm），實際三分支驗證於
 *    AssignmentRunController.triggerRun handler 顯式執行（AD-E07-27 §27.4）：
 *      - 缺省（未帶 / null）→ 400 BadRequestException（缺必填）
 *      - 帶值但格式錯 / MM ∉ 01~12 → 422 WORK_YM_INVALID_FORMAT
 *      - 過去月（workdt < today）→ 422 RUN_WORKYM_PAST
 *
 * 後端使用 `workYm` 作為 AssignmentRun.project_workym（目標分派月），不再呼叫 new Date()。
 */
export class TriggerRunDto {
  @IsOptional()
  @IsString()
  workYm?: string;
}
