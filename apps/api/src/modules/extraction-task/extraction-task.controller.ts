import { Controller, Post, Get, Patch, Body, Query, Param, Req, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthGuard } from '@/common/guards/auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { ExtractionTaskService } from './extraction-task.service';
import { ExtractionExecutionService } from './extraction-execution.service';
import { RawDataService } from './raw-data.service';
import { CreateExtractionTaskDto } from './dto/create-extraction-task.dto';
import { ListExtractionTaskDto } from './dto/list-extraction-task.dto';
import { UpdateExtractionTaskDto } from './dto/update-extraction-task.dto';
import { ToggleExtractionTaskDto } from './dto/toggle-extraction-task.dto';
import { RunExtractionTaskDto } from './dto/run-extraction-task.dto';
import { GetRawDataDto } from './dto/get-raw-data.dto';

@Controller('extraction-tasks')
@UseGuards(AuthGuard, RolesGuard)
@Roles('admin')
export class ExtractionTaskController {
  constructor(
    private readonly extractionTaskService: ExtractionTaskService,
    private readonly extractionExecutionService: ExtractionExecutionService,
    private readonly rawDataService: RawDataService,
  ) {}

  @Get()
  async findAll(@Query() query: ListExtractionTaskDto) {
    return this.extractionTaskService.findAll(query);
  }

  @Get(':id/raw-data')
  async getRawData(@Param('id') id: string, @Query() query: GetRawDataDto) {
    return this.rawDataService.getRawData(id, query);
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    return this.extractionTaskService.findById(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateExtractionTaskDto, @Req() req: any) {
    const userId = req.user.userId;
    return this.extractionTaskService.createTask(dto, userId);
  }

  @Post(':id/run')
  @HttpCode(HttpStatus.ACCEPTED)
  async run(@Param('id') id: string, @Body() dto: RunExtractionTaskDto, @Req() req: any) {
    const userId = req.user.userId;
    return this.extractionExecutionService.triggerRun(id, dto.triggeredBy, userId);
  }

  @Patch(':id/toggle')
  async toggle(@Param('id') id: string, @Body() dto: ToggleExtractionTaskDto) {
    return this.extractionTaskService.toggleTask(id, dto);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateExtractionTaskDto) {
    return this.extractionTaskService.updateTask(id, dto);
  }
}
