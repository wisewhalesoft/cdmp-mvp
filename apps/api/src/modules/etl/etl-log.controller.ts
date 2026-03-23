import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@/common/guards/auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { EtlPipelineService } from './etl-pipeline.service';

@Controller('etl/logs')
@UseGuards(AuthGuard, RolesGuard)
@Roles('admin')
export class EtlLogController {
  constructor(private readonly etlPipelineService: EtlPipelineService) {}

  @Get(':logId')
  async getLogDetail(@Param('logId') logId: string) {
    return this.etlPipelineService.getLogDetail(logId);
  }
}
