import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

/**
 * E07 Track A — M1b: 建立 ob_pool_data（OBPOOLDATA 案件池，121 欄位）
 *
 * 對應：
 *   - OBPOOLDATA SQL Server 原表 120 欄（reference/TableSchema/OB/OBPOOLDATA.sql）
 *   - 加 _cdmp_extracted_at（E04 ETL 系統欄位）= 121 欄
 *   - PK: (orgno, appl_no)（AD-E07-13）— 原表無 PK，遷移時補建
 *   - 共享案件池：不含 LIST_NO（per-LIST 篩選由月跑 Stage 1 join ob_list_definition 動態取得）
 *
 * 欄位由 apps/api/scripts/parse-ob-schema.mjs 自動解析自 OBPOOLDATA.sql
 * 命名規範：CAPS → snake_case；A_PRGID/U_PRGID 等稽核欄位重命名為 created_*_/updated_*_
 */
export class CreateObPoolData1711360000110 implements MigrationInterface {
  name = 'CreateObPoolData1711360000110';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'ob_pool_data',
        columns: [
          // 稽核欄位（OBPOOLDATA 原表 NULL）
          { name: 'created_by_prog', type: 'varchar', length: '20', isNullable: true }, // A_PRGID
          { name: 'created_by', type: 'varchar', length: '20', isNullable: true }, // A_USERID
          { name: 'created_at', type: 'timestamp', isNullable: true }, // A_SYSDT
          { name: 'updated_by_prog', type: 'varchar', length: '20', isNullable: true }, // U_PRGID
          { name: 'updated_by', type: 'varchar', length: '20', isNullable: true }, // U_USERID
          { name: 'updated_at', type: 'timestamp', isNullable: true }, // U_SYSDT
          // 業務鍵（PK，AD-E07-13）
          { name: 'orgno', type: 'varchar', length: '2', isNullable: false, isPrimary: true }, // ORGNO
          { name: 'appl_no', type: 'varchar', length: '10', isNullable: false, isPrimary: true }, // APPL_NO
          { name: 'custo_no', type: 'varchar', length: '11', isNullable: false }, // CUSTO_NO（C360 join 鍵）
          { name: 'cust_name', type: 'varchar', length: '90', isNullable: true }, // CUST_NAME
          { name: 'lic_no', type: 'varchar', length: '10', isNullable: true }, // LIC_NO
          { name: 'sta_code_na', type: 'varchar', length: '40', isNullable: true }, // STA_CODE_NA
          { name: 'project_tp', type: 'varchar', length: '40', isNullable: true }, // PROJECT_TP
          { name: 'spec_no', type: 'varchar', length: '10', isNullable: true }, // SPEC_NO
          { name: 'spec_name', type: 'varchar', length: '45', isNullable: true }, // SPEC_NAME
          { name: 'dept_name', type: 'varchar', length: '30', isNullable: true }, // DEPT_NAME
          { name: 'pay_resouc_code', type: 'varchar', length: '2', isNullable: true }, // PAY_RESOUC_CODE
          { name: 'break_pct', type: 'numeric', precision: 5, scale: 0, isNullable: true }, // BREAK_PCT
          { name: 'extend_day', type: 'numeric', precision: 2, scale: 0, isNullable: true }, // EXTEND_DAY
          { name: 'pay_resouc', type: 'varchar', length: '40', isNullable: true }, // PAY_RESOUC
          { name: 'commute', type: 'varchar', length: '90', isNullable: true }, // COMMUTE
          { name: 'cycle_pay_na', type: 'varchar', length: '40', isNullable: true }, // CYCLE_PAY_NA
          { name: 'cycle_pay_val', type: 'varchar', length: '2', isNullable: true }, // CYCLE_PAY_VAL
          { name: 'deal_num', type: 'numeric', precision: 3, scale: 0, isNullable: true }, // DEAL_NUM
          { name: 'pro_rate', type: 'numeric', precision: 5, scale: 2, isNullable: true }, // PRO_RATE
          { name: 'b_case_irr', type: 'numeric', precision: 5, scale: 2, isNullable: true }, // B_CASE_IRR
          { name: 'first_pay_dt', type: 'timestamp', isNullable: true }, // FIRST_PAY_DT
          { name: 'fapcon_dt', type: 'timestamp', isNullable: true }, // FAPCON_DT
          { name: 'maturity_dt', type: 'timestamp', isNullable: true }, // MATURITY_DT
          { name: 'deal_mark', type: 'varchar', length: '2', isNullable: true }, // DEAL_MARK
          { name: 'pay_way', type: 'varchar', length: '2', isNullable: true }, // PAY_WAY
          { name: 'loan_totamt', type: 'numeric', precision: 18, scale: 0, isNullable: true }, // LOAN_TOTAMT
          { name: 'loan_capital', type: 'numeric', precision: 18, scale: 0, isNullable: true }, // LOAN_CAPITAL
          { name: 'loan_oddamt', type: 'numeric', precision: 18, scale: 0, isNullable: true }, // LOAN_ODDAMT
          { name: 'commission', type: 'numeric', precision: 15, scale: 0, isNullable: true }, // COMMISSION
          { name: 'settle_date', type: 'timestamp', isNullable: true }, // SETTLE_DATE
          { name: 'loan_rate', type: 'numeric', precision: 5, scale: 2, isNullable: true }, // LOAN_RATE
          { name: 'sta_code', type: 'varchar', length: '2', isNullable: false }, // STA_CODE
          { name: 'ofi_date', type: 'timestamp', isNullable: true }, // OFI_DATE
          { name: 'dept_id', type: 'varchar', length: '6', isNullable: false }, // DEPT_ID
          { name: 'pay_way_na', type: 'varchar', length: '30', isNullable: true }, // PAY_WAY_NA
          { name: 'brnh_no', type: 'varchar', length: '5', isNullable: true }, // BRNH_NO
          { name: 'dlr_no', type: 'varchar', length: '4', isNullable: true }, // DLR_NO
          { name: 'broker', type: 'varchar', length: '60', isNullable: true }, // BROKER
          { name: 'sales_no', type: 'varchar', length: '14', isNullable: true }, // SALES_NO
          { name: 'broker_agent', type: 'varchar', length: '60', isNullable: true }, // BROKER_AGENT
          { name: 'hfs_sales', type: 'varchar', length: '14', isNullable: true }, // HFS_SALES
          { name: 'sales', type: 'varchar', length: '60', isNullable: true }, // SALES
          { name: 'agent_head_id', type: 'varchar', length: '11', isNullable: true }, // AGENT_HEAD_ID
          { name: 'promoter_dept', type: 'varchar', length: '60', isNullable: true }, // PROMOTER_DEPT
          { name: 'agent_id', type: 'varchar', length: '11', isNullable: true }, // AGENT_ID
          { name: 'promoter', type: 'varchar', length: '60', isNullable: true }, // PROMOTER
          { name: 'brand_no', type: 'varchar', length: '2', isNullable: true }, // BRAND_NO
          { name: 'brand_name', type: 'varchar', length: '40', isNullable: true }, // BRAND_NAME
          { name: 'car_name', type: 'varchar', length: '30', isNullable: true }, // CAR_NAME
          { name: 'inquiry', type: 'varchar', length: '10', isNullable: true }, // INQUIRY
          { name: 'approval', type: 'varchar', length: '10', isNullable: true }, // APPROVAL
          { name: 'manager_limit', type: 'varchar', length: '2', isNullable: true }, // MANAGER_LIMIT
          { name: 'spec_mk_na', type: 'varchar', length: '40', isNullable: true }, // SPEC_MK_NA
          { name: 'spec_type_na', type: 'varchar', length: '40', isNullable: true }, // SPEC_TYPE_NA
          { name: 'atm_business', type: 'varchar', length: '4', isNullable: true }, // ATM_BUSINESS
          { name: 'no_duty', type: 'varchar', length: '1', isNullable: true }, // NO_DUTY
          { name: 'year_produ', type: 'varchar', length: '4', isNullable: true }, // YEAR_PRODU
          { name: 'dlr_name', type: 'varchar', length: '30', isNullable: true }, // DLR_NAME
          { name: 'brnh_name', type: 'varchar', length: '30', isNullable: true }, // BRNH_NAME
          { name: 'project_tp_cd', type: 'varchar', length: '2', isNullable: true }, // PROJECT_TP_CD
          { name: 'appl_date', type: 'timestamp', isNullable: true }, // APPL_DATE
          { name: 'apmacc_memo', type: 'text', isNullable: true }, // APMACC_MEMO
          { name: 'sales_sts_na', type: 'varchar', length: '30', isNullable: true }, // SALES_STS_NA
          { name: 'sub_code', type: 'varchar', length: '2', isNullable: true }, // SUB_CODE
          { name: 'cc_nbr', type: 'varchar', length: '5', isNullable: true }, // CC_NBR
          { name: 'throu_mon', type: 'numeric', precision: 8, scale: 0, isNullable: true }, // THROU_MON
          { name: 'fund_src', type: 'varchar', length: '2', isNullable: true }, // FUND_SRC
          { name: 'secret_flg', type: 'varchar', length: '1', isNullable: true }, // SECRET_FLG
          { name: 'rate_choice', type: 'varchar', length: '30', isNullable: true }, // RATE_CHOICE
          { name: 'per_info', type: 'varchar', length: '30', isNullable: true }, // PER_INFO
          { name: 'tie_down_num', type: 'integer', isNullable: true }, // TIE_DOWN_NUM
          { name: 'rest_amt', type: 'numeric', precision: 8, scale: 0, isNullable: true }, // REST_AMT
          { name: 'over_tie_num', type: 'integer', isNullable: true }, // OVER_TIE_NUM
          { name: 'open_code', type: 'varchar', length: '1', isNullable: true }, // OPEN_CODE
          { name: 'emplid', type: 'varchar', length: '10', isNullable: true }, // EMPLID
          { name: 'emplid_deptid', type: 'varchar', length: '6', isNullable: true }, // EMPLID_DEPTID
          { name: 'case_type', type: 'varchar', length: '2', isNullable: true }, // CASE_TYPE
          { name: 'hotai_agree', type: 'varchar', length: '10', isNullable: true }, // HOTAI_AGREE
          { name: 'call_dept', type: 'varchar', length: '4', isNullable: true }, // CALL_DEPT
          { name: 'c_class', type: 'varchar', length: '1', isNullable: true }, // C_CLASS
          { name: 'payt_num', type: 'integer', isNullable: true }, // PAYT_NUM
          { name: 'list_type', type: 'varchar', length: '2', isNullable: false }, // LIST_TYPE
          { name: 'prod_type', type: 'varchar', length: '2', isNullable: true }, // PROD_TYPE
          { name: 'prod_type_name', type: 'varchar', length: '40', isNullable: true }, // PROD_TYPE_NAME
          { name: 'prod_class', type: 'varchar', length: '2', isNullable: true }, // PROD_CLASS
          { name: 'prod_class_name', type: 'varchar', length: '40', isNullable: true }, // PROD_CLASS_NAME
          { name: 'prod_kind', type: 'varchar', length: '2', isNullable: false }, // PROD_KIND（Stage 1 篩選）
          { name: 'prod_kind_name', type: 'varchar', length: '8', isNullable: false }, // PROD_KIND_NAME
          { name: 'best_case', type: 'varchar', length: '1', isNullable: false }, // BEST_CASE
          { name: 'acc_date', type: 'timestamp', isNullable: true }, // ACC_DATE
          { name: 'order1', type: 'integer', isNullable: true }, // ORDER1
          { name: 'order2', type: 'integer', isNullable: true }, // ORDER2
          { name: 'payt_term', type: 'integer', isNullable: true }, // PAYT_TERM
          { name: 'term_amt', type: 'numeric', precision: 19, scale: 4, isNullable: true }, // TERM_AMT
          { name: 'nonpayt_term', type: 'integer', isNullable: true }, // NONPAYT_TERM
          { name: 'overdue_amt', type: 'numeric', precision: 19, scale: 4, isNullable: true }, // OVERDUE_AMT
          { name: 'overdue_day', type: 'integer', isNullable: true }, // OVERDUE_DAY
          { name: 'coll_empl', type: 'varchar', length: '50', isNullable: true }, // COLL_EMPL
          { name: 'car_model', type: 'varchar', length: '100', isNullable: true }, // CAR_MODEL
          { name: 'pay_user', type: 'varchar', length: '90', isNullable: true }, // PAY_USER
          { name: 'pay_add', type: 'varchar', length: '255', isNullable: true }, // PAY_ADD
          { name: 'fleet_car', type: 'varchar', length: '1', isNullable: true }, // FLEET_CAR
          { name: 'promoter_tel', type: 'varchar', length: '20', isNullable: true }, // PROMOTER_TEL
          { name: 'sales_tel', type: 'varchar', length: '20', isNullable: true }, // SALES_TEL
          { name: 'memo1', type: 'varchar', length: '255', isNullable: true }, // MEMO1
          { name: 'caseyear', type: 'varchar', length: '4', isNullable: true }, // CASEYEAR（Stage 1 篩選）
          { name: 'ob_dept', type: 'varchar', length: '6', isNullable: true }, // OB_DEPT
          { name: 'ob_emplid', type: 'varchar', length: '6', isNullable: true }, // OB_EMPLID
          { name: 'last_pay_date', type: 'timestamp', isNullable: true }, // LAST_PAY_DATE
          { name: 'month_cnt', type: 'integer', isNullable: true }, // MONTH_CNT
          { name: 'year_cnt', type: 'integer', isNullable: true }, // YEAR_CNT
          { name: 'settle_src', type: 'text', isNullable: false }, // SETTLE_SRC（Stage 1 篩選）
          { name: 'spec_tp', type: 'varchar', length: '2', isNullable: true }, // SPEC_TP（Stage 1 篩選）
          { name: 'cus_level', type: 'varchar', length: '1', isNullable: true }, // CUS_LEVEL
          // E04 ETL 系統欄位
          { name: '_cdmp_extracted_at', type: 'timestamp', isNullable: false }, // ETL 擷取時間
        ],
      }),
      true,
    );

    // 索引（依 spec data-model.md L891）
    await queryRunner.createIndex(
      'ob_pool_data',
      new TableIndex({ name: 'idx_ob_pool_data_custo_no', columnNames: ['custo_no'] }),
    );
    await queryRunner.createIndex(
      'ob_pool_data',
      new TableIndex({ name: 'idx_ob_pool_data_prod_kind', columnNames: ['prod_kind'] }),
    );
    // settle_src 為 text 型別，在 PostgreSQL 中無法直接 B-tree 索引；改用 hash 或限制長度
    // 暫用 functional index 取首字元（dump 觀察值多為 'Y' / 'N' / 'Y$$N' 等短字串）
    await queryRunner.query(
      `CREATE INDEX idx_ob_pool_data_settle_src ON ob_pool_data ((LEFT(settle_src, 100)))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('ob_pool_data', true);
  }
}
