/**
 * AD-E07-43 P5c — MONTHRUN-DIFF：真實 PG 月跑 vs MSSQL 全鏈逐列比對（Tier 2 主要證據）
 *
 * 定調（AD §3.1 / test-spec AD-E07-43-P5c-test.md）：manual/script，非 CI 常駐測試。
 * 比照 F101/F102/F104 前例（觸發真實月跑鏈路、SQL 直接查表比對、輸出人工可讀差異記錄）。
 *
 * ★ 方法論（Approach A — 案件集釘選 PG 輸出，隔離 Stage 2~4/CR 引擎；見 impl log AD-2）：
 *   1. 選定 PG 生產月跑 run（07944a82 / 202607，現行 ob_pool_data 100% 覆蓋其案件集）。
 *   2. 唯讀讀取該 run 的 ob_monthly_run_result（＝案件集＋每列預期 10 欄）與其輸入表
 *      （ob_pool_data / customer_core / ob_arreturndf_min_cap / ob_emphire / ob_dept_pct /
 *       ob_empl_set / ob_calendar / ob_list_definition / 計分卡 config）。**PG 全程唯讀**。
 *   3. 把輸入複製到 MSSQL 隔離窗（CDMP_TEST dbo，現空；前綴 run_id；收尾清理）。
 *   4. 依 Stage 1 CR 來源規則（agent_id → 在職 ob_emphire(id_no) → emp_id；is_cr 初始 'N'；
 *      stage1-sql-executor.ts:96-107 逐字複刻）**重建 Stage 1 seed 列**（釘選 PG 案件集，
 *      不重跑 Stage 1 篩選 → 消除 Stage 1 選案漂移，純測 Stage 2~4/CR）。
 *   5. 呼叫真實生產碼 `executeStage2to3PushdownMssql`（P3b 計分 + clear + P3d CR 前置 +
 *      P3c 比例分派，全 4 步 MSSQL 下推）。
 *   6. **逐列比對** MSSQL 輸出 vs PG run 輸出（10 欄）→ 0-diff 或差異清單（case+欄+PG值+MSSQL值）。
 *
 * ★ 時區安全（🔴 關鍵）：node-postgres 預設把 timestamp/date 解析為「本機時區 JS Date」，
 *   經 tedious（useUTC）寫入 datetime2 會位移 8 小時 → 破壞 appl_date/日期欄。修法：覆寫 pg
 *   typeParser 讓 temporal 欄回傳「原字面字串（wall-clock）」，以字串插入 MSSQL → 零位移、忠實。
 *
 * PG 唯讀；MSSQL 隔離不污染共用 baseline；不 commit；不偽綠（連不上/抽樣誠實記錄）。
 *
 * 執行：
 *   cd apps/api
 *   npx ts-node -r tsconfig-paths/register scripts/mssql-monthrun-diff-p5c.ts
 *   （可選 env：P5C_LISTS=OB202607012,OB202607013,...  P5C_RUN=<pg run uuid>  P5C_YM=202607）
 */

// 🔴 必最先 import（side-effect：process.env.DB_TYPE='mssql'，使 column-types helper 於後續
//    entity import 時解析為 mssql 分支值 datetime2/uniqueidentifier/…；比照 *.mssql.spec.ts）。
import { MSSQL, restoreDbType } from '@/database/__tests__/mssql-env-preload';

// pg 無 @types → 以 require 取用（避免 TS7016）。
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pgLib = require('pg') as {
  Client: new (cfg: unknown) => PgClient;
  types: { setTypeParser: (oid: number, fn: (v: string | null) => unknown) => void };
};
type PgClient = {
  connect: () => Promise<void>;
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
  end: () => Promise<void>;
};
import { DataSource, EntityManager } from 'typeorm';

import { ObPoolData } from '@/database/entities/ob-pool-data.entity';
import { ObPoolDataList } from '@/database/entities/ob-pool-data-list.entity';
import { ObMonthlyRunResult } from '@/database/entities/ob-monthly-run-result.entity';
import { AssignmentRun } from '@/database/entities/assignment-run.entity';
import { AssignmentRunSnapshot } from '@/database/entities/assignment-run-snapshot.entity';
import { ObListDefinition } from '@/database/entities/ob-list-definition.entity';
import { ObDeptPct } from '@/database/entities/ob-dept-pct.entity';
import { ObEmplSet } from '@/database/entities/ob-empl-set.entity';
import { ObEmphire } from '@/database/entities/ob-emphire.entity';
import { ObCalendar } from '@/database/entities/ob-calendar.entity';
import { ObCardType } from '@/database/entities/ob-card-type.entity';
import { ObLevelcardVersion } from '@/database/entities/ob-levelcard-version.entity';
import { ObLevelcardColumn } from '@/database/entities/ob-levelcard-column.entity';
import { ObLevelcardScore } from '@/database/entities/ob-levelcard-score.entity';
import { ObLevelcardLevel } from '@/database/entities/ob-levelcard-level.entity';
import { ObTier } from '@/database/entities/ob-tier.entity';
import { ObArreturndfMinCap } from '@/database/entities/ob-arreturndf-min-cap.entity';
import { AssignmentRunPipelineService } from '@/modules/assignment/services/assignment-run-pipeline.service';

