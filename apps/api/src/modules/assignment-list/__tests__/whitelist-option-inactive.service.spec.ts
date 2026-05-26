/**
 * F050 v2.0 / F051 v2.0 + F076 v1.3 BR-7 + error-handling.md v1.14 —
 *   WHITELIST_OPTION_INACTIVE warning banner（不阻擋寫入，僅警告）
 *
 * TC：
 *   - TC-WHITELIST-WARNING-001：create 名單 conditionPayload 引用 inactive option → response.warnings 補 WHITELIST_OPTION_INACTIVE
 *   - TC-WHITELIST-WARNING-002：create 名單 conditionPayload 全部 active → response.warnings 為空陣列
 *   - TC-WHITELIST-WARNING-003：update 名單 conditionPayload 引用 inactive option → response.warnings 補 WHITELIST_OPTION_INACTIVE
 *   - TC-WHITELIST-WARNING-004：警告含 details 列出所有 inactive (columnName, optionValue) 對
 *   - TC-WHITELIST-WARNING-005：無 conditionPayload → response.warnings 為空陣列（不影響既有行為）
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AssignmentListService } from '../assignment-list.service';
import { ObListDefinition } from '@/database/entities/ob-list-definition.entity';
import { AssignmentAuditLog } from '@/database/entities/assignment-audit-log.entity';
import { PooldataFieldOption } from '@/database/entities/pooldata-field-option.entity';
import { PooldataFieldWhitelist } from '@/database/entities/pooldata-field-whitelist.entity';
import { AssignmentRunGuardService } from '@/modules/assignment/services/assignment-run-guard.service';
import { ERROR_CODES } from '@/common/errors/error-codes';
import type { CreateListDto } from '../dto/create-list.dto';
import type { UpdateListDto } from '../dto/update-list.dto';
import { SectionChiefScopeService } from '@/modules/assignment/services/section-chief-scope.service';
import { ObDeptPct } from '@/database/entities/ob-dept-pct.entity';
import { ObEmplSet } from '@/database/entities/ob-empl-set.entity';
import { ObEmphire } from '@/database/entities/ob-emphire.entity';
import { AssignmentApproval } from '@/database/entities/assignment-approval.entity';
import { User } from '@/database/entities/user.entity';

const YM = '202605';

interface Env {
  service: AssignmentListService;
  listRepo: Repository<ObListDefinition>;
  optionRepo: Repository<PooldataFieldOption>;
  whitelistRepo: Repository<PooldataFieldWhitelist>;
  app: TestingModule;
}

async function buildModule(): Promise<Env> {
  const app: TestingModule = await Test.createTestingModule({
    imports: [
      TypeOrmModule.forRoot({
        type: 'better-sqlite3',
        database: ':memory:',
        entities: [
          ObListDefinition,
          AssignmentAuditLog,
          PooldataFieldOption,
          PooldataFieldWhitelist,
          ObDeptPct,
          ObEmplSet,
          ObEmphire,
          AssignmentApproval,
          User,
        ],
        synchronize: true,
      }),
      TypeOrmModule.forFeature([
        ObListDefinition,
        AssignmentAuditLog,
        PooldataFieldOption,
        PooldataFieldWhitelist,
        ObDeptPct,
        ObEmplSet,
        ObEmphire,
          AssignmentApproval,
        User,
      ]),
    ],
    providers: [
      AssignmentListService,
      {
        provide: AssignmentRunGuardService,
        useValue: { assertNoRunningRun: vi.fn().mockResolvedValue(undefined) },
      },
      {
        provide: SectionChiefScopeService,
        useValue: { getScopeDeptCode: () => Promise.resolve(null) },
      },
    ],
  }).compile();
  await app.init();
  return {
    service: app.get(AssignmentListService),
    listRepo: app.get(getRepositoryToken(ObListDefinition)),
    optionRepo: app.get(getRepositoryToken(PooldataFieldOption)),
    whitelistRepo: app.get(getRepositoryToken(PooldataFieldWhitelist)),
    app,
  };
}

function makeCreateDto(overrides: Partial<CreateListDto> = {}): CreateListDto {
  // v2.1 migrate：移除 prodKind/caseYear/specTp/caseStatus/settleSrc；conditionPayload 必填
  return {
    listNm: '測試名單',
    listPeriodStart: 1,
    listPeriodEnd: 12,
    listInterval: 1,
    cardType: 'M5',
    prodBest: null,
    crEnabled: false,
    conditionPayload: {
      conditions: [
        { columnName: 'prod_kind', fieldType: 'categorical', values: ['01'] },
      ],
      logic: 'AND',
    },
    ...overrides,
  } as unknown as CreateListDto;
}

function makeUpdateDto(overrides: Partial<UpdateListDto> = {}): UpdateListDto {
  return {
    listNm: '測試名單（修改）',
    listPeriodStart: 1,
    listPeriodEnd: 12,
    listInterval: 1,
    cardType: 'M5',
    prodBest: null,
    crEnabled: false,
    conditionPayload: {
      conditions: [
        { columnName: 'prod_kind', fieldType: 'categorical', values: ['01'] },
      ],
      logic: 'AND',
    },
    ...overrides,
  } as unknown as UpdateListDto;
}

describe('AssignmentListService — WHITELIST_OPTION_INACTIVE warnings (F050/F051 v2.0 + F076 v1.3)', () => {
  let env: Env;

  beforeAll(async () => {
    env = await buildModule();
  });
  afterAll(async () => {
    await env.app.close();
  });
  beforeEach(async () => {
    await env.listRepo.createQueryBuilder().delete().execute();
    await env.optionRepo.createQueryBuilder().delete().execute();
    await env.whitelistRepo.clear();
    const now = new Date();
    // v2.1 migrate：seed whitelist 給 validateConditionPayload 用
    await env.whitelistRepo.save([
      env.whitelistRepo.create({
        column_name: 'prod_kind',
        display_name: 'prod_kind',
        field_type: 'categorical',
        is_active: true,
        created_at: now,
        updated_at: now,
      }),
      env.whitelistRepo.create({
        column_name: 'settle_src',
        display_name: 'settle_src',
        field_type: 'categorical',
        is_active: true,
        created_at: now,
        updated_at: now,
      }),
    ]);
    // seed：prod_kind 01 active；02 inactive；settle_src Y active；N inactive
    //   v1.4.3 case 對齊：pooldata_field_option.column_name 改小寫對齊 ob_pool_data snake_case
    await env.optionRepo.save([
      env.optionRepo.create({
        column_name: 'prod_kind',
        option_value: '01',
        option_label: '汽車新車',
        is_active: true,
        deactivation_reason: null,
        created_at: now,
        updated_at: now,
      }),
      env.optionRepo.create({
        column_name: 'prod_kind',
        option_value: '02',
        option_label: '機車',
        is_active: false,
        deactivation_reason: 'manual',
        created_at: now,
        updated_at: now,
      }),
      env.optionRepo.create({
        column_name: 'settle_src',
        option_value: 'Y',
        option_label: '含他行代償',
        is_active: true,
        deactivation_reason: null,
        created_at: now,
        updated_at: now,
      }),
      env.optionRepo.create({
        column_name: 'settle_src',
        option_value: 'N',
        option_label: '不含他行代償',
        is_active: false,
        deactivation_reason: 'manual',
        created_at: now,
        updated_at: now,
      }),
    ]);
  });

  it('TC-WHITELIST-WARNING-001：create 名單 conditionPayload 含 inactive option → warnings 補 WHITELIST_OPTION_INACTIVE', async () => {
    const dto = makeCreateDto({
      conditionPayload: {
        conditions: [
          { columnName: 'prod_kind', fieldType: 'categorical', values: ['02'] }, // inactive
        ],
        logic: 'AND',
      },
    } as any);
    const res = await env.service.createList(dto, { userId: 'u1', ipAddress: null }, YM);
    expect(res.warnings).toBeDefined();
    expect(res.warnings).toHaveLength(1);
    expect(res.warnings![0].code).toBe(ERROR_CODES.WHITELIST_OPTION_INACTIVE);
    expect(res.warnings![0].details).toContainEqual({
      columnName: 'prod_kind',
      optionValue: '02',
    });
  });

  it('TC-WHITELIST-WARNING-002：create 名單 conditionPayload 全部 active → warnings 空陣列', async () => {
    const dto = makeCreateDto({
      conditionPayload: {
        conditions: [
          { columnName: 'prod_kind', fieldType: 'categorical', values: ['01'] },
          { columnName: 'settle_src', fieldType: 'categorical', values: ['Y'] },
        ],
        logic: 'AND',
      },
    } as any);
    const res = await env.service.createList(dto, { userId: 'u1', ipAddress: null }, YM);
    expect(res.warnings ?? []).toEqual([]);
  });

  it('TC-WHITELIST-WARNING-003：update 名單 conditionPayload 含 inactive option → warnings 補 WHITELIST_OPTION_INACTIVE', async () => {
    // 先建一張名單
    const created = await env.service.createList(
      makeCreateDto(),
      { userId: 'u1', ipAddress: null },
      YM,
    );
    const updateDto = makeUpdateDto({
      conditionPayload: {
        conditions: [
          { columnName: 'settle_src', fieldType: 'categorical', values: ['N'] }, // inactive
        ],
        logic: 'AND',
      },
    } as any);
    const res = await env.service.updateList(
      created.listNo,
      updateDto,
      { userId: 'u1', ipAddress: null },
      YM,
    );
    expect(res.warnings).toBeDefined();
    expect(res.warnings).toHaveLength(1);
    expect(res.warnings![0].code).toBe(ERROR_CODES.WHITELIST_OPTION_INACTIVE);
  });

  it('TC-WHITELIST-WARNING-004：警告 details 列出所有 inactive 對', async () => {
    const dto = makeCreateDto({
      conditionPayload: {
        conditions: [
          {
            columnName: 'prod_kind',
            fieldType: 'categorical',
            values: ['01', '02'], // 01 active, 02 inactive
          },
          { columnName: 'settle_src', fieldType: 'categorical', values: ['N'] }, // inactive
        ],
        logic: 'AND',
      },
    } as any);
    const res = await env.service.createList(dto, { userId: 'u1', ipAddress: null }, YM);
    expect(res.warnings).toHaveLength(1);
    const details = res.warnings![0].details as Array<{ columnName: string; optionValue: string }>;
    expect(details).toHaveLength(2);
    expect(details).toContainEqual({ columnName: 'prod_kind', optionValue: '02' });
    expect(details).toContainEqual({ columnName: 'settle_src', optionValue: 'N' });
  });

  it('TC-WHITELIST-WARNING-005：conditionPayload 條件無 inactive 引用 → warnings 空陣列（v2.1）', async () => {
    // v2.1 conditionPayload 必填；改測「條件無 inactive 引用」之等效情境
    const res = await env.service.createList(makeCreateDto(), { userId: 'u1', ipAddress: null }, YM);
    expect(res.warnings ?? []).toEqual([]);
  });
});
