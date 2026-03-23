import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { DataSource, Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { AuthModule } from '@/modules/auth/auth.module';
import { AccountsModule } from '@/modules/accounts/accounts.module';
import { DatasourceModule } from '@/modules/datasource/datasource.module';
import { ExtractionTaskModule } from '@/modules/extraction-task/extraction-task.module';
import { EtlModule } from '@/modules/etl/etl.module';
import { HttpExceptionFilter } from '@/common/filters/http-exception.filter';
import { User } from '@/database/entities/user.entity';
import { TokenBlocklist } from '@/database/entities/token-blocklist.entity';
import { PasswordResetToken } from '@/database/entities/password-reset-token.entity';
import { Datasource } from '@/database/entities/datasource.entity';
import { DatasourceHealthLog } from '@/database/entities/datasource-health-log.entity';
import { ExtractionTask } from '@/database/entities/extraction-task.entity';
import { ExtractionLog } from '@/database/entities/extraction-log.entity';
import { EtlPipeline } from '@/database/entities/etl-pipeline.entity';
import { EtlPipelineLog } from '@/database/entities/etl-pipeline-log.entity';
import { EtlPipelineVersion } from '@/database/entities/etl-pipeline-version.entity';
import { CONNECTION_TESTER } from '@/modules/datasource/connection-tester.provider';
import { EXTRACTION_EXECUTOR } from '@/modules/extraction-task/extraction-executor.provider';
import { HashUtil } from '@/common/hash/hash.util';
import { ADMIN_ACTIVE, USER_ACTIVE } from './seeds/test-data';

const TEST_AES_KEY = randomBytes(32).toString('hex');

async function createTestApp(): Promise<INestApplication> {
  process.env.AES_ENCRYPTION_KEY = TEST_AES_KEY;

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        load: [
          () => ({
            JWT_SECRET: 'test-jwt-secret-key-for-e2e-testing',
            AES_ENCRYPTION_KEY: TEST_AES_KEY,
          }),
        ],
      }),
      TypeOrmModule.forRoot({
        type: 'better-sqlite3',
        database: ':memory:',
        entities: [
          User, TokenBlocklist, PasswordResetToken, Datasource,
          DatasourceHealthLog, ExtractionTask, ExtractionLog,
          EtlPipeline, EtlPipelineLog, EtlPipelineVersion,
        ],
        synchronize: true,
      }),
      ThrottlerModule.forRoot([{ name: 'login', ttl: 60000, limit: 100 }]),
      AuthModule,
      AccountsModule,
      DatasourceModule,
      ExtractionTaskModule,
      EtlModule,
    ],
    providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
  })
    .overrideProvider(CONNECTION_TESTER)
    .useValue({ testConnection: async () => ({ success: true, responseTimeMs: 10 }) })
    .overrideProvider(EXTRACTION_EXECUTOR)
    .useValue({
      execute: async () => ({ totalCount: 0, extractedCount: 0 }),
      getSourceTableMetadata: async () => [],
      getSourceCount: async () => 0,
      readBatch: async () => ({ rows: [], hasMore: false }),
    })
    .compile();

  const app = moduleFixture.createNestApplication();
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  await app.init();

  const dataSource = moduleFixture.get(DataSource);
  const userRepo = dataSource.getRepository(User);
  const hashedPassword = await HashUtil.hash(ADMIN_ACTIVE.password);

  await userRepo.save([
    userRepo.create({
      id: ADMIN_ACTIVE.id,
      name: ADMIN_ACTIVE.name,
      email: ADMIN_ACTIVE.email,
      password_hash: hashedPassword,
      role: ADMIN_ACTIVE.role,
      status: ADMIN_ACTIVE.status,
    }),
    userRepo.create({
      id: USER_ACTIVE.id,
      name: USER_ACTIVE.name,
      email: USER_ACTIVE.email,
      password_hash: hashedPassword,
      role: USER_ACTIVE.role,
      status: USER_ACTIVE.status,
    }),
  ]);

  return app;
}

