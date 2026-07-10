/**
 * AD-E07-43 P5b — 其餘 5 條生產 ETL pipeline 端對端整合測試之 fixture 建構 helper（非 .spec，vitest 不收集）。
 *
 * 隔離（REG-006 / I-MSSQL-CI-BOOTSTRAP-01）：P5b 之 4 條 fullMode pipeline 之 target_load 走 TRUNCATE，
 *   會清空與 P3a/P3c/P3d CI 共用之 dbo baseline 表（ob_pool_data / ob_pool_data_list / ob_emphire /
 *   ob_calendar）。故 P5b **連接獨立資料庫 CDMP_P5B**（docker/mssql-init.sql 建立、BIN collation、cdmp
 *   db_owner），target/raw fixture 皆由本 helper idempotent 自建（不依賴 migration:run），與 CDMP_TEST.dbo
 *   完全解耦。CDMP_P5B 不存在（本機未重跑 mssql-init）→ 連線失敗 → spec 全檔 skip（不偽綠）。
 *
 * 提供：
 *   1. connectMssqlP5b()：連 CDMP_P5B（覆寫 MSSQL.database）。
 *   2. loadPipelineDef(name) / getFm1Mappings / deriveRawColumns / invertMappings（GATE-001 程式化衍生）。
 *   3. 5 張目標表 + datasources/extraction_tasks 存在性 idempotent 自建。
 *   4. 5 張 raw staging 表（各 NVARCHAR(255) NULL，欄位由 fm1.mappings[].sourceColumn 程式化衍生）+ 代表性資料。
 *
 * ⚠️ 呼叫端 spec 必須先 side-effect import '@/database/__tests__/mssql-env-preload'（設 DB_TYPE=mssql）。
 */
import * as fs from 'fs';
import * as path from 'path';
import { DataSource, QueryRunner } from 'typeorm';
import { MSSQL, mssqlPortReachable } from '@/database/__tests__/mssql-env-preload';
import { TARGET_TABLE_DDL as P4C_TARGET_DDL } from './_p4c-target-tables';

const PIPELINE_JSON = path.resolve(
  __dirname,
  '../../../../database/seeds/data/etl-pipelines.json',
);

/** P5b 專用資料庫（隔離，見檔頭）。 */
export const P5B_DB = 'CDMP_P5B';

export interface P5bHarness {
  ds: DataSource | null;
  qr: QueryRunner | null;
  reachable: boolean;
}

function p5bOptions() {
  return {
    type: 'mssql' as const,
    host: MSSQL.host,
    port: MSSQL.port,
    username: MSSQL.username,
    password: MSSQL.password,
    database: P5B_DB, // 覆寫：連 CDMP_P5B 而非 CDMP_TEST
    options: { encrypt: MSSQL.encrypt, trustServerCertificate: MSSQL.trustServerCertificate },
    entities: [],
    synchronize: false,
  };
}

/** 連 CDMP_P5B。埠不可達或 DB 不存在（登入失敗）→ reachable=false（spec skip，不偽綠）。 */
export async function connectMssqlP5b(): Promise<P5bHarness> {
  const reachable = await mssqlPortReachable(1500);
  if (!reachable) return { ds: null, qr: null, reachable: false };
  try {
    const ds = new DataSource(p5bOptions());
    await ds.initialize();
    const qr = ds.createQueryRunner();
    await qr.connect();
    return { ds, qr, reachable: true };
  } catch {
    return { ds: null, qr: null, reachable: false };
  }
}

export async function teardownMssqlP5b(h: P5bHarness | undefined): Promise<void> {
  if (!h) return;
  if (h.qr) await h.qr.release();
  await h.ds?.destroy();
}

// ---------------------------------------------------------------------------
// Pipeline 定義存取（etl-pipelines.json 為唯一真實資料來源）
// ---------------------------------------------------------------------------

export interface PipelineMeta {
  name: string;
  rawTable: string;
  targetTable: string;
  /** fullMode(4) 或 partition_replace(1) */
  mode: 'fullMode' | 'partition_replace';
  pkCols: string[];
  /** 是否含 conditional 節點（僅 ob_emphire） */
  hasConditional: boolean;
}

