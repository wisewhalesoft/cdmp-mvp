import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * P1 B5 / m22 / F075 v1.3 AC-1 / F076 v1.3 AC-3：
 *   D-PFW-02：Seed 8 個白名單欄位 + 對應類別型可選值
 *
 * 白名單 8 欄位（F075 AC-1）：
 *   - PROD_KIND   (categorical, 啟用)
 *   - LIST_TYPE   (categorical, 啟用)
 *   - BEST_CASE   (categorical, 啟用)
 *   - SPEC_TP     (categorical, 啟用)
 *   - CASEYEAR    (categorical, 啟用)
 *   - SETTLE_SRC  (categorical, 啟用)
 *   - MONTH_CNT   (numeric,     啟用)
 *   - PAYT_TERM   (numeric,     停用)
 *
 * 對應 categorical 可選值（F076 AC-3）：
 *   - PROD_KIND  : 01/02/03
 *   - LIST_TYPE  : 01/02/03
 *   - CASEYEAR   : 0..6 + 99
 *   - SETTLE_SRC : Y/N
 *   - SPEC_TP / BEST_CASE：依 OBMCODEDF 之後另行補；MVP 此 migration 留空
 *
 * Idempotent：採 ON CONFLICT (column_name) DO NOTHING（PostgreSQL）/
 *   INSERT OR IGNORE（SQLite 條件分支）。對應之 pooldata_field_option 同 pattern
 *   採複合 PK 衝突忽略。
 *
 * 分離至獨立 migration 之原因（依使用者指示）：seed 邏輯與 schema 解耦，
 *   方便單元測試僅 mock seed 行為，並利於日後追加 seed 而不動 table schema。
 */
export class SeedPooldataFieldWhitelist1711360000220 implements MigrationInterface {
  name = 'SeedPooldataFieldWhitelist1711360000220';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isSqlite = process.env.DB_TYPE === 'sqlite';

    type FieldRow = {
      column_name: string;
      display_name: string;
      field_type: 'numeric' | 'categorical' | 'date';
      is_active: boolean;
    };
    type OptionRow = {
      column_name: string;
      option_value: string;
      option_label: string;
    };

    const fields: ReadonlyArray<FieldRow> = [
      { column_name: 'PROD_KIND',  display_name: '產品類別',     field_type: 'categorical', is_active: true },
      { column_name: 'LIST_TYPE',  display_name: '名單類型',     field_type: 'categorical', is_active: true },
      { column_name: 'BEST_CASE',  display_name: '優質案件',     field_type: 'categorical', is_active: true },
      { column_name: 'SPEC_TP',    display_name: '特殊類別',     field_type: 'categorical', is_active: true },
      { column_name: 'CASEYEAR',   display_name: '案件年度',     field_type: 'categorical', is_active: true },
      { column_name: 'SETTLE_SRC', display_name: '結清來源',     field_type: 'categorical', is_active: true },
      { column_name: 'MONTH_CNT',  display_name: '撈取月份計數', field_type: 'numeric',     is_active: true },
      { column_name: 'PAYT_TERM',  display_name: '繳款期數',     field_type: 'numeric',     is_active: false },
    ];

    const options: ReadonlyArray<OptionRow> = [
      // PROD_KIND
      { column_name: 'PROD_KIND', option_value: '01', option_label: '汽車新車' },
      { column_name: 'PROD_KIND', option_value: '02', option_label: '機車' },
      { column_name: 'PROD_KIND', option_value: '03', option_label: '其他商品' },
      // LIST_TYPE
      { column_name: 'LIST_TYPE', option_value: '01', option_label: '期中' },
      { column_name: 'LIST_TYPE', option_value: '02', option_label: '中結' },
      { column_name: 'LIST_TYPE', option_value: '03', option_label: '滿期' },
      // CASEYEAR
      { column_name: 'CASEYEAR', option_value: '0', option_label: '0 年' },
      { column_name: 'CASEYEAR', option_value: '1', option_label: '1 年' },
      { column_name: 'CASEYEAR', option_value: '2', option_label: '2 年' },
      { column_name: 'CASEYEAR', option_value: '3', option_label: '3 年' },
      { column_name: 'CASEYEAR', option_value: '4', option_label: '4 年' },
      { column_name: 'CASEYEAR', option_value: '5', option_label: '5 年' },
      { column_name: 'CASEYEAR', option_value: '6', option_label: '6 年' },
      { column_name: 'CASEYEAR', option_value: '99', option_label: '不限年數' },
      // SETTLE_SRC
      { column_name: 'SETTLE_SRC', option_value: 'Y', option_label: '含他行代償' },
      { column_name: 'SETTLE_SRC', option_value: 'N', option_label: '不含他行代償' },
    ];

    // Step 1：seed pooldata_field_whitelist
    for (const r of fields) {
      const isActiveLiteral = isSqlite ? (r.is_active ? '1' : '0') : (r.is_active ? 'TRUE' : 'FALSE');
      const insertSql = isSqlite
        ? `INSERT OR IGNORE INTO pooldata_field_whitelist
             (column_name, display_name, field_type, is_active, created_at, updated_at)
           VALUES ('${r.column_name}', '${r.display_name}', '${r.field_type}', ${isActiveLiteral},
                   CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
        : `INSERT INTO pooldata_field_whitelist
             (column_name, display_name, field_type, is_active, created_at, updated_at)
           VALUES ('${r.column_name}', '${r.display_name}', '${r.field_type}', ${isActiveLiteral},
                   CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
           ON CONFLICT (column_name) DO NOTHING`;
      await queryRunner.query(insertSql);
    }

    // Step 2：seed pooldata_field_option
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
    // 限定 seed 範圍內欄位，避免誤刪部長透過 F075 / F076 手動新增的紀錄
    const fieldNames = [
      'PROD_KIND', 'LIST_TYPE', 'BEST_CASE', 'SPEC_TP',
      'CASEYEAR', 'SETTLE_SRC', 'MONTH_CNT', 'PAYT_TERM',
    ];
    const inClause = fieldNames.map((n) => `'${n}'`).join(', ');

    // 先刪子表（即使有 CASCADE，明示 DELETE 利於 down 行為驗證）
    await queryRunner.query(
      `DELETE FROM pooldata_field_option WHERE column_name IN (${inClause})`,
    );
    await queryRunner.query(
      `DELETE FROM pooldata_field_whitelist WHERE column_name IN (${inClause})`,
    );
  }
}
