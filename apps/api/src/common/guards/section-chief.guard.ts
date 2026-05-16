import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRE_SECTION_CHIEF_KEY } from '../decorators/business-role.decorator';
import { ERROR_CODES, ERROR_MESSAGES } from '../errors/error-codes';

/**
 * SectionChiefGuard（AD-E07 v3.0 / architecture-spec.md §E07 後端 Guard 元件清單）
 *
 * 規則：
 *   - 端點未標 @RequireSectionChief() → allow
 *   - request.user.role === 'admin' → allow（admin 自動繼承所有 E07 角色，F002 §4.6）
 *   - request.user.businessRole === 'section_chief' → allow
 *   - 其餘 → 403 AUTH_FORBIDDEN
 *
 * 適用範圍：處長專用端點（少數明確標記）。
 */
@Injectable()
export class SectionChiefGuard implements CanActivate {
  private readonly logger = new Logger(SectionChiefGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<boolean>(
      REQUIRE_SECTION_CHIEF_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!required) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException({
        error: ERROR_CODES.E07_REQUIRES_SECTION_CHIEF,
        message: ERROR_MESSAGES.E07_REQUIRES_SECTION_CHIEF,
      });
    }

    if (user.role === 'admin' || user.businessRole === 'section_chief') {
      return true;
    }

    this.logger.warn(
      `SectionChief access denied: userId=${user.userId}, role=${user.role}, ` +
        `businessRole=${user.businessRole}, endpoint=${request.method} ${request.url}, ` +
        `timestamp=${new Date().toISOString()}`,
    );
    throw new ForbiddenException({
      error: ERROR_CODES.E07_REQUIRES_SECTION_CHIEF,
      message: ERROR_MESSAGES.E07_REQUIRES_SECTION_CHIEF,
    });
  }
}
