import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * m18: AddObListDefinitionCrEnabled（E07 重構 P1 B2 補完 / 2026-05-16）
 *
 * 為 ob_list_definition 補 cr_enabled BOOLEAN NOT NULL DEFAULT false 欄位。
 *
 * 補完理由：
 *   - F050 v2.0 / F051 v2.0 DTO `crEnabled` 已存在但 entity / DB 無對應 column。
 *   - 取代 F059 全域 OBASSIGNSET 開關，per-LIST CR 回分啟用旗標。
 *
 * Default false：保守起始；admin 顯式編輯名單時切換為 true。
 *
 * 對應 migration：m17 (case_status) → m18 (cr_enabled)。
 */
export class AddObListDefinitionCrEnabled1711360000182 implements MigrationInterface {
  name = 'AddObListDefinitionCrEnabled1711360000182';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE ob_list_definition ADD COLUMN IF NOT EXISTS cr_enabled BOOLEAN NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE ob_list_definition DROP COLUMN IF EXISTS cr_enabled`,
    );
  }
}
