import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { DataSource } from 'typeorm';
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

/** Compute "today" start/end in UTC, aligned to Asia/Taipei (UTC+8) */
function todayInTaipei() {
  const now = new Date();
  const taipeiOffset = 8 * 60 * 60 * 1000;
  const taipeiNow = new Date(now.getTime() + taipeiOffset);
  const taipeiTodayStart = new Date(
    Date.UTC(taipeiNow.getUTCFullYear(), taipeiNow.getUTCMonth(), taipeiNow.getUTCDate()),
  );
  const todayStartUTC = new Date(taipeiTodayStart.getTime() - taipeiOffset);
  const tomorrowStartUTC = new Date(todayStartUTC.getTime() + 24 * 60 * 60 * 1000);
  return { todayStartUTC, tomorrowStartUTC };
}

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

  // Seed test users
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

/** Helper to clean all pipeline-related data */
async function cleanPipelineData(dataSource: DataSource) {
  const logRepo = dataSource.getRepository(EtlPipelineLog);
  const versionRepo = dataSource.getRepository(EtlPipelineVersion);
  const pipelineRepo = dataSource.getRepository(EtlPipeline);
  await logRepo.createQueryBuilder().delete().from(EtlPipelineLog).execute();
  await versionRepo.createQueryBuilder().delete().from(EtlPipelineVersion).execute();
  await pipelineRepo.createQueryBuilder().delete().from(EtlPipeline).execute();
}

/** Helper to create a pipeline */
async function createPipeline(
  dataSource: DataSource,
  overrides: Partial<EtlPipeline> = {},
): Promise<EtlPipeline> {
  const repo = dataSource.getRepository(EtlPipeline);
  return repo.save(
    repo.create({
      name: `Pipeline ${Date.now()}-${Math.random()}`,
      status: 'active',
      version: 1,
      step_count: 3,
      enabled: true,
      processed_count: 0,
      avg_duration_ms: 0,
      execution_count: 0,
      created_by: ADMIN_ACTIVE.id,
      ...overrides,
    }),
  );
}

/** Helper to create a log */
async function createLog(
  dataSource: DataSource,
  pipelineId: string,
  overrides: Partial<EtlPipelineLog> = {},
): Promise<EtlPipelineLog> {
  const repo = dataSource.getRepository(EtlPipelineLog);
  return repo.save(
    repo.create({
      pipeline_id: pipelineId,
      version: 1,
      status: 'completed',
      started_at: new Date(),
      triggered_by: 'manual',
      is_test_run: false,
      processed_count: 0,
      created_by: ADMIN_ACTIVE.id,
      ...overrides,
    }),
  );
}

