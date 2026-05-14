import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Iter 6 / OPEN-H 修補：
 *   `ob_levelcard_version.created_by` / `updated_by` / `created_by_prog` / `updated_by_prog`
 *   由 VARCHAR(20) 擴至 VARCHAR(50)。
 *
 * 根因：
 *   原 OB dump `OAUSERID` / `OAPRGID` 為短字串（最長 20 char），但 CDMP F070 service
 *   將 `actor.userId`（user.id UUID 36 char）寫入 created_by/updated_by。dev/prod PostgreSQL
 *   會拋 "value too long for type character varying(20)" → service transaction fail → 500
 *   SYSTEM_INTERNAL_ERROR。SQLite（e2e in-memory）不強制 length，故 e2e 從未抓到。
 *
 * 範圍：僅擴 length，不改其他屬性。對既有 dump 資料相容（PG ALTER TYPE 對短字串無破壞）。
 *
 * 同步更新：`ob-levelcard-version.entity.ts` length 改 50（依 entity-migration 一致性原則）。
 *
 * Idempotent：PostgreSQL ALTER COLUMN TYPE VARCHAR(50) 重跑無副作用（已是 50 則 no-op）。
 *
 * SQLite 環境：SQLite 不支援 ALTER COLUMN TYPE，且本來就不強制 length；此 migration skip。
 */
export class ExtendObLevelcardVersionCreatedByVarchar501711360000164
  implements MigrationInterface
{
  name = 'ExtendObLevelcardVersionCreatedByVarchar501711360000164';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isSqlite = process.env.DB_TYPE === 'sqlite';
    if (isSqlite) {
      // SQLite 不強制 length；entity 已宣告 length=50，synchronize 會自動建表。skip。
      return;
    }
    // PostgreSQL：ALTER COLUMN TYPE VARCHAR(50)
    await queryRunner.query(
      `ALTER TABLE ob_levelcard_version ALTER COLUMN created_by_prog TYPE VARCHAR(50)`,
    );
    await queryRunner.query(
      `ALTER TABLE ob_levelcard_version ALTER COLUMN created_by TYPE VARCHAR(50)`,
    );
    await queryRunner.query(
      `ALTER TABLE ob_levelcard_version ALTER COLUMN updated_by_prog TYPE VARCHAR(50)`,
    );
    await queryRunner.query(
      `ALTER TABLE ob_levelcard_version ALTER COLUMN updated_by TYPE VARCHAR(50)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const isSqlite = process.env.DB_TYPE === 'sqlite';
    if (isSqlite) {
      return;
    }
    // 縮回 VARCHAR(20)：注意若已有 >20 char 資料會 ALTER 失敗
    await queryRunner.query(
      `ALTER TABLE ob_levelcard_version ALTER COLUMN created_by_prog TYPE VARCHAR(20)`,
    );
    await queryRunner.query(
      `ALTER TABLE ob_levelcard_version ALTER COLUMN created_by TYPE VARCHAR(20)`,
    );
    await queryRunner.query(
      `ALTER TABLE ob_levelcard_version ALTER COLUMN updated_by_prog TYPE VARCHAR(20)`,
    );
    await queryRunner.query(
      `ALTER TABLE ob_levelcard_version ALTER COLUMN updated_by TYPE VARCHAR(20)`,
    );
  }
}
