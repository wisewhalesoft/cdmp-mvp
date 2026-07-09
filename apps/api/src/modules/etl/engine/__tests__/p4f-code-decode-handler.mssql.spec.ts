/**
 * AD-E07-41 P4f — code_decode（F110 / US-173）真實 MSSQL 逐格等價安全網（Slice 2）。
 *
 * 本檔 = US-173 AC-2 / I-CODEDECODE-EQ-01 的**硬性 DoD 驗證**（不可退讓、不可 degradable）：
 * 於同一顆真實 MSSQL 引擎、同一份 fixture 上，(a) 依序執行舊 `lookup` 鏈（真 production
 * `LookupHandlerMssql`，N 個 mapping 各跑一次）、(b) 執行收斂後單一 `code_decode` 節點
 * （真 production `CodeDecodeHandlerMssql`），逐列逐欄（outputAlias）比對兩側輸出 + 列數。
 *
 * 涵蓋（AD-E07-41-P4f-test.md）：
 *   四、EQ-MSSQL：EQZZIP1-001..008 / EQMLMC1-001..006 / EQPOSTAL-001..004 / EQCROSSGROUP-001 / EQIDEM-001
 *   二、SQLGEN（真實 DB 陷阱佐證）：JOINFILTER-MSSQL-002（naive 外層 WHERE ⇒ LEFT JOIN 退化 INNER）
 *   一、GATE：GATE-002（9 張 production 字典表 `_cdmp_id` 存在性內省，決定去重排序鍵）
 *
 * 三個代表性群組（GATE-003）聯集涵蓋全部 3 種 filter 型態：
 *   #1 raw_e5a2345c 風格（單一等式 `TBL_ID='xx'`，9 mapping）
 *   #4 raw_8b80671e 風格（MLMC 複合條件 `TRIM(SYSCD)='CF' AND TRIM(DATAID)='xx'`，3 mapping）
 *   #3 raw_b4a48f10 風格（郵遞區號，無 filter，3 mapping）
 *
 * Harness：100% 沿用 P4a/P4b（connectMssql / makeRealCtx / readAll / uniqueLogId）；僅新增
 * code_decode 專屬 fixture（自建 dbo 字典表 + `##` 主輸入），afterAll 精準 DROP，不觸碰任何
 * baseline 表（GATE-001 / GATE-005 / REG-004）。DB 不可達 → 全檔 ctx.skip()（誠實，不偽綠）。
 */
import { restoreDbType, SKIP_REASON } from '@/database/__tests__/mssql-env-preload';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { LookupHandlerMssql } from '../handlers/lookup-handler-mssql';
import { CodeDecodeHandlerMssql } from '../handlers/code-decode-handler-mssql';
import { dropMssqlTempTableIfExists } from '../handlers/mssql/temp-table.util';
import {
  connectMssql,
  teardownMssql,
  MssqlHarness,
  uniqueLogId,
  makeRealCtx,
  readAll,
} from './_p4a-mssql-harness';
import { DataSet } from '../types';

// EQ-MSSQL 群組需先跑 lookup 鏈（最多 9 次）再跑 code_decode，單案例耗時高於一般 handler 單測。
vi.setConfig({ testTimeout: 120000 });

let h: MssqlHarness;
const tempTables: string[] = [];
const rawTables: string[] = [];

// 共用標準字典（beforeAll 建立；dup-key / 陷阱等特殊字典由個別測試自建）。
let zzipDict = '';
let mlmcDict = '';
let postalDict = '';

const hex = () => Math.random().toString(16).slice(2, 10);

// ---------------------------------------------------------------------------
// fixture builders
// ---------------------------------------------------------------------------

/** 建立 `##` 主輸入（含 `_rid` 為決定性比對序）。回傳 DataSet。 */
async function inFx(valuesSql: string, rowCount: number): Promise<DataSet> {
  const name = '##cdin_' + hex();
  tempTables.push(name);
  await h.qr!.query(`SELECT * INTO ${name} FROM ${valuesSql}`);
  return { tempTable: name, rowCount };
}

/** 建立一張 dbo 字典表（顯式 schema + INSERT），回傳裸表名（供 lookupSource）。afterAll DROP。 */
async function dictFx(prefix: string, ddlCols: string, valuesSql: string): Promise<string> {
  const name = `raw_p4f_${prefix}_${hex()}`;
  rawTables.push(name);
  await h.qr!.query(`CREATE TABLE dbo.${name} (${ddlCols})`);
  if (valuesSql.trim()) await h.qr!.query(`INSERT INTO dbo.${name} ${valuesSql}`);
  return name;
}

// ---------------------------------------------------------------------------
// mapping 抽象（同一份 M 同時展開成 lookup data 與 code_decode mapping，確保新舊機制吃相同設定）
// ---------------------------------------------------------------------------
interface M {
  matchColumn: string;
  lookupMatchColumn: string;
  filter?: string;
  lookupColumn: string;
  outputAlias: string;
}

