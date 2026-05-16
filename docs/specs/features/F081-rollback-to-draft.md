---
spec-id: F081
title: 部門比例設定階段 Rollback 至草稿
feature-id: F081
source-story: US-111
epic: E07
module: M03a 部門比例設定階段（Rollback）
priority: P0-MVP
version: "1.2"
date: 2026-05-16
status: Draft
---

# F081: 部門比例設定階段 Rollback 至草稿

Priority: P0-MVP | Status: Draft | Last Updated: 2026-05-16

> **v1.2 救援重寫（2026-05-16）**：前一輪編碼事故損毀本檔內容，依 US-111 + AD-E07 v3.0 一致性決議完整重建；Guard 為 `DirectorGuard`；業務角色欄位 `business_role`；JWT claim `businessRole`；保留 v1.0 / v1.1 所有設計決議。
> **v1.1 修訂（2026-05-16 / Phase 1 決議落地）**：月跑並發守衛集中至 `AssignmentRunGuardService.assertNoRunningRun()`（決議 #6）；Feature Flag fallback 503 + `FEATURE_NOT_ENABLED`（決議 #2）。

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + `data-model.md#ob-list-definition` + `data-model.md#ob-dept-pct-obmdeptpct--per-list-no-部門比例` + `error-handling.md#assignment-stage-transition-errors` + `error-handling.md#assignment-role-errors` |
| QA / Tester | 本文件 + `error-handling.md#assignment-stage-transition-errors` |
| UI/UX Designer | 本文件 §7 |
| Architect | 本文件 + `architecture-spec.md` §3.10 `StageTransitionService` |

---

## 對應 User Story

- 來源 Story：[US-111-M03a-rollback-to-draft.md](../../stories/epics/E07-app-customer-list-assignment/US-111-M03a-rollback-to-draft.md)
- Epic：[E07 — 客戶名單分派](../../stories/epics/E07-app-customer-list-assignment/epic-brief.md)
- 模組：M03a 部門比例設定階段（Rollback 至草稿）

---

## 1. 功能摘要

部長 / Admin 對 `stage = 'dept_ratio'` 名單執行 Rollback，使 `stage` 退回至 `'draft'`，並**清空**該名單已設定的部門比例（`ob_dept_pct`）。

**範圍**：
- 僅 `stage = 'dept_ratio'` 名單可 Rollback；非此階段一律 422 `STAGE_ROLLBACK_BLOCKED`
- Rollback 語意：「退回（回到上一階段）」，非「取消（刪除名單）」
- 清空本階段資料：`ob_dept_pct` 中對應 `(project_workym, list_no)` 之所有紀錄 DELETE
- 篩選條件 / CR 開關保留（解鎖可再編輯）

**Actor**：部長 + Admin；處長無 Rollback 權限

## 2. 使用者故事

**As a** 部長 / Admin
**I want** 將處於「部門比例設定」階段的名單退回至「草稿」階段
**So that** 當部門比例或篩選條件需要重新調整時，能以「退回」而非「取消」的方式重啟編輯，避免資料混亂

## 3. 前置條件

- 使用者持 JWT 且 `business_role = 'director'` 或 admin
- 目標 `list_no` 存在，`status = 'active'`，`stage = 'dept_ratio'`
- `project_workym >= current_work_ym`
- `assignment_run` 無 `status IN ('pending', 'running')` 紀錄

## 4. 驗收標準

### AC-1：部門比例階段顯示「退回草稿」按鈕

- **Given** 部長 / Admin 在 F048 / F077 清單頁查看 `stage = 'dept_ratio'` 名單
- **When** 頁面顯示操作欄
- **Then** 顯示「退回草稿」按鈕
- **And** 處長帳號**完全不渲染**「退回草稿」按鈕

### AC-2：Rollback 確認對話框

- **Given** 部長 / Admin 點擊「退回草稿」
- **When** 系統彈出確認對話框
- **Then** 對話框顯示：「確認將名單『{listNm}』（{listNo}）退回草稿階段？退回後，已設定的**部門比例資料將全部清空**，篩選條件將重新開放編輯。」
- **And** 提供「確認退回」與「取消」兩個按鈕

### AC-3：執行 Rollback

