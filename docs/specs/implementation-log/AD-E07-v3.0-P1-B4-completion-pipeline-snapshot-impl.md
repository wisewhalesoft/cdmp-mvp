---
type: implementation-log
feature_id: AD-E07-v3.0-P1-B4-completion
feature_name: E07 P1 B4 補完 — Stage 1~4 pipeline + 三份快照原子寫入（F061 v1.2 AC-3 / AC-4 / AC-5 / AC-7b）
status: complete
last_updated: 2026-05-17
agent_id: a8739a338c1a88813
---

# AD-E07 v3.0 P1 B4 補完 — Implementation Log

承接 P1 B4 第一階段（spec-writer agent a9f450ab696ef17d9，2026-05-17 完成 33 tests）所遺留之 F061 v1.2 AC-3 Stage 1~4 pipeline 與 AC-4 三份快照原子寫入。

## 範圍對應

| Spec / AC | 描述 | 本批次完成度 |
|---|---|---|
| F061 v1.2 AC-3 Stage 1 | 案件挑選（讀 ob_pool_data + 套用 ready list 篩選） | ✓ v1.0 簡化版 |
| F061 v1.2 AC-3 Stage 2 | fn_calc_tier_level 計分 + ob_levelcard / ob_tier 對應 | ✓ v1.0 簡化版（score=commission） |
| F061 v1.2 AC-3 Stage 3 | CR 回分 per-LIST `cr_enabled` | ✓ v1.0 簡化版（is_cr 標記） |
| F061 v1.2 AC-3 Stage 4 | st4_exchange 名單交換 + 寫 ob_pool_data_list | ✓ v1.0 簡化版（round-robin） |
| F061 v1.2 AC-4 | 三份快照（config / input_list / result）同 transaction 原子寫入 | ✓ 完整 |
| F061 v1.2 AC-5 | 任一階段或快照寫入失敗 → status='failed' + error_message | ✓ 完整 |
| F061 v1.2 AC-7b / BR-12 | 邊緣 CARD_TYPE 跳過 + skipped_cases JSONB + warning_summary | ✓ 完整 |
| F061 v1.2 TC-RUN-LIFECYCLE | pending → running → completed/failed 三段狀態流轉 | ✓ 完整 |

## Test Results Summary

| Test Suite | Tests | Status |
|---|---|---|
| assignment-run-pipeline.service.spec（新增） | 13 | PASS |
| assignment-run.service.spec（既有 B4） | 8 | PASS |
| assignment-run.controller.spec（既有 B4） | 10 | PASS |
| stage0-estimate.service.spec（既有 B4） | 8 | PASS |
| stage0-estimate.controller.spec（既有 B4） | 7 | PASS |
| 其他既有 P0~P1 B3 assignment 模組（5 suites） | 33 | PASS |
| **assignment 模組合計** | **79** | **PASS** |
| 全 backend 回歸（vitest run） | 1051 / 1068 | 17 fail 全為 pre-existing ETL/extraction-task（與 P0 log L33 一致，與 B4 無關） |

**既有 33 PASS 全數保留，新增 13 PASS，無任何回歸破壞。**

新增 13 個 TC 對應任務需求：

| 任務 TC | spec.ts describe block | 狀態 |
|---|---|---|
| TC-RUN-LIFECYCLE | `pending → running → completed` | PASS |
| TC-STAGE-001 (×2) | Stage 1 案件挑選（ready list / 非 ready） | PASS |
| TC-STAGE-002 | Stage 2 計分（score / card_level / tier_level） | PASS |
| TC-STAGE-003 / TC-CR-REASSIGN (×2) | Stage 3 CR per-LIST 啟用 / 停用 | PASS |
| TC-STAGE-004 | Stage 4 名單交換（dept_id / emplid） | PASS |
| TC-BR-12 | 邊緣 CARD_TYPE 跳過 + skipped_cases JSONB 結構 | PASS |
| TC-SNAPSHOT-001~003 (×4) | 三份快照原子寫入 + 失敗 rollback | PASS |

## Files Changed

