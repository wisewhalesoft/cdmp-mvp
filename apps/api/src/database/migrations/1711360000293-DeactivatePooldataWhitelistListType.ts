import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * m293 / F096 v1.0 / AD-E07-26 §26.7（DP 已 Resolved，2026-05-27）
 * ── 停用 pooldata_field_whitelist 之 list_type 條目（期別篩選唯一路徑澄清）
 *
 * 決策（AD-E07-26 §26.7）：將 `pooldata_field_whitelist` 中 `column_name = 'list_type'`
 * 之條目設為 `is_active = false`，使其不再暴露於前端名單篩選欄位 dropdown
 * （`GET /api/v1/pooldata-fields?active=true` 與 condition_payload whitelist 校驗皆讀
 *  is_active=true 之白名單）。
 *
 * 理由：`ob_list_definition.list_type` 為固定常數 '01'（對所有名單相同），不應作為
 *       使用者可選篩選欄位。期別篩選的唯一正確路徑為
 *       `condition_payload.case_status → ob_pool_data.list_type`（Stage 1
 *       buildStage1WhereConditions() 映射），由 case_status（categorical）入口提供。
 *
 * 行為（純資料/設定變更，不新增表/欄位）：
 *   - up()  ：UPDATE pooldata_field_whitelist SET is_active=false WHERE column_name='list_type'
 *   - down()：UPDATE ... SET is_active=true  WHERE column_name='list_type'（可逆）
 *
 * 特性：
 *   - 冪等：UPDATE WHERE column_name='list_type'；已為 false 時重複執行無害（affected 可能為 0）
 *   - 最小影響：僅 list_type 一筆；case_status / best_case / 其他白名單條目一律不動（BR-5）
 *   - 既有名單相容（AC-4 / BR-4）：本 migration 不動 condition_payload；既有含 list_type
 *     條件之名單於 Stage 1 仍可解析執行（停用僅影響「新增條件之 dropdown 可選項」）
 *
 * is_active 字面（DB_TYPE 分支，對齊 m220 / m280 / m284 慣例）：
 *   - PostgreSQL：TRUE / FALSE
 *   - SQLite    ：1 / 0
 *
 * SQLite e2e：pooldata_field_whitelist 由 entity synchronize 建立，本 migration up/down
 *   皆為真實 UPDATE（非 schema 變更），SQLite 環境亦可正常執行（無 ALTER/DROP COLUMN 限制）。
 */
export class DeactivatePooldataWhitelistListType1711360000293
  implements MigrationInterface
{
  name = 'DeactivatePooldataWhitelistListType1711360000293';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isSqlite = process.env.DB_TYPE === 'sqlite';
    const falseLiteral = isSqlite ? '0' : 'FALSE';

    await queryRunner.query(
      `UPDATE pooldata_field_whitelist
          SET is_active = ${falseLiteral}, updated_at = CURRENT_TIMESTAMP
        WHERE column_name = 'list_type'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const isSqlite = process.env.DB_TYPE === 'sqlite';
    const trueLiteral = isSqlite ? '1' : 'TRUE';

    await queryRunner.query(
      `UPDATE pooldata_field_whitelist
          SET is_active = ${trueLiteral}, updated_at = CURRENT_TIMESTAMP
        WHERE column_name = 'list_type'`,
    );
  }
}
