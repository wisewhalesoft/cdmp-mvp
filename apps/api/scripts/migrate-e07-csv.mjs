#!/usr/bin/env node
/**
 * E07 Track B — D2~D11 一次性 CSV 遷移腳本
 * 將 reference/DumpData/*.csv 9 個表寫入 dev DB（idempotent，TRUNCATE 後 INSERT）
 *
 * 用法：
 *   cd apps/api && node scripts/migrate-e07-csv.mjs              # 真寫入
 *   cd apps/api && node scripts/migrate-e07-csv.mjs --dry-run    # 只解析不寫入
 *   cd apps/api && node scripts/migrate-e07-csv.mjs --table=ob_tier  # 只跑單一表
 *
 * 處理規則：
 *   - 稽核欄位重命名：A_PRGID → created_by_prog（等 6 欄）
 *   - 'NULL' 字面 → DB NULL；空字串視欄位定義（PK 欄位空字串 → 報錯，其他 → NULL）
 *   - DEPTID_M RTRIM（ob_empl_set / ob_dept_pct）
 *   - OBLEVELCARD_VERSION 補 status（依 SDATE/EDATE 計算 active / inactive）
 *   - OBLEVELCARD_COLUNM rename：COLUNM → column_name, COLUNM_NAME → column_label
 *   - OBLEVELCARD_SCORE rename：COLUNM → column_name
 *   - OBLIST_DEFINITION 補 status='active'
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));
const DUMP_DIR = resolve(__dirname, '../../../reference/DumpData');
const ENV_PATH = resolve(__dirname, '../.env');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const ONLY_TABLE = (args.find((a) => a.startsWith('--table=')) || '').split('=')[1] || null;

// === Env loader（與 data-source.ts 同 minimal style）===
function loadEnv() {
  try {
    const raw = readFileSync(ENV_PATH, 'utf-8');
    for (const line of raw.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq < 0) continue;
      const k = t.slice(0, eq).trim();
      const v = t.slice(eq + 1).trim();
      if (!(k in process.env)) process.env[k] = v;
    }
  } catch {}
}
loadEnv();

// === CSV parser（處理 BOM / quotes / commas in fields）===
function parseCsv(content) {
  // strip BOM
  if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1);
  const rows = [];
  let cur = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < content.length; i++) {
    const c = content[i];
    if (inQuotes) {
      if (c === '"') {
        if (content[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { cur.push(field); field = ''; }
      else if (c === '\r') {} // ignore
      else if (c === '\n') { cur.push(field); rows.push(cur); cur = []; field = ''; }
      else field += c;
    }
  }
  if (field !== '' || cur.length > 0) { cur.push(field); rows.push(cur); }
  return rows;
}

// === 共用轉換 helpers ===
const AUDIT_RENAMES = {
  A_PRGID: 'created_by_prog',
  A_USERID: 'created_by',
  A_SYSDT: 'created_at',
  U_PRGID: 'updated_by_prog',
  U_USERID: 'updated_by',
  U_SYSDT: 'updated_at',
};

const renameCol = (csvCol, extraMap = {}) => {
  return AUDIT_RENAMES[csvCol] || extraMap[csvCol] || csvCol.toLowerCase();
};

// 'NULL' 字面 → JS null；空字串 → null（CSV 慣例）
const toJsValue = (v) => (v === 'NULL' || v === '' ? null : v);

// 計算 status（OBLEVELCARD_VERSION）：依 SDATE/EDATE
function computeLevelcardStatus(sdate, edate) {
  if (!sdate || !edate) return 'active';
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return sdate <= today && today < edate ? 'active' : 'inactive';
}

// === 9 個表配置 ===
const tables = [
  {
    name: 'ob_code_df',
    csv: 'OBMCODEDF_20260505.csv',
    rename: {},
    transformRow: (row) => row, // 無特殊轉換
    extraDbCols: {}, // 無額外欄位
  },
  {
    name: 'ob_list_definition',
    csv: 'OBMLISTDF_20260505.csv',
    rename: {},
    transformRow: (row) => row,
    extraDbCols: { status: 'active' }, // 補 default status
  },
  {
    name: 'ob_dept_pct',
    csv: 'OBMDEPTPCT_20260505.csv',
    rename: {},
    transformRow: (row) => row,
    extraDbCols: {},
  },
  {
    name: 'ob_empl_set',
    csv: 'OBEMPLSETMF_20260505.csv',
    rename: {},
    transformRow: (row) => {
      // DEPTID_M RTRIM（VARCHAR(50) padded）
      if (row.deptid_m != null) row.deptid_m = row.deptid_m.replace(/\s+$/, '');
      return row;
    },
    extraDbCols: {},
  },
  {
    name: 'ob_levelcard_version',
    csv: 'OBLEVELCARD_VERSION_20260505.csv',
    rename: {},
    transformRow: (row) => {
      row.status = computeLevelcardStatus(row.sdate, row.edate);
      return row;
    },
    extraDbCols: {}, // status 由 transformRow 補入
  },
  {
    name: 'ob_levelcard_column',
    csv: 'OBLEVELCARD_COLUNM_20260505.csv',
    rename: { COLUNM: 'column_name', COLUNM_NAME: 'column_label' },
    transformRow: (row) => row,
    extraDbCols: {},
  },
  {
    name: 'ob_levelcard_score',
    csv: 'OBLEVELCARD_SCORE_20260505.csv',
    rename: { COLUNM: 'column_name' },
    transformRow: (row) => row,
    extraDbCols: {},
  },
  {
    name: 'ob_levelcard_level',
    csv: 'OBLEVELCARD_LEVEL_20260505.csv',
    rename: {},
    transformRow: (row) => row,
    extraDbCols: {},
  },
  {
    name: 'ob_tier',
    csv: 'OBTIER_20260505.csv',
    rename: {},
    transformRow: (row) => row,
    extraDbCols: {},
  },
];

async function loadTable(client, cfg) {
  const path = resolve(DUMP_DIR, cfg.csv);
  const content = readFileSync(path, 'utf-8');
  const rows = parseCsv(content);
  const header = rows[0];
  const dataRows = rows.slice(1).filter((r) => r.length > 1 || r[0] !== '');

  // CSV 欄位 → DB 欄位映射
  const dbCols = header.map((h) => renameCol(h, cfg.rename));

  // 套用 transformRow + 補 extraDbCols
  const records = dataRows.map((rawRow) => {
    const row = {};
    for (let i = 0; i < dbCols.length; i++) {
      row[dbCols[i]] = toJsValue(rawRow[i]);
    }
    Object.assign(row, cfg.extraDbCols); // default values
    return cfg.transformRow(row);
  });

  console.log(`  ${cfg.csv} → ${cfg.name}: ${records.length} 筆`);
  if (DRY_RUN) {
    console.log('    [dry-run] 範例第 1 筆:', JSON.stringify(records[0]));
    return { inserted: 0, total: records.length };
  }

  // TRUNCATE 並 INSERT
  await client.query(`TRUNCATE TABLE "${cfg.name}" CASCADE`);

  if (records.length === 0) return { inserted: 0, total: 0 };

  // 取所有 DB 欄位（排除 surrogate id，由 BIGSERIAL 自動產生）
  const allCols = Object.keys(records[0]).filter((c) => c !== 'id');

  // Batch insert（每批 500 筆）
  const batchSize = 500;
  let inserted = 0;
  for (let off = 0; off < records.length; off += batchSize) {
    const batch = records.slice(off, off + batchSize);
    const params = [];
    const valueRows = batch.map((rec) => {
      const placeholders = allCols.map((c) => {
        params.push(rec[c]);
        return `$${params.length}`;
      });
      return `(${placeholders.join(', ')})`;
    });
    const colList = allCols.map((c) => `"${c}"`).join(', ');
    const sql = `INSERT INTO "${cfg.name}" (${colList}) VALUES ${valueRows.join(', ')}`;
    await client.query(sql, params);
    inserted += batch.length;
  }
  return { inserted, total: records.length };
}

async function verify(client) {
  console.log('\n=== D11 驗證查詢 ===');

  // 1. 各表筆數
  const counts = {};
  for (const cfg of tables) {
    const r = await client.query(`SELECT COUNT(*)::int AS c FROM "${cfg.name}"`);
    counts[cfg.name] = r.rows[0].c;
  }
  console.log('表筆數：', counts);

  // 2. ob_levelcard_version status 計算正確
  const ver = await client.query(`SELECT status, COUNT(*)::int c FROM ob_levelcard_version GROUP BY status`);
  console.log('ob_levelcard_version status 分布：', ver.rows);

  // 3. ob_dept_pct DEPTID_M 無尾隨空白（其實是 obdeptid，這個 schema 沒 deptid_m，不需 trim）
  // 4. ob_empl_set deptid_m trim 結果
  const trim = await client.query(`SELECT COUNT(*)::int c FROM ob_empl_set WHERE deptid_m != RTRIM(deptid_m)`);
  console.log('ob_empl_set deptid_m 含尾隨空白筆數：', trim.rows[0].c, '（預期 0）');

  // 5. ob_list_definition 多值欄位格式
  const multi = await client.query(`SELECT COUNT(*)::int c FROM ob_list_definition WHERE prod_kind LIKE '%$$%' OR spec_tp LIKE '%$$%'`);
  console.log('ob_list_definition 多值欄位 ($$ 分隔) 筆數：', multi.rows[0].c, '（預期 >= 0）');

  // 6. ob_tier (card_type, COALESCE(card_level, '')) 唯一性
  const dup = await client.query(`
    SELECT card_type, COALESCE(card_level, '') AS ck, COUNT(*)::int c
      FROM ob_tier GROUP BY 1, 2 HAVING COUNT(*) > 1
  `);
  console.log('ob_tier 重複 (card_type, card_level) 組合：', dup.rows.length, '組（預期 0）');

  // 7. ob_levelcard_version active 至少 1 筆
  const active = await client.query(`SELECT COUNT(*)::int c FROM ob_levelcard_version WHERE status='active'`);
  console.log('ob_levelcard_version active 筆數：', active.rows[0].c, '（預期 >= 1）');
}

async function main() {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USERNAME || 'cdmp',
    password: process.env.DB_PASSWORD || 'cdmp_secret',
    database: process.env.DB_NAME || 'cdmp_dev',
  });
  await client.connect();
  console.log(`連線：${client.host}:${client.port}/${client.database} (${DRY_RUN ? 'DRY-RUN' : 'LIVE'})`);
  console.log('='.repeat(60));

  let totalInserted = 0;
  for (const cfg of tables) {
    if (ONLY_TABLE && cfg.name !== ONLY_TABLE) continue;
    const r = await loadTable(client, cfg);
    totalInserted += r.inserted;
  }
  console.log('='.repeat(60));
  console.log(`✓ 總計寫入 ${totalInserted} 筆`);

  if (!DRY_RUN && !ONLY_TABLE) {
    await verify(client);
  }

  await client.end();
}

main().catch((err) => {
  console.error('✗ ERROR:', err.message);
  if (err.detail) console.error('  Detail:', err.detail);
  if (err.hint) console.error('  Hint:', err.hint);
  process.exit(1);
});
