// 自動產生 by parse-ob-schema.mjs --entity
// 來源：../../reference/TableSchema/OB/OBPOOLDATA.sql
// 對應 migration：apps/api/src/database/migrations/...
// ⚠️ Entity 必須與 migration 保持一致：任一邊改動，另一邊同步修

import { Entity, Column, PrimaryColumn, Index } from 'typeorm';
import { dateColumnType } from '@/common/database/column-types';

@Entity('ob_pool_data')
export class ObPoolData {
  @Column({ name: 'created_by_prog', type: 'varchar', length: 20, nullable: true })
  created_by_prog: string | null; // A_PRGID

  @Column({ name: 'created_by', type: 'varchar', length: 20, nullable: true })
  created_by: string | null; // A_USERID

  // E07 P1 B4 / F049：原 'timestamp' 改 dateColumnType 以相容 sqlite e2e
  // 對應 memory feedback_typeorm_timestamp 規範（postgres=timestamp / sqlite=datetime）
  @Column({ name: 'created_at', type: dateColumnType, nullable: true })
  created_at: Date | null; // A_SYSDT

  @Column({ name: 'updated_by_prog', type: 'varchar', length: 20, nullable: true })
  updated_by_prog: string | null; // U_PRGID

  @Column({ name: 'updated_by', type: 'varchar', length: 20, nullable: true })
  updated_by: string | null; // U_USERID

  @Column({ name: 'updated_at', type: dateColumnType, nullable: true })
  updated_at: Date | null; // U_SYSDT

  @PrimaryColumn({ name: 'orgno', type: 'varchar', length: 2 })
  orgno: string;

  @PrimaryColumn({ name: 'appl_no', type: 'varchar', length: 10 })
  appl_no: string;

  @Column({ name: 'custo_no', type: 'varchar', length: 11 })
  custo_no: string;

  @Column({ name: 'cust_name', type: 'varchar', length: 90, nullable: true })
  cust_name: string | null;

  @Column({ name: 'lic_no', type: 'varchar', length: 10, nullable: true })
  lic_no: string | null;

  @Column({ name: 'sta_code_na', type: 'varchar', length: 40, nullable: true })
  sta_code_na: string | null;

  @Column({ name: 'project_tp', type: 'varchar', length: 40, nullable: true })
  project_tp: string | null;

  @Column({ name: 'spec_no', type: 'varchar', length: 10, nullable: true })
  spec_no: string | null;

  @Column({ name: 'spec_name', type: 'varchar', length: 45, nullable: true })
  spec_name: string | null;

  @Column({ name: 'dept_name', type: 'varchar', length: 30, nullable: true })
  dept_name: string | null;

  @Column({ name: 'pay_resouc_code', type: 'varchar', length: 2, nullable: true })
  pay_resouc_code: string | null;

  @Column({ name: 'break_pct', type: 'numeric', precision: 5, scale: 0, nullable: true })
  break_pct: string | null;

  @Column({ name: 'extend_day', type: 'numeric', precision: 2, scale: 0, nullable: true })
  extend_day: string | null;

  @Column({ name: 'pay_resouc', type: 'varchar', length: 40, nullable: true })
  pay_resouc: string | null;

  @Column({ name: 'commute', type: 'varchar', length: 90, nullable: true })
  commute: string | null;

  @Column({ name: 'cycle_pay_na', type: 'varchar', length: 40, nullable: true })
  cycle_pay_na: string | null;

  @Column({ name: 'cycle_pay_val', type: 'varchar', length: 2, nullable: true })
  cycle_pay_val: string | null;

  @Column({ name: 'deal_num', type: 'numeric', precision: 3, scale: 0, nullable: true })
  deal_num: string | null;

  @Column({ name: 'pro_rate', type: 'numeric', precision: 5, scale: 2, nullable: true })
  pro_rate: string | null;

  @Column({ name: 'b_case_irr', type: 'numeric', precision: 5, scale: 2, nullable: true })
  b_case_irr: string | null;

  @Column({ name: 'first_pay_dt', type: dateColumnType, nullable: true })
  first_pay_dt: Date | null;

  @Column({ name: 'fapcon_dt', type: dateColumnType, nullable: true })
  fapcon_dt: Date | null;

  @Column({ name: 'maturity_dt', type: dateColumnType, nullable: true })
  maturity_dt: Date | null;

  @Column({ name: 'deal_mark', type: 'varchar', length: 2, nullable: true })
  deal_mark: string | null;

  @Column({ name: 'pay_way', type: 'varchar', length: 2, nullable: true })
  pay_way: string | null;

  @Column({ name: 'loan_totamt', type: 'numeric', precision: 18, scale: 0, nullable: true })
  loan_totamt: string | null;

  @Column({ name: 'loan_capital', type: 'numeric', precision: 18, scale: 0, nullable: true })
  loan_capital: string | null;

  @Column({ name: 'loan_oddamt', type: 'numeric', precision: 18, scale: 0, nullable: true })
  loan_oddamt: string | null;

  @Column({ name: 'commission', type: 'numeric', precision: 15, scale: 0, nullable: true })
  commission: string | null;