/** 5 條 pipeline 之靜態事實鎖定（★發現 1、5、7；供分流與斷言）。 */
export const P5B_PIPELINES: Record<string, PipelineMeta> = {
  arreturndf: {
    name: 'E07-OBARRETURNDF_MIN_CAP-Load',
    rawTable: 'raw_970da79c',
    targetTable: 'ob_arreturndf_min_cap',
    mode: 'fullMode',
    pkCols: ['appl_no'],
    hasConditional: false,
  },
  calendar: {
    name: 'E07-OBCALENDAR-Load',
    rawTable: 'raw_dfb3b313',
    targetTable: 'ob_calendar',
    mode: 'fullMode',
    pkCols: ['calendar_date'],
    hasConditional: false,
  },
  emphire: {
    name: 'E07-OBEMPHIRE-Load',
    rawTable: 'raw_e1e951d7',
    targetTable: 'ob_emphire',
    mode: 'fullMode',
    pkCols: ['emp_id'],
    hasConditional: true,
  },
  pooldata: {
    name: 'E07-OBPOOLDATA-Load',
    rawTable: 'raw_6d58393b',
    targetTable: 'ob_pool_data',
    mode: 'fullMode',
    pkCols: ['orgno', 'appl_no'],
    hasConditional: false,
  },
  pooldata_list: {
    name: 'E07-OBPOOLDATA_LIST-Load',
    rawTable: 'raw_33dc3771',
    targetTable: 'ob_pool_data_list',
    mode: 'partition_replace',
    pkCols: ['list_no', 'orgno', 'appl_no'],
    hasConditional: false,
  },
};

export type PipelineKey = keyof typeof P5B_PIPELINES;
export const PIPELINE_KEYS = Object.keys(P5B_PIPELINES) as PipelineKey[];

let _cache: any[] | null = null;
function allPipelines(): any[] {
  if (!_cache) _cache = JSON.parse(fs.readFileSync(PIPELINE_JSON, 'utf8'));
  return _cache!;
}

/**
 * 讀取某 pipeline 之 definition（nodes/edges）。
 *
 * ⚠️ 以 `target_load` 目標表定位（非顯示名）——pipeline 顯示名已改中文（以 dev CDMP 為主），
 *    改名不影響定位。P5B_PIPELINES[key].name 僅保留為文件/標籤用途。
 */
export function loadPipelineDef(key: PipelineKey): { nodes: any[]; edges: any[] } {
  const target = P5B_PIPELINES[key].targetTable;
  const p = allPipelines().find((x) =>
    (x.definition?.nodes ?? []).some(
      (n: any) => n?.data?.nodeType === 'target_load' && n?.data?.targetTable === target,
    ),
  );
  if (!p) throw new Error(`etl-pipelines.json 找不到 target_load=${target} 之 pipeline`);
  return p.definition;
}

interface FieldMapping {
  sourceColumn: string;
  targetColumn: string;
  defaultValue: unknown | null;
}

/** fm1 field_mapping 節點之 mappings（每條 pipeline 恰一個 field_mapping 節點）。 */
export function getFm1Mappings(def: { nodes: any[] }): FieldMapping[] {
  const fm = def.nodes.find((n) => n.data.nodeType === 'field_mapping');
  if (!fm) throw new Error('pipeline 無 field_mapping 節點');
  return fm.data.mappings as FieldMapping[];
}

/** GATE-001：raw 表欄位＝fm1.mappings[].sourceColumn（去重）。人工不列舉（114/122 欄易遺漏）。 */
export function deriveRawColumns(def: { nodes: any[] }): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of getFm1Mappings(def)) {
    if (!seen.has(m.sourceColumn)) {
      seen.add(m.sourceColumn);
      out.push(m.sourceColumn);
    }
  }
  return out;
}

/** targetColumn → sourceColumn 反查（供以「業務語意的目標欄名」定義 fixture 列）。 */
export function invertMappings(def: { nodes: any[] }): Record<string, string> {
  const map: Record<string, string> = {};
  for (const m of getFm1Mappings(def)) map[m.targetColumn] = m.sourceColumn;
  return map;
}

// ---------------------------------------------------------------------------
// 目標表 DDL（逐字取自 mssql baseline migration 1751884800000-MssqlBaselineSchema.ts）
// ---------------------------------------------------------------------------

