// 自動產生 by parse-ob-schema.mjs --entity
// 來源：../../reference/TableSchema/OB/OBLEVELCARD_VERSION.sql
// 對應 migration：apps/api/src/database/migrations/...
// ⚠️ Entity 必須與 migration 保持一致：任一邊改動，另一邊同步修

import { Entity, Column, PrimaryColumn, Index, PrimaryGeneratedColumn } from 'typeorm';
import { dateColumnType, surrogatePkType } from '@/common/database/column-types';

@Entity('ob_levelcard_version')
export class ObLevelcardVersion {
  // surrogate PK（原表無嚴格 PK，邏輯主鍵 (card_type, card_version) 可能含 NULL）
  @PrimaryGeneratedColumn({ type: surrogatePkType })
  id: string;

  @Column({ name: 'created_by_prog', type: 'varchar', length: 20, nullable: true })
  created_by_prog: string | null; // A_PRGID

  @Column({ name: 'created_by', type: 'varchar', length: 20, nullable: true })
  created_by: string | null; // A_USERID

  @Column({ name: 'created_at', type: dateColumnType, nullable: true })
  created_at: Date | null; // A_SYSDT

  @Column({ name: 'updated_by_prog', type: 'varchar', length: 20, nullable: true })
  updated_by_prog: string | null; // U_PRGID

  @Column({ name: 'updated_by', type: 'varchar', length: 20, nullable: true })
  updated_by: string | null; // U_USERID

  @Column({ name: 'updated_at', type: dateColumnType, nullable: true })
  updated_at: Date | null; // U_SYSDT

  @Column({ name: 'card_type', type: 'text', nullable: true })
  card_type: string | null;

  @Column({ name: 'card_name', type: 'varchar', length: 20, nullable: true })
  card_name: string | null;

  @Column({ name: 'card_version', type: 'integer', nullable: true })
  card_version: number | null;

  // 與 migration 一致：sdate / edate 改 NOT NULL（dump 觀察 6 筆全部有值）
  @Column({ name: 'sdate', type: 'varchar', length: 8 })
  sdate: string;

  @Column({ name: 'edate', type: 'varchar', length: 8 })
  edate: string;

  // E07 計分版本啟用旗標（migration M1 補建，依 SDATE/EDATE 計算初值）
  @Column({ name: 'status', type: 'varchar', length: 10, default: 'active' })
  status: string;
}
