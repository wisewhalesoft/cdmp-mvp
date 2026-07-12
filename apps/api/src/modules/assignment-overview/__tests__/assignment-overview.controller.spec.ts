/**
 * F111-test.md A 組（CTRL-001~011）— AssignmentOverviewController Route + RBAC。
 *
 * 對齊 Stage0EstimateController.spec 樣板：override AuthGuard、保留真實
 * DirectorOrSectionChiefGuard + DirectorGuard；mock AssignmentOverviewService。
 *
 * ⚠️ 實作偏差（已知，與 spec 文字不同）：F111 §5.4 / 測試 CTRL-007 標示 `ym` 格式錯誤為
 *    HTTP 400，但本專案全域 HttpExceptionFilter 將所有 class-validator 錯誤統一轉為 **422
 *    VALIDATION_ERROR**（見 main.ts + assignment-run.controller.spec:523 既有慣例）。此為
 *    F111 前既存之全域約定，非本 feature 可獨立變更（改動會破壞其他所有端點），故本測試斷言
 *    真實行為 422 + VALIDATION_ERROR（守住「格式錯誤 → 驗證錯誤、service 未被呼叫」之語意）。
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
import { AssignmentOverviewController } from '../assignment-overview.controller';
import { AssignmentOverviewService } from '../assignment-overview.service';
import { REQUIRE_DIRECTOR_KEY } from '@/common/decorators/business-role.decorator';
import { SystemService } from '@/modules/system/system.service';
import { AuthGuard } from '@/common/guards/auth.guard';
import { HttpExceptionFilter } from '@/common/filters/http-exception.filter';
import { ERROR_CODES } from '@/common/errors/error-codes';

type CurrentUser =
  | { userId: string; role: string; businessRole: 'director' | 'section_chief' | null }
  | null;

function fullResponse(scope: any) {
  return {
    selectedYm: '202608',
    currentWorkYm: '202607',
    targetWorkYm: '202608',
    scope,
    stageTodo: { error: false, stageCounts: {}, notReadyLists: [], notReadyCount: 0, hasAnyList: true },
    runReadiness: { error: false, canNavigateToTrigger: true },
    dialingVolume: { error: false, headline: {}, selected: {} },
    recentRun: { error: false, hasCompletedRun: false, emptyReason: 'noRun', latestRunStatus: null, latestRunId: null },
  };
}

describe('AssignmentOverviewController — RBAC + Routes', () => {
  let app: INestApplication;
  let serviceMock: { getOverview: ReturnType<typeof vi.fn> };
  let currentUser: CurrentUser = null;
  let authShouldThrow: null | 'missing' | 'expired' = null;

  beforeAll(async () => {
    serviceMock = {
      getOverview: vi
        .fn()
        .mockResolvedValue(fullResponse({ role: 'director', deptCode: null, scoped: false })),
    };

    process.env.OVERRIDE_CURRENT_WORK_YM = '202607';

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AssignmentOverviewController],
      providers: [
        { provide: AssignmentOverviewService, useValue: serviceMock },
        { provide: SystemService, useValue: new SystemService() },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({
        canActivate: (ctx: ExecutionContext) => {
          if (authShouldThrow === 'missing') {
            throw new UnauthorizedException({
              error: ERROR_CODES.TOKEN_MISSING,
              message: '請先登入。',
            });
          }
          if (authShouldThrow === 'expired') {
            throw new UnauthorizedException({
              error: ERROR_CODES.TOKEN_EXPIRED,
              message: 'Session 已過期，請重新登入。',
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
    authShouldThrow = null;
    currentUser = null;
    vi.clearAllMocks();
    serviceMock.getOverview.mockResolvedValue(
      fullResponse({ role: 'director', deptCode: null, scoped: false }),
    );
  });

  const director: CurrentUser = { userId: 'u-d', role: 'user', businessRole: 'director' };
  const sectionChief: CurrentUser = { userId: 'u-sc', role: 'user', businessRole: 'section_chief' };
  const admin: CurrentUser = { userId: 'u-a', role: 'admin', businessRole: null };
  const plain: CurrentUser = { userId: 'u-p', role: 'user', businessRole: null };

  it('CTRL-001：director → 200 + AssignmentOverviewResponse 形狀', async () => {
    currentUser = director;
    const res = await request(app.getHttpServer()).get('/api/v1/assignment/overview?ym=202608');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('selectedYm');
    expect(res.body).toHaveProperty('scope');
    expect(res.body).toHaveProperty('stageTodo');
    expect(res.body).toHaveProperty('runReadiness');
    expect(res.body).toHaveProperty('dialingVolume');
    expect(res.body).toHaveProperty('recentRun');
  });

  it('CTRL-002：section_chief → 200（無 @RequireDirector，處長可存取）', async () => {
    currentUser = sectionChief;
    serviceMock.getOverview.mockResolvedValue(
      fullResponse({ role: 'section_chief', deptCode: 'D003', scoped: true }),
    );
    const res = await request(app.getHttpServer()).get('/api/v1/assignment/overview?ym=202608');
    expect(res.status).toBe(200);
  });

  it('CTRL-003：admin → 200', async () => {
    currentUser = admin;
    const res = await request(app.getHttpServer()).get('/api/v1/assignment/overview?ym=202608');
    expect(res.status).toBe(200);
  });

  it('CTRL-004：plain user → 403 E07_ROLE_NOT_ASSIGNED，service 未被呼叫', async () => {
    currentUser = plain;
    const res = await request(app.getHttpServer()).get('/api/v1/assignment/overview');
    expect(res.status).toBe(403);
    expect(res.body.error).toBe(ERROR_CODES.E07_ROLE_NOT_ASSIGNED);
    expect(serviceMock.getOverview).not.toHaveBeenCalled();
  });

  it('CTRL-005：未帶 Token → 401', async () => {
    authShouldThrow = 'missing';
    const res = await request(app.getHttpServer()).get('/api/v1/assignment/overview');
    expect(res.status).toBe(401);
  });

  it('CTRL-006：Token 過期 → 401', async () => {
    authShouldThrow = 'expired';
    const res = await request(app.getHttpServer()).get('/api/v1/assignment/overview');
    expect(res.status).toBe(401);
  });

  it('CTRL-007：ym 格式不符 → 驗證錯誤（VALIDATION_ERROR），service 未被呼叫', async () => {
    currentUser = director;
    for (const bad of ['2026-08', 'abcdef']) {
      const res = await request(app.getHttpServer()).get(
        `/api/v1/assignment/overview?ym=${bad}`,
      );
      // 全域 HttpExceptionFilter 將 class-validator 錯誤統一為 422 VALIDATION_ERROR（見檔頭偏差說明）
      expect(res.status).toBe(422);
      expect(res.body.error).toBe(ERROR_CODES.VALIDATION_ERROR);
    }
    expect(serviceMock.getOverview).not.toHaveBeenCalled();
  });

  it('CTRL-008：ym 省略 → 以 getCurrentWorkYm() 作為 selectedYm 傳入 service', async () => {
    currentUser = director;
    await request(app.getHttpServer()).get('/api/v1/assignment/overview');
    expect(serviceMock.getOverview).toHaveBeenCalledWith('202607', expect.anything());
  });

  it('CTRL-009：ym 有值 → 原樣透傳（不套預設）', async () => {
    currentUser = director;
    await request(app.getHttpServer()).get('/api/v1/assignment/overview?ym=202609');
    expect(serviceMock.getOverview).toHaveBeenCalledWith('202609', expect.anything());
  });

  it('CTRL-010：【紅線】user → 精確 403（非 200+四區塊 error），body 非 AssignmentOverviewResponse 形狀', async () => {
    currentUser = plain;
    const res = await request(app.getHttpServer()).get('/api/v1/assignment/overview');
    expect(res.status).toBe(403);
    for (const key of ['stageTodo', 'runReadiness', 'dialingVolume', 'recentRun', 'scope']) {
      expect(res.body).not.toHaveProperty(key);
    }
    expect(res.body).toHaveProperty('error');
    expect(res.body).toHaveProperty('message');
  });

  it('CTRL-011：不受 FeatureFlagGuard(ENABLE_E07_REFACTOR_PHASE3) 影響（未設/false 皆 200）', async () => {
    currentUser = director;
    const prev = process.env.ENABLE_E07_REFACTOR_PHASE3;
    delete process.env.ENABLE_E07_REFACTOR_PHASE3;
    let res = await request(app.getHttpServer()).get('/api/v1/assignment/overview?ym=202608');
    expect(res.status).toBe(200);
    process.env.ENABLE_E07_REFACTOR_PHASE3 = 'false';
    res = await request(app.getHttpServer()).get('/api/v1/assignment/overview?ym=202608');
    expect(res.status).toBe(200);
    if (prev === undefined) delete process.env.ENABLE_E07_REFACTOR_PHASE3;
    else process.env.ENABLE_E07_REFACTOR_PHASE3 = prev;
  });

  it('STATIC-003：getOverview handler 無 @RequireDirector metadata（純讀端點）', () => {
    const meta = Reflect.getMetadata(
      REQUIRE_DIRECTOR_KEY,
      AssignmentOverviewController.prototype.getOverview,
    );
    expect(meta).toBeUndefined();
  });
});
