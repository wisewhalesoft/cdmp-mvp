/**
 * F069/F070/F071/F072 / CardTypeController — Route + Guard Matrix Tests
 *
 * 策略：mocked Service + overridden AuthGuard / SalesManagerGuard
 *   （與既有 assignment-scoring-f053.controller.spec.ts 同 pattern）
 *
 * 涵蓋 Guard 矩陣（依 test-spec regression/M02-regression-guards.md TC-GUARD-GUARD-001）：
 *   4 endpoints × 3 角色 = 12 cases，加上 POST + delete-preview 為 5 個 controller endpoint：
 *     - GET    /card-types
 *     - POST   /card-types
 *     - PUT    /card-types/:cardType
 *     - GET    /card-types/:cardType/delete-preview
 *     - DELETE /card-types/:cardType
 *   每個端點驗證：(1) 未登入 → 401 AUTH_TOKEN_MISSING
 *                (2) is_sales_manager=false → 403 AUTH_FORBIDDEN
 *                (3) admin 通過 / SM 通過
 */

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import {
  ExecutionContext,
  ForbiddenException,
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import request from 'supertest';
import { CardTypeController } from '../controllers/card-type.controller';
import { CardTypeService } from '../services/card-type.service';
import { AuthGuard } from '@/common/guards/auth.guard';
import { SalesManagerGuard } from '@/common/guards/sales-manager.guard';
import { HttpExceptionFilter } from '@/common/filters/http-exception.filter';

type CurrentUser =
  | { userId: string; role: string; isSalesManager: boolean }
  | null;

describe('CardTypeController — Guard Matrix', () => {
  let app: INestApplication;
  let serviceMock: {
    listCardTypes: ReturnType<typeof vi.fn>;
    createCardType: ReturnType<typeof vi.fn>;
    updateCardType: ReturnType<typeof vi.fn>;
    getDeletePreview: ReturnType<typeof vi.fn>;
    deleteCardTypeCascade: ReturnType<typeof vi.fn>;
    getCardTypeStats: ReturnType<typeof vi.fn>;
  };
  let currentUser: CurrentUser = null;
  let authShouldThrow401 = false;

  beforeAll(async () => {
    serviceMock = {
      listCardTypes: vi.fn().mockResolvedValue({ cardTypes: [] }),
      createCardType: vi.fn().mockResolvedValue({
        cardType: 'X1',
        cardName: '測試',
        prodKind: '01',
        prodKindName: '汽車',
        status: 'active',
        cardVersion: 1,
        createdAt: new Date().toISOString(),
      }),
      updateCardType: vi.fn().mockResolvedValue({
        cardType: 'H',
        cardName: '新名稱',
        prodKind: '01',
        prodKindName: '汽車',
        status: 'active',
        updatedAt: new Date().toISOString(),
      }),
      getDeletePreview: vi.fn().mockResolvedValue({
        cardType: 'X',
        cardName: '測試',
        cascade: { versions: 0, columns: 0, scores: 0, levels: 0, tierMappings: 0 },
        listDefinitionsAffected: 0,
      }),
      deleteCardTypeCascade: vi.fn().mockResolvedValue({
        cardType: 'X',
        deletedCascade: { versions: 0, columns: 0, scores: 0, levels: 0, tierMappings: 0 },
        listDefinitionsAffected: 0,
        deletedAt: new Date().toISOString(),
      }),
      getCardTypeStats: vi.fn().mockResolvedValue({
        cardType: 'H',
        dimCount: 8,
        scoreCount: 24,
        levelCount: 4,
        tierCount: 4,
        listDefsAffected: 2,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CardTypeController],
      providers: [{ provide: CardTypeService, useValue: serviceMock }],
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
      .overrideGuard(SalesManagerGuard)
      .useValue({
        canActivate: (ctx: ExecutionContext) => {
          const req = ctx.switchToHttp().getRequest();
          const u = req.user;
          if (!u) {
            throw new ForbiddenException({
              error: 'AUTH_FORBIDDEN',
              message: '您沒有權限執行此操作。',
            });
          }
          if (u.role === 'admin' || u.isSalesManager === true) return true;
          throw new ForbiddenException({
            error: 'AUTH_FORBIDDEN',
            message: '您沒有權限執行此操作。',
          });
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
  });

  beforeEach(() => {
    authShouldThrow401 = false;
    currentUser = null;
    vi.clearAllMocks();
  });

  // ===== 認證矩陣（4 端點 × 3 角色） =====

  const endpoints: Array<{
    name: string;
    method: 'get' | 'post' | 'put' | 'delete';
    path: string;
    body?: any;
  }> = [
    { name: 'GET /card-types', method: 'get', path: '/api/v1/assignment/scoring/card-types' },
    {
      name: 'POST /card-types',
      method: 'post',
      path: '/api/v1/assignment/scoring/card-types',
      body: { cardType: 'X1', cardName: '測試卡', prodKind: '01' },
    },
    {
      name: 'PUT /card-types/:cardType',
      method: 'put',
      path: '/api/v1/assignment/scoring/card-types/H',
      body: { cardName: '新名稱', prodKind: '01' },
    },
    {
      name: 'GET /card-types/:cardType/delete-preview',
      method: 'get',
      path: '/api/v1/assignment/scoring/card-types/X/delete-preview',
    },
    {
      name: 'DELETE /card-types/:cardType',
      method: 'delete',
      path: '/api/v1/assignment/scoring/card-types/X?confirmCascade=true',
    },
    {
      name: 'GET /card-types/:cardType/stats',
      method: 'get',
      path: '/api/v1/assignment/scoring/card-types/H/stats',
    },
  ];

  for (const ep of endpoints) {
    describe(ep.name, () => {
      it('未登入 → 401 AUTH_TOKEN_MISSING', async () => {
        authShouldThrow401 = true;
        let req = request(app.getHttpServer())[ep.method](ep.path);
        if (ep.body) req = req.send(ep.body);
        const res = await req;
        expect(res.status).toBe(401);
        expect(res.body.error).toBe('AUTH_TOKEN_MISSING');
      });

      it('非業務主管 (is_sales_manager=false) → 403 AUTH_FORBIDDEN', async () => {
        currentUser = { userId: 'u1', role: 'user', isSalesManager: false };
        let req = request(app.getHttpServer())[ep.method](ep.path);
        if (ep.body) req = req.send(ep.body);
        const res = await req;
        expect(res.status).toBe(403);
        expect(res.body.error).toBe('AUTH_FORBIDDEN');
      });

      it('業務主管（is_sales_manager=true）通過', async () => {
        currentUser = {
          userId: 'sm-uuid',
          role: 'user',
          isSalesManager: true,
        };
        let req = request(app.getHttpServer())[ep.method](ep.path);
        if (ep.body) req = req.send(ep.body);
        const res = await req;
        expect([200, 201]).toContain(res.status);
      });

      it('admin 通過（豁免規則）', async () => {
        currentUser = { userId: 'admin-uuid', role: 'admin', isSalesManager: false };
        let req = request(app.getHttpServer())[ep.method](ep.path);
        if (ep.body) req = req.send(ep.body);
        const res = await req;
        expect([200, 201]).toContain(res.status);
      });
    });
  }

  // ===== AC-2 (F071)：body 含 cardType 後端忽略，URL path 為準 =====
  describe('PUT body 含 cardType 欄位時後端忽略（AC-2）', () => {
    it('TC-F071-02：body { cardType: TAMPERED } → service.updateCardType 仍以 path H 為準', async () => {
      currentUser = { userId: 'sm-uuid', role: 'user', isSalesManager: true };

      const res = await request(app.getHttpServer())
        .put('/api/v1/assignment/scoring/card-types/H')
        .send({
          cardName: '新名稱',
          prodKind: '01',
          cardType: 'ZTAMP', // 嘗試竄改（合法 5 字元格式，但 service 仍以 URL path 為準）
        });

      // DTO 已宣告 cardType optional，pipe 不擋；service 接受並忽略
      expect(res.status).toBe(200);
      // service 被呼叫，path 為 'H'（不是 TAMPERED）
      expect(serviceMock.updateCardType).toHaveBeenCalledWith(
        'H',
        { cardName: '新名稱', prodKind: '01' },
        expect.objectContaining({ userId: 'sm-uuid' }),
      );
    });
  });

  // ===== F069 status query =====
  describe('GET status query', () => {
    it('未帶 status → service 收到 status=undefined（service 自行套用 active 預設）', async () => {
      currentUser = { userId: 'sm-uuid', role: 'user', isSalesManager: true };
      await request(app.getHttpServer()).get(
        '/api/v1/assignment/scoring/card-types',
      );

      expect(serviceMock.listCardTypes).toHaveBeenCalledWith({
        status: undefined,
      });
    });

    it('status=all → service 收到 status=all', async () => {
      currentUser = { userId: 'sm-uuid', role: 'user', isSalesManager: true };
      await request(app.getHttpServer()).get(
        '/api/v1/assignment/scoring/card-types?status=all',
      );

      expect(serviceMock.listCardTypes).toHaveBeenCalledWith({ status: 'all' });
    });

    it('status=invalid → 422 VALIDATION_ERROR', async () => {
      currentUser = { userId: 'sm-uuid', role: 'user', isSalesManager: true };
      const res = await request(app.getHttpServer()).get(
        '/api/v1/assignment/scoring/card-types?status=invalid',
      );
      expect(res.status).toBe(422);
    });
  });

  // ===== Iter 9 / GET /:cardType/stats =====
  describe('GET /:cardType/stats — Iter 9', () => {
    it('200 with stats body（業務主管）', async () => {
      currentUser = { userId: 'sm-uuid', role: 'user', isSalesManager: true };
      const res = await request(app.getHttpServer()).get(
        '/api/v1/assignment/scoring/card-types/H/stats',
      );
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        cardType: 'H',
        dimCount: 8,
        scoreCount: 24,
        levelCount: 4,
        tierCount: 4,
        listDefsAffected: 2,
      });
      expect(serviceMock.getCardTypeStats).toHaveBeenCalledWith('H');
    });

    it('404 當 cardType 不存在（透傳 service NotFoundException）', async () => {
      currentUser = { userId: 'sm-uuid', role: 'user', isSalesManager: true };
      const { NotFoundException } = await import('@nestjs/common');
      serviceMock.getCardTypeStats.mockRejectedValueOnce(
        new NotFoundException({
          error: 'CARD_TYPE_NOT_FOUND',
          message: '計分卡類型 NONE 不存在',
        }),
      );

      const res = await request(app.getHttpServer()).get(
        '/api/v1/assignment/scoring/card-types/NONE/stats',
      );
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('CARD_TYPE_NOT_FOUND');
    });
  });
});
