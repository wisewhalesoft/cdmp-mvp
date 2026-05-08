import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { dateColumnType } from '@/common/database/column-types';
import type { UserRole } from '@/common/constants/roles';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100 })
  name: string;

  @Column({ unique: true, length: 255 })
  email: string;

  @Column({ length: 255 })
  password_hash: string;

  @Column({ type: 'varchar', length: 30, default: 'user' })
  role: UserRole;

  @Column({ type: 'varchar', length: 20, default: 'active' })
  status: 'active' | 'disabled';

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @Column({ type: dateColumnType, nullable: true, default: null })
  password_changed_at: Date | null;

  // E07 業務主管旗標（AD-E02-1，OQ-E07-19）
  // Migration: 1711360000130-CreateObAssignConfigSetAndUserFlag.ts
  @Column({ type: 'boolean', default: false })
  is_sales_manager: boolean;
}
