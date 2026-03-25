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

describe('F036 v2.0: Target Table APIs', () => {
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

  // ====== 類別一：目標表清單 API ======

  describe('GET /api/v1/etl/target-tables', () => {
    it('TS-F036-001: Phase 1 MVP should return exactly 1 target table (customer_core)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/etl/target-tables')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].tableName).toBe('customer_core');
      // Phase 2/3 tables should NOT exist
      const names = res.body.data.map((t: any) => t.tableName);
      expect(names).not.toContain('customer_interaction');
      expect(names).not.toContain('customer_financial');
      expect(names).not.toContain('customer_service');
    });

    it('TS-F036-002: response structure should be complete with exactly 5 properties', async () => {
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
        expect(Object.keys(table)).toHaveLength(5);
      }
    });

    it('TS-F036-003: columnCount matches actual schema columns, domain is core', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/etl/target-tables')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const core = res.body.data[0];
      expect(core.columnCount).toBe(54);
      expect(core.domain).toBe('core');
      expect(core.displayName).toContain('Customer Core');
    });
  });

  // ====== 類別二：Schema API ======

  describe('GET /api/v1/etl/target-tables/:tableName/schema', () => {
    it('TS-F036-004: customer_core schema should have 54 columns (A~H)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/etl/target-tables/customer_core/schema')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.tableName).toBe('customer_core');
      expect(res.body.displayName).toBe('Customer Core（客戶主檔）');
      expect(res.body.columns).toHaveLength(54);
    });

    it('TS-F036-005: A category fields (識別與分類) should be correct', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/etl/target-tables/customer_core/schema')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const byName = (name: string) => res.body.columns.find((c: any) => c.name === name);

      // customer_id: UUID, PK, NOT NULL
      expect(byName('customer_id').type).toBe('UUID');
      expect(byName('customer_id').isPrimaryKey).toBe(true);
      expect(byName('customer_id').nullable).toBe(false);

      // source_customer_no: VARCHAR(20), NOT NULL
      expect(byName('source_customer_no').type).toBe('VARCHAR(20)');
      expect(byName('source_customer_no').nullable).toBe(false);

      // customer_type: VARCHAR(2), NOT NULL
      expect(byName('customer_type').type).toBe('VARCHAR(2)');
      expect(byName('customer_type').nullable).toBe(false);

      // name: VARCHAR(100), NOT NULL
      expect(byName('name').type).toBe('VARCHAR(100)');
      expect(byName('name').nullable).toBe(false);

      // english_name: VARCHAR(60), nullable
      expect(byName('english_name').type).toBe('VARCHAR(60)');
      expect(byName('english_name').nullable).toBe(true);
    });

    it('TS-F036-006: B category fields (個人屬性) should all be nullable', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/etl/target-tables/customer_core/schema')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const byName = (name: string) => res.body.columns.find((c: any) => c.name === name);

      expect(byName('gender').nullable).toBe(true);
      expect(byName('date_of_birth').type).toBe('DATE');
      expect(byName('date_of_birth').nullable).toBe(true);
      expect(byName('marital_status').nullable).toBe(true);
      expect(byName('education_code').nullable).toBe(true);
      expect(byName('education_desc').nullable).toBe(true);
    });

    it('TS-F036-007: C category fields (聯絡資訊) should be 6 VARCHAR nullable fields', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/etl/target-tables/customer_core/schema')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const cFields = ['mobile_phone', 'home_phone', 'contact_phone', 'office_phone', 'email', 'line_account'];
      for (const name of cFields) {
        const col = res.body.columns.find((c: any) => c.name === name);
        expect(col, `${name} should exist`).toBeDefined();
        expect(col.type).toMatch(/^VARCHAR/);
        expect(col.nullable).toBe(true);
      }
    });

    it('TS-F036-008: F category fields (財務與風控) type definitions correct', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/etl/target-tables/customer_core/schema')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const byName = (name: string) => res.body.columns.find((c: any) => c.name === name);

      expect(byName('monthly_income').type).toBe('DECIMAL(8,0)');
      expect(byName('capital').type).toBe('DECIMAL(12,0)');
      expect(byName('credit_limit').type).toBe('DECIMAL(12,0)');
      expect(byName('address_anomaly_flag').type).toBe('SMALLINT');
      expect(byName('mainland_flag').type).toBe('SMALLINT');
      expect(byName('debt_flag').type).toBe('CHAR(1)');
      expect(byName('fine_flag').type).toBe('CHAR(1)');
      expect(byName('approved_income').type).toBe('INTEGER');
    });

    it('TS-F036-009: ETL tracking fields marked correctly', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/etl/target-tables/customer_core/schema')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const tracking = res.body.columns.filter((c: any) => c.isEtlTracking === true);
      expect(tracking).toHaveLength(3);
      const trackingNames = tracking.map((c: any) => c.name).sort();
      expect(trackingNames).toEqual(['_etl_loaded_at', '_etl_pipeline_id', 'data_source']);

      // source_created_at and source_updated_at should NOT be ETL tracking
      const byName = (name: string) => res.body.columns.find((c: any) => c.name === name);
      expect(byName('source_created_at').isEtlTracking).toBe(false);
      expect(byName('source_updated_at').isEtlTracking).toBe(false);

      // Non-tracking count
      const nonTracking = res.body.columns.filter((c: any) => c.isEtlTracking === false);
      expect(nonTracking).toHaveLength(54 - 3);
    });

    it('TS-F036-010: exactly one PK field (customer_id)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/etl/target-tables/customer_core/schema')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const pks = res.body.columns.filter((c: any) => c.isPrimaryKey === true);
      expect(pks).toHaveLength(1);
      expect(pks[0].name).toBe('customer_id');
      expect(pks[0].nullable).toBe(false);

      const nonPks = res.body.columns.filter((c: any) => c.isPrimaryKey === false);
      expect(nonPks).toHaveLength(53);
    });

    it('TS-F036-011: all columns have non-empty description', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/etl/target-tables/customer_core/schema')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      for (const col of res.body.columns) {
        expect(col).toHaveProperty('description');
        expect(typeof col.description).toBe('string');
        expect(col.description.length).toBeGreaterThan(0);
      }
    });
  });

  // ====== 類別三：Negative scenarios ======

  describe('Negative scenarios', () => {
    it('TS-F036-012: should return 404 for non-existent target table', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/etl/target-tables/customer_unknown/schema')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);

      expect(res.body.error).toBe('PIPELINE_TARGET_TABLE_NOT_FOUND');
      expect(res.body.message).toBe('找不到指定的目標表');
    });

    it('TS-F036-013: Phase 2/3 tables should return 404', async () => {
      for (const table of ['customer_interaction', 'customer_financial', 'customer_service']) {
        const res = await request(app.getHttpServer())
          .get(`/api/v1/etl/target-tables/${table}/schema`)
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(404);

        expect(res.body.error).toBe('PIPELINE_TARGET_TABLE_NOT_FOUND');
      }
    });

    it('TS-F036-014: user role should get 403 on target table list', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/etl/target-tables')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);

      expect(res.body.error).toBe('AUTH_FORBIDDEN');
    });

    it('TS-F036-015: user role should get 403 on target table schema', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/etl/target-tables/customer_core/schema')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);

      expect(res.body.error).toBe('AUTH_FORBIDDEN');
    });

    it('TS-F036-016: should return 401 without token on list', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/etl/target-tables')
        .expect(401);

      expect(res.body.error).toBe('AUTH_TOKEN_MISSING');
    });

    it('TS-F036-017: should return 401 without token on schema', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/etl/target-tables/customer_core/schema')
        .expect(401);

      expect(res.body.error).toBe('AUTH_TOKEN_MISSING');
    });
  });

  // ====== 類別八：Boundary ======

  describe('Boundary scenarios', () => {
    it('TS-F036-037: special characters in table name should return 404', async () => {
      const res1 = await request(app.getHttpServer())
        .get('/api/v1/etl/target-tables/customer%20core/schema')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
      expect(res1.body.error).toBe('PIPELINE_TARGET_TABLE_NOT_FOUND');

      const res2 = await request(app.getHttpServer())
        .get('/api/v1/etl/target-tables/customer-core/schema')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
      expect(res2.body.error).toBe('PIPELINE_TARGET_TABLE_NOT_FOUND');
    });

    it('TS-F036-038: empty table name should return 404 or route mismatch', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/etl/target-tables//schema')
        .set('Authorization', `Bearer ${adminToken}`);

      // Framework may return 404 or route mismatch
      expect([404, 400]).toContain(res.status);
    });
  });
});
