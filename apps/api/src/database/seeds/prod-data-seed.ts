/**
 * 生產初始化資料 Seed（冪等）
 *
 * 對 E07 計分卡相關 6 表執行「加法式 reconcile」的安全初始化（B2 硬化）：
 *   ob_card_type, ob_levelcard_version, ob_levelcard_column,
 *   ob_levelcard_score, ob_levelcard_level, ob_tier
 *
 * 並 upsert 5 個 E07 ETL pipelines 至 etl_pipelines + etl_pipeline_versions：
 *   E07-OBEMPHIRE-Load, E07-OBCALENDAR-Load,
 *   E07-OBARRETURNDF_MIN_CAP-Load, E07-OBPOOLDATA-Load, ETL for Customer Core
 *
 * 來源資料：apps/api/src/database/seeds/data/*.json
 *   （計分卡資料從 reference/DumpData/*.csv 2026-05-05 dump 預先生成；
 *    pipelines 從 dev DB 2026-05-21 dump 後手 commit）
 *
 * 安全機制（B2：取代舊「非空就整批 SKIP」）：
 *   - 加法式 reconcile（reconcileTable）：逐 seed row 用自然鍵判存在，只 INSERT
 *     「seed 有、DB 沒有」的缺 row。空表→全插（行為同舊版）；非空表→只補缺、
 *     完全不碰既有 row（不洗業務 UI 改動）、冪等（再跑插 0）。自然鍵可空欄位用
 *     IS NOT DISTINCT FROM 對 NULL 安全；表無 unique 約束 → WHERE 手動判（容忍重複列）。
 *   - 漂移偵測（WARN-only）：自然鍵存在但值欄與 seed 不同 → console.warn，預設不改。
 *   - opt-in repair：SEED_REPAIR_DRIFT=true 時把偵測到的漂移欄 UPDATE 回 seed 值。
 *   - ob_levelcard_column 特例：用 UPDATE WHERE column_label IS NULL 補中文標籤
 *     （不洗現有 column_label）；新 INSERT 的 column 之 match_type 僅對「新列」依
 *     score 重新推導（不洗既有業務 match_type）。
 *   - etl_pipelines / extraction_tasks 以 name 為 idempotency key，per-row 存在即 SKIP，
 *     不洗 production 使用者手動編輯過的版本（非本輪 B2 範圍，維持原 per-row 行為）。
 *
 * 用法：
 *   docker compose --profile data-seed up data-seed
 *   或 local：npm run data-seed
 *   修回漂移：SEED_REPAIR_DRIFT=true docker compose --profile data-seed up data-seed
 */

import { DataSource, QueryRunner } from 'typeorm';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface CardType {
  card_type: string;
  card_name: string;
  prod_kind: string;
  status: string;
}
interface LevelcardVersion {
  card_type: string;
  card_name: string;
  card_version: number;
  sdate: string | null;
  edate: string | null;
  status: string;
}
interface LevelcardColumn {
  card_type: string;
  card_version: number;
  column_name: string;
  column_label: string | null;
  status: string;
}
interface LevelcardScore {
  card_type: string;
  card_version: number;
  column_name: string;
  level1: string | null;
  level2_s: string | null;
  level2_e: string | null;
  score: number;
}
interface LevelcardLevel {
  card_type: string;
  card_version: number;
  score_s: number;
  score_e: number;
  card_level: string;
}
interface Tier {
  list_nm: string | null;
  card_type: string;
  card_level: string | null;
  tier_level: string;
}

interface EtlPipelineSeed {
  name: string;
  description: string | null;
  version: number;
  step_count: number;
  status: string;
  schedule: string | null;
  enabled: boolean;
  version_status: string;
  definition: { nodes: unknown[]; edges: unknown[] };
}

/**
 * F090 reproducible-seed：E07 擷取任務 seed 來源（data/extraction-tasks.json）。
 * id 為固定 UUID（與 dev DB API seed-e07-etl.mjs 建立者相同），確保 raw_table_name
 * 衍生值（'raw_' + id 前 8 hex）與 etl-pipelines.json 寫死的 raw_xxx 等價，
 * pipeline 才能於執行期 resolveRawTable fallback 命中正確 raw 表。
 */
export interface ExtractionTaskSeed {
  id: string;
  name: string;
  datasourceName: string;
  mode: 'full' | 'incremental';
  sourceSchema: string | null;
  sourceTable: string;
  rawTableName: string;
  schedule: string;
  description?: string;
  sourceFilter?: {
    column: string;
    operator: string;
    valueExpr: string;
    _comment?: string;
  };
}

