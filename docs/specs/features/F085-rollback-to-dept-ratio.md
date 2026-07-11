---
spec-id: F085
title: 個別業務比例設定階段 Rollback 至部門比例設定
feature-id: F085
source-story: US-115
epic: E07
module: M03b 個別業務比例設定階段（Rollback）
priority: P0-MVP
version: "1.3.1"
date: 2026-05-21
status: Draft
---

# F085: 個別業務比例設定階段 Rollback 至部門比例設定

Priority: P0-MVP | Status: Draft | Last Updated: 2026-05-21

> **v1.3.1（2026-05-21 / Phase 5 TDD code drift 修正 / D1）**：對齊 `AssignmentAuditLog.action` entity enum（`apps/api/src/database/entities/assignment-audit-log.entity.ts:26-39`）：(1) 將 spec 內 `action = 'STAGE_ROLLBACK'` 字串修正為 **`action = 'STAGE_ROLLBACK'`**（AC-3 / AC-10）；(2) §12 A-3 假設行內之語意分工描述「`ROLLBACK_STAGE` vs `REJECT`」修正為「`STAGE_ROLLBACK` vs `STAGE_REJECT`」（兩個 enum 均對齊 entity，VARCHAR(30)）；不變動 entity / migration / code / prototype；不變更其他 BR / AC / 業務邏輯。
>
> **v1.3（2026-05-21 / M01 v2.0~v2.3 Kanban 重構 / US-115 v2.0）**：核心變更：
> 1. **§4 AC-1 修訂**：入口由 F048 v1.0 表格列改為 [F048 v2.0](F048-view-list-definition.md) Kanban 主頁 `personnel_ratio` 階段卡片操作欄之「退回」按鈕（灰色邊框 + undo-2 icon），依 [F077 v1.3 BR-7](F077-month-switch-and-stage-overview.md) Role × Stage 矩陣渲染。
> 2. **§4 AC-3 補充**：Rollback 成功後 toast 訊息為 `info` 樣式「已退回部門比例 — 處長設定將清空」；Kanban 卡片即時遷移欄位（從 `personnel_ratio` 欄移至 `dept_ratio` 欄，無跳頁）。
> 3. **§7 UI/UX 補入口與遷移行為**：按鈕渲染條件 reference F077 v1.3 BR-7（不重複定義）；卡片遷移動畫沿用 prototype `27-list-definition.html` `rollbackStage()` mock 行為。
> 4. **本 v1.3 不變更既有業務邏輯**（API endpoint / DELETE ob_empl_set / 部門比例保留不清空 / Transaction 原子性 / 月名單分派鎖 / 稽核 / Feature Flag）；僅入口位置與成功 toast 行為變更。
>
> **v1.2 救援重寫（2026-05-16）**：前一輪編碼事故損毀本檔內容，依 US-115 + AD-E07 v3.0 一致性決議完整重建；Guard 為 `DirectorGuard`（處長無 Rollback 權限）；業務角色欄位 `business_role`；JWT claim `businessRole`；保留 v1.0 / v1.1 所有設計決議。
> **v1.1 修訂（2026-05-16 / Phase 1 決議落地）**：月名單分派並發守衛集中至 `AssignmentRunGuardService.assertNoRunningRun()`（決議 #6）；Feature Flag fallback 503 + `FEATURE_NOT_ENABLED`（決議 #2）。

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + `data-model.md#ob-list-definition` + `data-model.md#ob-empl-set-obemplsetmf--人員比例設定` + `data-model.md#ob-dept-pct-obmdeptpct--per-list-no-部門比例` + `error-handling.md#assignment-stage-transition-errors` + `error-handling.md#assignment-role-errors` |
| QA / Tester | 本文件 + `error-handling.md#assignment-stage-transition-errors` |
| UI/UX Designer | 本文件 §7 |
| Architect | 本文件 + `architecture-spec.md` §3.10 `StageTransitionService` |

---

## 對應 User Story

