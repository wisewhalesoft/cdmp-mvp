import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { maskIdNumber, maskPhone, maskEmail } from './masking.util';
import { ERROR_CODES, ERROR_MESSAGES } from '@/common/errors/error-codes';
import { CustomerListQueryDto } from './dto/customer-list-query.dto';

/**
 * F046 / F047 Phase 3 PII 遮罩規則：
 *   - admin / director / section_chief → 完整顯示（管理 / 業務管理 / 轄區業務需要）
 *   - plain user（businessRole=null） + 其他角色 → mask
 *
 * 對齊 prototype 26-customer-360-detail.html L305：`isUser = currentRole === 'user'`，
 * Phase 3 進一步限縮為 `businessRole=null` 才視為 plain user。
 */
export function canSeeFullPii(
  userRole: string | null | undefined,
  businessRole: string | null | undefined,
): boolean {
  const r = (userRole ?? '').toLowerCase();
  if (r === 'admin') return true;
  const br = (businessRole ?? '').toLowerCase();
  return br === 'director' || br === 'section_chief';
}

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

  /**
   * CASE-based 可攜統計查詢（sqlite + MSSQL 共用）。
   * PG 專屬的 `COUNT(*) FILTER (WHERE ...)` 於 SQLite/MSSQL 皆非法（MSSQL 拋
   * "Incorrect syntax near 'WHERE'"）→ 改用逐版本相容的 `SUM(CASE WHEN ...)`；
   * `foreign` 為保留字須以雙引號識別碼（PG/MSSQL/sqlite 皆接受）。
   */
  async getStatsPortable(): Promise<{
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
    const dbType = this.dataSource.options.type;
    // MSSQL 與 sqlite 皆不支援 PG 的 COUNT(*) FILTER → 走 CASE-based 可攜版；PG 維持 FILTER 版不變。
    if (dbType === 'better-sqlite3' || dbType === 'mssql') {
      return this.getStatsPortable();
    }
    return this.getStats();
  }

  async searchCustomers(
    query: CustomerListQueryDto,
    userRole: string,
    businessRole?: string | null,
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
    const isMssql = this.dataSource.options.type === 'mssql';

    // Validate keyword minimum length
    if (query.keyword && !query.idNumber && query.keyword.length < 2) {
      throw new UnprocessableEntityException({
        error: ERROR_CODES.C360_SEARCH_MIN_LENGTH,
        message: ERROR_MESSAGES.C360_SEARCH_MIN_LENGTH,
      });
    }

    const whereClauses: string[] = [];
    const params: any[] = [];
    // 佔位符依方言（依 push 順序取下一個）：sqlite `?`、MSSQL `@n`(0-based)、PG `$n`(1-based)。
    // i = 目前 params 長度 = 該參數之 0-based 索引。PG/sqlite 產出與原邏輯逐字相同。
    const ph = (): string => {
      const i = params.length;
      return isSqlite ? '?' : isMssql ? `@${i}` : `$${i + 1}`;
    };

    // Search priority: idNumber > keyword
    if (query.idNumber) {
      const p = ph();
      params.push(query.idNumber);
      whereClauses.push(`source_customer_no = ${p}`);
    } else if (query.keyword && query.keyword.length >= 2) {
      if (isSqlite || isMssql) {
        // sqlite/MSSQL 無設定 PG 全文索引 → LIKE 後援（大小寫依 collation；MSSQL BIN 為大小寫敏感）。
        const p1 = ph();
        params.push(`%${query.keyword}%`);
        const p2 = ph();
        params.push(`%${query.keyword}%`);
        whereClauses.push(`(name LIKE ${p1} OR english_name LIKE ${p2})`);
      } else {
        const p = ph();
        params.push(query.keyword);
        whereClauses.push(
          `to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(english_name, '')) @@ plainto_tsquery('simple', ${p})`,
        );
      }
    }

    // Type filter
    if (query.type) {
      const types = query.type.split(',').map((t) => t.trim());
      const placeholders = types
        .map((t) => {
          const p = ph();
          params.push(t);
          return p;
        })
        .join(', ');
      whereClauses.push(`customer_type_code IN (${placeholders})`);
    }

    const whereStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // Count query
    const countResult = await this.dataSource.query(
      `SELECT COUNT(*) AS total FROM customer_core ${whereStr}`,
      params,
    );
    const total = parseInt(countResult[0].total, 10) || 0;
    const totalPages = Math.ceil(total / pageSize) || 0;

    // Data query（分頁佔位符接於 where 參數之後）
    const selectSql =
      `SELECT customer_id, name, customer_type_code, customer_type_desc,\n` +
      `               source_customer_no, mobile_phone, company_name\n` +
      `        FROM customer_core ${whereStr}\n` +
      `        ORDER BY name ASC`;
    let dataQuery: string;
    let dataParams: any[];

    if (isSqlite) {
      dataQuery = `${selectSql}\n        LIMIT ? OFFSET ?`;
      dataParams = [...params, pageSize, offset];
    } else if (isMssql) {
      // MSSQL：LIMIT/OFFSET 不合法 → OFFSET/FETCH（需 ORDER BY，已具備）。佔位符 0-based 接續。
      const n = params.length;
      dataQuery = `${selectSql}\n        OFFSET @${n} ROWS FETCH NEXT @${n + 1} ROWS ONLY`;
      dataParams = [...params, offset, pageSize]; // OFFSET 值先、FETCH NEXT 值後
    } else {
      dataQuery = `${selectSql}\n        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      dataParams = [...params, pageSize, offset];
    }

    const rows = await this.dataSource.query(dataQuery, dataParams);

    const fullPii = canSeeFullPii(userRole, businessRole);
    const data = rows.map((row: any) => ({
      customerId: row.customer_id,
      name: row.name,
      customerTypeCode: row.customer_type_code,
      customerTypeDesc: row.customer_type_desc ?? null,
      sourceCustomerNo: fullPii
        ? row.source_customer_no
        : maskIdNumber(row.source_customer_no),
      mobilePhone: fullPii
        ? row.mobile_phone ?? null
        : maskPhone(row.mobile_phone),
      companyName: row.company_name ?? null,
    }));

    return {
      data,
      pagination: { page, pageSize, total, totalPages },
    };
  }

  async getCustomerDetail(
    customerId: string,
    userRole: string,
    businessRole?: string | null,
  ): Promise<any> {
    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(customerId)) {
      throw new UnprocessableEntityException({
        error: 'VALIDATION_ERROR',
        message: '客戶 ID 格式無效，請提供有效的 UUID',
      });
    }

    const dbType = this.dataSource.options.type;
    // 佔位符依方言：sqlite `?`、MSSQL `@0`(0-based)、PG `$1`(1-based)。
    const param = dbType === 'better-sqlite3' ? '?' : dbType === 'mssql' ? '@0' : '$1';
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
    const fullPii = canSeeFullPii(userRole, businessRole);

    return {
      customerId: row.customer_id,
      identity: {
        sourceCustomerNo: fullPii
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
        mobilePhone: fullPii ? (row.mobile_phone ?? null) : maskPhone(row.mobile_phone),
        homePhone: fullPii ? (row.home_phone ?? null) : maskPhone(row.home_phone),
        contactPhone: fullPii ? (row.contact_phone ?? null) : maskPhone(row.contact_phone),
        officePhone: fullPii ? (row.office_phone ?? null) : maskPhone(row.office_phone),
        registeredPhone: row.registered_phone ?? null,
        registeredFax: row.registered_fax ?? null,
        businessFax: row.business_fax ?? null,
        businessMobile: row.business_mobile ?? null,
        email: fullPii ? (row.email ?? null) : maskEmail(row.email),
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
