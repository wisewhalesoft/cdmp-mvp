#!/usr/bin/env node
/**
 * 從 reference/DumpData/OBLEVELCARD_SCORE_20260505.csv 生成 SQL：
 * - TRUNCATE ob_levelcard_score
 * - INSERT 370 筆（處理 BOM/CRLF、引號 padding、NULL 字串、BR-9 RTRIM）
 * - 重新推導 ob_levelcard_column.match_type
 *
 * 用法：node apps/api/src/database/seeds/gen-oblevelcard-score-sql.mjs > /tmp/load-dump.sql
 */

import { readFileSync } from 'node:fs';

const CSV_PATH = 'reference/DumpData/OBLEVELCARD_SCORE_20260505.csv';

function sqlQuote(value) {
  if (value === null || value === undefined || value === '' || value === 'NULL') {
    return 'NULL';
  }
  return "'" + String(value).replace(/'/g, "''") + "'";
}

// 簡單 CSV parser（處理引號 + 內含逗號）
function parseCsvLine(line) {
  const result = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  result.push(cur);
  return result;
}

const raw = readFileSync(CSV_PATH, 'utf-8').replace(/^﻿/, '');
const lines = raw.split(/\r?\n/).filter((l) => l.trim());
const header = parseCsvLine(lines[0]);
const idx = Object.fromEntries(header.map((h, i) => [h, i]));

const out = ['BEGIN;', 'TRUNCATE TABLE ob_levelcard_score RESTART IDENTITY;', ''];
let rowCount = 0;

for (let i = 1; i < lines.length; i++) {
  const fields = parseCsvLine(lines[i]);
  const cardType = fields[idx.CARD_TYPE];
  const cardVersion = fields[idx.CARD_VERSION];
  const columnName = fields[idx.COLUNM];
  let level1 = fields[idx.LEVEL1];
  const level2S = fields[idx.LEVEL2_S];
  const level2E = fields[idx.LEVEL2_E];
  const score = fields[idx.SCORE];

  // BR-9 規一化：level1 NULL string / 引號 padding RTRIM / 空字串 → NULL
  if (level1 === 'NULL') {
    level1 = null;
  } else {
    // CSV parser 已處理引號，剩下空白 RTRIM
    level1 = level1.replace(/\s+$/, '');
    if (level1 === '') level1 = null;
  }

  out.push(
    `INSERT INTO ob_levelcard_score (card_type, card_version, column_name, level1, level2_s, level2_e, score, created_at, updated_at) VALUES ('${cardType}', ${cardVersion}, '${columnName}', ${sqlQuote(level1)}, ${sqlQuote(level2S)}, ${sqlQuote(level2E)}, ${score}, NOW(), NOW());`,
  );
  rowCount++;
}

out.push(
  '',
  '-- 重新推導 ob_levelcard_column.match_type（依新 score 資料）',
  'UPDATE ob_levelcard_column AS c',
  'SET match_type = CASE',
  '  WHEN EXISTS (',
  '    SELECT 1 FROM ob_levelcard_score s',
  '    WHERE s.card_type = c.card_type AND s.card_version = c.card_version',
  '      AND s.column_name = c.column_name',
  '      AND s.level1 IS NOT NULL AND s.level2_s IS NOT NULL',
  "  ) THEN 'COMPOSITE'",
  '  WHEN EXISTS (',
  '    SELECT 1 FROM ob_levelcard_score s',
  '    WHERE s.card_type = c.card_type AND s.card_version = c.card_version',
  '      AND s.column_name = c.column_name',
  '      AND s.level1 IS NOT NULL AND s.level2_s IS NULL',
  "  ) THEN 'CATEGORY'",
  '  WHEN EXISTS (',
  '    SELECT 1 FROM ob_levelcard_score s',
  '    WHERE s.card_type = c.card_type AND s.card_version = c.card_version',
  '      AND s.column_name = c.column_name',
  '      AND s.level1 IS NULL AND s.level2_s IS NOT NULL',
  "  ) THEN 'RANGE'",
  "  ELSE 'RANGE'",
  'END;',
  '',
  'COMMIT;',
  '',
  '-- 驗證',
  "SELECT 'score total' AS metric, COUNT(*)::text AS value FROM ob_levelcard_score",
  "UNION ALL SELECT 'with level1', COUNT(*)::text FROM ob_levelcard_score WHERE level1 IS NOT NULL",
  "UNION ALL SELECT 'CATEGORY', COUNT(*)::text FROM ob_levelcard_column WHERE match_type='CATEGORY'",
  "UNION ALL SELECT 'RANGE', COUNT(*)::text FROM ob_levelcard_column WHERE match_type='RANGE'",
  "UNION ALL SELECT 'COMPOSITE', COUNT(*)::text FROM ob_levelcard_column WHERE match_type='COMPOSITE';",
);

console.log(out.join('\n'));
console.error(`-- Generated ${rowCount} INSERT statements`);
