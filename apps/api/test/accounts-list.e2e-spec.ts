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
import { ADMIN_ACTIVE, USER_ACTIVE } from './seeds/test-data';

// Additional seed data for list tests
const EXTRA_USERS = [
  {
    id: 'e1e1e1e1-1111-1111-1111-111111111111',
    name: 'Admin Second',
    email: 'admin2@cdmp.test',
    role: 'admin' as const,
    status: 'active' as const,
  },
  {
    id: 'e2e2e2e2-2222-2222-2222-222222222222',
    name: 'Test UserTwo',
    email: 'testuser2@cdmp.test',
    role: 'user' as const,
    status: 'active' as const,
  },
  {
    id: 'e3e3e3e3-3333-3333-3333-333333333333',
    name: 'Disabled Person',
    email: 'disabledperson@cdmp.test',
    role: 'user' as const,
    status: 'disabled' as const,
  },
];

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

  // Seed with staggered created_at for sort order testing
  const allUsers = [
    { ...ADMIN_ACTIVE, password_hash: hashedPassword },
    { ...USER_ACTIVE, password_hash: hashedPassword },
    ...EXTRA_USERS.map((u) => ({ ...u, password_hash: hashedPassword })),
  ];

  for (const userData of allUsers) {
    const { password_hash, ...rest } = userData;
    await userRepo.save(
      userRepo.create({
        ...rest,
        password_hash,
      }),
    );
  }

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

describe('F005: View Account List E2E (GET /api/v1/accounts)', () => {
  let app: INestApplication;
  let adminToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAdminToken(app);
  });

  afterAll(async () => {
    await app?.close();
  });

  // TS-F005-001: 載入預設帳號清單
  it('should return paginated account list with default params', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/accounts')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('data');
    expect(response.body).toHaveProperty('total');
    expect(response.body).toHaveProperty('page');
    expect(response.body).toHaveProperty('limit');
    expect(response.body.page).toBe(1);
    expect(response.body.limit).toBe(20);
    expect(response.body.total).toBe(5); // 2 seeded + 3 extra
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.data.length).toBe(5);

    // Verify each item has required fields
    const firstItem = response.body.data[0];
    expect(firstItem).toHaveProperty('id');
    expect(firstItem).toHaveProperty('name');
    expect(firstItem).toHaveProperty('email');
    expect(firstItem).toHaveProperty('role');
    expect(firstItem).toHaveProperty('status');
    expect(firstItem).toHaveProperty('created_at');

    // BR-7: Must NOT contain password_hash
    expect(firstItem).not.toHaveProperty('password_hash');

    // BR-1: Default sort by created_at DESC (latest first)
    const dates = response.body.data.map((d: any) => new Date(d.created_at).getTime());
    for (let i = 0; i < dates.length - 1; i++) {
      expect(dates[i]).toBeGreaterThanOrEqual(dates[i + 1]);
    }
  });

  // TS-F005-002: 依關鍵字搜尋（大小寫不敏感）
  it('should search by keyword case-insensitively', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/accounts?search=ADMIN')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    // Should match: "Admin User" (admin@cdmp.test), "Admin Second" (admin2@cdmp.test)
    expect(response.body.data.length).toBeGreaterThanOrEqual(2);
    response.body.data.forEach((item: any) => {
      const nameOrEmail =
        item.name.toLowerCase().includes('admin') ||
        item.email.toLowerCase().includes('admin');
      expect(nameOrEmail).toBe(true);
    });
  });

  // TS-F005-003: 依角色篩選
  it('should filter by role', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/accounts?role=admin')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data.length).toBe(2); // ADMIN_ACTIVE + Admin Second
    response.body.data.forEach((item: any) => {
      expect(item.role).toBe('admin');
    });
  });

  // TS-F005-004: 組合搜尋與篩選
  it('should combine search and status filter', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/accounts?search=test&status=active')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    response.body.data.forEach((item: any) => {
      expect(item.status).toBe('active');
      const nameOrEmail =
        item.name.toLowerCase().includes('test') ||
        item.email.toLowerCase().includes('test');
      expect(nameOrEmail).toBe(true);
    });
  });

  // TS-F005-005: 非 Admin 存取帳號清單
  it('should return 403 for non-admin user', async () => {
    const userToken = await getUserToken(app);

    const response = await request(app.getHttpServer())
      .get('/api/v1/accounts')
      .set('Authorization', `Bearer ${userToken}`);

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('AUTH_FORBIDDEN');
  });

  // TS-F005-006: 搜尋無結果
  it('should return empty array when no results match', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/accounts?search=zzzznonexist')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
    expect(response.body.total).toBe(0);
  });

  // TS-F005-007: 分頁超出總頁數
  it('should return empty data for page beyond total pages', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/accounts?page=999&limit=20')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
    expect(response.body.page).toBe(999);
  });

  // Additional: Validate pagination with limit
  it('should respect limit parameter', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/accounts?page=1&limit=2')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data.length).toBe(2);
    expect(response.body.total).toBe(5);
    expect(response.body.limit).toBe(2);
  });
});
