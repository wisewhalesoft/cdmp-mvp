import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * m283 / F050 v2.1 重構（AD-E07-18 §18.3 M3 / F076 v1.5 §AC-3 / GAP-LIST §E5）
 *
 * 將 `pooldata_field_option.column_name='spec_tp'` 從 m24 placeholder 3 筆
 *   （01 / 02 / 03 / 「特殊類別 0N」）升級為真實 OBMCODEDF dump 32 筆。
 *
 * 來源：reference/DumpData/OBMCODEDF_20260505.csv TBL_ID='02'（m150 轉碼後 DB 為 'SPEC_TP'）。
 *
 * C1+C2 spec 補修（commit 6d3a9c6）已對齊：
 *   - 原 spec / test 寫 TBL_ID='09' 為筆誤；'09' 在 CSV 僅 2 筆（屬其他用途）。
 *   - 真正的 SPEC_TP 32 筆位於 CSV TBL_ID='02'，m150 轉碼後 DB 之 tbl_id 值為 'SPEC_TP'。
 *
 * 32 筆內容**硬編碼**進本 migration source（不從 CSV 動態讀取，
 *   避免 migration 對 reference/DumpData 檔案存在性產生執行期依賴）。
 *
 * up() 邏輯：
 *   1. DELETE column_name='spec_tp'（清 m24 placeholder 3 筆）
 *   2. 32 筆 INSERT，PG 用 ON CONFLICT (column_name, option_value) DO UPDATE；
 *      SQLite 用 INSERT OR REPLACE（達到 UPSERT 冪等）
 *   3. 不動 pooldata_field_whitelist（spec_tp whitelist 由 m22 owns）
 *
 * down() 邏輯：
 *   - DELETE column_name='spec_tp'
 *   - 還原 m24 placeholder 3 筆（01 / 02 / 03 / 「特殊類別 0N」）以維持 down 對稱
 *
 * Idempotency：
 *   - PG：ON CONFLICT (column_name, option_value) DO UPDATE
 *   - SQLite：INSERT OR REPLACE
 *   - DELETE + UPSERT 組合冪等
 *
 * 對應 test spec：MT-M3-001 / MT-M3-002 / MT-M3-003 / TS-F076-003 / TS-F076-004
 */
export class UpsertSpecTpOptions321711360000283 implements MigrationInterface {
  name = 'UpsertSpecTpOptions321711360000283';

  /**
   * 32 筆 SPEC_TP options（CSV TBL_ID='02' 真實 dump）
   * 來源欄位映射：OBMVALUE → option_value；OBMCNAME1 → option_label
   */
  private static readonly SPEC_TP_OPTIONS: ReadonlyArray<{
    option_value: string;
    option_label: string;
  }> = [
    { option_value: '01', option_label: '新車' },
    { option_value: '02', option_label: '中古車' },
    { option_value: '03', option_label: '原融' },
    { option_value: '04', option_label: '原融代償' },
    { option_value: '05', option_label: '在庫融資' },
    { option_value: '11', option_label: '保單' },
    { option_value: '12', option_label: '信貸' },
    { option_value: '31', option_label: '遠信機車' },
    { option_value: '32', option_label: '遠信圖書' },
    { option_value: '33', option_label: '遠信綜合' },
    { option_value: '41', option_label: '機器設備' },
    { option_value: '42', option_label: '重型機車' },
    { option_value: '51', option_label: '一般分期' },
    { option_value: '52', option_label: '諾蒂亞' },
    { option_value: '61', option_label: '亞太策盟A' },
    { option_value: '62', option_label: '亞太策盟B' },
    { option_value: '63', option_label: '第一專案A' },
    { option_value: '64', option_label: '第一專案B' },
    { option_value: '65', option_label: '廿一專案A' },
    { option_value: '66', option_label: '廿一專案B' },
    { option_value: '67', option_label: '台灣才將專案A' },
    { option_value: '68', option_label: '台灣才將專案B' },
    { option_value: '69', option_label: '遠信AR專案A' },
    { option_value: '70', option_label: '遠信AR專案B' },
    { option_value: '71', option_label: '遠信AR專案C' },
    { option_value: '72', option_label: '和灣專案A' },
    { option_value: '73', option_label: '和灣專案B' },
    { option_value: '74', option_label: '機車原融' },
    { option_value: '75', option_label: '機車自承' },
    { option_value: '76', option_label: '商品分期' },
    { option_value: '77', option_label: '機車買賣' },
    { option_value: '99', option_label: '其他' },
  ];

