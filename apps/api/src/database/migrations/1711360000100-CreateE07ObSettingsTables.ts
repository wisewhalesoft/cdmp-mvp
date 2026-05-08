import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

/**
 * E07 Track A — M1: 建立 OB 設定表（11 張）
 * 適用範圍：業務主管維護用 + ETL 同步用
 *
 * 包含表（依建立順序）：
 *   1. ob_code_df            (OBMCODEDF — 系統代碼)
 *   2. ob_list_definition    (OBMLISTDF — 名單定義)
 *   3. ob_dept_pct           (OBMDEPTPCT — 部門比例)
 *   4. ob_empl_set           (OBEMPLSETMF — 人員比例)
 *   5. ob_levelcard_version  (OBLEVELCARD_VERSION — 計分版本，含遷移補建 status)
 *   6. ob_levelcard_column   (OBLEVELCARD_COLUNM — 計分維度，COLUNM 改名 column_name)
 *   7. ob_levelcard_score    (OBLEVELCARD_SCORE — 計分分數)
 *   8. ob_levelcard_level    (OBLEVELCARD_LEVEL — CARD_LEVEL 門檻)
 *   9. ob_tier               (OBTIER — TIER_LEVEL 對應，UNIQUE INDEX 含 NULL fallback)
 *  10. ob_emphire            (OBEMPHIRE — 員工主檔，補 emp_id PK；ID → id_no)
 *  11. ob_calendar           (OBCALENDAR — 工作日表)
 *
 * 對應：data-model.md §E07 資料模型；AD-E07-1（OB 遷移至 AppDB）；AD-E07-12（ETL 雙層架構）
 *
 * 不含此檔（拆檔）：
 *   - ob_pool_data / ob_pool_data_list → M1b / M1c
 *   - assignment_run / snapshot / stage_log / audit_log → M2
 *   - ob_assign_config / ob_assign_set / users.is_sales_manager → M3
 */
export class CreateE07ObSettingsTables1711360000100 implements MigrationInterface {
  name = 'CreateE07ObSettingsTables1711360000100';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // === 1. ob_code_df （OBMCODEDF — composite PK (system_id, tbl_id, tbl_cd)）===
    // TypeORM entity 強制要求 PK；3 欄都 NOT NULL，可直接作 composite PK
    await queryRunner.createTable(
      new Table({
        name: 'ob_code_df',
        columns: [
          { name: 'system_id', type: 'varchar', length: '4', isNullable: false, isPrimary: true },
          { name: 'tbl_id', type: 'varchar', length: '2', isNullable: false, isPrimary: true },
          { name: 'tbl_cd', type: 'varchar', length: '4', isNullable: false, isPrimary: true },
          { name: 'tbl_desc1', type: 'varchar', length: '40', isNullable: true },
          { name: 'tbl_desc2', type: 'varchar', length: '40', isNullable: true },
          { name: 'tbl_val1', type: 'numeric', precision: 12, scale: 0, isNullable: true },
          { name: 'tbl_val2', type: 'timestamp', isNullable: true },
          { name: 'tbl_val3', type: 'varchar', length: '40', isNullable: true },
          { name: 'tbl_val4', type: 'varchar', length: '40', isNullable: true },
          { name: 'tbl_val5', type: 'varchar', length: '40', isNullable: true },
          { name: 'tbl_val6', type: 'varchar', length: '80', isNullable: true },
          { name: 'tbl_val7', type: 'varchar', length: '80', isNullable: true },
          { name: 'tbl_val8', type: 'varchar', length: '80', isNullable: true },
          { name: 'stadt', type: 'varchar', length: '8', isNullable: true },
          { name: 'enddt', type: 'varchar', length: '8', isNullable: true },
        ],
      }),
      true,
    );

