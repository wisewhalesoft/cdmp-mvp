// 自動產生 by parse-ob-schema.mjs --entity
// 來源：../../reference/TableSchema/OB/OBLEVELCARD_COLUNM.sql
// 對應 migration：apps/api/src/database/migrations/...
// ⚠️ Entity 必須與 migration 保持一致：任一邊改動，另一邊同步修

import { Entity, Column, PrimaryColumn, Index, PrimaryGeneratedColumn } from 'typeorm';
import { dateColumnType, surrogatePkType } from '@/common/database/column-types';
import { MatchType } from '@/modules/assignment-scoring/dto/match-type.enum';

@Entity('ob_levelcard_column')
export class ObLevelcardColumn {
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

  @Column({ name: 'card_type', type: 'varchar', length: 10, nullable: true })
  card_type: string | null;

  @Column({ name: 'card_version', type: 'integer', nullable: true })
  card_version: number | null;

  @Column({ name: 'column_name', type: 'varchar', length: 30, nullable: true })
  column_name: string | null; // COLUNM

  @Column({ name: 'column_label', type: 'varchar', length: 30, nullable: true })
  column_label: string | null; // COLUNM_NAME

  // [遷移補建] 啟用旗標（AD-E07-4）：fn_calc_tier_level WHERE status='active'
  // 過濾無效計分維度（如停用、待測試）；遷移時所有列預設 'active'
  @Column({ name: 'status', type: 'varchar', length: 10, default: 'active' })
  status: string;

  // F054 v1.3 / AD-E07-2 補充（2026-05-18）：計分比對模式
  // 三正式列舉值（CATEGORY / RANGE / COMPOSITE）；對應 fn_calc_tier_level 三分支計分
  // 對應 migration：1711360000250-AddMatchTypeToObLevelcardColumn.ts
  // CHECK constraint：chk_ob_levelcard_column_match_type（SQLite 環境由 entity 端保證）
  @Column({ name: 'match_type', type: 'varchar', length: 20 })
  match_type: MatchType;
}