/** ob_pool_data / ob_pool_data_list DDL 逐字取自 baseline migration line 50/51（勿改）。 */
const P5B_TARGET_DDL: Record<string, string> = {
  ob_calendar: P4C_TARGET_DDL.ob_calendar,
  ob_arreturndf_min_cap: P4C_TARGET_DDL.ob_arreturndf_min_cap,
  ob_emphire: P4C_TARGET_DDL.ob_emphire,
  ob_pool_data: `CREATE TABLE "ob_pool_data" ("created_by_prog" varchar(20), "created_by" varchar(20), "created_at" datetime2, "updated_by_prog" varchar(20), "updated_by" varchar(20), "updated_at" datetime2, "orgno" varchar(2) NOT NULL, "appl_no" varchar(10) NOT NULL, "custo_no" varchar(11) NOT NULL, "cust_name" varchar(90), "lic_no" varchar(10), "sta_code_na" varchar(40), "project_tp" varchar(40), "spec_no" varchar(10), "spec_name" varchar(45), "dept_name" varchar(30), "pay_resouc_code" varchar(2), "break_pct" numeric(5,0), "extend_day" numeric(2,0), "pay_resouc" varchar(40), "commute" varchar(90), "cycle_pay_na" varchar(40), "cycle_pay_val" varchar(2), "deal_num" numeric(3,0), "pro_rate" numeric(5,2), "b_case_irr" numeric(5,2), "first_pay_dt" datetime2, "fapcon_dt" datetime2, "maturity_dt" datetime2, "deal_mark" varchar(2), "pay_way" varchar(2), "loan_totamt" numeric(18,0), "loan_capital" numeric(18,0), "loan_oddamt" numeric(18,0), "commission" numeric(15,0), "settle_date" datetime2, "loan_rate" numeric(5,2), "sta_code" varchar(2) NOT NULL, "ofi_date" datetime2, "dept_id" varchar(6) NOT NULL, "pay_way_na" varchar(30), "brnh_no" varchar(5), "dlr_no" varchar(4), "broker" varchar(60), "sales_no" varchar(14), "broker_agent" varchar(60), "hfs_sales" varchar(14), "sales" varchar(60), "agent_head_id" varchar(11), "promoter_dept" varchar(60), "agent_id" varchar(11), "promoter" varchar(60), "brand_no" varchar(2), "brand_name" varchar(40), "car_name" varchar(30), "inquiry" varchar(10), "approval" varchar(10), "manager_limit" varchar(2), "spec_mk_na" varchar(40), "spec_type_na" varchar(40), "atm_business" varchar(4), "no_duty" varchar(1), "year_produ" varchar(4), "dlr_name" varchar(30), "brnh_name" varchar(30), "project_tp_cd" varchar(2), "appl_date" datetime2, "apmacc_memo" nvarchar(MAX), "sales_sts_na" varchar(30), "sub_code" varchar(2), "cc_nbr" varchar(5), "throu_mon" numeric(8,0), "fund_src" varchar(2), "secret_flg" varchar(1), "rate_choice" varchar(30), "per_info" varchar(30), "tie_down_num" int, "rest_amt" numeric(8,0), "over_tie_num" int, "open_code" varchar(1), "emplid" varchar(10), "emplid_deptid" varchar(6), "case_type" varchar(2), "hotai_agree" varchar(10), "call_dept" varchar(4), "c_class" varchar(1), "payt_num" int, "list_type" varchar(2) NOT NULL, "prod_type" varchar(2), "prod_type_name" varchar(40), "prod_class" varchar(2), "prod_class_name" varchar(40), "prod_kind" varchar(2), "prod_kind_name" varchar(8), "best_case" varchar(1), "acc_date" datetime2, "order1" int, "order2" int, "payt_term" int, "term_amt" numeric(19,4), "nonpayt_term" int, "overdue_amt" numeric(19,4), "overdue_day" int, "coll_empl" varchar(50), "car_model" varchar(100), "pay_user" varchar(90), "pay_add" varchar(255), "fleet_car" varchar(1), "promoter_tel" varchar(20), "sales_tel" varchar(20), "memo1" varchar(255), "caseyear" varchar(4), "ob_dept" varchar(6), "ob_emplid" varchar(6), "last_pay_date" datetime2, "month_cnt" int, "year_cnt" int, "settle_src" nvarchar(MAX) NOT NULL, "spec_tp" varchar(2), "cus_level" varchar(1), "_cdmp_extracted_at" datetime2 NOT NULL, CONSTRAINT "PK_61272888dbb69edc11bd16c3778" PRIMARY KEY ("orgno", "appl_no"))`,
  ob_pool_data_list: `CREATE TABLE "ob_pool_data_list" ("created_by_prog" varchar(20), "created_by" varchar(20), "created_at" datetime2, "updated_by_prog" varchar(20), "updated_by" varchar(20), "updated_at" datetime2, "list_no" varchar(100) NOT NULL, "orgno" varchar(2) NOT NULL, "appl_no" varchar(10) NOT NULL, "custo_no" varchar(11), "cust_name" varchar(90), "lic_no" varchar(10), "sta_code_na" varchar(40), "project_tp" varchar(40), "spec_no" varchar(10), "spec_name" varchar(45), "dept_name" varchar(30), "pay_resouc_code" varchar(2), "break_pct" numeric(5,0), "extend_day" numeric(2,0), "pay_resouc" varchar(40), "commute" varchar(90), "cycle_pay_na" varchar(40), "cycle_pay_val" varchar(2), "deal_num" numeric(3,0), "pro_rate" numeric(5,2), "b_case_irr" numeric(5,2), "first_pay_dt" datetime2, "fapcon_dt" datetime2, "maturity_dt" datetime2, "deal_mark" varchar(2), "pay_way" varchar(2), "loan_totamt" numeric(18,0), "loan_capital" numeric(18,0), "loan_oddamt" numeric(18,0), "commission" numeric(15,0), "settle_date" datetime2, "loan_rate" numeric(5,2), "sta_code" varchar(2), "ofi_date" datetime2, "dept_id" varchar(6), "pay_way_na" varchar(30), "brnh_no" varchar(5), "dlr_no" varchar(4), "broker" varchar(60), "sales_no" varchar(14), "broker_agent" varchar(60), "hfs_sales" varchar(14), "sales" varchar(60), "agent_head_id" varchar(11), "promoter_dept" varchar(60), "agent_id" varchar(11), "promoter" varchar(60), "brand_no" varchar(2), "brand_name" varchar(40), "car_name" varchar(30), "inquiry" varchar(10), "approval" varchar(10), "manager_limit" varchar(2), "spec_mk_na" varchar(40), "spec_type_na" varchar(40), "atm_business" varchar(4), "no_duty" varchar(1), "year_produ" varchar(4), "dlr_name" varchar(30), "brnh_name" varchar(30), "project_tp_cd" varchar(2), "appl_date" datetime2, "apmacc_memo" nvarchar(MAX), "sales_sts_na" varchar(30), "sub_code" varchar(2), "cc_nbr" varchar(5), "throu_mon" numeric(8,0), "fund_src" varchar(2), "secret_flg" varchar(1), "rate_choice" varchar(30), "per_info" varchar(30), "tie_down_num" int, "rest_amt" numeric(8,0), "over_tie_num" int, "open_code" varchar(1), "emplid" varchar(10), "emplid_deptid" varchar(6), "case_type" varchar(2), "hotai_agree" varchar(10), "call_dept" varchar(4), "c_class" varchar(1), "payt_num" int, "list_type" varchar(2), "prod_type" varchar(2), "prod_type_name" varchar(40), "prod_class" varchar(2), "prod_class_name" varchar(40), "prod_kind" varchar(2), "prod_kind_name" varchar(8), "best_case" varchar(1), "acc_date" datetime2, "order1" int, "order2" int, "payt_term" int, "term_amt" numeric(19,4), "nonpayt_term" int, "overdue_amt" numeric(19,4), "overdue_day" int, "coll_empl" varchar(50), "car_model" varchar(100), "pay_user" varchar(90), "pay_add" varchar(255), "fleet_car" varchar(1), "promoter_tel" varchar(20), "sales_tel" varchar(20), "memo1" varchar(255), "caseyear" varchar(4), "ob_dept" varchar(6), "ob_emplid" varchar(6), "last_pay_date" datetime2, "month_cnt" int, "year_cnt" int, "settle_src" nvarchar(MAX) NOT NULL, "assignday" varchar(100), "spec_tp" varchar(2), "cus_level" varchar(1), "card_level" varchar(1), "tier_level" varchar(5), "hot_recycle" varchar(1), "cr_id" varchar(20), "cr_nm" varchar(50), "is_cr" varchar(1), "score" int, "data_source" varchar(20), CONSTRAINT "PK_25012a3a33820861fa2c76266b8" PRIMARY KEY ("list_no", "orgno", "appl_no"))`,
};

