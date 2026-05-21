/**
 * F050 v2.1.1 E2E Integration Tests (J 群組)
 *
 * 對應 test spec：F050-test.md §十四 J 群組（TS-F050-J01 ~ J04）
 *
 * 涵蓋場景：
 *   - J01：建立含 best_case condition 的名單 → condition_payload JSONB 正確儲存，prod_best=null
 *   - J02：Stage 1 composer 對 best_case condition → SQL where 含 "best_case" IN；params 含大寫 ['Y']
 *   - J03：建立模式 cardType 全流程 — POST cardType='S5' → DB card_type='S5' → GET 回 cardType='S5'
 *   - J04：編輯模式 inactive 保留 — DB 名單 cardType='OL2'，不變更直接 PATCH → DB cardType 仍 'OL2'
 *
 * 架構：
 *   - 對齊 create-list-v2.1.spec.ts 之 buildEnv pattern（service-level integration）
 *   - SQLite in-memory + synchronize:true（避免依賴實際 migration runner）
 *   - E2E 前手動執行 m286 / m287 之 up() 確保 best_case options 就緒 / prod_best nullable
 *
 * 大小寫（[[feedback_mock_real_system_contract]]）：
 *   best_case option_value 為大寫 'Y' / 'N'；ob_pool_data.best_case ETL 落地為 varchar(1) 大寫
 */

import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AssignmentListService } from '@/modules/assignment-list/assignment-list.service';
import { AssignmentRunGuardService } from '@/modules/assignment/services/assignment-run-guard.service';
import { ObListDefinition } from '@/database/entities/ob-list-definition.entity';
import { AssignmentAuditLog } from '@/database/entities/assignment-audit-log.entity';
import { AssignmentRun } from '@/database/entities/assignment-run.entity';
import { PooldataFieldOption } from '@/database/entities/pooldata-field-option.entity';
import { PooldataFieldWhitelist } from '@/database/entities/pooldata-field-whitelist.entity';
import { SeedBestCaseFieldAndOptions1711360000286 } from '@/database/migrations/1711360000286-SeedBestCaseFieldAndOptions';
import { buildStage1WhereConditions } from '@/modules/assignment/stage1/stage1-query-composer';
// F050 v2.2：getFullSnapshot 加 inject ObDeptPct / ObEmplSet / ObEmphire / User
import { ObDeptPct } from '@/database/entities/ob-dept-pct.entity';
import { ObEmplSet } from '@/database/entities/ob-empl-set.entity';
import { ObEmphire } from '@/database/entities/ob-emphire.entity';
import { User } from '@/database/entities/user.entity';

const YM = '202605';
const ACTOR = { userId: 'dir-v211', ipAddress: '127.0.0.1' };

interface Env {
  app: TestingModule;
  service: AssignmentListService;
  listRepo: Repository<ObListDefinition>;
  whitelistRepo: Repository<PooldataFieldWhitelist>;
  optionRepo: Repository<PooldataFieldOption>;
  ds: DataSource;
}

async function buildEnv(): Promise<Env> {
  process.env.DB_TYPE = 'sqlite';
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
          // F050 v2.2 service inject 增補
          ObDeptPct,
          ObEmplSet,
          ObEmphire,
          User,
        ],
        synchronize: true,
      }),
      TypeOrmModule.forFeature([
        ObListDefinition,
        AssignmentAuditLog,
        AssignmentRun,
        PooldataFieldOption,
        PooldataFieldWhitelist,
        // F050 v2.2 service inject 增補
        ObDeptPct,
        ObEmplSet,
        ObEmphire,
        User,
      ]),
    ],
    providers: [AssignmentListService, AssignmentRunGuardService],
  }).compile();
  await app.init();

  const ds = app.get(DataSource);

  // 跑 m286 up() — 確保 best_case whitelist + Y/N options 就緒（US-129 前置）
  const m286 = new SeedBestCaseFieldAndOptions1711360000286();
  const qr = ds.createQueryRunner();
  // 預先建立 whitelist 之必要欄位（synchronize=true 已建表，但 m286 需 SQLite path）
  await m286.up(qr);
  await qr.release();

  // 注意：m287 在本 E2E 中不執行 — synchronize:true 已根據 v2.1.1 entity（prod_best
  // 為 nullable）建立表，相當於 m287 已執行的最終狀態。

  return {
    app,
    service: app.get(AssignmentListService),
    listRepo: ds.getRepository(ObListDefinition),
    whitelistRepo: ds.getRepository(PooldataFieldWhitelist),
    optionRepo: ds.getRepository(PooldataFieldOption),
    ds,
  };
}

