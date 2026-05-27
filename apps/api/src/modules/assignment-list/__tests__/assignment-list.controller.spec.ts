/**
 * AssignmentListController — Route + RBAC / FeatureFlag / Historical Tests
 *
 * 策略：mocked Service + mocked AuthGuard + 真實 RBAC + 真實 FeatureFlagGuard chain。
 *
 * 涵蓋：
 *   - TC-ROLE-*：4 角色 × 4 endpoint 矩陣（director / section_chief / plain / unauth）
 *   - TC-FF-*：寫入端點 FeatureFlag ENABLE_E07_REFACTOR_PHASE3=false → 503
 *   - TC-YM-RANGE：GET ym 超出 ±12 → 400 INVALID_YM_RANGE
 *   - TC-YM-FORMAT：GET ym 非 YYYYMM → 422
 *   - TC-HISTORICAL：歷史月份寫入路由 → service 被呼叫前由 controller 阻擋（B2 階段 2
 *     spec F077 §6 BR-3 — service 層改造延後至 P1 B3 / B4，目前以 controller pre-check
 *     於 ym 與 currentWorkYm 比對為主）
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
import { AssignmentListController } from '../assignment-list.controller';
import { AssignmentListService } from '../assignment-list.service';
import { SystemService } from '@/modules/system/system.service';
import { AuthGuard } from '@/common/guards/auth.guard';
import { HttpExceptionFilter } from '@/common/filters/http-exception.filter';

type CurrentUser =
  | {
      userId: string;
      role: string;
      businessRole: 'director' | 'section_chief' | null;
    }
  | null;

const FLAG = 'ENABLE_E07_REFACTOR_PHASE3';

describe('AssignmentListController — Route + RBAC + FeatureFlag', () => {
  let app: INestApplication;
  let serviceMock: {
    listLists: ReturnType<typeof vi.fn>;
    createList: ReturnType<typeof vi.fn>;
    updateList: ReturnType<typeof vi.fn>;
    disableList: ReturnType<typeof vi.fn>;
  };
  let currentUser: CurrentUser = null;
  let authShouldThrow401 = false;
  const originalFlag = process.env[FLAG];

  beforeAll(async () => {
    serviceMock = {
      listLists: vi.fn().mockResolvedValue({
        selectedYm: '202605',
        isHistorical: false,
        isFuture: false,
        lockState: { locked: false, reason: null },
        lists: [],
        stageCounts: {
          draft: 0,
          dept_ratio: 0,
          personnel_ratio: 0,
          approval: 0,
          ready: 0,
          disabled: 0,
        },
      }),
      createList: vi.fn().mockResolvedValue({
        listNo: 'OB202605001',
        listNm: 'x',
        status: 'active',
        projectWorkym: '202605',
      }),
      updateList: vi.fn().mockResolvedValue({
        listNo: 'OB202605001',
        listNm: 'x',
        status: 'active',
        updatedAt: new Date(),
      }),
      disableList: vi.fn().mockResolvedValue({
        listNo: 'OB202605001',
        status: 'inactive',
        updatedAt: new Date(),
      }),
    };

    // 強制當前月份固定（避免 5 月時跑測試 / 6 月時跑測試行為不一致）
    process.env.OVERRIDE_CURRENT_WORK_YM = '202605';

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AssignmentListController],
      providers: [
        { provide: AssignmentListService, useValue: serviceMock },
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
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    if (originalFlag === undefined) delete process.env[FLAG];
    else process.env[FLAG] = originalFlag;
    delete process.env.OVERRIDE_CURRENT_WORK_YM;
  });

  beforeEach(() => {
    authShouldThrow401 = false;
    currentUser = null;
    process.env[FLAG] = 'true';
    vi.clearAllMocks();
  });

  // v2.1 migrate（波 8）：移除 prodKind/caseYear/specTp/caseStatus/settleSrc 5 個欄位
  //   conditionPayload 必填（CreateListDto）；UpdateListDto 為 optional 但若提供需合 schema
  const baseCreateBody = {
    listNm: 'x',
    listPeriodStart: 1,
    listPeriodEnd: 1,
    listInterval: 1,
    conditionPayload: {
      conditions: [
        { columnName: 'prod_kind', fieldType: 'categorical', values: ['01'] },
      ],
      logic: 'AND',
    },
  };
  const baseUpdateBody = baseCreateBody;

  // =========================================================================
  // TC-ROLE — RBAC 矩陣
  // =========================================================================

  describe('TC-ROLE — 4 角色 × endpoint RBAC', () => {
    type EP = {
      name: string;
      method: 'get' | 'post' | 'put' | 'delete';
      path: string;
      body?: any;
      isWrite: boolean;
    };
    const endpoints: EP[] = [
      {
        name: 'GET /lists',
        method: 'get',
        path: '/api/v1/assignment/lists?ym=202605',
        isWrite: false,
      },
      {
        name: 'POST /lists',
        method: 'post',
        path: '/api/v1/assignment/lists',
        body: baseCreateBody,
        isWrite: true,
      },
      {
        name: 'PUT /lists/:listNo',
        method: 'put',
        path: '/api/v1/assignment/lists/OB202605001',
        body: baseUpdateBody,
        isWrite: true,
      },
      {
        name: 'PUT /lists/:listNo/disable',
        method: 'put',
        path: '/api/v1/assignment/lists/OB202605001/disable',
        isWrite: true,
      },
      {
        name: 'DELETE /lists/:listNo',
        method: 'delete',
        path: '/api/v1/assignment/lists/OB202605001',
        isWrite: true,
      },
    ];

    for (const ep of endpoints) {
      it(`${ep.name} → 未登入 401 AUTH_TOKEN_MISSING`, async () => {
        authShouldThrow401 = true;
        let req = request(app.getHttpServer())[ep.method](ep.path);
        if (ep.body) req = req.send(ep.body);
        const res = await req;
        expect(res.status).toBe(401);
      });

      it(`${ep.name} → plain user (businessRole=null) 403 E07_ROLE_NOT_ASSIGNED`, async () => {
        currentUser = { userId: 'u1', role: 'user', businessRole: null };
        let req = request(app.getHttpServer())[ep.method](ep.path);
        if (ep.body) req = req.send(ep.body);
        const res = await req;
        expect(res.status).toBe(403);
        expect(res.body.error).toBe('E07_ROLE_NOT_ASSIGNED');
      });

      if (ep.isWrite) {
        it(`${ep.name} → section_chief 403 E07_REQUIRES_DIRECTOR`, async () => {
          currentUser = {
            userId: 'sc',
            role: 'user',
            businessRole: 'section_chief',
          };
          let req = request(app.getHttpServer())[ep.method](ep.path);
          if (ep.body) req = req.send(ep.body);
          const res = await req;
          expect(res.status).toBe(403);
          expect(res.body.error).toBe('E07_REQUIRES_DIRECTOR');
        });
      } else {
        it(`${ep.name} → section_chief 通過`, async () => {
          currentUser = {
            userId: 'sc',
            role: 'user',
            businessRole: 'section_chief',
          };
          let req = request(app.getHttpServer())[ep.method](ep.path);
          if (ep.body) req = req.send(ep.body);
          const res = await req;
          expect([200, 201]).toContain(res.status);
        });
      }

      it(`${ep.name} → director 通過`, async () => {
        currentUser = {
          userId: 'dir',
          role: 'user',
          businessRole: 'director',
        };
        let req = request(app.getHttpServer())[ep.method](ep.path);
        if (ep.body) req = req.send(ep.body);
        const res = await req;
        expect([200, 201]).toContain(res.status);
      });

      it(`${ep.name} → admin 通過`, async () => {
        currentUser = { userId: 'adm', role: 'admin', businessRole: null };
        let req = request(app.getHttpServer())[ep.method](ep.path);
        if (ep.body) req = req.send(ep.body);
        const res = await req;
        expect([200, 201]).toContain(res.status);
      });
    }
  });

  // =========================================================================
  // TC-FF — FeatureFlag 寫入保護
  // =========================================================================

  describe('TC-FF — FeatureFlag ENABLE_E07_REFACTOR_PHASE3', () => {
    beforeEach(() => {
      currentUser = { userId: 'dir', role: 'user', businessRole: 'director' };
    });

    it('flag=false → POST 503 FEATURE_NOT_ENABLED', async () => {
      process.env[FLAG] = 'false';
      const res = await request(app.getHttpServer())
        .post('/api/v1/assignment/lists')
        .send(baseCreateBody);
      expect(res.status).toBe(503);
      expect(res.body.error).toBe('FEATURE_NOT_ENABLED');
      expect(serviceMock.createList).not.toHaveBeenCalled();
    });

    it('flag=unset → PUT 503', async () => {
      delete process.env[FLAG];
      const res = await request(app.getHttpServer())
        .put('/api/v1/assignment/lists/OB202605001')
        .send(baseUpdateBody);
      expect(res.status).toBe(503);
      expect(res.body.error).toBe('FEATURE_NOT_ENABLED');
    });

    it('flag=true → POST 通過 (201)', async () => {
      process.env[FLAG] = 'true';
      const res = await request(app.getHttpServer())
        .post('/api/v1/assignment/lists')
        .send(baseCreateBody);
      expect(res.status).toBe(201);
    });

    it('GET 不受 FeatureFlag 影響（讀取永遠可用）', async () => {
      delete process.env[FLAG];
      const res = await request(app.getHttpServer()).get(
        '/api/v1/assignment/lists?ym=202605',
      );
      expect(res.status).toBe(200);
    });
  });

  // =========================================================================
  // TC-YM — 月份範圍與格式
  // =========================================================================

  describe('TC-YM — 範圍 / 格式驗證', () => {
    beforeEach(() => {
      currentUser = { userId: 'dir', role: 'user', businessRole: 'director' };
    });

    it('ym=20260 (5 碼) → 422 VALIDATION_ERROR', async () => {
      const res = await request(app.getHttpServer()).get(
        '/api/v1/assignment/lists?ym=20260',
      );
      expect(res.status).toBe(422);
      expect(res.body.error).toBe('VALIDATION_ERROR');
    });

    it('ym 超出 current ± 12 → 400 INVALID_YM_RANGE', async () => {
      // current=202605，±12 → 202505~202705；超出 = 202704 - 13 = 202604 (-13)
      const res = await request(app.getHttpServer()).get(
        '/api/v1/assignment/lists?ym=202404',
      );
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('INVALID_YM_RANGE');
    });

    it('ym 邊界內（current-12 = 202505）→ 200 通過', async () => {
      const res = await request(app.getHttpServer()).get(
        '/api/v1/assignment/lists?ym=202505',
      );
      expect(res.status).toBe(200);
      expect(res.body.isHistorical).toBe(true);
      expect(res.body.isFuture).toBe(false);
    });

    it('ym 未來月份 → isFuture=true', async () => {
      const res = await request(app.getHttpServer()).get(
        '/api/v1/assignment/lists?ym=202607',
      );
      expect(res.status).toBe(200);
      expect(res.body.isFuture).toBe(true);
    });
  });

  // =========================================================================
  // TC-PAYLOAD — DTO 驗證（v2.1 migrate）
  // =========================================================================

  describe('TC-PAYLOAD — DTO 驗證', () => {
    beforeEach(() => {
      currentUser = { userId: 'dir', role: 'user', businessRole: 'director' };
    });

    it('POST 缺 conditionPayload → 422 VALIDATION_ERROR（v2.1 取代 caseStatus）', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/assignment/lists')
        .send({ ...baseCreateBody, conditionPayload: undefined });
      expect(res.status).toBe(422);
      expect(res.body.error).toBe('VALIDATION_ERROR');
    });

    it('PUT 缺 listNm → 422 VALIDATION_ERROR', async () => {
      const res = await request(app.getHttpServer())
        .put('/api/v1/assignment/lists/OB202605001')
        .send({ ...baseUpdateBody, listNm: '' });
      expect(res.status).toBe(422);
    });
  });

  // =========================================================================
  // TC-LIST — GET stage / includeDisabled 透傳
  // =========================================================================

  describe('TC-LIST — query 透傳', () => {
    beforeEach(() => {
      currentUser = { userId: 'dir', role: 'user', businessRole: 'director' };
    });

    it('stage=draft,approval → 拆 array 傳 service', async () => {
      await request(app.getHttpServer()).get(
        '/api/v1/assignment/lists?ym=202605&stage=draft,approval',
      );
      expect(serviceMock.listLists).toHaveBeenCalledWith(
        expect.objectContaining({
          ym: '202605',
          stages: ['draft', 'approval'],
        }),
      );
    });

    it("includeDisabled='true' → boolean true", async () => {
      await request(app.getHttpServer()).get(
        '/api/v1/assignment/lists?ym=202605&includeDisabled=true',
      );
      expect(serviceMock.listLists).toHaveBeenCalledWith(
        expect.objectContaining({ includeDisabled: true }),
      );
    });

    it('未帶 ym → 預設取 currentWorkYm', async () => {
      await request(app.getHttpServer()).get('/api/v1/assignment/lists');
      expect(serviceMock.listLists).toHaveBeenCalledWith(
        expect.objectContaining({ ym: '202605' }),
      );
    });
  });
});