    // === 2. ob_list_definition （OBMLISTDF — PK list_no）===
    await queryRunner.createTable(
      new Table({
        name: 'ob_list_definition',
        columns: [
          { name: 'created_by_prog', type: 'varchar', length: '20', isNullable: false }, // A_PRGID
          { name: 'created_by', type: 'varchar', length: '20', isNullable: false }, // A_USERID
          { name: 'created_at', type: 'timestamp', isNullable: false }, // A_SYSDT
          { name: 'updated_by_prog', type: 'varchar', length: '20', isNullable: false }, // U_PRGID
          { name: 'updated_by', type: 'varchar', length: '20', isNullable: false }, // U_USERID
          { name: 'updated_at', type: 'timestamp', isNullable: false }, // U_SYSDT
          { name: 'list_no', type: 'varchar', length: '11', isNullable: false, isPrimary: true }, // PK
          { name: 'list_nm', type: 'varchar', length: '45', isNullable: false },
          { name: 'prod_kind', type: 'varchar', length: '255', isNullable: false }, // $$ 多值
          { name: 'prod_best', type: 'varchar', length: '5', isNullable: false },
          { name: 'spec_tp', type: 'varchar', length: '255', isNullable: true }, // $$ 多值
          { name: 'list_type', type: 'varchar', length: '255', isNullable: false },
          { name: 'list_period_start', type: 'varchar', length: '3', isNullable: false },
          { name: 'list_period_end', type: 'varchar', length: '3', isNullable: false },
          { name: 'list_interval', type: 'varchar', length: '3', isNullable: false },
          { name: 'assigned_date', type: 'timestamp', isNullable: true },
          { name: 'total_amount', type: 'integer', isNullable: true },
          { name: 'reserved_amount', type: 'integer', isNullable: true },
          { name: 'is_assigned', type: 'varchar', length: '1', isNullable: true },
          { name: 'project_workym', type: 'varchar', length: '6', isNullable: true },
          { name: 'casenumber', type: 'varchar', length: '50', isNullable: true },
          { name: 'name', type: 'varchar', length: '50', isNullable: true },
          { name: 'caseyear', type: 'varchar', length: '255', isNullable: true }, // $$ 多值
          { name: 'caseyearnm', type: 'varchar', length: '10', isNullable: true },
          { name: 'settle_src', type: 'varchar', length: '6', isNullable: true }, // $$ 多值
          { name: 'card_type', type: 'varchar', length: '2', isNullable: true },
          // E07 新增：status（OQ-E07-14 / AD-E02-? — 名單啟用旗標）
          { name: 'status', type: 'varchar', length: '10', isNullable: false, default: "'active'" },
        ],
      }),
      true,
    );
    await queryRunner.createIndex(
      'ob_list_definition',
      new TableIndex({
        name: 'idx_ob_list_definition_workym_card',
        columnNames: ['project_workym', 'card_type'],
      }),
    );
    await queryRunner.createIndex(
      'ob_list_definition',
      new TableIndex({
        name: 'idx_ob_list_definition_status',
        columnNames: ['status'],
      }),
    );

    // === 3. ob_dept_pct （OBMDEPTPCT — composite PK）===
    await queryRunner.createTable(
      new Table({
        name: 'ob_dept_pct',
        columns: [
          { name: 'created_by_prog', type: 'varchar', length: '10', isNullable: false },
          { name: 'created_by', type: 'varchar', length: '10', isNullable: false },
          { name: 'created_at', type: 'timestamp', isNullable: false },
          { name: 'updated_by_prog', type: 'varchar', length: '10', isNullable: false },
          { name: 'updated_by', type: 'varchar', length: '10', isNullable: false },
          { name: 'updated_at', type: 'timestamp', isNullable: false },
          { name: 'project_workym', type: 'varchar', length: '6', isNullable: false, isPrimary: true },
          { name: 'list_no', type: 'varchar', length: '11', isNullable: false, isPrimary: true },
          { name: 'obdeptid', type: 'varchar', length: '6', isNullable: false, isPrimary: true },
          { name: 'obdeptnm', type: 'varchar', length: '10', isNullable: false },
          { name: 'ration', type: 'numeric', precision: 9, scale: 1, isNullable: false, isPrimary: true },
        ],
      }),
      true,
    );
    await queryRunner.createIndex(
      'ob_dept_pct',
      new TableIndex({
        name: 'idx_ob_dept_pct_workym_list',
        columnNames: ['project_workym', 'list_no'],
      }),
    );

