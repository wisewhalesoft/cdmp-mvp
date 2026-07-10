/**
 * AD-E07-41 P4d — customer_core 56 節點端對端整合測試之 fixture 建構 helper（非 .spec，vitest 不收集）。
 *
 * 提供：
 *   1. 14 張 raw staging 表（5 extract + 9 lookup）之 idempotent 自建 + 代表性資料（比照 _p4c-target-tables.ts）。
 *   2. `datasources` / `extraction_tasks` 兩表存在性（GATE-002：僅存在性、不塞資料，走 resolveRawTable 空表 fallback）。
 *   3. customer_core 前置存在性（複用 P4c ensureTargetTable）+ 本次 fixture 列清理（前綴 'P4D'）。
 *
 * 🔴 GATE-001（欄位清單衍生方法）：extract 表欄位以「程式化掃描 etl-pipelines.json 逐節點引用之來源欄位聯集」
 *    產生（reachability 分割 ZZIP/MLMC 子 DAG，收集 matchColumn / dedup key+ts / type_cast column /
 *    derived expression 之全大寫 token / field_mapping sourceColumn 之全大寫者）。全大寫＝legacy 來源欄；
 *    小寫＝下游節點產生欄（lookup outputAlias / derived outputColumn / merge 衍生欄），不建於 raw 表。
 *    lookup 對照表 schema 為已知固定 4 種（BAMCODE_D / BAMPOST_M / MLMCODE / MLSTDINDUMF），直接硬編。
 *
 * ⚠️ 呼叫端 spec 必須先 side-effect import '@/database/__tests__/mssql-env-preload'（設 DB_TYPE=mssql）。
 */
import * as fs from 'fs';
import * as path from 'path';
import { QueryRunner } from 'typeorm';
import { ensureTargetTable } from './_p4c-target-tables';

const PIPELINE_JSON = path.resolve(
  __dirname,
  '../../../../database/seeds/data/etl-pipelines.json',
);

/**
 * 讀取 customer_core pipeline 定義（本 fixture 全部真實資料事實之唯一來源）。
 *
 * ⚠️ 以 `target_load` 目標表 `customer_core` 定位（非顯示名）——pipeline 顯示名已改中文
 *    「客戶資料 ETL」（以 dev CDMP 為主），改名不影響定位。
 */
export function loadCustomerCoreDef(): { nodes: any[]; edges: any[] } {
  const arr = JSON.parse(fs.readFileSync(PIPELINE_JSON, 'utf8'));
  const targetIs = (def: any, tbl: string) =>
    (def?.nodes ?? []).some(
      (n: any) => n?.data?.nodeType === 'target_load' && n?.data?.targetTable === tbl,
    );
  const p = arr.find((x: any) => targetIs(x.definition, 'customer_core'));
  if (!p) throw new Error('etl-pipelines.json 找不到 target_load=customer_core 之 pipeline');
  return p.definition;
}

const SQL_KEYWORDS = new Set([
  'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'IS', 'NOT', 'NULL', 'AND', 'OR',
  'TRIM', 'TRY_CAST', 'CAST', 'AS', 'NVARCHAR', 'COALESCE', 'SELECT', 'FROM', 'WHERE',
]);

function capsTokens(s: unknown): string[] {
  if (!s) return [];
  return (String(s).match(/[A-Z][A-Z0-9_]+/g) || []).filter(
    (t) => !SQL_KEYWORDS.has(t) && !/^[0-9]/.test(t),
  );
}

/**
 * 由 pipeline 定義程式化衍生 ZZIP / MLMC 兩 extract 分支所需之來源欄位聯集（GATE-001）。
 * reachability 從 e1/e2（ZZIP）與 e3/e4/e5（MLMC）出發，於 m4（最終合併）之前停止（m4 起為 lowercase 產生欄）。
 */
