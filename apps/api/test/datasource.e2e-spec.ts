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
import { HttpExceptionFilter } from '@/common/filters/http-exception.filter';
import { User } from '@/database/entities/user.entity';
import { TokenBlocklist } from '@/database/entities/token-blocklist.entity';
import { PasswordResetToken } from '@/database/entities/password-reset-token.entity';
import { Datasource } from '@/database/entities/datasource.entity';
import { HashUtil } from '@/common/hash/hash.util';
import { ADMIN_ACTIVE, USER_ACTIVE } from './seeds/test-data';

const TEST_AES_KEY = randomBytes(32).toString('hex');

async function createTestApp(): Promise<INestApplication> {
  // Set AES key before module creation
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
        entities: [User, TokenBlocklist, PasswordResetToken, Datasource],
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
    ],
    providers: [
      {
        provide: APP_GUARD,
        useClass: ThrottlerGuard,
      },
    ],
  }).compile();

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

  // Seed test data
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

describe('F012: List Datasources E2E (GET /api/v1/datasources)', () => {
  let app: INestApplication;
  let adminToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAdminToken(app);

    // Seed datasources for list tests
    const datasources = [
      { name: 'MySQL 主資料庫', type: 'mysql', host: '192.168.1.100', port: 3306, databaseName: 'prod_db', username: 'admin', password: 'Secret123', description: 'Production MySQL' },
      { name: 'PostgreSQL 分析庫', type: 'postgresql', host: '192.168.1.101', port: 5432, databaseName: 'analytics_db', username: 'analyst', password: 'Secret123', description: 'Analytics PostgreSQL' },
      { name: 'SQL Server 報表庫', type: 'sqlserver', host: '192.168.1.102', port: 1433, databaseName: 'report_db', username: 'reporter', password: 'Secret123', description: 'Report SQL Server' },
      { name: 'MySQL 備份庫', type: 'mysql', host: '192.168.1.103', port: 3306, databaseName: 'backup_db', username: 'backup', password: 'Secret123', description: null },
      { name: 'Soft Deleted DS', type: 'mysql', host: '192.168.1.200', port: 3306, databaseName: 'deleted_db', username: 'deleted', password: 'Secret123', description: null },
    ];

    for (const ds of datasources) {
      await request(app.getHttpServer())
        .post('/api/v1/datasources')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(ds);
    }

    // Set different statuses and soft-delete via direct DB access
    const dataSource = app.get(DataSource);
    const dsRepo = dataSource.getRepository(Datasource);

    await dsRepo.update({ name: 'MySQL 主資料庫' }, { status: 'connected', last_tested_at: new Date() });
    await dsRepo.update({ name: 'PostgreSQL 分析庫' }, { status: 'connected', last_tested_at: new Date() });
    await dsRepo.update({ name: 'SQL Server 報表庫' }, { status: 'disconnected', last_tested_at: new Date() });
    // MySQL 備份庫 remains status='unknown'

    // Soft-delete one record
    await dsRepo.update({ name: 'Soft Deleted DS' }, { deleted_at: new Date() });
  });

  afterAll(async () => {
    await app?.close();
  });

  // TS-F012-001: 載入資料來源清單
  it('should return datasource list with pagination (default page=1, limit=20)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/datasources')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('pagination');
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBe(4); // Soft-deleted excluded
    expect(res.body.pagination).toEqual({
      page: 1,
      limit: 20,
      total: 4,
      totalPages: 1,
    });

    // Verify sorting: created_at DESC
    const dates = res.body.data.map((d: any) => new Date(d.createdAt).getTime());
    for (let i = 0; i < dates.length - 1; i++) {
      expect(dates[i]).toBeGreaterThanOrEqual(dates[i + 1]);
    }

    // Verify each item has required fields
    const item = res.body.data[0];
    expect(item).toHaveProperty('id');
    expect(item).toHaveProperty('name');
    expect(item).toHaveProperty('type');
    expect(item).toHaveProperty('host');
    expect(item).toHaveProperty('port');
    expect(item).toHaveProperty('databaseName');
    expect(item).toHaveProperty('username');
    expect(item).toHaveProperty('status');
    expect(item).toHaveProperty('createdAt');
    expect(item).toHaveProperty('updatedAt');
  });

  // TS-F012-002: 依名稱搜尋
  it('should filter by search keyword (case-insensitive)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/datasources?search=mysql')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2); // MySQL 主資料庫 + MySQL 備份庫
    res.body.data.forEach((d: any) => {
      expect(d.name.toLowerCase()).toContain('mysql');
    });
  });

  // TS-F012-003: 依類型篩選
  it('should filter by type', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/datasources?type=postgresql')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].type).toBe('postgresql');
    expect(res.body.data[0].name).toBe('PostgreSQL 分析庫');
  });

  // TS-F012-004: 依狀態篩選
  it('should filter by status', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/datasources?status=connected')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2);
    res.body.data.forEach((d: any) => {
      expect(d.status).toBe('connected');
    });
  });

  // TS-F012-005: 軟刪除記錄不顯示
  it('should exclude soft-deleted datasources', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/datasources')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const names = res.body.data.map((d: any) => d.name);
    expect(names).not.toContain('Soft Deleted DS');
  });

  // TS-F012-006: 非 Admin 403
  it('should return 403 for non-admin user', async () => {
    const userToken = await getUserToken(app);

    const res = await request(app.getHttpServer())
      .get('/api/v1/datasources')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('AUTH_FORBIDDEN');
  });

  // TS-F012-007: 密碼欄位不在回應中
  it('should not include password fields in response', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/datasources')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    res.body.data.forEach((d: any) => {
      expect(d).not.toHaveProperty('password');
      expect(d).not.toHaveProperty('encrypted_password');
      expect(d).not.toHaveProperty('encryptedPassword');
    });
  });

  // Pagination test
  it('should support pagination with page and limit params', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/datasources?page=1&limit=2')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2);
    expect(res.body.pagination).toEqual({
      page: 1,
      limit: 2,
      total: 4,
      totalPages: 2,
    });
  });
});

