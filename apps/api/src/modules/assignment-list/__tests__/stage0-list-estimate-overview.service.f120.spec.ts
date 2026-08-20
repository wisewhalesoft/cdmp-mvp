/**
 * Stage0EstimateService.computeListEstimateOverview — F120 / US-184
 * 「名單基礎預估數量總覽」整合測試（真實 SQLite in-memory）
 *
 * 對應 spec：
 *   - F120 spec §4 AC-LIST-02/03/06/06a/07/08/09/10/11/12/13
 *   - F120 spec §5.5 小計/總計/佔比公式；§10 不變量 I-F120-01~05；§10.2 邊界矩陣
 *   - AD-E07-51 §4.3（resolveListTotals 共用）、§4.5.1（I-LISTOVW-STRICT-EQUALITY-BOUNDARY-01，
 *     TC-184-07 無條件嚴格相等）、§6.3（授權／無 dept scope filter 特例）、§9（測試邊界建議）
 *
 * Fixture 慣例沿用既有 stage0-dept-estimate.service.spec.ts（buildModule / seedList /
 * seedMay2026Calendar / ActorLike / vi.spyOn(service,'estimateListCount') 模擬 fallback）。
 *
 * ⚠️ Blindness：本檔未讀取 stage0-estimate.service.ts / stage0-estimate.controller.ts
 * 之原始碼；`computeListEstimateOverview` 方法簽章與回應 shape 完全依 AD-E07-51 §6.2/§6.3
 * 之文件化契約撰寫。方法尚不存在，預期為 RED（TypeError: ... is not a function）。
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  Stage0EstimateService,
  type ActorLike,
} from '../stage0-estimate.service';
import { SectionChiefScopeService } from '@/modules/assignment/services/section-chief-scope.service';
import {
  ObListDefinition,
  type ObListDefinitionConditionPayload,
} from '@/database/entities/ob-list-definition.entity';
import { ObPoolData } from '@/database/entities/ob-pool-data.entity';
import { ObPoolDataList } from '@/database/entities/ob-pool-data-list.entity';
import { ObCalendar } from '@/database/entities/ob-calendar.entity';
import { ObDeptPct } from '@/database/entities/ob-dept-pct.entity';
import { ObEmphire } from '@/database/entities/ob-emphire.entity';
import { ObEmplSet } from '@/database/entities/ob-empl-set.entity';
import { User } from '@/database/entities/user.entity';
import { PooldataFieldOption } from '@/database/entities/pooldata-field-option.entity';

const YM = '202605';

async function buildModule() {
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
          PooldataFieldOption,
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
        PooldataFieldOption,
      ]),
    ],
    providers: [Stage0EstimateService, SectionChiefScopeService],
  }).compile();

  await app.init();
  const ds = app.get(DataSource);
  return {
    app,
    ds,
    service: app.get(Stage0EstimateService),
    scopeService: app.get(SectionChiefScopeService),
    listRepo: app.get<Repository<ObListDefinition>>(getRepositoryToken(ObListDefinition)),
    poolListRepo: app.get<Repository<ObPoolDataList>>(getRepositoryToken(ObPoolDataList)),
    optionRepo: app.get<Repository<PooldataFieldOption>>(getRepositoryToken(PooldataFieldOption)),
    calRepo: app.get<Repository<ObCalendar>>(getRepositoryToken(ObCalendar)),
  };
}

async function seedList(
  listRepo: Repository<ObListDefinition>,
  listNo: string,
  stage0EstimateCount: number | null,
  conditionPayload: ObListDefinitionConditionPayload | null,
): Promise<void> {
  const now = new Date();
  await listRepo.save(
    listRepo.create({
      list_no: listNo,
      list_nm: '名單' + listNo,
      prod_kind: 'A', // legacy backward-compat 欄位；本 feature 不得被讀取（TC-F120-E 已於別檔以 grep 覆蓋）
      prod_best: 'Y',
      list_type: '01',
      list_period_start: '001',
      list_period_end: '030',
      list_interval: '030',
      project_workym: YM,
      caseyear: '113',
      settle_src: '01',
      card_type: 'T1',
      case_status: '01',
      cr_enabled: false,
      status: 'active',
      stage: 'ready',
      condition_payload: conditionPayload,
      stage0_estimate_count: stage0EstimateCount,
      created_by_prog: 'TEST',
      created_by: 'tester',
      created_at: now,
      updated_by_prog: 'TEST',
      updated_by: 'tester',
      updated_at: now,
    } as Partial<ObListDefinition>),
  );
}

/** seed 三個已登錄產品類別代碼，比照 baseline seed（display_order 皆 0，見 F120 spec §12 G-2）。 */
async function seedProdKindOptions(
  optionRepo: Repository<PooldataFieldOption>,
  overrides: Array<Partial<PooldataFieldOption>> = [],
): Promise<void> {
  const now = new Date();
  const base: Array<Partial<PooldataFieldOption>> = [
    { column_name: 'prod_kind', option_value: '01', option_label: '汽車', display_order: 0, is_active: true },
    { column_name: 'prod_kind', option_value: '02', option_label: '機車', display_order: 0, is_active: true },
    { column_name: 'prod_kind', option_value: '03', option_label: '一般商品', display_order: 0, is_active: true },
    ...overrides,
  ];
  for (const o of base) {
    await optionRepo.save(
      optionRepo.create({
        deactivation_reason: null,
        created_at: now,
        updated_at: now,
        ...o,
      } as Partial<PooldataFieldOption>),
    );
  }
}

