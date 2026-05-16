import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * m17: AddObListDefinitionCaseStatus（E07 重構 P1 B2 補完 / 2026-05-16）
 *
 * 為 ob_list_definition 補 case_status VARCHAR(14) NULL 欄位。
 *
 * 補完理由：
 *   - F050 v2.0 / F051 v2.0 DTO `caseStatus` 已存在並於 service 層驗證必填，
 *     但 entity / DB 此前無對應 column，導致無法持久化。
 *   - data-model.md §ob_list_definition：多值 `$$` 分隔字串（最長 14 字元，
 *     例如 '01$$02$$03$$04' = 4 個雙位代碼 + 3 個分隔符）。
 *
 * Nullable 設計：欄位 NULL 允許舊資料相容；新增 / 編輯時由 service 層強制
 * `CASE_STATUS_REQUIRED`（422）。
 *
 * 對應 migration：m15 (stage) → m16 (audit varchar30) → m17 (case_status)。
 */
export class AddObListDefinitionCaseStatus1711360000181 implements MigrationInterface {
  name = 'AddObListDefinitionCaseStatus1711360000181';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE ob_list_definition ADD COLUMN IF NOT EXISTS case_status VARCHAR(14) NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE ob_list_definition DROP COLUMN IF EXISTS case_status`,
    );
  }
}
