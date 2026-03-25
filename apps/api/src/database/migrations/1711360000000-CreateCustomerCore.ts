import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * F036 v2.0: Create customer_core target table (Phase 1 MVP)
 * 54 columns across 8 categories (A~H)
 * This table is NOT managed by TypeORM Entity (per AD-E05-5)
 */
export class CreateCustomerCore1711360000000 implements MigrationInterface {
  name = 'CreateCustomerCore1711360000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS customer_core (
        -- A. 識別與分類
        customer_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        source_customer_no VARCHAR(20) NOT NULL,
        customer_type VARCHAR(2) NOT NULL,
        name VARCHAR(100) NOT NULL,
        english_name VARCHAR(60),

        -- B. 個人屬性
        gender VARCHAR(1),
        date_of_birth DATE,
        marital_status VARCHAR(1),
        education_code VARCHAR(2),
        education_desc VARCHAR(50),

        -- C. 聯絡資訊
        mobile_phone VARCHAR(20),
        home_phone VARCHAR(20),
        contact_phone VARCHAR(20),
        office_phone VARCHAR(20),
        email VARCHAR(40),
        line_account VARCHAR(50),

        -- D. 地址
        residential_zip VARCHAR(6),
        residential_address VARCHAR(100),
        mailing_zip VARCHAR(6),
        mailing_address VARCHAR(100),
        company_zip VARCHAR(6),
        company_address VARCHAR(100),

        -- E. 職業與就業
        company_name VARCHAR(100),
        occupation_code VARCHAR(4),
        occupation_desc VARCHAR(50),
        job_title_code VARCHAR(4),
        job_title_desc VARCHAR(50),
        job_level VARCHAR(2),
        industry_code VARCHAR(6),
        industry_desc VARCHAR(100),
        work_years DECIMAL(8,2),
        company_scale VARCHAR(1),

        -- F. 財務與風控
        monthly_income DECIMAL(8,0),
        approved_income INTEGER,
        income_source VARCHAR(5),
        capital DECIMAL(12,0),
        credit_limit DECIMAL(12,0),
        has_real_estate VARCHAR(1),
        debt_flag CHAR(1),
        fine_flag CHAR(1),
        address_anomaly_flag SMALLINT,
        mainland_flag SMALLINT,

        -- G. 企業客戶專屬
        owner_name VARCHAR(50),
        owner_id VARCHAR(10),
        owner_birth DATE,
        established_capital DECIMAL(12,0),
        employee_count VARCHAR(6),
        is_listed VARCHAR(6),
        parent_customer_id VARCHAR(10),

        -- H. 稽核與 ETL 追蹤
        source_created_at TIMESTAMP,
        source_updated_at TIMESTAMP,
        data_source VARCHAR(50) NOT NULL,
        _etl_loaded_at TIMESTAMP NOT NULL,
        _etl_pipeline_id UUID NOT NULL
      );
    `);

    // Indexes
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_core_source_no
        ON customer_core(source_customer_no);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_customer_core_etl_pipeline
        ON customer_core(_etl_pipeline_id);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_customer_core_etl_pipeline;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_customer_core_source_no;`);
    await queryRunner.query(`DROP TABLE IF EXISTS customer_core;`);
  }
}
