import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ExtractionTask } from './extraction-task.entity';
import { User } from './user.entity';
import { dateColumnType } from '@/common/database/column-types';

@Entity('extraction_logs')
export class ExtractionLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  task_id: string;

  @ManyToOne(() => ExtractionTask)
  @JoinColumn({ name: 'task_id' })
  task: ExtractionTask;

  @Column({ type: 'varchar', length: 20 })
  status: 'running' | 'completed' | 'failed';

  @Column({ type: dateColumnType })
  started_at: Date;

  @Column({ type: dateColumnType, nullable: true, default: null })
  finished_at: Date | null;

  @Column({ type: 'int', nullable: true, default: null })
  duration_ms: number | null;

  @Column({ type: 'int', default: 0 })
  extracted_count: number;

  @Column({ type: 'int', default: 0 })
  total_count: number;

  @Column({ type: 'text', nullable: true, default: null })
  error_message: string | null;

  @Column({ type: 'varchar', length: 20 })
  triggered_by: 'schedule' | 'manual' | 'retry';

  @Column({ type: 'uuid' })
  created_by: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'created_by' })
  creator: User;

  @CreateDateColumn()
  created_at: Date;
}
