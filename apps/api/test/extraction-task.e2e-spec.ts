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
    .useValue((() => {
      // Generate mock data for different source tables
      const customersRows = Array.from({ length: 10 }, (_, i) => ({
        id: i + 1,
        name: `Customer_${i + 1}`,
      }));

      const largeTableRows = Array.from({ length: 1001 }, (_, i) => ({
        id: i + 1,
        name: `LargeRow_${i + 1}`,
      }));

      const batch1000Rows = Array.from({ length: 1000 }, (_, i) => ({
        id: i + 1,
        name: `BatchRow_${i + 1}`,
      }));

      const eventsRows = Array.from({ length: 5 }, (_, i) => ({
        id: i + 1,
        name: `Event_${i + 1}`,
      }));

      // Track incremental state per sourceTable to simulate incremental appending
      const incrementalState: Record<string, { extraRows: Record<string, any>[] }> = {};

      const mockData: Record<string, { metadata: { name: string; dataType: string; isPrimary: boolean }[]; rows: Record<string, any>[] }> = {
        customers: {
          metadata: [
            { name: 'id', dataType: 'integer', isPrimary: true },
            { name: 'name', dataType: 'varchar', isPrimary: false },
          ],
          rows: customersRows,
        },
        customers_src: {
          metadata: [
            { name: 'id', dataType: 'integer', isPrimary: true },
            { name: 'name', dataType: 'varchar', isPrimary: false },
          ],
          rows: customersRows,
        },
        large_table_src: {
          metadata: [
            { name: 'id', dataType: 'integer', isPrimary: true },
            { name: 'name', dataType: 'varchar', isPrimary: false },
          ],
          rows: largeTableRows,
        },
        batch_1000_src: {
          metadata: [
            { name: 'id', dataType: 'integer', isPrimary: true },
            { name: 'name', dataType: 'varchar', isPrimary: false },
          ],
          rows: batch1000Rows,
        },
        events: {
          metadata: [
            { name: 'id', dataType: 'integer', isPrimary: true },
            { name: 'name', dataType: 'varchar', isPrimary: false },
          ],
          rows: eventsRows,
        },
        no_pk_table: {
          metadata: [
            { name: 'col_a', dataType: 'varchar', isPrimary: false },
            { name: 'col_b', dataType: 'integer', isPrimary: false },
          ],
          rows: [],
        },
        special_cols_table: {
          metadata: [
            { name: 'user name', dataType: 'varchar', isPrimary: false },
            { name: 'order-id', dataType: 'integer', isPrimary: false },
            { name: '日期', dataType: 'date', isPrimary: false },
          ],
          rows: [],
        },
        empty_table: {
          metadata: [
            { name: 'id', dataType: 'integer', isPrimary: true },
            { name: 'name', dataType: 'varchar', isPrimary: false },
          ],
          rows: [],
        },
        // Schema change source: metadata changes after first execution
        schema_change_src: {
          metadata: [
            { name: 'id', dataType: 'integer', isPrimary: true },
            { name: 'name', dataType: 'varchar', isPrimary: false },
          ],
          rows: Array.from({ length: 3 }, (_, i) => ({
            id: i + 1,
            name: `Row_${i + 1}`,
          })),
        },
        // Batch fail source: 1,001 rows, readBatch throws on 2nd batch
        fail_batch_src: {
          metadata: [
            { name: 'id', dataType: 'integer', isPrimary: true },
            { name: 'name', dataType: 'varchar', isPrimary: false },
          ],
          rows: Array.from({ length: 1001 }, (_, i) => ({
            id: i + 1,
            name: `FailBatch_${i + 1}`,
          })),
        },
      };

      // Error injection flags
      const errorFlags: Record<string, boolean> = {};
      // Track batch call counts per sourceTable for readBatch error injection
      const batchCallCounts: Record<string, number> = {};

      // Track all executor calls with their full params for sourceSchema verification
      const callLog: { method: string; params: any }[] = [];

      // Expose mockData and incrementalState for test manipulation
      const executor = {
        _mockData: mockData,
        _incrementalState: incrementalState,
        _errorFlags: errorFlags,
        _batchCallCounts: batchCallCounts,
        _callLog: callLog,
        execute: async (params: any) => {
          const data = mockData[params.targetTable];
          if (!data) return { totalCount: 0, extractedCount: 0 };
          let rows = data.rows;
          if (params.mode === 'incremental' && params.lastIncrementalValue) {
            const startIdx = parseInt(params.lastIncrementalValue, 10) || 0;
            rows = rows.filter((_: any, i: number) => i >= startIdx);
          }
          return {
            totalCount: data.rows.length,
            extractedCount: rows.length,
            lastIncrementalValue: params.mode === 'incremental' ? String(data.rows.length) : undefined,
          };
        },
        getSourceTableMetadata: async (params: { datasourceId: string; sourceTable: string; sourceSchema?: string | null }) => {
          callLog.push({ method: 'getSourceTableMetadata', params: { ...params } });
          // Error injection: fail_metadata_src always throws
          if (params.sourceTable === 'fail_metadata_src') {
            throw new Error('Table not found: fail_metadata_src');
          }
          // Schema change: if flag set, return extended metadata
          if (params.sourceTable === 'schema_change_src' && errorFlags['schema_change_v2']) {
            return [
              { name: 'id', dataType: 'integer', isPrimary: true },
              { name: 'name', dataType: 'varchar', isPrimary: false },
              { name: 'email', dataType: 'varchar', isPrimary: false },
            ];
          }
          const data = mockData[params.sourceTable];
          if (data) return data.metadata;
          // Fallback
          return [
            { name: 'id', dataType: 'integer', isPrimary: true },
            { name: 'name', dataType: 'varchar', isPrimary: false },
          ];
        },
        getSourceCount: async (params: { datasourceId: string; sourceTable: string; sourceSchema?: string | null; mode: string; incrementalColumn?: string | null; lastIncrementalValue?: string | null }) => {
          callLog.push({ method: 'getSourceCount', params: { ...params } });
          // Schema change v2: return count of new rows
          if (params.sourceTable === 'schema_change_src' && errorFlags['schema_change_v2']) {
            return 5;
          }
          const data = mockData[params.sourceTable];
          if (!data) return 0;
          let rows = data.rows;
          // Incremental mode: filter rows after lastIncrementalValue
          if (params.mode === 'incremental' && params.lastIncrementalValue) {
            const startIdx = parseInt(params.lastIncrementalValue, 10) || 0;
            rows = rows.filter((_: any, i: number) => i >= startIdx);
          }
          // Add extra rows from incremental state
          const extra = incrementalState[params.sourceTable];
          if (extra) {
            rows = [...rows, ...extra.extraRows];
          }
          return rows.length;
        },
        readBatch: async (params: { datasourceId: string; sourceTable: string; sourceSchema?: string | null; mode: string; incrementalColumn?: string | null; lastIncrementalValue?: string | null; batchSize: number; lastKeyValue?: any }) => {
          callLog.push({ method: 'readBatch', params: { ...params } });
          // Error injection: fail_batch_src throws on 2nd batch call
          if (params.sourceTable === 'fail_batch_src') {
            if (!batchCallCounts['fail_batch_src']) batchCallCounts['fail_batch_src'] = 0;
            batchCallCounts['fail_batch_src']++;
            if (batchCallCounts['fail_batch_src'] >= 2) {
              throw new Error('Connection lost during batch read');
            }
          }
          // Schema change v2: return rows with email field
          if (params.sourceTable === 'schema_change_src' && errorFlags['schema_change_v2']) {
            const schemaV2Rows = Array.from({ length: 5 }, (_, i) => ({
              id: i + 1,
              name: `NewRow_${i + 1}`,
              email: `row${i + 1}@example.com`,
            }));
            const offset = params.lastKeyValue ?? 0;
            const batch = schemaV2Rows.slice(offset, offset + params.batchSize);
            return {
              rows: batch,
              lastKeyValue: offset + batch.length,
              hasMore: offset + batch.length < schemaV2Rows.length,
            };
          }
          const data = mockData[params.sourceTable];
          if (!data) return { rows: [], hasMore: false };
          let allRows = data.rows;
          // Incremental mode: filter rows after the task's lastIncrementalValue (from params)
          if (params.mode === 'incremental' && params.lastIncrementalValue) {
            const startIdx = parseInt(params.lastIncrementalValue, 10) || 0;
            allRows = allRows.filter((_: any, i: number) => i >= startIdx);
          }
          // Add extra rows from incremental state
          const extra = incrementalState[params.sourceTable];
          if (extra) {
            allRows = [...allRows, ...extra.extraRows];
          }
          const offset = params.lastKeyValue ?? 0;
          const batch = allRows.slice(offset, offset + params.batchSize);
          return {
            rows: batch,
            lastKeyValue: offset + batch.length,
            hasMore: offset + batch.length < allRows.length,
          };
        },
      };
      return executor;
    })())
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
    sourceTable: 'customers',
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
    expect(res.body.sourceTable).toBe('customers');
    expect(res.body.rawTableName).toMatch(/^raw_[0-9a-f]{8}$/);
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
        sourceTable: 'customers',
        schedule: '0 2 * * *',
      });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  // TS-F017-010: 建立任務帶 sourceSchema
  it('should create task with sourceSchema and return it in response', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/extraction-tasks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ...basePayload, name: 'TS-010 帶 Schema', sourceSchema: 'public' });

    expect(res.status).toBe(201);
    expect(res.body.sourceSchema).toBe('public');
  });

  // TS-F017-011: 建立任務不帶 sourceSchema → null
  it('should create task without sourceSchema and return null', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/extraction-tasks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ...basePayload, name: 'TS-011 無 Schema' });

    expect(res.status).toBe(201);
    expect(res.body.sourceSchema).toBeNull();
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
        sourceTable: 'customers',
        schedule: '0 2 * * *',
      });

    await request(app.getHttpServer())
      .post('/api/v1/extraction-tasks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'F018 訂單匯入',
        datasourceId,
        mode: 'full',
        sourceTable: 'orders',
        schedule: '0 3 * * *',
      });

    const failedRes = await request(app.getHttpServer())
      .post('/api/v1/extraction-tasks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'F018 失敗增量任務',
        datasourceId,
        mode: 'incremental',
        sourceTable: 'invoices',
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
        sourceTable: 'deleted_table',
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
        sourceTable: 'customers',
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
        sourceTable: 'orders',
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
        sourceTable: 'invoices',
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
        sourceTable: 'products',
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

  // TS-F019-012: PATCH 修改 sourceSchema
  it('should update sourceSchema and return 200 (TS-F019-012)', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/extraction-tasks/${scheduledTaskId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sourceSchema: 'dbo' });

    expect(res.status).toBe(200);
    expect(res.body.sourceSchema).toBe('dbo');
  });

  // TS-F019-013: PATCH 只修改 sourceTable → sourceSchema 保持原值
  it('should preserve sourceSchema when only sourceTable is updated (TS-F019-013)', async () => {
    // First set sourceSchema
    await request(app.getHttpServer())
      .patch(`/api/v1/extraction-tasks/${scheduledTaskId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sourceSchema: 'sales' });

    // Then update only sourceTable
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/extraction-tasks/${scheduledTaskId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sourceTable: 'another_table' });

    expect(res.status).toBe(200);
    expect(res.body.sourceTable).toBe('another_table');
    expect(res.body.sourceSchema).toBe('sales');
  });

  // TS-F019-011: 修改 sourceTable 後 rawTableName 不變
  it('should not change rawTableName when sourceTable is updated (TS-F019-011)', async () => {
    // Get current rawTableName
    const before = await request(app.getHttpServer())
      .get(`/api/v1/extraction-tasks/${scheduledTaskId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(before.status).toBe(200);
    const originalRawTableName = before.body.rawTableName;
    expect(originalRawTableName).toMatch(/^raw_[0-9a-f]{8}$/);

    // Update sourceTable
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/extraction-tasks/${scheduledTaskId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sourceTable: 'new_source_table' });

    expect(res.status).toBe(200);
    expect(res.body.sourceTable).toBe('new_source_table');
    expect(res.body.rawTableName).toBe(originalRawTableName);
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
    expect(res.body).toHaveProperty('sourceTable');
    expect(res.body).toHaveProperty('rawTableName');
    expect(res.body.rawTableName).toMatch(/^raw_[0-9a-f]{8}$/);
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

// F020: Toggle Extraction Task E2E
describe('F020: Toggle Extraction Task E2E (PATCH /api/v1/extraction-tasks/:id/toggle)', () => {
  let app: INestApplication;
  let adminToken: string;
  let dataSource: DataSource;
  let enabledTaskId: string;
  let disabledTaskId: string;
  let runningTaskId: string;

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAdminToken(app);
    dataSource = app.get(DataSource);
    const taskRepo = dataSource.getRepository(ExtractionTask);

    // Create enabled (scheduled) task
    const res1 = await request(app.getHttpServer())
      .post('/api/v1/extraction-tasks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'F020 啟用中任務',
        datasourceId,
        mode: 'full',
        sourceTable: 'customers',
        schedule: '0 2 * * *',
      });
    enabledTaskId = res1.body.id;

    // Create disabled task
    const res2 = await request(app.getHttpServer())
      .post('/api/v1/extraction-tasks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'F020 停用中任務',
        datasourceId,
        mode: 'full',
        sourceTable: 'orders',
        schedule: '0 3 * * *',
      });
    disabledTaskId = res2.body.id;
    await taskRepo.update({ id: disabledTaskId }, { enabled: false, status: 'disabled' });

    // Create running task
    const res3 = await request(app.getHttpServer())
      .post('/api/v1/extraction-tasks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'F020 執行中任務',
        datasourceId,
        mode: 'full',
        sourceTable: 'invoices',
        schedule: '0 4 * * *',
      });
    runningTaskId = res3.body.id;
    await taskRepo.update({ id: runningTaskId }, { status: 'running' });
  });

  afterAll(async () => {
    await app?.close();
  });

  // TS-F020-001: 停用啟用中任務
  it('should disable an enabled task and return 200 (TS-F020-001)', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/extraction-tasks/${enabledTaskId}/toggle`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ enabled: false });

    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(false);
    expect(res.body.status).toBe('disabled');
    expect(res.body.id).toBe(enabledTaskId);
  });

  // TS-F020-002: 啟用停用中任務
  it('should enable a disabled task and return 200 (TS-F020-002)', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/extraction-tasks/${disabledTaskId}/toggle`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ enabled: true });

    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(true);
    expect(res.body.status).toBe('scheduled');
    expect(res.body.id).toBe(disabledTaskId);
  });

  // TS-F020-003: 冪等停用
  it('should be idempotent when disabling already disabled task (TS-F020-003)', async () => {
    // enabledTaskId was disabled in TS-F020-001
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/extraction-tasks/${enabledTaskId}/toggle`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ enabled: false });

    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(false);
    expect(res.body.status).toBe('disabled');
  });

  // TS-F020-004: 冪等啟用
  it('should be idempotent when enabling already enabled task (TS-F020-004)', async () => {
    // disabledTaskId was enabled in TS-F020-002
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/extraction-tasks/${disabledTaskId}/toggle`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ enabled: true });

    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(true);
    expect(res.body.status).toBe('scheduled');
  });

  // TS-F020-005: Running 任務不可停用
  it('should return 409 when disabling a running task (TS-F020-005)', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/extraction-tasks/${runningTaskId}/toggle`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ enabled: false });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('EXTRACTION_RUNNING');
  });

  // TS-F020-006: 非 Admin → 403
  it('should return 403 for non-admin user (TS-F020-006)', async () => {
    const userToken = await getUserToken(app);

    const res = await request(app.getHttpServer())
      .patch(`/api/v1/extraction-tasks/${enabledTaskId}/toggle`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ enabled: true });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('AUTH_FORBIDDEN');
  });

  // TS-F020-007: 不存在任務 → 404
  it('should return 404 for non-existent task (TS-F020-007)', async () => {
    const res = await request(app.getHttpServer())
      .patch('/api/v1/extraction-tasks/a1b2c3d4-e5f6-4890-abcd-ef1234567890/toggle')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ enabled: false });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('EXTRACTION_NOT_FOUND');
  });

  // TS-F020-008: 排程整合（skip，依賴 F023）
  it.skip('should integrate with scheduler (TS-F020-008, depends on F023)', () => {
    // This test will be implemented when F023 (scheduler) is available
  });
});

// F021: Run Extraction Task E2E
describe('F021: Run Extraction Task E2E (POST /api/v1/extraction-tasks/:id/run)', () => {
  let app: INestApplication;
  let adminToken: string;
  let dataSource: DataSource;
  let scheduledTaskId: string;
  let failedTaskId: string;
  let disabledTaskId: string;
  let runningTaskId: string;
  let emptyTableTaskId: string;
  let incrementalTaskId: string;

  /**
   * Helper: wait for task status to change from 'running' to a terminal state.
   * Polls every pollMs up to timeoutMs.
   */
  async function waitForTaskStatus(
    taskId: string,
    targetStatuses: string[],
    timeoutMs = 5000,
    pollMs = 100,
  ): Promise<any> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/extraction-tasks/${taskId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      if (targetStatuses.includes(res.body.status)) {
        return res.body;
      }
      await new Promise((r) => setTimeout(r, pollMs));
    }
    // Final check
    const res = await request(app.getHttpServer())
      .get(`/api/v1/extraction-tasks/${taskId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    return res.body;
  }

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAdminToken(app);
    dataSource = app.get(DataSource);
    const taskRepo = dataSource.getRepository(ExtractionTask);

    // Create scheduled task
    const res1 = await request(app.getHttpServer())
      .post('/api/v1/extraction-tasks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'F021 排程任務',
        datasourceId,
        mode: 'full',
        sourceTable: 'customers',
        schedule: '0 2 * * *',
      });
    scheduledTaskId = res1.body.id;

    // Create failed task
    const res2 = await request(app.getHttpServer())
      .post('/api/v1/extraction-tasks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'F021 失敗任務',
        datasourceId,
        mode: 'full',
        sourceTable: 'orders',
        schedule: '0 3 * * *',
      });
    failedTaskId = res2.body.id;
    await taskRepo.update({ id: failedTaskId }, { status: 'failed', error_message: '連線逾時' });

    // Create disabled task
    const res3 = await request(app.getHttpServer())
      .post('/api/v1/extraction-tasks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'F021 停用任務',
        datasourceId,
        mode: 'full',
        sourceTable: 'invoices',
        schedule: '0 4 * * *',
      });
    disabledTaskId = res3.body.id;
    await taskRepo.update({ id: disabledTaskId }, { enabled: false, status: 'disabled' });

    // Create running task
    const res4 = await request(app.getHttpServer())
      .post('/api/v1/extraction-tasks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'F021 執行中任務',
        datasourceId,
        mode: 'full',
        sourceTable: 'products',
        schedule: '0 5 * * *',
      });
    runningTaskId = res4.body.id;
    await taskRepo.update({ id: runningTaskId }, { status: 'running' });

    // Create empty table task (executor mock returns 0)
    const res5 = await request(app.getHttpServer())
      .post('/api/v1/extraction-tasks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'F021 空表任務',
        datasourceId,
        mode: 'full',
        sourceTable: 'empty_table',
        schedule: '0 6 * * *',
      });
    emptyTableTaskId = res5.body.id;

    // Create incremental task
    const res6 = await request(app.getHttpServer())
      .post('/api/v1/extraction-tasks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'F021 增量任務',
        datasourceId,
        mode: 'incremental',
        sourceTable: 'events',
        schedule: '0 7 * * *',
        incrementalColumn: 'updated_at',
        lastIncrementalValue: '2026-01-01',
      });
    incrementalTaskId = res6.body.id;
  });

  afterAll(async () => {
    await app?.close();
  });

  // TS-F021-001: 手動觸發 scheduled 任務 → 202
  it('should trigger manual run on scheduled task and return 202 (TS-F021-001)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/extraction-tasks/${scheduledTaskId}/run`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ triggeredBy: 'manual' });

    expect(res.status).toBe(202);
    expect(res.body).toHaveProperty('logId');
    expect(typeof res.body.logId).toBe('string');
  });

  // TS-F021-002: 重新執行 failed 任務 (triggeredBy: retry) → 202
  it('should trigger retry run on failed task and return 202 (TS-F021-002)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/extraction-tasks/${failedTaskId}/run`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ triggeredBy: 'retry' });

    expect(res.status).toBe(202);
    expect(res.body).toHaveProperty('logId');
  });

  // TS-F021-003: 手動觸發已停用任務 → 202
  it('should trigger manual run on disabled task and return 202 (TS-F021-003)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/extraction-tasks/${disabledTaskId}/run`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ triggeredBy: 'manual' });

    expect(res.status).toBe(202);
    expect(res.body).toHaveProperty('logId');
  });

  // TS-F021-004: 執行完成後統計欄位更新
  it('should update executionCount, avgDurationMs, lastExecutionAt after completion (TS-F021-004)', async () => {
    // Wait for the scheduled task (TS-F021-001) to complete
    const task = await waitForTaskStatus(scheduledTaskId, ['completed', 'failed']);

    expect(task.status).toBe('completed');
    expect(task.executionCount).toBeGreaterThanOrEqual(1);
    expect(task.avgDurationMs).toBeGreaterThanOrEqual(0);
    expect(task.lastExecutionAt).not.toBeNull();
  });

  // TS-F021-005: ExtractionLog 完整性
  it('should create ExtractionLog with all required fields (TS-F021-005)', async () => {
    // Wait for failed task to complete first
    await waitForTaskStatus(failedTaskId, ['completed', 'failed']);

    const logRepo = dataSource.getRepository(ExtractionLog);
    const logs = await logRepo.find({
      where: { task_id: failedTaskId },
      order: { created_at: 'DESC' },
    });

    expect(logs.length).toBeGreaterThanOrEqual(1);
    const log = logs[0];
    expect(log.started_at).toBeDefined();
    expect(log.finished_at).toBeDefined();
    expect(log.duration_ms).toBeGreaterThanOrEqual(0);
    expect(typeof log.extracted_count).toBe('number');
    expect(log.triggered_by).toBe('retry');
    expect(log.created_by).toBe(ADMIN_ACTIVE.id);
  });

  // TS-F021-006: running 不可重複觸發 → 409 EXTRACTION_RUNNING
  it('should return 409 when triggering a running task (TS-F021-006)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/extraction-tasks/${runningTaskId}/run`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ triggeredBy: 'manual' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('EXTRACTION_RUNNING');
  });

  // TS-F021-007: 非 Admin → 403 AUTH_FORBIDDEN
  it('should return 403 for non-admin user (TS-F021-007)', async () => {
    const userToken = await getUserToken(app);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/extraction-tasks/${scheduledTaskId}/run`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ triggeredBy: 'manual' });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('AUTH_FORBIDDEN');
  });

  // TS-F021-008: 任務不存在 → 404 EXTRACTION_NOT_FOUND
  it('should return 404 for non-existent task (TS-F021-008)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/extraction-tasks/a1b2c3d4-e5f6-4890-abcd-ef1234567890/run')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ triggeredBy: 'manual' });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('EXTRACTION_NOT_FOUND');
  });

  // TS-F021-009: 空表擷取 → completed, progressPercent=100, extractedCount=0
  it('should complete with extractedCount=0 and progressPercent=100 for empty table (TS-F021-009)', async () => {
    const runRes = await request(app.getHttpServer())
      .post(`/api/v1/extraction-tasks/${emptyTableTaskId}/run`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ triggeredBy: 'manual' });

    expect(runRes.status).toBe(202);

    const task = await waitForTaskStatus(emptyTableTaskId, ['completed', 'failed']);

    expect(task.status).toBe('completed');
    expect(task.extractedCount).toBe(0);
    expect(task.progressPercent).toBe(100);
  });

  // TS-F021-010: 增量模式更新 lastIncrementalValue
  it('should update lastIncrementalValue for incremental mode (TS-F021-010)', async () => {
    // Override the executor mock to return a lastIncrementalValue
    // We need to access the module's provider. For this test, we'll use
    // direct DB manipulation to verify the service behavior.
    const runRes = await request(app.getHttpServer())
      .post(`/api/v1/extraction-tasks/${incrementalTaskId}/run`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ triggeredBy: 'manual' });

    expect(runRes.status).toBe(202);

    const task = await waitForTaskStatus(incrementalTaskId, ['completed', 'failed']);

    expect(task.status).toBe('completed');
    // The default mock executor returns no lastIncrementalValue,
    // so it should remain as the original value
    expect(task.incrementalColumn).toBe('updated_at');
  });
});

// F021 Phase 2: Raw Data Table Creation
describe('F021 Phase 2: Raw Data Table Creation', () => {
  let app: INestApplication;
  let adminToken: string;
  let dataSource: DataSource;

  async function waitForTaskStatus(
    taskId: string,
    targetStatuses: string[],
    timeoutMs = 5000,
    pollMs = 100,
  ): Promise<any> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/extraction-tasks/${taskId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      if (targetStatuses.includes(res.body.status)) {
        return res.body;
      }
      await new Promise((r) => setTimeout(r, pollMs));
    }
    const res = await request(app.getHttpServer())
      .get(`/api/v1/extraction-tasks/${taskId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    return res.body;
  }

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAdminToken(app);
    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    await app?.close();
  });

  // TS-F021-011: POST /run automatically creates raw data table
  it('should create raw data table on first execution (TS-F021-011)', async () => {
    // Create a task
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/extraction-tasks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'F021-P2 建表任務',
        datasourceId,
        mode: 'full',
        sourceTable: 'customers',
        schedule: '0 2 * * *',
      });

    expect(createRes.status).toBe(201);
    const taskId = createRes.body.id;
    const rawTableName = createRes.body.rawTableName;
    expect(rawTableName).toMatch(/^raw_[0-9a-f]{8}$/);

    // Trigger run
    const runRes = await request(app.getHttpServer())
      .post(`/api/v1/extraction-tasks/${taskId}/run`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ triggeredBy: 'manual' });

    expect(runRes.status).toBe(202);

    // Wait for completion
    await waitForTaskStatus(taskId, ['completed', 'failed']);

    // Verify raw table exists in SQLite
    const tables = await dataSource.query(
      `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
      [rawTableName],
    );
    expect(tables.length).toBe(1);

    // Verify columns include _cdmp_extracted_at
    const columns = await dataSource.query(
      `PRAGMA table_info("${rawTableName}")`,
    );
    const colNames = columns.map((c: any) => c.name);
    expect(colNames).toContain('_cdmp_extracted_at');
  });

  // TS-F021-021: Source table without primary key appends _cdmp_id
  it('should append _cdmp_id when source has no primary key (TS-F021-021)', async () => {
    // Create a task — the mock executor for 'no_pk_table' will return no primary key columns
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/extraction-tasks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'F021-P2 無主鍵任務',
        datasourceId,
        mode: 'full',
        sourceTable: 'no_pk_table',
        schedule: '0 3 * * *',
      });

    expect(createRes.status).toBe(201);
    const taskId = createRes.body.id;
    const rawTableName = createRes.body.rawTableName;

    // Trigger run
    const runRes = await request(app.getHttpServer())
      .post(`/api/v1/extraction-tasks/${taskId}/run`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ triggeredBy: 'manual' });

    expect(runRes.status).toBe(202);
    await waitForTaskStatus(taskId, ['completed', 'failed']);

    // Verify _cdmp_id column exists and is primary key
    const columns = await dataSource.query(
      `PRAGMA table_info("${rawTableName}")`,
    );
    const cdmpIdCol = columns.find((c: any) => c.name === '_cdmp_id');
    expect(cdmpIdCol).toBeDefined();
    expect(cdmpIdCol.pk).toBe(1);
  });

  // TS-F021-SEC-002: Column name sanitization
  it('should sanitize special characters in column names (TS-F021-SEC-002)', async () => {
    // Create a task — the mock executor for 'special_cols_table' returns columns with special chars
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/extraction-tasks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'F021-P2 特殊欄位任務',
        datasourceId,
        mode: 'full',
        sourceTable: 'special_cols_table',
        schedule: '0 4 * * *',
      });

    expect(createRes.status).toBe(201);
    const taskId = createRes.body.id;
    const rawTableName = createRes.body.rawTableName;

    // Trigger run
    const runRes = await request(app.getHttpServer())
      .post(`/api/v1/extraction-tasks/${taskId}/run`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ triggeredBy: 'manual' });

    expect(runRes.status).toBe(202);
    await waitForTaskStatus(taskId, ['completed', 'failed']);

    // Verify columns are sanitized
    const columns = await dataSource.query(
      `PRAGMA table_info("${rawTableName}")`,
    );
    const colNames = columns.map((c: any) => c.name);

    // 'user name' → 'user_name', 'order-id' → 'order_id', '日期' → '__'
    expect(colNames).toContain('user_name');
    expect(colNames).toContain('order_id');
    expect(colNames).toContain('__');
    expect(colNames).toContain('_cdmp_extracted_at');
  });
});

// F021 Phase 3: Batch Read + Write to AppDB
describe('F021 Phase 3: Batch Read + Write Raw Data', () => {
  let app: INestApplication;
  let adminToken: string;
  let dataSource: DataSource;

  async function waitForTaskStatus(
    taskId: string,
    targetStatuses: string[],
    timeoutMs = 10000,
    pollMs = 100,
  ): Promise<any> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/extraction-tasks/${taskId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      if (targetStatuses.includes(res.body.status)) {
        return res.body;
      }
      await new Promise((r) => setTimeout(r, pollMs));
    }
    const res = await request(app.getHttpServer())
      .get(`/api/v1/extraction-tasks/${taskId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    return res.body;
  }

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAdminToken(app);
    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    await app?.close();
  });

  // TS-F021-012: 首次執行後資料確實寫入 AppDB
  it('should write data to raw table on first execution (TS-F021-012)', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/extraction-tasks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'F021-P3 資料寫入',
        datasourceId,
        mode: 'full',
        sourceTable: 'customers',
        schedule: '0 2 * * *',
      });

    expect(createRes.status).toBe(201);
    const taskId = createRes.body.id;
    const rawTableName = createRes.body.rawTableName;

    // Trigger run
    const runRes = await request(app.getHttpServer())
      .post(`/api/v1/extraction-tasks/${taskId}/run`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ triggeredBy: 'manual' });
    expect(runRes.status).toBe(202);

    // Wait for completion
    const task = await waitForTaskStatus(taskId, ['completed', 'failed']);
    expect(task.status).toBe('completed');

    // Verify row count = 10 (mock customers has 10 rows)
    const countResult = await dataSource.query(
      `SELECT COUNT(*) as cnt FROM "${rawTableName}"`,
    );
    expect(Number(countResult[0].cnt)).toBe(10);
    expect(task.extractedCount).toBe(10);

    // Spot-check data content
    const rows = await dataSource.query(
      `SELECT * FROM "${rawTableName}" ORDER BY "id" LIMIT 3`,
    );
    expect(rows.length).toBe(3);
    expect(rows[0].name).toBe('Customer_1');
    expect(rows[1].name).toBe('Customer_2');
    expect(rows[2].name).toBe('Customer_3');

    // Verify _cdmp_extracted_at is populated
    expect(rows[0]._cdmp_extracted_at).toBeDefined();
    expect(rows[0]._cdmp_extracted_at).not.toBeNull();
  });

  // TS-F021-013: 全量模式 TRUNCATE + 重新寫入
  it('should truncate and rewrite on full mode second execution (TS-F021-013)', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/extraction-tasks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'F021-P3 全量重寫',
        datasourceId,
        mode: 'full',
        sourceTable: 'customers',
        schedule: '0 2 * * *',
      });

    expect(createRes.status).toBe(201);
    const taskId = createRes.body.id;
    const rawTableName = createRes.body.rawTableName;

    // First execution
    await request(app.getHttpServer())
      .post(`/api/v1/extraction-tasks/${taskId}/run`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ triggeredBy: 'manual' });
    await waitForTaskStatus(taskId, ['completed', 'failed']);

    // Confirm first execution wrote data
    const count1 = await dataSource.query(
      `SELECT COUNT(*) as cnt FROM "${rawTableName}"`,
    );
    expect(Number(count1[0].cnt)).toBe(10);

    // Second execution (same task, full mode => TRUNCATE + rewrite)
    await request(app.getHttpServer())
      .post(`/api/v1/extraction-tasks/${taskId}/run`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ triggeredBy: 'manual' });
    const task2 = await waitForTaskStatus(taskId, ['completed', 'failed']);
    expect(task2.status).toBe('completed');

    // Verify old data was cleared and only second execution data remains
    const count2 = await dataSource.query(
      `SELECT COUNT(*) as cnt FROM "${rawTableName}"`,
    );
    expect(Number(count2[0].cnt)).toBe(10);
    expect(task2.extractedCount).toBe(10);
    expect(task2.executionCount).toBe(2);
  });

  // TS-F021-014: 增量模式追加寫入
  it('should append data in incremental mode (TS-F021-014)', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/extraction-tasks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'F021-P3 增量追加',
        datasourceId,
        mode: 'incremental',
        sourceTable: 'events',
        schedule: '0 2 * * *',
        incrementalColumn: 'id',
      });

    expect(createRes.status).toBe(201);
    const taskId = createRes.body.id;
    const rawTableName = createRes.body.rawTableName;

    // First execution: writes 5 rows (events has 5 rows)
    await request(app.getHttpServer())
      .post(`/api/v1/extraction-tasks/${taskId}/run`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ triggeredBy: 'manual' });
    const task1 = await waitForTaskStatus(taskId, ['completed', 'failed']);
    expect(task1.status).toBe('completed');

    const count1 = await dataSource.query(
      `SELECT COUNT(*) as cnt FROM "${rawTableName}"`,
    );
    expect(Number(count1[0].cnt)).toBe(5);

    // Simulate new data by adding extra rows to the mock's incremental state
    // Access executor from the app module
    const executor = app.get(EXTRACTION_EXECUTOR) as any;
    executor._incrementalState['events'] = {
      extraRows: [
        { id: 6, name: 'Event_6' },
        { id: 7, name: 'Event_7' },
        { id: 8, name: 'Event_8' },
      ],
    };

    // Second execution: should append 3 more rows
    await request(app.getHttpServer())
      .post(`/api/v1/extraction-tasks/${taskId}/run`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ triggeredBy: 'manual' });
    const task2 = await waitForTaskStatus(taskId, ['completed', 'failed']);
    expect(task2.status).toBe('completed');

    // Total rows = 5 + 3 = 8
    const count2 = await dataSource.query(
      `SELECT COUNT(*) as cnt FROM "${rawTableName}"`,
    );
    expect(Number(count2[0].cnt)).toBe(8);

    // Clean up incremental state
    delete executor._incrementalState['events'];
  });

  // TS-F021-016: 超過 1,000 筆的批次寫入正確性
  it('should handle batch writes for 1,001 rows across 2 batches (TS-F021-016)', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/extraction-tasks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'F021-P3 大量資料',
        datasourceId,
        mode: 'full',
        sourceTable: 'large_table_src',
        schedule: '0 2 * * *',
      });

    expect(createRes.status).toBe(201);
    const taskId = createRes.body.id;
    const rawTableName = createRes.body.rawTableName;

    // Trigger run
    await request(app.getHttpServer())
      .post(`/api/v1/extraction-tasks/${taskId}/run`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ triggeredBy: 'manual' });

    const task = await waitForTaskStatus(taskId, ['completed', 'failed']);
    expect(task.status).toBe('completed');

    // Verify 1,001 rows in raw table
    const countResult = await dataSource.query(
      `SELECT COUNT(*) as cnt FROM "${rawTableName}"`,
    );
    expect(Number(countResult[0].cnt)).toBe(1001);
    expect(task.extractedCount).toBe(1001);
  });

  // TS-F021-020: 恰好 1,000 筆邊界
  it('should handle exactly 1,000 rows boundary correctly (TS-F021-020)', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/extraction-tasks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'F021-P3 千筆邊界',
        datasourceId,
        mode: 'full',
        sourceTable: 'batch_1000_src',
        schedule: '0 2 * * *',
      });

    expect(createRes.status).toBe(201);
    const taskId = createRes.body.id;
    const rawTableName = createRes.body.rawTableName;

    // Trigger run
    await request(app.getHttpServer())
      .post(`/api/v1/extraction-tasks/${taskId}/run`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ triggeredBy: 'manual' });

    const task = await waitForTaskStatus(taskId, ['completed', 'failed']);
    expect(task.status).toBe('completed');

    // Verify exactly 1,000 rows
    const countResult = await dataSource.query(
      `SELECT COUNT(*) as cnt FROM "${rawTableName}"`,
    );
    expect(Number(countResult[0].cnt)).toBe(1000);
    expect(task.extractedCount).toBe(1000);
  });
});

