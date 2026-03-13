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

describe('F004: Create Account E2E (POST /api/v1/accounts)', () => {
  let app: INestApplication;
  let adminToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAdminToken(app);
  });

  afterAll(async () => {
    await app?.close();
  });

  // TS-F004-001: 成功建立 Admin 帳號
  it('should create admin account and return 201', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/accounts')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'New Admin',
        email: 'newadmin@cdmp.test',
        password: 'P@ssw0rd123',
        role: 'admin',
      });

    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty('id');
    expect(response.body.name).toBe('New Admin');
    expect(response.body.email).toBe('newadmin@cdmp.test');
    expect(response.body.role).toBe('admin');
    expect(response.body.status).toBe('active');
    expect(response.body).toHaveProperty('created_at');
    expect(response.body).not.toHaveProperty('password_hash');
  });

  // TS-F004-002: 成功建立 User 帳號
  it('should create user account and return 201', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/accounts')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'New User',
        email: 'newuser@cdmp.test',
        password: 'P@ssw0rd123',
        role: 'user',
      });

    expect(response.status).toBe(201);
    expect(response.body.role).toBe('user');
    expect(response.body.status).toBe('active');
  });

  // TS-F004-003: Email 自動轉小寫
  it('should convert email to lowercase', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/accounts')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Lowercase Test',
        email: 'Test@CDMP.Test',
        password: 'P@ssw0rd123',
        role: 'user',
      });

    expect(response.status).toBe(201);
    expect(response.body.email).toBe('test@cdmp.test');
  });

  // TS-F004-004: Email 重複（大小寫不敏感）
  it('should return 409 for duplicate email (case-insensitive)', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/accounts')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Duplicate',
        email: 'ADMIN@CDMP.TEST',
        password: 'P@ssw0rd123',
        role: 'user',
      });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('ACCOUNT_EMAIL_EXISTS');
    expect(response.body.message).toBe('此 Email 已有帳號存在');
  });

  // TS-F004-005: 非 Admin 嘗試建立帳號
  it('should return 403 for non-admin user', async () => {
    const userToken = await getUserToken(app);

    const response = await request(app.getHttpServer())
      .post('/api/v1/accounts')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        name: 'Forbidden',
        email: 'forbidden@cdmp.test',
        password: 'P@ssw0rd123',
        role: 'user',
      });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('AUTH_FORBIDDEN');
  });

  // TS-F004-006: 無效角色值
  it('should return 422 for invalid role value', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/accounts')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Bad Role',
        email: 'badrole@cdmp.test',
        password: 'P@ssw0rd123',
        role: 'superadmin',
      });

    expect(response.status).toBe(422);
    expect(response.body.error).toBe('VALIDATION_ERROR');
  });

  // TS-F004-007: 密碼恰好 8 字元（邊界通過）
  it('should accept password with exactly 8 characters', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/accounts')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Min Password',
        email: 'minpw@cdmp.test',
        password: '12345678',
        role: 'user',
      });

    expect(response.status).toBe(201);
  });

  // TS-F004-008: 密碼僅 7 字元（邊界失敗）
  it('should return 422 for password with only 7 characters', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/accounts')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Short Password',
        email: 'shortpw@cdmp.test',
        password: '1234567',
        role: 'user',
      });

    expect(response.status).toBe(422);
    expect(response.body.error).toBe('VALIDATION_ERROR');
  });
});