- **Given** 部長 / Admin 點擊「確認退回」
- **When** 後端處理請求（POST `/api/v1/assignment/lists/{listNo}/stage/rollback-to-draft`）
- **Then** 系統執行：
  1. UPDATE `ob_list_definition.stage` 由 `'dept_ratio'` 為 `'draft'`
  2. DELETE FROM `ob_dept_pct` WHERE `(project_workym, list_no)` 對應紀錄
  3. 寫入 `assignment_audit_log`（`action = 'ROLLBACK_STAGE'`、`before_value = { stage: 'dept_ratio' }`、`after_value = { stage: 'draft', deletedDeptPctCount: N }`）
- **And** 頁面顯示成功提示「名單『{listNm}』已退回草稿階段，部門比例已清空」，清單刷新

### AC-4：Rollback 後名單可再度編輯

- **Given** 名單已 Rollback 至 `'draft'`
- **When** 部長 / Admin 在清單頁查看
- **Then** 階段標籤顯示「草稿」
- **And** 篩選條件可再度編輯（US-106 操作開放）
- **And** CR 開關可再度修改（US-107 操作開放）
- **And** 部門比例設定頁顯示空值

### AC-5：Rollback 不影響其他名單

- **Given** 本月有多份名單（LIST_NO_A 在 dept_ratio、LIST_NO_B 在 personnel_ratio）
- **When** 部長對 LIST_NO_A 執行 Rollback
- **Then** 僅 LIST_NO_A 退回至 `'draft'`，LIST_NO_B 狀態不受影響
- **And** LIST_NO_B 之 `ob_dept_pct` / `ob_empl_set` 紀錄不受影響

### AC-6：月跑執行中禁止 Rollback

- **Given** `assignment_run.status IN ('pending', 'running')`
- **When** 部長 / Admin 嘗試 Rollback
- **Then** 按鈕為 disabled，hover 顯示「分派執行中，無法退回階段」
- **And** 若直接呼叫 API，回 409 `ASSIGNMENT_RUN_ALREADY_RUNNING`

### AC-7：處長無 Rollback 權限

- **Given** 帳號僅持有「處長」角色
- **When** 嘗試呼叫 Rollback API
- **Then** 後端回 403 `AUTH_FORBIDDEN`
- **And** 清單頁無「退回草稿」按鈕

### AC-8：歷史月份拒絕 Rollback

- **Given** 名單 `project_workym < current_work_ym`
- **When** 部長嘗試 Rollback
- **Then** 回 403 `LIST_HISTORICAL_READONLY`

### AC-9：非 `dept_ratio` 階段拒絕 Rollback

- **Given** 名單 `stage` 為其他階段
- **When** 呼叫 Rollback API
- **Then** 後端回 422 `STAGE_ROLLBACK_BLOCKED`

### AC-10：稽核日誌

- **Given** 任一 Rollback 成功
- **When** 寫入完成
- **Then** `assignment_audit_log` 新增一筆 `action = 'ROLLBACK_STAGE'`，含 before/after stage、deletedDeptPctCount、operator_id、timestamp

## 5. API 規格

### 5.1 POST /api/v1/assignment/lists/{listNo}/stage/rollback-to-draft

| 用途 | 將指定名單由部門比例設定 Rollback 至草稿（清空部門比例） |
|---|---|
| 認證 | JWT 必填 |
| 權限 | `DirectorGuard` |

**Request Body**：（無 body）

**Response — 200 OK**

```json
{
  "listNo": "OB202605001",
  "previousStage": "dept_ratio",
  "currentStage": "draft",
  "deletedDeptPctCount": 5,
  "rollbackedAt": "2026-05-15T13:00:00Z",
  "rollbackedBy": "user-uuid-xxx"
}
```

**錯誤代碼**

| HTTP | 錯誤碼 | 說明 |
|---|---|---|
| 401 | AUTH_TOKEN_MISSING / AUTH_TOKEN_EXPIRED | 未登入或 Token 過期 |
| 403 | AUTH_FORBIDDEN | 處長嘗試 Rollback |
| 403 | LIST_HISTORICAL_READONLY | 歷史月份 |
| 404 | ASSIGNMENT_LIST_NOT_FOUND | `list_no` 不存在 |
| 409 | ASSIGNMENT_RUN_ALREADY_RUNNING | 月跑進行中 |
| 422 | ASSIGNMENT_LIST_INACTIVE | 名單已停用 |
| 422 | STAGE_ROLLBACK_BLOCKED | `stage != 'dept_ratio'` |
| 503 | FEATURE_NOT_ENABLED | Feature Flag 關閉 |

## 6. 業務規則

