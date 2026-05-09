import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * P0 fix（system-architect 2026-05-09 review 發現）— ob_levelcard_column 補建
 * status 欄位（AD-E07-4），fn_calc_tier_level 內含 `WHERE s.card_type=... AND
 * s.card_version=...` 但 architecture-spec.md L3076 註解指向 status='active'
 * 過濾；entity / migration 100 / dev DB 三方皆缺欄位導致月跑 Stage 2 拋
 * `column "status" does not exist`（隱性炸彈，function 部署成功但呼叫時爆）。
 *
 * 本 migration：
 *   - ALTER TABLE ob_levelcard_column ADD status VARCHAR(10) NOT NULL DEFAULT 'active'
 *   - CREATE INDEX (card_type, card_version, status) — Q2 建議
 *
 * dev synchronize 對「新增 NOT NULL DEFAULT」會自動套；prod 走本 migration。
 *
 * 對應 entity：apps/api/src/database/entities/ob-levelcard-column.entity.ts
 */
export class AddObLevelcardColumnStatus1711360000143 implements MigrationInterface {
  name = 'AddObLevelcardColumnStatus1711360000143';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "ob_levelcard_column" ADD COLUMN IF NOT EXISTS "status" VARCHAR(10) NOT NULL DEFAULT 'active'`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_ob_levelcard_column_card_status" ON "ob_levelcard_column" ("card_type", "card_version", "status")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_ob_levelcard_column_card_status"`);
    await queryRunner.query(`ALTER TABLE "ob_levelcard_column" DROP COLUMN IF EXISTS "status"`);
  }
}