- 來源 Story：[US-115-M03b-rollback-to-dept-ratio.md](../../stories/epics/E07-app-customer-list-assignment/US-115-M03b-rollback-to-dept-ratio.md)
- Epic：[E07 — 客戶名單分派](../../stories/epics/E07-app-customer-list-assignment/epic-brief.md)
- 模組：M03b 個別業務比例設定階段（Rollback 至 M03a）

---

## 1. 功能摘要

部長 / Admin 對 `stage = 'personnel_ratio'` 名單執行 Rollback，使 `stage` 退回至 `'dept_ratio'`，並**清空所有部門**已設定的個別業務員 RATION（`ob_empl_set`）。部門比例（`ob_dept_pct`）保留不清空。

**範圍**：
- 僅 `stage = 'personnel_ratio'` 名單可 Rollback；非此階段一律 422 `STAGE_ROLLBACK_BLOCKED`
- Rollback 語意：「退回」，非「取消」
- 清空本階段資料：`ob_empl_set` 中對應 `(project_workym, list_no)` **所有部門**之紀錄 DELETE
- 部門比例（`ob_dept_pct`）**不清空**，保留原設定

**Actor**：部長 + Admin；處長無 Rollback 權限（與 F081 對稱）

## 2. 使用者故事

**As a** 部長 / Admin
**I want** 將處於「個別業務比例設定」階段的名單退回至「部門比例設定」階段
**So that** 當部門比例策略需要重新調整時，能清空所有處長的個別業務比例設定，從部門比例重新開始

## 3. 前置條件

- 使用者持 JWT 且 `business_role = 'director'` 或 admin
- 目標 `list_no` 存在，`status = 'active'`，`stage = 'personnel_ratio'`
- `project_workym >= current_work_ym`
- `assignment_run` 無 `status IN ('pending', 'running')` 紀錄

## 4. 驗收標準

### AC-1：個別業務比例階段顯示「退回」按鈕（v1.3 修訂 / US-115 v2.0）

- **Given** 部長 / Admin 在 [F048 v2.0](F048-view-list-definition.md) Kanban 主頁 `personnel_ratio` 欄查看名單卡片
- **When** 頁面渲染卡片操作按鈕
- **Then** 卡片操作欄顯示「退回」按鈕（灰色邊框 / `text-gray-700 border-border hover:bg-gray-50`，附 undo-2 icon）
- **And** 處長帳號**完全不渲染**「退回」按鈕（依 [F077 v1.3 BR-7](F077-month-switch-and-stage-overview.md) 矩陣 `personnel_ratio` × `section_chief` cell 僅顯示「設定本部門」+「查看」）
- **And** 渲染條件依 [F077 v1.3 BR-7](F077-month-switch-and-stage-overview.md) 5 個橫切條件（歷史月份 / 月名單分派鎖 / 已停用 / 處長轄區 / 「查看」通用性）；本 spec 不重複定義

### AC-2：Rollback 確認對話框

- **Given** 部長 / Admin 點擊「退回部門比例設定」
- **When** 系統彈出確認對話框
- **Then** 對話框顯示：「確認將名單『{listNm}』（{listNo}）退回部門比例設定階段？退回後，**所有部門的個別業務比例設定將全部清空**，各處長需重新設定。部門比例設定保留不受影響。」
- **And** 提供「確認退回」與「取消」兩個按鈕

### AC-3：執行 Rollback

- **Given** 部長 / Admin 點擊「確認退回」
- **When** 後端處理請求（POST `/api/v1/assignment/lists/{listNo}/stage/rollback-to-dept-ratio`）
- **Then** 系統執行：
  1. UPDATE `ob_list_definition.stage` 由 `'personnel_ratio'` 為 `'dept_ratio'`
  2. DELETE FROM `ob_empl_set` WHERE `(project_workym, list_no)` 對應紀錄（**所有部門**）
  3. 寫入 `assignment_audit_log`（`action = 'STAGE_ROLLBACK'`、`before_value = { stage: 'personnel_ratio' }`、`after_value = { stage: 'dept_ratio', deletedEmplSetCount: N }`）
