/**
 * F117 v1.1 — 部門比例設定頁僅提供「有在職處長」之部門設定
 * 後端 Integration（真實 HTTP + Guard + in-memory SQLite DB，非 mock repo）
 *
 * 對應：
 *   - docs/specs/features/F117-dept-ratio-director-required-filter.md（AC-1/AC-3/AC-6/AC-8/AC-9/AC-10）
 *   - docs/specs/implementation-log/AD-E07-48-f117-f118-ux-refinements.md §4
 *   - docs/test-specs/features/F117-test.md（TS-F117-INT-001~006）
 *
 * 沿用既有 `f081-f085-f089-rollback.e2e-spec.ts` 之 app bootstrap 慣例：
 * in-memory better-sqlite3、真實 AuthModule + AssignmentListModule + AssignmentStageModule、
 * 真實 POST /api/v1/auth/login 取得 JWT。所有帳號 / 部門 / 處長皆為測試自建 fixture
 * （沿用既有 `apps/api/test/fixtures/{users,ob-emphire}.fixture.ts` builder），
 * 不依賴外部 MSSQL 或 dev seed.ts（見 data-model.md「CI / test fixture 策略」）。
 *
 * Fixture 規範（對照 F117-test.md）：
 *   XTA0 — 王處長（在職，哨兵 resign_date）+ 既有 ration 60 → 有處長部門（可編輯）
 *   XTB0 — 無處長 + 既有 ration 40 → 孤兒部門（鎖定顯示）
 *   XTC0 — 無處長 + 既有 ration 0（無關部門，隱藏）
 *   XTD0 — 處長已離職（resign_date 為過去日期，非哨兵）+ 既有 ration 0（無關部門，隱藏）
 *   XTE0 — 2 位在職處長（不同 hire_date）+ 既有 ration 20 → 有處長部門，取最早到職者
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach } from 'vitest';
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
import { AssignmentStageModule } from '@/modules/assignment-stage/assignment-stage.module';
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
import { buildEmphire, ACTIVE_RESIGN_SENTINEL } from './fixtures/ob-emphire.fixture';

const JWT_SECRET = 'test-jwt-secret-for-f117-dept-ratio-director-filter-e2e';
const OVERRIDE_YM = '202605';
const LIST_NO = 'OB202605117';
const PASSWORD = 'P@ssw0rd123';

const DIRECTOR_USER = buildDirector({
  id: 'f1170000-0000-0000-0000-000000000001',
  email: 'f117-director@cdmp.test',
});
const ADMIN_USER = buildAdmin({
  id: 'f1170000-0000-0000-0000-000000000002',
  email: 'f117-admin@cdmp.test',
});
const SECTION_CHIEF_USER = buildSectionChief({
  id: 'f1170000-0000-0000-0000-000000000003',
  email: 'f117-sectionchief@cdmp.test',
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
      AssignmentStageModule,
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
    throw new Error(`F117 e2e login 失敗（email=${email}）：${JSON.stringify(res.body)}`);
  }
  return res.body.token;
}

async function seedList(ds: DataSource): Promise<void> {
  const repo = ds.getRepository(ObListDefinition);
  const now = new Date();
  await repo.save(
    repo.create({
      list_no: LIST_NO,
      list_nm: 'F117 測試名單',
      list_type: '01',
      prod_kind: '',
      caseyear: null,
      spec_tp: null,
      case_status: '',
      settle_src: null,
      list_period_start: '1',
      list_period_end: '6',
      list_interval: '1',
      project_workym: OVERRIDE_YM,
      casenumber: null,
      name: null,
      caseyearnm: null,
      card_type: null,
      cr_enabled: false,
      status: 'active',
      stage: 'dept_ratio',
      prod_best: null,
      condition_payload: {
        conditions: [{ columnName: 'prod_kind', fieldType: 'categorical', values: ['01'] }],
        logic: 'AND',
      } as any,
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

async function seedDeptPct(
  ds: DataSource,
  rows: Array<{ dept: string; name: string; ration: string }>,
): Promise<void> {
  const repo = ds.getRepository(ObDeptPct);
  const now = new Date();
  for (const r of rows) {
    await repo.save(
      repo.create({
        project_workym: OVERRIDE_YM,
        list_no: LIST_NO,
        obdeptid: r.dept,
        obdeptnm: r.name,
        ration: r.ration,
        created_by_prog: 'TEST',
        created_by: DIRECTOR_USER.id,
        created_at: now,
        updated_by_prog: 'TEST',
        updated_by: DIRECTOR_USER.id,
        updated_at: now,
      } as any),
    );
  }
}

/** Fixture 規範表（F117-test.md）：5 部門，涵蓋三分類 + 在職判定邊界 + 多處長取捨 */
async function seedEmphireFixture(ds: DataSource): Promise<void> {
  const repo = ds.getRepository(ObEmphire);
  const rows: ObEmphire[] = [
    // XTA0：王處長，在職（哨兵 resign_date）→ 有處長
    buildEmphire({
      emp_id: 'F117E001',
      emp_nm: '王處長',
      dept_code: 'XTA0',
      dept_name: '業務一部',
      jfun_nm: '處長',
      hire_date: new Date('2018-01-01'),
    }),
    // XTB0：無任何員工資料（無處長）— 孤兒（既有 ration 40）
    // XTC0：無任何員工資料（無處長）— 無關（既有 ration 0）
    // XTD0：陳處長，已離職（resign_date 為過去日期，非哨兵）→ 無處長
    buildEmphire({
      emp_id: 'F117E002',
      emp_nm: '陳處長（已離職）',
      dept_code: 'XTD0',
      dept_name: '業務四部',
      jfun_nm: '處長',
      hire_date: new Date('2015-01-01'),
      resign_date: new Date('2025-01-01'), // 過去日期，非哨兵 → 離職
    }),
    // XTE0：2 位在職處長，取最早到職者（2018 早於 2020）
    buildEmphire({
      emp_id: 'F117E003',
      emp_nm: '李處長（較早到職）',
      dept_code: 'XTE0',
      dept_name: '業務五部',
      jfun_nm: '處長',
      hire_date: new Date('2018-06-01'),
    }),
    buildEmphire({
      emp_id: 'F117E004',
      emp_nm: '林處長（較晚到職）',
      dept_code: 'XTE0',
      dept_name: '業務五部',
      jfun_nm: '處長',
      hire_date: new Date('2020-06-01'),
    }),
  ];
  await repo.save(rows.map((r) => repo.create(r)));
  void ACTIVE_RESIGN_SENTINEL; // 由 buildEmphire 預設值提供，僅供本檔文件引用
}

