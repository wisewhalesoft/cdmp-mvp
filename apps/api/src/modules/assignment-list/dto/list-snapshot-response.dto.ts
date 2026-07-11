/**
 * F050 v2.2 §6.2 / US-131 — Detail Snapshot Response DTO
 *
 * GET /api/v1/assignment/list-definitions/:listNo/full-snapshot
 *
 * 4 個 section：
 *   - list：名單基本資料 + condition_payload（含 LEGACY 名單 legacyEntityFallback）
 *   - deptRatios：各部門配比（draft 階段為空陣列）
 *   - personnelRatios：業務員配比依部門 group（draft/dept_ratio 階段為空陣列；
 *                     section_chief 呼叫時僅含本轄區 deptCode）
 *   - auditTrail：完整 timeline（依 assignment_audit_log.created_at ASC）
 *
 * Stage-aware null state 由 service 層依 stage + 實際資料填入空陣列。
 * 本端點為唯讀，不攔截 LIST_HISTORICAL_READONLY / ASSIGNMENT_RUN_ALREADY_RUNNING。
 */

import type { ObListDefinitionConditionPayload } from '@/database/entities/ob-list-definition.entity';
import type { AppliedSpecialRule } from '@/modules/assignment/stage1/special-rules';

export type { AppliedSpecialRule };

/**
 * LEGACY 名單 fallback —— 僅當 condition_payload IS NULL 時非 null，
 * 含 5 個 backward-compat entity column 值（原始 `$$` 分隔字串，由前端解析顯示）。
 */
export interface LegacyEntityFallback {
  prodKind: string | null;
  caseyear: string | null;
  specTp: string | null;
  caseStatus: string | null;
  settleSrc: string | null;
}

export interface SnapshotListSection {
  listNo: string;
  listNm: string;
  stage: 'draft' | 'dept_ratio' | 'personnel_ratio' | 'approval' | 'ready';
  status: 'active' | 'inactive';
  projectWorkym: string | null;
  cardType: string | null;
  crEnabled: boolean;
  listPeriodStart: string | null;
  listPeriodEnd: string | null;
  listInterval: string | null;
  conditionPayload: ObListDefinitionConditionPayload | null;
  /** condition_payload IS NULL 時非 null */
  legacyEntityFallback: LegacyEntityFallback | null;
  createdBy: string | null;
  createdAt: Date | string | null;
  updatedAt: Date | string | null;
}

export interface SnapshotDeptRatio {
  deptCode: string;
  deptName: string | null;
  ration: number;
}

export interface SnapshotPersonnelRatioMember {
  emplid: string;
  empNm: string | null;
  ration: number;
}

export interface SnapshotPersonnelRatio {
  deptCode: string;
  deptName: string | null;
  members: SnapshotPersonnelRatioMember[];
}

export interface SnapshotAuditTrailItem {
  action: string;
  operatorId: string;
  operatorEmpNm: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  at: Date | string;
}

export interface ListSnapshotResponse {
  list: SnapshotListSection;
  deptRatios: SnapshotDeptRatio[];
  personnelRatios: SnapshotPersonnelRatio[];
  auditTrail: SnapshotAuditTrailItem[];
  /**
   * F095 / AD-E07-26 §26.5：本名單本次月名單分派套用之系統特例排除規則（唯讀，read-time 推導）。
   * 由 Service 層依 list_nm 即時推導（無新 DB 欄位），與 F091 月名單分派 trigger 共用同一 pure utility。
   * 至少含 R-FRAUD-WHITEBOARD（無條件），不為空陣列（F095 AC-5）。
   */
  appliedSpecialRules: AppliedSpecialRule[];
}