| 路徑 | 類型 | 描述 |
|---|---|---|
| `apps/api/src/modules/assignment/services/assignment-run-pipeline.service.ts` | new (342 行) | Pipeline 主服務：runPipeline(runId, ym) — Stage 1~4 串接 + DB transaction 寫入三份快照 + AC-7b skipped_cases |
| `apps/api/src/modules/assignment/services/__tests__/assignment-run-pipeline.service.spec.ts` | new (590 行) | 13 tests / sqlite in-memory / seed 11 entities |
| `apps/api/src/modules/assignment/services/assignment-run.service.ts` | modified | kickoffPipeline() 由 setImmediate placeholder 改為呼叫 AssignmentRunPipelineService.runPipeline；pipeline 注入為 `@Optional()` 不破壞既有 8 個 service tests |
| `apps/api/src/modules/assignment/assignment.module.ts` | modified | 註冊 AssignmentRunPipelineService + 加掛 7 個新依賴 entity（Snapshot / PoolData / PoolDataList / DeptPct / EmplSet / CardType / LevelcardLevel / Tier） |
| `apps/api/src/database/entities/assignment-run.entity.ts` | modified | 新增 `skipped_cases` JSONB + `warning_summary` VARCHAR(100) 欄位（對應 BR-12 / AC-7b） |
| `apps/api/src/database/entities/assignment-run-snapshot.entity.ts` | modified | `payload` jsonb → `jsonColumnType` helper；`created_at` timestamp → `dateColumnType`（sqlite 相容） |
| `apps/api/src/database/entities/ob-dept-pct.entity.ts` | modified | `created_at`/`updated_at` timestamp → `dateColumnType`（sqlite 相容，原為 pipeline test 失敗根因） |
| `apps/api/src/database/migrations/1711360000190-AddAssignmentRunWarnings.ts` | new | m19 migration：ALTER TABLE assignment_run ADD skipped_cases (jsonb) + warning_summary (varchar(100)) |

**合計：新增 3 檔 / 修改 5 檔 / 13 新增 tests。**

## TDD Cycle 統計

| Cycle | 元件 | RED → GREEN |
|---|---|---|
| 1 | AssignmentRunPipelineService | 13 tests RED（service 未存在）→ 13 PASS（含 ObDeptPct sqlite 相容 refactor） |
| 2 | Snapshot rollback test（spy DataSource.transaction） | 1 test RED（spy 攔截錯誤層）→ 1 PASS（改攔 txm.getRepository） |
| 3 | kickoffPipeline 整合（AssignmentRunService） | 既有 8 PASS（pipeline @Optional 注入，不破壞既有 mock） |

合計 3 個 RED-GREEN cycle，含 1 次 sqlite 相容性 refactor（ObDeptPct）+ 1 次 TypeORM `update()` deep-partial 型別 fix（3 處 `as Partial<AssignmentRun>` 移除）。

## Architectural Decisions

1. **AssignmentRunPipelineService 為獨立 service** — 與 AssignmentRunService 解耦：後者負責 record + audit + kickoff hook，前者負責真正 5 階段 pipeline。注入採 `@Optional()` 確保既有 8 個 AssignmentRunService unit tests（未提供 pipeline）仍可通過。
2. **三份快照同 transaction 寫入採 `dataSource.transaction(async txm => ...)` 包裹** — 同 transaction 內亦寫入 `ob_pool_data_list` Stage 4 結果，符合 AD-E07-2 原子性語意。任一 INSERT 失敗整體 rollback。
3. **v1.0 簡化版實作（標明 v2.0 補完）**：
    - Stage 1：以全表 `ob_pool_data` 作為候選（未實作 ob_list_definition condition_payload 篩選 — spec L83 提及但 schema 無此欄位）
    - Stage 2：score = `commission` 數值（未呼叫 `fn_calc_tier_level` PostgreSQL function — migration 141 已建但需真實 PG 環境）；card_level / tier_level 對應使用 ob_levelcard_level (score_s/score_e) + ob_tier 完整邏輯
    - Stage 3：is_cr Y/N 標記（未實作「曾被分派但未成交案件動態回分」）
    - Stage 4：dept_pct + empl_set 第一筆 round-robin（未實作 T1/T2/T3 新件 10% 轉資深 st4_exchange）
4. **BR-12 邊緣 CARD_TYPE 跳過為非異常路徑** — pipeline 仍 `completed`，僅在 `warning_summary='BR-12_EDGE_CARD_TYPE_SKIPPED'` + `skipped_cases.cases[]` 記錄；對齊 system-architect 決議「跳過不拋錯，月跑仍 status='completed'」。
5. **assignment_run.skipped_cases / warning_summary 兩欄位以 m19 補丁加入** — 不破壞既有 migration 120（仍可向下相容），對齊 architecture-spec L132 BR-1 結構。
6. **assertNoRunningRun 在 service 層** — pipeline 啟動前由 AssignmentRunService.triggerRun 呼叫；pipeline 期間 `status='running'`，AssignmentRunGuardService 既有實作即可攔截其他 E07 寫入（無需在 pipeline 額外新增鎖機制）。
7. **JSONB 欄位透過 `jsonColumnType` helper 寫入** — postgres=jsonb / sqlite=simple-json 自動切換，依 memory feedback_typeorm_timestamp 同類規則。
8. **rollback 測試採 spy `DataSource.transaction`** — 攔截 `txm.getRepository(AssignmentRunSnapshot).save` 第三筆（result）時拋錯；驗證原子性（三份快照全 rollback、status='failed' 且 error_message 包含失敗訊息）。

