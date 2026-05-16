import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRE_DIRECTOR_OR_SECTION_CHIEF_KEY } from '../decorators/business-role.decorator';
import { ERROR_CODES, ERROR_MESSAGES } from '../errors/error-codes';

/**
 * DirectorOrSectionChiefGuard（AD-E07 v3.0 / architecture-spec.md §E07 後端 Guard 元件清單）
 *
 * 取代 v1.x SalesManagerGuard，作為 E07 全部 controller 入口（M02 除外）。
 *
 * 規則：
 *   - 端點未標 @RequireDirectorOrSectionChief() → allow
 *   - request.user.role === 'admin' → allow
 *   - request.user.businessRole IN ('director', 'section_chief') → allow
 *   - 其餘 → 403 E07_ROLE_NOT_ASSIGNED（明示訊息：請聯絡 admin 補設；
 *     避免使用者誤判為登入問題；error-handling.md v1.14）
 */
@Injectable()
export class DirectorOrSectionChiefGuard implements CanActivate {
  private readonly logger = new Logger(DirectorOrSectionChiefGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<boolean>(
      REQUIRE_DIRECTOR_OR_SECTION_CHIEF_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!required) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException({
        error: ERROR_CODES.E07_ROLE_NOT_ASSIGNED,
        message: ERROR_MESSAGES.E07_ROLE_NOT_ASSIGNED,
      });
    }

    if (
      user.role === 'admin' ||
      user.businessRole === 'director' ||
      user.businessRole === 'section_chief'
    ) {
      return true;
    }

    this.logger.warn(
      `E07 entry access denied (role not assigned): userId=${user.userId}, role=${user.role}, ` +
        `businessRole=${user.businessRole}, endpoint=${request.method} ${request.url}, ` +
        `timestamp=${new Date().toISOString()}`,
    );
    throw new ForbiddenException({
      error: ERROR_CODES.E07_ROLE_NOT_ASSIGNED,
      message: ERROR_MESSAGES.E07_ROLE_NOT_ASSIGNED,
    });
  }
}
