import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fix column sizes based on actual source data:
 * - role_code: VARCHAR(4)→VARCHAR(100) — ZZIP.CROLE is free-text (job title + contact info), not a code
 * - industry_code: VARCHAR(6)→VARCHAR(10) — MLMC.INDUID format is XXXX-XX (7 chars)
 */
export class FixColumnSizes1711360000004 implements MigrationInterface {
  name = 'FixColumnSizes1711360000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE customer_core ALTER COLUMN role_code TYPE VARCHAR(100)`);
    await queryRunner.query(`ALTER TABLE customer_core ALTER COLUMN industry_code TYPE VARCHAR(10)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE customer_core ALTER COLUMN role_code TYPE VARCHAR(4)`);
    await queryRunner.query(`ALTER TABLE customer_core ALTER COLUMN industry_code TYPE VARCHAR(6)`);
  }
}
