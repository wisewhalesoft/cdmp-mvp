import { SetMetadata } from '@nestjs/common';

/**
 * E07 業務主管權限 marker decorator（AD-E02-1）
 *
 * 標註後 SalesManagerGuard 會檢查 request.user.role === 'admin'
 * 或 request.user.isSalesManager === true，否則回傳 403。
 *
 * 用法：
 *   @UseGuards(AuthGuard, SalesManagerGuard)
 *   @RequireSalesManager()
 *   @Patch('/api/v1/assignment/empl-set/:id')
 */
export const REQUIRE_SALES_MANAGER_KEY = 'requireSalesManager';
export const RequireSalesManager = () => SetMetadata(REQUIRE_SALES_MANAGER_KEY, true);
