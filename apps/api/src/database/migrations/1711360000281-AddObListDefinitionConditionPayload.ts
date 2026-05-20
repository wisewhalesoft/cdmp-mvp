import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * m281 / F050 v2.1 重構（AD-E07-18 §18.3 M1）
 *
 * 為 ob_list_definition 補 condition_payload 欄位作為 v2.1 名單篩選條件 source of truth：
 *   - PG：JSONB NULL + GIN index（idx_ob_list_def_cp_gin）
 *   - SQLite：TEXT NULL（無 GIN 支援，e2e 環境用）
 *
 * 補完理由：
 *   - F050 v2.0 DTO 已宣告 conditionPayload，但 entity / DB 無對應 column → 無法持久化
 *   - data-model.md L850 / GAP-LIST §E1 缺漏
 *   - AD-E07-18 §18.2.5：GIN index 合併入本 migration（不獨立檔）
 *
 * Nullable 設計（J6 / BR-10 backward-compat）：
 *   - 既有名單（m100 ~ m280）condition_payload 保持 NULL，Stage 1 月跑走 path B fallback 讀 5 個 entity column
 *   - 後續 m282 backfill 將 NULL 名單轉換為 path A 可解析的 JSON
 *
 * Idempotency：
 *   - PG：ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS
 *   - SQLite：PRAGMA table_info(ob_list_definition) guard
 *
 * 對應 test spec：MT-M1-001 ~ MT-M1-004（M01-migration-test.md）
 */
export class AddObListDefinitionConditionPayload1711360000281
  implements MigrationInterface
{
  name = 'AddObListDefinitionConditionPayload1711360000281';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isSqlite = process.env.DB_TYPE === 'sqlite';

    if (isSqlite) {
      // SQLite：PRAGMA guard 防 ADD COLUMN 重複執行
      const cols = await queryRunner.query(
        `PRAGMA table_info(ob_list_definition)`,
      );
      const hasCol = Array.isArray(cols)
        ? cols.some((c: { name: string }) => c.name === 'condition_payload')
        : false;
      if (!hasCol) {
        await queryRunner.query(
          `ALTER TABLE ob_list_definition ADD COLUMN condition_payload TEXT`,
        );
      }
      // SQLite 不支援 GIN index；e2e 全表 scan 可接受（AD-E07-18 §18.5 PG vs SQLite 差異）
    } else {
      await queryRunner.query(
        `ALTER TABLE ob_list_definition ADD COLUMN IF NOT EXISTS condition_payload JSONB`,
      );
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS idx_ob_list_def_cp_gin ON ob_list_definition USING gin(condition_payload)`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const isSqlite = process.env.DB_TYPE === 'sqlite';

    if (isSqlite) {
      // SQLite 不支援 DROP COLUMN IF EXISTS；先 PRAGMA guard
      const cols = await queryRunner.query(
        `PRAGMA table_info(ob_list_definition)`,
      );
      const hasCol = Array.isArray(cols)
        ? cols.some((c: { name: string }) => c.name === 'condition_payload')
        : false;
      if (hasCol) {
        await queryRunner.query(
          `ALTER TABLE ob_list_definition DROP COLUMN condition_payload`,
        );
      }
    } else {
      await queryRunner.query(`DROP INDEX IF EXISTS idx_ob_list_def_cp_gin`);
      await queryRunner.query(
        `ALTER TABLE ob_list_definition DROP COLUMN IF EXISTS condition_payload`,
      );
    }
  }
}