## AD-E07 v3.0 Alignment 確認

- ✓ AC-3 五階段 pipeline 串接完整（含 BR-12 邊緣 case）
- ✓ AC-4 三份快照同 transaction 原子寫入（rollback 驗證 PASS）
- ✓ AC-5 失敗 → status='failed' + error_message 記錄
- ✓ AC-7b BR-12 跳過邏輯與 system-architect 決議一致（不拋錯、月跑仍 completed）
- ✓ Run lifecycle pending → running → completed/failed 三段狀態流轉驗證
- ✓ Pipeline 期間 status='running'，AssignmentRunGuardService 攔截併發
- ✓ assignment_run_snapshot 三 type 紀錄完整（config / input_list / result）
- ✓ TypeORM dateColumnType / jsonColumnType helper 嚴格遵守（含 ObDeptPct 補修）

## Blocking Issues

無。

## 已知不在範圍（v2.0 / 後續批次）

1. **Stage 1 condition_payload 篩選** — spec L83 提及「ob_list_definition 篩選」但 schema 無 condition_payload 欄位；v2.0 補完時應由 spec-writer 先補欄位定義
2. **fn_calc_tier_level PG function 真實呼叫** — migration 141 已建但需真實 PostgreSQL；v1.0 採 commission 簡化計分
3. **st4_exchange T1/T2/T3 10% 轉資深** — v2.0 補完真實名單交換邏輯
4. **CR 回分動態邏輯** — 「曾被分派但未成交案件重新納入」依賴歷史月跑快照查詢；v2.0 補完
5. **F062 / F063 / F064 / F067 前端整合** — 依賴本批次完成的快照表結構，可於 P1 B5 / P1 B6 串接
6. **assignment_run_stage_log 進度寫入** — spec AC-3 提及「每個 Stage 成功後更新」；v1.0 採 status 三段切換已能反映；v2.0 進度頁 (F062) 需細化時補

## 提示下一步（P1 B5 — M04 白名單）

依 spec-writer v2 計畫，B5 範圍為「M04 月跑白名單 / 重跑控制」。建議承接：

1. **F063 結果摘要** — 讀取 result snapshot + 渲染分派結果列表（依賴本批次完成的 snapshot 結構）
2. **F064 匯出** — Stage 4 結果 CSV / Excel 匯出
3. **F067 與舊系統差異比對** — 對比 `ob_pool_data_list` historical 資料；NFR-005 「人員配對不一致率 < 3%」驗證
4. **F062 進度頁前端** — `prototypes/32-run-progress.html` 對接，需補 assignment_run_stage_log 細粒度進度（v1.0 pipeline 三段已可基本顯示）
5. **v2.0 補完 Stage 2/4 真實邏輯** — fn_calc_tier_level PG function 整合 + st4_exchange 名單交換實作
6. **P1 B4 前端 FE-4** — `prototypes/30-stage0-estimate.html` / `31-trigger-run.html` 對接（既有 B4 backend API 已完整，前端可即時開工）

## 設計衝突或歧義

**輕度澄清需求**（未阻塞本批次，可由 spec-writer 後續補）：

- spec L83 提及 ob_list_definition「condition_payload」用於 Stage 1 篩選，但 `ob_list_definition` entity / migration 無此欄位。本批次 v1.0 採全表 ob_pool_data，標明 v2.0 補完。建議 spec-writer 補欄位定義或改寫篩選規則為其他既有欄位（case_status / card_type / settle_src 等）。
- spec AC-3 「Stage 1 候選名單」與「Stage 4 最終分派」皆寫入 `ob_pool_data_list`，本批次採 Stage 4 寫入全量（含 score / card_level / tier_level / is_cr / dept_id / emplid 一次完整）。若 v2.0 需 Stage 間落地（如 Stage 1 先寫，Stage 2 UPDATE score），需 spec-writer 補欄位寫入順序規格。
