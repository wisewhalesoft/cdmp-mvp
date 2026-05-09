import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * P1 fix（system-architect 2026-05-09 review Q3）— assignment_run_stage_log
 * 將 (run_id, stage_no) 從一般 index 升為 UNIQUE，防同 Stage 重複 INSERT。
 *
 * 月跑 Stage 重試邏輯應採 UPSERT / UPDATE 而非 INSERT；本約束作為防呆，
 * 若實作層誤插重複列會在 DB 端立即發現。
 *
 * Migration 120 建立的 `idx_assignment_run_stage_log_run_stage` 為一般索引，
 * 本 migration 切到 `uq_assignment_run_stage_log_run_stage` UNIQUE 索引。
 *
 * dev synchronize 對「一般 index → UNIQUE index」變更不會自動套；需執行本
 * migration 或手動 DROP INDEX + CREATE UNIQUE INDEX。
 */
export class AssignmentRunStageLogUniqueIndex1711360000144 implements MigrationInterface {
  name = 'AssignmentRunStageLogUniqueIndex1711360000144';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_assignment_run_stage_log_run_stage"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_assignment_run_stage_log_run_stage" ON "assignment_run_stage_log" ("run_id", "stage_no")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_assignment_run_stage_log_run_stage"`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_assignment_run_stage_log_run_stage" ON "assignment_run_stage_log" ("run_id", "stage_no")`,
    );
  }
}
