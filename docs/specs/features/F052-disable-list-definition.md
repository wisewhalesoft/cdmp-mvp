---
spec-id: F052
title: 停用名單定義
feature-id: F052
source-story: US-090, US-105
epic: E07
module: M01 名單定義
priority: P0-MVP
version: "2.1"
date: 2026-05-21
status: Draft
---

# F052: 停用名單定義

Priority: P0-MVP | Status: Draft | Last Updated: 2026-05-21

> **v2.1（2026-05-21 / M01 v2.0~v2.3 Kanban 重構 / US-105 v2.3 文字修正）**：核心變更：
> 1. **§4 AC-1 / §7 UI/UX：按鈕文字「停」→「停用」全寫**（對應 US-105 v2.3 修正版；卡片設計允許換行不需縮寫）。
> 2. **入口從表格列改為 Kanban 卡片按鈕**：F048 v2.0 Kanban 主頁之 `draft` 階段卡片操作欄之「停用」按鈕（依 [F077 v1.3 BR-7](F077-month-switch-and-stage-overview.md) Role × Stage 矩陣）。
> 3. **本 v2.1 不變更既有業務邏輯**（API endpoint / 軟刪除語意 / 月名單分派鎖 / 重複停用阻擋 / 5 個 AC 之核心行為）；僅按鈕文字與入口位置變更。
>
> **v2.0（2026-05-16）**：依 F002 v2.0 / AD-E07 v3.0 重構：Guard 改為 `DirectorGuard`（M01 名單 CRUD 寫入限部長）。

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + `data-model.md#e07-data-model` + `error-handling.md#assignment-errors` |
| QA / Tester | 本文件 + `error-handling.md#assignment-errors` |
| UI/UX Designer | 本文件（第 7 節 UI/UX 需求） |
| Architect | 本文件 + `architecture-spec.md` §3.10 |

---

## 1. 功能摘要

提供業務部長停用名單定義功能（軟刪除）。停用為不可逆操作（MVP 範圍內不提供重新啟用）；停用後 `status` 由 `'active'` 更新為 `'inactive'`，資料不刪除，歷史快照不受影響。月名單分派執行中禁止停用。

## 2. 使用者故事

**As a** 業務部長
**I want** 停用不再需要的名單定義
**So that** 避免已過時或錯誤設定的名單條件在下次月名單分派中被誤用，同時保留歷史紀錄以供查閱

## 3. 前置條件

- 業務部長已登入並持有有效 JWT Token；`businessRole='director'`（M01 名單 CRUD 寫入限部長，後端套用 `DirectorGuard`，依 F002 §4.6.2）
- 目標 `list_no` 存在且 `status = 'active'`
- `assignment_run` 當下無 `status IN ('pending', 'running')` 的紀錄

## 4. 驗收標準

### AC-1：停用確認對話框（v2.1 補述）

- **Given** 業務部長 / Admin 在 [F048 v2.0](F048-view-list-definition.md) Kanban 主頁 `draft` 階段卡片操作欄點擊「停用」按鈕（按鈕文字為**全寫「停用」**，非縮寫「停」；依 US-105 v2.3）
- **When** 系統彈出確認對話框
- **Then** 對話框標題：「確認停用名單 `{list_no}`？」；副標：「F052 v2.1 · 軟刪除（限 `draft` 階段）」
- **And** 對話框警告區顯示：「此操作將軟刪除名單。已停用名單可於『已停用』分區查詢；無法直接還原。」
- **And** 顯示名單基本資訊（名稱 / 階段 / 建立者）供確認
- **And** 「確認停用」按鈕預設 disabled；使用者勾選「我確認停用此名單」checkbox 後始啟用
- **And** 提供「確認停用」（紅底白字）與「取消」兩個按鈕
- **And** 對話框內按鈕文字為**全寫「確認停用」**，避免使用者誤判操作範圍

### AC-2：執行停用（軟刪除）

- **Given** 業務部長在確認對話框點擊「確認停用」
- **When** 後端處理停用請求
- **Then** `ob_list_definition` 對應列的 `status` 從 `'active'` 更新為 `'inactive'`
- **And** `updated_by` / `updated_at` / `updated_by_prog` 由後端自動填入
- **And** 寫入 `assignment_audit_log`（`action = 'DISABLE'`, `entity_type = 'ob_list_definition'`, `entity_id = list_no`）
- **And** 頁面顯示成功提示：「名單『{list_nm}』已停用」，清單刷新

### AC-3：停用後可從「已停用」頁籤查閱

- **Given** 名單 `status` 已更新為 `'inactive'`
- **When** 業務部長切換至「已停用」頁籤
- **Then** 該名單出現在「已停用」頁籤中，可展開查看所有欄位值（唯讀）
- **And** 「已停用」頁籤不顯示「編輯」或「停用」按鈕

### AC-4：不提供重新啟用（MVP 範圍）

- **Given** 名單 `status = 'inactive'`
- **When** 業務部長在「已停用」頁籤查看該名單
- **Then** 不顯示任何「啟用」、「重新啟用」或「恢復」按鈕
- **And** 後端不提供對應 API 端點；若業務需恢復使用相同條件，業務部長可透過 F050「複製名單」建立新名單

### AC-5：月名單分派執行中禁止停用

- **Given** `assignment_run` 有 `status IN ('pending', 'running')` 的紀錄
- **When** 業務部長嘗試點擊任何名單的「停用」按鈕
- **Then** 停用按鈕為 disabled，hover 顯示提示「分派執行中，無法停用名單定義」
- **And** 若直接呼叫 API，回傳 409 `ASSIGNMENT_RUN_ALREADY_RUNNING`

### AC-6：已被 completed 月名單分派使用過的名單可停用

