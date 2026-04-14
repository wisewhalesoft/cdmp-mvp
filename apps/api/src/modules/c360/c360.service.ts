import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { maskIdNumber, maskPhone, maskEmail } from './masking.util';
import { ERROR_CODES, ERROR_MESSAGES } from '@/common/errors/error-codes';
import { CustomerListQueryDto } from './dto/customer-list-query.dto';

@Injectable()
export class C360Service {
  constructor(private readonly dataSource: DataSource) {}

  async getStats(): Promise<{
    total: number;
    individual: number;
    corporate: number;
    foreign: number;
  }> {
    const result = await this.dataSource.query(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE customer_type_code = '01') AS individual,
        COUNT(*) FILTER (WHERE customer_type_code = '02') AS corporate,
        COUNT(*) FILTER (WHERE customer_type_code = '04') AS foreign
      FROM customer_core
    `);

    const row = result[0];
    return {
      total: parseInt(row.total, 10) || 0,
      individual: parseInt(row.individual, 10) || 0,
      corporate: parseInt(row.corporate, 10) || 0,
      foreign: parseInt(row.foreign, 10) || 0,
    };
  }

  async getStatsSqlite(): Promise<{
    total: number;
    individual: number;
    corporate: number;
    foreign: number;
  }> {
    const result = await this.dataSource.query(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN customer_type_code = '01' THEN 1 ELSE 0 END) AS individual,
        SUM(CASE WHEN customer_type_code = '02' THEN 1 ELSE 0 END) AS corporate,
        SUM(CASE WHEN customer_type_code = '04' THEN 1 ELSE 0 END) AS "foreign"
      FROM customer_core
    `);

