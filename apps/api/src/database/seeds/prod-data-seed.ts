/**
 * 生產初始化資料 Seed（冪等）
 *
 * 對 E07 計分卡相關 6 表執行「表為空才 INSERT」的安全初始化：
 *   ob_card_type, ob_levelcard_version, ob_levelcard_column,
 *   ob_levelcard_score, ob_levelcard_level, ob_tier
 *
 * 來源資料：apps/api/src/database/seeds/data/*.json
 *   （從 reference/DumpData/*.csv 2026-05-05 dump 預先生成，含 OBTIER 正規化）
 *
 * 安全機制：
 *   - 每表先 SELECT COUNT(*)，若 > 0 則 SKIP，不覆寫業務既有資料
 *   - ob_levelcard_column 特例：用 UPDATE WHERE column_label IS NULL 補
 *     中文標籤（不洗現有 column_label）
 *   - ob_levelcard_column.match_type 在 score 載入後重新依資料推導
 *
 * 用法：
 *   docker compose --profile data-seed up data-seed
 *   或 local：npm run data-seed
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

function dataPath(file: string): string {
  // dist 編譯後位於 apps/api/dist/database/seeds/，ts-node 直接執行位於 src/...
  // 兩者皆透過 __dirname / ./data 解析
  return resolve(__dirname, 'data', file);
}

function loadJson<T>(file: string): T[] {
  const raw = readFileSync(dataPath(file), 'utf-8');
  return JSON.parse(raw) as T[];
}

async function tableCount(qr: QueryRunner, table: string): Promise<number> {
  const r = await qr.query(`SELECT COUNT(*)::int AS n FROM ${table}`);
  return r[0]?.n ?? 0;
}

async function seedCardTypes(qr: QueryRunner): Promise<void> {
  const rows = loadJson<CardType>('ob-card-type.json');
  const n = await tableCount(qr, 'ob_card_type');
  if (n > 0) {
    console.log(`  ob_card_type: SKIP（已有 ${n} 列）`);
    return;
  }
  for (const r of rows) {
    await qr.query(
      `INSERT INTO ob_card_type (card_type, card_name, prod_kind, status, created_at, created_by, updated_at, updated_by)
       VALUES ($1, $2, $3, $4, NOW(), 'PROD_SEED', NOW(), 'PROD_SEED')`,
      [r.card_type, r.card_name, r.prod_kind, r.status],
    );
  }
  console.log(`  ob_card_type: INSERT ${rows.length} 列`);
}

async function seedVersions(qr: QueryRunner): Promise<void> {
  const rows = loadJson<LevelcardVersion>('ob-levelcard-version.json');
  const n = await tableCount(qr, 'ob_levelcard_version');
  if (n > 0) {
    console.log(`  ob_levelcard_version: SKIP（已有 ${n} 列）`);
    return;
  }
  for (const r of rows) {
    await qr.query(
      `INSERT INTO ob_levelcard_version (card_type, card_name, card_version, sdate, edate, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
      [r.card_type, r.card_name, r.card_version, r.sdate, r.edate, r.status],
    );
  }
  console.log(`  ob_levelcard_version: INSERT ${rows.length} 列`);
}

async function seedColumns(qr: QueryRunner): Promise<{ inserted: boolean }> {
  const rows = loadJson<LevelcardColumn>('ob-levelcard-column.json');
  const n = await tableCount(qr, 'ob_levelcard_column');
  if (n === 0) {
    for (const r of rows) {
      await qr.query(
        `INSERT INTO ob_levelcard_column (card_type, card_version, column_name, column_label, status, match_type, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, 'RANGE', NOW(), NOW())`,
        [r.card_type, r.card_version, r.column_name, r.column_label, r.status],
      );
    }
    console.log(`  ob_levelcard_column: INSERT ${rows.length} 列`);
    return { inserted: true };
  }
  // 既有資料：補中文 column_label（不洗業務調整過的值）
  let updated = 0;
  for (const r of rows) {
    if (r.column_label === null) continue;
    const res = await qr.query(
      `UPDATE ob_levelcard_column
          SET column_label = $1, updated_at = NOW()
        WHERE card_type = $2 AND card_version = $3 AND column_name = $4
          AND column_label IS NULL`,
      [r.column_label, r.card_type, r.card_version, r.column_name],
    );
    updated += res[1] ?? 0;
  }
  console.log(`  ob_levelcard_column: SKIP（已有 ${n} 列）；補 column_label ${updated} 列`);
  return { inserted: false };
}

async function seedScores(qr: QueryRunner): Promise<void> {
  const rows = loadJson<LevelcardScore>('ob-levelcard-score.json');
  const n = await tableCount(qr, 'ob_levelcard_score');
  if (n > 0) {
    console.log(`  ob_levelcard_score: SKIP（已有 ${n} 列）`);
    return;
  }
  for (const r of rows) {
    await qr.query(
      `INSERT INTO ob_levelcard_score (card_type, card_version, column_name, level1, level2_s, level2_e, score, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`,
      [r.card_type, r.card_version, r.column_name, r.level1, r.level2_s, r.level2_e, r.score],
    );
  }
  console.log(`  ob_levelcard_score: INSERT ${rows.length} 列`);
}

async function seedLevels(qr: QueryRunner): Promise<void> {
  const rows = loadJson<LevelcardLevel>('ob-levelcard-level.json');
  const n = await tableCount(qr, 'ob_levelcard_level');
  if (n > 0) {
    console.log(`  ob_levelcard_level: SKIP（已有 ${n} 列）`);
    return;
  }
  for (const r of rows) {
    await qr.query(
      `INSERT INTO ob_levelcard_level (card_type, card_version, score_s, score_e, card_level, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
      [r.card_type, r.card_version, r.score_s, r.score_e, r.card_level],
    );
  }
  console.log(`  ob_levelcard_level: INSERT ${rows.length} 列`);
}

async function seedTiers(qr: QueryRunner): Promise<void> {
  const rows = loadJson<Tier>('ob-tier.json');
  const n = await tableCount(qr, 'ob_tier');
  if (n > 0) {
    console.log(`  ob_tier: SKIP（已有 ${n} 列）`);
    return;
  }
  for (const r of rows) {
    await qr.query(
      `INSERT INTO ob_tier (list_nm, card_type, card_level, tier_level)
       VALUES ($1, $2, $3, $4)`,
      [r.list_nm, r.card_type, r.card_level, r.tier_level],
    );
  }
  console.log(`  ob_tier: INSERT ${rows.length} 列（OBTIER 正規化後）`);
}

async function deriveMatchType(qr: QueryRunner): Promise<void> {
  // 依 score 真實資料重新推導 ob_levelcard_column.match_type
  // 已存在 match_type 仍會被覆寫——seed 階段以 dump 真實資料為準
  const res = await qr.query(`
    UPDATE ob_levelcard_column AS c
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
  `);
  console.log(`  ob_levelcard_column.match_type: 重新推導完成（${res[1] ?? 0} 列）`);
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
    // 只在 column 首次 INSERT 才 derive match_type（避免洗業務手動調整）
    if (columnsResult.inserted) {
      await deriveMatchType(qr);
    } else {
      console.log(`  ob_levelcard_column.match_type: SKIP derive（column 已存在，保留業務值）`);
    }
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

main();