async function seedMay2026Calendar(calRepo: Repository<ObCalendar>) {
  const holidays = new Set(['2026-05-01']);
  const rows: ObCalendar[] = [];
  for (let day = 1; day <= 31; day++) {
    const d = new Date(Date.UTC(2026, 4, day));
    const ymd = `2026-05-${String(day).padStart(2, '0')}`;
    const dow = d.getUTCDay();
    const isWeekend = dow === 0 || dow === 6;
    const restFlg = isWeekend || holidays.has(ymd) ? '1' : '0';
    rows.push(calRepo.create({ calendar_date: new Date(ymd), rest_flg: restFlg }));
  }
  await calRepo.save(rows);
}

const director: ActorLike = { userId: 'u-dir', role: 'user', businessRole: 'director' };
const sectionChief: ActorLike = { userId: 'u-sc', role: 'user', businessRole: 'section_chief' };

function inCond(values: string[], operator?: 'in'): ObListDefinitionConditionPayload {
  return {
    logic: 'AND',
    conditions: [
      { columnName: 'prod_kind', fieldType: 'categorical', values, ...(operator ? { operator } : {}) },
    ],
  };
}
function textCond(operator: 'contains' | 'not_contains' | 'equals', keyword: string): ObListDefinitionConditionPayload {
  return {
    logic: 'AND',
    conditions: [{ columnName: 'prod_kind', fieldType: 'categorical', operator, keyword }],
  };
}

/** 找出指定 groupKey 之分組（未找到回傳 undefined，供「應不存在」斷言使用）。 */
function findGroup(groups: Array<{ groupKey: string }>, key: string) {
  return groups.find((g) => g.groupKey === key);
}

