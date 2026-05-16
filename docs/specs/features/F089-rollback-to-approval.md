---
spec-id: F089
title: 準備完成階段 Rollback 至簽核（月跑前重新審核）
feature-id: F089
source-story: US-119
epic: E07
module: M03d 準備完成階段（Rollback）
priority: P0-MVP
version: "1.2"
date: 2026-05-16
status: Draft
---

# F089: 準備完成階段 Rollback 至簽核（月跑前重新審核）

Priority: P0-MVP | Status: Draft | Last Updated: 2026-05-16

> **v1.2 救援重寫（2026-05-16）**：前一輪編碼事故損毀本檔內容，依 US-119 + AD-E07 v3.0 一致性決議完整重建；Guard 為 `DirectorGuard`（處長無 Rollback 權限）；業務角色欄位 `business_role`；JWT claim `businessRole`；保留 v1.0 / v1.1 所有設計決議。
> **v1.1 修訂（2026-05-16 / Phase 1 決議落地）**：月跑並發守衛集中至 `AssignmentRunGuardService.assertNoRunningRun()`（決議 #6）；Feature Flag fallback 503 + `FEATURE_NOT_ENABLED`（決議 #2）。

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + `data-model.md#ob-list-definition` + `error-handling.md#assignment-stage-transition-errors` + `error-handling.md#assignment-role-errors` |
| QA / Tester | 本文件 + `error-handling.md#assignment-stage-transition-errors` |
| UI/UX Designer | 本文件 §7 |
| Architect | 本文件 + `architecture-spec.md` §3.10 `StageTransitionService` |

---

## 對應 User Story

- 來源 Story：[US-119-M03d-rollback-to-approval.md](../../stories/epics/E07-app-customer-list-assignment/US-119-M03d-rollback-to-approval.md)
- Epic：[E07 — 客戶名單分派](../../stories/epics/E07-app-customer-list-assignment/epic-brief.md)
- 模組：M03d 準備完成階段（Rollback 至 M03c）

---

## 1. 功能摘要

部長 / Admin 對 `stage = 'ready'` 名單執行 Rollback，使 `stage` 退回至 `'approval'`，名單從準備完成清單移出，等待重新核准或拒絕。設定資料**全部保留**，不清空。

**範圍**：
- 僅 `stage = 'ready'` 名單可 Rollback；非此階段一律 422 `STAGE_ROLLBACK_BLOCKED`
- Rollback 語意：「退回」（月跑前最後一道退回機制）
- 設定資料保留：`ob_list_definition` 篩選條件、`ob_dept_pct`、`ob_empl_set`、CR 開關**全部保留不清空**

**Actor**：部長 + Admin；處長無 Rollback 權限

## 2. 使用者故事

**As a** 部長 / Admin
**I want** 在月跑執行前發現問題，將「準備完成」階段的名單退回至「簽核」階段，讓部長重新審核設定
**So that** 月跑前有最後一道退回機制，避免帶著錯誤設定執行月跑；退回後名單從準備完成清單移出

## 3. 前置條件

- 使用者持 JWT 且 `business_role = 'director'` 或 admin
- 目標 `list_no` 存在，`status = 'active'`，`stage = 'ready'`
- `project_workym >= current_work_ym`
- `assignment_run` 無 `status IN ('pending', 'running')` 紀錄

## 4. 驗收標準

### AC-1：準備完成階段顯示「退回簽核」按鈕

- **Given** 部長 / Admin 在 F048 / F077 清單頁或 F088 準備完成清單頁查看 `stage = 'ready'` 名單
- **When** 頁面顯示操作欄
- **Then** 顯示「退回簽核」按鈕
- **And** 處長帳號**完全不渲染**「退回簽核」按鈕

### AC-2：Rollback 確認對話框

- **Given** 部長 / Admin 點擊「退回簽核」
- **When** 系統彈出確認對話框
- **Then** 對話框顯示：「確認將名單『{listNm}』（{listNo}）退回簽核階段？退回後名單將從準備完成清單移出，需重新核准才能再次進入準備完成。設定資料不受影響。」
- **And** 提供「確認退回」與「取消」兩個按鈕

### AC-3：執行 Rollback

- **Given** 部長 / Admin 點擊「確認退回」
- **When** 後端處理請求（POST `/api/v1/assignment/lists/{listNo}/stage/rollback-to-approval`）
- **Then** 系統執行：
  1. UPDATE `ob_list_definition.stage` 由 `'ready'` 為 `'approval'`
  2. 設定資料（篩選條件 / `ob_dept_pct` / `ob_empl_set` / CR 開關）**全部保留不清空**
  3. 寫入 `assignment_audit_log`（`action = 'ROLLBACK_STAGE'`、`before_value = { stage: 'ready' }`、`after_value = { stage: 'approval' }`）