| 規則編號 | 說明 |
|---|---|
| BR-1 | **`stage = 'dept_ratio'` 限制**：透過 `StageTransitionService.assertStageEquals(listNo, 'dept_ratio')` 統一檢查 |
| BR-2 | **角色矩陣（I-7）**：本端點限 `admin` 或 `business_role = 'director'`；處長一律 403 |
| BR-3 | **歷史月份攔截**：沿用 F077 BR-3 |
| BR-4 | **清空部門比例**：DELETE `ob_dept_pct` WHERE `(project_workym, list_no)`；篩選條件 / CR 開關不清空 |
| BR-5 | **DB 操作原子性**：UPDATE stage + DELETE `ob_dept_pct` + 稽核寫入須於同一 transaction |
| BR-6 | **稽核失敗不 rollback**：沿用 F050 v2.0 BR-11 |
| BR-7 | **草稿為終點**：草稿（Stage 1）不提供 Rollback；本 spec 為部門比例階段唯一退回路徑 |
| BR-8 | **月跑並發守衛（v1.1 / 決議 #6）**：F081 service method 入口層呼叫 `await this.assignmentRunGuardService.assertNoRunningRun()` |
| BR-9 | **Feature Flag fallback（v1.1 / 決議 #2）**：F081 端點受 `FeatureFlagGuard` 保護；flag = false 時回 503 `FEATURE_NOT_ENABLED` |

## 7. UI/UX 需求

- **「退回草稿」按鈕**：
  - 位於 F048 / F077 清單頁部門比例階段名單操作欄（與「設定部門比例」「推進至個別業務比例設定」並列）
  - 處長身份**完全不渲染**
  - 已停用 / 非 `dept_ratio` 階段 / 歷史月份**完全不渲染**
  - 月跑進行中 disabled + hover 提示
- **確認對話框**：
  - 標題：「Rollback 確認」
  - 內容：「確認將名單『{listNm}』（{listNo}）退回草稿階段？退回後，已設定的**部門比例資料將全部清空**，篩選條件將重新開放編輯。」
  - 按鈕：「確認退回」（warning）/「取消」
- **成功提示 toast**：「名單『{listNm}』已退回草稿階段，部門比例已清空」
- **Rollback 後狀態**：清單頁該名單階段標籤更新為「草稿」，操作欄顯示「停用」+「推進至部門比例設定」（F078）

## 8. 依賴關係

- **Blocked By**：
  - F079（部門比例設定，產生待清空資料）
  - F078（草稿推進至部門比例，本 Feature 為其反向操作）
  - F048 v2.0 / F077（M01 入口骨架 + 角色 × 階段操作矩陣）
- **Blocks**：
  - 退回草稿後，US-090（停用草稿名單）+ US-106（編輯篩選條件）+ F078（再次推進）重新開放
- **與 US-090 關聯**：退回至草稿後，草稿名單可由 US-090 執行停用

## 9. 交叉參照

