import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * m15: AddObListDefinitionStage（AD-E07-17 議題 1 / E07 重構 P1 B1 / 2026-05-16）
 *
 * 為 ob_list_definition 表新增 stage VARCHAR(20) NOT NULL DEFAULT 'draft'，
 * 對應 F077 v1.0 五階段流程（draft → dept_ratio → personnel_ratio → approval → ready）。
 *
 * Backfill 邏輯（向下相容 v1.x 啟用名單）：
 *   既有 status != 'inactive' 的紀錄一律 backfill 為 stage='ready'，
 *   表示這些名單在 v1.x 已是「啟用」狀態，重構後視為已通過五階段流程。
 *
 * 對應 spec：
 *   - data-model.md L848 §ob_list_definition.stage
 *   - F077 BR-9 五階段流程
 *   - architecture-spec §E07 重構批次 1（schema 補修）
 */
export class AddObListDefinitionStage1711360000180 implements MigrationInterface {
  name = 'AddObListDefinitionStage1711360000180';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isSqlite = process.env.DB_TYPE === 'sqlite';

    // Step 1: ADD COLUMN stage VARCHAR(20) NOT NULL DEFAULT 'draft'
    await queryRunner.query(
      `ALTER TABLE ob_list_definition ADD COLUMN IF NOT EXISTS stage VARCHAR(20) NOT NULL DEFAULT 'draft'`,
    );

    // Step 2: Backfill — 既有啟用名單視為已 ready
    await queryRunner.query(
      `UPDATE ob_list_definition SET stage = 'ready' WHERE status != 'inactive' AND stage = 'draft'`,
    );

    // Step 3: ADD CHECK constraint（PostgreSQL only；SQLite 不支援 ALTER TABLE ADD CONSTRAINT）
    if (!isSqlite) {
      await queryRunner.query(
        `ALTER TABLE ob_list_definition ADD CONSTRAINT chk_ob_list_definition_stage ` +
          `CHECK (stage IN ('draft', 'dept_ratio', 'personnel_ratio', 'approval', 'ready'))`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE ob_list_definition DROP CONSTRAINT IF EXISTS chk_ob_list_definition_stage`,
    );
    await queryRunner.query(`ALTER TABLE ob_list_definition DROP COLUMN IF EXISTS stage`);
  }
}
