---
spec-id: F080
title: 部門比例設定階段推進至個別業務比例設定
feature-id: F080
source-story: US-110
epic: E07
module: M03a 部門比例設定階段（推進至 M03b）
priority: P0-MVP
version: "1.2"
date: 2026-05-16
status: Draft
---

# F080: 部門比例設定階段推進至個別業務比例設定

Priority: P0-MVP | Status: Draft | Last Updated: 2026-05-16

> **v1.2 救援重寫（2026-05-16）**：前一輪編碼事故損毀本檔內容，依 US-110 + AD-E07 v3.0 一致性決議完整重建；Guard 為 `DirectorGuard`；業務角色欄位 `business_role`；JWT claim `businessRole`；保留 v1.0 / v1.1 所有設計決議。
> **v1.1 修訂（2026-05-16 / Phase 1 決議落地）**：月跑並發守衛集中至 `AssignmentRunGuardService.assertNoRunningRun()`（決議 #6）；Feature Flag fallback 503 + `FEATURE_NOT_ENABLED`（決議 #2）。

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + `data-model.md#ob-list-definition` + `data-model.md#ob-dept-pct-obmdeptpct--per-list-no-部門比例` + `error-handling.md#assignment-stage-transition-errors` + `error-handling.md#assignment-ratio-errors` + `error-handling.md#assignment-role-errors` |
| QA / Tester | 本文件 + `error-handling.md#assignment-stage-transition-errors` |
| UI/UX Designer | 本文件 §7 |
| Architect | 本文件 + `architecture-spec.md` §3.10 `StageTransitionService` |

---

## 對應 User Story

- 來源 Story：[US-110-M03a-advance-to-personnel-ratio.md](../../stories/epics/E07-app-customer-list-assignment/US-110-M03a-advance-to-personnel-ratio.md)
- Epic：[E07 — 客戶名單分派](../../stories/epics/E07-app-customer-list-assignment/epic-brief.md)
- 模組：M03a 部門比例設定階段（推進至 M03b 個別業務比例設定階段）

---

## 1. 功能摘要

部長 / Admin 對 `stage = 'dept_ratio'` 名單執行推進，使 `stage` 由 `'dept_ratio'` 推進至 `'personnel_ratio'`。

**範圍**：
- 僅 `stage = 'dept_ratio'` 名單可推進；非此階段一律 422 `LIST_STAGE_TRANSITION_FORBIDDEN`
- 推進前置條件：所有部門 RATION 加總 = 100%（容忍 ±0.01%；沿用 I-8）
- 推進後部門比例（`ob_dept_pct`）鎖定，後端依 `stage != 'dept_ratio'` 拒絕寫入

**Actor**：部長 + Admin；處長無推進權限

## 2. 使用者故事

**As a** 部長 / Admin
**I want** 在確認各部門比例設定正確後，將名單推進至「個別業務比例設定」階段
**So that** 流程進入第三階段，各處長可為本部門業務員設定個別分配比例

## 3. 前置條件

- 使用者持 JWT 且 `business_role = 'director'` 或 admin
- 目標 `list_no` 存在，`status = 'active'`，`stage = 'dept_ratio'`
- `ob_dept_pct` 中該 `list_no` RATION 加總落於 [99.99, 100.01]
- `project_workym >= current_work_ym`
- `assignment_run` 無 `status IN ('pending', 'running')` 紀錄

## 4. 驗收標準

### AC-1：部門比例階段顯示「推進」按鈕

- **Given** 部長 / Admin 在 F048 / F077 清單頁查看 `stage = 'dept_ratio'` 名單
- **When** 頁面顯示操作欄
- **Then** 顯示「推進至個別業務比例設定」按鈕
- **And** 處長帳號**完全不渲染**「推進」按鈕

### AC-2：推進前置條件驗證（部門比例加總 = 100%）

- **Given** 部長 / Admin 點擊「推進至個別業務比例設定」
- **When** 系統進行前置條件驗證
- **Then** 若 `ob_dept_pct` 加總 ≠ 100%（或無紀錄），回 422 `STAGE_ADVANCE_PRECONDITION_FAILED`，附訊息「請先確認各部門比例加總為 100%，再推進」
- **And** 前置條件通過後彈出確認對話框

### AC-3：確認推進對話框

