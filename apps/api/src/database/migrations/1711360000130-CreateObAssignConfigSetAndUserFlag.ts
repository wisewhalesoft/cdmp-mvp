import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

/**
 * E07 Track A — M3 (合併 M3+M4): 三項變更
 *
 * 1. 建立 ob_assign_config（Key-Value 設定表，AD-E07-5）
 *    - 初始 Seed：cr_reassignment_enabled = 'false'（F059 CR 回分全域開關）
 * 2. 建立 ob_assign_set（Stage 0 每日比例輸出表，OBASSIGNSET 對應）
 * 3. ALTER users 新增 is_sales_manager BOOLEAN NOT NULL DEFAULT FALSE
 *    （補 OQ-E07-19 落差 2/4 — spec 多處引用此欄位但實作端缺漏）
 *    註：對應 entity（apps/api/src/database/entities/user.entity.ts）需同步補欄位
 */
export class CreateObAssignConfigSetAndUserFlag1711360000130 implements MigrationInterface {
  name = 'CreateObAssignConfigSetAndUserFlag1711360000130';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // === 1. ob_assign_config （AD-E07-5 Key-Value 全域設定）===
    await queryRunner.createTable(
      new Table({
        name: 'ob_assign_config',
        columns: [
          { name: 'config_key', type: 'varchar', length: '50', isPrimary: true, isNullable: false },
          { name: 'config_value', type: 'text', isNullable: false },
          { name: 'updated_at', type: 'timestamp', isNullable: false, default: 'CURRENT_TIMESTAMP' },
          { name: 'updated_by', type: 'uuid', isNullable: true }, // FK → users.id（軟引用）
          { name: 'description', type: 'text', isNullable: true },
        ],
      }),
      true,
    );

    // Seed: cr_reassignment_enabled (F059 CR 回分全域開關)
    await queryRunner.query(
      `INSERT INTO ob_assign_config (config_key, config_value, description)
       VALUES ('cr_reassignment_enabled', 'false', 'CR 回分全域開關（F059）')
       ON CONFLICT (config_key) DO NOTHING`,
    );

    // === 2. ob_assign_set （OBASSIGNSET — Stage 0 每日比例輸出，AD-E07-9 L3 系統產出）===
    await queryRunner.createTable(
      new Table({
        name: 'ob_assign_set',
        columns: [
          { name: 'list_no', type: 'varchar', length: '20', isNullable: true }, // OBASSIGNSET 原表 NULL
          { name: 'workdt', type: 'varchar', length: '10', isNullable: false }, // YYYYMM01 作業月份
          { name: 'casedt', type: 'varchar', length: '10', isNullable: false }, // YYYYMMDD 工作日日期
          { name: 'ratio_rate', type: 'integer', isNullable: false }, // 千分比
        ],
      }),
      true,
    );
    await queryRunner.createIndex(
      'ob_assign_set',
      new TableIndex({
        name: 'idx_ob_assign_set_workdt_list',
        columnNames: ['workdt', 'list_no'],
      }),
    );

    // === 3. users.is_sales_manager 欄位補建（OQ-E07-19）===
    // 用 raw SQL（addColumn 不支援 IF NOT EXISTS 等冪等運算）
    await queryRunner.query(
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS is_sales_manager BOOLEAN NOT NULL DEFAULT FALSE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 反序
    await queryRunner.query(`ALTER TABLE users DROP COLUMN IF EXISTS is_sales_manager`);
    await queryRunner.dropTable('ob_assign_set', true);
    await queryRunner.dropTable('ob_assign_config', true);
  }
}
