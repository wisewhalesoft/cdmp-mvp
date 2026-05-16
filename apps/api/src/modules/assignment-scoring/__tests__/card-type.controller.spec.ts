/**
 * F069/F070/F071/F072 / CardTypeController — Route + RBAC Matrix Tests
 *
 * 策略：mocked Service + mocked AuthGuard + 真實 RBAC Guard chain
 *   （依 AD-E07 v3.0 / F002 §4.6.2 / B2 替換後）
 *
 * RBAC：
 *   - GET → DirectorOrSectionChiefGuard：director / section_chief / admin 通過
 *   - POST / PUT / DELETE → DirectorGuard：director / admin 通過；section_chief 拒
 *
 * 涵蓋 6 端點 × 4 角色（unauthenticated / plain user / section_chief / director）矩陣：
 *     - GET    /card-types
 *     - POST   /card-types
 *     - PUT    /card-types/:cardType
 *     - GET    /card-types/:cardType/delete-preview
 *     - DELETE /card-types/:cardType
 *     - GET    /card-types/:cardType/stats
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
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import request from 'supertest';
import { CardTypeController } from '../controllers/card-type.controller';
import { CardTypeService } from '../services/card-type.service';
import { AuthGuard } from '@/common/guards/auth.guard';
import { HttpExceptionFilter } from '@/common/filters/http-exception.filter';

type CurrentUser =
  | {
      userId: string;
      role: string;
      businessRole: 'director' | 'section_chief' | null;
    }
  | null;

describe('CardTypeController — RBAC Matrix', () => {
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

  type Method = 'get' | 'post' | 'put' | 'delete';
  type Endpoint = {
    name: string;
    method: Method;
    path: string;
    isWrite: boolean;
    body?: any;
  };

  const endpoints: Endpoint[] = [
    {
      name: 'GET /card-types',
      method: 'get',
      path: '/api/v1/assignment/scoring/card-types',
      isWrite: false,
    },
    {
      name: 'POST /card-types',
      method: 'post',
      path: '/api/v1/assignment/scoring/card-types',
      isWrite: true,
      body: { cardType: 'X1', cardName: '測試卡', prodKind: '01' },
    },
    {
      name: 'PUT /card-types/:cardType',
      method: 'put',
      path: '/api/v1/assignment/scoring/card-types/H',
      isWrite: true,
      body: { cardName: '新名稱', prodKind: '01' },
    },
    {
      name: 'GET /card-types/:cardType/delete-preview',
      method: 'get',
      path: '/api/v1/assignment/scoring/card-types/X/delete-preview',
      isWrite: false,
    },
    {
      name: 'DELETE /card-types/:cardType',
      method: 'delete',
      path: '/api/v1/assignment/scoring/card-types/X?confirmCascade=true',
      isWrite: true,
    },
    {
      name: 'GET /card-types/:cardType/stats',
      method: 'get',
      path: '/api/v1/assignment/scoring/card-types/H/stats',
      isWrite: false,
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

      it('businessRole=null → 403 E07_ROLE_NOT_ASSIGNED', async () => {
        currentUser = { userId: 'u1', role: 'user', businessRole: null };
        let req = request(app.getHttpServer())[ep.method](ep.path);
        if (ep.body) req = req.send(ep.body);
        const res = await req;
        expect(res.status).toBe(403);
        expect(res.body.error).toBe('E07_ROLE_NOT_ASSIGNED');
      });

      if (ep.isWrite) {
        it('section_chief → 403 E07_REQUIRES_DIRECTOR（寫入限部長）', async () => {
          currentUser = {
            userId: 'sc-uuid',
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
        it('section_chief 通過（GET 開放）', async () => {
          currentUser = {
            userId: 'sc-uuid',
            role: 'user',
            businessRole: 'section_chief',
          };
          let req = request(app.getHttpServer())[ep.method](ep.path);
          if (ep.body) req = req.send(ep.body);
          const res = await req;
          expect([200, 201]).toContain(res.status);
        });
      }

      it('director 通過', async () => {
        currentUser = {
          userId: 'dir-uuid',
          role: 'user',
          businessRole: 'director',
        };
        let req = request(app.getHttpServer())[ep.method](ep.path);
        if (ep.body) req = req.send(ep.body);
        const res = await req;
        expect([200, 201]).toContain(res.status);
      });

      it('admin 通過（豁免規則）', async () => {
        currentUser = { userId: 'admin-uuid', role: 'admin', businessRole: null };
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
      currentUser = {
        userId: 'dir-uuid',
        role: 'user',
        businessRole: 'director',
      };

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
        expect.objectContaining({ userId: 'dir-uuid' }),
      );
    });
  });

  // ===== F069 status query =====
  describe('GET status query', () => {
    it('未帶 status → service 收到 status=undefined（service 自行套用 active 預設）', async () => {
      currentUser = {
        userId: 'dir-uuid',
        role: 'user',
        businessRole: 'director',
      };
      await request(app.getHttpServer()).get(
        '/api/v1/assignment/scoring/card-types',
      );

      expect(serviceMock.listCardTypes).toHaveBeenCalledWith({
        status: undefined,
      });
    });

    it('status=all → service 收到 status=all', async () => {
      currentUser = {
        userId: 'dir-uuid',
        role: 'user',
        businessRole: 'director',
      };
      await request(app.getHttpServer()).get(
        '/api/v1/assignment/scoring/card-types?status=all',
      );

      expect(serviceMock.listCardTypes).toHaveBeenCalledWith({ status: 'all' });
    });

    it('status=invalid → 422 VALIDATION_ERROR', async () => {
      currentUser = {
        userId: 'dir-uuid',
        role: 'user',
        businessRole: 'director',
      };
      const res = await request(app.getHttpServer()).get(
        '/api/v1/assignment/scoring/card-types?status=invalid',
      );
      expect(res.status).toBe(422);
    });
  });

  // ===== Iter 9 / GET /:cardType/stats =====
  describe('GET /:cardType/stats — Iter 9', () => {
    it('200 with stats body（section_chief 亦可讀）', async () => {
      currentUser = {
        userId: 'sc-uuid',
        role: 'user',
        businessRole: 'section_chief',
      };
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
      currentUser = {
        userId: 'dir-uuid',
        role: 'user',
        businessRole: 'director',
      };
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
