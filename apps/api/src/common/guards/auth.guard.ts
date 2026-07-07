import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Request } from 'express';
import { TokenBlocklist } from '@/database/entities/token-blocklist.entity';
import { User } from '@/database/entities/user.entity';
import { hashToken } from '@/common/hash/token-hash.util';
import { ERROR_CODES, ERROR_MESSAGES } from '@/common/errors/error-codes';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    @InjectRepository(TokenBlocklist)
    private readonly tokenBlocklistRepository: Repository<TokenBlocklist>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException({
        error: ERROR_CODES.TOKEN_MISSING,
        message: ERROR_MESSAGES.TOKEN_MISSING,
      });
    }

    const token = authHeader.slice(7);

    try {
      const payload = this.jwtService.verify(token);

      // Check token blocklist（B1 / AD-E07-39 §3.3：以 sha256(token) hash 查詢）
      const revoked = await this.tokenBlocklistRepository.findOne({
        where: { token_hash: hashToken(token) },
      });
      if (revoked) {
        throw new UnauthorizedException({
          error: ERROR_CODES.TOKEN_REVOKED,
          message: ERROR_MESSAGES.TOKEN_REVOKED,
        });
      }

      // Check if user account is disabled or password was changed after token issued
      const user = await this.userRepository.findOne({
        where: { id: payload.userId },
        select: ['id', 'status', 'password_changed_at'],
      });
      if (!user || user.status === 'disabled') {
        throw new UnauthorizedException({
          error: ERROR_CODES.TOKEN_REVOKED,
          message: ERROR_MESSAGES.TOKEN_REVOKED,
        });
      }

      // BR-7 (F009): Invalidate tokens issued before password change
      // password_changed_at is only set on explicit password reset/change
      // JWT iat is in seconds (floor)
      if (payload.iat && user.password_changed_at) {
        const tokenIssuedAtMs = payload.iat * 1000;
        const passwordChangedAtMs = new Date(
          user.password_changed_at,
        ).getTime();
        if (tokenIssuedAtMs < passwordChangedAtMs) {
          throw new UnauthorizedException({
            error: ERROR_CODES.TOKEN_REVOKED,
            message: ERROR_MESSAGES.TOKEN_REVOKED,
          });
        }
      }

      (request as any).user = {
        userId: payload.userId,
        role: payload.role,
        // E07 業務主管旗標（DEPRECATED, AD-E07 v3.0 / 2026-05-16）：
        // 沿用至 B2 callsite 全替換完成前，避免 silent 行為改變
        isSalesManager: payload.isSalesManager ?? false,
        // E07 業務角色（AD-E07 v3.0 / F002 §4.6 / 2026-05-16）：
        // 給 DirectorGuard / SectionChiefGuard / DirectorOrSectionChiefGuard 讀取
        // legacy JWT 未含此 claim → undefined → 顯式降級為 null
        businessRole: payload.businessRole ?? null,
      };
      return true;
    } catch (error: any) {
      // Re-throw if already an UnauthorizedException (blocklist check)
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      // Differentiate JWT errors
      if (error?.name === 'TokenExpiredError') {
        throw new UnauthorizedException({
          error: ERROR_CODES.TOKEN_EXPIRED,
          message: ERROR_MESSAGES.TOKEN_EXPIRED,
        });
      }

      throw new UnauthorizedException({
        error: 'AUTH_UNAUTHORIZED',
        message: '請先登入。',
      });
    }
  }
}
