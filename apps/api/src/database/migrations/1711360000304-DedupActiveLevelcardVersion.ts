import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * m304 / D ── 去重 ob_levelcard_version 之「每 card_type 多列 active」漂移
 *
 * 問題（latent 非決定性 bug）：
 *   - dev DB `ob_levelcard_version` 每個 card_type（H/S/E/S5/E5）有 **2 列 status='active'**：
 *     舊組（期中/中結/滿期…，sdate 2019，= seed `ob-levelcard-version.json` canonical）
 *     + 新組（期中名單/中結名單…，sdate 20260514，**不在 seed / 任何 committed migration** = 漂移）。
 *   - 兩組皆 card_version=1 → 指向同一份 (card_type, v1) 計分 config，**計分結果相同**。
 *   - 但引擎選版本 `allVersions.find(v => v.card_type === X)`（assignment-run-pipeline.service.ts
 *     L705/L971）取「第一個 active」、無 ORDER BY → 多列 active 時**非決定性**（將來若引入
 *     真正的 v2 active，可能選錯版本）。
 *
 * 修法（使用者 2026-06-25 拍板：保留舊組＝seed 對齊）：
 *   - 將「名單」新組標 inactive，保留 seed-canonical 舊組 active → 每 card_type 恰 1 列 active。
 *   - 防呆：僅在同 card_type 另有「非名單」active 版本存在時才停用（不孤兒化任何 card_type；
 *     M 卡僅 1 列「機車」不受影響）。
 *
 * 冪等：重跑時新組已 inactive → 0 列受影響。
 * dev 直接套等價 SQL（migration runner 未啟用）；prod/新 DB 之 seed 僅含舊組、B2 reconcile
 *   不會新增「名單」組，故不會有此漂移；本 migration 為 drifted DB 之 runner 修復路徑。
 *
 * 註：計分不受影響（兩組同 v1）；本 migration 僅清理版本 metadata 重複 + 消除選版非決定性。
 * 未動引擎選版邏輯（去重後 find() 已唯一）；如需防未來再漂移，另議引擎 deterministic 選版或
 *   partial unique index。
 */
export class DedupActiveLevelcardVersion1711360000304
  implements MigrationInterface
{
  name = 'DedupActiveLevelcardVersion1711360000304';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (process.env.DB_TYPE === 'sqlite') return;
    await queryRunner.query(
      `UPDATE ob_levelcard_version v
          SET status = 'inactive', updated_at = NOW()
        WHERE v.status = 'active'
          AND v.card_name LIKE '%名單%'
          AND EXISTS (
            SELECT 1 FROM ob_levelcard_version v2
             WHERE v2.card_type = v.card_type
               AND v2.status = 'active'
               AND v2.card_name NOT LIKE '%名單%'
          )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (process.env.DB_TYPE === 'sqlite') return;
    // 還原：把被本 migration 停用的「名單」組改回 active（回復去重前狀態）。
    await queryRunner.query(
      `UPDATE ob_levelcard_version
          SET status = 'active', updated_at = NOW()
        WHERE card_name LIKE '%名單%'`,
    );
  }
}
