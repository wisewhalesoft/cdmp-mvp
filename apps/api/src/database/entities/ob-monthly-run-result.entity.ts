// 對應 migration: 1711360000292-CreateObMonthlyRunResult.ts
// data-model.md `ob_monthly_run_result`（F094 / AD-E07-25 單源化 Phase A）
// ⚠️ Entity 必須與 migration 保持一致：任一邊改動，另一邊同步修

import {
  Entity,
  Column,
  PrimaryColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

import { dateColumnType } from '@/common/database/column-types';
import { AssignmentRun } from './assignment-run.entity';

/**
 * ob_monthly_run_result — 月跑分派提案結果表（AD-E07-25 單源化核心產出）
 *
 * 承載每次月跑對各名單的 Stage 1~4 分派提案：
 *   - Stage 1 寫入（案件識別 + custo_no / settle_src / assignday）
 *   - Stage 2 計分（score / card_level / tier_level）
 *   - Stage 3 CR 回分（is_cr / cr_id / cr_nm）
 *   - Stage 4 分派（dept_id / emplid / emplid_deptid）
 *
 * 月跑寫入 / Stage 3/4 讀取目標由 ob_pool_data_list（data_source='monthly_run'）切換至本表
 * （F094 AC-2 / AC-3），使 ob_pool_data_list 回歸 ETL 單一來源（F090 v2.0）。
 *
 * 複合 PK：(run_id, list_no, orgno, appl_no)；run_id FK → assignment_run ON DELETE CASCADE
 * （月跑 run 刪除時自動清除對應結果列，F094 AC-6）。
 *
 * 欄位精簡（DP-AD25-2 方案 A）：僅存 Stage 2~4 計算結果，不複製 ob_pool_data 業務欄位
 * （spec_name / year_produ / payt_term 等於計算時由 in-memory ObPoolData[] 取得）。
 */
@Index('idx_omrr_run_id', ['run_id'])
@Index('idx_omrr_list_run', ['list_no', 'run_id'])
@Index('idx_omrr_custo_no', ['custo_no'])
@Index('idx_omrr_assignday', ['assignday'])
@Entity('ob_monthly_run_result')
export class ObMonthlyRunResult {
  // ----- PK：月跑 ID + 名單 + 機構 + 案件申請號 -----
  @PrimaryColumn({ name: 'run_id', type: 'uuid' })
  run_id: string;

  @PrimaryColumn({ name: 'list_no', type: 'varchar', length: 100 })
  list_no: string;

  @PrimaryColumn({ name: 'orgno', type: 'varchar', length: 2 })
  orgno: string;

  @PrimaryColumn({ name: 'appl_no', type: 'varchar', length: 10 })
  appl_no: string;

  // ----- 案件基礎 -----
  @Column({ name: 'custo_no', type: 'varchar', length: 11, nullable: true })
  custo_no: string | null;

  @Column({ name: 'settle_src', type: 'text', default: 'N' })
  settle_src: string;

  // ----- Stage 2 計分結果 -----
  @Column({ name: 'score', type: 'integer', nullable: true })
  score: number | null;

  @Column({ name: 'card_level', type: 'varchar', length: 1, nullable: true })
  card_level: string | null;

  @Column({ name: 'tier_level', type: 'varchar', length: 5, nullable: true })
  tier_level: string | null;

  // ----- Stage 3 CR -----
  @Column({ name: 'is_cr', type: 'varchar', length: 1, nullable: true })
  is_cr: string | null;

  @Column({ name: 'cr_id', type: 'varchar', length: 20, nullable: true })
  cr_id: string | null;

  @Column({ name: 'cr_nm', type: 'varchar', length: 50, nullable: true })
  cr_nm: string | null;

  // F102 / AD-E07-30：CR 失效規則步驟 1（逾2年清空）以名單月 - 2 年比對 appl_date。
  // Stage 1 INSERT…SELECT 由 ob_pool_data_list 帶入（I-CR-COLSRC-01）；CR 步驟只對本工作集 UPDATE，
  // 不讀回 ob_pool_data_list。⚠️ AD §13「不需新增 migration」為疏漏 —— appl_date 原不在 result 表，
  // 本 feature 補建欄位 + migration（見 impl log 偏離 spec/AD 段）。
  // ⚠️ Entity 必須與 migration 1711360000300 保持一致：任一邊改動，另一邊同步修。
  @Column({ name: 'appl_date', type: dateColumnType, nullable: true })
  appl_date: Date | null;

  // ----- Stage 4 分派結果 -----
  @Column({ name: 'dept_id', type: 'varchar', length: 6, nullable: true })
  dept_id: string | null;

  @Column({ name: 'emplid', type: 'varchar', length: 10, nullable: true })
  emplid: string | null;

  @Column({ name: 'emplid_deptid', type: 'varchar', length: 6, nullable: true })
  emplid_deptid: string | null;

  // ----- 業務系統回填狀態（初始 'PENDING'；回填後改 'SUCCESS' / 'FAILED'）-----
  @Column({ name: 'result_status', type: 'varchar', length: 20, nullable: true, default: 'PENDING' })
  result_status: string | null;

  // ----- Forward-compat：業務派案日期（DP-AD25-6）-----
  @Column({ name: 'assignday', type: 'varchar', length: 100, nullable: true })
  assignday: string | null;

  // ----- 稽核 -----
  @Column({ name: 'created_at', type: dateColumnType, default: () => 'CURRENT_TIMESTAMP' })
  created_at: Date;

  @Column({ name: 'updated_at', type: dateColumnType, default: () => 'CURRENT_TIMESTAMP' })
  updated_at: Date;

  // ----- FK → assignment_run.run_id ON DELETE CASCADE -----
  @ManyToOne(() => AssignmentRun, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'run_id', referencedColumnName: 'run_id' })
  run?: AssignmentRun;
}
