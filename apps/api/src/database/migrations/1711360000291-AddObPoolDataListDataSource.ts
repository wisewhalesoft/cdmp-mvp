import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * m291 / F090 v1.0 / AD-E07-21 §21.3（DP-AD21-2 方案 A，2026-05-26）
 * ── ob_pool_data_list 新增 data_source 欄（區分 ETL legacy 歷史 vs 本系統月跑輸出）
 *
 * 新增：
 *   - data_source VARCHAR(20) NULL — 值域 'etl_legacy' / 'monthly_run' / NULL
 *     · 'etl_legacy'  : E07-OBPOOLDATA_LIST-Load 載入的 legacy 派案歷史（去重查詢用）
 *     · 'monthly_run' : AssignmentRunPipelineService 月跑 Stage 1 寫入的本月分派結果
 *     · NULL          : migration 前既有資料（語意同 'monthly_run'，去重查詢不依賴此欄）
 *   - INDEX idx_ob_pool_data_list_data_source — ETL per-data_source DELETE 與路由用
 *
 * 動機：ob_pool_data_list 同時承載「ETL 歷史」與「本系統月跑輸出」兩類資料（雙重角色，
 *       AD-E07-21 §21.2）。ETL Load 採 partition-replace（DELETE WHERE data_source='etl_legacy'
 *       後 INSERT），不可全表 TRUNCATE（會清掉月跑的 'monthly_run' 列，造成 Stage 3/4 資料遺失）。
 *       data_source 欄即為此 per-source 截斷的分區鍵。
 *
 * 可逆：down() 反序移除 INDEX 後 DROP COLUMN。
 *
 * SQLite e2e 走 entity synchronize:true → 本 migration up/down no-op；entity 為單一事實來源。
 * （SQLite 不支援 DROP COLUMN，故 no-op 為必要；對齊 m289 慣例）
 *
 * ⚠️ Entity 必須與 migration 保持一致：任一邊改動，另一邊同步修
 * （ob-pool-data-list.entity.ts 已同步補入 data_source @Column）
 */
export class AddObPoolDataListDataSource1711360000291
  implements MigrationInterface
{
  name = 'AddObPoolDataListDataSource1711360000291';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isSqlite = process.env.DB_TYPE === 'sqlite';
    if (isSqlite) return;

    await queryRunner.query(
      `ALTER TABLE ob_pool_data_list ADD COLUMN IF NOT EXISTS data_source VARCHAR(20) NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_ob_pool_data_list_data_source ON ob_pool_data_list (data_source)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const isSqlite = process.env.DB_TYPE === 'sqlite';
    if (isSqlite) return;

    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_ob_pool_data_list_data_source`,
    );
    await queryRunner.query(
      `ALTER TABLE ob_pool_data_list DROP COLUMN IF EXISTS data_source`,
    );
  }
}