/**
 * 由 extraction_task id 衍生 raw_table_name，與 extraction-task.service.createTask 完全一致：
 *   'raw_' + id.replace(/-/g, '').substring(0, 8)
 * extraction-tasks.json 預存 rawTableName，本函式用於測試/驗證一致性。
 */
export function deriveRawTableName(id: string): string {
  return 'raw_' + id.replace(/-/g, '').substring(0, 8);
}

/**
 * etl_pipelines.created_by 必填 FK 至 users。本 seed 採以下順序解析 user id：
 *   1) env ETL_SEED_USER_EMAIL（顯式指定；prod 部署時建議帶）
 *   2) dev seed 固定 admin UUID（admin@cdmp.test，僅 dev env 由 seed.ts 寫入）
 *   3) DB 中任一 role='admin' AND status='active' 的最早建立者
 * 全部找不到 → fail-fast，要求 ops 先建 admin 帳號。
 */
const DEV_ADMIN_UUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

async function resolveSeedUserId(qr: QueryRunner): Promise<string> {
  const envEmail = process.env.ETL_SEED_USER_EMAIL?.trim();
  if (envEmail) {
    const r = await qr.query(`SELECT id FROM users WHERE email = $1 LIMIT 1`, [envEmail]);
    if (r[0]?.id) return r[0].id;
    throw new Error(
      `etl_pipelines seed 中止：ETL_SEED_USER_EMAIL='${envEmail}' 對應 user 不存在。`,
    );
  }
  const devCheck = await qr.query(`SELECT id FROM users WHERE id = $1`, [DEV_ADMIN_UUID]);
  if (devCheck[0]?.id) return DEV_ADMIN_UUID;
  const fallback = await qr.query(
    `SELECT id FROM users WHERE role='admin' AND status='active' ORDER BY created_at ASC LIMIT 1`,
  );
  if (fallback[0]?.id) return fallback[0].id;
  throw new Error(
    `etl_pipelines seed 中止：找不到可用 admin user。請先建立 admin 帳號，` +
      `或設定環境變數 ETL_SEED_USER_EMAIL 指向實際 admin email。`,
  );
}

function dataPath(file: string): string {
  // dist 編譯後位於 apps/api/dist/database/seeds/，ts-node 直接執行位於 src/...
  // 兩者皆透過 __dirname / ./data 解析
  return resolve(__dirname, 'data', file);
}

function loadJson<T>(file: string): T[] {
  const raw = readFileSync(dataPath(file), 'utf-8');
  return JSON.parse(raw) as T[];
}

// ===========================================================================
// B2：加法式 reconcile loader（取代「非空就整批 SKIP」）
// ---------------------------------------------------------------------------
// 三層機制（六張計分卡表共用）：
//   ① 加法式 reconcile：逐 seed row 用自然鍵判存在，只 INSERT「seed 有、DB 沒有」
//      的 row。空表→全插；非空表→只補缺、完全不碰既有 row、冪等（再跑插 0）。
//      自然鍵可空欄位用 IS NOT DISTINCT FROM 對 NULL 安全；表無 unique 約束
//      （只有 surrogate id PK）→ 用 WHERE NOT EXISTS 手動判（容忍重複列不報錯）。
//   ② 漂移偵測（WARN-only）：自然鍵存在但值欄與 seed 不同 → console.warn 列出
//      「表 / 自然鍵 / 欄 / seed 值 vs DB 值」，預設不改（保留業務 UI 改動）。
//   ③ opt-in repair：SEED_REPAIR_DRIFT === 'true' 時把②偵測到的漂移欄 UPDATE 回
//      seed 值（並 log 已修 N 筆）。
//
// 紅線：絕不預設覆寫既有 row；空表全插行為不可退化。
// ===========================================================================

/**
 * 是否啟用漂移修復（每次呼叫時讀 env，使測試可逐案 toggle SEED_REPAIR_DRIFT）。
 * 預設（未設 / 非 'true'）僅 WARN 不改。
 */
function repairDriftEnabled(): boolean {
  return process.env.SEED_REPAIR_DRIFT === 'true';
}

