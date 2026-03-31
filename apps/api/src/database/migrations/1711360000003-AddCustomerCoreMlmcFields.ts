import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add MLMC enterprise customer fields to customer_core
 * - C.聯絡 +4: registered_phone, registered_fax, business_fax, business_mobile
 * - D.地址 +2: registered_zip, registered_address
 * - F.財務 +2: highest_transaction_amount, highest_transaction_date
 * - G.企業 +6: parent_customer_name, group_owner, company_attr_code, organization_type, owner_zip, owner_address
 */
export class AddCustomerCoreMlmcFields1711360000003 implements MigrationInterface {
  name = 'AddCustomerCoreMlmcFields1711360000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE customer_core
        ADD COLUMN IF NOT EXISTS registered_phone VARCHAR(20),
        ADD COLUMN IF NOT EXISTS registered_fax VARCHAR(20),
        ADD COLUMN IF NOT EXISTS business_fax VARCHAR(20),
        ADD COLUMN IF NOT EXISTS business_mobile VARCHAR(20),
        ADD COLUMN IF NOT EXISTS registered_zip VARCHAR(6),
        ADD COLUMN IF NOT EXISTS registered_address VARCHAR(100),
        ADD COLUMN IF NOT EXISTS highest_transaction_amount DECIMAL(12,0),
        ADD COLUMN IF NOT EXISTS highest_transaction_date TIMESTAMP,
        ADD COLUMN IF NOT EXISTS parent_customer_name VARCHAR(100),
        ADD COLUMN IF NOT EXISTS group_owner VARCHAR(50),
        ADD COLUMN IF NOT EXISTS company_attr_code VARCHAR(6),
        ADD COLUMN IF NOT EXISTS organization_type VARCHAR(6),
        ADD COLUMN IF NOT EXISTS owner_zip VARCHAR(6),
        ADD COLUMN IF NOT EXISTS owner_address VARCHAR(100);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE customer_core
        DROP COLUMN IF EXISTS registered_phone,
        DROP COLUMN IF EXISTS registered_fax,
        DROP COLUMN IF EXISTS business_fax,
        DROP COLUMN IF EXISTS business_mobile,
        DROP COLUMN IF EXISTS registered_zip,
        DROP COLUMN IF EXISTS registered_address,
        DROP COLUMN IF EXISTS highest_transaction_amount,
        DROP COLUMN IF EXISTS highest_transaction_date,
        DROP COLUMN IF EXISTS parent_customer_name,
        DROP COLUMN IF EXISTS group_owner,
        DROP COLUMN IF EXISTS company_attr_code,
        DROP COLUMN IF EXISTS organization_type,
        DROP COLUMN IF EXISTS owner_zip,
        DROP COLUMN IF EXISTS owner_address;
    `);
  }
}
