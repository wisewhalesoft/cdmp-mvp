import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * m303 / B1 ── 補 M 卡（機車中結滿期）缺失的 6 個計分欄位（修 config 漂移）
 *
 * 根因（同 m302 之 SALES_STS 漂移）：
 *   - 權威 seed `ob-levelcard-column.json` 含 M 卡 6 欄（CAREA_NO1/CAREA_NO2/AGE/
 *     CO_NUM_NM/HPOST_NUM_NM/CPOST_NUM_NM，card_version=1、status='active'）。
 *   - 但 dev DB `ob_levelcard_column` 之 M 卡為 **0 列**（seed loader「非空就 SKIP」無法
 *     自癒早期漂移，見 B2 reconcile）。M 卡有 score(79)/level(4)/version(1) 但無 column
 *     → **active 欄為空 → M 卡計分算空、無法計分**。
 *
 * 影響：補回 6 欄後 M 卡可正常計分（搭配既有 score/level/version）。M 卡不在現行
 *   202606 名單（001/002/003 為 H/H/S），故不影響已驗收之 tier 對齊；惟未來含 M
 *   名單（list 009 機車中結滿期）月跑需此設定。
 *
 * match_type 依各欄 score row 結構（引擎不讀 match_type，僅 UI/標籤正確性）：
 *   CAREA_NO1/CAREA_NO2/AGE → RANGE（level2 區間）；
 *   CO_NUM_NM/HPOST_NUM_NM/CPOST_NUM_NM → CATEGORY（level1 縣市）。
 *
 * 冪等：`WHERE NOT EXISTS`（B2 reconcile 或本 migration 任一先跑皆安全）。
 * dev 因 migration runner 未啟用須直接套等價 SQL（見 project_dev_db_synchronize_no_migration_runner）。
 * prod/新 DB：seed（含 M 欄）+ B2 reconcile 已涵蓋，本 migration 為 drifted DB 之 runner 修復路徑。
 */
export class AddMCardScoringColumns1711360000303 implements MigrationInterface {
  name = 'AddMCardScoringColumns1711360000303';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (process.env.DB_TYPE === 'sqlite') return;
    await queryRunner.query(
      `INSERT INTO ob_levelcard_column
         (card_type, card_version, column_name, column_label, status, match_type, created_at, updated_at)
       SELECT 'M', 1, v.column_name, v.column_label, 'active', v.match_type, NOW(), NOW()
       FROM (VALUES
         ('CAREA_NO1',    '有無戶藉電話',       'RANGE'),
         ('CAREA_NO2',    '有無通訊電話',       'RANGE'),
         ('AGE',          '年齡',               'RANGE'),
         ('CO_NUM_NM',    '車主公司郵遞區號',   'CATEGORY'),
         ('HPOST_NUM_NM', '車主戶籍地郵遞區號', 'CATEGORY'),
         ('CPOST_NUM_NM', '車主通訊地郵遞區號', 'CATEGORY')
       ) AS v(column_name, column_label, match_type)
       WHERE NOT EXISTS (
         SELECT 1 FROM ob_levelcard_column c
         WHERE c.card_type = 'M' AND c.card_version = 1 AND c.column_name = v.column_name
       )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (process.env.DB_TYPE === 'sqlite') return;
    await queryRunner.query(
      `DELETE FROM ob_levelcard_column
        WHERE card_type = 'M' AND card_version = 1
          AND column_name IN
            ('CAREA_NO1','CAREA_NO2','AGE','CO_NUM_NM','HPOST_NUM_NM','CPOST_NUM_NM')`,
    );
  }
}
