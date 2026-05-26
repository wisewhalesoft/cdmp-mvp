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
    };

    process.env.OVERRIDE_CURRENT_WORK_YM = '202605';

    const module: TestingModule = await Test.createTestingModule({
      controllers: [Stage0EstimateController],
      providers: [{ provide: Stage0EstimateService, useValue: serviceMock }],
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
});
