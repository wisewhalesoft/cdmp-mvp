/**
 * F050 v2.1 createList integration spec — Phase 5a 波 6（25 個 case）
 *
 * 對應 test spec：
 *   - TS-F050-001 ~ 018, 020 ~ 023, 029, 030（Backend-only 範圍；FE 場景在 5d）
 *   - GAP-LIST §A1 / A2 / A3 / B2 / C1 / C2 / C3
 *
 * 對應 AD：
 *   - AD-E07-18 §18.4 service 寫入流程
 *   - §18.6 衍生規則（NOT NULL 邊界）
 *   - §18.8 prod_kind 交集唯一性
 */

import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AssignmentListService } from '../assignment-list.service';
import { AssignmentRunGuardService } from '@/modules/assignment/services/assignment-run-guard.service';
import { SectionChiefScopeService } from '@/modules/assignment/services/section-chief-scope.service';
import { ObListDefinition } from '@/database/entities/ob-list-definition.entity';
import { AssignmentAuditLog } from '@/database/entities/assignment-audit-log.entity';
import { AssignmentRun } from '@/database/entities/assignment-run.entity';
import { PooldataFieldOption } from '@/database/entities/pooldata-field-option.entity';
import { PooldataFieldWhitelist } from '@/database/entities/pooldata-field-whitelist.entity';
import { ObDeptPct } from '@/database/entities/ob-dept-pct.entity';
import { ObEmplSet } from '@/database/entities/ob-empl-set.entity';
import { ObEmphire } from '@/database/entities/ob-emphire.entity';
import { User } from '@/database/entities/user.entity';
import { ERROR_CODES } from '@/common/errors/error-codes';

const YM = '202605';
const ACTOR = { userId: 'dir-001', ipAddress: '127.0.0.1' };

interface Env {
  app: TestingModule;
  service: AssignmentListService;
  listRepo: Repository<ObListDefinition>;
  auditRepo: Repository<AssignmentAuditLog>;
  runRepo: Repository<AssignmentRun>;
  whitelistRepo: Repository<PooldataFieldWhitelist>;
  optionRepo: Repository<PooldataFieldOption>;
}

async function buildEnv(): Promise<Env> {
  const app = await Test.createTestingModule({
    imports: [
      TypeOrmModule.forRoot({
        type: 'better-sqlite3',
        database: ':memory:',
        entities: [
          ObListDefinition,
          AssignmentAuditLog,
          AssignmentRun,
          PooldataFieldOption,
          PooldataFieldWhitelist, ObDeptPct, ObEmplSet, ObEmphire, User,
        ],
        synchronize: true,
      }),
      TypeOrmModule.forFeature([
        ObListDefinition,
        AssignmentAuditLog,
        AssignmentRun,
        PooldataFieldOption,
        PooldataFieldWhitelist, ObDeptPct, ObEmplSet, ObEmphire, User,
      ]),
    ],
    providers: [AssignmentListService, AssignmentRunGuardService, { provide: SectionChiefScopeService, useValue: { getScopeDeptCode: () => Promise.resolve(null) } }],
  }).compile();
  await app.init();

  const ds = app.get(DataSource);
  return {
    app,
    service: app.get(AssignmentListService),
    listRepo: ds.getRepository(ObListDefinition),
    auditRepo: ds.getRepository(AssignmentAuditLog),
    runRepo: ds.getRepository(AssignmentRun),
    whitelistRepo: ds.getRepository(PooldataFieldWhitelist),
    optionRepo: ds.getRepository(PooldataFieldOption),
  };
}

function baseDto(overrides: Partial<any> = {}) {
  return {
    listNm: '車貸月跑名單',
    listPeriodStart: 1,
    listPeriodEnd: 6,
    listInterval: 1,
    cardType: '01',
    prodBest: null,
    crEnabled: false,
    copyFromListNo: null,
    conditionPayload: {
      conditions: [
        { columnName: 'prod_kind', fieldType: 'categorical', values: ['01'] },
      ],
      logic: 'AND',
    },
    ...overrides,
  };
}

