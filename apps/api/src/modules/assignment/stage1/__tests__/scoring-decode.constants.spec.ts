/**
 * F107 / BR-4 / AC-4：decode 同步斷言（核心紅線）
 *
 * 斷言「decode 共用常數（scoring-decode.constants）」與下列三方一致，防「UI 說 A、引擎做 B」走鐘：
 *   (i)   decode `codes` 碼集合與意義 ≡ AD-E07-10-S §2
 *         （PROJECT_TP A/null、SALES_STS AGENT/UCD/HFC、CUS_SEX 1/2/3）；
 *   (ii)  decode `sourceField` ≡ 引擎 `resolveColumnSource` 取值來源
 *         （引擎 keyword 變更如 SALES_STS '中古車商'→'UCD'、PROJECT_TP '%借新還舊%'→'A' 時斷言失敗以提示同步）；
 *   (iii) decode 涵蓋之欄集合 ⊆ 引擎 `MAPPED_SCORING_COLUMNS`（不對引擎未映射之欄產生 decode）。
 *
 * 真值來源：docs/specs/scorecard-derived-code-dictionary.md（AD-E07-10-S）§1 / §2 / §3。
 */

import { describe, it, expect } from 'vitest';
import {
  SCORING_DECODE,
  getDecodeForColumn,
} from '../scoring-decode.constants';
import {
  resolveColumnSource,
  MAPPED_SCORING_COLUMNS,
} from '../stage2to4-sql-builder';

/** 取某 column 之引擎取值表達式串接（含 composite 的 codeExpr/keywordExpr），供 source 比對。 */
function engineExpr(columnName: string): string {
  // cardType='H' 為任一 active card；source 欄位（o.*/cc.*）與 cardType 無關。
  const src = resolveColumnSource(columnName, 'H');
  return [src.expr, src.codeExpr, src.keywordExpr].filter(Boolean).join(' ');
}

