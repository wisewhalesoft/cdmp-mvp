import { describe, it, expect, beforeAll, afterAll } from 'vitest';
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
import { HttpExceptionFilter } from '@/common/filters/http-exception.filter';
import { User } from '@/database/entities/user.entity';
import { TokenBlocklist } from '@/database/entities/token-blocklist.entity';
import { PasswordResetToken } from '@/database/entities/password-reset-token.entity';
import { Datasource } from '@/database/entities/datasource.entity';
import { DatasourceHealthLog } from '@/database/entities/datasource-health-log.entity';
import { ExtractionTask } from '@/database/entities/extraction-task.entity';
import { ExtractionLog } from '@/database/entities/extraction-log.entity';
import { CONNECTION_TESTER } from '@/modules/datasource/connection-tester.provider';
import { HashUtil } from '@/common/hash/hash.util';
import { ADMIN_ACTIVE, USER_ACTIVE } from './seeds/test-data';

const TEST_AES_KEY = randomBytes(32).toString('hex');

let datasourceId: string;

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
        entities: [User, TokenBlocklist, PasswordResetToken, Datasource, DatasourceHealthLog, ExtractionTask, ExtractionLog],
        synchronize: true,
      }),
      ThrottlerModule.forRoot([
        {
          name: 'login',
          ttl: 60000,
          limit: 100,
        },
      ]),
      AuthModule,
      AccountsModule,
      DatasourceModule,
      ExtractionTaskModule,
    ],
    providers: [
      {
        provide: APP_GUARD,
        useClass: ThrottlerGuard,
      },
    ],
  })
    .overrideProvider(CONNECTION_TESTER)
    .useValue({ testConnection: async () => ({ success: true, responseTimeMs: 10 }) })
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

  // Seed a datasource for extraction task tests
  const adminToken = await getAdminToken(app);
  const dsRes = await request(app.getHttpServer())
    .post('/api/v1/datasources')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      name: 'Test MySQL DS',
      type: 'mysql',
      host: '192.168.1.100',
      port: 3306,
      databaseName: 'test_db',
      username: 'admin',
      password: 'Secret123',
    });
  datasourceId = dsRes.body.id;

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