  @Column({ name: 'settle_date', type: dateColumnType, nullable: true })
  settle_date: Date | null;

  @Column({ name: 'loan_rate', type: 'numeric', precision: 5, scale: 2, nullable: true })
  loan_rate: string | null;

  @Column({ name: 'sta_code', type: 'varchar', length: 2 })
  sta_code: string;

  @Column({ name: 'ofi_date', type: dateColumnType, nullable: true })
  ofi_date: Date | null;

  @Column({ name: 'dept_id', type: 'varchar', length: 6 })
  dept_id: string;

  @Column({ name: 'pay_way_na', type: 'varchar', length: 30, nullable: true })
  pay_way_na: string | null;

  @Column({ name: 'brnh_no', type: 'varchar', length: 5, nullable: true })
  brnh_no: string | null;

  @Column({ name: 'dlr_no', type: 'varchar', length: 4, nullable: true })
  dlr_no: string | null;

  @Column({ name: 'broker', type: 'varchar', length: 60, nullable: true })
  broker: string | null;

  @Column({ name: 'sales_no', type: 'varchar', length: 14, nullable: true })
  sales_no: string | null;

  @Column({ name: 'broker_agent', type: 'varchar', length: 60, nullable: true })
  broker_agent: string | null;

  @Column({ name: 'hfs_sales', type: 'varchar', length: 14, nullable: true })
  hfs_sales: string | null;

  @Column({ name: 'sales', type: 'varchar', length: 60, nullable: true })
  sales: string | null;

  @Column({ name: 'agent_head_id', type: 'varchar', length: 11, nullable: true })
  agent_head_id: string | null;

  @Column({ name: 'promoter_dept', type: 'varchar', length: 60, nullable: true })
  promoter_dept: string | null;

  @Column({ name: 'agent_id', type: 'varchar', length: 11, nullable: true })
  agent_id: string | null;

  @Column({ name: 'promoter', type: 'varchar', length: 60, nullable: true })
  promoter: string | null;

  @Column({ name: 'brand_no', type: 'varchar', length: 2, nullable: true })
  brand_no: string | null;

  @Column({ name: 'brand_name', type: 'varchar', length: 40, nullable: true })
  brand_name: string | null;

  @Column({ name: 'car_name', type: 'varchar', length: 30, nullable: true })
  car_name: string | null;

  @Column({ name: 'inquiry', type: 'varchar', length: 10, nullable: true })
  inquiry: string | null;

  @Column({ name: 'approval', type: 'varchar', length: 10, nullable: true })
  approval: string | null;

  @Column({ name: 'manager_limit', type: 'varchar', length: 2, nullable: true })
  manager_limit: string | null;

  @Column({ name: 'spec_mk_na', type: 'varchar', length: 40, nullable: true })
  spec_mk_na: string | null;

  @Column({ name: 'spec_type_na', type: 'varchar', length: 40, nullable: true })
  spec_type_na: string | null;

  @Column({ name: 'atm_business', type: 'varchar', length: 4, nullable: true })
  atm_business: string | null;

  @Column({ name: 'no_duty', type: 'varchar', length: 1, nullable: true })
  no_duty: string | null;

  @Column({ name: 'year_produ', type: 'varchar', length: 4, nullable: true })
  year_produ: string | null;

  @Column({ name: 'dlr_name', type: 'varchar', length: 30, nullable: true })
  dlr_name: string | null;

  @Column({ name: 'brnh_name', type: 'varchar', length: 30, nullable: true })
  brnh_name: string | null;

  @Column({ name: 'project_tp_cd', type: 'varchar', length: 2, nullable: true })
  project_tp_cd: string | null;

  @Column({ name: 'appl_date', type: dateColumnType, nullable: true })
  appl_date: Date | null;

  @Column({ name: 'apmacc_memo', type: 'text', nullable: true })
  apmacc_memo: string | null;

  @Column({ name: 'sales_sts_na', type: 'varchar', length: 30, nullable: true })
  sales_sts_na: string | null;

  @Column({ name: 'sub_code', type: 'varchar', length: 2, nullable: true })
  sub_code: string | null;

  @Column({ name: 'cc_nbr', type: 'varchar', length: 5, nullable: true })
  cc_nbr: string | null;

  @Column({ name: 'throu_mon', type: 'numeric', precision: 8, scale: 0, nullable: true })
  throu_mon: string | null;

  @Column({ name: 'fund_src', type: 'varchar', length: 2, nullable: true })
  fund_src: string | null;

  @Column({ name: 'secret_flg', type: 'varchar', length: 1, nullable: true })
  secret_flg: string | null;

  @Column({ name: 'rate_choice', type: 'varchar', length: 30, nullable: true })
  rate_choice: string | null;

  @Column({ name: 'per_info', type: 'varchar', length: 30, nullable: true })
  per_info: string | null;

  @Column({ name: 'tie_down_num', type: 'integer', nullable: true })
  tie_down_num: number | null;

  @Column({ name: 'rest_amt', type: 'numeric', precision: 8, scale: 0, nullable: true })
  rest_amt: string | null;