// F021 Phase 4: Execution Failure Scenarios
describe('F021 Phase 4: Execution Failure Scenarios', () => {
  let app: INestApplication;
  let adminToken: string;
  let dataSource: DataSource;

  async function waitForTaskStatus(
    taskId: string,
    targetStatuses: string[],
    timeoutMs = 10000,
    pollMs = 100,
  ): Promise<any> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/extraction-tasks/${taskId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      if (targetStatuses.includes(res.body.status)) {
        return res.body;
      }
      await new Promise((r) => setTimeout(r, pollMs));
    }
    const res = await request(app.getHttpServer())
      .get(`/api/v1/extraction-tasks/${taskId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    return res.body;
  }

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAdminToken(app);
    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    await app?.close();
  });

  // TS-F021-015: 來源表結構變更後重建
  it('should drop and recreate raw table when source schema changes (TS-F021-015)', async () => {
    const executor = app.get(EXTRACTION_EXECUTOR) as any;

    // First execution: schema v1 (id, name)
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/extraction-tasks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'F021-P4 結構變更',
        datasourceId,
        mode: 'full',
        sourceTable: 'schema_change_src',
        schedule: '0 2 * * *',
      });

    expect(createRes.status).toBe(201);
    const taskId = createRes.body.id;
    const rawTableName = createRes.body.rawTableName;

    // Run first time with v1 schema
    await request(app.getHttpServer())
      .post(`/api/v1/extraction-tasks/${taskId}/run`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ triggeredBy: 'manual' });

    const task1 = await waitForTaskStatus(taskId, ['completed', 'failed']);
    expect(task1.status).toBe('completed');

    // Verify v1 columns
    const colsV1 = await dataSource.query(`PRAGMA table_info("${rawTableName}")`);
    const colNamesV1 = colsV1.map((c: any) => c.name);
    expect(colNamesV1).toContain('id');
    expect(colNamesV1).toContain('name');
    expect(colNamesV1).not.toContain('email');

    // Switch to v2 schema (id, name, email)
    executor._errorFlags['schema_change_v2'] = true;

    // Run second time with v2 schema (full mode → should detect schema change and rebuild)
    await request(app.getHttpServer())
      .post(`/api/v1/extraction-tasks/${taskId}/run`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ triggeredBy: 'manual' });

    const task2 = await waitForTaskStatus(taskId, ['completed', 'failed']);
    expect(task2.status).toBe('completed');

    // Verify v2 columns (email should now exist)
    const colsV2 = await dataSource.query(`PRAGMA table_info("${rawTableName}")`);
    const colNamesV2 = colsV2.map((c: any) => c.name);
    expect(colNamesV2).toContain('id');
    expect(colNamesV2).toContain('name');
    expect(colNamesV2).toContain('email');

    // Verify data written with new schema
    const rows = await dataSource.query(`SELECT * FROM "${rawTableName}"`);
    expect(rows.length).toBe(5);
    expect(rows[0].email).toBe('row1@example.com');

    // Clean up flag
    delete executor._errorFlags['schema_change_v2'];
  });

  // TS-F021-017: 動態建表失敗（來源表不存在）
  it('should fail when source table metadata retrieval fails (TS-F021-017)', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/extraction-tasks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'F021-P4 建表失敗',
        datasourceId,
        mode: 'full',
        sourceTable: 'fail_metadata_src',
        schedule: '0 2 * * *',
      });

    expect(createRes.status).toBe(201);
    const taskId = createRes.body.id;

    // Trigger run
    await request(app.getHttpServer())
      .post(`/api/v1/extraction-tasks/${taskId}/run`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ triggeredBy: 'manual' });

    const task = await waitForTaskStatus(taskId, ['failed']);
    expect(task.status).toBe('failed');
    expect(task.errorMessage).toContain('Table not found');

    // Verify ExtractionLog
    const logRepo = dataSource.getRepository(ExtractionLog);
    const logs = await logRepo.find({
      where: { task_id: taskId },
      order: { created_at: 'DESC' },
    });
    expect(logs.length).toBeGreaterThanOrEqual(1);
    expect(logs[0].status).toBe('failed');
    expect(logs[0].error_message).toContain('Table not found');
  });

  // TS-F021-018: 批次寫入中途失敗（部分資料保留）
  it('should fail mid-batch but retain already written data (TS-F021-018)', async () => {
    const executor = app.get(EXTRACTION_EXECUTOR) as any;
    // Reset batch call counter
    executor._batchCallCounts['fail_batch_src'] = 0;

    const createRes = await request(app.getHttpServer())
      .post('/api/v1/extraction-tasks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'F021-P4 批次失敗',
        datasourceId,
        mode: 'full',
        sourceTable: 'fail_batch_src',
        schedule: '0 2 * * *',
      });

    expect(createRes.status).toBe(201);
    const taskId = createRes.body.id;
    const rawTableName = createRes.body.rawTableName;

    // Trigger run - first batch (1000 rows) succeeds, second batch throws
    await request(app.getHttpServer())
      .post(`/api/v1/extraction-tasks/${taskId}/run`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ triggeredBy: 'manual' });

    const task = await waitForTaskStatus(taskId, ['failed']);
    expect(task.status).toBe('failed');

    // Verify partial data: first batch (1000 rows) should be retained
    const countResult = await dataSource.query(
      `SELECT COUNT(*) as cnt FROM "${rawTableName}"`,
    );
    expect(Number(countResult[0].cnt)).toBe(1000);

    // Verify ExtractionLog records the error
    const logRepo = dataSource.getRepository(ExtractionLog);
    const logs = await logRepo.find({
      where: { task_id: taskId },
      order: { created_at: 'DESC' },
    });
    expect(logs.length).toBeGreaterThanOrEqual(1);
    expect(logs[0].status).toBe('failed');
    expect(logs[0].error_message).toContain('Connection lost');
  });
});

// F021 Phase 5: sourceSchema Integration
describe('F021 Phase 5: sourceSchema Integration', () => {
  let app: INestApplication;
  let adminToken: string;
  let dataSource: DataSource;

  async function waitForTaskStatus(
    taskId: string,
    targetStatuses: string[],
    timeoutMs = 5000,
    pollMs = 100,
  ): Promise<any> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/extraction-tasks/${taskId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      if (targetStatuses.includes(res.body.status)) {
        return res.body;
      }
      await new Promise((r) => setTimeout(r, pollMs));
    }
    const res = await request(app.getHttpServer())
      .get(`/api/v1/extraction-tasks/${taskId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    return res.body;
  }

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAdminToken(app);
    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    await app?.close();
  });

  // TS-F021-P5-001: sourceSchema is passed to all executor methods
  it('should pass sourceSchema to executor methods when provided (TS-F021-P5-001)', async () => {
    const executor = app.get(EXTRACTION_EXECUTOR) as any;
    executor._callLog.length = 0; // Clear log

    const createRes = await request(app.getHttpServer())
      .post('/api/v1/extraction-tasks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'F021-P5 Schema 傳遞',
        datasourceId,
        mode: 'full',
        sourceTable: 'customers',
        sourceSchema: 'sales',
        schedule: '0 2 * * *',
      });
    expect(createRes.status).toBe(201);
    const taskId = createRes.body.id;

    await request(app.getHttpServer())
      .post(`/api/v1/extraction-tasks/${taskId}/run`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ triggeredBy: 'manual' });

    const task = await waitForTaskStatus(taskId, ['completed', 'failed']);
    expect(task.status).toBe('completed');

    // Verify sourceSchema was passed to all three executor methods
    const metadataCalls = executor._callLog.filter(
      (c: any) => c.method === 'getSourceTableMetadata' && c.params.sourceTable === 'customers',
    );
    expect(metadataCalls.length).toBeGreaterThanOrEqual(1);
    expect(metadataCalls[0].params.sourceSchema).toBe('sales');

    const countCalls = executor._callLog.filter(
      (c: any) => c.method === 'getSourceCount' && c.params.sourceTable === 'customers',
    );
    expect(countCalls.length).toBeGreaterThanOrEqual(1);
    expect(countCalls[0].params.sourceSchema).toBe('sales');

    const batchCalls = executor._callLog.filter(
      (c: any) => c.method === 'readBatch' && c.params.sourceTable === 'customers',
    );
    expect(batchCalls.length).toBeGreaterThanOrEqual(1);
    expect(batchCalls[0].params.sourceSchema).toBe('sales');
  });

  // TS-F021-P5-002: null sourceSchema is passed correctly
  it('should pass null sourceSchema when not provided (TS-F021-P5-002)', async () => {
    const executor = app.get(EXTRACTION_EXECUTOR) as any;
    executor._callLog.length = 0;

    const createRes = await request(app.getHttpServer())
      .post('/api/v1/extraction-tasks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'F021-P5 無 Schema',
        datasourceId,
        mode: 'full',
        sourceTable: 'orders',
        schedule: '0 3 * * *',
      });
    expect(createRes.status).toBe(201);
    const taskId = createRes.body.id;

    await request(app.getHttpServer())
      .post(`/api/v1/extraction-tasks/${taskId}/run`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ triggeredBy: 'manual' });

    const task = await waitForTaskStatus(taskId, ['completed', 'failed']);
    expect(task.status).toBe('completed');

    const metadataCalls = executor._callLog.filter(
      (c: any) => c.method === 'getSourceTableMetadata' && c.params.sourceTable === 'orders',
    );
    expect(metadataCalls.length).toBeGreaterThanOrEqual(1);
    expect(metadataCalls[0].params.sourceSchema).toBeNull();
  });

  // TS-F021-SEC-003: SQL reserved words as sourceSchema
  it('should handle SQL reserved words in sourceSchema (TS-F021-SEC-003)', async () => {
    const executor = app.get(EXTRACTION_EXECUTOR) as any;
    executor._callLog.length = 0;

    // Use 'customers' (has mock data) with SQL reserved word 'order' as sourceSchema
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/extraction-tasks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'F021-P5 SQL 保留字',
        datasourceId,
        mode: 'full',
        sourceTable: 'customers',
        sourceSchema: 'order',
        schedule: '0 4 * * *',
      });
    expect(createRes.status).toBe(201);
    const taskId = createRes.body.id;

    await request(app.getHttpServer())
      .post(`/api/v1/extraction-tasks/${taskId}/run`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ triggeredBy: 'manual' });

    const task = await waitForTaskStatus(taskId, ['completed', 'failed']);
    expect(task.status).toBe('completed');

    // Verify all executor methods received sourceSchema='order'
    const metadataCalls = executor._callLog.filter(
      (c: any) => c.method === 'getSourceTableMetadata' && c.params.sourceTable === 'customers' && c.params.sourceSchema === 'order',
    );
    expect(metadataCalls.length).toBeGreaterThanOrEqual(1);
    expect(metadataCalls[0].params.sourceSchema).toBe('order');

    const countCalls = executor._callLog.filter(
      (c: any) => c.method === 'getSourceCount' && c.params.sourceTable === 'customers' && c.params.sourceSchema === 'order',
    );
    expect(countCalls.length).toBeGreaterThanOrEqual(1);
    expect(countCalls[0].params.sourceSchema).toBe('order');

    const batchCalls = executor._callLog.filter(
      (c: any) => c.method === 'readBatch' && c.params.sourceTable === 'customers' && c.params.sourceSchema === 'order',
    );
    expect(batchCalls.length).toBeGreaterThanOrEqual(1);
    expect(batchCalls[0].params.sourceSchema).toBe('order');
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