  /**
   * m24 placeholder（down 還原用）
   */
  private static readonly M24_PLACEHOLDER: ReadonlyArray<{
    option_value: string;
    option_label: string;
  }> = [
    { option_value: '01', option_label: '特殊類別 01' },
    { option_value: '02', option_label: '特殊類別 02' },
    { option_value: '03', option_label: '特殊類別 03' },
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isSqlite = process.env.DB_TYPE === 'sqlite';

    // Step 1: 清 m24 placeholder（3 筆）
    await queryRunner.query(
      `DELETE FROM pooldata_field_option WHERE column_name = 'spec_tp'`,
    );

    // Step 2: 32 筆 UPSERT
    for (const opt of UpsertSpecTpOptions321711360000283.SPEC_TP_OPTIONS) {
      const isActiveLiteral = isSqlite ? '1' : 'TRUE';
      const insertSql = isSqlite
        ? `INSERT OR REPLACE INTO pooldata_field_option
             (column_name, option_value, option_label, is_active, deactivation_reason, created_at, updated_at)
           VALUES ('spec_tp', '${opt.option_value}', '${UpsertSpecTpOptions321711360000283.escapeSqlLiteral(opt.option_label)}', ${isActiveLiteral},
                   NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
        : `INSERT INTO pooldata_field_option
             (column_name, option_value, option_label, is_active, deactivation_reason, created_at, updated_at)
           VALUES ('spec_tp', '${opt.option_value}', '${UpsertSpecTpOptions321711360000283.escapeSqlLiteral(opt.option_label)}', ${isActiveLiteral},
                   NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
           ON CONFLICT (column_name, option_value) DO UPDATE
             SET option_label = EXCLUDED.option_label,
                 is_active = EXCLUDED.is_active,
                 updated_at = CURRENT_TIMESTAMP`;
      await queryRunner.query(insertSql);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const isSqlite = process.env.DB_TYPE === 'sqlite';

    // Step 1: 清本 migration 寫入的 32 筆
    await queryRunner.query(
      `DELETE FROM pooldata_field_option WHERE column_name = 'spec_tp'`,
    );

    // Step 2: 還原 m24 placeholder 3 筆（維持 down 對稱）
    for (const opt of UpsertSpecTpOptions321711360000283.M24_PLACEHOLDER) {
      const isActiveLiteral = isSqlite ? '1' : 'TRUE';
      const insertSql = isSqlite
        ? `INSERT OR IGNORE INTO pooldata_field_option
             (column_name, option_value, option_label, is_active, deactivation_reason, created_at, updated_at)
           VALUES ('spec_tp', '${opt.option_value}', '${opt.option_label}', ${isActiveLiteral},
                   NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
        : `INSERT INTO pooldata_field_option
             (column_name, option_value, option_label, is_active, deactivation_reason, created_at, updated_at)
           VALUES ('spec_tp', '${opt.option_value}', '${opt.option_label}', ${isActiveLiteral},
                   NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
           ON CONFLICT (column_name, option_value) DO NOTHING`;
      await queryRunner.query(insertSql);
    }
  }

  /**
   * SQL literal 防呆：所有 option_label 為中文無單引號，但保留 escape 以防未來 dump 含特殊字元。
   */
  private static escapeSqlLiteral(raw: string): string {
    return raw.replace(/'/g, "''");
  }
}