export function deriveExtractSchemas(def: { nodes: any[]; edges: any[] }): {
  zzip: string[];
  mlmc: string[];
} {
  const byId: Record<string, any> = Object.fromEntries(def.nodes.map((n) => [n.id, n]));
  const adj: Record<string, string[]> = {};
  for (const e of def.edges) (adj[e.source] = adj[e.source] || []).push(e.target);
  const reach = (start: string): Set<string> => {
    const seen = new Set<string>();
    const st = [start];
    while (st.length) {
      const c = st.pop()!;
      if (seen.has(c) || c === 'm4') continue;
      seen.add(c);
      for (const t of adj[c] || []) st.push(t);
    }
    return seen;
  };
  const collect = (ids: Set<string>): string[] => {
    const cols = new Set<string>();
    for (const id of ids) {
      const n = byId[id];
      if (!n) continue;
      const d = n.data;
      switch (d.nodeType) {
        case 'lookup':
          if (d.matchColumn) cols.add(d.matchColumn);
          break;
        case 'dedup':
          for (const k of d.keyColumns || []) if (/^[A-Z]/.test(k)) cols.add(k);
          if (d.timestampColumn && /^[A-Z]/.test(d.timestampColumn)) cols.add(d.timestampColumn);
          break;
        case 'type_cast':
          for (const r of d.castRules || []) if (/^[A-Z]/.test(r.column)) cols.add(r.column);
          break;
        case 'derived_field':
          for (const ex of d.expressions || []) for (const t of capsTokens(ex.expression)) cols.add(t);
          break;
        case 'field_mapping':
          for (const m of d.mappings || []) if (/^[A-Z]/.test(m.sourceColumn)) cols.add(m.sourceColumn);
          break;
        case 'merge':
          for (const c of d.conditions || []) {
            if (/^[A-Z]/.test(c.leftColumn)) cols.add(c.leftColumn);
            if (/^[A-Z]/.test(c.rightColumn)) cols.add(c.rightColumn);
          }
          break;
      }
    }
    return [...cols].filter(Boolean).sort();
  };
  const zzipNodes = new Set([...reach('e1'), ...reach('e2')]);
  const mlmcNodes = new Set([...reach('e3'), ...reach('e4'), ...reach('e5')]);
  return { zzip: collect(zzipNodes), mlmc: collect(mlmcNodes) };
}

/** 5 個 extract 節點對應之 fallback raw 表名（查證發現 2）。 */
export const RAW_EXTRACT = {
  e1: 'raw_101f6b3e', // 和潤 ZZIP_BAMCUST_M
  e2: 'raw_35d85504', // 和勁 ZZIP_BAMCUST_M
  e3: 'raw_1138803c', // 和潤 MLMCUSTOMER
  e4: 'raw_aec93e7c', // 和勁 MLMCUSTOMER
  e5: 'raw_50172f04', // 興業 MLMCUSTOMER
} as const;

/** 9 張 lookup 來源 raw 表名 → 對照 schema 類別（查證發現 2）。 */
export const RAW_LOOKUP = {
  raw_e5a2345c: 'BAMCODE_D', // 和潤 ZZIP_BAMCODE_D
  raw_6fce5258: 'BAMCODE_D', // 和勁 ZZIP_BAMCODE_D
  raw_b4a48f10: 'BAMPOST_M', // ZZIP_BAMPOST_M（郵遞）
  raw_8b80671e: 'MLMCODE', // 和潤 MLMCODE
  raw_9dd0eca5: 'MLMCODE', // 和勁 MLMCODE
  raw_9dcaf414: 'MLMCODE', // 興業 MLMCODE
  raw_b9558d10: 'MLSTDINDUMF', // 和潤 MLSTDINDUMF
  raw_3acd58e7: 'MLSTDINDUMF', // 和勁 MLSTDINDUMF
  raw_afe6a874: 'MLSTDINDUMF', // 興業 MLSTDINDUMF
} as const;

const LOOKUP_SCHEMA: Record<string, string[]> = {
  BAMCODE_D: ['TBL_ID', 'TBL_CD', 'TBL_DESC1'],
  BAMPOST_M: ['POSTAL_NO', 'POSTAL_ADD'],
  MLMCODE: ['SYSCD', 'DATAID', 'MCODE', 'MNAME1'],
  MLSTDINDUMF: ['INDUID', 'INDUNM'],
};

