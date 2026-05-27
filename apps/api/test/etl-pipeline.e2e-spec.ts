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
import { ExtractionTask } from '@/database/entities/extraction-task.entity';
import { Datasource } from '@/database/entities/datasource.entity';
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

// =============================================
// F029: 視覺化轉換編輯器（後端 API）E2E
// =============================================

describe('F029: Pipeline Definition Editor E2E', () => {
  let app: INestApplication;
  let adminToken: string;
  let userToken: string;
  let dataSource: DataSource;
  let pipelineRepo: Repository<EtlPipeline>;
  let versionRepo: Repository<EtlPipelineVersion>;
  let logRepo: Repository<EtlPipelineLog>;
  let taskRepo: Repository<ExtractionTask>;
  let dsRepo: Repository<Datasource>;

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAdminToken(app);
    userToken = await getUserToken(app);
    dataSource = app.get(DataSource);
    pipelineRepo = dataSource.getRepository(EtlPipeline);
    versionRepo = dataSource.getRepository(EtlPipelineVersion);
    logRepo = dataSource.getRepository(EtlPipelineLog);
    taskRepo = dataSource.getRepository(ExtractionTask);
    dsRepo = dataSource.getRepository(Datasource);
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(async () => {
    await versionRepo.createQueryBuilder().delete().from(EtlPipelineVersion).execute();
    await logRepo.createQueryBuilder().delete().from(EtlPipelineLog).execute();
    await pipelineRepo.createQueryBuilder().delete().from(EtlPipeline).execute();
  });

  /** Helper: create pipeline + version v1 via API */
  async function createPipelineViaApi(name?: string): Promise<{ id: string }> {
    const res = await request(app.getHttpServer())
      .post('/api/v1/etl/pipelines')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: name ?? `Pipeline-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` });
    return { id: res.body.id };
  }

  // ========== Positive: GET definition ==========

  // TS-F029-001: 取得空定義（初始狀態）
  it('TS-F029-001: should return empty definition for newly created pipeline', async () => {
    const { id } = await createPipelineViaApi('空定義Pipeline');

    const res = await request(app.getHttpServer())
      .get(`/api/v1/etl/pipelines/${id}/definition`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.versionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.body.version).toBe(1);
    expect(res.body.status).toBe('draft');
    expect(res.body.definition.nodes).toEqual([]);
    expect(res.body.definition.edges).toEqual([]);
  });

  // TS-F029-002: 取得含節點與連線的定義
  it('TS-F029-002: should return saved definition with nodes and edges', async () => {
    const { id } = await createPipelineViaApi('含定義Pipeline');

    // Save a definition first
    const definition = {
      nodes: [
        { id: 'node-ext-1', type: 'extract', position: { x: 100, y: 200 }, data: { rawTableId: '00000000-0000-0000-0000-000000000001', rawTableName: 'raw_a3f2c1d4', taskName: '每日客戶同步' } },
        { id: 'node-filter-1', type: 'transform-filter', position: { x: 350, y: 200 }, data: { logic: 'AND', conditions: [{ column: 'age', operator: '>', value: '18' }] } },
        { id: 'node-load-1', type: 'load', position: { x: 600, y: 200 }, data: { targetTable: 'customer_core', fieldMappings: [] } },
      ],
      edges: [
        { id: 'edge-1', source: 'node-ext-1', target: 'node-filter-1' },
        { id: 'edge-2', source: 'node-filter-1', target: 'node-load-1' },
      ],
    };

    await request(app.getHttpServer())
      .put(`/api/v1/etl/pipelines/${id}/definition`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ definition });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/etl/pipelines/${id}/definition`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.definition.nodes).toHaveLength(3);
    expect(res.body.definition.edges).toHaveLength(2);
    // Verify Extract node data
    const extNode = res.body.definition.nodes.find((n: any) => n.type === 'extract');
    expect(extNode.data.rawTableId).toBe('00000000-0000-0000-0000-000000000001');
    // Verify Filter node data
    const filterNode = res.body.definition.nodes.find((n: any) => n.type === 'transform-filter');
    expect(filterNode.data.logic).toBe('AND');
    expect(filterNode.data.conditions).toHaveLength(1);
  });

  // ========== Positive: PUT definition ==========

  // TS-F029-003: 儲存空定義（草稿允許）
  it('TS-F029-003: should save empty definition (draft allows)', async () => {
    const { id } = await createPipelineViaApi('空定義儲存');

    const res = await request(app.getHttpServer())
      .put(`/api/v1/etl/pipelines/${id}/definition`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ definition: { nodes: [], edges: [] } });

    expect(res.status).toBe(200);
    expect(res.body.stepCount).toBe(0);
    expect(res.body.message).toBe('Pipeline 定義已儲存');

    // DB verification
    const pipeline = await pipelineRepo.findOne({ where: { id } });
    expect(pipeline!.step_count).toBe(0);
  });

  // TS-F029-004: 儲存含節點與連線的定義並更新 step_count
  it('TS-F029-004: should save definition with nodes/edges and update step_count', async () => {
    const { id } = await createPipelineViaApi('含節點儲存');

    const definition = {
      nodes: [
        { id: 'node-ext', type: 'extract', position: { x: 100, y: 200 }, data: {} },
        { id: 'node-tf', type: 'transform-filter', position: { x: 350, y: 200 }, data: { logic: 'AND', conditions: [] } },
        { id: 'node-load', type: 'load', position: { x: 600, y: 200 }, data: { targetTable: 'customer_core' } },
      ],
      edges: [
        { id: 'e1', source: 'node-ext', target: 'node-tf' },
        { id: 'e2', source: 'node-tf', target: 'node-load' },
      ],
    };

    const res = await request(app.getHttpServer())
      .put(`/api/v1/etl/pipelines/${id}/definition`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ definition });

    expect(res.status).toBe(200);
    expect(res.body.stepCount).toBe(3);

    // DB verification
    const pipeline = await pipelineRepo.findOne({ where: { id } });
    expect(pipeline!.step_count).toBe(3);

    const version = await versionRepo.findOne({ where: { pipeline_id: id } });
    expect(version!.definition.nodes).toHaveLength(3);
  });

  // TS-F029-005: 儲存含 changeSummary 的定義
  it('TS-F029-005: should save definition with changeSummary', async () => {
    const { id } = await createPipelineViaApi('changeSummary測試');

    const res = await request(app.getHttpServer())
      .put(`/api/v1/etl/pipelines/${id}/definition`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ definition: { nodes: [], edges: [] }, changeSummary: '清空畫布' });

    expect(res.status).toBe(200);

    const version = await versionRepo.findOne({ where: { pipeline_id: id } });
    expect(version!.change_summary).toBe('清空畫布');
  });

  // TS-F029-006: 儲存含不完整設定的節點（草稿允許）
  it('TS-F029-006: should save incomplete node config (draft allows)', async () => {
    const { id } = await createPipelineViaApi('不完整節點');

    const definition = {
      nodes: [
        { id: 'node-merge', type: 'transform-merge', position: { x: 200, y: 200 }, data: { joinType: 'INNER', leftInput: '', rightInput: '', conditions: [] } },
      ],
      edges: [],
    };

    const res = await request(app.getHttpServer())
      .put(`/api/v1/etl/pipelines/${id}/definition`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ definition });

    expect(res.status).toBe(200);
    expect(res.body.stepCount).toBe(1);
  });

  // TS-F029-007: 覆寫既有定義
  it('TS-F029-007: should overwrite existing definition', async () => {
    const { id } = await createPipelineViaApi('覆寫定義');

    // Save initial definition with 3 nodes
    const initialDef = {
      nodes: [
        { id: 'n1', type: 'extract', position: { x: 100, y: 100 }, data: {} },
        { id: 'n2', type: 'transform-filter', position: { x: 300, y: 100 }, data: { logic: 'AND', conditions: [] } },
        { id: 'n3', type: 'load', position: { x: 500, y: 100 }, data: {} },
      ],
      edges: [
        { id: 'e1', source: 'n1', target: 'n2' },
        { id: 'e2', source: 'n2', target: 'n3' },
      ],
    };

    await request(app.getHttpServer())
      .put(`/api/v1/etl/pipelines/${id}/definition`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ definition: initialDef });

    // Overwrite with 1 node
    const newDef = {
      nodes: [
        { id: 'n-only', type: 'extract', position: { x: 100, y: 100 }, data: {} },
      ],
      edges: [],
    };

    const res = await request(app.getHttpServer())
      .put(`/api/v1/etl/pipelines/${id}/definition`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ definition: newDef });

    expect(res.status).toBe(200);
    expect(res.body.stepCount).toBe(1);

    const pipeline = await pipelineRepo.findOne({ where: { id } });
    expect(pipeline!.step_count).toBe(1);

    const version = await versionRepo.findOne({ where: { pipeline_id: id } });
    expect(version!.definition.nodes).toHaveLength(1);
  });

  // ========== Positive: GET raw-tables ==========

  // TS-F029-008: 取得可用 raw data 表清單
  it('TS-F029-008: should return raw tables list', async () => {
    // Create a datasource
    const ds = dsRepo.create({
      name: 'TestDS',
      type: 'postgresql',
      host: 'localhost',
      port: 5432,
      database_name: 'testdb',
      username: 'user',
      encrypted_password: 'enc',
      status: 'connected',
      created_by: ADMIN_ACTIVE.id,
    });
    const savedDs = await dsRepo.save(ds);

    // Create extraction tasks with raw_table_name
    const task1 = taskRepo.create({
      name: '每日客戶同步',
      datasource_id: savedDs.id,
      mode: 'full',
      source_table: 'customers',
      schedule: '0 2 * * *',
      raw_table_name: 'raw_a3f2c1d4',
      status: 'completed',
      created_by: ADMIN_ACTIVE.id,
      last_execution_at: new Date(),
    });
    const task2 = taskRepo.create({
      name: '訂單同步',
      datasource_id: savedDs.id,
      mode: 'full',
      source_table: 'orders',
      schedule: '0 3 * * *',
      raw_table_name: 'raw_b4e3d2c5',
      status: 'completed',
      created_by: ADMIN_ACTIVE.id,
      last_execution_at: new Date(),
    });
    await taskRepo.save([task1, task2]);

    const res = await request(app.getHttpServer())
      .get('/api/v1/extraction-tasks/raw-tables')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    for (const item of res.body.data) {
      expect(item).toHaveProperty('taskId');
      expect(item).toHaveProperty('taskName');
      expect(item).toHaveProperty('rawTableName');
      expect(item).toHaveProperty('datasourceName');
      expect(item).toHaveProperty('sourceTable');
      expect(item).toHaveProperty('lastExecutionAt');
      expect(item).toHaveProperty('status');
    }

    // Cleanup
    await taskRepo.createQueryBuilder().delete().from(ExtractionTask).execute();
    await dsRepo.delete(savedDs.id);
  });

  // TS-F029-009: 空 raw data 清單
  it('TS-F029-009: should return empty raw tables list when no tasks', async () => {
    // Ensure no tasks with raw_table_name exist
    await taskRepo.createQueryBuilder().delete().from(ExtractionTask).execute();

    const res = await request(app.getHttpServer())
      .get('/api/v1/extraction-tasks/raw-tables')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  // ========== Negative: Connection Validation ==========

  // TS-F029-010: 非法連線 Load → Extract
  it('TS-F029-010: should reject Load -> Extract connection', async () => {
    const { id } = await createPipelineViaApi('非法連線LtoE');

    const definition = {
      nodes: [
        { id: 'node-load', type: 'load', position: { x: 100, y: 100 }, data: {} },
        { id: 'node-extract', type: 'extract', position: { x: 300, y: 100 }, data: {} },
      ],
      edges: [
        { id: 'e1', source: 'node-load', target: 'node-extract' },
      ],
    };

    const res = await request(app.getHttpServer())
      .put(`/api/v1/etl/pipelines/${id}/definition`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ definition });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('PIPELINE_INVALID_CONNECTION');
    expect(res.body.message).toContain('連線規則違反');
  });

  // TS-F029-011: 非法連線 Load → Transform
  it('TS-F029-011: should reject Load -> Transform connection', async () => {
    const { id } = await createPipelineViaApi('非法連線LtoT');

    const definition = {
      nodes: [
        { id: 'node-load', type: 'load', position: { x: 100, y: 100 }, data: {} },
        { id: 'node-tf', type: 'transform-filter', position: { x: 300, y: 100 }, data: {} },
      ],
      edges: [
        { id: 'e1', source: 'node-load', target: 'node-tf' },
      ],
    };

    const res = await request(app.getHttpServer())
      .put(`/api/v1/etl/pipelines/${id}/definition`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ definition });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('PIPELINE_INVALID_CONNECTION');
  });

  // TS-F029-012: 非法連線 Extract → Load（跳過 Transform）
  it('TS-F029-012: should reject Extract -> Load (skipping Transform)', async () => {
    const { id } = await createPipelineViaApi('非法連線EtoL');

    const definition = {
      nodes: [
        { id: 'node-ext', type: 'extract', position: { x: 100, y: 100 }, data: {} },
        { id: 'node-load', type: 'load', position: { x: 300, y: 100 }, data: {} },
      ],
      edges: [
        { id: 'e1', source: 'node-ext', target: 'node-load' },
      ],
    };

    const res = await request(app.getHttpServer())
      .put(`/api/v1/etl/pipelines/${id}/definition`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ definition });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('PIPELINE_INVALID_CONNECTION');
  });

  // TS-F029-013: 非法連線（循環連線）
  it('TS-F029-013: should reject cyclic connections', async () => {
    const { id } = await createPipelineViaApi('循環連線');

    const definition = {
      nodes: [
        { id: 'node-a', type: 'transform-filter', position: { x: 100, y: 100 }, data: {} },
        { id: 'node-b', type: 'transform-field-mapping', position: { x: 300, y: 100 }, data: {} },
      ],
      edges: [
        { id: 'e1', source: 'node-a', target: 'node-b' },
        { id: 'e2', source: 'node-b', target: 'node-a' },
      ],
    };

    const res = await request(app.getHttpServer())
      .put(`/api/v1/etl/pipelines/${id}/definition`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ definition });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('PIPELINE_INVALID_CONNECTION');
  });

  // TS-F029-014: 非法連線 Load → Load
  it('TS-F029-014: should reject Load -> Load connection', async () => {
    const { id } = await createPipelineViaApi('非法連線LtoL');

    const definition = {
      nodes: [
        { id: 'node-load-a', type: 'load', position: { x: 100, y: 100 }, data: {} },
        { id: 'node-load-b', type: 'load', position: { x: 300, y: 100 }, data: {} },
      ],
      edges: [
        { id: 'e1', source: 'node-load-a', target: 'node-load-b' },
      ],
    };

    const res = await request(app.getHttpServer())
      .put(`/api/v1/etl/pipelines/${id}/definition`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ definition });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('PIPELINE_INVALID_CONNECTION');
  });

  // ========== Positive: Valid Connections ==========

  // TS-F029-015: 合法連線 Extract → Transform
  it('TS-F029-015: should accept Extract -> Transform connection', async () => {
    const { id } = await createPipelineViaApi('合法EtoT');

    const definition = {
      nodes: [
        { id: 'node-ext', type: 'extract', position: { x: 100, y: 100 }, data: {} },
        { id: 'node-tf', type: 'transform-filter', position: { x: 300, y: 100 }, data: { logic: 'AND', conditions: [] } },
      ],
      edges: [
        { id: 'e1', source: 'node-ext', target: 'node-tf' },
      ],
    };

    const res = await request(app.getHttpServer())
      .put(`/api/v1/etl/pipelines/${id}/definition`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ definition });

    expect(res.status).toBe(200);
    expect(res.body.stepCount).toBe(2);
  });

  // TS-F029-016: 合法連線 Transform → Transform
  it('TS-F029-016: should accept Transform -> Transform connection', async () => {
    const { id } = await createPipelineViaApi('合法TtoT');

    const definition = {
      nodes: [
        { id: 'node-tf1', type: 'transform-filter', position: { x: 100, y: 100 }, data: {} },
        { id: 'node-tf2', type: 'transform-field-mapping', position: { x: 300, y: 100 }, data: {} },
      ],
      edges: [
        { id: 'e1', source: 'node-tf1', target: 'node-tf2' },
      ],
    };

    const res = await request(app.getHttpServer())
      .put(`/api/v1/etl/pipelines/${id}/definition`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ definition });

    expect(res.status).toBe(200);
    expect(res.body.stepCount).toBe(2);
  });

  // TS-F029-017: 合法連線 Transform → Load
  it('TS-F029-017: should accept Transform -> Load connection', async () => {
    const { id } = await createPipelineViaApi('合法TtoL');

    const definition = {
      nodes: [
        { id: 'node-tf', type: 'transform-masking', position: { x: 100, y: 100 }, data: {} },
        { id: 'node-load', type: 'load', position: { x: 300, y: 100 }, data: {} },
      ],
      edges: [
        { id: 'e1', source: 'node-tf', target: 'node-load' },
      ],
    };

    const res = await request(app.getHttpServer())
      .put(`/api/v1/etl/pipelines/${id}/definition`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ definition });

    expect(res.status).toBe(200);
    expect(res.body.stepCount).toBe(2);
  });

  // ========== Negative: Duplicate Extract Source ==========

  // TS-F029-018: 重複 Extract 來源
  it('TS-F029-018: should reject duplicate Extract source (same rawTableId)', async () => {
    const { id } = await createPipelineViaApi('重複Extract');
    const sameRawTableId = '00000000-0000-0000-0000-000000000099';

    const definition = {
      nodes: [
        { id: 'node-ext-1', type: 'extract', position: { x: 100, y: 100 }, data: { rawTableId: sameRawTableId } },
        { id: 'node-ext-2', type: 'extract', position: { x: 100, y: 300 }, data: { rawTableId: sameRawTableId } },
      ],
      edges: [],
    };

    const res = await request(app.getHttpServer())
      .put(`/api/v1/etl/pipelines/${id}/definition`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ definition });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('PIPELINE_INVALID_CONNECTION');
    expect(res.body.message).toContain('重複來源');
  });

  // ========== Transform JSONB Structure Tests ==========

  // TS-F029-019: transform-merge JSONB 結構儲存與還原
  it('TS-F029-019: should save and restore transform-merge JSONB structure', async () => {
    const { id } = await createPipelineViaApi('Merge結構');

    const mergeData = {
      joinType: 'INNER',
      leftInput: 'node-a',
      rightInput: 'node-b',
      conditions: [{ leftColumn: 'id', rightColumn: 'customer_id', operator: '=' }],
    };

    const definition = {
      nodes: [
        { id: 'node-merge', type: 'transform-merge', position: { x: 200, y: 200 }, data: mergeData },
      ],
      edges: [],
    };

    const putRes = await request(app.getHttpServer())
      .put(`/api/v1/etl/pipelines/${id}/definition`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ definition });
    expect(putRes.status).toBe(200);

    const getRes = await request(app.getHttpServer())
      .get(`/api/v1/etl/pipelines/${id}/definition`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(getRes.status).toBe(200);
    const node = getRes.body.definition.nodes[0];
    expect(node.data.joinType).toBe('INNER');
    expect(node.data.leftInput).toBe('node-a');
    expect(node.data.rightInput).toBe('node-b');
    expect(node.data.conditions[0].operator).toBe('=');
  });

  // TS-F029-020: transform-filter JSONB 結構儲存與還原
  it('TS-F029-020: should save and restore transform-filter JSONB structure', async () => {
    const { id } = await createPipelineViaApi('Filter結構');

    const filterData = {
      logic: 'AND',
      conditions: [{ column: 'age', operator: '>', value: '18' }],
    };

    const definition = {
      nodes: [
        { id: 'node-filter', type: 'transform-filter', position: { x: 200, y: 200 }, data: filterData },
      ],
      edges: [],
    };

    const putRes = await request(app.getHttpServer())
      .put(`/api/v1/etl/pipelines/${id}/definition`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ definition });
    expect(putRes.status).toBe(200);

    const getRes = await request(app.getHttpServer())
      .get(`/api/v1/etl/pipelines/${id}/definition`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(getRes.status).toBe(200);
    const node = getRes.body.definition.nodes[0];
    expect(node.data.logic).toBe('AND');
    expect(node.data.conditions[0].column).toBe('age');
  });

  // TS-F029-021: transform-masking JSONB 結構儲存與還原
  it('TS-F029-021: should save and restore transform-masking JSONB structure', async () => {
    const { id } = await createPipelineViaApi('Masking結構');

    const maskingData = {
      rules: [{
        column: 'national_id',
        method: 'partial_mask',
        maskPattern: '***-****-{last4}',
        visibleStart: 0,
        visibleEnd: 4,
      }],
    };

    const definition = {
      nodes: [
        { id: 'node-mask', type: 'transform-masking', position: { x: 200, y: 200 }, data: maskingData },
      ],
      edges: [],
    };

    const putRes = await request(app.getHttpServer())
      .put(`/api/v1/etl/pipelines/${id}/definition`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ definition });
    expect(putRes.status).toBe(200);

    const getRes = await request(app.getHttpServer())
      .get(`/api/v1/etl/pipelines/${id}/definition`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(getRes.status).toBe(200);
    const node = getRes.body.definition.nodes[0];
    expect(node.data.rules[0].method).toBe('partial_mask');
    expect(node.data.rules[0].maskPattern).toBe('***-****-{last4}');
  });

  // ========== Negative: Pipeline Not Found & RBAC ==========

  // TS-F029-022: GET Pipeline 不存在 → 404
  it('TS-F029-022: GET definition for non-existent pipeline should return 404', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/etl/pipelines/00000000-0000-0000-0000-000000000000/definition')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('PIPELINE_NOT_FOUND');
    expect(res.body.message).toBe('找不到指定的 Pipeline');
  });

  // TS-F029-023: PUT Pipeline 不存在 → 404
  it('TS-F029-023: PUT definition for non-existent pipeline should return 404', async () => {
    const res = await request(app.getHttpServer())
      .put('/api/v1/etl/pipelines/00000000-0000-0000-0000-000000000000/definition')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ definition: { nodes: [], edges: [] } });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('PIPELINE_NOT_FOUND');
  });

  // TS-F029-024: User 角色無權呼叫 GET definition → 403
  it('TS-F029-024: user role should get 403 on GET definition', async () => {
    const { id } = await createPipelineViaApi('RBAC測試GET');

    const res = await request(app.getHttpServer())
      .get(`/api/v1/etl/pipelines/${id}/definition`)
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('AUTH_FORBIDDEN');
  });

  // TS-F029-025: User 角色無權呼叫 PUT definition → 403
  it('TS-F029-025: user role should get 403 on PUT definition', async () => {
    const { id } = await createPipelineViaApi('RBAC測試PUT');

    const res = await request(app.getHttpServer())
      .put(`/api/v1/etl/pipelines/${id}/definition`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ definition: { nodes: [], edges: [] } });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('AUTH_FORBIDDEN');
  });

  // TS-F029-026: 未登入（無 Token）→ 401
  it('TS-F029-026: no token should return 401', async () => {
    const res = await request(app.getHttpServer())
      .put('/api/v1/etl/pipelines/00000000-0000-0000-0000-000000000000/definition')
      .send({ definition: { nodes: [], edges: [] } });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('AUTH_TOKEN_MISSING');
  });

  // ========== Boundary Scenarios ==========

  // TS-F029-027: changeSummary 500 字元（邊界值，接受）
  it('TS-F029-027: changeSummary with 500 chars should be accepted', async () => {
    const { id } = await createPipelineViaApi('Summary500');

    const res = await request(app.getHttpServer())
      .put(`/api/v1/etl/pipelines/${id}/definition`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ definition: { nodes: [], edges: [] }, changeSummary: 'A'.repeat(500) });

    expect(res.status).toBe(200);

    const version = await versionRepo.findOne({ where: { pipeline_id: id } });
    expect(version!.change_summary!.length).toBe(500);
  });

  // TS-F029-028: changeSummary 501 字元（超出上限，拒絕）
  it('TS-F029-028: changeSummary with 501 chars should return 422', async () => {
    const { id } = await createPipelineViaApi('Summary501');

    const res = await request(app.getHttpServer())
      .put(`/api/v1/etl/pipelines/${id}/definition`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ definition: { nodes: [], edges: [] }, changeSummary: 'A'.repeat(501) });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });
});

// =====================================================
// F034: Delete Pipeline E2E Tests
// =====================================================
describe('F034: Delete Pipeline E2E', () => {
  let app: INestApplication;
  let adminToken: string;
  let userToken: string;
  let dataSource: DataSource;
  let pipelineRepo: Repository<EtlPipeline>;
  let logRepo: Repository<EtlPipelineLog>;
  let versionRepo: Repository<EtlPipelineVersion>;

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAdminToken(app);
    userToken = await getUserToken(app);
    dataSource = app.get(DataSource);
    pipelineRepo = dataSource.getRepository(EtlPipeline);
    logRepo = dataSource.getRepository(EtlPipelineLog);
    versionRepo = dataSource.getRepository(EtlPipelineVersion);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await logRepo.createQueryBuilder().delete().from(EtlPipelineLog).execute();
    await versionRepo.createQueryBuilder().delete().from(EtlPipelineVersion).execute();
    await pipelineRepo.createQueryBuilder().delete().from(EtlPipeline).execute();
  });

  // ========== Positive Scenarios ==========

  // TS-F034-001: 成功軟刪除 active Pipeline
  it('TS-F034-001: should soft-delete active pipeline', async () => {
    const pipeline = await createPipeline(pipelineRepo, { status: 'active', name: 'Active-Delete-001' });

    const res = await request(app.getHttpServer())
      .delete(`/api/v1/etl/pipelines/${pipeline.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Pipeline 已刪除');

    const dbRow = await pipelineRepo.findOne({ where: { id: pipeline.id } });
    expect(dbRow).not.toBeNull();
    expect(dbRow!.deleted_at).not.toBeNull();
    // deleted_at should be close to now (within 5 seconds)
    const diff = Math.abs(new Date().getTime() - new Date(dbRow!.deleted_at!).getTime());
    expect(diff).toBeLessThan(5000);
  });

  // TS-F034-002: 成功軟刪除 failed Pipeline
  it('TS-F034-002: should soft-delete failed pipeline', async () => {
    const pipeline = await createPipeline(pipelineRepo, { status: 'failed', name: 'Failed-Delete-002' });

    const res = await request(app.getHttpServer())
      .delete(`/api/v1/etl/pipelines/${pipeline.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const dbRow = await pipelineRepo.findOne({ where: { id: pipeline.id } });
    expect(dbRow!.deleted_at).not.toBeNull();
  });

  // TS-F034-003: 成功軟刪除 disabled Pipeline
  it('TS-F034-003: should soft-delete disabled pipeline', async () => {
    const pipeline = await createPipeline(pipelineRepo, { status: 'disabled', name: 'Disabled-Delete-003' });

    const res = await request(app.getHttpServer())
      .delete(`/api/v1/etl/pipelines/${pipeline.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const dbRow = await pipelineRepo.findOne({ where: { id: pipeline.id } });
    expect(dbRow!.deleted_at).not.toBeNull();
  });

  // TS-F034-004: 成功軟刪除 draft Pipeline
  it('TS-F034-004: should soft-delete draft pipeline', async () => {
    const pipeline = await createPipeline(pipelineRepo, { status: 'draft', name: 'Draft-Delete-004' });

    const res = await request(app.getHttpServer())
      .delete(`/api/v1/etl/pipelines/${pipeline.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const dbRow = await pipelineRepo.findOne({ where: { id: pipeline.id } });
    expect(dbRow!.deleted_at).not.toBeNull();
  });

  // TS-F034-005: 刪除後從列表消失
  it('TS-F034-005: deleted pipeline should not appear in list', async () => {
    const pipeline = await createPipeline(pipelineRepo, { status: 'active', name: 'ListGone-005' });

    // Delete it
    await request(app.getHttpServer())
      .delete(`/api/v1/etl/pipelines/${pipeline.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    // List should not contain deleted pipeline
    const listRes = await request(app.getHttpServer())
      .get('/api/v1/etl/pipelines')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(listRes.status).toBe(200);
    const ids = listRes.body.data.map((p: any) => p.id);
    expect(ids).not.toContain(pipeline.id);
  });

  // TS-F034-006: 日誌保留（軟刪除後仍可查詢）
  it('TS-F034-006: pipeline logs should be preserved after soft-delete', async () => {
    const pipeline = await createPipeline(pipelineRepo, { status: 'active', name: 'WithLogs-006' });

    // Create 3 log entries
    for (let i = 0; i < 3; i++) {
      await logRepo.save(logRepo.create({
        pipeline_id: pipeline.id,
        version: 1,
        status: 'completed',
        started_at: new Date(),
        finished_at: new Date(),
        duration_ms: 1000,
        processed_count: 100,
        triggered_by: 'manual',
        is_test_run: false,
        created_by: ADMIN_ACTIVE.id,
      }));
    }

    // Delete pipeline
    await request(app.getHttpServer())
      .delete(`/api/v1/etl/pipelines/${pipeline.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    // Logs should still exist
    const logCount = await logRepo.count({ where: { pipeline_id: pipeline.id } });
    expect(logCount).toBe(3);
  });

  // TS-F034-007: 名稱唯一性在軟刪除後釋放
  it('TS-F034-007: name uniqueness released after soft-delete', async () => {
    const pipeline = await createPipeline(pipelineRepo, { status: 'active', name: '可重用名稱' });

    // Delete it
    await request(app.getHttpServer())
      .delete(`/api/v1/etl/pipelines/${pipeline.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    // Create new pipeline with same name
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/etl/pipelines')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: '可重用名稱' });

    expect(createRes.status).toBe(201);
  });

  // ========== Negative Scenarios ==========

  // TS-F034-008: 執行中 Pipeline 不可刪除 → 409
  it('TS-F034-008: should return 409 when deleting running pipeline', async () => {
    const pipeline = await createPipeline(pipelineRepo, { status: 'running', name: 'Running-008' });

    const res = await request(app.getHttpServer())
      .delete(`/api/v1/etl/pipelines/${pipeline.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('PIPELINE_RUNNING');

    // Verify not deleted
    const dbRow = await pipelineRepo.findOne({ where: { id: pipeline.id } });
    expect(dbRow!.deleted_at).toBeNull();
  });

  // TS-F034-009: 已軟刪除的 Pipeline 再次刪除 → 404
  it('TS-F034-009: should return 404 when deleting already-deleted pipeline', async () => {
    const pipeline = await createPipeline(pipelineRepo, {
      status: 'active',
      name: 'AlreadyDeleted-009',
      deleted_at: new Date(),
    });

    const res = await request(app.getHttpServer())
      .delete(`/api/v1/etl/pipelines/${pipeline.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('PIPELINE_NOT_FOUND');
  });

  // TS-F034-010: 不存在的 Pipeline → 404
  it('TS-F034-010: should return 404 for non-existent pipeline', async () => {
    const res = await request(app.getHttpServer())
      .delete('/api/v1/etl/pipelines/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('PIPELINE_NOT_FOUND');
  });

  // TS-F034-011: User 角色無權刪除 → 403
  it('TS-F034-011: user role should get 403', async () => {
    const pipeline = await createPipeline(pipelineRepo, { status: 'active', name: 'Forbidden-011' });

    const res = await request(app.getHttpServer())
      .delete(`/api/v1/etl/pipelines/${pipeline.id}`)
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('AUTH_FORBIDDEN');

    // Verify not deleted
    const dbRow = await pipelineRepo.findOne({ where: { id: pipeline.id } });
    expect(dbRow!.deleted_at).toBeNull();
  });

  // TS-F034-012: 未登入（無 Token）→ 401
  it('TS-F034-012: no token should return 401', async () => {
    const res = await request(app.getHttpServer())
      .delete('/api/v1/etl/pipelines/00000000-0000-0000-0000-000000000000');

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('AUTH_TOKEN_MISSING');
  });
});

// =============================================
// F093: 編輯 Pipeline 中繼資料（名稱 / 排程 / 描述）E2E
// =============================================

describe('F093: Edit Pipeline Metadata E2E', () => {
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

  // TS-F093-E2E-001: PATCH 端點存在且路徑正確（非 404 路由未掛載）
  it('TS-F093-E2E-001: PATCH endpoint should exist and route correctly', async () => {
    const pipeline = await createPipeline(pipelineRepo, { status: 'draft', name: 'Route-001' });

    const res = await request(app.getHttpServer())
      .patch(`/api/v1/etl/pipelines/${pipeline.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Route-001-updated' });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Route-001-updated');
  });

  // Route non-shadowing: PATCH :id/toggle still works (not captured by PATCH :id)
  it('TS-F093-E2E-001b: PATCH :id should NOT shadow PATCH :id/toggle', async () => {
    // Create a pipeline with a published version so it can be enabled
    const pipeline = await createPipeline(pipelineRepo, { status: 'disabled', name: 'NoShadow-toggle' });
    const version = versionRepo.create({
      pipeline_id: pipeline.id,
      version: 1,
      status: 'published',
      definition: { nodes: [], edges: [] },
      created_by: ADMIN_ACTIVE.id,
    });
    await versionRepo.save(version);

    const res = await request(app.getHttpServer())
      .patch(`/api/v1/etl/pipelines/${pipeline.id}/toggle`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ enabled: true });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('active');
    expect(res.body.enabled).toBe(true);
  });

  // TS-F093-E2E-002: 未認證 → 401
  it('TS-F093-E2E-002: should return 401 when no token provided', async () => {
    const pipeline = await createPipeline(pipelineRepo, { status: 'draft', name: 'Auth-002' });

    const res = await request(app.getHttpServer())
      .patch(`/api/v1/etl/pipelines/${pipeline.id}`)
      .send({ name: 'X' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('AUTH_TOKEN_MISSING');
  });

  // TS-F093-E2E-003: 非 admin → 403
  it('TS-F093-E2E-003: user role should get 403', async () => {
    const pipeline = await createPipeline(pipelineRepo, { status: 'draft', name: 'Rbac-003' });

    const res = await request(app.getHttpServer())
      .patch(`/api/v1/etl/pipelines/${pipeline.id}`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ name: 'X' });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('AUTH_FORBIDDEN');

    // Verify not modified
    const dbRow = await pipelineRepo.findOne({ where: { id: pipeline.id } });
    expect(dbRow!.name).toBe('Rbac-003');
  });

  // TS-F093-E2E-004: 合法更新（整合驗證 DB 持久化 + 版本定義不變）
  it('TS-F093-E2E-004: should persist name/description/schedule without touching version definition', async () => {
    const pipeline = await createPipeline(pipelineRepo, {
      status: 'draft',
      name: '原始名稱',
      schedule: null,
    });
    // Seed a version with a non-empty definition
    const version = versionRepo.create({
      pipeline_id: pipeline.id,
      version: 1,
      status: 'draft',
      definition: {
        nodes: [{ id: 'n1', type: 'extract', position: { x: 0, y: 0 }, data: {} }],
        edges: [],
      },
      created_by: ADMIN_ACTIVE.id,
    });
    await versionRepo.save(version);

    const res = await request(app.getHttpServer())
      .patch(`/api/v1/etl/pipelines/${pipeline.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: '更新後', schedule: '0 8 * * *', description: '新描述' });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('更新後');
    expect(res.body.description).toBe('新描述');
    expect(res.body.schedule).toBe('0 8 * * *');
    expect(res.body.updatedAt).toBeDefined();

    // DB verification
    const dbRow = await pipelineRepo.findOne({ where: { id: pipeline.id } });
    expect(dbRow!.name).toBe('更新後');
    expect(dbRow!.description).toBe('新描述');
    expect(dbRow!.schedule).toBe('0 8 * * *');

    // Version definition untouched
    const dbVersion = await versionRepo.findOne({ where: { pipeline_id: pipeline.id } });
    expect(dbVersion!.definition.nodes).toHaveLength(1);
    expect(dbVersion!.version).toBe(1);
  });

  // OD-F093-02: next_execution_at must NOT be touched by an update
  it('TS-F093-E2E-004b: should not modify next_execution_at when updating schedule', async () => {
    const existingNext = new Date('2026-06-01T02:00:00.000Z');
    const pipeline = await createPipeline(pipelineRepo, {
      status: 'draft',
      name: 'NextExec-004b',
      schedule: null,
      next_execution_at: existingNext,
    });

    const res = await request(app.getHttpServer())
      .patch(`/api/v1/etl/pipelines/${pipeline.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ schedule: '0 2 * * *' });

    expect(res.status).toBe(200);

    const dbRow = await pipelineRepo.findOne({ where: { id: pipeline.id } });
    expect(new Date(dbRow!.next_execution_at!).getTime()).toBe(existingNext.getTime());
  });

  // OD-F093-03: renaming to the pipeline's own current name should succeed
  it('TS-F093-E2E-004c: should allow renaming to its own current name (self-exclusion)', async () => {
    const pipeline = await createPipeline(pipelineRepo, { status: 'draft', name: '相同名稱' });

    const res = await request(app.getHttpServer())
      .patch(`/api/v1/etl/pipelines/${pipeline.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: '相同名稱' });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('相同名稱');
  });

  // TS-F093-E2E-005: 名稱衝突（另一 Pipeline 已用此名稱）→ 409
  it('TS-F093-E2E-005: duplicate name (another pipeline) should return 409', async () => {
    await createPipeline(pipelineRepo, { status: 'draft', name: '已存在名稱' });
    const target = await createPipeline(pipelineRepo, { status: 'draft', name: '原本名稱' });

    const res = await request(app.getHttpServer())
      .patch(`/api/v1/etl/pipelines/${target.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: '已存在名稱' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('PIPELINE_NAME_EXISTS');

    // Verify not modified
    const dbRow = await pipelineRepo.findOne({ where: { id: target.id } });
    expect(dbRow!.name).toBe('原本名稱');
  });

  // TS-F093-E2E-006: 無效 cron → 422
  it('TS-F093-E2E-006: invalid cron should return 422', async () => {
    const pipeline = await createPipeline(pipelineRepo, { status: 'draft', name: 'Cron-006' });

    const res = await request(app.getHttpServer())
      .patch(`/api/v1/etl/pipelines/${pipeline.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ schedule: 'not-a-cron' });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('VALIDATION_INVALID_CRON');
  });

  // TS-F093-E2E-007: Pipeline 不存在 → 404
  it('TS-F093-E2E-007: non-existent pipeline should return 404', async () => {
    const res = await request(app.getHttpServer())
      .patch('/api/v1/etl/pipelines/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'X' });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('PIPELINE_NOT_FOUND');
  });

  // OD-F093-01: running pipeline cannot be edited → 409 PIPELINE_RUNNING
  it('TS-F093-E2E-008: should return 409 PIPELINE_RUNNING when editing a running pipeline', async () => {
    const pipeline = await createPipeline(pipelineRepo, { status: 'running', name: 'Running-008' });

    const res = await request(app.getHttpServer())
      .patch(`/api/v1/etl/pipelines/${pipeline.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: '新名稱' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('PIPELINE_RUNNING');

    const dbRow = await pipelineRepo.findOne({ where: { id: pipeline.id } });
    expect(dbRow!.name).toBe('Running-008');
  });

  // 名稱空白 → 422（DTO 層 @IsNotEmpty）
  it('TS-F093-E2E-009: empty name should return 422 VALIDATION_ERROR', async () => {
    const pipeline = await createPipeline(pipelineRepo, { status: 'draft', name: 'EmptyName-009' });

    const res = await request(app.getHttpServer())
      .patch(`/api/v1/etl/pipelines/${pipeline.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: '' });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  // 名稱 256 字元 → 422（DTO 層 @MaxLength(255)）
  it('TS-F093-E2E-010: name with 256 chars should return 422', async () => {
    const pipeline = await createPipeline(pipelineRepo, { status: 'draft', name: 'LongName-010' });

    const res = await request(app.getHttpServer())
      .patch(`/api/v1/etl/pipelines/${pipeline.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'A'.repeat(256) });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });
});