function lookupData(dict: string, m: M): Record<string, unknown> {
  return {
    matchColumn: m.matchColumn,
    lookupMatchColumn: m.lookupMatchColumn,
    outputColumns: [{ lookupColumn: m.lookupColumn, outputAlias: m.outputAlias }],
    noMatchStrategy: 'null',
    lookupSource: dict,
    lookupFilter: m.filter ?? '',
  };
}

function cdMapping(m: M): Record<string, unknown> {
  return {
    matchColumn: m.matchColumn,
    lookupMatchColumn: m.lookupMatchColumn,
    ...(m.filter ? { filter: m.filter } : {}),
    outputColumns: [{ lookupColumn: m.lookupColumn, outputAlias: m.outputAlias }],
  };
}

// ---------------------------------------------------------------------------
// runners
// ---------------------------------------------------------------------------

/** 舊路徑：真 LookupHandlerMssql N 次串接（原地 ALTER+UPDATE，同一 ## 表逐次加欄）。 */
async function runLookupChain(valuesSql: string, rowCount: number, dict: string, ms: M[]): Promise<any[]> {
  const input = await inFx(valuesSql, rowCount);
  const lk = new LookupHandlerMssql();
  for (const m of ms) {
    await lk.execute(
      makeRealCtx(h.qr!, 'lookup', lookupData(dict, m), { default: input }, { nodeId: 'lk', logId: uniqueLogId() }),
    );
  }
  return readAll(h.qr!, input.tempTable, '_rid');
}

/** 新路徑：真 CodeDecodeHandlerMssql 單次（N mapping，SELECT INTO 新 ## 表）。 */
async function runCodeDecode(
  valuesSql: string,
  rowCount: number,
  dict: string,
  ms: M[],
  logId?: string,
): Promise<{ rows: any[]; rowCount: number; tempTable: string }> {
  const input = await inFx(valuesSql, rowCount);
  const cd = new CodeDecodeHandlerMssql();
  const out = await cd.execute(
    makeRealCtx(
      h.qr!,
      'code_decode',
      { lookupSource: dict, mappings: ms.map(cdMapping) },
      { default: input },
      { nodeId: 'cd', logId: logId ?? uniqueLogId() },
    ),
  );
  tempTables.push(out.tempTable);
  const rows = await readAll(h.qr!, out.tempTable, '_rid');
  return { rows, rowCount: out.rowCount, tempTable: out.tempTable };
}

/** 逐格斷言：每個 outputAlias 欄位、每一列，兩側完全相同（含 NULL）；列數相同。 */
function assertCellEqual(lrows: any[], crows: any[], aliases: string[]): void {
  expect(crows.length).toBe(lrows.length);
  for (const a of aliases) {
    expect(crows.map((r) => r[a])).toEqual(lrows.map((r) => r[a]));
  }
}

/** 一步驟：同一 valuesSql 分別跑 lookup 鏈與 code_decode，逐格斷言等價，回傳兩側列供進一步檢查。 */
async function expectEquivalent(
  valuesSql: string,
  rowCount: number,
  dict: string,
  ms: M[],
): Promise<{ lrows: any[]; crows: any[]; cdRowCount: number }> {
  const lrows = await runLookupChain(valuesSql, rowCount, dict, ms);
  const { rows: crows, rowCount: cdRowCount } = await runCodeDecode(valuesSql, rowCount, dict, ms);
  assertCellEqual(lrows, crows, ms.map((m) => m.outputAlias));
  return { lrows, crows, cdRowCount };
}

// ---------------------------------------------------------------------------
// 群組 #1（ZZIP，單一等式）標準字典 + 9 mapping
// ---------------------------------------------------------------------------
const ZZIP_DDL = `"_cdmp_id" INT, "TBL_ID" NVARCHAR(10), "TBL_CD" NVARCHAR(20), "TBL_DESC1" NVARCHAR(100)`;
// 升序 _cdmp_id == 實體寫入順序（模擬 E04 擷取序列）。TBL_CD='1' 跨 A2/A4/33/Y0/A3 → 驗 filter 隔離。
const ZZIP_VALUES = `VALUES
 (1,N'A2',N'1',N'國小'),(2,N'A2',N'2',N'國中'),(3,N'A2',N'3',N'高中'),(4,N'A2',N'4',N'大學'),
 (5,N'A4',N'1',N'軍公教'),(6,N'A4',N'2',N'工'),(7,N'A4',N'3',N'商'),
 (8,N'A5',N'M',N'經理'),(9,N'A5',N'S',N'專員'),
 (10,N'33',N'1',N'已婚'),(11,N'33',N'2',N'未婚'),
 (12,N'55',N'C',N'個人'),(13,N'55',N'B',N'法人'),
 (14,N'Y0',N'1',N'薪資'),(15,N'Y0',N'2',N'投資'),
 (16,N'AA',N'01',N'製造'),(17,N'AA',N'02',N'服務'),
 (18,N'A6',N'H',N'高階'),(19,N'A6',N'L',N'基層'),
 (20,N'A3',N'1',N'三萬以下'),(21,N'A3',N'2',N'三到五萬')`;

