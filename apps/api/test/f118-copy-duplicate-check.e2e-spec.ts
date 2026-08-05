/**
 * F118 — 從上月複製名單顯示「已複製過」提示
 * 後端 E2E（真實 HTTP + Guard + in-memory SQLite DB，非 mock repo）
 *
 * 對應：
 *   - docs/specs/features/F118-copy-from-prev-month-duplicate-indicator.md（AC-1/AC-5/AC-9）
 *   - docs/specs/implementation-log/AD-E07-48-f117-f118-ux-refinements.md §5
 *   - docs/test-specs/features/F118-test.md（TS-F118-E2E-001~003）
 *
 * 沿用既有 f117-dept-ratio-director-filter.e2e-spec.ts 之 app bootstrap 慣例：
 * in-memory better-sqlite3、真實 AuthModule + AssignmentListModule、
 * 真實 POST /api/v1/auth/login 取得 JWT。所有帳號皆為測試自建 fixture
 * （沿用既有 apps/api/test/fixtures/users.fixture.ts builder），不依賴外部 MSSQL 或 dev seed.ts。
 */

import 'reflect-metadata';
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
import { AssignmentListModule } from '@/modules/assignment-list/assignment-list.module';
import { HttpExceptionFilter } from '@/common/filters/http-exception.filter';
import { User } from '@/database/entities/user.entity';
import { TokenBlocklist } from '@/database/entities/token-blocklist.entity';
import { PasswordResetToken } from '@/database/entities/password-reset-token.entity';
import { ObListDefinition } from '@/database/entities/ob-list-definition.entity';
import { ObDeptPct } from '@/database/entities/ob-dept-pct.entity';
import { ObEmplSet } from '@/database/entities/ob-empl-set.entity';
import { ObEmphire } from '@/database/entities/ob-emphire.entity';
import { ObCardType } from '@/database/entities/ob-card-type.entity';
import { ObPoolData } from '@/database/entities/ob-pool-data.entity';
import { ObCalendar } from '@/database/entities/ob-calendar.entity';
import { AssignmentAuditLog } from '@/database/entities/assignment-audit-log.entity';
import { AssignmentApproval } from '@/database/entities/assignment-approval.entity';
import { AssignmentRun } from '@/database/entities/assignment-run.entity';
import { PooldataFieldOption } from '@/database/entities/pooldata-field-option.entity';
import { PooldataFieldWhitelist } from '@/database/entities/pooldata-field-whitelist.entity';
import { HashUtil } from '@/common/hash/hash.util';
import { buildAdmin, buildDirector, buildSectionChief } from './fixtures/users.fixture';

const JWT_SECRET = 'test-jwt-secret-for-f118-copy-duplicate-check-e2e';
const OVERRIDE_YM = '202605';
const PREV_YM = '202604';
const PASSWORD = 'P@ssw0rd123';

const DIRECTOR_USER = buildDirector({
  id: 'f1180000-0000-0000-0000-000000000001',
  email: 'f118-director@cdmp.test',
});
const ADMIN_USER = buildAdmin({
  id: 'f1180000-0000-0000-0000-000000000002',
  email: 'f118-admin@cdmp.test',
});
const SECTION_CHIEF_USER = buildSectionChief({
  id: 'f1180000-0000-0000-0000-000000000003',
  email: 'f118-sectionchief@cdmp.test',
});

async function createTestApp(): Promise<INestApplication> {
  process.env.DB_TYPE = 'sqlite';
  process.env.ENABLE_E07_REFACTOR_PHASE3 = 'true';
  process.env.OVERRIDE_CURRENT_WORK_YM = OVERRIDE_YM;

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true, load: [() => ({ JWT_SECRET })] }),
      TypeOrmModule.forRoot({
        type: 'better-sqlite3',
        database: ':memory:',
        entities: [
          User,
          TokenBlocklist,
          PasswordResetToken,
          ObListDefinition,
          ObDeptPct,
          ObEmplSet,
          ObEmphire,
          ObCardType,
          ObPoolData,
          ObCalendar,
          AssignmentAuditLog,
          AssignmentApproval,
          AssignmentRun,
          PooldataFieldOption,
          PooldataFieldWhitelist,
        ],
        synchronize: true,
      }),
      ThrottlerModule.forRoot([{ name: 'default', ttl: 60000, limit: 1000 }]),
      AuthModule,
      AssignmentListModule,
    ],
    providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
  }).compile();

  const app = moduleFixture.createNestApplication();
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  await app.init();

  const ds = moduleFixture.get(DataSource);
  const userRepo = ds.getRepository(User);
  const hash = await HashUtil.hash(PASSWORD);
  for (const u of [DIRECTOR_USER, ADMIN_USER, SECTION_CHIEF_USER]) {
    await userRepo.save(userRepo.create({ ...u, password_hash: hash } as any));
  }

  return app;
}

async function login(app: INestApplication, email: string): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password: PASSWORD });
  if (!res.body?.token) {
    throw new Error(`F118 e2e login 失敗（email=${email}）：${JSON.stringify(res.body)}`);
  }
  return res.body.token;
}