describe('Stage0EstimateService.computeListEstimateOverview（F120 / US-184）', () => {
  let env: Awaited<ReturnType<typeof buildModule>>;

  beforeAll(async () => {
    env = await buildModule();
  });
  afterAll(async () => {
    await env.app.close();
  });
  beforeEach(async () => {
    delete process.env.STAGE0_DEPT_ESTIMATE_TIMEOUT_MS;
    await env.ds.query('DELETE FROM ob_list_definition');
    await env.ds.query('DELETE FROM ob_pool_data_list');
    await env.ds.query('DELETE FROM ob_calendar');
    await env.ds.query('DELETE FROM pooldata_field_option');
    vi.restoreAllMocks();
    await seedProdKindOptions(env.optionRepo);
  });

  // =====================================================================
  // 一、分組結構契約 + 排序（AC-LIST-05/06/07；TC-184-03~06/13；TC-F120-A/B/C）
  // =====================================================================
  describe('分組結構、判定與 GROUP-ORDER（AC-LIST-06/07）', () => {
    it('八筆名單涵蓋全部分組型態：正確歸類、正確排序、空分組（02）不輸出', async () => {
      await seedList(env.listRepo, 'OB001', 1000, inCond(['01'])); // 汽車
      await seedList(env.listRepo, 'OB005', 700, inCond(['01', '01'])); // 重複值 → 汽車（TC-F120-A）
      await seedList(env.listRepo, 'OB007', 900, inCond(['03'], undefined)); // operator 缺漏 → 一般商品（TC-F120-B）
      await seedList(env.listRepo, 'OB006', 400, inCond(['09'])); // 孤兒代碼（TC-F120-C）
      await seedList(env.listRepo, 'OB002', 2000, inCond(['01', '02'])); // 多重產品類別
      await seedList(env.listRepo, 'OB003', 500, textCond('contains', '02')); // 文字運算子 → 未分類
      await seedList(env.listRepo, 'OB004', 300, null); // 完全未設定 → 未分類
      await seedList(env.listRepo, 'OB008', 100, inCond([])); // 空可選值 → 未分類

      const res = await env.service.computeListEstimateOverview(YM, { actor: director });

      // 組間順序：01 → 03 →（無 02）→ 09（孤兒）→ multi → unclassified
      expect(res.groups.map((g: { groupKey: string }) => g.groupKey)).toEqual([
        '01',
        '03',
        '09',
        'MULTI',
        'UNCLASSIFIED',
      ]);

      // '02'（機車）分組完全不存在（BR-9：空分組依名單數隱藏）
      expect(findGroup(res.groups, '02')).toBeUndefined();

      const g01 = findGroup(res.groups, '01')!;
      expect(g01.groupType).toBe('code');
      expect(g01.optionValue).toBe('01');
      expect(g01.listCount).toBe(2); // OB001, OB005
      expect(g01.subtotalCount).toBe(1700); // 1000 + 700
      expect(g01.lists.map((l: { listNo: string }) => l.listNo)).toEqual(['OB001', 'OB005']); // listNo ASC

      const g03 = findGroup(res.groups, '03')!;
      expect(g03.listCount).toBe(1);
      expect(g03.subtotalCount).toBe(900);

      const g09 = findGroup(res.groups, '09')!;
      expect(g09.groupType).toBe('code');
      expect(g09.optionValue).toBe('09');
      expect(g09.displayOrder).toBeNull(); // 未登錄代碼 → displayOrder null

      const multi = findGroup(res.groups, 'MULTI')!;
      expect(multi.groupType).toBe('multi');
      expect(multi.listCount).toBe(1);
      expect(multi.lists[0].listNo).toBe('OB002');

      const unclassified = findGroup(res.groups, 'UNCLASSIFIED')!;
      expect(unclassified.groupType).toBe('unclassified');
      // OB003 / OB004 / OB008 → listNo ASC
      expect(unclassified.lists.map((l: { listNo: string }) => l.listNo)).toEqual([
        'OB003',
        'OB004',
        'OB008',
      ]);
      expect(unclassified.subtotalCount).toBe(900); // 500+300+100

      // I-F120-01 互斥且完備：跨分組 listNo 聯集 = 全集，無重複
      const allListNos = res.groups.flatMap((g: { lists: Array<{ listNo: string }> }) =>
        g.lists.map((l) => l.listNo),
      );
      expect(new Set(allListNos).size).toBe(allListNos.length); // 無重複
      expect(new Set(allListNos)).toEqual(
        new Set(['OB001', 'OB002', 'OB003', 'OB004', 'OB005', 'OB006', 'OB007', 'OB008']),
      );
    });

    it('G-2：全部 display_order 相同（＝現行 seed 現況）時，次鍵 option_value ASC 決定順序', async () => {
      await seedList(env.listRepo, 'L02', 1, inCond(['02']));
      await seedList(env.listRepo, 'L01', 1, inCond(['01']));
      await seedList(env.listRepo, 'L03', 1, inCond(['03']));

      const res = await env.service.computeListEstimateOverview(YM, { actor: director });
      expect(res.groups.map((g: { groupKey: string }) => g.groupKey)).toEqual(['01', '02', '03']);
    });

    it('F076 BR-4：is_active=false 之已登錄代碼仍視為已登錄（照常排序 / 標籤），不降級為孤兒', async () => {
      await env.ds.query("DELETE FROM pooldata_field_option WHERE option_value = '01'");
      await env.optionRepo.save(
        env.optionRepo.create({
          column_name: 'prod_kind',
          option_value: '01',
          option_label: '汽車（停用）',
          display_order: 0,
          is_active: false,
          deactivation_reason: 'manual',
          created_at: new Date(),
          updated_at: new Date(),
        } as Partial<PooldataFieldOption>),
      );
      await seedList(env.listRepo, 'L01', 1, inCond(['01']));

      const res = await env.service.computeListEstimateOverview(YM, { actor: director });
      const g01 = findGroup(res.groups, '01')!;
      expect(g01.groupType).toBe('code');
      expect(g01.displayOrder).toBe(0); // 已登錄代碼（縱使停用）displayOrder 非 null
    });

    it('顯示層契約：groups[] 陣列本身即為排序後結果（即使 seed 寫入順序刻意顛倒，仍回傳已排序陣列）', async () => {
      await seedList(env.listRepo, 'L03', 1, inCond(['03']));
      await seedList(env.listRepo, 'L01', 1, inCond(['01']));
      const res = await env.service.computeListEstimateOverview(YM, { actor: director });
      const keys = res.groups.map((g: { groupKey: string }) => g.groupKey);
      // §6.1：陣列順序即為顯示順序，01 必須排在 03 之前（非依 seed 寫入順序）
      expect(keys.indexOf('01')).toBeLessThan(keys.indexOf('03'));
    });
  });

  // =====================================================================
  // 二、AC-LIST-06a / I-F120-01（互斥且完備）+ I-F120-02（Σ小計=總計）
  // =====================================================================
  describe('AC-LIST-06a / I-F120-01（互斥且完備）與 I-F120-02（Σ小計=總計）', () => {
    it('TC-184-13：5 筆涵蓋五種情境的名單，聯集=全集、Σ listCount=totalListCount、Σ subtotalCount=totalEstimatedCount', async () => {
      await seedList(env.listRepo, 'A', 100, inCond(['01'])); // 單一代碼
      await seedList(env.listRepo, 'B', 200, inCond(['01', '02'])); // 多值
      await seedList(env.listRepo, 'C', 300, textCond('equals', '03')); // 文字運算子
      await seedList(env.listRepo, 'D', 400, null); // 未設定
      await seedList(env.listRepo, 'E', 500, inCond(['02'])); // 單一代碼

      const res = await env.service.computeListEstimateOverview(YM, { actor: director });

      const sumListCount = res.groups.reduce((s: number, g: { listCount: number }) => s + g.listCount, 0);
      const sumSubtotal = res.groups.reduce((s: number, g: { subtotalCount: number }) => s + g.subtotalCount, 0);
      expect(sumListCount).toBe(res.totalListCount);
      expect(sumSubtotal).toBe(res.totalEstimatedCount);
      expect(res.totalListCount).toBe(5);
      expect(res.totalEstimatedCount).toBe(100 + 200 + 300 + 400 + 500);
    });
  });

  // =====================================================================
  // 三、AC-LIST-08 / BR-8 佔比（TC-184-14/15；§10.2 分母0 vs 分子0 對照）
  // =====================================================================
  describe('AC-LIST-08 佔比公式（BR-8）', () => {
    it('TC-184-14：42%（4200 / 10000 四捨五入至整數）', async () => {
      await seedList(env.listRepo, 'A', 4200, inCond(['01']));
      await seedList(env.listRepo, 'B', 5800, inCond(['02']));
      const res = await env.service.computeListEstimateOverview(YM, { actor: director });
      expect(res.totalEstimatedCount).toBe(10000);
      expect(findGroup(res.groups, '01')!.percent).toBe(42);
      expect(findGroup(res.groups, '02')!.percent).toBe(58);
    });

    it('TC-184-15：totalEstimatedCount=0（全數未能估算）→ 所有分組 percent 皆為 null', async () => {
      process.env.STAGE0_DEPT_ESTIMATE_TIMEOUT_MS = '30';
      await seedList(env.listRepo, 'A', null, inCond(['01']));
      await seedList(env.listRepo, 'B', null, inCond(['02']));
      vi.spyOn(env.service, 'estimateListCount').mockImplementation(
        (listNo: string) =>
          new Promise((resolve) => setTimeout(() => resolve({ listNo, count: 999 }), 500)),
      );

      const res = await env.service.computeListEstimateOverview(YM, { actor: director });
      expect(res.totalEstimatedCount).toBe(0);
      for (const g of res.groups as Array<{ percent: number | null }>) {
        expect(g.percent).toBeNull();
      }
    });

    it('★§10.2 對照表：分組小計=0 但總計>0 → percent 為數字 0（非 null）；不得誤判為缺陷', async () => {
      process.env.STAGE0_DEPT_ESTIMATE_TIMEOUT_MS = '30';
      await seedList(env.listRepo, 'ESTIMATED', 500, inCond(['01']));
      await seedList(env.listRepo, 'UNESTIMATED', null, inCond(['02']));
      vi.spyOn(env.service, 'estimateListCount').mockImplementation(
        (listNo: string) =>
          new Promise((resolve) => setTimeout(() => resolve({ listNo, count: 999 }), 500)),
      );

      const res = await env.service.computeListEstimateOverview(YM, { actor: director });
      expect(res.totalEstimatedCount).toBe(500); // 大於 0
      const g02 = findGroup(res.groups, '02')!;
      expect(g02.subtotalCount).toBe(0);
      expect(g02.percent).toBe(0); // 數字 0，非 null、非字串
      expect(g02.percent).not.toBeNull();
    });

    it('BR-9：組內全數未能估算（listCount>0、subtotal=0）之分組仍須顯示，而非因小計 0 被隱藏', async () => {
      process.env.STAGE0_DEPT_ESTIMATE_TIMEOUT_MS = '30';
      await seedList(env.listRepo, 'A', 100, inCond(['01']));
      await seedList(env.listRepo, 'ONLY_BIKE', null, inCond(['02']));
      vi.spyOn(env.service, 'estimateListCount').mockImplementation(
        (listNo: string) =>
          new Promise((resolve) => setTimeout(() => resolve({ listNo, count: 999 }), 500)),
      );

      const res = await env.service.computeListEstimateOverview(YM, { actor: director });
      const g02 = findGroup(res.groups, '02');
      expect(g02).toBeDefined(); // 仍顯示（依 listCount 判定，非依 subtotal）
      expect(g02!.listCount).toBe(1);
      expect(g02!.subtotalCount).toBe(0);
      expect(g02!.estimatedListCount).toBe(0);
    });
  });

  // =====================================================================
  // 四、AC-LIST-10 / BR-7 無估算值名單三分處置（TC-184-08）
  // =====================================================================
  describe('AC-LIST-10 / BR-7：無估算值名單之三分處置', () => {
    it('TC-184-08：fallback 逾時之名單仍列於分組（estimatedCount=null、estimateUnavailable=true），但不計入小計/總計；仍計入名單數', async () => {
      process.env.STAGE0_DEPT_ESTIMATE_TIMEOUT_MS = '30';
      await seedList(env.listRepo, 'OK', 1000, inCond(['01']));
      await seedList(env.listRepo, 'SLOW', null, inCond(['01']));
      vi.spyOn(env.service, 'estimateListCount').mockImplementation(
        (listNo: string) =>
          new Promise((resolve) => setTimeout(() => resolve({ listNo, count: 500 }), 500)),
      );

      const res = await env.service.computeListEstimateOverview(YM, { actor: director });
      const g01 = findGroup(res.groups, '01')!;
      const slowRow = g01.lists.find((l: { listNo: string }) => l.listNo === 'SLOW')!;
      expect(slowRow.estimatedCount).toBeNull();
      expect(slowRow.estimateUnavailable).toBe(true);
      expect(g01.listCount).toBe(2); // 仍計入名單數
      expect(g01.subtotalCount).toBe(1000); // 不含 SLOW
      expect(res.totalListCount).toBe(2);
      expect(res.totalEstimatedCount).toBe(1000);
      expect(res.unestimatedListCount).toBe(1);
      expect(
        res.warnings.some(
          (w: { code: string; listNo?: string }) =>
            w.code === 'STAGE0_LIST_ESTIMATE_PARTIAL' && w.listNo === 'SLOW',
        ),
      ).toBe(true);
    });
  });

  // =====================================================================
  // 五、AC-LIST-09 / I-F120-03 跨端點嚴格相等（TC-184-07；AD §4.5.1）
  // =====================================================================
  describe('AC-LIST-09 / I-F120-03：跨端點嚴格相等（TC-184-07，無條件斷言）', () => {
    it('穩態（全數已物化）：dept-estimate.orgMonthTotal === listOverview.totalEstimatedCount', async () => {
      await seedMay2026Calendar(env.calRepo);
      await seedList(env.listRepo, 'A', 4200, inCond(['01']));
      await seedList(env.listRepo, 'B', 5800, inCond(['02']));

      const dept = await env.service.computeDeptEstimate(YM, { actor: director });
      const overview = await env.service.computeListEstimateOverview(YM, { actor: director });

      expect(typeof (dept as { orgMonthTotal: unknown }).orgMonthTotal).toBe('number');
      expect((dept as { orgMonthTotal: number }).orgMonthTotal).toBe(overview.totalEstimatedCount);
      expect((dept as { orgMonthTotal: number }).orgMonthTotal).toBe(10000);
    });

    it('★過渡態（含 fallback 部分降級）：兩端於同一組 mock 下 excluded 集合恆相等 → 仍嚴格相等（AD §4.5.1，不得寫成依 unestimatedListCount 之分支斷言）', async () => {
      await seedMay2026Calendar(env.calRepo);
      process.env.STAGE0_DEPT_ESTIMATE_TIMEOUT_MS = '30';
      await seedList(env.listRepo, 'OK', 1000, inCond(['01']));
      await seedList(env.listRepo, 'SLOW', null, inCond(['02']));
      vi.spyOn(env.service, 'estimateListCount').mockImplementation(
        (listNo: string) =>
          new Promise((resolve) => setTimeout(() => resolve({ listNo, count: 999 }), 500)),
      );

      const dept = await env.service.computeDeptEstimate(YM, { actor: director });
      const overview = await env.service.computeListEstimateOverview(YM, { actor: director });

      // 無條件嚴格相等（AD-E07-51 §4.5.1 明確指示，不因 unestimatedListCount > 0 而改用容差）
      expect((dept as { orgMonthTotal: number }).orgMonthTotal).toBe(overview.totalEstimatedCount);
      expect(overview.unestimatedListCount).toBe(1); // 前提：兩端排除集合皆為 {SLOW}
    });

    it('orgMonthTotal 對處長角色亦為非 null 數字（F049 v2.1 §16.5.5：所有角色皆回傳全公司口徑）', async () => {
      await seedMay2026Calendar(env.calRepo);
      await seedList(env.listRepo, 'A', 1000, inCond(['01']));
      vi.spyOn(env.scopeService, 'getScopeDeptCode').mockResolvedValue('XVE1');

      const dept = await env.service.computeDeptEstimate(YM, { actor: sectionChief });
      expect(typeof (dept as { orgMonthTotal: unknown }).orgMonthTotal).toBe('number');
      expect((dept as { orgMonthTotal: number }).orgMonthTotal).toBe(1000);
    });
  });

  // =====================================================================
  // 六、AC-LIST-11 / I-F120-05 / BR-10 權限與 scope（TC-184-16；TC-F120-D）
  // =====================================================================
  describe('AC-LIST-11 / I-F120-05 / BR-10：本區塊不套 dept scope', () => {
    it('TC-F120-D：director 與 section_chief 以同一 ym 呼叫 → listNo 聯集與 totalEstimatedCount 完全相同', async () => {
      await seedList(env.listRepo, 'A', 1000, inCond(['01']));
      await seedList(env.listRepo, 'B', 2000, inCond(['02']));
      await seedList(env.listRepo, 'C', 3000, null);
      vi.spyOn(env.scopeService, 'getScopeDeptCode').mockResolvedValue('XVE1');

      const dirRes = await env.service.computeListEstimateOverview(YM, { actor: director });
      const chiefRes = await env.service.computeListEstimateOverview(YM, { actor: sectionChief });

      const dirListNos = dirRes.groups.flatMap((g: { lists: Array<{ listNo: string }> }) =>
        g.lists.map((l) => l.listNo),
      );
      const chiefListNos = chiefRes.groups.flatMap((g: { lists: Array<{ listNo: string }> }) =>
        g.lists.map((l) => l.listNo),
      );
      expect(new Set(chiefListNos)).toEqual(new Set(dirListNos));
      expect(chiefRes.totalListCount).toBe(dirRes.totalListCount);
      expect(chiefRes.totalEstimatedCount).toBe(dirRes.totalEstimatedCount);
    });

    it('scope.listOverviewScoped 恆為 false（director / section_chief 皆是）', async () => {
      await seedList(env.listRepo, 'A', 100, inCond(['01']));
      vi.spyOn(env.scopeService, 'getScopeDeptCode').mockResolvedValue('XVE1');

      const dirRes = await env.service.computeListEstimateOverview(YM, { actor: director });
      const chiefRes = await env.service.computeListEstimateOverview(YM, { actor: sectionChief });
      expect(dirRes.scope.listOverviewScoped).toBe(false);
      expect(chiefRes.scope.listOverviewScoped).toBe(false);
    });

    it('§6.3：section_chief 之 getScopeDeptCode() 回傳 null（無轄區）→ 本區塊仍完整回傳，不降級、不 throw', async () => {
      await seedList(env.listRepo, 'A', 100, inCond(['01']));
      await seedList(env.listRepo, 'B', 200, inCond(['02']));
      vi.spyOn(env.scopeService, 'getScopeDeptCode').mockResolvedValue(null);

      const res = await env.service.computeListEstimateOverview(YM, { actor: sectionChief });
      expect(res.totalListCount).toBe(2);
      expect(res.totalEstimatedCount).toBe(300);
      expect(res.scope.deptCode).toBeNull();
      // 本端點不產生 SCOPE_UNRESOLVED（該 warning 僅屬部門矩陣，AD-E07-51 §6.2）
      expect(res.warnings.map((w: { code: string }) => w.code)).not.toContain('SCOPE_UNRESOLVED');
    });

    it('scope.deptCode 為純顯示欄位：即使處長 deptCode 非 null，名單集合仍與部長相同（再次證明無過濾）', async () => {
      await seedList(env.listRepo, 'A', 100, inCond(['01']));
      await seedList(env.listRepo, 'B', 200, inCond(['02']));
      vi.spyOn(env.scopeService, 'getScopeDeptCode').mockResolvedValue('XVE9'); // 任意非 null 轄區

      const chiefRes = await env.service.computeListEstimateOverview(YM, { actor: sectionChief });
      const dirRes = await env.service.computeListEstimateOverview(YM, { actor: director });
      expect(chiefRes.scope.deptCode).toBe('XVE9');
      expect(chiefRes.totalListCount).toBe(dirRes.totalListCount);
    });
  });

  // =====================================================================
  // 七、AC-LIST-02 / §6.2 單一名單鑽探模式
  // =====================================================================
  describe('AC-LIST-02：單一名單鑽探模式（listNo 參數）', () => {
    it('提供 listNo 時 mode=single-list，僅回傳該筆名單，totalEstimatedCount=該名單自身值', async () => {
      await seedList(env.listRepo, 'A', 1000, inCond(['01']));
      await seedList(env.listRepo, 'B', 2000, inCond(['02']));

      const res = await env.service.computeListEstimateOverview(YM, {
        listNo: 'A',
        actor: director,
      });
      expect(res.mode).toBe('single-list');
      expect(res.listNo).toBe('A');
      expect(res.totalListCount).toBe(1);
      expect(res.totalEstimatedCount).toBe(1000);
      const allListNos = res.groups.flatMap((g: { lists: Array<{ listNo: string }> }) =>
        g.lists.map((l) => l.listNo),
      );
      expect(allListNos).toEqual(['A']);
    });

    it('單一名單鑽探且該名單無估算值 → 總計為 0', async () => {
      process.env.STAGE0_DEPT_ESTIMATE_TIMEOUT_MS = '30';
      await seedList(env.listRepo, 'A', null, inCond(['01']));
      vi.spyOn(env.service, 'estimateListCount').mockImplementation(
        (listNo: string) =>
          new Promise((resolve) => setTimeout(() => resolve({ listNo, count: 999 }), 500)),
      );
      const res = await env.service.computeListEstimateOverview(YM, {
        listNo: 'A',
        actor: director,
      });
      expect(res.totalEstimatedCount).toBe(0);
    });
  });

  // =====================================================================
  // 八、AC-LIST-12 / BR-11 空狀態
  // =====================================================================
  describe('AC-LIST-12 / BR-11：當月無啟用名單', () => {
    it('groups=[]、totalListCount=0、totalEstimatedCount=0、不 throw', async () => {
      const res = await env.service.computeListEstimateOverview(YM, { actor: director });
      expect(res.groups).toEqual([]);
      expect(res.totalListCount).toBe(0);
      expect(res.totalEstimatedCount).toBe(0);
      expect(res.unestimatedListCount).toBe(0);
    });
  });

  // =====================================================================
  // 九、AC-LIST-13 / BR-12 唯讀
  // =====================================================================
  describe('AC-LIST-13 / BR-12：唯讀，不寫入任何分派紀錄，不回寫 stage0_estimate_count', () => {
    it('呼叫前後 ob_pool_data_list 列數不變；既有 stage0_estimate_count 值不被覆寫', async () => {
      await seedList(env.listRepo, 'A', 1000, inCond(['01']));
      const before = await env.poolListRepo.count();

      await env.service.computeListEstimateOverview(YM, { actor: director });

      const after = await env.poolListRepo.count();
      expect(after).toBe(before);
      const reloaded = await env.listRepo.findOneBy({ list_no: 'A' });
      expect(reloaded?.stage0_estimate_count).toBe(1000); // 未被回寫覆蓋
    });
  });
});
