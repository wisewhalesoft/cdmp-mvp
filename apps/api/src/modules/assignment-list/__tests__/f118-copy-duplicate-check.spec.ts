/**
 * F118 — 從上月複製名單顯示「已複製過」提示
 * 後端 Unit / Integration（真實 AssignmentListService + in-memory SQLite，非 mock repo）
 *
 * 對應：
 *   - docs/specs/features/F118-copy-from-prev-month-duplicate-indicator.md（AC-1~AC-11 / BR-1~BR-9）
 *   - docs/specs/implementation-log/AD-E07-48-f117-f118-ux-refinements.md §5
 *   - docs/specs/contracts/F118-copy-duplicate-check.contract.ts
 *   - docs/test-specs/features/F118-test.md（§一 TS-F118-BE-001~011）
 *
 * 沿用既有 create-list-v2.1.spec.ts / derive-backward-compat.spec.ts 之 buildEnv pattern
 * （real AssignmentListService + in-memory better-sqlite3, synchronize:true）。候選 / 目標
 * 名單優先透過真實 service.createList(dto, actor, workYm) 建立，使測試同時驗證「候選資料
 * 形狀與 createList 產出一致」，並讓 AC-2 雙向一致性測試具備結構性意義（BR-1：checkCopyDuplicates
 * 與 findActiveConditionDuplicate 必須共用同一 normalizeConditionPayload，本檔不重新實作
 * 正規化規則本身 —— 該規則已由既有 derive-backward-compat.spec.ts 之 NCP-001~006 涵蓋）。
 *
 * ⚠️ 本檔在 F118 實作前應為紅燈：AssignmentListService 尚無 checkCopyDuplicates 方法，
 * 呼叫 `(env.service as any).checkCopyDuplicates(...)` 應拋 TypeError（方法不存在）。
 */

import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { UnprocessableEntityException } from '@nestjs/common';
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

const PREV_YM = '202604';
const CURRENT_YM = '202605';
const ACTOR = { userId: 'dir-f118', ipAddress: '127.0.0.1' };

interface Env {
  app: TestingModule;
  service: AssignmentListService;
  listRepo: Repository<ObListDefinition>;
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
          PooldataFieldWhitelist,
          ObDeptPct,
          ObEmplSet,
          ObEmphire,
          AssignmentApproval,
          User,
          ObPoolData,
        ],
        synchronize: true,
      }),
      TypeOrmModule.forFeature([
        ObListDefinition,
        AssignmentAuditLog,
        AssignmentRun,
        PooldataFieldOption,
        PooldataFieldWhitelist,
        ObDeptPct,
        ObEmplSet,
        ObEmphire,
        AssignmentApproval,
        User,
        ObPoolData,
      ]),
    ],
    providers: [
      AssignmentListService,
      AssignmentRunGuardService,
      {
        provide: SectionChiefScopeService,
        useValue: { getScopeDeptCode: () => Promise.resolve(null) },
      },
    ],
  }).compile();
  await app.init();

  const ds = app.get(DataSource);
  return {
    app,
    service: app.get(AssignmentListService),
    listRepo: ds.getRepository(ObListDefinition),
    whitelistRepo: ds.getRepository(PooldataFieldWhitelist),
    optionRepo: ds.getRepository(PooldataFieldOption),
  };
}