    // === 4. ob_empl_set （OBEMPLSETMF — composite PK；deptid_m 遷移時 RTRIM）===
    await queryRunner.createTable(
      new Table({
        name: 'ob_empl_set',
        columns: [
          { name: 'created_by_prog', type: 'varchar', length: '10', isNullable: true },
          { name: 'created_by', type: 'varchar', length: '10', isNullable: true },
          { name: 'created_at', type: 'timestamp', isNullable: true },
          { name: 'updated_by_prog', type: 'varchar', length: '10', isNullable: true },
          { name: 'updated_by', type: 'varchar', length: '10', isNullable: true },
          { name: 'updated_at', type: 'timestamp', isNullable: true },
          { name: 'list_no', type: 'varchar', length: '11', isNullable: false, isPrimary: true },
          // 遷移時對 OBEMPLSETMF.DEPTID_M VARCHAR(50) padded 值執行 RTRIM
          { name: 'deptid_m', type: 'varchar', length: '50', isNullable: false, isPrimary: true },
          { name: 'emplid', type: 'varchar', length: '6', isNullable: false, isPrimary: true },
          { name: 'ration', type: 'numeric', precision: 10, scale: 1, isNullable: false, isPrimary: true },
          { name: 'prod_type', type: 'varchar', length: '255', isNullable: true }, // $$ 多值
        ],
      }),
      true,
    );
    await queryRunner.createIndex(
      'ob_empl_set',
      new TableIndex({
        name: 'idx_ob_empl_set_list_dept',
        columnNames: ['list_no', 'deptid_m'],
      }),
    );

    // === 5. ob_levelcard_version （OBLEVELCARD_VERSION — surrogate id PK，含遷移補建 status）===
    // 原表無嚴格 PK；邏輯主鍵 (card_type, card_version) 含 nullable 欄位無法作 PK，補 surrogate id
    await queryRunner.createTable(
      new Table({
        name: 'ob_levelcard_version',
        columns: [
          { name: 'id', type: 'bigserial', isPrimary: true },
          { name: 'created_by_prog', type: 'varchar', length: '20', isNullable: true },
          { name: 'created_by', type: 'varchar', length: '20', isNullable: true },
          { name: 'created_at', type: 'timestamp', isNullable: true },
          { name: 'updated_by_prog', type: 'varchar', length: '20', isNullable: true },
          { name: 'updated_by', type: 'varchar', length: '20', isNullable: true },
          { name: 'updated_at', type: 'timestamp', isNullable: true },
          { name: 'card_type', type: 'text', isNullable: true }, // 原 varchar(max)
          { name: 'card_name', type: 'varchar', length: '20', isNullable: true },
          { name: 'card_version', type: 'integer', isNullable: true },
          { name: 'sdate', type: 'varchar', length: '8', isNullable: false }, // YYYYMMDD
          { name: 'edate', type: 'varchar', length: '8', isNullable: false }, // YYYYMMDD
          // [遷移補建] AD-E02 / AD-E07 — STATUS 欄位（原表無）
          // 遷移時依 (sdate <= 今日 < edate) 計算初值：active / inactive
          { name: 'status', type: 'varchar', length: '10', isNullable: false, default: "'active'" },
        ],
      }),
      true,
    );
    await queryRunner.createIndex(
      'ob_levelcard_version',
      new TableIndex({
        name: 'idx_ob_levelcard_version_type_ver',
        columnNames: ['card_type', 'card_version', 'status'],
      }),
    );

