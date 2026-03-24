/**
 * F036: 目標表 Domain-Oriented 靜態 Schema 定義
 * 目標表不納入 ORM Entity 管理，schema 資訊以 TypeScript 常數定義
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

const ETL_TRACKING_COLUMNS: TargetTableColumn[] = [
  { name: 'data_source', type: 'VARCHAR', nullable: true, isPrimaryKey: false, isEtlTracking: true, description: '資料來源識別' },
  { name: '_etl_loaded_at', type: 'TIMESTAMP', nullable: false, isPrimaryKey: false, isEtlTracking: true, description: 'ETL 載入時間（系統自動填充）' },
  { name: '_etl_pipeline_id', type: 'UUID', nullable: false, isPrimaryKey: false, isEtlTracking: true, description: 'Pipeline ID（系統自動填充）' },
];

export const TARGET_TABLE_SCHEMAS: TargetTableSchema[] = [
  {
    tableName: 'customer_core',
    displayName: 'Customer Core（身分/主檔）',
    domain: 'core',
    description: '客戶基本身分與主檔資料',
    columns: [
      { name: 'customer_id', type: 'UUID', nullable: false, isPrimaryKey: true, isEtlTracking: false, description: '客戶唯一識別碼' },
      { name: 'id_number', type: 'VARCHAR', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '身分證號（加密）' },
      { name: 'name', type: 'VARCHAR', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '姓名' },
      { name: 'gender', type: 'VARCHAR', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '性別' },
      { name: 'date_of_birth', type: 'DATE', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '生日' },
      { name: 'phone', type: 'VARCHAR', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '電話' },
      { name: 'email', type: 'VARCHAR', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: 'Email' },
      { name: 'address', type: 'TEXT', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '地址' },
      { name: 'occupation', type: 'VARCHAR', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '職業' },
      { name: 'company_name', type: 'VARCHAR', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '公司名稱' },
      { name: 'customer_type', type: 'VARCHAR', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '客戶類型（individual / corporate）' },
      { name: 'registration_date', type: 'TIMESTAMP', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '建檔日期' },
      { name: 'last_updated_at', type: 'TIMESTAMP', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '最後更新時間' },
      ...ETL_TRACKING_COLUMNS,
    ],
  },
  {
    tableName: 'customer_interaction',
    displayName: 'Customer Interaction（行為/接觸）',
    domain: 'interaction',
    description: '客戶行為與接觸紀錄',
    columns: [
      { name: 'interaction_id', type: 'UUID', nullable: false, isPrimaryKey: true, isEtlTracking: false, description: '互動唯一識別碼' },
      { name: 'customer_id', type: 'UUID', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '關聯客戶' },
      { name: 'interaction_type', type: 'VARCHAR', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '接觸類型（call/email/sms/visit/app/web/dm）' },
      { name: 'channel', type: 'VARCHAR', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '通路' },
      { name: 'direction', type: 'VARCHAR', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '方向（inbound/outbound）' },
      { name: 'interaction_date', type: 'TIMESTAMP', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '接觸時間' },
      { name: 'campaign_id', type: 'VARCHAR', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '行銷活動 ID' },
      { name: 'campaign_name', type: 'VARCHAR', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '行銷活動名稱' },
      { name: 'response_status', type: 'VARCHAR', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '回應狀態' },
      { name: 'content_summary', type: 'TEXT', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '內容摘要' },
      { name: 'agent_id', type: 'VARCHAR', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '處理人員' },
      ...ETL_TRACKING_COLUMNS,
    ],
  },
  {
    tableName: 'customer_financial',
    displayName: 'Customer Financial（交易/風控）',
    domain: 'financial',
    description: '交易與風控資料',
    columns: [
      { name: 'financial_id', type: 'UUID', nullable: false, isPrimaryKey: true, isEtlTracking: false, description: '財務記錄唯一識別碼' },
      { name: 'customer_id', type: 'UUID', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '關聯客戶' },
      { name: 'contract_id', type: 'VARCHAR', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '合約編號' },
      { name: 'contract_type', type: 'VARCHAR', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '合約類型（loan/lease）' },
      { name: 'vehicle_model', type: 'VARCHAR', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '車型' },
      { name: 'vehicle_year', type: 'INTEGER', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '車輛年份' },
      { name: 'principal_amount', type: 'DECIMAL', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '本金金額' },
      { name: 'monthly_payment', type: 'DECIMAL', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '月付金' },
      { name: 'interest_rate', type: 'DECIMAL', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '利率' },
      { name: 'term_months', type: 'INTEGER', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '期數' },
      { name: 'payment_status', type: 'VARCHAR', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '還款狀態（current/overdue/default/closed）' },
      { name: 'overdue_days', type: 'INTEGER', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '逾期天數' },
      { name: 'overdue_amount', type: 'DECIMAL', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '逾期金額' },
      { name: 'credit_score', type: 'INTEGER', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '信用評分' },
      { name: 'risk_level', type: 'VARCHAR', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '風險等級（low/medium/high/critical）' },
      { name: 'contract_start_date', type: 'DATE', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '合約起始日' },
      { name: 'contract_end_date', type: 'DATE', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '合約結束日' },
      ...ETL_TRACKING_COLUMNS,
    ],
  },
  {
    tableName: 'customer_service',
    displayName: 'Customer Service（客服/申訴）',
    domain: 'service',
    description: '客服與申訴案件',
    columns: [
      { name: 'service_id', type: 'UUID', nullable: false, isPrimaryKey: true, isEtlTracking: false, description: '服務案件唯一識別碼' },
      { name: 'customer_id', type: 'UUID', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '關聯客戶' },
      { name: 'case_number', type: 'VARCHAR', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '案件編號' },
      { name: 'case_type', type: 'VARCHAR', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '案件類型（inquiry/complaint/request/dispute）' },
      { name: 'category', type: 'VARCHAR', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '分類' },
      { name: 'priority', type: 'VARCHAR', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '優先級（low/medium/high/urgent）' },
      { name: 'status', type: 'VARCHAR', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '狀態（open/in_progress/resolved/closed）' },
      { name: 'channel', type: 'VARCHAR', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '進件通路' },
      { name: 'description', type: 'TEXT', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '案件描述' },
      { name: 'resolution', type: 'TEXT', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '處理結果' },
      { name: 'assigned_to', type: 'VARCHAR', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '指派人員' },
      { name: 'opened_at', type: 'TIMESTAMP', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '建立時間' },
      { name: 'resolved_at', type: 'TIMESTAMP', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '解決時間' },
      { name: 'satisfaction_score', type: 'INTEGER', nullable: true, isPrimaryKey: false, isEtlTracking: false, description: '滿意度（1-5）' },
      ...ETL_TRACKING_COLUMNS,
    ],
  },
];
