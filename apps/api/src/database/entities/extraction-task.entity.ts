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
import { Datasource } from './datasource.entity';
import {
  dateColumnType,
  uuidColumnType,
  boolColumnType,
  longTextColumnType,
  longTextColumnLength,
} from '@/common/database/column-types';

@Entity('extraction_tasks')
export class ExtractionTask {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: uuidColumnType })
  datasource_id: string;

  @ManyToOne(() => Datasource)
  @JoinColumn({ name: 'datasource_id' })
  datasource: Datasource;

  @Column({ type: 'varchar', length: 20 })
  mode: 'full' | 'incremental';

  @Column({ type: 'varchar', length: 20, default: 'scheduled' })
  status: 'running' | 'scheduled' | 'completed' | 'failed' | 'disabled';

  @Column({ type: 'varchar', length: 255 })
  source_table: string;

  @Column({ type: 'varchar', length: 255, nullable: true, default: null })
  source_schema: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true, default: null })
  raw_table_name: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true, default: null })
  incremental_column: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true, default: null })
  last_incremental_value: string | null;

  @Column({ type: 'varchar', length: 100 })
  schedule: string;

  @Column({ type: dateColumnType, nullable: true, default: null })
  last_execution_at: Date | null;

  @Column({ type: 'int', default: 0 })
  extracted_count: number;

  @Column({ type: 'int', default: 0 })
  total_count: number;

  @Column({ type: 'float', default: 0 })
  progress_percent: number;

  @Column({ type: 'int', default: 0 })
  avg_duration_ms: number;

  @Column({ type: 'int', default: 0 })
  execution_count: number;

  @Column({ type: longTextColumnType, length: longTextColumnLength, nullable: true, default: null })
  error_message: string | null;

  @Column({ type: boolColumnType, default: true })
  enabled: boolean;

  @Column({ type: uuidColumnType })
  created_by: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'created_by' })
  creator: User;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @Column({ type: dateColumnType, nullable: true, default: null })
  deleted_at: Date | null;
}
