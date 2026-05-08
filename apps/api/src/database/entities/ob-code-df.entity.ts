// 自動產生 by parse-ob-schema.mjs --entity
// 來源：../../reference/TableSchema/OB/OBMCODEDF.sql
// 對應 migration：apps/api/src/database/migrations/...
// ⚠️ Entity 必須與 migration 保持一致：任一邊改動，另一邊同步修

import { Entity, Column, PrimaryColumn, Index } from 'typeorm';

@Entity('ob_code_df')
export class ObCodeDf {
  // composite PK（原表 UNIQUE INDEX，dev 用 entity 必須 PK）
  @PrimaryColumn({ name: 'system_id', type: 'varchar', length: 4 })
  system_id: string;

  @PrimaryColumn({ name: 'tbl_id', type: 'varchar', length: 2 })
  tbl_id: string;

  @PrimaryColumn({ name: 'tbl_cd', type: 'varchar', length: 4 })
  tbl_cd: string;

  @Column({ name: 'tbl_desc1', type: 'varchar', length: 40, nullable: true })
  tbl_desc1: string | null;

  @Column({ name: 'tbl_desc2', type: 'varchar', length: 40, nullable: true })
  tbl_desc2: string | null;

  @Column({ name: 'tbl_val1', type: 'numeric', precision: 12, scale: 0, nullable: true })
  tbl_val1: string | null;

  @Column({ name: 'tbl_val2', type: 'timestamp', nullable: true })
  tbl_val2: Date | null;

  @Column({ name: 'tbl_val3', type: 'varchar', length: 40, nullable: true })
  tbl_val3: string | null;

  @Column({ name: 'tbl_val4', type: 'varchar', length: 40, nullable: true })
  tbl_val4: string | null;

  @Column({ name: 'tbl_val5', type: 'varchar', length: 40, nullable: true })
  tbl_val5: string | null;

  @Column({ name: 'tbl_val6', type: 'varchar', length: 80, nullable: true })
  tbl_val6: string | null;

  @Column({ name: 'tbl_val7', type: 'varchar', length: 80, nullable: true })
  tbl_val7: string | null;

  @Column({ name: 'tbl_val8', type: 'varchar', length: 80, nullable: true })
  tbl_val8: string | null;

  @Column({ name: 'stadt', type: 'varchar', length: 8, nullable: true })
  stadt: string | null;

  @Column({ name: 'enddt', type: 'varchar', length: 8, nullable: true })
  enddt: string | null;
}
