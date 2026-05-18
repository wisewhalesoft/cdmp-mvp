import { MigrationInterface, QueryRunner } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';

/**
 * F054 / F061 v1.3 — CreateFnCalcTierLevelV13（2026-05-18）
 *
 * 部署 fn_calc_tier_level PostgreSQL function 至 PG，包含：
 *   - 三模式分支：CATEGORY / RANGE / COMPOSITE（對應 ob_levelcard_column.match_type）
 *   - RANGE try-cast：numeric BETWEEN 為主，VARCHAR BETWEEN fallback
 *   - F061 v1.3 BR-14：level1 規一化（TRIM + NULL/'' 等價）
 *   - fallback TIER_LEVEL：找不到 standard 時取 card_level IS NULL 那筆（如 M5 → T5M）
 *
 * 對應 spec：
 *   - architecture-spec.md §AD-E07-3
 *   - F061 v1.3 BR-13 / AC-7c（soft check 由 application 層獨立）
 *   - F054 v1.3 BR-8 / BR-9
 *
 * SQLite 環境（E2E）：
 *   - SQLite 不支援 plpgsql function 與 regex `~`、TRIM、NUMERIC cast
 *   - up() 完全略過；E2E 由 AssignmentRunPipelineService 之 JS 等價邏輯實作
 *
 * source SQL：apps/api/src/database/functions/fn_calc_tier_level.sql
 */
export class CreateFnCalcTierLevelV131711360000260 implements MigrationInterface {
  name = 'CreateFnCalcTierLevelV131711360000260';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isSqlite = process.env.DB_TYPE === 'sqlite';
    if (isSqlite) return;

    // 讀取 SQL 檔內容並執行
    // dist 目錄結構：dist/database/migrations/{file}.js
    //   sql 檔位於 src/database/functions/fn_calc_tier_level.sql
    //   build 時應由 nest-cli copy assets 同步到 dist；以下兩條候選路徑皆嘗試。
    const candidates = [
      path.resolve(__dirname, '../functions/fn_calc_tier_level.sql'),
      path.resolve(__dirname, '../../database/functions/fn_calc_tier_level.sql'),
    ];
    let sqlPath: string | null = null;
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        sqlPath = p;
        break;
      }
    }
    if (!sqlPath) {
      throw new Error(
        `[Migration 1711360000260] fn_calc_tier_level.sql 找不到；嘗試路徑：\n${candidates.join('\n')}`,
      );
    }

    const sql = fs.readFileSync(sqlPath, 'utf8');
    // pg 不接受多 CREATE OR REPLACE 連續 ; 結尾的 batch，於 typeorm 一次 query 應可
    // 採 raw query 直接送整段（PostgreSQL 解析 plpgsql 區塊以 $$ ... $$）
    await queryRunner.query(sql);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const isSqlite = process.env.DB_TYPE === 'sqlite';
    if (isSqlite) return;

    await queryRunner.query(
      `DROP FUNCTION IF EXISTS fn_calc_tier_level(VARCHAR, INTEGER, ob_pool_data)`,
    );
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS fn_resolve_column_value(VARCHAR, ob_pool_data)`,
    );
  }
}
