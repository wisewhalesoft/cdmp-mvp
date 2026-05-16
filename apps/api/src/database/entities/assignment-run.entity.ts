// 對應 migration: 1711360000120-CreateE07AssignmentTables.ts
//   + 1711360000190-AddAssignmentRunWarnings (E07 P1 B4 補完，skipped_cases / warning_summary)
// data-model.md §E07 新建表 — assignment_run

import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';
import { dateColumnType, jsonColumnType } from '@/common/database/column-types';

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

  @Column({ name: 'started_at', type: dateColumnType, nullable: true })
  started_at: Date | null;

  @Column({ name: 'finished_at', type: dateColumnType, nullable: true })
  finished_at: Date | null;

  @Column({ name: 'duration_ms', type: 'integer', nullable: true })
  duration_ms: number | null;

  @Column({ name: 'total_cases', type: 'integer', nullable: true })
  total_cases: number | null;

  @Column({ name: 'total_lists', type: 'integer', nullable: true })
  total_lists: number | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  error_message: string | null;

  // F061 v1.2 BR-12：邊緣 CARD_TYPE 跳過案件清單 JSONB
  //   結構：{ cases: [{ cardType, applNoCount, reason }] }
  @Column({ name: 'skipped_cases', type: jsonColumnType, nullable: true })
  skipped_cases: Record<string, unknown> | null;

  // F061 v1.2 BR-12 / AC-7b：警示摘要碼，如 'BR-12_EDGE_CARD_TYPE_SKIPPED'
  @Column({ name: 'warning_summary', type: 'varchar', length: 100, nullable: true })
  warning_summary: string | null;

  @Column({ name: 'created_at', type: dateColumnType, default: () => 'CURRENT_TIMESTAMP' })
  created_at: Date;
}
