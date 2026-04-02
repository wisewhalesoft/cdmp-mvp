import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * F036 v2.4: Add MLMC code→desc columns and business_item
 * Renames: employee_count→employee_count_code, is_listed→is_listed_code
 * Adds: employee_count_desc, is_listed_desc, company_attr_desc, business_item
 * Net: 83 → 87 columns
 */
export class AddMlmcCodeDescColumns1711360000006 implements MigrationInterface {
  name = 'AddMlmcCodeDescColumns1711360000006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE customer_core RENAME COLUMN employee_count TO employee_count_code`);
    await queryRunner.query(`ALTER TABLE customer_core RENAME COLUMN is_listed TO is_listed_code`);
    await queryRunner.query(`
      ALTER TABLE customer_core
        ADD COLUMN IF NOT EXISTS employee_count_desc VARCHAR(50),
        ADD COLUMN IF NOT EXISTS is_listed_desc VARCHAR(50),
        ADD COLUMN IF NOT EXISTS company_attr_desc VARCHAR(50),
        ADD COLUMN IF NOT EXISTS business_item VARCHAR(100);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE customer_core
        DROP COLUMN IF EXISTS employee_count_desc,
        DROP COLUMN IF EXISTS is_listed_desc,
        DROP COLUMN IF EXISTS company_attr_desc,
        DROP COLUMN IF EXISTS business_item;
    `);
    await queryRunner.query(`ALTER TABLE customer_core RENAME COLUMN employee_count_code TO employee_count`);
    await queryRunner.query(`ALTER TABLE customer_core RENAME COLUMN is_listed_code TO is_listed`);
  }
}