async function seedWhitelistDefault(repo: Repository<PooldataFieldWhitelist>) {
  const now = new Date();
  // ⚠️ TypeORM repo.create() 依 ENTITY PROPERTY 名稱（isSystemFixed，見
  // pooldata-field-whitelist.entity.ts `@Column({ name: 'is_system_fixed' }) isSystemFixed`）
  // 而非 DB 欄名（is_system_fixed）取值；後者為 excess property 會被靜默忽略、
  // 欄位落回 column default（false）。沿用既有 create-list-v2.1.spec.ts:893 /
  // update-list-v2.1.spec.ts:543 / f109-stamp-data-source.spec.ts:43-45 等既定慣例一律用
  // camelCase `isSystemFixed`。（2026-08-04 test-generator 修正：implementer dispute BE-007）
  const rows: Array<Partial<PooldataFieldWhitelist> & { column_name: string }> = [
    { column_name: 'prod_kind', field_type: 'categorical', is_active: true, isSystemFixed: false },
    { column_name: 'spec_tp', field_type: 'categorical', is_active: true, isSystemFixed: false },
    { column_name: 'best_case', field_type: 'categorical', is_active: true, isSystemFixed: true },
  ];
  for (const r of rows) {
    await repo.save(
      repo.create({
        display_name: r.column_name,
        is_active: true,
        created_at: now,
        updated_at: now,
        ...r,
      } as Partial<PooldataFieldWhitelist>),
    );
  }
  // best_case 之可選值需存在（Y），否則 injectSystemFixedConditions 之依賴（若有）可能失敗
  await repo.manager.getRepository(PooldataFieldOption).save(
    repo.manager.getRepository(PooldataFieldOption).create({
      column_name: 'best_case',
      option_value: 'Y',
      option_label: '優質案件',
      is_active: true,
      created_at: now,
      updated_at: now,
    } as Partial<PooldataFieldOption>),
  );
}

function baseDto(overrides: Partial<any> = {}) {
  return {
    listNm: 'F118 測試名單',
    listPeriodStart: 1,
    listPeriodEnd: 6,
    listInterval: 1,
    cardType: null,
    crEnabled: false,
    conditionPayload: {
      conditions: [{ columnName: 'prod_kind', fieldType: 'categorical', values: ['01'] }],
      logic: 'AND',
    },
    ...overrides,
  };
}

