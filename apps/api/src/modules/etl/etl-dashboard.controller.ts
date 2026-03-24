import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@/common/guards/auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { EtlDashboardService } from './etl-dashboard.service';
import { DashboardTrendQueryDto } from './dto/dashboard-trend-query.dto';

@Controller('etl/dashboard')
@UseGuards(AuthGuard, RolesGuard)
@Roles('admin')
export class EtlDashboardController {
  constructor(private readonly dashboardService: EtlDashboardService) {}

  @Get('stats')
  async getStats() {
    return this.dashboardService.getStats();
  }

  @Get('trend')
  async getTrend(@Query() query: DashboardTrendQueryDto) {
    return this.dashboardService.getTrend(query.range ?? '7d');
  }

  @Get('running')
  async getRunning() {
    return this.dashboardService.getRunning();
  }

  @Get('failures')
  async getFailures() {
    return this.dashboardService.getFailures();
  }

  @Get('slowest')
  async getSlowest() {
    return this.dashboardService.getSlowest();
  }
}
