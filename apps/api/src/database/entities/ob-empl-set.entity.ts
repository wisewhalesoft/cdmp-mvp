// 自動產生 by parse-ob-schema.mjs --entity
// 來源：../../reference/TableSchema/OB/OBEMPLSETMF.sql
// 對應 migration：apps/api/src/database/migrations/...
// ⚠️ Entity 必須與 migration 保持一致：任一邊改動，另一邊同步修

import { Entity, Column, PrimaryColumn, Index } from 'typeorm';
import { dateColumnType } from '@/common/database/column-types';

@Entity('ob_empl_set')
export class ObEmplSet {
  @Column({ name: 'created_by_prog', type: 'varchar', length: 10, nullable: true })
  created_by_prog: string | null; // A_PRGID

  @Column({ name: 'created_by', type: 'varchar', length: 50, nullable: true })
  created_by: string | null; // A_USERID（length:50 對齊 users.id UUID 36 字元，沿用 bcedc04 ob_list_definition pattern；2026-05-21 hotfix F082 PUT）

  // P1 B1 / AD-E07-17 議題 3 / 2026-05-16：改用 dateColumnType helper（postgres=timestamp / sqlite=datetime）
  // 對應 memory feedback_typeorm_timestamp 規則
  @Column({ name: 'created_at', type: dateColumnType, nullable: true })
  created_at: Date | null; // A_SYSDT

  @Column({ name: 'updated_by_prog', type: 'varchar', length: 10, nullable: true })
  updated_by_prog: string | null; // U_PRGID

  @Column({ name: 'updated_by', type: 'varchar', length: 50, nullable: true })
  updated_by: string | null; // U_USERID（length:50 對齊 users.id UUID 36 字元；2026-05-21 hotfix）

  @Column({ name: 'updated_at', type: dateColumnType, nullable: true })
  updated_at: Date | null; // U_SYSDT

  @PrimaryColumn({ name: 'list_no', type: 'varchar', length: 11 })
  list_no: string;

  @PrimaryColumn({ name: 'deptid_m', type: 'varchar', length: 50 })
  deptid_m: string;

  @PrimaryColumn({ name: 'emplid', type: 'varchar', length: 6 })
  emplid: string;

  // scale 1→2 對齊 spec F082 BR-2 之「容忍 ±0.01% 雙小數精度」與 FE RatioInput step=0.01；
  // 原 scale=1 會把 4.55 round 至 4.6 → 22 員工均等分配 sum = 21×4.6 + 4.5 = 101.1 ≠ 100
  // → sumValidated=false → UI 顯示「待儲存」（2026-05-25 hotfix）
  @PrimaryColumn({ name: 'ration', type: 'numeric', precision: 10, scale: 2 })
  ration: string;

  @Column({ name: 'prod_type', type: 'varchar', length: 255, nullable: true })
  prod_type: string | null;
}
