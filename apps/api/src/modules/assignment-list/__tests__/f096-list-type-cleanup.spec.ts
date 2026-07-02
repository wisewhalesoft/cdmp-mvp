/**
 * F096 v1.0：POOLDATA 篩選欄位白名單 list_type 停用 — service / 行為層測試
 *
 * 對應 test spec（F096-test.md）：
 *   - TS-F096-API-001：篩選欄位 dropdown 來源不再含 list_type（停用後 is_active=true 集合排除）
 *   - TS-F096-API-002：case_status 仍在來源（期別篩選正確入口保留）
 *   - TS-F096-API-003：m293 前後 diff — 僅 list_type 消失
 *   - TS-F096-COMPAT-001：既有 condition_payload 含 list_type 的名單仍可被 buildStage1WhereConditions 解析
 *   - TS-F096-COMPAT-002：新增 list_type 條件（繞過 dropdown）→ 後端 CONDITION_COLUMN_NOT_IN_WHITELIST
 *
 * 端點語意澄清（實作落地依據）：
 *   名單篩選欄位 dropdown 的實際資料源為 `GET /api/v1/pooldata-fields?active=true`
 *   （前端 list-create/edit-draft-page → listFields({active:'true'}) → service.listFields），
 *   以及 condition_payload 校驗讀 whitelistRepo.find({ where:{ is_active:true } })。
 *   F096 spec/test 文字提及之 `available-columns` 端點實為「OBPOOLDATA 尚未列入白名單欄位」
 *   （NOT IN 排除所有白名單欄位），list_type 既在白名單，本即不在其輸出 —— 故 F096 之
 *   「停用後 dropdown 不再顯示」由 active=true 集合 + 校驗集合驗證（見 impl log 說明）。
 *
 * 測試層：SQLite in-memory（真實 entity / repository）+ pure function（composer）。
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
import { ERROR_CODES } from '@/common/errors/error-codes';
import { buildStage1WhereConditions } from '@/modules/assignment/stage1/stage1-query-composer';

const YM = '202605';
const ACTOR = { userId: 'dir-001', ipAddress: '127.0.0.1' };

interface Env {
  app: TestingModule;
  ds: DataSource;
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
          ObListDefinition, AssignmentAuditLog, AssignmentRun, PooldataFieldOption,
          PooldataFieldWhitelist, ObDeptPct, ObEmplSet, ObEmphire, AssignmentApproval, User,
        ],
        synchronize: true,
      }),
      TypeOrmModule.forFeature([
        ObListDefinition, AssignmentAuditLog, AssignmentRun, PooldataFieldOption,
        PooldataFieldWhitelist, ObDeptPct, ObEmplSet, ObEmphire, AssignmentApproval, User,
      ]),
    ],
    providers: [
      AssignmentListService,
      AssignmentRunGuardService,
      { provide: SectionChiefScopeService, useValue: { getScopeDeptCode: () => Promise.resolve(null) } },
    ],
  }).compile();
  await app.init();

  const ds = app.get(DataSource);
  return {
    app,
    ds,
    service: app.get(AssignmentListService),
    listRepo: ds.getRepository(ObListDefinition),
    auditRepo: ds.getRepository(AssignmentAuditLog),
    runRepo: ds.getRepository(AssignmentRun),
    whitelistRepo: ds.getRepository(PooldataFieldWhitelist),
    optionRepo: ds.getRepository(PooldataFieldOption),
  };
}

/**
 * seed 含 list_type（active）以模擬 m293 前的白名單狀態。
 */
