#!/usr/bin/env node
/**
 * E07 Track D — 安裝 fn_calc_tier_level function 到 dev DB
 *
 * dev 走 synchronize:true 不跑 migration，但 plpgsql function 不在 entity 範圍，
 * 需要手動安裝。本腳本從 1711360000141-CreateFnCalcTierLevel.ts 抽出 SQL，直接執行。
 *
 * 用法：cd apps/api && node scripts/install-fn-calc-tier-level.mjs
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIG_PATH = resolve(__dirname, '../src/database/migrations/1711360000141-CreateFnCalcTierLevel.ts');
const ENV_PATH = resolve(__dirname, '../.env');

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

const src = readFileSync(MIG_PATH, 'utf-8');
// 抽取 await queryRunner.query(`...`) 內容（單一 backtick 區段）
const m = src.match(/await queryRunner\.query\(`([\s\S]+?)`\);/);
if (!m) {
  console.error('✗ 無法從 migration 抽取 SQL');
  process.exit(1);
}
const sql = m[1];

const client = new pg.Client({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USERNAME || 'cdmp',
  password: process.env.DB_PASSWORD || 'cdmp_secret',
  database: process.env.DB_NAME || 'cdmp_dev',
});

try {
  await client.connect();
  await client.query(sql);
  // 驗證 function 已建
  const r = await client.query(`SELECT 1 FROM pg_proc WHERE proname = 'fn_calc_tier_level' LIMIT 1`);
  if (r.rows.length === 0) throw new Error('function 安裝後查詢不到');
  console.log('✓ fn_calc_tier_level 已安裝');
} catch (e) {
  console.error('✗ 安裝失敗:', e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
