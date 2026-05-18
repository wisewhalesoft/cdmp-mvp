#!/usr/bin/env node
/**
 * 從 reference/DumpData/ 的 6 個 CSV dump 生成生產初始化用 JSON：
 *
 *   ob-card-type.json           ← 從 OBLEVELCARD_VERSION 推導（OBCARDTYPE 無原 dump）
 *   ob-levelcard-version.json   ← OBLEVELCARD_VERSION
 *   ob-levelcard-column.json    ← OBLEVELCARD_COLUNM
 *   ob-levelcard-score.json     ← OBLEVELCARD_SCORE（BR-9 RTRIM）
 *   ob-levelcard-level.json     ← OBLEVELCARD_LEVEL
 *   ob-tier.json                ← OBTIER（正規化 tier_level：strip 後綴英文 + T1-T10 範圍）
 *
 * 用法：node apps/api/src/database/seeds/transformers/csv-to-json.mjs
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../../../../../..');
const DUMP_DIR = resolve(REPO_ROOT, 'reference/DumpData');
const OUT_DIR = resolve(__dirname, '../data');

mkdirSync(OUT_DIR, { recursive: true });

function parseCsv(path) {
  const raw = readFileSync(path, 'utf-8').replace(/^﻿/, '');
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  const header = parseCsvLine(lines[0]);
  return lines.slice(1).map((l) => {
    const fields = parseCsvLine(l);
    return Object.fromEntries(header.map((h, i) => [h, fields[i] ?? '']));
  });
}

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQ = !inQ;
      }
    } else if (ch === ',' && !inQ) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function nullOrTrim(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).replace(/\s+$/, '');
  if (s === '' || s === 'NULL') return null;
  return s;
}

/**
 * OBTIER 正規化規則（依使用者規範）：
 *   1. 捨棄後綴英文：T1HM → T1，T5M → T5
 *   2. 只取 T1-T10 範圍：T32 → T3 (32>10 取首位數字)，T51 → T5，T52 → T5
 */
function normalizeTier(raw) {
  const m = raw.match(/^T(\d+)/);
  if (!m) return raw;
  const num = parseInt(m[1], 10);
  if (num >= 1 && num <= 10) return `T${num}`;
  return `T${m[1][0]}`;
}

// ============================================================
// 1) ob_card_type — 從 VERSION dump 推導（無 OBCARDTYPE dump）
//    prod_kind 補預設值（M 系列 → 02 機車；其餘 → 01）
// ============================================================
const versionRows = parseCsv(resolve(DUMP_DIR, 'OBLEVELCARD_VERSION_20260505.csv'));
const cardTypeMap = new Map();
for (const r of versionRows) {
  const ct = r.CARD_TYPE.trim();
  if (cardTypeMap.has(ct)) continue;
  cardTypeMap.set(ct, {
    card_type: ct,
    card_name: r.CARD_NAME.trim(),
    prod_kind: ct.startsWith('M') ? '02' : '01',
    status: 'active',
  });
}
const cardTypes = [...cardTypeMap.values()];
writeFileSync(resolve(OUT_DIR, 'ob-card-type.json'), JSON.stringify(cardTypes, null, 2));

// ============================================================
// 2) ob_levelcard_version
// ============================================================
const versions = versionRows.map((r) => ({
  card_type: r.CARD_TYPE.trim(),
  card_name: r.CARD_NAME.trim(),
  card_version: parseInt(r.CARD_VERSION, 10),
  sdate: nullOrTrim(r.SDATE),
  edate: nullOrTrim(r.EDATE),
  status: 'active',
}));
writeFileSync(resolve(OUT_DIR, 'ob-levelcard-version.json'), JSON.stringify(versions, null, 2));

// ============================================================
// 3) ob_levelcard_column — 含中文 column_label
//    match_type 暫填 RANGE（後續會被 score 推導更新；新環境部署時可由
//    prod-data-seed 在 score 載完後一併 derive）
// ============================================================
const columnRows = parseCsv(resolve(DUMP_DIR, 'OBLEVELCARD_COLUNM_20260505.csv'));
const columns = columnRows.map((r) => ({
  card_type: r.CARD_TYPE.trim(),
  card_version: parseInt(r.CARD_VERSION, 10),
  column_name: r.COLUNM.trim(),
  column_label: nullOrTrim(r.COLUNM_NAME),
  status: 'active',
}));
writeFileSync(resolve(OUT_DIR, 'ob-levelcard-column.json'), JSON.stringify(columns, null, 2));

// ============================================================
// 4) ob_levelcard_score — BR-9 RTRIM + 空字串/NULL 規一化
// ============================================================
const scoreRows = parseCsv(resolve(DUMP_DIR, 'OBLEVELCARD_SCORE_20260505.csv'));
const scores = scoreRows.map((r) => ({
  card_type: r.CARD_TYPE.trim(),
  card_version: parseInt(r.CARD_VERSION, 10),
  column_name: r.COLUNM.trim(),
  level1: nullOrTrim(r.LEVEL1),
  level2_s: nullOrTrim(r.LEVEL2_S),
  level2_e: nullOrTrim(r.LEVEL2_E),
  score: parseInt(r.SCORE, 10),
}));
writeFileSync(resolve(OUT_DIR, 'ob-levelcard-score.json'), JSON.stringify(scores, null, 2));

// ============================================================
// 5) ob_levelcard_level
// ============================================================
const levelRows = parseCsv(resolve(DUMP_DIR, 'OBLEVELCARD_LEVEL_20260505.csv'));
const levels = levelRows.map((r) => ({
  card_type: r.CARD_TYPE.trim(),
  card_version: parseInt(r.CARD_VERSION, 10),
  score_s: parseInt(r.SCORE_S, 10),
  score_e: parseInt(r.SCORE_E, 10),
  card_level: r.CARD_LEVEL.trim(),
}));
writeFileSync(resolve(OUT_DIR, 'ob-levelcard-level.json'), JSON.stringify(levels, null, 2));

// ============================================================
// 6) ob_tier — 正規化 tier_level
// ============================================================
const tierRows = parseCsv(resolve(DUMP_DIR, 'OBTIER_20260505.csv'));
const tierStats = new Map();
const tiers = tierRows.map((r) => {
  const rawTier = r.TIER_LEVEL.trim();
  const normalized = normalizeTier(rawTier);
  tierStats.set(rawTier, normalized);
  return {
    list_nm: nullOrTrim(r.LIST_NM),
    card_type: r.CARD_TYPE.trim(),
    card_level: nullOrTrim(r.CARD_LEVEL),
    tier_level: normalized,
  };
});
writeFileSync(resolve(OUT_DIR, 'ob-tier.json'), JSON.stringify(tiers, null, 2));

// ============================================================
// 摘要
// ============================================================
console.log('Generated JSON files:');
console.log(`  ob-card-type.json         ${cardTypes.length} rows`);
console.log(`  ob-levelcard-version.json ${versions.length} rows`);
console.log(`  ob-levelcard-column.json  ${columns.length} rows`);
console.log(`  ob-levelcard-score.json   ${scores.length} rows`);
console.log(`  ob-levelcard-level.json   ${levels.length} rows`);
console.log(`  ob-tier.json              ${tiers.length} rows`);
console.log('');
console.log('Tier normalization mapping:');
[...tierStats.entries()]
  .sort()
  .forEach(([raw, norm]) => console.log(`  ${raw.padEnd(6)} → ${norm}`));
