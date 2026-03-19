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
      ThrottlerModule.forRoot([{ name: 'login', ttl: 60000, limit: 100 }]),
      AuthModule,
      AccountsModule,
      DatasourceModule,
      ExtractionTaskModule,
    ],
    providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
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

describe('F024: Extraction Dashboard E2E', () => {
  let app: INestApplication;
  let adminToken: string;
  let dataSource: DataSource;

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAdminToken(app);
    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    await app?.close();
  });

  // TS-F024-001: 統計卡片數值正確
  it('should return correct summary card values', async () => {
    const taskRepo = dataSource.getRepository(ExtractionTask);
    const logRepo = dataSource.getRepository(ExtractionLog);

    // Clean up
    await logRepo.createQueryBuilder().delete().from(ExtractionLog).execute();
    await taskRepo.createQueryBuilder().delete().from(ExtractionTask).execute();

    // Create 3 tasks: 1 running, 2 scheduled
    const task1 = taskRepo.create({
      name: 'Task Running',
      datasource_id: datasourceId,
      mode: 'full',
      source_table: 'table1',
      schedule: '0 1 * * *',
      status: 'running',
      enabled: true,
      extracted_count: 500,
      total_count: 1000,
      progress_percent: 50,
      avg_duration_ms: 0,
      execution_count: 0,
      created_by: ADMIN_ACTIVE.id,
    });
    const task2 = taskRepo.create({
      name: 'Task Scheduled A',
      datasource_id: datasourceId,
      mode: 'full',
      source_table: 'table2',
      schedule: '0 2 * * *',
      status: 'scheduled',
      enabled: true,
      avg_duration_ms: 5000,
      execution_count: 10,
      created_by: ADMIN_ACTIVE.id,
    });
    const task3 = taskRepo.create({
      name: 'Task Scheduled B',
      datasource_id: datasourceId,
      mode: 'incremental',
      source_table: 'table3',
      incremental_column: 'updated_at',
      schedule: '0 3 * * *',
      status: 'scheduled',
      enabled: true,
      avg_duration_ms: 3000,
      execution_count: 5,
      created_by: ADMIN_ACTIVE.id,
    });
    const savedTasks = await taskRepo.save([task1, task2, task3]);

    // Create today's logs: 4 success, 1 failed
    const { todayStartUTC } = todayInTaipei();
    const todayMorning = new Date(todayStartUTC.getTime() + 2 * 60 * 60 * 1000); // +2h from today start

    for (let i = 0; i < 4; i++) {
      await logRepo.save(
        logRepo.create({
          task_id: savedTasks[1].id,
          status: 'completed',
          started_at: new Date(todayMorning.getTime() + i * 60000),
          finished_at: new Date(todayMorning.getTime() + i * 60000 + 30000),
          duration_ms: 30000,
          extracted_count: 100,
          total_count: 100,
          triggered_by: 'schedule',
          created_by: ADMIN_ACTIVE.id,
        }),
      );
    }
    await logRepo.save(
      logRepo.create({
        task_id: savedTasks[2].id,
        status: 'failed',
        started_at: new Date(todayMorning.getTime() + 5 * 60000),
        finished_at: new Date(todayMorning.getTime() + 5 * 60000 + 10000),
        duration_ms: 10000,
        extracted_count: 0,
        total_count: 50,
        error_message: 'Connection timeout',
        triggered_by: 'schedule',
        created_by: ADMIN_ACTIVE.id,
      }),
    );

    const res = await request(app.getHttpServer())
      .get('/api/v1/extraction-tasks/dashboard')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.summary.totalTasks).toBe(3);
    expect(res.body.summary.running).toBe(1);
    expect(res.body.summary.todaySuccess).toBe(4);
    expect(res.body.summary.todayFailed).toBe(1);
    expect(res.body.summary.successRate).toBe(80.0);
  });

  // TS-F024-002: 趨勢圖預設 7 天
  it('should return 7-day trend datapoints', async () => {
    const logRepo = dataSource.getRepository(ExtractionLog);
    const taskRepo = dataSource.getRepository(ExtractionTask);
    const tasks = await taskRepo.find();
    const taskId = tasks[0]?.id;
    if (!taskId) return;

    // Seed logs for past 10 days
    const { todayStartUTC } = todayInTaipei();
    for (let i = 0; i < 10; i++) {
      const dayStart = new Date(todayStartUTC.getTime() - i * 24 * 60 * 60 * 1000 + 3600000);
      await logRepo.save(
        logRepo.create({
          task_id: taskId,
          status: 'completed',
          started_at: dayStart,
          finished_at: new Date(dayStart.getTime() + 30000),
          duration_ms: 30000,
          extracted_count: 10,
          total_count: 10,
          triggered_by: 'schedule',
          created_by: ADMIN_ACTIVE.id,
        }),
      );
    }

    const res = await request(app.getHttpServer())
      .get('/api/v1/extraction-tasks/dashboard/trend?range=7d')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.datapoints).toBeDefined();
    expect(res.body.datapoints.length).toBeLessThanOrEqual(7);
    // Each datapoint should have date, success, failed
    for (const dp of res.body.datapoints) {
      expect(dp).toHaveProperty('date');
      expect(dp).toHaveProperty('success');
      expect(dp).toHaveProperty('failed');
    }
  });

  // TS-F024-003: 趨勢圖 14 天
  it('should return 14-day trend datapoints', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/extraction-tasks/dashboard/trend?range=14d')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.datapoints.length).toBeLessThanOrEqual(14);
  });

  // TS-F024-004: 趨勢圖 30 天
  it('should return 30-day trend datapoints', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/extraction-tasks/dashboard/trend?range=30d')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.datapoints.length).toBeLessThanOrEqual(30);
  });

  // TS-F024-005: 今日失敗清單正確
  it('should return today failure list with correct fields', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/extraction-tasks/dashboard')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.todayFailures.length).toBeGreaterThanOrEqual(1);
    const failure = res.body.todayFailures[0];
    expect(failure).toHaveProperty('taskId');
    expect(failure).toHaveProperty('taskName');
    expect(failure).toHaveProperty('failedAt');
    expect(failure).toHaveProperty('errorSummary');
    expect(failure).toHaveProperty('logId');
  });

  // TS-F024-006: 效能最差 Top 5
  it('should return top 5 slowest tasks sorted by avgDurationMs DESC', async () => {
    const taskRepo = dataSource.getRepository(ExtractionTask);
    const logRepo = dataSource.getRepository(ExtractionLog);

    // Clean up
    await logRepo.createQueryBuilder().delete().from(ExtractionLog).execute();
    await taskRepo.createQueryBuilder().delete().from(ExtractionTask).execute();

    // Create 6 tasks with different avg_duration_ms
    const tasksData = [];
    for (let i = 0; i < 6; i++) {
      tasksData.push(
        taskRepo.create({
          name: `Slow Task ${i}`,
          datasource_id: datasourceId,
          mode: 'full',
          source_table: `table_${i}`,
          schedule: '0 1 * * *',
          status: 'scheduled',
          enabled: true,
          avg_duration_ms: (i + 1) * 10000, // 10000, 20000, ..., 60000
          execution_count: i + 1,
          created_by: ADMIN_ACTIVE.id,
        }),
      );
    }
    await taskRepo.save(tasksData);

    const res = await request(app.getHttpServer())
      .get('/api/v1/extraction-tasks/dashboard')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.slowestTasks.length).toBe(5);
    // Verify descending order
    for (let i = 0; i < res.body.slowestTasks.length - 1; i++) {
      expect(res.body.slowestTasks[i].avgDurationMs).toBeGreaterThanOrEqual(
        res.body.slowestTasks[i + 1].avgDurationMs,
      );
    }
  });

  // TS-F024-007: 執行中任務進度條
  it('should return running tasks with progress info', async () => {
    const taskRepo = dataSource.getRepository(ExtractionTask);
    const logRepo = dataSource.getRepository(ExtractionLog);

    await logRepo.createQueryBuilder().delete().from(ExtractionLog).execute();
    await taskRepo.createQueryBuilder().delete().from(ExtractionTask).execute();

    const task = taskRepo.create({
      name: 'Running Progress Task',
      datasource_id: datasourceId,
      mode: 'full',
      source_table: 'table_progress',
      schedule: '0 1 * * *',
      status: 'running',
      enabled: true,
      extracted_count: 500,
      total_count: 1000,
      progress_percent: 50.0,
      avg_duration_ms: 0,
      execution_count: 0,
      created_by: ADMIN_ACTIVE.id,
    });
    await taskRepo.save(task);

    const res = await request(app.getHttpServer())
      .get('/api/v1/extraction-tasks/dashboard')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.runningTasks.length).toBe(1);
    expect(res.body.runningTasks[0].extractedCount).toBe(500);
    expect(res.body.runningTasks[0].totalCount).toBe(1000);
    expect(res.body.runningTasks[0].progressPercent).toBe(50.0);
    expect(res.body.runningTasks[0]).toHaveProperty('datasourceName');
  });

  // TS-F024-008: 非 Admin 無權存取（HTTP 403）
  it('should return 403 for non-admin user', async () => {
    const userToken = await getUserToken(app);

    const res1 = await request(app.getHttpServer())
      .get('/api/v1/extraction-tasks/dashboard')
      .set('Authorization', `Bearer ${userToken}`);
    expect(res1.status).toBe(403);

    const res2 = await request(app.getHttpServer())
      .get('/api/v1/extraction-tasks/dashboard/trend?range=7d')
      .set('Authorization', `Bearer ${userToken}`);
    expect(res2.status).toBe(403);
  });

  // TS-F024-009: range 參數無效（422 驗證）
  it('should return 422 for invalid range parameter', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/extraction-tasks/dashboard/trend?range=60d')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(422);
  });

  // TS-F024-010: 無任何任務的空狀態
  it('should return empty state when no tasks exist', async () => {
    const logRepo = dataSource.getRepository(ExtractionLog);
    const taskRepo = dataSource.getRepository(ExtractionTask);

    await logRepo.createQueryBuilder().delete().from(ExtractionLog).execute();
    await taskRepo.createQueryBuilder().delete().from(ExtractionTask).execute();

    const res = await request(app.getHttpServer())
      .get('/api/v1/extraction-tasks/dashboard')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.summary.totalTasks).toBe(0);
    expect(res.body.summary.running).toBe(0);
    expect(res.body.summary.todaySuccess).toBe(0);
    expect(res.body.summary.todayFailed).toBe(0);
    expect(res.body.summary.successRate).toBe(0);
    expect(res.body.runningTasks).toEqual([]);
    expect(res.body.todayFailures).toEqual([]);
    expect(res.body.slowestTasks).toEqual([]);
  });

  // TS-F024-011: 軟刪除任務不納入統計
  it('should exclude soft-deleted tasks from statistics', async () => {
    const taskRepo = dataSource.getRepository(ExtractionTask);
    const logRepo = dataSource.getRepository(ExtractionLog);

    await logRepo.createQueryBuilder().delete().from(ExtractionLog).execute();
    await taskRepo.createQueryBuilder().delete().from(ExtractionTask).execute();

    // Create 1 active + 1 soft-deleted
    const activeTask = taskRepo.create({
      name: 'Active Task',
      datasource_id: datasourceId,
      mode: 'full',
      source_table: 'active_table',
      schedule: '0 1 * * *',
      status: 'scheduled',
      enabled: true,
      avg_duration_ms: 5000,
      execution_count: 3,
      created_by: ADMIN_ACTIVE.id,
    });
    const deletedTask = taskRepo.create({
      name: 'Deleted Task',
      datasource_id: datasourceId,
      mode: 'full',
      source_table: 'deleted_table',
      schedule: '0 2 * * *',
      status: 'scheduled',
      enabled: true,
      avg_duration_ms: 9000,
      execution_count: 5,
      deleted_at: new Date(),
      created_by: ADMIN_ACTIVE.id,
    });
    await taskRepo.save([activeTask, deletedTask]);

    const res = await request(app.getHttpServer())
      .get('/api/v1/extraction-tasks/dashboard')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.summary.totalTasks).toBe(1);
    // slowestTasks should not include deleted task
    const slowestIds = res.body.slowestTasks.map((t: any) => t.taskId);
    expect(slowestIds).not.toContain(deletedTask.id);
  });
});
