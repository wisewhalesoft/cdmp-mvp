import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@/common/guards/auth.guard';
import { SystemService } from './system.service';

/**
 * F077 v1.2 §5.1 — GET /api/v1/system/current-work-ym
 *
 * 路由前綴：`/api/v1/system`
 *
 * 權限：任何登入使用者皆可呼叫（AuthGuard 即可，無 RBAC 限制）。
 *   - 前端需要此端點顯示 banner「目前作業月份：YYYYMM」
 *   - 同時用於 isHistorical / isFuture 計算
 *
 * 回應：`{ currentWorkYm: 'YYYYMM' }`
 *
 * 對應 spec：
 *   - F077 v1.2 §5.1 端點規格
 *   - architecture-spec.md §E07 currentWorkYm AD
 *   - error-handling.md v1.14 §LIST_HISTORICAL_READONLY（消費方）
 */
@Controller('system')
@UseGuards(AuthGuard)
export class SystemController {
  constructor(private readonly systemService: SystemService) {}

  @Get('current-work-ym')
  getCurrentWorkYm(): { currentWorkYm: string } {
    return { currentWorkYm: this.systemService.getCurrentWorkYm() };
  }
}