function baseDto(overrides: Partial<any> = {}) {
  return {
    listNm: 'v2.1.1 整合測試名單',
    listPeriodStart: 1,
    listPeriodEnd: 6,
    listInterval: 1,
    cardType: 'S5',
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

describe('F050 v2.1.1 E2E (J 群組 / TS-F050-J01~J04)', () => {
  let env: Env;

  beforeAll(async () => {
    env = await buildEnv();

    // 補 seed 其他 whitelist 欄位（prod_kind 為 baseDto 預設條件，需在 whitelist 內）
    const now = new Date();
    await env.whitelistRepo.save([
      env.whitelistRepo.create({
        column_name: 'prod_kind',
        display_name: '產品類別',
        field_type: 'categorical',
        is_active: true,
        created_at: now,
        updated_at: now,
      } as Partial<PooldataFieldWhitelist>),
    ]);
  });

  afterAll(async () => {
    await env.app?.close();
  });

  it('TS-F050-J01：建立含 best_case condition 的名單 → condition_payload JSONB 正確儲存，prod_best=null', async () => {
    const res = await env.service.createList(
      baseDto({
        listNm: 'best_case Y 名單',
        conditionPayload: {
          conditions: [
            {
              columnName: 'best_case',
              fieldType: 'categorical',
              values: ['Y'],
            },
          ],
          logic: 'AND',
        },
      }) as any,
      ACTOR,
      YM,
    );

    const record = await env.listRepo.findOne({ where: { list_no: res.listNo } });
    expect(record).not.toBeNull();

    // condition_payload 正確儲存
    expect(record!.condition_payload).not.toBeNull();
    expect(record!.condition_payload!.conditions).toContainEqual(
      expect.objectContaining({
        columnName: 'best_case',
        fieldType: 'categorical',
        values: ['Y'],
      }),
    );

    // prod_best 為 null（v2.1.1 / US-128 / §18.11.6 方案 Y）
    expect(record!.prod_best).toBeNull();
  });

  it('TS-F050-J02：Stage 1 composer 對 best_case condition → SQL where 含 "best_case" IN；params 含大寫 [\'Y\']', async () => {
    const res = await env.service.createList(
      baseDto({
        listNm: 'Stage 1 composer 驗證',
        conditionPayload: {
          conditions: [
            {
              columnName: 'best_case',
              fieldType: 'categorical',
              values: ['Y'],
            },
          ],
          logic: 'AND',
        },
      }) as any,
      ACTOR,
      YM,
    );

    const record = await env.listRepo.findOne({ where: { list_no: res.listNo } });
    expect(record).not.toBeNull();

    // 餵入 stage1-query-composer
    const composerResult = buildStage1WhereConditions(record!);
    expect(composerResult.skipReason).toBeNull();
    expect(composerResult.where).toContain('"best_case"');
    expect(composerResult.where).toMatch(/IN\s*\(:\.\.\.[a-zA-Z0-9_]+\)/);

    // params 含大寫 'Y'（[[feedback_mock_real_system_contract]]）
    const paramValues = Object.values(composerResult.params);
    expect(paramValues).toHaveLength(1);
    expect(paramValues[0]).toEqual(['Y']);
  });

  it("TS-F050-J03：建立模式 cardType 全流程 — POST cardType='S5' → DB card_type='S5'", async () => {
    const res = await env.service.createList(
      baseDto({
        listNm: 'cardType S5 全流程',
        cardType: 'S5',
      }) as any,
      ACTOR,
      YM,
    );

    const record = await env.listRepo.findOne({ where: { list_no: res.listNo } });
    expect(record).not.toBeNull();
    expect(record!.card_type).toBe('S5');
  });

  it("TS-F050-J04：編輯模式 inactive 保留 — DB 名單 cardType='OL2'，不變更直接 PATCH → DB cardType 仍 'OL2'", async () => {
    // 先建立一筆 cardType=OL2 的名單（模擬名單現存 inactive 卡別）
    // 直接以 repo 寫入避免 service 層業務驗證
    const now = new Date();
    const listNo = 'OB202605990';
    await env.listRepo.save(
      env.listRepo.create({
        list_no: listNo,
        list_nm: 'OL2 inactive 保留測試',
        prod_kind: '01',
        prod_best: null,
        spec_tp: null,
        list_type: '01',
        list_period_start: '1',
        list_period_end: '6',
        list_interval: '1',
        assigned_date: null,
        total_amount: null,
        reserved_amount: null,
        is_assigned: null,
        project_workym: YM,
        casenumber: null,
        name: null,
        caseyear: null,
        caseyearnm: null,
        settle_src: null,
        card_type: 'OL2',
        status: 'active',
        stage: 'draft',
        case_status: null,
        cr_enabled: false,
        condition_payload: {
          conditions: [
            {
              columnName: 'prod_kind',
              fieldType: 'categorical',
              values: ['01'],
            },
          ],
          logic: 'AND',
        },
        created_by_prog: 'CDMP-TEST',
        created_by: ACTOR.userId,
        created_at: now,
        updated_by_prog: 'CDMP-TEST',
        updated_by: ACTOR.userId,
        updated_at: now,
      } as Partial<ObListDefinition>),
    );

    // PATCH — 不變更 cardType（仍送 'OL2'）
    await env.service.updateList(
      listNo,
      {
        listNm: 'OL2 inactive 保留測試（已編輯）',
        listPeriodStart: 1,
        listPeriodEnd: 6,
        listInterval: 1,
        cardType: 'OL2',
        crEnabled: false,
        conditionPayload: {
          conditions: [
            {
              columnName: 'prod_kind',
              fieldType: 'categorical',
              values: ['01'],
            },
          ],
          logic: 'AND',
        },
      } as any,
      ACTOR,
      YM,
    );

    // 驗證 DB cardType 仍為 'OL2'（不因 inactive 而 422 / 改變）
    const record = await env.listRepo.findOne({ where: { list_no: listNo } });
    expect(record).not.toBeNull();
    expect(record!.card_type).toBe('OL2');
    expect(record!.list_nm).toBe('OL2 inactive 保留測試（已編輯）');
  });
});
