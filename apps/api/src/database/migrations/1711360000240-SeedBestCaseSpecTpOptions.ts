import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * v2.0 補 / m24 / F076 v1.3 AC-3 / v1.4.3 case 對齊：best_case / spec_tp 可選值 seed
 *
 * 對應 m22（1711360000220-SeedPooldataFieldWhitelist）留項：
 *   "spec_tp / best_case：依 OBMCODEDF 之後另行補；MVP 此 migration 留空"
 *
 * 本 migration 補上 best_case / spec_tp 兩個 categorical 欄位的可選值。
 *
 * v1.4.3（2026-05-19）case 對齊：column_name 從原 SQL Server `OBPOOLDATA` 大寫慣例
 *   （BEST_CASE / SPEC_TP）改為小寫對齊 PostgreSQL `ob_pool_data` ETL 後表之
 *   snake_case 實際欄位命名（best_case / spec_tp）。
 *
 * 設計範圍：
 *   - 只 INSERT pooldata_field_option（whitelist 已由 m22 建立 best_case / spec_tp 兩筆，
 *     `is_active = true`、`field_type = 'categorical'`）
 *   - 不重複 INSERT pooldata_field_whitelist
 *
 * Seed 內容（[ASSUMPTION] 待真實 OBMCODEDF dump 確認）：
 *   - best_case：'Y'（優質案件）/ 'N'（一般案件）
 *     - 依 F076 v1.3 §4 BR-4 標 [ASSUMPTION]，待 OBMCODEDF OBMTYPE='BEST_CASE' 之 OBMVALUE
 *       dump 後以 m25+ migration 補修對齊
 *   - spec_tp：'01' / '02' / '03'（placeholder）
 *     - 依 F076 v1.3 §4 BR-4 標 [ASSUMPTION]，待 OBMCODEDF OBMTYPE='SPEC_TP' 之 OBMVALUE
 *       dump 後以 m25+ migration 補修對齊
 *
 * Idempotent：
 *   - PostgreSQL：ON CONFLICT (column_name, option_value) DO NOTHING
 *   - SQLite：INSERT OR IGNORE
 *
 * Down：DELETE 限定 best_case / spec_tp IN clause，不動 whitelist（m22 owns）。
 */
export class SeedBestCaseSpecTpOptions1711360000240 implements MigrationInterface {
  name = 'SeedBestCaseSpecTpOptions1711360000240';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isSqlite = process.env.DB_TYPE === 'sqlite';

    type OptionRow = {
      column_name: 'best_case' | 'spec_tp';
      option_value: string;
      option_label: string;
    };

    // [ASSUMPTION] 待真實 OBMCODEDF dump 確認。
    // OBMCODEDF.OBMTYPE='BEST_CASE' 之 OBMVALUE 對應實際業務語意；
    // 若 dump 顯示不同列舉，需以後續 migration（m25+）補修。
    const options: ReadonlyArray<OptionRow> = [
      { column_name: 'best_case', option_value: 'Y', option_label: '優質案件' },
      { column_name: 'best_case', option_value: 'N', option_label: '一般案件' },
      { column_name: 'spec_tp',   option_value: '01', option_label: '特殊類別 01' },
      { column_name: 'spec_tp',   option_value: '02', option_label: '特殊類別 02' },
      { column_name: 'spec_tp',   option_value: '03', option_label: '特殊類別 03' },
    ];

    for (const o of options) {
      const isActiveLiteral = isSqlite ? '1' : 'TRUE';
      const insertSql = isSqlite
        ? `INSERT OR IGNORE INTO pooldata_field_option
             (column_name, option_value, option_label, is_active, deactivation_reason, created_at, updated_at)
           VALUES ('${o.column_name}', '${o.option_value}', '${o.option_label}', ${isActiveLiteral},
                   NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
        : `INSERT INTO pooldata_field_option
             (column_name, option_value, option_label, is_active, deactivation_reason, created_at, updated_at)
           VALUES ('${o.column_name}', '${o.option_value}', '${o.option_label}', ${isActiveLiteral},
                   NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
           ON CONFLICT (column_name, option_value) DO NOTHING`;
      await queryRunner.query(insertSql);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 限定 best_case / spec_tp，避免誤刪部長透過 F076 手動新增的紀錄
    const columnNames = ['best_case', 'spec_tp'];
    const inClause = columnNames.map((n) => `'${n}'`).join(', ');

    await queryRunner.query(
      `DELETE FROM pooldata_field_option WHERE column_name IN (${inClause})`,
    );
    // 注意：不刪 pooldata_field_whitelist（best_case / spec_tp 兩筆由 m22 owns）
  }
}
