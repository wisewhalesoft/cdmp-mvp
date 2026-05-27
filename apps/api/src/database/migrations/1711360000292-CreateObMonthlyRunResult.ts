import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

/**
 * m292 / F094 v1.0 / AD-E07-25 §25.4（DP-AD25-2 / DP-AD25-6，Phase A）
 * ── 建立 ob_monthly_run_result（月跑分派提案結果表，單源化核心產出）
 *
 * 月跑 Stage 1~4 之寫入 / 讀取目標由 ob_pool_data_list（data_source='monthly_run'）切換至本表，
 * 使 ob_pool_data_list 回歸「ETL 單一來源」語意（F090 v2.0）。與 F091 v2.0 + F095 同批 deploy（Phase A）。
 *
 * 表結構（data-model.md `ob_monthly_run_result` 為權威）：
 *   - PK：(run_id, list_no, orgno, appl_no)
 *   - FK：fk_omrr_run → assignment_run(run_id) ON DELETE CASCADE（run 刪除時級聯清除）
 *   - assignday VARCHAR(100) NULL（Forward-compat，DP-AD25-6）
 *   - result_status VARCHAR(20) NULL DEFAULT 'PENDING'
 *   - created_at / updated_at TIMESTAMP（PostgreSQL；entity 用 dateColumnType helper）
 *   - 索引：idx_omrr_run_id / idx_omrr_list_run / idx_omrr_custo_no（partial）/ idx_omrr_assignday（partial）
 *
 * 可逆：down() DROP TABLE（CASCADE 由 FK 定義，DROP TABLE 自動帶走 FK / index）。
 *
 * SQLite e2e 走 entity synchronize:true → 本 migration up/down no-op；entity 為單一事實來源
 * （對齊 m289 / m291 慣例）。
 *
 * ⚠️ Entity 必須與 migration 保持一致：任一邊改動，另一邊同步修
 * （ob-monthly-run-result.entity.ts 已同步定義 PK / FK / 索引 / dateColumnType）
 */
export class CreateObMonthlyRunResult1711360000292
  implements MigrationInterface
{
  name = 'CreateObMonthlyRunResult1711360000292';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isSqlite = process.env.DB_TYPE === 'sqlite';
    if (isSqlite) return;

    await queryRunner.createTable(
      new Table({
        name: 'ob_monthly_run_result',
        columns: [
          // PK 四欄
          { name: 'run_id', type: 'uuid', isPrimary: true, isNullable: false },
          { name: 'list_no', type: 'varchar', length: '100', isPrimary: true, isNullable: false },
          { name: 'orgno', type: 'varchar', length: '2', isPrimary: true, isNullable: false },
          { name: 'appl_no', type: 'varchar', length: '10', isPrimary: true, isNullable: false },
          // 案件基礎
          { name: 'custo_no', type: 'varchar', length: '11', isNullable: true },
          { name: 'settle_src', type: 'text', isNullable: false, default: "'N'" },
          // Stage 2 計分
          { name: 'score', type: 'integer', isNullable: true },
          { name: 'card_level', type: 'varchar', length: '1', isNullable: true },
          { name: 'tier_level', type: 'varchar', length: '5', isNullable: true },
          // Stage 3 CR
          { name: 'is_cr', type: 'varchar', length: '1', isNullable: true },
          { name: 'cr_id', type: 'varchar', length: '20', isNullable: true },
          { name: 'cr_nm', type: 'varchar', length: '50', isNullable: true },
          // Stage 4 分派
          { name: 'dept_id', type: 'varchar', length: '6', isNullable: true },
          { name: 'emplid', type: 'varchar', length: '10', isNullable: true },
          { name: 'emplid_deptid', type: 'varchar', length: '6', isNullable: true },
          // 業務回填狀態
          { name: 'result_status', type: 'varchar', length: '20', isNullable: true, default: "'PENDING'" },
          // Forward-compat：派案日期（DP-AD25-6）
          { name: 'assignday', type: 'varchar', length: '100', isNullable: true },
          // 稽核
          { name: 'created_at', type: 'timestamp', isNullable: false, default: 'CURRENT_TIMESTAMP' },
          { name: 'updated_at', type: 'timestamp', isNullable: false, default: 'CURRENT_TIMESTAMP' },
        ],
      }),
      true,
    );

    // FK → assignment_run(run_id) ON DELETE CASCADE
    await queryRunner.createForeignKey(
      'ob_monthly_run_result',
      new TableForeignKey({
        name: 'fk_omrr_run',
        columnNames: ['run_id'],
        referencedTableName: 'assignment_run',
        referencedColumnNames: ['run_id'],
        onDelete: 'CASCADE',
      }),
    );

    // 索引
    await queryRunner.createIndex(
      'ob_monthly_run_result',
      new TableIndex({ name: 'idx_omrr_run_id', columnNames: ['run_id'] }),
    );
    await queryRunner.createIndex(
      'ob_monthly_run_result',
      new TableIndex({ name: 'idx_omrr_list_run', columnNames: ['list_no', 'run_id'] }),
    );
    // partial index（PostgreSQL）：custo_no / assignday IS NOT NULL
    await queryRunner.createIndex(
      'ob_monthly_run_result',
      new TableIndex({
        name: 'idx_omrr_custo_no',
        columnNames: ['custo_no'],
        where: 'custo_no IS NOT NULL',
      }),
    );
    await queryRunner.createIndex(
      'ob_monthly_run_result',
      new TableIndex({
        name: 'idx_omrr_assignday',
        columnNames: ['assignday'],
        where: 'assignday IS NOT NULL',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const isSqlite = process.env.DB_TYPE === 'sqlite';
    if (isSqlite) return;

    // DROP TABLE 自動帶走 FK / index（不影響 FK 目標表 assignment_run）
    await queryRunner.dropTable('ob_monthly_run_result', true);
  }
}
