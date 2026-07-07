// 對應 migration: 1711360000230-CreateAssignmentApproval.ts
// F087 v1.1 BR-11 / F082 v1.1 §7.x latestRejection 觸發機制資料表
// ⚠️ Entity 必須與 migration 保持一致：任一邊改動，另一邊同步修

import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';
import { dateColumnType, uuidColumnType } from '@/common/database/column-types';

/**
 * assignment_approval — 名單簽核紀錄（每次 approve / reject 寫入一筆）
 *
 * 用途：
 *   - F087：reject 寫入 action='reject' + reject_reason
 *   - F086：approve 寫入 action='approve'（本批先建表，F086 後續接寫入）
 *   - F082 GET：查最新一筆 action='reject' 回填 latestRejection 欄位
 *
 * 設計（F087 §A-3 假設）：保留所有歷史紀錄（不清空），banner 由 F082 GET response 控制
 */
@Index('idx_assignment_approval_list_approved', ['list_no', 'approved_at'])
@Index('idx_assignment_approval_list_action', ['list_no', 'action'])
@Entity('assignment_approval')
export class AssignmentApproval {
  @PrimaryGeneratedColumn('uuid')
  approval_id: string;

  @Column({ name: 'list_no', type: 'varchar', length: 11 })
  list_no: string;

  @Column({ name: 'action', type: 'varchar', length: 10 })
  action: 'approve' | 'reject';

  @Column({ name: 'reject_reason', type: 'varchar', length: 500, nullable: true })
  reject_reason: string | null;

  @Column({ name: 'approver_id', type: uuidColumnType })
  approver_id: string;

  @Column({ name: 'approver_name', type: 'varchar', length: 100, nullable: true })
  approver_name: string | null;

  @Column({ name: 'approver_role', type: 'varchar', length: 20, nullable: true })
  approver_role: string | null;

  @Column({ name: 'approved_at', type: dateColumnType, default: () => 'CURRENT_TIMESTAMP' })
  approved_at: Date;

  @Column({ name: 'created_at', type: dateColumnType, default: () => 'CURRENT_TIMESTAMP' })
  created_at: Date;
}
