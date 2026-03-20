import { Controller, Get, Post, Put, Body, Query, Param, Req, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@/common/guards/auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { EtlPipelineService } from './etl-pipeline.service';
import { ListPipelineDto } from './dto/list-pipeline.dto';
import { CreatePipelineDto } from './dto/create-pipeline.dto';
import { SaveDefinitionDto } from './dto/save-definition.dto';

@Controller('etl/pipelines')
@UseGuards(AuthGuard, RolesGuard)
@Roles('admin')
export class EtlPipelineController {
  constructor(private readonly etlPipelineService: EtlPipelineService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreatePipelineDto, @Req() req: any) {
    return this.etlPipelineService.create(dto, req.user.userId);
  }

  @Get('stats')
  async getStats() {
    return this.etlPipelineService.getStats();
  }

  @Get(':id/definition')
  async getDefinition(@Param('id') id: string) {
    return this.etlPipelineService.getDefinition(id);
  }

  @Put(':id/definition')
  async saveDefinition(@Param('id') id: string, @Body() dto: SaveDefinitionDto) {
    return this.etlPipelineService.saveDefinition(id, dto);
  }

  @Get()
  async findAll(@Query() query: ListPipelineDto) {
    return this.etlPipelineService.findAll(query);
  }
}
