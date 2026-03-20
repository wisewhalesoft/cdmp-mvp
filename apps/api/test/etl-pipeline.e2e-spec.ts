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
import { CONNECTION_TESTER } from '@/modules/datasource/connection-tester.provider';
import { EXTRACTION_EXECUTOR } from '@/modules/extraction-task/extraction-executor.provider';
import { HashUtil } from '@/common/hash/hash.util';
import { EtlPipelineService } from '@/modules/etl/etl-pipeline.service';
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
          EtlPipeline, EtlPipelineLog,
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

/** Helper to create a pipeline directly in DB */
async function createPipeline(
  repo: Repository<EtlPipeline>,
  overrides: Partial<EtlPipeline> = {},
): Promise<EtlPipeline> {
  const pipeline = repo.create({
    name: `Pipeline-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    version: 1,
    step_count: 0,
    status: 'draft',
    enabled: false,
    created_by: ADMIN_ACTIVE.id,
    processed_count: 0,
    ...overrides,
  });
  return repo.save(pipeline);
}

describe('F027: Pipeline List E2E', () => {
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
    // Clean up pipelines and logs before each test
    await logRepo.createQueryBuilder().delete().from(EtlPipelineLog).execute();
    await pipelineRepo.createQueryBuilder().delete().from(EtlPipeline).execute();
  });

  // ========== Iteration 2: Stats API ==========

  // TS-F027-001: 統計卡片基本正確性
  it('TS-F027-001: should return correct pipeline stats', async () => {
    // Create: PL_DRAFT x2, PL_ACTIVE x3, PL_RUNNING x1, PL_FAILED x1, PL_DISABLED x1
    await Promise.all([
      createPipeline(pipelineRepo, { status: 'draft', enabled: false }),
      createPipeline(pipelineRepo, { status: 'draft', enabled: false }),
      createPipeline(pipelineRepo, { status: 'active', enabled: true }),
      createPipeline(pipelineRepo, { status: 'active', enabled: true }),
      createPipeline(pipelineRepo, { status: 'active', enabled: true }),
      createPipeline(pipelineRepo, { status: 'running', enabled: true }),
      createPipeline(pipelineRepo, { status: 'failed', enabled: true }),
      createPipeline(pipelineRepo, { status: 'disabled', enabled: false }),
    ]);

    const res = await request(app.getHttpServer())
      .get('/api/v1/etl/pipelines/stats')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(8);
    expect(res.body.draft).toBe(2);
    expect(res.body.active).toBe(3);
    expect(res.body.running).toBe(1);
    expect(typeof res.body.todayProcessed).toBe('number');
    expect(res.body.todayProcessed).toBeGreaterThanOrEqual(0);
  });

  // TS-F027-017: 軟刪除 Pipeline 不計入統計
  it('TS-F027-017: soft-deleted pipelines should not be counted in stats', async () => {
    await Promise.all([
      createPipeline(pipelineRepo, { status: 'active', enabled: true }),
      createPipeline(pipelineRepo, { status: 'active', enabled: true }),
      createPipeline(pipelineRepo, { status: 'active', enabled: true, deleted_at: new Date() }),
      createPipeline(pipelineRepo, { status: 'active', enabled: true, deleted_at: new Date() }),
      createPipeline(pipelineRepo, { status: 'active', enabled: true, deleted_at: new Date() }),
    ]);

    const res = await request(app.getHttpServer())
      .get('/api/v1/etl/pipelines/stats')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.active).toBe(2);
  });

  // TS-F027-018: todayProcessed 時區邊界（UTC+8）
  it('TS-F027-018: todayProcessed should only count today (UTC+8) records', async () => {
    const { todayStartUTC } = todayInTaipei();

    const pipeline = await createPipeline(pipelineRepo, { status: 'active', enabled: true });

    // Log today (within UTC+8 today range) - 5 minutes after today start
    const todayLog = logRepo.create({
      pipeline_id: pipeline.id,
      version: 1,
      status: 'completed',
      started_at: new Date(todayStartUTC.getTime() + 5 * 60 * 1000),
      finished_at: new Date(todayStartUTC.getTime() + 10 * 60 * 1000),
      processed_count: 100,
      triggered_by: 'manual',
      is_test_run: false,
      created_by: ADMIN_ACTIVE.id,
    });
    await logRepo.save(todayLog);

    // Log yesterday (1 second before today start in UTC+8)
    const yesterdayLog = logRepo.create({
      pipeline_id: pipeline.id,
      version: 1,
      status: 'completed',
      started_at: new Date(todayStartUTC.getTime() - 1000),
      finished_at: new Date(todayStartUTC.getTime() - 500),
      processed_count: 50,
      triggered_by: 'schedule',
      is_test_run: false,
      created_by: ADMIN_ACTIVE.id,
    });
    await logRepo.save(yesterdayLog);

    const res = await request(app.getHttpServer())
      .get('/api/v1/etl/pipelines/stats')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.todayProcessed).toBe(100); // Only today's, not yesterday's 50
  });

  // TS-F027-022: 統計卡片全為零（空系統）
  it('TS-F027-022: stats should all be zero when no pipelines exist', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/etl/pipelines/stats')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
    expect(res.body.active).toBe(0);
    expect(res.body.running).toBe(0);
    expect(res.body.draft).toBe(0);
    expect(res.body.todayProcessed).toBe(0);
  });

  // ========== Iteration 3: List API ==========

  // TS-F027-002: 列表基本查詢與欄位完整性
  it('TS-F027-002: should return pipeline list with all required fields', async () => {
    const now = new Date();
    await createPipeline(pipelineRepo, {
      name: 'Draft Pipeline',
      status: 'draft',
      version: 1,
      step_count: 3,
      schedule: '0 2 * * *',
      last_execution_at: now,
      next_execution_at: new Date(now.getTime() + 86400000),
      processed_count: 42,
      created_at: new Date(now.getTime() - 3000),
    });
    await createPipeline(pipelineRepo, {
      name: 'Active Pipeline',
      status: 'active',
      enabled: true,
      created_at: new Date(now.getTime() - 2000),
    });
    await createPipeline(pipelineRepo, {
      name: 'Running Pipeline',
      status: 'running',
      enabled: true,
      created_at: new Date(now.getTime() - 1000),
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/etl/pipelines')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(3);

    // Check all required fields
    for (const item of res.body.data) {
      expect(item).toHaveProperty('id');
      expect(item).toHaveProperty('name');
      expect(item).toHaveProperty('version');
      expect(item).toHaveProperty('stepCount');
      expect(item).toHaveProperty('status');
      expect(item).toHaveProperty('schedule');
      expect(item).toHaveProperty('lastExecutionAt');
      expect(item).toHaveProperty('nextExecutionAt');
      expect(item).toHaveProperty('processedCount');
      expect(item).toHaveProperty('createdBy');
      expect(item).toHaveProperty('createdAt');
    }

    // Check field types for the first item (Draft Pipeline should be last since DESC)
    const draftItem = res.body.data.find((d: any) => d.name === 'Draft Pipeline');
    expect(typeof draftItem.id).toBe('string');
    expect(typeof draftItem.version).toBe('number');
    expect(draftItem.version).toBeGreaterThanOrEqual(1);
    expect(typeof draftItem.stepCount).toBe('number');
    expect(['draft', 'active', 'running', 'failed', 'disabled']).toContain(draftItem.status);
    expect(typeof draftItem.processedCount).toBe('number');
    expect(draftItem.createdBy).toBe(ADMIN_ACTIVE.name);

    // Default sort: created_at DESC (most recent first)
    const dates = res.body.data.map((d: any) => new Date(d.createdAt).getTime());
    for (let i = 0; i < dates.length - 1; i++) {
      expect(dates[i]).toBeGreaterThanOrEqual(dates[i + 1]);
    }
  });

  // TS-F027-010: 分頁第一頁（超過 10 筆）
  it('TS-F027-010: should paginate correctly (page 1 of 2)', async () => {
    // Create 15 pipelines
    for (let i = 0; i < 15; i++) {
      await createPipeline(pipelineRepo, { name: `Pipeline ${i}` });
    }

    const res = await request(app.getHttpServer())
      .get('/api/v1/etl/pipelines')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(10);
    expect(res.body.pagination).toEqual({
      page: 1,
      pageSize: 10,
      total: 15,
      totalPages: 2,
    });
  });

  // TS-F027-011: 分頁第二頁（最後一頁不足 10 筆）
  it('TS-F027-011: should paginate correctly (page 2 of 2)', async () => {
    for (let i = 0; i < 15; i++) {
      await createPipeline(pipelineRepo, { name: `Pipeline ${i}` });
    }

    const res = await request(app.getHttpServer())
      .get('/api/v1/etl/pipelines?page=2')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(5);
    expect(res.body.pagination).toEqual({
      page: 2,
      pageSize: 10,
      total: 15,
      totalPages: 2,
    });
  });

  // TS-F027-016: 軟刪除 Pipeline 不出現在列表
  it('TS-F027-016: soft-deleted pipelines should not appear in list', async () => {
    await createPipeline(pipelineRepo, { name: 'Normal Pipeline', status: 'draft' });
    await createPipeline(pipelineRepo, {
      name: 'Deleted Pipeline',
      status: 'active',
      deleted_at: new Date(),
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/etl/pipelines')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe('Normal Pipeline');
    expect(res.body.pagination.total).toBe(1);
  });

  // TS-F027-019: 空狀態（無任何 Pipeline）
  it('TS-F027-019: should return empty data when no pipelines exist', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/etl/pipelines')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.pagination).toEqual({
      page: 1,
      pageSize: 10,
      total: 0,
      totalPages: 0,
    });
  });

  // ========== Iteration 4: Filter & Search ==========

  // TS-F027-003: 狀態篩選（active）
  it('TS-F027-003: should filter by status=active', async () => {
    await createPipeline(pipelineRepo, { status: 'active', enabled: true });
    await createPipeline(pipelineRepo, { status: 'active', enabled: true });
    await createPipeline(pipelineRepo, { status: 'draft' });
    await createPipeline(pipelineRepo, { status: 'running', enabled: true });

    const res = await request(app.getHttpServer())
      .get('/api/v1/etl/pipelines?status=active')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data.every((d: any) => d.status === 'active')).toBe(true);
    expect(res.body.pagination.total).toBe(2);
  });

  // TS-F027-004: 狀態篩選（running）
  it('TS-F027-004: should filter by status=running', async () => {
    await createPipeline(pipelineRepo, { status: 'running', enabled: true });
    await createPipeline(pipelineRepo, { status: 'active', enabled: true });
    await createPipeline(pipelineRepo, { status: 'draft' });

    const res = await request(app.getHttpServer())
      .get('/api/v1/etl/pipelines?status=running')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].status).toBe('running');
  });

  // TS-F027-005: 狀態篩選（draft）
  it('TS-F027-005: should filter by status=draft', async () => {
    await createPipeline(pipelineRepo, { status: 'draft' });
    await createPipeline(pipelineRepo, { status: 'draft' });
    await createPipeline(pipelineRepo, { status: 'draft' });
    await createPipeline(pipelineRepo, { status: 'active', enabled: true });

    const res = await request(app.getHttpServer())
      .get('/api/v1/etl/pipelines?status=draft')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(3);
    expect(res.body.data.every((d: any) => d.status === 'draft')).toBe(true);
  });

  // TS-F027-006: 狀態篩選（failed）
  it('TS-F027-006: should filter by status=failed', async () => {
    await createPipeline(pipelineRepo, { status: 'failed', enabled: true });
    await createPipeline(pipelineRepo, { status: 'active', enabled: true });

    const res = await request(app.getHttpServer())
      .get('/api/v1/etl/pipelines?status=failed')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.every((d: any) => d.status === 'failed')).toBe(true);
  });

  // TS-F027-007: 狀態篩選（disabled）
  it('TS-F027-007: should filter by status=disabled', async () => {
    await createPipeline(pipelineRepo, { status: 'disabled', enabled: false });
    await createPipeline(pipelineRepo, { status: 'disabled', enabled: false });
    await createPipeline(pipelineRepo, { status: 'active', enabled: true });

    const res = await request(app.getHttpServer())
      .get('/api/v1/etl/pipelines?status=disabled')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data.every((d: any) => d.status === 'disabled')).toBe(true);
    expect(res.body.pagination.total).toBe(2);
  });

  // TS-F027-008: 關鍵字搜尋（中文，模糊比對）
  it('TS-F027-008: should search by Chinese keyword (fuzzy match)', async () => {
    await createPipeline(pipelineRepo, { name: '每日客戶同步 Pipeline' });
    await createPipeline(pipelineRepo, { name: '每週庫存 Pipeline' });

    const res = await request(app.getHttpServer())
      .get('/api/v1/etl/pipelines?keyword=客戶')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toContain('客戶');
    expect(res.body.pagination.total).toBe(1);
  });

  // TS-F027-009: 關鍵字搜尋（英文，大小寫不敏感）
  it('TS-F027-009: should search by English keyword (case insensitive)', async () => {
    await createPipeline(pipelineRepo, { name: 'ETL Daily Pipeline' });
    await createPipeline(pipelineRepo, { name: 'Customer Sync' });

    const res = await request(app.getHttpServer())
      .get('/api/v1/etl/pipelines?keyword=etl')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe('ETL Daily Pipeline');
  });

  // TS-F027-020: 篩選無結果時空狀態
  it('TS-F027-020: should return empty when filter has no results', async () => {
    await createPipeline(pipelineRepo, { status: 'draft' });

    const res = await request(app.getHttpServer())
      .get('/api/v1/etl/pipelines?status=active')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.pagination.total).toBe(0);
  });

  // TS-F027-021: 搜尋無結果時空狀態
  it('TS-F027-021: should return empty when search has no results', async () => {
    await createPipeline(pipelineRepo, { name: '每日客戶 Pipeline' });

    const res = await request(app.getHttpServer())
      .get('/api/v1/etl/pipelines?keyword=庫存')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.pagination.total).toBe(0);
  });

  // ========== Iteration 5: RBAC & Error Handling ==========

  // TS-F027-012: User 角色無法查看 Pipeline 列表
  it('TS-F027-012: user role should get 403 on pipeline list', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/etl/pipelines')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('AUTH_FORBIDDEN');
  });

  // TS-F027-013: User 角色無法查看統計卡片
  it('TS-F027-013: user role should get 403 on pipeline stats', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/etl/pipelines/stats')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('AUTH_FORBIDDEN');
  });

  // TS-F027-014: 未攜帶 Token 被拒絕
  it('TS-F027-014: should return 401 when no token provided', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/etl/pipelines');

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('AUTH_TOKEN_MISSING');
  });

  // TS-F027-015: 伺服器錯誤降級
  it('TS-F027-015: should return 500 without stack trace on server error', async () => {
    // We simulate a server error by temporarily breaking the service
    const service = app.get(EtlPipelineService);

    // Save original method
    const originalFindAll = service.findAll.bind(service);

    // Override to throw
    service.findAll = async () => {
      throw new Error('Simulated DB failure');
    };

    const res = await request(app.getHttpServer())
      .get('/api/v1/etl/pipelines')
      .set('Authorization', `Bearer ${adminToken}`);

    // Restore
    service.findAll = originalFindAll;

    expect(res.status).toBe(500);
    // Should not contain stack trace or internal details
    const bodyStr = JSON.stringify(res.body);
    expect(bodyStr).not.toContain('Simulated DB failure');
    expect(bodyStr).not.toContain('stack');
  });
});
