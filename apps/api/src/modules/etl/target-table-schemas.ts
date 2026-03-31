/**
 * F036 v2.0: 目標表 Domain-Oriented 靜態 Schema 定義
 * Phase 1 MVP: 僅 customer_core 一個目標表（79 欄位，A~H 八分類）
 * Phase 2/3 目標表待對應來源系統接入後再擴充
 */

export interface TargetTableColumn {
  name: string;
  type: string;
  nullable: boolean;
  isPrimaryKey: boolean;
  isEtlTracking: boolean;
  description: string;
}

export interface TargetTableSchema {
  tableName: string;
  displayName: string;
  domain: string;
  description: string;
  columns: TargetTableColumn[];
}

export interface TargetTableSummary {
  tableName: string;
  displayName: string;
  domain: string;
  columnCount: number;
  description: string;
}

// H. 稽核與 ETL 追蹤（共用）
const ETL_TRACKING_COLUMNS: TargetTableColumn[] = [
  { name: 'data_source', type: 'VARCHAR(50)', nullable: false, isPrimaryKey: false, isEtlTracking: true, description: '資料來源識別（ETL 自動填充）' },
  { name: '_etl_loaded_at', type: 'TIMESTAMP', nullable: false, isPrimaryKey: false, isEtlTracking: true, description: 'ETL 載入時間（系統自動填充）' },
  { name: '_etl_pipeline_id', type: 'UUID', nullable: false, isPrimaryKey: false, isEtlTracking: true, description: '載入的 Pipeline ID（系統自動填充）' },
];