/** 5 張目標表逐字 baseline DDL（供靜態斷言引用）。 */
export const P5B_TARGET_TABLES = Object.keys(P5B_TARGET_DDL);

async function tableExists(qr: QueryRunner, name: string): Promise<boolean> {
  const r = await qr.query(`SELECT OBJECT_ID(@0) AS oid`, ['dbo.' + name]);
  return r[0].oid != null;
}

/** Idempotent 建目標表（若不存在則建，DDL 逐字 baseline；永不 drop，baseline 保留語意）。 */
export async function ensureTargetTable(qr: QueryRunner, name: string): Promise<void> {
  const ddl = P5B_TARGET_DDL[name];
  if (!ddl) throw new Error(`未知 P5b target 表 DDL：${name}`);
  if (await tableExists(qr, name)) return;
  try {
    await qr.query(ddl);
  } catch (e: any) {
    if (!(await tableExists(qr, name))) throw e;
  }
}

export async function ensureAllTargetTables(qr: QueryRunner): Promise<void> {
  for (const t of P5B_TARGET_TABLES) await ensureTargetTable(qr, t);
}

/**
 * datasources / extraction_tasks 僅需存在性（resolveRawTableMssql 之 JOIN 查詢需表存在，
 * 回空 → fallback 至 node.data.rawTable 靜態表名）。最小欄位集，不塞資料。idempotent。
 */