const zzipM = (matchColumn: string, tblId: string, outputAlias: string): M => ({
  matchColumn,
  lookupMatchColumn: 'TBL_CD',
  filter: `"TBL_ID" = '${tblId}'`,
  lookupColumn: 'TBL_DESC1',
  outputAlias,
});
const ZZIP9: M[] = [
  zzipM('EDUCAT_BACK', 'A2', 'education_desc'),
  zzipM('VOCATION_CODE', 'A4', 'occupation_desc'),
  zzipM('JOB_TITLE', 'A5', 'job_title_desc'),
  zzipM('CMARRY_MK', '33', 'marital_status_desc'),
  zzipM('CUSTOM_MK', '55', 'customer_type_desc'),
  zzipM('INCOME_SOURCE', 'Y0', 'income_source_desc'),
  zzipM('INDUSTRY', 'AA', 'industry_desc'),
  zzipM('JOB_LEVEL', 'A6', 'job_level_desc'),
  zzipM('MONTH_INCOME', 'A3', 'monthly_income_desc'),
];
const EDU_ONLY: M[] = [zzipM('EDUCAT_BACK', 'A2', 'education_desc')];

// ---------------------------------------------------------------------------
// 群組 #4（MLMC，複合條件）標準字典 + 3 mapping
// ---------------------------------------------------------------------------
const MLMC_DDL = `"_cdmp_id" INT, "SYSCD" NVARCHAR(10), "DATAID" NVARCHAR(10), "MCODE" NVARCHAR(20), "MNAME" NVARCHAR(100)`;
const MLMC_VALUES = `VALUES
 (1,N'CF',N'CU',N'1',N'個人戶'),(2,N'CF',N'CU',N'2',N'公司戶'),
 (3,N'CF',N'BM',N'A',N'十人以下'),(4,N'CF',N'BM',N'B',N'十一到五十人'),
 (5,N'CF',N'03',N'Y',N'上市'),(6,N'CF',N'03',N'N',N'未上市'),
 (7,N'XX',N'CU',N'1',N'別系統誤配'),(8,N'CF',N'ZZ',N'9',N'別DATAID誤配')`;
const mlmcFilter = (dataId: string) => `TRIM("SYSCD")='CF' AND TRIM("DATAID")='${dataId}'`;
const MLMC3: M[] = [
  { matchColumn: 'CUTYPE', lookupMatchColumn: 'MCODE', filter: mlmcFilter('CU'), lookupColumn: 'MNAME', outputAlias: 'customer_type_desc' },
  { matchColumn: 'EMPLOYEE', lookupMatchColumn: 'MCODE', filter: mlmcFilter('BM'), lookupColumn: 'MNAME', outputAlias: 'employee_count_desc' },
  { matchColumn: 'LISTED', lookupMatchColumn: 'MCODE', filter: mlmcFilter('03'), lookupColumn: 'MNAME', outputAlias: 'is_listed_desc' },
];
const MLMC_CU_ONLY: M[] = [MLMC3[0]];

// ---------------------------------------------------------------------------
// 群組 #3（郵遞區號，無 filter）標準字典 + 3 mapping
// ---------------------------------------------------------------------------
const POSTAL_DDL = `"_cdmp_id" INT, "POSTAL_NO" NVARCHAR(20), "POSTAL_ADD" NVARCHAR(100)`;
const POSTAL_VALUES = `VALUES (1,N'100',N'台北中正'),(2,N'220',N'新北板橋'),(3,N'300',N'新竹'),(4,N'807',N'高雄三民')`;
const postalM = (matchColumn: string, outputAlias: string): M => ({
  matchColumn,
  lookupMatchColumn: 'POSTAL_NO',
  lookupColumn: 'POSTAL_ADD',
  outputAlias,
});
const POSTAL3: M[] = [
  postalM('HPOST_NUM', 'hpost_city'),
  postalM('CPOST_NUM', 'cpost_city'),
  postalM('CO_NUM', 'co_city'),
];
const POSTAL_H_ONLY: M[] = [postalM('HPOST_NUM', 'hpost_city')];

// ===========================================================================

beforeAll(async () => {
  h = await connectMssql();
  if (!h.reachable || !h.qr) return;
  zzipDict = await dictFx('zzip', ZZIP_DDL, ZZIP_VALUES);
  mlmcDict = await dictFx('mlmc', MLMC_DDL, MLMC_VALUES);
  postalDict = await dictFx('postal', POSTAL_DDL, POSTAL_VALUES);
}, 120000);

afterAll(async () => {
  if (h?.qr) {
    for (const t of tempTables) await dropMssqlTempTableIfExists(h.qr, t);
    for (const t of rawTables) {
      try {
        await h.qr.query(`IF OBJECT_ID('dbo.${t}') IS NOT NULL DROP TABLE dbo.${t}`);
      } catch {
        /* ignore */
      }
    }
  }
  await teardownMssql(h);
  restoreDbType();
});

