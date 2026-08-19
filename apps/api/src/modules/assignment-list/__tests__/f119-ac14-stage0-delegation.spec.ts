/**
 * F119 / US-183 — AC-14（★核心）路徑 4（Stage 0 估算）之委派完整性驗證：R-F119-04 缺口補強。
 *
 * 背景：AD-E07-50 §2.1 查證「Stage 0 部門/每日估算（`stage0-estimate.service.ts:817`
 * `dryRunChainCount`）呼叫路徑 3（`executeStage1Chain`），非獨立實作」——即路徑 4 在 SQL/篩選
 * 邏輯層面**沒有自己的程式碼**，其正確性完全由路徑 3 決定。既有 `stage0-estimate-dryrun
 * .service.spec.ts`（F092，TS-F092-DR-004）已用同一 spy 技法證明「dryRun 旗標」正確傳遞，但
 * **未**針對 F119 新增之 `operator`/`keyword` 欄位驗證——若 `Stage0EstimateService` 於呼叫
 * `executeStage1Chain` 前對 `condition_payload` 做任何複製/映射（例如僅挑選部分欄位重組一個新
 * 物件），F119 之 `operator`/`keyword` 有可能在該複製步驟中被靜默遺漏，此時路徑 3 本身正確、
 * 路徑 4 卻因委派失真而與其餘路徑分歧——這正是 AC-14「不得任一路徑自行實作或竄改」對路徑 4
 * 最實際的風險，比「重覆執行路徑 3 比對數字」更能命中此風險（重覆執行只會重新證明路徑 3 自身
 * 正確，證明不了「委派時有沒有走樣」）。
 *
 * 手法：比照既有 F092 spy 慣例（`vi.spyOn(chainModule, 'executeStage1Chain')`），對含 F119
 * 文字比對運算子之 `condition_payload` 呼叫 `estimateListCount`，斷言傳入 `executeStage1Chain`
 * 之 `list.condition_payload.conditions[]` 與存入 DB 之原始條件**逐欄位相同**（含 `operator`/
 * `keyword`，非僅檢查呼叫次數）。SQLite in-memory，不需真實 DB，恆可執行。
 *
 * ⚠️ test-generator 撰寫依據：F119 spec AC-14 + AD-E07-50 §2.1/§8 + 既有測試檔
 * `stage0-estimate-dryrun.service.spec.ts`（允許範圍：既有測試檔之 DI/wiring 慣例，見
 * test-generator agent memory `blindness-practical-exceptions`）。**未**開啟
 * `stage0-estimate.service.ts` 生產碼本體決定斷言內容。
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { Stage0EstimateService } from '../stage0-estimate.service';
import { SectionChiefScopeService } from '@/modules/assignment/services/section-chief-scope.service';
import * as chainModule from '@/modules/assignment/stage1/stage1-filter-chain';
import { ObListDefinition } from '@/database/entities/ob-list-definition.entity';
import { ObPoolData } from '@/database/entities/ob-pool-data.entity';
import { ObPoolDataList } from '@/database/entities/ob-pool-data-list.entity';
import { ObCalendar } from '@/database/entities/ob-calendar.entity';
import { ObDeptPct } from '@/database/entities/ob-dept-pct.entity';
import { ObEmphire } from '@/database/entities/ob-emphire.entity';
import { ObEmplSet } from '@/database/entities/ob-empl-set.entity';
import { User } from '@/database/entities/user.entity';

interface Env {
  service: Stage0EstimateService;
  listRepo: Repository<ObListDefinition>;
  ds: DataSource;
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
          ObPoolData,
          ObPoolDataList,
          ObCalendar,
          ObDeptPct,
          ObEmphire,
          ObEmplSet,
          User,
        ],
        synchronize: true,
      }),
      TypeOrmModule.forFeature([
        ObListDefinition,
        ObPoolData,
        ObPoolDataList,
        ObCalendar,
        ObDeptPct,
        ObEmphire,
        ObEmplSet,
        User,
      ]),
    ],
    providers: [Stage0EstimateService, SectionChiefScopeService],
  }).compile();

  await app.init();
  return {
    service: app.get(Stage0EstimateService),
    listRepo: app.get(getRepositoryToken(ObListDefinition)),
    ds: app.get(DataSource),
    app,
  };
}

async function seedList(
  listRepo: Repository<ObListDefinition>,
  listNo: string,
  conditions: unknown[],
): Promise<void> {
  const now = new Date();
  await listRepo.save(
    listRepo.create({
      list_no: listNo,
      list_nm: '主約專案名稱文字比對名單',
      prod_kind: '',
      prod_best: 'Y',
      list_type: '01',
      list_period_start: '001',
      list_period_end: '012',
      list_interval: '001',
      project_workym: '202606',
      caseyear: null,
      settle_src: null,
      case_status: null,
      cr_enabled: false,
      status: 'active',
      stage: 'draft',
      condition_payload: { logic: 'AND', conditions } as ObListDefinition['condition_payload'],
      created_by_prog: 'TEST',
      created_by: 'tester',
      created_at: now,
      updated_by_prog: 'TEST',
      updated_by: 'tester',
      updated_at: now,
    } as Partial<ObListDefinition>),
  );
}

describe('F119 AC-14（★核心）— 路徑 4（Stage0 估算）委派路徑 3 時不得竄改/遺漏 operator/keyword', () => {
  let env: Env;

  beforeAll(async () => {
    env = await buildModule();
  });

  afterAll(async () => {
    await env.app.close();
  });

  beforeEach(async () => {
    vi.restoreAllMocks();
    await env.ds.query('DELETE FROM ob_list_definition');
  });

  it('AC14-DELEGATE-001（★核心）：contains 條件之 operator/keyword 於委派給 executeStage1Chain 時逐欄位不失真', async () => {
    const conditions = [
      { columnName: 'spec_name', fieldType: 'categorical', operator: 'contains', keyword: '勁便利' },
    ];
    await seedList(env.listRepo, 'F19S000001', conditions);

    const spy = vi.spyOn(chainModule, 'executeStage1Chain');
    await env.service.estimateListCount('F19S000001');

    expect(spy).toHaveBeenCalledTimes(1);
    const passedList = spy.mock.calls[0][0] as ObListDefinition;
    const passedConditions = (
      passedList.condition_payload as unknown as { conditions: Array<Record<string, unknown>> }
    ).conditions;
    expect(passedConditions).toEqual(conditions); // 逐欄位相同，非僅 columnName/fieldType 存活
    expect(passedConditions[0].operator).toBe('contains'); // 未被靜默降級為 in / 遺漏
    expect(passedConditions[0].keyword).toBe('勁便利');
  });

  it('AC14-DELEGATE-002（★核心 / AC-3 不對稱）：not_contains 條件之 operator/keyword 同樣不失真', async () => {
    const conditions = [
      { columnName: 'spec_name', fieldType: 'categorical', operator: 'not_contains', keyword: '勁便利' },
    ];
    await seedList(env.listRepo, 'F19S000002', conditions);

    const spy = vi.spyOn(chainModule, 'executeStage1Chain');
    await env.service.estimateListCount('F19S000002');

    const passedList = spy.mock.calls[0][0] as ObListDefinition;
    const passedConditions = (
      passedList.condition_payload as unknown as { conditions: Array<Record<string, unknown>> }
    ).conditions;
    expect(passedConditions[0].operator).toBe('not_contains');
    expect(passedConditions[0].keyword).toBe('勁便利');
  });

  it('AC14-DELEGATE-003（回歸／AC-17）：無 operator 之既有 in 條件委派時亦不失真（values 陣列逐項相同）', async () => {
    const conditions = [{ columnName: 'prod_kind', fieldType: 'categorical', values: ['01', '02'] }];
    await seedList(env.listRepo, 'F19S000003', conditions);

    const spy = vi.spyOn(chainModule, 'executeStage1Chain');
    await env.service.estimateListCount('F19S000003');

    const passedList = spy.mock.calls[0][0] as ObListDefinition;
    const passedConditions = (
      passedList.condition_payload as unknown as { conditions: Array<Record<string, unknown>> }
    ).conditions;
    expect(passedConditions).toEqual(conditions);
    expect(passedConditions[0].operator).toBeUndefined(); // 未被路徑 4 自行補上 'in'（BR-11 唯一 fallback 落點禁止分散預設）
  });

  it('AC14-DELEGATE-004（結構性，對照 AD §8 建議手法）：estimateListCount 之篩選判定完全委派 executeStage1Chain，路徑 4 本身不含第二套判定邏輯', async () => {
    const conditions = [
      { columnName: 'spec_name', fieldType: 'categorical', operator: 'contains', keyword: '勁便利' },
    ];
    await seedList(env.listRepo, 'F19S000004', conditions);

    const spy = vi.spyOn(chainModule, 'executeStage1Chain').mockResolvedValue({
      count: 7,
      cases: undefined,
      skipped: false,
      warnings: [],
      appliedRuleIds: [],
    });

    const res = await env.service.estimateListCount('F19S000004');

    // 路徑 4 之回傳值直接等於 mock 的 executeStage1Chain 結果，證明 estimateListCount 未對
    // count 另行加工／二次篩選（若有，此處 mock 出的 7 就不會原封不動地反映在回傳值上）。
    expect(spy).toHaveBeenCalledTimes(1);
    expect(res).toEqual({ listNo: 'F19S000004', count: 7 });
  });
});