export const TARGET_TABLE_SCHEMAS: TargetTableSchema[] = [
  {
    tableName: 'customer_core',
    displayName: 'Customer Core（客戶主檔）',
    domain: 'core',
    description: '客戶身分、聯絡、職業、財務概況與風控旗標',
    columns: [
      // A. 識別與分類 (5)
      { name: 'customer_id', type: 'UUID', nullable: false, isPrimaryKey: true, isEtlTracking: false, description: '客戶唯一識別碼（代理鍵）' },
      { name: 'source_customer_no', type: 'VARCHAR(20)', nullable: false, isPrimaryKey: false, isEtlTracking: false, description: '來源客戶編號（身分證/統編）' },
      { name: 'customer_type', type: 'VARCHAR(2)', nullable: false, isPrimaryKey: false, isEtlTracking: false, description: '客戶類型（01=個人/02=企業/04=外籍）' },
      { name: 'name', type: 'VARCHAR(100)', nullable: false, isPrimaryKey: false, isEtlTracking: false, description: '姓名/企業名稱' },
      { name: 'english_name', type: 'VARCHAR(60)', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '英文姓名' },

      // B. 個人屬性 (12)
      { name: 'gender', type: 'VARCHAR(1)', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '性別' },
      { name: 'date_of_birth', type: 'DATE', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '生日' },
      { name: 'marital_status', type: 'VARCHAR(1)', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '婚姻狀態' },
      { name: 'education_code', type: 'VARCHAR(2)', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '學歷代碼' },
      { name: 'education_desc', type: 'VARCHAR(50)', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '學歷描述' },
      { name: 'spouse_name', type: 'VARCHAR(100)', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '配偶姓名' },
      { name: 'father_name', type: 'VARCHAR(100)', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '父親姓名' },
      { name: 'mother_name', type: 'VARCHAR(100)', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '母親姓名' },
      { name: 'id_issue_type', type: 'VARCHAR(2)', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '發證類別' },
      { name: 'id_issue_date', type: 'TIMESTAMP', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '發證日期' },
      { name: 'id_issue_address', type: 'VARCHAR(100)', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '發證地址' },
      { name: 'driver_license', type: 'VARCHAR(20)', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '駕照號碼' },

      // C. 聯絡資訊 (10)
      { name: 'mobile_phone', type: 'VARCHAR(30)', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '行動電話' },
      { name: 'home_phone', type: 'VARCHAR(30)', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '戶籍電話' },
      { name: 'contact_phone', type: 'VARCHAR(30)', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '通訊電話' },
      { name: 'office_phone', type: 'VARCHAR(30)', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '公司電話' },
      { name: 'registered_phone', type: 'VARCHAR(30)', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '公司登記電話' },
      { name: 'registered_fax', type: 'VARCHAR(30)', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '公司傳真' },
      { name: 'business_fax', type: 'VARCHAR(30)', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '營業傳真' },
      { name: 'business_mobile', type: 'VARCHAR(30)', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '營業行動電話' },
      { name: 'email', type: 'VARCHAR(40)', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: 'Email' },
      { name: 'line_account', type: 'VARCHAR(50)', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: 'Line 帳號' },

      // D. 地址 (10)
      { name: 'residential_zip', type: 'VARCHAR(6)', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '戶籍郵遞區號' },
      { name: 'residential_address', type: 'VARCHAR(100)', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '戶籍地址' },
      { name: 'mailing_zip', type: 'VARCHAR(6)', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '通訊郵遞區號' },
      { name: 'mailing_address', type: 'VARCHAR(100)', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '通訊地址' },
      { name: 'registered_zip', type: 'VARCHAR(6)', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '公司登記郵遞區號' },
      { name: 'registered_address', type: 'VARCHAR(100)', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '公司登記地址' },
      { name: 'company_zip', type: 'VARCHAR(6)', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '營業地址郵遞區號' },
      { name: 'company_address', type: 'VARCHAR(100)', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '營業地址' },
      { name: 'maturity_mailing_zip', type: 'VARCHAR(6)', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '滿期寄送郵遞區號' },
      { name: 'maturity_mailing_address', type: 'VARCHAR(100)', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '滿期寄送地址' },

      // E. 職業與就業 (12)
      { name: 'company_name', type: 'VARCHAR(100)', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '服務公司/企業名稱' },
      { name: 'role_code', type: 'VARCHAR(100)', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '客戶角色/職稱（自由文字）' },
      { name: 'role_desc', type: 'VARCHAR(50)', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '客戶角色描述' },
      { name: 'occupation_code', type: 'VARCHAR(4)', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '職業代碼' },
      { name: 'occupation_desc', type: 'VARCHAR(50)', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '職業描述' },
      { name: 'job_title_code', type: 'VARCHAR(4)', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '職稱代碼' },
      { name: 'job_title_desc', type: 'VARCHAR(50)', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '職稱描述' },
      { name: 'job_level', type: 'VARCHAR(2)', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '職級' },
      { name: 'industry_code', type: 'VARCHAR(10)', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '行業代碼' },
      { name: 'industry_desc', type: 'VARCHAR(100)', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '行業描述' },
      { name: 'work_years', type: 'DECIMAL(8,2)', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '年資' },
      { name: 'company_scale', type: 'VARCHAR(1)', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '公司規模（1:>=1000萬or公教/2:<1000萬/3:其他）' },

      // F. 財務與風控 (12)
      { name: 'monthly_income', type: 'DECIMAL(8,0)', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '月所得' },
      { name: 'approved_income', type: 'INTEGER', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '認定月收入' },
      { name: 'income_source', type: 'VARCHAR(5)', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '收入來源代碼' },
      { name: 'capital', type: 'DECIMAL(12,0)', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '實收資本額' },
      { name: 'credit_limit', type: 'DECIMAL(12,0)', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '額度總額' },
      { name: 'highest_transaction_amount', type: 'DECIMAL(12,0)', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '最高往來金額' },
      { name: 'highest_transaction_date', type: 'TIMESTAMP', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '最高往來日期' },
      { name: 'has_real_estate', type: 'VARCHAR(1)', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '自有不動產' },
      { name: 'debt_flag', type: 'CHAR(1)', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '消債旗標' },
      { name: 'fine_flag', type: 'CHAR(1)', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '違規欠稅旗標（>2萬）' },
      { name: 'address_anomaly_flag', type: 'SMALLINT', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '地址異常註記' },
      { name: 'mainland_flag', type: 'SMALLINT', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '大陸籍旗標' },

      // G. 企業客戶專屬 (13)
      { name: 'owner_name', type: 'VARCHAR(50)', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '負責人姓名' },
      { name: 'owner_id', type: 'VARCHAR(10)', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '負責人身分證字號' },
      { name: 'owner_birth', type: 'DATE', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '負責人生日' },
      { name: 'owner_zip', type: 'VARCHAR(6)', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '負責人郵遞區號' },
      { name: 'owner_address', type: 'VARCHAR(100)', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '負責人地址' },
      { name: 'group_owner', type: 'VARCHAR(50)', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '集團實際負責人' },
      { name: 'established_capital', type: 'DECIMAL(12,0)', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '登記資本額' },
      { name: 'employee_count', type: 'VARCHAR(6)', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '員工人數' },
      { name: 'is_listed', type: 'VARCHAR(6)', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '上市櫃' },
      { name: 'company_attr_code', type: 'VARCHAR(6)', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '公司屬性' },
      { name: 'organization_type', type: 'VARCHAR(6)', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '組織形態' },
      { name: 'parent_customer_id', type: 'VARCHAR(10)', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '母公司編號' },
      { name: 'parent_customer_name', type: 'VARCHAR(100)', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '母公司名稱' },

      // H. 稽核與 ETL 追蹤 (5) — source_created_at, source_updated_at 是非 ETL tracking 欄位
      { name: 'source_created_at', type: 'TIMESTAMP', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '來源建檔日期' },
      { name: 'source_updated_at', type: 'TIMESTAMP', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '來源最後更新' },
      ...ETL_TRACKING_COLUMNS,
    ],
  },
];
