import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Datasource } from './datasource.entity';
import {
  dateColumnType,
  uuidColumnType,
  boolColumnType,
  longTextColumnType,
  longTextColumnLength,
} from '@/common/database/column-types';

@Entity('datasource_health_logs')
export class DatasourceHealthLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: uuidColumnType })
  datasource_id: string;

  @ManyToOne(() => Datasource)
  @JoinColumn({ name: 'datasource_id' })
  datasource: Datasource;

  @Column({ type: boolColumnType })
  success: boolean;

  @Column({ type: 'int', nullable: true, default: null })
  response_time_ms: number | null;

  @Column({ type: longTextColumnType, length: longTextColumnLength, nullable: true, default: null })
  error_message: string | null;

  @Column({ type: dateColumnType })
  checked_at: Date;
}
