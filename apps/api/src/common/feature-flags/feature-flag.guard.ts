import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRE_FEATURE_FLAG_KEY } from './feature-flag.decorator';
import { ERROR_CODES, ERROR_MESSAGES } from '../errors/error-codes';

/**
 * FeatureFlagGuard（AD-E07 v3.0 / architecture-spec.md / 決議 #2 / 2026-05-16）
 *
 * 規則：
 *   - 端點未標 @RequireFeatureFlag() → allow
 *   - process.env[flagName].toLowerCase() === 'true' → allow
 *   - 其餘 → 503 Service Unavailable + FEATURE_NOT_ENABLED
 *
 * 沿用 F050 v2.0 §13.2 統一行為。實作機制以環境變數為起點，後續可擴充至
 * config 表 / LaunchDarkly。
 */
@Injectable()
export class FeatureFlagGuard implements CanActivate {
  private readonly logger = new Logger(FeatureFlagGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const flagName = this.reflector.getAllAndOverride<string | undefined>(
      REQUIRE_FEATURE_FLAG_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!flagName) return true;

    const value = process.env[flagName];
    if (value && value.toLowerCase() === 'true') return true;

    const request = context.switchToHttp().getRequest();
    this.logger.warn(
      `Feature flag not enabled: flag=${flagName}, value=${value ?? '(unset)'}, ` +
        `endpoint=${request?.method} ${request?.url}`,
    );
    throw new ServiceUnavailableException({
      error: ERROR_CODES.FEATURE_NOT_ENABLED,
      message: ERROR_MESSAGES.FEATURE_NOT_ENABLED,
    });
  }
}
