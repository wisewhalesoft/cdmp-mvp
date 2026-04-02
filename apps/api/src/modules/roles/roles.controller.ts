import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { AuthGuard } from '@/common/guards/auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { ERROR_CODES, ERROR_MESSAGES } from '@/common/errors/error-codes';
import { RolesService } from './roles.service';

@Controller('roles')
@UseGuards(AuthGuard, RolesGuard)
@Roles('admin')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  async findAll() {
    const data = await this.rolesService.findAll();
    return { data };
  }

  @Post()
  async create() {
    throw new ForbiddenException({
      error: ERROR_CODES.ROLE_MODIFICATION_FORBIDDEN,
      message: ERROR_MESSAGES.ROLE_MODIFICATION_FORBIDDEN,
    });
  }

  @Delete(':code')
  async remove(@Param('code') _code: string) {
    throw new ForbiddenException({
      error: ERROR_CODES.ROLE_MODIFICATION_FORBIDDEN,
      message: ERROR_MESSAGES.ROLE_MODIFICATION_FORBIDDEN,
    });
  }
}
