/**
 * F109 / US-172 / AD-E07-37 §6 — stampConditionDataSource（寫入時固化 dataSource）
 *
 * 對應 test spec（F109-test.md）：
 *   - DATASRC-005：createList 寫入時每個 condition 蓋上 dataSource，含系統固定 best_case
 *   - DATASRC-006：updateList 同樣蓋章
 *
 * SQLite in-memory + 真 repo（synchronize）；whitelist 含 customer_core（gender）+ 系統固定（best_case）。
 * 驗證 saved condition_payload.conditions[].dataSource 依當下白名單正確固化（best_case→ob_pool_data、gender→customer_core）。
 */

import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
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

const YM = '202607';
const ACTOR = { userId: 'dir-001', ipAddress: '127.0.0.1' };

let app: TestingModule;
let service: AssignmentListService;
let listRepo: Repository<ObListDefinition>;
let whitelistRepo: Repository<PooldataFieldWhitelist>;

async function seedWhitelist() {
  const now = new Date();
  const rows: Array<Partial<PooldataFieldWhitelist>> = [
    { column_name: 'prod_kind', display_name: '產品類別', field_type: 'categorical', is_active: true, isSystemFixed: false, dataSource: 'ob_pool_data' },
    { column_name: 'gender', display_name: '性別', field_type: 'categorical', is_active: true, isSystemFixed: false, dataSource: 'customer_core' },
    { column_name: 'best_case', display_name: '優質案件', field_type: 'categorical', is_active: true, isSystemFixed: true, dataSource: 'ob_pool_data' },
  ];
  for (const r of rows) {
    await whitelistRepo.save(
      whitelistRepo.create({ ...r, created_at: now, updated_at: now } as Partial<PooldataFieldWhitelist>),
    );
  }
}

beforeAll(async () => {
  app = await Test.createTestingModule({
    imports: [
      TypeOrmModule.forRoot({
        type: 'better-sqlite3',
        database: ':memory:',
        entities: [ObListDefinition, AssignmentAuditLog, AssignmentRun, PooldataFieldOption, PooldataFieldWhitelist, ObDeptPct, ObEmplSet, ObEmphire, AssignmentApproval, User, ObPoolData],
        synchronize: true,
      }),
      TypeOrmModule.forFeature([ObListDefinition, AssignmentAuditLog, AssignmentRun, PooldataFieldOption, PooldataFieldWhitelist, ObDeptPct, ObEmplSet, ObEmphire, AssignmentApproval, User, ObPoolData]),
    ],
    providers: [
      AssignmentListService,
      AssignmentRunGuardService,
      { provide: SectionChiefScopeService, useValue: { getScopeDeptCode: () => Promise.resolve(null) } },
    ],
  }).compile();
  await app.init();
  const ds = app.get(DataSource);
  service = app.get(AssignmentListService);
  listRepo = ds.getRepository(ObListDefinition);
  whitelistRepo = ds.getRepository(PooldataFieldWhitelist);
});

afterAll(async () => {
  if (app) await app.close();
});

beforeEach(async () => {
  await listRepo.clear();
  await whitelistRepo.clear();
  await seedWhitelist();
});

function dto(overrides: Record<string, unknown> = {}) {
  return {
    listNm: '客戶篩選名單',
    listPeriodStart: 1,
    listPeriodEnd: 6,
    listInterval: 1,
    cardType: '01',
    prodBest: null,
    crEnabled: false,
    copyFromListNo: null,
    conditionPayload: {
      conditions: [{ columnName: 'gender', fieldType: 'categorical', values: ['1'] }],
      logic: 'AND',
    },
    ...overrides,
  } as never;
}

describe('F109 stampConditionDataSource — createList / updateList', () => {
  it('TS-F109-DATASRC-005：createList 固化 gender→customer_core、系統固定 best_case→ob_pool_data', async () => {
    const res = await service.createList(dto(), ACTOR, YM);
    const saved = await listRepo.findOneByOrFail({ list_no: res.listNo });
    const conds = saved.condition_payload!.conditions;

    const gender = conds.find((c) => c.columnName === 'gender');
    const best = conds.find((c) => c.columnName === 'best_case');
    expect(gender?.dataSource).toBe('customer_core');
    // best_case 由 injectSystemFixedConditions 注入，stampConditionDataSource 之後也被蓋章
    expect(best).toBeDefined();
    expect(best?.dataSource).toBe('ob_pool_data');
  });

  it('TS-F109-DATASRC-005b：案件 + 客戶混合條件各自蓋正確 dataSource', async () => {
    const res = await service.createList(
      dto({
        conditionPayload: {
          conditions: [
            { columnName: 'prod_kind', fieldType: 'categorical', values: ['01'] },
            { columnName: 'gender', fieldType: 'categorical', values: ['2'] },
          ],
          logic: 'AND',
        },
      }),
      ACTOR,
      YM,
    );
    const saved = await listRepo.findOneByOrFail({ list_no: res.listNo });
    const conds = saved.condition_payload!.conditions;
    expect(conds.find((c) => c.columnName === 'prod_kind')?.dataSource).toBe('ob_pool_data');
    expect(conds.find((c) => c.columnName === 'gender')?.dataSource).toBe('customer_core');
  });

  it('TS-F109-DATASRC-006：updateList 同樣蓋章', async () => {
    const created = await service.createList(dto(), ACTOR, YM);
    await service.updateList(
      created.listNo,
      dto({
        conditionPayload: {
          conditions: [{ columnName: 'gender', fieldType: 'categorical', values: ['3'] }],
          logic: 'AND',
        },
      }),
      ACTOR,
      YM,
    );
    const saved = await listRepo.findOneByOrFail({ list_no: created.listNo });
    const gender = saved.condition_payload!.conditions.find((c) => c.columnName === 'gender');
    expect(gender?.dataSource).toBe('customer_core');
    expect(gender?.values).toEqual(['3']);
  });
});