describe('F117 e2e：部門比例設定「有在職處長」過濾（真實 HTTP + Guard + SQLite DB）', () => {
  let app: INestApplication;
  let ds: DataSource;
  let directorToken: string;
  let adminToken: string;
  let sectionChiefToken: string;

  beforeEach(async () => {
    app = await createTestApp();
    ds = app.get(DataSource);
    await seedList(ds);
    await seedEmphireFixture(ds);
    await seedDeptPct(ds, [
      { dept: 'XTA0', name: '業務一部', ration: '60' },
      { dept: 'XTB0', name: '業務二部（孤兒）', ration: '40' },
      { dept: 'XTC0', name: '業務三部（無關）', ration: '0' },
      { dept: 'XTD0', name: '業務四部（離職處長）', ration: '0' },
      { dept: 'XTE0', name: '業務五部', ration: '0' }, // 加總須另行調整，見各測試獨立覆寫
    ]);
    directorToken = await login(app, DIRECTOR_USER.email);
    adminToken = await login(app, ADMIN_USER.email);
    sectionChiefToken = await login(app, SECTION_CHIEF_USER.email);
  });

  // TS-F117-INT-001
  it('GET ?requireDirector=true → 三分類正確回應（director 角色）', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/assignment/ratios/dept/${LIST_NO}?requireDirector=true`)
      .set('Authorization', `Bearer ${directorToken}`);

    expect(res.status).toBe(200);
    const ids = (res.body.deptRatios as any[]).map((d) => d.obdeptId).sort();
    // XTB0（孤兒，鎖定顯示）+ XTA0/XTE0（有處長，可編輯）應出現；XTC0/XTD0（無關）應被隱藏
    expect(ids).toEqual(['XTA0', 'XTB0', 'XTE0']);
    expect(res.body.hiddenNoDirectorCount).toBe(2); // XTC0 + XTD0

    const a = (res.body.deptRatios as any[]).find((d) => d.obdeptId === 'XTA0');
    expect(a.hasActiveDirector).toBe(true);
    expect(a.isRatioEditable).toBe(true);

    const b = (res.body.deptRatios as any[]).find((d) => d.obdeptId === 'XTB0');
    expect(b.hasActiveDirector).toBe(false);
    expect(b.isRatioEditable).toBe(false);

    const e = (res.body.deptRatios as any[]).find((d) => d.obdeptId === 'XTE0');
    expect(e.hasActiveDirector).toBe(true);
    expect(e.directorName).toBe('李處長（較早到職）'); // 多處長取最早到職者
  });

  // TS-F117-INT-002（★核心，需真實 DB round-trip 驗證，非 mock）
  it('PUT 孤兒保留全流程 — 未送孤兒列 payload → DB 持久化仍含孤兒列，HTTP 200', async () => {
    // 先將 XTA0/XTE0 調整為合計 100（60+40），確保「最終持久化集合」加總（含孤兒 XTB0 40）恰為 100
    await ds.getRepository(ObDeptPct).delete({ list_no: LIST_NO } as any);
    await seedDeptPct(ds, [
      { dept: 'XTA0', name: '業務一部', ration: '60' },
      { dept: 'XTB0', name: '業務二部（孤兒）', ration: '40' },
    ]);

    const res = await request(app.getHttpServer())
      .put(`/api/v1/assignment/ratios/dept/${LIST_NO}`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ deptRatios: [{ obdeptId: 'XTA0', obdeptNm: '業務一部', ration: 60 }] });

    expect(res.status).toBe(200);

    const persisted = await ds
      .getRepository(ObDeptPct)
      .find({ where: { list_no: LIST_NO, project_workym: OVERRIDE_YM } as any });
    const persistedIds = persisted.map((r: any) => r.obdeptid);
    expect(persistedIds).toContain('XTB0'); // 孤兒列未被 DELETE 語意抹除
    const b = persisted.find((r: any) => r.obdeptid === 'XTB0')!;
    expect(Number(b.ration)).toBeCloseTo(40, 2);
  });

  // TS-F117-INT-003
  it('PUT 無處長新配置 → 422 RATIO_DEPT_DIRECTOR_REQUIRED', async () => {
    await ds.getRepository(ObDeptPct).delete({ list_no: LIST_NO } as any);
    await seedDeptPct(ds, [{ dept: 'XTA0', name: '業務一部', ration: '90' }]);

    const res = await request(app.getHttpServer())
      .put(`/api/v1/assignment/ratios/dept/${LIST_NO}`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({
        deptRatios: [
          { obdeptId: 'XTA0', obdeptNm: '業務一部', ration: 90 },
          { obdeptId: 'XTC0', obdeptNm: '業務三部（無關）', ration: 10 }, // 無處長、無既有 ration
        ],
      });

    expect(res.status).toBe(422);
    // 扁平錯誤信封慣例（`{ error: 'CODE', message }`），沿用 f081-f085-f089-rollback.e2e-spec.ts
    // 及全 repo 既有 22 個 e2e spec 檔（262 處）之 `res.body.error` 慣例；F117 §1 明言不變更
    // F079 既有錯誤語意，故不得為本錯誤碼另立巢狀 `{ error: { code } }` 信封。
    expect(res.body.error).toBe('RATIO_DEPT_DIRECTOR_REQUIRED');

    // DB 未變更（transaction 未提交）
    const persisted = await ds
      .getRepository(ObDeptPct)
      .find({ where: { list_no: LIST_NO, project_workym: OVERRIDE_YM } as any });
    expect(persisted.some((r: any) => r.obdeptid === 'XTC0')).toBe(false);
  });

  // TS-F117-INT-004（AC-9 regression 錨點）
  it('section_chief 角色 → GET/PUT 403 AUTH_FORBIDDEN（沿用既有 F079 限制，非新行為）', async () => {
    const getRes = await request(app.getHttpServer())
      .get(`/api/v1/assignment/ratios/dept/${LIST_NO}?requireDirector=true`)
      .set('Authorization', `Bearer ${sectionChiefToken}`);
    expect(getRes.status).toBe(403);

    const putRes = await request(app.getHttpServer())
      .put(`/api/v1/assignment/ratios/dept/${LIST_NO}`)
      .set('Authorization', `Bearer ${sectionChiefToken}`)
      .send({ deptRatios: [{ obdeptId: 'XTA0', obdeptNm: '業務一部', ration: 100 }] });
    expect(putRes.status).toBe(403);
  });

  // TS-F117-INT-005
  it('admin 角色等價於 director（F079 BR-7：admin OR business_role=director）', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/assignment/ratios/dept/${LIST_NO}?requireDirector=true`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const ids = (res.body.deptRatios as any[]).map((d) => d.obdeptId).sort();
    expect(ids).toEqual(['XTA0', 'XTB0', 'XTE0']);
  });

  // TS-F117-INT-006（AC-10 regression 錨點）
  it('GET 不帶 requireDirector → 回應與實作前完全一致，陣列含全部 5 部門', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/assignment/ratios/dept/${LIST_NO}`)
      .set('Authorization', `Bearer ${directorToken}`);
    expect(res.status).toBe(200);
    const ids = (res.body.deptRatios as any[]).map((d) => d.obdeptId).sort();
    expect(ids).toEqual(['XTA0', 'XTB0', 'XTC0', 'XTD0', 'XTE0']);
    expect(res.body.hiddenNoDirectorCount ?? 0).toBe(0);
  });
});
