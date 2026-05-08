// 自動產生 by parse-ob-schema.mjs --entity
// 來源：../../reference/TableSchema/OB/OBMLISTDF.sql
// 對應 migration：apps/api/src/database/migrations/...
// ⚠️ Entity 必須與 migration 保持一致：任一邊改動，另一邊同步修

import { Entity, Column, PrimaryColumn, Index } from 'typeorm';

@Entity('ob_list_definition')
export class ObListDefinition {
  @Column({ name: 'created_by_prog', type: 'varchar', length: 20 })
  created_by_prog: string; // A_PRGID

  @Column({ name: 'created_by', type: 'varchar', length: 20 })
  created_by: string; // A_USERID

  @Column({ name: 'created_at', type: 'timestamp' })
  created_at: Date; // A_SYSDT

  @Column({ name: 'updated_by_prog', type: 'varchar', length: 20 })
  updated_by_prog: string; // U_PRGID

  @Column({ name: 'updated_by', type: 'varchar', length: 20 })
  updated_by: string; // U_USERID

  @Column({ name: 'updated_at', type: 'timestamp' })
  updated_at: Date; // U_SYSDT

  @PrimaryColumn({ name: 'list_no', type: 'varchar', length: 11 })
  list_no: string;

  @Column({ name: 'list_nm', type: 'varchar', length: 45 })
  list_nm: string;

  @Column({ name: 'prod_kind', type: 'varchar', length: 255 })
  prod_kind: string;

  @Column({ name: 'prod_best', type: 'varchar', length: 5 })
  prod_best: string;

  @Column({ name: 'spec_tp', type: 'varchar', length: 255, nullable: true })
  spec_tp: string | null;

  @Column({ name: 'list_type', type: 'varchar', length: 255 })
  list_type: string;

  @Column({ name: 'list_period_start', type: 'varchar', length: 3 })
  list_period_start: string;

  @Column({ name: 'list_period_end', type: 'varchar', length: 3 })
  list_period_end: string;

  @Column({ name: 'list_interval', type: 'varchar', length: 3 })
  list_interval: string;

  @Column({ name: 'assigned_date', type: 'timestamp', nullable: true })
  assigned_date: Date | null;

  @Column({ name: 'total_amount', type: 'integer', nullable: true })
  total_amount: number | null;

  @Column({ name: 'reserved_amount', type: 'integer', nullable: true })
  reserved_amount: number | null;

  @Column({ name: 'is_assigned', type: 'varchar', length: 1, nullable: true })
  is_assigned: string | null;

  @Column({ name: 'project_workym', type: 'varchar', length: 6, nullable: true })
  project_workym: string | null;

  @Column({ name: 'casenumber', type: 'varchar', length: 50, nullable: true })
  casenumber: string | null;

  @Column({ name: 'name', type: 'varchar', length: 50, nullable: true })
  name: string | null;

  @Column({ name: 'caseyear', type: 'varchar', length: 255, nullable: true })
  caseyear: string | null;

  @Column({ name: 'caseyearnm', type: 'varchar', length: 10, nullable: true })
  caseyearnm: string | null;

  @Column({ name: 'settle_src', type: 'varchar', length: 6, nullable: true })
  settle_src: string | null;

  @Column({ name: 'card_type', type: 'varchar', length: 2, nullable: true })
  card_type: string | null;

  // E07 名單啟用旗標（migration M1 補建）
  @Column({ name: 'status', type: 'varchar', length: 10, default: 'active' })
  status: string;
}