describe('F107 scoring-decode.constants — 同步斷言（BR-4 / AC-4）', () => {
  // -------------------------------------------------------------------------
  // (iii) decode 涵蓋欄 ⊆ 引擎 MAPPED_SCORING_COLUMNS
  // -------------------------------------------------------------------------
  it('(iii) decode 涵蓋之欄集合 ⊆ MAPPED_SCORING_COLUMNS', () => {
    const mapped = new Set<string>(MAPPED_SCORING_COLUMNS);
    for (const columnName of Object.keys(SCORING_DECODE)) {
      expect(
        mapped.has(columnName),
        `decode 欄位 ${columnName} 不在引擎 MAPPED_SCORING_COLUMNS（不得對未映射欄產生 decode）`,
      ).toBe(true);
    }
  });

  // -------------------------------------------------------------------------
  // (i) decode codes 碼集合與意義 ≡ AD-E07-10-S §2
  // -------------------------------------------------------------------------
  it('(i) PROJECT_TP codes ≡ AD-E07-10-S §2.1（A→借新還舊；null→非借新還舊；level2→專案代碼）', () => {
    const decode = getDecodeForColumn('PROJECT_TP')!;
    expect(decode.codes).toEqual(
      expect.arrayContaining([
        { level: 'level1', code: 'A', meaning: '借新還舊' },
        expect.objectContaining({ level: 'level1', code: null, meaning: '非借新還舊' }),
      ]),
    );
    // level2 為「專案代碼 spec_tp」說明（兩碼 level2_s=level2_e）
    const level2 = decode.codes.find((c) => c.level === 'level2');
    expect(level2).toBeDefined();
    expect(level2!.meaning).toContain('專案代碼');
  });

  it('(i) SALES_STS codes ≡ AD-E07-10-S §2.4（AGENT/UCD/HFC）', () => {
    const decode = getDecodeForColumn('SALES_STS')!;
    const byCode = Object.fromEntries(decode.codes.map((c) => [c.code, c.meaning]));
    expect(byCode.AGENT).toBe('代理商');
    expect(byCode.UCD).toBe('中古車商');
    expect(byCode.HFC).toBe('和潤自家');
    // 僅此三碼（不得自創）
    expect(decode.codes.map((c) => c.code).sort()).toEqual(['AGENT', 'HFC', 'UCD']);
  });

  it('(i) CUS_SEX codes ≡ AD-E07-10-S §2.2（1男/2女/3法人）', () => {
    const decode = getDecodeForColumn('CUS_SEX')!;
    const byCode = Object.fromEntries(decode.codes.map((c) => [c.code, c.meaning]));
    expect(byCode['1']).toBe('男（個人）');
    expect(byCode['2']).toBe('女（個人）');
    expect(byCode['3']).toBe('法人');
  });

  it('(i) 三縣市欄 codes ≡ AD-E07-10-S §2.3（縣市名 3 字）', () => {
    for (const col of ['HPOST_NUM_NM', 'CPOST_NUM_NM', 'CO_NUM_NM']) {
      const decode = getDecodeForColumn(col)!;
      expect(decode.codes.length).toBe(1);
      expect(decode.codes[0].meaning).toContain('縣市名');
      expect(decode.codes[0].meaning).toContain('3 字');
    }
  });

  // -------------------------------------------------------------------------
  // (ii) decode sourceField ≡ 引擎 resolveColumnSource 取值來源
  //      引擎 keyword / 來源欄變更時，本斷言失敗以提示同步更新 decode。
  // -------------------------------------------------------------------------
  it('(ii) SALES_STS：sourceField=sales_sts_na 且引擎 keyword「中古車商」→UCD 同步', () => {
    const decode = getDecodeForColumn('SALES_STS')!;
    expect(decode.sourceField).toBe('ob_pool_data.sales_sts_na');
    // 引擎取值來源欄
    expect(engineExpr('SALES_STS')).toContain('sales_sts_na');
    // 引擎衍生 keyword（'中古車商'→'UCD'）：若引擎改 key，decode UCD 意義須同步 → 斷言失敗提示
    expect(engineExpr('SALES_STS')).toContain('中古車商');
    expect(engineExpr('SALES_STS')).toContain("'UCD'");
  });

  it('(ii) PROJECT_TP：sourceField=spec_tp + spec_name 且引擎「借新還舊」→A 同步', () => {
    const decode = getDecodeForColumn('PROJECT_TP')!;
    expect(decode.sourceField).toBe('spec_tp + spec_name');
    const expr = engineExpr('PROJECT_TP');
    expect(expr).toContain('spec_tp');
    expect(expr).toContain('spec_name');
    // 借新還舊衍生 keyword → 'A'：引擎 keyword 變更時 decode A 意義須同步
    expect(expr).toContain('借新還舊');
    expect(expr).toContain("'A'");
  });

  it('(ii) CUS_SEX：sourceField=customer_core.cus_sex 且引擎取 cc.cus_sex', () => {
    const decode = getDecodeForColumn('CUS_SEX')!;
    expect(decode.sourceField).toBe('customer_core.cus_sex');
    expect(engineExpr('CUS_SEX')).toContain('cc.cus_sex');
  });

  it('(ii) 三縣市欄：sourceField 對齊引擎 cc.<*_city> 取值', () => {
    const cityMap: Record<string, string> = {
      HPOST_NUM_NM: 'cc.hpost_city',
      CPOST_NUM_NM: 'cc.cpost_city',
      CO_NUM_NM: 'cc.co_city',
    };
    const sourceMap: Record<string, string> = {
      HPOST_NUM_NM: 'customer_core.hpost_city',
      CPOST_NUM_NM: 'customer_core.cpost_city',
      CO_NUM_NM: 'customer_core.co_city',
    };
    for (const [col, ccCol] of Object.entries(cityMap)) {
      const decode = getDecodeForColumn(col)!;
      expect(decode.sourceField).toBe(sourceMap[col]);
      expect(engineExpr(col)).toContain(ccCol);
    }
  });

  it('(ii) 五欄個人/法人分流 gating：欄層摘要含分流語意，codes 為空陣列（§3）', () => {
    for (const col of ['CAREA_NO1', 'CAREA_NO2', 'CELLULAR', 'AGE', 'EDUCAT_BACK']) {
      const decode = getDecodeForColumn(col)!;
      expect(decode.codes).toEqual([]);
      expect(decode.derivationRule).toContain('個人/法人');
    }
  });

  // -------------------------------------------------------------------------
  // 純數值欄（無衍生語意）→ decode=null（BR-6）
  // -------------------------------------------------------------------------
  it('純數值欄（LIST_MONTH / CAR_YEAR / LOAN_RATE / ADD_UN_CAPITAL）→ decode=null', () => {
    for (const col of ['LIST_MONTH', 'CAR_YEAR', 'LOAN_RATE', 'ADD_UN_CAPITAL']) {
      expect(getDecodeForColumn(col)).toBeNull();
    }
  });

  it('未映射欄（FOO_BAR）→ decode=null（不臆造）', () => {
    expect(getDecodeForColumn('FOO_BAR')).toBeNull();
  });

  it('getDecodeForColumn 回傳 deep copy（decode 唯讀，不可變更凍結常數）', () => {
    const a = getDecodeForColumn('SALES_STS')!;
    a.codes.push({ level: 'level1', code: 'X', meaning: 'mutated' });
    const b = getDecodeForColumn('SALES_STS')!;
    expect(b.codes.map((c) => c.code)).not.toContain('X');
  });
});
