import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRE_SALES_MANAGER_KEY } from '../decorators/sales-manager.decorator';
import { ERROR_CODES, ERROR_MESSAGES } from '../errors/error-codes';

/**
 * E07 業務主管權限 Guard（AD-E02-1）
 *
 * 規則：
 *   - 端點未標 @RequireSalesManager() → allow
 *   - request.user.role === 'admin' → allow（admin 豁免）
 *   - request.user.isSalesManager === true → allow（業務主管專屬權限）
 *   - 其餘 → 403 FORBIDDEN
 *
 * 必須 chain 在 AuthGuard 之後（依賴 request.user 已注入）。
 */
@Injectable()
export class SalesManagerGuard implements CanActivate {
  private readonly logger = new Logger(SalesManagerGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<boolean>(
      REQUIRE_SALES_MANAGER_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!required) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException({
        error: ERROR_CODES.FORBIDDEN,
        message: ERROR_MESSAGES.FORBIDDEN,
      });
    }

    if (user.role === 'admin' || user.isSalesManager === true) {
      return true;
    }

    this.logger.warn(
      `Sales manager access denied: userId=${user.userId}, role=${user.role}, ` +
        `isSalesManager=${user.isSalesManager}, endpoint=${request.method} ${request.url}, ` +
        `timestamp=${new Date().toISOString()}`,
    );
    throw new ForbiddenException({
      error: ERROR_CODES.FORBIDDEN,
      message: ERROR_MESSAGES.FORBIDDEN,
    });
  }
}
