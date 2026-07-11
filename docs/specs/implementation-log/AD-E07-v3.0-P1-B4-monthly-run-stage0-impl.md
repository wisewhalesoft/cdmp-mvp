---
type: implementation-log
feature_id: AD-E07-v3.0-P1-B4
feature_name: E07 重構 P1 B4 — M03 月名單分派觸發 + Stage 0 試算（F049 / F061 / F062 / F065 / F066）
status: complete
last_updated: 2026-05-17
agent_id: a9f450ab696ef17d9
---

# AD-E07 v3.0 P1 B4 — Implementation Log

承接 P1 B3（spec-writer F055 v1.6 收尾），實作 spec-writer v2 計畫之 P1 B4 範圍：M04 月名單分派觸發 + Stage 0 試算。

## 範圍

| Spec | 功能 | Guard |
|---|---|---|
| F049 v1.0 | Stage 0 每日估算 + 單一 LIST_NO 試算 | DirectorGuard |
| F061 v1.2 | 觸發分派月名單分派 | DirectorGuard |
| F062 / F065 / F066 | 月名單分派進度 / 歷史清單 / 快照詳情 | DirectorOrSectionChiefGuard |

> F063 / F064 / F067（結果摘要 / 匯出 / 比對）依賴 `assignment_run_snapshot` 寫入，列入 B5+。本批次完成 month-run record + audit log 與背景 pipeline hook（spec AC-3 setImmediate placeholder），Stage 1~4 pipeline 與快照原子寫入待後續批次補實作。

## Test Results Summary

| Test Suite | Tests | Status |
|---|---|---|
| stage0-estimate.service.spec | 8 | PASS |
| stage0-estimate.controller.spec | 7 | PASS |
| assignment-run.service.spec | 8 | PASS |
| assignment-run.controller.spec | 10 | PASS |
| 既有 assignment / assignment-list / assignment-scoring 回歸 | 360 | PASS |

**B4 範圍合計：33 新增 tests / 全部 PASS。** 全套 unit suite：1038 / 1055 通過；17 個失敗皆為 pre-existing ETL / extraction / target-table 問題（與 P0 log L33 描述一致），與 B4 無關。

## Files Changed

| 路徑 | 類型 | 描述 |
|---|---|---|
| `apps/api/src/common/errors/error-codes.ts` | modified | 新增 4 個 error codes（ASSIGNMENT_RUN_PRECHECK_FAILED / NO_READY_LIST_FOUND / STAGE0_ESTIMATE_TIMEOUT / ASSIGNMENT_RUN_NOT_FOUND）+ 對應中文訊息 |
| `apps/api/src/database/entities/ob-pool-data.entity.ts` | modified | 11 個 timestamp 欄位改用 `dateColumnType`（與 ob-list-definition / ob-calendar 對齊，相容 sqlite e2e） |
| `apps/api/src/modules/assignment-list/stage0-estimate.service.ts` | new | F049 service：calculateDailyEstimate + estimateListCount（含 timeout 攔截、POOL_COUNT_LOW 警示） |
| `apps/api/src/modules/assignment-list/stage0-estimate.controller.ts` | new | F049 controller：GET stage0/daily-estimate + GET list-definitions/:listNo/estimate（DirectorGuard） |
| `apps/api/src/modules/assignment-list/__tests__/stage0-estimate.service.spec.ts` | new | 8 tests / sqlite in-memory |
| `apps/api/src/modules/assignment-list/__tests__/stage0-estimate.controller.spec.ts` | new | 7 tests / mocked service + 真實 RBAC |
| `apps/api/src/modules/assignment-list/assignment-list.module.ts` | modified | 加入 Stage0EstimateController/Service + ObPoolData/ObCalendar entities |
| `apps/api/src/modules/assignment/services/assignment-run.service.ts` | new | F061/F062/F065/F066 service：triggerRun + listRuns + getRunById |
| `apps/api/src/modules/assignment/services/__tests__/assignment-run.service.spec.ts` | new | 8 tests / sqlite in-memory |
| `apps/api/src/modules/assignment/dto/trigger-run.dto.ts` | new | POST /runs request DTO |
| `apps/api/src/modules/assignment/assignment-run.controller.ts` | new | POST/GET /assignment/runs controller（DirectorGuard + DirectorOrSectionChiefGuard 雙層） |
| `apps/api/src/modules/assignment/__tests__/assignment-run.controller.spec.ts` | new | 10 tests / 4 角色 × 3 endpoint RBAC 矩陣 |
| `apps/api/src/modules/assignment/assignment.module.ts` | new | AssignmentModule：註冊 AssignmentRunController + 4 services + export 3 共用 services |
| `apps/api/src/app.module.ts` | modified | 註冊 AssignmentModule |

**總計：新增 9 檔 / 修改 4 檔 / 33 新增 tests。**