export async function ensureAuxTables(qr: QueryRunner): Promise<void> {
  if (!(await tableExists(qr, 'datasources'))) {
    await qr.query(
      `CREATE TABLE "datasources" ("id" uniqueidentifier NOT NULL DEFAULT NEWID(), "name" varchar(200) NULL, CONSTRAINT "PK_p5b_datasources" PRIMARY KEY ("id"))`,
    );
  }
  if (!(await tableExists(qr, 'extraction_tasks'))) {
    await qr.query(
      `CREATE TABLE "extraction_tasks" ("id" uniqueidentifier NOT NULL DEFAULT NEWID(), "datasource_id" uniqueidentifier NULL, "source_table" varchar(200) NULL, "raw_table_name" varchar(200) NULL, "last_execution_at" datetime2 NULL, CONSTRAINT "PK_p5b_extraction_tasks" PRIMARY KEY ("id"))`,
    );
  }
}

// ---------------------------------------------------------------------------
// Raw fixture 表 + 資料
// ---------------------------------------------------------------------------

function lit(v: string | null | undefined): string {
  if (v === null || v === undefined) return 'NULL';
  return `N'${String(v).replace(/'/g, "''")}'`;
}

async function dropIfExists(qr: QueryRunner, name: string): Promise<void> {
  await qr.query(`IF OBJECT_ID('dbo.${name}', 'U') IS NOT NULL DROP TABLE "${name}"`);
}

/** 建 raw 表（全欄 NVARCHAR(255) NULL，比照 P4d _p4d-fixtures.ts:170）。冪等：先 DROP 再 CREATE。 */
export async function createRawTable(qr: QueryRunner, name: string, columns: string[]): Promise<void> {
  await dropIfExists(qr, name);
  const colDefs = columns.map((c) => `"${c}" NVARCHAR(255) NULL`).join(', ');
  await qr.query(`CREATE TABLE "${name}" (${colDefs})`);
}

/** 插入列（targetColumn→value 以 inverse map 翻譯為 sourceColumn→value）。 */
export async function insertTargetRows(
  qr: QueryRunner,
  rawTable: string,
  inverse: Record<string, string>,
  targetRows: Record<string, string | null>[],
): Promise<void> {
  for (const trow of targetRows) {
    const srow: Record<string, string | null> = {};
    for (const [tcol, val] of Object.entries(trow)) {
      const scol = inverse[tcol];
      if (scol) srow[scol] = val;
    }
    const cols = Object.keys(srow);
    if (cols.length === 0) continue;
    const colList = cols.map((c) => `"${c}"`).join(', ');
    const valList = cols.map((c) => lit(srow[c])).join(', ');
    await qr.query(`INSERT INTO "${rawTable}" (${colList}) VALUES (${valList})`);
  }
}

// ---- 各 pipeline 之 happy-path fixture 列（以目標欄名表達；NOT NULL 業務欄皆有值） ----

/** ob_arreturndf_min_cap：3 唯一 appl_no + 1 重複（fullMode dedup）。 */
export const FIX_ARRETURNDF = {
  happy: [
    { appl_no: 'A0000001', add_un_capital: '1000' },
    { appl_no: 'A0000002', add_un_capital: '250000' },
    { appl_no: 'A0000003', add_un_capital: '0' },
  ] as Record<string, string | null>[],
  dupPk: { appl_no: 'A0000001', add_un_capital: '9999' } as Record<string, string | null>,
  uniqueCount: 3,
};

