import { MigrationInterface, QueryRunner, Table } from 'typeorm';

/**
 * E07 Track D — 補建 ob_arreturndf_min_cap（OB_ARRETURNDF_MIN_CAP — 累積未償本金彙總）
 *
 * 對應：
 *   - 來源：reference/TableSchema/OB/OB_ARRETURNDF_MIN_CAP.sql
 *     原表 2 欄：APPL_NO varchar(20) NULL / ADD_UN_CAPITAL numeric(15,0) NULL；無 PK 無索引
 *     語意：ARRETURNDF 還款明細的 MIN(...) GROUP BY APPL_NO 預先彙總（OB 端 SP 重建）
 *   - PK：appl_no [ASSUMPTION] 原表無 PK constraint，遷移時補建以利 fn_calc_tier_level LEFT JOIN
 *   - 同步機制：E04 + E05 全量替換（fullMode:true），同 OBPOOLDATA 模式，每月跑前同步
 *   - 用途：fn_calc_tier_level 取 H/HM 等卡的 ADD_UN_CAPITAL 計分維度（AD-E07-10 lookup 約定）
 */
export class CreateObArreturndfMinCap1711360000140 implements MigrationInterface {
  name = 'CreateObArreturndfMinCap1711360000140';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'ob_arreturndf_min_cap',
        columns: [
          { name: 'appl_no', type: 'varchar', length: '20', isNullable: false, isPrimary: true }, // APPL_NO
          { name: 'add_un_capital', type: 'numeric', precision: 15, scale: 0, isNullable: true }, // ADD_UN_CAPITAL
          { name: '_cdmp_extracted_at', type: 'timestamp', isNullable: false }, // E04 ETL 系統欄位
        ],
      }),
      true,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('ob_arreturndf_min_cap', true);
  }
}
