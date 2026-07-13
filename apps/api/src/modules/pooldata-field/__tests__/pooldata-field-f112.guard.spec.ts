/**
 * F112 / AD-E07-47 §3.10：GUARD 群組 — RBAC + Feature Flag 一致性（I-DVAL-GUARD-PARITY-01）
 *
 * 以「真實 guard + 真實 Reflector」驅動於**實際 controller method / class 的裝飾器 metadata**，
 * 同時驗證兩件事：
 *   (a) 新端點確實套用 @RequireDirector() + @RequireFeatureFlag('ENABLE_E07_REFACTOR_PHASE3')；
 *   (b) guard 對各角色產出**精確錯誤碼**（本文件查證原始碼）：
 *       - section_chief → 403 E07_REQUIRES_DIRECTOR（method 級 DirectorGuard）
 *       - 無角色一般使用者 → 403 E07_ROLE_NOT_ASSIGNED（class 級 DirectorOrSectionChiefGuard，更早失敗）
 *       - flag off → 503 FEATURE_NOT_ENABLED（FeatureFlagGuard 於角色檢查之前）
 *   兩者皆非 spec/AD 敘述性文字籠統提及的 AUTH_FORBIDDEN。
 *
 * guard chain 順序比照 @UseGuards(AuthGuard, FeatureFlagGuard, DirectorOrSectionChiefGuard, DirectorGuard)；
 * AuthGuard 略過（req.user 於測試預先注入）。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Reflector } from '@nestjs/core';
import { ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { DirectorGuard } from '@/common/guards/director.guard';
import { DirectorOrSectionChiefGuard } from '@/common/guards/director-or-section-chief.guard';
import { FeatureFlagGuard } from '@/common/feature-flags/feature-flag.guard';
import { PooldataFieldWhitelistController } from '../controllers/pooldata-field-whitelist.controller';
import { PooldataFieldOptionController } from '../controllers/pooldata-field-option.controller';

const FLAG = 'ENABLE_E07_REFACTOR_PHASE3';

type Role = { role?: string; businessRole?: string | null };

describe('F112 GUARD — RBAC + Feature Flag（真實 guard 驅動 controller metadata）', () => {
  let reflector: Reflector;
  let featureFlagGuard: FeatureFlagGuard;
  let doscGuard: DirectorOrSectionChiefGuard;
  let directorGuard: DirectorGuard;
  let prevFlag: string | undefined;

  const makeContext = (handler: any, controllerClass: any, user: Role | null) =>
    ({
      getHandler: () => handler,
      getClass: () => controllerClass,
      switchToHttp: () => ({
        getRequest: () => ({ user, method: 'GET', url: '/pooldata-fields/test' }),
      }),
    }) as any;

  /** 依 class 宣告順序執行完整 guard chain（任一失敗即拋）。 */
  const runChain = (handler: any, controllerClass: any, user: Role | null) => {
    const ctx = makeContext(handler, controllerClass, user);
    featureFlagGuard.canActivate(ctx);
    doscGuard.canActivate(ctx);
    directorGuard.canActivate(ctx);
    return 'allow';
  };

  beforeEach(() => {
    reflector = new Reflector();
    featureFlagGuard = new FeatureFlagGuard(reflector);
    doscGuard = new DirectorOrSectionChiefGuard(reflector);
    directorGuard = new DirectorGuard(reflector);
    prevFlag = process.env[FLAG];
    process.env[FLAG] = 'true';
  });

  afterEach(() => {
    if (prevFlag === undefined) delete process.env[FLAG];
    else process.env[FLAG] = prevFlag;
  });

  // handler references（實際 controller method，帶其裝飾器 metadata）
  const distinctHandler = PooldataFieldWhitelistController.prototype.getDistinctValues;
  const bulkHandler = PooldataFieldOptionController.prototype.createOptionsBulk;

  const roles: Record<string, Role | null> = {
    director: { role: 'user', businessRole: 'director' },
    admin: { role: 'admin' },
    section_chief: { role: 'user', businessRole: 'section_chief' },
    noRole: { role: 'user', businessRole: null },
  };

  // ---- distinct-values（GUARD-001~005）----
  describe('GET :columnName/distinct-values', () => {
    it('GUARD-001：director → allow', () => {
      expect(
        runChain(distinctHandler, PooldataFieldWhitelistController, roles.director),
      ).toBe('allow');
    });

    it('GUARD-002：admin → allow', () => {
      expect(
        runChain(distinctHandler, PooldataFieldWhitelistController, roles.admin),
      ).toBe('allow');
    });

    it('GUARD-003【紅線】section_chief → 403 E07_REQUIRES_DIRECTOR（非 AUTH_FORBIDDEN）', () => {
      try {
        runChain(distinctHandler, PooldataFieldWhitelistController, roles.section_chief);
        throw new Error('should have thrown');
      } catch (e: any) {
        expect(e).toBeInstanceOf(ForbiddenException);
        expect(e.response.error).toBe('E07_REQUIRES_DIRECTOR');
      }
    });

    it('GUARD-004：無角色一般使用者 → 403 E07_ROLE_NOT_ASSIGNED（class 級更早攔截）', () => {
      try {
        runChain(distinctHandler, PooldataFieldWhitelistController, roles.noRole);
        throw new Error('should have thrown');
      } catch (e: any) {
        expect(e).toBeInstanceOf(ForbiddenException);
        expect(e.response.error).toBe('E07_ROLE_NOT_ASSIGNED');
      }
    });

    it('GUARD-005：flag off → 503 FEATURE_NOT_ENABLED（即使 director）', () => {
      process.env[FLAG] = 'false';
      try {
        runChain(distinctHandler, PooldataFieldWhitelistController, roles.director);
        throw new Error('should have thrown');
      } catch (e: any) {
        expect(e).toBeInstanceOf(ServiceUnavailableException);
        expect(e.response.error).toBe('FEATURE_NOT_ENABLED');
      }
    });
  });

  // ---- options/bulk（GUARD-006~010，鏡射）----
  describe('POST :columnName/options/bulk', () => {
    it('GUARD-006：director → allow', () => {
      expect(runChain(bulkHandler, PooldataFieldOptionController, roles.director)).toBe(
        'allow',
      );
    });

    it('GUARD-007：admin → allow', () => {
      expect(runChain(bulkHandler, PooldataFieldOptionController, roles.admin)).toBe(
        'allow',
      );
    });

    it('GUARD-008：section_chief → 403 E07_REQUIRES_DIRECTOR', () => {
      try {
        runChain(bulkHandler, PooldataFieldOptionController, roles.section_chief);
        throw new Error('should have thrown');
      } catch (e: any) {
        expect(e.response.error).toBe('E07_REQUIRES_DIRECTOR');
      }
    });

    it('GUARD-009：無角色使用者 → 403 E07_ROLE_NOT_ASSIGNED', () => {
      try {
        runChain(bulkHandler, PooldataFieldOptionController, roles.noRole);
        throw new Error('should have thrown');
      } catch (e: any) {
        expect(e.response.error).toBe('E07_ROLE_NOT_ASSIGNED');
      }
    });

    it('GUARD-010：flag off → 503 FEATURE_NOT_ENABLED', () => {
      process.env[FLAG] = 'false';
      try {
        runChain(bulkHandler, PooldataFieldOptionController, roles.director);
        throw new Error('should have thrown');
      } catch (e: any) {
        expect(e.response.error).toBe('FEATURE_NOT_ENABLED');
      }
    });
  });

  // ---- GUARD-011 regression：既有純讀端點不受新端點收緊影響 ----
  describe('GUARD-011：既有純讀端點對 section_chief 仍放行', () => {
    it('listFields（GET /pooldata-fields，無 @RequireDirector）→ section_chief allow', () => {
      expect(
        runChain(
          PooldataFieldWhitelistController.prototype.listFields,
          PooldataFieldWhitelistController,
          roles.section_chief,
        ),
      ).toBe('allow');
    });

    it('listOptions（GET .../options，無 @RequireDirector）→ section_chief allow', () => {
      expect(
        runChain(
          PooldataFieldOptionController.prototype.listOptions,
          PooldataFieldOptionController,
          roles.section_chief,
        ),
      ).toBe('allow');
    });
  });
});
