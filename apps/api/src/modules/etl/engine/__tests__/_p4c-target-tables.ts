/**
 * AD-E07-41 P4c — 真實 MSSQL 整合測試之 target 表自建 helper（非 .spec，vitest 不收集）。
 *
 * ⚠️ 偏差（DEV-P4C-TABLES）：測試設計 §0.2 假設 `customer_core`/`ob_calendar`/`ob_emphire`/
 *    `ob_arreturndf_min_cap` 已存在於 CDMP_TEST（「P4-0 已建」）。實測 CDMP_TEST 僅有 4 張 base table，
 *    上述 baseline 表全數不存在。故比照 P4a/P4b RESOLVE-002 先例，整合 spec 於 beforeAll 自建（idempotent，
 *    IF OBJECT_ID IS NULL），DDL 逐字取自 `1751884800000-MssqlBaselineSchema.ts`（型別/NOT NULL/PK 完全一致）。
 *    baseline 表建立後保留（供跨 spec 共用，比照真實 baseline 語意），列資料由各 spec 以唯一前綴隔離 + 清理。
 */
import { QueryRunner } from 'typeorm';

/** DDL 逐字取自 mssql baseline migration（勿改動；型別對照必須與 baseline 一致）。 */
export const TARGET_TABLE_DDL: Record<string, string> = {
  ob_calendar: `CREATE TABLE "ob_calendar" ("calendar_date" date NOT NULL, "rest_flg" varchar(1) NOT NULL, CONSTRAINT "PK_b103cfa0e0c26b2bd23c04de887" PRIMARY KEY ("calendar_date"))`,
  ob_arreturndf_min_cap: `CREATE TABLE "ob_arreturndf_min_cap" ("appl_no" varchar(20) NOT NULL, "add_un_capital" numeric(15,0), "_cdmp_extracted_at" datetime2 NOT NULL, CONSTRAINT "PK_1e55ceee948c467921a5b28392c" PRIMARY KEY ("appl_no"))`,
  ob_emphire: `CREATE TABLE "ob_emphire" ("emp_id" varchar(10) NOT NULL, "emp_nm" varchar(50), "id_no" varchar(10), "dept_code" varchar(10), "dept_name" varchar(30), "title_code" varchar(5), "title_name" varchar(30), "jfun_id" varchar(10), "jfun_nm" varchar(15), "hire_date" date, "resign_date" date, "email" varchar(100), "is_auth" varchar(1), CONSTRAINT "PK_372ea98fc4d94c566be3bdb1268" PRIMARY KEY ("emp_id"))`,
  customer_core: `CREATE TABLE "customer_core" ("customer_id" uniqueidentifier NOT NULL CONSTRAINT "DF_customer_core_customer_id" DEFAULT NEWID(), "source_customer_no" varchar(20) NOT NULL, "customer_type_code" varchar(2) NOT NULL, "name" varchar(100) NOT NULL, "english_name" varchar(60), "gender" varchar(1), "date_of_birth" date, "marital_status_code" varchar(1), "education_code" varchar(2), "education_desc" varchar(50), "mobile_phone" varchar(30), "home_phone" varchar(30), "contact_phone" varchar(30), "office_phone" varchar(30), "email" varchar(40), "line_account" varchar(50), "residential_zip" varchar(6), "residential_address" varchar(100), "mailing_zip" varchar(6), "mailing_address" varchar(100), "company_zip" varchar(6), "company_address" varchar(100), "company_name" varchar(100), "occupation_code" varchar(4), "occupation_desc" varchar(50), "job_title_code" varchar(4), "job_title_desc" varchar(50), "job_level_code" varchar(2), "industry_code" varchar(10), "industry_desc" varchar(100), "work_years" numeric(8,2), "company_scale" varchar(1), "monthly_income_code" varchar(5), "approved_income" int, "income_source_code" varchar(5), "capital" numeric(12,0), "credit_limit" numeric(12,0), "has_real_estate" varchar(1), "debt_flag" char(1), "fine_flag" char(1), "address_anomaly_flag" smallint, "mainland_flag" smallint, "owner_name" varchar(50), "owner_id" varchar(10), "owner_birth" date, "established_capital" numeric(12,0), "employee_count_code" varchar(6), "is_listed_code" varchar(6), "parent_customer_id" varchar(10), "source_created_at" datetime2, "source_updated_at" datetime2, "data_source" varchar(50) NOT NULL, "_etl_loaded_at" datetime2 NOT NULL CONSTRAINT "DF_customer_core_etl_loaded_at" DEFAULT getdate(), "_etl_pipeline_id" uniqueidentifier NOT NULL, "spouse_name" varchar(100), "father_name" varchar(100), "mother_name" varchar(100), "id_issue_type" varchar(2), "id_issue_date" datetime2, "id_issue_address" varchar(100), "driver_license" varchar(20), "maturity_mailing_zip" varchar(6), "maturity_mailing_address" varchar(100), "registered_phone" varchar(30), "registered_fax" varchar(30), "business_fax" varchar(30), "business_mobile" varchar(30), "registered_zip" varchar(6), "registered_address" varchar(100), "highest_transaction_amount" numeric(12,0), "highest_transaction_date" datetime2, "parent_customer_name" varchar(100), "group_owner" varchar(50), "organization_type" varchar(6), "owner_zip" varchar(6), "owner_address" varchar(100), "customer_type_desc" varchar(50), "marital_status_desc" varchar(50), "job_level_desc" varchar(50), "income_source_desc" varchar(50), "monthly_income_desc" varchar(50), "role" varchar(50), "employee_count_desc" varchar(50), "is_listed_desc" varchar(50), "business_item" varchar(100), "cus_sex" varchar(2), "carea_no1" varchar(10), "carea_no2" varchar(10), "cellular" varchar(20), "hpost_city" varchar(20), "cpost_city" varchar(20), "co_city" varchar(20), CONSTRAINT "UQ_customer_core_source_customer_no" UNIQUE ("source_customer_no"), CONSTRAINT "PK_customer_core" PRIMARY KEY ("customer_id"))`,
};

/**
 * Idempotent 建表：若不存在則建（DDL 逐字 baseline）；已存在則略過。永不 drop（baseline 保留語意）。
 * 併發競態（兩 worker 同時 CREATE）以 try/catch 吞「已存在」錯誤。
 */
export async function ensureTargetTable(qr: QueryRunner, name: string): Promise<void> {
  const ddl = TARGET_TABLE_DDL[name];
  if (!ddl) throw new Error(`未知 target 表 DDL：${name}`);
  const exists = await qr.query(`SELECT OBJECT_ID(@0) AS oid`, ['dbo.' + name]);
  if (exists[0].oid != null) return;
  try {
    await qr.query(ddl);
  } catch (e: any) {
    // 併發下另一 worker 可能已建立 → 再確認一次存在性
    const recheck = await qr.query(`SELECT OBJECT_ID(@0) AS oid`, ['dbo.' + name]);
    if (recheck[0].oid == null) throw e;
  }
}