/**
 * reconcile 表描述子：
 *   - table：實體表名
 *   - keyColumns：自然鍵欄位（依序），用於存在性判斷與漂移定位
 *   - valueColumns：「值欄」，存在時偵測漂移（不含自然鍵）
 *   - extraInsertColumns：INSERT 時除 key+value 外尚需帶的固定欄位（如 created_at=NOW()）
 *   - mapRow：把 seed JSON row 轉成 { [column]: value } 的扁平物件（涵蓋 key+value 欄）
 */
interface ReconcileSpec<T> {
  table: string;
  keyColumns: string[];
  valueColumns: string[];
  mapRow: (r: T) => Record<string, unknown>;
  /** INSERT 額外欄位（key+value 之外），value 為 SQL 片段（如 'NOW()'）或 bind 值。 */
  extraInsert?: Record<string, { sql: string } | { value: unknown }>;
  /** 顯示用後綴（log）。 */
  logSuffix?: string;
  /** 每筆新 INSERT 後回呼（傳入 mapped row），供呼叫端蒐集新列自然鍵（如 match_type derive 範圍）。 */
  onInserted?: (mapped: Record<string, unknown>) => void;
}

/** 以自然鍵尋找既有列（NULL-safe：可空鍵欄用 IS NOT DISTINCT FROM）。回傳所有 match 列（容忍重複）。 */
async function findByKey<T>(
  qr: QueryRunner,
  spec: ReconcileSpec<T>,
  mapped: Record<string, unknown>,
): Promise<Record<string, unknown>[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  for (const col of spec.keyColumns) {
    params.push(mapped[col]);
    // IS NOT DISTINCT FROM：NULL = NULL 視為相等（自然鍵可空欄位 NULL-safe）
    where.push(`${col} IS NOT DISTINCT FROM $${params.length}`);
  }
  const selectCols = [...spec.keyColumns, ...spec.valueColumns].join(', ');
  return qr.query(
    `SELECT ${selectCols} FROM ${spec.table} WHERE ${where.join(' AND ')}`,
    params,
  );
}

/** 把自然鍵組成可讀字串供 log。 */
function keyDesc<T>(
  spec: ReconcileSpec<T>,
  mapped: Record<string, unknown>,
): string {
  return spec.keyColumns
    .map((c) => `${c}=${JSON.stringify(mapped[c])}`)
    .join(', ');
}

/**
 * 加法式 reconcile + 漂移偵測 + opt-in repair（六表共用核心）。
 * 回傳統計：inserted / driftDetected / repaired。
 */
async function reconcileTable<T>(
  qr: QueryRunner,
  rows: T[],
  spec: ReconcileSpec<T>,
): Promise<{ inserted: number; driftDetected: number; repaired: number }> {
  const repair = repairDriftEnabled();
  let inserted = 0;
  let driftDetected = 0;
  let repaired = 0;

  for (const raw of rows) {
    const mapped = spec.mapRow(raw);
    const existing = await findByKey(qr, spec, mapped);

    if (existing.length === 0) {
      // ① 缺 row → INSERT
      const cols: string[] = [];
      const valueSql: string[] = [];
      const params: unknown[] = [];
      const addBind = (col: string, val: unknown) => {
        cols.push(col);
        params.push(val);
        valueSql.push(`$${params.length}`);
      };
      for (const col of [...spec.keyColumns, ...spec.valueColumns]) {
        addBind(col, mapped[col]);
      }
      for (const [col, def] of Object.entries(spec.extraInsert ?? {})) {
        if ('sql' in def) {
          cols.push(col);
          valueSql.push(def.sql);
        } else {
          addBind(col, def.value);
        }
      }
      await qr.query(
        `INSERT INTO ${spec.table} (${cols.join(', ')}) VALUES (${valueSql.join(', ')})`,
        params,
      );
      inserted++;
      spec.onInserted?.(mapped);
      continue;
    }

    // ②③ 既有 row：偵測值欄漂移（以第一筆 match 為基準；重複列容忍）
    const dbRow = existing[0];
    const driftedCols: string[] = [];
    for (const vcol of spec.valueColumns) {
      const seedVal = mapped[vcol];
      const dbVal = dbRow[vcol];
      if (!valueEquals(seedVal, dbVal)) {
        driftedCols.push(vcol);
        driftDetected++;
        console.warn(
          `  [漂移] ${spec.table}（${keyDesc(spec, mapped)}）欄 ${vcol}：` +
            `seed=${JSON.stringify(seedVal)} vs DB=${JSON.stringify(dbVal)}` +
            (repair ? '（將修回 seed 值）' : '（未修）'),
        );
      }
    }

    if (repair && driftedCols.length > 0) {
      const setSql: string[] = [];
      const params: unknown[] = [];
      for (const col of driftedCols) {
        params.push(mapped[col]);
        setSql.push(`${col} = $${params.length}`);
      }
      const where: string[] = [];
      for (const col of spec.keyColumns) {
        params.push(mapped[col]);
        where.push(`${col} IS NOT DISTINCT FROM $${params.length}`);
      }
      await qr.query(
        `UPDATE ${spec.table} SET ${setSql.join(', ')} WHERE ${where.join(' AND ')}`,
        params,
      );
      repaired += driftedCols.length;
    }
  }

  const suffix = spec.logSuffix ? `（${spec.logSuffix}）` : '';
  let line = `  ${spec.table}: INSERT ${inserted} 缺列${suffix}`;
  if (driftDetected > 0) {
    line += repair
      ? `；偵測 ${driftDetected} 筆值漂移（已修 ${repaired} 筆）`
      : `；偵測 ${driftDetected} 筆值漂移（未修，設 SEED_REPAIR_DRIFT=true 可修回）`;
  }
  console.log(line);
  return { inserted, driftDetected, repaired };
}

