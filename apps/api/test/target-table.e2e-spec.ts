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

async function loginAs(
  app: INestApplication,
  user: typeof ADMIN_ACTIVE,
): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email: user.email, password: user.password });
  return res.body.token;
}

describe('F036: Target Table APIs', () => {
  let app: INestApplication;
  let adminToken: string;
  let userToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await loginAs(app, ADMIN_ACTIVE);
    userToken = await loginAs(app, USER_ACTIVE);
  });

  afterAll(async () => {
    await app.close();
  });

  // TS-F036-001: 回傳 4 個目標表清單
  describe('GET /api/v1/etl/target-tables', () => {
    it('TS-F036-001: should return 4 target tables', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/etl/target-tables')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.data).toHaveLength(4);
      const tableNames = res.body.data.map((t: any) => t.tableName);
      expect(tableNames).toContain('customer_core');
      expect(tableNames).toContain('customer_interaction');
      expect(tableNames).toContain('customer_financial');
      expect(tableNames).toContain('customer_service');
    });

    // TS-F036-002: 各目標表 columnCount 正確
    it('TS-F036-002: should have correct columnCount for each table', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/etl/target-tables')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const byName = (name: string) => res.body.data.find((t: any) => t.tableName === name);
      expect(byName('customer_core').columnCount).toBe(16);
      expect(byName('customer_interaction').columnCount).toBe(14);
      expect(byName('customer_financial').columnCount).toBe(20);
      expect(byName('customer_service').columnCount).toBe(17);
    });

    // TS-F036-003: 各目標表回應欄位結構完整
    it('TS-F036-003: each table object should have complete fields', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/etl/target-tables')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      for (const table of res.body.data) {
        expect(table).toHaveProperty('tableName');
        expect(table).toHaveProperty('displayName');
        expect(table).toHaveProperty('domain');
        expect(table).toHaveProperty('columnCount');
        expect(table).toHaveProperty('description');
        expect(typeof table.tableName).toBe('string');
        expect(typeof table.displayName).toBe('string');
        expect(typeof table.domain).toBe('string');
        expect(typeof table.columnCount).toBe('number');
        expect(typeof table.description).toBe('string');
        // No extra fields
        expect(Object.keys(table)).toHaveLength(5);
      }
    });

    // TS-F036-004: domain 欄位值正確對應
    it('TS-F036-004: domain values should match table names', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/etl/target-tables')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const byName = (name: string) => res.body.data.find((t: any) => t.tableName === name);
      expect(byName('customer_core').domain).toBe('core');
      expect(byName('customer_interaction').domain).toBe('interaction');
      expect(byName('customer_financial').domain).toBe('financial');
      expect(byName('customer_service').domain).toBe('service');
    });
  });

  // Schema API tests
  describe('GET /api/v1/etl/target-tables/:tableName/schema', () => {
    // TS-F036-005: customer_core schema
    it('TS-F036-005: customer_core schema should have 16 columns with correct PK', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/etl/target-tables/customer_core/schema')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.tableName).toBe('customer_core');
      expect(res.body.displayName).toBe('Customer Core（身分/主檔）');
      expect(res.body.columns).toHaveLength(16);

      const pk = res.body.columns.find((c: any) => c.isPrimaryKey);
      expect(pk.name).toBe('customer_id');
      expect(pk.type).toBe('UUID');
      expect(pk.nullable).toBe(false);

      const idNumber = res.body.columns.find((c: any) => c.name === 'id_number');
      expect(idNumber.type).toBe('VARCHAR');
      expect(idNumber.nullable).toBe(true);
    });

    // TS-F036-006: customer_interaction schema
    it('TS-F036-006: customer_interaction schema should have 14 columns', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/etl/target-tables/customer_interaction/schema')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.columns).toHaveLength(14);
      const pk = res.body.columns.find((c: any) => c.isPrimaryKey);
      expect(pk.name).toBe('interaction_id');

      const fieldNames = res.body.columns.map((c: any) => c.name);
      expect(fieldNames).toContain('interaction_type');
      expect(fieldNames).toContain('channel');
      expect(fieldNames).toContain('direction');
      expect(fieldNames).toContain('interaction_date');
      expect(fieldNames).toContain('campaign_id');
      expect(fieldNames).toContain('campaign_name');
      expect(fieldNames).toContain('response_status');
      expect(fieldNames).toContain('content_summary');
      expect(fieldNames).toContain('agent_id');
    });

    // TS-F036-007: customer_financial schema
    it('TS-F036-007: customer_financial schema should have 20 columns', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/etl/target-tables/customer_financial/schema')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.columns).toHaveLength(20);
      const pk = res.body.columns.find((c: any) => c.isPrimaryKey);
      expect(pk.name).toBe('financial_id');

      const byName = (name: string) => res.body.columns.find((c: any) => c.name === name);
      expect(byName('principal_amount').type).toBe('DECIMAL');
      expect(byName('monthly_payment').type).toBe('DECIMAL');
      expect(byName('interest_rate').type).toBe('DECIMAL');
      expect(byName('overdue_days').type).toBe('INTEGER');
      expect(byName('overdue_amount').type).toBe('DECIMAL');
      expect(byName('credit_score').type).toBe('INTEGER');
      expect(byName('risk_level').type).toBe('VARCHAR');
    });

    // TS-F036-008: customer_service schema
    it('TS-F036-008: customer_service schema should have 17 columns', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/etl/target-tables/customer_service/schema')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.columns).toHaveLength(17);
      const pk = res.body.columns.find((c: any) => c.isPrimaryKey);
      expect(pk.name).toBe('service_id');

      const fieldNames = res.body.columns.map((c: any) => c.name);
      expect(fieldNames).toContain('case_number');
      expect(fieldNames).toContain('case_type');
      expect(fieldNames).toContain('category');
      expect(fieldNames).toContain('priority');
      expect(fieldNames).toContain('status');
      expect(fieldNames).toContain('channel');
      expect(fieldNames).toContain('description');
      expect(fieldNames).toContain('resolution');
      expect(fieldNames).toContain('assigned_to');
      expect(fieldNames).toContain('opened_at');
      expect(fieldNames).toContain('resolved_at');
      expect(fieldNames).toContain('satisfaction_score');
    });

    // TS-F036-009: ETL tracking fields marked correctly
    it('TS-F036-009: ETL tracking fields should be marked isEtlTracking=true', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/etl/target-tables/customer_core/schema')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const trackingFields = res.body.columns.filter((c: any) => c.isEtlTracking === true);
      const trackingNames = trackingFields.map((c: any) => c.name).sort();
      expect(trackingNames).toEqual(['_etl_loaded_at', '_etl_pipeline_id', 'data_source']);

      const nonTrackingFields = res.body.columns.filter((c: any) => c.isEtlTracking === false);
      expect(nonTrackingFields.length).toBe(16 - 3);
    });

    // TS-F036-010: Primary key field marked correctly
    it('TS-F036-010: exactly one PK field in customer_financial', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/etl/target-tables/customer_financial/schema')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const pks = res.body.columns.filter((c: any) => c.isPrimaryKey === true);
      expect(pks).toHaveLength(1);
      expect(pks[0].name).toBe('financial_id');
      expect(pks[0].nullable).toBe(false);

      const nonPks = res.body.columns.filter((c: any) => c.isPrimaryKey === false);
      expect(nonPks.length).toBe(19);
    });

    // TS-F036-011: Tracking fields nullable correctness
    it('TS-F036-011: tracking field nullable values correct', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/etl/target-tables/customer_core/schema')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const byName = (name: string) => res.body.columns.find((c: any) => c.name === name);
      expect(byName('_etl_loaded_at').nullable).toBe(false);
      expect(byName('_etl_pipeline_id').nullable).toBe(false);
      expect(byName('data_source').nullable).toBe(true);
    });

    // TS-F036-012: All columns have description
    it('TS-F036-012: every column in customer_service should have a non-empty description', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/etl/target-tables/customer_service/schema')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      for (const col of res.body.columns) {
        expect(col).toHaveProperty('description');
        expect(typeof col.description).toBe('string');
        expect(col.description.length).toBeGreaterThan(0);
      }
    });
  });

  // Negative scenarios
  describe('Negative scenarios', () => {
    // TS-F036-013: non-existent table returns 404
    it('TS-F036-013: should return 404 for non-existent target table', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/etl/target-tables/customer_unknown/schema')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);

      expect(res.body.error).toBe('PIPELINE_TARGET_TABLE_NOT_FOUND');
      expect(res.body.message).toBe('找不到指定的目標表');
    });

    // TS-F036-014: User role gets 403 on list
    it('TS-F036-014: user role should get 403 on target table list', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/etl/target-tables')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);

      expect(res.body.error).toBe('AUTH_FORBIDDEN');
    });

    // TS-F036-015: User role gets 403 on schema
    it('TS-F036-015: user role should get 403 on target table schema', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/etl/target-tables/customer_core/schema')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);

      expect(res.body.error).toBe('AUTH_FORBIDDEN');
    });

    // TS-F036-016: No token returns 401 on list
    it('TS-F036-016: should return 401 without token on list', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/etl/target-tables')
        .expect(401);

      expect(res.body.error).toBe('AUTH_TOKEN_MISSING');
    });

    // TS-F036-017: No token returns 401 on schema
    it('TS-F036-017: should return 401 without token on schema', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/etl/target-tables/customer_core/schema')
        .expect(401);

      expect(res.body.error).toBe('AUTH_TOKEN_MISSING');
    });

    // TS-F036-020: Empty table name (path segment) returns 404
    it('TS-F036-020: empty table name should return 404', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/etl/target-tables//schema')
        .set('Authorization', `Bearer ${adminToken}`);

      // Framework may return 404 or route mismatch
      expect([404, 400]).toContain(res.status);
    });
  });
});
