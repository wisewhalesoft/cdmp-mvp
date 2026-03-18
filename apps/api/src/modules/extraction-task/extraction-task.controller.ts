import { Controller, Post, Get, Body, Query, Req, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthGuard } from '@/common/guards/auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { ExtractionTaskService } from './extraction-task.service';
import { CreateExtractionTaskDto } from './dto/create-extraction-task.dto';
import { ListExtractionTaskDto } from './dto/list-extraction-task.dto';

@Controller('extraction-tasks')
@UseGuards(AuthGuard, RolesGuard)
@Roles('admin')
export class ExtractionTaskController {
  constructor(
    private readonly extractionTaskService: ExtractionTaskService,
  ) {}

  @Get()
  async findAll(@Query() query: ListExtractionTaskDto) {
    return this.extractionTaskService.findAll(query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateExtractionTaskDto, @Req() req: any) {
    const userId = req.user.userId;
    return this.extractionTaskService.createTask(dto, userId);
  }
}
