/**
 * F068：AssignmentCodeModule E2E
 *
 * 完整 HTTP flow + JWT + better-sqlite3 in-memory，9 cases：
 *
 * 1. 未登入 GET → 401 AUTH_TOKEN_MISSING
 * 2. role=user 非 SM → 403 AUTH_FORBIDDEN
 * 3. SM 登入 → GET listCodes 200
 * 4. POST 新增成功 → 201 + 寫入 audit log（CREATE）
 * 5. POST 重複 tblCd → 422 CODE_IN_USE 訊息含 tblCd / tblId
 * 6. POST 非白名單 tblId='01' → 422 CODE_TYPE_INVALID
 * 7. PUT 更新 → 200 + audit log（UPDATE，before/after snapshot）
 * 8. PUT disable → 200 + enddt=today + audit log（DISABLE）
 * 9. PUT disable 找不到 → 404 CODE_NOT_FOUND
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AuthModule } from '@/modules/auth/auth.module';
import { AssignmentCodeModule } from '@/modules/assignment-code/assignment-code.module';
import { HttpExceptionFilter } from '@/common/filters/http-exception.filter';
import { User } from '@/database/entities/user.entity';
import { TokenBlocklist } from '@/database/entities/token-blocklist.entity';
import { PasswordResetToken } from '@/database/entities/password-reset-token.entity';
import { ObCodeDf } from '@/database/entities/ob-code-df.entity';
import { AssignmentAuditLog } from '@/database/entities/assignment-audit-log.entity';
import { HashUtil } from '@/common/hash/hash.util';

const JWT_SECRET = 'test-jwt-secret-for-assignment-code-e2e';

// B2 替換（AD-E07 v3.0 / 2026-05-16）：SM fixture 升級為 director（M06 寫入限部長）
const SM_USER = {
  id: 'e5f6a7b8-c9d0-1234-efab-345678901234',
  name: 'Director User',
  email: 'sm-e2e@cdmp.test',
  password: 'P@ssw0rd123',
  role: 'user' as const,
  status: 'active' as const,
  is_sales_manager: true, // legacy 欄位，保留以避免遷移破壞
  business_role: 'director' as const,
};
const PLAIN_USER = {
  id: 'c3d4e5f6-a7b8-9012-cdef-aaaaaaaaaaaa',
  name: 'Plain User',
  email: 'plain-e2e@cdmp.test',
  password: 'P@ssw0rd123',
  role: 'user' as const,
  status: 'active' as const,
  is_sales_manager: false,
  business_role: null,
};

async function createTestApp(): Promise<INestApplication> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        load: [() => ({ JWT_SECRET })],
      }),
      TypeOrmModule.forRoot({
        type: 'better-sqlite3',
        database: ':memory:',
        entities: [
          User,
          TokenBlocklist,
          PasswordResetToken,
          ObCodeDf,
          AssignmentAuditLog,
        ],
        synchronize: true,
      }),
      ThrottlerModule.forRoot([{ name: 'default', ttl: 60000, limit: 1000 }]),
      AuthModule,
      AssignmentCodeModule,
    ],
    providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
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

  // Seed
  const ds = moduleFixture.get(DataSource);
  const userRepo = ds.getRepository(User);
  const passwordHash = await HashUtil.hash('P@ssw0rd123');
  for (const u of [SM_USER, PLAIN_USER]) {
    await userRepo.save(
      userRepo.create({
        id: u.id,
        name: u.name,
        email: u.email,
        password_hash: passwordHash,
        role: u.role,
        status: u.status,
        is_sales_manager: u.is_sales_manager,
        business_role: u.business_role,
      }),
    );
  }

  return app;
}

async function login(
  app: INestApplication,
  email: string,
): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password: 'P@ssw0rd123' });
  if (!res.body?.token) {
    throw new Error(`Login failed for ${email}: ${JSON.stringify(res.body)}`);
  }
  return res.body.token;
}

describe('F068: AssignmentCode E2E (/api/v1/assignment/codes)', () => {
  let app: INestApplication;
  let smToken: string;
  let plainToken: string;
  let ds: DataSource;

  beforeAll(async () => {
    app = await createTestApp();
    ds = app.get(DataSource);
    smToken = await login(app, SM_USER.email);
    plainToken = await login(app, PLAIN_USER.email);
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(async () => {
    // 各 test isolated：清空 code 表 + audit log
    await ds.getRepository(AssignmentAuditLog).clear();
    await ds.getRepository(ObCodeDf).clear();
  });

  it('1) 未登入 GET → 401 AUTH_TOKEN_MISSING', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/assignment/codes?tblId=PROD_KIND');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('AUTH_TOKEN_MISSING');
  });

  it('2) role=user 業務角色未指派 → 403 E07_ROLE_NOT_ASSIGNED', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/assignment/codes?tblId=PROD_KIND')
      .set('Authorization', `Bearer ${plainToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('E07_ROLE_NOT_ASSIGNED');
  });

  it('3) SM 登入 GET listCodes → 200', async () => {
    // 先插一筆 PROD_KIND active
    await ds.getRepository(ObCodeDf).save(
      ds.getRepository(ObCodeDf).create({
        system_id: 'OB',
        tbl_id: 'PROD_KIND',
        tbl_cd: '01',
        tbl_desc1: '汽車',
        stadt: '20200101',
        enddt: '99991231',
      }),
    );
    const res = await request(app.getHttpServer())
      .get('/api/v1/assignment/codes?tblId=PROD_KIND')
      .set('Authorization', `Bearer ${smToken}`);
    expect(res.status).toBe(200);
    expect(res.body.tblId).toBe('PROD_KIND');
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({ tblCd: '01', tblDesc1: '汽車', active: true });
  });

  it('4) POST 新增 → 201 + 寫入 audit log（CREATE）', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/assignment/codes')
      .set('Authorization', `Bearer ${smToken}`)
      .send({ tblId: 'PROD_KIND', tblCd: '05', tblDesc1: '商用車' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ tblCd: '05', tblDesc1: '商用車', active: true });

    // Audit log assertion
    const logs = await ds.getRepository(AssignmentAuditLog).find();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      action: 'CREATE',
      entity_type: 'ob_code_df',
      entity_id: 'PROD_KIND:05',
      actor_id: SM_USER.id,
      actor_name: SM_USER.name,
    });
    expect(logs[0].before_value).toBeNull();
    expect(logs[0].after_value).toMatchObject({ tbl_desc1: '商用車' });
  });

  it('5) POST 重複 tblCd → 422 CODE_IN_USE，訊息含 tblCd / tblId', async () => {
    // 先建立一筆
    await ds.getRepository(ObCodeDf).save(
      ds.getRepository(ObCodeDf).create({
        system_id: 'OB',
        tbl_id: 'PROD_KIND',
        tbl_cd: '01',
        tbl_desc1: '已存在',
        stadt: '20200101',
        enddt: '99991231',
      }),
    );
    const res = await request(app.getHttpServer())
      .post('/api/v1/assignment/codes')
      .set('Authorization', `Bearer ${smToken}`)
      .send({ tblId: 'PROD_KIND', tblCd: '01', tblDesc1: '重複' });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('CODE_IN_USE');
    expect(res.body.message).toContain('01');
    expect(res.body.message).toContain('PROD_KIND');
  });

  it("6) POST 非白名單 tblId='01' → 422 CODE_TYPE_INVALID", async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/assignment/codes')
      .set('Authorization', `Bearer ${smToken}`)
      .send({ tblId: '01', tblCd: '99', tblDesc1: 'X' });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('CODE_TYPE_INVALID');
  });

  it('7) PUT 更新 → 200 + audit log（UPDATE，before/after snapshot）', async () => {
    await ds.getRepository(ObCodeDf).save(
      ds.getRepository(ObCodeDf).create({
        system_id: 'OB',
        tbl_id: 'PROD_KIND',
        tbl_cd: '01',
        tbl_desc1: '舊名',
        stadt: '20200101',
        enddt: '99991231',
      }),
    );

    const res = await request(app.getHttpServer())
      .put('/api/v1/assignment/codes/PROD_KIND/01')
      .set('Authorization', `Bearer ${smToken}`)
      .send({ tblDesc1: '新名' });
    expect(res.status).toBe(200);
    expect(res.body.tblDesc1).toBe('新名');

    const logs = await ds.getRepository(AssignmentAuditLog).find();
    expect(logs).toHaveLength(1);
    expect(logs[0].action).toBe('UPDATE');
    expect(logs[0].before_value).toMatchObject({ tbl_desc1: '舊名' });
    expect(logs[0].after_value).toMatchObject({ tbl_desc1: '新名' });
  });

  it('8) PUT disable → 200 + enddt=today + audit log（DISABLE）', async () => {
    await ds.getRepository(ObCodeDf).save(
      ds.getRepository(ObCodeDf).create({
        system_id: 'OB',
        tbl_id: 'PROD_KIND',
        tbl_cd: '01',
        tbl_desc1: 'X',
        stadt: '20200101',
        enddt: '99991231',
      }),
    );

    const res = await request(app.getHttpServer())
      .put('/api/v1/assignment/codes/PROD_KIND/01/disable')
      .set('Authorization', `Bearer ${smToken}`);
    expect(res.status).toBe(200);
    expect(res.body.enddt).toMatch(/^\d{8}$/);
    expect(res.body.enddt).not.toBe('99991231');

    const logs = await ds.getRepository(AssignmentAuditLog).find();
    expect(logs).toHaveLength(1);
    expect(logs[0].action).toBe('DISABLE');
    expect(logs[0].before_value).toMatchObject({ enddt: '99991231' });
    expect(logs[0].after_value).toMatchObject({ enddt: res.body.enddt });
  });

  it('9) PUT disable 找不到 → 404 CODE_NOT_FOUND', async () => {
    const res = await request(app.getHttpServer())
      .put('/api/v1/assignment/codes/PROD_KIND/99/disable')
      .set('Authorization', `Bearer ${smToken}`);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('CODE_NOT_FOUND');
  });
});
