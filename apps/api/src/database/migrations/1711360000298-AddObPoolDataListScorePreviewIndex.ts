import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * m298（2026-06-02）── ob_pool_data_list 新增 score preview 分佈試算加速索引
 *
 * 新增：
 *   - PARTIAL INDEX idx_ob_pool_data_list_score_notnull
 *       ON ob_pool_data_list (score) WHERE score IS NOT NULL
 *
 * 動機：F055 CARD_LEVEL 門檻頁的「預估各等級分佈」會於進頁／編輯門檻時（debounce）
 *   呼叫 AssignmentScoringService.previewCardLevels。原實作以
 *   `poolDataListRepo.find()` 將整張 ob_pool_data_list（dev 7.8M 列／~14GB）全數
 *   hydrate 進 Node 記憶體再於 JS 分桶 —— heap 撞 ~2GB V8 上限 → 進程 OOM 崩潰 →
 *   該頁所有在途 API 回 500（使用者實測 /assignment/scoring 畫面 crash）。
 *
 *   已改為將分桶 COUNT 下推 PostgreSQL：
 *     SELECT bucket, COUNT(*) FROM (
 *       SELECT CASE WHEN score >= s AND score <= e THEN level ... END AS bucket
 *         FROM ob_pool_data_list WHERE score IS NOT NULL
 *     ) GROUP BY bucket
 *   記憶體已與資料量脫鉤、不再 OOM；但無索引時該聚合仍需全表 seq scan
 *   （dev 實測 ~16-50s／7.8M 列），拖慢 debounce preview。
 *
 * partial index (score) WHERE score IS NOT NULL：
 *   - 尚未計分（score=NULL）的列不入索引。dev 現況全 NULL → 空索引，
 *     preview 即時回 distribution 全 0。
 *   - 生產環境 fn_calc_tier_level 寫入 score 後，preview 可走 index-only scan
 *     （僅掃窄 score 欄，免讀 14GB 寬表 heap）。
 *
 * 可逆：down() DROP INDEX。
 *
 * ⚠️ prod 部署注意：本表 prod 列數龐大，非 CONCURRENTLY 的 CREATE INDEX 會在建立期間
 *   持有寫鎖（阻擋 ETL partition-replace／月跑寫入）。建議於維護窗口部署；若需零停機，
 *   改以 `CREATE INDEX CONCURRENTLY`（須關閉本 migration 的 transaction 包裝，TypeORM
 *   預設在 transaction 內無法執行 CONCURRENTLY）。沿用 m291／m297（同表）之非
 *   CONCURRENTLY 慣例。
 *
 * SQLite e2e 走 entity synchronize:true → 本 migration up/down no-op；entity 為單一事實
 *   來源（對齊 m291／m297 慣例）。
 *
 * ⚠️ Entity 必須與 migration 保持一致：ob-pool-data-list.entity.ts 已同步補入
 *   @Index('idx_ob_pool_data_list_score_notnull', ['score'], { where: 'score IS NOT NULL' })。
 */
export class AddObPoolDataListScorePreviewIndex1711360000298
  implements MigrationInterface
{
  name = 'AddObPoolDataListScorePreviewIndex1711360000298';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isSqlite = process.env.DB_TYPE === 'sqlite';
    if (isSqlite) return;

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_ob_pool_data_list_score_notnull ON ob_pool_data_list (score) WHERE score IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const isSqlite = process.env.DB_TYPE === 'sqlite';
    if (isSqlite) return;

    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_ob_pool_data_list_score_notnull`,
    );
  }
}