    const row = result[0];
    return {
      total: parseInt(row.total, 10) || 0,
      individual: parseInt(row.individual, 10) || 0,
      corporate: parseInt(row.corporate, 10) || 0,
      foreign: parseInt(row['foreign'], 10) || 0,
    };
  }

  async getCustomerStats(): Promise<{
    total: number;
    individual: number;
    corporate: number;
    foreign: number;
  }> {
    const isSqlite = this.dataSource.options.type === 'better-sqlite3';
    if (isSqlite) {
      return this.getStatsSqlite();
    }
    return this.getStats();
  }

  async searchCustomers(
    query: CustomerListQueryDto,
    userRole: string,
  ): Promise<{
    data: any[];
    pagination: {
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
    };
  }> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const offset = (page - 1) * pageSize;
    const isSqlite = this.dataSource.options.type === 'better-sqlite3';

    // Validate keyword minimum length
    if (query.keyword && !query.idNumber && query.keyword.length < 2) {
      throw new UnprocessableEntityException({
        error: ERROR_CODES.C360_SEARCH_MIN_LENGTH,
        message: ERROR_MESSAGES.C360_SEARCH_MIN_LENGTH,
      });
    }

    let whereClauses: string[] = [];
    let params: any[] = [];
    let paramIndex = 1;

    // Search priority: idNumber > keyword
    if (query.idNumber) {
      if (isSqlite) {
        whereClauses.push(`source_customer_no = ?`);
        params.push(query.idNumber);
      } else {
        whereClauses.push(`source_customer_no = $${paramIndex++}`);
        params.push(query.idNumber);
      }
    } else if (query.keyword && query.keyword.length >= 2) {
      if (isSqlite) {
        // SQLite fallback: LIKE search
        whereClauses.push(`(name LIKE ? OR english_name LIKE ?)`);
        params.push(`%${query.keyword}%`, `%${query.keyword}%`);
      } else {
        whereClauses.push(
          `to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(english_name, '')) @@ plainto_tsquery('simple', $${paramIndex++})`,
        );
        params.push(query.keyword);
      }
    }

    // Type filter
    if (query.type) {
      const types = query.type.split(',').map((t) => t.trim());
      if (isSqlite) {
        const placeholders = types.map(() => '?').join(', ');
        whereClauses.push(`customer_type_code IN (${placeholders})`);
        params.push(...types);
      } else {
        const placeholders = types.map(() => `$${paramIndex++}`).join(', ');
        whereClauses.push(`customer_type_code IN (${placeholders})`);
        params.push(...types);
      }
    }

    const whereStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // Count query
    const countResult = await this.dataSource.query(
      `SELECT COUNT(*) AS total FROM customer_core ${whereStr}`,
      params,
    );
    const total = parseInt(countResult[0].total, 10) || 0;
    const totalPages = Math.ceil(total / pageSize) || 0;

    // Data query
    let dataQuery: string;
    let dataParams: any[];

    if (isSqlite) {
      dataQuery = `
        SELECT customer_id, name, customer_type_code, customer_type_desc,
               source_customer_no, mobile_phone, company_name
        FROM customer_core ${whereStr}
        ORDER BY name ASC
        LIMIT ? OFFSET ?
      `;
      dataParams = [...params, pageSize, offset];
    } else {
      dataQuery = `
        SELECT customer_id, name, customer_type_code, customer_type_desc,
               source_customer_no, mobile_phone, company_name
        FROM customer_core ${whereStr}
        ORDER BY name ASC
        LIMIT $${paramIndex++} OFFSET $${paramIndex++}
      `;
      dataParams = [...params, pageSize, offset];
    }

    const rows = await this.dataSource.query(dataQuery, dataParams);

    const isAdmin = userRole?.toLowerCase() === 'admin';
    const data = rows.map((row: any) => ({
      customerId: row.customer_id,
      name: row.name,
      customerTypeCode: row.customer_type_code,
      customerTypeDesc: row.customer_type_desc ?? null,
      sourceCustomerNo: isAdmin
        ? row.source_customer_no
        : maskIdNumber(row.source_customer_no),
      mobilePhone: isAdmin
        ? row.mobile_phone ?? null
        : maskPhone(row.mobile_phone),
      companyName: row.company_name ?? null,
    }));

    return {
      data,
      pagination: { page, pageSize, total, totalPages },
    };
  }

  async getCustomerDetail(customerId: string, userRole: string): Promise<any> {
    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(customerId)) {
      throw new UnprocessableEntityException({
        error: 'VALIDATION_ERROR',
        message: '客戶 ID 格式無效，請提供有效的 UUID',
      });
    }

    const isSqlite = this.dataSource.options.type === 'better-sqlite3';
    const param = isSqlite ? '?' : '$1';
    const rows = await this.dataSource.query(
      `SELECT * FROM customer_core WHERE customer_id = ${param}`,
      [customerId],
    );

    if (rows.length === 0) {
      throw new NotFoundException({
        error: ERROR_CODES.C360_CUSTOMER_NOT_FOUND,
        message: ERROR_MESSAGES.C360_CUSTOMER_NOT_FOUND,
      });
    }

    const row = rows[0];
    const isAdmin = userRole?.toLowerCase() === 'admin';

    return {
      customerId: row.customer_id,
      identity: {
        sourceCustomerNo: isAdmin
          ? row.source_customer_no
          : maskIdNumber(row.source_customer_no),
        customerTypeCode: row.customer_type_code,
        customerTypeDesc: row.customer_type_desc ?? null,
        name: row.name,
        englishName: row.english_name ?? null,
      },
      personalAttributes: {
        gender: row.gender ?? null,
        dateOfBirth: row.date_of_birth ?? null,
        maritalStatusCode: row.marital_status_code ?? null,
        maritalStatusDesc: row.marital_status_desc ?? null,
        educationCode: row.education_code ?? null,
        educationDesc: row.education_desc ?? null,
        spouseName: row.spouse_name ?? null,
        fatherName: row.father_name ?? null,
        motherName: row.mother_name ?? null,
        idIssueType: row.id_issue_type ?? null,
        idIssueDate: row.id_issue_date ?? null,
        idIssueAddress: row.id_issue_address ?? null,
        driverLicense: row.driver_license ?? null,
      },
      contactInfo: {
        mobilePhone: isAdmin ? (row.mobile_phone ?? null) : maskPhone(row.mobile_phone),
        homePhone: isAdmin ? (row.home_phone ?? null) : maskPhone(row.home_phone),
        contactPhone: isAdmin ? (row.contact_phone ?? null) : maskPhone(row.contact_phone),
        officePhone: isAdmin ? (row.office_phone ?? null) : maskPhone(row.office_phone),
        registeredPhone: row.registered_phone ?? null,
        registeredFax: row.registered_fax ?? null,
        businessFax: row.business_fax ?? null,
        businessMobile: row.business_mobile ?? null,
        email: isAdmin ? (row.email ?? null) : maskEmail(row.email),
        lineAccount: row.line_account ?? null,
      },
      addresses: {
        residentialZip: row.residential_zip ?? null,
        residentialAddress: row.residential_address ?? null,
        mailingZip: row.mailing_zip ?? null,
        mailingAddress: row.mailing_address ?? null,
        registeredZip: row.registered_zip ?? null,
        registeredAddress: row.registered_address ?? null,
        companyZip: row.company_zip ?? null,
        companyAddress: row.company_address ?? null,
        maturityMailingZip: row.maturity_mailing_zip ?? null,
        maturityMailingAddress: row.maturity_mailing_address ?? null,
      },
      employment: {
        companyName: row.company_name ?? null,
        occupationCode: row.occupation_code ?? null,
        occupationDesc: row.occupation_desc ?? null,
        jobTitleCode: row.job_title_code ?? null,
        jobTitleDesc: row.job_title_desc ?? null,
        jobLevelCode: row.job_level_code ?? null,
        jobLevelDesc: row.job_level_desc ?? null,
        industryCode: row.industry_code ?? null,
        industryDesc: row.industry_desc ?? null,
        workYears: row.work_years != null ? parseFloat(row.work_years) : null,
        companyScale: row.company_scale ?? null,
        role: row.role ?? null,
      },
      financial: {
        monthlyIncomeCode: row.monthly_income_code ?? null,
        monthlyIncomeDesc: row.monthly_income_desc ?? null,
        approvedIncome: row.approved_income != null ? parseInt(row.approved_income, 10) : null,
        incomeSourceCode: row.income_source_code ?? null,
        incomeSourceDesc: row.income_source_desc ?? null,
        capital: row.capital != null ? parseFloat(row.capital) : null,
        creditLimit: row.credit_limit != null ? parseFloat(row.credit_limit) : null,
        highestTransactionAmount:
          row.highest_transaction_amount != null
            ? parseFloat(row.highest_transaction_amount)
            : null,
        highestTransactionDate: row.highest_transaction_date ?? null,
        hasRealEstate: row.has_real_estate ?? null,
        debtFlag: row.debt_flag ?? null,
        fineFlag: row.fine_flag ?? null,
        addressAnomalyFlag:
          row.address_anomaly_flag != null ? parseInt(row.address_anomaly_flag, 10) : null,
        mainlandFlag: row.mainland_flag != null ? parseInt(row.mainland_flag, 10) : null,
      },
      corporate: {
        ownerName: row.owner_name ?? null,
        ownerId: row.owner_id ?? null,
        ownerBirth: row.owner_birth ?? null,
        ownerZip: row.owner_zip ?? null,
        ownerAddress: row.owner_address ?? null,
        establishedCapital:
          row.established_capital != null ? parseFloat(row.established_capital) : null,
        employeeCountCode: row.employee_count_code ?? null,
        employeeCountDesc: row.employee_count_desc ?? null,
        isListedCode: row.is_listed_code ?? null,
        isListedDesc: row.is_listed_desc ?? null,
        groupOwner: row.group_owner ?? null,
        businessItem: row.business_item ?? null,
        organizationType: row.organization_type ?? null,
        parentCustomerId: row.parent_customer_id ?? null,
        parentCustomerName: row.parent_customer_name ?? null,
      },
      etlTracking: {
        sourceCreatedAt: row.source_created_at ?? null,
        sourceUpdatedAt: row.source_updated_at ?? null,
        dataSource: row.data_source,
        etlLoadedAt: row._etl_loaded_at,
        etlPipelineId: row._etl_pipeline_id,
      },
    };
  }
}
