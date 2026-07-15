import { describe, it, expect } from 'vitest';
import { TARGET_TABLE_SCHEMAS } from '../target-table-schemas';

describe('target-table-schemas: customer_core', () => {
  const schema = TARGET_TABLE_SCHEMAS.find((t) => t.tableName === 'customer_core');

  it('should have two schemas (customer_core + customer_financial, F114)', () => {
    expect(TARGET_TABLE_SCHEMAS).toHaveLength(2);
    expect(schema).toBeDefined();
    expect(TARGET_TABLE_SCHEMAS.map((t) => t.tableName)).toContain(
      'customer_financial',
    );
  });

  it('should not contain Phase 2/3 placeholder tables', () => {
    const tableNames = TARGET_TABLE_SCHEMAS.map((t) => t.tableName);
    // customer_financial 已於 F114 實作為正式目標表，不再是佔位表
    expect(tableNames).not.toContain('customer_interaction');
    expect(tableNames).not.toContain('customer_service');
  });

  it('should have correct metadata', () => {
    expect(schema!.displayName).toBe('Customer Core（客戶主檔）');
    expect(schema!.domain).toBe('core');
    expect(schema!.description).toBe('客戶身分、聯絡、職業、財務概況與風控旗標');
  });

  // TS-F036-039: A~H 所有分類欄位
  describe('TS-F036-039: A~H category coverage', () => {
    const columnNames = () => schema!.columns.map((c) => c.name);

    it('A. 識別與分類 (6 columns)', () => {
      const names = columnNames();
      expect(names).toContain('customer_id');
      expect(names).toContain('source_customer_no');
      expect(names).toContain('customer_type_code');
      expect(names).toContain('customer_type_desc');
      expect(names).toContain('name');
      expect(names).toContain('english_name');
    });

    it('B. 個人屬性 (13 columns)', () => {
      const names = columnNames();
      expect(names).toContain('gender');
      expect(names).toContain('date_of_birth');
      expect(names).toContain('marital_status_code');
      expect(names).toContain('marital_status_desc');
      expect(names).toContain('education_code');
      expect(names).toContain('education_desc');
      expect(names).toContain('spouse_name');
      expect(names).toContain('father_name');
      expect(names).toContain('mother_name');
      expect(names).toContain('id_issue_type');
      expect(names).toContain('id_issue_date');
      expect(names).toContain('id_issue_address');
      expect(names).toContain('driver_license');
    });

    it('C. 聯絡資訊 (10 columns)', () => {
      const names = columnNames();
      expect(names).toContain('mobile_phone');
      expect(names).toContain('home_phone');
      expect(names).toContain('contact_phone');
      expect(names).toContain('office_phone');
      expect(names).toContain('registered_phone');
      expect(names).toContain('registered_fax');
      expect(names).toContain('business_fax');
      expect(names).toContain('business_mobile');
      expect(names).toContain('email');
      expect(names).toContain('line_account');
    });

    it('D. 地址 (10 columns)', () => {
      const names = columnNames();
      expect(names).toContain('residential_zip');
      expect(names).toContain('residential_address');
      expect(names).toContain('mailing_zip');
      expect(names).toContain('mailing_address');
      expect(names).toContain('registered_zip');
      expect(names).toContain('registered_address');
      expect(names).toContain('company_zip');
      expect(names).toContain('company_address');
      expect(names).toContain('maturity_mailing_zip');
      expect(names).toContain('maturity_mailing_address');
    });

    it('E. 職業與就業 (12 columns)', () => {
      const names = columnNames();
      expect(names).toContain('company_name');
      expect(names).toContain('role');
      expect(names).toContain('occupation_code');
      expect(names).toContain('occupation_desc');
      expect(names).toContain('job_title_code');
      expect(names).toContain('job_title_desc');
      expect(names).toContain('job_level_code');
      expect(names).toContain('job_level_desc');
      expect(names).toContain('industry_code');
      expect(names).toContain('industry_desc');
      expect(names).toContain('work_years');
      expect(names).toContain('company_scale');
    });

    it('F. 財務與風控 (14 columns)', () => {
      const names = columnNames();
      expect(names).toContain('monthly_income_code');
      expect(names).toContain('monthly_income_desc');
      expect(names).toContain('approved_income');
      expect(names).toContain('income_source_code');
      expect(names).toContain('income_source_desc');
      expect(names).toContain('capital');
      expect(names).toContain('credit_limit');
      expect(names).toContain('highest_transaction_amount');
      expect(names).toContain('highest_transaction_date');
      expect(names).toContain('has_real_estate');
      expect(names).toContain('debt_flag');
      expect(names).toContain('fine_flag');
      expect(names).toContain('address_anomaly_flag');
      expect(names).toContain('mainland_flag');
    });

    it('G. 企業客戶專屬 (15 columns)', () => {
      const names = columnNames();
      expect(names).toContain('owner_name');
      expect(names).toContain('owner_id');
      expect(names).toContain('owner_birth');
      expect(names).toContain('owner_zip');
      expect(names).toContain('owner_address');
      expect(names).toContain('group_owner');
      expect(names).toContain('established_capital');
      expect(names).toContain('employee_count_code');
      expect(names).toContain('employee_count_desc');
      expect(names).toContain('is_listed_code');
      expect(names).toContain('is_listed_desc');
      expect(names).toContain('business_item');
      expect(names).toContain('organization_type');
      expect(names).toContain('parent_customer_id');
      expect(names).toContain('parent_customer_name');
    });

    it('H. 稽核與 ETL 追蹤 (5 columns)', () => {
      const names = columnNames();
      expect(names).toContain('source_created_at');
      expect(names).toContain('source_updated_at');
      expect(names).toContain('data_source');
      expect(names).toContain('_etl_loaded_at');
      expect(names).toContain('_etl_pipeline_id');
    });

    it('total columns = 85 (6+13+10+10+12+14+15+5)', () => {
      expect(schema!.columns).toHaveLength(85);
    });
  });

  // TS-F036-040: Excluded fields should not exist
  describe('TS-F036-040: excluded fields should not exist', () => {
    const excludedFields = [
      'print_flg', 'id_check', 'id_check_date',
      'old_p_id', 'appli_mark', 'spon_mark',
      // Also old placeholder fields that no longer exist
      'id_number', 'phone', 'address', 'occupation',
      'registration_date', 'last_updated_at',
    ];

    it.each(excludedFields)('should not contain "%s"', (field) => {
      const names = schema!.columns.map((c) => c.name);
      expect(names).not.toContain(field);
    });
  });

  describe('column type correctness', () => {
    const findCol = (name: string) => schema!.columns.find((c) => c.name === name)!;

    it('customer_id is UUID, PK, NOT NULL', () => {
      const col = findCol('customer_id');
      expect(col.type).toBe('UUID');
      expect(col.isPrimaryKey).toBe(true);
      expect(col.nullable).toBe(false);
    });

    it('source_customer_no is VARCHAR(20), NOT NULL', () => {
      const col = findCol('source_customer_no');
      expect(col.type).toBe('VARCHAR(20)');
      expect(col.nullable).toBe(false);
    });

    it('date_of_birth is DATE, nullable', () => {
      const col = findCol('date_of_birth');
      expect(col.type).toBe('DATE');
      expect(col.nullable).toBe(true);
    });

    it('work_years is DECIMAL(8,2), nullable', () => {
      const col = findCol('work_years');
      expect(col.type).toBe('DECIMAL(8,2)');
      expect(col.nullable).toBe(true);
    });

    it('monthly_income_code is VARCHAR(5), nullable', () => {
      const col = findCol('monthly_income_code');
      expect(col.type).toBe('VARCHAR(5)');
      expect(col.nullable).toBe(true);
    });

    it('approved_income is INTEGER, nullable', () => {
      const col = findCol('approved_income');
      expect(col.type).toBe('INTEGER');
      expect(col.nullable).toBe(true);
    });

    it('address_anomaly_flag is SMALLINT, nullable', () => {
      const col = findCol('address_anomaly_flag');
      expect(col.type).toBe('SMALLINT');
      expect(col.nullable).toBe(true);
    });

    it('debt_flag is CHAR(1), nullable', () => {
      const col = findCol('debt_flag');
      expect(col.type).toBe('CHAR(1)');
      expect(col.nullable).toBe(true);
    });

    it('data_source is VARCHAR(50), NOT NULL, isEtlTracking', () => {
      const col = findCol('data_source');
      expect(col.type).toBe('VARCHAR(50)');
      expect(col.nullable).toBe(false);
      expect(col.isEtlTracking).toBe(true);
    });

    it('_etl_loaded_at is TIMESTAMP, NOT NULL, isEtlTracking', () => {
      const col = findCol('_etl_loaded_at');
      expect(col.type).toBe('TIMESTAMP');
      expect(col.nullable).toBe(false);
      expect(col.isEtlTracking).toBe(true);
    });

    it('exactly 1 primary key (customer_id)', () => {
      const pks = schema!.columns.filter((c) => c.isPrimaryKey);
      expect(pks).toHaveLength(1);
      expect(pks[0].name).toBe('customer_id');
    });

    it('exactly 3 ETL tracking fields', () => {
      const tracking = schema!.columns.filter((c) => c.isEtlTracking);
      expect(tracking).toHaveLength(3);
      const names = tracking.map((c) => c.name).sort();
      expect(names).toEqual(['_etl_loaded_at', '_etl_pipeline_id', 'data_source']);
    });

    it('all columns have non-empty description', () => {
      for (const col of schema!.columns) {
        expect(col.description).toBeTruthy();
        expect(typeof col.description).toBe('string');
        expect(col.description.length).toBeGreaterThan(0);
      }
    });
  });
});
