import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';
import {
  dateColumnType,
  uuidColumnType,
  boolColumnType,
  longTextColumnType,
  longTextColumnLength,
} from '@/common/database/column-types';

@Entity('etl_pipelines')
export class EtlPipeline {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: longTextColumnType, length: longTextColumnLength, nullable: true, default: null })
  description: string | null;

  @Column({ type: 'int', default: 1 })
  version: number;

  @Column({ type: 'int', default: 0 })
  step_count: number;

  @Column({ type: 'varchar', length: 20, default: 'draft' })
  status: 'draft' | 'active' | 'running' | 'failed' | 'disabled';

  @Column({ type: 'varchar', length: 100, nullable: true, default: null })
  schedule: string | null;

  @Column({ type: dateColumnType, nullable: true, default: null })
  last_execution_at: Date | null;

  @Column({ type: dateColumnType, nullable: true, default: null })
  next_execution_at: Date | null;

  @Column({ type: 'int', default: 0 })
  processed_count: number;

  @Column({ type: 'int', default: 0 })
  avg_duration_ms: number;

  @Column({ type: 'int', default: 0 })
  execution_count: number;

  @Column({ type: boolColumnType, default: false })
  enabled: boolean;

  @Column({ type: uuidColumnType })
  created_by: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'created_by' })
  creator: User;

  @Column({ type: dateColumnType, nullable: true, default: null })
  deleted_at: Date | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
