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
import { AssignmentRunGuardService } from '@/modules/assignment/services/assignment-run-guard.service';
import { ERROR_CODES } from '@/common/errors/error-codes';
import type { CreateListDto } from '../dto/create-list.dto';
import type { UpdateListDto } from '../dto/update-list.dto';

const YM = '202605';

interface Env {
  service: AssignmentListService;
  listRepo: Repository<ObListDefinition>;
  optionRepo: Repository<PooldataFieldOption>;
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
        ],
        synchronize: true,
      }),
      TypeOrmModule.forFeature([
        ObListDefinition,
        AssignmentAuditLog,
        PooldataFieldOption,
      ]),
    ],
    providers: [
      AssignmentListService,
      {
        provide: AssignmentRunGuardService,
        useValue: { assertNoRunningRun: vi.fn().mockResolvedValue(undefined) },
      },
    ],
  }).compile();
  await app.init();
  return {
    service: app.get(AssignmentListService),
    listRepo: app.get(getRepositoryToken(ObListDefinition)),
    optionRepo: app.get(getRepositoryToken(PooldataFieldOption)),
    app,
  };
}

function makeCreateDto(overrides: Partial<CreateListDto> = {}): CreateListDto {
  return {
    listNm: '測試名單',
    prodKind: '01',
    caseYear: '1',
    specTp: 'A',
    caseStatus: '01',
    listPeriodStart: 1,
    listPeriodEnd: 12,
    listInterval: 1,
    settleSrc: 'Y',
    cardType: 'M5',
    prodBest: null,
    crEnabled: false,
    ...overrides,
  } as CreateListDto;
}

function makeUpdateDto(overrides: Partial<UpdateListDto> = {}): UpdateListDto {
  return {
    listNm: '測試名單（修改）',
    prodKind: '01',
    caseYear: '1',
    specTp: 'A',
    caseStatus: '01',
    listPeriodStart: 1,
    listPeriodEnd: 12,
    listInterval: 1,
    settleSrc: 'Y',
    cardType: 'M5',
    prodBest: null,
    crEnabled: false,
    ...overrides,
  } as UpdateListDto;
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
    // seed：PROD_KIND 01 active；02 inactive；SETTLE_SRC Y active；N inactive
    const now = new Date();
    await env.optionRepo.save([
      env.optionRepo.create({
        column_name: 'PROD_KIND',
        option_value: '01',
        option_label: '汽車新車',
        is_active: true,
        deactivation_reason: null,
        created_at: now,
        updated_at: now,
      }),
      env.optionRepo.create({
        column_name: 'PROD_KIND',
        option_value: '02',
        option_label: '機車',
        is_active: false,
        deactivation_reason: 'manual',
        created_at: now,
        updated_at: now,
      }),
      env.optionRepo.create({
        column_name: 'SETTLE_SRC',
        option_value: 'Y',
        option_label: '含他行代償',
        is_active: true,
        deactivation_reason: null,
        created_at: now,
        updated_at: now,
      }),
      env.optionRepo.create({
        column_name: 'SETTLE_SRC',
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
          { columnName: 'PROD_KIND', fieldType: 'categorical', values: ['02'] }, // inactive
        ],
        logic: 'AND',
      },
    } as any);
    const res = await env.service.createList(dto, { userId: 'u1', ipAddress: null }, YM);
    expect(res.warnings).toBeDefined();
    expect(res.warnings).toHaveLength(1);
    expect(res.warnings![0].code).toBe(ERROR_CODES.WHITELIST_OPTION_INACTIVE);
    expect(res.warnings![0].details).toContainEqual({
      columnName: 'PROD_KIND',
      optionValue: '02',
    });
  });

  it('TC-WHITELIST-WARNING-002：create 名單 conditionPayload 全部 active → warnings 空陣列', async () => {
    const dto = makeCreateDto({
      conditionPayload: {
        conditions: [
          { columnName: 'PROD_KIND', fieldType: 'categorical', values: ['01'] },
          { columnName: 'SETTLE_SRC', fieldType: 'categorical', values: ['Y'] },
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
          { columnName: 'SETTLE_SRC', fieldType: 'categorical', values: ['N'] }, // inactive
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
            columnName: 'PROD_KIND',
            fieldType: 'categorical',
            values: ['01', '02'], // 01 active, 02 inactive
          },
          { columnName: 'SETTLE_SRC', fieldType: 'categorical', values: ['N'] }, // inactive
        ],
        logic: 'AND',
      },
    } as any);
    const res = await env.service.createList(dto, { userId: 'u1', ipAddress: null }, YM);
    expect(res.warnings).toHaveLength(1);
    const details = res.warnings![0].details as Array<{ columnName: string; optionValue: string }>;
    expect(details).toHaveLength(2);
    expect(details).toContainEqual({ columnName: 'PROD_KIND', optionValue: '02' });
    expect(details).toContainEqual({ columnName: 'SETTLE_SRC', optionValue: 'N' });
  });

  it('TC-WHITELIST-WARNING-005：無 conditionPayload → warnings 空陣列', async () => {
    const res = await env.service.createList(makeCreateDto(), { userId: 'u1', ipAddress: null }, YM);
    expect(res.warnings ?? []).toEqual([]);
  });
});