- **And** `ob_dept_pct` **不清空**，保留原設定
- **And** 頁面顯示成功提示 toast（**info 樣式**，藍色）「已退回部門比例 — 處長設定將清空」（v1.3 修訂 / US-115 v2.0）
- **And** Kanban 卡片即時從 `personnel_ratio` 欄遷移至 `dept_ratio` 欄（無跳頁，無 full page reload；前端 React state 更新 + 卡片動畫過渡）；對應 prototype `27-list-definition.html` `rollbackStage()` mock 行為

### AC-4：Rollback 後部門比例可再修改

- **Given** 名單已 Rollback 至 `'dept_ratio'`
- **When** 部長在部門比例設定頁查看
- **Then** 部門比例（RATION）顯示（保留原值，未清空），可再度進入編輯模式修改

### AC-5：Rollback 後個別業務比例為空

- **Given** 名單已 Rollback 至 `'dept_ratio'`
- **When** 部長或處長嘗試進入個別業務比例設定頁（此時 `stage = 'dept_ratio'`，非 `'personnel_ratio'`）
- **Then** 系統不允許進入（stage 不符），頁面顯示「此名單目前處於部門比例設定階段，尚未進入個別業務比例設定」

### AC-6：月名單分派執行中禁止 Rollback

- **Given** `assignment_run.status IN ('pending', 'running')`
- **When** 部長 / Admin 嘗試 Rollback
- **Then** 按鈕為 disabled，hover 顯示「分派執行中，無法退回階段」
- **And** 若直接呼叫 API，回 409 `ASSIGNMENT_RUN_ALREADY_RUNNING`

### AC-7：處長無 Rollback 權限

- **Given** 帳號僅持有「處長」角色
- **When** 嘗試呼叫 Rollback API
- **Then** 後端回 403 `AUTH_FORBIDDEN`
- **And** 清單頁無「退回」按鈕

### AC-8：歷史月份拒絕 Rollback

- **Given** 名單 `project_workym < current_work_ym`
- **When** 部長嘗試 Rollback
- **Then** 回 403 `LIST_HISTORICAL_READONLY`

### AC-9：非 `personnel_ratio` 階段拒絕 Rollback

- **Given** 名單 `stage` 為其他階段
- **When** 呼叫 Rollback API
- **Then** 後端回 422 `STAGE_ROLLBACK_BLOCKED`

### AC-10：稽核日誌

- **Given** 任一 Rollback 成功
- **When** 寫入完成
- **Then** `assignment_audit_log` 新增一筆 `action = 'STAGE_ROLLBACK'`，含 before/after stage、`deletedEmplSetCount`、operator_id、timestamp

## 5. API 規格

### 5.1 POST /api/v1/assignment/lists/{listNo}/stage/rollback-to-dept-ratio

| 用途 | 將指定名單由個別業務比例設定 Rollback 至部門比例設定（清空 ob_empl_set） |
|---|---|
| 認證 | JWT 必填 |
| 權限 | `DirectorGuard` |

**Request Body**：（無 body）

**Response — 200 OK**

