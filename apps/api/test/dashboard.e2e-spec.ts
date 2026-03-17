import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
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
import { HttpExceptionFilter } from '@/common/filters/http-exception.filter';
import { User } from '@/database/entities/user.entity';
import { TokenBlocklist } from '@/database/entities/token-blocklist.entity';
import { PasswordResetToken } from '@/database/entities/password-reset-token.entity';
import { Datasource } from '@/database/entities/datasource.entity';
import { DatasourceHealthLog } from '@/database/entities/datasource-health-log.entity';
import { CONNECTION_TESTER } from '@/modules/datasource/connection-tester.provider';
import { HashUtil } from '@/common/hash/hash.util';
import { ADMIN_ACTIVE, USER_ACTIVE } from './seeds/test-data';

const TEST_AES_KEY = randomBytes(32).toString('hex');

async function createDashboardTestApp(): Promise<{
  app: INestApplication;
  mockConnectionTester: { testConnection: ReturnType<typeof vi.fn> };
}> {
  process.env.AES_ENCRYPTION_KEY = TEST_AES_KEY;

  const mockConnectionTester = {
    testConnection: vi.fn(),
  };

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
        entities: [User, TokenBlocklist, PasswordResetToken, Datasource, DatasourceHealthLog],
        synchronize: true,
      }),
      ThrottlerModule.forRoot([
        { name: 'login', ttl: 60000, limit: 100 },
      ]),
      AuthModule,
      AccountsModule,
      DatasourceModule,
      // Note: SchedulerModule is NOT imported to avoid automatic Cron jobs
    ],
    providers: [
      { provide: APP_GUARD, useClass: ThrottlerGuard },
    ],
  })
    .overrideProvider(CONNECTION_TESTER)
    .useValue(mockConnectionTester)
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

  // Seed users
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

  return { app, mockConnectionTester };
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

