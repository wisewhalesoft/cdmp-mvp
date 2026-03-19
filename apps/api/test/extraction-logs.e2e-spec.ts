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
import { EXTRACTION_EXECUTOR } from '@/modules/extraction-task/extraction-executor.provider';
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
    .overrideProvider(EXTRACTION_EXECUTOR)
    .useValue({
      execute: async () => ({ totalCount: 0, extractedCount: 0 }),
      getSourceTableMetadata: async () => [
        { name: 'id', dataType: 'integer', isPrimary: true },
        { name: 'name', dataType: 'varchar', isPrimary: false },
      ],
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

  // Seed a datasource
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

describe('F022: Extraction Logs E2E (GET /api/v1/extraction-tasks/:id/logs)', () => {
  let app: INestApplication;
  let adminToken: string;
  let taskId: string;
  let dataSource: DataSource;

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAdminToken(app);
    dataSource = app.get(DataSource);

    // Create an extraction task
    const taskRes = await request(app.getHttpServer())
      .post('/api/v1/extraction-tasks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Log Test Task',
        datasourceId,
        mode: 'full',
        sourceTable: 'customers',
        schedule: '0 2 * * *',
      });
    taskId = taskRes.body.id;
  });

  afterAll(async () => {
    await app?.close();
  });

  // TS-F022-001: 日誌列表倒序排列（startedAt DESC）
  it('should return logs in descending order by startedAt', async () => {
    const logRepo = dataSource.getRepository(ExtractionLog);

    // Insert 3 logs with different started_at times
    const now = new Date();
    const log1 = logRepo.create({
      task_id: taskId,
      status: 'completed',
      started_at: new Date(now.getTime() - 3000), // oldest
      finished_at: new Date(now.getTime() - 2000),
      duration_ms: 1000,
      extracted_count: 10,
      total_count: 10,
      triggered_by: 'manual',
      created_by: ADMIN_ACTIVE.id,
    });
    const log2 = logRepo.create({
      task_id: taskId,
      status: 'completed',
      started_at: new Date(now.getTime() - 1000), // middle
      finished_at: new Date(now.getTime() - 500),
      duration_ms: 500,
      extracted_count: 5,
      total_count: 5,
      triggered_by: 'schedule',
      created_by: ADMIN_ACTIVE.id,
    });
    const log3 = logRepo.create({
      task_id: taskId,
      status: 'completed',
      started_at: new Date(now.getTime()), // newest
      finished_at: new Date(now.getTime() + 200),
      duration_ms: 200,
      extracted_count: 3,
      total_count: 3,
      triggered_by: 'manual',
      created_by: ADMIN_ACTIVE.id,
    });
    await logRepo.save([log1, log2, log3]);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/extraction-tasks/${taskId}/logs`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(3);
    // Verify descending order by startedAt
    const startedAts = res.body.data.map((l: any) => new Date(l.startedAt).getTime());
    for (let i = 0; i < startedAts.length - 1; i++) {
      expect(startedAts[i]).toBeGreaterThanOrEqual(startedAts[i + 1]);
    }
    expect(res.body.meta.total).toBe(3);
    expect(res.body.meta.page).toBe(1);
    expect(res.body.meta.totalPages).toBe(1);
  });

  // TS-F022-002: 失敗日誌含錯誤訊息
  it('should include errorMessage for failed logs', async () => {
    const logRepo = dataSource.getRepository(ExtractionLog);
    // Clear previous logs
    await logRepo.delete({ task_id: taskId });

    const failedLog = logRepo.create({
      task_id: taskId,
      status: 'failed',
      started_at: new Date(),
      finished_at: new Date(),
      duration_ms: 500,
      extracted_count: 0,
      total_count: 10,
      error_message: 'Connection timeout after 30000ms',
      triggered_by: 'schedule',
      created_by: ADMIN_ACTIVE.id,
    });
    await logRepo.save(failedLog);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/extraction-tasks/${taskId}/logs`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].status).toBe('failed');
    expect(res.body.data[0].errorMessage).toBe('Connection timeout after 30000ms');
  });

  // TS-F022-003: 執行中日誌欄位為 null
  it('should have null finishedAt and durationMs for running logs', async () => {
    const logRepo = dataSource.getRepository(ExtractionLog);
    await logRepo.delete({ task_id: taskId });

    const runningLog = logRepo.create({
      task_id: taskId,
      status: 'running',
      started_at: new Date(),
      finished_at: null,
      duration_ms: null,
      extracted_count: 0,
      total_count: 0,
      triggered_by: 'manual',
      created_by: ADMIN_ACTIVE.id,
    });
    await logRepo.save(runningLog);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/extraction-tasks/${taskId}/logs`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].status).toBe('running');
    expect(res.body.data[0].finishedAt).toBeNull();
    expect(res.body.data[0].durationMs).toBeNull();
    expect(res.body.data[0].errorMessage).toBeNull();
  });

  // TS-F022-004: 觸發方式欄位正確
  it('should return correct triggeredBy values (manual/schedule/retry)', async () => {
    const logRepo = dataSource.getRepository(ExtractionLog);
    await logRepo.delete({ task_id: taskId });

    const now = new Date();
    const manualLog = logRepo.create({
      task_id: taskId,
      status: 'completed',
      started_at: new Date(now.getTime() - 3000),
      finished_at: new Date(now.getTime() - 2000),
      duration_ms: 1000,
      extracted_count: 10,
      total_count: 10,
      triggered_by: 'manual',
      created_by: ADMIN_ACTIVE.id,
    });
    const scheduleLog = logRepo.create({
      task_id: taskId,
      status: 'completed',
      started_at: new Date(now.getTime() - 1000),
      finished_at: new Date(now.getTime() - 500),
      duration_ms: 500,
      extracted_count: 5,
      total_count: 5,
      triggered_by: 'schedule',
      created_by: ADMIN_ACTIVE.id,
    });
    const retryLog = logRepo.create({
      task_id: taskId,
      status: 'failed',
      started_at: new Date(now.getTime()),
      finished_at: new Date(now.getTime() + 100),
      duration_ms: 100,
      extracted_count: 0,
      total_count: 5,
      error_message: 'Retry failed',
      triggered_by: 'retry',
      created_by: ADMIN_ACTIVE.id,
    });
    await logRepo.save([manualLog, scheduleLog, retryLog]);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/extraction-tasks/${taskId}/logs`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const triggeredByValues = res.body.data.map((l: any) => l.triggeredBy);
    expect(triggeredByValues).toContain('manual');
    expect(triggeredByValues).toContain('schedule');
    expect(triggeredByValues).toContain('retry');
  });

  // TS-F022-005: 非 Admin 無權查看（HTTP 403）
  it('should return 403 for non-admin user', async () => {
    const userToken = await getUserToken(app);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/extraction-tasks/${taskId}/logs`)
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(403);
  });

  // TS-F022-006: 任務不存在（HTTP 404）
  it('should return 404 when task does not exist', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';

    const res = await request(app.getHttpServer())
      .get(`/api/v1/extraction-tasks/${fakeId}/logs`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('EXTRACTION_NOT_FOUND');
  });

  // TS-F022-007: 空狀態
  it('should return empty array with total=0 when no logs exist', async () => {
    // Create a new task with no logs
    const taskRes = await request(app.getHttpServer())
      .post('/api/v1/extraction-tasks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Empty Logs Task',
        datasourceId,
        mode: 'full',
        sourceTable: 'customers',
        schedule: '0 3 * * *',
      });
    const emptyTaskId = taskRes.body.id;

    const res = await request(app.getHttpServer())
      .get(`/api/v1/extraction-tasks/${emptyTaskId}/logs`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.total).toBe(0);
    expect(res.body.meta.page).toBe(1);
    expect(res.body.meta.totalPages).toBe(0);
  });

  // TS-F022-008: 軟刪除任務的日誌仍可查詢
  it('should still return logs for a soft-deleted task', async () => {
    // Create task, add a log, then soft-delete the task
    const taskRes = await request(app.getHttpServer())
      .post('/api/v1/extraction-tasks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Soft Delete Logs Task',
        datasourceId,
        mode: 'full',
        sourceTable: 'customers',
        schedule: '0 4 * * *',
      });
    const softDeleteTaskId = taskRes.body.id;

    // Insert a log
    const logRepo = dataSource.getRepository(ExtractionLog);
    const log = logRepo.create({
      task_id: softDeleteTaskId,
      status: 'completed',
      started_at: new Date(),
      finished_at: new Date(),
      duration_ms: 1200,
      extracted_count: 50,
      total_count: 50,
      triggered_by: 'manual',
      created_by: ADMIN_ACTIVE.id,
    });
    await logRepo.save(log);

    // Soft-delete the task
    const taskRepo = dataSource.getRepository(ExtractionTask);
    await taskRepo.update(softDeleteTaskId, { deleted_at: new Date() });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/extraction-tasks/${softDeleteTaskId}/logs`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].taskId).toBe(softDeleteTaskId);
    expect(res.body.data[0].status).toBe('completed');
    expect(res.body.data[0].durationMs).toBe(1200);
    expect(res.body.meta.total).toBe(1);
  });

  // Response shape validation
  it('should return correct response field names (camelCase)', async () => {
    const logRepo = dataSource.getRepository(ExtractionLog);
    await logRepo.delete({ task_id: taskId });

    const log = logRepo.create({
      task_id: taskId,
      status: 'completed',
      started_at: new Date(),
      finished_at: new Date(),
      duration_ms: 800,
      extracted_count: 20,
      total_count: 20,
      triggered_by: 'manual',
      created_by: ADMIN_ACTIVE.id,
    });
    await logRepo.save(log);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/extraction-tasks/${taskId}/logs`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const item = res.body.data[0];
    expect(item).toHaveProperty('id');
    expect(item).toHaveProperty('taskId');
    expect(item).toHaveProperty('status');
    expect(item).toHaveProperty('startedAt');
    expect(item).toHaveProperty('finishedAt');
    expect(item).toHaveProperty('durationMs');
    expect(item).toHaveProperty('extractedCount');
    expect(item).toHaveProperty('totalCount');
    expect(item).toHaveProperty('errorMessage');
    expect(item).toHaveProperty('triggeredBy');
    expect(item).toHaveProperty('createdBy');
    expect(item).toHaveProperty('createdAt');
  });
});
