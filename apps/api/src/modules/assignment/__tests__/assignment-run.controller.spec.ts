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
import { AssignmentRunSnapshotService } from '../services/assignment-run-snapshot.service';
import { AssignmentRunReportService } from '../services/assignment-run-report.service';
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
  let snapshotMock: {
    getFullSnapshot: ReturnType<typeof vi.fn>;
    getSnapshotByType: ReturnType<typeof vi.fn>;
  };
  let reportMock: {
    getSummary: ReturnType<typeof vi.fn>;
    exportResult: ReturnType<typeof vi.fn>;
    compareRuns: ReturnType<typeof vi.fn>;
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
    snapshotMock = {
      getFullSnapshot: vi.fn().mockResolvedValue({
        runMeta: { runId: 'run-uuid-1' },
        snapshots: { config: {}, inputList: {}, result: {} },
      }),
      getSnapshotByType: vi.fn().mockResolvedValue({
        runMeta: { runId: 'run-uuid-1' },
        type: 'config',
        payload: { foo: 'bar' },
      }),
    };
    reportMock = {
      getSummary: vi.fn().mockResolvedValue({
        runId: 'run-uuid-1',
        stage1Count: 10,
        stage4Count: 8,
        coverageRate: 0.8,
      }),
      exportResult: vi.fn().mockResolvedValue({
        filename: 'assignment_result_202605_aaaaaaaa.csv',
        contentType: 'text/csv; charset=utf-8',
        body: 'list_no,appl_no\nL1,A1',
        rowCount: 1,
      }),
      compareRuns: vi.fn().mockResolvedValue({
        base: { runId: 'A', projectWorkym: '202604', totalCases: 9 },
        compare: { runId: 'B', projectWorkym: '202605', totalCases: 10 },
        summary: { totalDiff: 1, deptDiff: [], levelDiff: [] },
        configDiff: { cardVersionChanged: null, deptRatioChanges: [], crRuleChanged: null },
        personnelMismatch: { list: [], mismatchCount: 0, totalCount: 0, rate: 0, alert: false },
        customerDiff: { added: [], removed: [] },
      }),
    };

    process.env.OVERRIDE_CURRENT_WORK_YM = '202605';

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AssignmentRunController],
      providers: [
        { provide: AssignmentRunService, useValue: serviceMock },
        { provide: AssignmentRunSnapshotService, useValue: snapshotMock },
        { provide: AssignmentRunReportService, useValue: reportMock },
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
    // 重置 call 記錄但保留 mock 預設實作
    serviceMock.triggerRun.mockClear();
    serviceMock.listRuns.mockClear();
    serviceMock.getRunById.mockClear();
    snapshotMock.getFullSnapshot.mockClear();
    snapshotMock.getSnapshotByType.mockClear();
    reportMock.getSummary.mockClear();
    reportMock.exportResult.mockClear();
    reportMock.compareRuns.mockClear();
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

  // -------------------------------------------------------------------------
  // M05 — F063 / F064 / F066 / F067
  // -------------------------------------------------------------------------

  describe('GET /runs/:runId/summary (F063)', () => {
    it('director → 200 + summary fields', async () => {
      currentUser = director;
      const res = await request(app.getHttpServer()).get(
        '/api/v1/assignment/runs/run-uuid-1/summary',
      );
      expect(res.status).toBe(200);
      expect(res.body.runId).toBe('run-uuid-1');
      expect(reportMock.getSummary).toHaveBeenCalledWith(
        'run-uuid-1',
        expect.objectContaining({ userId: 'u-director' }),
      );
    });

    it('plain user → 403', async () => {
      currentUser = plain;
      const res = await request(app.getHttpServer()).get(
        '/api/v1/assignment/runs/run-uuid-1/summary',
      );
      expect(res.status).toBe(403);
      expect(res.body.error).toBe(ERROR_CODES.E07_ROLE_NOT_ASSIGNED);
    });

    it('section_chief → 200', async () => {
      currentUser = sectionChief;
      const res = await request(app.getHttpServer()).get(
        '/api/v1/assignment/runs/run-uuid-1/summary',
      );
      expect(res.status).toBe(200);
    });
  });

  describe('GET /runs/:runId/export (F064)', () => {
    it('director default csv → 200 + Content-Disposition + body', async () => {
      currentUser = director;
      const res = await request(app.getHttpServer()).get(
        '/api/v1/assignment/runs/run-uuid-1/export',
      );
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toContain('attachment');
      expect(res.headers['content-disposition']).toContain('.csv');
      expect(res.text).toContain('list_no');
      expect(reportMock.exportResult).toHaveBeenCalledWith(
        'run-uuid-1',
        'csv',
        'u-director',
        expect.objectContaining({ userId: 'u-director' }),
      );
    });

    it('format=xlsx 透傳至 service（service 端拒絕）', async () => {
      currentUser = director;
      reportMock.exportResult.mockRejectedValueOnce(
        Object.assign(new Error('xlsx not supported'), {
          status: 422,
          response: { error: ERROR_CODES.EXPORT_FORMAT_NOT_SUPPORTED },
        }),
      );
      await request(app.getHttpServer()).get(
        '/api/v1/assignment/runs/run-uuid-1/export?format=xlsx',
      );
      expect(reportMock.exportResult).toHaveBeenCalledWith(
        'run-uuid-1',
        'xlsx',
        'u-director',
        expect.objectContaining({ userId: 'u-director' }),
      );
    });

    it('plain user → 403', async () => {
      currentUser = plain;
      const res = await request(app.getHttpServer()).get(
        '/api/v1/assignment/runs/run-uuid-1/export',
      );
      expect(res.status).toBe(403);
    });

    it('未完成 run → 422 透傳', async () => {
      currentUser = director;
      const { UnprocessableEntityException } = await import('@nestjs/common');
      reportMock.exportResult.mockRejectedValueOnce(
        new UnprocessableEntityException({
          error: ERROR_CODES.ASSIGNMENT_RUN_NOT_COMPLETED,
          message: '月跑尚未完成，結果摘要不可用',
        }),
      );
      const res = await request(app.getHttpServer()).get(
        '/api/v1/assignment/runs/run-uuid-1/export',
      );
      expect(res.status).toBe(422);
      expect(res.body.error).toBe(ERROR_CODES.ASSIGNMENT_RUN_NOT_COMPLETED);
    });
  });

  describe('GET /runs/:runId/snapshot (F066)', () => {
    it('director no type → getFullSnapshot 三份', async () => {
      currentUser = director;
      const res = await request(app.getHttpServer()).get(
        '/api/v1/assignment/runs/run-uuid-1/snapshot',
      );
      expect(res.status).toBe(200);
      expect(snapshotMock.getFullSnapshot).toHaveBeenCalledWith(
        'run-uuid-1',
        expect.objectContaining({ userId: 'u-director' }),
      );
      expect(res.body.snapshots).toBeDefined();
    });

    it('director type=config → getSnapshotByType', async () => {
      currentUser = director;
      const res = await request(app.getHttpServer()).get(
        '/api/v1/assignment/runs/run-uuid-1/snapshot?type=config',
      );
      expect(res.status).toBe(200);
      expect(snapshotMock.getSnapshotByType).toHaveBeenCalledWith(
        'run-uuid-1',
        'config',
        expect.objectContaining({ userId: 'u-director' }),
      );
    });

    it('director path /snapshot/:type → getSnapshotByType', async () => {
      currentUser = director;
      const res = await request(app.getHttpServer()).get(
        '/api/v1/assignment/runs/run-uuid-1/snapshot/result',
      );
      expect(res.status).toBe(200);
      expect(snapshotMock.getSnapshotByType).toHaveBeenCalledWith(
        'run-uuid-1',
        'result',
        expect.objectContaining({ userId: 'u-director' }),
      );
    });

    it('plain user → 403', async () => {
      currentUser = plain;
      const res = await request(app.getHttpServer()).get(
        '/api/v1/assignment/runs/run-uuid-1/snapshot',
      );
      expect(res.status).toBe(403);
    });
  });

  describe('GET /runs/compare (F067)', () => {
    const A = '550e8400-e29b-41d4-a716-446655440000';
    const B = '550e8400-e29b-41d4-a716-446655440001';

    it('director → 200 + compare response', async () => {
      currentUser = director;
      const res = await request(app.getHttpServer()).get(
        `/api/v1/assignment/runs/compare?runA=${A}&runB=${B}`,
      );
      expect(res.status).toBe(200);
      expect(reportMock.compareRuns).toHaveBeenCalledWith(
        A,
        B,
        expect.objectContaining({ userId: 'u-director' }),
      );
      expect(res.body.personnelMismatch).toBeDefined();
    });

    it('section_chief → 200', async () => {
      currentUser = sectionChief;
      const res = await request(app.getHttpServer()).get(
        `/api/v1/assignment/runs/compare?runA=${A}&runB=${B}`,
      );
      expect(res.status).toBe(200);
    });

    it('plain user → 403', async () => {
      currentUser = plain;
      const res = await request(app.getHttpServer()).get(
        `/api/v1/assignment/runs/compare?runA=${A}&runB=${B}`,
      );
      expect(res.status).toBe(403);
    });

    it('缺 runA → 422 VALIDATION_ERROR', async () => {
      currentUser = director;
      const res = await request(app.getHttpServer()).get(
        `/api/v1/assignment/runs/compare?runB=${B}`,
      );
      expect(res.status).toBe(422);
      expect(res.body.error).toBe(ERROR_CODES.VALIDATION_ERROR);
    });

    it('runA 非 UUID → 422', async () => {
      currentUser = director;
      const res = await request(app.getHttpServer()).get(
        `/api/v1/assignment/runs/compare?runA=not-uuid&runB=${B}`,
      );
      expect(res.status).toBe(422);
    });

    it('compare 路由不被 :runId 攔截（執行 reportService.compareRuns 而非 service.getRunById）', async () => {
      currentUser = director;
      await request(app.getHttpServer()).get(
        `/api/v1/assignment/runs/compare?runA=${A}&runB=${B}`,
      );
      expect(reportMock.compareRuns).toHaveBeenCalled();
      expect(serviceMock.getRunById).not.toHaveBeenCalled();
    });

    it('任一 run 非 completed → 422 透傳', async () => {
      currentUser = director;
      const { UnprocessableEntityException } = await import('@nestjs/common');
      reportMock.compareRuns.mockRejectedValueOnce(
        new UnprocessableEntityException({
          error: ERROR_CODES.ASSIGNMENT_RUN_NOT_COMPARABLE,
          message: '僅 completed 狀態的月跑可比對',
        }),
      );
      const res = await request(app.getHttpServer()).get(
        `/api/v1/assignment/runs/compare?runA=${A}&runB=${B}`,
      );
      expect(res.status).toBe(422);
      expect(res.body.error).toBe(ERROR_CODES.ASSIGNMENT_RUN_NOT_COMPARABLE);
    });
  });
});
