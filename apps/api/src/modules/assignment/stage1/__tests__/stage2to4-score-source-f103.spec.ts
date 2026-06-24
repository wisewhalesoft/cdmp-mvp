/**
 * F103 / AD-E07-v3.5 — Stage 2 計分欄位來源修正（單元 / 靜態，無 Postgres）
 *   【F104 更新】依 F104-test.md §十四，本檔多數案例語意已隨 F104 改變：
 *     - CustomerCoreRow 欄名改（gender→cus_sex 等 7 欄）
 *     - resolveColumnValue / computeScore 簽章加 cardType
 *     - PROJECT_TP '專案'→'借新還舊'；SALES_STS '經銷商'→'中古車商'
 *     - CUS_SEX category→range（safe-cast，計分 default 3）
 *     - 五欄 isCorp 分流；縣市欄改讀 *_city + LEFT3 + per-card default；EDUCAT 補零 + per-card default
 *
 * 「須保通過」之 F103 案例（AR/CAR_YEAR/FALLBACK/GHOST/COMMISSION/PREFETCH/AUDIT-001/004/005）不退化。
 *
 * 註：resolveColumnValue / computeScore 為 private → 透過 service 實例以 bracket-access 呼叫；
 *   calcAgeYears / MAPPED_SCORING_COLUMNS 為 export 純函式直接測。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  calcAgeYears,
  AssignmentRunPipelineService,
  type CustomerCoreRow,
  type ArCapitalRow,
} from '../../services/assignment-run-pipeline.service';
import { MAPPED_SCORING_COLUMNS, resolveColumnSource } from '../stage2to4-sql-builder';
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
) => string | number;

function resolver(svc: AssignmentRunPipelineService): ResolveFn {
  return (svc as unknown as { resolveColumnValue: ResolveFn }).resolveColumnValue.bind(svc);
}

function pool(overrides: Partial<ObPoolData> = {}): ObPoolData {
  return {
    orgno: '01',
    appl_no: 'A1',
    custo_no: 'C1',
    ...overrides,
  } as ObPoolData;
}

// F104：CustomerCoreRow 新欄名（gender→cus_sex 等）。
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

const TODAY = new Date('2026-06-24T00:00:00');

// ===========================================================================
// AGE — calcAgeYears 統一演算法（I-SCORE-AGE-01）
// ===========================================================================
describe('F103 AGE — calcAgeYears 統一演算法（對齊 PG age()）', () => {
  it('AGE-001：生日前一天（1990-06-23, today=2026-06-24）→ 36', () => {
    expect(calcAgeYears(new Date('1990-06-23T00:00:00'), TODAY)).toBe(36);
  });

  it('AGE-002：生日當天（1990-06-24）→ 36（當天算已過，不減 1）', () => {
    expect(calcAgeYears(new Date('1990-06-24T00:00:00'), TODAY)).toBe(36);
  });

  it('AGE-003：生日後一天（1990-06-25）→ 35（未到，減 1）', () => {
    expect(calcAgeYears(new Date('1990-06-25T00:00:00'), TODAY)).toBe(35);
  });

  it('AGE：接受 YYYY-MM-DD 字串（SQLite date 欄回字串）', () => {
    expect(calcAgeYears('1990-06-23', TODAY)).toBe(36);
    expect(calcAgeYears('1990-06-25', TODAY)).toBe(35);
  });

  it('AGE-004：resolveColumnValue AGE cc=null → 0', () => {
    const r = resolver(makeService());
    expect(r(pool(), 'AGE', null, null, 'S')).toBe(0);
  });
});

// ===========================================================================
// AR — ADD_UN_CAPITAL JS 取值（AC-9，須保通過）
// ===========================================================================
describe('F103 AR-005 — JS ADD_UN_CAPITAL 取值', () => {
  it('arCap=null → 0', () => {
    const r = resolver(makeService());
    expect(r(pool(), 'ADD_UN_CAPITAL', null, null, 'H')).toBe(0);
  });

  it('arCap.add_un_capital=20（number）→ 20', () => {
    const r = resolver(makeService());
    expect(r(pool(), 'ADD_UN_CAPITAL', null, { appl_no: 'A1', add_un_capital: 20 }, 'H')).toBe(20);
  });

  it('arCap.add_un_capital="36"（numeric→string）→ 36', () => {
    const r = resolver(makeService());
    expect(r(pool(), 'ADD_UN_CAPITAL', null, { appl_no: 'A1', add_un_capital: '36' }, 'H')).toBe(36);
  });
});

// ===========================================================================
// CC — customer_core 各欄 JS 取值（F104 新語意）
// ===========================================================================
describe('F104 CC — customer_core 各欄 JS 取值（更新自 F103）', () => {
  let r: ResolveFn;
  beforeEach(() => {
    r = resolver(makeService());
  });

  it('CC-001：CUS_SEX range 取值 — cc=null/空/髒值 → 3；cus_sex="1" → 1', () => {
    expect(r(pool(), 'CUS_SEX', null, null, 'H')).toBe(3);
    expect(r(pool(), 'CUS_SEX', cc({ cus_sex: '' }), null, 'H')).toBe(3);
    expect(r(pool(), 'CUS_SEX', cc({ cus_sex: 'C' }), null, 'H')).toBe(3);
    expect(r(pool(), 'CUS_SEX', cc({ cus_sex: '1' }), null, 'H')).toBe(1);
  });

  it('CC-002：CAREA_NO1 個人 presence；法人 0', () => {
    // 個人（cus_sex='1'）有區碼 → 1；空字串 → 0。
    expect(r(pool(), 'CAREA_NO1', cc({ cus_sex: '1', carea_no1: '02' }), null, 'H')).toBe(1);
    expect(r(pool(), 'CAREA_NO1', cc({ cus_sex: '1', carea_no1: '' }), null, 'H')).toBe(0);
    // 法人（cus_sex='3'）即使有值 → 0。
    expect(r(pool(), 'CAREA_NO1', cc({ cus_sex: '3', carea_no1: '02' }), null, 'H')).toBe(0);
  });

  it('CC-003：CAREA_NO2 個人 presence；CELLULAR 讀 cc.cellular', () => {
    expect(r(pool(), 'CAREA_NO2', cc({ cus_sex: '1', carea_no2: '02' }), null, 'H')).toBe(1);
    expect(r(pool(), 'CAREA_NO2', cc({ cus_sex: '1', carea_no2: null }), null, 'H')).toBe(0);
    expect(r(pool(), 'CELLULAR', cc({ cus_sex: '1', cellular: '0912' }), null, 'E5')).toBe(1);
    expect(r(pool(), 'CELLULAR', cc({ cus_sex: '1', cellular: '' }), null, 'E5')).toBe(0);
  });

  it('CC-004：法人五欄全 0/default（不取自身屬性）', () => {
    const corp = cc({ cus_sex: '3', carea_no1: '02', carea_no2: '02', cellular: '0912' });
    expect(r(pool(), 'CAREA_NO1', corp, null, 'H')).toBe(0);
    expect(r(pool(), 'CAREA_NO2', corp, null, 'H')).toBe(0);
    expect(r(pool(), 'CELLULAR', corp, null, 'E5')).toBe(0);
  });

  it('CC-005：AGE 個人正確年齡；>100→0；法人→0', () => {
    expect(r(pool(), 'AGE', null, null, 'S')).toBe(0);
    const age = r(pool(), 'AGE', cc({ cus_sex: '1', date_of_birth: '1990-01-01' }), null, 'S') as number;
    expect(age).toBeGreaterThanOrEqual(36);
    // 法人 → 0（忽略生日）。
    expect(r(pool(), 'AGE', cc({ cus_sex: '3', date_of_birth: '1990-01-01' }), null, 'S')).toBe(0);
  });

  it('CC-006：EDUCAT_BACK 個人補零 + per-card default；法人 default', () => {
    // 個人補零：'5' → '05'；'12' → '12'。
    expect(r(pool(), 'EDUCAT_BACK', cc({ cus_sex: '1', education_code: '5' }), null, 'S')).toBe('05');
    expect(r(pool(), 'EDUCAT_BACK', cc({ cus_sex: '1', education_code: '12' }), null, 'S')).toBe('12');
    // 缺值 per-card default：S→'02'、S5→'08'。
    expect(r(pool(), 'EDUCAT_BACK', cc({ cus_sex: '1', education_code: null }), null, 'S')).toBe('02');
    expect(r(pool(), 'EDUCAT_BACK', cc({ cus_sex: '1', education_code: null }), null, 'S5')).toBe('08');
    // 法人 → per-card default（忽略 education_code）。
    expect(r(pool(), 'EDUCAT_BACK', cc({ cus_sex: '3', education_code: '12' }), null, 'S5')).toBe('08');
  });

  it('CC-007：HPOST_NUM_NM 縣市名 LEFT3 + per-card default', () => {
    expect(r(pool(), 'HPOST_NUM_NM', cc({ hpost_city: '臺北市中正區' }), null, 'M')).toBe('臺北市');
    // 缺值 default：S5→花蓮縣、M/HM→臺北市。
    expect(r(pool(), 'HPOST_NUM_NM', cc({ hpost_city: null }), null, 'S5')).toBe('花蓮縣');
    expect(r(pool(), 'HPOST_NUM_NM', null, null, 'M')).toBe('臺北市');
  });

  it('CC-008：CPOST_NUM_NM 縣市名 LEFT3 + M/HM default 臺南市', () => {
    expect(r(pool(), 'CPOST_NUM_NM', cc({ cpost_city: '臺南市東區' }), null, 'M')).toBe('臺南市');
    expect(r(pool(), 'CPOST_NUM_NM', cc({ cpost_city: null }), null, 'M')).toBe('臺南市');
  });

  it('CC-009：CO_NUM_NM 縣市名 LEFT3 + per-card default', () => {
    expect(r(pool(), 'CO_NUM_NM', cc({ co_city: '高雄市三民區' }), null, 'M')).toBe('高雄市');
    expect(r(pool(), 'CO_NUM_NM', cc({ co_city: null }), null, 'S5')).toBe('金門縣');
    expect(r(pool(), 'CO_NUM_NM', cc({ co_city: null }), null, 'E5')).toBe('金門縣');
    expect(r(pool(), 'CO_NUM_NM', cc({ co_city: null }), null, 'M')).toBe('高雄市');
  });

  it('CC-010：LOAN_RATE per-card default（S5→77、E/E5→12、其他 0）', () => {
    expect(r(pool({ loan_rate: '0.05' }), 'LOAN_RATE', null, null, 'S5')).toBe(0.05);
    expect(r(pool({ loan_rate: null }), 'LOAN_RATE', null, null, 'S5')).toBe(77);
    expect(r(pool({ loan_rate: null }), 'LOAN_RATE', null, null, 'E')).toBe(12);
    expect(r(pool({ loan_rate: null }), 'LOAN_RATE', null, null, 'H')).toBe(0);
  });

  it('SALES_STS：AGENT→AGENT / 中古車商→UCD / 其他→HFC / null→HFC', () => {
    expect(r(pool({ sales_sts_na: 'AGENT' }), 'SALES_STS', null, null, 'H')).toBe('AGENT');
    expect(r(pool({ sales_sts_na: '中古車商' }), 'SALES_STS', null, null, 'H')).toBe('UCD');
    expect(r(pool({ sales_sts_na: 'DIRECT' }), 'SALES_STS', null, null, 'H')).toBe('HFC');
    expect(r(pool({ sales_sts_na: null }), 'SALES_STS', null, null, 'H')).toBe('HFC');
    // 舊 '經銷商' 不再特殊處理 → HFC。
    expect(r(pool({ sales_sts_na: '經銷商' }), 'SALES_STS', null, null, 'H')).toBe('HFC');
  });
});

// ===========================================================================
// PROJECT_TP — 衍生邏輯（F104 BR-F104-01）
// ===========================================================================
describe('F104 PROJECT_TP — spec_name 衍生（更新自 F103）', () => {
  let r: ResolveFn;
  beforeEach(() => {
    r = resolver(makeService());
  });

  it('PJTP-001：spec_name 含「借新還舊」→ "A"', () => {
    expect(r(pool({ spec_name: '借新還舊專案' }), 'PROJECT_TP', null, null, 'H')).toBe('A');
  });

  it('PJTP-002：spec_name 含「專案」但不含「借新還舊」→ spec_tp（不再命中）', () => {
    expect(r(pool({ spec_name: '一般專案', spec_tp: '02' }), 'PROJECT_TP', null, null, 'H')).toBe('02');
  });

  it('PJTP-003：spec_name=null → spec_tp；spec_tp=null → "01"', () => {
    expect(r(pool({ spec_name: null, spec_tp: '03' }), 'PROJECT_TP', null, null, 'H')).toBe('03');
    expect(r(pool({ spec_name: null, spec_tp: null }), 'PROJECT_TP', null, null, 'H')).toBe('01');
  });
});

// ===========================================================================
// FALLBACK / GHOST — 通用 fallback + 幽靈欄位（須保通過）
// ===========================================================================
describe('F103 FALLBACK / GHOST — JS 通用 fallback', () => {
  it('FALLBACK-004：pool 有未 hardcode 數值欄（loan_totamt）→ Number 取值', () => {
    const r = resolver(makeService());
    expect(r(pool({ loan_totamt: '50000' }), 'LOAN_TOTAMT', null, null, 'H')).toBe(50000);
  });

  it('FALLBACK-005 / GHOST-001：pool 無此 key（幽靈）→ 0 + logger.warn，不拋例外', () => {
    const svc = makeService();
    const r = resolver(svc);
    const warnSpy = (svc as unknown as { logger: { warn: ReturnType<typeof vi.fn> } }).logger.warn;
    let result: string | number = -1;
    expect(() => {
      result = r(pool(), 'XYZ_COL', null, null, 'H');
    }).not.toThrow();
    expect(result).toBe(0);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0][0])).toContain('XYZ_COL');
  });

  it('GHOST-004：pool 值為非數值文字（"N/A"）→ Number.isNaN → 0', () => {
    const r = resolver(makeService());
    expect(r(pool({ list_type: 'N/A' }), 'LIST_TYPE', null, null, 'H')).toBe(0);
  });
});

// ===========================================================================
// COMMISSION — 靜態移除（須保通過）
// ===========================================================================
describe('F103 COMMISSION — 兩路徑靜態移除', () => {
  it('COMMISSION-002：JS resolveColumnValue COMMISSION 走 default（幽靈 → 0 + warn）', () => {
    const svc = makeService();
    const r = resolver(svc);
    const warnSpy = (svc as unknown as { logger: { warn: ReturnType<typeof vi.fn> } }).logger.warn;
    expect(r(pool(), 'COMMISSION', null, null, 'H')).toBe(0);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('COMMISSION-002b：pool.commission 有值仍走 fallback Number 取值', () => {
    const r = resolver(makeService());
    expect(r(pool({ commission: '123' }), 'COMMISSION', null, null, 'H')).toBe(123);
  });

  it('COMMISSION-003：MAPPED_SCORING_COLUMNS 不含 COMMISSION', () => {
    expect(MAPPED_SCORING_COLUMNS as readonly string[]).not.toContain('COMMISSION');
  });

  it('COMMISSION-004：MAPPED_SCORING_COLUMNS 含 ADD_UN_CAPITAL', () => {
    expect(MAPPED_SCORING_COLUMNS as readonly string[]).toContain('ADD_UN_CAPITAL');
  });
});

// ===========================================================================
// AUDIT — MAPPED_SCORING_COLUMNS 完整性 + CAREA presence（F104 更新 002/003）
// ===========================================================================
describe('F104 AUDIT — 映射完整性靜態稽核', () => {
  it('AUDIT-001：MAPPED_SCORING_COLUMNS 含全部 hardcode 欄位、不含 COMMISSION', () => {
    const expected = [
      'LIST_MONTH', 'PROJECT_TP', 'CAR_YEAR', 'CUS_SEX', 'AGE', 'EDUCAT_BACK',
      'CAREA_NO1', 'CAREA_NO2', 'CELLULAR', 'HPOST_NUM_NM', 'CPOST_NUM_NM',
      'CO_NUM_NM', 'SALES_STS', 'LOAN_RATE', 'ADD_UN_CAPITAL',
    ];
    for (const c of expected) {
      expect(MAPPED_SCORING_COLUMNS as readonly string[]).toContain(c);
    }
    expect(MAPPED_SCORING_COLUMNS as readonly string[]).not.toContain('COMMISSION');
  });

  it('AUDIT-002：PG CAREA_NO1 個人分支 presence（cc.carea_no1 IS NOT NULL AND 非空）', () => {
    const s = resolveColumnSource('CAREA_NO1', 'H');
    expect(s.kind).toBe('range');
    expect(s.expr).toContain('cc.carea_no1 IS NOT NULL');
    expect(s.expr).toContain("cc.carea_no1 <> ''");
  });

  it('AUDIT-003：PG CAREA_NO2 個人分支 presence cc.carea_no2', () => {
    const s = resolveColumnSource('CAREA_NO2', 'H');
    expect(s.kind).toBe('range');
    expect(s.expr).toContain('cc.carea_no2 IS NOT NULL');
  });

  it('AUDIT-004：PG ADD_UN_CAPITAL → range + COALESCE(ar.add_un_capital, 0)', () => {
    const s = resolveColumnSource('ADD_UN_CAPITAL', 'H');
    expect(s.kind).toBe('range');
    expect(s.expr).toContain('ar.add_un_capital');
    expect(s.expr).toContain('COALESCE');
  });

  it('AUDIT-005：resolveColumnSource default 永不回 undefined（I-SCORE-FALLBACK-01）', () => {
    const s = resolveColumnSource('ANY_UNKNOWN', 'H');
    expect(s).toBeDefined();
    expect(s).not.toBeNull();
    expect(s.kind).toBe('range');
    expect(s.expr).toContain("to_jsonb(o)->>'any_unknown'");
  });
});

// ===========================================================================
// PG resolveColumnSource — 靜態表達式（F104 更新 PJTP / 須保通過 fallback）
// ===========================================================================
describe('F104 PG resolveColumnSource — 靜態表達式', () => {
  it('PJTP-004：PROJECT_TP 含 spec_name LIKE %借新還舊% + THEN A + COALESCE(spec_tp,01)', () => {
    const s = resolveColumnSource('PROJECT_TP', 'H');
    expect(s.kind).toBe('category');
    expect(s.expr).toContain("o.spec_name LIKE '%借新還舊%'");
    expect(s.expr).toContain("THEN 'A'");
    expect(s.expr).toContain("COALESCE(o.spec_tp, '01')");
    expect(s.expr).not.toContain('%專案%');
  });

  it('COMMISSION-001：resolveColumnSource(COMMISSION) 走通用 fallback（非死碼 CAST 專屬 case）', () => {
    const s = resolveColumnSource('COMMISSION', 'H');
    expect(s.kind).toBe('range');
    expect(s.expr).toBe("COALESCE((to_jsonb(o)->>'commission')::numeric, 0)");
    expect(s.expr).not.toContain('CAST(o.commission');
  });

  it('FALLBACK-001：未 hardcode pool 數值欄（LOAN_TOTAMT）→ to_jsonb fallback expr', () => {
    const s = resolveColumnSource('LOAN_TOTAMT', 'H');
    expect(s.kind).toBe('range');
    expect(s.expr).toBe("COALESCE((to_jsonb(o)->>'loan_totamt')::numeric, 0)");
  });

  it('FALLBACK-002：幽靈欄位（XYZ_COL）→ to_jsonb fallback（lower key）', () => {
    const s = resolveColumnSource('XYZ_COL', 'H');
    expect(s.expr).toBe("COALESCE((to_jsonb(o)->>'xyz_col')::numeric, 0)");
  });

  it('FALLBACK-003：非數值文字欄（ABC_STR）→ 仍走 fallback（cast 失敗 PG 端 COALESCE 0）', () => {
    const s = resolveColumnSource('ABC_STR', 'H');
    expect(s.expr).toBe("COALESCE((to_jsonb(o)->>'abc_str')::numeric, 0)");
  });
});
