import { IsDefined, IsIn, ValidateIf } from 'class-validator';

/**
 * F006a v1.0 / AD-E07 v3.0 / 2026-05-16
 * PATCH /api/v1/accounts/:id/business-role
 *
 * Body 必填 business_role 欄位，允許值：
 *   - 'director'        → 業務部長
 *   - 'section_chief'   → 業務處長
 *   - null              → 撤銷既有業務角色
 *
 * 雙層驗證（DTO @IsIn + DB CHECK）；空字串 / 其他字串 / 數字 一律拒絕。
 *
 * 註：專案未安裝 @nestjs/swagger，故不引入 ApiProperty decorator；
 *     若未來導入 swagger，可在此補 @ApiProperty 描述。
 */
export class UpdateBusinessRoleDto {
  // @IsDefined 確保 key 存在（拒絕缺欄位 → @IsIn 才不會被跳過）
  // @ValidateIf(o => o.business_role !== null)：對顯式 null 直接放行（spec 允許值）
  // @IsIn(['director', 'section_chief'])：非 null 時必須在 enum 內
  @IsDefined({ message: 'business_role 為必填欄位（值可為 null 表示撤銷）' })
  @ValidateIf((o) => o.business_role !== null)
  @IsIn(['director', 'section_chief'], {
    message: 'business_role 值不在允許列表',
  })
  business_role: 'director' | 'section_chief' | null;
}
