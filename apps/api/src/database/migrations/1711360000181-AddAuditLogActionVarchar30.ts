import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * m16: AddAuditLogActionVarchar30（AD-E07-17 議題 2 / E07 重構 P1 B1 / 2026-05-16）
 *
 * 將 assignment_audit_log.action 欄位從 VARCHAR(10) 擴為 VARCHAR(30)，
 * 以容納完整 STAGE_ADVANCE / STAGE_ROLLBACK / STAGE_REJECT / ASSIGN_ROLE / REVOKE_ROLE 名稱
 * （之前 P0 暫時 truncate 至 10 字元，重構後恢復語意完整）。
 *
 * 對應 spec：
 *   - architecture-spec §AssignmentAuditLog.action union type 擴張
 *   - StageTransitionService 移除 truncate workaround
 *   - F006a §5.5 / §9 audit log 寫入 ASSIGN_ROLE / REVOKE_ROLE
 */
export class AddAuditLogActionVarchar301711360000181 implements MigrationInterface {
  name = 'AddAuditLogActionVarchar301711360000181';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isSqlite = process.env.DB_TYPE === 'sqlite';

    // SQLite 不支援 ALTER COLUMN TYPE；e2e SQLite 直接以 entity length: 30 重建即可，故跳過
    if (isSqlite) {
      return;
    }

    await queryRunner.query(
      `ALTER TABLE assignment_audit_log ALTER COLUMN action TYPE VARCHAR(30)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const isSqlite = process.env.DB_TYPE === 'sqlite';
    if (isSqlite) {
      return;
    }

    await queryRunner.query(
      `ALTER TABLE assignment_audit_log ALTER COLUMN action TYPE VARCHAR(10)`,
    );
  }
}