- **And** 頁面顯示成功提示「名單『{listNm}』已退回簽核階段，設定資料保留」，清單刷新

### AC-4：退回後名單從準備完成清單移出

- **Given** 名單已 Rollback 至 `'approval'`
- **When** 部長或處長進入 F088 準備完成查詢頁
- **Then** 該名單**不再出現**於準備完成清單
- **And** 在 F077 五階段總覽中，該名單階段標籤更新為「簽核」

### AC-5：退回後可重新核准或拒絕（設定資料保留）

- **Given** 名單已退回至 `'approval'`
- **When** 部長在簽核階段查看該名單
- **Then** 可直接呼叫 F086（核准）或 F087（拒絕）
- **And** 查看設定摘要時，篩選條件、部門比例、個別業務比例、CR 開關均顯示為退回前的原設定值（資料保留）

### AC-6：月跑執行中禁止 Rollback

- **Given** `assignment_run.status IN ('pending', 'running')`
- **When** 部長 / Admin 嘗試 Rollback
- **Then** 按鈕為 disabled，hover 顯示「分派執行中，無法退回階段」
- **And** 若直接呼叫 API，回 409 `ASSIGNMENT_RUN_ALREADY_RUNNING`

### AC-7：處長無 Rollback 權限

- **Given** 帳號僅持有「處長」角色
- **When** 嘗試呼叫 Rollback API
- **Then** 後端回 403 `AUTH_FORBIDDEN`
- **And** 清單頁無「退回簽核」按鈕

### AC-8：歷史月份拒絕 Rollback

- **Given** 名單 `project_workym < current_work_ym`
- **When** 部長嘗試 Rollback
- **Then** 回 403 `LIST_HISTORICAL_READONLY`

### AC-9：非 `ready` 階段拒絕 Rollback

- **Given** 名單 `stage` 為其他階段
- **When** 呼叫 Rollback API
- **Then** 後端回 422 `STAGE_ROLLBACK_BLOCKED`

### AC-10：F088 月跑前置條件提示即時更新

- **Given** 本月 3 份名單均為 `'ready'`，F088 顯示「所有名單已就緒」
- **When** 部長對其中 1 份執行 Rollback
- **Then** F088 頁面提示更新為「以下名單尚未就緒：{listNm_X}（簽核）」警告提示

### AC-11：稽核日誌

- **Given** 任一 Rollback 成功
- **When** 寫入完成
- **Then** `assignment_audit_log` 新增一筆 `action = 'ROLLBACK_STAGE'`，含 before/after stage、operator_id、timestamp

## 5. API 規格

### 5.1 POST /api/v1/assignment/lists/{listNo}/stage/rollback-to-approval

| 用途 | 將指定名單由準備完成 Rollback 至簽核（設定資料保留） |
|---|---|
| 認證 | JWT 必填 |
| 權限 | `DirectorGuard` |

**Request Body**：（無 body）

**Response — 200 OK**

