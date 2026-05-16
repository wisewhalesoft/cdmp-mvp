import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * E07 P1 B4 補完（2026-05-17）— assignment_run.skipped_cases + warning_summary
 *
 * 對應 spec：F061 v1.2 BR-12 / AC-7b — 邊緣 CARD_TYPE 案件跳過記錄
 *
 * 欄位：
 *   - skipped_cases   JSONB nullable，{ cases: [{ cardType, applNoCount, reason }] }
 *   - warning_summary VARCHAR(100) nullable，警示碼（例：'BR-12_EDGE_CARD_TYPE_SKIPPED'）
 *
 * 為原 migration 120（CreateE07AssignmentTables）之後的 v1.2 補丁。
 */
export class AddAssignmentRunWarnings1711360000190 implements MigrationInterface {
  name = 'AddAssignmentRunWarnings1711360000190';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "assignment_run" ADD COLUMN IF NOT EXISTS "skipped_cases" jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "assignment_run" ADD COLUMN IF NOT EXISTS "warning_summary" varchar(100)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "assignment_run" DROP COLUMN IF EXISTS "warning_summary"`,
    );
    await queryRunner.query(
      `ALTER TABLE "assignment_run" DROP COLUMN IF EXISTS "skipped_cases"`,
    );
  }
}
