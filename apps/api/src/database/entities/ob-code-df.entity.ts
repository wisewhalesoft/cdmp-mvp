// 自動產生 by parse-ob-schema.mjs --entity
// 來源：../../reference/TableSchema/OB/OBMCODEDF.sql
// 對應 migration：apps/api/src/database/migrations/...
// ⚠️ Entity 必須與 migration 保持一致：任一邊改動，另一邊同步修

import { Entity, Column, PrimaryColumn, Index } from 'typeorm';
import { dateColumnType } from '@/common/database/column-types';

@Entity('ob_code_df')
export class ObCodeDf {
  // composite PK（原表 UNIQUE INDEX，dev 用 entity 必須 PK）
  @PrimaryColumn({ name: 'system_id', type: 'varchar', length: 4 })
  system_id: string;

  // F068 / AD-E07-14：tbl_id 由 VARCHAR(2) 擴充為 VARCHAR(11) 以容納英文常數
  // （PROD_KIND / SPEC_TP / CASE_STATUS，最長 11 字元）。
  // 對應 migration 1711360000150-ExtendObCodeDfTblIdToVarchar11.ts
  @PrimaryColumn({ name: 'tbl_id', type: 'varchar', length: 11 })
  tbl_id: string;

  @PrimaryColumn({ name: 'tbl_cd', type: 'varchar', length: 4 })
  tbl_cd: string;

  @Column({ name: 'tbl_desc1', type: 'varchar', length: 40, nullable: true })
  tbl_desc1: string | null;

  @Column({ name: 'tbl_desc2', type: 'varchar', length: 40, nullable: true })
  tbl_desc2: string | null;

  @Column({ name: 'tbl_val1', type: 'numeric', precision: 12, scale: 0, nullable: true })
  tbl_val1: string | null;

  // F068 / E2E sqlite 相容：採 dateColumnType（postgres=timestamp / sqlite=datetime）
  @Column({ name: 'tbl_val2', type: dateColumnType, nullable: true })
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