```json
{
  "listNo": "OB202605001",
  "previousStage": "ready",
  "currentStage": "approval",
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
| 422 | STAGE_ROLLBACK_BLOCKED | `stage != 'ready'` |
| 503 | FEATURE_NOT_ENABLED | Feature Flag 關閉 |

## 6. 業務規則

| 規則編號 | 說明 |
|---|---|
| BR-1 | **`stage = 'ready'` 限制**：透過 `StageTransitionService.assertStageEquals(listNo, 'ready')` 統一檢查 |
| BR-2 | **角色矩陣（I-7）**：本端點限 `admin` 或 `business_role = 'director'`；處長一律 403 |
| BR-3 | **歷史月份攔截**：沿用 F077 BR-3 |
| BR-4 | **設定資料保留**：本 Rollback 僅更新 `stage`，**不刪除**任何 `ob_dept_pct` / `ob_empl_set` / `ob_list_definition` 設定欄位資料；與 F081 / F085 / F087 之 Rollback 行為不同 |
| BR-5 | **DB 操作原子性**：UPDATE stage + 稽核寫入須於同一 transaction |
| BR-6 | **稽核失敗不 rollback**：沿用 F050 v2.0 BR-11 |
| BR-7 | **F088 動態提示**：F088 顯示「所有名單已就緒」/「以下名單尚未就緒」之邏輯依 `stage = 'ready'` 名單數動態計算；本 Rollback 觸發後 F088 須重新計算 |
| BR-8 | **與 F087 之差異**：F087（拒絕）將 `approval` 退回 `personnel_ratio` 並清空 `ob_empl_set`；本 spec（F089）將 `ready` 退回 `approval`，**不清空任何資料**；兩者目的不同（拒絕 = 重新設定；F089 Rollback = 重新審核） |
| BR-9 | **月跑並發守衛（v1.1 / 決議 #6）**：F089 service method 入口層呼叫 `await this.assignmentRunGuardService.assertNoRunningRun()` |
| BR-10 | **Feature Flag fallback（v1.1 / 決議 #2）**：F089 端點受 `FeatureFlagGuard` 保護；flag = false 時回 503 `FEATURE_NOT_ENABLED` |

## 7. UI/UX 需求

- **「退回簽核」按鈕**：
  - 位於 F048 / F077 清單頁準備完成階段名單操作欄、F088 準備完成清單頁操作欄
  - 處長身份**完全不渲染**
  - 已停用 / 非 `ready` 階段 / 歷史月份**完全不渲染**
  - 月跑進行中 disabled + hover 提示
- **確認對話框**：
  - 標題：「Rollback 確認」
  - 內容：「確認將名單『{listNm}』（{listNo}）退回簽核階段？退回後名單將從準備完成清單移出，需重新核准才能再次進入準備完成。設定資料不受影響。」
  - 按鈕：「確認退回」（warning）/「取消」
- **成功提示 toast**：「名單『{listNm}』已退回簽核階段，設定資料保留」
- **Rollback 後狀態**：清單頁該名單階段標籤更新為「簽核」，操作欄顯示「核准」（F086）+「拒絕」（F087）
- **F088 即時更新**：F088 頁面之「月跑前置條件提示」依本 Rollback 動態重新計算

## 8. 依賴關係

- **Blocked By**：
  - F086（核准，產生 `stage = 'ready'` 名單）
  - F048 v2.0 / F077（M01 入口骨架 + 角色 × 階段操作矩陣）
- **Blocks**：
  - 退回後，F086（核准）+ F087（拒絕）重新開放
- **月跑關聯**：
  - F061 / F081（月跑觸發）依賴所有名單為 `'ready'`；本 Rollback 後該名單不再計入 ready，月跑前提條件重新失效

## 9. 交叉參照

- **權限矩陣**：[F002 §4.6 E07 角色矩陣](F002-user-login.md#e07-角色矩陣)
- **資料模型**：
  - [data-model.md#ob-list-definition](../data-model.md#ob_list_definition)
  - [data-model.md#current-work-ym-rule](../data-model.md#current-work-ym-rule)
- **錯誤代碼**：
  - [error-handling.md#assignment-stage-transition-errors](../error-handling.md#assignment-stage-transition-errors)（`STAGE_ROLLBACK_BLOCKED`）
  - [error-handling.md#assignment-role-errors](../error-handling.md#assignment-role-errors)
- **架構決議**：AD-E07-1、`StageTransitionService` helper（沿用 F079 §12 A-1）
- **相關功能**：
  - [F086](F086-approve-to-ready.md)（核准，本 Feature 反向操作）
  - [F087](F087-reject-list.md)（拒絕，退回後可執行）
  - [F088](F088-ready-list-summary.md)（準備完成查詢，退回後移出清單）
  - [F081](F081-rollback-to-draft.md)（M03a Rollback，對稱結構但有清空差異）
  - [F085](F085-rollback-to-dept-ratio.md)（M03b Rollback，對稱結構但有清空差異）
  - [F077](F077-month-switch-and-stage-overview.md)（M01 入口）
- **圖表**：
  - [diagrams/F089-rollback-flow.mmd](../diagrams/F089-rollback-flow.mmd)
  - [diagrams/F077-stage-overview.mmd](../diagrams/F077-stage-overview.mmd)

## 10. 測試覆蓋目標

- 單元測試覆蓋率 ≥ 80%
- 後端關鍵測試案例：
  - 部長 Rollback `stage = 'ready'`（含完整設定）→ 200 OK，stage 退回 `'approval'`，`ob_dept_pct` / `ob_empl_set` row 數**不變**，稽核寫入
  - Admin Rollback → 200 OK
  - 處長 Rollback → 403 `AUTH_FORBIDDEN`
  - Rollback `stage = 'draft'` / `'dept_ratio'` / `'personnel_ratio'` / `'approval'` → 422 `STAGE_ROLLBACK_BLOCKED`
  - 月跑進行中 → 409 `ASSIGNMENT_RUN_ALREADY_RUNNING`
  - 歷史月份 → 403 `LIST_HISTORICAL_READONLY`
  - Feature Flag 關閉 → 503 `FEATURE_NOT_ENABLED`
  - Rollback 後可重新呼叫 F086 核准 → 200 OK，重回 ready
  - Rollback 後可重新呼叫 F087 拒絕 → 200 OK，退回 personnel_ratio
  - 設定資料保留：Rollback 前後 `ob_dept_pct` / `ob_empl_set` / 篩選條件 row 數不變
  - 稽核 `before_value` / `after_value` 含 stage 轉換完整資訊
- 前端關鍵測試案例：
  - 處長 / 非 `ready` 階段 / 已停用 / 歷史月份「退回簽核」按鈕**完全不渲染**
  - 確認對話框文案 / 按鈕渲染
  - F088 月跑前置條件提示即時更新（AC-10）
- E2E：F086 核准 → F088 顯示在準備完成清單 → F089 Rollback → F088 移出 → F086 重新核准 → 再回 F088

## 11. 實作 Checklist

- [ ] 後端新增 `POST /api/v1/assignment/lists/{listNo}/stage/rollback-to-approval` 端點 + Service
- [ ] 後端套 `DirectorGuard` + `StageTransitionService.assertStageEquals(listNo, 'ready')` + `LIST_HISTORICAL_READONLY` Guard + `AssignmentRunGuardService.assertNoRunningRun()` + `FeatureFlagGuard`
- [ ] 後端 stage 更新與稽核寫入於同一 transaction（不動其他資料）
- [ ] 前端「退回簽核」按鈕渲染條件（清單頁 + F088）
- [ ] 前端確認對話框
- [ ] 前端 F088 月跑前置條件提示即時更新邏輯
- [ ] 圖表：[diagrams/F089-rollback-flow.mmd](../diagrams/F089-rollback-flow.mmd)
- [ ] 整合測試：F086 → F088 → F089 → F086 路徑驗證

## 12. 假設

| # | 假設 | 標記 |
|---|---|---|
| A-1 | **`StageTransitionService` 共用 helper**：本 spec 透過 `StageTransitionService.rollbackTo(listNo, 'approval')` 與 `assertStageEquals(listNo, 'ready')` 執行；helper 設計沿用 F079 §12 A-1 | [ASSUMPTION] 待 system-architect |
| A-2 | **F088 即時更新機制**：本 Rollback 後 F088 之動態提示更新可採用「前端輪詢 GET /api/v1/assignment/lists?stage=ready」或「後端 SSE / WebSocket」；MVP 採前端輪詢（每 30 秒）+ 操作後即時 invalidate cache 模式 | [ASSUMPTION] 待 system-architect |
| A-3 | **與 F087 之分工**：本 spec（F089）為 `ready → approval` 不清空；F087（拒絕）為 `approval → personnel_ratio` 清空 `ob_empl_set`；兩者均屬「退回 1 階段」但用途不同（F089 = 重新審核；F087 = 重新設定） | [DECISION] |
| A-4 | **Feature Flag gating 範圍**：F089 與 F078 / F079 / F080 / F081 / F084 / F085 / F086 / F087 同屬 `ENABLE_E07_REFACTOR_PHASE3` flag gating | 沿用 F050 v2.0 §13.2 |

## 13. 變更紀錄

| 版本 | 日期 | 變更內容 |
|---|---|---|
| v1.0 | 2026-05-15 | 初版（取代 US-119，E07 補修批次 4 / OQ-C-02 確認新增）：限 `stage = 'ready'` Rollback；限部長 + Admin（`DirectorGuard`）；**設定資料保留不清空**；新增 F088 即時更新機制；與 F087 分工說明 |
| v1.1 | 2026-05-16 | **Phase 1 風險決議落地**：(1) 決議 #6：BR-9 補「`assertNoRunningRun()` 由 `AssignmentRunGuardService` 集中實現」；(2) 決議 #2：新增 BR-10 Feature Flag fallback（503 + `FEATURE_NOT_ENABLED`） |
| v1.2 | 2026-05-16 | **救援重寫**：前一輪編碼事故損毀本檔內容，依 US-119 + AD-E07 v3.0 一致性決議完整重建；保留 v1.0 / v1.1 所有設計決議 |
