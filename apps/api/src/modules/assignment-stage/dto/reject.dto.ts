import { IsOptional, IsString } from 'class-validator';

/**
 * F087 §5.1 POST /api/v1/assignment/lists/{listNo}/reject Request Body
 *
 * 拒絕原因驗證（必填 / 長度 ≤ 500 字）由 service 層執行以拋出明確錯誤碼：
 *   - REJECT_REASON_REQUIRED（空白或僅含空白字元）
 *   - REJECT_REASON_TOO_LONG（> 500）
 */
export class RejectListDto {
  @IsOptional()
  @IsString()
  rejectReason?: string;
}

/**
 * F086 §5.1 POST /api/v1/assignment/lists/{listNo}/stage/approve Request Body
 */
export class ApproveListDto {
  @IsOptional()
  @IsString()
  comment?: string;
}