function guard(ctx: { skip: () => void }): boolean {
  if (!h?.reachable || !h.qr) {
    console.warn('[P4f code_decode] SKIP —', SKIP_REASON);
    ctx.skip();
    return false;
  }
  return true;
}

// ===========================================================================
// 一、GATE — 前置決策關卡（真庫內省）
// ===========================================================================
describe('P4f GATE', () => {
  it('GATE-002: 9 張 production 字典表 _cdmp_id 存在性逐一內省（決定去重排序鍵）', async (ctx) => {
    if (!guard(ctx)) return;
    const names = [
      'raw_e5a2345c', 'raw_6fce5258', 'raw_b4a48f10', 'raw_8b80671e', 'raw_9dd0eca5',
      'raw_9dcaf414', 'raw_b9558d10', 'raw_3acd58e7', 'raw_afe6a874',
    ];
    const report: Record<string, string> = {};
    for (const n of names) {
      const oid = await h.qr!.query(`SELECT OBJECT_ID('dbo.' + @0) AS oid`, [n]);
      if (oid[0].oid == null) {
        report[n] = 'TABLE_ABSENT';
        continue;
      }
      // I-MSSQL-CATALOG-CASE-01：大寫 INFORMATION_SCHEMA + 具名參數。
      const col = await h.qr!.query(
        `SELECT column_name FROM INFORMATION_SCHEMA.COLUMNS WHERE table_name = @0 AND column_name = '_cdmp_id'`,
        [n],
      );
      report[n] = col.length ? 'CDMP_ID_PRESENT' : 'CDMP_ID_ABSENT';
      // 存在之表：對齊 code_decode `ORDER BY d."_cdmp_id" ASC` 決定性排序鍵前提。
      expect(report[n]).toBe('CDMP_ID_PRESENT');
    }
    console.log('[GATE-002] production dict _cdmp_id 內省：', JSON.stringify(report));
  });
});

// ===========================================================================
// 二、SQLGEN（真實 DB 陷阱佐證）— JOINFILTER-MSSQL-002
// ===========================================================================
describe('P4f SQLGEN JOINFILTER (真實陷阱佐證)', () => {
  it('JOINFILTER-MSSQL-002: naive 外層 WHERE 使 LEFT JOIN 退化 INNER（漏列）；正確 code_decode 保留列+NULL', async (ctx) => {
    if (!guard(ctx)) return;
    // fixture：一列命中（'2'→國中）、一列查無對應（'9'）。
    const valuesSql = `(VALUES (1,N'2'),(2,N'9')) AS v("_rid","EDUCAT_BACK")`;
    const input = await inFx(valuesSql, 2);

    // naive 寫法（手動組裝，非呼叫 handler）：filter 置於主查詢外層 WHERE。
    const naiveOut = '##naive_' + hex();
    tempTables.push(naiveOut);
    await h.qr!.query(
      `SELECT m.*, TRIM(TRY_CAST(d."TBL_DESC1" AS NVARCHAR(4000))) AS "education_desc" ` +
        `INTO ${naiveOut} FROM ${input.tempTable} m ` +
        `LEFT JOIN "${zzipDict}" d ON TRIM(TRY_CAST(m."EDUCAT_BACK" AS NVARCHAR(4000))) = TRIM(TRY_CAST(d."TBL_CD" AS NVARCHAR(4000))) ` +
        `WHERE d."TBL_ID" = 'A2'`,
    );
    const naiveRows = await readAll(h.qr!, naiveOut, '_rid');
    // 陷阱成立：查無對應列（_rid=2）被外層 WHERE d.TBL_ID 濾除 → 列數由 2 掉到 1。
    expect(naiveRows.length).toBe(1);
    expect(naiveRows.map((r) => r._rid)).toEqual([1]);

    // 正確 code_decode（filter 於衍生子查詢內部）：列數不變、查無對應列以 NULL 保留。
    const { rows, rowCount } = await runCodeDecode(valuesSql, 2, zzipDict, EDU_ONLY);
    expect(rowCount).toBe(2);
    expect(rows.map((r) => r._rid)).toEqual([1, 2]);
    expect(rows.find((r) => r._rid === 1)!.education_desc).toBe('國中');
    expect(rows.find((r) => r._rid === 2)!.education_desc).toBeNull();
  });
});

