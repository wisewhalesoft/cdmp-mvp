import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException({
        error: 'AUTH_UNAUTHORIZED',
        message: '請先登入。',
      });
    }

    const token = authHeader.slice(7);

    try {
      const payload = this.jwtService.verify(token);
      (request as any).user = {
        userId: payload.userId,
        role: payload.role,
      };
      return true;
    } catch {
      throw new UnauthorizedException({
        error: 'AUTH_UNAUTHORIZED',
        message: '請先登入。',
      });
    }
  }
}