    // === 6. ob_levelcard_column （OBLEVELCARD_COLUNM — COLUNM → column_name 拼字修正；surrogate id PK）===
    await queryRunner.createTable(
      new Table({
        name: 'ob_levelcard_column',
        columns: [
          { name: 'id', type: 'bigserial', isPrimary: true },
          { name: 'created_by_prog', type: 'varchar', length: '20', isNullable: true },
          { name: 'created_by', type: 'varchar', length: '20', isNullable: true },
          { name: 'created_at', type: 'timestamp', isNullable: true },
          { name: 'updated_by_prog', type: 'varchar', length: '20', isNullable: true },
          { name: 'updated_by', type: 'varchar', length: '20', isNullable: true },
          { name: 'updated_at', type: 'timestamp', isNullable: true },
          { name: 'card_type', type: 'varchar', length: '10', isNullable: true },
          { name: 'card_version', type: 'integer', isNullable: true },
          { name: 'column_name', type: 'varchar', length: '30', isNullable: true }, // 原 COLUNM（拼字修正）
          { name: 'column_label', type: 'varchar', length: '30', isNullable: true }, // 原 COLUNM_NAME
        ],
      }),
      true,
    );
    await queryRunner.createIndex(
      'ob_levelcard_column',
      new TableIndex({
        name: 'idx_ob_levelcard_column_key',
        columnNames: ['card_type', 'card_version', 'column_name'],
      }),
    );

    // === 7. ob_levelcard_score （OBLEVELCARD_SCORE — COLUNM → column_name；surrogate id PK）===
    await queryRunner.createTable(
      new Table({
        name: 'ob_levelcard_score',
        columns: [
          { name: 'id', type: 'bigserial', isPrimary: true },
          { name: 'created_by_prog', type: 'varchar', length: '20', isNullable: true },
          { name: 'created_by', type: 'varchar', length: '20', isNullable: true },
          { name: 'created_at', type: 'timestamp', isNullable: true },
          { name: 'updated_by_prog', type: 'varchar', length: '20', isNullable: true },
          { name: 'updated_by', type: 'varchar', length: '20', isNullable: true },
          { name: 'updated_at', type: 'timestamp', isNullable: true },
          { name: 'card_type', type: 'varchar', length: '10', isNullable: false },
          { name: 'card_version', type: 'integer', isNullable: false },
          { name: 'column_name', type: 'varchar', length: '30', isNullable: false }, // 原 COLUNM
          { name: 'level1', type: 'char', length: '10', isNullable: true }, // 類別型條件
          { name: 'level2_s', type: 'varchar', length: '10', isNullable: true }, // 數值起始
          { name: 'level2_e', type: 'varchar', length: '10', isNullable: true }, // 數值結束
          { name: 'score', type: 'integer', isNullable: false },
        ],
      }),
      true,
    );
    await queryRunner.createIndex(
      'ob_levelcard_score',
      new TableIndex({
        name: 'idx_ob_levelcard_score_key',
        columnNames: ['card_type', 'card_version', 'column_name'],
      }),
    );

    // === 8. ob_levelcard_level （OBLEVELCARD_LEVEL — CARD_LEVEL 門檻；surrogate id PK）===
    await queryRunner.createTable(
      new Table({
        name: 'ob_levelcard_level',
        columns: [
          { name: 'id', type: 'bigserial', isPrimary: true },
          { name: 'created_by_prog', type: 'varchar', length: '20', isNullable: true },
          { name: 'created_by', type: 'varchar', length: '20', isNullable: true },
          { name: 'created_at', type: 'timestamp', isNullable: true },
          { name: 'updated_by_prog', type: 'varchar', length: '20', isNullable: true },
          { name: 'updated_by', type: 'varchar', length: '20', isNullable: true },
          { name: 'updated_at', type: 'timestamp', isNullable: true },
          { name: 'card_type', type: 'varchar', length: '10', isNullable: false },
          { name: 'card_version', type: 'integer', isNullable: false },
          { name: 'score_s', type: 'integer', isNullable: false },
          { name: 'score_e', type: 'integer', isNullable: false },
          { name: 'card_level', type: 'varchar', length: '1', isNullable: false }, // A/B/C/D/E
        ],
      }),
      true,
    );
    await queryRunner.createIndex(
      'ob_levelcard_level',
      new TableIndex({
        name: 'idx_ob_levelcard_level_type_ver',
        columnNames: ['card_type', 'card_version'],
      }),
    );

