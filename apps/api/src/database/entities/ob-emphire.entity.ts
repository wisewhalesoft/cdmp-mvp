// 自動產生 by parse-ob-schema.mjs --entity
// 來源：../../reference/TableSchema/OB/OBEMPHIRE.sql
// 對應 migration：apps/api/src/database/migrations/...
// ⚠️ Entity 必須與 migration 保持一致：任一邊改動，另一邊同步修

import { Entity, Column, PrimaryColumn, Index } from 'typeorm';
import { nvarcharColumnType } from '@/common/database/column-types';

@Entity('ob_emphire')
export class ObEmphire {
  @PrimaryColumn({ name: 'emp_id', type: 'varchar', length: 10 })
  emp_id: string;

  @Column({ name: 'emp_nm', type: nvarcharColumnType, length: 50, nullable: true })
  emp_nm: string | null;

  @Column({ name: 'id_no', type: 'varchar', length: 10, nullable: true })
  id_no: string | null; // ID

  @Column({ name: 'dept_code', type: 'varchar', length: 10, nullable: true })
  dept_code: string | null;

  @Column({ name: 'dept_name', type: nvarcharColumnType, length: 30, nullable: true })
  dept_name: string | null;

  @Column({ name: 'title_code', type: 'varchar', length: 5, nullable: true })
  title_code: string | null;

  @Column({ name: 'title_name', type: nvarcharColumnType, length: 30, nullable: true })
  title_name: string | null;

  @Column({ name: 'jfun_id', type: 'varchar', length: 10, nullable: true })
  jfun_id: string | null;

  @Column({ name: 'jfun_nm', type: nvarcharColumnType, length: 15, nullable: true })
  jfun_nm: string | null;

  @Column({ name: 'hire_date', type: 'date', nullable: true })
  hire_date: Date | null;

  @Column({ name: 'resign_date', type: 'date', nullable: true })
  resign_date: Date | null;

  @Column({ name: 'email', type: 'varchar', length: 100, nullable: true })
  email: string | null;

  @Column({ name: 'is_auth', type: 'varchar', length: 1, nullable: true })
  is_auth: string | null;
}
