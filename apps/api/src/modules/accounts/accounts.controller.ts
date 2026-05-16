import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  GoneException,
} from '@nestjs/common';
import { AuthGuard } from '@/common/guards/auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { AccountsService } from './accounts.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { UpdateBusinessRoleDto } from './dto/update-business-role.dto';
import { AdminResetPasswordDto } from './dto/admin-reset-password.dto';
import { ListAccountsQueryDto } from './dto/list-accounts-query.dto';

@Controller('accounts')
@UseGuards(AuthGuard, RolesGuard)
@Roles('admin')
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Get()
  async findAll(@Query() query: ListAccountsQueryDto) {
    return this.accountsService.findAll(query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateAccountDto) {
    return this.accountsService.createAccount(dto);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateAccountDto) {
    return this.accountsService.updateAccount(id, dto);
  }

  @Patch(':id/status')
  async toggleStatus(
    @Param('id') id: string,
    @Body() dto: UpdateStatusDto,
    @Req() req: any,
  ) {
    const currentUserId = req.user.userId;
    return this.accountsService.toggleStatus(id, dto.status, currentUserId);
  }

  @Patch(':id/role')
  async changeRole(
    @Param('id') id: string,
    @Body() dto: UpdateRoleDto,
  ) {
    return this.accountsService.changeRole(id, dto.role);
  }

  // F006a v1.0 / AD-E07 v3.0 / 2026-05-16
  // PATCH /accounts/:id/business-role：唯一 business_role 寫入入口（Admin only）
  @Patch(':id/business-role')
  async updateBusinessRole(
    @Param('id') id: string,
    @Body() dto: UpdateBusinessRoleDto,
    @Req() req: any,
  ) {
    const actorId = req.user?.userId;
    return this.accountsService.updateBusinessRole(id, dto.business_role, actorId);
  }

  // F008 v3.x DEPRECATED（AD-E07 v3.0 / 2026-05-16）
  // PATCH /accounts/:id/sales-manager-flag → 410 Gone，引導改用 /business-role
  @Patch(':id/sales-manager-flag')
  updateSalesManagerFlag(): never {
    throw new GoneException({
      error: 'ENDPOINT_GONE',
      message: '此端點已於 AD-E07 v3.0 廢除，請改用 PATCH /api/v1/accounts/:id/business-role 指派業務角色（business_role: director / section_chief / null）。',
    });
  }

  // 短期過渡 PATCH /accounts/:id/e07-role DEPRECATED（v1.4 → v2.0 / 2026-05-16）
  @Patch(':id/e07-role')
  updateE07Role(): never {
    throw new GoneException({
      error: 'ENDPOINT_GONE',
      message: '此端點已於 AD-E07 v3.0 廢除，請改用 PATCH /api/v1/accounts/:id/business-role 指派業務角色（business_role: director / section_chief / null）。',
    });
  }

  @Post(':id/reset-password')
  @HttpCode(HttpStatus.OK)
  async adminResetPassword(
    @Param('id') id: string,
    @Body() dto: AdminResetPasswordDto,
    @Req() req: any,
  ) {
    const currentUserId = req.user.userId;
    return this.accountsService.adminResetPassword(id, dto.newPassword, currentUserId);
  }
}
