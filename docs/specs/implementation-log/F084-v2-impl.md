---
type: implementation-log
feature_id: F084
feature_name: 個別業務比例設定階段「自動推進」至簽核（auto-advance v2.0）
status: partial
last_updated: 2026-05-25
phase: Phase 1（後端 + 30 unit）+ Phase 3（integration defer 文件）完成；Phase 2（前端）暫停
related_spec: /docs/specs/features/F084-advance-to-approval.md
related_spec_version: "2.0.1"
related_arch: /docs/specs/architecture-spec.md#AD-E07-19
related_test_design: /docs/specs/handoffs/F084-v2-auto-advance-test-design.md
---

# F084 v2.0 Auto-Advance — 實作紀錄（Phase 1 + Phase 3）

## 範圍與進度

| Phase | 內容 | 狀態 |
|-------|------|------|
| Phase 1 | 後端 auto-advance 主路徑 + 30 unit | ✅ 完成（commit e43dcc6） |
| Phase 2 | 前端 response 分支（toast/redirect/fallback）+ 11 unit | ⏸ 暫停（待 prototype 29b 更新後接續；FLAG-2 決策） |
| Phase 3 | 4 integration defer 標記 + staging 手動驗證文件 | ✅ 完成 |

## Phase 1 測試結果（後端 Unit）

> 執行：`npx vitest run src/modules/assignment-stage/__tests__/personnel-ratio-auto-advance.service.spec.ts`
> 結果：**30 passed (30)**；併同既有 `personnel-ratio.service.spec.ts` 共 **39 passed**（無 regression）。

| Scenario ID | 說明 | Status |
|-------------|------|--------|
| TC-F084-001 | flag off → auto-advance 不執行、autoAdvanced:false | PASS |
| TC-F084-002 | flag off + phase3 on → 退回手動推進行為 | PASS |
| TC-F084-003 | 部分部門未完成 → autoAdvanced:false、不帶 failReason、寫入保留 | PASS |
| TC-F084-004 | 容差邊界 99.99% 通過 / 99.98% 不通過 | PASS |
| TC-F084-005 | 全員離職部門短路通過，不阻擋 auto-advance | PASS |
| TC-F084-006 | 處長完成最後部門 PUT → auto-advance 成功（主場景） | PASS |
| TC-F084-007 | 部長完成最後部門 → operator_role:director | PASS |
| TC-F084-008 | Admin 完成最後部門 → operator_role:admin（不 fallback section_chief） | PASS |
| TC-F084-009 | 稽核 metadata 完整性（boolean true + 無多餘 key） | PASS |
| TC-F084-010 | 手動 fallback 路徑稽核不含 auto_advanced_by_completion | PASS |
| TC-F084-011 | operator_role 推導三角色 × 公式 | PASS |
| TC-F084-012 | 月跑 running → autoAdvanced:false + failReason、寫入保留 | PASS |
| TC-F084-013 | 月跑 pending（isRunning true）同樣觸發 guard | PASS |
| TC-F084-014 | lock 逾時 55P03 → autoAdvanced:false、不帶 failReason、寫入保留（Option B） | PASS |
| TC-F084-015 | lock 超時 catch 後 tx 照常 commit（不 rethrow） | PASS |
| TC-F084-016 | lock 超時 vs 月跑 guard 回應欄位差異 | PASS |
| TC-F084-017 | 取得 lock 後 stage 已 approval → idempotent no-op | PASS |
| TC-F084-018 | idempotent no-op 時稽核不重複 | PASS |
| TC-F084-019 | advanceToInMgr 接受外部 EntityManager、不自開 tx | PASS |
| TC-F084-020 | advanceToInMgr auditMetadata=undefined 不寫 auto_advanced_by_completion | PASS |
| TC-F084-021 | advanceToInMgr stage 不符 → 422、不 update | PASS |
| TC-F084-022 | assertAllDeptsSumEquals100WithMgr 使用傳入 mgr 查詢 | PASS |
| TC-F084-023 | WithMgr 全員離職短路；非離職部門仍被驗證 | PASS |
| TC-F084-024 | stage=approval 再 PUT → 422，不寫入 | PASS |
| TC-F084-025 | 歷史月份 → 403，auto-advance 不執行 | PASS |
| TC-F084-026 | fallback 部長手動推進成功（走 advanceTo，不含 metadata flag） | PASS |
| TC-F084-027 | fallback 部門未完成 → 422 STAGE_ADVANCE_PRECONDITION_FAILED | PASS |
| TC-F084-028 | fallback 月跑進行中 → 409 ASSIGNMENT_RUN_ALREADY_RUNNING | PASS |
| TC-F084-029 | fallback 歷史月份 → 403 LIST_HISTORICAL_READONLY | PASS |
| TC-F084-030 | fallback stage 非 personnel_ratio → 422 LIST_STAGE_TRANSITION_FORBIDDEN | PASS |

## Phase 3 — Integration（4 個，決策 B：defer + 手動驗證）

