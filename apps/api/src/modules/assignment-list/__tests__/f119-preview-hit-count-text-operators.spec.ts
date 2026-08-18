/**
 * F119 / US-183 — AssignmentListService.previewHitCount 透過文字比對運算子之黑箱行為驗證。
 *
 * 撰寫依據：F119 spec AC-2/AC-3/AC-4/AC-9/AC-11 + AD-E07-50 §3.2/§3.3/§3.8 + US-183 TC-183-02~04/07。
 * **未**開啟 `assignment-list.service.ts` 生產碼；`previewHitCount` 之簽章、回傳形狀
 * （estimatedHitCount/isEstimate/sampleSize/totalCount）、buildEnv 與 seedPool 慣例取自既有
 * 測試檔 `preview-hit-count.spec.ts`（允許範圍：既有測試檔）。
 *
 * 母體 ≤ 50000（小母體 fallback，AD-E07-45）→ 估算值 == 精確命中數，可於 better-sqlite3
 * in-memory 驗證篩選邏輯本身（非僅字串形狀），這是本檔相對 stage1 純函式測試更強的一層黑箱證據——
 * 呼叫端完全不知道 buildCategoricalOperatorFragment 內部如何運作，只驗證「篩選結果」。
 *
 * `ob_pool_data.spec_name` 為 US-183 之主要業務範例欄位（F119 assumption A-1：現行 seed 未含此
 * 白名單項目，本測試自行 seed，不依賴真實 seed 狀態）。
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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
import { ObPoolData } from '@/database/entities/ob-pool-data.entity';
import { PooldataFieldOption } from '@/database/entities/pooldata-field-option.entity';
import { PooldataFieldWhitelist } from '@/database/entities/pooldata-field-whitelist.entity';
import { ObDeptPct } from '@/database/entities/ob-dept-pct.entity';
import { ObEmplSet } from '@/database/entities/ob-empl-set.entity';
import { ObEmphire } from '@/database/entities/ob-emphire.entity';
import { AssignmentApproval } from '@/database/entities/assignment-approval.entity';
import { User } from '@/database/entities/user.entity';
import { ERROR_CODES } from '@/common/errors/error-codes';

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

const WORKDT = new Date(Date.UTC(2026, 6, 1));

describe('F119 previewHitCount — 文字比對運算子（AC-2/AC-3/AC-4/AC-9/AC-11）', () => {
  let app: TestingModule;
  let ds: DataSource;
  let service: AssignmentListService;
  let poolRepo: Repository<ObPoolData>;
  let whitelistRepo: Repository<PooldataFieldWhitelist>;

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

    const now = new Date();
    await whitelistRepo.save([
      // BR-14 / AC-11：spec_name 無任何 pooldata_field_option 登錄（零可選值）仍須可用文字運算子
      whitelistRepo.create({
        column_name: 'spec_name', display_name: '主約專案名稱', field_type: 'categorical',
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

  async function seedPool(rows: Array<{ appl_no: string; spec_name?: string | null }>) {
    for (const r of rows) {
      await poolRepo.save(
        poolRepo.create({
          orgno: '01',
          appl_no: r.appl_no,
          custo_no: r.appl_no,
          sta_code: '05',
          dept_id: 'XTA0',
          list_type: '01',
          settle_src: 'N',
          spec_name: r.spec_name ?? null,
          best_case: 'Y',
          _cdmp_extracted_at: new Date(),
        } as Partial<ObPoolData>),
      );
    }
  }

  function conditionPayload(operator: string, keyword: string) {
    return {
      conditions: [{ columnName: 'spec_name', fieldType: 'categorical' as const, operator, keyword }],
      logic: 'AND' as const,
    };
  }

  // ── AC-2：contains，NULL 排除 ────────────────────────────────────────────
  it('T-1 / AC-2：contains → 含關鍵字命中，NULL 不命中', async () => {
    await seedPool([
      { appl_no: '0000000001', spec_name: '勁便利機車專案' },
      { appl_no: '0000000002', spec_name: '一般專案' },
      { appl_no: '0000000003', spec_name: null },
    ]);
    const result = await service.previewHitCount(conditionPayload('contains', '勁便利') as never, WORKDT);
    expect(result.estimatedHitCount).toBe(1);
  });

  // ── AC-3（★核心）：not_contains，NULL 保留（ob_pool_data 唯一例外）────────
  it('T-2 / AC-3（★核心）：not_contains → 不含關鍵字 + NULL 皆命中（不對稱）', async () => {
    await seedPool([
      { appl_no: '0000000001', spec_name: '勁便利機車專案' }, // 排除
      { appl_no: '0000000002', spec_name: '一般專案' }, // 保留
      { appl_no: '0000000003', spec_name: null }, // 保留（★不對稱）
    ]);
    const result = await service.previewHitCount(conditionPayload('not_contains', '勁便利') as never, WORKDT);
    expect(result.estimatedHitCount).toBe(2);
  });

  // ── AC-4：equals，逐字元相同 ────────────────────────────────────────────
  it('T-5 / AC-4：equals → 僅逐字元完全相同命中，"勁便利專案" 不算命中', async () => {
    await seedPool([
      { appl_no: '0000000001', spec_name: '勁便利' },
      { appl_no: '0000000002', spec_name: '勁便利專案' },
      { appl_no: '0000000003', spec_name: null },
    ]);
    const result = await service.previewHitCount(conditionPayload('equals', '勁便利') as never, WORKDT);
    expect(result.estimatedHitCount).toBe(1);
  });

  // ── AC-9 / BR-7：特殊字元字面值（未跳脫必紅）───────────────────────────
  it('T-6 / AC-9（★核心，未跳脫必紅）：關鍵字 "100%" 不得誤命中 "1000元的商品"', async () => {
    await seedPool([
      { appl_no: '0000000001', spec_name: '達成率100%達標專案' },
      { appl_no: '0000000002', spec_name: '1000元的商品專案' },
    ]);
    const result = await service.previewHitCount(conditionPayload('contains', '100%') as never, WORKDT);
    expect(result.estimatedHitCount).toBe(1);
  });

  it('T-6b：關鍵字含 "_" 不得誤命中任意單一字元之列', async () => {
    await seedPool([
      { appl_no: '0000000001', spec_name: '型號A_B規格專案' },
      { appl_no: '0000000002', spec_name: '型號AXB規格專案' },
    ]);
    const result = await service.previewHitCount(conditionPayload('contains', 'A_B') as never, WORKDT);
    expect(result.estimatedHitCount).toBe(1);
  });

  // ── AC-11 / BR-14：零可選值欄位仍可用文字運算子（本檔全程未 seed PooldataFieldOption，
  //    即示範零可選值情境） ─────────────────────────────────────────────
  it('T-29 / AC-11：spec_name 無任何 pooldata_field_option 登錄，previewHitCount 仍正確估算（後端不因零可選值而阻擋）', async () => {
    await seedPool([
      { appl_no: '0000000001', spec_name: '勁便利機車專案' },
      { appl_no: '0000000002', spec_name: '一般專案' },
    ]);
    const result = await service.previewHitCount(conditionPayload('contains', '勁便利') as never, WORKDT);
    expect(result.estimatedHitCount).toBe(1);
    expect(result.isEstimate).toBeDefined();
  });

  // ── I-CATOP-CASEYEAR-EXCLUDE-01：驗證層黑箱證據（previewHitCount 亦須擋下） ──
  it('CASEYEAR-PREVIEW-001：previewHitCount 對 caseyear + 文字運算子 → 422 VALIDATION_ERROR（AD §3.9 validateConditionsForPreview）', async () => {
    await whitelistRepo.save(
      whitelistRepo.create({
        column_name: 'caseyear', display_name: '進件年數', field_type: 'categorical',
        is_active: true, dataSource: 'ob_pool_data', isSystemFixed: false,
        created_at: new Date(), updated_at: new Date(),
      } as Partial<PooldataFieldWhitelist>),
    );
    const payload = {
      conditions: [{ columnName: 'caseyear', fieldType: 'categorical' as const, operator: 'contains', keyword: '1' }],
      logic: 'AND' as const,
    };
    try {
      await service.previewHitCount(payload as never, WORKDT);
      throw new Error('expected throw');
    } catch (e: unknown) {
      expect(e).toBeInstanceOf(UnprocessableEntityException);
      const body = (e as UnprocessableEntityException).getResponse() as { error?: string };
      expect(body.error).toBe(ERROR_CODES.VALIDATION_ERROR);
    }
  });
});
