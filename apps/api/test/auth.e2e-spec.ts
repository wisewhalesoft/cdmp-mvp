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
import { HashUtil } from '@/common/hash/hash.util';
import {
  ADMIN_ACTIVE,
  ADMIN_DISABLED,
  USER_ACTIVE,
  USER_DISABLED,
} from './seeds/test-data';

async function createTestApp(throttleLimit: number): Promise<INestApplication> {
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
        entities: [User],
        synchronize: true,
      }),
      ThrottlerModule.forRoot([
        {
          name: 'login',
          ttl: 60000,
          limit: throttleLimit,
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
      id: ADMIN_DISABLED.id,
      name: ADMIN_DISABLED.name,
      email: ADMIN_DISABLED.email,
      password_hash: hashedPassword,
      role: ADMIN_DISABLED.role,
      status: ADMIN_DISABLED.status,
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
      id: USER_DISABLED.id,
      name: USER_DISABLED.name,
      email: USER_DISABLED.email,
      password_hash: hashedPassword,
      role: USER_DISABLED.role,
      status: USER_DISABLED.status,
    }),
  ]);

  return app;
}

describe('Auth E2E - Functional (POST /api/v1/auth/login)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    // High throttle limit so functional tests are not affected
    app = await createTestApp(100);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('should return 200 with token and user for valid credentials', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: ADMIN_ACTIVE.email,
        password: ADMIN_ACTIVE.password,
      });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('token');
    expect(response.body).toHaveProperty('user');
    expect(response.body.user.id).toBe(ADMIN_ACTIVE.id);
    expect(response.body.user.email).toBe(ADMIN_ACTIVE.email);
    expect(response.body.user.role).toBe('admin');
    expect(response.body.user).not.toHaveProperty('password_hash');
  });

  it('should return 401 for wrong password', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: ADMIN_ACTIVE.email,
        password: 'WrongPassword',
      });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('AUTH_INVALID_CREDENTIALS');
    expect(response.body.message).toBe('Email 或密碼錯誤');
  });

  it('should return 401 for non-existent email', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: 'nobody@cdmp.test',
        password: 'P@ssw0rd123',
      });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('AUTH_INVALID_CREDENTIALS');
    expect(response.body.message).toBe('Email 或密碼錯誤');
  });

  it('should return 403 for disabled account', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: ADMIN_DISABLED.email,
        password: ADMIN_DISABLED.password,
      });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('AUTH_ACCOUNT_DISABLED');
    expect(response.body.message).toBe('您的帳號已被停用，請聯絡管理員。');
  });

  it('should return 400 for empty email', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: '',
        password: 'P@ssw0rd123',
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('VALIDATION_ERROR');
  });

  it('should return 400 for empty password', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: 'admin@cdmp.test',
        password: '',
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('VALIDATION_ERROR');
  });

  it('should return 200 with 30d JWT expiry for rememberMe=true', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: ADMIN_ACTIVE.email,
        password: ADMIN_ACTIVE.password,
        rememberMe: true,
      });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('token');

    // Decode JWT to check expiry
    const token = response.body.token;
    const payloadBase64 = token.split('.')[1];
    const payload = JSON.parse(Buffer.from(payloadBase64, 'base64').toString());
    const diff = payload.exp - payload.iat;
    expect(diff).toBe(30 * 24 * 60 * 60); // 30 days
  });
});

describe('Auth E2E - F002 User Login (POST /api/v1/auth/login)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp(100);
  });

  afterAll(async () => {
    await app?.close();
  });

  // TS-F002-001: User 正確憑證 → 200, role=user
  it('should return 200 with token and user for valid user credentials', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: USER_ACTIVE.email,
        password: USER_ACTIVE.password,
      });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('token');
    expect(response.body.user.id).toBe(USER_ACTIVE.id);
    expect(response.body.user.email).toBe(USER_ACTIVE.email);
    expect(response.body.user.role).toBe('user');
    expect(response.body.user).not.toHaveProperty('password_hash');
  });

  // TS-F002-002: User rememberMe → 200, JWT 30d
  it('should return 200 with 30d JWT expiry for user rememberMe=true', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: USER_ACTIVE.email,
        password: USER_ACTIVE.password,
        rememberMe: true,
      });

    expect(response.status).toBe(200);
    const token = response.body.token;
    const payloadBase64 = token.split('.')[1];
    const payload = JSON.parse(Buffer.from(payloadBase64, 'base64').toString());
    const diff = payload.exp - payload.iat;
    expect(diff).toBe(30 * 24 * 60 * 60);
  });

  // TS-F002-005: User 停用 → 403
  it('should return 403 for disabled user account', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: USER_DISABLED.email,
        password: USER_DISABLED.password,
      });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('AUTH_ACCOUNT_DISABLED');
  });

  // TS-F002-006: User 錯誤密碼 → 401
  it('should return 401 for wrong user password', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: USER_ACTIVE.email,
        password: 'WrongPassword',
      });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('AUTH_INVALID_CREDENTIALS');
  });

  // TS-F002-003: User token 存取 Admin API → 403 FORBIDDEN
  it('should return 403 when user token accesses admin-only endpoint', async () => {
    // First login as user to get token
    const loginResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: USER_ACTIVE.email,
        password: USER_ACTIVE.password,
      });

    const userToken = loginResponse.body.token;

    // Try to access admin-only endpoint
    const response = await request(app.getHttpServer())
      .get('/api/v1/accounts')
      .set('Authorization', `Bearer ${userToken}`);

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('AUTH_FORBIDDEN');
    expect(response.body.message).toBe('您沒有權限執行此操作。');
  });

  it('should allow admin token to access admin-only endpoint', async () => {
    // Login as admin
    const loginResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: ADMIN_ACTIVE.email,
        password: ADMIN_ACTIVE.password,
      });

    const adminToken = loginResponse.body.token;

    // Access admin-only endpoint
    const response = await request(app.getHttpServer())
      .get('/api/v1/accounts')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
  });
});

describe('Auth E2E - Rate Limiting (POST /api/v1/auth/login)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    // BR-004: 5 requests per minute per IP
    app = await createTestApp(5);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('should return 429 after exceeding rate limit (6th attempt)', async () => {
    // Make 5 rapid requests (within the limit)
    for (let i = 0; i < 5; i++) {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'ratelimit@cdmp.test',
          password: 'wrong',
        });
    }

    // 6th attempt should be rate limited
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: 'ratelimit@cdmp.test',
        password: 'wrong',
      });

    expect(response.status).toBe(429);
  });
});
