// 自動產生 by parse-ob-schema.mjs --entity
// 來源：../../reference/TableSchema/OB/OBMDEPTPCT.sql
// 對應 migration：apps/api/src/database/migrations/...
// ⚠️ Entity 必須與 migration 保持一致：任一邊改動，另一邊同步修

import { Entity, Column, PrimaryColumn, Index } from 'typeorm';
import { dateColumnType, nvarcharColumnType } from '@/common/database/column-types';

@Entity('ob_dept_pct')
export class ObDeptPct {
  @Column({ name: 'created_by_prog', type: 'varchar', length: 10 })
  created_by_prog: string; // A_PRGID

  @Column({ name: 'created_by', type: 'varchar', length: 50 })
  created_by: string; // A_USERID（length:50 對齊 users.id UUID 36 字元，沿用 bcedc04 ob_list_definition pattern；2026-05-21 hotfix F079 PUT 500）

  // E07 P1 B4 補完 (2026-05-17)：timestamp → dateColumnType helper（sqlite 相容）
  // 依 memory feedback_typeorm_timestamp 規則。
  @Column({ name: 'created_at', type: dateColumnType })
  created_at: Date; // A_SYSDT

  @Column({ name: 'updated_by_prog', type: 'varchar', length: 10 })
  updated_by_prog: string; // U_PRGID

  @Column({ name: 'updated_by', type: 'varchar', length: 50 })
  updated_by: string; // U_USERID（length:50 對齊 users.id UUID 36 字元；2026-05-21 hotfix）

  @Column({ name: 'updated_at', type: dateColumnType })
  updated_at: Date; // U_SYSDT

  @PrimaryColumn({ name: 'project_workym', type: 'varchar', length: 6 })
  project_workym: string;

  @PrimaryColumn({ name: 'list_no', type: 'varchar', length: 11 })
  list_no: string;

  @PrimaryColumn({ name: 'obdeptid', type: 'varchar', length: 6 })
  obdeptid: string;

  @Column({ name: 'obdeptnm', type: nvarcharColumnType, length: 10 })
  obdeptnm: string;

  // scale 1→2 對齊 spec F079 BR-2 之「容忍 ±0.01% 雙小數精度」與 FE RatioInput step=0.01
  // （與 ob_empl_set 同步；2026-05-25 hotfix）
  @PrimaryColumn({ name: 'ration', type: 'numeric', precision: 9, scale: 2 })
  ration: string;
}
