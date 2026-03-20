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

// =============================================
// F028: 建立 Pipeline E2E
// =============================================

describe('F028: Create Pipeline E2E', () => {
  let app: INestApplication;
  let adminToken: string;
  let userToken: string;
  let dataSource: DataSource;
  let pipelineRepo: Repository<EtlPipeline>;
  let versionRepo: Repository<EtlPipelineVersion>;
  let logRepo: Repository<EtlPipelineLog>;

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAdminToken(app);
    userToken = await getUserToken(app);
    dataSource = app.get(DataSource);
    pipelineRepo = dataSource.getRepository(EtlPipeline);
    versionRepo = dataSource.getRepository(EtlPipelineVersion);
    logRepo = dataSource.getRepository(EtlPipelineLog);
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(async () => {
    await versionRepo.createQueryBuilder().delete().from(EtlPipelineVersion).execute();
    await logRepo.createQueryBuilder().delete().from(EtlPipelineLog).execute();
    await pipelineRepo.createQueryBuilder().delete().from(EtlPipeline).execute();
  });

  // TS-F028-001: 成功建立 Pipeline（含排程）
  it('TS-F028-001: should create pipeline with schedule', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/etl/pipelines')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: '客戶資料同步', description: '每日同步', schedule: '0 2 * * *' });

    expect(res.status).toBe(201);
    expect(res.body.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.body.name).toBe('客戶資料同步');
    expect(res.body.status).toBe('draft');
    expect(res.body.version).toBe(1);
    expect(res.body.enabled).toBe(false);
    expect(res.body.stepCount).toBe(0);
    expect(res.body.schedule).toBe('0 2 * * *');
    expect(res.body.createdBy).toBe(ADMIN_ACTIVE.id);
    expect(res.body.createdAt).toBeDefined();
    expect(res.body.updatedAt).toBeDefined();
  });

  // TS-F028-002: 成功建立 Pipeline（不含排程）
  it('TS-F028-002: should create pipeline without schedule', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/etl/pipelines')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: '無排程Pipeline', description: null });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('draft');
    expect(res.body.version).toBe(1);
    expect(res.body.enabled).toBe(false);
    expect(res.body.schedule).toBeNull();
  });

  // TS-F028-003: 成功建立後同步建立 EtlPipelineVersion v1
  it('TS-F028-003: should create initial EtlPipelineVersion v1', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/etl/pipelines')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: '版本測試Pipeline' });

    expect(res.status).toBe(201);

    const versions = await versionRepo.find({ where: { pipeline_id: res.body.id } });
    expect(versions).toHaveLength(1);
    expect(versions[0].version).toBe(1);
    expect(versions[0].status).toBe('draft');
    expect(versions[0].pipeline_id).toBe(res.body.id);
    expect(versions[0].created_by).toBe(ADMIN_ACTIVE.id);
  });

  // TS-F028-004: EtlPipelineVersion 初始 definition 為空結構
  it('TS-F028-004: initial version definition should be empty structure', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/etl/pipelines')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Definition測試' });

    expect(res.status).toBe(201);

    const versions = await versionRepo.find({ where: { pipeline_id: res.body.id } });
    expect(versions[0].definition).toEqual({ nodes: [], edges: [] });
  });

  // TS-F028-005: createdBy 記錄建立者 ID
  it('TS-F028-005: createdBy should match admin user ID', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/etl/pipelines')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: '建立者測試' });

    expect(res.status).toBe(201);
    expect(res.body.createdBy).toBe(ADMIN_ACTIVE.id);

    const pipeline = await pipelineRepo.findOne({ where: { id: res.body.id } });
    expect(pipeline!.created_by).toBe(ADMIN_ACTIVE.id);
  });

  // TS-F028-006: 名稱重複 → 409
  it('TS-F028-006: duplicate name should return 409', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/etl/pipelines')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: '重複名稱' });

    const res = await request(app.getHttpServer())
      .post('/api/v1/etl/pipelines')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: '重複名稱' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('PIPELINE_NAME_EXISTS');

    const count = await pipelineRepo
      .createQueryBuilder('p')
      .where('p.name = :name', { name: '重複名稱' })
      .andWhere('p.deleted_at IS NULL')
      .getCount();
    expect(count).toBe(1);
  });

  // TS-F028-007: 軟刪除後名稱可重用
  it('TS-F028-007: soft-deleted pipeline name should be reusable', async () => {
    // Create a soft-deleted pipeline directly in DB
    const softDeleted = pipelineRepo.create({
      name: '舊Pipeline',
      version: 1,
      step_count: 0,
      status: 'draft',
      enabled: false,
      created_by: ADMIN_ACTIVE.id,
      processed_count: 0,
      deleted_at: new Date(),
    });
    await pipelineRepo.save(softDeleted);

    const res = await request(app.getHttpServer())
      .post('/api/v1/etl/pipelines')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: '舊Pipeline' });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('舊Pipeline');
  });

  // TS-F028-008: 名稱空白 → 422
  it('TS-F028-008: empty name should return 422', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/etl/pipelines')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: '' });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  // TS-F028-009: 名稱缺失（key 未提供）→ 422
  it('TS-F028-009: missing name key should return 422', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/etl/pipelines')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ description: '無名稱' });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  // TS-F028-010: 非法 Cron 表達式 → 422
  it('TS-F028-010: invalid cron should return 422', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/etl/pipelines')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Cron錯誤', schedule: '99 99 99 99 99' });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('VALIDATION_INVALID_CRON');
  });

  // TS-F028-011: User 角色無權建立 → 403
  it('TS-F028-011: user role should get 403', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/etl/pipelines')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ name: 'User建立測試' });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('AUTH_FORBIDDEN');
  });

  // TS-F028-012: 未登入（無 Token）→ 401
  it('TS-F028-012: no token should return 401', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/etl/pipelines')
      .send({ name: '未登入測試' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('AUTH_TOKEN_MISSING');
  });

  // TS-F028-013: 名稱長度 255 字元（邊界值，接受）
  it('TS-F028-013: name with 255 chars should be accepted', async () => {
    const longName = 'A'.repeat(255);
    const res = await request(app.getHttpServer())
      .post('/api/v1/etl/pipelines')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: longName });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe(longName);
    expect(res.body.name.length).toBe(255);
  });

  // TS-F028-014: 名稱長度 256 字元（超出上限，拒絕）
  it('TS-F028-014: name with 256 chars should return 422', async () => {
    const tooLongName = 'A'.repeat(256);
    const res = await request(app.getHttpServer())
      .post('/api/v1/etl/pipelines')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: tooLongName });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  // TS-F028-015: Cron 5 欄位標準格式（合法）
  it('TS-F028-015: 5-field cron should be accepted', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/etl/pipelines')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Cron5欄位', schedule: '0 2 * * *' });

    expect(res.status).toBe(201);
    expect(res.body.schedule).toBe('0 2 * * *');
  });

  // TS-F028-016: Cron 6 欄位擴充格式（合法）
  it('TS-F028-016: 6-field cron should be accepted', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/etl/pipelines')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Cron6欄位', schedule: '0 0 2 * * *' });

    expect(res.status).toBe(201);
    expect(res.body.schedule).toBe('0 0 2 * * *');
  });

  // TS-F028-017: Cron 4 欄位（不合法格式，拒絕）
  it('TS-F028-017: 4-field cron should return 422', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/etl/pipelines')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Cron4欄位', schedule: '2 * * *' });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('VALIDATION_INVALID_CRON');
  });
});