```json
{
  "listNo": "OB202605001",
  "previousStage": "personnel_ratio",
  "currentStage": "dept_ratio",
  "deletedEmplSetCount": 10,
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
| 409 | ASSIGNMENT_RUN_ALREADY_RUNNING | 月名單分派進行中 |
| 422 | ASSIGNMENT_LIST_INACTIVE | 名單已停用 |
| 422 | STAGE_ROLLBACK_BLOCKED | `stage != 'personnel_ratio'` |
| 503 | FEATURE_NOT_ENABLED | Feature Flag 關閉 |

## 6. 業務規則

| 規則編號 | 說明 |
|---|---|
| BR-1 | **`stage = 'personnel_ratio'` 限制**：透過 `StageTransitionService.assertStageEquals(listNo, 'personnel_ratio')` 統一檢查 |
| BR-2 | **角色矩陣（I-7）**：本端點限 `admin` 或 `business_role = 'director'`；處長一律 403（與 F081 對稱） |
| BR-3 | **歷史月份攔截**：沿用 F077 BR-3 |
| BR-4 | **清空所有部門 `ob_empl_set`**：DELETE `ob_empl_set` WHERE `(project_workym, list_no)`，**不限定** `dept_code`；`ob_dept_pct` 不清空 |
| BR-5 | **DB 操作原子性**：UPDATE stage + DELETE `ob_empl_set` + 稽核寫入須於同一 transaction |
| BR-6 | **稽核失敗不 rollback**：沿用 F050 v2.0 BR-11 |
| BR-7 | **與 F087 之差異**：F087（拒絕）亦為 `personnel_ratio` 退回機制，但由 `approval` 階段觸發；本 spec（F085）由 `personnel_ratio` 階段主動退回，路徑不同但清空效果類似 |
| BR-8 | **月名單分派並發守衛（v1.1 / 決議 #6）**：F085 service method 入口層呼叫 `await this.assignmentRunGuardService.assertNoRunningRun()` |
| BR-9 | **Feature Flag fallback（v1.1 / 決議 #2）**：F085 端點受 `FeatureFlagGuard` 保護；flag = false 時回 503 `FEATURE_NOT_ENABLED` |

## 7. UI/UX 需求（v1.3 重寫）

### 7.1 「退回」按鈕（v1.3 / US-115 v2.0）

- **入口位置**：[F048 v2.0](F048-view-list-definition.md) Kanban 主頁 `personnel_ratio` 階段卡片操作欄
- **按鈕文字**：「退回」（簡短，配合 Kanban 卡片空間限制）
- **按鈕樣式**：灰色邊框（`text-gray-700 border-border hover:bg-gray-50`），附 undo-2 icon
- **渲染條件**：依 [F077 v1.3 BR-7](F077-month-switch-and-stage-overview.md) Role × Stage 矩陣 — 僅 `personnel_ratio` 階段 + `director` / `admin` role 渲染
- **歷史月份 / 月名單分派鎖中 / 處長 / 已停用**：依 [F077 v1.3 BR-7](F077-month-switch-and-stage-overview.md) 5 個橫切條件（C-1 / C-2 / C-3 / C-4），本 spec 不重複定義

### 7.2 確認對話框

- 標題：「Rollback 確認」
- 內容：「確認將名單『{listNm}』（{listNo}）退回部門比例設定階段？退回後，**所有部門的個別業務比例設定將全部清空**，各處長需重新設定。部門比例設定保留不受影響。」
- 按鈕：「確認退回」（warning 樣式）/「取消」

### 7.3 成功提示 toast（v1.3 修訂 / US-115 v2.0）

- Toast 樣式：**info**（藍色背景 `bg-blue-50` + 邊框 `border-blue-200` + 文字 `text-blue-800`）
- 主訊息：「已退回部門比例 — 處長設定將清空」
- Kanban 即時刷新：該名單卡片從 `personnel_ratio` 欄遷移至 `dept_ratio` 欄，無頁面跳轉
- Prototype canonical reference：`27-list-definition.html` `rollbackStage()` 函式 + `STAGE_PREV_TOAST.personnel_ratio`

### 7.4 Rollback 後狀態（v1.3 補述）

- Kanban `dept_ratio` 欄該名單卡片之操作按鈕欄依 [F077 v1.3 BR-7](F077-month-switch-and-stage-overview.md) 矩陣顯示：設定（F079）/ 退回（F081，再退回至 draft）/ 查看
- 部門比例（`ob_dept_pct`）保留原設定，處長可重新進入 F082 設定個別比例

## 8. 依賴關係

- **Blocked By**：
  - F082（個別業務比例設定，產生待清空資料）
  - F080（推進至個別業務比例階段，本 Feature 為其反向操作）
  - F048 v2.0 / F077（M01 入口骨架 + 角色 × 階段操作矩陣）
- **Blocks**：
  - 退回後，F079（部門比例設定）+ F080（再次推進）重新開放

## 9. 交叉參照

- **權限矩陣**：[F002 §4.6 E07 角色矩陣](F002-user-login.md#e07-角色矩陣)
- **資料模型**：
  - [data-model.md#ob-list-definition](../data-model.md#ob_list_definition)
  - [data-model.md#ob-empl-set-obemplsetmf--人員比例設定](../data-model.md#ob_empl_setobemplsetmf--人員比例設定)
  - [data-model.md#ob-dept-pct-obmdeptpct--per-list-no-部門比例](../data-model.md#ob_dept_pctobmdeptpct--per-list-no-部門比例)
  - [data-model.md#current-work-ym-rule](../data-model.md#current-work-ym-rule)
- **錯誤代碼**：
  - [error-handling.md#assignment-stage-transition-errors](../error-handling.md#assignment-stage-transition-errors)（`STAGE_ROLLBACK_BLOCKED`）
  - [error-handling.md#assignment-role-errors](../error-handling.md#assignment-role-errors)
- **架構決議**：AD-E07-1、`StageTransitionService` helper（沿用 F079 §12 A-1）
- **相關功能**：
  - [F080](F080-advance-to-personnel-ratio.md)（推進至個別業務比例，本 Feature 反向操作）
  - [F082](F082-set-personnel-ratio.md)（個別業務比例設定，本 Feature 清空目標）
  - [F079](F079-set-dept-ratio.md)（部門比例設定，退回後可再修改）
  - [F081](F081-rollback-to-draft.md)（M03a Rollback，對稱結構）
  - [F087](F087-reject-list.md)（拒絕，類似清空但由 approval 觸發）
  - [F077](F077-month-switch-and-stage-overview.md)（M01 入口）
- **圖表**：
  - [diagrams/F085-rollback-flow.mmd](../diagrams/F085-rollback-flow.mmd)
  - [diagrams/F077-stage-overview.mmd](../diagrams/F077-stage-overview.mmd)

## 10. 測試覆蓋目標

- 單元測試覆蓋率 ≥ 80%
- 後端關鍵測試案例：
  - 部長 Rollback `stage = 'personnel_ratio'`（3 部門 10 筆 RATION）→ 200 OK，stage 退回 `'dept_ratio'`，`ob_empl_set` 清空 10 筆，`ob_dept_pct` 保留，稽核寫入
  - Admin Rollback → 200 OK
  - 處長 Rollback → 403 `AUTH_FORBIDDEN`
  - Rollback `stage = 'draft'` / `'dept_ratio'` / `'approval'` / `'ready'` → 422 `STAGE_ROLLBACK_BLOCKED`
  - 月名單分派進行中 → 409 `ASSIGNMENT_RUN_ALREADY_RUNNING`
  - 歷史月份 → 403 `LIST_HISTORICAL_READONLY`
  - Feature Flag 關閉 → 503 `FEATURE_NOT_ENABLED`
  - Rollback 後部門比例 (`ob_dept_pct`) row 數不變
  - Rollback 後可再 PUT 部門比例修改
  - 稽核 `before_value` / `after_value` 含 `deletedEmplSetCount`
- 前端關鍵測試案例：
  - 處長 / 非 `personnel_ratio` 階段 / 已停用 / 歷史月份「退回」按鈕**完全不渲染**
  - 確認對話框文案 / 按鈕渲染
- E2E：F082 設定 → F085 Rollback → 確認 `ob_empl_set` 已清空、`ob_dept_pct` 保留 → F079 重新修改部門比例

## 11. 實作 Checklist

- [ ] 後端新增 `POST /api/v1/assignment/lists/{listNo}/stage/rollback-to-dept-ratio` 端點 + Service
- [ ] 後端套 `DirectorGuard` + `StageTransitionService.assertStageEquals(listNo, 'personnel_ratio')` + `LIST_HISTORICAL_READONLY` Guard + `AssignmentRunGuardService.assertNoRunningRun()` + `FeatureFlagGuard`
- [ ] 後端 stage 更新 + `ob_empl_set` DELETE + 稽核寫入於同一 transaction
- [ ] 前端「退回」按鈕渲染條件
- [ ] 前端確認對話框
- [ ] 圖表：[diagrams/F085-rollback-flow.mmd](../diagrams/F085-rollback-flow.mmd)
- [ ] 整合測試：F082 → F085 → F079 路徑驗證

## 12. 假設

| # | 假設 | 標記 |
|---|---|---|
| A-1 | **`StageTransitionService` 共用 helper**：本 spec 透過 `StageTransitionService.rollbackTo(listNo, 'dept_ratio')` 與 `assertStageEquals(listNo, 'personnel_ratio')` 執行；helper 設計沿用 F079 §12 A-1 | [ASSUMPTION] 待 system-architect |
| A-2 | **DELETE 範圍**：本 spec 採硬 DELETE `ob_empl_set`；歷史追溯由稽核 `before_value` 保留快照承擔；如需嚴謹歷史保留可改採 `ob_empl_set.deleted_at` 軟刪除 | [ASSUMPTION] 待 system-architect |
| A-3 | **與 F087 拒絕之語意分工**：本 spec（F085）為由 `personnel_ratio` 主動退回；F087（拒絕）為由 `approval` 退回。兩者均清空 `ob_empl_set`，但稽核 `action` 不同（`STAGE_ROLLBACK` vs `STAGE_REJECT`，v1.3.1 已對齊 entity enum），便於區分操作意圖 | [DECISION] |
| A-4 | **Feature Flag gating 範圍**：F085 與 F078 / F079 / F080 / F081 / F084 / F086 / F087 / F089 同屬 `ENABLE_E07_REFACTOR_PHASE3` flag gating | 沿用 F050 v2.0 §13.2 |

## 13. 變更紀錄

| 版本 | 日期 | 變更內容 |
|---|---|---|
| v1.0 | 2026-05-15 | 初版（取代 US-115，E07 補修批次 4）：限 `stage = 'personnel_ratio'` Rollback；限部長 + Admin（`DirectorGuard`）；DELETE `ob_empl_set`（所有部門）；保留 `ob_dept_pct`；新增與 F087 拒絕之語意分工 |
| v1.1 | 2026-05-16 | **Phase 1 風險決議落地**：(1) 決議 #6：BR-8 補「`assertNoRunningRun()` 由 `AssignmentRunGuardService` 集中實現」；(2) 決議 #2：新增 BR-9 Feature Flag fallback（503 + `FEATURE_NOT_ENABLED`） |
| v1.2 | 2026-05-16 | **救援重寫**：前一輪編碼事故損毀本檔內容，依 US-115 + AD-E07 v3.0 一致性決議完整重建；保留 v1.0 / v1.1 所有設計決議 |
| v1.3 | 2026-05-21 | **M01 v2.0~v2.3 Kanban 重構 / US-115 v2.0 操作入口調整**：(1) AC-1 修訂：入口由表格列改為 [F048 v2.0](F048-view-list-definition.md) Kanban 主頁 `personnel_ratio` 階段卡片操作欄之「退回」按鈕（灰色邊框 + undo-2 icon），渲染條件 reference [F077 v1.3 BR-7](F077-month-switch-and-stage-overview.md) 不重複定義；(2) AC-3 補充：Rollback 成功後 info 樣式 toast「已退回部門比例 — 處長設定將清空」；Kanban 卡片即時遷移至 dept_ratio 欄，無跳頁；(3) §7 UI/UX 重寫，補入口規範 + 卡片遷移行為 + Prototype reference；(4) 本 v1.3 不變更業務邏輯（API / DELETE ob_empl_set / 部門比例保留 / Transaction / 月名單分派鎖 / Feature Flag） |
| v1.3.1 | 2026-05-21 | **Phase 5 TDD code drift 修正（D1）**：對齊 `AssignmentAuditLog.action` entity enum（`apps/api/src/database/entities/assignment-audit-log.entity.ts:26-39`）— (1) 將 spec 全文之 `action = 'ROLLBACK_STAGE'` 字串修正為 `action = 'STAGE_ROLLBACK'`（AC-3 / AC-10）；(2) §12 A-3 假設行內語意分工描述「`ROLLBACK_STAGE` vs `REJECT`」修正為「`STAGE_ROLLBACK` vs `STAGE_REJECT`」（兩 enum 均對齊 entity）。不變動業務邏輯 / API endpoint / Transaction / Guard |
