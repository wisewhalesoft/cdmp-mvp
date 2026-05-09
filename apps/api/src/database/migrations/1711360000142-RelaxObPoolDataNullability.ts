import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * E07 Track D 後續 — 放寬 ob_pool_data 三個欄位的 NOT NULL 約束
 *
 * 首次跑 OBPOOLDATA-Load 暴露：源頭 OBPOOLDATA 在這 3 欄有空字串（ETL
 * NULLIF(TRIM) 後 → NULL）：
 *   - BEST_CASE       366,754 列（24.7%）為空
 *   - PROD_KIND        12,676 列（0.85%）為空
 *   - PROD_KIND_NAME   12,676 列（0.85%）為空
 *
 * Track A migration 1711360000110-CreateObPoolData 將其設為 NOT NULL，與真實
 * 資料分布不符；本 migration 放寬為 nullable 以對齊源頭。data-model.md L862
 * 「ob_pool_data 為共享案件池」並未明確要求這 3 欄 NOT NULL。
 *
 * 對應 entity：apps/api/src/database/entities/ob-pool-data.entity.ts
 * dev 走 synchronize:true 自動同步；prod 用本 migration。
 */
export class RelaxObPoolDataNullability1711360000142 implements MigrationInterface {
  name = 'RelaxObPoolDataNullability1711360000142';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "ob_pool_data" ALTER COLUMN "best_case" DROP NOT NULL`);
    await queryRunner.query(`ALTER TABLE "ob_pool_data" ALTER COLUMN "prod_kind" DROP NOT NULL`);
    await queryRunner.query(`ALTER TABLE "ob_pool_data" ALTER COLUMN "prod_kind_name" DROP NOT NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "ob_pool_data" ALTER COLUMN "prod_kind_name" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "ob_pool_data" ALTER COLUMN "prod_kind" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "ob_pool_data" ALTER COLUMN "best_case" SET NOT NULL`);
  }
}
