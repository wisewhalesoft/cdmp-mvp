import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRE_DIRECTOR_KEY } from '../decorators/business-role.decorator';
import { ERROR_CODES, ERROR_MESSAGES } from '../errors/error-codes';

/**
 * DirectorGuard（AD-E07 v3.0 / architecture-spec.md §E07 後端 Guard 元件清單）
 *
 * 規則：
 *   - 端點未標 @RequireDirector() → allow
 *   - request.user.role === 'admin' → allow
 *   - request.user.businessRole === 'director' → allow
 *   - 其餘 → 403 AUTH_FORBIDDEN（部長專屬功能，不揭露範圍）
 *
 * 適用範圍（spec L468）：M02 全部端點含 GET、M06 寫入、月名單分派觸發、名單 CRUD、
 *   M03a / M03c / M03d Rollback。
 *
 * 必須 chain 在 AuthGuard 之後（依賴 request.user 已注入）。
 */
@Injectable()
export class DirectorGuard implements CanActivate {
  private readonly logger = new Logger(DirectorGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<boolean>(
      REQUIRE_DIRECTOR_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!required) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException({
        error: ERROR_CODES.E07_REQUIRES_DIRECTOR,
        message: ERROR_MESSAGES.E07_REQUIRES_DIRECTOR,
      });
    }

    if (user.role === 'admin' || user.businessRole === 'director') {
      return true;
    }

    this.logger.warn(
      `Director access denied: userId=${user.userId}, role=${user.role}, ` +
        `businessRole=${user.businessRole}, endpoint=${request.method} ${request.url}, ` +
        `timestamp=${new Date().toISOString()}`,
    );
    throw new ForbiddenException({
      error: ERROR_CODES.E07_REQUIRES_DIRECTOR,
      message: ERROR_MESSAGES.E07_REQUIRES_DIRECTOR,
    });
  }
}
