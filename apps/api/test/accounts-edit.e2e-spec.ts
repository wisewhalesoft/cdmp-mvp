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

describe('F006: Edit Account E2E (PUT /api/v1/accounts/:id)', () => {
  let app: INestApplication;
  let adminToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAdminToken(app);
  });

  afterAll(async () => {
    await app?.close();
  });

  // TS-F006-001: 成功修改姓名
  it('should update name and return 200', async () => {
    const response = await request(app.getHttpServer())
      .put(`/api/v1/accounts/${USER_ACTIVE.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Updated Name',
        email: USER_ACTIVE.email,
      });

    expect(response.status).toBe(200);
    expect(response.body.name).toBe('Updated Name');
    expect(response.body.email).toBe(USER_ACTIVE.email);
    expect(response.body.role).toBe('user');
    expect(response.body.status).toBe('active');
    expect(response.body).toHaveProperty('updated_at');
    expect(response.body).not.toHaveProperty('password_hash');
  });

  // TS-F006-002: 成功修改 Email（轉小寫）
  it('should update email and convert to lowercase', async () => {
    const response = await request(app.getHttpServer())
      .put(`/api/v1/accounts/${USER_ACTIVE.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Updated Name',
        email: 'NEWEMAIL@CDMP.TEST',
      });

    expect(response.status).toBe(200);
    expect(response.body.email).toBe('newemail@cdmp.test');
  });

  // TS-F006-003: Email 保留原值不觸發重複錯誤（自身排除）
  it('should allow updating with same email (self-exclusion)', async () => {
    // First restore email
    await request(app.getHttpServer())
      .put(`/api/v1/accounts/${USER_ACTIVE.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Self Test', email: USER_ACTIVE.email });

    const response = await request(app.getHttpServer())
      .put(`/api/v1/accounts/${USER_ACTIVE.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Self Test Updated',
        email: USER_ACTIVE.email,
      });

    expect(response.status).toBe(200);
    expect(response.body.name).toBe('Self Test Updated');
  });

  // TS-F006-004: Email 與其他帳號重複
  it('should return 409 for duplicate email with another account', async () => {
    const response = await request(app.getHttpServer())
      .put(`/api/v1/accounts/${USER_ACTIVE.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Test',
        email: ADMIN_ACTIVE.email, // Admin's email
      });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('ACCOUNT_EMAIL_IN_USE');
    expect(response.body.message).toBe('此 Email 已被使用');
  });

  // TS-F006-005: 帳號不存在
  it('should return 404 for non-existent account', async () => {
    const response = await request(app.getHttpServer())
      .put('/api/v1/accounts/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Test',
        email: 'test@cdmp.test',
      });

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('ACCOUNT_NOT_FOUND');
    expect(response.body.message).toBe('找不到指定的帳號');
  });

  // TS-F006-006: 非 Admin 編輯帳號
  it('should return 403 for non-admin user', async () => {
    const userToken = await getUserToken(app);

    const response = await request(app.getHttpServer())
      .put(`/api/v1/accounts/${USER_ACTIVE.id}`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        name: 'Forbidden',
        email: 'forbidden@cdmp.test',
      });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('AUTH_FORBIDDEN');
  });

  // TS-F006-007: 空姓名
  it('should return 422 for empty name', async () => {
    const response = await request(app.getHttpServer())
      .put(`/api/v1/accounts/${USER_ACTIVE.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: '',
        email: 'valid@cdmp.test',
      });

    expect(response.status).toBe(422);
    expect(response.body.error).toBe('VALIDATION_ERROR');
  });

  // TS-F006-008: 姓名 100 字元（最大長度邊界）
  it('should accept name with exactly 100 characters', async () => {
    const longName = 'A'.repeat(100);

    const response = await request(app.getHttpServer())
      .put(`/api/v1/accounts/${USER_ACTIVE.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: longName,
        email: USER_ACTIVE.email,
      });

    expect(response.status).toBe(200);
    expect(response.body.name).toBe(longName);
  });
});
