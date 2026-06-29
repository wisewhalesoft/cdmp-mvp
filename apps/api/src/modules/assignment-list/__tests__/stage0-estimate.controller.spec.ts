/**
 * Stage0EstimateController — Route + RBAC tests（F049）
 *
 * 涵蓋：
 *   - GET /api/v1/assignment/stage0/daily-estimate （DirectorGuard）
 *     - director → 200 + daily estimate
 *     - section_chief → 403 E07_REQUIRES_DIRECTOR
 *     - plain user → 403 E07_ROLE_NOT_ASSIGNED
 *     - 未登入 → 401
 *     - ym 未帶 → 使用 currentWorkYm
 *   - GET /api/v1/assignment/list-definitions/:listNo/estimate
 *     - director → 200 + count
 *     - 找不到 list_no → 404
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import {
  ExecutionContext,
  INestApplication,
  NotFoundException,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import request from 'supertest';
import { Stage0EstimateController } from '../stage0-estimate.controller';
import { Stage0EstimateService } from '../stage0-estimate.service';
import { SystemService } from '@/modules/system/system.service';
import { AuthGuard } from '@/common/guards/auth.guard';
import { HttpExceptionFilter } from '@/common/filters/http-exception.filter';
import { ERROR_CODES } from '@/common/errors/error-codes';

type CurrentUser =
  | { userId: string; role: string; businessRole: 'director' | 'section_chief' | null }
  | null;

describe('Stage0EstimateController — RBAC + Routes', () => {
  let app: INestApplication;
  let serviceMock: {
    calculateDailyEstimate: ReturnType<typeof vi.fn>;
    estimateListCount: ReturnType<typeof vi.fn>;
    computeDeptEstimate: ReturnType<typeof vi.fn>;
  };
  let currentUser: CurrentUser = null;
  let authShouldThrow401 = false;

  beforeAll(async () => {
    serviceMock = {
      calculateDailyEstimate: vi.fn().mockResolvedValue({
        ym: '202605',
        calendarSource: 'weekday',
        startDate: '2026-05-01',
        endDate: '2026-05-31',
        workingDays: 20,
        baseRatio: 50,
        remainder: 0,
        dailyEstimates: [],
        poolCount: 50000,
        warning: null,
      }),
      estimateListCount: vi.fn().mockResolvedValue({
        listNo: 'OB202605001',
        count: 8500,
      }),
      // F049 v2.0 Part B：部門維度每日分派可行性矩陣
      computeDeptEstimate: vi.fn().mockResolvedValue({
        ym: '202605',
        mode: 'aggregated',
        listNo: null,
        calendarSource: 'weekday',
        startDate: '2026-05-01',
        endDate: '2026-05-31',
        scope: { role: 'director', deptCode: null, scoped: false },
        departments: [],
        days: [],
        threshold: null,
        warnings: [],
        poolCount: 50000,
        poolWarning: null,
      }),
    };

    process.env.OVERRIDE_CURRENT_WORK_YM = '202605';

    const module: TestingModule = await Test.createTestingModule({
      controllers: [Stage0EstimateController],
      providers: [
        { provide: Stage0EstimateService, useValue: serviceMock },
        // F097：current_work_ym 收斂至 SystemService（真實實例，沿用 OVERRIDE_CURRENT_WORK_YM）
        { provide: SystemService, useValue: new SystemService() },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({
        canActivate: (ctx: ExecutionContext) => {
          if (authShouldThrow401) {
            throw new UnauthorizedException({
              error: 'AUTH_TOKEN_MISSING',
              message: '請先登入。',
            });
          }
          const req = ctx.switchToHttp().getRequest();
          req.user = currentUser;
          return true;
        },
      })
      .compile();

    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    delete process.env.OVERRIDE_CURRENT_WORK_YM;
  });

  beforeEach(() => {
    authShouldThrow401 = false;
    currentUser = null;
    vi.clearAllMocks();
  });

  const director: CurrentUser = {
    userId: 'u-director',
    role: 'user',
    businessRole: 'director',
  };
  const sectionChief: CurrentUser = {
    userId: 'u-sc',
    role: 'user',
    businessRole: 'section_chief',
  };
  const plain: CurrentUser = {
    userId: 'u-plain',
    role: 'user',
    businessRole: null,
  };

  describe('GET /stage0/daily-estimate', () => {
    it('director → 200 + daily estimate（預設 calendarSource=weekday）', async () => {
      currentUser = director;
      const res = await request(app.getHttpServer()).get(
        '/api/v1/assignment/stage0/daily-estimate',
      );
      expect(res.status).toBe(200);
      expect(res.body.ym).toBe('202605');
      expect(serviceMock.calculateDailyEstimate).toHaveBeenCalledWith(
        '202605',
        expect.objectContaining({ calendarSource: 'weekday' }),
      );
    });

    it('帶 ym query → 傳給 service', async () => {
      currentUser = director;
      await request(app.getHttpServer()).get(
        '/api/v1/assignment/stage0/daily-estimate?ym=202604',
      );
      expect(serviceMock.calculateDailyEstimate).toHaveBeenCalledWith(
        '202604',
        expect.objectContaining({ calendarSource: 'weekday' }),
      );
    });

    it('v1.3：帶 calendarSource / startDate / endDate query → 傳給 service', async () => {
      currentUser = director;
      await request(app.getHttpServer()).get(
        '/api/v1/assignment/stage0/daily-estimate?ym=202605&calendarSource=all&startDate=2026-05-11&endDate=2026-05-22',
      );
      expect(serviceMock.calculateDailyEstimate).toHaveBeenCalledWith('202605', {
        calendarSource: 'all',
        startDate: '2026-05-11',
        endDate: '2026-05-22',
      });
    });

    it('v1.3：非法 calendarSource → fallback weekday', async () => {
      currentUser = director;
      await request(app.getHttpServer()).get(
        '/api/v1/assignment/stage0/daily-estimate?calendarSource=garbage',
      );
      expect(serviceMock.calculateDailyEstimate).toHaveBeenCalledWith(
        '202605',
        expect.objectContaining({ calendarSource: 'weekday' }),
      );
    });

    it('section_chief → 403 E07_REQUIRES_DIRECTOR', async () => {
      currentUser = sectionChief;
      const res = await request(app.getHttpServer()).get(
        '/api/v1/assignment/stage0/daily-estimate',
      );
      expect(res.status).toBe(403);
      expect(res.body.error).toBe(ERROR_CODES.E07_REQUIRES_DIRECTOR);
    });

    it('plain user → 403 E07_ROLE_NOT_ASSIGNED', async () => {
      currentUser = plain;
      const res = await request(app.getHttpServer()).get(
        '/api/v1/assignment/stage0/daily-estimate',
      );
      expect(res.status).toBe(403);
      expect(res.body.error).toBe(ERROR_CODES.E07_ROLE_NOT_ASSIGNED);
    });

    it('未登入 → 401', async () => {
      authShouldThrow401 = true;
      const res = await request(app.getHttpServer()).get(
        '/api/v1/assignment/stage0/daily-estimate',
      );
      expect(res.status).toBe(401);
    });
  });

  describe('GET /list-definitions/:listNo/estimate', () => {
    it('director → 200 + count', async () => {
      currentUser = director;
      const res = await request(app.getHttpServer()).get(
        '/api/v1/assignment/list-definitions/OB202605001/estimate',
      );
      expect(res.status).toBe(200);
      expect(res.body.count).toBe(8500);
    });

    // F049 v2.0 / AD-E07-v3.6 §4：移除 @RequireDirector → 處長亦可（BR-12，名單層總量）
    it('section_chief → 200（移除 @RequireDirector 後處長可存取，名單層總量）', async () => {
      currentUser = sectionChief;
      const res = await request(app.getHttpServer()).get(
        '/api/v1/assignment/list-definitions/OB202605001/estimate',
      );
      expect(res.status).toBe(200);
      expect(res.body.count).toBe(8500);
    });

    it('找不到 listNo → 404', async () => {
      currentUser = director;
      serviceMock.estimateListCount.mockRejectedValueOnce(
        new NotFoundException({
          error: ERROR_CODES.ASSIGNMENT_LIST_NOT_FOUND,
          message: '找不到指定的名單定義',
        }),
      );
      const res = await request(app.getHttpServer()).get(
        '/api/v1/assignment/list-definitions/NOT_FOUND/estimate',
      );
      expect(res.status).toBe(404);
      expect(res.body.error).toBe(ERROR_CODES.ASSIGNMENT_LIST_NOT_FOUND);
    });
  });

  // =====================================================================
  // F049 v2.0 Part B：GET /stage0/dept-estimate（DirectorOrSectionChief + actor 傳遞）
  // =====================================================================
  describe('GET /stage0/dept-estimate', () => {
    it('director → 200，computeDeptEstimate 以 actor=director 呼叫（預設 weekday）', async () => {
      currentUser = director;
      const res = await request(app.getHttpServer()).get(
        '/api/v1/assignment/stage0/dept-estimate',
      );
      expect(res.status).toBe(200);
      expect(res.body.mode).toBe('aggregated');
      expect(serviceMock.computeDeptEstimate).toHaveBeenCalledWith(
        '202605',
        expect.objectContaining({
          calendarSource: 'weekday',
          actor: expect.objectContaining({ businessRole: 'director' }),
        }),
      );
    });

    // TS-F049-SCOPE-005：處長可進入（200），actor 帶 businessRole=section_chief 傳給 service
    it('section_chief → 200（唯讀可進入），actor.businessRole=section_chief 傳入 service', async () => {
      currentUser = sectionChief;
      const res = await request(app.getHttpServer()).get(
        '/api/v1/assignment/stage0/dept-estimate',
      );
      expect(res.status).toBe(200);
      expect(serviceMock.computeDeptEstimate).toHaveBeenCalledWith(
        '202605',
        expect.objectContaining({
          actor: expect.objectContaining({ businessRole: 'section_chief' }),
        }),
      );
    });

    it('plain user → 403 E07_ROLE_NOT_ASSIGNED（class 級 DirectorOrSectionChief 攔截）', async () => {
      currentUser = plain;
      const res = await request(app.getHttpServer()).get(
        '/api/v1/assignment/stage0/dept-estimate',
      );
      expect(res.status).toBe(403);
    });

    it('未登入 → 401', async () => {
      authShouldThrow401 = true;
      const res = await request(app.getHttpServer()).get(
        '/api/v1/assignment/stage0/dept-estimate',
      );
      expect(res.status).toBe(401);
    });

    it('帶 ym / calendarSource / listNo query → 傳給 service', async () => {
      currentUser = director;
      await request(app.getHttpServer()).get(
        '/api/v1/assignment/stage0/dept-estimate?ym=202606&calendarSource=all&listNo=OB202606001',
      );
      expect(serviceMock.computeDeptEstimate).toHaveBeenCalledWith(
        '202606',
        expect.objectContaining({
          calendarSource: 'all',
          listNo: 'OB202606001',
        }),
      );
    });
  });
});
