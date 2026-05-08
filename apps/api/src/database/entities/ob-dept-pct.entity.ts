// 自動產生 by parse-ob-schema.mjs --entity
// 來源：../../reference/TableSchema/OB/OBMDEPTPCT.sql
// 對應 migration：apps/api/src/database/migrations/...
// ⚠️ Entity 必須與 migration 保持一致：任一邊改動，另一邊同步修

import { Entity, Column, PrimaryColumn, Index } from 'typeorm';

@Entity('ob_dept_pct')
export class ObDeptPct {
  @Column({ name: 'created_by_prog', type: 'varchar', length: 10 })
  created_by_prog: string; // A_PRGID

  @Column({ name: 'created_by', type: 'varchar', length: 10 })
  created_by: string; // A_USERID

  @Column({ name: 'created_at', type: 'timestamp' })
  created_at: Date; // A_SYSDT

  @Column({ name: 'updated_by_prog', type: 'varchar', length: 10 })
  updated_by_prog: string; // U_PRGID

  @Column({ name: 'updated_by', type: 'varchar', length: 10 })
  updated_by: string; // U_USERID

  @Column({ name: 'updated_at', type: 'timestamp' })
  updated_at: Date; // U_SYSDT

  @PrimaryColumn({ name: 'project_workym', type: 'varchar', length: 6 })
  project_workym: string;

  @PrimaryColumn({ name: 'list_no', type: 'varchar', length: 11 })
  list_no: string;

  @PrimaryColumn({ name: 'obdeptid', type: 'varchar', length: 6 })
  obdeptid: string;

  @Column({ name: 'obdeptnm', type: 'varchar', length: 10 })
  obdeptnm: string;

  @PrimaryColumn({ name: 'ration', type: 'numeric', precision: 9, scale: 1 })
  ration: string;
}