/** 值相等判斷：NULL-safe + 型別寬鬆（DB 數值欄可能回 string，seed 為 number）。 */
function valueEquals(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || a === undefined) return b === null || b === undefined;
  if (b === null || b === undefined) return false;
  // 數值欄：PG numeric/integer 經 driver 可能回 string，與 seed number 比較需正規化。
  if (typeof a === 'number' || typeof b === 'number') {
    const na = Number(a);
    const nb = Number(b);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na === nb;
  }
  return String(a) === String(b);
}

export async function seedCardTypes(qr: QueryRunner): Promise<void> {
  const rows = loadJson<CardType>('ob-card-type.json');
  await reconcileTable<CardType>(qr, rows, {
    table: 'ob_card_type',
    keyColumns: ['card_type'],
    valueColumns: ['card_name', 'prod_kind', 'status'],
    mapRow: (r) => ({
      card_type: r.card_type,
      card_name: r.card_name,
      prod_kind: r.prod_kind,
      status: r.status,
    }),
    extraInsert: {
      created_at: { sql: 'NOW()' },
      created_by: { value: 'PROD_SEED' },
      updated_at: { sql: 'NOW()' },
      updated_by: { value: 'PROD_SEED' },
    },
  });
}

export async function seedVersions(qr: QueryRunner): Promise<void> {
  const rows = loadJson<LevelcardVersion>('ob-levelcard-version.json');
  await reconcileTable<LevelcardVersion>(qr, rows, {
    table: 'ob_levelcard_version',
    keyColumns: ['card_type', 'card_version'],
    valueColumns: ['card_name', 'sdate', 'edate', 'status'],
    mapRow: (r) => ({
      card_type: r.card_type,
      card_version: r.card_version,
      card_name: r.card_name,
      sdate: r.sdate,
      edate: r.edate,
      status: r.status,
    }),
    extraInsert: {
      created_at: { sql: 'NOW()' },
      updated_at: { sql: 'NOW()' },
    },
  });
}

export interface ColumnKey {
  card_type: string;
  card_version: number;
  column_name: string;
}

