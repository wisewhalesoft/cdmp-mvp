// 對應 migration: 1711360000120-CreateE07AssignmentTables.ts

import { Entity, PrimaryGeneratedColumn, Column, Index, JoinColumn, ManyToOne } from 'typeorm';
import { AssignmentRun } from './assignment-run.entity';
import { dateColumnType, jsonColumnType } from '@/common/database/column-types';

@Index('idx_assignment_run_snapshot_run_type', ['run_id', 'snapshot_type'])
@Entity('assignment_run_snapshot')
export class AssignmentRunSnapshot {
  @PrimaryGeneratedColumn('uuid')
  snapshot_id: string;

  @Column({ name: 'run_id', type: 'uuid' })
  run_id: string;

  @ManyToOne(() => AssignmentRun, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'run_id' })
  run: AssignmentRun;

  @Column({ name: 'snapshot_type', type: 'varchar', length: 20 })
  snapshot_type: 'config' | 'input_list' | 'result';

  // E07 P1 B4 補完 (2026-05-17)：jsonb → jsonColumnType helper（sqlite 相容）
  @Column({ name: 'payload', type: jsonColumnType })
  payload: Record<string, unknown>;

  // E07 P1 B4 補完 (2026-05-17)：timestamp → dateColumnType helper（sqlite 相容）
  @Column({ name: 'created_at', type: dateColumnType, default: () => 'CURRENT_TIMESTAMP' })
  created_at: Date;
}