describe('F011: Create Datasource E2E (POST /api/v1/datasources)', () => {
  let app: INestApplication;
  let adminToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAdminToken(app);
  });

  afterAll(async () => {
    await app?.close();
  });

  const basePayload = {
    name: 'MySQL Production',
    type: 'mysql',
    host: '192.168.1.100',
    port: 3306,
    databaseName: 'app_db',
    username: 'db_admin',
    password: 'SecretP@ss',
    description: 'Production MySQL server',
  };

  // TS-F011-001: 新增 MySQL 資料來源
  it('should create MySQL datasource and return 201', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/datasources')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ...basePayload, name: 'MySQL Test 001' });

    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty('id');
    expect(response.body.name).toBe('MySQL Test 001');
    expect(response.body.type).toBe('mysql');
    expect(response.body.host).toBe('192.168.1.100');
    expect(response.body.port).toBe(3306);
    expect(response.body.databaseName).toBe('app_db');
    expect(response.body.username).toBe('db_admin');
    expect(response.body.status).toBe('unknown');
    expect(response.body.lastTestedAt).toBeNull();
    expect(response.body).toHaveProperty('createdAt');
    expect(response.body).toHaveProperty('updatedAt');
    expect(response.body).not.toHaveProperty('password');
    expect(response.body).not.toHaveProperty('encrypted_password');
  });

  // TS-F011-002: 新增 PostgreSQL 資料來源
  it('should create PostgreSQL datasource and return 201', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/datasources')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        ...basePayload,
        name: 'PostgreSQL Test',
        type: 'postgresql',
        port: 5432,
      });

    expect(response.status).toBe(201);
    expect(response.body.type).toBe('postgresql');
    expect(response.body.port).toBe(5432);
  });

  // TS-F011-003: 新增 SQL Server 資料來源
  it('should create SQL Server datasource and return 201', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/datasources')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        ...basePayload,
        name: 'SQL Server Test',
        type: 'sqlserver',
        port: 1433,
      });

    expect(response.status).toBe(201);
    expect(response.body.type).toBe('sqlserver');
    expect(response.body.port).toBe(1433);
  });

  // TS-F011-004: 密碼加密儲存驗證
  it('should store password encrypted in DB (not plaintext)', async () => {
    const uniqueName = 'Encrypted Check DS';
    const plainPassword = 'MyPlainP@ssword!';

    const response = await request(app.getHttpServer())
      .post('/api/v1/datasources')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ...basePayload, name: uniqueName, password: plainPassword });

    expect(response.status).toBe(201);
    const dsId = response.body.id;

    // Directly query DB to check encrypted_password
    const dataSource = app.get(DataSource);
    const dsRepo = dataSource.getRepository(Datasource);
    const saved = await dsRepo.findOne({ where: { id: dsId } });

    expect(saved).toBeDefined();
    expect(saved!.encrypted_password).not.toBe(plainPassword);
    expect(saved!.encrypted_password).toContain(':'); // AES-256-GCM format: iv:tag:cipher
  });

  // TS-F011-005: 名稱重複
  it('should return 409 for duplicate name', async () => {
    const name = 'Duplicate Name Test';

    // First creation should succeed
    const first = await request(app.getHttpServer())
      .post('/api/v1/datasources')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ...basePayload, name });
    expect(first.status).toBe(201);

    // Second creation with same name should fail
    const second = await request(app.getHttpServer())
      .post('/api/v1/datasources')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ...basePayload, name });

    expect(second.status).toBe(409);
    expect(second.body.error).toBe('DS_NAME_EXISTS');
    expect(second.body.message).toBe('此名稱的資料來源已存在');
  });

  // TS-F011-006: 非 Admin 新增
  it('should return 403 for non-admin user', async () => {
    const userToken = await getUserToken(app);

    const response = await request(app.getHttpServer())
      .post('/api/v1/datasources')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ ...basePayload, name: 'Forbidden DS' });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('AUTH_FORBIDDEN');
  });

  // TS-F011-007: 無效類型
  it('should return 422 for invalid datasource type', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/datasources')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ...basePayload, name: 'Oracle DS', type: 'oracle' });

    expect(response.status).toBe(422);
    expect(response.body.error).toBe('VALIDATION_ERROR');
  });

  // TS-F011-008: Port 邊界值
  describe('port boundary validation', () => {
    it('should return 422 for port=0', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/datasources')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ...basePayload, name: 'Port 0 DS', port: 0 });

      expect(response.status).toBe(422);
      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    it('should accept port=1', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/datasources')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ...basePayload, name: 'Port 1 DS', port: 1 });

      expect(response.status).toBe(201);
    });

    it('should accept port=65535', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/datasources')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ...basePayload, name: 'Port 65535 DS', port: 65535 });

      expect(response.status).toBe(201);
    });

    it('should return 422 for port=65536', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/datasources')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ...basePayload, name: 'Port 65536 DS', port: 65536 });

      expect(response.status).toBe(422);
      expect(response.body.error).toBe('VALIDATION_ERROR');
    });
  });
});