async function seedList(
  ds: DataSource,
  opts: {
    listNo: string;
    workYm: string;
    status?: string;
    conditionPayload: any;
    cardType?: string | null;
  },
): Promise<void> {
  const repo = ds.getRepository(ObListDefinition);
  const now = new Date();
  await repo.save(
    repo.create({
      list_no: opts.listNo,
      list_nm: 'F118 e2e 測試名單',
      list_type: '01',
      prod_kind: '',
      caseyear: null,
      spec_tp: null,
      case_status: '',
      settle_src: null,
      list_period_start: '1',
      list_period_end: '6',
      list_interval: '1',
      project_workym: opts.workYm,
      casenumber: null,
      name: null,
      caseyearnm: null,
      card_type: opts.cardType ?? null,
      cr_enabled: false,
      status: opts.status ?? 'active',
      stage: 'ready',
      prod_best: null,
      condition_payload: opts.conditionPayload,
      assigned_date: null,
      total_amount: null,
      reserved_amount: null,
      is_assigned: null,
      created_by_prog: 'TEST',
      created_by: DIRECTOR_USER.id,
      created_at: now,
      updated_by_prog: 'TEST',
      updated_by: DIRECTOR_USER.id,
      updated_at: now,
    } as any),
  );
}

describe('F118 e2e：從上月複製「已複製過」提示（真實 HTTP + Guard + SQLite DB）', () => {
  let app: INestApplication;
  let ds: DataSource;

  beforeAll(async () => {
    app = await createTestApp();
    ds = app.get(DataSource);

    await seedList(ds, {
      listNo: `OB${PREV_YM}001`,
      workYm: PREV_YM,
      conditionPayload: { conditions: [{ columnName: 'prod_kind', fieldType: 'categorical', values: ['01'] }], logic: 'AND' },
    });
    await seedList(ds, {
      listNo: `OB${PREV_YM}002`,
      workYm: PREV_YM,
      conditionPayload: { conditions: [{ columnName: 'prod_kind', fieldType: 'categorical', values: ['99'] }], logic: 'AND' },
    });
    // currentYm 之等價名單（對應候選 001）
    await seedList(ds, {
      listNo: `OB${OVERRIDE_YM}003`,
      workYm: OVERRIDE_YM,
      conditionPayload: { conditions: [{ columnName: 'prod_kind', fieldType: 'categorical', values: ['01'] }], logic: 'AND' },
    });
  });

  afterAll(async () => {
    await app?.close();
    delete process.env.OVERRIDE_CURRENT_WORK_YM;
    delete process.env.ENABLE_E07_REFACTOR_PHASE3;
  });

  it('TS-F118-E2E-001：director 登入 → GET round-trip，回應形狀符合契約', async () => {
    const token = await login(app, DIRECTOR_USER.email);
    const res = await request(app.getHttpServer())
      .get(`/api/v1/assignment/lists/copy-duplicate-check?prevYm=${PREV_YM}&currentYm=${OVERRIDE_YM}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.prevYm).toBe(PREV_YM);
    expect(res.body.currentYm).toBe(OVERRIDE_YM);
    expect(Array.isArray(res.body.items)).toBe(true);
    const item001 = res.body.items.find((i: any) => i.listNo === `OB${PREV_YM}001`);
    expect(item001).toBeDefined();
    expect(item001.alreadyCopied).toBe(true);
    expect(item001.copiedToListNo).toBe(`OB${OVERRIDE_YM}003`);
    const item002 = res.body.items.find((i: any) => i.listNo === `OB${PREV_YM}002`);
    expect(item002.alreadyCopied).toBe(false);
    expect(item002.copiedToListNo).toBeNull();
  });

  it('TS-F118-E2E-002：section_chief 登入 → 200（唯讀角色平權，真實 Guard round-trip）', async () => {
    const token = await login(app, SECTION_CHIEF_USER.email);
    const res = await request(app.getHttpServer())
      .get(`/api/v1/assignment/lists/copy-duplicate-check?prevYm=${PREV_YM}&currentYm=${OVERRIDE_YM}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('TS-F118-E2E-003：admin 等價於 director（F079 BR-7 母流程語意，F118 未變更）', async () => {
    const token = await login(app, ADMIN_USER.email);
    const res = await request(app.getHttpServer())
      .get(`/api/v1/assignment/lists/copy-duplicate-check?prevYm=${PREV_YM}&currentYm=${OVERRIDE_YM}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const item001 = res.body.items.find((i: any) => i.listNo === `OB${PREV_YM}001`);
    expect(item001.alreadyCopied).toBe(true);
  });

  it('未登入 → 401', async () => {
    const res = await request(app.getHttpServer()).get(
      `/api/v1/assignment/lists/copy-duplicate-check?prevYm=${PREV_YM}&currentYm=${OVERRIDE_YM}`,
    );
    expect(res.status).toBe(401);
  });
});
