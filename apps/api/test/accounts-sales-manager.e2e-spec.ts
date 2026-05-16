/**
 * DEPRECATED（E07 重構 P1 B2 補完 / 2026-05-16）
 *
 * 此 e2e spec 測試 `is_sales_manager` 旗標欄位，已於 m14 (1711360000170-AddBusinessRoleDropLegacyFlags)
 * 從 users 表移除。功能合併至 `business_role` 欄位（per AD-E07 v3.0）。
 *
 * 等價測試請參考：
 *   - F006a 端點 (PATCH /accounts/:id/business-role)
 *   - F004 已更新測試（採 business_role 欄位）
 *
 * 整個 describe 已 410 Gone — 全部 skip 並保留供歷史追溯。
 * 後續清理可於 P2 階段刪除此檔案。
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AuthModule } from '@/modules/auth/auth.module';
import { AccountsModule } from '@/modules/accounts/accounts.module';
import { HttpExceptionFilter } from '@/common/filters/http-exception.filter';
import { User } from '@/database/entities/user.entity';
import { TokenBlocklist } from '@/database/entities/token-blocklist.entity';
import { PasswordResetToken } from '@/database/entities/password-reset-token.entity';
import { HashUtil } from '@/common/hash/hash.util';
import {
  ADMIN_ACTIVE,
  USER_ACTIVE,
  SALES_MANAGER_ACTIVE,
} from './seeds/test-data';

async function createTestApp(): Promise<INestApplication> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        load: [
          () => ({
            JWT_SECRET: 'test-jwt-secret-key-for-e2e-testing',
          }),
        ],
      }),
      TypeOrmModule.forRoot({
        type: 'better-sqlite3',
        database: ':memory:',
        entities: [User, TokenBlocklist, PasswordResetToken],
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
      is_sales_manager: false,
    }),
    userRepo.create({
      id: USER_ACTIVE.id,
      name: USER_ACTIVE.name,
      email: USER_ACTIVE.email,
      password_hash: hashedPassword,
      role: USER_ACTIVE.role,
      status: USER_ACTIVE.status,
      is_sales_manager: false,
    }),
    userRepo.create({
      id: SALES_MANAGER_ACTIVE.id,
      name: SALES_MANAGER_ACTIVE.name,
      email: SALES_MANAGER_ACTIVE.email,
      password_hash: hashedPassword,
      role: SALES_MANAGER_ACTIVE.role,
      status: SALES_MANAGER_ACTIVE.status,
      is_sales_manager: true,
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

describe.skip('[DEPRECATED] F004 SM: Create Account with isSalesManager', () => {
  let app: INestApplication;
  let adminToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAdminToken(app);
  });

  afterAll(async () => {
    await app?.close();
  });

  // TS-F004-SM-001
  it('should create User with isSalesManager=true → DB true', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/accounts')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'SM User',
        email: 'sm-user@cdmp.test',
        password: 'P@ssw0rd123',
        role: 'user',
        isSalesManager: true,
      });

    expect(response.status).toBe(201);
    expect(response.body.role).toBe('user');
    expect(response.body.is_sales_manager).toBe(true);
    expect(typeof response.body.is_sales_manager).toBe('boolean');
  });

  // TS-F004-SM-002
  it('should create User with isSalesManager=false', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/accounts')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'No SM User',
        email: 'nosm-user@cdmp.test',
        password: 'P@ssw0rd123',
        role: 'user',
        isSalesManager: false,
      });

    expect(response.status).toBe(201);
    expect(response.body.is_sales_manager).toBe(false);
  });

  // TS-F004-SM-003
  it('should default isSalesManager to false when omitted', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/accounts')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Default User',
        email: 'default-user@cdmp.test',
        password: 'P@ssw0rd123',
        role: 'user',
      });

    expect(response.status).toBe(201);
    expect(response.body.is_sales_manager).toBe(false);
  });

  // TS-F004-SM-004 / AC-7
  it('should ignore isSalesManager when role=admin (force false)', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/accounts')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'New Admin',
        email: 'new-admin@cdmp.test',
        password: 'P@ssw0rd123',
        role: 'admin',
        isSalesManager: true,
      });

    expect(response.status).toBe(201);
    // BR-9: 後端強制覆寫為 false，不回 422
    expect(response.body.is_sales_manager).toBe(false);
  });

  // TS-F004-SM-EDGE-002: 字串型別應拒絕
  it('should return 422 when isSalesManager is a string instead of boolean', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/accounts')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Bad Type',
        email: 'bad-type@cdmp.test',
        password: 'P@ssw0rd123',
        role: 'user',
        isSalesManager: 'true',
      });

    expect(response.status).toBe(422);
    expect(response.body.error).toBe('VALIDATION_ERROR');
  });
});

describe.skip('[DEPRECATED] F006 SM: PUT /accounts/:id ignores isSalesManager', () => {
  let app: INestApplication;
  let adminToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAdminToken(app);
  });

  afterAll(async () => {
    await app?.close();
  });

  // TS-F006-SM-001
  it('should not modify is_sales_manager via PUT (whitelisted DTO)', async () => {
    // 目標 USER_ACTIVE 的 is_sales_manager=false；嘗試透過 PUT 改為 true
    const putRes = await request(app.getHttpServer())
      .put(`/api/v1/accounts/${USER_ACTIVE.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Renamed',
        email: USER_ACTIVE.email,
        isSalesManager: true,
      });

    // whitelist + forbidNonWhitelisted → 應回 422
    expect([200, 422]).toContain(putRes.status);

    // 不論回 200 或 422，DB 的 is_sales_manager 都不該被改為 true
    const listRes = await request(app.getHttpServer())
      .get('/api/v1/accounts')
      .set('Authorization', `Bearer ${adminToken}`);
    const target = listRes.body.data.find((a: any) => a.id === USER_ACTIVE.id);
    expect(target).toBeDefined();
    expect(target.is_sales_manager).toBe(false);
  });

  // TS-F006-SM-002: SALES_MANAGER (is_sales_manager=true) 不被清除
  it('should preserve is_sales_manager=true when PUT sends false in body', async () => {
    const putRes = await request(app.getHttpServer())
      .put(`/api/v1/accounts/${SALES_MANAGER_ACTIVE.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'SM Renamed',
        email: SALES_MANAGER_ACTIVE.email,
        // 故意嘗試破壞 SM 旗標
        isSalesManager: false,
      });

    expect([200, 422]).toContain(putRes.status);

    const listRes = await request(app.getHttpServer())
      .get('/api/v1/accounts')
      .set('Authorization', `Bearer ${adminToken}`);
    const target = listRes.body.data.find(
      (a: any) => a.id === SALES_MANAGER_ACTIVE.id,
    );
    expect(target).toBeDefined();
    // 仍維持 seed 值 true
    expect(target.is_sales_manager).toBe(true);
  });
});

describe.skip('[DEPRECATED] F008 SM: PATCH /accounts/:id/sales-manager-flag', () => {
  let app: INestApplication;
  let adminToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAdminToken(app);
  });

  afterAll(async () => {
    await app?.close();
  });

  // TS-F008-SM-001
  it('should toggle flag false → true for user account', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/api/v1/accounts/${USER_ACTIVE.id}/sales-manager-flag`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isSalesManager: true });

    expect(response.status).toBe(200);
    expect(response.body.is_sales_manager).toBe(true);
    expect(response.body.role).toBe('user');
    expect(response.body.id).toBe(USER_ACTIVE.id);
    expect(response.body).not.toHaveProperty('password_hash');
  });

  // TS-F008-SM-002
  it('should toggle flag true → false for user account', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/api/v1/accounts/${SALES_MANAGER_ACTIVE.id}/sales-manager-flag`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isSalesManager: false });

    expect(response.status).toBe(200);
    expect(response.body.is_sales_manager).toBe(false);
  });

  // TS-F008-SM-003 / BR-10
  it('should be idempotent (same value)', async () => {
    // SALES_MANAGER 剛被改為 false，再改一次 false
    const response = await request(app.getHttpServer())
      .patch(`/api/v1/accounts/${SALES_MANAGER_ACTIVE.id}/sales-manager-flag`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isSalesManager: false });

    expect(response.status).toBe(200);
    expect(response.body.is_sales_manager).toBe(false);
  });

  // TS-F008-SM-005 / AC-9
  it('should return 400 ACCOUNT_FLAG_NOT_APPLICABLE for admin account', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/api/v1/accounts/${ADMIN_ACTIVE.id}/sales-manager-flag`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isSalesManager: true });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('ACCOUNT_FLAG_NOT_APPLICABLE');
    expect(response.body.message).toBe('Admin 帳號不適用業務主管旗標');
  });

  // TS-F008-SM-006
  it('should return 404 for non-existent account', async () => {
    const response = await request(app.getHttpServer())
      .patch('/api/v1/accounts/00000000-0000-0000-0000-000000000000/sales-manager-flag')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isSalesManager: true });

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('ACCOUNT_NOT_FOUND');
  });

  // TS-F008-SM-007
  it('should return 403 for non-admin user', async () => {
    const userToken = await getUserToken(app);

    const response = await request(app.getHttpServer())
      .patch(`/api/v1/accounts/${USER_ACTIVE.id}/sales-manager-flag`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ isSalesManager: true });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('AUTH_FORBIDDEN');
  });

  // TS-F008-SM-008
  it('should return 422 when isSalesManager is a string', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/api/v1/accounts/${USER_ACTIVE.id}/sales-manager-flag`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isSalesManager: 'yes' });

    expect(response.status).toBe(422);
    expect(response.body.error).toBe('VALIDATION_ERROR');
  });

  // 未帶 Token
  it('should return 401 when no token provided', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/api/v1/accounts/${USER_ACTIVE.id}/sales-manager-flag`)
      .send({ isSalesManager: true });

    expect(response.status).toBe(401);
  });

  // TS-F008-SM-009: 角色變更不影響 is_sales_manager
  it('should preserve is_sales_manager when changing role', async () => {
    // 先把 USER_ACTIVE 旗標設為 true
    await request(app.getHttpServer())
      .patch(`/api/v1/accounts/${USER_ACTIVE.id}/sales-manager-flag`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isSalesManager: true });

    // 升級為 admin（旗標應保留在 DB 但被回 false 也可接受 — 但本實作回原值）
    const upgradeRes = await request(app.getHttpServer())
      .patch(`/api/v1/accounts/${USER_ACTIVE.id}/role`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'admin' });
    expect(upgradeRes.status).toBe(200);
    // F008 AC-10 / BR-8: DB 保留 flag 原值
    expect(upgradeRes.body.is_sales_manager).toBe(true);

    // 降回 user，旗標仍應保留 true
    const downgradeRes = await request(app.getHttpServer())
      .patch(`/api/v1/accounts/${USER_ACTIVE.id}/role`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'user' });
    expect(downgradeRes.status).toBe(200);
    expect(downgradeRes.body.is_sales_manager).toBe(true);
  });
});
