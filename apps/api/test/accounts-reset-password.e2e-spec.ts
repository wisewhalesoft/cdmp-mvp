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
} from './seeds/test-data';

// Target user for password reset tests
const RESET_TARGET = {
  id: 'f010f010-1010-1010-1010-101010101010',
  name: 'Reset Target User',
  email: 'reset-target@cdmp.test',
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
      id: RESET_TARGET.id,
      name: RESET_TARGET.name,
      email: RESET_TARGET.email,
      password_hash: hashedPassword,
      role: RESET_TARGET.role,
      status: RESET_TARGET.status,
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

async function getTargetToken(app: INestApplication): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email: RESET_TARGET.email, password: ADMIN_ACTIVE.password });
  return res.body.token;
}

describe('F010: Admin Reset Password (POST /api/v1/accounts/:id/reset-password)', () => {
  let app: INestApplication;
  let adminToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAdminToken(app);
  });

  afterAll(async () => {
    await app?.close();
  });

  // TS-F010-005: 密碼不足 8 字元
  it('should return 422 VALIDATION_PASSWORD_LENGTH for password shorter than 8 chars', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/accounts/${RESET_TARGET.id}/reset-password`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ newPassword: 'short' });

    expect(response.status).toBe(422);
    expect(response.body.error).toBe('VALIDATION_ERROR');
  });

  // TS-F010-006: 密碼恰好 8 字元（邊界值）
  it('should return 200 for password with exactly 8 chars', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/accounts/${RESET_TARGET.id}/reset-password`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ newPassword: '12345678' });

    expect(response.status).toBe(200);
    expect(response.body.message).toBe('密碼已重設，使用者需以新密碼重新登入');
  });

  // TS-F010-001: 成功重設密碼，可用新密碼登入
  it('should reset password successfully and allow login with new password', async () => {
    const newPassword = 'NewPass99';

    const response = await request(app.getHttpServer())
      .post(`/api/v1/accounts/${RESET_TARGET.id}/reset-password`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ newPassword });

    expect(response.status).toBe(200);
    expect(response.body.message).toBe('密碼已重設，使用者需以新密碼重新登入');

    // Verify: login with new password
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: RESET_TARGET.email, password: newPassword });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.token).toBeDefined();
    expect(loginRes.body.user.id).toBe(RESET_TARGET.id);
  });

  // TS-F010-002: 重設後舊 Token 失效
  it('should invalidate old session tokens after password reset', async () => {
    // Step 1: Login as target to get a token
    const targetLoginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: RESET_TARGET.email, password: 'NewPass99' });
    expect(targetLoginRes.status).toBe(200);
    const oldTargetToken = targetLoginRes.body.token;

    // Step 2: Admin resets target's password
    const resetRes = await request(app.getHttpServer())
      .post(`/api/v1/accounts/${RESET_TARGET.id}/reset-password`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ newPassword: 'AnotherPass1' });
    expect(resetRes.status).toBe(200);

    // Step 3: Old token should be invalidated
    const verifyRes = await request(app.getHttpServer())
      .get('/api/v1/accounts')
      .set('Authorization', `Bearer ${oldTargetToken}`);

    // Target is a 'user' role, so they get 403 for admin-only endpoint.
    // Instead, let's verify with auth-protected endpoint.
    // Since target is 'user' role, all /accounts endpoints return 403.
    // The key check is: old token is rejected with 401, not 403.
    expect(verifyRes.status).toBe(401);
  });

  // TS-F010-003: 不可重設自己密碼
  it('should return 422 ACCOUNT_SELF_RESET when admin resets own password', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/accounts/${ADMIN_ACTIVE.id}/reset-password`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ newPassword: 'SomeNewPass1' });

    expect(response.status).toBe(422);
    expect(response.body.error).toBe('ACCOUNT_SELF_RESET');
    expect(response.body.message).toBe('請透過個人設定變更您自己的密碼');
  });

  // TS-F010-004: 帳號不存在
  it('should return 404 ACCOUNT_NOT_FOUND for non-existent UUID', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/accounts/00000000-0000-0000-0000-000000000000/reset-password')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ newPassword: 'ValidPass1' });

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('ACCOUNT_NOT_FOUND');
    expect(response.body.message).toBe('找不到指定的帳號');
  });

  // Extra: 未帶 Token
  it('should return 401 when no token is provided', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/accounts/${RESET_TARGET.id}/reset-password`)
      .send({ newPassword: 'ValidPass1' });

    expect(response.status).toBe(401);
  });

  // Extra: 非 Admin 嘗試重設密碼
  it('should return 403 when non-admin tries to reset password', async () => {
    const userToken = await getUserToken(app);

    const response = await request(app.getHttpServer())
      .post(`/api/v1/accounts/${ADMIN_ACTIVE.id}/reset-password`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ newPassword: 'HackerPass1' });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('AUTH_FORBIDDEN');
  });
});
