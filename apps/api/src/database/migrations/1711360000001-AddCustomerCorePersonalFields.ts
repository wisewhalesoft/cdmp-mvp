import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add personal & ID document columns to customer_core (B. 個人屬性擴充)
 * - 3 family name fields: spouse_name, father_name, mother_name
 * - 4 ID/document fields: id_issue_type, id_issue_date, id_issue_address, driver_license
 */
export class AddCustomerCorePersonalFields1711360000001 implements MigrationInterface {
  name = 'AddCustomerCorePersonalFields1711360000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE customer_core
        ADD COLUMN IF NOT EXISTS spouse_name VARCHAR(100),
        ADD COLUMN IF NOT EXISTS father_name VARCHAR(100),
        ADD COLUMN IF NOT EXISTS mother_name VARCHAR(100),
        ADD COLUMN IF NOT EXISTS id_issue_type VARCHAR(2),
        ADD COLUMN IF NOT EXISTS id_issue_date TIMESTAMP,
        ADD COLUMN IF NOT EXISTS id_issue_address VARCHAR(100),
        ADD COLUMN IF NOT EXISTS driver_license VARCHAR(20);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE customer_core
        DROP COLUMN IF EXISTS spouse_name,
        DROP COLUMN IF EXISTS father_name,
        DROP COLUMN IF EXISTS mother_name,
        DROP COLUMN IF EXISTS id_issue_type,
        DROP COLUMN IF EXISTS id_issue_date,
        DROP COLUMN IF EXISTS id_issue_address,
        DROP COLUMN IF EXISTS driver_license;
    `);
  }
}
