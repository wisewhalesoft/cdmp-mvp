import { Controller, Get, Post, Put, Patch, Body, Param, Query, Req, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthGuard } from '@/common/guards/auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { AccountsService } from './accounts.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
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
