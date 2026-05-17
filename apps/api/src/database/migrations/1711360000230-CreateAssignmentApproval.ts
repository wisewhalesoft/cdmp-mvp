import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

/**
 * E07 P2 補完 / m23 / F087 v1.1 BR-11 + F082 v1.1 §7.x latestRejection 觸發機制：
 *   建立 `assignment_approval` 表，記錄簽核操作（approve / reject）紀錄。
 *
 * 設計重點（F087 v1.1 + A-1 假設）：
 *   - 每次 POST /reject 寫入一筆 action='reject' + reject_reason
 *   - F086 核准寫入一筆 action='approve'（本批次先建表，F086 後續批次接寫入）
 *   - F082 GET response 依 `WHERE list_no=:listNo AND action='reject' ORDER BY approved_at DESC LIMIT 1`
 *     取最新拒絕紀錄回填 `latestRejection`；最近一筆為 approve → null
 *   - 保留所有歷史簽核紀錄（不清空，AC-3 假設）
 *
 * Schema（A-1 假設對齊）：
 *   - approval_id     UUID PK
 *   - list_no         VARCHAR(11) NOT NULL（FK 業務上指 ob_list_definition.list_no，不設硬 FK 避免緊耦合）
 *   - action          VARCHAR(10) NOT NULL CHECK ('approve','reject')
 *   - reject_reason   VARCHAR(500) NULL（action='reject' 時必填，由應用層保證）
 *   - approver_id     UUID NOT NULL
 *   - approver_name   VARCHAR(100) NULL
 *   - approver_role   VARCHAR(20) NULL（director / admin 等）
 *   - approved_at     timestamp NOT NULL default CURRENT_TIMESTAMP
 *   - created_at      timestamp NOT NULL default CURRENT_TIMESTAMP
 *
 * Index：(list_no, approved_at DESC) — 支援 F082 GET 最新 reject 查詢。
 */
export class CreateAssignmentApproval1711360000230 implements MigrationInterface {
  name = 'CreateAssignmentApproval1711360000230';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'assignment_approval',
        columns: [
          {
            name: 'approval_id',
            type: 'uuid',
            isPrimary: true,
            default: 'gen_random_uuid()',
          },
          { name: 'list_no', type: 'varchar', length: '11', isNullable: false },
          { name: 'action', type: 'varchar', length: '10', isNullable: false },
          { name: 'reject_reason', type: 'varchar', length: '500', isNullable: true },
          { name: 'approver_id', type: 'uuid', isNullable: false },
          { name: 'approver_name', type: 'varchar', length: '100', isNullable: true },
          { name: 'approver_role', type: 'varchar', length: '20', isNullable: true },
          {
            name: 'approved_at',
            type: 'timestamp',
            isNullable: false,
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'created_at',
            type: 'timestamp',
            isNullable: false,
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'assignment_approval',
      new TableIndex({
        name: 'idx_assignment_approval_list_approved',
        columnNames: ['list_no', 'approved_at'],
      }),
    );
    await queryRunner.createIndex(
      'assignment_approval',
      new TableIndex({
        name: 'idx_assignment_approval_list_action',
        columnNames: ['list_no', 'action'],
      }),
    );

    // CHECK constraint（PostgreSQL；SQLite 由應用層保證）
    try {
      await queryRunner.query(
        `ALTER TABLE "assignment_approval" ADD CONSTRAINT "chk_assignment_approval_action" CHECK ("action" IN ('approve','reject'))`,
      );
    } catch {
      // SQLite 不支援 ADD CONSTRAINT，忽略
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    try {
      await queryRunner.query(
        `ALTER TABLE "assignment_approval" DROP CONSTRAINT IF EXISTS "chk_assignment_approval_action"`,
      );
    } catch {
      // ignore
    }
    await queryRunner.dropIndex('assignment_approval', 'idx_assignment_approval_list_action');
    await queryRunner.dropIndex('assignment_approval', 'idx_assignment_approval_list_approved');
    await queryRunner.dropTable('assignment_approval');
  }
}