/** ob_calendar：5 唯一日期（含月初/月底/閏年/年末）+ 1 重複。 */
export const FIX_CALENDAR = {
  happy: [
    { calendar_date: '2026-01-01', rest_flg: '1' }, // 年初/月初、假日
    { calendar_date: '2026-01-31', rest_flg: '0' }, // 月底、工作日
    { calendar_date: '2024-02-29', rest_flg: '0' }, // 閏年 2/29
    { calendar_date: '2026-06-15', rest_flg: '1' },
    { calendar_date: '2026-12-31', rest_flg: '0' }, // 年末
  ] as Record<string, string | null>[],
  dupPk: { calendar_date: '2026-01-01', rest_flg: '0' } as Record<string, string | null>,
  uniqueCount: 5,
};

/** ob_emphire：2 在職(9999-12-31)+2 離職(實際日)+中文；+1 重複 emp_id。 */
export const FIX_EMPHIRE = {
  happy: [
    { emp_id: 'E00001', emp_nm: '陳志明', dept_code: 'D01', dept_name: '電銷一部', title_code: 'T1', title_name: '專員', hire_date: '2020-01-15', resign_date: '9999-12-31', is_auth: 'Y' },
    { emp_id: 'E00002', emp_nm: '林淑芬', dept_code: 'D01', dept_name: '電銷一部', title_code: 'T1', title_name: '專員', hire_date: '2019-03-01', resign_date: '9999-12-31', is_auth: 'Y' },
    { emp_id: 'E00003', emp_nm: '王大衛', dept_code: 'D02', dept_name: '電銷二部', title_code: 'T2', title_name: '襄理', hire_date: '2018-05-20', resign_date: '2023-06-30', is_auth: 'N' },
    { emp_id: 'E00004', emp_nm: '黃美麗', dept_code: 'D02', dept_name: '電銷二部', title_code: 'T2', title_name: '襄理', hire_date: '2021-07-10', resign_date: '2025-12-31', is_auth: 'N' },
  ] as Record<string, string | null>[],
  dupPk: { emp_id: 'E00001', emp_nm: '重複列應被去重', dept_code: 'D01', dept_name: '電銷一部', hire_date: '2020-01-15', resign_date: '9999-12-31', is_auth: 'Y' } as Record<string, string | null>,
  uniqueCount: 4,
  activeIds: ['E00001', 'E00002'], // resign_date 經 cd1 → NULL
  resignedIds: ['E00003', 'E00004'],
};

/** ob_pool_data：3 唯一 (orgno,appl_no)（含 composite 對照 02/P000000001）+ 1 重複。 */
export const FIX_POOLDATA = {
  happy: [
    { orgno: '01', appl_no: 'P000000001', custo_no: 'C0000000001', sta_code: '10', dept_id: 'D00001', list_type: '01', settle_src: 'N', cust_name: '陳大文', dept_name: '台北分處', car_name: '豐田', loan_totamt: '1500000', pro_rate: '12.50', term_amt: '123456.7890', appl_date: '2026-06-15', first_pay_dt: '2026-07-01', maturity_dt: '2029-06-30' },
    { orgno: '01', appl_no: 'P000000002', custo_no: 'C0000000002', sta_code: '20', dept_id: 'D00002', list_type: '02', settle_src: 'Y', cust_name: '林小明', dept_name: '台中分處', car_name: '日產', loan_totamt: '800000', pro_rate: '9.99', term_amt: '0.0001', appl_date: '2026-05-20', first_pay_dt: '2026-06-01', maturity_dt: '2028-05-31' },
    { orgno: '02', appl_no: 'P000000001', custo_no: 'C0000000003', sta_code: '10', dept_id: 'D00001', list_type: '01', settle_src: 'N', cust_name: '黃美玲', dept_name: '高雄分處', car_name: '本田', loan_totamt: '2000000', pro_rate: '8.00', term_amt: '99999.5000', appl_date: '2026-06-01' },
  ] as Record<string, string | null>[],
  dupPk: { orgno: '01', appl_no: 'P000000001', custo_no: 'C9999999999', sta_code: '99', dept_id: 'D99999', list_type: '09', settle_src: 'N', cust_name: '重複案件' } as Record<string, string | null>,
  uniqueCount: 3,
};