export const ALL_RAW_TABLES = [
  ...Object.values(RAW_EXTRACT),
  ...Object.keys(RAW_LOOKUP),
];

/** 本次 fixture 客戶代號（source_customer_no，皆 8 碼、前綴 P4D、>=5 過 ghost gate）。 */
export const CUST = {
  ZH: 'P4DZH001', // C-ZZIP-HAPPY + C-CHI（e1；全 ZZIP lookup 命中；中文）
  ZM: 'P4DZM001', // C-ZZIP-MISS（e1；EDUCAT_BACK 未命中 → education_desc NULL）
  TIE: 'P4DTIE01', // C-TIE（e1 兩列同 CUSTO_NO+UPDATE_DATE，觸發 d1 tie-breaker）
  BOTH: 'P4DBOTH1', // C-BOTH（e1 + e3 同 source_customer_no → m4 FULL OUTER JOIN + cd1）
  ML: 'P4DML001', // C-MLMC-HAPPY（e3；MLMC lookup 命中）
  NB: 'P4DNB001', // C-NULLBIZ（e1；CUS_NAME=NULL → 整列排除）
} as const;

/** 預期最終寫入 customer_core 之客戶（NB 排除）。 */
export const SURVIVING_CODES = [CUST.ZH, CUST.ZM, CUST.TIE, CUST.BOTH, CUST.ML];
export const ALL_CODES = [...SURVIVING_CODES, CUST.NB];

// ---------------------------------------------------------------------------
// 低階 SQL helper
// ---------------------------------------------------------------------------

function lit(v: string | null | undefined): string {
  if (v === null || v === undefined) return 'NULL';
  return `N'${String(v).replace(/'/g, "''")}'`;
}

async function dropIfExists(qr: QueryRunner, name: string): Promise<void> {
  await qr.query(`IF OBJECT_ID('dbo.${name}', 'U') IS NOT NULL DROP TABLE "${name}"`);
}

async function createRawTable(qr: QueryRunner, name: string, columns: string[]): Promise<void> {
  await dropIfExists(qr, name);
  const colDefs = columns.map((c) => `"${c}" NVARCHAR(255) NULL`).join(', ');
  await qr.query(`CREATE TABLE "${name}" (${colDefs})`);
}

async function insertRows(
  qr: QueryRunner,
  name: string,
  rows: Record<string, string | null>[],
): Promise<void> {
  for (const row of rows) {
    const cols = Object.keys(row);
    if (cols.length === 0) continue;
    const colList = cols.map((c) => `"${c}"`).join(', ');
    const valList = cols.map((c) => lit(row[c])).join(', ');
    await qr.query(`INSERT INTO "${name}" (${colList}) VALUES (${valList})`);
  }
}

// ---------------------------------------------------------------------------
// Fixture 資料
// ---------------------------------------------------------------------------

/** 共用一組「全命中」ZZIP lookup 值。 */
const ZZIP_HIT = {
  EDUCAT_BACK: 'E1',
  VOCATION_CODE: 'V1',
  JOB_TITLE: 'J1',
  CMARRY_MK: '1', // marital_status_code 為 varchar(1)：碼須 1 碼
  CUSTOM_MK: '1', // padStart → '01'（命中 ctype '55'/'01'）
  INCOME_SOURCE: 'S1',
  INDUSTRY: 'I1',
  JOB_LEVEL: 'L1',
  MONTH_INCOME: '3', // 數字碼（真實 legacy 所得級距）：命中 income lookup（→ '中所得'）且 type_cast DECIMAL 經去尾零正規化為 '3'（AD-E07-41 §5.6 修 FINDING-P4D-01，不再溢位 varchar(5)）
  HPOST_NUM: '100',
  CPOST_NUM: '100',
  CO_NUM: '100',
};