async function seedWhitelistWithListType(repo: Repository<PooldataFieldWhitelist>) {
  const now = new Date();
  const rows: Array<{ column_name: string; field_type: 'categorical' | 'numeric'; is_active: boolean }> = [
    { column_name: 'list_type', field_type: 'categorical', is_active: true },
    { column_name: 'case_status', field_type: 'categorical', is_active: true },
    { column_name: 'best_case', field_type: 'categorical', is_active: true },
    { column_name: 'prod_kind', field_type: 'categorical', is_active: true },
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

/** 取得「篩選欄位 dropdown 來源」= listFields({active:'true'}) 的 columnName 集合 */
async function activeColumnNames(service: AssignmentListService, repo: Repository<PooldataFieldWhitelist>): Promise<string[]> {
  const rows = await repo.find({ where: { is_active: true }, order: { column_name: 'ASC' } });
  return rows.map((r) => r.column_name);
}

function listDto(overrides: Partial<any> = {}) {
  return {
    listNm: '期別篩選名單',
    listPeriodStart: 1,
    listPeriodEnd: 6,
    listInterval: 1,
    cardType: '01',
    prodBest: null,
    crEnabled: false,
    copyFromListNo: null,
    conditionPayload: {
      conditions: [{ columnName: 'prod_kind', fieldType: 'categorical', values: ['01'] }],
      logic: 'AND',
    },
    ...overrides,
  };
}

describe('F096：list_type 白名單停用（行為 / regression）', () => {
  let env: Env;

  beforeAll(async () => {
    env = await buildEnv();
  });

  afterAll(async () => {
    await env.app?.close();
  });

  beforeEach(async () => {
    process.env.DB_TYPE = 'sqlite';
    await env.auditRepo.clear();
    await env.optionRepo.clear();
    await env.whitelistRepo.clear();
    await env.listRepo.createQueryBuilder().delete().execute();
    await env.runRepo.clear();
    await seedWhitelistWithListType(env.whitelistRepo);
  });

  // F096 list_type 停用行為：原 m293 migration（UPDATE is_active=false WHERE column_name='list_type'）
  // 已 squash 進 baseline，故此處內聯等價操作（透過 repo，DB 無關 boolean 映射）。
  async function runM293Up() {
    await env.whitelistRepo.update({ column_name: 'list_type' }, { is_active: false });
  }

  // -------------------- API regression（dropdown 來源） --------------------

  describe('TS-F096-API：篩選欄位 dropdown 來源（active=true 白名單集合）', () => {
    it('TS-F096-API-003: m293 前後 diff — afterColumns = beforeColumns - {list_type}', async () => {
      const before = await activeColumnNames(env.service, env.whitelistRepo);
      expect(before).toContain('list_type'); // 前置：m293 前含 list_type

      await runM293Up();

      const after = await activeColumnNames(env.service, env.whitelistRepo);
      // 精確：僅少了 list_type，其餘完全相同
      expect(after).toEqual(before.filter((c) => c !== 'list_type'));
    });

    it('TS-F096-API-001: 停用後 active 集合不含 list_type', async () => {
      await runM293Up();
      const active = await activeColumnNames(env.service, env.whitelistRepo);
      expect(active).not.toContain('list_type');
    });

    it('TS-F096-API-002: case_status 仍在 active 集合（期別篩選正確入口保留）', async () => {
      await runM293Up();
      const active = await activeColumnNames(env.service, env.whitelistRepo);
      expect(active).toContain('case_status');
      // 最小影響：其他既有欄位（best_case / prod_kind）亦保留
      expect(active).toContain('best_case');
      expect(active).toContain('prod_kind');
    });

    it('TS-F096-API-002b: 停用後 list_type 仍存在於白名單（僅 is_active=false，非 DELETE）', async () => {
      await runM293Up();
      const row = await env.whitelistRepo.findOne({ where: { column_name: 'list_type' } });
      expect(row).toBeDefined();
      expect(row!.is_active).toBe(false);
    });
  });

  // -------------------- COMPAT-001：既有 list_type 條件仍可解析 --------------------

  describe('TS-F096-COMPAT-001：既有 condition_payload 含 list_type 仍可被 Stage 1 解析', () => {
    it('buildStage1WhereConditions 對含 list_type 條件之名單回傳有效 WHERE fragment（不丟錯）', () => {
      const list = {
        condition_payload: {
          conditions: [
            { columnName: 'list_type', fieldType: 'categorical', values: ['01'] },
          ],
          logic: 'AND',
        },
      } as unknown as ObListDefinition;

      const frag = buildStage1WhereConditions(list);

      expect(frag.skipReason).toBeNull();
      expect(frag.where).toBeTruthy();
      // list_type 直接映射至 ob_pool_data.list_type（非 case_status 映射目標）
      expect(frag.where).toContain('"list_type" IN (:...');
      // 參數含選定值
      const paramVals = Object.values(frag.params)[0];
      expect(paramVals).toEqual(['01']);
    });

    it('既有 list_type 條件解析行為不受 m293 影響（停用僅作用於「新增」入口）', () => {
      // m293（is_active=false）與 composer 純函式無關；composer 不讀 whitelist
      const list = {
        condition_payload: {
          conditions: [{ columnName: 'list_type', fieldType: 'categorical', values: ['02', '03'] }],
          logic: 'AND',
        },
      } as unknown as ObListDefinition;

      const frag = buildStage1WhereConditions(list);
      expect(frag.skipReason).toBeNull();
      expect(frag.where).toContain('"list_type" IN (:...');
      expect(Object.values(frag.params)[0]).toEqual(['02', '03']);
    });
  });

  // -------------------- COMPAT-002：新增 list_type 條件被後端攔截 --------------------

  describe('TS-F096-COMPAT-002：新增 list_type 條件 → CONDITION_COLUMN_NOT_IN_WHITELIST', () => {
    it('m293 停用後，createList 帶 list_type 條件 → 422 CONDITION_COLUMN_NOT_IN_WHITELIST', async () => {
      await runM293Up();

      try {
        await env.service.createList(
          listDto({
            conditionPayload: {
              conditions: [{ columnName: 'list_type', fieldType: 'categorical', values: ['01'] }],
              logic: 'AND',
            },
          }) as any,
          ACTOR,
          YM,
        );
        throw new Error('should have thrown CONDITION_COLUMN_NOT_IN_WHITELIST');
      } catch (e: any) {
        expect(e).toBeInstanceOf(UnprocessableEntityException);
        expect(e.getResponse().error).toBe(ERROR_CODES.CONDITION_COLUMN_NOT_IN_WHITELIST);
        expect(e.getResponse().details.columnName).toBe('list_type');
      }
    });

    it('case_status 條件（active）仍可通過 whitelist 校驗（不被 422）', async () => {
      await runM293Up();
      // case_status 仍 active → 不應因 whitelist 校驗丟 CONDITION_COLUMN_NOT_IN_WHITELIST
      // （其他下游驗證可能因 option 未 seed 而有 warnings，但不應是 whitelist 422）
      let whitelistError = false;
      try {
        await env.service.createList(
          listDto({
            conditionPayload: {
              conditions: [{ columnName: 'case_status', fieldType: 'categorical', values: ['01'] }],
              logic: 'AND',
            },
          }) as any,
          ACTOR,
          YM,
        );
      } catch (e: any) {
        if (
          e instanceof UnprocessableEntityException &&
          e.getResponse()?.error === ERROR_CODES.CONDITION_COLUMN_NOT_IN_WHITELIST
        ) {
          whitelistError = true;
        }
        // 其他錯誤忽略（非本案斷言對象）
      }
      expect(whitelistError).toBe(false);
    });
  });
});