describe('F017: Create Extraction Task E2E (POST /api/v1/extraction-tasks)', () => {
  let app: INestApplication;
  let adminToken: string;

  const basePayload = {
    name: '每日全量同步',
    datasourceId: '', // will be set in beforeAll
    mode: 'full',
    targetTable: 'customers',
    schedule: '0 2 * * *',
  };

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAdminToken(app);
    basePayload.datasourceId = datasourceId;
  });

  afterAll(async () => {
    await app?.close();
  });

  // TS-F017-001: 建立全量擷取任務
  it('should create full-mode extraction task and return 201', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/extraction-tasks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ...basePayload, name: 'TS-001 全量同步' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.name).toBe('TS-001 全量同步');
    expect(res.body.datasourceId).toBe(datasourceId);
    expect(res.body.datasourceName).toBe('Test MySQL DS');
    expect(res.body.mode).toBe('full');
    expect(res.body.status).toBe('scheduled');
    expect(res.body.targetTable).toBe('customers');
    expect(res.body.schedule).toBe('0 2 * * *');
    expect(res.body.enabled).toBe(true);
    expect(res.body.lastExecutionAt).toBeNull();
    expect(res.body.extractedCount).toBe(0);
    expect(res.body.totalCount).toBe(0);
    expect(res.body.progressPercent).toBe(0);
    expect(res.body.avgDurationMs).toBe(0);
    expect(res.body.executionCount).toBe(0);
    expect(res.body.errorMessage).toBeNull();
    expect(res.body.incrementalColumn).toBeNull();
    expect(res.body.lastIncrementalValue).toBeNull();
    expect(res.body.createdBy).toBe(ADMIN_ACTIVE.id);
    expect(res.body).toHaveProperty('createdAt');
    expect(res.body).toHaveProperty('updatedAt');
  });

  // TS-F017-002: 建立增量擷取任務
  it('should create incremental-mode extraction task with incrementalColumn', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/extraction-tasks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        ...basePayload,
        name: 'TS-002 增量同步',
        mode: 'incremental',
        incrementalColumn: 'updated_at',
        lastIncrementalValue: '2026-01-01',
      });

    expect(res.status).toBe(201);
    expect(res.body.mode).toBe('incremental');
    expect(res.body.incrementalColumn).toBe('updated_at');
    expect(res.body.lastIncrementalValue).toBe('2026-01-01');
    expect(res.body.status).toBe('scheduled');
    expect(res.body.enabled).toBe(true);
  });

  // TS-F017-004: 軟刪除後同名任務可重新建立
  it('should allow creating task with same name after soft-delete', async () => {
    const taskName = 'Soft Delete Reuse';

    // Create first
    const res1 = await request(app.getHttpServer())
      .post('/api/v1/extraction-tasks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ...basePayload, name: taskName });
    expect(res1.status).toBe(201);

    // Soft-delete via DB
    const dataSource = app.get(DataSource);
    const taskRepo = dataSource.getRepository(ExtractionTask);
    await taskRepo.update({ id: res1.body.id }, { deleted_at: new Date() });

    // Create again with same name
    const res2 = await request(app.getHttpServer())
      .post('/api/v1/extraction-tasks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ...basePayload, name: taskName });
    expect(res2.status).toBe(201);
    expect(res2.body.name).toBe(taskName);
  });

  // TS-F017-005: 名稱重複
  it('should return 409 for duplicate name', async () => {
    const taskName = 'Duplicate Test';

    // First creation
    const first = await request(app.getHttpServer())
      .post('/api/v1/extraction-tasks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ...basePayload, name: taskName });
    expect(first.status).toBe(201);

    // Second creation with same name
    const second = await request(app.getHttpServer())
      .post('/api/v1/extraction-tasks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ...basePayload, name: taskName });

    expect(second.status).toBe(409);
    expect(second.body.error).toBe('EXTRACTION_NAME_EXISTS');
    expect(second.body.message).toBe('此名稱的擷取任務已存在');
  });

  // TS-F017-006: 非 Admin 無權建立
  it('should return 403 for non-admin user', async () => {
    const userToken = await getUserToken(app);

    const res = await request(app.getHttpServer())
      .post('/api/v1/extraction-tasks')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ ...basePayload, name: 'Forbidden Task' });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('AUTH_FORBIDDEN');
  });

  // TS-F017-007: 指定已刪除的資料來源
  it('should return 422 when datasource is soft-deleted', async () => {
    // Create another datasource and soft-delete it
    const dsRes = await request(app.getHttpServer())
      .post('/api/v1/datasources')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Deleted DS',
        type: 'mysql',
        host: '192.168.1.200',
        port: 3306,
        databaseName: 'deleted_db',
        username: 'admin',
        password: 'Secret123',
      });
    const deletedDsId = dsRes.body.id;

    const dataSource = app.get(DataSource);
    const dsRepo = dataSource.getRepository(Datasource);
    await dsRepo.update({ id: deletedDsId }, { deleted_at: new Date() });

    const res = await request(app.getHttpServer())
      .post('/api/v1/extraction-tasks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ...basePayload, name: 'Task with Deleted DS', datasourceId: deletedDsId });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('EXTRACTION_DATASOURCE_NOT_FOUND');
    expect(res.body.message).toBe('指定的資料來源不存在或已被刪除');
  });

  // TS-F017-007 variant: non-existent datasource
  it('should return 422 when datasource does not exist', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/extraction-tasks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ...basePayload, name: 'Task with Missing DS', datasourceId: 'a1b2c3d4-e5f6-4890-abcd-ef1234567890' });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('EXTRACTION_DATASOURCE_NOT_FOUND');
  });

  // TS-F017-008: 增量模式未填增量欄位
  it('should return 422 when incremental mode lacks incrementalColumn', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/extraction-tasks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        ...basePayload,
        name: 'Missing Incremental Col',
        mode: 'incremental',
        // incrementalColumn omitted
      });

    expect(res.status).toBe(422);
    // class-validator will catch this via @ValidateIf
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  // TS-F017-009: Cron 表達式邊界驗證
  describe('cron expression validation', () => {
    it('should accept valid cron expression "0 2 * * *"', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/extraction-tasks')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ...basePayload, name: 'Valid Cron Task', schedule: '0 2 * * *' });

      expect(res.status).toBe(201);
    });

    it('should return 422 for invalid cron expression "invalid-cron"', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/extraction-tasks')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ...basePayload, name: 'Invalid Cron Task', schedule: 'invalid-cron' });

      expect(res.status).toBe(422);
      expect(res.body.error).toBe('EXTRACTION_INVALID_CRON');
      expect(res.body.message).toBe('排程格式不正確，請輸入合法的 cron 表達式');
    });

    it('should return 422 for empty schedule', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/extraction-tasks')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ...basePayload, name: 'Empty Cron Task', schedule: '' });

      expect(res.status).toBe(422);
      expect(res.body.error).toBe('VALIDATION_ERROR');
    });
  });

  // Missing required fields
  it('should return 422 for missing required fields (name)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/extraction-tasks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        datasourceId: datasourceId,
        mode: 'full',
        targetTable: 'customers',
        schedule: '0 2 * * *',
      });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  // Unauthenticated
  it('should return 401 for unauthenticated request', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/extraction-tasks')
      .send({ ...basePayload, name: 'Unauth Task' });

    expect(res.status).toBe(401);
  });
});

