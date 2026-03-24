import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@/common/guards/auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { TargetTableService } from './target-table.service';

@Controller('etl/target-tables')
@UseGuards(AuthGuard, RolesGuard)
@Roles('admin')
export class TargetTableController {
  constructor(private readonly targetTableService: TargetTableService) {}

  @Get()
  getAll() {
    return this.targetTableService.getAll();
  }

  @Get(':tableName/schema')
  getSchema(@Param('tableName') tableName: string) {
    return this.targetTableService.getSchema(tableName);
  }
}