// ---------------------------------------------------------------------------
// 🔴 時區安全：temporal 欄回傳原字面字串（不轉 JS Date、不套本機時區）。
//   1082=date, 1114=timestamp(without tz), 1184=timestamptz, 1083/1266=time。
// ---------------------------------------------------------------------------
const asString = (v: string | null) => v;
pgLib.types.setTypeParser(1082, asString);
pgLib.types.setTypeParser(1114, asString);
pgLib.types.setTypeParser(1184, asString);
pgLib.types.setTypeParser(1083, asString);
pgLib.types.setTypeParser(1266, asString);

// ---------------------------------------------------------------------------
// 設定
// ---------------------------------------------------------------------------
const PG_RUN = process.env.P5C_RUN ?? '07944a82-cc59-4d30-bda5-f9a873cba197';
const YM = process.env.P5C_YM ?? '202607';
const CR_SYSDATE = `${YM.slice(0, 4)}-${YM.slice(4, 6)}-01`; // Stage 1 crSysDate / F102 sysDate
const RUN_ID_MSSQL = 'a5c00000-0000-4000-8000-0000000005c1';
// 預設代表性子集（涵蓋 card HB/SEB/HC/SEC/HM/S5、tier 1~3、CR、4 部門、至多 78 員工）；
// full run 或其他子集以 P5C_LISTS 覆寫（逗號分隔）。
const DEFAULT_LISTS = [
  'OB202607012', // HB  78    4d/4e
  'OB202607013', // SEB 120   4d/4e
  'OB202607010', // HC  1407  5 CR / 17 emp
  'OB202607011', // SEC 1218  6 CR / 17 emp
  'OB202607006', // S5  2369  78 emp
  'OB202607008', // HM  4184  3 tiers / 4 cards / 78 emp
];
const LIST_NOS = (process.env.P5C_LISTS ?? DEFAULT_LISTS.join(','))
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const DIFF_COLS = [
  'score',
  'card_level',
  'tier_level',
  'is_cr',
  'cr_id',
  'cr_nm',
  'dept_id',
  'emplid',
  'emplid_deptid',
  'assignday',
] as const;
type DiffCol = (typeof DIFF_COLS)[number];

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
function log(...a: unknown[]): void {
  // eslint-disable-next-line no-console
  console.log(...a);
}

/** 讀取 MSSQL 表實際欄位。 */
async function mssqlColumns(manager: EntityManager, table: string): Promise<Set<string>> {
  const rows: Array<{ name: string }> = await manager.query(
    `SELECT c.name AS name FROM sys.columns c WHERE c.object_id = OBJECT_ID('dbo.${table}')`,
  );
  return new Set(rows.map((r) => r.name));
}

/** Big5/cp950 位元組數上估（ASCII=1，其餘=2）— MSSQL varchar 於 BIN collation 以位元組計長。 */
function big5ByteLen(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) n += s.charCodeAt(i) < 128 ? 1 : 2;
  return n;
}
/** 將字串截斷至 <= maxBytes（Big5 上估）；回傳 [截斷後字串, 是否截斷]。 */
function truncToBytes(s: string, maxBytes: number): [string, boolean] {
  if (big5ByteLen(s) <= maxBytes) return [s, false];
  let n = 0;
  let out = '';
  for (const ch of s) {
    const w = ch.charCodeAt(0) < 128 ? 1 : 2;
    if (n + w > maxBytes) break;
    n += w;
    out += ch;
  }
  return [out, true];
}
/** char 型欄位之 CHARACTER_MAXIMUM_LENGTH（>0；-1=MAX 不列入）。 */
async function mssqlCharMaxLens(manager: EntityManager, table: string): Promise<Map<string, number>> {
  const rows: Array<{ name: string; len: number }> = await manager.query(
    `SELECT COLUMN_NAME AS name, CHARACTER_MAXIMUM_LENGTH AS len FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME='${table}' AND DATA_TYPE IN ('varchar','char') AND CHARACTER_MAXIMUM_LENGTH > 0`,
  );
  return new Map(rows.map((r) => [r.name, Number(r.len)]));
}

/** identity 欄位（config 表 PK 如 card_version）— 需 SET IDENTITY_INSERT 保留 PG 原值供 join。 */
async function mssqlIdentityCols(manager: EntityManager, table: string): Promise<Set<string>> {
  const rows: Array<{ name: string }> = await manager.query(
    `SELECT c.name AS name FROM sys.columns c
      WHERE c.object_id = OBJECT_ID('dbo.${table}')
        AND COLUMNPROPERTY(c.object_id, c.name, 'IsIdentity') = 1`,
  );
  return new Set(rows.map((r) => r.name));
}

/**
 * 多列 INSERT（@0 位移參數，chunk 使 R*C <= 2000 避開 tedious 2100 上限）。
 * identityInsert=true → 每 chunk 以 SET IDENTITY_INSERT ON/OFF 包夾（同一 batch 同連線；
 * 保留 PG identity 值使 scoring join key 一致）。
 */