describe('F016: Dashboard E2E', () => {
  let app: INestApplication;
  let adminToken: string;
  let mockConnectionTester: { testConnection: ReturnType<typeof vi.fn> };
  let dsIds: string[] = [];

  const basePayload = {
    type: 'mysql',
    host: '192.168.1.100',
    port: 3306,
    databaseName: 'test_db',
    username: 'admin',
    password: 'Secret123',
  };

  beforeAll(async () => {
    const setup = await createDashboardTestApp();
    app = setup.app;
    mockConnectionTester = setup.mockConnectionTester;
    adminToken = await getAdminToken(app);

    // Create datasources with different types and statuses
    const datasourceDefs = [
      { name: 'MySQL Active 1', type: 'mysql', status: 'connected' },
      { name: 'MySQL Active 2', type: 'mysql', status: 'connected' },
      { name: 'PG Active', type: 'postgresql', status: 'connected' },
      { name: 'MSSQL Disconnected', type: 'sqlserver', status: 'disconnected' },
      { name: 'PG Unknown', type: 'postgresql', status: 'unknown' },
      { name: 'Soft Deleted DS', type: 'mysql', status: 'connected' },
    ];

    for (const def of datasourceDefs) {
      const res = await request(app.getHttpServer())
        .post('/api/v1/datasources')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ...basePayload, name: def.name, type: def.type });
      dsIds.push(res.body.id);
    }

    // Update statuses directly in DB
    const dataSource = app.get(DataSource);
    const dsRepo = dataSource.getRepository(Datasource);

    await dsRepo.update({ name: 'MySQL Active 1' }, { status: 'connected', last_tested_at: new Date() });
    await dsRepo.update({ name: 'MySQL Active 2' }, { status: 'connected', last_tested_at: new Date() });
    await dsRepo.update({ name: 'PG Active' }, { status: 'connected', last_tested_at: new Date() });
    await dsRepo.update({ name: 'MSSQL Disconnected' }, { status: 'disconnected', last_tested_at: new Date() });
    // PG Unknown stays as 'unknown'

    // Soft-delete one
    await dsRepo.update({ name: 'Soft Deleted DS' }, { deleted_at: new Date() });

    // Seed health logs for metrics and alerts testing
    const logRepo = dataSource.getRepository(DatasourceHealthLog);
    const now = Date.now();

    // DS-4 (MSSQL Disconnected): 3 consecutive failures for alerts
    const mssqlDs = await dsRepo.findOne({ where: { name: 'MSSQL Disconnected' } });
    if (mssqlDs) {
      await logRepo.save([
        logRepo.create({
          datasource_id: mssqlDs.id,
          success: false,
          response_time_ms: null,
          error_message: '連線被拒',
          checked_at: new Date(now - 90 * 60 * 1000),
        }),
        logRepo.create({
          datasource_id: mssqlDs.id,
          success: false,
          response_time_ms: null,
          error_message: '連線被拒',
          checked_at: new Date(now - 60 * 60 * 1000),
        }),
        logRepo.create({
          datasource_id: mssqlDs.id,
          success: false,
          response_time_ms: null,
          error_message: '連線逾時',
          checked_at: new Date(now - 30 * 60 * 1000),
        }),
      ]);
    }

    // DS-1 (MySQL Active 1): healthy with logs for metrics
    const mysqlDs = await dsRepo.findOne({ where: { name: 'MySQL Active 1' } });
    if (mysqlDs) {
      for (let i = 0; i < 10; i++) {
        await logRepo.save(
          logRepo.create({
            datasource_id: mysqlDs.id,
            success: true,
            response_time_ms: 30 + i * 2,
            error_message: null,
            checked_at: new Date(now - (10 - i) * 30 * 60 * 1000),
          }),
        );
      }
    }
  });

  afterAll(async () => {
    await app?.close();
  });

  // TS-F016-001: 摘要統計正確
  it('GET /api/v1/datasources/dashboard — should return correct summary', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/datasources/dashboard')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('summary');
    expect(res.body).toHaveProperty('datasources');

    // 5 non-deleted datasources
    expect(res.body.summary.total).toBe(5);
    expect(res.body.summary.connected).toBe(3);
    expect(res.body.summary.disconnected).toBe(1);
    expect(res.body.summary.unknown).toBe(1);
    // total = connected + disconnected + unknown
    expect(res.body.summary.total).toBe(
      res.body.summary.connected + res.body.summary.disconnected + res.body.summary.unknown,
    );
  });

  // TS-F016-002: 類型分佈正確
  it('GET /api/v1/datasources/dashboard — should return correct typeCounts', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/datasources/dashboard')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.summary.typeCounts).toEqual({
      mysql: 2,
      postgresql: 2,
      sqlserver: 1,
    });
  });

  // TS-F016-008: 排除軟刪除資料來源
  it('GET /api/v1/datasources/dashboard — should exclude soft-deleted datasources', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/datasources/dashboard')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const names = res.body.datasources.map((d: any) => d.name);
    expect(names).not.toContain('Soft Deleted DS');
    expect(res.body.datasources).toHaveLength(5);
  });

  // TS-F016-003: 效能趨勢圖 24h
  it('GET /api/v1/datasources/:id/metrics — should return 24h metrics', async () => {
    const dataSource = app.get(DataSource);
    const dsRepo = dataSource.getRepository(Datasource);
    const mysqlDs = await dsRepo.findOne({ where: { name: 'MySQL Active 1' } });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/datasources/${mysqlDs!.id}/metrics?range=24h`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.datasourceId).toBe(mysqlDs!.id);
    expect(res.body.range).toBe('24h');
    expect(Array.isArray(res.body.datapoints)).toBe(true);
    expect(res.body.datapoints.length).toBe(10);

    // Verify datapoint structure
    const dp = res.body.datapoints[0];
    expect(dp).toHaveProperty('timestamp');
    expect(dp).toHaveProperty('responseTimeMs');
    expect(dp).toHaveProperty('success');
  });

  // TS-F016-010: 無資料時的趨勢圖
  it('GET /api/v1/datasources/:id/metrics — should return empty array when no logs', async () => {
    const dataSource = app.get(DataSource);
    const dsRepo = dataSource.getRepository(Datasource);
    const pgDs = await dsRepo.findOne({ where: { name: 'PG Unknown' } });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/datasources/${pgDs!.id}/metrics?range=24h`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.datapoints).toEqual([]);
  });

  // Metrics: 404 for non-existent datasource
  it('GET /api/v1/datasources/:id/metrics — should return 404 for non-existent id', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/datasources/00000000-0000-0000-0000-000000000000/metrics?range=24h')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('DS_NOT_FOUND');
  });

  // TS-F016-005: 警示觸發（連續 2 次失敗）
  it('GET /api/v1/datasources/alerts — should return alerts for consecutive failures >= 2', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/datasources/alerts')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('alerts');
    expect(Array.isArray(res.body.alerts)).toBe(true);

    // MSSQL Disconnected has 3 consecutive failures
    const mssqlAlert = res.body.alerts.find((a: any) => a.name === 'MSSQL Disconnected');
    expect(mssqlAlert).toBeDefined();
    expect(mssqlAlert.consecutiveFailures).toBe(3);
    expect(mssqlAlert.lastErrorMessage).toBeDefined();
    expect(mssqlAlert.firstFailureTime).toBeDefined();
  });

  // TS-F016-006: 警示移除（恢復連線）
  it('GET /api/v1/datasources/alerts — should remove alert after recovery', async () => {
    const dataSource = app.get(DataSource);
    const dsRepo = dataSource.getRepository(Datasource);
    const logRepo = dataSource.getRepository(DatasourceHealthLog);

    const mssqlDs = await dsRepo.findOne({ where: { name: 'MSSQL Disconnected' } });

    // Add a successful health log (recovery)
    await logRepo.save(
      logRepo.create({
        datasource_id: mssqlDs!.id,
        success: true,
        response_time_ms: 50,
        error_message: null,
        checked_at: new Date(),
      }),
    );

    const res = await request(app.getHttpServer())
      .get('/api/v1/datasources/alerts')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const mssqlAlert = res.body.alerts.find((a: any) => a.name === 'MSSQL Disconnected');
    expect(mssqlAlert).toBeUndefined();
  });

  // TS-F016-007: 非 Admin 存取儀表板
  it('GET /api/v1/datasources/dashboard — should return 403 for non-admin', async () => {
    const userToken = await getUserToken(app);

    const res = await request(app.getHttpServer())
      .get('/api/v1/datasources/dashboard')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('AUTH_FORBIDDEN');
  });

  it('GET /api/v1/datasources/alerts — should return 403 for non-admin', async () => {
    const userToken = await getUserToken(app);

    const res = await request(app.getHttpServer())
      .get('/api/v1/datasources/alerts')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('AUTH_FORBIDDEN');
  });

  // Verify dashboard route works and doesn't conflict with :id
  it('should not confuse dashboard/alerts routes with :id param', async () => {
    // dashboard route
    const dashRes = await request(app.getHttpServer())
      .get('/api/v1/datasources/dashboard')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(dashRes.status).toBe(200);
    expect(dashRes.body).toHaveProperty('summary');

    // alerts route
    const alertsRes = await request(app.getHttpServer())
      .get('/api/v1/datasources/alerts')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(alertsRes.status).toBe(200);
    expect(alertsRes.body).toHaveProperty('alerts');

    // :id route still works
    const dataSource = app.get(DataSource);
    const dsRepo = dataSource.getRepository(Datasource);
    const mysqlDs = await dsRepo.findOne({ where: { name: 'MySQL Active 1' } });
    const idRes = await request(app.getHttpServer())
      .get(`/api/v1/datasources/${mysqlDs!.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(idRes.status).toBe(200);
    expect(idRes.body.name).toBe('MySQL Active 1');
  });
});