- **Given** 前置條件驗證通過
- **When** 系統彈出確認對話框
- **Then** 對話框顯示：「確認將名單『{listNm}』（{listNo}）推進至個別業務比例設定階段？推進後部門比例將鎖定，無法再修改（如需修改請先 Rollback）。」
- **And** 提供「確認推進」與「取消」兩個按鈕

### AC-4：執行推進

- **Given** 部長 / Admin 點擊「確認推進」
- **When** 後端處理請求（POST `/api/v1/assignment/lists/{listNo}/stage/advance-to-personnel-ratio`）
- **Then** 系統更新 `ob_list_definition.stage` 由 `'dept_ratio'` 為 `'personnel_ratio'`
- **And** 寫入 `assignment_audit_log`（`action = 'ADVANCE_STAGE'`、before/after stage、operator_id）
- **And** 頁面顯示成功提示「名單『{listNm}』已推進至個別業務比例設定階段」，清單刷新

### AC-5：推進後部門比例不可修改

- **Given** 名單 `stage = 'personnel_ratio'`
- **When** 部長嘗試呼叫 PUT `/api/v1/assignment/ratios/dept/{listNo}`
- **Then** 後端回 422 `LIST_STAGE_TRANSITION_FORBIDDEN`（「只有部門比例設定階段才能修改部門比例」）

### AC-6：月跑執行中禁止推進

- **Given** `assignment_run.status IN ('pending', 'running')`
- **When** 部長 / Admin 嘗試推進
- **Then** 推進按鈕為 disabled，hover 顯示「分派執行中，無法推進」
- **And** 若直接呼叫 API，回 409 `ASSIGNMENT_RUN_ALREADY_RUNNING`

### AC-7：處長無推進權限

- **Given** 帳號僅持有「處長」角色
- **When** 嘗試呼叫推進 API
- **Then** 後端回 403 `AUTH_FORBIDDEN`
- **And** 清單頁無「推進」按鈕

### AC-8：歷史月份拒絕推進

- **Given** 名單 `project_workym < current_work_ym`
- **When** 部長嘗試推進
- **Then** 回 403 `LIST_HISTORICAL_READONLY`

### AC-9：稽核日誌

- **Given** 任一推進成功
- **When** 寫入完成
- **Then** `assignment_audit_log` 新增一筆 `action = 'ADVANCE_STAGE'`，含 before/after stage、operator_id、timestamp

## 5. API 規格

### 5.1 POST /api/v1/assignment/lists/{listNo}/stage/advance-to-personnel-ratio

| 用途 | 將指定名單由部門比例設定推進至個別業務比例設定 |
|---|---|
| 認證 | JWT 必填 |
| 權限 | `DirectorGuard` |

**Request Body**：（無 body）

**Response — 200 OK**

```json
{
  "listNo": "OB202605001",
  "previousStage": "dept_ratio",
  "currentStage": "personnel_ratio",
  "advancedAt": "2026-05-15T13:00:00Z",
  "advancedBy": "user-uuid-xxx"
}
```

**錯誤代碼**

| HTTP | 錯誤碼 | 說明 |
|---|---|---|
| 401 | AUTH_TOKEN_MISSING / AUTH_TOKEN_EXPIRED | 未登入或 Token 過期 |
| 403 | AUTH_FORBIDDEN | 處長嘗試推進 |
| 403 | LIST_HISTORICAL_READONLY | 歷史月份 |
| 404 | ASSIGNMENT_LIST_NOT_FOUND | `list_no` 不存在 |
| 409 | ASSIGNMENT_RUN_ALREADY_RUNNING | 月跑進行中 |
| 422 | ASSIGNMENT_LIST_INACTIVE | 名單已停用 |
| 422 | LIST_STAGE_TRANSITION_FORBIDDEN | `stage != 'dept_ratio'` |
| 422 | STAGE_ADVANCE_PRECONDITION_FAILED | 部門比例加總 ≠ 100% 或無紀錄 |
| 503 | FEATURE_NOT_ENABLED | Feature Flag 關閉 |

## 6. 業務規則