// ===========================================================================
// 四、EQ-MSSQL 群組 #1：ZZIP（單一等式，9 mapping）
// ===========================================================================
describe('P4f EQ-MSSQL #1 ZZIP', () => {
  it('EQZZIP1-001: happy-path 命中，逐格相同（單一 mapping education_desc）', async (ctx) => {
    if (!guard(ctx)) return;
    const { crows } = await expectEquivalent(
      `(VALUES (1,N'2'),(2,N'3'),(3,N'1')) AS v("_rid","EDUCAT_BACK")`,
      3, zzipDict, EDU_ONLY,
    );
    expect(crows.map((r) => r.education_desc)).toEqual(['國中', '高中', '國小']);
  });

  it('EQZZIP1-002: 查無對應（LEFT JOIN 語意）兩側皆 NULL、列保留', async (ctx) => {
    if (!guard(ctx)) return;
    const { crows, cdRowCount } = await expectEquivalent(
      `(VALUES (1,N'2'),(2,N'9')) AS v("_rid","EDUCAT_BACK")`,
      2, zzipDict, EDU_ONLY,
    );
    expect(cdRowCount).toBe(2);
    expect(crows.find((r) => r._rid === 2)!.education_desc).toBeNull();
  });

  it('EQZZIP1-003: TRIM 前後空白邊界，兩側去除後比對成功', async (ctx) => {
    if (!guard(ctx)) return;
    // 主表值帶前導/尾隨空白（模擬 CHAR padding）；dict TBL_CD='2' 無空白 → TRIM 後相等。
    const { crows } = await expectEquivalent(
      `(VALUES (1,N'  2  '),(2,N' 3')) AS v("_rid","EDUCAT_BACK")`,
      2, zzipDict, EDU_ONLY,
    );
    expect(crows.map((r) => r.education_desc)).toEqual(['國中', '高中']);
  });

  it('EQZZIP1-004: 大小寫邊界（BIN collation 區分大小寫），兩側皆 NULL', async (ctx) => {
    if (!guard(ctx)) return;
    // dict A5 有 TBL_CD='M'（經理）；輸入小寫 'm' 於 BIN collation 不匹配 → 兩側皆 NULL。
    const { crows } = await expectEquivalent(
      `(VALUES (1,N'm'),(2,N'M')) AS v("_rid","JOB_TITLE")`,
      2, zzipDict, [zzipM('JOB_TITLE', 'A5', 'job_title_desc')],
    );
    expect(crows.find((r) => r._rid === 1)!.job_title_desc).toBeNull(); // 'm' 不配
    expect(crows.find((r) => r._rid === 2)!.job_title_desc).toBe('經理'); // 'M' 命中
  });

  it('EQZZIP1-005: 字典重複 key 取首筆（真實升序 _cdmp_id ⇒ 兩側同筆），逐格相同', async (ctx) => {
    if (!guard(ctx)) return;
    // 真實 E04 擷取：_cdmp_id 升序 == 實體寫入序。dup TBL_CD='7'（A2）兩筆 甲/乙。
    // code_decode 取 _cdmp_id ASC（首筆=甲）；lookup UPDATE..JOIN 取實體首筆（=甲）→ 兩側一致。
    const dupDict = await dictFx('zzipdup', ZZIP_DDL, `VALUES (1,N'A2',N'7',N'甲'),(2,N'A2',N'7',N'乙')`);
    const { crows } = await expectEquivalent(
      `(VALUES (1,N'7')) AS v("_rid","EDUCAT_BACK")`,
      1, dupDict, EDU_ONLY,
    );
    expect(crows[0].education_desc).toBe('甲');
  });

  it('EQZZIP1-005-DET (🔴 已知刻意分歧): code_decode ROW_NUMBER 取首筆決定性（_cdmp_id ASC）；lookup 為 SQL-arbitrary', async (ctx) => {
    if (!guard(ctx)) return;
    // 反實務 contrived fixture：_cdmp_id 與實體寫入序「相反」（先寫 id=10，再寫 id=5）。
    // 真實 E04 擷取序列絕不產生此情形（_cdmp_id 即寫入序）；此為唯一可觸及新舊分歧的邊界。
    const oooDict = await dictFx('zzipooo', ZZIP_DDL, `VALUES (10,N'A2',N'8',N'desc_id10'),(5,N'A2',N'8',N'desc_id5')`);
    const values = `(VALUES (1,N'8')) AS v("_rid","EDUCAT_BACK")`;

    // code_decode：決定性——連跑兩次（新 logId）皆取 _cdmp_id 最小（=5）之 desc_id5。
    const c1 = await runCodeDecode(values, 1, oooDict, EDU_ONLY);
    const c2 = await runCodeDecode(values, 1, oooDict, EDU_ONLY);
    expect(c1.rows[0].education_desc).toBe('desc_id5');
    expect(c2.rows[0].education_desc).toBe('desc_id5'); // 決定性：兩次相同

    // lookup：UPDATE..JOIN 多筆命中之「勝出列」為 SQL Server 未定義行為（不硬性斷言其值）。
    const lrows = await runLookupChain(values, 1, oooDict, EDU_ONLY);
    console.log(
      '[EQZZIP1-005-DET] 已知刻意分歧（僅 contrived out-of-order _cdmp_id 可觸及）：',
      `code_decode=${JSON.stringify(c1.rows[0].education_desc)} (決定性 _cdmp_id ASC)`,
      `lookup=${JSON.stringify(lrows[0].education_desc)} (SQL-arbitrary)`,
    );
    expect(lrows[0].education_desc == null ? '' : lrows[0].education_desc).toBeTruthy(); // lookup 有取到某一筆（非 NULL）
  });

  it('EQZZIP1-006 (🔴🔴 旗艦): 全 9 組 mapping 同時解碼，逐欄逐格與 9 個 lookup 節點結果相同', async (ctx) => {
    if (!guard(ctx)) return;
    const values =
      `(VALUES ` +
      `(1,N'2',N'1',N'M',N'1',N'C',N'2',N'01',N'H',N'2'),` + // 全命中
      `(2,N'9',N'9',N'Z',N'9',N'Z',N'9',N'99',N'Z',N'9'),` + // 全查無 → 9 欄皆 NULL
      `(3,N'4',N'3',N'S',N'2',N'B',N'1',N'02',N'L',N'1')` + // 全命中（另一組）
      `) AS v("_rid","EDUCAT_BACK","VOCATION_CODE","JOB_TITLE","CMARRY_MK","CUSTOM_MK","INCOME_SOURCE","INDUSTRY","JOB_LEVEL","MONTH_INCOME")`;
    const { crows, cdRowCount } = await expectEquivalent(values, 3, zzipDict, ZZIP9);
    expect(cdRowCount).toBe(3);
    // 抽點驗證具體解碼值（旗艦：逐格已由 expectEquivalent 對 9 欄全比對）。
    const r1 = crows.find((r) => r._rid === 1)!;
    expect([r1.education_desc, r1.occupation_desc, r1.job_title_desc, r1.customer_type_desc, r1.industry_desc])
      .toEqual(['國中', '軍公教', '經理', '個人', '製造']);
    const r2 = crows.find((r) => r._rid === 2)!;
    for (const a of ZZIP9.map((m) => m.outputAlias)) expect(r2[a]).toBeNull();
  });

  it('EQZZIP1-007 (🔴 防笛卡兒積): 輸出列數兩側相同且等於輸入列數（dup key 不 fan-out）', async (ctx) => {
    if (!guard(ctx)) return;
    const dupDict = await dictFx('zzipdup2', ZZIP_DDL, `VALUES (1,N'A2',N'7',N'甲'),(2,N'A2',N'7',N'乙'),(3,N'A2',N'2',N'國中')`);
    const values = `(VALUES (1,N'7'),(2,N'2'),(3,N'7')) AS v("_rid","EDUCAT_BACK")`;
    const lrows = await runLookupChain(values, 3, dupDict, EDU_ONLY);
    const { rows: crows, rowCount } = await runCodeDecode(values, 3, dupDict, EDU_ONLY);
    expect(rowCount).toBe(3); // 等於輸入列數
    expect(crows.length).toBe(3);
    expect(lrows.length).toBe(3);
    assertCellEqual(lrows, crows, ['education_desc']);
  });

  it('EQZZIP1-008: 中文描述值 round-trip 兩側完全相同字元', async (ctx) => {
    if (!guard(ctx)) return;
    const { crows } = await expectEquivalent(
      `(VALUES (1,N'4'),(2,N'1')) AS v("_rid","EDUCAT_BACK")`,
      2, zzipDict, EDU_ONLY,
    );
    expect(crows.map((r) => r.education_desc)).toEqual(['大學', '國小']);
  });
});

