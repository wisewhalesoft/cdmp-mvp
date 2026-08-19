/**
 * F119 / US-183 — normalizeConditionPayload 簽章擴充之向後相容回歸 + AC-16 重複判定區分運算子語意。
 *
 * 撰寫依據：F119 spec BR-9/AC-16/AC-17 + AD-E07-50 §3.5（I-CATOP-SIG-BACKCOMPAT-01 /
 * I-CATOP-OPERATOR-FALLBACK-01）。**未**開啟 `assignment-list.service.ts` 生產碼。
 *
 * §一：T-11/T-12 —— `(service as any).normalizeConditionPayload(...)` 直接呼叫私有方法，
 *   wiring 慣例（`(service as any).xxx`、buildEnv）取自既有測試檔
 *   `derive-backward-compat.spec.ts`（允許範圍：既有測試檔）。BR-9 之簽章公式
 *   （`${columnName}:cat:${去重排序後 values.join(',')}` / `${columnName}:catop:${operator}:${keyword}`）
 *   逐字取自 F119 spec BR-9 本文，非讀取生產碼推導。
 *
 * §二：T-13~T-16 —— AC-16 重複判定黑箱驗證，經 `createList` 兩次呼叫觀察是否觸發
 *   422 LIST_NO_DUPLICATE，慣例比照 F118 TS-F118-BE-002/003 之雙向一致性驗證手法
 *   （見 `docs/test-specs/features/F118-test.md`，設計文件而非生產碼）。
 */

import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
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

const YM = '202608';
const ACTOR = { userId: 'dir-001', ipAddress: '127.0.0.1' };

interface Env {
  app: TestingModule;
  service: AssignmentListService;
  listRepo: Repository<ObListDefinition>;
  whitelistRepo: Repository<PooldataFieldWhitelist>;
}

