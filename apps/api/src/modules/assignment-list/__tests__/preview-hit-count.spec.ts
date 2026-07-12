/**
 * F050 v2.4 §6.3：AssignmentListService.previewHitCount — 草稿命中筆數抽樣估算（US-176 / AD-E07-45）。
 *
 * S 群組（基本契約 + 範圍限定 + BR-14 + 驗證 + 讀鎖豁免）+ Y 群組（RBAC metadata）。
 * 抽樣核心元件之常數 / scaleEstimate / buildPoolDataSampleFrom 唯一測試位於 sampling-estimator.spec.ts；
 * customer_core（T 群組）需真實 MSSQL，見 preview-hit-count-customer-core.mssql.spec.ts。
 *
 * 小母體（ob_pool_data ≤ 50000）→ buildPoolDataSampleFrom 走全表 fallback（無 TABLESAMPLE），
 * scaleEstimate 為恆等 → 估算值 == 精確命中數，可於 better-sqlite3 in-memory 驗證。
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BadRequestException, UnprocessableEntityException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AssignmentListService } from '../assignment-list.service';
import { Stage0EstimateController } from '../stage0-estimate.controller';
import { AssignmentRunGuardService } from '@/modules/assignment/services/assignment-run-guard.service';
import { SectionChiefScopeService } from '@/modules/assignment/services/section-chief-scope.service';
import * as filterChain from '@/modules/assignment/stage1/stage1-filter-chain';
import * as ccModule from '@/modules/assignment/stage1/stage1-customer-core-clause';
import { REQUIRE_DIRECTOR_KEY } from '@/common/decorators/business-role.decorator';
import { ObListDefinition } from '@/database/entities/ob-list-definition.entity';
import { AssignmentAuditLog } from '@/database/entities/assignment-audit-log.entity';
import { AssignmentRun } from '@/database/entities/assignment-run.entity';
import { ObPoolData } from '@/database/entities/ob-pool-data.entity';
import { PooldataFieldOption } from '@/database/entities/pooldata-field-option.entity';
import { PooldataFieldWhitelist } from '@/database/entities/pooldata-field-whitelist.entity';
import { ObDeptPct } from '@/database/entities/ob-dept-pct.entity';
import { ObEmplSet } from '@/database/entities/ob-empl-set.entity';
import { ObEmphire } from '@/database/entities/ob-emphire.entity';
import { AssignmentApproval } from '@/database/entities/assignment-approval.entity';
import { User } from '@/database/entities/user.entity';

const ENTITIES = [
  ObListDefinition,
  AssignmentAuditLog,
  AssignmentRun,
  ObPoolData,
  PooldataFieldOption,
  PooldataFieldWhitelist,
  ObDeptPct,
  ObEmplSet,
  ObEmphire,
  AssignmentApproval,
  User,
];

const WORKDT = new Date(Date.UTC(2026, 6, 1)); // 2026-07-01

describe('AssignmentListService.previewHitCount (F050 §6.3 / AD-E07-45)', () => {
  let app: TestingModule;
  let ds: DataSource;
  let service: AssignmentListService;
  let poolRepo: Repository<ObPoolData>;
  let whitelistRepo: Repository<PooldataFieldWhitelist>;
  let runRepo: Repository<AssignmentRun>;

  beforeEach(async () => {
    app = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'better-sqlite3',
          database: ':memory:',
          entities: ENTITIES,
          synchronize: true,
        }),
        TypeOrmModule.forFeature(ENTITIES),
      ],
      providers: [
        AssignmentListService,
        AssignmentRunGuardService,
        { provide: SectionChiefScopeService, useValue: {} },
      ],
    }).compile();
    await app.init();

    ds = app.get(DataSource);
    service = app.get(AssignmentListService);
    poolRepo = ds.getRepository(ObPoolData);
    whitelistRepo = ds.getRepository(PooldataFieldWhitelist);
    runRepo = ds.getRepository(AssignmentRun);

    // 白名單：prod_kind（categorical, active）+ best_case（categorical, active, system-fixed）
    const now = new Date();
    await whitelistRepo.save([
      whitelistRepo.create({
        column_name: 'prod_kind', display_name: '產品類別', field_type: 'categorical',
        is_active: true, dataSource: 'ob_pool_data', isSystemFixed: false,
        created_at: now, updated_at: now,
      } as Partial<PooldataFieldWhitelist>),
      whitelistRepo.create({
        column_name: 'best_case', display_name: '優質案件', field_type: 'categorical',
        is_active: true, dataSource: 'ob_pool_data', isSystemFixed: true,
        created_at: now, updated_at: now,
      } as Partial<PooldataFieldWhitelist>),
    ]);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await app.close();
  });

  async function seedPool(
    rows: Array<{ orgno: string; appl_no: string; prod_kind?: string | null; best_case?: string }>,
  ) {
    for (const r of rows) {
      await poolRepo.save(
        poolRepo.create({
          orgno: r.orgno,
          appl_no: r.appl_no,
          custo_no: r.appl_no,
          sta_code: '05',
          dept_id: 'XTA0',
          list_type: '01',
          settle_src: 'N',
          prod_kind: r.prod_kind ?? null,
          best_case: r.best_case ?? 'Y',
          _cdmp_extracted_at: new Date(),
        } as Partial<ObPoolData>),
      );
    }
  }

  /** 產生 n 筆 pool 列（orgno='01'，appl_no 補零）。 */
  function makeRows(n: number, prodKind: (i: number) => string | null, bestCase: (i: number) => string) {
    return Array.from({ length: n }, (_, i) => ({
      orgno: '01',
      appl_no: String(i).padStart(10, '0'),
      prod_kind: prodKind(i),
      best_case: bestCase(i),
    }));
  }

  // ── TS-F050-S01：契約 ───────────────────────────────────────────────────
  it('TS-F050-S01：回傳 estimatedHitCount / isEstimate / sampleSize / totalCount 契約', async () => {
    await seedPool(makeRows(100, (i) => (i < 30 ? '01' : '02'), () => 'Y'));
    const result = await service.previewHitCount(
      { conditions: [{ columnName: 'prod_kind', fieldType: 'categorical', values: ['01'] }], logic: 'AND' } as any,
      WORKDT,
    );
    expect(typeof result.estimatedHitCount).toBe('number');
    expect(result.isEstimate).toBe(true);
    expect(typeof result.sampleSize).toBe('number');
    expect(typeof result.totalCount).toBe('number');
    expect(result.totalCount).toBe(100);
    expect(result.sampleSize).toBe(100); // 小母體 fallback
  });

  // ── TS-F050-S02：反映真實條件（非假公式）─────────────────────────────────
  it('TS-F050-S02：估算數字反映真實篩選（prod_kind=01 恰 30 筆），非 12500*0.85 假公式', async () => {
    // 100 筆 best_case='Y'，其中 30 筆 prod_kind='01'
    await seedPool(makeRows(100, (i) => (i < 30 ? '01' : '02'), () => 'Y'));
    const result = await service.previewHitCount(
      { conditions: [{ columnName: 'prod_kind', fieldType: 'categorical', values: ['01'] }], logic: 'AND' } as any,
      WORKDT,
    );
    expect(result.estimatedHitCount).toBe(30); // 小母體 fallback → 精確
    expect(result.estimatedHitCount).not.toBe(10625); // 明確非假公式輸出
  });

  // ── TS-F050-S03：範圍限定（D2）— 不呼叫 executeStage1Chain ─────────────────
  it('TS-F050-S03：僅欄位篩選子步驟，不涉及 executeStage1Chain（MONTH_CNT/去重/特殊 DELETE 排除）', async () => {
    await seedPool(makeRows(50, () => '01', () => 'Y'));
    const chainSpy = vi.spyOn(filterChain, 'executeStage1Chain');
    await service.previewHitCount(
      { conditions: [{ columnName: 'prod_kind', fieldType: 'categorical', values: ['01'] }], logic: 'AND' } as any,
      WORKDT,
    );
    expect(chainSpy).not.toHaveBeenCalled();
  });

  // ── TS-F050-S04：BR-14 先注入 best_case ────────────────────────────────
  it('TS-F050-S04：conditions=[] 時仍先注入 best_case=Y（僅估 best_case=Y 之 60 筆）', async () => {
    // 60 筆 Y + 40 筆 N
    await seedPool(makeRows(100, () => '01', (i) => (i < 60 ? 'Y' : 'N')));
    const result = await service.previewHitCount(
      { conditions: [], logic: 'AND' } as any,
      WORKDT,
    );
    expect(result.estimatedHitCount).toBe(60);
  });

  // ── TS-F050-S05：reserved → 400 ───────────────────────────────────────
  it('TS-F050-S05：一級保留欄位 list_period_start 入 conditions → 400 RESERVED_FIELD_IN_CONDITIONS', async () => {
    await expect(
      service.previewHitCount(
        { conditions: [{ columnName: 'list_period_start', fieldType: 'numeric', min: 1, max: 12 }], logic: 'AND' } as any,
        WORKDT,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  // ── TS-F050-S06：whitelist → 422 ──────────────────────────────────────
  it('TS-F050-S06：columnName 不在白名單 → 422 CONDITION_COLUMN_NOT_IN_WHITELIST', async () => {
    try {
      await service.previewHitCount(
        { conditions: [{ columnName: 'invalid_field', fieldType: 'categorical', values: ['x'] }], logic: 'AND' } as any,
        WORKDT,
      );
      throw new Error('should throw');
    } catch (e: any) {
      expect(e).toBeInstanceOf(UnprocessableEntityException);
      expect(e.getResponse().error).toBe('CONDITION_COLUMN_NOT_IN_WHITELIST');
    }
  });

  // ── TS-F050-S07：不強制最低條件數 ─────────────────────────────────────
  it('TS-F050-S07：conditions=[] 不回 422（本端點不強制 AC-10 最低條件數）', async () => {
    await seedPool(makeRows(10, () => '01', () => 'Y'));
    const result = await service.previewHitCount({ conditions: [], logic: 'AND' } as any, WORKDT);
    expect(result.isEstimate).toBe(true); // 正常回傳，非 422
    expect(result.totalCount).toBe(10);
  });

  // ── TS-F050-S08：讀鎖豁免 ─────────────────────────────────────────────
  it('TS-F050-S08：assignment_run running 時仍正常估算（不攔截 ASSIGNMENT_RUN_ALREADY_RUNNING）', async () => {
    await seedPool(makeRows(20, () => '01', () => 'Y'));
    await runRepo.save(
      runRepo.create({
        run_id: '00000000-0000-0000-0000-0000000000aa',
        project_workym: '202607',
        triggered_by: 'tester',
        created_at: new Date(),
        status: 'running',
      } as Partial<AssignmentRun>),
    );
    const result = await service.previewHitCount(
      { conditions: [{ columnName: 'prod_kind', fieldType: 'categorical', values: ['01'] }], logic: 'AND' } as any,
      WORKDT,
    );
    expect(result.estimatedHitCount).toBe(20);
  });

  // ── TS-F050-T07：customerCoreClause baseAlias 固定 'o'（offline，可離線）─────
  it('TS-F050-T07：buildCustomerCoreClause 之 baseAlias 參數恆為 "o"', async () => {
    await seedPool(makeRows(10, () => '01', () => 'Y'));
    const ccSpy = vi.spyOn(ccModule, 'buildCustomerCoreClause');
    await service.previewHitCount(
      { conditions: [{ columnName: 'prod_kind', fieldType: 'categorical', values: ['01'] }], logic: 'AND' } as any,
      WORKDT,
    );
    expect(ccSpy).toHaveBeenCalled();
    // 簽章：(conditions, workdt, baseAlias, warnings)
    expect(ccSpy.mock.calls[0][2]).toBe('o');
  });

  // ── Y 群組：RBAC metadata（DirectorGuard + @RequireDirector）───────────────
  it('TS-F050-Y02：controller previewHitCount 標註 @RequireDirector（處長不可用，與 F055/F056 不同）', () => {
    const meta = Reflect.getMetadata(
      REQUIRE_DIRECTOR_KEY,
      Stage0EstimateController.prototype.previewHitCount,
    );
    expect(meta).toBe(true);
  });
});
