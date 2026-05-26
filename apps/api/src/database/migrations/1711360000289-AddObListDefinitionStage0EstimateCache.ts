import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * m289 / F088 v1.3 / AD-E07-20（2026-05-26）— ob_list_definition 物化 Stage 0 估算快取
 *
 * 新增兩欄（皆 nullable，無 backfill）：
 *   - stage0_estimate_count  INTEGER    — approve→ready（F086）成功後 best-effort 寫入之 Stage 0 估算件數
 *   - stage0_estimated_at    TIMESTAMP  — 估算當下時間戳
 *
 * 動機：F088「準備完成摘要」清單卡片需顯示「預估案件數」。per-list 即時 COUNT 會掃
 *       ob_pool_data（百萬列），N 張卡 = N 次重查詢，違反 ETL/scale 原則 → 改物化快取。
 *
 * nullable 理由：
 *   - 舊名單從未經 approve→ready hook → NULL
 *   - 計算 timeout / 失敗（best-effort）→ 保留 NULL
 *   - 無 backfill：既有 ready 名單下次 re-approve 才填；前端 NULL 顯示「—」
 *
 * SQLite e2e 走 entity synchronize:true → 本 migration up/down no-op；entity 為單一事實來源。
 */
export class AddObListDefinitionStage0EstimateCache1711360000289
  implements MigrationInterface
{
  name = 'AddObListDefinitionStage0EstimateCache1711360000289';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isSqlite = process.env.DB_TYPE === 'sqlite';
    if (isSqlite) return;

    await queryRunner.query(
      `ALTER TABLE ob_list_definition ADD COLUMN IF NOT EXISTS stage0_estimate_count INTEGER`,
    );
    await queryRunner.query(
      `ALTER TABLE ob_list_definition ADD COLUMN IF NOT EXISTS stage0_estimated_at TIMESTAMP`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const isSqlite = process.env.DB_TYPE === 'sqlite';
    if (isSqlite) return;

    await queryRunner.query(
      `ALTER TABLE ob_list_definition DROP COLUMN IF EXISTS stage0_estimated_at`,
    );
    await queryRunner.query(
      `ALTER TABLE ob_list_definition DROP COLUMN IF EXISTS stage0_estimate_count`,
    );
  }
}