describe('F018: List Extraction Tasks E2E (GET /api/v1/extraction-tasks)', () => {
  let app: INestApplication;
  let adminToken: string;
  let dataSource: DataSource;

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAdminToken(app);
    dataSource = app.get(DataSource);

    const taskRepo = dataSource.getRepository(ExtractionTask);
    const logRepo = dataSource.getRepository(ExtractionLog);

    // Create tasks via API for consistency
    await request(app.getHttpServer())
      .post('/api/v1/extraction-tasks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'F018 客戶同步任務',
        datasourceId,
        mode: 'full',
        targetTable: 'customers',
        schedule: '0 2 * * *',
      });

    await request(app.getHttpServer())
      .post('/api/v1/extraction-tasks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'F018 訂單匯入',
        datasourceId,
        mode: 'full',
        targetTable: 'orders',
        schedule: '0 3 * * *',
      });

    const failedRes = await request(app.getHttpServer())
      .post('/api/v1/extraction-tasks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'F018 失敗增量任務',
        datasourceId,
        mode: 'incremental',
        targetTable: 'invoices',
        schedule: '0 4 * * *',
        incrementalColumn: 'updated_at',
      });

    // Update status to failed for the third task
    await taskRepo.update({ id: failedRes.body.id }, { status: 'failed' });

    // Create a soft-deleted task
    const deletedRes = await request(app.getHttpServer())
      .post('/api/v1/extraction-tasks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'F018 已刪除任務',
        datasourceId,
        mode: 'full',
        targetTable: 'deleted_table',
        schedule: '0 5 * * *',
      });
    await taskRepo.update({ id: deletedRes.body.id }, { deleted_at: new Date() });

    // Seed extraction logs for summary
    // Today in UTC+8 (Asia/Taipei)
    const now = new Date();
    const taipeiOffset = 8 * 60 * 60 * 1000;
    const taipeiNow = new Date(now.getTime() + taipeiOffset);
    const taipeiTodayStart = new Date(
      Date.UTC(taipeiNow.getUTCFullYear(), taipeiNow.getUTCMonth(), taipeiNow.getUTCDate()),
    );
    const todayStartUTC = new Date(taipeiTodayStart.getTime() - taipeiOffset);

    const allTasks = await taskRepo.createQueryBuilder('t').where('t.deleted_at IS NULL').getMany();
    const firstTask = allTasks[0];

    // 3 success logs today
    for (let i = 0; i < 3; i++) {
      await logRepo.save(
        logRepo.create({
          task_id: firstTask.id,
          status: 'completed',
          started_at: new Date(todayStartUTC.getTime() + (i + 1) * 3600000),
          finished_at: new Date(todayStartUTC.getTime() + (i + 1) * 3600000 + 60000),
          duration_ms: 60000,
          extracted_count: 100,
          total_count: 100,
          triggered_by: 'schedule',
          created_by: ADMIN_ACTIVE.id,
        }),
      );
    }

    // 1 failed log today
    await logRepo.save(
      logRepo.create({
        task_id: firstTask.id,
        status: 'failed',
        started_at: new Date(todayStartUTC.getTime() + 4 * 3600000),
        finished_at: new Date(todayStartUTC.getTime() + 4 * 3600000 + 30000),
        duration_ms: 30000,
        extracted_count: 0,
        total_count: 100,
        error_message: '連線逾時',
        triggered_by: 'schedule',
        created_by: ADMIN_ACTIVE.id,
      }),
    );

    // 1 success log yesterday (should NOT count in today's summary)
    await logRepo.save(
      logRepo.create({
        task_id: firstTask.id,
        status: 'completed',
        started_at: new Date(todayStartUTC.getTime() - 3600000),
        finished_at: new Date(todayStartUTC.getTime() - 3600000 + 60000),
        duration_ms: 60000,
        extracted_count: 100,
        total_count: 100,
        triggered_by: 'schedule',
        created_by: ADMIN_ACTIVE.id,
      }),
    );
  });

  afterAll(async () => {
    await app?.close();
  });

  // TS-F018-001: Basic list with updated_at DESC
  it('should return task list ordered by updated_at DESC', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/extraction-tasks')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('meta');
    expect(res.body).toHaveProperty('summary');
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(3);

    // Check ordering: updated_at DESC
    for (let i = 0; i < res.body.data.length - 1; i++) {
      const current = new Date(res.body.data[i].updatedAt).getTime();
      const next = new Date(res.body.data[i + 1].updatedAt).getTime();
      expect(current).toBeGreaterThanOrEqual(next);
    }

    // Check data shape
    const item = res.body.data[0];
    expect(item).toHaveProperty('id');
    expect(item).toHaveProperty('name');
    expect(item).toHaveProperty('datasourceId');
    expect(item).toHaveProperty('datasourceName');
    expect(item).toHaveProperty('mode');
    expect(item).toHaveProperty('status');
    expect(item).toHaveProperty('schedule');
    expect(item).toHaveProperty('enabled');
  });

  // TS-F018-002: Summary stats
  it('should return correct summary with todaySuccess=3, todayFailed=1, successRate=75', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/extraction-tasks')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.summary.todaySuccess).toBe(3);
    expect(res.body.summary.todayFailed).toBe(1);
    expect(res.body.summary.successRate).toBe(75);
  });

  // TS-F018-003: Search by name
  it('should filter tasks by search keyword', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/extraction-tasks?search=客戶')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    res.body.data.forEach((item: any) => {
      expect(item.name.toLowerCase()).toContain('客戶');
    });
  });

  // TS-F018-004: Status filter
  it('should filter tasks by status', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/extraction-tasks?status=failed')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    res.body.data.forEach((item: any) => {
      expect(item.status).toBe('failed');
    });
  });

  // TS-F018-005: Multiple filters (AND)
  it('should apply multiple filters with AND logic', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/extraction-tasks?status=failed&mode=incremental')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    res.body.data.forEach((item: any) => {
      expect(item.status).toBe('failed');
      expect(item.mode).toBe('incremental');
    });
  });

  // TS-F018-006: Non-admin user gets 403
  it('should return 403 for non-admin user', async () => {
    const userToken = await getUserToken(app);

    const res = await request(app.getHttpServer())
      .get('/api/v1/extraction-tasks')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('AUTH_FORBIDDEN');
  });

  // TS-F018-007: Soft-deleted tasks excluded
  it('should not include soft-deleted tasks', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/extraction-tasks')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const names = res.body.data.map((item: any) => item.name);
    expect(names).not.toContain('F018 已刪除任務');
  });

  // TS-F018-009: UTC+8 timezone boundary
  it('should only count today logs in UTC+8 timezone for summary', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/extraction-tasks')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    // Yesterday's log should not be counted
    // 3 success + 1 failed = total 4 today, yesterday's 1 success excluded
    expect(res.body.summary.todaySuccess).toBe(3);
    expect(res.body.summary.todayFailed).toBe(1);
  });
});

