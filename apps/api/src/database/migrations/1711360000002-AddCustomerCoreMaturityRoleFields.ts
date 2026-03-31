import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add maturity mailing address (D.地址) and role code/desc (E.職業) to customer_core
 */
export class AddCustomerCoreMaturityRoleFields1711360000002 implements MigrationInterface {
  name = 'AddCustomerCoreMaturityRoleFields1711360000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE customer_core
        ADD COLUMN IF NOT EXISTS maturity_mailing_zip VARCHAR(6),
        ADD COLUMN IF NOT EXISTS maturity_mailing_address VARCHAR(100),
        ADD COLUMN IF NOT EXISTS role_code VARCHAR(4),
        ADD COLUMN IF NOT EXISTS role_desc VARCHAR(50);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE customer_core
        DROP COLUMN IF EXISTS maturity_mailing_zip,
        DROP COLUMN IF EXISTS maturity_mailing_address,
        DROP COLUMN IF EXISTS role_code,
        DROP COLUMN IF EXISTS role_desc;
    `);
  }
}
