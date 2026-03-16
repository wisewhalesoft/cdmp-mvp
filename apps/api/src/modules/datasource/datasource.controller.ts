import { Controller, Get, Post, Put, Delete, Body, Query, Param, Req, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthGuard } from '@/common/guards/auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { DatasourceService } from './datasource.service';
import { CreateDatasourceDto } from './dto/create-datasource.dto';
import { ListDatasourceDto } from './dto/list-datasource.dto';
import { UpdateDatasourceDto } from './dto/update-datasource.dto';

@Controller('datasources')
@UseGuards(AuthGuard, RolesGuard)
@Roles('admin')
export class DatasourceController {
  constructor(private readonly datasourceService: DatasourceService) {}

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
}
