import { Controller, Get, Post, Put, Delete, Body, Query, Param, Req, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthGuard } from '@/common/guards/auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { DatasourceService } from './datasource.service';
import { DashboardService } from './dashboard.service';
import { CreateDatasourceDto } from './dto/create-datasource.dto';
import { ListDatasourceDto } from './dto/list-datasource.dto';
import { UpdateDatasourceDto } from './dto/update-datasource.dto';
import { MetricsQueryDto } from './dto/metrics-query.dto';

@Controller('datasources')
@UseGuards(AuthGuard, RolesGuard)
@Roles('admin')
export class DatasourceController {
  constructor(
    private readonly datasourceService: DatasourceService,
    private readonly dashboardService: DashboardService,
  ) {}

  @Get('dashboard')
  async getDashboard() {
    return this.dashboardService.getDashboard();
  }

  @Get('alerts')
  async getAlerts() {
    return this.dashboardService.getAlerts();
  }

  @Get()
  async findAll(@Query() query: ListDatasourceDto) {
    return this.datasourceService.findAll(query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateDatasourceDto, @Req() req: any) {
    const userId = req.user.userId;
    return this.datasourceService.createDatasource(dto, userId);
  }

  @Get(':id/schemas')
  async getSchemas(@Param('id') id: string) {
    return this.datasourceService.getSchemas(id);
  }

  @Get(':id/schemas/:schema/tables')
  async getTables(@Param('id') id: string, @Param('schema') schema: string) {
    return this.datasourceService.getTables(id, schema);
  }

  @Get(':id/metrics')
  async getMetrics(@Param('id') id: string, @Query() query: MetricsQueryDto) {
    return this.dashboardService.getMetrics(id, query.range || '24h');
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    return this.datasourceService.findById(id);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateDatasourceDto) {
    return this.datasourceService.updateDatasource(id, dto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.datasourceService.deleteDatasource(id);
  }

  @Post(':id/test')
  @HttpCode(HttpStatus.OK)
  async testConnection(@Param('id') id: string) {
    return this.datasourceService.testConnection(id);
  }
}
