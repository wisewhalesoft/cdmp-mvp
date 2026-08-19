/**
 * F119 / US-183 — AC-14（★核心）路徑 2（PG 下推）之驗證：R-F119-04 缺口補強（誠實分級）。
 *
 * ⚠️ 驗證層級聲明（team lead 明確指示，務必如實記錄）：本專案已全面遷移 MSSQL
 * （見專案記憶 `project_mssql_full_migration`），本機/CI 環境**無真實 PostgreSQL 可連線**。
 * 本檔**不是**真實 PG 執行證據——不像 `f119-ac14-cross-path-parity.mssql.spec.ts`（路徑 1/3）
 * 是對真實資料庫下真實查詢、比對真實回傳列；本檔是對「PG 下推之 SQL 產生函式」之**字串／語意
 * 等價**驗證：直接呼叫生產碼 `buildStage1Sql()`（`stage1-sql-builder.ts`，PG 建構器）取得其
 * 產出之 WHERE 片段文字與綁定參數，比對 `buildCategoricalOperatorFragment()`（BR-4/BR-5 之
 * 單一 SQL 落點，AD-E07-50 §3.2/§3.3 已論證為 ANSI SQL、無 dialect 分支）之直接輸出，證明
 * PG 建構器**未在該共用函式輸出之外自行插入/竄改任何字元**。這是可執行、非臆測的證據，但其
 * 證明力弱於「真實 DB 執行、真實回傳列」——若 PG 引擎本身對 `ESCAPE '\'` 子句或參數繫結有
 * 語法層級的怪異行為（例如 `standard_conforming_strings` 設定造成的跳脫字元二次解讀），本檔
 * 無法偵測，只有真實 PG 執行才能。此為 AD-E07-50 §3.2 已用「ESCAPE 子句語意與該字元在無跳脫時
 * 是否原本特殊無關」之論證解釋過的已知殘留風險（R-4，低），本檔補的是「呼叫路徑本身未走樣」
 * 這一層，不是「PG 引擎行為」這一層。
 *
 * 附帶：`buildStage1Sql()`（PG）本身是可在**不連接任何資料庫**的情況下呼叫的純函式（`pdlRepo`
 * 僅用於查詢去重視窗上界，可用 mock repo 取代——手法逐字沿用既有 `stage1-sql-builder.spec.ts`
 * 之 `mockPdlRepo()` 慣例），故本檔對「PG 下推之 SQL 產生邏輯」仍是**對生產碼的真實呼叫與真實
 * 輸出斷言**，只是不存在一個真的 PostgreSQL 引擎去執行這段 SQL 字串。
 *
 * ⚠️ test-generator 撰寫依據：F119 spec AC-14 + AD-E07-50 §3.2/§3.3 + 既有測試檔
 * `stage1-sql-builder.spec.ts`（允許範圍：既有測試檔之 wiring 慣例，見 test-generator agent
 * memory `blindness-practical-exceptions`）。**未**開啟 `stage1-sql-builder.ts`/
 * `stage1-query-composer.ts` 生產碼本體決定斷言內容。
 */

import { describe, it, expect } from 'vitest';
import type { Repository } from 'typeorm';

import { buildStage1Sql } from '../stage1-sql-builder';
import { buildCategoricalOperatorFragment } from '../stage1-query-composer';
import { ObListDefinition } from '@/database/entities/ob-list-definition.entity';
import type { ObPoolDataList } from '@/database/entities/ob-pool-data-list.entity';

const WORKDT = new Date(2026, 5, 1);

// 沿用既有 stage1-sql-builder.spec.ts 之 mockPdlRepo 慣例（去重視窗查詢 mock，非真實 DB）。
function mockPdlRepo(maxAssignday: string | null = null): Repository<ObPoolDataList> {
  const qb = {
    select: () => qb,
    where: () => qb,
    getRawOne: async () => ({ max: maxAssignday }),
  };
  return { createQueryBuilder: () => qb } as unknown as Repository<ObPoolDataList>;
}

function makeList(operator: 'contains' | 'not_contains' | 'equals', keyword: string): ObListDefinition {
  return {
    list_no: 'OB202606F19',
    list_nm: '主約專案名稱文字比對名單',
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
      conditions: [{ columnName: 'spec_name', fieldType: 'categorical', operator, keyword }],
    } as ObListDefinition['condition_payload'],
    created_by_prog: 'TEST',
    created_by: 'tester',
    created_at: new Date(),
    updated_by_prog: 'TEST',
    updated_by: 'tester',
    updated_at: new Date(),
  } as ObListDefinition;
}