- **權限矩陣**：[F002 §4.6 E07 角色矩陣](F002-user-login.md#e07-角色矩陣)
- **資料模型**：
  - [data-model.md#ob-list-definition](../data-model.md#ob_list_definition)
  - [data-model.md#ob-dept-pct-obmdeptpct--per-list-no-部門比例](../data-model.md#ob_dept_pctobmdeptpct--per-list-no-部門比例)
  - [data-model.md#current-work-ym-rule](../data-model.md#current-work-ym-rule)
- **錯誤代碼**：
  - [error-handling.md#assignment-stage-transition-errors](../error-handling.md#assignment-stage-transition-errors)（`STAGE_ROLLBACK_BLOCKED`）
  - [error-handling.md#assignment-role-errors](../error-handling.md#assignment-role-errors)
- **架構決議**：AD-E07-1、`StageTransitionService` helper（沿用 F079 §12 A-1）
- **相關功能**：
  - [F078](F078-draft-advance-to-dept-ratio.md)（草稿推進至部門比例，本 Feature 反向操作）
  - [F079](F079-set-dept-ratio.md)（部門比例設定，本 Feature 清空目標）
  - [F080](F080-advance-to-personnel-ratio.md)（部門比例推進至個別業務比例）
  - [F077](F077-month-switch-and-stage-overview.md)（M01 入口）
- **圖表**：
  - [diagrams/F081-rollback-flow.mmd](../diagrams/F081-rollback-flow.mmd)
  - [diagrams/F077-stage-overview.mmd](../diagrams/F077-stage-overview.mmd)

## 10. 測試覆蓋目標

- 單元測試覆蓋率 ≥ 80%
- 後端關鍵測試案例：
  - 部長 Rollback `stage = 'dept_ratio'`（5 筆 RATION）→ 200 OK，stage 退回 `'draft'`，`ob_dept_pct` 清空 5 筆，稽核寫入
  - Admin Rollback → 200 OK
  - 處長 Rollback → 403 `AUTH_FORBIDDEN`
  - Rollback `stage = 'draft'` 名單 → 422 `STAGE_ROLLBACK_BLOCKED`
  - Rollback `stage = 'personnel_ratio'` / `'approval'` / `'ready'` → 422 `STAGE_ROLLBACK_BLOCKED`
  - 月跑進行中 → 409 `ASSIGNMENT_RUN_ALREADY_RUNNING`
  - 歷史月份 → 403 `LIST_HISTORICAL_READONLY`
  - Feature Flag 關閉 → 503 `FEATURE_NOT_ENABLED`
  - Rollback LIST_NO_A 不影響 LIST_NO_B（AC-5）
  - Rollback 後篩選條件可再編輯
  - Rollback 後 CR 開關可再修改
  - 稽核 `before_value` / `after_value` 含 stage 轉換 + `deletedDeptPctCount`
- 前端關鍵測試案例：
  - 處長 / 非 `dept_ratio` 階段 / 已停用 / 歷史月份「退回草稿」按鈕**完全不渲染**
  - 確認對話框文案 / 按鈕渲染
- E2E：F079 設定 → F081 Rollback → 確認 `ob_dept_pct` 已清空 → F079 重新設定

## 11. 實作 Checklist

- [ ] 後端新增 `POST /api/v1/assignment/lists/{listNo}/stage/rollback-to-draft` 端點 + Service
- [ ] 後端套 `DirectorGuard` + `StageTransitionService.assertStageEquals(listNo, 'dept_ratio')` + `LIST_HISTORICAL_READONLY` Guard + `AssignmentRunGuardService.assertNoRunningRun()` + `FeatureFlagGuard`
- [ ] 後端 stage 更新 + `ob_dept_pct` DELETE + 稽核寫入於同一 transaction
- [ ] 前端「退回草稿」按鈕渲染條件
- [ ] 前端確認對話框
- [ ] 圖表：[diagrams/F081-rollback-flow.mmd](../diagrams/F081-rollback-flow.mmd)
- [ ] 整合測試：F079 → F081 → F079 路徑驗證

## 12. 假設

| # | 假設 | 標記 |
|---|---|---|
| A-1 | **`StageTransitionService` 共用 helper**：本 spec 透過 `StageTransitionService.rollbackTo(listNo, 'draft')` 與 `assertStageEquals(listNo, 'dept_ratio')` 執行；helper 設計沿用 F079 §12 A-1 | [ASSUMPTION] 待 system-architect |
| A-2 | **DELETE 範圍與軟刪除權衡**：本 spec 採硬 DELETE `ob_dept_pct`；歷史追溯由稽核 `before_value` 保留快照承擔；若未來需嚴謹歷史保留可改採 `ob_dept_pct.deleted_at` 軟刪除 | [ASSUMPTION] 待 system-architect |
| A-3 | **Feature Flag gating 範圍**：F081 與 F078 / F079 / F080 / F084 / F085 / F086 / F087 / F089 同屬 `ENABLE_E07_REFACTOR_PHASE3` flag gating | 沿用 F050 v2.0 §13.2 |

## 13. 變更紀錄

| 版本 | 日期 | 變更內容 |
|---|---|---|
| v1.0 | 2026-05-15 | 初版（取代 US-111，E07 補修批次 4）：限 `stage = 'dept_ratio'` Rollback；限部長 + Admin（`DirectorGuard`）；DELETE `ob_dept_pct`；新增 `STAGE_ROLLBACK_BLOCKED` 錯誤碼；草稿為終點不可 Rollback |
| v1.1 | 2026-05-16 | **Phase 1 風險決議落地**：(1) 決議 #6：BR-8 補「`assertNoRunningRun()` 由 `AssignmentRunGuardService` 集中實現」；(2) 決議 #2：新增 BR-9 Feature Flag fallback（503 + `FEATURE_NOT_ENABLED`） |
| v1.2 | 2026-05-16 | **救援重寫**：前一輪編碼事故損毀本檔內容，依 US-111 + AD-E07 v3.0 一致性決議完整重建；保留 v1.0 / v1.1 所有設計決議 |