| 規則編號 | 說明 |
|---|---|
| BR-1 | **`stage = 'dept_ratio'` 限制**：透過 `StageTransitionService.assertStageEquals(listNo, 'dept_ratio')` 統一檢查 |
| BR-2 | **前置條件：部門比例加總 = 100%**：透過 `RatioValidationService.assertSumEquals100(deptRatios)` 檢查；不滿足回 422 `STAGE_ADVANCE_PRECONDITION_FAILED`（沿用 F079 容忍誤差 ±0.01%） |
| BR-3 | **角色矩陣（I-7）**：本端點限 `admin` 或 `business_role = 'director'`；處長一律 403 |
| BR-4 | **歷史月份攔截**：沿用 F077 BR-3 |
| BR-5 | **推進後部門比例鎖定**：後端依 `stage != 'dept_ratio'` 拒絕 `ob_dept_pct` 寫入（由 F079 PUT API 統一檢查） |
| BR-6 | **稽核失敗不 rollback**：沿用 F050 v2.0 BR-11 |
| BR-7 | **DB 操作原子性**：`stage` 更新 + 稽核寫入須於同一 transaction |
| BR-8 | **月跑並發守衛（v1.1 / 決議 #6）**：F080 service method 入口層呼叫 `await this.assignmentRunGuardService.assertNoRunningRun()` |
| BR-9 | **Feature Flag fallback（v1.1 / 決議 #2）**：F080 端點受 `FeatureFlagGuard` 保護；flag = false 時回 503 `FEATURE_NOT_ENABLED` |

## 7. UI/UX 需求

- **「推進至個別業務比例設定」按鈕**：
  - 位於 F048 / F077 清單頁部門比例階段名單操作欄
  - 處長身份**完全不渲染**
  - 已停用 / 非 `dept_ratio` 階段 / 歷史月份**完全不渲染**
  - 月跑進行中 disabled + hover 提示
  - 部門比例加總 ≠ 100% 時 disabled + hover 提示「請先確認部門比例加總為 100%」
- **確認對話框**：
  - 標題：「推進確認」
  - 內容：「確認將名單『{listNm}』（{listNo}）推進至個別業務比例設定階段？推進後部門比例將鎖定，無法再修改（如需修改請先 Rollback）。」
  - 按鈕：「確認推進」（primary）/「取消」
- **成功提示 toast**：「名單『{listNm}』已推進至個別業務比例設定階段」
- **推進後狀態**：清單頁該名單階段標籤更新為「個別業務比例設定」，操作欄顯示「設定個別比例」（F082）+「退回部門比例」（F085）

## 8. 依賴關係

- **Blocked By**：
  - F079（部門比例設定，產生 RATION 加總 = 100%）
  - F048 v2.0 / F077（M01 入口骨架 + 角色 × 階段操作矩陣）
- **Blocks**：
  - F082（個別業務比例設定，產生 `stage = 'personnel_ratio'` 名單後可設定）
- **Rollback 反向**：F085（個別業務比例 Rollback 至部門比例）

## 9. 交叉參照

