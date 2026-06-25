import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * m302 / F104 後續 ── 修正 ob_levelcard_column 漂移：H 卡 SALES_STS 啟用
 *
 * 根因（provenance）：
 *   - 權威 seed `ob-levelcard-column.json` 記載 H/SALES_STS status='active'（與 legacy
 *     OBLEVELCARD_COLUNM dump 一致，業務註記欄、COMPOSITE，最多 +36 分）。
 *   - 但 dev DB 實況為 status='inactive'，且整體 ob_levelcard_column 漂移成 41 列
 *     （seed 為 47 列；另缺 M 卡 6 欄，見下方註記）。
 *   - 漂移留存原因＝seed loader（prod-data-seed.ts）對 ob_levelcard_column 採
 *     「IF tableCount=0 才 INSERT，否則 SKIP」策略 → 表非空時從不覆寫既有列 →
 *     早期灌入的漂移狀態無法被後續正確 seed 自癒。
 *
 * 影響：H 卡少計 SALES_STS 一個維度 → raw score 系統性偏低 → 202606 H 名單(001/002)
 *   tier 塌進 T3。實測：啟用後 001 由 T3 主導→T2 主導(59%)+T1(19%)、avg 201→228，
 *   逼近 legacy ground truth(001 T1=69%/T2=23%/T3=8%)。
 *
 * 本 migration 冪等對齊 seed（dev 因 migration runner 未啟用須直接套等價 UPDATE，
 *   見 project_dev_db_synchronize_no_migration_runner；prod/新 DB 走 runner）。
 *
 * ⚠️ 同源漂移待後續處理（不在本 migration 範圍，因會改 M 卡計分行為、需獨立決策）：
 *   dev DB ob_levelcard_column 缺 M 卡 6 欄（seed 有 CAREA_NO1/CAREA_NO2/CO_NUM_NM/
 *   AGE/HPOST_NUM_NM/CPOST_NUM_NM）→ M 卡(list 009)目前 0 active 欄、計分壞掉。
 *   另：seed loader 的「INSERT-only-if-empty」無法自癒漂移，建議另開硬化 loader。
 *
 * 全域影響：此為 card_type='H' 全域設定，影響所有月份的 H 卡計分（非僅 202606）。
 */
export class ActivateHSalesStsScoringColumn1711360000302
  implements MigrationInterface
{
  name = 'ActivateHSalesStsScoringColumn1711360000302';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (process.env.DB_TYPE === 'sqlite') return;
    await queryRunner.query(
      `UPDATE ob_levelcard_column
         SET status = 'active'
       WHERE card_type = 'H'
         AND column_name = 'SALES_STS'
         AND card_version = 1
         AND status <> 'active'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (process.env.DB_TYPE === 'sqlite') return;
    // 還原為 inactive（回復漂移前 dev 狀態；注意 seed 真值為 active，down 僅為 migration 可逆性）。
    await queryRunner.query(
      `UPDATE ob_levelcard_column
         SET status = 'inactive'
       WHERE card_type = 'H'
         AND column_name = 'SALES_STS'
         AND card_version = 1`,
    );
  }
}
