import { ConflictException } from '@nestjs/common';
import { In, Repository } from 'typeorm';
import { AssignmentRun } from '@/database/entities/assignment-run.entity';

/**
 * 月名單分派鎖檢查 helper（共用於 F053~F056 計分編輯與 F070~F072 CARD_TYPE CRUD）。
 *
 * 依 OPEN-3 決議（PO 2026-05-14）：同一 DB 條件（assignment_run.status IN ('pending','running')）
 * 但依呼叫端意圖回兩種錯誤碼：
 *   - kind='card-type-crud' → 409 ASSIGNMENT_RUN_ALREADY_RUNNING（F070/F071/F072 spec §5）
 *   - kind='scoring-edit'   → 409 SCORING_VERSION_LOCKED（F053~F056 既有合約，不變更）
 *
 * 此設計讓兩組 spec 各自之錯誤碼合約不互相影響，前端 UI 也能依錯誤碼選擇不同提示訊息。
 */
export type AssignmentLockKind = 'card-type-crud' | 'scoring-edit';

const LOCK_ERROR_MAP: Record<
  AssignmentLockKind,
  { error: string; message: string }
> = {
  'card-type-crud': {
    error: 'ASSIGNMENT_RUN_ALREADY_RUNNING',
    message: '分派執行中，無法修改計分卡類型設定',
  },
  'scoring-edit': {
    error: 'SCORING_VERSION_LOCKED',
    message: '分派執行中，無法修改計分設定',
  },
};

/**
 * 若 `assignment_run` 存在 status='pending' 或 'running' 的紀錄，拋 409。
 *
 * @param runRepo  AssignmentRun repository
 * @param kind     呼叫意圖（決定錯誤碼）
 */
export async function assertNotLocked(
  runRepo: Repository<AssignmentRun>,
  kind: AssignmentLockKind,
): Promise<void> {
  const locked = await runRepo.findOne({
    where: { status: In(['pending', 'running']) as any },
  });
  if (locked) {
    throw new ConflictException(LOCK_ERROR_MAP[kind]);
  }
}