| Scenario ID | 說明 | Status |
|-------------|------|--------|
| INT-F084-001 | 兩並發 PUT advisory lock 序列化 | DEFERRED（需真 PG；手動驗證步驟已建立） |
| INT-F084-002 | lock 逾時 55P03 + Option B 寫入保留 | DEFERRED（需真 PG；手動驗證步驟已建立） |
| INT-F084-003 | WithMgr 讀同 tx 未 commit 資料 | DEFERRED（需真 PG；手動驗證步驟已建立） |
| INT-F084-004 | advanceToInMgr 原子性 rollback | DEFERRED（需真 PG；手動驗證步驟已建立） |

- 測試設計文件 §4 四個 INT heading 已加 `【DEFERRED — 需真 PG，本 MVP 不落地】` 標記
- 手動驗證步驟：`docs/specs/handoffs/F084-v2-staging-manual-verification.md`（含 PR checklist 4 項）

## Files Changed

| File Path | Change Type | Description |
|-----------|------------|-------------|
| apps/api/src/modules/assignment/services/stage-transition.service.ts | modified | 新增 `advanceToInMgr()` 過載（接受外部 EntityManager、不自開 tx、auditMetadata 合併進 after_value.metadata） |
| apps/api/src/modules/assignment/services/personnel-ratio-validation.service.ts | modified | 新增 `assertAllDeptsSumEquals100WithMgr()`（EntityManager 版本，讀同 tx 未 commit；新增私有 `countActiveEmployeesWithMgr()`）；import 補 `EntityManager` |
| apps/api/src/modules/assignment/services/assignment-run-guard.service.ts | modified | 新增 `isRunning()`（tx 內輕量月跑 guard，回 boolean） |
| apps/api/src/modules/assignment-stage/personnel-ratio.service.ts | modified | `setPersonnelRatios()` tx scope 擴大（Option B）+ 新增私有 `tryAutoAdvance()` / `resolveOperatorRole()` / `isAutoAdvanceEnabled()` / `isPostgres()` / `isPgLockNotAvailable()`；response 補 autoAdvanced / newStage / autoAdvanceFailReason；import 補 `EntityManager` |
| apps/api/src/modules/assignment-stage/__tests__/personnel-ratio-auto-advance.service.spec.ts | new | TC-F084-001~030 共 30 個後端 unit |
| docs/specs/handoffs/F084-v2-auto-advance-test-design.md | modified | §4 四個 INT 案例標 DEFERRED + 決策 B 說明 |
| docs/specs/handoffs/F084-v2-staging-manual-verification.md | new | INT-F084-001~004 真 PG staging 手動驗證步驟 + PR checklist |

## 架構決策與落差處理（依使用者裁示）

- **FLAG-3（批准）**：個別比例稽核沿用既有 `action:'UPDATE'`（標 SET_PERSONNEL_RATIO），**不擴 enum**；
  auto-advance 的 `STAGE_ADVANCE` 才是本次新增稽核。
- **FLAG-4（批准）**：`operator_role` 推導採 AD-E07-19 §19.4 公式
  `role==='admin' ? 'admin' : (businessRole ?? 'section_chief')`，**僅套用於 auto-advance 路徑**；
  既有手動 fallback（`stage-action.service.ts` `advancedByRole`）維持 `?? null` 不動。
- **SQLite 相容**：`tryAutoAdvance()` 內 advisory lock 段以 `isPostgres()`（`DB_TYPE!=='postgres'` 視為非 PG）gate；
  SQLite 測試 infra 下跳過 advisory lock，直接做完成度偵測 + 推進，使 30 unit 在現有 SQLite infra 全綠。
  lock 超時 catch 路徑（55P03）以 mock 在 `DB_TYPE='postgres'` 子情境下驗證（TC-014~016）。
- **Option B 順序**：tx 內 [1]DELETE [2]INSERT ob_empl_set [3]INSERT 稽核（寫入）皆在 [4a] advisory lock **之前**；
  lock 超時 / 月跑 guard / 未完成 / idempotent no-op 任一降級皆不 rollback 寫入，tx 照常 commit。

## 待辦（Phase 2 接續時）

- 待 ui-ux-designer 更新 prototype 29b（auto-advance UX）後，以更新後 prototype 為 ground truth 實作：
  - `apps/web/src/api/assignment-stage.ts`：`SetPersonnelRatiosResponse` 補 autoAdvanced/newStage/autoAdvanceFailReason
  - `personnel-ratio-form.tsx`：`save()` 回傳改 `Promise<SetPersonnelRatiosResponse | null>`（FLAG-1 批准）
  - `personnel-ratio-config-page.tsx`：依 response 分支（任一 autoAdvanced=true → toast+redirect；
    任一 autoAdvanceFailReason → 月跑 toast + 保留 fallback 按鈕；無 → 既有 toast）
  - TC-F084-FE-001~011 共 11 個前端 unit
- F084 spec §10 末補測試設計文件連結（§6.4 要求）：因 `/docs/specs/features/` 為唯讀，**未在本輪改動**，
  提醒由 spec-writer 或經使用者確認後補上。
