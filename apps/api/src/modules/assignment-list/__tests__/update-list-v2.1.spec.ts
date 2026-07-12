/**
 * F051 v2.1 updateList integration spec — Phase 5a 波 7（14 個 case）
 *
 * 對應 test spec：TS-F051-001 ~ 014（後端範圍；FE TS-F051-015~019 在 5d）
 *
 * 對應 AD：
 *   - AD-E07-18 §18.4 service 寫入流程（含 updateList 4-state semantics）
 *   - §18.6 衍生規則
 *   - §18.8 完整條件集相等唯一性（v2.2；excludeListNo）
 *   - K1（stage guard）/ K3（rollback 後可寫）
 */

import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
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
import { AssignmentApproval } from '@/database/entities/assignment-approval.entity';
import { User } from '@/database/entities/user.entity';
import { ObPoolData } from '@/database/entities/ob-pool-data.entity';
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
          PooldataFieldWhitelist, ObDeptPct, ObEmplSet, ObEmphire, AssignmentApproval, User, ObPoolData,
        ],
        synchronize: true,
      }),
      TypeOrmModule.forFeature([
        ObListDefinition,
        AssignmentAuditLog,
        AssignmentRun,
        PooldataFieldOption,
        PooldataFieldWhitelist, ObDeptPct, ObEmplSet, ObEmphire, AssignmentApproval, User, ObPoolData,
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

function baseUpdateDto(overrides: Partial<any> = {}) {
  return {
    listNm: '更新名單',
    listPeriodStart: 1,
    listPeriodEnd: 6,
    listInterval: 1,
    cardType: 'A',
    prodBest: null,
    crEnabled: false,
    conditionPayload: {
      conditions: [
        { columnName: 'prod_kind', fieldType: 'categorical', values: ['01'] },
      ],
      logic: 'AND',
    },
    ...overrides,
  };
}

async function seedWhitelist(repo: Repository<PooldataFieldWhitelist>) {
  const now = new Date();
  const rows = [
    { column_name: 'prod_kind', field_type: 'categorical' as const, is_active: true },
    { column_name: 'caseyear', field_type: 'categorical' as const, is_active: true },
    { column_name: 'spec_tp', field_type: 'categorical' as const, is_active: true },
    { column_name: 'case_status', field_type: 'categorical' as const, is_active: true },
    { column_name: 'settle_src', field_type: 'categorical' as const, is_active: true },
    { column_name: 'month_cnt', field_type: 'numeric' as const, is_active: true },
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

async function seedList(
  repo: Repository<ObListDefinition>,
  overrides: Partial<ObListDefinition> = {},
): Promise<string> {
  const now = new Date();
  const entity = repo.create({
    list_no: 'OB202605001',
    list_nm: 'Initial',
    prod_kind: '01',
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
    condition_payload: {
      conditions: [{ columnName: 'prod_kind', fieldType: 'categorical', values: ['01'] }],
      logic: 'AND',
    },
    created_by_prog: 'seed',
    created_by: 'seed',
    created_at: now,
    updated_by_prog: 'seed',
    updated_by: 'seed',
    updated_at: now,
    ...overrides,
  } as Partial<ObListDefinition>);
  const saved = await repo.save(entity);
  return saved.list_no;
}

describe('F051 v2.1 updateList integration (Phase 5a 波7)', () => {
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
    await seedWhitelist(env.whitelistRepo);
  });

  // -----------------------------------------------------------------
  // UL-001 / TS-F051-001
  // -----------------------------------------------------------------
  it('UL-001 / TS-F051-001：conditions = [] → 422', async () => {
    const listNo = await seedList(env.listRepo);
    try {
      await env.service.updateList(
        listNo,
        baseUpdateDto({ conditionPayload: { conditions: [], logic: 'AND' } }) as any,
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
  // UL-002 / TS-F051-002
  // -----------------------------------------------------------------
  it('UL-002 / TS-F051-002：columnName 不在 whitelist 或 inactive → 422 CONDITION_COLUMN_NOT_IN_WHITELIST', async () => {
    const listNo = await seedList(env.listRepo);
    await env.whitelistRepo.update({ column_name: 'settle_src' }, { is_active: false });
    try {
      await env.service.updateList(
        listNo,
        baseUpdateDto({
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
      expect(e.getResponse().error).toBe(ERROR_CODES.CONDITION_COLUMN_NOT_IN_WHITELIST);
    }
  });

  // -----------------------------------------------------------------
  // UL-003 / TS-F051-003
  // -----------------------------------------------------------------
  it('UL-003 / TS-F051-003：list_period_start in conditions → 400 RESERVED_FIELD_IN_CONDITIONS', async () => {
    const listNo = await seedList(env.listRepo);
    try {
      await env.service.updateList(
        listNo,
        baseUpdateDto({
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

  // -----------------------------------------------------------------
  // UL-004 / TS-F051-004
  // -----------------------------------------------------------------
  it('UL-004 / TS-F051-004：含 inactive option → 200 + warnings', async () => {
    const listNo = await seedList(env.listRepo);
    const now = new Date();
    await env.optionRepo.save(
      env.optionRepo.create([
        { column_name: 'prod_kind', option_value: '01', option_label: '01', is_active: true, deactivation_reason: null, created_at: now, updated_at: now },
        { column_name: 'prod_kind', option_value: '02', option_label: '02', is_active: false, deactivation_reason: 'manual', created_at: now, updated_at: now },
      ] as Partial<PooldataFieldOption>[]),
    );
    const res = await env.service.updateList(
      listNo,
      baseUpdateDto({
        conditionPayload: {
          conditions: [{ columnName: 'prod_kind', fieldType: 'categorical', values: ['01', '02'] }],
          logic: 'AND',
        },
      }) as any,
      ACTOR,
      YM,
    );
    expect(res.warnings!.length).toBe(1);
    expect(res.warnings![0].code).toBe('WHITELIST_OPTION_INACTIVE');
  });

  // -----------------------------------------------------------------
  // UL-005 / TS-F051-005
  // -----------------------------------------------------------------
  it('UL-005 / TS-F051-005：舊名單（condition_payload=null）+ dto.conditionPayload → 422 LEGACY_LIST_CONDITION_READONLY', async () => {
    const listNo = await seedList(env.listRepo, {
      list_no: 'OB202504001',
      project_workym: '202504', // 注意：currentWorkYm=202605，會先觸發 LIST_HISTORICAL_READONLY；本 case 不傳 currentWorkYm
      condition_payload: null,
      prod_kind: '01',
    });
    try {
      // 不傳 currentWorkYm，跳過 assertNotHistorical 檢查
      await env.service.updateList(
        listNo,
        baseUpdateDto() as any,
        ACTOR,
      );
      throw new Error('expected throw');
    } catch (e: any) {
      expect(e).toBeInstanceOf(UnprocessableEntityException);
      expect(e.getResponse().error).toBe(ERROR_CODES.LEGACY_LIST_CONDITION_READONLY);
    }
  });

  // -----------------------------------------------------------------
  // UL-006 / TS-F051-006
  // -----------------------------------------------------------------
  it('UL-006 / TS-F051-006：舊名單 + 不送 conditionPayload + 只改 listNm → 200，DB 反映', async () => {
    const listNo = await seedList(env.listRepo, {
      list_no: 'OB202504001',
      project_workym: '202504',
      condition_payload: null,
      prod_kind: '01',
    });
    const res = await env.service.updateList(
      listNo,
      baseUpdateDto({ listNm: '修改後名稱', conditionPayload: undefined }) as any,
      ACTOR,
    );
    expect(res.listNm).toBe('修改後名稱');
    const saved = await env.listRepo.findOne({ where: { list_no: listNo } });
    expect(saved!.list_nm).toBe('修改後名稱');
    expect(saved!.condition_payload).toBeNull();
  });

  // -----------------------------------------------------------------
  // UL-007 / TS-F051-007
  // -----------------------------------------------------------------
  it('UL-007 / TS-F051-007：stage=dept_ratio + dto.conditionPayload → 422 LIST_STAGE_TRANSITION_FORBIDDEN', async () => {
    const listNo = await seedList(env.listRepo, {
      list_no: 'OB202605002',
      stage: 'dept_ratio',
    });
    try {
      await env.service.updateList(listNo, baseUpdateDto() as any, ACTOR, YM);
      throw new Error('expected throw');
    } catch (e: any) {
      expect(e).toBeInstanceOf(UnprocessableEntityException);
      expect(e.getResponse().error).toBe(ERROR_CODES.LIST_STAGE_TRANSITION_FORBIDDEN);
    }
  });

  // -----------------------------------------------------------------
  // UL-008 / TS-F051-008
  // -----------------------------------------------------------------
  it('UL-008 / TS-F051-008：stage=ready + dto.conditionPayload → 422 LIST_STAGE_TRANSITION_FORBIDDEN', async () => {
    const listNo = await seedList(env.listRepo, {
      list_no: 'OB202605003',
      stage: 'ready',
    });
    try {
      await env.service.updateList(listNo, baseUpdateDto() as any, ACTOR, YM);
      throw new Error('expected throw');
    } catch (e: any) {
      expect(e.getResponse().error).toBe(ERROR_CODES.LIST_STAGE_TRANSITION_FORBIDDEN);
    }
  });

  // -----------------------------------------------------------------
  // UL-009 / TS-F051-009
  // -----------------------------------------------------------------
  it('UL-009 / TS-F051-009：Rollback 後 stage=draft + dto.conditionPayload → 200 K3', async () => {
    const listNo = await seedList(env.listRepo, {
      list_no: 'OB202605004',
      stage: 'draft',
    });
    const res = await env.service.updateList(listNo, baseUpdateDto() as any, ACTOR, YM);
    expect(res.stage).toBe('draft');
  });

  // -----------------------------------------------------------------
  // UL-010 / TS-F051-010
  // -----------------------------------------------------------------
  it('UL-010 / TS-F051-010：月名單分派 running + stage=draft → 409 優先', async () => {
    const listNo = await seedList(env.listRepo, { list_no: 'OB202605005' });
    const now = new Date();
    await env.runRepo.save(
      env.runRepo.create({
        run_id: 'RUN-3',
        project_workym: YM,
        triggered_by: 'dir',
        status: 'running',
        created_at: now,
      } as Partial<AssignmentRun>),
    );
    try {
      await env.service.updateList(listNo, baseUpdateDto() as any, ACTOR, YM);
      throw new Error('expected throw');
    } catch (e: any) {
      expect(e).toBeInstanceOf(ConflictException);
      expect(e.getResponse().error).toBe(ERROR_CODES.ASSIGNMENT_RUN_ALREADY_RUNNING);
    }
  });

  // -----------------------------------------------------------------
  // UL-011 / TS-F051-011
  // -----------------------------------------------------------------
  it('UL-011 / TS-F051-011：status=inactive → 422 ASSIGNMENT_LIST_INACTIVE', async () => {
    const listNo = await seedList(env.listRepo, {
      list_no: 'OB202605006',
      status: 'inactive',
    });
    try {
      await env.service.updateList(listNo, baseUpdateDto() as any, ACTOR, YM);
      throw new Error('expected throw');
    } catch (e: any) {
      expect(e.getResponse().error).toBe(ERROR_CODES.ASSIGNMENT_LIST_INACTIVE);
    }
  });

  // -----------------------------------------------------------------
  // UL-012 / TS-F051-012
  // -----------------------------------------------------------------
  it('UL-012 / TS-F051-012：覆寫 spec_tp ["11","12","13"] → DB entity.spec_tp = "11$$12$$13"', async () => {
    const listNo = await seedList(env.listRepo, {
      list_no: 'OB202605007',
      spec_tp: '02$$04',
    });
    await env.service.updateList(
      listNo,
      baseUpdateDto({
        conditionPayload: {
          conditions: [{ columnName: 'spec_tp', fieldType: 'categorical', values: ['11', '12', '13'] }],
          logic: 'AND',
        },
      }) as any,
      ACTOR,
      YM,
    );
    const saved = await env.listRepo.findOne({ where: { list_no: listNo } });
    expect(saved!.spec_tp).toBe('11$$12$$13');
    // prod_kind 應衍生為 ''（新 payload 無 prod_kind condition）
    expect(saved!.prod_kind).toBe('');
  });

  // -----------------------------------------------------------------
  // UL-013 / TS-F051-013
  // -----------------------------------------------------------------
  it('UL-013 / TS-F051-013：完整條件集相同 + excludeListNo 自身 → 422 LIST_NO_DUPLICATE', async () => {
    // OB202605008（draft, cardType=A）
    await seedList(env.listRepo, {
      list_no: 'OB202605008',
      stage: 'draft',
      card_type: 'A',
      prod_kind: '01',
      condition_payload: {
        conditions: [{ columnName: 'prod_kind', fieldType: 'categorical', values: ['01'] }],
        logic: 'AND',
      },
    });
    // OB202605009（active, cardType=A, prod_kind=02）
    await seedList(env.listRepo, {
      list_no: 'OB202605009',
      stage: 'draft',
      card_type: 'A',
      prod_kind: '02',
      condition_payload: {
        conditions: [{ columnName: 'prod_kind', fieldType: 'categorical', values: ['02'] }],
        logic: 'AND',
      },
    });

    try {
      await env.service.updateList(
        'OB202605008',
        baseUpdateDto({
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
      expect(e.getResponse().error).toBe(ERROR_CODES.LIST_NO_DUPLICATE);
      // 排除自身 OB202605008，衝突應為 OB202605009
      expect(e.getResponse().details.conflictListNo).toBe('OB202605009');
    }
  });

  // -----------------------------------------------------------------
  // UL-014 / TS-F051-014
  // -----------------------------------------------------------------
  it('UL-014 / TS-F051-014：audit log UPDATE 含 before/after condition_payload', async () => {
    const beforePayload = {
      conditions: [{ columnName: 'prod_kind', fieldType: 'categorical' as const, values: ['01'] }],
      logic: 'AND' as const,
    };
    const listNo = await seedList(env.listRepo, {
      list_no: 'OB202605010',
      condition_payload: beforePayload,
    });
    const newPayload = {
      conditions: [{ columnName: 'spec_tp', fieldType: 'categorical', values: ['11', '12'] }],
      logic: 'AND',
    };
    await env.service.updateList(
      listNo,
      baseUpdateDto({ conditionPayload: newPayload }) as any,
      ACTOR,
      YM,
    );

    const logs = await env.auditRepo.find();
    expect(logs.length).toBeGreaterThanOrEqual(1);
    const last = logs[logs.length - 1];
    expect(last.entity_type).toBe('ob_list_definition');
    expect(last.action).toBe('UPDATE');
    expect(last.entity_id).toBe(listNo);
    // before_value：直接 seedList 插入之原始 payload（未經 service stamp）→ 無 dataSource
    expect((last.before_value as any).condition_payload).toEqual(beforePayload);
    // after_value：經 updateList 之 stampConditionDataSource 固化 dataSource（F109 / AD-E07-37 §6；spec_tp→ob_pool_data）
    expect((last.after_value as any).condition_payload).toEqual({
      conditions: [
        { columnName: 'spec_tp', fieldType: 'categorical', values: ['11', '12'], dataSource: 'ob_pool_data' },
      ],
      logic: 'AND',
    });
  });

  // ==================================================================
  // N 群組（US-144）：injectSystemFixedConditions (updateList)
  // 對應 F050-test.md §十六 N 群組 TS-F050-N01~N04 / F051-test.md TS-F051-020~025
  // ==================================================================
  describe('v2.3 / v2.3.1 — injectSystemFixedConditions (updateList)', () => {
    beforeEach(async () => {
      const now = new Date();
      await env.whitelistRepo.save(
        env.whitelistRepo.create({
          column_name: 'best_case',
          display_name: '優質案件',
          field_type: 'categorical',
          is_active: true,
          isSystemFixed: true,
          created_at: now,
          updated_at: now,
        } as Partial<PooldataFieldWhitelist>),
      );
    });

    function findBest(payload: any) {
      return payload?.conditions?.find((c: any) => c.columnName === 'best_case');
    }

    it('TS-F050-N01：payload 不含 best_case → DB 更新後含 best_case:[Y]，prod_kind 保留', async () => {
      const listNo = await seedList(env.listRepo);
      await env.service.updateList(
        listNo,
        baseUpdateDto({
          conditionPayload: {
            conditions: [{ columnName: 'prod_kind', fieldType: 'categorical', values: ['02'] }],
            logic: 'AND',
          },
        }) as any,
        ACTOR,
        YM,
      );
      const saved = await env.listRepo.findOne({ where: { list_no: listNo } });
      expect(findBest(saved!.condition_payload).values).toEqual(['Y']);
      expect(
        saved!.condition_payload!.conditions.find((c) => c.columnName === 'prod_kind'),
      ).toBeDefined();
    });

    it('TS-F050-N02 / TS-F051-021：payload 含 best_case:[N]（竄改）→ 靜默正規化為 [Y]，不拋例外', async () => {
      const listNo = await seedList(env.listRepo);
      await env.service.updateList(
        listNo,
        baseUpdateDto({
          conditionPayload: {
            conditions: [
              { columnName: 'prod_kind', fieldType: 'categorical', values: ['02'] },
              { columnName: 'best_case', fieldType: 'categorical', values: ['N'] },
            ],
            logic: 'AND',
          },
        }) as any,
        ACTOR,
        YM,
      );
      const saved = await env.listRepo.findOne({ where: { list_no: listNo } });
      expect(findBest(saved!.condition_payload).values).toEqual(['Y']);
    });

    it('TS-F050-N03 / TS-F051-024：condition_payload IS NULL 舊名單 + 不帶 conditionPayload → 不注入', async () => {
      const listNo = await seedList(env.listRepo, {
        list_no: 'OB202605050',
        condition_payload: null,
        prod_kind: '01',
      });
      // 只改 listNm，不帶 conditionPayload
      await env.service.updateList(
        listNo,
        {
          listNm: '修改後名稱',
          listPeriodStart: 1,
          listPeriodEnd: 6,
          listInterval: 1,
          cardType: 'A',
          crEnabled: false,
        } as any,
        ACTOR,
        YM,
      );
      const saved = await env.listRepo.findOne({ where: { list_no: listNo } });
      expect(saved!.condition_payload).toBeNull();
      expect(saved!.list_nm).toBe('修改後名稱');
    });

    it('TS-F050-N04：stage=dept_ratio 名單帶 conditionPayload → 422 LIST_STAGE_TRANSITION_FORBIDDEN（guard 先於注入）', async () => {
      const listNo = await seedList(env.listRepo, {
        list_no: 'OB202605051',
        stage: 'dept_ratio',
      });
      try {
        await env.service.updateList(
          listNo,
          baseUpdateDto({
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
        expect(e.getResponse().error).toBe(ERROR_CODES.LIST_STAGE_TRANSITION_FORBIDDEN);
      }
    });

    it('TS-F051-022：updateList min-count — 僅含 best_case → 422 VALIDATION_ERROR', async () => {
      const listNo = await seedList(env.listRepo);
      try {
        await env.service.updateList(
          listNo,
          baseUpdateDto({
            conditionPayload: {
              conditions: [{ columnName: 'best_case', fieldType: 'categorical', values: ['Y'] }],
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

    it('TS-F051-023：updateList min-count — 1 個非系統固定 + best_case → 通過（200）', async () => {
      const listNo = await seedList(env.listRepo);
      const res = await env.service.updateList(
        listNo,
        baseUpdateDto({
          conditionPayload: {
            conditions: [
              { columnName: 'prod_kind', fieldType: 'categorical', values: ['02'] },
              { columnName: 'best_case', fieldType: 'categorical', values: ['Y'] },
            ],
            logic: 'AND',
          },
        }) as any,
        ACTOR,
        YM,
      );
      expect(res.listNo).toBe(listNo);
      const saved = await env.listRepo.findOne({ where: { list_no: listNo } });
      expect(findBest(saved!.condition_payload).values).toEqual(['Y']);
    });

    it('TS-F051-025：舊名單（condition_payload IS NULL）+ 帶 conditionPayload → 422 LEGACY_LIST_CONDITION_READONLY（注入不執行）', async () => {
      const listNo = await seedList(env.listRepo, {
        list_no: 'OB202605052',
        condition_payload: null,
        prod_kind: '01',
      });
      try {
        await env.service.updateList(
          listNo,
          baseUpdateDto({
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
        expect(e.getResponse().error).toBe(ERROR_CODES.LEGACY_LIST_CONDITION_READONLY);
      }
    });
  });
});
