/**
 * Stage0EstimateController — GET /api/v1/assignment/stage0/list-estimate-overview
 * F120 / US-184 — Route + RBAC tests
 *
 * 對應：
 *   - AD-E07-51 §4.1（新增獨立端點，class 級 DirectorOrSectionChiefGuard，
 *     ★不得以 method 級 @RequireDirector() 收緊，否則處長 403 違反 AC-LIST-11）
 *   - AD-E07-51 §6.1（query 參數）/ §6.4（controller 方法簽章）
 *   - F120 spec §6.3 授權表 / §6.2 query 參數表
 *
 * 沿用既有 stage0-estimate.controller.spec.ts 之慣例：mount 真實 Stage0EstimateController
 * class（mock service）+ AuthGuard override + supertest。
 *
 * ⚠️ Blindness：本檔未讀取 stage0-estimate.controller.ts 原始碼；路由路徑 / Guard 組態 /
 * query 參數皆依 AD-E07-51 之文件化契約撰寫。路由尚不存在，預期為 RED（404）。
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import {
  ExecutionContext,
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import request from 'supertest';
import { Stage0EstimateController } from '../stage0-estimate.controller';
import { Stage0EstimateService } from '../stage0-estimate.service';
import { AssignmentListService } from '../assignment-list.service';
import { SystemService } from '@/modules/system/system.service';
import { AuthGuard } from '@/common/guards/auth.guard';
import { HttpExceptionFilter } from '@/common/filters/http-exception.filter';

type CurrentUser =
  | { userId: string; role: string; businessRole: 'director' | 'section_chief' | null }
  | null;

describe('Stage0EstimateController — GET /stage0/list-estimate-overview（F120 / US-184）', () => {
  let app: INestApplication;
  let serviceMock: {
    calculateDailyEstimate: ReturnType<typeof vi.fn>;
    estimateListCount: ReturnType<typeof vi.fn>;
    computeDeptEstimate: ReturnType<typeof vi.fn>;
    computeListEstimateOverview: ReturnType<typeof vi.fn>;
  };
  let currentUser: CurrentUser = null;
  let authShouldThrow401 = false;

  const overviewResponse = {
    ym: '202605',
    mode: 'aggregated',
    listNo: null,
    scope: { role: 'director', deptCode: null, listOverviewScoped: false },
    totalListCount: 0,
    totalEstimatedCount: 0,
    unestimatedListCount: 0,
    groups: [],
    warnings: [],
  };

  beforeAll(async () => {
    serviceMock = {
      calculateDailyEstimate: vi.fn().mockResolvedValue({}),
      estimateListCount: vi.fn().mockResolvedValue({ listNo: 'OB202605001', count: 8500 }),
      computeDeptEstimate: vi.fn().mockResolvedValue({
        ym: '202605',
        mode: 'aggregated',
        listNo: null,
        scope: { role: 'director', deptCode: null, scoped: false },
        departments: [],
        days: [],
        orgMonthTotal: 0,
        warnings: [],
      }),
      computeListEstimateOverview: vi.fn().mockResolvedValue(overviewResponse),
    };

    process.env.OVERRIDE_CURRENT_WORK_YM = '202605';

    const module: TestingModule = await Test.createTestingModule({
      controllers: [Stage0EstimateController],
      providers: [
        { provide: Stage0EstimateService, useValue: serviceMock },
        { provide: SystemService, useValue: new SystemService() },
        {
          provide: AssignmentListService,
          useValue: {
            previewHitCount: vi
              .fn()
              .mockResolvedValue({ estimatedHitCount: 0, isEstimate: true, sampleSize: 0, totalCount: 0 }),
          },
        },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({
        canActivate: (ctx: ExecutionContext) => {
          if (authShouldThrow401) {
            throw new UnauthorizedException({ error: 'AUTH_TOKEN_MISSING', message: '請先登入。' });
          }
          const req = ctx.switchToHttp().getRequest();
          req.user = currentUser;
          return true;
        },
      })
      .compile();

    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    delete process.env.OVERRIDE_CURRENT_WORK_YM;
    await app.close();
  });

  beforeEach(() => {
    authShouldThrow401 = false;
    currentUser = null;
    vi.clearAllMocks();
    serviceMock.computeListEstimateOverview.mockResolvedValue(overviewResponse);
  });

  const director: CurrentUser = { userId: 'u-director', role: 'user', businessRole: 'director' };
  const sectionChief: CurrentUser = { userId: 'u-sc', role: 'user', businessRole: 'section_chief' };
  const plain: CurrentUser = { userId: 'u-plain', role: 'user', businessRole: null };

  describe('GET /stage0/list-estimate-overview', () => {
    it('director → 200，computeListEstimateOverview 以 actor=director 呼叫', async () => {
      currentUser = director;
      const res = await request(app.getHttpServer()).get(
        '/api/v1/assignment/stage0/list-estimate-overview',
      );
      expect(res.status).toBe(200);
      expect(res.body.mode).toBe('aggregated');
      expect(serviceMock.computeListEstimateOverview).toHaveBeenCalledWith(
        '202605',
        expect.objectContaining({ actor: expect.objectContaining({ businessRole: 'director' }) }),
      );
    });

    // ★AC-LIST-11 之核心 Guard 回歸點：本端點與 dailyEstimate/previewHitCount 不同，
    //   不得以 method 級 @RequireDirector() 收緊；處長必須可進入（200），而非 403。
    it('★section_chief → 200（唯讀可進入，AC-LIST-11 之必要條件；不得為 403）', async () => {
      currentUser = sectionChief;
      const res = await request(app.getHttpServer()).get(
        '/api/v1/assignment/stage0/list-estimate-overview',
      );
      expect(res.status).toBe(200);
      expect(serviceMock.computeListEstimateOverview).toHaveBeenCalledWith(
        '202605',
        expect.objectContaining({ actor: expect.objectContaining({ businessRole: 'section_chief' }) }),
      );
    });

    it('plain user（無 businessRole）→ 403（class 級 DirectorOrSectionChief 攔截，與既有 dept-estimate 一致）', async () => {
      currentUser = plain;
      const res = await request(app.getHttpServer()).get(
        '/api/v1/assignment/stage0/list-estimate-overview',
      );
      expect(res.status).toBe(403);
    });

    it('未登入 → 401', async () => {
      authShouldThrow401 = true;
      const res = await request(app.getHttpServer()).get(
        '/api/v1/assignment/stage0/list-estimate-overview',
      );
      expect(res.status).toBe(401);
    });

    it('ym 未帶 → 使用 currentWorkYm（202605）', async () => {
      currentUser = director;
      await request(app.getHttpServer()).get('/api/v1/assignment/stage0/list-estimate-overview');
      expect(serviceMock.computeListEstimateOverview).toHaveBeenCalledWith(
        '202605',
        expect.anything(),
      );
    });

    it('帶 ym / listNo query → 傳給 service（listNo 觸發 single-list 模式）', async () => {
      currentUser = director;
      await request(app.getHttpServer()).get(
        '/api/v1/assignment/stage0/list-estimate-overview?ym=202606&listNo=OB202606001',
      );
      expect(serviceMock.computeListEstimateOverview).toHaveBeenCalledWith(
        '202606',
        expect.objectContaining({ listNo: 'OB202606001' }),
      );
    });

    it('calendarSource / startDate / endDate 接受但不影響呼叫結果（A-1 no-op 參數，AD §6.1）', async () => {
      currentUser = director;
      const res = await request(app.getHttpServer()).get(
        '/api/v1/assignment/stage0/list-estimate-overview?calendarSource=all&startDate=2026-06-01&endDate=2026-06-30',
      );
      expect(res.status).toBe(200); // 至少不得因這些既有參數而 400/500
    });

    it('回應內容直接透傳 service 回傳值（不在 controller 層另行轉換 shape）', async () => {
      currentUser = director;
      const rich = {
        ...overviewResponse,
        totalListCount: 3,
        totalEstimatedCount: 4200,
        groups: [
          {
            groupKey: '01',
            groupType: 'code',
            optionValue: '01',
            displayOrder: 0,
            listCount: 1,
            estimatedListCount: 1,
            subtotalCount: 4200,
            percent: 100,
            lists: [
              {
                listNo: 'OB202605001',
                listNm: '測試名單',
                conditions: [],
                estimatedCount: 4200,
                estimateUnavailable: false,
              },
            ],
          },
        ],
      };
      serviceMock.computeListEstimateOverview.mockResolvedValue(rich);
      const res = await request(app.getHttpServer()).get(
        '/api/v1/assignment/stage0/list-estimate-overview',
      );
      expect(res.body.totalEstimatedCount).toBe(4200);
      expect(res.body.groups[0].groupKey).toBe('01');
      expect(res.body.groups[0].lists[0].listNo).toBe('OB202605001');
    });
  });
});