export async function seedColumns(
  qr: QueryRunner,
): Promise<{ insertedKeys: ColumnKey[] }> {
  const rows = loadJson<LevelcardColumn>('ob-levelcard-column.json');
  // 漂移偵測「值欄」=status（依設計）。新 INSERT 的 column 以 'RANGE' 佔位 match_type，
  // 之後由 deriveMatchType 僅對「新補的列」依 score 推導正確值（不洗既有業務 match_type）。
  const insertedKeys: ColumnKey[] = [];
  await reconcileTable<LevelcardColumn>(qr, rows, {
    table: 'ob_levelcard_column',
    keyColumns: ['card_type', 'card_version', 'column_name'],
    valueColumns: ['status'],
    mapRow: (r) => ({
      card_type: r.card_type,
      card_version: r.card_version,
      column_name: r.column_name,
      status: r.status,
    }),
    extraInsert: {
      // column_label / match_type 不納入漂移偵測（業務可調），INSERT 時帶 seed/佔位值。
      column_label: { value: null }, // 由下方統一補（避免新列 label 漂移誤判）
      match_type: { value: 'RANGE' },
      created_at: { sql: 'NOW()' },
      updated_at: { sql: 'NOW()' },
    },
    onInserted: (mapped) =>
      insertedKeys.push({
        card_type: mapped.card_type as string,
        card_version: mapped.card_version as number,
        column_name: mapped.column_name as string,
      }),
  });

  // 既有「補 column_label IS NULL」邏輯保留：補中文標籤，不洗業務調整過的非 NULL 值。
  // 同時涵蓋本次新 INSERT 的列（其 column_label 先以 NULL 佔位）。
  let labelUpdated = 0;
  for (const r of rows) {
    if (r.column_label === null) continue;
    const res = await qr.query(
      `UPDATE ob_levelcard_column
          SET column_label = $1, updated_at = NOW()
        WHERE card_type = $2 AND card_version = $3 AND column_name = $4
          AND column_label IS NULL`,
      [r.column_label, r.card_type, r.card_version, r.column_name],
    );
    labelUpdated += res[1] ?? 0;
  }
  if (labelUpdated > 0) {
    console.log(`  ob_levelcard_column: 補 column_label ${labelUpdated} 列`);
  }
  return { insertedKeys };
}

export async function seedScores(qr: QueryRunner): Promise<void> {
  const rows = loadJson<LevelcardScore>('ob-levelcard-score.json');
  await reconcileTable<LevelcardScore>(qr, rows, {
    table: 'ob_levelcard_score',
    keyColumns: [
      'card_type',
      'card_version',
      'column_name',
      'level1',
      'level2_s',
      'level2_e',
    ],
    valueColumns: ['score'],
    mapRow: (r) => ({
      card_type: r.card_type,
      card_version: r.card_version,
      column_name: r.column_name,
      level1: r.level1,
      level2_s: r.level2_s,
      level2_e: r.level2_e,
      score: r.score,
    }),
    extraInsert: {
      created_at: { sql: 'NOW()' },
      updated_at: { sql: 'NOW()' },
    },
  });
}

export async function seedLevels(qr: QueryRunner): Promise<void> {
  const rows = loadJson<LevelcardLevel>('ob-levelcard-level.json');
  await reconcileTable<LevelcardLevel>(qr, rows, {
    table: 'ob_levelcard_level',
    keyColumns: ['card_type', 'card_version', 'score_s', 'score_e', 'card_level'],
    // 設計指定值欄＝card_level，但其已全部納入自然鍵（score_s/e + card_level），
    // 故自然鍵相等即整列相等 → 不可能漂移。valueColumns 留空避免 SELECT 欄重複。
    valueColumns: [],
    mapRow: (r) => ({
      card_type: r.card_type,
      card_version: r.card_version,
      score_s: r.score_s,
      score_e: r.score_e,
      card_level: r.card_level,
    }),
    extraInsert: {
      created_at: { sql: 'NOW()' },
      updated_at: { sql: 'NOW()' },
    },
  });
}

export async function seedTiers(qr: QueryRunner): Promise<void> {
  const rows = loadJson<Tier>('ob-tier.json');
  await reconcileTable<Tier>(qr, rows, {
    table: 'ob_tier',
    keyColumns: ['list_nm', 'card_type', 'card_level'],
    valueColumns: ['tier_level'],
    mapRow: (r) => ({
      list_nm: r.list_nm,
      card_type: r.card_type,
      card_level: r.card_level,
      tier_level: r.tier_level,
    }),
    logSuffix: 'OBTIER 正規化後',
  });
}