describe('F119 AC-14 路徑 2（PG 下推）— SQL 字串／語意等價（非真實 PG 執行，見檔頭聲明）', () => {
  it('PG-SEM-001（★核心）：contains → buildStage1Sql(PG) 之 WHERE 片段與參數，逐字元對齊 buildCategoricalOperatorFragment 直接輸出', async () => {
    const core = await buildStage1Sql(makeList('contains', '勁便利'), WORKDT, mockPdlRepo());
    expect(core.skip).toBe(false);
    // 實測 core.where（含既有詐騙白牌/去重等無關子句一併 AND 組裝，符合 T-SQL builder.spec.ts 之
    // 既有 SQLG-001/AC-4 慣例）：("spec_name" LIKE :cat0 ESCAPE '\') AND ("month_cnt" IN (...)) AND ...

    // 參照值：直接呼叫共用函式取得「已知正確」之 fragment/params（ob_pool_data 引號欄名慣例，AD §3.3 之 1）。
    const ref = buildCategoricalOperatorFragment({
      colExpr: '"spec_name"',
      operator: 'contains',
      keyword: '勁便利',
      paramName: 'ref',
      nullKeptOnNotContains: true,
    });
    expect(ref).not.toBeNull();
    const refShape = (ref as { fragment: string }).fragment.replace(/:ref\b/, ':<P>');
    const coreShape = (core.where ?? '').match(/"spec_name"\s+LIKE\s+:\w+\s+ESCAPE\s+'\\'/i);
    expect(coreShape).not.toBeNull(); // PG 建構器輸出確實含與參照相同結構之 LIKE…ESCAPE 片段
    expect(refShape).toMatch(/^"spec_name"\s+LIKE\s+:<P>\s+ESCAPE\s+'\\'$/i);

    // 綁定參數值須逐字元相同（跳脫後之 %keyword% 樣式），非僅結構相似。
    const boundValues = Object.values(core.params);
    expect(boundValues).toContainEqual('%勁便利%');
    expect((ref as { params: Record<string, unknown> }).params.ref).toBe('%勁便利%');
  });

  it('PG-SEM-002（★核心 / AC-3 不對稱）：not_contains → PG 建構器輸出含與參照相同之 "IS NULL OR" 顯式格（ob_pool_data 唯一顯式格）', async () => {
    const core = await buildStage1Sql(makeList('not_contains', '勁便利'), WORKDT, mockPdlRepo());
    expect(core.where).toMatch(/IS NULL/i);
    expect(core.where).toMatch(/NOT LIKE/i);

    const ref = buildCategoricalOperatorFragment({
      colExpr: '"spec_name"',
      operator: 'not_contains',
      keyword: '勁便利',
      paramName: 'ref',
      nullKeptOnNotContains: true,
    });
    expect((ref as { fragment: string }).fragment).toMatch(/IS NULL/i);
    expect((ref as { fragment: string }).fragment).toMatch(/NOT LIKE/i);
  });

  it('PG-SEM-003：equals → PG 建構器輸出為 "=" 比對，不含 LIKE/ESCAPE（BR-7：等於天然無萬用字元語意）', async () => {
    const core = await buildStage1Sql(makeList('equals', '勁便利'), WORKDT, mockPdlRepo());
    // ⚠️ core.where 為完整 Stage1 WHERE（含既有詐騙白牌規則 `COALESCE(spec_name,'') LIKE :fraudPattern`，
    // 與本條件無關但恆存在），故不得對整段 core.where 斷言「不含 LIKE」——需先擷取本 F119 條件自身
    // 產生之子片段（"spec_name" 開頭之括號群組）再斷言，避免被無關的既有 LIKE 子句誤判。
    const specNameClause = (core.where ?? '').match(/\("spec_name"[^)]*\)/i)?.[0] ?? '';
    expect(specNameClause).toMatch(/"spec_name"\s*=\s*:\w+/);
    expect(specNameClause).not.toMatch(/LIKE/i);

    const boundValues = Object.values(core.params);
    expect(boundValues).toContainEqual('勁便利'); // 未加 % 樣式（非 LIKE 語意）
  });

  it('PG-SEM-004（AC-9 字面值，未跳脫必紅）：關鍵字含 "%"/"_" 於 PG 建構器輸出中已跳脫，與參照逐字元相同', async () => {
    const core = await buildStage1Sql(makeList('contains', '100%_A'), WORKDT, mockPdlRepo());
    const ref = buildCategoricalOperatorFragment({
      colExpr: '"spec_name"',
      operator: 'contains',
      keyword: '100%_A',
      paramName: 'ref',
      nullKeptOnNotContains: true,
    });
    const refParam = (ref as { params: Record<string, unknown> }).params.ref;
    expect(refParam).toBe('%100\\%\\_A%'); // 跳脫超集：% 與 _ 皆須跳脫（AD §3.2）
    const boundValues = Object.values(core.params);
    expect(boundValues).toContainEqual(refParam); // PG 建構器與共用函式產出之跳脫後樣式逐字元相同
  });
});
