import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { dateColumnType, boolColumnType } from '@/common/database/column-types';
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
  // ⚠️ DEPRECATED v2.11（m14 / 2026-05-16）：由 business_role 取代；待所有 callsite 改用 business_role 後移除欄位
  @Column({ type: boolColumnType, default: false })
  is_sales_manager: boolean;

  // E07 業務角色（AD-E07 v3.0 / m14 / 2026-05-16 新增）
  // 允許值：NULL / 'director' / 'section_chief'（DB CHECK constraint by m14）
  // - 'director' → 業務部長身份（E07 全模組 RW）
  // - 'section_chief' → 業務處長身份（限轄區 RW；M02 完全不可見）
  // - NULL → user 帳號 = 無 E07 角色；admin 帳號 = 自動繼承部長全範圍
  // 變更入口唯一：F006a PATCH /api/v1/accounts/:id/business-role（Admin only）
  @Column({ type: 'varchar', length: 20, nullable: true, default: null })
  business_role: 'director' | 'section_chief' | null;
}