/** BAMCODE_D（和潤/和勁）代碼對照列（TBL_ID/TBL_CD/TBL_DESC1）。 */
function bamcodeRows(): Record<string, string | null>[] {
  return [
    { TBL_ID: 'A2', TBL_CD: 'E1', TBL_DESC1: '高中' },
    { TBL_ID: 'A4', TBL_CD: 'V1', TBL_DESC1: '工程師' },
    { TBL_ID: 'A5', TBL_CD: 'J1', TBL_DESC1: '經理' },
    { TBL_ID: '33', TBL_CD: '1', TBL_DESC1: '已婚' },
    { TBL_ID: '55', TBL_CD: '01', TBL_DESC1: '個人' },
    { TBL_ID: 'Y0', TBL_CD: 'S1', TBL_DESC1: '薪資所得' },
    { TBL_ID: 'AA', TBL_CD: 'I1', TBL_DESC1: '製造業' },
    { TBL_ID: 'A6', TBL_CD: 'L1', TBL_DESC1: '中級主管' },
    { TBL_ID: 'A3', TBL_CD: '3', TBL_DESC1: '中所得' }, // income lookup（lk_income1: TBL_ID='A3' match MONTH_INCOME='3'）→ '中所得'
  ];
}

/** MLMCODE（和潤/和勁/興業）碼表（SYSCD/DATAID/MCODE/MNAME1）。 */
function mlmcodeRows(): Record<string, string | null>[] {
  return [
    { SYSCD: 'CF', DATAID: 'CU', MCODE: '1', MNAME1: '個人戶' },
    { SYSCD: 'CF', DATAID: 'CU', MCODE: '2', MNAME1: '法人戶' },
    { SYSCD: 'CF', DATAID: 'BM', MCODE: 'E1', MNAME1: '1-10人' },
    { SYSCD: 'CF', DATAID: '03', MCODE: 'L1', MNAME1: '未上市' },
  ];
}

function mlstdinduRows(): Record<string, string | null>[] {
  return [{ INDUID: 'IND1', INDUNM: '資訊服務業' }];
}

function bampostRows(): Record<string, string | null>[] {
  return [{ POSTAL_NO: '100', POSTAL_ADD: '台北市中正區' }];
}

/**
 * 全 14 張 raw 表建構 + 代表性資料。冪等：先 DROP 再 CREATE（raw 表非 baseline，測試專屬）。
 */
