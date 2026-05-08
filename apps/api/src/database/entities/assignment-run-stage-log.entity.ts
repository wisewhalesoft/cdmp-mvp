// 對應 migration: 1711360000120-CreateE07AssignmentTables.ts
// AD-E07-7：月跑 Stage 進度獨立表（取代 JSONB 方案）

import { Entity, PrimaryGeneratedColumn, Column, Index, JoinColumn, ManyToOne } from 'typeorm';
import { AssignmentRun } from './assignment-run.entity';

@Index('idx_assignment_run_stage_log_run_stage', ['run_id', 'stage_no'])
@Entity('assignment_run_stage_log')
export class AssignmentRunStageLog {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ name: 'run_id', type: 'uuid' })
  run_id: string;

  @ManyToOne(() => AssignmentRun, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'run_id' })
  run: AssignmentRun;

  @Column({ name: 'stage_no', type: 'smallint' })
  stage_no: number;

  @Column({ name: 'status', type: 'varchar', length: 10 })
  status: 'running' | 'completed' | 'failed';

  @Column({ name: 'started_at', type: 'timestamp' })
  started_at: Date;

  @Column({ name: 'finished_at', type: 'timestamp', nullable: true })
  finished_at: Date | null;

  @Column({ name: 'processed_count', type: 'integer', nullable: true })
  processed_count: number | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  error_message: string | null;
}
