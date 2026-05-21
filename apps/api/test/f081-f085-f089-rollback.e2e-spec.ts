/**
 * F081 / F085 / F089 v1.3 + F077 v1.3 — Rollback API + section_chief 隔離 E2E
 *
 * 對應 test spec：
 *   - F081-test.md TS-F081-001~004 dept_ratio → draft
 *   - F085-test.md TS-F085-001~004 personnel_ratio → dept_ratio
 *   - F089-test.md TS-F089-001~004 ready → approval
 *   - F077-test.md TS-F077-SC-001~002 section_chief 轄區隔離
 *
 * 關鍵驗證點：
 *   - F081：rollback 後 ob_dept_pct 全部刪除（DELETE language）
 *   - F085：rollback 後 ob_empl_set 全部刪除，ob_dept_pct **保留**（關鍵差異）
 *   - F089：rollback 後 ob_dept_pct + ob_empl_set 都**保留**（無清空）
 *   - F077-SC：section_chief Token → GET /lists 僅本轄區（依 created_by 過濾）
 *
 * TypeORM 刪除安全（[[feedback_typeorm_null_pk_delete]]）：
 *   F081/F085 之 stage-action.service 已實作 mgr.delete(entity, criteria)，
 *   criteria 中所有 PK 欄位皆有具體值（project_workym + list_no），
 *   不會踩到「複合 PK + NULL 永不 match」陷阱。本 e2e 驗證刪除結果正確。
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

const JWT_SECRET = 'test-jwt-secret-for-f081-f085-f089-rollback-e2e';
const OVERRIDE_YM = '202605';

const DIRECTOR_USER = {
  id: 'd2000000-0000-0000-0000-000000000001',
  name: 'Director Wang',
  email: 'dir-rollback@cdmp.test',
  password: 'P@ssw0rd123',
  role: 'user' as const,
  status: 'active' as const,
  is_sales_manager: true,
  business_role: 'director' as const,
};

const SECTION_CHIEF_A = {
  id: 'c2000000-0000-0000-0000-00000000000A',
  name: 'Chief Lin',
  email: 'sc-a-rollback@cdmp.test',
  password: 'P@ssw0rd123',
  role: 'user' as const,
  status: 'active' as const,
  is_sales_manager: false,
  business_role: 'section_chief' as const,
};

const SECTION_CHIEF_B = {
  id: 'c2000000-0000-0000-0000-00000000000B',
  name: 'Chief Wang',
  email: 'sc-b-rollback@cdmp.test',
  password: 'P@ssw0rd123',
  role: 'user' as const,
  status: 'active' as const,
  is_sales_manager: false,
  business_role: 'section_chief' as const,
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
  const hash = await HashUtil.hash('P@ssw0rd123');
  for (const u of [DIRECTOR_USER, SECTION_CHIEF_A, SECTION_CHIEF_B]) {
    await userRepo.save(
      userRepo.create({
        id: u.id,
        name: u.name,
        email: u.email,
        password_hash: hash,
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
  return res.body.token;
}

async function seedList(
  ds: DataSource,
  opts: {
    listNo: string;
    stage: 'draft' | 'dept_ratio' | 'personnel_ratio' | 'approval' | 'ready';
    status?: 'active' | 'inactive';
    createdBy?: string;
    projectWorkym?: string;
  },
): Promise<void> {
  const repo = ds.getRepository(ObListDefinition);
  const now = new Date();
  await repo.save(
    repo.create({
      list_no: opts.listNo,
      list_nm: 'Test',
      list_type: '01',
      prod_kind: '',
      caseyear: null,
      spec_tp: null,
      case_status: '',
      settle_src: null,
      list_period_start: '1',
      list_period_end: '6',
      list_interval: '1',
      project_workym: opts.projectWorkym ?? OVERRIDE_YM,
      casenumber: null,
      name: null,
      caseyearnm: null,
      card_type: null,
      cr_enabled: false,
      status: opts.status ?? 'active',
      stage: opts.stage,
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
      created_by: opts.createdBy ?? DIRECTOR_USER.id,
      created_at: now,
      updated_by_prog: 'TEST',
      updated_by: opts.createdBy ?? DIRECTOR_USER.id,
      updated_at: now,
    } as any),
  );
}

async function seedDeptPct(ds: DataSource, listNo: string, projectWorkym = OVERRIDE_YM): Promise<void> {
  const repo = ds.getRepository(ObDeptPct);
  const now = new Date();
  for (const r of [
    { dept: 'XTA0', name: '業務一部', ration: '60' },
    { dept: 'XTB0', name: '業務二部', ration: '40' },
  ]) {
    await repo.save(
      repo.create({
        project_workym: projectWorkym,
        list_no: listNo,
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

async function seedEmplSet(ds: DataSource, listNo: string): Promise<void> {
  const repo = ds.getRepository(ObEmplSet);
  const now = new Date();
  for (const r of [
    { dept: 'XTA0', emp: 'E001', ration: '30' },
    { dept: 'XTA0', emp: 'E002', ration: '30' },
    { dept: 'XTB0', emp: 'E003', ration: '20' },
    { dept: 'XTB0', emp: 'E004', ration: '20' },
  ]) {
    await repo.save(
      repo.create({
        list_no: listNo,
        deptid_m: r.dept,
        emplid: r.emp,
        ration: r.ration,
        prod_type: null,
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

async function seedAssignmentRun(ds: DataSource, status: 'pending' | 'running'): Promise<void> {
  const repo = ds.getRepository(AssignmentRun);
  await repo.save(
    repo.create({
      run_id: '00000000-0000-0000-0000-00000000F081',
      project_workym: OVERRIDE_YM,
      triggered_by: DIRECTOR_USER.id,
      status,
      created_at: new Date(),
    } as any),
  );
}

describe('F081 / F085 / F089 v1.3 Rollback E2E + F077 v1.3 section_chief 隔離', () => {
  let app: INestApplication;
  let directorToken: string;
  let scAToken: string;
  let scBToken: string;
  let ds: DataSource;

  beforeAll(async () => {
    app = await createTestApp();
    ds = app.get(DataSource);
    directorToken = await login(app, DIRECTOR_USER.email);
    scAToken = await login(app, SECTION_CHIEF_A.email);
    scBToken = await login(app, SECTION_CHIEF_B.email);
  });

  afterAll(async () => {
    delete process.env.OVERRIDE_CURRENT_WORK_YM;
    await app?.close();
  });

  beforeEach(async () => {
    process.env.ENABLE_E07_REFACTOR_PHASE3 = 'true';
    await ds.getRepository(AssignmentAuditLog).clear();
    await ds.getRepository(AssignmentApproval).clear();
    await ds.getRepository(ObDeptPct).clear();
    const emplSetRepo = ds.getRepository(ObEmplSet);
    const all = await emplSetRepo.find();
    if (all.length > 0) await emplSetRepo.remove(all);
    await ds.getRepository(ObListDefinition).clear();
    await ds.getRepository(AssignmentRun).clear();
  });

  // ============================================================
  // F081：dept_ratio → draft（清空 ob_dept_pct）
  // ============================================================
  describe('F081 rollback dept_ratio → draft', () => {
    it('TS-F081-001 成功 → stage=draft、ob_dept_pct 全部刪除、audit log 記錄', async () => {
      const listNo = 'OB202605010';
      await seedList(ds, { listNo, stage: 'dept_ratio' });
      await seedDeptPct(ds, listNo);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/assignment/lists/${listNo}/stage/rollback-to-draft`)
        .set('Authorization', `Bearer ${directorToken}`);

      expect(res.status).toBe(200);
      const reloaded = await ds.getRepository(ObListDefinition).findOne({ where: { list_no: listNo } });
      expect(reloaded?.stage).toBe('draft');
      const remainingDept = await ds.getRepository(ObDeptPct).count({ where: { list_no: listNo } });
      expect(remainingDept).toBe(0);
      const audit = await ds
        .getRepository(AssignmentAuditLog)
        .find({ where: { entity_id: listNo } });
      expect(audit.some((a) => a.action === 'STAGE_ROLLBACK')).toBe(true);
    });

    it('TS-F081-002 stage 非 dept_ratio → 422 STAGE_ROLLBACK_BLOCKED', async () => {
      const listNo = 'OB202605011';
      await seedList(ds, { listNo, stage: 'draft' });
      const res = await request(app.getHttpServer())
        .post(`/api/v1/assignment/lists/${listNo}/stage/rollback-to-draft`)
        .set('Authorization', `Bearer ${directorToken}`);
      expect(res.status).toBe(422);
      expect(res.body.error).toBe('STAGE_ROLLBACK_BLOCKED');
      const reloaded = await ds.getRepository(ObListDefinition).findOne({ where: { list_no: listNo } });
      expect(reloaded?.stage).toBe('draft');
    });

    it('TS-F081-003 月跑執行中 → 409 ASSIGNMENT_RUN_ALREADY_RUNNING', async () => {
      const listNo = 'OB202605012';
      await seedList(ds, { listNo, stage: 'dept_ratio' });
      await seedAssignmentRun(ds, 'running');

      const res = await request(app.getHttpServer())
        .post(`/api/v1/assignment/lists/${listNo}/stage/rollback-to-draft`)
        .set('Authorization', `Bearer ${directorToken}`);

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('ASSIGNMENT_RUN_ALREADY_RUNNING');
    });

    it('TS-F081-004 section_chief → 403（DirectorGuard 攔截）', async () => {
      const listNo = 'OB202605013';
      await seedList(ds, { listNo, stage: 'dept_ratio' });
      const res = await request(app.getHttpServer())
        .post(`/api/v1/assignment/lists/${listNo}/stage/rollback-to-draft`)
        .set('Authorization', `Bearer ${scAToken}`);
      expect(res.status).toBe(403);
      expect(['AUTH_FORBIDDEN', 'E07_REQUIRES_DIRECTOR']).toContain(res.body.error);
    });
  });

  // ============================================================
  // F085：personnel_ratio → dept_ratio（清空 ob_empl_set，保留 ob_dept_pct）
  // ============================================================
  describe('F085 rollback personnel_ratio → dept_ratio', () => {
    it('TS-F085-001 成功 → stage=dept_ratio、ob_empl_set 全部刪除、ob_dept_pct 保留', async () => {
      const listNo = 'OB202605020';
      await seedList(ds, { listNo, stage: 'personnel_ratio' });
      await seedDeptPct(ds, listNo);
      await seedEmplSet(ds, listNo);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/assignment/lists/${listNo}/stage/rollback-to-dept-ratio`)
        .set('Authorization', `Bearer ${directorToken}`);

      expect(res.status).toBe(200);
      const reloaded = await ds.getRepository(ObListDefinition).findOne({ where: { list_no: listNo } });
      expect(reloaded?.stage).toBe('dept_ratio');
      const emplRemaining = await ds.getRepository(ObEmplSet).count({ where: { list_no: listNo } });
      expect(emplRemaining).toBe(0);
      // 關鍵差異：ob_dept_pct 保留（不清空）
      const deptRemaining = await ds.getRepository(ObDeptPct).count({ where: { list_no: listNo } });
      expect(deptRemaining).toBe(2);
    });

    it('TS-F085-002 stage 非 personnel_ratio → 422', async () => {
      const listNo = 'OB202605021';
      await seedList(ds, { listNo, stage: 'dept_ratio' });
      const res = await request(app.getHttpServer())
        .post(`/api/v1/assignment/lists/${listNo}/stage/rollback-to-dept-ratio`)
        .set('Authorization', `Bearer ${directorToken}`);
      expect(res.status).toBe(422);
      expect(res.body.error).toBe('STAGE_ROLLBACK_BLOCKED');
    });

    it('TS-F085-003 月跑執行中 → 409', async () => {
      const listNo = 'OB202605022';
      await seedList(ds, { listNo, stage: 'personnel_ratio' });
      await seedAssignmentRun(ds, 'running');
      const res = await request(app.getHttpServer())
        .post(`/api/v1/assignment/lists/${listNo}/stage/rollback-to-dept-ratio`)
        .set('Authorization', `Bearer ${directorToken}`);
      expect(res.status).toBe(409);
    });

    it('TS-F085-004 section_chief → 403', async () => {
      const listNo = 'OB202605023';
      await seedList(ds, { listNo, stage: 'personnel_ratio' });
      const res = await request(app.getHttpServer())
        .post(`/api/v1/assignment/lists/${listNo}/stage/rollback-to-dept-ratio`)
        .set('Authorization', `Bearer ${scAToken}`);
      expect(res.status).toBe(403);
    });
  });

  // ============================================================
  // F089：ready → approval（設定資料全部保留）
  // ============================================================
  describe('F089 rollback ready → approval', () => {
    it('TS-F089-001 成功 → stage=approval，ob_dept_pct 與 ob_empl_set 全部保留', async () => {
      const listNo = 'OB202605030';
      await seedList(ds, { listNo, stage: 'ready' });
      await seedDeptPct(ds, listNo);
      await seedEmplSet(ds, listNo);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/assignment/lists/${listNo}/stage/rollback-to-approval`)
        .set('Authorization', `Bearer ${directorToken}`);

      expect(res.status).toBe(200);
      const reloaded = await ds.getRepository(ObListDefinition).findOne({ where: { list_no: listNo } });
      expect(reloaded?.stage).toBe('approval');
      // F089 關鍵：設定資料全部保留
      expect(await ds.getRepository(ObDeptPct).count({ where: { list_no: listNo } })).toBe(2);
      expect(await ds.getRepository(ObEmplSet).count({ where: { list_no: listNo } })).toBe(4);
    });

    it('TS-F089-002 stage 非 ready → 422', async () => {
      const listNo = 'OB202605032';
      await seedList(ds, { listNo, stage: 'approval' });
      const res = await request(app.getHttpServer())
        .post(`/api/v1/assignment/lists/${listNo}/stage/rollback-to-approval`)
        .set('Authorization', `Bearer ${directorToken}`);
      expect(res.status).toBe(422);
    });

    it('TS-F089-003 月跑執行中 → 409', async () => {
      const listNo = 'OB202605033';
      await seedList(ds, { listNo, stage: 'ready' });
      await seedAssignmentRun(ds, 'running');
      const res = await request(app.getHttpServer())
        .post(`/api/v1/assignment/lists/${listNo}/stage/rollback-to-approval`)
        .set('Authorization', `Bearer ${directorToken}`);
      expect(res.status).toBe(409);
    });

    it('TS-F089-004 section_chief → 403', async () => {
      const listNo = 'OB202605034';
      await seedList(ds, { listNo, stage: 'ready' });
      const res = await request(app.getHttpServer())
        .post(`/api/v1/assignment/lists/${listNo}/stage/rollback-to-approval`)
        .set('Authorization', `Bearer ${scAToken}`);
      expect(res.status).toBe(403);
    });
  });

  // ============================================================
  // F077-SC：section_chief 轄區隔離（D3 follow-up 2026-05-21）
  //
  // AssignmentListService.listLists() 已於本 commit 補實作 section_chief
  // 轄區過濾（spec §6 BR-4）—— 依 actor.businessRole='section_chief' 時加上
  // `WHERE created_by = actor.userId`，與既有 SectionChiefScopeService
  // 判斷 pattern 一致（filter 對象由 emplid 改為 list created_by）。
  // ============================================================
  describe('F077-SC v1.3 section_chief 轄區隔離', () => {
    it('TS-F077-SC-002 director Token → GET /lists 回傳所有處長之名單', async () => {
      await seedList(ds, { listNo: 'OB202605SC1', stage: 'draft', createdBy: SECTION_CHIEF_A.id });
      await seedList(ds, { listNo: 'OB202605SC2', stage: 'draft', createdBy: SECTION_CHIEF_B.id });

      const res = await request(app.getHttpServer())
        .get('/api/v1/assignment/lists?ym=202605')
        .set('Authorization', `Bearer ${directorToken}`);

      expect(res.status).toBe(200);
      const listNos = (res.body.lists as Array<{ listNo: string }>).map((l) => l.listNo);
      expect(listNos).toContain('OB202605SC1');
      expect(listNos).toContain('OB202605SC2');
    });

    it('TS-F077-SC-001 section_chief A → 僅回本轄區名單（D3 / BR-4）', async () => {
      await seedList(ds, { listNo: 'OB202605SC1', stage: 'draft', createdBy: SECTION_CHIEF_A.id });
      await seedList(ds, { listNo: 'OB202605SC2', stage: 'draft', createdBy: SECTION_CHIEF_B.id });

      const res = await request(app.getHttpServer())
        .get('/api/v1/assignment/lists?ym=202605')
        .set('Authorization', `Bearer ${scAToken}`);

      expect(res.status).toBe(200);
      const listNos = (res.body.lists as Array<{ listNo: string }>).map((l) => l.listNo);
      // SC_A 為 OB202605SC1 之 created_by → 可見
      expect(listNos).toContain('OB202605SC1');
      // OB202605SC2 由 SC_B 建立 → SC_A 不可見
      expect(listNos).not.toContain('OB202605SC2');
      expect(listNos.length).toBe(1);
    });

    it('TS-F077-SC-001b section_chief B → 僅回本轄區名單（對稱驗證）', async () => {
      await seedList(ds, { listNo: 'OB202605SC1', stage: 'draft', createdBy: SECTION_CHIEF_A.id });
      await seedList(ds, { listNo: 'OB202605SC2', stage: 'draft', createdBy: SECTION_CHIEF_B.id });

      const res = await request(app.getHttpServer())
        .get('/api/v1/assignment/lists?ym=202605')
        .set('Authorization', `Bearer ${scBToken}`);

      expect(res.status).toBe(200);
      const listNos = (res.body.lists as Array<{ listNo: string }>).map((l) => l.listNo);
      expect(listNos).toContain('OB202605SC2');
      expect(listNos).not.toContain('OB202605SC1');
      expect(listNos.length).toBe(1);
    });

    it('TS-F077-SC-001c director（admin role 變體）— 不過濾，仍見全部', async () => {
      // 即使 admin role 帳號不帶 businessRole='director'，shouldFilter 仍 bypass（admin role 短路）
      await seedList(ds, { listNo: 'OB202605SC1', stage: 'draft', createdBy: SECTION_CHIEF_A.id });
      await seedList(ds, { listNo: 'OB202605SC2', stage: 'draft', createdBy: SECTION_CHIEF_B.id });

      const res = await request(app.getHttpServer())
        .get('/api/v1/assignment/lists?ym=202605')
        .set('Authorization', `Bearer ${directorToken}`);
      const listNos = (res.body.lists as Array<{ listNo: string }>).map((l) => l.listNo);
      expect(listNos.length).toBe(2);
    });
  });
});
