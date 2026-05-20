import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * m284 / F050 v2.1 重構（AD-E07-18 §18.3 M4 / F075 v1.5 / F076 v1.5 / US-125 AC-2 / GAP-LIST §E3+§E4）
 *
 * 將 `case_status`（案件結清期別）加入 pooldata_field_whitelist 並 seed 4 筆 options，
 * 取代原 F068 `ob_code_df.tbl_id='CASE_STATUS'` 之 4 筆代碼（M5 將刪 ob_code_df 對應紀錄）。
 *
 * 來源：reference/DumpData/OBMCODEDF_20260505.csv TBL_ID='22'（m150 轉碼後 'CASE_STATUS'）
 *
 * 4 筆業務語意對照 F050 v2.1 §5.1.1：
 *   - 01  期中(不含當月滿期)
 *   - 02  中結
 *   - 03  滿期(含當月滿期)
 *   - 04  滿期
 *
 * up() 順序（FK 安全）：
 *   1. INSERT pooldata_field_whitelist (case_status, '案件結清期別', 'categorical', TRUE) ON CONFLICT DO NOTHING
 *   2. INSERT 4 筆 pooldata_field_option ON CONFLICT (column_name, option_value) DO NOTHING
 *
 * down() 順序（FK 安全 — 先子表）：
 *   1. DELETE pooldata_field_option WHERE column_name='case_status'
 *   2. DELETE pooldata_field_whitelist WHERE column_name='case_status'
 *
 * Idempotency：
 *   - PG：ON CONFLICT DO NOTHING
 *   - SQLite：INSERT OR IGNORE
 *
 * 對應 test spec：MT-M4-001 / MT-M4-002 / MT-M4-003 / MT-M4-004 / TS-F076-001 / TS-F076-005
 */
export class SeedCaseStatusWhitelistAndOptions1711360000284
  implements MigrationInterface
{
  name = 'SeedCaseStatusWhitelistAndOptions1711360000284';

  private static readonly CASE_STATUS_OPTIONS: ReadonlyArray<{
    option_value: string;
    option_label: string;
  }> = [
    { option_value: '01', option_label: '期中(不含當月滿期)' },
    { option_value: '02', option_label: '中結' },
    { option_value: '03', option_label: '滿期(含當月滿期)' },
    { option_value: '04', option_label: '滿期' },
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isSqlite = process.env.DB_TYPE === 'sqlite';
    const isActiveLiteral = isSqlite ? '1' : 'TRUE';

    // Step 1: INSERT whitelist（母表先）
    const whitelistSql = isSqlite
      ? `INSERT OR IGNORE INTO pooldata_field_whitelist
           (column_name, display_name, field_type, is_active, created_at, updated_at)
         VALUES ('case_status', '案件結清期別', 'categorical', ${isActiveLiteral},
                 CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
      : `INSERT INTO pooldata_field_whitelist
           (column_name, display_name, field_type, is_active, created_at, updated_at)
         VALUES ('case_status', '案件結清期別', 'categorical', ${isActiveLiteral},
                 CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         ON CONFLICT (column_name) DO NOTHING`;
    await queryRunner.query(whitelistSql);

    // Step 2: INSERT 4 筆 options
    for (const opt of SeedCaseStatusWhitelistAndOptions1711360000284.CASE_STATUS_OPTIONS) {
      const insertSql = isSqlite
        ? `INSERT OR IGNORE INTO pooldata_field_option
             (column_name, option_value, option_label, is_active, deactivation_reason, created_at, updated_at)
           VALUES ('case_status', '${opt.option_value}', '${opt.option_label}', ${isActiveLiteral},
                   NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
        : `INSERT INTO pooldata_field_option
             (column_name, option_value, option_label, is_active, deactivation_reason, created_at, updated_at)
           VALUES ('case_status', '${opt.option_value}', '${opt.option_label}', ${isActiveLiteral},
                   NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
           ON CONFLICT (column_name, option_value) DO NOTHING`;
      await queryRunner.query(insertSql);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Step 1: DELETE options（子表先 — FK 安全）
    await queryRunner.query(
      `DELETE FROM pooldata_field_option WHERE column_name = 'case_status'`,
    );

    // Step 2: DELETE whitelist
    await queryRunner.query(
      `DELETE FROM pooldata_field_whitelist WHERE column_name = 'case_status'`,
    );
  }
}
