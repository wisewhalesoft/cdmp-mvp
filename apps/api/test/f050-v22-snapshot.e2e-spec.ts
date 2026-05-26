/**
 * F050 v2.2 §6.2 — GET /api/v1/assignment/list-definitions/:listNo/full-snapshot E2E
 *
 * 對應 test spec：F050-test.md §十五 SS 群組（TS-F050-SS-001 ~ 012）
 *
 * 覆蓋：
 *   SS-001 draft 名單快照（deptRatios=[], personnelRatios=[], auditTrail 含 CREATE）
 *   SS-002 dept_ratio 名單（deptRatios 有值, personnelRatios=[]）
 *   SS-003 personnel_ratio 名單（兩者皆有值）
 *   SS-004 ready 名單完整 timeline（含核准 audit）
 *   SS-005 LEGACY 名單（conditionPayload=null）→ legacyEntityFallback 非 null
 *   SS-006 section_chief → personnelRatios 僅本轄區 deptCode
 *   SS-007 director → personnelRatios 含全部部門
 *   SS-008 user → 403 AUTH_FORBIDDEN（class 級 DirectorOrSectionChiefGuard）
 *   SS-009 無 Token → 401 AUTH_TOKEN_MISSING
 *   SS-010 listNo 不存在 → 404 ASSIGNMENT_LIST_NOT_FOUND
 *   SS-011 歷史月份名單可開啟 Drawer（不攔截）
 *   SS-012 月跑執行中可開啟 Drawer（不攔截）
 *
 * 命名漂移注意（spec drift）：
 *   - test spec 範例文字使用 `action='CREATE' / 'ADVANCE_STAGE' / 'APPROVE'`
 *   - 但實際 DB schema entity `AssignmentAuditLog.action` enum 為
 *     `'CREATE' / 'STAGE_ADVANCE' / 'STAGE_ROLLBACK' / 'STAGE_REJECT' / ...`
 *   - 核准對應 `assignment_approval.action='approve'` 表，不寫 audit log
 *   - 本 test seed 使用實際 entity 允許的 enum，斷言對齊真實 system contract
 *     ([[feedback_mock_real_system_contract]])
 *
 * 處長轄區隔離 mechanism：
 *   - spec §6.2 文字描述「依處長帳號之 dept_code 過濾」
 *   - 既有 production pattern（SectionChiefScopeService）以 ob_empl_set.created_by 過濾
 *   - 本實作沿用既有 pattern：處長 user 建立的 empl_set 視為其轄區
 *     （與 F063/F064/F066/F067 v1.1 一致）
 */

import 'reflect-metadata';
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
import { AssignmentRun } from '@/database/entities/assignment-run.entity';
import { PooldataFieldOption } from '@/database/entities/pooldata-field-option.entity';
import { PooldataFieldWhitelist } from '@/database/entities/pooldata-field-whitelist.entity';
import { HashUtil } from '@/common/hash/hash.util';

const JWT_SECRET = 'test-jwt-secret-for-f050-v22-snapshot-e2e';
const OVERRIDE_YM = '202605';

const DIRECTOR_USER = {
  id: 'd1000000-0000-0000-0000-000000000001',
  name: 'Director Wang',
  email: 'director-snapshot@cdmp.test',
  password: 'P@ssw0rd123',
  role: 'user' as const,
  status: 'active' as const,
  is_sales_manager: true,
  business_role: 'director' as const,
};

const SECTION_CHIEF_USER = {
  id: 'c1000000-0000-0000-0000-000000000002',
  name: 'Chief Lin',
  email: 'chief-snapshot@cdmp.test',
  password: 'P@ssw0rd123',
  role: 'user' as const,
  status: 'active' as const,
  is_sales_manager: false,
  business_role: 'section_chief' as const,
};

const PLAIN_USER = {
  id: 'u1000000-0000-0000-0000-000000000003',
  name: 'User Chen',
  email: 'user-snapshot@cdmp.test',
  password: 'P@ssw0rd123',
  role: 'user' as const,
  status: 'active' as const,
  is_sales_manager: false,
  business_role: null,
};

