// 自動產生 by parse-ob-schema.mjs --entity
// 來源：../../reference/TableSchema/OB/OBLEVELCARD_LEVEL.sql
// 對應 migration：apps/api/src/database/migrations/...
// ⚠️ Entity 必須與 migration 保持一致：任一邊改動，另一邊同步修

import { Entity, Column, PrimaryColumn, Index, PrimaryGeneratedColumn } from 'typeorm';
import { dateColumnType, surrogatePkType } from '@/common/database/column-types';

@Entity('ob_levelcard_level')
export class ObLevelcardLevel {
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

  @Column({ name: 'card_type', type: 'varchar', length: 10 })
  card_type: string;

  @Column({ name: 'card_version', type: 'integer' })
  card_version: number;

  @Column({ name: 'score_s', type: 'integer' })
  score_s: number;

  @Column({ name: 'score_e', type: 'integer' })
  score_e: number;

  @Column({ name: 'card_level', type: 'varchar', length: 1 })
  card_level: string;
}
