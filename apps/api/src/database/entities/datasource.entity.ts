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
import { dateColumnType } from '@/common/database/column-types';

@Entity('datasources')
export class Datasource {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100, unique: true })
  name: string;

  @Column({ type: 'varchar', length: 20 })
  type: 'mysql' | 'postgresql' | 'sqlserver';

  @Column({ length: 255 })
  host: string;

  @Column({ type: 'int' })
  port: number;

  @Column({ length: 100 })
  database_name: string;

  @Column({ length: 100 })
  username: string;

  @Column({ type: 'text' })
  encrypted_password: string;

  @Column({ type: 'varchar', length: 500, nullable: true, default: null })
  description: string | null;

  @Column({ type: 'varchar', length: 20, default: 'unknown' })
  status: string;

  @Column({ type: dateColumnType, nullable: true, default: null })
  last_tested_at: Date | null;

  @Column({ type: 'uuid' })
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
