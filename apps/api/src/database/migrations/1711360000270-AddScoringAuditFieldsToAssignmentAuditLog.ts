import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * F061 v1.3 AC-9 / 2026-05-18 — AddScoringAuditFieldsToAssignmentAuditLog
 *
 * 為 assignment_audit_log 新增 5 個 nullable 欄位以支援 SCORING_INTEGRITY_WARN
 * 彙總列寫入（每維度每 rule_violated 寫一筆，不寫 appl_no 明細）。
 *
 * 新增欄位（皆 nullable，向後相容）：
 *   - run_id              UUID         月跑 ID
 *   - card_type           VARCHAR(10)
 *   - column_name         VARCHAR(30)
 *   - rule_violated       VARCHAR(100) 違反的規則名稱（如 ALL_SCORES_EMPTY）
 *   - violated_row_count  INTEGER      受影響的 appl_no 計數
 *
 * 對應 spec：
 *   - F061 v1.3 AC-7c / BR-13：audit log 寫入規則
 *   - architecture-spec.md（待 system-architect 同步 v1.3）
 *
 * SQLite 環境（E2E）：略過（既有 entity / synchronize 已涵蓋）。
 *
 * 設計權衡：欄位多用 nullable 而非 JSONB key — 利於後續 indexing。
 *   現階段 ScoringIntegrityCheckService 仍以 after_value JSONB 寫入這些 key，
 *   本 migration 為未來 promote 為 first-class 欄位預留空間，現階段 entity 未拓展。
 */
export class AddScoringAuditFieldsToAssignmentAuditLog1711360000270
  implements MigrationInterface
{
  name = 'AddScoringAuditFieldsToAssignmentAuditLog1711360000270';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isSqlite = process.env.DB_TYPE === 'sqlite';
    if (isSqlite) {
      // SQLite synchronize 模式不需 ADD COLUMN；新欄位由 entity 端宣告即可
      // 本 migration 在 SQLite 環境完全略過（與 m16 pattern 一致）
      return;
    }

    await queryRunner.query(
      `ALTER TABLE "assignment_audit_log" ADD COLUMN IF NOT EXISTS "run_id" UUID NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "assignment_audit_log" ADD COLUMN IF NOT EXISTS "card_type" VARCHAR(10) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "assignment_audit_log" ADD COLUMN IF NOT EXISTS "column_name" VARCHAR(30) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "assignment_audit_log" ADD COLUMN IF NOT EXISTS "rule_violated" VARCHAR(100) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "assignment_audit_log" ADD COLUMN IF NOT EXISTS "violated_row_count" INTEGER NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const isSqlite = process.env.DB_TYPE === 'sqlite';
    if (isSqlite) return;

    await queryRunner.query(
      `ALTER TABLE "assignment_audit_log" DROP COLUMN IF EXISTS "violated_row_count"`,
    );
    await queryRunner.query(
      `ALTER TABLE "assignment_audit_log" DROP COLUMN IF EXISTS "rule_violated"`,
    );
    await queryRunner.query(
      `ALTER TABLE "assignment_audit_log" DROP COLUMN IF EXISTS "column_name"`,
    );
    await queryRunner.query(
      `ALTER TABLE "assignment_audit_log" DROP COLUMN IF EXISTS "card_type"`,
    );
    await queryRunner.query(
      `ALTER TABLE "assignment_audit_log" DROP COLUMN IF EXISTS "run_id"`,
    );
  }
}