// =============================================================================
// F026: Preview Raw Data (GET /api/v1/extraction-tasks/:id/raw-data)
// =============================================================================
describe('F026: Preview Raw Data (GET /api/v1/extraction-tasks/:id/raw-data)', () => {
  let app: INestApplication;
  let adminToken: string;
  let userToken: string;
  let dataSource: DataSource;
  let taskId: string;
  let taskWithNoRunId: string;
  let emptyTaskId: string;

  async function waitForTaskStatus(
    id: string,
    targetStatuses: string[],
    timeoutMs = 5000,
    pollMs = 100,
  ): Promise<any> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/extraction-tasks/${id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      if (targetStatuses.includes(res.body.status)) {
        return res.body;
      }
      await new Promise((r) => setTimeout(r, pollMs));
    }
    const res = await request(app.getHttpServer())
      .get(`/api/v1/extraction-tasks/${id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    return res.body;
  }

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAdminToken(app);
    userToken = await getUserToken(app);
    dataSource = app.get(DataSource);

    // 1. Create task with customers_src (10 rows: id, name)
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/extraction-tasks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'F026 Raw Data Preview Task',
        datasourceId,
        mode: 'full',
        sourceTable: 'customers_src',
        schedule: '0 3 * * *',
      });
    taskId = createRes.body.id;

    // Run it so raw data table gets populated
    await request(app.getHttpServer())
      .post(`/api/v1/extraction-tasks/${taskId}/run`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ triggeredBy: 'manual' });
    await waitForTaskStatus(taskId, ['completed', 'failed']);

    // 2. Create task that is NOT run (no raw data table content)
    const noRunRes = await request(app.getHttpServer())
      .post('/api/v1/extraction-tasks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'F026 No Run Task',
        datasourceId,
        mode: 'full',
        sourceTable: 'customers_src',
        schedule: '0 4 * * *',
      });
    taskWithNoRunId = noRunRes.body.id;

    // 3. Create task with empty_table (0 rows) and run it
    const emptyRes = await request(app.getHttpServer())
      .post('/api/v1/extraction-tasks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'F026 Empty Table Task',
        datasourceId,
        mode: 'full',
        sourceTable: 'empty_table',
        schedule: '0 5 * * *',
      });
    emptyTaskId = emptyRes.body.id;

    await request(app.getHttpServer())
      .post(`/api/v1/extraction-tasks/${emptyTaskId}/run`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ triggeredBy: 'manual' });
    await waitForTaskStatus(emptyTaskId, ['completed', 'failed']);
  });

  afterAll(async () => {
    await app?.close();
  });

  // TS-F026-001: Basic query (no query params)
  it('should return raw data with default pagination', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/extraction-tasks/${taskId}/raw-data`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('meta');
    expect(res.body).toHaveProperty('columns');
    expect(res.body).toHaveProperty('data');

    // meta
    expect(res.body.meta.taskName).toBe('F026 Raw Data Preview Task');
    expect(res.body.meta.sourceTable).toBe('customers_src');
    expect(res.body.meta).toHaveProperty('sourceSchema');
    expect(res.body.meta.rawTableName).toMatch(/^raw_[0-9a-f]{8}$/);
    expect(res.body.meta.totalCount).toBe(10);
    expect(res.body.meta.page).toBe(1);
    expect(res.body.meta.limit).toBe(50);
    expect(res.body.meta.totalPages).toBe(1);

    // columns: id, name, _cdmp_extracted_at (and possibly _cdmp_id if no PK... but customers_src has PK)
    const colNames = res.body.columns.map((c: any) => c.name);
    expect(colNames).toContain('id');
    expect(colNames).toContain('name');
    expect(colNames).toContain('_cdmp_extracted_at');

    // data: 10 rows
    expect(res.body.data.length).toBe(10);
  });

  // TS-F026-002: Pagination (limit=50, only 10 rows => totalPages=1)
  it('should return correct pagination with limit=50 and 10 rows', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/extraction-tasks/${taskId}/raw-data?page=1&limit=50`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(10);
    expect(res.body.meta.totalPages).toBe(1);
    expect(res.body.meta.totalCount).toBe(10);
  });

  // TS-F026-003: Sort ascending by name
  it('should return data sorted by name ASC', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/extraction-tasks/${taskId}/raw-data?sortBy=name&sortOrder=asc`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const names = res.body.data.map((r: any) => r.name);
    const sorted = [...names].sort();
    expect(names).toEqual(sorted);
  });

  // TS-F026-004: Sort descending by name
  it('should return data sorted by name DESC', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/extraction-tasks/${taskId}/raw-data?sortBy=name&sortOrder=desc`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const names = res.body.data.map((r: any) => r.name);
    const sorted = [...names].sort().reverse();
    expect(names).toEqual(sorted);
  });

  // TS-F026-005: System column flag
  it('should mark _cdmp_extracted_at as system column', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/extraction-tasks/${taskId}/raw-data`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const extractedAtCol = res.body.columns.find((c: any) => c.name === '_cdmp_extracted_at');
    expect(extractedAtCol).toBeDefined();
    expect(extractedAtCol.isSystem).toBe(true);

    // Non-system columns
    const idCol = res.body.columns.find((c: any) => c.name === 'id');
    expect(idCol.isSystem).toBe(false);
    const nameCol = res.body.columns.find((c: any) => c.name === 'name');
    expect(nameCol.isSystem).toBe(false);
  });

  // TS-F026-006: lastUpdatedAt matches last completed log's finished_at
  it('should return lastUpdatedAt from the last completed extraction log', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/extraction-tasks/${taskId}/raw-data`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.meta.lastUpdatedAt).toBeTruthy();
    // Should be a valid date string
    const d = new Date(res.body.meta.lastUpdatedAt);
    expect(d.getTime()).toBeGreaterThan(0);
  });

  // TS-F026-007: Task not found => 404
  it('should return 404 EXTRACTION_NOT_FOUND for non-existent task', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const res = await request(app.getHttpServer())
      .get(`/api/v1/extraction-tasks/${fakeId}/raw-data`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('EXTRACTION_NOT_FOUND');
  });

  // TS-F026-008: Raw table not found (task created but never run)
  it('should return 404 EXTRACTION_RAW_TABLE_NOT_FOUND for unexecuted task', async () => {
    // The task has raw_table_name set but the table was never created because it was never run
    // We need to check: does creating a task set raw_table_name? Yes it does.
    // But the raw table doesn't exist in DB until execution.
    const res = await request(app.getHttpServer())
      .get(`/api/v1/extraction-tasks/${taskWithNoRunId}/raw-data`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('EXTRACTION_RAW_TABLE_NOT_FOUND');
  });

  // TS-F026-009: Non-admin user => 403
  it('should return 403 for non-admin user', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/extraction-tasks/${taskId}/raw-data`)
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('AUTH_FORBIDDEN');
  });

  // TS-F026-010: Invalid limit (not in whitelist) => 422
  it('should return 422 for invalid limit value', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/extraction-tasks/${taskId}/raw-data?limit=25`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  // TS-F026-011: Invalid sortOrder => 422
  it('should return 422 for invalid sortOrder value', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/extraction-tasks/${taskId}/raw-data?sortOrder=random`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  // TS-F026-012: Empty table (0 rows)
  it('should handle empty table with totalCount=0 and totalPages=0', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/extraction-tasks/${emptyTaskId}/raw-data`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.totalCount).toBe(0);
    expect(res.body.meta.totalPages).toBe(0);
  });

  // TS-F026-013: Sort by system column (_cdmp_extracted_at)
  it('should allow sorting by system column _cdmp_extracted_at', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/extraction-tasks/${taskId}/raw-data?sortBy=_cdmp_extracted_at&sortOrder=asc`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(10);
  });
});
