import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * m283 / F050 v2.1 重構（AD-E07-18 §18.3 M3 / F076 v1.5 §AC-3 / GAP-LIST §E5）
 *
 * 將 `pooldata_field_option.column_name='spec_tp'` 從 m24 placeholder 3 筆
 *   （01 / 02 / 03 / 「特殊類別 0N」）升級為真實 OBMCODEDF dump 52 筆。
 *
 * 來源：reference/DumpData/OBMCODEDF_20260505.csv **TBL_ID='12'**（OBMSPEC_TP 真實 dump，
 *   含本牌 / 他牌 / 重車 等品牌前綴細分；m150 轉碼後 DB 為 'SPEC_TP'）。
 *
 * 歷史筆記：
 *   - v1（commit 273fc0b）：32 筆來源誤指向 `TBL_ID='02'`（OBPROD_KIND，產品大類），
 *     業務語意對應「汽車/機車/一般商品」三大類，與名單篩選欄位實際需求不符。
 *   - v2（本次）：改回真正的 `TBL_ID='12'` 52 筆（含品牌 + 業態前綴），
 *     對應原系統 OBPOOLDATA.SPEC_TP 欄位實際出現之代碼集。
 *
 * 52 筆內容**硬編碼**進本 migration source（不從 CSV 動態讀取，
 *   避免 migration 對 reference/DumpData 檔案存在性產生執行期依賴）。
 *
 * up() 邏輯：
 *   1. DELETE column_name='spec_tp'（清 m24 placeholder 3 筆 / m283 v1 之 32 筆）
 *   2. 52 筆 INSERT，PG 用 ON CONFLICT (column_name, option_value) DO UPDATE；
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
   * 52 筆 SPEC_TP options（CSV TBL_ID='12' 真實 dump，2026-05-05 版）
   * 來源欄位映射：TBL_CD → option_value；TBL_DESC1 → option_label
   */
  private static readonly SPEC_TP_OPTIONS: ReadonlyArray<{
    option_value: string;
    option_label: string;
  }> = [
    { option_value: '01', option_label: '本牌/新車' },
    { option_value: '02', option_label: '本牌/中古' },
    { option_value: '03', option_label: '本牌/營業車' },
    { option_value: '04', option_label: '本牌/原融' },
    { option_value: '05', option_label: '本牌/中古營業車' },
    { option_value: '06', option_label: '本牌/原融代償' },
    { option_value: '07', option_label: '保單' },
    { option_value: '08', option_label: '信貸' },
    { option_value: '09', option_label: '機器設備' },
    { option_value: '10', option_label: '遠信機車' },
    { option_value: '11', option_label: '他牌/新車' },
    { option_value: '12', option_label: '他牌/中古' },
    { option_value: '13', option_label: '他牌/營業車' },
    { option_value: '14', option_label: '他牌/原融' },
    { option_value: '15', option_label: '他牌/中古營業車' },
    { option_value: '16', option_label: '他牌/原融代償' },
    { option_value: '17', option_label: '重型機車' },
    { option_value: '18', option_label: '遠信圖書' },
    { option_value: '19', option_label: '遠信綜合' },
    { option_value: '20', option_label: '本牌/原融營業車' },
    { option_value: '21', option_label: '他牌/原融營業車' },
    { option_value: '22', option_label: '本牌/原融代償營業車' },
    { option_value: '23', option_label: '他牌/原融代償營業車' },
    { option_value: '24', option_label: '一般分期/床的世界' },
    { option_value: '25', option_label: '一般分期/諾蒂亞' },
    { option_value: '26', option_label: '亞太專案A' },
    { option_value: '27', option_label: '亞太專案B' },
    { option_value: '28', option_label: '第一專案A' },
    { option_value: '29', option_label: '第一專案B' },
    { option_value: '30', option_label: '二十一專案A' },
    { option_value: '31', option_label: '二十一專案B' },
    { option_value: '32', option_label: '台灣才將專案A' },
    { option_value: '33', option_label: '台灣才將專案B' },
    { option_value: '34', option_label: '遠信AR專案A' },
    { option_value: '35', option_label: '遠信AR專案B' },
    { option_value: '36', option_label: '遠信AR專案C' },
    { option_value: '37', option_label: '和灣專案A' },
    { option_value: '38', option_label: '和灣專案B' },
    { option_value: '39', option_label: '他牌/機車原融' },
    { option_value: '40', option_label: '他牌/機車自承' },
    { option_value: '41', option_label: '商品分期' },
    { option_value: '42', option_label: '重車_新車' },
    { option_value: '43', option_label: '他牌/機車原融代償' },
    { option_value: '44', option_label: '重車_中古車' },
    { option_value: '45', option_label: '重車_原融' },
    { option_value: '48', option_label: '3C通訊家電' },
    { option_value: '49', option_label: '汽機車改裝保修' },
    { option_value: '50', option_label: '設備器材' },
    { option_value: '51', option_label: '生活居家' },
    { option_value: '52', option_label: '娛樂收藏' },
    { option_value: '53', option_label: 'B專案(附擔保)' },
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

    // Step 1: 清 m24 placeholder（3 筆）/ m283 v1 之 32 筆
    await queryRunner.query(
      `DELETE FROM pooldata_field_option WHERE column_name = 'spec_tp'`,
    );

    // Step 2: 52 筆 UPSERT
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

    // Step 1: 清本 migration 寫入的 52 筆
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
   * SQL literal 防呆：B專案(附擔保) 等 label 含中文括號無單引號，但保留 escape 以防未來 dump 含特殊字元。
   */
  private static escapeSqlLiteral(raw: string): string {
    return raw.replace(/'/g, "''");
  }
}
