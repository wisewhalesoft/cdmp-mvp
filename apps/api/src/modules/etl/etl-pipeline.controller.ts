import { Controller, Get, Post, Put, Patch, Delete, Body, Query, Param, Req, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@/common/guards/auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { EtlPipelineService } from './etl-pipeline.service';
import { EtlPipelineExecutionService } from './etl-pipeline-execution.service';
import { ListPipelineDto } from './dto/list-pipeline.dto';
import { ListPipelineLogsDto } from './dto/list-pipeline-logs.dto';
import { CreatePipelineDto } from './dto/create-pipeline.dto';
import { UpdatePipelineDto } from './dto/update-pipeline.dto';
import { SaveDefinitionDto } from './dto/save-definition.dto';
import { TogglePipelineDto } from './dto/toggle-pipeline.dto';

@Controller('etl/pipelines')
@UseGuards(AuthGuard, RolesGuard)
@Roles('admin')
export class EtlPipelineController {
  constructor(
    private readonly etlPipelineService: EtlPipelineService,
    private readonly executionService: EtlPipelineExecutionService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreatePipelineDto, @Req() req: any) {
    return this.etlPipelineService.create(dto, req.user.userId);
  }

  @Get('stats')
  async getStats() {
    return this.etlPipelineService.getStats();
  }

  @Post(':id/execute')
  @HttpCode(HttpStatus.ACCEPTED)
  async execute(@Param('id') id: string, @Req() req: any) {
    return this.executionService.triggerExecute(id, req.user.userId);
  }

  @Post(':id/test')
  @HttpCode(HttpStatus.ACCEPTED)
  async test(@Param('id') id: string, @Req() req: any) {
    return this.executionService.triggerTest(id, req.user.userId);
  }

  @Get(':id/progress')
  async getProgress(@Param('id') id: string) {
    return this.executionService.getProgress(id);
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    return this.etlPipelineService.deletePipeline(id);
  }

  @Patch(':id/toggle')
  async toggle(@Param('id') id: string, @Body() dto: TogglePipelineDto) {
    return this.etlPipelineService.togglePipeline(id, dto.enabled);
  }

  // F093: Edit Pipeline metadata (name / description / schedule).
  // NOTE: deeper-path PATCH routes (:id/toggle, :id/versions/:versionId/publish)
  // are matched by their own handlers and are NOT shadowed by this :id route.
  @Patch(':id')
  async updatePipeline(@Param('id') id: string, @Body() dto: UpdatePipelineDto) {
    return this.etlPipelineService.updatePipeline(id, dto);
  }

  @Get(':id/logs')
  async getPipelineLogs(@Param('id') id: string, @Query() query: ListPipelineLogsDto) {
    return this.etlPipelineService.getPipelineLogs(id, query);
  }

  @Get(':id/definition')
  async getDefinition(@Param('id') id: string) {
    return this.etlPipelineService.getDefinition(id);
  }

  @Put(':id/definition')
  async saveDefinition(@Param('id') id: string, @Body() dto: SaveDefinitionDto, @Req() req: any) {
    return this.etlPipelineService.saveDefinition(id, dto, req.user.userId);
  }

  // F033: Version management routes
  // IMPORTANT: diff must come BEFORE :versionId to avoid path capture
  @Get(':id/versions/diff')
  async getVersionDiff(
    @Param('id') id: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.etlPipelineService.getVersionDiff(id, Number(from), Number(to));
  }

  @Get(':id/versions/:versionId')
  async getVersionDetail(
    @Param('id') id: string,
    @Param('versionId') versionId: string,
  ) {
    return this.etlPipelineService.getVersionDetail(id, versionId);
  }

  @Post(':id/versions/:versionId/rollback')
  @HttpCode(HttpStatus.CREATED)
  async rollbackVersion(
    @Param('id') id: string,
    @Param('versionId') versionId: string,
    @Req() req: any,
  ) {
    return this.etlPipelineService.rollbackVersion(id, versionId, req.user.userId);
  }

  @Get(':id/versions')
  async getVersions(@Param('id') id: string) {
    return this.etlPipelineService.getVersions(id);
  }

  @Patch(':id/versions/:versionId/publish')
  async publishVersion(
    @Param('id') id: string,
    @Param('versionId') versionId: string,
  ) {
    return this.etlPipelineService.publishVersion(id, versionId);
  }

  @Get()
  async findAll(@Query() query: ListPipelineDto) {
    return this.etlPipelineService.findAll(query);
  }
}