// F019: Edit Extraction Task E2E
describe('F019: Edit Extraction Task E2E', () => {
  let app: INestApplication;
  let adminToken: string;
  let dataSource: DataSource;
  let scheduledTaskId: string;
  let completedTaskId: string;
  let runningTaskId: string;
  let incrementalTaskId: string;

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAdminToken(app);
    dataSource = app.get(DataSource);
    const taskRepo = dataSource.getRepository(ExtractionTask);

    // Create ET_SCHEDULED (full mode)
    const res1 = await request(app.getHttpServer())
      .post('/api/v1/extraction-tasks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'F019 排程任務',
        datasourceId,
        mode: 'full',
        targetTable: 'customers',
        schedule: '0 2 * * *',
      });
    scheduledTaskId = res1.body.id;

    // Create ET_COMPLETED (full mode, for name collision test)
    const res2 = await request(app.getHttpServer())
      .post('/api/v1/extraction-tasks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'F019 已完成任務',
        datasourceId,
        mode: 'full',
        targetTable: 'orders',
        schedule: '0 3 * * *',
      });
    completedTaskId = res2.body.id;
    await taskRepo.update({ id: completedTaskId }, { status: 'completed' });

    // Create ET_RUNNING
    const res3 = await request(app.getHttpServer())
      .post('/api/v1/extraction-tasks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'F019 執行中任務',
        datasourceId,
        mode: 'full',
        targetTable: 'invoices',
        schedule: '0 4 * * *',
      });
    runningTaskId = res3.body.id;
    await taskRepo.update({ id: runningTaskId }, { status: 'running' });

    // Create ET_INCREMENTAL
    const res4 = await request(app.getHttpServer())
      .post('/api/v1/extraction-tasks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'F019 增量任務',
        datasourceId,
        mode: 'incremental',
        targetTable: 'products',
        schedule: '0 5 * * *',
        incrementalColumn: 'updated_at',
      });
    incrementalTaskId = res4.body.id;
  });

  afterAll(async () => {
    await app?.close();
  });

  // TS-F019-001: 成功編輯任務名稱
  it('should update task name and return 200 (TS-F019-001)', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/extraction-tasks/${scheduledTaskId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: '新名稱' });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('新名稱');
    expect(res.body.id).toBe(scheduledTaskId);
    expect(res.body.datasourceId).toBe(datasourceId);
    expect(res.body.datasourceName).toBe('Test MySQL DS');
    expect(res.body).toHaveProperty('updatedAt');

    // Verify via GET detail
    const detail = await request(app.getHttpServer())
      .get(`/api/v1/extraction-tasks/${scheduledTaskId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(detail.status).toBe(200);
    expect(detail.body.name).toBe('新名稱');
  });

  // TS-F019-002: 成功修改排程 cron
  it('should update schedule cron and return 200 (TS-F019-002)', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/extraction-tasks/${scheduledTaskId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ schedule: '0 3 * * *' });

    expect(res.status).toBe(200);
    expect(res.body.schedule).toBe('0 3 * * *');
  });

  // TS-F019-003: 全量切換至增量模式
  it('should switch from full to incremental mode (TS-F019-003)', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/extraction-tasks/${scheduledTaskId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ mode: 'incremental', incrementalColumn: 'id' });

    expect(res.status).toBe(200);
    expect(res.body.mode).toBe('incremental');
    expect(res.body.incrementalColumn).toBe('id');
  });

  // TS-F019-004: 名稱唯一性排除自身
  it('should allow keeping same name (self-exclusion) (TS-F019-004)', async () => {
    // First restore name for clarity
    await request(app.getHttpServer())
      .patch(`/api/v1/extraction-tasks/${scheduledTaskId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'F019 自身名稱測試', mode: 'full' });

    const res = await request(app.getHttpServer())
      .patch(`/api/v1/extraction-tasks/${scheduledTaskId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'F019 自身名稱測試' });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('F019 自身名稱測試');
  });

  // TS-F019-005: 執行中任務無法編輯
  it('should return 409 for running task (TS-F019-005)', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/extraction-tasks/${runningTaskId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'x' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('EXTRACTION_RUNNING');
  });

  // TS-F019-006: 名稱重複（與其他任務）
  it('should return 409 for duplicate name with another task (TS-F019-006)', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/extraction-tasks/${scheduledTaskId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'F019 已完成任務' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('EXTRACTION_NAME_EXISTS');
  });

  // TS-F019-007: 非 Admin 無權編輯
  it('should return 403 for non-admin user (TS-F019-007)', async () => {
    const userToken = await getUserToken(app);

    const res = await request(app.getHttpServer())
      .patch(`/api/v1/extraction-tasks/${scheduledTaskId}`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ name: 'x' });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('AUTH_FORBIDDEN');
  });

  // TS-F019-008: 任務不存在
  it('should return 404 for non-existent task (TS-F019-008)', async () => {
    const res = await request(app.getHttpServer())
      .patch('/api/v1/extraction-tasks/a1b2c3d4-e5f6-4890-abcd-ef1234567890')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'x' });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('EXTRACTION_NOT_FOUND');
  });

  // TS-F019-009: 增量切換至全量（incrementalColumn 保留不清除）
  it('should preserve incrementalColumn when switching from incremental to full (TS-F019-009)', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/extraction-tasks/${incrementalTaskId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ mode: 'full' });

    expect(res.status).toBe(200);
    expect(res.body.mode).toBe('full');
    // incrementalColumn should be preserved (not cleared)
    expect(res.body.incrementalColumn).toBe('updated_at');
  });

  // TS-F019-010: 成功更新資料來源
  it('should update datasourceId and return new datasource info (TS-F019-010)', async () => {
    // Create a second datasource
    const dsRes = await request(app.getHttpServer())
      .post('/api/v1/datasources')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Second DS',
        type: 'postgresql',
        host: '192.168.1.200',
        port: 5432,
        databaseName: 'second_db',
        username: 'admin',
        password: 'Secret123',
      });
    const secondDsId = dsRes.body.id;

    const res = await request(app.getHttpServer())
      .patch(`/api/v1/extraction-tasks/${completedTaskId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ datasourceId: secondDsId });

    expect(res.status).toBe(200);
    expect(res.body.datasourceId).toBe(secondDsId);
    expect(res.body.datasourceName).toBe('Second DS');

    // Verify via GET detail
    const detail = await request(app.getHttpServer())
      .get(`/api/v1/extraction-tasks/${completedTaskId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(detail.status).toBe(200);
    expect(detail.body.datasourceId).toBe(secondDsId);
    expect(detail.body.datasourceName).toBe('Second DS');
  });

  // AC-3: GET /api/v1/extraction-tasks/:id returns full task for form prefill
  it('should return full task detail via GET /:id (AC-3)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/extraction-tasks/${scheduledTaskId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id');
    expect(res.body).toHaveProperty('name');
    expect(res.body).toHaveProperty('datasourceId');
    expect(res.body).toHaveProperty('datasourceName');
    expect(res.body).toHaveProperty('mode');
    expect(res.body).toHaveProperty('status');
    expect(res.body).toHaveProperty('targetTable');
    expect(res.body).toHaveProperty('schedule');
    expect(res.body).toHaveProperty('incrementalColumn');
    expect(res.body).toHaveProperty('lastIncrementalValue');
    expect(res.body).toHaveProperty('enabled');
    expect(res.body).toHaveProperty('createdAt');
    expect(res.body).toHaveProperty('updatedAt');
  });

  // GET /:id returns 404 for non-existent task
  it('should return 404 via GET for non-existent task', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/extraction-tasks/a1b2c3d4-e5f6-4890-abcd-ef1234567890')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('EXTRACTION_NOT_FOUND');
  });
});

// TS-F018-008: Empty list
describe('F018: Empty List (GET /api/v1/extraction-tasks)', () => {
  let app: INestApplication;
  let adminToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAdminToken(app);

    // Remove all extraction tasks
    const dataSource = app.get(DataSource);
    const logRepo = dataSource.getRepository(ExtractionLog);
    const taskRepo = dataSource.getRepository(ExtractionTask);
    await logRepo.createQueryBuilder().delete().from(ExtractionLog).execute();
    await taskRepo.createQueryBuilder().delete().from(ExtractionTask).execute();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('should return empty list with zero summary', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/extraction-tasks')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.total).toBe(0);
    expect(res.body.summary.totalTasks).toBe(0);
    expect(res.body.summary.running).toBe(0);
    expect(res.body.summary.todaySuccess).toBe(0);
    expect(res.body.summary.todayFailed).toBe(0);
    expect(res.body.summary.successRate).toBe(0);
  });
});