/**
 * ob_pool_data_list：3 唯一 (list_no,orgno,appl_no)。settle_src NOT NULL。
 * ⚠️ e1 extract 具 sourceFilter `ASSIGNDAY < currentMonthFirstDay`（F090 歷史過濾）→ 每列須設
 *    assignday 為過去日期字串（'20200101' 恆 < 任何當月月首 YYYYMM01），否則 NULL<x 為 NULL、整列被濾掉。
 */
const PAST_ASSIGNDAY = '20200101';
export const FIX_POOLDATA_LIST = {
  happy: [
    { list_no: 'L0001', orgno: '01', appl_no: 'P000000001', custo_no: 'C0000000001', cust_name: '陳大文', dept_name: '台北分處', settle_src: 'N', pro_rate: '12.50', loan_totamt: '1500000', appl_date: '2026-06-15', assignday: PAST_ASSIGNDAY },
    { list_no: 'L0001', orgno: '01', appl_no: 'P000000002', custo_no: 'C0000000002', cust_name: '林小明', dept_name: '台中分處', settle_src: 'Y', assignday: PAST_ASSIGNDAY },
    { list_no: 'L0002', orgno: '02', appl_no: 'P000000001', custo_no: 'C0000000003', cust_name: '黃美玲', dept_name: '高雄分處', settle_src: 'N', assignday: PAST_ASSIGNDAY },
  ] as Record<string, string | null>[],
  dupPk: { list_no: 'L0001', orgno: '01', appl_no: 'P000000001', custo_no: 'CDUP', cust_name: '重複名單列', settle_src: 'N', assignday: PAST_ASSIGNDAY } as Record<string, string | null>,
  uniqueCount: 3,
  /** 分區隔離用：直接寫入 target 之 data_source≠'etl_load' 既存列（不經 pipeline）。 */
  otherPartition: '_P5B_OTHER_',
};

/**
 * 建構單一 pipeline 之 raw 表 + happy 資料（不含重複列，dupPk 由個別測試按需追加）。
 * 冪等（先 DROP raw 再建）。
 */
export async function buildRawFixture(
  qr: QueryRunner,
  key: PipelineKey,
  rows: Record<string, string | null>[],
): Promise<void> {
  const def = loadPipelineDef(key);
  const cols = deriveRawColumns(def);
  const inverse = invertMappings(def);
  await createRawTable(qr, P5B_PIPELINES[key].rawTable, cols);
  await insertTargetRows(qr, P5B_PIPELINES[key].rawTable, inverse, rows);
}

const HAPPY: Record<PipelineKey, Record<string, string | null>[]> = {
  arreturndf: FIX_ARRETURNDF.happy,
  calendar: FIX_CALENDAR.happy,
  emphire: FIX_EMPHIRE.happy,
  pooldata: FIX_POOLDATA.happy,
  pooldata_list: FIX_POOLDATA_LIST.happy,
};

/** 全 5 條 pipeline 之 raw 表 happy fixture（beforeAll 呼叫）。 */
export async function buildAllHappyFixtures(qr: QueryRunner): Promise<void> {
  for (const key of PIPELINE_KEYS) await buildRawFixture(qr, key, HAPPY[key]);
}

/** 重建單一 pipeline 之 happy raw（供破壞性測試後復原）。 */
export async function rebuildHappy(qr: QueryRunner, key: PipelineKey): Promise<void> {
  await buildRawFixture(qr, key, HAPPY[key]);
}

/** 清目標表全部列（P5b 專用庫，直接 DELETE）。 */
export async function clearTarget(qr: QueryRunner, key: PipelineKey): Promise<void> {
  await qr.query(`DELETE FROM "${P5B_PIPELINES[key].targetTable}"`);
}

/** 全部拆除 raw 表（target/aux 保留）。 */
export async function cleanupRawFixtures(qr: QueryRunner): Promise<void> {
  for (const key of PIPELINE_KEYS) await dropIfExists(qr, P5B_PIPELINES[key].rawTable);
}

/** 目標表列數。 */
export async function countTarget(qr: QueryRunner, key: PipelineKey, where?: string): Promise<number> {
  const w = where ? ` WHERE ${where}` : '';
  const r = await qr.query(`SELECT COUNT(*) AS c FROM "${P5B_PIPELINES[key].targetTable}"${w}`);
  return Number(r[0].c);
}