- **權限矩陣**：[F002 §4.6 E07 角色矩陣](F002-user-login.md#e07-角色矩陣)
- **資料模型**：
  - [data-model.md#ob-list-definition](../data-model.md#ob_list_definition)（`stage` 欄位）
  - [data-model.md#ob-dept-pct-obmdeptpct--per-list-no-部門比例](../data-model.md#ob_dept_pctobmdeptpct--per-list-no-部門比例)
  - [data-model.md#current-work-ym-rule](../data-model.md#current-work-ym-rule)
- **錯誤代碼**：
  - [error-handling.md#assignment-stage-transition-errors](../error-handling.md#assignment-stage-transition-errors)
  - [error-handling.md#assignment-ratio-errors](../error-handling.md#assignment-ratio-errors)
  - [error-handling.md#assignment-role-errors](../error-handling.md#assignment-role-errors)
- **架構決議**：AD-E07-1、`StageTransitionService` helper（沿用 F079 §12 A-1）
- **相關功能**：
  - [F079](F079-set-dept-ratio.md)（部門比例設定，本 Feature 前置）
  - [F082](F082-set-personnel-ratio.md)（個別業務比例設定，本 Feature 後續）
  - [F085](F085-rollback-to-dept-ratio.md)（個別業務比例 Rollback 至部門比例，反向操作）
  - [F077](F077-month-switch-and-stage-overview.md)（M01 入口）
- **圖表**：
  - [diagrams/F080-advance-flow.mmd](../diagrams/F080-advance-flow.mmd)
  - [diagrams/F077-stage-overview.mmd](../diagrams/F077-stage-overview.mmd)

## 10. 測試覆蓋目標

- 單元測試覆蓋率 ≥ 80%
- 後端關鍵測試案例：
  - 部長推進 `stage = 'dept_ratio'`（加總 = 100%）→ 200 OK，stage 更新為 `'personnel_ratio'`，稽核寫入
  - Admin 推進 → 200 OK
  - 處長推進 → 403 `AUTH_FORBIDDEN`
  - 推進加總 = 80% → 422 `STAGE_ADVANCE_PRECONDITION_FAILED`
  - 推進加總 = 100.01 → 200 OK（容忍邊界內）
  - 推進加總 = 100.02 → 422 `STAGE_ADVANCE_PRECONDITION_FAILED`
  - 推進無 `ob_dept_pct` 紀錄 → 422 `STAGE_ADVANCE_PRECONDITION_FAILED`
  - 推進 `stage = 'draft'` / `'personnel_ratio'` / `'approval'` / `'ready'` 名單 → 422 `LIST_STAGE_TRANSITION_FORBIDDEN`
  - 月跑進行中 → 409 `ASSIGNMENT_RUN_ALREADY_RUNNING`
  - 歷史月份 → 403 `LIST_HISTORICAL_READONLY`
  - Feature Flag 關閉 → 503 `FEATURE_NOT_ENABLED`
  - 推進後嘗試 PUT 部門比例 → 422 `LIST_STAGE_TRANSITION_FORBIDDEN`
- 前端關鍵測試案例：
  - 處長 / 非 `dept_ratio` 階段 / 已停用 / 歷史月份「推進」按鈕**完全不渲染**
  - 加總 ≠ 100% 時按鈕 disabled
  - 確認對話框文案
- E2E：F079 設定加總 100% → F080 推進 → F082 設定個別業務比例

## 11. 實作 Checklist

- [ ] 後端新增 `POST /api/v1/assignment/lists/{listNo}/stage/advance-to-personnel-ratio` 端點 + Service
- [ ] 後端套 `DirectorGuard` + `StageTransitionService.assertStageEquals(listNo, 'dept_ratio')` + `RatioValidationService.assertSumEquals100(deptRatios)` + `LIST_HISTORICAL_READONLY` Guard + `AssignmentRunGuardService.assertNoRunningRun()` + `FeatureFlagGuard`
- [ ] 後端 stage 更新與稽核寫入於同一 transaction
- [ ] 前端「推進」按鈕渲染條件與加總檢查
- [ ] 前端確認對話框
- [ ] 圖表：[diagrams/F080-advance-flow.mmd](../diagrams/F080-advance-flow.mmd)
- [ ] 整合測試：F079 → F080 → F082 路徑驗證

## 12. 假設

| # | 假設 | 標記 |
|---|---|---|
| A-1 | **`StageTransitionService` 共用 helper**：本 spec 透過 `StageTransitionService.advanceTo(listNo, 'personnel_ratio')` 與 `assertStageEquals(listNo, 'dept_ratio')` 執行；helper 設計沿用 F079 §12 A-1 | [ASSUMPTION] 待 system-architect |
| A-2 | **`RatioValidationService.assertSumEquals100` 共用**：與 F079 共用同一驗證 helper，避免重複實作；helper 應接受 RATION 陣列 + 容忍誤差參數 | [ASSUMPTION] 待 system-architect |
| A-3 | **Feature Flag gating 範圍**：F080 與 F078 / F079 / F081 / F084 / F085 / F086 / F087 / F089 同屬 `ENABLE_E07_REFACTOR_PHASE3` flag gating | 沿用 F050 v2.0 §13.2 |

## 13. 變更紀錄

| 版本 | 日期 | 變更內容 |
|---|---|---|
| v1.0 | 2026-05-15 | 初版（取代 US-110，E07 補修批次 4）：限 `stage = 'dept_ratio'` 推進；限部長 + Admin（`DirectorGuard`）；前置條件「部門比例加總 = 100%」；共用 `STAGE_ADVANCE_PRECONDITION_FAILED` 錯誤碼 |
| v1.1 | 2026-05-16 | **Phase 1 風險決議落地**：(1) 決議 #6：BR-8 補「`assertNoRunningRun()` 由 `AssignmentRunGuardService` 集中實現」；(2) 決議 #2：新增 BR-9 Feature Flag fallback（503 + `FEATURE_NOT_ENABLED`） |
| v1.2 | 2026-05-16 | **救援重寫**：前一輪編碼事故損毀本檔內容，依 US-110 + AD-E07 v3.0 一致性決議完整重建；保留 v1.0 / v1.1 所有設計決議 |