describe('F013: Edit Datasource E2E', () => {
  let app: INestApplication;
  let adminToken: string;
  let createdDsId: string;
  let anotherDsId: string;

  const basePayload = {
    name: 'F013 Edit Target',
    type: 'mysql',
    host: '192.168.1.100',
    port: 3306,
    databaseName: 'edit_db',
    username: 'db_admin',
    password: 'OriginalP@ss',
    description: 'Target for edit tests',
  };

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAdminToken(app);

    // Create two datasources: one to edit, one for duplicate name test
    const res1 = await request(app.getHttpServer())
      .post('/api/v1/datasources')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(basePayload);
    createdDsId = res1.body.id;

    const res2 = await request(app.getHttpServer())
      .post('/api/v1/datasources')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ...basePayload, name: 'Another Datasource' });
    anotherDsId = res2.body.id;

    // Create a soft-deleted datasource
    const res3 = await request(app.getHttpServer())
      .post('/api/v1/datasources')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ...basePayload, name: 'Soft Deleted For Edit' });
    const softDeletedId = res3.body.id;

    const dataSource = app.get(DataSource);
    const dsRepo = dataSource.getRepository(Datasource);
    await dsRepo.update({ id: softDeletedId }, { deleted_at: new Date() });
  });

  afterAll(async () => {
    await app?.close();
  });

  // === GET /api/v1/datasources/:id ===

  describe('GET /api/v1/datasources/:id', () => {
    it('should return single datasource by id (HTTP 200)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/datasources/${createdDsId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(createdDsId);
      expect(res.body.name).toBe('F013 Edit Target');
      expect(res.body.type).toBe('mysql');
      expect(res.body.host).toBe('192.168.1.100');
      expect(res.body.port).toBe(3306);
      expect(res.body.databaseName).toBe('edit_db');
      expect(res.body.username).toBe('db_admin');
      expect(res.body.description).toBe('Target for edit tests');
      expect(res.body.status).toBe('unknown');
      expect(res.body).toHaveProperty('createdAt');
      expect(res.body).toHaveProperty('updatedAt');
      // Must NOT contain password
      expect(res.body).not.toHaveProperty('password');
      expect(res.body).not.toHaveProperty('encrypted_password');
      expect(res.body).not.toHaveProperty('encryptedPassword');
    });

    it('should return 404 for non-existent id', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/datasources/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('DS_NOT_FOUND');
    });

    it('should return 404 for soft-deleted datasource', async () => {
      const dataSource = app.get(DataSource);
      const dsRepo = dataSource.getRepository(Datasource);
      const softDeleted = await dsRepo.findOne({ where: { name: 'Soft Deleted For Edit' } });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/datasources/${softDeleted!.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('DS_NOT_FOUND');
    });

    it('should return 403 for non-admin user', async () => {
      const userToken = await getUserToken(app);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/datasources/${createdDsId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('AUTH_FORBIDDEN');
    });
  });

  // === PUT /api/v1/datasources/:id ===

  describe('PUT /api/v1/datasources/:id', () => {
    const updatePayload = {
      name: 'F013 Edit Target',
      type: 'mysql',
      host: 'new-host.example.com',
      port: 3307,
      databaseName: 'edit_db',
      username: 'db_admin',
      description: 'Updated description',
    };

    // TS-F013-001: 成功修改連線參數
    it('should update datasource and reset status to unknown (HTTP 200)', async () => {
      // First set status to connected via DB
      const dataSource = app.get(DataSource);
      const dsRepo = dataSource.getRepository(Datasource);
      await dsRepo.update({ id: createdDsId }, { status: 'connected', last_tested_at: new Date() });

      const res = await request(app.getHttpServer())
        .put(`/api/v1/datasources/${createdDsId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updatePayload);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(createdDsId);
      expect(res.body.host).toBe('new-host.example.com');
      expect(res.body.port).toBe(3307);
      expect(res.body.description).toBe('Updated description');
      expect(res.body.status).toBe('unknown'); // BR-4: reset to unknown
      expect(res.body).toHaveProperty('updatedAt');
      expect(res.body).not.toHaveProperty('password');
      expect(res.body).not.toHaveProperty('encrypted_password');
    });

    // TS-F013-002: 密碼為空保留現有密碼
    it('should preserve existing password when password is null', async () => {
      // Record current encrypted_password
      const dataSource = app.get(DataSource);
      const dsRepo = dataSource.getRepository(Datasource);
      const before = await dsRepo.findOne({ where: { id: createdDsId } });

      const res = await request(app.getHttpServer())
        .put(`/api/v1/datasources/${createdDsId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ...updatePayload, password: null });

      expect(res.status).toBe(200);

      // Verify password unchanged in DB
      const after = await dsRepo.findOne({ where: { id: createdDsId } });
      expect(after!.encrypted_password).toBe(before!.encrypted_password);
    });

    // TS-F013-002 (variant): password as empty string also preserves
    it('should preserve existing password when password is empty string', async () => {
      const dataSource = app.get(DataSource);
      const dsRepo = dataSource.getRepository(Datasource);
      const before = await dsRepo.findOne({ where: { id: createdDsId } });

      const res = await request(app.getHttpServer())
        .put(`/api/v1/datasources/${createdDsId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ...updatePayload, password: '' });

      expect(res.status).toBe(200);

      const after = await dsRepo.findOne({ where: { id: createdDsId } });
      expect(after!.encrypted_password).toBe(before!.encrypted_password);
    });

    // TS-F013-003: 更新密碼
    it('should update password when new password provided', async () => {
      const dataSource = app.get(DataSource);
      const dsRepo = dataSource.getRepository(Datasource);
      const before = await dsRepo.findOne({ where: { id: createdDsId } });

      const res = await request(app.getHttpServer())
        .put(`/api/v1/datasources/${createdDsId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ...updatePayload, password: 'NewSecretP@ss' });

      expect(res.status).toBe(200);

      const after = await dsRepo.findOne({ where: { id: createdDsId } });
      expect(after!.encrypted_password).not.toBe(before!.encrypted_password);
      expect(after!.encrypted_password).toContain(':'); // AES-256-GCM format
    });

    // TS-F013-004: 名稱保留原值不觸發重複
    it('should allow keeping the same name (self-exclusion)', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/v1/datasources/${createdDsId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ...updatePayload, name: 'F013 Edit Target' });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('F013 Edit Target');
    });

    // TS-F013-005: 名稱與其他資料來源重複
    it('should return 409 when name conflicts with another datasource', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/v1/datasources/${createdDsId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ...updatePayload, name: 'Another Datasource' });

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('DS_NAME_EXISTS');
      expect(res.body.message).toBe('此名稱的資料來源已存在');
    });

    // TS-F013-006: 資料來源不存在
    it('should return 404 for non-existent datasource', async () => {
      const res = await request(app.getHttpServer())
        .put('/api/v1/datasources/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updatePayload);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('DS_NOT_FOUND');
    });

    // TS-F013-006 (variant): soft-deleted datasource
    it('should return 404 for soft-deleted datasource', async () => {
      const dataSource = app.get(DataSource);
      const dsRepo = dataSource.getRepository(Datasource);
      const softDeleted = await dsRepo.findOne({ where: { name: 'Soft Deleted For Edit' } });

      const res = await request(app.getHttpServer())
        .put(`/api/v1/datasources/${softDeleted!.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updatePayload);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('DS_NOT_FOUND');
    });

    // TS-F013-007: 非 Admin 編輯
    it('should return 403 for non-admin user', async () => {
      const userToken = await getUserToken(app);

      const res = await request(app.getHttpServer())
        .put(`/api/v1/datasources/${createdDsId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send(updatePayload);

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('AUTH_FORBIDDEN');
    });

    // TS-F013-008: Port 邊界值
    describe('port boundary validation', () => {
      it('should return 422 for port=0', async () => {
        const res = await request(app.getHttpServer())
          .put(`/api/v1/datasources/${createdDsId}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ ...updatePayload, port: 0 });

        expect(res.status).toBe(422);
        expect(res.body.error).toBe('VALIDATION_ERROR');
      });

      it('should accept port=1', async () => {
        const res = await request(app.getHttpServer())
          .put(`/api/v1/datasources/${createdDsId}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ ...updatePayload, port: 1 });

        expect(res.status).toBe(200);
      });

      it('should accept port=65535', async () => {
        const res = await request(app.getHttpServer())
          .put(`/api/v1/datasources/${createdDsId}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ ...updatePayload, port: 65535 });

        expect(res.status).toBe(200);
      });

      it('should return 422 for port=65536', async () => {
        const res = await request(app.getHttpServer())
          .put(`/api/v1/datasources/${createdDsId}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ ...updatePayload, port: 65536 });

        expect(res.status).toBe(422);
        expect(res.body.error).toBe('VALIDATION_ERROR');
      });
    });
  });
});
