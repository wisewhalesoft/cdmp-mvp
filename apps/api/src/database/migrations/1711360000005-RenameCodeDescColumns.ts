import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * F036 v2.3: Rename code fields to _code suffix, add _desc columns, replace role_code/role_desc with role
 *
 * Renames: marital_status→marital_status_code, customer_type→customer_type_code,
 *          income_source→income_source_code, job_level→job_level_code, monthly_income→monthly_income_code
 * Adds:    marital_status_desc, customer_type_desc, income_source_desc, job_level_desc, monthly_income_desc
 * Removes: role_code, role_desc → replaces with role VARCHAR(50)
 * Net: 79 → 83 columns
 */
export class RenameCodeDescColumns1711360000005 implements MigrationInterface {
  name = 'RenameCodeDescColumns1711360000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Rename existing columns to _code suffix
    await queryRunner.query(`ALTER TABLE customer_core RENAME COLUMN customer_type TO customer_type_code`);
    await queryRunner.query(`ALTER TABLE customer_core RENAME COLUMN marital_status TO marital_status_code`);
    await queryRunner.query(`ALTER TABLE customer_core RENAME COLUMN job_level TO job_level_code`);
    await queryRunner.query(`ALTER TABLE customer_core RENAME COLUMN income_source TO income_source_code`);
    await queryRunner.query(`ALTER TABLE customer_core RENAME COLUMN monthly_income TO monthly_income_code`);

    // Change monthly_income_code type from DECIMAL(8,0) to VARCHAR(5) (it's a code, not a number)
    await queryRunner.query(`ALTER TABLE customer_core ALTER COLUMN monthly_income_code TYPE VARCHAR(5) USING monthly_income_code::VARCHAR(5)`);

    // Add new _desc columns
    await queryRunner.query(`
      ALTER TABLE customer_core
        ADD COLUMN IF NOT EXISTS customer_type_desc VARCHAR(50),
        ADD COLUMN IF NOT EXISTS marital_status_desc VARCHAR(50),
        ADD COLUMN IF NOT EXISTS job_level_desc VARCHAR(50),
        ADD COLUMN IF NOT EXISTS income_source_desc VARCHAR(50),
        ADD COLUMN IF NOT EXISTS monthly_income_desc VARCHAR(50);
    `);

    // Replace role_code + role_desc with single role column
    await queryRunner.query(`ALTER TABLE customer_core ADD COLUMN IF NOT EXISTS role VARCHAR(50)`);
    await queryRunner.query(`ALTER TABLE customer_core DROP COLUMN IF EXISTS role_code`);
    await queryRunner.query(`ALTER TABLE customer_core DROP COLUMN IF EXISTS role_desc`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restore role_code + role_desc
    await queryRunner.query(`ALTER TABLE customer_core ADD COLUMN IF NOT EXISTS role_code VARCHAR(100)`);
    await queryRunner.query(`ALTER TABLE customer_core ADD COLUMN IF NOT EXISTS role_desc VARCHAR(50)`);
    await queryRunner.query(`ALTER TABLE customer_core DROP COLUMN IF EXISTS role`);

    // Drop _desc columns
    await queryRunner.query(`
      ALTER TABLE customer_core
        DROP COLUMN IF EXISTS customer_type_desc,
        DROP COLUMN IF EXISTS marital_status_desc,
        DROP COLUMN IF EXISTS job_level_desc,
        DROP COLUMN IF EXISTS income_source_desc,
        DROP COLUMN IF EXISTS monthly_income_desc;
    `);

    // Revert monthly_income_code type back to DECIMAL
    await queryRunner.query(`ALTER TABLE customer_core ALTER COLUMN monthly_income_code TYPE DECIMAL(8,0) USING monthly_income_code::DECIMAL(8,0)`);

    // Rename _code columns back
    await queryRunner.query(`ALTER TABLE customer_core RENAME COLUMN customer_type_code TO customer_type`);
    await queryRunner.query(`ALTER TABLE customer_core RENAME COLUMN marital_status_code TO marital_status`);
    await queryRunner.query(`ALTER TABLE customer_core RENAME COLUMN job_level_code TO job_level`);
    await queryRunner.query(`ALTER TABLE customer_core RENAME COLUMN income_source_code TO income_source`);
    await queryRunner.query(`ALTER TABLE customer_core RENAME COLUMN monthly_income_code TO monthly_income`);
  }
}
