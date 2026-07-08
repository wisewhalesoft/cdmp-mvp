/**
 * Bug A 修復（2026-06-04，branch feat/monthly-run-execution-model-refactor）—
 * PG 一律走 Stage 2~4 SQL 下推（AD-E07-28，gate = DB_TYPE）。
 *
 * 背景（app 實測）：原 gate `useStage2to4Pushdown = useV2 && DB_TYPE==='postgres'`。
 *   當 PG 但 ASSIGNMENT_PIPELINE_V2 未設（dev/prod 預設）→ 走壞掉的 v1-PG fallback
 *   `executeV1(stage1Cases)`，但 PG 模式 Stage 1 是 SQL INSERT 寫表、pool re-hydrate 為空
 *   → executeV1 計分 0 筆 → 寫了 55,863 列但 score/tier/emplid 全 NULL、total_cases=0（真迴歸）。
 *
 * 修法（使用者 2026-06-04 拍板）：PG 一律下推（拿掉 `useV2 &&`），gate = `DB_TYPE==='postgres'`。
 *   非 PG（SQLite 測試 / in-memory）維持 `useV2 ? executeV2 : executeV1`。
 *
 * 本 spec 以純函式 `resolveStage2to4Strategy(env)` 驗 gate 決策（無需真 PG）：
 *   - PG + v2 未設 → pushdown（修復前會回 v1Inmemory → 迴歸）
 *   - PG + v2 設 → pushdown（行為不變）
 *   - 非 PG + v2 設 → v2Inmemory（不回歸）
 *   - 非 PG + v2 未設 → v1Inmemory（不回歸）
 */

import { describe, it, expect } from 'vitest';
import { resolveStage2to4Strategy } from '../assignment-run-pipeline.service';

describe('Bug A — resolveStage2to4Strategy（PG 一律下推，gate=DB_TYPE）', () => {
  it('PG + ASSIGNMENT_PIPELINE_V2 未設 → pushdownPg（修復核心：不再落入壞掉的 v1-PG fallback）', () => {
    expect(
      resolveStage2to4Strategy({ DB_TYPE: 'postgres', ASSIGNMENT_PIPELINE_V2: undefined }),
    ).toBe('pushdownPg');
  });

  it('PG + ASSIGNMENT_PIPELINE_V2=true → pushdownPg（行為不變）', () => {
    expect(
      resolveStage2to4Strategy({ DB_TYPE: 'postgres', ASSIGNMENT_PIPELINE_V2: 'true' }),
    ).toBe('pushdownPg');
  });

  it('PG + ASSIGNMENT_PIPELINE_V2=false → pushdownPg（PG flag 已對 PG 無意義）', () => {
    expect(
      resolveStage2to4Strategy({ DB_TYPE: 'postgres', ASSIGNMENT_PIPELINE_V2: 'false' }),
    ).toBe('pushdownPg');
  });

  it('非 PG（sqlite）+ ASSIGNMENT_PIPELINE_V2=true → v2Inmemory（非 PG 仍由 flag 選 v1/v2）', () => {
    expect(
      resolveStage2to4Strategy({ DB_TYPE: 'sqlite', ASSIGNMENT_PIPELINE_V2: 'true' }),
    ).toBe('v2Inmemory');
  });

  it('非 PG（sqlite）+ ASSIGNMENT_PIPELINE_V2 未設 → v1Inmemory（不回歸）', () => {
    expect(
      resolveStage2to4Strategy({ DB_TYPE: 'sqlite', ASSIGNMENT_PIPELINE_V2: undefined }),
    ).toBe('v1Inmemory');
  });

  it('DB_TYPE 未設（視為非 PG）+ v2=true → v2Inmemory', () => {
    expect(
      resolveStage2to4Strategy({ DB_TYPE: undefined, ASSIGNMENT_PIPELINE_V2: 'true' }),
    ).toBe('v2Inmemory');
  });
});
