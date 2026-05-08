// 自動產生 by parse-ob-schema.mjs --entity
// 來源：../../reference/TableSchema/OB/OBEMPLSETMF.sql
// 對應 migration：apps/api/src/database/migrations/...
// ⚠️ Entity 必須與 migration 保持一致：任一邊改動，另一邊同步修

import { Entity, Column, PrimaryColumn, Index } from 'typeorm';

@Entity('ob_empl_set')
export class ObEmplSet {
  @Column({ name: 'created_by_prog', type: 'varchar', length: 10, nullable: true })
  created_by_prog: string | null; // A_PRGID

  @Column({ name: 'created_by', type: 'varchar', length: 10, nullable: true })
  created_by: string | null; // A_USERID

  @Column({ name: 'created_at', type: 'timestamp', nullable: true })
  created_at: Date | null; // A_SYSDT

  @Column({ name: 'updated_by_prog', type: 'varchar', length: 10, nullable: true })
  updated_by_prog: string | null; // U_PRGID

  @Column({ name: 'updated_by', type: 'varchar', length: 10, nullable: true })
  updated_by: string | null; // U_USERID

  @Column({ name: 'updated_at', type: 'timestamp', nullable: true })
  updated_at: Date | null; // U_SYSDT

  @PrimaryColumn({ name: 'list_no', type: 'varchar', length: 11 })
  list_no: string;

  @PrimaryColumn({ name: 'deptid_m', type: 'varchar', length: 50 })
  deptid_m: string;

  @PrimaryColumn({ name: 'emplid', type: 'varchar', length: 6 })
  emplid: string;

  @PrimaryColumn({ name: 'ration', type: 'numeric', precision: 10, scale: 1 })
  ration: string;

  @Column({ name: 'prod_type', type: 'varchar', length: 255, nullable: true })
  prod_type: string | null;
}