// ===========================================================================
// 四、EQ-MSSQL 群組 #4：MLMC（複合條件，3 mapping）
// ===========================================================================
describe('P4f EQ-MSSQL #4 MLMC', () => {
  it('EQMLMC1-001: happy-path 命中（複合條件 SYSCD=CF AND DATAID=CU），逐格相同', async (ctx) => {
    if (!guard(ctx)) return;
    const { crows } = await expectEquivalent(
      `(VALUES (1,N'1'),(2,N'2')) AS v("_rid","CUTYPE")`,
      2, mlmcDict, MLMC_CU_ONLY,
    );
    expect(crows.map((r) => r.customer_type_desc)).toEqual(['個人戶', '公司戶']);
  });

  it('EQMLMC1-002: 查無對應，兩側皆 NULL、列保留', async (ctx) => {
    if (!guard(ctx)) return;
    const { crows, cdRowCount } = await expectEquivalent(
      `(VALUES (1,N'1'),(2,N'8')) AS v("_rid","CUTYPE")`,
      2, mlmcDict, MLMC_CU_ONLY,
    );
    expect(cdRowCount).toBe(2);
    expect(crows.find((r) => r._rid === 2)!.customer_type_desc).toBeNull();
  });

  it('EQMLMC1-003: 複合條件一子句不匹配（SYSCD 對但 DATAID 不對）視為不匹配，兩側一致', async (ctx) => {
    if (!guard(ctx)) return;
    // dict 有 (CF, ZZ, 9)：SYSCD=CF 但 DATAID=ZZ≠CU。customer_type filter 要求 DATAID=CU → 排除 → NULL。
    const { crows } = await expectEquivalent(
      `(VALUES (1,N'9')) AS v("_rid","CUTYPE")`,
      1, mlmcDict, MLMC_CU_ONLY,
    );
    expect(crows[0].customer_type_desc).toBeNull();
  });

  it('EQMLMC1-004: TRIM 邊界（SYSCD/DATAID/主表值任一帶空白），兩側去除後比對成功', async (ctx) => {
    if (!guard(ctx)) return;
    // 主表值帶空白；filter 已內含 TRIM("SYSCD")/TRIM("DATAID")（複合條件本體），
    // JOIN 鍵兩側則由 handler trimCast 去空白。
    const { crows } = await expectEquivalent(
      `(VALUES (1,N' 1 ')) AS v("_rid","CUTYPE")`,
      1, mlmcDict, MLMC_CU_ONLY,
    );
    expect(crows[0].customer_type_desc).toBe('個人戶');
  });

  it('EQMLMC1-005: 3 組 mapping 同時解碼逐格相同', async (ctx) => {
    if (!guard(ctx)) return;
    const values =
      `(VALUES (1,N'1',N'A',N'Y'),(2,N'2',N'B',N'N'),(3,N'9',N'9',N'9')) ` +
      `AS v("_rid","CUTYPE","EMPLOYEE","LISTED")`;
    const { crows } = await expectEquivalent(values, 3, mlmcDict, MLMC3);
    const r1 = crows.find((r) => r._rid === 1)!;
    expect([r1.customer_type_desc, r1.employee_count_desc, r1.is_listed_desc])
      .toEqual(['個人戶', '十人以下', '上市']);
    const r3 = crows.find((r) => r._rid === 3)!;
    expect([r3.customer_type_desc, r3.employee_count_desc, r3.is_listed_desc])
      .toEqual([null, null, null]);
  });

  it('EQMLMC1-006: 相同 matchColumn 值但不同 filter 條件之列不可誤配（filter 隔離）', async (ctx) => {
    if (!guard(ctx)) return;
    // MCODE='A' 只存在於 DATAID='BM'（employee 子集），不存在於 DATAID='CU'（customer_type 子集）。
    // 同一列 CUTYPE='A' + EMPLOYEE='A'：customer_type_desc 應 NULL，employee_count_desc 應「十人以下」。
    const values = `(VALUES (1,N'A',N'A')) AS v("_rid","CUTYPE","EMPLOYEE")`;
    const { crows } = await expectEquivalent(values, 1, mlmcDict, [MLMC3[0], MLMC3[1]]);
    expect(crows[0].customer_type_desc).toBeNull();
    expect(crows[0].employee_count_desc).toBe('十人以下');
  });
});

