/**
 * buildStage1Sql — F099 / AD-E07-28 P2 純函式 / 靜態 unit 測試（不需 Postgres）
 *
 * 對應測試設計（F099-test.md）：
 *   - RUNEST-001：run / estimate 共用同一 SQL core（結構斷言）
 *   - SQLG-001：欄位篩選沿用 buildStage1WhereConditions（不重寫）
 *   - SQLG-002：month_cnt 沿用 buildMonthCntFragment（缺值 / interval<=0 skip）
 *   - SQLG-003：columnName allowlist 注入防禦沿用；動態輸入均 params 綁定
 *   - SQLG-004：詐騙白牌 / 機車期中 / 期中小資 WHERE NOT (...) 觸發 / 不觸發兩態
 *   - NOLOAD-001/002：下推路徑無 getMany()/find() 全載；year-above 無應用層 filter（靜態 grep）
 *   - GMT-001/003：RGv2-005 移除確認；special-rules trigger 仍 JS（grep guard 移轉）
 *
 * year-above / 數值 CAST 之逐列結果等價由 PG 真庫 EQ/PORT 群組守（stage1-sql-pushdown.pg.spec.ts），
 * 本檔僅守「SQL core 結構 / params 綁定 / fragment 沿用 / skip 邊界」。
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import type { Repository } from 'typeorm';

import { buildStage1Sql } from '../stage1-sql-builder';
import { ObListDefinition } from '@/database/entities/ob-list-definition.entity';
import type { ObPoolDataList } from '@/database/entities/ob-pool-data-list.entity';

const WORKDT = new Date(2026, 5, 1); // 2026-06-01；cutoff(year-above)=2011；去重視窗 [20260301, 20260531]

// computeDedupWindow 需查 MAX(assignday)；mock poolDataListRepo 之 createQueryBuilder.getRawOne。
function mockPdlRepo(maxAssignday: string | null = null): Repository<ObPoolDataList> {
  const qb = {
    select: () => qb,
    where: () => qb,
    getRawOne: async () => ({ max: maxAssignday }),
  };
  return {
    createQueryBuilder: () => qb,
  } as unknown as Repository<ObPoolDataList>;
}

function makeList(opts: Partial<ObListDefinition> = {}): ObListDefinition {
  return {
    list_no: 'OB202606001',
    list_nm: '一般催收名單',
    prod_kind: '',
    prod_best: 'Y',
    list_type: '01',
    list_period_start: '1',
    list_period_end: '6',
    list_interval: '1',
    project_workym: '202606',
    caseyear: null,
    spec_tp: null,
    settle_src: null,
    card_type: 'T1',
    case_status: '',
    status: 'active',
    stage: 'ready',
    cr_enabled: false,
    condition_payload: {
      logic: 'AND',
      conditions: [
        { columnName: 'prod_kind', fieldType: 'categorical', values: ['01'] },
      ],
    } as ObListDefinition['condition_payload'],
    created_by_prog: 'TEST',
    created_by: 'tester',
    created_at: new Date(),
    updated_by_prog: 'TEST',
    updated_by: 'tester',
    updated_at: new Date(),
    ...opts,
  } as ObListDefinition;
}

describe('F099 buildStage1Sql — SQL core 結構 / 沿用 / 邊界（unit，不需 PG）', () => {
  // ----- SQLG-001：欄位篩選沿用 composer -----
  it('SQLG-001：欄位篩選段沿用 buildStage1WhereConditions（path A categorical → "prod_kind" IN）', async () => {
    const core = await buildStage1Sql(makeList(), WORKDT, mockPdlRepo());
    expect(core.skip).toBe(false);
    expect(core.where).toContain('"prod_kind" IN');
    // composer 之 params 帶入（catN）
    expect(Object.values(core.params)).toContainEqual(['01']);
  });

  it('SQLG-001b：EMPTY_CONDITIONS（conditions=[]）→ skip=true、where=null（與 chain 一致）', async () => {
    const core = await buildStage1Sql(
      makeList({ condition_payload: { logic: 'AND', conditions: [] } as ObListDefinition['condition_payload'] }),
      WORKDT,
      mockPdlRepo(),
    );
    expect(core.skip).toBe(true);
    expect(core.skipReason).toBe('EMPTY_CONDITIONS');
    expect(core.where).toBeNull();
  });

  // ----- SQLG-002：month_cnt 沿用 -----
  it('SQLG-002：month_cnt 期別過濾沿用 buildMonthCntFragment（list_period 1~6 interval 1 → month_cnt IN）', async () => {
    const core = await buildStage1Sql(makeList(), WORKDT, mockPdlRepo());
    expect(core.where).toContain('"month_cnt" IN');
    expect(core.params.monthCntVals).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('SQLG-002b：list_period 缺值 → month_cnt skip（不含 month_cnt 子句）+ warning', async () => {
    const core = await buildStage1Sql(
      makeList({ list_period_start: '', list_period_end: '', list_interval: '' }),
      WORKDT,
      mockPdlRepo(),
    );
    expect(core.where).not.toContain('"month_cnt" IN');
    expect(core.warnings.some((w) => w.code === 'MONTH_CNT_PERIOD_INCOMPLETE')).toBe(true);
  });

  it('SQLG-002c：interval<=0 → month_cnt skip（防 infinite loop）+ warning', async () => {
    const core = await buildStage1Sql(
      makeList({ list_interval: '0' }),
      WORKDT,
      mockPdlRepo(),
    );
    expect(core.where).not.toContain('"month_cnt" IN');
    expect(core.warnings.some((w) => w.code === 'MONTH_CNT_INTERVAL_INVALID')).toBe(true);
  });

  // ----- AC-4：詐騙白牌（無條件）-----
  it('AC-4：詐騙白牌 WHERE NOT (list_type=01 AND spec_name LIKE %白牌%) 無條件加入；pattern 以 params 綁定', async () => {
    const core = await buildStage1Sql(makeList(), WORKDT, mockPdlRepo());
    // COALESCE(spec_name,'') 為 NULL 等價必要（JS (spec_name ?? '').includes 語意）
    expect(core.where).toMatch(/NOT \(o\.list_type = :fraudListType AND COALESCE\(o\.spec_name, ''\) LIKE :fraudPattern\)/);
    expect(core.params.fraudListType).toBe('01');
    expect(core.params.fraudPattern).toBe('%白牌%');
  });

  // ----- AC-5：近 3 月去重 anti-join（NOT EXISTS，非 NOT IN）-----
  it('AC-5：去重以 NOT EXISTS anti-join（非 NOT IN）；custo_no IS NOT NULL 子查詢；視窗界 params 綁定', async () => {
    const core = await buildStage1Sql(makeList(), WORKDT, mockPdlRepo('20260420'));
    expect(core.where).toContain('NOT EXISTS (SELECT 1 FROM ob_pool_data_list pdl');
    expect(core.where).toContain('pdl.custo_no = o.custo_no');
    expect(core.where).toContain('pdl.custo_no IS NOT NULL');
    expect(core.where).not.toContain('NOT IN'); // A-1：避 NULL 子查詢陷阱
    expect(core.params.dedupStart).toBe('20260301');
    // 上界 = MIN(MAX(assignday)=20260420, workdt-1=20260531) = 20260420
    expect(core.params.dedupEnd).toBe('20260420');
  });

  it('AC-5b：MAX(assignday)=NULL（無歷史）→ 上界退化 workdt-1（20260531）', async () => {
    const core = await buildStage1Sql(makeList(), WORKDT, mockPdlRepo(null));
    expect(core.params.dedupEnd).toBe('20260531');
  });

  it('AC-5c：MAX(assignday) 為未來日（20261231）→ 上界封頂 workdt-1（20260531）', async () => {
    const core = await buildStage1Sql(makeList(), WORKDT, mockPdlRepo('20261231'));
    expect(core.params.dedupEnd).toBe('20260531');
  });

  // ----- SQLG-004：機車期中 / 期中小資 觸發 / 不觸發兩態 -----
  it('SQLG-004a：非觸發名單 → core 不含機車期中 / 期中小資 / year-above 子句', async () => {
    const core = await buildStage1Sql(makeList({ list_nm: '一般催收名單' }), WORKDT, mockPdlRepo());
    expect(core.where).not.toContain('payt_term');
    expect(core.where).not.toContain('payt_num');
    expect(core.where).not.toContain('year_produ');
  });

  it('SQLG-004b：機車期中名單（含「期中」+「機車」）→ core 含 NOT (CAST(payt_term)>=CAST(deal_num)-3 OR appl_no LIKE T/Y)', async () => {
    const core = await buildStage1Sql(makeList({ list_nm: '機車期中催收名單' }), WORKDT, mockPdlRepo());
    expect(core.where).toContain('COALESCE(CAST(o.payt_term AS numeric), 0) >= COALESCE(CAST(o.deal_num AS numeric), 0) - 3');
    expect(core.where).toContain('o.appl_no LIKE :mcPrefixT');
    expect(core.params.mcPrefixT).toBe('T%');
    expect(core.params.mcPrefixY).toBe('Y%');
  });

  it('SQLG-004c：期中小資名單（含「期中」）→ core 含 NOT (CAST(payt_num)>CAST(deal_num)-8 AND spec_name LIKE %小資%)', async () => {
    const core = await buildStage1Sql(makeList({ list_nm: '期中催收名單' }), WORKDT, mockPdlRepo());
    expect(core.where).toContain('COALESCE(CAST(o.payt_num AS numeric), 0) > COALESCE(CAST(o.deal_num AS numeric), 0) - 8');
    expect(core.where).toContain("COALESCE(o.spec_name, '') LIKE :xiaoziPattern");
    expect(core.params.xiaoziPattern).toBe('%小資%');
  });

  // ----- AC-8：year-above 前導數字解析 SQL（結構），逐列等價由 PG PORT 群組守 -----
  it('AC-8：year-above 名單（含「年以上」）→ core 含前導數字解析 CASE，cutoff=workdt年-15 以 params 綁定', async () => {
    const core = await buildStage1Sql(makeList({ list_nm: '5年以上車主催收名單' }), WORKDT, mockPdlRepo());
    // 前導數字解析（SUBSTRING ... FROM '^[0-9]+'）；NULL 特判退化 1900
    expect(core.where).toContain("SUBSTRING(o.year_produ FROM '^[0-9]+')");
    expect(core.where).toContain('WHEN o.year_produ IS NULL THEN 1900');
    expect(core.params.yearAboveCutoff).toBe(2011);
    // 禁用 strict all-digit 正則（會把 '1980abc' 誤判為非數字）
    expect(core.where).not.toContain("'^[0-9]+$'");
    // 禁用 NULLIF(REGEXP_REPLACE(...,'[^0-9]'))（會把 ''/'N/A' 誤排）
    expect(core.where).not.toContain("REGEXP_REPLACE");
  });

  // ----- RUNEST-001：run / estimate 共用同一 core（同一函式單次輸出）-----
  it('RUNEST-001：同一 list/workdt 呼叫 buildStage1Sql 之 where/params 為確定性單一來源（run/estimate 共用）', async () => {
    const list = makeList({ list_nm: '機車期中小資5年以上催收名單' });
    const a = await buildStage1Sql(list, WORKDT, mockPdlRepo('20260420'));
    const b = await buildStage1Sql(list, WORKDT, mockPdlRepo('20260420'));
    // 確定性：同輸入 → 同 where 字串 + 同 params（run 與 estimate 各取一次即同源）
    expect(a.where).toEqual(b.where);
    expect(a.params).toEqual(b.params);
    // 全規則觸發名單應同時含四特例子句（中文觸發字以 params 綁定，不字串拼接於 WHERE）
    expect(a.where).toContain(':fraudPattern'); // 詐騙白牌
    expect(a.params.fraudPattern).toBe('%白牌%');
    expect(a.where).toContain('o.payt_term'); // 機車期中
    expect(a.where).toContain(':xiaoziPattern'); // 期中小資
    expect(a.params.xiaoziPattern).toBe('%小資%');
    expect(a.where).toContain('o.year_produ'); // year-above
  });
});

// ===========================================================================
// NOLOAD / GMT — 靜態原始碼 guard（不需 PG）
// ===========================================================================

/**
 * 去除 block / line 註解，靜態 guard 僅針對「實際程式碼」grep
 * （避免 builder 之說明註解內提及 parseInt / filter / getMany 字面誤觸發）。
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '') // block comments
    .replace(/(^|[^:])\/\/.*$/gm, '$1'); // line comments（避開 URL 之 ://）
}

const BUILDER_SRC = stripComments(
  readFileSync(path.resolve(__dirname, '../stage1-sql-builder.ts'), 'utf8'),
);
const PIPELINE_SRC = readFileSync(
  path.resolve(
    __dirname,
    '../../services/assignment-run-pipeline.service.ts',
  ),
  'utf8',
);
const ESTIMATE_SRC = readFileSync(
  path.resolve(
    __dirname,
    '../../../assignment-list/stage0-estimate.service.ts',
  ),
  'utf8',
);
const CHAIN_TEST_SRC = readFileSync(
  path.resolve(__dirname, './stage1-filter-chain.spec.ts'),
  'utf8',
);
const SPECIAL_RULES_SRC = readFileSync(
  path.resolve(__dirname, '../special-rules.ts'),
  'utf8',
);

describe('F099 NOLOAD — 下推路徑不全載 heap（I-NOLOAD-01，靜態）', () => {
  it('NOLOAD-001：buildStage1Sql 不含 getMany()/find() 全載 ob_pool_data；去重以 NOT EXISTS anti-join', () => {
    expect(BUILDER_SRC).not.toMatch(/\.getMany\(\)/);
    expect(BUILDER_SRC).not.toMatch(/\.find\(/);
    // 去重不全載 DISTINCT custo_no Set（queryRecentAssignedCustoNos 不被下推 builder 呼叫）
    expect(BUILDER_SRC).not.toContain('queryRecentAssignedCustoNos');
    expect(BUILDER_SRC).toContain('NOT EXISTS');
  });

  it('NOLOAD-001b：run 路徑（pipeline runStage1ForList）改走 buildStage1Sql + INSERT…SELECT，不 getMany() 全載 pool', () => {
    // 下推 run 路徑不再以 poolRepo.createQueryBuilder(...).getMany() 全載 ob_pool_data
    expect(PIPELINE_SRC).toContain('buildStage1Sql');
    // 確認 runStage1ForList 不再呼叫 executeStage1Chain（heap 全載 oracle 路徑）作為 production
    expect(PIPELINE_SRC).not.toMatch(/runStage1ForList[\s\S]{0,400}executeStage1Chain/);
  });

  it('NOLOAD-001c：estimate 路徑（stage0-estimate dryRunChainCount）改走 buildStage1Sql + SELECT COUNT(*)', () => {
    expect(ESTIMATE_SRC).toContain('buildStage1Sql');
  });

  it('NOLOAD-002：year-above 無應用層 filter（buildStage1Sql 不含 parseInt(...year_produ) 之 JS filter）', () => {
    // builder 以 SQL 表達 year-above，不存在 pool.filter(c => parseInt(c.year_produ ...))
    expect(BUILDER_SRC).not.toMatch(/parseInt\([^)]*year_produ/);
    expect(BUILDER_SRC).not.toMatch(/\.filter\(/);
  });
});

describe('F099 GMT — guard 移轉（作廢 RGv2-005，trigger 仍 JS）', () => {
  it('GMT-001：RGv2-005 之 CHAIN_SRC includes(小資)/includes(白牌) grep-pin 已移除（移轉至 PG EQ-006/008）', () => {
    // SQL 化後排除字串移至 buildStage1Sql 之 SQL LIKE '%白牌%'/'%小資%'，CHAIN_SRC 不再保證含
    // includes('小資')/includes('白牌') → 原 RGv2-005 grep-pin 失去意義，須移除以免假紅。
    // 確認 chain 單元測試不再以 grep CHAIN_SRC 含 includes('小資')/includes('白牌') 作為斷言。
    expect(CHAIN_TEST_SRC).not.toMatch(/CHAIN_SRC\)\.toMatch\(\/includes\\\(\\s\*\['"\]小資/);
    expect(CHAIN_TEST_SRC).not.toMatch(/CHAIN_SRC\)\.toMatch\(\/includes\\\(\\s\*\['"\]白牌/);
  });

  it('GMT-003：special-rules trigger 仍 JS（含期中 / 機車 / 年以上 關鍵字；禁 v1.0 中結 / 強案 / 年資 / 滿）', () => {
    // trigger 正確性仍由 special-rules.ts 守（C-1：SQL 只接收布林結果）
    expect(SPECIAL_RULES_SRC).toMatch(/includes\(\s*['"]期中['"]\s*\)/);
    expect(SPECIAL_RULES_SRC).toMatch(/includes\(\s*['"]機車['"]\s*\)/);
    expect(SPECIAL_RULES_SRC).toMatch(/includes\(\s*['"]年以上['"]\s*\)/);
    expect(SPECIAL_RULES_SRC).not.toMatch(/includes\(\s*['"]中結['"]\s*\)/);
    expect(SPECIAL_RULES_SRC).not.toMatch(/includes\(\s*['"]強案['"]\s*\)/);
    expect(SPECIAL_RULES_SRC).not.toMatch(/includes\(\s*['"]年資['"]\s*\)/);
  });
});