async function bulkInsert(
  manager: EntityManager,
  table: string,
  columns: string[],
  rows: Array<Record<string, unknown>>,
  identityInsert = false,
): Promise<number> {
  if (rows.length === 0) return 0;
  const C = columns.length;
  const perChunk = Math.min(50, Math.max(1, Math.floor(2000 / C)));
  const colList = columns.map((c) => `[${c}]`).join(', ');
  const onOff = identityInsert
    ? [`SET IDENTITY_INSERT dbo.[${table}] ON;`, `; SET IDENTITY_INSERT dbo.[${table}] OFF;`]
    : ['', ''];
  let total = 0;
  for (let i = 0; i < rows.length; i += perChunk) {
    const chunk = rows.slice(i, i + perChunk);
    const params: unknown[] = [];
    const tuples: string[] = [];
    for (const r of chunk) {
      const ph: string[] = [];
      for (const c of columns) {
        ph.push(`@${params.length}`);
        let v = r[c];
        if (v === undefined) v = null;
        // jsonb/json/array → 字串（MSSQL 存 nvarchar；pg 回傳已 parse 之物件）。
        if (v !== null && typeof v === 'object' && !(v instanceof Date) && !Buffer.isBuffer(v)) {
          v = JSON.stringify(v);
        }
        params.push(v);
      }
      tuples.push(`(${ph.join(',')})`);
    }
    const sql = `${onOff[0]}INSERT INTO dbo.[${table}] (${colList}) VALUES ${tuples.join(',')}${onOff[1]}`;
    try {
      await manager.query(sql, params);
    } catch (e) {
      // transient tedious cancel/timeout → 重試一次。
      await new Promise((r) => setTimeout(r, 1000));
      await manager.query(sql, params);
    }
    total += chunk.length;
  }
  return total;
}

/** PG 唯讀 SELECT。 */
async function pg<T = Record<string, unknown>>(
  client: PgClient,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const res = await client.query(sql, params);
  return res.rows as unknown as T[];
}

