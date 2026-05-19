import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * m28 / F075 v1.4.6 / F076 v1.4.6：對齊舊系統 OBZ020 之 5 欄篩選欄位
 *
 * Root cause（v1.4.6 changelog）：原 m22 seed 8 筆（含 best_case / month_cnt / payt_term）
 * 與舊系統 `reference/Areas/OBZ/Views/OBZ020/edit.cshtml` 之名單篩選欄位範圍不對齊。
 * OBZ020 共 9 欄中：
 *   - 3 欄（list_period_start / list_period_end / list_interval）已由 `ob_list_definition`
 *     一級欄位承擔，不屬於 whitelist 篩選欄位
 *   - 1 欄（list_nm）為名單名稱，非篩選欄位
 *   - 剩 5 欄才是真正的篩選欄位：prod_kind / list_type / spec_tp / caseyear / settle_src
 *
 * 決策依據：
 *   - best_case：runtime 未讀取（fn_calc_tier_level.sql / assignment-run-pipeline.service.ts
 *     皆未引用）→ 拔除
 *   - month_cnt：scoring 之 LIST_MONTH 計分碼直接讀 ob_pool_data.month_cnt column（不經
 *     whitelist），且名單期數範圍 filter 由 ob_list_definition.list_period_start / end /
 *     interval 三個一級欄位承擔 → 從 whitelist 拔除（**ob_pool_data.month_cnt column 保留**）
 *   - payt_term：runtime 未讀取 → 拔除
 *
 * 本 migration 行為：
 *   - up()：
 *     - Step 1：DELETE pooldata_field_option WHERE column_name IN ('best_case','month_cnt','payt_term')
 *       （清除 m24 之 best_case Y/N seed；month_cnt/payt_term 為 numeric 通常無 options，DELETE 為防呆 idempotent）
 *     - Step 2：DELETE pooldata_field_whitelist WHERE column_name IN ('best_case','month_cnt','payt_term')
 *     - Step 3（belt-and-braces）：重 seed 5 個保留欄位（idempotent ON CONFLICT），確保 DB
 *       最終狀態與 v1.4.6 spec AC-1 一致，不論 m22 是否曾被 skip
 *
 *   - down()：
 *     - 還原 m22 + m24 之 3 筆 whitelist + best_case Y/N 兩筆 options（idempotent INSERT）
 *
 * 不動範圍：
 *   - prod_kind / list_type / spec_tp / caseyear / settle_src 欄位之既有 options 不動
 *   - ob_pool_data 表結構（含 month_cnt / payt_term / best_case 三 column）保留
 *   - m22 / m24 之 up() / down() 不修改（歷史 migration 保持原貌）
 */
export class RealignWhitelistToObz0201711360000280 implements MigrationInterface {
  name = 'RealignWhitelistToObz0201711360000280';

  private static readonly REMOVED_FIELDS: ReadonlyArray<string> = [
    'best_case',
    'month_cnt',
    'payt_term',
  ];

  private static readonly KEEP_FIELDS: ReadonlyArray<{
    column_name: string;
    display_name: string;
    field_type: 'categorical';
  }> = [
    { column_name: 'prod_kind',  display_name: '產品類別',                 field_type: 'categorical' },
    { column_name: 'list_type',  display_name: '名單類型',                 field_type: 'categorical' },
    { column_name: 'spec_tp',    display_name: '專案類別',                 field_type: 'categorical' },
    { column_name: 'caseyear',   display_name: '進件/滿期/中結年數',       field_type: 'categorical' },
    { column_name: 'settle_src', display_name: '被他行代償案件',           field_type: 'categorical' },
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isSqlite = process.env.DB_TYPE === 'sqlite';
    const removedInClause = RealignWhitelistToObz0201711360000280.REMOVED_FIELDS
      .map((n) => `'${n}'`)
      .join(', ');

    // Step 1：移除 3 欄之 options（FK 安全：先子表）
    await queryRunner.query(
      `DELETE FROM pooldata_field_option WHERE column_name IN (${removedInClause})`,
    );

    // Step 2：移除 3 欄之 whitelist
    await queryRunner.query(
      `DELETE FROM pooldata_field_whitelist WHERE column_name IN (${removedInClause})`,
    );

    // Step 3（belt-and-braces）：重 seed 5 個保留欄位（idempotent）
    for (const r of RealignWhitelistToObz0201711360000280.KEEP_FIELDS) {
      const isActiveLiteral = isSqlite ? '1' : 'TRUE';
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
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const isSqlite = process.env.DB_TYPE === 'sqlite';

    // 還原 m22 移除之 3 筆 whitelist（best_case categorical / month_cnt numeric / payt_term numeric inactive）
    type FieldRow = {
      column_name: string;
      display_name: string;
      field_type: 'categorical' | 'numeric';
      is_active: boolean;
    };
    const restoreFields: ReadonlyArray<FieldRow> = [
      { column_name: 'best_case', display_name: '優質案件',     field_type: 'categorical', is_active: true  },
      { column_name: 'month_cnt', display_name: '撈取月份計數', field_type: 'numeric',     is_active: true  },
      { column_name: 'payt_term', display_name: '繳款期數',     field_type: 'numeric',     is_active: false },
    ];

    for (const r of restoreFields) {
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

    // 還原 m24 best_case Y/N options
    type OptionRow = { column_name: string; option_value: string; option_label: string };
    const restoreOptions: ReadonlyArray<OptionRow> = [
      { column_name: 'best_case', option_value: 'Y', option_label: '優質案件' },
      { column_name: 'best_case', option_value: 'N', option_label: '一般案件' },
    ];

    for (const o of restoreOptions) {
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
}