async function seedEtlPipelines(qr: QueryRunner): Promise<void> {
  const rows = loadJson<EtlPipelineSeed>('etl-pipelines.json');
  // 先檢查是否有任何 pipeline 需要 INSERT（避免無需 admin 也觸發 user lookup）
  let needInsert = false;
  for (const p of rows) {
    const exists = await qr.query(
      `SELECT 1 FROM etl_pipelines WHERE name = $1 AND deleted_at IS NULL LIMIT 1`,
      [p.name],
    );
    if (exists.length === 0) {
      needInsert = true;
      break;
    }
  }
  let userId: string | null = null;
  if (needInsert) {
    userId = await resolveSeedUserId(qr);
    console.log(`  etl_pipelines: 使用 user ${userId} 作為 created_by`);
  }
  let inserted = 0;
  let skipped = 0;
  for (const p of rows) {
    const existing = await qr.query(
      `SELECT id FROM etl_pipelines WHERE name = $1 AND deleted_at IS NULL LIMIT 1`,
      [p.name],
    );
    if (existing.length > 0) {
      skipped++;
      console.log(`    ${p.name}: SKIP（已存在）`);
      continue;
    }
    const inserted_pipeline = await qr.query(
      `INSERT INTO etl_pipelines (name, description, version, step_count, status, schedule, enabled, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
       RETURNING id`,
      [p.name, p.description, p.version, p.step_count, p.status, p.schedule, p.enabled, userId],
    );
    const pipelineId = inserted_pipeline[0].id;
    await qr.query(
      `INSERT INTO etl_pipeline_versions (pipeline_id, version, definition, status, change_summary, created_by, created_at)
       VALUES ($1, $2, $3::text, $4, $5, $6, NOW())`,
      [
        pipelineId,
        p.version,
        JSON.stringify(p.definition),
        p.version_status,
        'seeded by prod-data-seed',
        userId,
      ],
    );
    inserted++;
    console.log(`    ${p.name}: INSERT（${p.step_count} 節點）`);
  }
  console.log(`  etl_pipelines: ${inserted} 新增 / ${skipped} 已存在`);
}

/**
 * F090 reproducible-seed：seed 全部 5 個 E07 extraction_tasks（冪等 by name）。
 *
 * mirror seedEtlPipelines 的安全機制：
 *   - 以 name 為 idempotency key，存在（deleted_at IS NULL）即 SKIP，不洗 production
 *   - 只在有任何 task 需 INSERT 時才解析 datasource_id / created_by（避免無謂 lookup）
 *   - datasource_id 以 name 'APYHFC16.OB' 動態解析（prod datasource UUID 可能與 dev 不同）；
 *     找不到 → fail-fast（避免建立懸空 FK 的 extraction_task）
 *   - created_by 沿用 resolveSeedUserId（同 etl_pipelines seed）
 *   - id 為固定 UUID（取自 extraction-tasks.json）以使 raw_table_name 與 pipeline 寫死值等價
 */
export async function seedExtractionTasks(qr: QueryRunner): Promise<void> {
  const rows = loadJson<ExtractionTaskSeed>('extraction-tasks.json');

  // 先檢查是否有任何 task 需 INSERT（避免無需 datasource/user 也觸發 lookup）
  let needInsert = false;
  for (const t of rows) {
    const exists = await qr.query(
      `SELECT id FROM extraction_tasks WHERE name = $1 AND deleted_at IS NULL LIMIT 1`,
      [t.name],
    );
    if (exists.length === 0) {
      needInsert = true;
      break;
    }
  }

  if (!needInsert) {
    console.log(`  extraction_tasks: 0 新增 / ${rows.length} 已存在`);
    return;
  }

  // 解析 datasource_id（同一 datasource APYHFC16.OB；by name 動態解析）
  const datasourceName = rows[0].datasourceName;
  const dsResult = await qr.query(
    `SELECT id FROM datasources WHERE name = $1 AND deleted_at IS NULL LIMIT 1`,
    [datasourceName],
  );
  const datasourceId: string | undefined = dsResult[0]?.id;
  if (!datasourceId) {
    throw new Error(
      `extraction_tasks seed 中止：找不到 datasource '${datasourceName}'。` +
        `請先建立該 datasource（E07 ETL 來源 OB DB），或調整 extraction-tasks.json 的 datasourceName。`,
    );
  }

  const userId = await resolveSeedUserId(qr);
  console.log(
    `  extraction_tasks: 使用 datasource ${datasourceId}（${datasourceName}）、user ${userId} 作為 created_by`,
  );

  let inserted = 0;
  let skipped = 0;
  for (const t of rows) {
    const existing = await qr.query(
      `SELECT id FROM extraction_tasks WHERE name = $1 AND deleted_at IS NULL LIMIT 1`,
      [t.name],
    );
    if (existing.length > 0) {
      skipped++;
      console.log(`    ${t.name}: SKIP（已存在）`);
      continue;
    }
    await qr.query(
      `INSERT INTO extraction_tasks
         (id, name, datasource_id, mode, status, source_table, source_schema,
          raw_table_name, schedule, enabled, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'scheduled', $5, $6, $7, $8, true, $9, NOW(), NOW())`,
      [
        t.id,
        t.name,
        datasourceId,
        t.mode,
        t.sourceTable,
        t.sourceSchema,
        t.rawTableName,
        t.schedule,
        userId,
      ],
    );
    inserted++;
    console.log(`    ${t.name}: INSERT（id=${t.id}, raw=${t.rawTableName}）`);
  }
  console.log(`  extraction_tasks: ${inserted} 新增 / ${skipped} 已存在`);
}

