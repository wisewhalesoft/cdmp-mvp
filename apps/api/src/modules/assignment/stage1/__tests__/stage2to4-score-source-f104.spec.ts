/**
 * F104 / AD-E07-10-L v4.0 — Stage 2 計分引擎全欄對齊 legacy SP（單元 / 靜態，無 Postgres）
 *
 * 對應測試設計（F104-test.md）非 PG 群組：
 *   - KW   ：PROJECT_TP '借新還舊' / SALES_STS '中古車商'（JS + PG 靜態）
 *   - SEX  ：CUS_SEX range + safe-cast + 計分 default 3
 *   - BRANCH：五欄 isCorp 分流（個人/法人/空/NULL/髒值）
 *   - SAFE ：cus_sex NULL-safe（JS isCorporate / safeIntCusSex 不回 NaN 污染）
 *   - AGE100：calcAgeYears + >100 排除 + 法人 0
 *   - EDU  ：補零 + per-card default + 法人 default
 *   - CITY ：縣市 LEFT3 + per-card default + PG 靜態
 *   - PCD  ：LIST_MONTH / LOAN_RATE per-card default
 *   - SIG  ：簽章 + 介面（cardType；CustomerCoreRow 新欄；MAPPED/CUSTOMER_CORE 集合）
 *   - REG-005：fs+regex 靜態掃描舊關鍵字/欄名全清
 *   - OQ-TDS-F104-03：未知 card_type fallback（cardDefault）
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

import {
  calcAgeYears,
  safeIntCusSex,
  isCorporateCusSex,
  AssignmentRunPipelineService,
  type CustomerCoreRow,
  type ArCapitalRow,
  type CompositeValue,
} from '../../services/assignment-run-pipeline.service';
import {
  resolveColumnSource,
  cardDefault,
  MAPPED_SCORING_COLUMNS,
  CUSTOMER_CORE_COLUMNS,
} from '../stage2to4-sql-builder';
import type { ObPoolData } from '@/database/entities/ob-pool-data.entity';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function makeService(): AssignmentRunPipelineService {
  const svc = Object.create(
    AssignmentRunPipelineService.prototype,
  ) as AssignmentRunPipelineService;
  Object.defineProperty(svc, 'logger', {
    value: { warn: vi.fn(), log: vi.fn(), error: vi.fn(), debug: vi.fn() },
    writable: true,
    configurable: true,
  });
  return svc;
}

type ResolveFn = (
  pool: ObPoolData,
  columnName: string,
  cc: CustomerCoreRow | null,
  arCap: ArCapitalRow | null,
  cardType: string,
) => string | number | CompositeValue;

function resolver(svc: AssignmentRunPipelineService): ResolveFn {
  return (svc as unknown as { resolveColumnValue: ResolveFn }).resolveColumnValue.bind(svc);
}

function pool(overrides: Partial<ObPoolData> = {}): ObPoolData {
  return { orgno: '01', appl_no: 'A1', custo_no: 'C1', ...overrides } as ObPoolData;
}

function cc(overrides: Partial<CustomerCoreRow> = {}): CustomerCoreRow {
  return {
    source_customer_no: 'C1',
    cus_sex: null,
    date_of_birth: null,
    education_code: null,
    hpost_city: null,
    cpost_city: null,
    co_city: null,
    carea_no1: null,
    carea_no2: null,
    cellular: null,
    ...overrides,
  };
}

/** 由 today 推算「age 歲」之 date_of_birth（YYYY-MM-DD，生日已過確保整數）。 */
function dobForAge(age: number, today = new Date()): string {
  const d = new Date(today.getFullYear() - age, today.getMonth(), today.getDate() - 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ===========================================================================
// 一、KW — 關鍵字修正
// ===========================================================================
describe('F104 KW — PROJECT_TP 借新還舊 / SALES_STS 中古車商', () => {
  let r: ResolveFn;
  beforeEach(() => {
    r = resolver(makeService());
  });

  it('KW-001：PG resolveColumnSource(PROJECT_TP) composite，keywordExpr 含 %借新還舊%，不含 %專案%', () => {
    // F105 / AD-E07-35：PROJECT_TP 改 composite（codeExpr + keywordExpr），保留借新還舊關鍵字修正。
    const s = resolveColumnSource('PROJECT_TP', 'H');
    expect(s.kind).toBe('composite');
    expect(s.codeExpr).toBe("COALESCE(o.spec_tp, '01')");
    expect(s.keywordExpr).toContain("o.spec_name LIKE '%借新還舊%'");
    expect(s.keywordExpr).toContain("THEN 'A'");
    expect(s.keywordExpr).toContain("ELSE ''");
    expect(s.keywordExpr).not.toContain('%專案%');
  });

  it('KW-002：JS PROJECT_TP composite 回 {code,keyword}；借新還舊→keyword A、含「專案」不命中', () => {
    // F105 / AD-E07-35：回結構化 {code, keyword}。
    expect(r(pool({ spec_name: '借新還舊專案', spec_tp: '06' }), 'PROJECT_TP', null, null, 'H'))
      .toEqual({ code: '06', keyword: 'A' });
    expect(r(pool({ spec_name: '汽車貸款專案', spec_tp: '02' }), 'PROJECT_TP', null, null, 'H'))
      .toEqual({ code: '02', keyword: '' });
  });

  it('KW-003：PG resolveColumnSource(SALES_STS) 含 中古車商 THEN UCD，不含 經銷商', () => {
    const s = resolveColumnSource('SALES_STS', 'H');
    expect(s.expr).toContain("WHEN '中古車商' THEN 'UCD'");
    expect(s.expr).toContain("WHEN 'AGENT' THEN 'AGENT'");
    expect(s.expr).toContain("ELSE 'HFC'");
    expect(s.expr).not.toContain('經銷商');
  });

  it('KW-004：JS SALES_STS 中古車商→UCD / 經銷商不再命中→HFC', () => {
    expect(r(pool({ sales_sts_na: 'AGENT' }), 'SALES_STS', null, null, 'H')).toBe('AGENT');
    expect(r(pool({ sales_sts_na: '中古車商' }), 'SALES_STS', null, null, 'H')).toBe('UCD');
    expect(r(pool({ sales_sts_na: '和潤' }), 'SALES_STS', null, null, 'H')).toBe('HFC');
    expect(r(pool({ sales_sts_na: '經銷商' }), 'SALES_STS', null, null, 'H')).toBe('HFC');
  });
});

// ===========================================================================
// 二、SEX — CUS_SEX range 比對
// ===========================================================================
describe('F104 SEX — CUS_SEX range + safe-cast + 計分 default 3', () => {
  let r: ResolveFn;
  beforeEach(() => {
    r = resolver(makeService());
  });

  it('SEX-001：PG resolveColumnSource(CUS_SEX) kind=range + safe-cast + COALESCE(...,3)', () => {
    const s = resolveColumnSource('CUS_SEX', 'H');
    expect(s.kind).toBe('range');
    expect(s.expr).toContain("cc.cus_sex ~ '^[0-9]+$'");
    expect(s.expr).toContain('COALESCE(');
    expect(s.expr).toContain(', 3)');
    // 裸 cast 必在 ~ '^[0-9]+$' 守門 CASE 內（不得無守門直接 ::int）。
    expect(s.expr).toContain("CASE WHEN cc.cus_sex ~ '^[0-9]+$' THEN cc.cus_sex::int ELSE NULL END");
    expect(s.expr).not.toContain('cc.gender');
  });

  it('SEX-002：JS CUS_SEX safe-cast — 1→1；空/髒值/null→3', () => {
    expect(r(pool(), 'CUS_SEX', cc({ cus_sex: '1' }), null, 'H')).toBe(1);
    expect(r(pool(), 'CUS_SEX', cc({ cus_sex: '' }), null, 'H')).toBe(3);
    expect(r(pool(), 'CUS_SEX', cc({ cus_sex: 'C' }), null, 'H')).toBe(3);
    expect(r(pool(), 'CUS_SEX', null, null, 'H')).toBe(3);
  });
});

// ===========================================================================
// 三、BRANCH — 五欄 isCorp 分流
// ===========================================================================
describe('F104 BRANCH — 五欄 isCorp 分流', () => {
  let r: ResolveFn;
  beforeEach(() => {
    r = resolver(makeService());
  });

  it('BRANCH-001：個人(1) CAREA_NO1 有區碼 → 1', () => {
    expect(r(pool(), 'CAREA_NO1', cc({ cus_sex: '1', carea_no1: '02' }), null, 'H')).toBe(1);
  });

  it('BRANCH-002：個人(2) CAREA_NO1 空字串 → 0', () => {
    expect(r(pool(), 'CAREA_NO1', cc({ cus_sex: '2', carea_no1: '' }), null, 'H')).toBe(0);
  });

  it('BRANCH-003：個人 CAREA_NO2 / CELLULAR presence 1/0（讀 cc.cellular）', () => {
    expect(r(pool(), 'CAREA_NO2', cc({ cus_sex: '1', carea_no2: '02' }), null, 'H')).toBe(1);
    expect(r(pool(), 'CELLULAR', cc({ cus_sex: '1', cellular: '0912' }), null, 'E5')).toBe(1);
    expect(r(pool(), 'CAREA_NO2', cc({ cus_sex: '1', carea_no2: null }), null, 'H')).toBe(0);
    expect(r(pool(), 'CELLULAR', cc({ cus_sex: '1', cellular: '' }), null, 'E5')).toBe(0);
  });

  it('BRANCH-004：法人(3) CAREA_NO1/NO2/CELLULAR → 0（即使有值）', () => {
    const corp = cc({ cus_sex: '3', carea_no1: '02', carea_no2: '02', cellular: '0912' });
    expect(r(pool(), 'CAREA_NO1', corp, null, 'H')).toBe(0);
    expect(r(pool(), 'CAREA_NO2', corp, null, 'H')).toBe(0);
    expect(r(pool(), 'CELLULAR', corp, null, 'E5')).toBe(0);
  });

  it('BRANCH-005：法人(3) AGE→0、EDUCAT_BACK→per-card default', () => {
    const corp = cc({ cus_sex: '3', date_of_birth: '1990-01-01', education_code: '5' });
    expect(r(pool(), 'AGE', corp, null, 'S')).toBe(0);
    expect(r(pool(), 'EDUCAT_BACK', corp, null, 'S')).toBe('02');
  });

  it('BRANCH-006：空 cus_sex（"") → 個人分支取自身屬性（gating default=1）', () => {
    const c = cc({ cus_sex: '', carea_no1: '02', date_of_birth: dobForAge(36), education_code: '5' });
    expect(r(pool(), 'CAREA_NO1', c, null, 'S')).toBe(1);
    expect(r(pool(), 'AGE', c, null, 'S')).toBe(36);
    expect(r(pool(), 'EDUCAT_BACK', c, null, 'S')).toBe('05'); // 個人補零，非 default
  });

  it('BRANCH-007：NULL cus_sex（cc=null）→ 個人分支但自身屬性缺 → 0/default', () => {
    expect(r(pool(), 'CAREA_NO1', null, null, 'S')).toBe(0);
    expect(r(pool(), 'AGE', null, null, 'S')).toBe(0);
    expect(r(pool(), 'EDUCAT_BACK', null, null, 'S')).toBe('02');
  });

  it('BRANCH-008：髒值 cus_sex(C) gating → 法人分支（取 0）', () => {
    expect(r(pool(), 'CAREA_NO1', cc({ cus_sex: 'C', carea_no1: '02' }), null, 'H')).toBe(0);
  });
});

// ===========================================================================
// 四、SAFE — cus_sex NULL-safe（JS helper）
// ===========================================================================
describe('F104 SAFE — cus_sex NULL-safe（safeIntCusSex / isCorporateCusSex）', () => {
  it('SAFE-004a：safeIntCusSex 髒值/空/null → null；數值 → number', () => {
    expect(safeIntCusSex('1')).toBe(1);
    expect(safeIntCusSex('3')).toBe(3);
    expect(safeIntCusSex('C')).toBeNull();
    expect(safeIntCusSex('D')).toBeNull();
    expect(safeIntCusSex('')).toBeNull();
    expect(safeIntCusSex(null)).toBeNull();
    expect(safeIntCusSex(undefined)).toBeNull();
    // 不回 NaN（污染 range 比對）
    expect(Number.isNaN(safeIntCusSex('C') as unknown as number)).toBe(false);
  });

  it('SAFE-004b：isCorporateCusSex — 空/null/1/2 → 個人；3/髒值/數值非 1,2 → 法人', () => {
    expect(isCorporateCusSex('')).toBe(false); // 個人（gating default 1）
    expect(isCorporateCusSex(null)).toBe(false);
    expect(isCorporateCusSex(undefined)).toBe(false);
    expect(isCorporateCusSex('1')).toBe(false);
    expect(isCorporateCusSex('2')).toBe(false);
    expect(isCorporateCusSex('3')).toBe(true); // 法人
    expect(isCorporateCusSex('C')).toBe(true); // 髒值 → 法人
    expect(isCorporateCusSex('D')).toBe(true);
    expect(isCorporateCusSex('8')).toBe(true);
  });

  it('SAFE-001a：PG CUS_SEX expr 為 NULL-safe（不含裸 cc.cus_sex::int 於 CASE 外）', () => {
    const s = resolveColumnSource('CUS_SEX', 'H');
    // safe cast 必在 ~ '^[0-9]+$' 守門 CASE 內
    expect(s.expr).toContain("CASE WHEN cc.cus_sex ~ '^[0-9]+$' THEN cc.cus_sex::int ELSE NULL END");
  });

  it('SAFE-002a：PG 分流 gating expr 為 NULL-safe + gating default 1', () => {
    const s = resolveColumnSource('CAREA_NO1', 'H');
    expect(s.expr).toContain("COALESCE(NULLIF(cc.cus_sex,''),'1')");
    expect(s.expr).toContain("~ '^[0-9]+$'");
    expect(s.expr).toContain('IN (1, 2)');
  });
});

// ===========================================================================
// 五、AGE100 — >100 排除 + 法人 0
// ===========================================================================
describe('F104 AGE100 — >100 排除 + 法人 0', () => {
  let r: ResolveFn;
  beforeEach(() => {
    r = resolver(makeService());
  });

  it('AGE100-001：calcAgeYears age=100 → 100（邊界內，取值）', () => {
    const today = new Date('2026-06-24T00:00:00');
    expect(calcAgeYears(dobForAge(100, today), today)).toBe(100);
  });

  it('AGE100-002：個人 age=101 → 0（>100 排除）', () => {
    expect(r(pool(), 'AGE', cc({ cus_sex: '1', date_of_birth: dobForAge(101) }), null, 'S')).toBe(0);
  });

  it('AGE100-003：個人 age<0（未來生日）→ 0', () => {
    const today = new Date();
    const future = new Date(today.getFullYear() + 1, today.getMonth(), today.getDate());
    const y = future.getFullYear();
    const m = String(future.getMonth() + 1).padStart(2, '0');
    const day = String(future.getDate()).padStart(2, '0');
    expect(r(pool(), 'AGE', cc({ cus_sex: '1', date_of_birth: `${y}-${m}-${day}` }), null, 'S')).toBe(0);
  });

  it('AGE100-004：date NULL → 0；法人(50歲)→ 0', () => {
    expect(r(pool(), 'AGE', cc({ cus_sex: '1', date_of_birth: null }), null, 'S')).toBe(0);
    expect(r(pool(), 'AGE', cc({ cus_sex: '3', date_of_birth: dobForAge(50) }), null, 'S')).toBe(0);
  });

  it('AGE100-PG：PG AGE expr 含 >100 守門 + isCorp 分流', () => {
    const s = resolveColumnSource('AGE', 'S');
    expect(s.expr).toContain('> 100');
    expect(s.expr).toContain('< 0');
    expect(s.expr).toContain('IN (1, 2)'); // isCorp gating
  });
});

// ===========================================================================
// 六、EDU — EDUCAT_BACK 補零 + per-card default
// ===========================================================================
describe('F104 EDU — 補零 + per-card default', () => {
  let r: ResolveFn;
  beforeEach(() => {
    r = resolver(makeService());
  });

  it('EDU-001：個人 education_code=5 → 05（補零）', () => {
    expect(r(pool(), 'EDUCAT_BACK', cc({ cus_sex: '1', education_code: '5' }), null, 'S')).toBe('05');
  });

  it('EDU-002：個人 education_code=12 → 12（兩碼不補）', () => {
    expect(r(pool(), 'EDUCAT_BACK', cc({ cus_sex: '1', education_code: '12' }), null, 'S')).toBe('12');
  });

  it('EDU-003：個人缺值 → per-card default S→02', () => {
    expect(r(pool(), 'EDUCAT_BACK', cc({ cus_sex: '1', education_code: null }), null, 'S')).toBe('02');
  });

  it('EDU-004：per-card default 逐格 S→02 / S5→08 / E→02 / E5→02', () => {
    const c = cc({ cus_sex: '1', education_code: null });
    expect(r(pool(), 'EDUCAT_BACK', c, null, 'S')).toBe('02');
    expect(r(pool(), 'EDUCAT_BACK', c, null, 'S5')).toBe('08');
    expect(r(pool(), 'EDUCAT_BACK', c, null, 'E')).toBe('02');
    expect(r(pool(), 'EDUCAT_BACK', c, null, 'E5')).toBe('02');
  });

  it('EDU-005：法人(3) → per-card default（忽略 education_code）', () => {
    expect(r(pool(), 'EDUCAT_BACK', cc({ cus_sex: '3', education_code: '12' }), null, 'S5')).toBe('08');
  });
});

// ===========================================================================
// 七、CITY — 三縣市欄 LEFT3 + per-card default
// ===========================================================================
describe('F104 CITY — 縣市 LEFT3 + per-card default', () => {
  let r: ResolveFn;
  beforeEach(() => {
    r = resolver(makeService());
  });

  it('CITY-001：HPOST 縣市+區 6 字 → LEFT3 取縣市', () => {
    expect(r(pool(), 'HPOST_NUM_NM', cc({ hpost_city: '臺北市中正區' }), null, 'M')).toBe('臺北市');
  });

  it('CITY-004：HPOST 缺值 default — S5→花蓮縣 / M/HM→臺北市', () => {
    expect(r(pool(), 'HPOST_NUM_NM', cc({ hpost_city: null }), null, 'S5')).toBe('花蓮縣');
    expect(r(pool(), 'HPOST_NUM_NM', cc({ hpost_city: null }), null, 'M')).toBe('臺北市');
    expect(r(pool(), 'HPOST_NUM_NM', cc({ hpost_city: null }), null, 'HM')).toBe('臺北市');
  });

  it('CITY-005：CPOST 缺值 default — M/HM→臺南市', () => {
    expect(r(pool(), 'CPOST_NUM_NM', cc({ cpost_city: null }), null, 'M')).toBe('臺南市');
    expect(r(pool(), 'CPOST_NUM_NM', cc({ cpost_city: null }), null, 'HM')).toBe('臺南市');
  });

  it('CITY-006：CO_NUM 缺值 default — S5/E5→金門縣 / M/HM→高雄市', () => {
    expect(r(pool(), 'CO_NUM_NM', cc({ co_city: null }), null, 'S5')).toBe('金門縣');
    expect(r(pool(), 'CO_NUM_NM', cc({ co_city: null }), null, 'E5')).toBe('金門縣');
    expect(r(pool(), 'CO_NUM_NM', cc({ co_city: null }), null, 'M')).toBe('高雄市');
    expect(r(pool(), 'CO_NUM_NM', cc({ co_city: null }), null, 'HM')).toBe('高雄市');
  });

  it('CITY-007：cc 整列 NULL → 縣市欄走 per-card default', () => {
    expect(r(pool(), 'HPOST_NUM_NM', null, null, 'M')).toBe('臺北市');
    expect(r(pool(), 'CPOST_NUM_NM', null, null, 'M')).toBe('臺南市');
    expect(r(pool(), 'CO_NUM_NM', null, null, 'M')).toBe('高雄市');
  });

  it('CITY-008：PG resolveColumnSource(HPOST_NUM_NM,M) expr 含 LEFT(...,3) + cc.hpost_city + 臺北市，不含 residential_zip', () => {
    const s = resolveColumnSource('HPOST_NUM_NM', 'M');
    expect(s.kind).toBe('category');
    expect(s.expr).toContain('LEFT(');
    expect(s.expr).toContain('cc.hpost_city');
    expect(s.expr).toContain('臺北市');
    expect(s.expr).toContain(', 3)');
    expect(s.expr).not.toContain('residential_zip');
  });
});

// ===========================================================================
// 八、PCD — LIST_MONTH / LOAN_RATE per-card default
// ===========================================================================
describe('F104 PCD — LIST_MONTH / LOAN_RATE per-card default', () => {
  let r: ResolveFn;
  beforeEach(() => {
    r = resolver(makeService());
  });

  it('PCD-001：LIST_MONTH 缺值 — H→25 / S→25', () => {
    expect(r(pool({ month_cnt: null }), 'LIST_MONTH', null, null, 'H')).toBe(25);
    expect(r(pool({ month_cnt: null }), 'LIST_MONTH', null, null, 'S')).toBe(25);
  });

  it('PCD-002：LIST_MONTH 缺值 — E→12 / E5→12', () => {
    expect(r(pool({ month_cnt: null }), 'LIST_MONTH', null, null, 'E')).toBe(12);
    expect(r(pool({ month_cnt: null }), 'LIST_MONTH', null, null, 'E5')).toBe(12);
  });

  it('PCD-003：LIST_MONTH 有值 → 取值（不套 default）', () => {
    expect(r(pool({ month_cnt: 6 }), 'LIST_MONTH', null, null, 'E')).toBe(6);
  });

  it('PCD-004：LOAN_RATE 缺值 — S5→77', () => {
    expect(r(pool({ loan_rate: null }), 'LOAN_RATE', null, null, 'S5')).toBe(77);
  });

  it('PCD-005：LOAN_RATE 缺值 — E→12 / E5→12', () => {
    expect(r(pool({ loan_rate: null }), 'LOAN_RATE', null, null, 'E')).toBe(12);
    expect(r(pool({ loan_rate: null }), 'LOAN_RATE', null, null, 'E5')).toBe(12);
  });

  it('PCD-006：LOAN_RATE 缺值 — 其他 card（H）→ 0', () => {
    expect(r(pool({ loan_rate: null }), 'LOAN_RATE', null, null, 'H')).toBe(0);
  });

  it('PCD-PG：PG LIST_MONTH default 依 cardType（E→12 區別 H→25）', () => {
    expect(resolveColumnSource('LIST_MONTH', 'H').expr).toBe('COALESCE(o.month_cnt, 25)');
    expect(resolveColumnSource('LIST_MONTH', 'E').expr).toBe('COALESCE(o.month_cnt, 12)');
    expect(resolveColumnSource('LOAN_RATE', 'S5').expr).toContain('77');
    expect(resolveColumnSource('LOAN_RATE', 'E').expr).toContain('12');
    expect(resolveColumnSource('LOAN_RATE', 'H').expr).toContain('0');
  });
});

// ===========================================================================
// 九、SIG — 簽章 + 介面變更
// ===========================================================================
describe('F104 SIG — 簽章 + 介面（cardType / CustomerCoreRow / 集合）', () => {
  it('SIG-001：resolveColumnSource(columnName, cardType) 雙參數；per-card default 依 cardType', () => {
    expect(resolveColumnSource('LIST_MONTH', 'E').expr).toBe('COALESCE(o.month_cnt, 12)');
    expect(resolveColumnSource('LIST_MONTH', 'H').expr).toBe('COALESCE(o.month_cnt, 25)');
  });

  it('SIG-002：resolveColumnValue 五參數簽章；EDUCAT 缺值依 cardType 不同 default', () => {
    const r = resolver(makeService());
    const c = cc({ cus_sex: '1', education_code: null });
    expect(r(pool(), 'EDUCAT_BACK', c, null, 'S')).toBe('02');
    expect(r(pool(), 'EDUCAT_BACK', c, null, 'S5')).toBe('08');
  });

  it('SIG-003：CustomerCoreRow 新欄名（型別靜態）', () => {
    const c: CustomerCoreRow = {
      source_customer_no: 'C', cus_sex: '1', date_of_birth: null, education_code: null,
      hpost_city: null, cpost_city: null, co_city: null,
      carea_no1: null, carea_no2: null, cellular: null,
    };
    expect(c.cus_sex).toBe('1');
    expect('carea_no1' in c).toBe(true);
    expect('cellular' in c).toBe(true);
    expect('hpost_city' in c).toBe(true);
  });

  it('SIG-004：MAPPED_SCORING_COLUMNS 15 欄（含 ADD_UN_CAPITAL，不含 COMMISSION）；CUSTOMER_CORE_COLUMNS 9 欄', () => {
    expect(MAPPED_SCORING_COLUMNS.length).toBe(15);
    expect(MAPPED_SCORING_COLUMNS as readonly string[]).toContain('ADD_UN_CAPITAL');
    expect(MAPPED_SCORING_COLUMNS as readonly string[]).not.toContain('COMMISSION');
    expect(CUSTOMER_CORE_COLUMNS.size).toBe(9);
    for (const c of ['CUS_SEX', 'AGE', 'EDUCAT_BACK', 'CAREA_NO1', 'CAREA_NO2', 'CELLULAR', 'HPOST_NUM_NM', 'CPOST_NUM_NM', 'CO_NUM_NM']) {
      expect(CUSTOMER_CORE_COLUMNS.has(c)).toBe(true);
    }
  });
});

// ===========================================================================
// 十、OQ-TDS-F104-03 — 未知 card_type fallback（cardDefault）
// ===========================================================================
describe('F104 OQ-TDS-F104-03 — 未知 card_type fallback', () => {
  it('UNKNOWN：未知 card_type → LIST_MONTH=25 / LOAN_RATE=0 / EDUCAT=02 / 縣市=null', () => {
    expect(cardDefault('LIST_MONTH', 'ZZZ')).toBe(25);
    expect(cardDefault('LOAN_RATE', 'ZZZ')).toBe(0);
    expect(cardDefault('EDUCAT_BACK', 'ZZZ')).toBe('02');
    expect(cardDefault('HPOST_NUM_NM', 'ZZZ')).toBeNull();
    expect(cardDefault('CPOST_NUM_NM', 'ZZZ')).toBeNull();
    expect(cardDefault('CO_NUM_NM', 'ZZZ')).toBeNull();
  });

  it('UNKNOWN-JS：未知 card resolveColumnValue LIST_MONTH 缺值→25、LOAN_RATE→0、縣市→空（不匹配）', () => {
    const r = resolver(makeService());
    expect(r(pool({ month_cnt: null }), 'LIST_MONTH', null, null, 'ZZZ')).toBe(25);
    expect(r(pool({ loan_rate: null }), 'LOAN_RATE', null, null, 'ZZZ')).toBe(0);
    expect(r(pool(), 'HPOST_NUM_NM', cc({ hpost_city: null }), null, 'ZZZ')).toBe('');
  });
});

// ===========================================================================
// 十三、REG-005 — fs+regex 靜態掃描舊關鍵字/欄名全清（feedback_grep_negative_lookahead）
// ===========================================================================
describe('F104 REG-005 — 計分路徑舊關鍵字/欄名全清（fs+regex，掃描去註解後之程式碼）', () => {
  /** 移除 // 行註解與 block 註解，僅掃描可執行程式碼（doc comment 引用舊關鍵字作說明屬合法）。 */
  function stripComments(src: string): string {
    return src
      .replace(/\/\*[\s\S]*?\*\//g, '') // block 註解
      .split('\n')
      .map((line) => line.replace(/\/\/.*$/, '')) // 行尾 // 註解
      .join('\n');
  }
  const builderCode = stripComments(
    fs.readFileSync(path.resolve(__dirname, '../stage2to4-sql-builder.ts'), 'utf8'),
  );
  const pipelineCode = stripComments(
    fs.readFileSync(
      path.resolve(__dirname, '../../services/assignment-run-pipeline.service.ts'),
      'utf8',
    ),
  );

  it('builder：計分 expr 不含 %專案% / 經銷商 / cc.gender / *_zip / *_phone', () => {
    expect(builderCode).not.toMatch(/'%專案%'/);
    expect(builderCode).not.toContain("'經銷商'");
    expect(builderCode).not.toContain('cc.gender');
    expect(builderCode).not.toContain('residential_zip');
    expect(builderCode).not.toContain('mailing_zip');
    expect(builderCode).not.toContain('company_zip');
    expect(builderCode).not.toContain('cc.home_phone');
    expect(builderCode).not.toContain('cc.contact_phone');
    expect(builderCode).not.toContain('cc.mobile_phone');
  });

  it('pipeline：resolveColumnValue 計分路徑不含 includes(專案) / 經銷商 / cc.gender / cc.*_zip / cc.*_phone', () => {
    expect(pipelineCode).not.toContain("includes('專案')");
    expect(pipelineCode).not.toContain("'經銷商'");
    expect(pipelineCode).not.toContain('cc.gender');
    expect(pipelineCode).not.toContain('cc?.gender');
    expect(pipelineCode).not.toContain('residential_zip');
    expect(pipelineCode).not.toContain('mailing_zip');
    expect(pipelineCode).not.toContain('company_zip');
    expect(pipelineCode).not.toContain('cc?.home_phone');
    expect(pipelineCode).not.toContain('cc?.contact_phone');
    expect(pipelineCode).not.toContain('cc?.mobile_phone');
  });
});