describe('F118 — AssignmentListService.checkCopyDuplicates（真實 SQLite，非 mock）', () => {
  let env: Env;

  beforeAll(async () => {
    env = await buildEnv();
  });

  afterAll(async () => {
    await env.app?.close();
  });

  beforeEach(async () => {
    await env.optionRepo.clear();
    await env.whitelistRepo.clear();
    await env.listRepo.createQueryBuilder().delete().execute();
    await seedWhitelistDefault(env.whitelistRepo);
  });

  // -----------------------------------------------------------------
  // TS-F118-BE-001
  // -----------------------------------------------------------------
  it('TS-F118-BE-001：上月 3 筆候選，本月 1 筆等價 → 該筆 alreadyCopied=true 其餘 false', async () => {
    const a = await env.service.createList(
      baseDto({
        cardType: 'S5',
        conditionPayload: { conditions: [{ columnName: 'prod_kind', fieldType: 'categorical', values: ['01'] }], logic: 'AND' },
      }) as any,
      ACTOR,
      PREV_YM,
    );
    await env.service.createList(
      baseDto({
        cardType: 'S5',
        conditionPayload: { conditions: [{ columnName: 'spec_tp', fieldType: 'categorical', values: ['02'] }], logic: 'AND' },
      }) as any,
      ACTOR,
      PREV_YM,
    );
    await env.service.createList(
      baseDto({
        cardType: 'S5',
        conditionPayload: { conditions: [{ columnName: 'spec_tp', fieldType: 'categorical', values: ['03'] }], logic: 'AND' },
      }) as any,
      ACTOR,
      PREV_YM,
    );
    // 本月：與候選 A 完全等價之名單
    const target = await env.service.createList(
      baseDto({
        cardType: 'S5',
        conditionPayload: { conditions: [{ columnName: 'prod_kind', fieldType: 'categorical', values: ['01'] }], logic: 'AND' },
      }) as any,
      ACTOR,
      CURRENT_YM,
    );

    const result = await (env.service as any).checkCopyDuplicates(PREV_YM, CURRENT_YM);
    expect(result).toHaveLength(3);
    const matched = result.find((r: any) => r.listNo === a.listNo);
    expect(matched.alreadyCopied).toBe(true);
    expect(matched.copiedToListNo).toBe(target.listNo);
    const others = result.filter((r: any) => r.listNo !== a.listNo);
    expect(others).toHaveLength(2);
    for (const o of others) {
      expect(o.alreadyCopied).toBe(false);
      expect(o.copiedToListNo).toBeNull();
    }
  });

  // -----------------------------------------------------------------
  // TS-F118-BE-002（★核心 AC-2 正向）
  // -----------------------------------------------------------------
  it('TS-F118-BE-002（★核心）：判定為 false 之候選 → 原樣 createList 不得 422', async () => {
    await env.service.createList(
      baseDto({ conditionPayload: { conditions: [{ columnName: 'prod_kind', fieldType: 'categorical', values: ['01'] }], logic: 'AND' } }) as any,
      ACTOR,
      PREV_YM,
    );
    const b = await env.service.createList(
      baseDto({
        cardType: 'S6',
        conditionPayload: { conditions: [{ columnName: 'spec_tp', fieldType: 'categorical', values: ['09'] }], logic: 'AND' },
      }) as any,
      ACTOR,
      PREV_YM,
    );

    const result = await (env.service as any).checkCopyDuplicates(PREV_YM, CURRENT_YM);
    const judged = result.find((r: any) => r.listNo === b.listNo);
    expect(judged.alreadyCopied).toBe(false);

    // 原樣以候選 B 的條件 + cardType 建立於本月，不得 422
    const created = await env.service.createList(
      baseDto({
        cardType: 'S6',
        conditionPayload: { conditions: [{ columnName: 'spec_tp', fieldType: 'categorical', values: ['09'] }], logic: 'AND' },
      }) as any,
      ACTOR,
      CURRENT_YM,
    );
    expect(created.listNo).toBeDefined();
  });

  // -----------------------------------------------------------------
  // TS-F118-BE-003（★核心 AC-2 反向）
  // -----------------------------------------------------------------
  it('TS-F118-BE-003（★核心）：判定為 true 之候選 → 原樣 createList 必定 422，conflictListNo === copiedToListNo', async () => {
    const src = await env.service.createList(
      baseDto({
        cardType: 'OB',
        conditionPayload: { conditions: [{ columnName: 'prod_kind', fieldType: 'categorical', values: ['02'] }], logic: 'AND' },
      }) as any,
      ACTOR,
      PREV_YM,
    );
    const target = await env.service.createList(
      baseDto({
        cardType: 'OB',
        conditionPayload: { conditions: [{ columnName: 'prod_kind', fieldType: 'categorical', values: ['02'] }], logic: 'AND' },
      }) as any,
      ACTOR,
      CURRENT_YM,
    );

    const result = await (env.service as any).checkCopyDuplicates(PREV_YM, CURRENT_YM);
    const judged = result.find((r: any) => r.listNo === src.listNo);
    expect(judged.alreadyCopied).toBe(true);
    expect(judged.copiedToListNo).toBe(target.listNo);

    try {
      await env.service.createList(
        baseDto({
          cardType: 'OB',
          conditionPayload: { conditions: [{ columnName: 'prod_kind', fieldType: 'categorical', values: ['02'] }], logic: 'AND' },
        }) as any,
        ACTOR,
        CURRENT_YM,
      );
      throw new Error('expected throw');
    } catch (e: any) {
      expect(e).toBeInstanceOf(UnprocessableEntityException);
      expect(e.getResponse().error).toBe(ERROR_CODES.LIST_NO_DUPLICATE);
      expect(e.getResponse().details.conflictListNo).toBe(judged.copiedToListNo);
    }
  });

  // -----------------------------------------------------------------
  // TS-F118-BE-004 / BE-005（BR-7）
  // -----------------------------------------------------------------
  it('TS-F118-BE-004：card_type 不同但條件相同 → alreadyCopied=false（BR-7）', async () => {
    const src = await env.service.createList(
      baseDto({
        cardType: 'S5',
        conditionPayload: { conditions: [{ columnName: 'prod_kind', fieldType: 'categorical', values: ['05'] }], logic: 'AND' },
      }) as any,
      ACTOR,
      PREV_YM,
    );
    await env.service.createList(
      baseDto({
        cardType: 'S6',
        conditionPayload: { conditions: [{ columnName: 'prod_kind', fieldType: 'categorical', values: ['05'] }], logic: 'AND' },
      }) as any,
      ACTOR,
      CURRENT_YM,
    );

    const result = await (env.service as any).checkCopyDuplicates(PREV_YM, CURRENT_YM);
    const judged = result.find((r: any) => r.listNo === src.listNo);
    expect(judged.alreadyCopied).toBe(false);
    expect(judged.copiedToListNo).toBeNull();
  });

  it('TS-F118-BE-005：card_type 兩邊皆 NULL 且條件相同 → alreadyCopied=true（BR-7）', async () => {
    const src = await env.service.createList(
      baseDto({
        cardType: null,
        conditionPayload: { conditions: [{ columnName: 'prod_kind', fieldType: 'categorical', values: ['06'] }], logic: 'AND' },
      }) as any,
      ACTOR,
      PREV_YM,
    );
    const target = await env.service.createList(
      baseDto({
        cardType: null,
        conditionPayload: { conditions: [{ columnName: 'prod_kind', fieldType: 'categorical', values: ['06'] }], logic: 'AND' },
      }) as any,
      ACTOR,
      CURRENT_YM,
    );

    const result = await (env.service as any).checkCopyDuplicates(PREV_YM, CURRENT_YM);
    const judged = result.find((r: any) => r.listNo === src.listNo);
    expect(judged.alreadyCopied).toBe(true);
    expect(judged.copiedToListNo).toBe(target.listNo);
  });

  // -----------------------------------------------------------------
  // TS-F118-BE-006（BR-8）
  // -----------------------------------------------------------------
  it('TS-F118-BE-006：本月等價名單 status != active → alreadyCopied=false（BR-8）', async () => {
    const src = await env.service.createList(
      baseDto({
        conditionPayload: { conditions: [{ columnName: 'prod_kind', fieldType: 'categorical', values: ['07'] }], logic: 'AND' },
      }) as any,
      ACTOR,
      PREV_YM,
    );
    const target = await env.service.createList(
      baseDto({
        conditionPayload: { conditions: [{ columnName: 'prod_kind', fieldType: 'categorical', values: ['07'] }], logic: 'AND' },
      }) as any,
      ACTOR,
      CURRENT_YM,
    );
    await env.listRepo.update({ list_no: target.listNo }, { status: 'disabled' } as any);

    const result = await (env.service as any).checkCopyDuplicates(PREV_YM, CURRENT_YM);
    const judged = result.find((r: any) => r.listNo === src.listNo);
    expect(judged.alreadyCopied).toBe(false);
    expect(judged.copiedToListNo).toBeNull();
  });

  // -----------------------------------------------------------------
  // TS-F118-BE-007（BR-5）
  // -----------------------------------------------------------------
  it('TS-F118-BE-007：條件僅差 system-fixed 欄位（best_case）→ 仍判為等價（BR-5）', async () => {
    // 候選：不含 best_case（createList 會經 injectSystemFixedConditions 強制注入，
    // 但候選之 normalizeConditionPayload 排除 system-fixed 欄位，故簽章不受影響）
    const src = await env.service.createList(
      baseDto({
        conditionPayload: { conditions: [{ columnName: 'prod_kind', fieldType: 'categorical', values: ['08'] }], logic: 'AND' },
      }) as any,
      ACTOR,
      PREV_YM,
    );
    const target = await env.service.createList(
      baseDto({
        conditionPayload: {
          conditions: [
            { columnName: 'prod_kind', fieldType: 'categorical', values: ['08'] },
            { columnName: 'best_case', fieldType: 'categorical', values: ['Y'] },
          ],
          logic: 'AND',
        },
      }) as any,
      ACTOR,
      CURRENT_YM,
    );

    const result = await (env.service as any).checkCopyDuplicates(PREV_YM, CURRENT_YM);
    const judged = result.find((r: any) => r.listNo === src.listNo);
    expect(judged.alreadyCopied).toBe(true);
    expect(judged.copiedToListNo).toBe(target.listNo);
  });

  // -----------------------------------------------------------------
  // TS-F118-BE-008（AC-10）
  // -----------------------------------------------------------------
  it('TS-F118-BE-008：簽章為空（僅含 system-fixed 條件）→ alreadyCopied=false（AC-10）', async () => {
    const now = new Date();
    const emptySigCandidate = env.listRepo.create({
      list_no: `OB${PREV_YM}900`,
      list_nm: '僅 system-fixed 條件',
      list_type: '01',
      prod_kind: '',
      caseyear: null,
      spec_tp: null,
      case_status: '',
      settle_src: null,
      list_period_start: '1',
      list_period_end: '6',
      list_interval: '1',
      project_workym: PREV_YM,
      card_type: null,
      cr_enabled: false,
      status: 'active',
      stage: 'ready',
      prod_best: null,
      condition_payload: {
        conditions: [{ columnName: 'best_case', fieldType: 'categorical', values: ['Y'] }],
        logic: 'AND',
      } as any,
      created_by_prog: 'TEST',
      created_by: ACTOR.userId,
      created_at: now,
      updated_by_prog: 'TEST',
      updated_by: ACTOR.userId,
      updated_at: now,
    } as any);
    await env.listRepo.save(emptySigCandidate);

    const result = await (env.service as any).checkCopyDuplicates(PREV_YM, CURRENT_YM);
    const judged = result.find((r: any) => r.listNo === emptySigCandidate.list_no);
    expect(judged).toBeDefined();
    expect(judged.alreadyCopied).toBe(false);
    expect(judged.copiedToListNo).toBeNull();
  });

  // -----------------------------------------------------------------
  // TS-F118-BE-009（★核心 AC-7 / BR-3）
  // -----------------------------------------------------------------
  it('TS-F118-BE-009（★核心）：N+1 防範 — 候選 N=3 vs N=20，listRepo.find 呼叫次數不隨 N 增加', async () => {
    // 建 3 筆候選
    for (let i = 0; i < 3; i++) {
      await env.service.createList(
        baseDto({
          conditionPayload: { conditions: [{ columnName: 'prod_kind', fieldType: 'categorical', values: [`n3-${i}`] }], logic: 'AND' },
        }) as any,
        ACTOR,
        PREV_YM,
      );
    }
    const findSpy = vi.spyOn(env.listRepo, 'find');
    findSpy.mockClear();
    await (env.service as any).checkCopyDuplicates(PREV_YM, CURRENT_YM);
    const callsForN3 = findSpy.mock.calls.length;
    expect(callsForN3).toBeGreaterThan(0);
    expect(callsForN3).toBeLessThanOrEqual(5); // 常數且為個位數（AC-7 / BR-3 / §5.1.1 常數 3 次）

    // 追加至 20 筆候選（累計）
    for (let i = 3; i < 20; i++) {
      await env.service.createList(
        baseDto({
          conditionPayload: { conditions: [{ columnName: 'prod_kind', fieldType: 'categorical', values: [`n20-${i}`] }], logic: 'AND' },
        }) as any,
        ACTOR,
        PREV_YM,
      );
    }
    findSpy.mockClear();
    await (env.service as any).checkCopyDuplicates(PREV_YM, CURRENT_YM);
    const callsForN20 = findSpy.mock.calls.length;

    expect(callsForN20).toBe(callsForN3); // 常數，不隨候選數線性增加
    findSpy.mockRestore();
  });

  // -----------------------------------------------------------------
  // TS-F118-BE-010（AC-5）
  // -----------------------------------------------------------------
  it('TS-F118-BE-010：currentYm 為呼叫端傳入值，非後端系統當月（AC-5）', async () => {
    // 系統當月與 currentYm 刻意不同，證明判定僅依傳入參數，不查詢系統時鐘
    process.env.OVERRIDE_CURRENT_WORK_YM = '209912';
    try {
      const src = await env.service.createList(
        baseDto({
          conditionPayload: { conditions: [{ columnName: 'prod_kind', fieldType: 'categorical', values: ['ac5'] }], logic: 'AND' },
        }) as any,
        ACTOR,
        PREV_YM,
      );
      const target = await env.service.createList(
        baseDto({
          conditionPayload: { conditions: [{ columnName: 'prod_kind', fieldType: 'categorical', values: ['ac5'] }], logic: 'AND' },
        }) as any,
        ACTOR,
        CURRENT_YM,
      );

      const result = await (env.service as any).checkCopyDuplicates(PREV_YM, CURRENT_YM);
      const judged = result.find((r: any) => r.listNo === src.listNo);
      expect(judged.alreadyCopied).toBe(true);
      expect(judged.copiedToListNo).toBe(target.listNo);
    } finally {
      delete process.env.OVERRIDE_CURRENT_WORK_YM;
    }
  });

  // -----------------------------------------------------------------
  // TS-F118-BE-011（回歸 / §5.3 R-2 / OQ-F118-02）
  // -----------------------------------------------------------------
  it('TS-F118-BE-011（回歸）：findActiveConditionDuplicate 多筆歷史等價名單 → conflictListNo 恆為 list_no 最小者', async () => {
    const now = new Date();
    const payload = {
      conditions: [{ columnName: 'prod_kind', fieldType: 'categorical', values: ['hist'] }],
      logic: 'AND',
    };
    // 刻意先建立 list_no 較大者，模擬非決定性 DB 隱式順序的歷史異常資料
    for (const listNo of [`OB${CURRENT_YM}999`, `OB${CURRENT_YM}001`]) {
      await env.listRepo.save(
        env.listRepo.create({
          list_no: listNo,
          list_nm: '歷史等價名單',
          list_type: '01',
          prod_kind: '',
          caseyear: null,
          spec_tp: null,
          case_status: '',
          settle_src: null,
          list_period_start: '1',
          list_period_end: '6',
          list_interval: '1',
          project_workym: CURRENT_YM,
          card_type: null,
          cr_enabled: false,
          status: 'active',
          stage: 'ready',
          prod_best: null,
          condition_payload: payload as any,
          created_by_prog: 'TEST',
          created_by: ACTOR.userId,
          created_at: now,
          updated_by_prog: 'TEST',
          updated_by: ACTOR.userId,
          updated_at: now,
        } as any),
      );
    }

    try {
      await env.service.createList(baseDto({ conditionPayload: payload }) as any, ACTOR, CURRENT_YM);
      throw new Error('expected throw');
    } catch (e: any) {
      expect(e).toBeInstanceOf(UnprocessableEntityException);
      expect(e.getResponse().error).toBe(ERROR_CODES.LIST_NO_DUPLICATE);
      expect(e.getResponse().details.conflictListNo).toBe(`OB${CURRENT_YM}001`);
    }
  });

  // ===================================================================
  // BE-012 ~ BE-015：由 mutation testing 暴露之測試缺口（2026-08-05）
  //
  // 首輪 Stryker 對 checkCopyDuplicates / buildConditionSignatureIndex 區段
  // （行 1392-1480）留下 18 個存活突變，逐一對應到「有 AC 但無有效測試」之處：
  //   - 上月候選之 `condition_payload IS NOT NULL` 過濾改成恆真仍全綠 → AC-9 無效
  //   - 兩處 `order: { list_no: 'ASC' }` 移除仍全綠 → BR-4 在本方法路徑上未驗
  //   - 索引建立時 `if (sig === '') continue` 改為不跳過仍全綠 → AC-10 未驗
  //   - `if (!index.has(key))` 先到先贏改為後到覆蓋仍全綠 → BR-4 未驗
  // 下列 4 則測試針對性補上，使上述突變可被殺死。
  // ===================================================================

  /** 直接插入一筆 condition_payload IS NULL 之舊遷移名單（createList 不允許建立此形態）。 */
  async function insertLegacyList(
    listNo: string,
    workYm: string,
    overrides: Record<string, unknown> = {},
  ) {
    const now = new Date();
    await env.listRepo.save(
      env.listRepo.create({
        list_no: listNo,
        list_nm: `legacy-${listNo}`,
        condition_payload: null,
        prod_kind: '01',
        list_type: '01',
        list_period_start: '1',
        list_period_end: '6',
        list_interval: '1',
        project_workym: workYm,
        card_type: 'S5',
        cr_enabled: false,
        status: 'active',
        stage: 'draft',
        created_by_prog: 'TEST',
        created_by: ACTOR.userId,
        created_at: now,
        updated_by_prog: 'TEST',
        updated_by: ACTOR.userId,
        updated_at: now,
        ...overrides,
      } as any),
    );
  }

  // -----------------------------------------------------------------
  // TS-F118-BE-012 — AC-9：上月舊格式名單（condition_payload IS NULL）不得列為候選
  // -----------------------------------------------------------------
  it('TS-F118-BE-012（AC-9）：上月 condition_payload IS NULL 之舊遷移名單不出現在判定結果中', async () => {
    const normal = await env.service.createList(
      baseDto({
        cardType: 'S5',
        conditionPayload: { conditions: [{ columnName: 'prod_kind', fieldType: 'categorical', values: ['01'] }], logic: 'AND' },
      }) as any,
      ACTOR,
      PREV_YM,
    );
    await insertLegacyList(`OB${PREV_YM}901`, PREV_YM);

    const result = await (env.service as any).checkCopyDuplicates(PREV_YM, CURRENT_YM);

    // BR-9：候選集合僅含 condition_payload 非 NULL 者 —— 舊格式名單完全不出現
    expect(result.map((r: any) => r.listNo)).toEqual([normal.listNo]);
    expect(result).toHaveLength(1);
  });

  // -----------------------------------------------------------------
  // TS-F118-BE-013 — BR-4：多筆等價時 copiedToListNo 恆取 list_no 最小者
  //   （BE-011 驗的是 findActiveConditionDuplicate；本則驗 checkCopyDuplicates 自身路徑）
  // -----------------------------------------------------------------
  it('TS-F118-BE-013（BR-4）：本月存在多筆等價名單 → copiedToListNo 恆為 list_no 最小者（與插入順序無關）', async () => {
    const payload = {
      conditions: [{ columnName: 'prod_kind', fieldType: 'categorical', values: ['01'] }],
      logic: 'AND',
    };
    const src = await env.service.createList(
      baseDto({ cardType: 'S5', conditionPayload: payload }) as any,
      ACTOR,
      PREV_YM,
    );

    // 刻意「先插大號、後插小號」：若實作移除 ORDER BY list_no ASC 或改為後到覆蓋，
    // 結果會變成 OB{CURRENT_YM}903，本斷言即失敗。
    const now = new Date();
    for (const listNo of [`OB${CURRENT_YM}903`, `OB${CURRENT_YM}902`]) {
      await env.listRepo.save(
        env.listRepo.create({
          list_no: listNo,
          list_nm: `dup-${listNo}`,
          condition_payload: payload,
          prod_kind: '01',
          list_type: '01',
          list_period_start: '1',
          list_period_end: '6',
          list_interval: '1',
          project_workym: CURRENT_YM,
          card_type: 'S5',
          cr_enabled: false,
          status: 'active',
          stage: 'draft',
          created_by_prog: 'TEST',
          created_by: ACTOR.userId,
          created_at: now,
          updated_by_prog: 'TEST',
          updated_by: ACTOR.userId,
          updated_at: now,
        } as any),
      );
    }

    const result = await (env.service as any).checkCopyDuplicates(PREV_YM, CURRENT_YM);
    const hit = result.find((r: any) => r.listNo === src.listNo);
    expect(hit.alreadyCopied).toBe(true);
    expect(hit.copiedToListNo).toBe(`OB${CURRENT_YM}902`);
  });

  // -----------------------------------------------------------------
  // TS-F118-BE-014 — AC-10：本月名單簽章為空者不得進入索引
  //   （否則任何「簽章為空」之候選都會被錯誤標記為已複製）
  // -----------------------------------------------------------------
  it('TS-F118-BE-014（AC-10）：本月存在「僅含 system-fixed 條件」之名單 → 不得使空簽章候選被誤判為已複製', async () => {
    // 註：僅含 system-fixed 條件之 payload 無法經 createList 建立（F050 驗證要求
    //     至少 1 個非系統固定條件），此形態只可能來自舊資料匯入 → 直接插入。
    const emptySig = {
      conditions: [{ columnName: 'best_case', fieldType: 'categorical', values: ['Y'] }],
      logic: 'AND',
    };
    const now = new Date();
    const mkEmptySig = (listNo: string, workYm: string) =>
      env.listRepo.save(
        env.listRepo.create({
          list_no: listNo,
          list_nm: `empty-sig-${listNo}`,
          list_type: '01',
          prod_kind: '',
          caseyear: null,
          spec_tp: null,
          case_status: '',
          settle_src: null,
          list_period_start: '1',
          list_period_end: '6',
          list_interval: '1',
          project_workym: workYm,
          card_type: 'S5',
          cr_enabled: false,
          status: 'active',
          stage: 'draft',
          prod_best: null,
          condition_payload: emptySig as any,
          created_by_prog: 'TEST',
          created_by: ACTOR.userId,
          created_at: now,
          updated_by_prog: 'TEST',
          updated_by: ACTOR.userId,
          updated_at: now,
        } as any),
      );

    const src = { listNo: `OB${PREV_YM}905` };
    await mkEmptySig(src.listNo, PREV_YM);
    // 本月：同樣簽章為空之名單。若 buildConditionSignatureIndex 未跳過空簽章，
    // 兩者會以 key 'S5::' 相撞 → 候選被誤標為已複製。
    await mkEmptySig(`OB${CURRENT_YM}905`, CURRENT_YM);

    const result = await (env.service as any).checkCopyDuplicates(PREV_YM, CURRENT_YM);
    const hit = result.find((r: any) => r.listNo === src.listNo);
    expect(hit.alreadyCopied).toBe(false);
    expect(hit.copiedToListNo).toBeNull();
  });

  // -----------------------------------------------------------------
  // TS-F118-BE-015 — 本月舊格式名單之 legacy fallback 仍參與比對
  //   （buildConditionSignatureIndex 的 legacyEntityToConditionPayload 分支）
  //   確保 AC-2 一致性對舊格式的本月名單同樣成立。
  // -----------------------------------------------------------------
  it('TS-F118-BE-015：本月 condition_payload IS NULL 之舊名單 → 仍以 legacy 欄位還原簽章參與比對', async () => {
    // 上月候選：prod_kind=['01']（與下方本月 legacy 名單之 prod_kind 一致）
    const src = await env.service.createList(
      baseDto({
        cardType: 'S5',
        conditionPayload: { conditions: [{ columnName: 'prod_kind', fieldType: 'categorical', values: ['01'] }], logic: 'AND' },
      }) as any,
      ACTOR,
      PREV_YM,
    );
    // 本月：condition_payload IS NULL，但一級欄位 prod_kind='01' → legacy fallback 應還原出等價簽章
    await insertLegacyList(`OB${CURRENT_YM}904`, CURRENT_YM, { prod_kind: '01', card_type: 'S5' });

    const result = await (env.service as any).checkCopyDuplicates(PREV_YM, CURRENT_YM);
    const hit = result.find((r: any) => r.listNo === src.listNo);
    // 與儲存端 findActiveConditionDuplicate 之 legacy fallback 行為一致（AC-2）
    expect(hit.alreadyCopied).toBe(true);
    expect(hit.copiedToListNo).toBe(`OB${CURRENT_YM}904`);
  });
});