  @Column({ name: 'over_tie_num', type: 'integer', nullable: true })
  over_tie_num: number | null;

  @Column({ name: 'open_code', type: 'varchar', length: 1, nullable: true })
  open_code: string | null;

  @Column({ name: 'emplid', type: 'varchar', length: 10, nullable: true })
  emplid: string | null;

  @Column({ name: 'emplid_deptid', type: 'varchar', length: 6, nullable: true })
  emplid_deptid: string | null;

  @Column({ name: 'case_type', type: 'varchar', length: 2, nullable: true })
  case_type: string | null;

  @Column({ name: 'hotai_agree', type: 'varchar', length: 10, nullable: true })
  hotai_agree: string | null;

  @Column({ name: 'call_dept', type: 'varchar', length: 4, nullable: true })
  call_dept: string | null;

  @Column({ name: 'c_class', type: 'varchar', length: 1, nullable: true })
  c_class: string | null;

  @Column({ name: 'payt_num', type: 'integer', nullable: true })
  payt_num: number | null;

  @Column({ name: 'list_type', type: 'varchar', length: 2 })
  list_type: string;

  @Column({ name: 'prod_type', type: 'varchar', length: 2, nullable: true })
  prod_type: string | null;

  @Column({ name: 'prod_type_name', type: 'varchar', length: 40, nullable: true })
  prod_type_name: string | null;

  @Column({ name: 'prod_class', type: 'varchar', length: 2, nullable: true })
  prod_class: string | null;

  @Column({ name: 'prod_class_name', type: 'varchar', length: 40, nullable: true })
  prod_class_name: string | null;

  // PROD_KIND/PROD_KIND_NAME/BEST_CASE 在 OBPOOLDATA 源頭實際有空字串
  // （ETL NULLIF(TRIM) 後 → NULL）；遷移時放寬為 nullable 對齊真實資料分布
  @Column({ name: 'prod_kind', type: 'varchar', length: 2, nullable: true })
  prod_kind: string | null;

  @Column({ name: 'prod_kind_name', type: 'varchar', length: 8, nullable: true })
  prod_kind_name: string | null;

  @Column({ name: 'best_case', type: 'varchar', length: 1, nullable: true })
  best_case: string | null;

  @Column({ name: 'acc_date', type: dateColumnType, nullable: true })
  acc_date: Date | null;

  @Column({ name: 'order1', type: 'integer', nullable: true })
  order1: number | null;

  @Column({ name: 'order2', type: 'integer', nullable: true })
  order2: number | null;

  @Column({ name: 'payt_term', type: 'integer', nullable: true })
  payt_term: number | null;

  @Column({ name: 'term_amt', type: 'numeric', precision: 19, scale: 4, nullable: true })
  term_amt: string | null;

  @Column({ name: 'nonpayt_term', type: 'integer', nullable: true })
  nonpayt_term: number | null;

  @Column({ name: 'overdue_amt', type: 'numeric', precision: 19, scale: 4, nullable: true })
  overdue_amt: string | null;

  @Column({ name: 'overdue_day', type: 'integer', nullable: true })
  overdue_day: number | null;

  @Column({ name: 'coll_empl', type: 'varchar', length: 50, nullable: true })
  coll_empl: string | null;

  @Column({ name: 'car_model', type: 'varchar', length: 100, nullable: true })
  car_model: string | null;

  @Column({ name: 'pay_user', type: 'varchar', length: 90, nullable: true })
  pay_user: string | null;

  @Column({ name: 'pay_add', type: 'varchar', length: 255, nullable: true })
  pay_add: string | null;

  @Column({ name: 'fleet_car', type: 'varchar', length: 1, nullable: true })
  fleet_car: string | null;

  @Column({ name: 'promoter_tel', type: 'varchar', length: 20, nullable: true })
  promoter_tel: string | null;

  @Column({ name: 'sales_tel', type: 'varchar', length: 20, nullable: true })
  sales_tel: string | null;

  @Column({ name: 'memo1', type: 'varchar', length: 255, nullable: true })
  memo1: string | null;

  @Column({ name: 'caseyear', type: 'varchar', length: 4, nullable: true })
  caseyear: string | null;

  @Column({ name: 'ob_dept', type: 'varchar', length: 6, nullable: true })
  ob_dept: string | null;

  @Column({ name: 'ob_emplid', type: 'varchar', length: 6, nullable: true })
  ob_emplid: string | null;

  @Column({ name: 'last_pay_date', type: dateColumnType, nullable: true })
  last_pay_date: Date | null;

  @Column({ name: 'month_cnt', type: 'integer', nullable: true })
  month_cnt: number | null;

  @Column({ name: 'year_cnt', type: 'integer', nullable: true })
  year_cnt: number | null;

  @Column({ name: 'settle_src', type: 'text' })
  settle_src: string;

  @Column({ name: 'spec_tp', type: 'varchar', length: 2, nullable: true })
  spec_tp: string | null;

  @Column({ name: 'cus_level', type: 'varchar', length: 1, nullable: true })
  cus_level: string | null;

  @Column({ name: '_cdmp_extracted_at', type: dateColumnType })
  _cdmp_extracted_at: Date;
}
