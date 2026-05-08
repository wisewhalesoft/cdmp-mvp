// 對應 migration: 1711360000120-CreateE07AssignmentTables.ts
// data-model.md §E07 新建表 — assignment_run

import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Index('idx_assignment_run_workym_status', ['project_workym', 'status'])
@Entity('assignment_run')
export class AssignmentRun {
  @PrimaryGeneratedColumn('uuid')
  run_id: string;

  @Column({ name: 'project_workym', type: 'varchar', length: 6 })
  project_workym: string;

  @Column({ name: 'status', type: 'varchar', length: 20 })
  status: 'pending' | 'running' | 'completed' | 'failed';

  @Column({ name: 'triggered_by', type: 'uuid' })
  triggered_by: string;

  @Column({ name: 'started_at', type: 'timestamp', nullable: true })
  started_at: Date | null;

  @Column({ name: 'finished_at', type: 'timestamp', nullable: true })
  finished_at: Date | null;

  @Column({ name: 'duration_ms', type: 'integer', nullable: true })
  duration_ms: number | null;

  @Column({ name: 'total_cases', type: 'integer', nullable: true })
  total_cases: number | null;

  @Column({ name: 'total_lists', type: 'integer', nullable: true })
  total_lists: number | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  error_message: string | null;

  @Column({ name: 'created_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  created_at: Date;
}
