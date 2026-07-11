// 對應 migration: 1711360000120-CreateE07AssignmentTables.ts
// AD-E07-7：月名單分派 Stage 進度獨立表（取代 JSONB 方案）

import { Entity, PrimaryGeneratedColumn, Column, Index, JoinColumn, ManyToOne } from 'typeorm';
import { AssignmentRun } from './assignment-run.entity';
import {
  dateColumnType,
  uuidColumnType,
  longTextColumnType,
  longTextColumnLength,
} from '@/common/database/column-types';

// Q3：UNIQUE (run_id, stage_no) 防同 stage 重複 INSERT；Stage 重跑改用 UPDATE
@Index('uq_assignment_run_stage_log_run_stage', ['run_id', 'stage_no'], { unique: true })
@Entity('assignment_run_stage_log')
export class AssignmentRunStageLog {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ name: 'run_id', type: uuidColumnType })
  run_id: string;

  @ManyToOne(() => AssignmentRun, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'run_id' })
  run: AssignmentRun;

  @Column({ name: 'stage_no', type: 'smallint' })
  stage_no: number;

  @Column({ name: 'status', type: 'varchar', length: 10 })
  status: 'running' | 'completed' | 'failed';

  // F-1（AD-E07-39 §0）：裸 'timestamp' 於 MSSQL = rowversion（唯讀 8-byte 版本戳記，非日期）→ 必改 dateColumnType。
  @Column({ name: 'started_at', type: dateColumnType })
  started_at: Date;

  @Column({ name: 'finished_at', type: dateColumnType, nullable: true })
  finished_at: Date | null;

  @Column({ name: 'processed_count', type: 'integer', nullable: true })
  processed_count: number | null;

  @Column({ name: 'error_message', type: longTextColumnType, length: longTextColumnLength, nullable: true })
  error_message: string | null;
}