describe('F035: ETL Pipeline Dashboard E2E', () => {
  let app: INestApplication;
  let adminToken: string;
  let userToken: string;
  let dataSource: DataSource;

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAdminToken(app);
    userToken = await getUserToken(app);
    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(async () => {
    await cleanPipelineData(dataSource);
  });

  // =========================================================
  // TS-F035-001: Stats card values correct
  // =========================================================
  it('TS-F035-001: should return correct stats card values', async () => {
    const { todayStartUTC } = todayInTaipei();
    const todayMorning = new Date(todayStartUTC.getTime() + 2 * 60 * 60 * 1000);

    // PL_ACTIVE x 3
    const pa1 = await createPipeline(dataSource, { name: 'Active 1', status: 'active' });
    const pa2 = await createPipeline(dataSource, { name: 'Active 2', status: 'active' });
    const pa3 = await createPipeline(dataSource, { name: 'Active 3', status: 'active' });
    // PL_RUNNING x 2
    await createPipeline(dataSource, { name: 'Running 1', status: 'running' });
    await createPipeline(dataSource, { name: 'Running 2', status: 'running' });
    // PL_DRAFT x 1
    await createPipeline(dataSource, { name: 'Draft 1', status: 'draft' });

    // LOG_TODAY_SUCCESS x 8
    for (let i = 0; i < 8; i++) {
      await createLog(dataSource, pa1.id, {
        status: 'completed',
        is_test_run: false,
        started_at: new Date(todayMorning.getTime() + i * 60000),
        finished_at: new Date(todayMorning.getTime() + i * 60000 + 30000),
        duration_ms: 30000,
      });
    }

    // LOG_TODAY_FAILED x 1
    await createLog(dataSource, pa2.id, {
      status: 'failed',
      is_test_run: false,
      started_at: new Date(todayMorning.getTime() + 9 * 60000),
      finished_at: new Date(todayMorning.getTime() + 9 * 60000 + 10000),
      duration_ms: 10000,
      error_message: 'Test error',
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/etl/dashboard/stats')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.totalPipelines).toBe(6);
    expect(res.body.running).toBe(2);
    expect(res.body.todaySuccess).toBe(8);
    expect(res.body.todayFailed).toBe(1);
    expect(res.body.successRate).toBe(88.9);
  });

  // =========================================================
  // TS-F035-002: Success rate formula
  // =========================================================
  it('TS-F035-002: should calculate success rate correctly (75.0)', async () => {
    const { todayStartUTC } = todayInTaipei();
    const todayMorning = new Date(todayStartUTC.getTime() + 2 * 60 * 60 * 1000);

    const p = await createPipeline(dataSource, { name: 'Rate Test' });

    // 3 success
    for (let i = 0; i < 3; i++) {
      await createLog(dataSource, p.id, {
        status: 'completed',
        finished_at: new Date(todayMorning.getTime() + i * 60000),
        is_test_run: false,
      });
    }
    // 1 failed
    await createLog(dataSource, p.id, {
      status: 'failed',
      finished_at: new Date(todayMorning.getTime() + 4 * 60000),
      is_test_run: false,
      error_message: 'err',
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/etl/dashboard/stats')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.successRate).toBe(75.0);
  });

  // =========================================================
  // TS-F035-003: Trend 7d
  // =========================================================
  it('TS-F035-003: should return 7-day trend datapoints', async () => {
    const { todayStartUTC } = todayInTaipei();
    const p = await createPipeline(dataSource, { name: 'Trend Test' });

    // Seed logs for past 10 days
    for (let i = 0; i < 10; i++) {
      const dayStart = new Date(todayStartUTC.getTime() - i * 24 * 60 * 60 * 1000 + 3600000);
      await createLog(dataSource, p.id, {
        status: 'completed',
        started_at: dayStart,
        finished_at: new Date(dayStart.getTime() + 30000),
        duration_ms: 30000,
        is_test_run: false,
      });
    }

    const res = await request(app.getHttpServer())
      .get('/api/v1/etl/dashboard/trend?range=7d')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.datapoints).toBeDefined();
    expect(res.body.datapoints.length).toBe(7);
    for (const dp of res.body.datapoints) {
      expect(dp).toHaveProperty('date');
      expect(dp).toHaveProperty('success');
      expect(dp).toHaveProperty('failed');
    }
  });

  // =========================================================
  // TS-F035-004: Trend 14d
  // =========================================================
  it('TS-F035-004: should return 14-day trend datapoints', async () => {
    const { todayStartUTC } = todayInTaipei();
    const p = await createPipeline(dataSource, { name: 'Trend 14d' });

    for (let i = 0; i < 20; i++) {
      const dayStart = new Date(todayStartUTC.getTime() - i * 24 * 60 * 60 * 1000 + 3600000);
      await createLog(dataSource, p.id, {
        status: 'completed',
        started_at: dayStart,
        finished_at: new Date(dayStart.getTime() + 30000),
        duration_ms: 30000,
        is_test_run: false,
      });
    }

    const res = await request(app.getHttpServer())
      .get('/api/v1/etl/dashboard/trend?range=14d')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.datapoints.length).toBe(14);
  });

  // =========================================================
  // TS-F035-005: Trend 30d
  // =========================================================
  it('TS-F035-005: should return 30-day trend datapoints', async () => {
    const { todayStartUTC } = todayInTaipei();
    const p = await createPipeline(dataSource, { name: 'Trend 30d' });

    for (let i = 0; i < 35; i++) {
      const dayStart = new Date(todayStartUTC.getTime() - i * 24 * 60 * 60 * 1000 + 3600000);
      await createLog(dataSource, p.id, {
        status: 'completed',
        started_at: dayStart,
        finished_at: new Date(dayStart.getTime() + 30000),
        duration_ms: 30000,
        is_test_run: false,
      });
    }

    const res = await request(app.getHttpServer())
      .get('/api/v1/etl/dashboard/trend?range=30d')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.datapoints.length).toBe(30);
  });

  // =========================================================
  // TS-F035-006: Running pipeline progress
  // =========================================================
  it('TS-F035-006: should return running pipeline progress data', async () => {
    const p = await createPipeline(dataSource, { name: 'Running Progress', status: 'running' });

    const nodeLogs = [
      { nodeId: 'n1', nodeName: 'Extract', nodeType: 'extract', status: 'completed', durationMs: 100 },
      { nodeId: 'n2', nodeName: 'NULL 處理', nodeType: 'transform-null', status: 'running', durationMs: 0 },
    ];

    await createLog(dataSource, p.id, {
      status: 'running',
      is_test_run: false,
      processed_count: 500,
      node_logs: JSON.stringify(nodeLogs),
      started_at: new Date(),
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/etl/dashboard/running')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    const item = res.body.data.find((d: any) => d.name === 'Running Progress');
    expect(item).toBeDefined();
    // totalCount = 2 (from node_logs length), processedCount = 500
    // But per spec running API: processedCount=500, totalCount from node_logs
    expect(item.processedCount).toBe(500);
    expect(item.totalCount).toBe(2);
    expect(item.id).toBeDefined();
    expect(item.name).toBe('Running Progress');
    expect(item.startedAt).toBeDefined();
    expect(item.currentNodeName).toBe('NULL 處理');
  });

  // =========================================================
  // TS-F035-007: Today failures list
  // =========================================================
  it('TS-F035-007: should return today failure list with correct fields', async () => {
    const { todayStartUTC } = todayInTaipei();
    const todayMorning = new Date(todayStartUTC.getTime() + 2 * 60 * 60 * 1000);

    const p1 = await createPipeline(dataSource, { name: 'Fail Pipeline A' });
    const p2 = await createPipeline(dataSource, { name: 'Fail Pipeline B' });

    await createLog(dataSource, p1.id, {
      status: 'failed',
      finished_at: new Date(todayMorning.getTime()),
      is_test_run: false,
      error_message: 'Error in Extract',
    });
    await createLog(dataSource, p2.id, {
      status: 'failed',
      finished_at: new Date(todayMorning.getTime() + 60000),
      is_test_run: false,
      error_message: 'Error in Load',
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/etl/dashboard/failures')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2);
    for (const item of res.body.data) {
      expect(item).toHaveProperty('pipelineId');
      expect(item).toHaveProperty('pipelineName');
      expect(item).toHaveProperty('failedAt');
      expect(item).toHaveProperty('errorSummary');
      expect(item).toHaveProperty('logId');
    }
  });

  // =========================================================
  // TS-F035-008: Slowest top 5
  // =========================================================
  it('TS-F035-008: should return top 5 slowest pipelines sorted DESC', async () => {
    // Create 6 pipelines with different duration logs
    const durations = [50000, 40000, 30000, 20000, 10000, 5000];
    const { todayStartUTC } = todayInTaipei();

    for (let i = 0; i < 6; i++) {
      const p = await createPipeline(dataSource, { name: `Slow Pipeline ${i}` });
      // Create 2 completed logs each
      for (let j = 0; j < 2; j++) {
        const startTime = new Date(todayStartUTC.getTime() - 7 * 24 * 60 * 60 * 1000 + i * 100000 + j * 60000);
        await createLog(dataSource, p.id, {
          status: 'completed',
          is_test_run: false,
          started_at: startTime,
          finished_at: new Date(startTime.getTime() + durations[i]),
          duration_ms: durations[i],
        });
      }
    }

    const res = await request(app.getHttpServer())
      .get('/api/v1/etl/dashboard/slowest')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(5);
    // Verify descending order
    expect(res.body.data[0].avgDurationMs).toBe(50000);
    expect(res.body.data[4].avgDurationMs).toBe(10000);
    for (let i = 0; i < 4; i++) {
      expect(res.body.data[i].avgDurationMs).toBeGreaterThanOrEqual(
        res.body.data[i + 1].avgDurationMs,
      );
    }
    // Each item has executionCount
    for (const item of res.body.data) {
      expect(item.executionCount).toBe(2);
    }
  });

  // =========================================================
  // TS-F035-009: RBAC - user cannot access stats
  // =========================================================
  it('TS-F035-009: should return 403 for non-admin user on stats', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/etl/dashboard/stats')
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(403);
  });

  // =========================================================
  // TS-F035-010: RBAC - user cannot access trend
  // =========================================================
  it('TS-F035-010: should return 403 for non-admin user on trend', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/etl/dashboard/trend?range=7d')
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(403);
  });

  // =========================================================
  // TS-F035-011: Invalid range parameter
  // =========================================================
  it('TS-F035-011: should return 422 for invalid range parameter', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/etl/dashboard/trend?range=60d')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(422);
  });

  // =========================================================
  // TS-F035-013: Today timezone boundary
  // =========================================================
  it('TS-F035-013: should correctly handle UTC+8 timezone boundary', async () => {
    const { todayStartUTC } = todayInTaipei();

    const p = await createPipeline(dataSource, { name: 'TZ Test' });

    // Yesterday last second (UTC+8 23:59:59 yesterday = todayStartUTC - 1ms)
    await createLog(dataSource, p.id, {
      status: 'completed',
      finished_at: new Date(todayStartUTC.getTime() - 1000),
      is_test_run: false,
    });

    // Today first second (UTC+8 00:00:01 today = todayStartUTC + 1000ms)
    await createLog(dataSource, p.id, {
      status: 'completed',
      finished_at: new Date(todayStartUTC.getTime() + 1000),
      is_test_run: false,
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/etl/dashboard/stats')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.todaySuccess).toBe(1); // Only the today record
  });

  // =========================================================
  // TS-F035-014: Test runs excluded from trend
  // =========================================================
  it('TS-F035-014: should exclude test runs from trend', async () => {
    const { todayStartUTC } = todayInTaipei();
    const todayMorning = new Date(todayStartUTC.getTime() + 2 * 60 * 60 * 1000);

    const p = await createPipeline(dataSource, { name: 'Test Run Trend' });

    // 3 test runs (should be excluded)
    for (let i = 0; i < 3; i++) {
      await createLog(dataSource, p.id, {
        status: 'completed',
        is_test_run: true,
        started_at: new Date(todayMorning.getTime() + i * 60000),
        finished_at: new Date(todayMorning.getTime() + i * 60000 + 10000),
        duration_ms: 10000,
      });
    }
    // 2 real runs
    for (let i = 0; i < 2; i++) {
      await createLog(dataSource, p.id, {
        status: 'completed',
        is_test_run: false,
        started_at: new Date(todayMorning.getTime() + (i + 3) * 60000),
        finished_at: new Date(todayMorning.getTime() + (i + 3) * 60000 + 10000),
        duration_ms: 10000,
      });
    }

    const res = await request(app.getHttpServer())
      .get('/api/v1/etl/dashboard/trend?range=7d')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    // Find today's datapoint
    const taipeiOffset = 8 * 60 * 60 * 1000;
    const taipeiNow = new Date(new Date().getTime() + taipeiOffset);
    const todayStr = taipeiNow.toISOString().split('T')[0];
    const todayDp = res.body.datapoints.find((dp: any) => dp.date === todayStr);
    expect(todayDp).toBeDefined();
    expect(todayDp.success).toBe(2); // Excludes 3 test runs
  });

  // =========================================================
  // TS-F035-015: Test runs excluded from slowest
  // =========================================================
  it('TS-F035-015: should exclude test-only pipelines from slowest', async () => {
    // Pipeline with only test runs (should be excluded)
    const testOnlyPipeline = await createPipeline(dataSource, { name: 'Test Only Pipeline' });
    await createLog(dataSource, testOnlyPipeline.id, {
      status: 'completed',
      is_test_run: true,
      duration_ms: 999999,
      finished_at: new Date(),
    });

    // 5 real pipelines
    for (let i = 0; i < 5; i++) {
      const p = await createPipeline(dataSource, { name: `Real Pipeline ${i}` });
      await createLog(dataSource, p.id, {
        status: 'completed',
        is_test_run: false,
        duration_ms: (i + 1) * 10000,
        finished_at: new Date(),
      });
    }

    const res = await request(app.getHttpServer())
      .get('/api/v1/etl/dashboard/slowest')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(5);
    const names = res.body.data.map((d: any) => d.pipelineName);
    expect(names).not.toContain('Test Only Pipeline');
  });

  // =========================================================
  // TS-F035-016: Running progress totalCount=0
  // =========================================================
  it('TS-F035-016: should return progressPercent=0 when totalCount=0', async () => {
    const p = await createPipeline(dataSource, { name: 'Zero Progress', status: 'running' });
    await createLog(dataSource, p.id, {
      status: 'running',
      is_test_run: false,
      processed_count: 0,
      node_logs: JSON.stringify([]),
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/etl/dashboard/running')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const item = res.body.data.find((d: any) => d.name === 'Zero Progress');
    expect(item).toBeDefined();
    expect(item.progressPercent).toBe(0.0);
    expect(item.totalCount).toBe(0);
  });

  // =========================================================
  // TS-F035-017: No failures today
  // =========================================================
  it('TS-F035-017: should return empty array when no failures today', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/etl/dashboard/failures')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  // =========================================================
  // TS-F035-018: Empty state (no pipelines or logs)
  // =========================================================
  it('TS-F035-018: should return empty state when no data exists', async () => {
    const [statsRes, runningRes, failuresRes, slowestRes] = await Promise.all([
      request(app.getHttpServer())
        .get('/api/v1/etl/dashboard/stats')
        .set('Authorization', `Bearer ${adminToken}`),
      request(app.getHttpServer())
        .get('/api/v1/etl/dashboard/running')
        .set('Authorization', `Bearer ${adminToken}`),
      request(app.getHttpServer())
        .get('/api/v1/etl/dashboard/failures')
        .set('Authorization', `Bearer ${adminToken}`),
      request(app.getHttpServer())
        .get('/api/v1/etl/dashboard/slowest')
        .set('Authorization', `Bearer ${adminToken}`),
    ]);

    expect(statsRes.status).toBe(200);
    expect(statsRes.body.totalPipelines).toBe(0);
    expect(statsRes.body.running).toBe(0);
    expect(statsRes.body.todaySuccess).toBe(0);
    expect(statsRes.body.todayFailed).toBe(0);
    expect(statsRes.body.successRate).toBe(0.0);

    expect(runningRes.body.data).toEqual([]);
    expect(failuresRes.body.data).toEqual([]);
    expect(slowestRes.body.data).toEqual([]);
  });

  // =========================================================
  // TS-F035-019: Soft-deleted pipelines excluded
  // =========================================================
  it('TS-F035-019: should exclude soft-deleted pipelines from totalPipelines', async () => {
    await createPipeline(dataSource, { name: 'Active A' });
    await createPipeline(dataSource, { name: 'Active B' });
    await createPipeline(dataSource, {
      name: 'Deleted 1',
      deleted_at: new Date(),
    });
    await createPipeline(dataSource, {
      name: 'Deleted 2',
      deleted_at: new Date(),
    });
    await createPipeline(dataSource, {
      name: 'Deleted 3',
      deleted_at: new Date(),
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/etl/dashboard/stats')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.totalPipelines).toBe(2);
  });

  // =========================================================
  // TS-F035-020: No logs → successRate=0
  // =========================================================
  it('TS-F035-020: should return successRate=0 when no logs exist', async () => {
    await createPipeline(dataSource, { name: 'No Logs Pipeline' });

    const res = await request(app.getHttpServer())
      .get('/api/v1/etl/dashboard/stats')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.successRate).toBe(0.0);
  });
});