- **Given** 某名單曾被歷史 `completed` 月名單分派使用（`assignment_run_snapshot.payload` 中有紀錄）
- **When** 業務部長執行停用
- **Then** 系統允許停用，`status` 更新為 `'inactive'`
- **And** 歷史快照中對該名單的參照保持完整（`assignment_run_snapshot` 為 INSERT-only，不受名單 status 變更影響）

### AC-7：重複停用阻擋

- **Given** 目標 `list_no` 已為 `status = 'inactive'`
- **When** 業務部長（例如透過多分頁）再次嘗試停用
- **Then** 回傳 422 `ASSIGNMENT_LIST_ALREADY_INACTIVE`，訊息：「名單已處於停用狀態，無需重複操作」

## 5. API 規格

### 5.1 PUT /api/v1/assignment/list-definitions/:listNo/disable

**Request Body**：空

**Response — 200 OK**

```json
{
  "listNo": "OB202605001",
  "status": "inactive",
  "updatedAt": "2026-04-24T12:00:00Z"
}
```

**錯誤回應**

| HTTP | 錯誤碼 | 說明 |
|---|---|---|
| 401 | AUTH_TOKEN_MISSING | 未登入 |
| 403 | E07_REQUIRES_DIRECTOR | `businessRole` 非 `'director'`（`DirectorGuard` 攔截，依 F002 §4.6.2） |
| 404 | ASSIGNMENT_LIST_NOT_FOUND | `list_no` 不存在 |
| 409 | ASSIGNMENT_RUN_ALREADY_RUNNING | 月名單分派執行中 |
| 422 | ASSIGNMENT_LIST_ALREADY_INACTIVE | 名單已停用 |

## 6. 商業規則

| 規則編號 | 說明 |
|---|---|
| BR-1 | 停用為軟刪除：僅更新 `status`，不刪除資料列 |
| BR-2 | 不提供重新啟用（MVP 範圍外）；業務部長需透過 F050「複製名單」建立新紀錄 |
| BR-3 | 月名單分派鎖定範圍：`assignment_run.status IN ('pending', 'running')` |
| BR-4 | 停用後的名單不會被未來月名單分派 Stage 1 讀取（Stage 1 `WHERE status = 'active'`） |
| BR-5 | 歷史 `assignment_run_snapshot` 為不可變紀錄，停用後仍完整保留當時的 input_list / result |

## 7. UI/UX 需求（v2.1 重寫）

### 7.1 入口（v2.1 變更 / US-105 v2.3 / US-130）

- **入口位置**：[F048 v2.0](F048-view-list-definition.md) Kanban 主頁之 `draft` 階段卡片操作欄之「停用」按鈕
- **按鈕文字**：**全寫「停用」**（v2.1 修正：v1.0 / v2.0 prototype 之縮寫「停」已於 US-105 v2.3 統一改回全寫；卡片設計允許換行不需縮寫）
- **按鈕樣式**：危險樣式（紅色邊框 / `text-danger border-danger hover:bg-red-50`），附 `archive` icon
- **渲染條件**：依 [F077 v1.3 BR-7](F077-month-switch-and-stage-overview.md) Role × Stage 矩陣 — 僅 `draft` 階段 + `director` / `admin` role 渲染；其他 stage 不渲染停用按鈕（非草稿階段名單需先 Rollback 至草稿才可停用，由 F081 / F085 / F089 提供反向路徑）
- **歷史月份 / 月名單分派鎖中**：依 F077 v1.3 BR-7 C-1 / C-2 — 歷史月份不渲染；月名單分派鎖中 disabled + hover tooltip「分派執行中，無法停用名單定義」

### 7.2 確認對話框

- Modal 確認對話框：顯示警告文字（含 `list_nm` + `list_no` + 階段 + 建立者）+ 「我確認停用此名單」checkbox + 兩個按鈕（「確認停用」/「取消」）
- 「確認停用」按鈕預設 disabled，checkbox 勾選後啟用
- 「確認停用」按鈕文字為**全寫**（非縮寫「停」）

### 7.3 成功提示 toast

- 成功提示 toast：「`{list_no}` 已停用」+ 副訊息「可於名單列表『已停用』分區查詢」（warning 樣式）
- Kanban 主頁即時刷新，該名單卡片從 `draft` 欄移除（依 [F077 v1.3 BR-7 C-3](F077-month-switch-and-stage-overview.md)，已停用名單不渲染於 Kanban 主視圖）

### 7.4 月名單分派鎖定行為

- 月名單分派鎖定時：「停用」按鈕 disabled + hover 提示「分派執行中，無法停用名單定義」
- 已開啟之停用確認對話框於月名單分派鎖觸發後：建議前端 polling lockState 即時關閉對話框並提示（屬未來 enhancement；本 v2.1 不規範 polling 機制）

### 7.5 Prototype canonical reference

`prototypes/27-list-definition.html` 之 `deactivateModal` 與 `renderActions` `draft` cell（行 826-828）：按鈕文字「停用」、icon `archive`、紅色邊框樣式

## 8. 相依性

- **Blocked By**：F048（清單頁入口）、F050（需先有名單才能停用）
- **Blocks**：無（停用後不影響歷史快照；F061 月名單分派前置條件僅讀取 active 名單）

## 9. 交叉參考

- 資料模型：[data-model.md#e07-data-model](../data-model.md#e07-data-model)
- 錯誤處理：[error-handling.md#assignment-errors](../error-handling.md#assignment-errors)
- 架構決策：AD-E07-1（`status` 欄位於 `ob_list_definition` 新建表直接加入）
- 相關功能：[F048](F048-view-list-definition.md)、[F050](F050-create-list-definition.md)、[F061](F061-trigger-assignment-run.md)、[F066](F066-view-run-snapshot-detail.md)