async function seedWhitelistDefault(repo: Repository<PooldataFieldWhitelist>) {
  const now = new Date();
  const rows = [
    { column_name: 'prod_kind', field_type: 'categorical' as const, is_active: true },
    { column_name: 'caseyear', field_type: 'categorical' as const, is_active: true },
    { column_name: 'spec_tp', field_type: 'categorical' as const, is_active: true },
    { column_name: 'case_status', field_type: 'categorical' as const, is_active: true },
    { column_name: 'settle_src', field_type: 'categorical' as const, is_active: true },
    { column_name: 'month_cnt', field_type: 'numeric' as const, is_active: true },
    { column_name: 'birth_date', field_type: 'date' as const, is_active: true },
  ];
  for (const r of rows) {
    await repo.save(
      repo.create({
        column_name: r.column_name,
        display_name: r.column_name,
        field_type: r.field_type,
        is_active: r.is_active,
        created_at: now,
        updated_at: now,
      } as Partial<PooldataFieldWhitelist>),
    );
  }
}

describe('F050 v2.1 createList integration (Phase 5a 波6)', () => {
  let env: Env;

  beforeAll(async () => {
    env = await buildEnv();
  });

  afterAll(async () => {
    await env.app?.close();
  });

  beforeEach(async () => {
    await env.auditRepo.clear();
    await env.optionRepo.clear();
    await env.whitelistRepo.clear();
    await env.listRepo.createQueryBuilder().delete().execute();
    await env.runRepo.clear();
    await seedWhitelistDefault(env.whitelistRepo);
  });

  // -----------------------------------------------------------------
  // CL-001 ~ CL-006：DTO 已驗 conditions/reserved；service 層 422/400
  // -----------------------------------------------------------------

  it('CL-001 / TS-F050-001：conditions = [] → 422', async () => {
    // DTO 已擋（ArrayMinSize），但 service 直接呼叫 createList 仍要正確 throw
    await expect(
      env.service.createList(
        baseDto({ conditionPayload: { conditions: [], logic: 'AND' } }) as any,
        ACTOR,
        YM,
      ),
    ).rejects.toBeDefined();
  });

  it('CL-002 / TS-F050-003：columnName 不在 whitelist → 422 CONDITION_COLUMN_NOT_IN_WHITELIST', async () => {
    try {
      await env.service.createList(
        baseDto({
          conditionPayload: {
            conditions: [{ columnName: 'invalid_field', fieldType: 'categorical', values: ['01'] }],
            logic: 'AND',
          },
        }) as any,
        ACTOR,
        YM,
      );
      throw new Error('expected throw');
    } catch (e: any) {
      expect(e).toBeInstanceOf(UnprocessableEntityException);
      expect(e.getResponse().error).toBe(ERROR_CODES.CONDITION_COLUMN_NOT_IN_WHITELIST);
      expect(e.getResponse().details.columnName).toBe('invalid_field');
    }
  });

  it('CL-003 / TS-F050-004：columnName=settle_src is_active=false → 422', async () => {
    await env.whitelistRepo.update({ column_name: 'settle_src' }, { is_active: false });
    try {
      await env.service.createList(
        baseDto({
          conditionPayload: {
            conditions: [{ columnName: 'settle_src', fieldType: 'categorical', values: ['Y'] }],
            logic: 'AND',
          },
        }) as any,
        ACTOR,
        YM,
      );
      throw new Error('expected throw');
    } catch (e: any) {
      expect(e).toBeInstanceOf(UnprocessableEntityException);
      expect(e.getResponse().error).toBe(ERROR_CODES.CONDITION_COLUMN_NOT_IN_WHITELIST);
      expect(e.getResponse().details.columnName).toBe('settle_src');
    }
  });

  it('CL-004 / TS-F050-005：list_period_start in conditions → 400 RESERVED_FIELD_IN_CONDITIONS', async () => {
    try {
      await env.service.createList(
        baseDto({
          conditionPayload: {
            conditions: [{ columnName: 'list_period_start', fieldType: 'numeric', min: 1, max: 12 }],
            logic: 'AND',
          },
        }) as any,
        ACTOR,
        YM,
      );
      throw new Error('expected throw');
    } catch (e: any) {
      expect(e).toBeInstanceOf(BadRequestException);
      expect(e.getResponse().error).toBe(ERROR_CODES.RESERVED_FIELD_IN_CONDITIONS);
    }
  });

  it('CL-005 / TS-F050-006a：list_period_end → 400', async () => {
    try {
      await env.service.createList(
        baseDto({
          conditionPayload: {
            conditions: [{ columnName: 'list_period_end', fieldType: 'numeric', min: 1, max: 12 }],
            logic: 'AND',
          },
        }) as any,
        ACTOR,
        YM,
      );
      throw new Error('expected throw');
    } catch (e: any) {
      expect(e.getResponse().error).toBe(ERROR_CODES.RESERVED_FIELD_IN_CONDITIONS);
    }
  });

  it('CL-006 / TS-F050-006b：list_interval → 400', async () => {
    try {
      await env.service.createList(
        baseDto({
          conditionPayload: {
            conditions: [{ columnName: 'list_interval', fieldType: 'numeric', min: 1, max: 12 }],
            logic: 'AND',
          },
        }) as any,
        ACTOR,
        YM,
      );
      throw new Error('expected throw');
    } catch (e: any) {
      expect(e.getResponse().error).toBe(ERROR_CODES.RESERVED_FIELD_IN_CONDITIONS);
    }
  });

  // -----------------------------------------------------------------
  // CL-007 / TS-F050-007：WHITELIST_OPTION_INACTIVE warning（非阻擋）
  // -----------------------------------------------------------------

  it('CL-007 / TS-F050-007：含 inactive option → 201 + warnings', async () => {
    const now = new Date();
    await env.optionRepo.save(
      env.optionRepo.create([
        { column_name: 'prod_kind', option_value: '01', option_label: '01', is_active: true, deactivation_reason: null, created_at: now, updated_at: now },
        { column_name: 'prod_kind', option_value: '02', option_label: '02', is_active: false, deactivation_reason: 'manual', created_at: now, updated_at: now },
      ] as Partial<PooldataFieldOption>[]),
    );
    const res = await env.service.createList(
      baseDto({
        conditionPayload: {
          conditions: [{ columnName: 'prod_kind', fieldType: 'categorical', values: ['01', '02'] }],
          logic: 'AND',
        },
      }) as any,
      ACTOR,
      YM,
    );
    expect(res.listNo).toMatch(/^OB\d{6}\d{3}$/);
    expect(res.warnings).toBeDefined();
    expect(res.warnings!.length).toBe(1);
    expect(res.warnings![0].code).toBe('WHITELIST_OPTION_INACTIVE');
    expect(res.warnings![0].details).toEqual(
      expect.arrayContaining([{ columnName: 'prod_kind', optionValue: '02' }]),
    );
  });

  // -----------------------------------------------------------------
  // CL-008 ~ CL-011 / TS-F050-008~011：5 個 backward-compat 衍生
  // -----------------------------------------------------------------

  it('CL-008 / TS-F050-008：prod_kind ["01","02"] → DB entity.prod_kind = "01$$02"', async () => {
    const res = await env.service.createList(
      baseDto({
        conditionPayload: {
          conditions: [{ columnName: 'prod_kind', fieldType: 'categorical', values: ['01', '02'] }],
          logic: 'AND',
        },
      }) as any,
      ACTOR,
      YM,
    );
    const saved = await env.listRepo.findOne({ where: { list_no: res.listNo } });
    expect(saved!.prod_kind).toBe('01$$02');
  });

  it('CL-009 / TS-F050-009：conditions 不含 case_status → DB entity.case_status = ""', async () => {
    const res = await env.service.createList(
      baseDto({
        conditionPayload: {
          conditions: [{ columnName: 'prod_kind', fieldType: 'categorical', values: ['01'] }],
          logic: 'AND',
        },
      }) as any,
      ACTOR,
      YM,
    );
    const saved = await env.listRepo.findOne({ where: { list_no: res.listNo } });
    expect(saved!.case_status).toBe('');
  });

  it('CL-010 / TS-F050-010：conditions 不含 prod_kind → DB entity.prod_kind = ""', async () => {
    const res = await env.service.createList(
      baseDto({
        conditionPayload: {
          conditions: [{ columnName: 'spec_tp', fieldType: 'categorical', values: ['11'] }],
          logic: 'AND',
        },
      }) as any,
      ACTOR,
      YM,
    );
    const saved = await env.listRepo.findOne({ where: { list_no: res.listNo } });
    expect(saved!.prod_kind).toBe('');
  });

  it('CL-011 / TS-F050-011：conditions 不含 caseyear → DB entity.caseyear IS NULL', async () => {
    const res = await env.service.createList(
      baseDto({
        conditionPayload: {
          conditions: [{ columnName: 'prod_kind', fieldType: 'categorical', values: ['01'] }],
          logic: 'AND',
        },
      }) as any,
      ACTOR,
      YM,
    );
    const saved = await env.listRepo.findOne({ where: { list_no: res.listNo } });
    expect(saved!.caseyear).toBeNull();
  });

  it('CL-012 / TS-F050-012：同 columnName 重複 → 422 VALIDATION_ERROR', async () => {
    try {
      await env.service.createList(
        baseDto({
          conditionPayload: {
            conditions: [
              { columnName: 'prod_kind', fieldType: 'categorical', values: ['01'] },
              { columnName: 'prod_kind', fieldType: 'categorical', values: ['02'] },
            ],
            logic: 'AND',
          },
        }) as any,
        ACTOR,
        YM,
      );
      throw new Error('expected throw');
    } catch (e: any) {
      expect(e).toBeInstanceOf(UnprocessableEntityException);
      expect(e.getResponse().error).toBe(ERROR_CODES.VALIDATION_ERROR);
    }
  });

  // -----------------------------------------------------------------
  // CL-013 ~ CL-016 / TS-F050-013~016：prod_kind 交集唯一性
  // -----------------------------------------------------------------

  it('CL-013 / TS-F050-013：交集衝突 ["02","03"] vs 新["01","02"] → 422 LIST_NO_DUPLICATE', async () => {
    // seed 既有名單 OB202605001 含 condition_payload prod_kind = ["02","03"]
    await env.service.createList(
      baseDto({
        cardType: 'A',
        conditionPayload: {
          conditions: [{ columnName: 'prod_kind', fieldType: 'categorical', values: ['02', '03'] }],
          logic: 'AND',
        },
      }) as any,
      ACTOR,
      YM,
    );

    try {
      await env.service.createList(
        baseDto({
          cardType: 'A',
          conditionPayload: {
            conditions: [{ columnName: 'prod_kind', fieldType: 'categorical', values: ['01', '02'] }],
            logic: 'AND',
          },
        }) as any,
        ACTOR,
        YM,
      );
      throw new Error('expected throw');
    } catch (e: any) {
      expect(e).toBeInstanceOf(UnprocessableEntityException);
      expect(e.getResponse().error).toBe(ERROR_CODES.LIST_NO_DUPLICATE);
      expect(e.getResponse().details.intersectionValues).toEqual(['02']);
      expect(e.getResponse().details.conflictListNo).toBe('OB202605001');
    }
  });

  it('CL-014 / TS-F050-014：無交集 ["01","02"] vs 新["03"] → 201', async () => {
    await env.service.createList(
      baseDto({
        cardType: 'A',
        conditionPayload: {
          conditions: [{ columnName: 'prod_kind', fieldType: 'categorical', values: ['01', '02'] }],
          logic: 'AND',
        },
      }) as any,
      ACTOR,
      YM,
    );
    const res2 = await env.service.createList(
      baseDto({
        cardType: 'A',
        conditionPayload: {
          conditions: [{ columnName: 'prod_kind', fieldType: 'categorical', values: ['03'] }],
          logic: 'AND',
        },
      }) as any,
      ACTOR,
      YM,
    );
    expect(res2.listNo).toBe('OB202605002');
  });

  it('CL-015 / TS-F050-015：新名單未設 prod_kind → 跳過唯一性 → 201', async () => {
    await env.service.createList(
      baseDto({
        cardType: 'A',
        conditionPayload: {
          conditions: [{ columnName: 'prod_kind', fieldType: 'categorical', values: ['01'] }],
          logic: 'AND',
        },
      }) as any,
      ACTOR,
      YM,
    );
    const res2 = await env.service.createList(
      baseDto({
        cardType: 'A',
        conditionPayload: {
          conditions: [{ columnName: 'caseyear', fieldType: 'categorical', values: ['1'] }],
          logic: 'AND',
        },
      }) as any,
      ACTOR,
      YM,
    );
    expect(res2.listNo).toBe('OB202605002');
  });

  it('CL-016 / TS-F050-016：舊名單 condition_payload IS NULL + entity.prod_kind="02"，新建 ["02"] → 422', async () => {
    // 手動插入舊名單（condition_payload=null）
    const now = new Date();
    await env.listRepo.save(
      env.listRepo.create({
        list_no: 'OB202605001',
        list_nm: 'Legacy',
        prod_kind: '02',
        prod_best: '',
        spec_tp: null,
        list_type: '01',
        list_period_start: '1',
        list_period_end: '6',
        list_interval: '1',
        project_workym: YM,
        caseyear: null,
        settle_src: null,
        card_type: 'A',
        status: 'active',
        stage: 'draft',
        case_status: null,
        cr_enabled: false,
        condition_payload: null,
        created_by_prog: 'seed',
        created_by: 'seed',
        created_at: now,
        updated_by_prog: 'seed',
        updated_by: 'seed',
        updated_at: now,
      } as Partial<ObListDefinition>),
    );

    try {
      await env.service.createList(
        baseDto({
          cardType: 'A',
          conditionPayload: {
            conditions: [{ columnName: 'prod_kind', fieldType: 'categorical', values: ['02'] }],
            logic: 'AND',
          },
        }) as any,
        ACTOR,
        YM,
      );
      throw new Error('expected throw');
    } catch (e: any) {
      expect(e).toBeInstanceOf(UnprocessableEntityException);
      expect(e.getResponse().error).toBe(ERROR_CODES.LIST_NO_DUPLICATE);
    }
  });

  // -----------------------------------------------------------------
  // CL-017 / CL-018：copyFromListNo（前端 copy 模式）
  // -----------------------------------------------------------------

  it('CL-017 / TS-F050-017：copyFromListNo 來源 condition_payload != null → 201', async () => {
    const src = await env.service.createList(
      baseDto({
        cardType: 'A',
        conditionPayload: {
          conditions: [{ columnName: 'prod_kind', fieldType: 'categorical', values: ['01'] }],
          logic: 'AND',
        },
      }) as any,
      ACTOR,
      YM,
    );
    const res = await env.service.createList(
      baseDto({
        listNm: '複製名單',
        cardType: 'B',
        copyFromListNo: src.listNo,
        conditionPayload: {
          conditions: [{ columnName: 'prod_kind', fieldType: 'categorical', values: ['01'] }],
          logic: 'AND',
        },
      }) as any,
      ACTOR,
      YM,
    );
    expect(res.listNo).not.toBe(src.listNo);
    // 新名單 condition_payload = 前端送入的 payload
    const saved = await env.listRepo.findOne({ where: { list_no: res.listNo } });
    expect(saved!.condition_payload).toEqual({
      conditions: [{ columnName: 'prod_kind', fieldType: 'categorical', values: ['01'] }],
      logic: 'AND',
    });
  });

  it('CL-018 / TS-F050-018：copyFromListNo 來源 condition_payload IS NULL → 422 LEGACY_LIST_NOT_COPYABLE', async () => {
    // 手動 insert 舊名單
    const now = new Date();
    await env.listRepo.save(
      env.listRepo.create({
        list_no: 'OB202504001',
        list_nm: 'Old',
        prod_kind: '01',
        prod_best: '',
        spec_tp: null,
        list_type: '01',
        list_period_start: '1',
        list_period_end: '6',
        list_interval: '1',
        project_workym: '202504',
        caseyear: null,
        settle_src: null,
        card_type: null,
        status: 'active',
        stage: 'draft',
        case_status: null,
        cr_enabled: false,
        condition_payload: null,
        created_by_prog: 'seed',
        created_by: 'seed',
        created_at: now,
        updated_by_prog: 'seed',
        updated_by: 'seed',
        updated_at: now,
      } as Partial<ObListDefinition>),
    );

    try {
      await env.service.createList(
        baseDto({ copyFromListNo: 'OB202504001' }) as any,
        ACTOR,
        YM,
      );
      throw new Error('expected throw');
    } catch (e: any) {
      expect(e).toBeInstanceOf(UnprocessableEntityException);
      expect(e.getResponse().error).toBe(ERROR_CODES.LEGACY_LIST_NOT_COPYABLE);
      expect(e.getResponse().details.copyFromListNo).toBe('OB202504001');
    }
  });

  // -----------------------------------------------------------------
  // CL-019 / TS-F050-020：月跑執行中 → 409
  // -----------------------------------------------------------------

  it('CL-019 / TS-F050-020：月跑 running → 409 ASSIGNMENT_RUN_ALREADY_RUNNING', async () => {
    const now = new Date();
    await env.runRepo.save(
      env.runRepo.create({
        run_id: 'RUN-1',
        project_workym: YM,
        triggered_by: 'dir-001',
        status: 'running',
        created_at: now,
      } as Partial<AssignmentRun>),
    );
    try {
      await env.service.createList(baseDto() as any, ACTOR, YM);
      throw new Error('expected throw');
    } catch (e: any) {
      expect(e).toBeInstanceOf(ConflictException);
      expect(e.getResponse().error).toBe(ERROR_CODES.ASSIGNMENT_RUN_ALREADY_RUNNING);
    }
  });

  // -----------------------------------------------------------------
  // CL-020 / TS-F050-021：999 上限
  // -----------------------------------------------------------------

  it('CL-020 / TS-F050-021：月內 999 → 422 LIST_NO_LIMIT_EXCEEDED', async () => {
    const now = new Date();
    await env.listRepo.save(
      env.listRepo.create({
        list_no: 'OB202605999',
        list_nm: 'last',
        prod_kind: 'ZZ',
        prod_best: '',
        spec_tp: null,
        list_type: '01',
        list_period_start: '1',
        list_period_end: '1',
        list_interval: '1',
        project_workym: YM,
        caseyear: null,
        settle_src: null,
        card_type: '99',
        status: 'active',
        stage: 'draft',
        case_status: null,
        cr_enabled: false,
        condition_payload: null,
        created_by_prog: 'seed',
        created_by: 'seed',
        created_at: now,
        updated_by_prog: 'seed',
        updated_by: 'seed',
        updated_at: now,
      } as Partial<ObListDefinition>),
    );

    try {
      await env.service.createList(baseDto() as any, ACTOR, YM);
      throw new Error('expected throw');
    } catch (e: any) {
      expect(e).toBeInstanceOf(UnprocessableEntityException);
      expect(e.getResponse().error).toBe(ERROR_CODES.LIST_NO_LIMIT_EXCEEDED);
    }
  });

  // -----------------------------------------------------------------
  // CL-021 / TS-F050-022：listNo 格式
  // -----------------------------------------------------------------

  it('CL-021 / TS-F050-022：listNo 格式 OB{YYYYMM}{NNN}', async () => {
    const res = await env.service.createList(baseDto() as any, ACTOR, YM);
    expect(res.listNo).toMatch(/^OB\d{6}\d{3}$/);
    expect(res.listNo).toContain(YM);
  });

  // -----------------------------------------------------------------
  // CL-022 / TS-F050-023：audit log CREATE
  // -----------------------------------------------------------------

  it('CL-022 / TS-F050-023：audit log entity_type / action / entity_id 正確', async () => {
    const res = await env.service.createList(baseDto() as any, ACTOR, YM);
    const logs = await env.auditRepo.find();
    expect(logs.length).toBeGreaterThanOrEqual(1);
    const last = logs[logs.length - 1];
    expect(last.entity_type).toBe('ob_list_definition');
    expect(last.action).toBe('CREATE');
    expect(last.entity_id).toBe(res.listNo);
  });

  // -----------------------------------------------------------------
  // CL-023 / TS-F050-024：月跑優先於 stage（service 層只測 assertNoRunningRun 第一）
  // -----------------------------------------------------------------

  it('CL-023 / TS-F050-024：月跑 running + 無效 conditions → 409 優先', async () => {
    const now = new Date();
    await env.runRepo.save(
      env.runRepo.create({
        run_id: 'RUN-2',
        project_workym: YM,
        triggered_by: 'dir-001',
        status: 'running',
        created_at: now,
      } as Partial<AssignmentRun>),
    );
    try {
      await env.service.createList(
        baseDto({
          conditionPayload: {
            conditions: [{ columnName: 'invalid_field', fieldType: 'categorical', values: ['x'] }],
            logic: 'AND',
          },
        }) as any,
        ACTOR,
        YM,
      );
      throw new Error('expected throw');
    } catch (e: any) {
      expect(e).toBeInstanceOf(ConflictException);
      expect(e.getResponse().error).toBe(ERROR_CODES.ASSIGNMENT_RUN_ALREADY_RUNNING);
    }
  });

  // -----------------------------------------------------------------
  // CL-024 / TS-F050-029：mixed conditions DB 寫入
  // -----------------------------------------------------------------

  it('CL-024 / TS-F050-029：mixed conditions categorical + numeric → DB condition_payload 含 2 個 condition', async () => {
    const res = await env.service.createList(
      baseDto({
        conditionPayload: {
          conditions: [
            { columnName: 'prod_kind', fieldType: 'categorical', values: ['01'] },
            { columnName: 'month_cnt', fieldType: 'numeric', min: 1, max: 6 },
          ],
          logic: 'AND',
        },
      }) as any,
      ACTOR,
      YM,
    );
    const saved = await env.listRepo.findOne({ where: { list_no: res.listNo } });
    expect(saved!.condition_payload!.conditions).toHaveLength(2);
    const monthCnt = saved!.condition_payload!.conditions.find((c) => c.columnName === 'month_cnt')!;
    expect(monthCnt.fieldType).toBe('numeric');
    expect(monthCnt.min).toBe(1);
    expect(monthCnt.max).toBe(6);
  });

  // -----------------------------------------------------------------
  // CL-025 / TS-F050-030：date condition DB 寫入
  // -----------------------------------------------------------------

  it('CL-025 / TS-F050-030：date condition birth_date → DB condition_payload 含 dateStart / dateEnd', async () => {
    const res = await env.service.createList(
      baseDto({
        conditionPayload: {
          conditions: [
            { columnName: 'birth_date', fieldType: 'date', dateStart: '2000-01-01', dateEnd: '2005-12-31' },
          ],
          logic: 'AND',
        },
      }) as any,
      ACTOR,
      YM,
    );
    const saved = await env.listRepo.findOne({ where: { list_no: res.listNo } });
    const birth = saved!.condition_payload!.conditions.find((c) => c.columnName === 'birth_date')!;
    expect(birth.dateStart).toBe('2000-01-01');
    expect(birth.dateEnd).toBe('2005-12-31');
  });
});