async function getAdminToken(app: INestApplication): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email: ADMIN_ACTIVE.email, password: ADMIN_ACTIVE.password });
  return res.body.token;
}

async function getUserToken(app: INestApplication): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email: USER_ACTIVE.email, password: USER_ACTIVE.password });
  return res.body.token;
}

async function createPipeline(
  repo: Repository<EtlPipeline>,
  overrides: Partial<EtlPipeline> = {},
): Promise<EtlPipeline> {
  const pipeline = repo.create({
    name: `Pipeline-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    version: 1,
    step_count: 3,
    status: 'active',
    enabled: true,
    created_by: ADMIN_ACTIVE.id,
    processed_count: 0,
    ...overrides,
  });
  return repo.save(pipeline);
}

const NODE_LOGS_COMPLETED = JSON.stringify([
  {
    nodeId: 'node-1',
    nodeName: 'Extract: raw_a3f2c1d4',
    nodeType: 'extract',
    status: 'completed',
    processedCount: 1000,
    durationMs: 2000,
    errorMessage: null,
  },
  {
    nodeId: 'node-2',
    nodeName: 'NULL 處理',
    nodeType: 'transform-null-handler',
    status: 'completed',
    processedCount: 950,
    durationMs: 1500,
    errorMessage: null,
  },
  {
    nodeId: 'node-3',
    nodeName: 'Load: customer_core',
    nodeType: 'load',
    status: 'completed',
    processedCount: 950,
    durationMs: 1500,
    errorMessage: null,
  },
]);

const NODE_LOGS_FAILED = JSON.stringify([
  {
    nodeId: 'node-1',
    nodeName: 'Extract: raw_a3f2c1d4',
    nodeType: 'extract',
    status: 'completed',
    processedCount: 1000,
    durationMs: 2000,
    errorMessage: null,
  },
  {
    nodeId: 'node-2',
    nodeName: 'NULL 處理',
    nodeType: 'transform-null-handler',
    status: 'completed',
    processedCount: 950,
    durationMs: 1500,
    errorMessage: null,
  },
  {
    nodeId: 'node-3',
    nodeName: 'Load: customer_core',
    nodeType: 'load',
    status: 'failed',
    processedCount: 0,
    durationMs: 300,
    errorMessage: 'Load 節點寫入失敗：目標表欄位不符',
  },
]);

async function createLog(
  repo: Repository<EtlPipelineLog>,
  pipelineId: string,
  overrides: Partial<EtlPipelineLog> = {},
): Promise<EtlPipelineLog> {
  const log = repo.create({
    pipeline_id: pipelineId,
    version: 1,
    status: 'completed',
    started_at: new Date(),
    finished_at: new Date(),
    duration_ms: 5000,
    processed_count: 1000,
    error_message: null,
    node_logs: NODE_LOGS_COMPLETED,
    triggered_by: 'manual',
    is_test_run: false,
    created_by: ADMIN_ACTIVE.id,
    ...overrides,
  } as any);
  return repo.save(log);
}

describe('F032: Pipeline Logs E2E', () => {
  let app: INestApplication;
  let adminToken: string;
  let userToken: string;
  let dataSource: DataSource;
  let pipelineRepo: Repository<EtlPipeline>;
  let logRepo: Repository<EtlPipelineLog>;

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAdminToken(app);
    userToken = await getUserToken(app);
    dataSource = app.get(DataSource);
    pipelineRepo = dataSource.getRepository(EtlPipeline);
    logRepo = dataSource.getRepository(EtlPipelineLog);
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(async () => {
    await logRepo.createQueryBuilder().delete().from(EtlPipelineLog).execute();
    await pipelineRepo.createQueryBuilder().delete().from(EtlPipeline).execute();
  });

  // TS-F032-001: 日誌列表欄位完整性驗證
  it('TS-F032-001: log list should contain all required fields', async () => {
    const pipeline = await createPipeline(pipelineRepo);
    await createLog(logRepo, pipeline.id, { triggered_by: 'manual' });
    await createLog(logRepo, pipeline.id, { triggered_by: 'schedule' });
    await createLog(logRepo, pipeline.id, { triggered_by: 'retry' });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/etl/pipelines/${pipeline.id}/logs`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(3);

    for (const log of res.body.data) {
      expect(log).toHaveProperty('id');
      expect(log).toHaveProperty('version');
      expect(log).toHaveProperty('status');
      expect(log).toHaveProperty('startedAt');
      expect(log).toHaveProperty('finishedAt');
      expect(log).toHaveProperty('durationMs');
      expect(log).toHaveProperty('processedCount');
      expect(log).toHaveProperty('triggeredBy');
      expect(log).toHaveProperty('isTestRun');
      // Should NOT include nodeLogs in list
      expect(log).not.toHaveProperty('nodeLogs');
    }
  });

  // TS-F032-002: 日誌列表依 startedAt 降序排列
  it('TS-F032-002: log list should be sorted by startedAt descending', async () => {
    const pipeline = await createPipeline(pipelineRepo);
    const t1 = new Date('2026-01-01T00:00:00Z');
    const t2 = new Date('2026-02-01T00:00:00Z');
    const t3 = new Date('2026-03-01T00:00:00Z');

    await createLog(logRepo, pipeline.id, { started_at: t1 });
    await createLog(logRepo, pipeline.id, { started_at: t2 });
    await createLog(logRepo, pipeline.id, { started_at: t3 });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/etl/pipelines/${pipeline.id}/logs`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const dates = res.body.data.map((d: any) => new Date(d.startedAt).getTime());
    expect(dates[0]).toBeGreaterThanOrEqual(dates[1]);
    expect(dates[1]).toBeGreaterThanOrEqual(dates[2]);
  });

  // TS-F032-003: 日誌列表含 pagination 物件
  it('TS-F032-003: log list should contain pagination object', async () => {
    const pipeline = await createPipeline(pipelineRepo);
    await createLog(logRepo, pipeline.id);
    await createLog(logRepo, pipeline.id);
    await createLog(logRepo, pipeline.id);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/etl/pipelines/${pipeline.id}/logs`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.pagination).toEqual({
      page: 1,
      pageSize: 10,
      total: 3,
      totalPages: 1,
    });
  });

  // TS-F032-004: 日誌詳情頂層欄位完整性
  it('TS-F032-004: log detail should contain all top-level fields', async () => {
    const pipeline = await createPipeline(pipelineRepo, { name: 'Test Pipeline ABC' });
    const log = await createLog(logRepo, pipeline.id, {
      status: 'completed',
      triggered_by: 'manual',
      is_test_run: false,
      duration_ms: 5000,
      processed_count: 1000,
      error_message: null,
    });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/etl/logs/${log.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(log.id);
    expect(res.body.pipelineId).toBe(pipeline.id);
    expect(res.body.pipelineName).toBe('Test Pipeline ABC');
    expect(res.body.version).toBe(1);
    expect(res.body.status).toBe('completed');
    expect(res.body.startedAt).toBeTruthy();
    expect(res.body.finishedAt).not.toBeNull();
    expect(res.body.durationMs).toBe(5000);
    expect(res.body.processedCount).toBe(1000);
    expect(res.body.errorMessage).toBeNull();
    expect(res.body.triggeredBy).toBe('manual');
    expect(res.body.isTestRun).toBe(false);
  });

  // TS-F032-005: 日誌詳情 nodeLogs 陣列欄位驗證
  it('TS-F032-005: log detail nodeLogs should contain all fields', async () => {
    const pipeline = await createPipeline(pipelineRepo);
    const log = await createLog(logRepo, pipeline.id, {
      node_logs: NODE_LOGS_COMPLETED,
    });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/etl/logs/${log.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.nodeLogs).toHaveLength(3);

    for (const node of res.body.nodeLogs) {
      expect(node).toHaveProperty('nodeId');
      expect(node).toHaveProperty('nodeName');
      expect(node).toHaveProperty('nodeType');
      expect(node).toHaveProperty('status');
      expect(node).toHaveProperty('processedCount');
      expect(node).toHaveProperty('durationMs');
      expect(node).toHaveProperty('errorMessage');
    }
  });

  // TS-F032-006: 日誌詳情 nodeLogs 節點類型正確對應
  it('TS-F032-006: nodeLogs nodeType should match expected order', async () => {
    const pipeline = await createPipeline(pipelineRepo);
    const log = await createLog(logRepo, pipeline.id, {
      node_logs: NODE_LOGS_COMPLETED,
    });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/etl/logs/${log.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.body.nodeLogs[0].nodeType).toBe('extract');
    expect(res.body.nodeLogs[1].nodeType).toBe('transform-null-handler');
    expect(res.body.nodeLogs[2].nodeType).toBe('load');
  });

  // TS-F032-007: 日誌列表中測試執行標記為 isTestRun=true
  it('TS-F032-007: test run logs should have isTestRun=true in list', async () => {
    const pipeline = await createPipeline(pipelineRepo);
    await createLog(logRepo, pipeline.id, {
      triggered_by: 'test',
      is_test_run: true,
    });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/etl/pipelines/${pipeline.id}/logs`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const testLog = res.body.data[0];
    expect(testLog.isTestRun).toBe(true);
    expect(testLog.triggeredBy).toBe('test');
  });

  // TS-F032-008: 日誌詳情中測試執行 isTestRun=true
  it('TS-F032-008: test run log detail should have isTestRun=true', async () => {
    const pipeline = await createPipeline(pipelineRepo);
    const log = await createLog(logRepo, pipeline.id, {
      triggered_by: 'test',
      is_test_run: true,
      status: 'completed',
    });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/etl/logs/${log.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.isTestRun).toBe(true);
    expect(res.body.triggeredBy).toBe('test');
  });

  // TS-F032-009: 失敗日誌頂層 errorMessage 非空
  it('TS-F032-009: failed log should have non-null errorMessage', async () => {
    const pipeline = await createPipeline(pipelineRepo);
    const log = await createLog(logRepo, pipeline.id, {
      status: 'failed',
      error_message: 'Load 節點寫入失敗：目標表欄位不符',
      node_logs: NODE_LOGS_FAILED,
    });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/etl/logs/${log.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('failed');
    expect(res.body.errorMessage).toBe('Load 節點寫入失敗：目標表欄位不符');
  });

  // TS-F032-010: 失敗節點 errorMessage 非空，成功節點為 null
  it('TS-F032-010: failed node should have errorMessage, completed nodes null', async () => {
    const pipeline = await createPipeline(pipelineRepo);
    const log = await createLog(logRepo, pipeline.id, {
      status: 'failed',
      error_message: 'Load 節點寫入失敗：目標表欄位不符',
      node_logs: NODE_LOGS_FAILED,
    });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/etl/logs/${log.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.body.nodeLogs[0].status).toBe('completed');
    expect(res.body.nodeLogs[0].errorMessage).toBeNull();
    expect(res.body.nodeLogs[1].status).toBe('completed');
    expect(res.body.nodeLogs[1].errorMessage).toBeNull();
    expect(res.body.nodeLogs[2].status).toBe('failed');
    expect(res.body.nodeLogs[2].errorMessage).toBeTruthy();
  });

  // TS-F032-011: 執行中日誌 finishedAt=null、durationMs=null
  it('TS-F032-011: running log should have null finishedAt and durationMs', async () => {
    const pipeline = await createPipeline(pipelineRepo);
    const log = await createLog(logRepo, pipeline.id, {
      status: 'running',
      finished_at: null,
      duration_ms: null,
      processed_count: 0,
      node_logs: null,
    } as any);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/etl/logs/${log.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('running');
    expect(res.body.finishedAt).toBeNull();
    expect(res.body.durationMs).toBeNull();
  });

  // TS-F032-012: 分頁 — 第 1 頁 10 筆
  it('TS-F032-012: pagination page 1 should return 10 items', async () => {
    const pipeline = await createPipeline(pipelineRepo);
    // Create 25 logs
    for (let i = 0; i < 25; i++) {
      await createLog(logRepo, pipeline.id, {
        started_at: new Date(Date.now() - i * 60000),
      });
    }

    const res = await request(app.getHttpServer())
      .get(`/api/v1/etl/pipelines/${pipeline.id}/logs?page=1&pageSize=10`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(10);
    expect(res.body.pagination.total).toBe(25);
    expect(res.body.pagination.totalPages).toBe(3);
    expect(res.body.pagination.page).toBe(1);
    expect(res.body.pagination.pageSize).toBe(10);
  });

  // TS-F032-013: 分頁 — 最後一頁 5 筆
  it('TS-F032-013: pagination last page should return remaining items', async () => {
    const pipeline = await createPipeline(pipelineRepo);
    for (let i = 0; i < 25; i++) {
      await createLog(logRepo, pipeline.id, {
        started_at: new Date(Date.now() - i * 60000),
      });
    }

    const res = await request(app.getHttpServer())
      .get(`/api/v1/etl/pipelines/${pipeline.id}/logs?page=3&pageSize=10`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(5);
    expect(res.body.pagination.page).toBe(3);
    expect(res.body.pagination.total).toBe(25);
  });

  // TS-F032-014: 無執行紀錄時回傳空陣列
  it('TS-F032-014: empty logs should return empty array', async () => {
    const pipeline = await createPipeline(pipelineRepo);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/etl/pipelines/${pipeline.id}/logs`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.pagination.total).toBe(0);
    expect(res.body.pagination.totalPages).toBe(0);
  });

  // TS-F032-015: 軟刪除 Pipeline 後日誌列表仍可存取
  it('TS-F032-015: soft-deleted pipeline logs should still be accessible', async () => {
    const pipeline = await createPipeline(pipelineRepo, {
      deleted_at: new Date(),
    } as any);
    await createLog(logRepo, pipeline.id);
    await createLog(logRepo, pipeline.id);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/etl/pipelines/${pipeline.id}/logs`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
  });

  // TS-F032-016: 軟刪除 Pipeline 後個別日誌詳情仍可存取
  it('TS-F032-016: log detail from soft-deleted pipeline should be accessible', async () => {
    const pipeline = await createPipeline(pipelineRepo, {
      deleted_at: new Date(),
    } as any);
    const log = await createLog(logRepo, pipeline.id);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/etl/logs/${log.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.pipelineId).toBe(pipeline.id);
    expect(res.body.nodeLogs).toBeDefined();
  });

  // TS-F032-017: Pipeline 不存在 -> 日誌列表 404
  it('TS-F032-017: non-existent pipeline should return 404', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/etl/pipelines/00000000-0000-0000-0000-000000000000/logs')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('PIPELINE_NOT_FOUND');
  });

  // TS-F032-018: Log 不存在 -> 日誌詳情 404
  it('TS-F032-018: non-existent log should return 404', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/etl/logs/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('PIPELINE_LOG_NOT_FOUND');
  });

  // TS-F032-019: User 角色無權查看日誌列表 -> 403
  it('TS-F032-019: user role should get 403 for log list', async () => {
    const pipeline = await createPipeline(pipelineRepo);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/etl/pipelines/${pipeline.id}/logs`)
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('AUTH_FORBIDDEN');
  });

  // TS-F032-020: User 角色無權查看日誌詳情 -> 403
  it('TS-F032-020: user role should get 403 for log detail', async () => {
    const pipeline = await createPipeline(pipelineRepo);
    const log = await createLog(logRepo, pipeline.id);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/etl/logs/${log.id}`)
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('AUTH_FORBIDDEN');
  });

  // TS-F032-021: 未登入無 Token -> 401
  it('TS-F032-021: no token should return 401', async () => {
    const pipeline = await createPipeline(pipelineRepo);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/etl/pipelines/${pipeline.id}/logs`);

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('AUTH_TOKEN_MISSING');
  });
});
