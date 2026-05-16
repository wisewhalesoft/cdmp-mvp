/**
 * F053：AssignmentScoringController — GET /scoring Route + Guard Tests
 *
 * 策略：mocked Service + mocked AuthGuard + 真實 RBAC Guard chain，
 * 不真實連接 DB（與 F068 controller spec 同 pattern）。
 *
 * RBAC（依 F002 §4.6.2 / AD-E07 v3.0 / B2 替換後）：
 *   - GET → DirectorOrSectionChiefGuard：director / section_chief / admin 通過
 *
 * 涵蓋：
 *   - TS-F053-007：未帶 JWT → 401 AUTH_TOKEN_MISSING
 *   - TS-F053-008：role=user businessRole=null → 403 E07_ROLE_NOT_ASSIGNED
 *   - admin 通過
 *   - role=user + businessRole=director 通過
 *   - role=user + businessRole=section_chief 通過
 *   - Service throw NotFound 透傳 404
 *   - Service throw VALIDATION_ERROR 透傳 422
 *   - cardType query 正確傳入 service
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
import { AssignmentScoringController } from '../assignment-scoring.controller';
import { AssignmentScoringService } from '../assignment-scoring.service';
import { AuthGuard } from '@/common/guards/auth.guard';
import { HttpExceptionFilter } from '@/common/filters/http-exception.filter';

type CurrentUser =
  | {
      userId: string;
      role: string;
      businessRole: 'director' | 'section_chief' | null;
    }
  | null;

describe('AssignmentScoringController — F053', () => {
  let app: INestApplication;
  let serviceMock: { getScoring: ReturnType<typeof vi.fn> };
  let currentUser: CurrentUser = null;
  let authShouldThrow401 = false;

  beforeAll(async () => {
    serviceMock = {
      getScoring: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AssignmentScoringController],
      providers: [{ provide: AssignmentScoringService, useValue: serviceMock }],
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
    await app.close();
  });

  beforeEach(() => {
    serviceMock.getScoring.mockReset();
    currentUser = null;
    authShouldThrow401 = false;
  });

  it('TS-F053-007：未帶 JWT → 401 AUTH_TOKEN_MISSING', async () => {
    authShouldThrow401 = true;
    const res = await request(app.getHttpServer()).get(
      '/api/v1/assignment/scoring?cardType=H',
    );
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('AUTH_TOKEN_MISSING');
  });

  it('TS-F053-008：role=user businessRole=null → 403 E07_ROLE_NOT_ASSIGNED', async () => {
    currentUser = { userId: 'u1', role: 'user', businessRole: null };
    const res = await request(app.getHttpServer()).get(
      '/api/v1/assignment/scoring?cardType=H',
    );
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('E07_ROLE_NOT_ASSIGNED');
  });

  it('admin 通過 → service 被呼叫一次', async () => {
    currentUser = { userId: 'u-admin', role: 'admin', businessRole: null };
    serviceMock.getScoring.mockResolvedValue({
      version: {
        cardType: 'H', cardName: '期中', cardVersion: 1,
        sdate: '20190823', edate: '20991231',
        createdBy: null, createdAt: null,
      },
      dimensions: [],
    });

    const res = await request(app.getHttpServer()).get(
      '/api/v1/assignment/scoring?cardType=H',
    );
    expect(res.status).toBe(200);
    expect(serviceMock.getScoring).toHaveBeenCalledWith({ cardType: 'H' });
  });

  it('role=user + businessRole=director 通過', async () => {
    currentUser = { userId: 'u-dir', role: 'user', businessRole: 'director' };
    serviceMock.getScoring.mockResolvedValue({
      version: {
        cardType: 'H', cardName: '期中', cardVersion: 1,
        sdate: '20190823', edate: '20991231',
        createdBy: '21251', createdAt: '2019-08-23T00:00:00.000Z',
      },
      dimensions: [],
    });
    const res = await request(app.getHttpServer()).get(
      '/api/v1/assignment/scoring?cardType=H',
    );
    expect(res.status).toBe(200);
    expect(res.body.version.cardType).toBe('H');
  });

  it('role=user + businessRole=section_chief 通過（GET 開放）', async () => {
    currentUser = {
      userId: 'u-sc',
      role: 'user',
      businessRole: 'section_chief',
    };
    serviceMock.getScoring.mockResolvedValue({
      version: {
        cardType: 'H', cardName: '期中', cardVersion: 1,
        sdate: '20190823', edate: '20991231',
        createdBy: null, createdAt: null,
      },
      dimensions: [],
    });
    const res = await request(app.getHttpServer()).get(
      '/api/v1/assignment/scoring?cardType=H',
    );
    expect(res.status).toBe(200);
  });

  it('Service throw NotFoundException 透傳 404', async () => {
    currentUser = { userId: 'u-dir', role: 'user', businessRole: 'director' };
    serviceMock.getScoring.mockRejectedValue(
      new NotFoundException({
        error: 'SCORING_VERSION_NOT_FOUND',
        message: '目前無生效的計分版本，請聯繫 IT 確認設定',
      }),
    );
    const res = await request(app.getHttpServer()).get(
      '/api/v1/assignment/scoring?cardType=H',
    );
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('SCORING_VERSION_NOT_FOUND');
  });

  it('cardType 省略時 query.cardType 為 undefined', async () => {
    currentUser = { userId: 'u-dir', role: 'user', businessRole: 'director' };
    serviceMock.getScoring.mockResolvedValue({
      version: {
        cardType: 'H', cardName: '期中', cardVersion: 1,
        sdate: '20190823', edate: '20991231',
        createdBy: null, createdAt: null,
      },
      dimensions: [],
    });
    const res = await request(app.getHttpServer()).get('/api/v1/assignment/scoring');
    expect(res.status).toBe(200);
    expect(serviceMock.getScoring).toHaveBeenCalledWith({ cardType: undefined });
  });

  it('cardType 超過 5 字元 → 422 VALIDATION_ERROR', async () => {
    currentUser = { userId: 'u-dir', role: 'user', businessRole: 'director' };
    const res = await request(app.getHttpServer()).get(
      '/api/v1/assignment/scoring?cardType=TOOLONG',
    );
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });
});
