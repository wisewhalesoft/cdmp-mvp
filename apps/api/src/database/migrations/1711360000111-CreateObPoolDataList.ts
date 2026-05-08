import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

/**
 * E07 Track A — M1c: 建立 ob_pool_data_list（OBPOOLDATA_LIST per-LIST 案件分派結果，128 欄位）
 *
 * 對應：
 *   - OBPOOLDATA_LIST SQL Server 原表 128 欄（reference/TableSchema/OB/OBPOOLDATA_LIST.sql）
 *   - PK: (list_no, orgno, appl_no)
 *   - 月跑 Stage 1 INSERT、Stage 2 計分結果 UPDATE（card_level / tier_level / card_type）、
 *     Stage 3 部門分派 UPDATE（dept_id）、Stage 4 人員分派 UPDATE（emplid / cr_*）
 *
 * 欄位由 apps/api/scripts/parse-ob-schema.mjs 自動解析
 */
export class CreateObPoolDataList1711360000111 implements MigrationInterface {
  name = 'CreateObPoolDataList1711360000111';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'ob_pool_data_list',
        columns: [
          // 稽核欄位
          { name: 'created_by_prog', type: 'varchar', length: '20', isNullable: true },
          { name: 'created_by', type: 'varchar', length: '20', isNullable: true },
          { name: 'created_at', type: 'timestamp', isNullable: true },
          { name: 'updated_by_prog', type: 'varchar', length: '20', isNullable: true },
          { name: 'updated_by', type: 'varchar', length: '20', isNullable: true },
          { name: 'updated_at', type: 'timestamp', isNullable: true },
          // 業務鍵（composite PK）
          { name: 'list_no', type: 'varchar', length: '100', isNullable: false, isPrimary: true },
          { name: 'orgno', type: 'varchar', length: '2', isNullable: false, isPrimary: true },
          { name: 'appl_no', type: 'varchar', length: '10', isNullable: false, isPrimary: true },
          // 客戶資訊
          { name: 'custo_no', type: 'varchar', length: '11', isNullable: true },
          { name: 'cust_name', type: 'varchar', length: '90', isNullable: true },
          { name: 'lic_no', type: 'varchar', length: '10', isNullable: true },
          { name: 'sta_code_na', type: 'varchar', length: '40', isNullable: true },
          { name: 'project_tp', type: 'varchar', length: '40', isNullable: true },
          { name: 'spec_no', type: 'varchar', length: '10', isNullable: true },
          { name: 'spec_name', type: 'varchar', length: '45', isNullable: true },
          { name: 'dept_name', type: 'varchar', length: '30', isNullable: true },
          { name: 'pay_resouc_code', type: 'varchar', length: '2', isNullable: true },
          { name: 'break_pct', type: 'numeric', precision: 5, scale: 0, isNullable: true },
          { name: 'extend_day', type: 'numeric', precision: 2, scale: 0, isNullable: true },
          { name: 'pay_resouc', type: 'varchar', length: '40', isNullable: true },
          { name: 'commute', type: 'varchar', length: '90', isNullable: true },
          { name: 'cycle_pay_na', type: 'varchar', length: '40', isNullable: true },
          { name: 'cycle_pay_val', type: 'varchar', length: '2', isNullable: true },
          { name: 'deal_num', type: 'numeric', precision: 3, scale: 0, isNullable: true },
          { name: 'pro_rate', type: 'numeric', precision: 5, scale: 2, isNullable: true },
          { name: 'b_case_irr', type: 'numeric', precision: 5, scale: 2, isNullable: true },
          { name: 'first_pay_dt', type: 'timestamp', isNullable: true },
          { name: 'fapcon_dt', type: 'timestamp', isNullable: true },
          { name: 'maturity_dt', type: 'timestamp', isNullable: true },
          { name: 'deal_mark', type: 'varchar', length: '2', isNullable: true },
          { name: 'pay_way', type: 'varchar', length: '2', isNullable: true },
          { name: 'loan_totamt', type: 'numeric', precision: 18, scale: 0, isNullable: true },
          { name: 'loan_capital', type: 'numeric', precision: 18, scale: 0, isNullable: true },
          { name: 'loan_oddamt', type: 'numeric', precision: 18, scale: 0, isNullable: true },
          { name: 'commission', type: 'numeric', precision: 15, scale: 0, isNullable: true },
          { name: 'settle_date', type: 'timestamp', isNullable: true },
          { name: 'loan_rate', type: 'numeric', precision: 5, scale: 2, isNullable: true },
          { name: 'sta_code', type: 'varchar', length: '2', isNullable: true },
          { name: 'ofi_date', type: 'timestamp', isNullable: true },
          { name: 'dept_id', type: 'varchar', length: '6', isNullable: true }, // Stage 3 寫入
          { name: 'pay_way_na', type: 'varchar', length: '30', isNullable: true },
          { name: 'brnh_no', type: 'varchar', length: '5', isNullable: true },
          { name: 'dlr_no', type: 'varchar', length: '4', isNullable: true },
          { name: 'broker', type: 'varchar', length: '60', isNullable: true },
          { name: 'sales_no', type: 'varchar', length: '14', isNullable: true },
          { name: 'broker_agent', type: 'varchar', length: '60', isNullable: true },
          { name: 'hfs_sales', type: 'varchar', length: '14', isNullable: true },
          { name: 'sales', type: 'varchar', length: '60', isNullable: true },
          { name: 'agent_head_id', type: 'varchar', length: '11', isNullable: true },
          { name: 'promoter_dept', type: 'varchar', length: '60', isNullable: true },
          { name: 'agent_id', type: 'varchar', length: '11', isNullable: true },
          { name: 'promoter', type: 'varchar', length: '60', isNullable: true },
          { name: 'brand_no', type: 'varchar', length: '2', isNullable: true },
          { name: 'brand_name', type: 'varchar', length: '40', isNullable: true },
          { name: 'car_name', type: 'varchar', length: '30', isNullable: true },
          { name: 'inquiry', type: 'varchar', length: '10', isNullable: true },
          { name: 'approval', type: 'varchar', length: '10', isNullable: true },
          { name: 'manager_limit', type: 'varchar', length: '2', isNullable: true },
          { name: 'spec_mk_na', type: 'varchar', length: '40', isNullable: true },
          { name: 'spec_type_na', type: 'varchar', length: '40', isNullable: true },
          { name: 'atm_business', type: 'varchar', length: '4', isNullable: true },
          { name: 'no_duty', type: 'varchar', length: '1', isNullable: true },
          { name: 'year_produ', type: 'varchar', length: '4', isNullable: true },
          { name: 'dlr_name', type: 'varchar', length: '30', isNullable: true },
          { name: 'brnh_name', type: 'varchar', length: '30', isNullable: true },
          { name: 'project_tp_cd', type: 'varchar', length: '2', isNullable: true },
          { name: 'appl_date', type: 'timestamp', isNullable: true },
          { name: 'apmacc_memo', type: 'text', isNullable: true },
          { name: 'sales_sts_na', type: 'varchar', length: '30', isNullable: true },
          { name: 'sub_code', type: 'varchar', length: '2', isNullable: true },
          { name: 'cc_nbr', type: 'varchar', length: '5', isNullable: true },
          { name: 'throu_mon', type: 'numeric', precision: 8, scale: 0, isNullable: true },
          { name: 'fund_src', type: 'varchar', length: '2', isNullable: true },
          { name: 'secret_flg', type: 'varchar', length: '1', isNullable: true },
          { name: 'rate_choice', type: 'varchar', length: '30', isNullable: true },
          { name: 'per_info', type: 'varchar', length: '30', isNullable: true },
          { name: 'tie_down_num', type: 'integer', isNullable: true },
          { name: 'rest_amt', type: 'numeric', precision: 8, scale: 0, isNullable: true },
          { name: 'over_tie_num', type: 'integer', isNullable: true },
          { name: 'open_code', type: 'varchar', length: '1', isNullable: true },
          { name: 'emplid', type: 'varchar', length: '10', isNullable: true }, // Stage 4 寫入
          { name: 'emplid_deptid', type: 'varchar', length: '6', isNullable: true },
          { name: 'case_type', type: 'varchar', length: '2', isNullable: true },
          { name: 'hotai_agree', type: 'varchar', length: '10', isNullable: true },
          { name: 'call_dept', type: 'varchar', length: '4', isNullable: true },
          { name: 'c_class', type: 'varchar', length: '1', isNullable: true },
          { name: 'payt_num', type: 'integer', isNullable: true },
          { name: 'list_type', type: 'varchar', length: '2', isNullable: true },
          { name: 'prod_type', type: 'varchar', length: '2', isNullable: true },
          { name: 'prod_type_name', type: 'varchar', length: '40', isNullable: true },
          { name: 'prod_class', type: 'varchar', length: '2', isNullable: true },
          { name: 'prod_class_name', type: 'varchar', length: '40', isNullable: true },
          { name: 'prod_kind', type: 'varchar', length: '2', isNullable: true },
          { name: 'prod_kind_name', type: 'varchar', length: '8', isNullable: true },
          { name: 'best_case', type: 'varchar', length: '1', isNullable: true },
          { name: 'acc_date', type: 'timestamp', isNullable: true },
          { name: 'order1', type: 'integer', isNullable: true },
          { name: 'order2', type: 'integer', isNullable: true },
          { name: 'payt_term', type: 'integer', isNullable: true },
          { name: 'term_amt', type: 'numeric', precision: 19, scale: 4, isNullable: true },
          { name: 'nonpayt_term', type: 'integer', isNullable: true },
          { name: 'overdue_amt', type: 'numeric', precision: 19, scale: 4, isNullable: true },
          { name: 'overdue_day', type: 'integer', isNullable: true },
          { name: 'coll_empl', type: 'varchar', length: '50', isNullable: true },
          { name: 'car_model', type: 'varchar', length: '100', isNullable: true },
          { name: 'pay_user', type: 'varchar', length: '90', isNullable: true },
          { name: 'pay_add', type: 'varchar', length: '255', isNullable: true },
          { name: 'fleet_car', type: 'varchar', length: '1', isNullable: true },
          { name: 'promoter_tel', type: 'varchar', length: '20', isNullable: true },
          { name: 'sales_tel', type: 'varchar', length: '20', isNullable: true },
          { name: 'memo1', type: 'varchar', length: '255', isNullable: true },
          { name: 'caseyear', type: 'varchar', length: '4', isNullable: true },
          { name: 'ob_dept', type: 'varchar', length: '6', isNullable: true },
          { name: 'ob_emplid', type: 'varchar', length: '6', isNullable: true },
          { name: 'last_pay_date', type: 'timestamp', isNullable: true },
          { name: 'month_cnt', type: 'integer', isNullable: true },
          { name: 'year_cnt', type: 'integer', isNullable: true },
          { name: 'settle_src', type: 'text', isNullable: false }, // DEFAULT 'N' (data 端控)
          { name: 'assignday', type: 'varchar', length: '100', isNullable: true }, // 分派日
          { name: 'spec_tp', type: 'varchar', length: '2', isNullable: true },
          { name: 'cus_level', type: 'varchar', length: '1', isNullable: true },
          // Stage 2 計分結果欄位
          { name: 'card_level', type: 'varchar', length: '1', isNullable: true }, // CARD_LEVEL
          { name: 'tier_level', type: 'varchar', length: '5', isNullable: true }, // TIER_LEVEL
          { name: 'hot_recycle', type: 'varchar', length: '1', isNullable: true },
          // CR 回分相關（Stage 3 / Stage 4 用）
          { name: 'cr_id', type: 'varchar', length: '20', isNullable: true },
          { name: 'cr_nm', type: 'varchar', length: '50', isNullable: true },
          { name: 'is_cr', type: 'varchar', length: '1', isNullable: true },
        ],
      }),
      true,
    );

    // 索引（依 spec data-model.md）
    await queryRunner.createIndex(
      'ob_pool_data_list',
      new TableIndex({ name: 'idx_ob_pool_data_list_emplid', columnNames: ['list_no', 'emplid'] }),
    );
    await queryRunner.createIndex(
      'ob_pool_data_list',
      new TableIndex({ name: 'idx_ob_pool_data_list_dept', columnNames: ['list_no', 'dept_id'] }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('ob_pool_data_list', true);
  }
}
