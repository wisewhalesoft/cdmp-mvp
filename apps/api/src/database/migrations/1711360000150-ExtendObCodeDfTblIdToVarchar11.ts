import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * F068 / AD-E07-14：擴充 ob_code_df.tbl_id 至 VARCHAR(11) 並執行白名單英文常數轉碼。
 *
 * 動機：
 *   - 原系統 OBMCODEDF.TBL_ID 為 VARCHAR(2) 數字編碼（'01' / '02' / '22' 等）。
 *   - CDMP 採英文常數命名（PROD_KIND / SPEC_TP / CASE_STATUS），最長 11 字元（CASE_STATUS）。
 *   - 本 migration 一次完成欄位放寬 + 白名單轉碼，提供 F068 代碼維護模組使用。
 *
 * 白名單轉碼（system_id = 'OB' 限定）：
 *   '01' → 'PROD_KIND'    （產品類別，dump 觀察 3 筆）
 *   '02' → 'SPEC_TP'      （專案類別，dump 觀察 32 筆）
 *   '22' → 'CASE_STATUS'  （案件結清期別，dump 觀察 4 筆）
 *
 * 白名單外的 tbl_id（'03'、'04'、'05'... 等其他模組殘留）一律維持原值不轉。
 *
 * 不可逆：down() 拋 Error。
 *   - 理由：白名單轉碼為破壞性操作；若需回退，請以資料庫快照還原並重跑前序 migration。
 *   - OQ-F068-02 ✅ Resolved 2026-05-12。
 */
export class ExtendObCodeDfTblIdToVarchar111711360000150
  implements MigrationInterface
{
  name = 'ExtendObCodeDfTblIdToVarchar111711360000150';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL: ALTER COLUMN TYPE 直接放寬欄位長度（無需重建索引／PK）。
    // composite PK (system_id, tbl_id, tbl_cd) 由 TypeORM 預設自動命名為 PK_ob_code_df，
    // PostgreSQL ALTER COLUMN TYPE varchar(N) 對既有 PK 不會破壞。
    await queryRunner.query(
      `ALTER TABLE ob_code_df ALTER COLUMN tbl_id TYPE VARCHAR(11)`,
    );

    // 白名單英文常數轉碼（限 system_id='OB'，其他 system_id 不動）
    await queryRunner.query(
      `UPDATE ob_code_df SET tbl_id = 'PROD_KIND'   WHERE system_id = 'OB' AND tbl_id = '01'`,
    );
    await queryRunner.query(
      `UPDATE ob_code_df SET tbl_id = 'SPEC_TP'     WHERE system_id = 'OB' AND tbl_id = '02'`,
    );
    await queryRunner.query(
      `UPDATE ob_code_df SET tbl_id = 'CASE_STATUS' WHERE system_id = 'OB' AND tbl_id = '22'`,
    );
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // OQ-F068-02：不可逆 migration。
    // 將英文常數還原成數字編碼後，無法區分「原本就有英文常數寫入的紀錄」與「migration up 轉碼產生的紀錄」，
    // 且 VARCHAR(11) → VARCHAR(2) 對任何長度 > 2 的英文常數紀錄會直接溢位失敗。
    throw new Error(
      'Migration 1711360000150 ExtendObCodeDfTblIdToVarchar11 is not reversible. ' +
        'Data conversion (01/02/22 → PROD_KIND/SPEC_TP/CASE_STATUS) cannot be safely reversed. ' +
        'To roll back, restore from database snapshot prior to running this migration.',
    );
  }
}
