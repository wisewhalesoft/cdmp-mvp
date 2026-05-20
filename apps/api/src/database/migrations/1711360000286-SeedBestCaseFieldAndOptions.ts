import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * m286 / M-A1 / F050 v2.1.1（AD-E07-18 §18.11.3 / US-128 / US-129）：
 *   SeedBestCaseFieldAndOptions — best_case 白名單條目 UPSERT + Y/N options UPSERT
 *
 * 目的：
 *   1. 確保 pooldata_field_whitelist 含 best_case 條目（防呆 UPSERT；display_name='優質案件'、
 *      field_type='categorical'、is_active=true）
 *   2. 補入 / 修正 pooldata_field_option 中 best_case Y / N 兩筆 options，label 對齊
 *      F076 v1.6 / US-129 Q2 決議（Y='優質案件'、N='非優質案件'）；UPSERT 覆寫 m240 殘留
 *      之 N='一般案件' 舊 label
 *
 * 設計決策（architecture-spec §18.11.2）：
 *   - 18.11.1 拆為獨立 migration（與 M-A2 / m287 分離）
 *   - 18.11.2 採 UPSERT（DO UPDATE SET option_label），非 DO NOTHING — 覆寫 m240 殘留
 *   - 18.11.9 R8：m240 N='一般案件' 將被覆寫；user 已確認 MVP 環境無終端用戶依賴舊 label
 *
 * 大小寫（[[feedback_mock_real_system_contract]]）：
 *   best_case option_value 在 ob_pool_data 為 varchar(1) 大寫 'Y' / 'N'；本 migration 一律大寫。
 *
 * up() 順序（FK 安全）：
 *   1. INSERT pooldata_field_whitelist (best_case, '優質案件', 'categorical', TRUE)
 *      ON CONFLICT (column_name) DO UPDATE SET is_active=TRUE, display_name=EXCLUDED.display_name
 *   2. INSERT 2 筆 pooldata_field_option (best_case, 'Y' / 'N')
 *      ON CONFLICT (column_name, option_value) DO UPDATE SET option_label=EXCLUDED.option_label, is_active=TRUE
 *
 * down() 順序：
 *   1. DELETE pooldata_field_option WHERE column_name='best_case' AND option_value IN ('Y','N')
 *   2. 不 rollback whitelist（best_case 在 m220 / m280 之前版本即已存在，不屬本 migration 新建）
 *
 * Idempotency：
 *   - PG：UPSERT（ON CONFLICT ... DO UPDATE）— 重複執行 count 仍為 1 whitelist + 2 options
 *   - SQLite：INSERT OR REPLACE INTO — 重複執行同等效，且能覆寫 m240 殘留（不可用 INSERT OR IGNORE）
 *
 * 對應 test spec：
 *   - F050-test.md §十四 A 群組：TS-F050-A01 ~ A07
 *   - F075-test.md §九：TS-F075-051 ~ 053（cross-ref）
 *   - F076-test.md §五：TS-F076-009 ~ 011（cross-ref）
 */
export class SeedBestCaseFieldAndOptions1711360000286
  implements MigrationInterface
{
  name = 'SeedBestCaseFieldAndOptions1711360000286';

  private static readonly BEST_CASE_OPTIONS: ReadonlyArray<{
    option_value: 'Y' | 'N';
    option_label: string;
  }> = [
    // 大小寫敏感（[[feedback_mock_real_system_contract]]）— ob_pool_data.best_case 為 varchar(1) 大寫
    { option_value: 'Y', option_label: '優質案件' },
    { option_value: 'N', option_label: '非優質案件' },
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isSqlite = process.env.DB_TYPE === 'sqlite';
    const isActiveLiteral = isSqlite ? '1' : 'TRUE';

    // Step 1: UPSERT whitelist（母表先，FK 安全）
    //   採 DO UPDATE 而非 DO NOTHING（architecture-spec §18.11.3 Step 1）：
    //   即使 m220 已 seed best_case，本 migration 仍確保 is_active=true 與 display_name 對齊。
    const whitelistSql = isSqlite
      ? `INSERT OR REPLACE INTO pooldata_field_whitelist
           (column_name, display_name, field_type, is_active, created_at, updated_at)
         VALUES ('best_case', '優質案件', 'categorical', ${isActiveLiteral},
                 CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
      : `INSERT INTO pooldata_field_whitelist
           (column_name, display_name, field_type, is_active, created_at, updated_at)
         VALUES ('best_case', '優質案件', 'categorical', ${isActiveLiteral},
                 CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         ON CONFLICT (column_name) DO UPDATE SET
           is_active = TRUE,
           display_name = EXCLUDED.display_name,
           updated_at = CURRENT_TIMESTAMP`;
    await queryRunner.query(whitelistSql);

    // Step 2: UPSERT 2 筆 options（覆寫 m240 殘留之 N='一般案件'，§18.11.9 R8）
    for (const opt of SeedBestCaseFieldAndOptions1711360000286.BEST_CASE_OPTIONS) {
      const insertSql = isSqlite
        ? `INSERT OR REPLACE INTO pooldata_field_option
             (column_name, option_value, option_label, is_active, deactivation_reason, created_at, updated_at)
           VALUES ('best_case', '${opt.option_value}', '${opt.option_label}', ${isActiveLiteral},
                   NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
        : `INSERT INTO pooldata_field_option
             (column_name, option_value, option_label, is_active, deactivation_reason, created_at, updated_at)
           VALUES ('best_case', '${opt.option_value}', '${opt.option_label}', ${isActiveLiteral},
                   NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
           ON CONFLICT (column_name, option_value) DO UPDATE SET
             option_label = EXCLUDED.option_label,
             is_active = TRUE,
             deactivation_reason = NULL,
             updated_at = CURRENT_TIMESTAMP`;
      await queryRunner.query(insertSql);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 僅刪本 migration seed 之 best_case Y / N options
    //   不刪 pooldata_field_whitelist（best_case 在 m220 / m280 之前版本即已存在，不屬本 migration 新建）
    //   不影響管理員透過 F076 手動新增之其他 option_value（例如未來補的 'O' / 'X' 等）
    await queryRunner.query(
      `DELETE FROM pooldata_field_option
       WHERE column_name = 'best_case' AND option_value IN ('Y', 'N')`,
    );
  }
}