async function createTestApp(): Promise<INestApplication> {
  process.env.DB_TYPE = 'sqlite';
  process.env.ENABLE_E07_REFACTOR_PHASE3 = 'true';
  process.env.OVERRIDE_CURRENT_WORK_YM = OVERRIDE_YM;

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
          ObListDefinition,
          ObDeptPct,
          ObEmplSet,
          ObEmphire,
          ObCardType,
          ObPoolData,
          ObCalendar,
          AssignmentAuditLog,
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
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  await app.init();

  // Seed users
  const ds = moduleFixture.get(DataSource);
  const userRepo = ds.getRepository(User);
  const passwordHash = await HashUtil.hash('P@ssw0rd123');
  for (const u of [DIRECTOR_USER, SECTION_CHIEF_USER, PLAIN_USER]) {
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

interface SeedListOpts {
  listNo: string;
  listNm?: string;
  stage: 'draft' | 'dept_ratio' | 'personnel_ratio' | 'approval' | 'ready';
  status?: 'active' | 'inactive';
  projectWorkym?: string;
  conditionPayload?: object | null;
  prodKind?: string;
  caseyear?: string | null;
  specTp?: string | null;
  caseStatus?: string;
  settleSrc?: string | null;
  cardType?: string | null;
  createdBy?: string;
}

async function seedList(ds: DataSource, opts: SeedListOpts): Promise<void> {
  const repo = ds.getRepository(ObListDefinition);
  const now = new Date();
  await repo.save(
    repo.create({
      list_no: opts.listNo,
      list_nm: opts.listNm ?? 'Test List',
      list_type: '01',
      prod_kind: opts.prodKind ?? '',
      caseyear: opts.caseyear ?? null,
      spec_tp: opts.specTp ?? null,
      case_status: opts.caseStatus ?? '',
      settle_src: opts.settleSrc ?? null,
      list_period_start: '1',
      list_period_end: '6',
      list_interval: '1',
      project_workym: opts.projectWorkym ?? OVERRIDE_YM,
      casenumber: null,
      name: null,
      caseyearnm: null,
      card_type: opts.cardType ?? null,
      cr_enabled: false,
      status: opts.status ?? 'active',
      stage: opts.stage,
      prod_best: null,
      condition_payload:
        opts.conditionPayload === undefined
          ? { conditions: [{ columnName: 'prod_kind', fieldType: 'categorical', values: ['01'] }], logic: 'AND' }
          : (opts.conditionPayload as any),
      assigned_date: null,
      total_amount: null,
      reserved_amount: null,
      is_assigned: null,
      created_by_prog: 'TEST',
      created_by: opts.createdBy ?? DIRECTOR_USER.id,
      created_at: now,
      updated_by_prog: 'TEST',
      updated_by: opts.createdBy ?? DIRECTOR_USER.id,
      updated_at: now,
    } as any),
  );
}

async function seedDeptPct(
  ds: DataSource,
  listNo: string,
  rows: Array<{ deptCode: string; deptName: string; ration: number }>,
  createdBy: string = DIRECTOR_USER.id,
): Promise<void> {
  const repo = ds.getRepository(ObDeptPct);
  const now = new Date();
  for (const r of rows) {
    await repo.save(
      repo.create({
        project_workym: OVERRIDE_YM,
        list_no: listNo,
        obdeptid: r.deptCode,
        obdeptnm: r.deptName,
        ration: String(r.ration),
        created_by_prog: 'TEST',
        created_by: createdBy,
        created_at: now,
        updated_by_prog: 'TEST',
        updated_by: createdBy,
        updated_at: now,
      } as any),
    );
  }
}

async function seedEmplSet(
  ds: DataSource,
  listNo: string,
  rows: Array<{ deptCode: string; emplid: string; ration: number }>,
  createdBy: string = DIRECTOR_USER.id,
): Promise<void> {
  const repo = ds.getRepository(ObEmplSet);
  const now = new Date();
  for (const r of rows) {
    await repo.save(
      repo.create({
        list_no: listNo,
        deptid_m: r.deptCode,
        emplid: r.emplid,
        ration: String(r.ration),
        prod_type: null,
        created_by_prog: 'TEST',
        created_by: createdBy,
        created_at: now,
        updated_by_prog: 'TEST',
        updated_by: createdBy,
        updated_at: now,
      } as any),
    );
  }
}

async function seedEmphire(
  ds: DataSource,
  rows: Array<{ empId: string; empNm: string; deptCode: string; deptName?: string }>,
): Promise<void> {
  const repo = ds.getRepository(ObEmphire);
  for (const r of rows) {
    await repo.save(
      repo.create({
        emp_id: r.empId,
        emp_nm: r.empNm,
        id_no: null,
        dept_code: r.deptCode,
        dept_name: r.deptName ?? null,
        title_code: null,
        title_name: null,
        jfun_id: null,
        jfun_nm: null,
        hire_date: null,
        resign_date: null,
        email: null,
        is_auth: null,
      } as any),
    );
  }
}

async function seedAuditLog(
  ds: DataSource,
  listNo: string,
  rows: Array<{
    action: string;
    actorId?: string;
    actorName?: string;
    before?: object | null;
    after?: object | null;
    createdAt?: Date;
    /** 預設 'ob_list_definition'；傳 'list_definition' 模擬 2026-05-26 前的舊階段事件 */
    entityType?: string;
  }>,
): Promise<void> {
  const repo = ds.getRepository(AssignmentAuditLog);
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    await repo.save(
      repo.create({
        entity_type: r.entityType ?? 'ob_list_definition',
        entity_id: listNo,
        action: r.action as any,
        actor_id: r.actorId ?? DIRECTOR_USER.id,
        actor_name: r.actorName ?? DIRECTOR_USER.name,
        before_value: r.before ?? null,
        after_value: r.after ?? null,
        ip_address: '127.0.0.1',
        created_at: r.createdAt ?? new Date(2026, 4, 9 + i, 1, 14, 0),
      } as any),
    );
  }
}

async function seedAssignmentRun(
  ds: DataSource,
  status: 'pending' | 'running' | 'completed' | 'failed',
): Promise<void> {
  const repo = ds.getRepository(AssignmentRun);
  await repo.save(
    repo.create({
      run_id: '00000000-0000-0000-0000-000000000010',
      project_workym: OVERRIDE_YM,
      triggered_by: DIRECTOR_USER.id,
      status,
      created_at: new Date(),
    } as any),
  );
}

const baseConditionPayload = {
  conditions: [
    { columnName: 'prod_kind', fieldType: 'categorical', values: ['01'] },
  ],
  logic: 'AND',
};

function snapshotUrl(listNo: string): string {
  return `/api/v1/assignment/lists/${listNo}/full-snapshot`;
}

describe('F050 v2.2 §6.2 — GET full-snapshot E2E (SS 群組 12 場景)', () => {
  let app: INestApplication;
  let directorToken: string;
  let sectionChiefToken: string;
  let userToken: string;
  let ds: DataSource;

  beforeAll(async () => {
    app = await createTestApp();
    ds = app.get(DataSource);
    directorToken = await login(app, DIRECTOR_USER.email);
    sectionChiefToken = await login(app, SECTION_CHIEF_USER.email);
    userToken = await login(app, PLAIN_USER.email);
  });

  afterAll(async () => {
    delete process.env.OVERRIDE_CURRENT_WORK_YM;
    await app?.close();
  });

  beforeEach(async () => {
    process.env.ENABLE_E07_REFACTOR_PHASE3 = 'true';
    // 每個 test 清空 list / dept_pct / empl_set / emphire / audit / run
    await ds.getRepository(AssignmentAuditLog).clear();
    await ds.getRepository(ObDeptPct).clear();
    // ob_empl_set 含複合 PK + ration NOT NULL → 用 entity-aware remove
    const emplSetRepo = ds.getRepository(ObEmplSet);
    const allEmpl = await emplSetRepo.find();
    if (allEmpl.length > 0) await emplSetRepo.remove(allEmpl);
    await ds.getRepository(ObEmphire).clear();
    await ds.getRepository(ObListDefinition).clear();
    await ds.getRepository(AssignmentRun).clear();
  });

  // ============================================================
  // SS-001：draft 名單快照
  // ============================================================
  it('TS-F050-SS-001：draft 名單快照 — deptRatios/personnelRatios 皆為空陣列，auditTrail 含 CREATE', async () => {
    const listNo = 'OB202605001';
    await seedList(ds, {
      listNo,
      listNm: '草稿測試名單',
      stage: 'draft',
      conditionPayload: baseConditionPayload,
    });
    await seedAuditLog(ds, listNo, [{ action: 'CREATE', after: { stage: 'draft' } }]);

    const res = await request(app.getHttpServer())
      .get(snapshotUrl(listNo))
      .set('Authorization', `Bearer ${directorToken}`);

    expect(res.status).toBe(200);
    expect(res.body.list.stage).toBe('draft');
    expect(Array.isArray(res.body.deptRatios)).toBe(true);
    expect(res.body.deptRatios).toEqual([]);
    expect(Array.isArray(res.body.personnelRatios)).toBe(true);
    expect(res.body.personnelRatios).toEqual([]);
    expect(res.body.auditTrail.length).toBeGreaterThanOrEqual(1);
    expect(res.body.auditTrail[0].action).toBe('CREATE');
    // Response 不含敏感欄位
    expect(res.body.list).not.toHaveProperty('password');
    // prod_best deprecated 欄位不出現於 response
    expect(res.body.list).not.toHaveProperty('prod_best');
    expect(res.body.list).not.toHaveProperty('prodBest');
  });

  // ============================================================
  // SS-002：dept_ratio 名單快照
  // ============================================================
  it('TS-F050-SS-002：dept_ratio 名單 — deptRatios 有值（合計 100），personnelRatios 空陣列', async () => {
    const listNo = 'OB202605002';
    await seedList(ds, { listNo, stage: 'dept_ratio', conditionPayload: baseConditionPayload });
    await seedDeptPct(ds, listNo, [
      { deptCode: 'XTA0', deptName: '業務一部', ration: 60 },
      { deptCode: 'XTB0', deptName: '業務二部', ration: 40 },
    ]);
    await seedAuditLog(ds, listNo, [
      { action: 'CREATE', after: { stage: 'draft' } },
      { action: 'STAGE_ADVANCE', before: { stage: 'draft' }, after: { stage: 'dept_ratio' } },
    ]);

    const res = await request(app.getHttpServer())
      .get(snapshotUrl(listNo))
      .set('Authorization', `Bearer ${directorToken}`);

    expect(res.status).toBe(200);
    expect(res.body.deptRatios.length).toBe(2);
    const sum = res.body.deptRatios.reduce((s: number, r: any) => s + Number(r.ration), 0);
    expect(sum).toBe(100);
    expect(res.body.personnelRatios).toEqual([]);
  });

  // ============================================================
  // SS-003：personnel_ratio 名單快照
  // ============================================================
  it('TS-F050-SS-003：personnel_ratio 名單 — 兩者皆有值', async () => {
    const listNo = 'OB202605003';
    await seedList(ds, { listNo, stage: 'personnel_ratio', conditionPayload: baseConditionPayload });
    await seedDeptPct(ds, listNo, [
      { deptCode: 'XTA0', deptName: '業務一部', ration: 60 },
      { deptCode: 'XTB0', deptName: '業務二部', ration: 40 },
    ]);
    await seedEmphire(ds, [
      { empId: 'E001', empNm: '陳大明', deptCode: 'XTA0', deptName: '業務一部' },
      { empId: 'E002', empNm: '林小華', deptCode: 'XTA0', deptName: '業務一部' },
      { empId: 'E003', empNm: '王志強', deptCode: 'XTB0', deptName: '業務二部' },
      { empId: 'E004', empNm: '李美麗', deptCode: 'XTB0', deptName: '業務二部' },
    ]);
    await seedEmplSet(ds, listNo, [
      { deptCode: 'XTA0', emplid: 'E001', ration: 30 },
      { deptCode: 'XTA0', emplid: 'E002', ration: 30 },
      { deptCode: 'XTB0', emplid: 'E003', ration: 20 },
      { deptCode: 'XTB0', emplid: 'E004', ration: 20 },
    ]);

    const res = await request(app.getHttpServer())
      .get(snapshotUrl(listNo))
      .set('Authorization', `Bearer ${directorToken}`);

    expect(res.status).toBe(200);
    expect(res.body.deptRatios.length).toBe(2);
    expect(res.body.personnelRatios.length).toBe(2);
    for (const group of res.body.personnelRatios) {
      expect(Array.isArray(group.members)).toBe(true);
      expect(group.members.length).toBeGreaterThanOrEqual(1);
    }
  });

  // ============================================================
  // SS-004：ready 名單完整 timeline
  // ============================================================
  it('TS-F050-SS-004：ready 名單 — 完整 timeline，依 at ASC 排序', async () => {
    const listNo = 'OB202605005';
    await seedList(ds, { listNo, stage: 'ready', conditionPayload: baseConditionPayload });
    const base = new Date('2026-05-09T01:14:00Z').getTime();
    await seedAuditLog(ds, listNo, [
      { action: 'CREATE', after: { stage: 'draft' }, createdAt: new Date(base) },
      {
        action: 'STAGE_ADVANCE',
        before: { stage: 'draft' },
        after: { stage: 'dept_ratio' },
        createdAt: new Date(base + 3600 * 1000),
      },
      {
        action: 'STAGE_ADVANCE',
        before: { stage: 'dept_ratio' },
        after: { stage: 'personnel_ratio' },
        createdAt: new Date(base + 7200 * 1000),
      },
      {
        action: 'STAGE_ADVANCE',
        before: { stage: 'personnel_ratio' },
        after: { stage: 'approval' },
        createdAt: new Date(base + 10800 * 1000),
      },
      {
        action: 'STAGE_ADVANCE',
        before: { stage: 'approval' },
        after: { stage: 'ready' },
        createdAt: new Date(base + 14400 * 1000),
      },
    ]);

    const res = await request(app.getHttpServer())
      .get(snapshotUrl(listNo))
      .set('Authorization', `Bearer ${directorToken}`);

    expect(res.status).toBe(200);
    expect(res.body.auditTrail.length).toBe(5);
    expect(res.body.auditTrail[0].action).toBe('CREATE');
    // Last action 取得最後 stage → ready
    expect(res.body.auditTrail[4].after.stage).toBe('ready');
    // 排序：at ASC
    const times = res.body.auditTrail.map((a: any) => new Date(a.at).getTime());
    const sorted = [...times].sort((a, b) => a - b);
    expect(times).toEqual(sorted);
  });

  // ============================================================
  // SS-004b：階段事件 entity_type 放寬查詢（涵蓋 2026-05-26 前 'list_definition' 舊資料）
  // ============================================================
  it('TS-F050-SS-004b：auditTrail 涵蓋 entity_type=list_definition 舊階段事件 + 拒絕原因', async () => {
    const listNo = 'OB202605004B';
    await seedList(ds, { listNo, stage: 'personnel_ratio', conditionPayload: baseConditionPayload });
    await seedAuditLog(ds, listNo, [
      { action: 'CREATE', after: { stage: 'draft' } }, // entity_type='ob_list_definition'（新 writer）
      {
        // 舊階段事件以 'list_definition' 寫入（fix 前）；放寬查詢後仍須查得到
        action: 'STAGE_REJECT',
        before: null,
        after: { fromStage: 'approval', toStage: 'personnel_ratio', rejectReason: '比例不合理' },
        entityType: 'list_definition',
      },
    ]);

    const res = await request(app.getHttpServer())
      .get(snapshotUrl(listNo))
      .set('Authorization', `Bearer ${directorToken}`);

    expect(res.status).toBe(200);
    const actions = res.body.auditTrail.map((a: any) => a.action);
    expect(actions).toContain('CREATE');
    expect(actions).toContain('STAGE_REJECT'); // 舊 entity_type 仍被查到
    const rejectRow = res.body.auditTrail.find((a: any) => a.action === 'STAGE_REJECT');
    expect(rejectRow.after.rejectReason).toBe('比例不合理');
  });

  // ============================================================
  // SS-005：LEGACY 名單 → legacyEntityFallback 非 null
  // ============================================================
  it('TS-F050-SS-005：LEGACY 名單（conditionPayload IS NULL）→ legacyEntityFallback 非 null', async () => {
    const listNo = 'OB202605099';
    await seedList(ds, {
      listNo,
      stage: 'ready',
      conditionPayload: null,
      prodKind: '01',
      caseyear: '0$$1',
      specTp: '12',
      caseStatus: '02',
    });

    const res = await request(app.getHttpServer())
      .get(snapshotUrl(listNo))
      .set('Authorization', `Bearer ${directorToken}`);

    expect(res.status).toBe(200);
    expect(res.body.list.conditionPayload).toBeNull();
    expect(res.body.list.legacyEntityFallback).not.toBeNull();
    expect(res.body.list.legacyEntityFallback.prodKind).toBe('01');
    expect(res.body.list.legacyEntityFallback.caseyear).toBe('0$$1');
    expect(res.body.list.legacyEntityFallback.specTp).toBe('12');
    expect(res.body.list.legacyEntityFallback.caseStatus).toBe('02');
  });

  // ============================================================
  // SS-006：section_chief 呼叫 — personnelRatios 僅本轄區
  // ============================================================
  it('TS-F050-SS-006：section_chief → personnelRatios 僅含本轄區 deptCode（XTA0）', async () => {
    const listNo = 'OB202605006';
    await seedList(ds, { listNo, stage: 'personnel_ratio', conditionPayload: baseConditionPayload });
    await seedDeptPct(ds, listNo, [
      { deptCode: 'XTA0', deptName: '業務一部', ration: 60 },
      { deptCode: 'XTB0', deptName: '業務二部', ration: 40 },
    ]);
    await seedEmphire(ds, [
      { empId: 'E001', empNm: '陳大明', deptCode: 'XTA0' },
      { empId: 'E002', empNm: '林小華', deptCode: 'XTA0' },
      { empId: 'E003', empNm: '王志強', deptCode: 'XTB0' },
    ]);
    // 處長轄區：以 created_by = section_chief.id 標示本轄區 empl_set
    await seedEmplSet(
      ds,
      listNo,
      [
        { deptCode: 'XTA0', emplid: 'E001', ration: 30 },
        { deptCode: 'XTA0', emplid: 'E002', ration: 30 },
      ],
      SECTION_CHIEF_USER.id,
    );
    // 他處長之 emplSet
    await seedEmplSet(
      ds,
      listNo,
      [{ deptCode: 'XTB0', emplid: 'E003', ration: 40 }],
      DIRECTOR_USER.id,
    );

    const res = await request(app.getHttpServer())
      .get(snapshotUrl(listNo))
      .set('Authorization', `Bearer ${sectionChiefToken}`);

    expect(res.status).toBe(200);
    expect(res.body.personnelRatios.length).toBe(1);
    expect(res.body.personnelRatios[0].deptCode).toBe('XTA0');
    // XTB0 完全不出現
    const allDepts = res.body.personnelRatios.map((g: any) => g.deptCode);
    expect(allDepts).not.toContain('XTB0');
    // deptRatios 不過濾（仍含兩部門）
    expect(res.body.deptRatios.length).toBe(2);
  });

  // ============================================================
  // SS-007：director → personnelRatios 含全部部門
  // ============================================================
  it('TS-F050-SS-007：director → personnelRatios 含全部部門（不過濾）', async () => {
    const listNo = 'OB202605007';
    await seedList(ds, { listNo, stage: 'personnel_ratio', conditionPayload: baseConditionPayload });
    await seedDeptPct(ds, listNo, [
      { deptCode: 'XTA0', deptName: '業務一部', ration: 60 },
      { deptCode: 'XTB0', deptName: '業務二部', ration: 40 },
    ]);
    await seedEmphire(ds, [
      { empId: 'E001', empNm: '陳大明', deptCode: 'XTA0' },
      { empId: 'E003', empNm: '王志強', deptCode: 'XTB0' },
    ]);
    await seedEmplSet(
      ds,
      listNo,
      [
        { deptCode: 'XTA0', emplid: 'E001', ration: 30 },
        { deptCode: 'XTB0', emplid: 'E003', ration: 40 },
      ],
      DIRECTOR_USER.id,
    );

    const res = await request(app.getHttpServer())
      .get(snapshotUrl(listNo))
      .set('Authorization', `Bearer ${directorToken}`);

    expect(res.status).toBe(200);
    expect(res.body.personnelRatios.length).toBe(2);
  });

  // ============================================================
  // SS-008：user → 403 AUTH_FORBIDDEN
  // ============================================================
  it('TS-F050-SS-008：role=user → 403（DirectorOrSectionChiefGuard 攔截）', async () => {
    const listNo = 'OB202605008';
    await seedList(ds, { listNo, stage: 'draft', conditionPayload: baseConditionPayload });

    const res = await request(app.getHttpServer())
      .get(snapshotUrl(listNo))
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(403);
    // 既有 Guard 體系實際錯誤碼：business_role=null → E07_ROLE_NOT_ASSIGNED
    // （與 F075 v1.4 E2E-005 同一語意 / drift 處置）
    expect(['AUTH_FORBIDDEN', 'E07_ROLE_NOT_ASSIGNED']).toContain(res.body.error);
  });

  // ============================================================
  // SS-009：無 Token → 401
  // ============================================================
  it('TS-F050-SS-009：無 Token → 401 AUTH_TOKEN_MISSING', async () => {
    const listNo = 'OB202605009';
    await seedList(ds, { listNo, stage: 'draft', conditionPayload: baseConditionPayload });

    const res = await request(app.getHttpServer()).get(snapshotUrl(listNo));

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('AUTH_TOKEN_MISSING');
  });

  // ============================================================
  // SS-010：404 listNo 不存在
  // ============================================================
  it('TS-F050-SS-010：listNo 不存在 → 404 ASSIGNMENT_LIST_NOT_FOUND', async () => {
    const res = await request(app.getHttpServer())
      .get(snapshotUrl('OB999999999'))
      .set('Authorization', `Bearer ${directorToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('ASSIGNMENT_LIST_NOT_FOUND');
  });

  // ============================================================
  // SS-011：歷史月份名單可開啟 Drawer
  // ============================================================
  it('TS-F050-SS-011：歷史月份名單可開啟 Drawer（不攔截 LIST_HISTORICAL_READONLY）', async () => {
    const listNo = 'OB202504001';
    await seedList(ds, {
      listNo,
      stage: 'ready',
      conditionPayload: baseConditionPayload,
      projectWorkym: '202504',
    });

    const res = await request(app.getHttpServer())
      .get(snapshotUrl(listNo))
      .set('Authorization', `Bearer ${directorToken}`);

    expect(res.status).toBe(200);
    expect(res.body.list.projectWorkym).toBe('202504');
  });

  // ============================================================
  // SS-013：行為人姓名解析（actor_name 為 UUID placeholder → users.name）
  // ============================================================
  it('TS-F050-SS-013：auditTrail operatorEmpNm 由 actor_id 解析為 users.name', async () => {
    const listNo = 'OB202605013';
    await seedList(ds, { listNo, stage: 'approval', conditionPayload: baseConditionPayload });
    // 模擬真實 writer：actor_name 寫入 actor_id（UUID placeholder），姓名需由 users 表解析
    await seedAuditLog(ds, listNo, [
      {
        action: 'STAGE_REJECT',
        actorId: DIRECTOR_USER.id,
        actorName: DIRECTOR_USER.id,
        after: { fromStage: 'approval', toStage: 'personnel_ratio', rejectReason: '需調整' },
        entityType: 'list_definition',
      },
    ]);

    const res = await request(app.getHttpServer())
      .get(snapshotUrl(listNo))
      .set('Authorization', `Bearer ${directorToken}`);

    expect(res.status).toBe(200);
    const row = res.body.auditTrail.find((a: any) => a.action === 'STAGE_REJECT');
    expect(row).toBeDefined();
    // operatorEmpNm 解析為真實姓名，而非 UUID
    expect(row.operatorEmpNm).toBe(DIRECTOR_USER.name);
    expect(row.operatorId).toBe(DIRECTOR_USER.id);
  });

  // ============================================================
  // SS-012：月跑執行中可開啟 Drawer
  // ============================================================
  it('TS-F050-SS-012：月跑執行中可開啟 Drawer（不攔截 ASSIGNMENT_RUN_ALREADY_RUNNING）', async () => {
    const listNo = 'OB202605012';
    await seedList(ds, { listNo, stage: 'ready', conditionPayload: baseConditionPayload });
    await seedAssignmentRun(ds, 'running');

    const res = await request(app.getHttpServer())
      .get(snapshotUrl(listNo))
      .set('Authorization', `Bearer ${directorToken}`);

    expect(res.status).toBe(200);
  });
});
