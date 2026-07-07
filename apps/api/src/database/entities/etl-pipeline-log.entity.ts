import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { EtlPipeline } from './etl-pipeline.entity';
import { User } from './user.entity';
import {
  dateColumnType,
  uuidColumnType,
  boolColumnType,
  longTextColumnType,
  longTextColumnLength,
} from '@/common/database/column-types';

@Entity('etl_pipeline_logs')
export class EtlPipelineLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: uuidColumnType })
  pipeline_id: string;

  @ManyToOne(() => EtlPipeline)
  @JoinColumn({ name: 'pipeline_id' })
  pipeline: EtlPipeline;

  @Column({ type: 'int' })
  version: number;

  @Column({ type: 'varchar', length: 20 })
  status: 'running' | 'completed' | 'failed';

  @Column({ type: dateColumnType })
  started_at: Date;

  @Column({ type: dateColumnType, nullable: true, default: null })
  finished_at: Date | null;

  @Column({ type: 'int', nullable: true, default: null })
  duration_ms: number | null;

  @Column({ type: 'int', default: 0 })
  processed_count: number;

  @Column({ type: longTextColumnType, length: longTextColumnLength, nullable: true, default: null })
  error_message: string | null;

  @Column({ type: longTextColumnType, length: longTextColumnLength, nullable: true, default: null })
  node_logs: string | null;

  @Column({ type: 'varchar', length: 20 })
  triggered_by: 'schedule' | 'manual' | 'test' | 'retry';

  @Column({ type: boolColumnType, default: false })
  is_test_run: boolean;

  @Column({ type: uuidColumnType })
  created_by: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'created_by' })
  creator: User;

  @CreateDateColumn()
  created_at: Date;
}
