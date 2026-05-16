/**
 * AssignmentRunController — Route + RBAC tests（F061 / F062 / F065）
 *
 * 涵蓋：
 *   - POST /api/v1/assignment/runs（DirectorGuard）
 *     - director → 202 + runId
 *     - section_chief → 403 E07_REQUIRES_DIRECTOR
 *     - plain user → 403 E07_ROLE_NOT_ASSIGNED
 *     - 未登入 → 401 AUTH_TOKEN_MISSING
 *   - GET /api/v1/assignment/runs（DirectorOrSectionChiefGuard）
 *     - director / section_chief → 200
 *     - plain user → 403
 *   - GET /api/v1/assignment/runs/:runId → 200 / 404
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
import { AssignmentRunController } from '../assignment-run.controller';
import { AssignmentRunService } from '../services/assignment-run.service';
import { AuthGuard } from '@/common/guards/auth.guard';
import { HttpExceptionFilter } from '@/common/filters/http-exception.filter';
import { ERROR_CODES } from '@/common/errors/error-codes';

type CurrentUser =
  | {
      userId: string;
      role: string;
      businessRole: 'director' | 'section_chief' | null;
    }
  | null;

describe('AssignmentRunController — RBAC + Routes', () => {
  let app: INestApplication;
  let serviceMock: {
    triggerRun: ReturnType<typeof vi.fn>;
    listRuns: ReturnType<typeof vi.fn>;
    getRunById: ReturnType<typeof vi.fn>;
  };
  let currentUser: CurrentUser = null;
  let authShouldThrow401 = false;

  beforeAll(async () => {
    serviceMock = {
      triggerRun: vi.fn().mockResolvedValue({
        runId: 'run-uuid-1',
        status: 'pending',
        projectWorkym: '202605',
        triggeredAt: new Date('2026-05-15T00:00:00Z'),
      }),
      listRuns: vi.fn().mockResolvedValue([]),
      getRunById: vi.fn().mockResolvedValue({
        runId: 'run-uuid-1',
        projectWorkym: '202605',
        status: 'completed',
      }),
    };

    process.env.OVERRIDE_CURRENT_WORK_YM = '202605';

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AssignmentRunController],
      providers: [{ provide: AssignmentRunService, useValue: serviceMock }],
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

  // -------------------------------------------------------------------------
  // POST /api/v1/assignment/runs — DirectorGuard
  // -------------------------------------------------------------------------

  describe('POST /runs', () => {
    it('director → 202 + runId + status=pending', async () => {
      currentUser = director;
      const res = await request(app.getHttpServer())
        .post('/api/v1/assignment/runs')
        .send({});
      expect(res.status).toBe(202);
      expect(res.body.runId).toBe('run-uuid-1');
      expect(res.body.status).toBe('pending');
      expect(serviceMock.triggerRun).toHaveBeenCalledWith('202605', 'u-director');
    });

    it('section_chief → 403 E07_REQUIRES_DIRECTOR', async () => {
      currentUser = sectionChief;
      const res = await request(app.getHttpServer())
        .post('/api/v1/assignment/runs')
        .send({});
      expect(res.status).toBe(403);
      expect(res.body.error).toBe(ERROR_CODES.E07_REQUIRES_DIRECTOR);
    });

    it('plain user → 403 E07_ROLE_NOT_ASSIGNED', async () => {
      currentUser = plain;
      const res = await request(app.getHttpServer())
        .post('/api/v1/assignment/runs')
        .send({});
      expect(res.status).toBe(403);
      expect(res.body.error).toBe(ERROR_CODES.E07_ROLE_NOT_ASSIGNED);
    });

    it('未登入 → 401', async () => {
      authShouldThrow401 = true;
      const res = await request(app.getHttpServer())
        .post('/api/v1/assignment/runs')
        .send({});
      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // GET /api/v1/assignment/runs — DirectorOrSectionChiefGuard
  // -------------------------------------------------------------------------

  describe('GET /runs', () => {
    it('director → 200', async () => {
      currentUser = director;
      const res = await request(app.getHttpServer()).get('/api/v1/assignment/runs');
      expect(res.status).toBe(200);
      expect(res.body.runs).toEqual([]);
    });

    it('section_chief → 200', async () => {
      currentUser = sectionChief;
      const res = await request(app.getHttpServer()).get('/api/v1/assignment/runs');
      expect(res.status).toBe(200);
    });

    it('plain user → 403 E07_ROLE_NOT_ASSIGNED', async () => {
      currentUser = plain;
      const res = await request(app.getHttpServer()).get('/api/v1/assignment/runs');
      expect(res.status).toBe(403);
      expect(res.body.error).toBe(ERROR_CODES.E07_ROLE_NOT_ASSIGNED);
    });

    it('ym query param 傳入 service', async () => {
      currentUser = director;
      await request(app.getHttpServer()).get(
        '/api/v1/assignment/runs?ym=202604',
      );
      expect(serviceMock.listRuns).toHaveBeenCalledWith({ ym: '202604' });
    });
  });

  // -------------------------------------------------------------------------
  // GET /api/v1/assignment/runs/:runId
  // -------------------------------------------------------------------------

  describe('GET /runs/:runId', () => {
    it('director → 200 + run detail', async () => {
      currentUser = director;
      const res = await request(app.getHttpServer()).get(
        '/api/v1/assignment/runs/run-uuid-1',
      );
      expect(res.status).toBe(200);
      expect(res.body.runId).toBe('run-uuid-1');
    });

    it('找不到 run → 404', async () => {
      currentUser = director;
      serviceMock.getRunById.mockRejectedValueOnce(
        new NotFoundException({
          error: ERROR_CODES.ASSIGNMENT_RUN_NOT_FOUND,
          message: '找不到指定的月跑紀錄',
        }),
      );
      const res = await request(app.getHttpServer()).get(
        '/api/v1/assignment/runs/missing',
      );
      expect(res.status).toBe(404);
      expect(res.body.error).toBe(ERROR_CODES.ASSIGNMENT_RUN_NOT_FOUND);
    });
  });
});