// ===========================================================================
// 四、EQ-MSSQL 群組 #3：郵遞區號（無 filter，3 mapping）
// ===========================================================================
describe('P4f EQ-MSSQL #3 POSTAL', () => {
  it('EQPOSTAL-001: happy-path 命中（無 filter 全表 JOIN），逐格相同', async (ctx) => {
    if (!guard(ctx)) return;
    const { crows } = await expectEquivalent(
      `(VALUES (1,N'100'),(2,N'220')) AS v("_rid","HPOST_NUM")`,
      2, postalDict, POSTAL_H_ONLY,
    );
    expect(crows.map((r) => r.hpost_city)).toEqual(['台北中正', '新北板橋']);
  });

  it('EQPOSTAL-002: 查無對應（郵遞區號不在字典），兩側皆 NULL、列保留', async (ctx) => {
    if (!guard(ctx)) return;
    const { crows, cdRowCount } = await expectEquivalent(
      `(VALUES (1,N'100'),(2,N'999')) AS v("_rid","HPOST_NUM")`,
      2, postalDict, POSTAL_H_ONLY,
    );
    expect(cdRowCount).toBe(2);
    expect(crows.find((r) => r._rid === 2)!.hpost_city).toBeNull();
  });

  it('EQPOSTAL-003: 3 組 mapping 同時解碼（各自不同 matchColumn、同一字典表），逐格相同', async (ctx) => {
    if (!guard(ctx)) return;
    const values =
      `(VALUES (1,N'100',N'220',N'300'),(2,N'807',N'999',N'100')) ` +
      `AS v("_rid","HPOST_NUM","CPOST_NUM","CO_NUM")`;
    const { crows } = await expectEquivalent(values, 2, postalDict, POSTAL3);
    const r1 = crows.find((r) => r._rid === 1)!;
    expect([r1.hpost_city, r1.cpost_city, r1.co_city]).toEqual(['台北中正', '新北板橋', '新竹']);
    const r2 = crows.find((r) => r._rid === 2)!;
    expect([r2.hpost_city, r2.cpost_city, r2.co_city]).toEqual(['高雄三民', null, '台北中正']);
  });

  it('EQPOSTAL-004: 無 filter 全表 JOIN，字典任一合法值域皆可被對應者匹配，兩側一致', async (ctx) => {
    if (!guard(ctx)) return;
    // 覆蓋字典全部 4 個 POSTAL_NO；三個 mapping 各挑不同區號，聯集涵蓋全字典值域。
    const values =
      `(VALUES (1,N'100',N'220',N'300'),(2,N'807',N'100',N'220')) ` +
      `AS v("_rid","HPOST_NUM","CPOST_NUM","CO_NUM")`;
    const { crows } = await expectEquivalent(values, 2, postalDict, POSTAL3);
    // 全字典 4 值皆於某 mapping 被命中（無 filter 未漏任何合法值域）。
    const decoded = crows.flatMap((r) => [r.hpost_city, r.cpost_city, r.co_city]);
    for (const city of ['台北中正', '新北板橋', '新竹', '高雄三民']) expect(decoded).toContain(city);
  });
});

