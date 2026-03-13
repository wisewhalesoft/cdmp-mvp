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
import { HashUtil } from '@/common/hash/hash.util';
import {
  ADMIN_ACTIVE,
  USER_ACTIVE,
} from './seeds/test-data';

// Extra seed user for toggle tests — a second user target
const TOGGLE_TARGET = {
  id: 'f1f1f1f1-1111-1111-1111-111111111111',
  name: 'Toggle Target',
  email: 'toggle-target@cdmp.test',
  role: 'user' as const,
  status: 'active' as const,
};

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
        entities: [User, TokenBlocklist],
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
    }),
    userRepo.create({
      id: USER_ACTIVE.id,
      name: USER_ACTIVE.name,
      email: USER_ACTIVE.email,
      password_hash: hashedPassword,
      role: USER_ACTIVE.role,
      status: USER_ACTIVE.status,
    }),
    userRepo.create({
      id: TOGGLE_TARGET.id,
      name: TOGGLE_TARGET.name,
      email: TOGGLE_TARGET.email,
      password_hash: hashedPassword,
      role: TOGGLE_TARGET.role,
      status: TOGGLE_TARGET.status,
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

describe('F007: Toggle Account Status (PATCH /api/v1/accounts/:id/status)', () => {
  let app: INestApplication;
  let adminToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAdminToken(app);
  });

  afterAll(async () => {
    await app?.close();
  });

  // TS-F007-001: 成功停用帳號
  it('should disable an active account and return 200 with status=disabled', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/api/v1/accounts/${TOGGLE_TARGET.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'disabled' });

    expect(response.status).toBe(200);
    expect(response.body.id).toBe(TOGGLE_TARGET.id);
    expect(response.body.status).toBe('disabled');
    expect(response.body.name).toBe(TOGGLE_TARGET.name);
    expect(response.body.email).toBe(TOGGLE_TARGET.email);
    expect(response.body).toHaveProperty('updated_at');
    expect(response.body).not.toHaveProperty('password_hash');
  });

  // TS-F007-002: 停用後 Token 失效
  it('should return 401 when disabled user tries to use their token', async () => {
    // 1. Login as USER_ACTIVE to get their token
    const userToken = await getUserToken(app);

    // 2. Admin disables USER_ACTIVE
    const disableRes = await request(app.getHttpServer())
      .patch(`/api/v1/accounts/${USER_ACTIVE.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'disabled' });
    expect(disableRes.status).toBe(200);
    expect(disableRes.body.status).toBe('disabled');

    // 3. USER_ACTIVE's token should be rejected on any protected endpoint
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${userToken}`);

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('AUTH_TOKEN_REVOKED');
    expect(response.body.message).toBe('Session 已失效，請重新登入。');
  });

  // TS-F007-003: 停用後無法登入
  it('should return 403 AUTH_ACCOUNT_DISABLED when disabled user tries to login', async () => {
    // USER_ACTIVE was disabled in previous test
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: USER_ACTIVE.email,
        password: USER_ACTIVE.password,
      });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('AUTH_ACCOUNT_DISABLED');
    expect(response.body.message).toBe('您的帳號已被停用，請聯絡管理員。');
  });

  // TS-F007-004: 成功啟用帳號
  it('should enable a disabled account and return 200 with status=active', async () => {
    // Re-enable USER_ACTIVE (disabled from TS-F007-002)
    const response = await request(app.getHttpServer())
      .patch(`/api/v1/accounts/${USER_ACTIVE.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'active' });

    expect(response.status).toBe(200);
    expect(response.body.id).toBe(USER_ACTIVE.id);
    expect(response.body.status).toBe('active');
    expect(response.body).toHaveProperty('updated_at');

    // Verify user can login again after re-enabling
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: USER_ACTIVE.email,
        password: USER_ACTIVE.password,
      });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body).toHaveProperty('token');
  });

  // TS-F007-005: 防止自我停用
  it('should return 422 ACCOUNT_SELF_DISABLE when admin tries to disable self', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/api/v1/accounts/${ADMIN_ACTIVE.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'disabled' });

    expect(response.status).toBe(422);
    expect(response.body.error).toBe('ACCOUNT_SELF_DISABLE');
    expect(response.body.message).toBe('您無法停用自己的帳號');
  });

  // TS-F007-006: 帳號不存在
  it('should return 404 ACCOUNT_NOT_FOUND for non-existent UUID', async () => {
    const response = await request(app.getHttpServer())
      .patch('/api/v1/accounts/00000000-0000-0000-0000-000000000000/status')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'disabled' });

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('ACCOUNT_NOT_FOUND');
    expect(response.body.message).toBe('找不到指定的帳號');
  });

  // TS-F007-007: 冪等操作
  it('should return 200 when disabling already-disabled account (idempotent)', async () => {
    // TOGGLE_TARGET was disabled in TS-F007-001
    const response = await request(app.getHttpServer())
      .patch(`/api/v1/accounts/${TOGGLE_TARGET.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'disabled' });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('disabled');
  });

  // Extra: 非 Admin 嘗試變更狀態
  it('should return 403 when non-admin tries to toggle status', async () => {
    const userToken = await getUserToken(app);

    const response = await request(app.getHttpServer())
      .patch(`/api/v1/accounts/${TOGGLE_TARGET.id}/status`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ status: 'active' });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('AUTH_FORBIDDEN');
  });

  // Extra: 無效狀態值
  it('should return 422 for invalid status value', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/api/v1/accounts/${TOGGLE_TARGET.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'invalid' });

    expect(response.status).toBe(422);
    expect(response.body.error).toBe('VALIDATION_ERROR');
  });
});