function norm(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return String(v);
  const s = String(v);
  // varchar 尾隨空白正規化（BIN collation 下不 pad，但保守 trim 右側空白避免假差異）。
  return s.replace(/\s+$/, '');
}
function eqCol(col: DiffCol, a: unknown, b: unknown): boolean {
  if (col === 'score') {
    const na = a === null || a === undefined ? null : Number(a);
    const nb = b === null || b === undefined ? null : Number(b);
    return na === nb;
  }
  return norm(a) === norm(b);
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  log('='.repeat(78));
  log('AD-E07-43 P5c MONTHRUN-DIFF — 真實 PG vs MSSQL 逐列比對');
  log(`PG run = ${PG_RUN}  YM = ${YM}  crSysDate = ${CR_SYSDATE}`);
  log(`lists  = ${LIST_NOS.join(', ')}`);
  log(`MSSQL  = ${MSSQL.host}:${MSSQL.port}/${MSSQL.database}  run_id(mssql)=${RUN_ID_MSSQL}`);
  log('='.repeat(78));

  // ---- 連線 ----
  const pgClient: PgClient = new pgLib.Client({
    host: process.env.PGHOST ?? 'localhost',
    port: Number(process.env.PGPORT ?? 5432),
    database: process.env.PGDATABASE ?? 'cdmp_dev',
    user: process.env.PGUSER ?? 'cdmp',
    password: process.env.PGPASSWORD ?? 'cdmp_secret',
  });
  await pgClient.connect();
  // 保險：PG session 唯讀（任何寫入即報錯，證明不污染 dev）。
  await pgClient.query('SET default_transaction_read_only = on');

  const ds = new DataSource({
    type: 'mssql',
    host: MSSQL.host,
    port: MSSQL.port,
    username: MSSQL.username,
    password: MSSQL.password,
    database: MSSQL.database,
    // AD-E07-43 P5h / I-MSSQL-DATE-TZ-01：本 script 自建 DataSource，繞過主應用 forRootAsync，
    //   故須比照 4 個生產連線站點顯式補 useUTC:true——否則 TypeORM SqlServerDriver 仍會覆寫為 false，
    //   ob_calendar.calendar_date 讀回本地午夜 Date → assignday 仍 −1，無法驗證修法。
    options: { encrypt: MSSQL.encrypt, trustServerCertificate: MSSQL.trustServerCertificate, useUTC: true },
    requestTimeout: 300000,
    connectionTimeout: 60000,
    entities: [
      ObPoolData, ObPoolDataList, ObMonthlyRunResult, AssignmentRun, AssignmentRunSnapshot,
      ObListDefinition, ObDeptPct, ObEmplSet, ObEmphire, ObCalendar, ObCardType,
      ObLevelcardVersion, ObLevelcardColumn, ObLevelcardScore, ObLevelcardLevel, ObTier,
      ObArreturndfMinCap,
    ],
    synchronize: false,
    logging: false,
  });
  await ds.initialize();
  const m = ds.manager;

  const listInClause = LIST_NOS.map((_, i) => `$${i + 2}`).join(',');

  try {
    // =====================================================================
    // 1. PG 唯讀擷取
    // =====================================================================
    log('\n[1] PG 唯讀擷取 …');
    const pgOut = await pg(
      pgClient,
      `SELECT list_no, orgno, appl_no, custo_no, settle_src,
              score, card_level, tier_level, is_cr, cr_id, cr_nm,
              dept_id, emplid, emplid_deptid, assignday
         FROM ob_monthly_run_result
        WHERE run_id=$1 AND list_no IN (${listInClause})
        ORDER BY list_no, orgno, appl_no`,
      [PG_RUN, ...LIST_NOS],
    );
    log(`    PG 案件（預期輸出）列數 = ${pgOut.length}`);
    if (pgOut.length === 0) throw new Error('PG run/lists 無資料，請確認 P5C_RUN / P5C_LISTS');

    const listDefs = await pg(
      pgClient,
      `SELECT list_no, card_type, cr_enabled
         FROM ob_list_definition
        WHERE project_workym=$1 AND list_no IN (${listInClause})`,
      [YM, ...LIST_NOS],
    );
    const listMeta = new Map(listDefs.map((l: any) => [l.list_no, l]));

    // 案件集鍵（(orgno,appl_no) 去重）供輸入表擷取。
    const caseKeys = new Set(pgOut.map((r: any) => `${r.orgno}${r.appl_no}`));
    const orgnos = [...new Set(pgOut.map((r: any) => r.orgno))];
    const applNos = [...new Set(pgOut.map((r: any) => r.appl_no))];
    const custoNos = [...new Set(pgOut.map((r: any) => r.custo_no).filter(Boolean))];

    // pool_data（釘選案件集；full row）。
    const poolRows = await pg(
      pgClient,
      `SELECT o.* FROM ob_pool_data o
        WHERE (o.orgno,o.appl_no) IN (
          SELECT DISTINCT r.orgno, r.appl_no FROM ob_monthly_run_result r
           WHERE r.run_id=$1 AND r.list_no IN (${listInClause}))`,
      [PG_RUN, ...LIST_NOS],
    );
    log(`    ob_pool_data 覆蓋 = ${poolRows.length} / 案件 ${caseKeys.size}`);

    const ccRows =
      custoNos.length > 0
        ? await pg(
            pgClient,
            `SELECT * FROM customer_core WHERE source_customer_no = ANY($1)`,
            [custoNos],
          )
        : [];
    const arRows = await pg(
      pgClient,
      `SELECT * FROM ob_arreturndf_min_cap WHERE appl_no = ANY($1)`,
      [applNos],
    );
    const emphireRows = await pg(pgClient, `SELECT * FROM ob_emphire`, []);
    const deptPctRows = await pg(
      pgClient,
      `SELECT * FROM ob_dept_pct WHERE project_workym=$1 AND list_no = ANY($2)`,
      [YM, LIST_NOS],
    );
    const emplSetRows = await pg(
      pgClient,
      `SELECT * FROM ob_empl_set WHERE list_no = ANY($1)`,
      [LIST_NOS],
    );
    const calStart = `${YM.slice(0, 4)}-${YM.slice(4, 6)}-01`;
    const calEnd = `${YM.slice(0, 4)}-${YM.slice(4, 6)}-31`;
    const calRows = await pg(
      pgClient,
      `SELECT * FROM ob_calendar WHERE calendar_date BETWEEN $1 AND $2`,
      [calStart, calEnd],
    );
    const verRows = await pg(pgClient, `SELECT * FROM ob_levelcard_version`, []);
    const colRows = await pg(pgClient, `SELECT * FROM ob_levelcard_column`, []);
    const scoreRows = await pg(pgClient, `SELECT * FROM ob_levelcard_score`, []);
    const levelRows = await pg(pgClient, `SELECT * FROM ob_levelcard_level`, []);
    const tierRows = await pg(pgClient, `SELECT * FROM ob_tier`, []);
    const cardTypeRows = await pg(pgClient, `SELECT * FROM ob_card_type`, []);
    log(
      `    inputs: cc=${ccRows.length} ar=${arRows.length} emphire=${emphireRows.length} ` +
        `deptPct=${deptPctRows.length} emplSet=${emplSetRows.length} cal=${calRows.length} ` +
        `ver=${verRows.length} col=${colRows.length} score=${scoreRows.length} level=${levelRows.length} tier=${tierRows.length}`,
    );

    // =====================================================================
    // 2. 清理 MSSQL 隔離窗（idempotent；本 run 結果 + 所有輸入表列）
    // =====================================================================
    log('\n[2] 清理 MSSQL 隔離窗（前次殘留）…');
    await m.query(`IF OBJECT_ID('dbo._p5c_caseset','U') IS NOT NULL DROP TABLE dbo._p5c_caseset`);
    await m.query(`DELETE FROM ob_monthly_run_result WHERE run_id=@0`, [RUN_ID_MSSQL]);
    await m.query(`DELETE FROM assignment_run_snapshot WHERE run_id=@0`, [RUN_ID_MSSQL]);
    await m.query(`DELETE FROM assignment_run WHERE run_id=@0`, [RUN_ID_MSSQL]);
    for (const t of [
      'ob_pool_data', 'customer_core', 'ob_arreturndf_min_cap', 'ob_emphire',
      'ob_dept_pct', 'ob_empl_set', 'ob_calendar', 'ob_list_definition',
      'ob_levelcard_version', 'ob_levelcard_column', 'ob_levelcard_score',
      'ob_levelcard_level', 'ob_tier', 'ob_card_type',
    ]) {
      await m.query(`DELETE FROM dbo.[${t}]`);
    }

    // =====================================================================
    // 3. seed 輸入 + config + assignment_run
    // =====================================================================
    log('\n[3] Seed MSSQL 輸入 / config …');
    const truncStats: Record<string, number> = {};
    async function copy(table: string, rows: Array<Record<string, unknown>>): Promise<void> {
      if (rows.length === 0) return;
      const cols = await mssqlColumns(m, table);
      const idCols = await mssqlIdentityCols(m, table);
      const charLens = await mssqlCharMaxLens(m, table);
      const use = Object.keys(rows[0]).filter((k) => cols.has(k));
      // varchar byte 溢位截斷（BIN collation：varchar 以位元組計長；中文 2 bytes）。
      // 僅作用於顯示欄（spec_name/cust_name/…；非計分/CR/比例分派輸入）→ 不影響 10 欄比對。
      for (const r of rows) {
        for (const c of use) {
          const v = r[c];
          const maxB = charLens.get(c);
          if (typeof v === 'string' && maxB && big5ByteLen(v) > maxB) {
            const [t, cut] = truncToBytes(v, maxB);
            if (cut) {
              r[c] = t;
              truncStats[`${table}.${c}`] = (truncStats[`${table}.${c}`] ?? 0) + 1;
            }
          }
        }
      }
      const hasIdentity = use.some((c) => idCols.has(c));
      const n = await bulkInsert(m, table, use, rows, hasIdentity);
      log(`    ${table.padEnd(24)} +${n} (${use.length} cols${hasIdentity ? ', IDENTITY_INSERT' : ''})`);
    }
    await m.query(
      `INSERT INTO assignment_run (run_id, project_workym, status, triggered_by, created_at)
       VALUES (@0, @1, 'running', '00000000-0000-0000-0000-000000000001', SYSDATETIME())`,
      [RUN_ID_MSSQL, YM],
    );
    await copy('ob_card_type', cardTypeRows);
    await copy('ob_levelcard_version', verRows);
    await copy('ob_levelcard_column', colRows);
    await copy('ob_levelcard_score', scoreRows);
    await copy('ob_levelcard_level', levelRows);
    await copy('ob_tier', tierRows);
    // ob_list_definition：pipeline 全鏈不讀本表（list meta 以 stage1WrittenLists 記憶體傳入），
    //   且 MSSQL 版有多個 NOT NULL / jsonb 欄；故略過 seed（避免無謂 NOT NULL 失敗）。
    await copy('ob_dept_pct', deptPctRows);
    await copy('ob_empl_set', emplSetRows);
    await copy('ob_calendar', calRows);
    await copy('ob_emphire', emphireRows);
    await copy('ob_pool_data', poolRows);
    await copy('customer_core', ccRows);
    await copy('ob_arreturndf_min_cap', arRows);
    const truncEntries = Object.entries(truncStats);
    if (truncEntries.length > 0) {
      log(`    ⚠️ varchar byte 溢位截斷（顯示欄，非計分輸入 → 不影響 10 欄比對）：`);
      for (const [k, v] of truncEntries) log(`        ${k}: ${v} 列`);
    }

    // =====================================================================
    // 4. 重建 Stage 1 seed 列（釘選 PG 案件集；CR 來源逐字複刻 stage1-sql-executor.ts）
    // =====================================================================
    log('\n[4] 重建 Stage 1 seed（釘選 PG 案件集 + CR 初始 cr_id 依 agent_id→在職 emphire）…');
    await m.query(`CREATE TABLE dbo._p5c_caseset (list_no varchar(100), orgno varchar(2), appl_no varchar(10))`);
    await bulkInsert(
      m,
      '_p5c_caseset',
      ['list_no', 'orgno', 'appl_no'],
      pgOut.map((r: any) => ({ list_no: r.list_no, orgno: r.orgno, appl_no: r.appl_no })),
    );
    // cremp 子查詢去重（agent_ref 唯一化；active emphire 有 1 個重複 id_no，PG 案件集實際 1:1，
    // 取 MIN(emp_id) 決定性；見 impl log）。'CR' + emp_nm 對稱 PG `'CR' || emp_nm`。
    const seedSql = `
      INSERT INTO ob_monthly_run_result
        (run_id, list_no, orgno, appl_no, custo_no, settle_src, cr_id, cr_nm, is_cr,
         appl_date, result_status, created_at, updated_at)
      SELECT @0, cs.list_no, o.orgno, o.appl_no, o.custo_no, o.settle_src,
             cremp.emp_id,
             CASE WHEN cremp.emp_id IS NOT NULL THEN 'CR' + cremp.emp_nm ELSE NULL END,
             'N', o.appl_date, 'PENDING', SYSDATETIME(), SYSDATETIME()
        FROM dbo._p5c_caseset cs
        JOIN ob_pool_data o ON o.orgno = cs.orgno AND o.appl_no = cs.appl_no
        LEFT JOIN (
          SELECT agent_ref, emp_id, emp_nm FROM (
            SELECT LTRIM(RTRIM(id_no)) AS agent_ref, emp_id, emp_nm,
                   ROW_NUMBER() OVER (PARTITION BY LTRIM(RTRIM(id_no)) ORDER BY emp_id) AS rn
              FROM ob_emphire
             WHERE resign_date IS NULL OR resign_date >= CAST(@1 AS DATE)
          ) d WHERE rn = 1
        ) cremp
          ON COALESCE(LTRIM(RTRIM(o.agent_id)), '') <> ''
         AND cremp.agent_ref = LTRIM(RTRIM(o.agent_id))`;
    await m.query(seedSql, [RUN_ID_MSSQL, CR_SYSDATE]);
    const seededCnt = (await m.query(
      `SELECT COUNT(*) c FROM ob_monthly_run_result WHERE run_id=@0`, [RUN_ID_MSSQL]))[0].c;
    log(`    seed 列數 = ${seededCnt}（PG 案件 = ${pgOut.length}）`);
    if (Number(seededCnt) !== pgOut.length) {
      log(`    ⚠️ seed 列數 != PG 案件數（可能案件集/pool 覆蓋落差）— 續跑並於比對段揭露`);
    }
    // seed custo_no vs PG custo_no 一致性（漂移守門）。
    const seedInitCr = (await m.query(
      `SELECT COUNT(*) c FROM ob_monthly_run_result WHERE run_id=@0 AND cr_id IS NOT NULL`,
      [RUN_ID_MSSQL]))[0].c;
    log(`    seed 初始 CR 候選（cr_id IS NOT NULL）= ${seedInitCr}`);

    // =====================================================================
    // 5. datetime2 邊界 probe（appl_date wall-clock round-trip；CR 步驟1 邊界）
    // =====================================================================
    log('\n[5] datetime2 邊界 probe（appl_date 字串載入 round-trip）…');
    const pgBoundary = await pg(
      pgClient,
      `SELECT r.list_no, r.orgno, r.appl_no, to_char(pd.appl_date,'YYYY-MM-DD HH24:MI:SS') AS pg_appl
         FROM ob_monthly_run_result r JOIN ob_pool_data pd ON pd.orgno=r.orgno AND pd.appl_no=r.appl_no
        WHERE r.run_id=$1 AND r.list_no IN (${listInClause}) AND r.cr_id IS NOT NULL
          AND pd.appl_date::date = DATE '${YM.slice(0, 4)}-${(Number(YM.slice(4, 6)) === 12 ? '01' : String(Number(YM.slice(4, 6))).padStart(2, '0'))}-01'
        ORDER BY pd.appl_date LIMIT 8`,
      [PG_RUN, ...LIST_NOS],
    ).catch(() => []);
    // 直接 round-trip 檢查：任取數列 appl_date，MSSQL 讀回字串 vs PG 字面。
    const rtSample = await m.query(
      `SELECT TOP 6 orgno, appl_no, CONVERT(varchar(19), appl_date, 120) AS ms_appl
         FROM ob_monthly_run_result WHERE run_id=@0 AND appl_date IS NOT NULL ORDER BY appl_date`,
      [RUN_ID_MSSQL],
    );
    const pgSample = await pg(
      pgClient,
      `SELECT r.orgno, r.appl_no, to_char(pd.appl_date,'YYYY-MM-DD"T"HH24:MI:SS') AS pg_appl
         FROM ob_monthly_run_result r JOIN ob_pool_data pd ON pd.orgno=r.orgno AND pd.appl_no=r.appl_no
        WHERE r.run_id=$1 AND r.list_no IN (${listInClause})`,
      [PG_RUN, ...LIST_NOS],
    );
    const pgApplByKey = new Map(pgSample.map((r: any) => [`${r.orgno}${r.appl_no}`, r.pg_appl]));
    let rtMismatch = 0;
    for (const r of rtSample as any[]) {
      const k = `${r.orgno}${r.appl_no}`;
      const pgv = pgApplByKey.get(k);
      const msv = String(r.ms_appl).replace(' ', 'T');
      const ok = pgv === msv;
      if (!ok) rtMismatch++;
      log(`    appl_date round-trip ${k}: PG=${pgv} MSSQL=${msv} ${ok ? 'OK' : '❌MISMATCH'}`);
    }
    log(`    round-trip 樣本不符 = ${rtMismatch}（0 = datetime2 wall-clock 忠實保存）`);
    log(`    CR 步驟1 邊界日（${CR_SYSDATE} −2yr）CR 候選案件數 = ${pgBoundary.length}（如 >0 為 datetime2 敏感邊界）`);

    // =====================================================================
    // 6. 跑真實 MSSQL Stage 2~4/CR 全鏈（executeStage2to3PushdownMssql）
    // =====================================================================
    log('\n[6] 執行 executeStage2to3PushdownMssql（P3b 計分 + clear + P3d CR + P3c 比例分派）…');
    const svc = Object.create(AssignmentRunPipelineService.prototype) as any;
    svc.columnRepo = ds.getRepository(ObLevelcardColumn);
    svc.scoreRepo = ds.getRepository(ObLevelcardScore);
    svc.versionRepo = ds.getRepository(ObLevelcardVersion);
    svc.deptPctRepo = ds.getRepository(ObDeptPct);
    svc.emplSetRepo = ds.getRepository(ObEmplSet);
    svc.calendarRepo = ds.getRepository(ObCalendar);
    svc.resultRepo = ds.getRepository(ObMonthlyRunResult);
    svc.dataSource = ds;
    svc.rationWarnings = [];
    Object.defineProperty(svc, 'logger', {
      value: { warn: () => {}, log: () => {}, error: (...a: unknown[]) => log('  [svc.error]', ...a), debug: () => {} },
      configurable: true,
    });
    const stage1WrittenLists = LIST_NOS.map((ln) => ({
      list: {
        list_no: ln,
        card_type: (listMeta.get(ln) as any)?.card_type ?? null,
        cr_enabled: !!(listMeta.get(ln) as any)?.cr_enabled,
      },
      inserted: pgOut.filter((r: any) => r.list_no === ln).length,
    }));
    const t0 = Date.now();
    await svc.executeStage2to3PushdownMssql(stage1WrittenLists, YM, RUN_ID_MSSQL);
    log(`    完成（${((Date.now() - t0) / 1000).toFixed(1)}s）；ration warnings = ${svc.rationWarnings.length}`);

    // =====================================================================
    // 7. 逐列比對 MSSQL vs PG（10 欄）
    // =====================================================================
    log('\n[7] 逐列比對（10 欄）…');
    const msOut = await m.query(
      `SELECT list_no, orgno, appl_no, custo_no, ${DIFF_COLS.join(', ')}
         FROM ob_monthly_run_result WHERE run_id=@0`,
      [RUN_ID_MSSQL],
    );
    const key = (r: any) => `${r.list_no}${r.orgno}${r.appl_no}`;
    const msByKey = new Map((msOut as any[]).map((r) => [key(r), r]));
    const pgByKey = new Map(pgOut.map((r: any) => [key(r), r]));

    // 案件集一致性
    const onlyPg = [...pgByKey.keys()].filter((k) => !msByKey.has(k));
    const onlyMs = [...msByKey.keys()].filter((k) => !pgByKey.has(k));
    log(`    案件集：PG=${pgByKey.size} MSSQL=${msByKey.size} onlyPG=${onlyPg.length} onlyMSSQL=${onlyMs.length}`);

    const colDiffs: Record<DiffCol, number> = Object.fromEntries(DIFF_COLS.map((c) => [c, 0])) as any;
    let custoDiffs = 0;
    const otherSamples: string[] = [];
    const assigndaySamples: string[] = [];
    const scoreDiffKeys: string[] = [];
    let rowsWithDiff = 0;
    for (const [k, pr] of pgByKey) {
      const mr = msByKey.get(k);
      if (!mr) continue;
      if (norm(pr.custo_no) !== norm(mr.custo_no)) custoDiffs++;
      let rowDiff = false;
      for (const c of DIFF_COLS) {
        if (!eqCol(c, (pr as any)[c], mr[c])) {
          colDiffs[c]++;
          rowDiff = true;
          if (c === 'score') scoreDiffKeys.push(k);
          const line = `${k} | ${c} | PG=${JSON.stringify((pr as any)[c] ?? null)} MSSQL=${JSON.stringify(mr[c] ?? null)}`;
          if (c === 'assignday') { if (assigndaySamples.length < 8) assigndaySamples.push(line); }
          else if (otherSamples.length < 80) otherSamples.push(line);
        }
      }
      if (rowDiff) rowsWithDiff++;
    }
    const totalDiffCells = DIFF_COLS.reduce((s, c) => s + colDiffs[c], 0);
    log('\n    ── 逐欄差異數（0 = 完全一致）──');
    for (const c of DIFF_COLS) {
      const n = colDiffs[c];
      const rate = ((1 - n / pgByKey.size) * 100).toFixed(3);
      log(`      ${c.padEnd(14)} diffs=${String(n).padStart(6)}  一致率=${rate}%`);
    }
    log(`      custo_no(key)  diffs=${String(custoDiffs).padStart(6)}（漂移守門）`);
    log(`    差異列 = ${rowsWithDiff} / ${pgByKey.size}；差異格 = ${totalDiffCells}`);
    if (otherSamples.length > 0) {
      log('\n    ── 非 assignday 差異樣本 ──');
      for (const s of otherSamples) log('      ' + s);
    }
    if (assigndaySamples.length > 0) {
      log('\n    ── assignday 差異樣本（前 8；全部為 −1 日）──');
      for (const s of assigndaySamples) log('      ' + s);
    }

    // score 差異三分類：AGE 今日參考日漂移（run→今日跨生日）vs 引擎不符。
    if (scoreDiffKeys.length > 0) {
      log('\n    ── score 差異根因分類 ──');
      const runDate = await pg(
        pgClient,
        `SELECT to_char(created_at,'YYYY-MM-DD') AS d FROM assignment_run WHERE run_id=$1`,
        [PG_RUN],
      ).then((r) => (r[0] as any)?.d ?? '?');
      const todayD = new Date();
      const todayYmd = `${todayD.getFullYear()}-${String(todayD.getMonth() + 1).padStart(2, '0')}-${String(todayD.getDate()).padStart(2, '0')}`;
      for (const k of scoreDiffKeys) {
        const pr: any = pgByKey.get(k);
        const custo = pr.custo_no;
        const ccInfo = custo
          ? await pg(
              pgClient,
              `SELECT to_char(date_of_birth,'MM-DD') AS mmdd, to_char(date_of_birth,'YYYY-MM-DD') AS dob FROM customer_core WHERE source_customer_no=$1`,
              [custo],
            )
          : [];
        const mmdd = (ccInfo[0] as any)?.mmdd ?? null;
        const dob = (ccInfo[0] as any)?.dob ?? null;
        // 生日落在 (run_date, today] 之月日窗 → AGE 今日參考日漂移。
        const inWindow =
          mmdd != null && mmdd > runDate.slice(5) && mmdd <= todayYmd.slice(5);
        const cat = inWindow ? 'AGE 今日參考日漂移（run→今日跨生日，非引擎不符）' : '待查（可能 customer_core 漂移或引擎）';
        log(`      ${k} custo=${custo} dob=${dob} PG=${pr.score} MSSQL=${msByKey.get(k)?.score} | run=${runDate} today=${todayYmd} → ${cat}`);
      }
    }

    // =====================================================================
    // 8. 分佈檢核（tier / card / dept / CR%）— 業務可讀輔助
    // =====================================================================
    log('\n[8] 分佈檢核（PG vs MSSQL；輔助，非核心判定）…');
    function dist(rows: any[], col: string): Map<string, number> {
      const map = new Map<string, number>();
      for (const r of rows) {
        const v = norm(r[col]) ?? '(null)';
        map.set(v, (map.get(v) ?? 0) + 1);
      }
      return map;
    }
    function printDist(label: string, col: string): void {
      const pgd = dist(pgOut as any[], col);
      const msd = dist(msOut as any[], col);
      const keys = [...new Set([...pgd.keys(), ...msd.keys()])].sort();
      log(`    ${label}:`);
      for (const kk of keys) {
        const p = pgd.get(kk) ?? 0;
        const s = msd.get(kk) ?? 0;
        const pp = ((p / pgOut.length) * 100).toFixed(1);
        const sp = ((s / (msOut as any[]).length) * 100).toFixed(1);
        log(`      ${kk.padEnd(8)} PG=${String(p).padStart(6)}(${pp}%)  MSSQL=${String(s).padStart(6)}(${sp}%) ${p === s ? '' : '≠'}`);
      }
    }
    printDist('tier_level', 'tier_level');
    printDist('card_level', 'card_level');
    printDist('dept_id', 'dept_id');
    const pgCr = (pgOut as any[]).filter((r) => norm(r.is_cr) === 'Y').length;
    const msCr = (msOut as any[]).filter((r) => norm(r.is_cr) === 'Y').length;
    log(`    is_cr='Y'：PG=${pgCr}  MSSQL=${msCr} ${pgCr === msCr ? '' : '≠'}`);

    // =====================================================================
    // 9. 結論
    // =====================================================================
    log('\n' + '='.repeat(78));
    if (onlyPg.length === 0 && onlyMs.length === 0 && totalDiffCells === 0) {
      log('✅ 0-diff：MSSQL 全鏈輸出與真實 PG run 逐列 10 欄完全一致（案件集亦相同）。');
    } else {
      log(`⚠️ 非 0-diff：案件集 onlyPG=${onlyPg.length}/onlyMSSQL=${onlyMs.length}；差異格=${totalDiffCells}（見上樣本 + 逐欄）。`);
    }
    log('='.repeat(78));

    // 清理隔離窗（還原空 baseline；保留 assignment_run/result 供人工複查前先移除輸入避免污染 CI）。
    if (process.env.P5C_KEEP !== '1') {
      log('\n[cleanup] 移除隔離窗資料（P5C_KEEP=1 可保留）…');
      await m.query(`IF OBJECT_ID('dbo._p5c_caseset','U') IS NOT NULL DROP TABLE dbo._p5c_caseset`);
      await m.query(`DELETE FROM ob_monthly_run_result WHERE run_id=@0`, [RUN_ID_MSSQL]);
      await m.query(`DELETE FROM assignment_run_snapshot WHERE run_id=@0`, [RUN_ID_MSSQL]);
      await m.query(`DELETE FROM assignment_run WHERE run_id=@0`, [RUN_ID_MSSQL]);
      for (const t of [
        'ob_pool_data', 'customer_core', 'ob_arreturndf_min_cap', 'ob_emphire',
        'ob_dept_pct', 'ob_empl_set', 'ob_calendar', 'ob_list_definition',
        'ob_levelcard_version', 'ob_levelcard_column', 'ob_levelcard_score',
        'ob_levelcard_level', 'ob_tier', 'ob_card_type',
      ]) {
        await m.query(`DELETE FROM dbo.[${t}]`);
      }
    }
  } finally {
    await pgClient.end();
    await ds.destroy();
    restoreDbType();
  }
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error('未預期錯誤：', e);
  process.exitCode = 1;
});