export async function buildFixtures(qr: QueryRunner): Promise<void> {
  const def = loadCustomerCoreDef();
  const { zzip, mlmc } = deriveExtractSchemas(def);

  // ---- Extract 表 ----
  for (const t of [RAW_EXTRACT.e1, RAW_EXTRACT.e2]) await createRawTable(qr, t, zzip);
  for (const t of [RAW_EXTRACT.e3, RAW_EXTRACT.e4, RAW_EXTRACT.e5]) await createRawTable(qr, t, mlmc);

  // ---- Lookup 表 ----
  for (const [name, kind] of Object.entries(RAW_LOOKUP)) {
    await createRawTable(qr, name, LOOKUP_SCHEMA[kind]);
  }

  // ---- Lookup 資料 ----
  await insertRows(qr, 'raw_e5a2345c', bamcodeRows());
  await insertRows(qr, 'raw_6fce5258', bamcodeRows());
  await insertRows(qr, 'raw_b4a48f10', bampostRows());
  await insertRows(qr, 'raw_8b80671e', mlmcodeRows());
  await insertRows(qr, 'raw_9dd0eca5', mlmcodeRows());
  await insertRows(qr, 'raw_9dcaf414', mlmcodeRows());
  await insertRows(qr, 'raw_b9558d10', mlstdinduRows());
  await insertRows(qr, 'raw_3acd58e7', mlstdinduRows());
  await insertRows(qr, 'raw_afe6a874', mlstdinduRows());

  // ---- e1（和潤 ZZIP）----
  await insertRows(qr, RAW_EXTRACT.e1, [
    // ZH：全命中 + 中文姓名/地址 + 電話合併
    {
      CUSTO_NO: CUST.ZH, CUS_NAME: '陳大文', ENG_NAME: 'CHEN TA WEN', CUS_SEX: '1',
      BITBE_DATE: '1980-05-15', UPDATE_DATE: '2026-06-01 10:00:00', INSERT_DATE: '2026-05-01 09:00:00',
      HPOST_ADD: '台北市中正區忠孝東路一段1號', COMM_ADD: '台北市中正區忠孝東路一段1號',
      CO_NAME: '大文企業', CAREA_NO1: '02', CTEL_NO1: '12345678', CEXTEN_NO1: '0',
      E_MAIL: 'chen@example.com', CAPITAL: '1000000', N_WORK_YEAR: '5', INCOME_APPROVED: '50000',
      DEBT_FLG: 'N', FINE_FLG: 'N', ADDR_FLG: '0', LAND_FLG: '0', IMMOPRO_MK: 'Y', CELLULAR: '0912345678',
      ...ZZIP_HIT,
    },
    // ZM：EDUCAT_BACK 未命中（E9 不在 BAMCODE_D）→ education_desc NULL；其餘命中
    {
      CUSTO_NO: CUST.ZM, CUS_NAME: '林小明', CUS_SEX: '2',
      UPDATE_DATE: '2026-06-03 10:00:00', INSERT_DATE: '2026-05-02 09:00:00',
      ...ZZIP_HIT, EDUCAT_BACK: 'E9',
    },
    // TIE 兩列：同 CUSTO_NO + 同 UPDATE_DATE，差異在 CUS_NAME（觸發 d1 tie-breaker）
    {
      CUSTO_NO: CUST.TIE, CUS_NAME: '王一', CUS_SEX: '1',
      UPDATE_DATE: '2026-06-05 08:00:00', INSERT_DATE: '2026-05-03 09:00:00',
      ...ZZIP_HIT,
    },
    {
      CUSTO_NO: CUST.TIE, CUS_NAME: '王二', CUS_SEX: '1',
      UPDATE_DATE: '2026-06-05 08:00:00', INSERT_DATE: '2026-05-03 09:00:00',
      ...ZZIP_HIT,
    },
    // BOTH（ZZIP 側，較新）
    {
      CUSTO_NO: CUST.BOTH, CUS_NAME: '張三ZZIP', CUS_SEX: '1',
      UPDATE_DATE: '2026-06-10 10:00:00', INSERT_DATE: '2026-05-04 09:00:00',
      ...ZZIP_HIT,
    },
    // NB：CUS_NAME = NULL → NOT NULL 業務欄排除
    {
      CUSTO_NO: CUST.NB, CUS_NAME: null, CUS_SEX: '1',
      UPDATE_DATE: '2026-06-06 10:00:00', INSERT_DATE: '2026-05-05 09:00:00',
      ...ZZIP_HIT,
    },
  ]);

  // ---- e2（和勁 ZZIP）：與 ZH 相同 CUSTO_NO（碰撞）以驅動 e2 分支 + m1 右側 + 和勁 lookup（raw_6fce5258）----
  await insertRows(qr, RAW_EXTRACT.e2, [
    {
      CUSTO_NO: CUST.ZH, CUS_NAME: '陳大文-和勁', CUS_SEX: '1',
      UPDATE_DATE: '2026-05-20 10:00:00', INSERT_DATE: '2026-05-01 09:00:00',
      ...ZZIP_HIT,
    },
  ]);

  // ---- e3（和潤 MLMC）----
  await insertRows(qr, RAW_EXTRACT.e3, [
    // ML：MLMC-only happy（CUTYPE '1'→'01'；emp/listed/indus 命中）
    {
      CUSTID: CUST.ML, CUSTNAME: '科技股份有限公司', CUTYPE: '1',
      EMPLOYEE: 'E1', LISTED: 'L1', INDUID: 'IND1',
      U_SYSDT: '2026-06-02 11:00:00', CUSTCREATEDATE: '2026-01-01 00:00:00',
      CUSTMOBILE: '0922333444', CUSTNOWCAPTIAL: '5000000', CUSTCREATECAPTIAL: '3000000',
      FAMOUNT: '2000000', OWNER: '負責人甲', BUSINESS: '軟體開發',
    },
    // BOTH（MLMC 側，較舊；CUTYPE '2'→'02'）
    {
      CUSTID: CUST.BOTH, CUSTNAME: '張三MLMC', CUTYPE: '2',
      EMPLOYEE: 'E1', LISTED: 'L1', INDUID: 'IND1',
      U_SYSDT: '2026-06-08 09:00:00', CUSTCREATEDATE: '2026-02-01 00:00:00',
    },
  ]);

  // ---- e4（和勁 MLMC）：與 ML 碰撞，驅動 e4 分支 + m2 右側 + 和勁 MLMC lookup ----
  await insertRows(qr, RAW_EXTRACT.e4, [
    {
      CUSTID: CUST.ML, CUSTNAME: '科技-和勁', CUTYPE: '1',
      EMPLOYEE: 'E1', LISTED: 'L1', INDUID: 'IND1', U_SYSDT: '2026-05-15 11:00:00',
    },
  ]);

  // ---- e5（興業 MLMC）：與 ML 碰撞，驅動 e5 分支 + m3 右側 + 興業 MLMC lookup ----
  await insertRows(qr, RAW_EXTRACT.e5, [
    {
      CUSTID: CUST.ML, CUSTNAME: '科技-興業', CUTYPE: '1',
      EMPLOYEE: 'E1', LISTED: 'L1', INDUID: 'IND1', U_SYSDT: '2026-05-10 11:00:00',
    },
  ]);
}