    // === 9. ob_tier （OBTIER — surrogate id PK；UNIQUE INDEX with COALESCE 處理 NULL CARD_LEVEL fallback）===
    await queryRunner.createTable(
      new Table({
        name: 'ob_tier',
        columns: [
          { name: 'id', type: 'bigserial', isPrimary: true },
          { name: 'list_nm', type: 'varchar', length: '30', isNullable: true }, // 描述性
          // 遷移時補 NOT NULL（依 SP join 邏輯，AD-E07-13）
          { name: 'card_type', type: 'varchar', length: '5', isNullable: false },
          // CARD_LEVEL 維持 NULL（M5 fallback：dump 觀察 1 筆 CARD_LEVEL=空字串）
          { name: 'card_level', type: 'varchar', length: '5', isNullable: true },
          { name: 'tier_level', type: 'varchar', length: '5', isNullable: false },
        ],
      }),
      true,
    );
    // UNIQUE INDEX 含 COALESCE 處理 NULL fallback；PostgreSQL 不支援 COALESCE in PK，改 UNIQUE INDEX
    await queryRunner.query(
      `CREATE UNIQUE INDEX uq_ob_tier_key ON ob_tier (card_type, COALESCE(card_level, ''))`,
    );

    // === 10. ob_emphire （OBEMPHIRE — 補 emp_id PK；ID → id_no 避免 keyword 衝突）===
    await queryRunner.createTable(
      new Table({
        name: 'ob_emphire',
        columns: [
          // 遷移時補 NOT NULL（原表無 PK，AD-E07-12）
          { name: 'emp_id', type: 'varchar', length: '10', isNullable: false, isPrimary: true },
          { name: 'emp_nm', type: 'varchar', length: '50', isNullable: true },
          { name: 'id_no', type: 'varchar', length: '10', isNullable: true }, // 原 ID 欄位
          { name: 'dept_code', type: 'varchar', length: '10', isNullable: true },
          { name: 'dept_name', type: 'varchar', length: '30', isNullable: true },
          { name: 'title_code', type: 'varchar', length: '5', isNullable: true },
          { name: 'title_name', type: 'varchar', length: '30', isNullable: true },
          { name: 'jfun_id', type: 'varchar', length: '10', isNullable: true },
          { name: 'jfun_nm', type: 'varchar', length: '15', isNullable: true },
          { name: 'hire_date', type: 'date', isNullable: true },
          { name: 'resign_date', type: 'date', isNullable: true }, // AD-E07-6 在職判斷
          { name: 'email', type: 'varchar', length: '100', isNullable: true },
          { name: 'is_auth', type: 'varchar', length: '1', isNullable: true },
        ],
      }),
      true,
    );
    await queryRunner.createIndex(
      'ob_emphire',
      new TableIndex({
        name: 'idx_ob_emphire_dept',
        columnNames: ['dept_code'],
      }),
    );
    await queryRunner.createIndex(
      'ob_emphire',
      new TableIndex({
        name: 'idx_ob_emphire_resign',
        columnNames: ['resign_date'], // AD-E07-6: WHERE resign_date IS NULL
      }),
    );

    // === 11. ob_calendar （OBCALENDAR — PK calendar_date；rest_flg 用 varchar(1)）===
    await queryRunner.createTable(
      new Table({
        name: 'ob_calendar',
        columns: [
          { name: 'calendar_date', type: 'date', isNullable: false, isPrimary: true },
          // spec 用 varchar(1)：'0'=工作日 / '1'=假日（與舊 SP rest_flg=0 邏輯一致；ETL 時 int → str cast）
          { name: 'rest_flg', type: 'varchar', length: '1', isNullable: false },
        ],
      }),
      true,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 反序 drop
    await queryRunner.dropTable('ob_calendar', true);
    await queryRunner.dropTable('ob_emphire', true);
    await queryRunner.dropTable('ob_tier', true);
    await queryRunner.dropTable('ob_levelcard_level', true);
    await queryRunner.dropTable('ob_levelcard_score', true);
    await queryRunner.dropTable('ob_levelcard_column', true);
    await queryRunner.dropTable('ob_levelcard_version', true);
    await queryRunner.dropTable('ob_empl_set', true);
    await queryRunner.dropTable('ob_dept_pct', true);
    await queryRunner.dropTable('ob_list_definition', true);
    await queryRunner.dropTable('ob_code_df', true);
  }
}
