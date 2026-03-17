import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Datasource } from './datasource.entity';
import { dateColumnType } from '@/common/database/column-types';

@Entity('datasource_health_logs')
export class DatasourceHealthLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  datasource_id: string;

  @ManyToOne(() => Datasource)
  @JoinColumn({ name: 'datasource_id' })
  datasource: Datasource;

  @Column({ type: 'boolean' })
  success: boolean;

  @Column({ type: 'int', nullable: true, default: null })
  response_time_ms: number | null;

  @Column({ type: 'text', nullable: true, default: null })
  error_message: string | null;

  @Column({ type: dateColumnType })
  checked_at: Date;
}
