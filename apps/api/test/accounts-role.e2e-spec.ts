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

// Second admin for multi-admin tests
const ADMIN_SECOND = {
  id: 'e2e2e2e2-2222-2222-2222-222222222222',
  name: 'Second Admin',
  email: 'admin2@cdmp.test',
  role: 'admin' as const,
  status: 'active' as const,
};

// Target user for role change
const ROLE_TARGET = {
  id: 'f3f3f3f3-3333-3333-3333-333333333333',
  name: 'Role Target User',
  email: 'role-target@cdmp.test',
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
      id: ADMIN_SECOND.id,
      name: ADMIN_SECOND.name,
      email: ADMIN_SECOND.email,
      password_hash: hashedPassword,
      role: ADMIN_SECOND.role,
      status: ADMIN_SECOND.status,
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
      id: ROLE_TARGET.id,
      name: ROLE_TARGET.name,
      email: ROLE_TARGET.email,
      password_hash: hashedPassword,
      role: ROLE_TARGET.role,
      status: ROLE_TARGET.status,
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

describe('F008: Change Role (PATCH /api/v1/accounts/:id/role)', () => {
  let app: INestApplication;
  let adminToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAdminToken(app);
  });

  afterAll(async () => {
    await app?.close();
  });

  // TS-F008-001: User 升級為 Admin
  it('should upgrade User to Admin and return 200 with role=admin', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/api/v1/accounts/${ROLE_TARGET.id}/role`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'admin' });

    expect(response.status).toBe(200);
    expect(response.body.id).toBe(ROLE_TARGET.id);
    expect(response.body.role).toBe('admin');
    expect(response.body.name).toBe(ROLE_TARGET.name);
    expect(response.body.email).toBe(ROLE_TARGET.email);
    expect(response.body).toHaveProperty('updated_at');
    expect(response.body).not.toHaveProperty('password_hash');

    // Verify via GET
    const getRes = await request(app.getHttpServer())
      .get('/api/v1/accounts')
      .set('Authorization', `Bearer ${adminToken}`);
    const found = getRes.body.data.find((a: any) => a.id === ROLE_TARGET.id);
    expect(found.role).toBe('admin');
  });

  // TS-F008-002: Admin 降級為 User（系統有 >= 2 Admin）
  it('should downgrade Admin to User when system has >= 2 Admins', async () => {
    // ROLE_TARGET was upgraded to admin in previous test
    // System now has: ADMIN_ACTIVE, ADMIN_SECOND, ROLE_TARGET = 3 admins
    const response = await request(app.getHttpServer())
      .patch(`/api/v1/accounts/${ROLE_TARGET.id}/role`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'user' });

    expect(response.status).toBe(200);
    expect(response.body.id).toBe(ROLE_TARGET.id);
    expect(response.body.role).toBe('user');
    expect(response.body).toHaveProperty('updated_at');
  });

  // TS-F008-003: 最後一位 Admin 保護
  it('should return 422 ACCOUNT_LAST_ADMIN when downgrading last Admin', async () => {
    // First, downgrade ADMIN_SECOND to user so only ADMIN_ACTIVE remains
    const downgradeRes = await request(app.getHttpServer())
      .patch(`/api/v1/accounts/${ADMIN_SECOND.id}/role`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'user' });
    expect(downgradeRes.status).toBe(200);

    // Now try to downgrade the last admin (ADMIN_ACTIVE)
    const response = await request(app.getHttpServer())
      .patch(`/api/v1/accounts/${ADMIN_ACTIVE.id}/role`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'user' });

    expect(response.status).toBe(422);
    expect(response.body.error).toBe('ACCOUNT_LAST_ADMIN');
    expect(response.body.message).toBe('無法移除最後一位 Admin，系統必須至少保留一個 Admin 帳號。');
  });

  // TS-F008-004: 帳號不存在
  it('should return 404 ACCOUNT_NOT_FOUND for non-existent UUID', async () => {
    const response = await request(app.getHttpServer())
      .patch('/api/v1/accounts/00000000-0000-0000-0000-000000000000/role')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'admin' });

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('ACCOUNT_NOT_FOUND');
    expect(response.body.message).toBe('找不到指定的帳號');
  });

  // TS-F008-005: 無效角色值
  it('should return 422 for invalid role value', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/api/v1/accounts/${ROLE_TARGET.id}/role`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'superadmin' });

    expect(response.status).toBe(422);
    expect(response.body.error).toBe('VALIDATION_ERROR');
  });

  // TS-F008-006: 冪等操作
  it('should return 200 idempotently when setting same role', async () => {
    // ROLE_TARGET is currently 'user' (from TS-F008-002)
    const response = await request(app.getHttpServer())
      .patch(`/api/v1/accounts/${ROLE_TARGET.id}/role`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'user' });

    expect(response.status).toBe(200);
    expect(response.body.role).toBe('user');
  });

  // Extra: 未帶 Token
  it('should return 401 when no token is provided', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/api/v1/accounts/${ROLE_TARGET.id}/role`)
      .send({ role: 'admin' });

    expect(response.status).toBe(401);
  });

  // Extra: 非 Admin 嘗試變更角色
  it('should return 403 when non-admin tries to change role', async () => {
    const userToken = await getUserToken(app);

    const response = await request(app.getHttpServer())
      .patch(`/api/v1/accounts/${ROLE_TARGET.id}/role`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ role: 'admin' });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('AUTH_FORBIDDEN');
  });
});
