import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * m297（2026-06-01）── ob_pool_data_list 新增近 3 個月去重視窗加速索引
 *
 * 新增：
 *   - INDEX idx_ob_pool_data_list_assignday_custo ON ob_pool_data_list (assignday, custo_no)
 *
 * 動機：Stage 1 完整篩選鏈（stage1-filter-chain.ts）之近 3 個月去重需查
 *   SELECT DISTINCT custo_no FROM ob_pool_data_list
 *     WHERE assignday BETWEEN :start AND :end AND custo_no IS NOT NULL
 * 本表為 ETL legacy 派案歷史，列數可達數百萬。無索引時為全表 seq scan
 * （dev 實測 ~17.5s／7.8M 列），是 Stage 0 per-list 試算（estimateListCount，
 * 10s STAGE0_ESTIMATE_TIMEOUT）逾時的主因 —— 逾時被 materializeStage0Estimate 吞掉
 * 後 stage0_estimate_count 留 NULL、試算頁回退顯示 total=0（OB202606001 案例）。
 *
 * 複合索引 (assignday, custo_no)：assignday 前綴支援去重視窗 range scan，
 * custo_no 隨後供 DISTINCT／月跑 NOT EXISTS anti-join 覆蓋
 * （dev 實測估算 10s→5s）。月跑 Stage 1 去重亦受惠。
 *
 * 可逆：down() DROP INDEX。
 *
 * ⚠️ prod 部署注意：本表 prod 列數龐大，非 CONCURRENTLY 的 CREATE INDEX 會在建立期間
 *   持有寫鎖（阻擋 ETL partition-replace / 月跑寫入，dev 7.8M 列實測約 15~30s）。
 *   建議於維護窗口部署；若需零停機，改以 `CREATE INDEX CONCURRENTLY`（須關閉本 migration
 *   的 transaction 包裝，TypeORM 預設在 transaction 內無法執行 CONCURRENTLY）。
 *   此處沿用 m291（同表 idx_ob_pool_data_list_data_source）之非 CONCURRENTLY 慣例。
 *
 * SQLite e2e 走 entity synchronize:true → 本 migration up/down no-op；entity 為單一事實來源
 * （對齊 m289 / m291 慣例）。
 *
 * ⚠️ Entity 必須與 migration 保持一致：ob-pool-data-list.entity.ts 已同步補入
 *   @Index('idx_ob_pool_data_list_assignday_custo', ['assignday', 'custo_no'])。
 */
export class AddObPoolDataListAssigndayDedupIndex1711360000297
  implements MigrationInterface
{
  name = 'AddObPoolDataListAssigndayDedupIndex1711360000297';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isSqlite = process.env.DB_TYPE === 'sqlite';
    if (isSqlite) return;

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_ob_pool_data_list_assignday_custo ON ob_pool_data_list (assignday, custo_no)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const isSqlite = process.env.DB_TYPE === 'sqlite';
    if (isSqlite) return;

    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_ob_pool_data_list_assignday_custo`,
    );
  }
}
