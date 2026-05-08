import { MigrationInterface, QueryRunner, Table, TableIndex, TableForeignKey } from 'typeorm';

/**
 * E07 Track A — M2: 建立 E07 月跑系統表（4 張，非 ob_ 前綴）
 *
 * 對應：data-model.md §E07 新建表（assignment_run / assignment_run_snapshot / assignment_audit_log）
 *      + architecture-spec.md AD-E07-7（assignment_run_stage_log）
 *
 * 表清單：
 *   1. assignment_run            月跑執行紀錄（PK run_id UUID）
 *   2. assignment_run_snapshot   三份快照（config / input_list / result，PK snapshot_id UUID）
 *   3. assignment_run_stage_log  Stage 進度日誌（PK BIGSERIAL，AD-E07-7）
 *   4. assignment_audit_log      E07 CRUD 稽核（PK log_id UUID，3 年保留）
 *
 * FK 設計：
 *   - assignment_run_snapshot.run_id → assignment_run.run_id ON DELETE CASCADE
 *   - assignment_run_stage_log.run_id → assignment_run.run_id ON DELETE CASCADE
 *   - triggered_by / actor_id 對應 users.id 但不設 FK（避免緊耦合，users 採軟刪除）
 */
export class CreateE07AssignmentTables1711360000120 implements MigrationInterface {
  name = 'CreateE07AssignmentTables1711360000120';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // === 1. assignment_run ===
    await queryRunner.createTable(
      new Table({
        name: 'assignment_run',
        columns: [
          {
            name: 'run_id',
            type: 'uuid',
            isPrimary: true,
            default: 'gen_random_uuid()',
          },
          { name: 'project_workym', type: 'varchar', length: '6', isNullable: false }, // YYYYMM
          { name: 'status', type: 'varchar', length: '20', isNullable: false }, // pending / running / completed / failed
          { name: 'triggered_by', type: 'uuid', isNullable: false }, // FK → users.id（不約束）
          { name: 'started_at', type: 'timestamp', isNullable: true },
          { name: 'finished_at', type: 'timestamp', isNullable: true },
          { name: 'duration_ms', type: 'integer', isNullable: true },
          { name: 'total_cases', type: 'integer', isNullable: true },
          { name: 'total_lists', type: 'integer', isNullable: true },
          { name: 'error_message', type: 'text', isNullable: true },
          { name: 'created_at', type: 'timestamp', isNullable: false, default: 'CURRENT_TIMESTAMP' },
        ],
      }),
      true,
    );
    await queryRunner.createIndex(
      'assignment_run',
      new TableIndex({
        name: 'idx_assignment_run_workym_status',
        columnNames: ['project_workym', 'status'],
      }),
    );

    // === 2. assignment_run_snapshot ===
    await queryRunner.createTable(
      new Table({
        name: 'assignment_run_snapshot',
        columns: [
          {
            name: 'snapshot_id',
            type: 'uuid',
            isPrimary: true,
            default: 'gen_random_uuid()',
          },
          { name: 'run_id', type: 'uuid', isNullable: false }, // FK
          { name: 'snapshot_type', type: 'varchar', length: '20', isNullable: false }, // config / input_list / result
          { name: 'payload', type: 'jsonb', isNullable: false },
          { name: 'created_at', type: 'timestamp', isNullable: false, default: 'CURRENT_TIMESTAMP' },
        ],
      }),
      true,
    );
    await queryRunner.createForeignKey(
      'assignment_run_snapshot',
      new TableForeignKey({
        name: 'fk_assignment_run_snapshot_run_id',
        columnNames: ['run_id'],
        referencedTableName: 'assignment_run',
        referencedColumnNames: ['run_id'],
        onDelete: 'CASCADE',
      }),
    );
    await queryRunner.createIndex(
      'assignment_run_snapshot',
      new TableIndex({
        name: 'idx_assignment_run_snapshot_run_type',
        columnNames: ['run_id', 'snapshot_type'],
      }),
    );

    // === 3. assignment_run_stage_log（AD-E07-7）===
    await queryRunner.createTable(
      new Table({
        name: 'assignment_run_stage_log',
        columns: [
          {
            name: 'id',
            type: 'bigserial',
            isPrimary: true,
          },
          { name: 'run_id', type: 'uuid', isNullable: false }, // FK
          { name: 'stage_no', type: 'smallint', isNullable: false }, // 0~4
          { name: 'status', type: 'varchar', length: '10', isNullable: false }, // running / completed / failed
          { name: 'started_at', type: 'timestamp', isNullable: false },
          { name: 'finished_at', type: 'timestamp', isNullable: true },
          { name: 'processed_count', type: 'integer', isNullable: true },
          { name: 'error_message', type: 'text', isNullable: true },
        ],
      }),
      true,
    );
    await queryRunner.createForeignKey(
      'assignment_run_stage_log',
      new TableForeignKey({
        name: 'fk_assignment_run_stage_log_run_id',
        columnNames: ['run_id'],
        referencedTableName: 'assignment_run',
        referencedColumnNames: ['run_id'],
        onDelete: 'CASCADE',
      }),
    );
    await queryRunner.createIndex(
      'assignment_run_stage_log',
      new TableIndex({
        name: 'idx_assignment_run_stage_log_run_stage',
        columnNames: ['run_id', 'stage_no'],
      }),
    );

    // === 4. assignment_audit_log ===
    await queryRunner.createTable(
      new Table({
        name: 'assignment_audit_log',
        columns: [
          {
            name: 'log_id',
            type: 'uuid',
            isPrimary: true,
            default: 'gen_random_uuid()',
          },
          { name: 'entity_type', type: 'varchar', length: '50', isNullable: false }, // 表名
          { name: 'entity_id', type: 'varchar', length: '100', isNullable: false }, // 字串化 ID
          { name: 'action', type: 'varchar', length: '10', isNullable: false }, // CREATE / UPDATE / DELETE / RUN
          { name: 'actor_id', type: 'uuid', isNullable: false }, // FK → users.id（不約束）
          { name: 'actor_name', type: 'varchar', length: '100', isNullable: false }, // 快照
          { name: 'before_value', type: 'jsonb', isNullable: true },
          { name: 'after_value', type: 'jsonb', isNullable: true },
          { name: 'ip_address', type: 'varchar', length: '45', isNullable: true }, // IPv6 max 45
          { name: 'created_at', type: 'timestamp', isNullable: false, default: 'CURRENT_TIMESTAMP' },
        ],
      }),
      true,
    );
    await queryRunner.createIndex(
      'assignment_audit_log',
      new TableIndex({
        name: 'idx_assignment_audit_log_entity',
        columnNames: ['entity_type', 'entity_id'],
      }),
    );
    await queryRunner.createIndex(
      'assignment_audit_log',
      new TableIndex({
        name: 'idx_assignment_audit_log_actor',
        columnNames: ['actor_id', 'created_at'],
      }),
    );
    await queryRunner.createIndex(
      'assignment_audit_log',
      new TableIndex({
        name: 'idx_assignment_audit_log_created',
        columnNames: ['created_at'], // 排程清理 3 年舊紀錄
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('assignment_audit_log', true);
    await queryRunner.dropTable('assignment_run_stage_log', true);
    await queryRunner.dropTable('assignment_run_snapshot', true);
    await queryRunner.dropTable('assignment_run', true);
  }
}