async function buildEnv(): Promise<Env> {
  const app = await Test.createTestingModule({
    imports: [
      TypeOrmModule.forRoot({
        type: 'better-sqlite3',
        database: ':memory:',
        entities: [
          ObListDefinition, AssignmentAuditLog, AssignmentRun, PooldataFieldOption,
          PooldataFieldWhitelist, ObDeptPct, ObEmplSet, ObEmphire, AssignmentApproval, User, ObPoolData,
        ],
        synchronize: true,
      }),
      TypeOrmModule.forFeature([
        ObListDefinition, AssignmentAuditLog, AssignmentRun, PooldataFieldOption,
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
    whitelistRepo: ds.getRepository(PooldataFieldWhitelist),
  };
}

async function seedWhitelist(repo: Repository<PooldataFieldWhitelist>) {
  const now = new Date();
  const rows = [
    { column_name: 'spec_name', field_type: 'categorical' as const, is_active: true },
    { column_name: 'prod_kind', field_type: 'categorical' as const, is_active: true },
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

function baseDto(overrides: Partial<any> = {}) {
  return {
    listNm: 'F119 簽章測試名單',
    listPeriodStart: 1,
    listPeriodEnd: 6,
    listInterval: 1,
    cardType: '01',
    prodBest: null,
    crEnabled: false,
    copyFromListNo: null,
    conditionPayload: {
      conditions: [{ columnName: 'spec_name', fieldType: 'categorical', operator: 'contains', keyword: '勁便利' }],
      logic: 'AND',
    },
    ...overrides,
  };
}

// ===========================================================================
// §一：BR-9 簽章公式 + 向後相容（T-11/T-12）
// ===========================================================================

describe('F119 normalizeConditionPayload 簽章擴充（BR-9 / I-CATOP-SIG-BACKCOMPAT-01）', () => {
  let app: TestingModule;
  let service: AssignmentListService;

  beforeAll(async () => {
    const env = await buildEnv();
    app = env.app;
    service = env.service;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('T-12（★核心 / AC-17）：顯式 operator:"in" 與缺漏 operator（同 values）→ 簽章逐字相同', () => {
    const withExplicitIn = {
      conditions: [{ columnName: 'prod_kind', fieldType: 'categorical' as const, operator: 'in', values: ['01', '02'] }],
      logic: 'AND' as const,
    };
    const withoutOperator = {
      conditions: [{ columnName: 'prod_kind', fieldType: 'categorical' as const, values: ['01', '02'] }],
      logic: 'AND' as const,
    };
    const sigA = (service as any).normalizeConditionPayload(withExplicitIn);
    const sigB = (service as any).normalizeConditionPayload(withoutOperator);
    expect(sigA).toBe(sigB);
  });

  it('T-11（★核心 / AC-17 向後相容硬性要求）：既有無 operator 之 payload 簽章符合 BR-9 公式 "col:cat:值,值"（逐字元相同）', () => {
    const payload = {
      conditions: [{ columnName: 'prod_kind', fieldType: 'categorical' as const, values: ['02', '01'] }],
      logic: 'AND' as const,
    };
    const sig = (service as any).normalizeConditionPayload(payload);
    // BR-9：values 去重排序後 join(',')；existing 格式 "col:cat:v1,v2,..."
    expect(sig).toContain('prod_kind:cat:01,02');
    expect(sig).not.toContain(':catop:');
  });

  it('SIG-CATOP-001（BR-9 新區段）：contains 條件 → 簽章含 "col:catop:contains:關鍵字" 區段，不含 :cat: 前綴', () => {
    const payload = {
      conditions: [{ columnName: 'spec_name', fieldType: 'categorical' as const, operator: 'contains', keyword: '勁便利' }],
      logic: 'AND' as const,
    };
    const sig = (service as any).normalizeConditionPayload(payload);
    expect(sig).toContain('spec_name:catop:contains:勁便利');
  });

  it('SIG-CATOP-002：not_contains / equals 亦各自產生對應區段（不同運算子 → 不同區段字串）', () => {
    const payload1 = {
      conditions: [{ columnName: 'spec_name', fieldType: 'categorical' as const, operator: 'not_contains', keyword: '勁便利' }],
      logic: 'AND' as const,
    };
    const payload2 = {
      conditions: [{ columnName: 'spec_name', fieldType: 'categorical' as const, operator: 'equals', keyword: '勁便利' }],
      logic: 'AND' as const,
    };
    const sig1 = (service as any).normalizeConditionPayload(payload1);
    const sig2 = (service as any).normalizeConditionPayload(payload2);
    expect(sig1).toContain('spec_name:catop:not_contains:勁便利');
    expect(sig2).toContain('spec_name:catop:equals:勁便利');
    expect(sig1).not.toBe(sig2);
  });

  it('SIG-CATOP-003（BR-8）：keyword 大小寫/全半形敏感，簽章不做折疊 —— contains "ABC" ≠ contains "abc"', () => {
    const a = (service as any).normalizeConditionPayload({
      conditions: [{ columnName: 'spec_name', fieldType: 'categorical' as const, operator: 'contains', keyword: 'ABC' }],
      logic: 'AND' as const,
    });
    const b = (service as any).normalizeConditionPayload({
      conditions: [{ columnName: 'spec_name', fieldType: 'categorical' as const, operator: 'contains', keyword: 'abc' }],
      logic: 'AND' as const,
    });
    expect(a).not.toBe(b);
  });

  it('SIG-CATOP-004（AC-4 / BR-9）：in["勁便利"]（單值）與 equals"勁便利" → 簽章不同（不同條件表達）', () => {
    const inSig = (service as any).normalizeConditionPayload({
      conditions: [{ columnName: 'spec_name', fieldType: 'categorical' as const, values: ['勁便利'] }],
      logic: 'AND' as const,
    });
    const equalsSig = (service as any).normalizeConditionPayload({
      conditions: [{ columnName: 'spec_name', fieldType: 'categorical' as const, operator: 'equals', keyword: '勁便利' }],
      logic: 'AND' as const,
    });
    expect(inSig).not.toBe(equalsSig);
  });
});

// ===========================================================================
// §二：AC-16 重複判定區分運算子語意（T-13~T-16，createList 黑箱雙向驗證）
// ===========================================================================

describe('F119 重複名單判定 — 運算子語意區分（AC-16，createList 黑箱）', () => {
  let env: Env;

  beforeAll(async () => {
    env = await buildEnv();
  });

  afterAll(async () => {
    await env.app?.close();
  });

  beforeEach(async () => {
    await env.whitelistRepo.clear();
    await env.listRepo.createQueryBuilder().delete().execute();
    await seedWhitelist(env.whitelistRepo);
  });

  async function expectDuplicate(promise: Promise<unknown>) {
    try {
      await promise;
      throw new Error('expected 422 LIST_NO_DUPLICATE but resolved');
    } catch (e: any) {
      expect(e).toBeInstanceOf(UnprocessableEntityException);
      expect(e.getResponse().error).toBe(ERROR_CODES.LIST_NO_DUPLICATE);
    }
  }

  it('T-13（★核心）：list A（contains 勁便利）已存在 → list B（not_contains 勁便利，其餘同）不觸發 422', async () => {
    await env.service.createList(
      baseDto({
        conditionPayload: {
          conditions: [{ columnName: 'spec_name', fieldType: 'categorical', operator: 'contains', keyword: '勁便利' }],
          logic: 'AND',
        },
      }) as any,
      ACTOR,
      YM,
    );
    await expect(
      env.service.createList(
        baseDto({
          conditionPayload: {
            conditions: [{ columnName: 'spec_name', fieldType: 'categorical', operator: 'not_contains', keyword: '勁便利' }],
            logic: 'AND',
          },
        }) as any,
        ACTOR,
        YM,
      ),
    ).resolves.toBeDefined();
  });

  it('T-14：同運算子同關鍵字（其餘完全相同）→ 仍觸發 422 LIST_NO_DUPLICATE（重複攔截不得失效）', async () => {
    await env.service.createList(baseDto() as any, ACTOR, YM);
    await expectDuplicate(env.service.createList(baseDto() as any, ACTOR, YM));
  });

  it('T-15：in["勁便利"]（單值）與 equals"勁便利"（其餘同）→ 判為不同名單，不觸發 422', async () => {
    await env.service.createList(
      baseDto({
        conditionPayload: {
          conditions: [{ columnName: 'spec_name', fieldType: 'categorical', values: ['勁便利'] }],
          logic: 'AND',
        },
      }) as any,
      ACTOR,
      YM,
    );
    await expect(
      env.service.createList(
        baseDto({
          conditionPayload: {
            conditions: [{ columnName: 'spec_name', fieldType: 'categorical', operator: 'equals', keyword: '勁便利' }],
            logic: 'AND',
          },
        }) as any,
        ACTOR,
        YM,
      ),
    ).resolves.toBeDefined();
  });

  it('T-16（BR-8）：contains "ABC" 與 contains "abc"（其餘同）→ 判為不同名單，大小寫敏感', async () => {
    await env.service.createList(
      baseDto({
        conditionPayload: {
          conditions: [{ columnName: 'spec_name', fieldType: 'categorical', operator: 'contains', keyword: 'ABC' }],
          logic: 'AND',
        },
      }) as any,
      ACTOR,
      YM,
    );
    await expect(
      env.service.createList(
        baseDto({
          conditionPayload: {
            conditions: [{ columnName: 'spec_name', fieldType: 'categorical', operator: 'contains', keyword: 'abc' }],
            logic: 'AND',
          },
        }) as any,
        ACTOR,
        YM,
      ),
    ).resolves.toBeDefined();
  });
});
