// 自動產生 by parse-ob-schema.mjs --entity
// 來源：../../reference/TableSchema/OB/OBLEVELCARD_SCORE.sql
// 對應 migration：apps/api/src/database/migrations/...
// ⚠️ Entity 必須與 migration 保持一致：任一邊改動，另一邊同步修

import { Entity, Column, PrimaryColumn, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('ob_levelcard_score')
export class ObLevelcardScore {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ name: 'created_by_prog', type: 'varchar', length: 20, nullable: true })
  created_by_prog: string | null; // A_PRGID

  @Column({ name: 'created_by', type: 'varchar', length: 20, nullable: true })
  created_by: string | null; // A_USERID

  @Column({ name: 'created_at', type: 'timestamp', nullable: true })
  created_at: Date | null; // A_SYSDT

  @Column({ name: 'updated_by_prog', type: 'varchar', length: 20, nullable: true })
  updated_by_prog: string | null; // U_PRGID

  @Column({ name: 'updated_by', type: 'varchar', length: 20, nullable: true })
  updated_by: string | null; // U_USERID

  @Column({ name: 'updated_at', type: 'timestamp', nullable: true })
  updated_at: Date | null; // U_SYSDT

  @Column({ name: 'card_type', type: 'varchar', length: 10 })
  card_type: string;

  @Column({ name: 'card_version', type: 'integer' })
  card_version: number;

  @Column({ name: 'column_name', type: 'varchar', length: 30 })
  column_name: string; // COLUNM

  @Column({ name: 'level1', type: 'char', length: 10, nullable: true })
  level1: string | null;

  @Column({ name: 'level2_s', type: 'varchar', length: 10, nullable: true })
  level2_s: string | null;

  @Column({ name: 'level2_e', type: 'varchar', length: 10, nullable: true })
  level2_e: string | null;

  @Column({ name: 'score', type: 'integer' })
  score: number;
}
