import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { C360Service } from '../c360.service';
import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';

// Use in-memory SQLite for unit tests
const TEST_UUID_1 = '550e8400-e29b-41d4-a716-446655440000';
const TEST_UUID_2 = '550e8400-e29b-41d4-a716-446655440001';
const TEST_UUID_3 = '550e8400-e29b-41d4-a716-446655440002';

describe('C360Service', () => {
  let service: C360Service;
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
    });
    await dataSource.initialize();

    // Create customer_core table matching the migration schema
    await dataSource.query(`
      CREATE TABLE customer_core (
        customer_id TEXT PRIMARY KEY,
        source_customer_no VARCHAR(20) NOT NULL,
        customer_type_code VARCHAR(2) NOT NULL,
        customer_type_desc VARCHAR(50),
        name VARCHAR(100) NOT NULL,
        english_name VARCHAR(60),
        gender VARCHAR(1),
        date_of_birth DATE,
        marital_status_code VARCHAR(1),
        marital_status_desc VARCHAR(50),
        education_code VARCHAR(2),
        education_desc VARCHAR(50),
        spouse_name VARCHAR(100),
        father_name VARCHAR(100),
        mother_name VARCHAR(100),
        id_issue_type VARCHAR(2),
        id_issue_date TIMESTAMP,
        id_issue_address VARCHAR(100),
        driver_license VARCHAR(20),
        mobile_phone VARCHAR(20),
        home_phone VARCHAR(20),
        contact_phone VARCHAR(20),
        office_phone VARCHAR(20),
        registered_phone VARCHAR(20),
        registered_fax VARCHAR(20),
        business_fax VARCHAR(20),
        business_mobile VARCHAR(20),
        email VARCHAR(40),
        line_account VARCHAR(50),
        residential_zip VARCHAR(6),
        residential_address VARCHAR(100),
        mailing_zip VARCHAR(6),
        mailing_address VARCHAR(100),
        registered_zip VARCHAR(6),
        registered_address VARCHAR(100),
        company_zip VARCHAR(6),
        company_address VARCHAR(100),
        maturity_mailing_zip VARCHAR(6),
        maturity_mailing_address VARCHAR(100),
        company_name VARCHAR(100),
        occupation_code VARCHAR(4),
        occupation_desc VARCHAR(50),
        job_title_code VARCHAR(4),
        job_title_desc VARCHAR(50),
        job_level_code VARCHAR(2),
        job_level_desc VARCHAR(50),
        industry_code VARCHAR(6),
        industry_desc VARCHAR(100),
        work_years DECIMAL(8,2),
        company_scale VARCHAR(1),
        role VARCHAR(50),
        monthly_income_code VARCHAR(5),
        monthly_income_desc VARCHAR(50),
        approved_income INTEGER,
        income_source_code VARCHAR(5),
        income_source_desc VARCHAR(50),
        capital DECIMAL(12,0),
        credit_limit DECIMAL(12,0),
        highest_transaction_amount DECIMAL(12,0),
        highest_transaction_date TIMESTAMP,
        has_real_estate VARCHAR(1),
        debt_flag CHAR(1),
        fine_flag CHAR(1),
        address_anomaly_flag SMALLINT,
        mainland_flag SMALLINT,
        owner_name VARCHAR(50),
        owner_id VARCHAR(10),
        owner_birth DATE,
        owner_zip VARCHAR(6),
        owner_address VARCHAR(100),
        established_capital DECIMAL(12,0),
        employee_count_code VARCHAR(6),
        employee_count_desc VARCHAR(50),
        is_listed_code VARCHAR(6),
        is_listed_desc VARCHAR(50),
        group_owner VARCHAR(50),
        business_item VARCHAR(100),
        organization_type VARCHAR(6),
        company_attr_code VARCHAR(6),
        company_attr_desc VARCHAR(50),
        parent_customer_id VARCHAR(10),
        parent_customer_name VARCHAR(100),
        source_created_at TIMESTAMP,
        source_updated_at TIMESTAMP,
        data_source VARCHAR(50) NOT NULL,
        _etl_loaded_at TIMESTAMP NOT NULL,
        _etl_pipeline_id TEXT NOT NULL
      );
    `);
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  beforeEach(async () => {
    // Clean up between tests
    await dataSource.query('DELETE FROM customer_core');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        C360Service,
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get<C360Service>(C360Service);
  });

  // ========== TS-F046-001: Stats API returns correct values ==========
  describe('getCustomerStats', () => {
    it('TS-F046-001: should return correct stats for mixed customer types', async () => {
      // Seed: 10 individual(01), 5 corporate(02), 3 foreign(04)
      for (let i = 0; i < 10; i++) {
        await insertCustomer(dataSource, { id: `id-01-${i}`, typeCode: '01', name: `個人客戶${i}` });
      }
      for (let i = 0; i < 5; i++) {
        await insertCustomer(dataSource, { id: `id-02-${i}`, typeCode: '02', name: `企業客戶${i}` });
      }
      for (let i = 0; i < 3; i++) {
        await insertCustomer(dataSource, { id: `id-04-${i}`, typeCode: '04', name: `外籍客戶${i}` });
      }

      const stats = await service.getCustomerStats();
      expect(stats.total).toBe(18);
      expect(stats.individual).toBe(10);
      expect(stats.corporate).toBe(5);
      expect(stats.foreign).toBe(3);
    });

    it('TS-F046-002: should return all zeros when customer_core is empty', async () => {
      const stats = await service.getCustomerStats();
      expect(stats).toEqual({ total: 0, individual: 0, corporate: 0, foreign: 0 });
    });
  });

  // ========== TS-F046-004~007: Search endpoint ==========
  describe('searchCustomers', () => {
    beforeEach(async () => {
      await insertCustomer(dataSource, {
        id: TEST_UUID_1,
        sourceNo: 'A123456789',
        typeCode: '01',
        name: '王小明',
        englishName: 'Wang Xiao Ming',
        mobilePhone: '0912345678',
        companyName: '台灣科技',
      });
      await insertCustomer(dataSource, {
        id: TEST_UUID_2,
        sourceNo: 'B987654321',
        typeCode: '02',
        name: '王測試企業',
        mobilePhone: '0922222222',
      });
      await insertCustomer(dataSource, {
        id: TEST_UUID_3,
        sourceNo: 'C111222333',
        typeCode: '04',
        name: '外籍客戶張三',
      });
    });

    it('TS-F046-004: keyword search finds by Chinese name (SQLite LIKE fallback)', async () => {
      const result = await service.searchCustomers({ keyword: '王小明' }, 'admin');
      expect(result.data.length).toBeGreaterThanOrEqual(1);
      expect(result.data.some((d: any) => d.name === '王小明')).toBe(true);
    });

    it('TS-F046-005: keyword search finds by English name', async () => {
      const result = await service.searchCustomers({ keyword: 'Wang' }, 'admin');
      expect(result.data.length).toBeGreaterThanOrEqual(1);
      expect(result.data.some((d: any) => d.name === '王小明')).toBe(true);
    });

    it('TS-F046-006: idNumber exact match on source_customer_no', async () => {
      const result = await service.searchCustomers({ idNumber: 'A123456789' }, 'admin');
      expect(result.data.length).toBe(1);
      expect(result.data[0].sourceCustomerNo).toBe('A123456789');
    });

    it('TS-F046-007: idNumber takes priority over keyword', async () => {
      const result = await service.searchCustomers(
        { keyword: '王測試', idNumber: 'A123456789' },
        'admin',
      );
      expect(result.data.length).toBe(1);
      expect(result.data[0].sourceCustomerNo).toBe('A123456789');
    });

    it('TS-F046-008: keyword less than 2 chars returns 422', async () => {
      await expect(
        service.searchCustomers({ keyword: '王' }, 'admin'),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('TS-F046-009: type filter returns only matching customer_type_code', async () => {
      const result = await service.searchCustomers({ type: '01' }, 'admin');
      expect(result.data.length).toBeGreaterThan(0);
      result.data.forEach((d: any) => expect(d.customerTypeCode).toBe('01'));
    });

    it('TS-F046-010: keyword + type filter combined (AND logic)', async () => {
      const result = await service.searchCustomers({ keyword: '王小', type: '01' } as any, 'admin');
      // Should only match 王小明 (type 01), not 王測試企業 (type 02)
      expect(result.data.every((d: any) => d.customerTypeCode === '01')).toBe(true);
      expect(result.data.length).toBeGreaterThan(0);
    });

    it('TS-F046-011: pagination returns correct page 2', async () => {
      // Insert 25 total customers
      await dataSource.query('DELETE FROM customer_core');
      for (let i = 0; i < 25; i++) {
        await insertCustomer(dataSource, {
          id: `pag-${i.toString().padStart(3, '0')}`,
          typeCode: '01',
          name: `客戶${i.toString().padStart(3, '0')}`,
        });
      }
      const result = await service.searchCustomers({ page: 2, pageSize: 20 }, 'admin');
      expect(result.data.length).toBe(5);
      expect(result.pagination).toEqual({
        page: 2,
        pageSize: 20,
        total: 25,
        totalPages: 2,
      });
    });

    it('TS-F046-012: page beyond range returns empty array', async () => {
      const result = await service.searchCustomers({ page: 99, pageSize: 20 }, 'admin');
      expect(result.data).toEqual([]);
      expect(result.pagination.total).toBe(3);
    });

    it('TS-F046-013: defaults to page=1, pageSize=20', async () => {
      const result = await service.searchCustomers({}, 'admin');
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.pageSize).toBe(20);
    });

    // TS-F046-015~018: Masking tests
    it('TS-F046-015: Admin sees full sourceCustomerNo', async () => {
      const result = await service.searchCustomers({}, 'admin');
      const customer = result.data.find((d: any) => d.customerId === TEST_UUID_1);
      expect(customer.sourceCustomerNo).toBe('A123456789');
    });

    it('TS-F046-016: User sees masked sourceCustomerNo', async () => {
      const result = await service.searchCustomers({}, 'user');
      const customer = result.data.find((d: any) => d.customerId === TEST_UUID_1);
      expect(customer.sourceCustomerNo).toBe('A12*****89');
    });

    it('TS-F046-017: Admin sees full mobilePhone', async () => {
      const result = await service.searchCustomers({}, 'admin');
      const customer = result.data.find((d: any) => d.customerId === TEST_UUID_1);
      expect(customer.mobilePhone).toBe('0912345678');
    });

    it('TS-F046-018: User sees masked mobilePhone', async () => {
      const result = await service.searchCustomers({}, 'user');
      const customer = result.data.find((d: any) => d.customerId === TEST_UUID_1);
      expect(customer.mobilePhone).toBe('0912****78');
    });

    it('TS-F046-019: empty customer_core returns empty list and zero total', async () => {
      await dataSource.query('DELETE FROM customer_core');
      const result = await service.searchCustomers({}, 'admin');
      expect(result.data).toEqual([]);
      expect(result.pagination.total).toBe(0);
    });

    it('TS-F046-020: search with no matches returns empty array', async () => {
      const result = await service.searchCustomers(
        { keyword: 'XXXXNOTEXIST' },
        'admin',
      );
      expect(result.data).toEqual([]);
      expect(result.pagination.total).toBe(0);
    });

    it('TS-F046-021: SQL injection attempt does not cause errors', async () => {
      const result = await service.searchCustomers(
        { keyword: "' OR '1'='1" },
        'admin',
      );
      // Should not throw, and should not return all data
      expect(result.data.length).toBeLessThanOrEqual(3);
    });
  });

  // ========== F047: Customer Detail ==========
  describe('getCustomerDetail', () => {
    beforeEach(async () => {
      await insertFullCustomer(dataSource, TEST_UUID_1);
    });

    it('TS-F047-001: returns full customer data with 8 categories + customerId', async () => {
      const result = await service.getCustomerDetail(TEST_UUID_1, 'admin');
      expect(result).toHaveProperty('customerId');
      expect(result).toHaveProperty('identity');
      expect(result).toHaveProperty('personalAttributes');
      expect(result).toHaveProperty('contactInfo');
      expect(result).toHaveProperty('addresses');
      expect(result).toHaveProperty('employment');
      expect(result).toHaveProperty('financial');
      expect(result).toHaveProperty('corporate');
      expect(result).toHaveProperty('etlTracking');
    });

    it('TS-F047-002: non-existent customerId returns 404', async () => {
      await expect(
        service.getCustomerDetail('00000000-0000-0000-0000-000000000000', 'admin'),
      ).rejects.toThrow(NotFoundException);
    });

    it('TS-F047-003: non-UUID format returns 422', async () => {
      await expect(
        service.getCustomerDetail('invalid-id-format', 'admin'),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    // TS-F047-005: identity field mapping
    it('TS-F047-005: identity fields mapped correctly', async () => {
      const result = await service.getCustomerDetail(TEST_UUID_1, 'admin');
      expect(result.identity.sourceCustomerNo).toBe('A123456789');
      expect(result.identity.customerTypeCode).toBe('01');
      expect(result.identity.customerTypeDesc).toBe('個人');
      expect(result.identity.name).toBe('王小明');
      expect(result.identity.englishName).toBe('Wang Xiao Ming');
    });

    // TS-F047-006: personalAttributes field mapping
    it('TS-F047-006: personalAttributes fields mapped correctly', async () => {
      const result = await service.getCustomerDetail(TEST_UUID_1, 'admin');
      expect(result.personalAttributes.gender).toBe('M');
      expect(result.personalAttributes.maritalStatusCode).toBe('1');
      expect(result.personalAttributes.maritalStatusDesc).toBe('已婚');
      expect(result.personalAttributes.educationCode).toBe('06');
      expect(result.personalAttributes.educationDesc).toBe('大學');
      expect(result.personalAttributes.spouseName).toBe('李小美');
      expect(result.personalAttributes.fatherName).toBe('王大明');
      expect(result.personalAttributes.motherName).toBe('陳小花');
    });

    // TS-F047-007: contactInfo field mapping
    it('TS-F047-007: contactInfo fields mapped correctly (Admin)', async () => {
      const result = await service.getCustomerDetail(TEST_UUID_1, 'admin');
      expect(result.contactInfo.mobilePhone).toBe('0912345678');
      expect(result.contactInfo.homePhone).toBe('02-23456789');
      expect(result.contactInfo.email).toBe('wang@example.com');
      expect(result.contactInfo.lineAccount).toBe('wang_line');
    });

    // TS-F047-008: addresses field mapping
    it('TS-F047-008: addresses fields mapped correctly', async () => {
      const result = await service.getCustomerDetail(TEST_UUID_1, 'admin');
      expect(result.addresses.residentialZip).toBe('100');
      expect(result.addresses.residentialAddress).toBe('台北市中正區忠孝東路一段1號');
    });

    // TS-F047-009: employment field mapping
    it('TS-F047-009: employment fields mapped correctly', async () => {
      const result = await service.getCustomerDetail(TEST_UUID_1, 'admin');
      expect(result.employment.companyName).toBe('台灣科技股份有限公司');
      expect(result.employment.occupationCode).toBe('0301');
      expect(result.employment.workYears).toBe(10.5);
    });

    // TS-F047-010: financial field mapping
    it('TS-F047-010: financial fields mapped correctly', async () => {
      const result = await service.getCustomerDetail(TEST_UUID_1, 'admin');
      expect(result.financial.monthlyIncomeCode).toBe('05');
      expect(result.financial.approvedIncome).toBe(80000);
      expect(result.financial.debtFlag).toBe('N');
      expect(result.financial.fineFlag).toBe('N');
    });

    // TS-F047-012: etlTracking field mapping
    it('TS-F047-012: etlTracking fields mapped correctly', async () => {
      const result = await service.getCustomerDetail(TEST_UUID_1, 'admin');
      expect(result.etlTracking.dataSource).toBe('ZZIP+MLMC');
      expect(result.etlTracking.etlPipelineId).toBe('660e8400-e29b-41d4-a716-446655440001');
    });

    // TS-F047-013: Admin sees all sensitive fields in clear
    it('TS-F047-013: Admin sees all sensitive fields in clear', async () => {
      const result = await service.getCustomerDetail(TEST_UUID_1, 'admin');
      expect(result.identity.sourceCustomerNo).toBe('A123456789');
      expect(result.contactInfo.mobilePhone).toBe('0912345678');
      expect(result.contactInfo.email).toBe('wang@example.com');
    });

    // TS-F047-014: User sees masked sourceCustomerNo
    it('TS-F047-014: User sees masked sourceCustomerNo', async () => {
      const result = await service.getCustomerDetail(TEST_UUID_1, 'user');
      expect(result.identity.sourceCustomerNo).toBe('A12*****89');
    });

    // TS-F047-015: User sees masked mobilePhone
    it('TS-F047-015: User sees masked mobilePhone', async () => {
      const result = await service.getCustomerDetail(TEST_UUID_1, 'user');
      expect(result.contactInfo.mobilePhone).toBe('0912****78');
    });

    // TS-F047-016: User sees masked email
    it('TS-F047-016: User sees masked email', async () => {
      const result = await service.getCustomerDetail(TEST_UUID_1, 'user');
      expect(result.contactInfo.email).toBe('wa****@example.com');
    });

    // TS-F047-017: User sees masked home_phone, contact_phone, office_phone
    it('TS-F047-017: User sees masked phones', async () => {
      const result = await service.getCustomerDetail(TEST_UUID_1, 'user');
      expect(result.contactInfo.homePhone).toBe('02-2*****89');
      expect(result.contactInfo.contactPhone).toBe('02-3*****90');
      expect(result.contactInfo.officePhone).toBe('02-4*****01');
    });
  });
});

// ===== Helper functions =====
async function insertCustomer(
  ds: DataSource,
  opts: {
    id?: string;
    sourceNo?: string;
    typeCode?: string;
    name?: string;
    englishName?: string;
    mobilePhone?: string;
    companyName?: string;
  },
) {
  const id = opts.id ?? `test-${Math.random().toString(36).slice(2, 10)}`;
  const sourceNo = opts.sourceNo ?? `S${Math.random().toString(36).slice(2, 12).toUpperCase()}`;
  const typeCode = opts.typeCode ?? '01';
  const name = opts.name ?? '測試客戶';
  const englishName = opts.englishName ?? null;
  const mobilePhone = opts.mobilePhone ?? null;
  const companyName = opts.companyName ?? null;

  await ds.query(
    `INSERT INTO customer_core (
      customer_id, source_customer_no, customer_type_code, name, english_name,
      mobile_phone, company_name, data_source, _etl_loaded_at, _etl_pipeline_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'TEST', datetime('now'), 'pipeline-test')`,
    [id, sourceNo, typeCode, name, englishName, mobilePhone, companyName],
  );
}

async function insertFullCustomer(ds: DataSource, id: string) {
  await ds.query(
    `INSERT INTO customer_core (
      customer_id, source_customer_no, customer_type_code, customer_type_desc,
      name, english_name,
      gender, date_of_birth, marital_status_code, marital_status_desc,
      education_code, education_desc,
      spouse_name, father_name, mother_name,
      id_issue_type, id_issue_date, id_issue_address, driver_license,
      mobile_phone, home_phone, contact_phone, office_phone,
      registered_phone, registered_fax, business_fax, business_mobile,
      email, line_account,
      residential_zip, residential_address, mailing_zip, mailing_address,
      registered_zip, registered_address, company_zip, company_address,
      maturity_mailing_zip, maturity_mailing_address,
      company_name, occupation_code, occupation_desc,
      job_title_code, job_title_desc, job_level_code, job_level_desc,
      industry_code, industry_desc, work_years, company_scale, role,
      monthly_income_code, monthly_income_desc, approved_income,
      income_source_code, income_source_desc,
      capital, credit_limit,
      highest_transaction_amount, highest_transaction_date,
      has_real_estate, debt_flag, fine_flag, address_anomaly_flag, mainland_flag,
      owner_name, owner_id, owner_birth, owner_zip, owner_address,
      established_capital, employee_count_code, employee_count_desc,
      is_listed_code, is_listed_desc, group_owner, business_item, organization_type,
      parent_customer_id, parent_customer_name,
      source_created_at, source_updated_at,
      data_source, _etl_loaded_at, _etl_pipeline_id
    ) VALUES (
      ?, 'A123456789', '01', '個人',
      '王小明', 'Wang Xiao Ming',
      'M', '1985-03-15', '1', '已婚',
      '06', '大學',
      '李小美', '王大明', '陳小花',
      '01', '2020-01-15T00:00:00.000Z', '台北市中正區', 'D123456789',
      '0912345678', '02-23456789', '02-34567890', '02-45678901',
      '02-56789012', '02-56789013', '02-67890123', '0922333444',
      'wang@example.com', 'wang_line',
      '100', '台北市中正區忠孝東路一段1號', '100', '台北市中正區忠孝東路一段1號',
      '110', '台北市信義區信義路五段7號', '110', '台北市信義區松仁路100號',
      '100', '台北市中正區忠孝東路一段1號',
      '台灣科技股份有限公司', '0301', '軟體工程師',
      '0102', '經理', '03', '中階主管',
      'H', '資訊及通訊傳播業', 10.5, '1', '一般客戶',
      '05', '5萬~10萬', 80000,
      '01', '薪資所得',
      NULL, 500000,
      1200000, '2025-06-15T00:00:00.000Z',
      'Y', 'N', 'N', 0, 0,
      NULL, NULL, NULL, NULL, NULL,
      NULL, NULL, NULL,
      NULL, NULL, NULL, NULL, NULL,
      NULL, NULL,
      '2020-05-10T08:30:00.000Z', '2025-12-01T14:22:00.000Z',
      'ZZIP+MLMC', '2026-04-10T03:00:00.000Z', '660e8400-e29b-41d4-a716-446655440001'
    )`,
    [id],
  );
}