/**
 * GATE-002：datasources / extraction_tasks 僅需存在性（不塞資料，走 resolveRawTable 空表 fallback）。
 * 最小欄位集（resolve-raw-table-mssql 查詢會引用之欄）。idempotent。
 */
export async function ensureAuxTables(qr: QueryRunner): Promise<void> {
  const ds = await qr.query(`SELECT OBJECT_ID('dbo.datasources') AS oid`);
  if (ds[0].oid == null) {
    await qr.query(
      `CREATE TABLE "datasources" ("id" uniqueidentifier NOT NULL DEFAULT NEWID(), "name" varchar(200) NULL, CONSTRAINT "PK_p4d_datasources" PRIMARY KEY ("id"))`,
    );
  }
  const et = await qr.query(`SELECT OBJECT_ID('dbo.extraction_tasks') AS oid`);
  if (et[0].oid == null) {
    await qr.query(
      `CREATE TABLE "extraction_tasks" ("id" uniqueidentifier NOT NULL DEFAULT NEWID(), "datasource_id" uniqueidentifier NULL, "source_table" varchar(200) NULL, "raw_table_name" varchar(200) NULL, "last_execution_at" datetime2 NULL, CONSTRAINT "PK_p4d_extraction_tasks" PRIMARY KEY ("id"))`,
    );
  }
}

/** 確保 customer_core 存在（複用 P4c baseline DDL）。 */
export async function ensureCustomerCore(qr: QueryRunner): Promise<void> {
  await ensureTargetTable(qr, 'customer_core');
}

/** 刪除本次 fixture 寫入 customer_core 之列（前綴 P4D 隔離；不 TRUNCATE，該表 P4c 共用）。 */
export async function deleteCustomerRows(qr: QueryRunner): Promise<void> {
  await qr.query(`DELETE FROM "customer_core" WHERE "source_customer_no" LIKE 'P4D%'`);
}

/** 全部拆除：drop 14 raw 表 + 刪 customer_core 之 P4D 列。datasources/extraction_tasks 保留（存在性語意）。 */
export async function cleanupFixtures(qr: QueryRunner): Promise<void> {
  for (const t of ALL_RAW_TABLES) await dropIfExists(qr, t);
  await deleteCustomerRows(qr);
}

/** 讀取某 source_customer_no 之 customer_core 列（供斷言）。 */
export async function readCustomer(qr: QueryRunner, code: string): Promise<any[]> {
  return qr.query(`SELECT * FROM "customer_core" WHERE "source_customer_no" = @0`, [code]);
}
