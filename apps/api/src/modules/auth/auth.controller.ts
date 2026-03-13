import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Request } from 'express';
import { AuthService, LoginResult } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { AuthGuard } from '@/common/guards/auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard)
  async login(@Body() dto: LoginDto): Promise<LoginResult> {
    return this.authService.login(dto);
  }

  @Post('logout')
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: Request): Promise<{ message: string }> {
    const token = req.headers.authorization!.slice(7);
    const user = (req as any).user;
    await this.authService.logout(token, user.userId);
    return { message: '登出成功' };
  }
}