## TDD Cycle 統計

| Cycle | 元件 | RED → GREEN |
|---|---|---|
| 1 | Stage0EstimateService | 8 tests RED → 8 PASS（含 ObPoolData timestamp 修正） |
| 2 | AssignmentRunService | 8 tests RED → 8 PASS |
| 3 | AssignmentRunController + Stage0EstimateController | 17 tests RED → 17 PASS |

合計 3 個完整 RED-GREEN cycle，含 1 次 sqlite 相容性 refactor（ObPoolData 11 欄位 timestamp → dateColumnType）。

## Architectural Decisions

1. **AssignmentRunService 放在既有 `modules/assignment/`** — 與 P0 已建立的 4 個 services（StageTransition / Readiness / RunGuard / 兩個 ratio validator）同棲，新增 `assignment.module.ts` 統一掛載並 export 共用 services。
2. **Stage0EstimateService 放在 `modules/assignment-list/`** — spec L31 標 M01；介面屬於名單定義頁衍生，避免跨模組依賴循環。
3. **F061 Stage 1~4 pipeline 暫以 `setImmediate` placeholder 實作** — 對齊 spec AC-3 非同步 hook 規格，背景 chain 完整實作（fn_calc_tier_level / st4_exchange / 三份快照原子寫入）依 spec L132 標示為 BR-1（AD-E07-2），列入 B5+ 範圍。Run record 維持 `pending` 狀態直至 pipeline 完成。
4. **DirectorOrSectionChiefGuard + DirectorGuard 雙層套用** — controller class 標 `@RequireDirectorOrSectionChief()`（粗略入口），method 標 `@RequireDirector()`（寫入細分）；兩個 guard chain 順序依 P1 B2 既有模式（DirectorOrSectionChief 先擋無業務角色，Director 再驗部長專屬）。
5. **timeoutMs = 0 短路機制** — Stage 0 試算 timeout 在 sqlite microtask 環境會 race condition；採顯式短路 `if (timeoutMs <= 0) throw STAGE0_ESTIMATE_TIMEOUT` 確保測試可靠性與 production runtime 行為一致（10s 仍以 Promise.race 實作）。

## AD-E07 v3.0 Alignment 確認

- ✓ 後端 Guard 元件清單（spec L1042~L1047）：DirectorGuard + DirectorOrSectionChiefGuard 套用無誤
- ✓ AssignmentRunGuardService.assertNoRunningRun(ym) 於 service 頂層呼叫（F061 BR-2 / AC-6）
- ✓ MonthlyRunReadinessService.calculateReadiness 為 F061 前置條件唯一來源（spec L26 BR-5 對應）
- ✓ AssignmentAuditLog action='RUN' 已在 P0 union 中（entity L28），無需擴充
- ✓ ObPoolData entity 與 ob-calendar / ob-list-definition 對齊使用 `dateColumnType`，符合 memory feedback_typeorm_timestamp 規範

## Blocking Issues

無。

## 已知不在範圍

- **F061 AC-3 Stage 1~4 pipeline 實作**：fn_calc_tier_level 呼叫、st4_exchange 邏輯、CR 回分（per-list `cr_enabled`）、邊緣 CARD_TYPE 跳過（BR-12）→ 列入 B5+
- **F061 AC-4 三份快照原子寫入**：`assignment_run_snapshot.config / input_list / result` 同 transaction → 列入 B5+
- **F063 / F064 / F067**：依賴快照表，列入 B5+
- **前端實作（FE-4）**：prototypes/30-stage0-estimate.html / 31-trigger-run.html / 32-run-progress.html 對接 → 依任務指示「前端 FE-4 留待下輪」

## 提示下一步（P1 B5 — M04 白名單）

依 spec-writer v2 計畫，B5 範圍應為「M04 月名單分派白名單 / 重跑控制」。建議承接：

1. **完成 Stage 1~4 pipeline**（F061 AC-3 / AC-4）：實作 `kickoffPipeline` 內容，串接 fn_calc_tier_level + 三份快照原子寫入
2. **F062 進度回報**：在 pipeline 各 stage 完成時 INSERT `assignment_run_stage_log`
3. **F063 / F064 / F067**：實作 result snapshot 讀取 + 匯出 + 比對
4. **前端 FE-4**：依 prototypes/30~32 對接後端 API

## 設計衝突或歧義

無新衝突。沿用 P0 / P1 B1~B3 已確認決策：

- 角色矩陣（F002 §4.6.2）：M04 觸發 = director only / M04 查詢 = director + section_chief
- assignmentRunGuard.assertNoRunningRun 在 service 頂層呼叫
- audit log entity_type 採 snake_case（與 P0 / P1 B2 慣例一致：`'assignment_run'` / `'ob_list_definition'`）
