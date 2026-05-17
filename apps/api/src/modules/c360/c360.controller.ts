import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@/common/guards/auth.guard';
import { C360Service } from './c360.service';
import { CustomerListQueryDto } from './dto/customer-list-query.dto';

@Controller('c360/customers')
@UseGuards(AuthGuard)
export class C360Controller {
  constructor(private readonly c360Service: C360Service) {}

  @Get('stats')
  async getStats() {
    return this.c360Service.getCustomerStats();
  }

  @Get()
  async searchCustomers(@Query() query: CustomerListQueryDto, @Req() req: any) {
    const userRole = req.user.role;
    const businessRole = req.user.businessRole ?? null;
    return this.c360Service.searchCustomers(query, userRole, businessRole);
  }

  @Get(':customerId')
  async getCustomerDetail(@Param('customerId') customerId: string, @Req() req: any) {
    const userRole = req.user.role;
    const businessRole = req.user.businessRole ?? null;
    return this.c360Service.getCustomerDetail(customerId, userRole, businessRole);
  }
}