/**
 * 依 score 真實資料推導 ob_levelcard_column.match_type。
 *
 * B2 變更：僅對「本次新 INSERT 的列」推導（傳入 keys），避免洗業務在 UI 手動調整過的
 * 既有 match_type。新補的列以 'RANGE' 佔位 INSERT，本步驟依其 score 形態推回正確標籤
 * （match_type 引擎不讀、僅標籤正確性，但別讓新 column 卡在 'RANGE'）。
 *
 * keys 為空 → 無新列，直接 no-op。
 */
export async function deriveMatchType(
  qr: QueryRunner,
  keys: ColumnKey[],
): Promise<void> {
  if (keys.length === 0) {
    console.log(`  ob_levelcard_column.match_type: 無新列，SKIP derive`);
    return;
  }
  let updated = 0;
  for (const k of keys) {
    const res = await qr.query(
      `UPDATE ob_levelcard_column AS c
         SET match_type = CASE
           WHEN EXISTS (
             SELECT 1 FROM ob_levelcard_score s
              WHERE s.card_type = c.card_type AND s.card_version = c.card_version
                AND s.column_name = c.column_name
                AND s.level1 IS NOT NULL AND s.level2_s IS NOT NULL
           ) THEN 'COMPOSITE'
           WHEN EXISTS (
             SELECT 1 FROM ob_levelcard_score s
              WHERE s.card_type = c.card_type AND s.card_version = c.card_version
                AND s.column_name = c.column_name
                AND s.level1 IS NOT NULL AND s.level2_s IS NULL
           ) THEN 'CATEGORY'
           WHEN EXISTS (
             SELECT 1 FROM ob_levelcard_score s
              WHERE s.card_type = c.card_type AND s.card_version = c.card_version
                AND s.column_name = c.column_name
                AND s.level1 IS NULL AND s.level2_s IS NOT NULL
           ) THEN 'RANGE'
           ELSE 'RANGE'
         END
       WHERE c.card_type = $1 AND c.card_version = $2 AND c.column_name = $3`,
      [k.card_type, k.card_version, k.column_name],
    );
    updated += res[1] ?? 0;
  }
  console.log(
    `  ob_levelcard_column.match_type: 對 ${keys.length} 個新列重新推導完成（${updated} 列）`,
  );
}

async function main(): Promise<void> {
  console.log('Prod data seed starting...');
  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    username: process.env.DB_USERNAME || 'cdmp',
    password: process.env.DB_PASSWORD || 'cdmp_secret',
    database: process.env.DB_NAME || 'cdmp_dev',
    // synchronize: false — seed 不負責 schema，僅資料；entity 不需 import
    synchronize: false,
  });
  await dataSource.initialize();
  console.log(`Connected to ${process.env.DB_NAME || 'cdmp_dev'}.`);

  const qr = dataSource.createQueryRunner();
  await qr.connect();
  await qr.startTransaction();

  try {
    await seedCardTypes(qr);
    await seedVersions(qr);
    const columnsResult = await seedColumns(qr);
    await seedScores(qr);
    await seedLevels(qr);
    await seedTiers(qr);
    // 僅對本次新 INSERT 的 column 推導 match_type（避免洗業務手動調整既有列）。
    // scores 已在上方載入，故 derive 時 score 形態可用。
    await deriveMatchType(qr, columnsResult.insertedKeys);
    await seedExtractionTasks(qr);
    await seedEtlPipelines(qr);
    await qr.commitTransaction();
    console.log('Prod data seed complete.');
  } catch (err) {
    await qr.rollbackTransaction();
    console.error('Prod data seed failed, rolled back:', err);
    process.exitCode = 1;
  } finally {
    await qr.release();
    await dataSource.destroy();
  }
}

// 僅在直接執行（npm run data-seed / node prod-data-seed.js）時連線並跑 seed；
// 被測試 import 時不自動執行（避免 DataSource 連線副作用）。
if (require.main === module) {
  main();
}
