/**
 * F075 v1.4：PooldataFieldWhitelist E2E（補入 available-columns 端點）
 *
 * SQLite in-memory + JWT + Supertest，8 cases：
 *
 * TS-F075-E2E-001 部長 → 503 OBPOOLDATA_NOT_READY（v1.4.2 D1 修補：SQLite 無 information_schema 視為 not_ready）
 * TS-F075-E2E-002 admin → 503 OBPOOLDATA_NOT_READY（同上）
 * TS-F075-E2E-003 處長（section_chief）→ 403 AUTH_FORBIDDEN
 * TS-F075-E2E-004 課長（section_chief 為 M06 對應「課長」業務角色，本 spec 沿用 section_chief 角色語意）→ 403
 * TS-F075-E2E-005 業務人員（business_role=null / 非主管）→ 403
 * TS-F075-E2E-006 未登入（無 Token）→ 401 AUTH_TOKEN_MISSING
 * TS-F075-E2E-007 Feature Flag 關閉 → 503 FEATURE_NOT_ENABLED
 * TS-F075-E2E-008 路由排序回歸：available-columns 不被 :columnName 動態路由捕捉（503 OBPOOLDATA_NOT_READY 非 404 POOLDATA_FIELD_NOT_FOUND）
 *
 * 環境註記（v1.4.2 D1 設計修補）：
 *   SQLite 環境無 information_schema，service 端 Step 1 查表存在性會 catch → throw
 *   ServiceUnavailableException OBPOOLDATA_NOT_READY；正面 case（director/admin 通過權限）皆預期
 *   503 OBPOOLDATA_NOT_READY。資料正確性由 unit spec 驗證（已 mock 兩階段 query）。
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
import { PooldataFieldModule } from '@/modules/pooldata-field/pooldata-field.module';
import { HttpExceptionFilter } from '@/common/filters/http-exception.filter';
import { User } from '@/database/entities/user.entity';
import { TokenBlocklist } from '@/database/entities/token-blocklist.entity';
import { PasswordResetToken } from '@/database/entities/password-reset-token.entity';
import { PooldataFieldWhitelist } from '@/database/entities/pooldata-field-whitelist.entity';
import { PooldataFieldOption } from '@/database/entities/pooldata-field-option.entity';
import { AssignmentAuditLog } from '@/database/entities/assignment-audit-log.entity';
import { HashUtil } from '@/common/hash/hash.util';

const JWT_SECRET = 'test-jwt-secret-for-f075-available-columns-e2e';

// Director（寫入 + available-columns 允許）
const DIRECTOR_USER = {
  id: 'd0000000-0000-0000-0000-000000000001',
  name: 'Director Hu',
  email: 'director-f075@cdmp.test',
  password: 'P@ssw0rd123',
  role: 'user' as const,
  status: 'active' as const,
  is_sales_manager: true,
  business_role: 'director' as const,
};

// Admin（寫入允許）
const ADMIN_USER = {
  id: 'a0000000-0000-0000-0000-000000000002',
  name: 'Admin Wang',
  email: 'admin-f075@cdmp.test',
  password: 'P@ssw0rd123',
  role: 'admin' as const,
  status: 'active' as const,
  is_sales_manager: false,
  business_role: null,
};

// Section Chief（處長 / 課長語意：本 spec M06 對 section_chief 為唯讀；available-columns 寫入流程不允許）
const SECTION_CHIEF_USER = {
  id: 's0000000-0000-0000-0000-000000000003',
  name: 'Section Chief Lee',
  email: 'sc-f075@cdmp.test',
  password: 'P@ssw0rd123',
  role: 'user' as const,
  status: 'active' as const,
  is_sales_manager: false,
  business_role: 'section_chief' as const,
};

// 課長（本專案 E07 三角色體系：director/section_chief；課長視為另一處長層級實體，皆走 section_chief。
//        對應 spec AC-11「課長 → 403」場景，以另一 section_chief 帳號模擬以區隔身分）
const MANAGER_USER = {
  id: 'm0000000-0000-0000-0000-000000000004',
  name: 'Manager Chen',
  email: 'mgr-f075@cdmp.test',
  password: 'P@ssw0rd123',
  role: 'user' as const,
  status: 'active' as const,
  is_sales_manager: false,
  business_role: 'section_chief' as const,
};

// 業務人員（business_role=null / 非主管）
const SALES_USER = {
  id: 'p0000000-0000-0000-0000-000000000005',
  name: 'Sales Lin',
  email: 'sales-f075@cdmp.test',
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
          PooldataFieldWhitelist,
          PooldataFieldOption,
          AssignmentAuditLog,
        ],
        synchronize: true,
      }),
      ThrottlerModule.forRoot([{ name: 'default', ttl: 60000, limit: 1000 }]),
      AuthModule,
      PooldataFieldModule,
    ],
    providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
  }).compile();

  const app = moduleFixture.createNestApplication();
  // 注意：本專案既有歷史雙重前綴 — Controller 路徑為 'api/v1/pooldata-fields'，
  //       AuthController 為 'auth'（相對）。setGlobalPrefix 後 auth 變為 /api/v1/auth，
  //       pooldata-fields 變為 /api/v1/api/v1/pooldata-fields（即生產 URL）。
  //       FE pooldata-fields API client（apps/web/src/api/pooldata-fields.ts L10-12）
  //       已記錄此既有行為，本 E2E 沿用以保持與生產一致。
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

  const ds = moduleFixture.get(DataSource);
  const userRepo = ds.getRepository(User);
  const passwordHash = await HashUtil.hash('P@ssw0rd123');
  for (const u of [
    DIRECTOR_USER,
    ADMIN_USER,
    SECTION_CHIEF_USER,
    MANAGER_USER,
    SALES_USER,
  ]) {
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

async function login(app: INestApplication, email: string): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password: 'P@ssw0rd123' });
  if (!res.body?.token) {
    throw new Error(`Login failed for ${email}: ${JSON.stringify(res.body)}`);
  }
  return res.body.token;
}

// 既有歷史雙重前綴：Controller path 'api/v1/pooldata-fields' + globalPrefix 'api/v1'
// → 實際 URL 為 /api/v1/api/v1/pooldata-fields/...（與生產一致，見 FE pooldata-fields.ts L10-12）
const ENDPOINT = '/api/v1/api/v1/pooldata-fields/available-columns';

describe('F075 v1.4: GET /api/v1/pooldata-fields/available-columns E2E', () => {
  let app: INestApplication;
  let directorToken: string;
  let adminToken: string;
  let sectionChiefToken: string;
  let managerToken: string;
  let salesToken: string;
  let ds: DataSource;

  beforeAll(async () => {
    // 確保 Feature Flag 在 beforeAll 階段為 true（個別 test 會臨時改為 false）
    process.env.ENABLE_E07_REFACTOR_PHASE3 = 'true';

    app = await createTestApp();
    ds = app.get(DataSource);
    directorToken = await login(app, DIRECTOR_USER.email);
    adminToken = await login(app, ADMIN_USER.email);
    sectionChiefToken = await login(app, SECTION_CHIEF_USER.email);
    managerToken = await login(app, MANAGER_USER.email);
    salesToken = await login(app, SALES_USER.email);
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(async () => {
    process.env.ENABLE_E07_REFACTOR_PHASE3 = 'true';
    // 各 test 隔離：清空白名單表（避免 :columnName 路徑誤判殘留紀錄）
    await ds.getRepository(PooldataFieldWhitelist).clear();
  });

  // ===== A. 權限矩陣 =====

  it("TS-F075-E2E-001：部長（business_role='director'）→ 503 OBPOOLDATA_NOT_READY（v1.4.2 D1：SQLite 無 information_schema）", async () => {
    const res = await request(app.getHttpServer())
      .get(ENDPOINT)
      .set('Authorization', `Bearer ${directorToken}`);
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('OBPOOLDATA_NOT_READY');
  });

  it('TS-F075-E2E-002：Admin → 503 OBPOOLDATA_NOT_READY（v1.4.2 D1）', async () => {
    const res = await request(app.getHttpServer())
      .get(ENDPOINT)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('OBPOOLDATA_NOT_READY');
  });

  // ===== 既有 Guard 錯誤碼說明 =====
  //
  // 既有 E07 Guard 體系錯誤碼語意（沿用 production / 與其他 E07 端點一致）：
  //   - DirectorOrSectionChiefGuard（class 級先觸發）→ business_role 未設 → 403 E07_ROLE_NOT_ASSIGNED
  //   - DirectorGuard（method 級 @RequireDirector）→ business_role='section_chief' → 403 E07_REQUIRES_DIRECTOR
  //
  // F075 spec §5.5 錯誤碼表為「概念性 AUTH_FORBIDDEN」（HTTP 403 語意），實作端沿用 production
  // 更具體之錯誤碼以保持與既有 POST/PATCH/DELETE 一致；implementation log 已記錄此 spec 文字
  // 與實作之 drift（非阻擋；HTTP 403 + 拒絕語意完全相符）。

  it("TS-F075-E2E-003：處長（business_role='section_chief'）→ 403（拒絕語意，沿用 E07_REQUIRES_DIRECTOR）", async () => {
    const res = await request(app.getHttpServer())
      .get(ENDPOINT)
      .set('Authorization', `Bearer ${sectionChiefToken}`);
    expect(res.status).toBe(403);
    // 處長已有 business_role → 通過 DirectorOrSectionChiefGuard，被 DirectorGuard 攔截
    expect(res.body.error).toBe('E07_REQUIRES_DIRECTOR');
  });

  it('TS-F075-E2E-004：課長身分（section_chief 角色另一帳號）→ 403', async () => {
    const res = await request(app.getHttpServer())
      .get(ENDPOINT)
      .set('Authorization', `Bearer ${managerToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('E07_REQUIRES_DIRECTOR');
  });

  it('TS-F075-E2E-005：業務人員（business_role=null）→ 403', async () => {
    const res = await request(app.getHttpServer())
      .get(ENDPOINT)
      .set('Authorization', `Bearer ${salesToken}`);
    expect(res.status).toBe(403);
    // 業務人員無 business_role → class 級 DirectorOrSectionChiefGuard 攔截 → E07_ROLE_NOT_ASSIGNED
    expect(res.body.error).toBe('E07_ROLE_NOT_ASSIGNED');
  });

  it('TS-F075-E2E-006：未登入（無 Authorization header）→ 401 AUTH_TOKEN_MISSING', async () => {
    const res = await request(app.getHttpServer()).get(ENDPOINT);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('AUTH_TOKEN_MISSING');
  });

  // ===== B. Feature Flag =====

  it('TS-F075-E2E-007：Feature Flag 關閉 → 503 FEATURE_NOT_ENABLED', async () => {
    process.env.ENABLE_E07_REFACTOR_PHASE3 = 'false';
    const res = await request(app.getHttpServer())
      .get(ENDPOINT)
      .set('Authorization', `Bearer ${directorToken}`);
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('FEATURE_NOT_ENABLED');
  });

  // ===== C. 路由排序回歸測試 =====

  it("TS-F075-E2E-008：路由排序回歸 — available-columns 不被 :columnName 動態路由捕捉（503 OBPOOLDATA_NOT_READY，非 404 POOLDATA_FIELD_NOT_FOUND）", async () => {
    // v1.4.2 D1：SQLite 無 information_schema → 預期 503 OBPOOLDATA_NOT_READY
    // 失敗判定：若 controller 未將 @Get('available-columns') 宣告於 @Get(':columnName/...') 之前，
    // request 會被誤導至 active-options-count 之 :columnName 路由 → 404 POOLDATA_FIELD_NOT_FOUND
    const res = await request(app.getHttpServer())
      .get(ENDPOINT)
      .set('Authorization', `Bearer ${directorToken}`);
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('OBPOOLDATA_NOT_READY');
    // 確保不是 404（即路由排序正確）
    expect(res.body.error).not.toBe('POOLDATA_FIELD_NOT_FOUND');
  });
});