// ===========================================================================
// 四、EQ-MSSQL 跨群組綜合 / 冪等
// ===========================================================================
describe('P4f EQ-MSSQL 跨群組 / 冪等', () => {
  it('EQCROSSGROUP-001: 3 個 code_decode（#1/#3/#4）於同一資料流串接，各自逐格等價、互不污染', async (ctx) => {
    if (!guard(ctx)) return;
    // 主輸入同時含三群組的 match 欄位；新路徑＝3 個 code_decode 串接（cd1 輸出餵 cd2 default，依此類推），
    // 舊路徑＝三群組全部 mapping（1+3+3=7 個 lookup）於單一 ## 表串接。比對最終全部 outputAlias。
    const values =
      `(VALUES (1,N'2',N'100',N'1'),(2,N'9',N'999',N'8')) ` +
      `AS v("_rid","EDUCAT_BACK","HPOST_NUM","CUTYPE")`;
    const g1: M[] = EDU_ONLY;
    const g3: M[] = POSTAL_H_ONLY;
    const g4: M[] = MLMC_CU_ONLY;

    // 舊路徑：7... 這裡各群組各 1 mapping，共 3 個 lookup，串接於同一 ## 表（不同字典）。
    const oldInput = await inFx(values, 2);
    const lk = new LookupHandlerMssql();
    for (const [dict, ms] of [[zzipDict, g1], [postalDict, g3], [mlmcDict, g4]] as [string, M[]][]) {
      for (const m of ms) {
        await lk.execute(makeRealCtx(h.qr!, 'lookup', lookupData(dict, m), { default: oldInput }, { nodeId: 'lk', logId: uniqueLogId() }));
      }
    }
    const lrows = await readAll(h.qr!, oldInput.tempTable, '_rid');

    // 新路徑：cd1(#1) → cd2(#3) → cd3(#4) 串接（每節點各自字典）。
    const cd = new CodeDecodeHandlerMssql();
    let stream = await inFx(values, 2);
    for (const [dict, ms] of [[zzipDict, g1], [postalDict, g3], [mlmcDict, g4]] as [string, M[]][]) {
      const out = await cd.execute(
        makeRealCtx(h.qr!, 'code_decode', { lookupSource: dict, mappings: ms.map(cdMapping) }, { default: stream }, { nodeId: 'cd', logId: uniqueLogId() }),
      );
      tempTables.push(out.tempTable);
      stream = out;
    }
    const crows = await readAll(h.qr!, stream.tempTable, '_rid');

    assertCellEqual(lrows, crows, ['education_desc', 'hpost_city', 'customer_type_desc']);
    // 互不污染：_rid=1 全命中、_rid=2 全 NULL。
    const c1 = crows.find((r) => r._rid === 1)!;
    expect([c1.education_desc, c1.hpost_city, c1.customer_type_desc]).toEqual(['國中', '台北中正', '個人戶']);
    const c2 = crows.find((r) => r._rid === 2)!;
    expect([c2.education_desc, c2.hpost_city, c2.customer_type_desc]).toEqual([null, null, null]);
  });

  it('EQIDEM-001: 以不同 logId 重跑 code_decode 兩次，兩次逐格相同且皆與 lookup 鏈相同', async (ctx) => {
    if (!guard(ctx)) return;
    const values = `(VALUES (1,N'2'),(2,N'9'),(3,N'3')) AS v("_rid","EDUCAT_BACK")`;
    const lrows = await runLookupChain(values, 3, zzipDict, EDU_ONLY);
    const run1 = await runCodeDecode(values, 3, zzipDict, EDU_ONLY, uniqueLogId());
    const run2 = await runCodeDecode(values, 3, zzipDict, EDU_ONLY, uniqueLogId());
    assertCellEqual(run1.rows, run2.rows, ['education_desc']); // 兩次彼此一致
    assertCellEqual(lrows, run1.rows, ['education_desc']); // 且與 lookup 鏈一致
  });
});
