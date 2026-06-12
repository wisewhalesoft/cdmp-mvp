import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * m300 / F102 / AD-E07-30 ── ob_monthly_run_result 新增 appl_date 欄
 *
 * 新增：
 *   - appl_date TIMESTAMP NULL — CR 失效規則步驟 1（逾2年清空）以名單月 - 2 年比對之申請日。
 *     Stage 1 INSERT…SELECT 由 ob_pool_data_list 帶入（I-CR-COLSRC-01）；CR 步驟
 *     （cr-priority-sql.ts 步驟 1）以 `appl_date < (名單月 - 2 年)::date` 嚴格小於清空，
 *     只對本工作集 UPDATE，不讀回 ob_pool_data_list。
 *
 * 動機：F102 CR 優先分派需在 ob_monthly_run_result 工作集內判斷 CR 案件之申請日是否逾 2 年。
 *       AD-E07-30 §6.1 步驟 1 SQL 以 ob_monthly_run_result.appl_date 比對，惟該欄原不存在
 *       （m292 建表時未含）。AD §13「不需新增 migration」為疏漏 —— 本 migration 補建。
 *       cr_id / cr_nm / is_cr 三欄已於 m292 存在（無需建欄）。
 *
 * 可逆：down() DROP COLUMN appl_date。
 *
 * SQLite e2e / pg.spec 走 entity synchronize:true → 本 migration up/down no-op；entity 為單一事實來源。
 * （SQLite 不支援 DROP COLUMN，故 no-op 為必要；對齊 m291 慣例）
 *
 * ⚠️ Entity 必須與 migration 保持一致：ob-monthly-run-result.entity.ts 已同步補入 appl_date @Column。
 */
export class AddObMonthlyRunResultApplDate1711360000300
  implements MigrationInterface
{
  name = 'AddObMonthlyRunResultApplDate1711360000300';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isSqlite = process.env.DB_TYPE === 'sqlite';
    if (isSqlite) return;

    await queryRunner.query(
      `ALTER TABLE ob_monthly_run_result ADD COLUMN IF NOT EXISTS appl_date TIMESTAMP NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const isSqlite = process.env.DB_TYPE === 'sqlite';
    if (isSqlite) return;

    await queryRunner.query(
      `ALTER TABLE ob_monthly_run_result DROP COLUMN IF EXISTS appl_date`,
    );
  }
}
