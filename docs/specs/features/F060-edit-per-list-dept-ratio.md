---
spec-id: F060
title: 設定 per-LIST_NO 部門比例（DEPRECATED v2.0）
feature-id: F060
source-story: US-091
epic: E07
module: M03 分派比例
priority: P0-MVP
version: "2.0-DEPRECATED"
date: 2026-05-16
status: Deprecated
supersededBy: F079
---

# F060: 設定 per-LIST_NO 部門比例 — DEPRECATED (v2.0)

> **DEPRECATED — 2026-05-16 / v2.0**
>
> 本 spec 已於 AD-E07 v3.0 / F002 v2.0 重構期間廢止，**不再進入 MVP 實作**。
>
> - **取代路徑**：[F079 設定部門比例（Set Dept Ratio）](F079-set-dept-ratio.md)
> - **廢止原因**：M03a 部門比例已從 per-list 改為「依分派月份」的階段性設定，授權層採 `DirectorGuard`（處長僅讀），由部長於 M03a 階段統一維護；原 OQ-E07-5 per-LIST_NO 模型已被 M03a/M03b 雙層架構取代
> - **下游影響**：US-091 已 reroute 至 F079；`ob_dept_pct` schema 由 F079 重新定義
>
> 以下 v1.0 內容僅供歷史比對，**禁止用於實作**。

Priority: P0-MVP | Status: Deprecated | Last Updated: 2026-05-16

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + `data-model.md#e07-data-model` + `error-handling.md#assignment-errors` |
| QA / Tester | 本文件 + `error-handling.md#assignment-errors` |
| UI/UX Designer | 本文件（第 7 節 UI/UX 需求） |
| Architect | 本文件 + `architecture-spec.md` §3.10 |

---

## 1. 功能摘要

提供業務主管為特定 `list_no` 設定各部門的分配比例（`ob_dept_pct.ration`）。依 OQ-E07-5 決策，`ob_dept_pct` 即為 per-LIST_NO 設定（無全域比例概念）；每個 `list_no` 的部門比例加總必須 = 100%。月名單分派執行中禁止修改。

## 2. 使用者故事

**As a** 業務主管
**I want** 為特定名單（LIST_NO）設定各部門的分配比例（RATION）
**So that** 不同名單可依業務策略分配不同的部門比例

## 3. 前置條件

- 業務主管已登入並持有有效 JWT Token
- 目標 `list_no` 存在於 `ob_list_definition` 且 `status = 'active'`
- `assignment_run` 當下無 `status IN ('pending', 'running')` 的紀錄

## 4. 驗收標準

### AC-1：進入 per-LIST_NO 部門比例設定頁

- **Given** 業務主管在 F048 清單頁中選擇某個 `status = 'active'` 的名單
- **When** 點擊「設定部門比例」入口
- **Then** 顯示該 `list_no` 目前各部門的 `ration` 設定；若尚未設定則顯示空值
- **And** 頁首清楚標示當前設定的名單：「名單：{list_nm}（{list_no}）」

### AC-2：修改各部門比例並即時加總

- **Given** 業務主管進入 per-LIST_NO 比例設定頁的編輯模式
- **When** 業務主管修改某部門的 `ration` 值
- **Then** 頁面即時顯示所有部門 `ration` 的動態加總
- **And** 若加總 = 100%，儲存按鈕啟用；若加總 ≠ 100%，儲存按鈕停用並提示「比例加總為 N%，需調整至 100% 才能儲存」

### AC-3：儲存 per-LIST_NO 比例

- **Given** 所有部門 `ration` 加總 = 100%
- **When** 業務主管點擊「儲存」
- **Then** 系統 UPSERT `ob_dept_pct` 對應列（PK = `project_workym + list_no + obdeptid + ration`）
- **And** 寫入 `assignment_audit_log`（`action = 'UPDATE'`, `entity_type = 'ob_dept_pct'`, `entity_id = list_no`）
- **And** 頁面顯示儲存成功提示，切換回唯讀模式

### AC-4：RATION 輸入值驗證

- **Given** 業務主管在 `ration` 輸入框輸入值
- **When** 輸入的值為負數或超過 100
- **Then** 輸入框顯示紅色邊框與錯誤訊息「比例需介於 0 到 100 之間」
- **And** 儲存按鈕停用

### AC-5：清除比例設定

- **Given** 業務主管在 per-LIST_NO 比例設定頁點擊「清除比例設定」按鈕
- **When** 確認對話框確認後執行
- **Then** 系統刪除該 `list_no` 當月的所有 `ob_dept_pct` 紀錄
- **And** 頁面顯示提示「已清除 {list_nm}（{list_no}）的所有部門比例設定」
- **And** 寫入 `assignment_audit_log`（`action = 'DELETE'`）
- **And** 清除後，該 `list_no` 在月名單分派時觸發前置條件失敗，需由業務主管重新設定

### AC-6：月名單分派執行中禁止修改

- **Given** `assignment_run` 有 `status IN ('pending', 'running')` 的紀錄
- **When** 業務主管嘗試進入 per-LIST_NO 比例設定的編輯模式
- **Then** 編輯按鈕 disabled，提示「分派執行中，無法修改比例設定」
- **And** API 回傳 409 `ASSIGNMENT_RUN_ALREADY_RUNNING`

### AC-7：加總不等於 100% 阻擋儲存

- **Given** 業務主管調整後 `list_no` 的部門比例加總 ≠ 100%
- **When** 業務主管點擊「儲存」
- **Then** 後端回傳 422 `RATIO_SUM_INVALID`，訊息：「LIST_NO {list_no} 部門比例加總為 {N}%，需調整至 100%」

## 5. API 規格

### 5.1 GET /api/v1/assignment/ratios/dept/:listNo

**Response — 200 OK**

```json
{
  "listNo": "OB202605001",
  "listNm": "車貸月名單分派名單",
  "projectWorkym": "202605",
  "deptRatios": [
    { "obdeptId": "D01", "obdeptNm": "業務一部", "ration": 30.0 },
    { "obdeptId": "D02", "obdeptNm": "業務二部", "ration": 40.0 },
    { "obdeptId": "D03", "obdeptNm": "業務三部", "ration": 30.0 }
  ],
  "total": 100.0
}
```

### 5.2 PUT /api/v1/assignment/ratios/dept/:listNo

**Request Body**

```json
{
  "deptRatios": [
    { "obdeptId": "D01", "obdeptNm": "業務一部", "ration": 30.0 },
    { "obdeptId": "D02", "obdeptNm": "業務二部", "ration": 40.0 },
    { "obdeptId": "D03", "obdeptNm": "業務三部", "ration": 30.0 }
  ]
}
```

**Response — 200 OK**：更新筆數與加總。

### 5.3 DELETE /api/v1/assignment/ratios/dept/:listNo

**Response — 200 OK**：清除筆數。

**錯誤回應**

| HTTP | 錯誤碼 | 說明 |
|---|---|---|
| 401 | AUTH_TOKEN_MISSING | 未登入 |
| 403 | AUTH_FORBIDDEN | `is_sales_manager` 未啟用 |
| 404 | ASSIGNMENT_LIST_NOT_FOUND | `list_no` 不存在或已停用 |
| 409 | ASSIGNMENT_RUN_ALREADY_RUNNING | 月名單分派執行中 |
| 422 | RATIO_SUM_INVALID | 部門比例加總 ≠ 100% |
| 422 | VALIDATION_ERROR | `ration` 超出 0~100 範圍 |

## 6. 商業規則

| 規則編號 | 說明 |
|---|---|
| BR-1 | `ob_dept_pct` 即為 per-LIST_NO 設定（無全域比例，US-076/077 已刪除） |
| BR-2 | 同一 `list_no` 下所有部門比例加總必須 = 100% |
| BR-3 | `ration` 範圍：0.0 ~ 100.0（`NUMERIC(9,1)`） |
| BR-4 | `project_workym` 由後端依當前作業年月自動填入 |
| BR-5 | 清除比例設定後，該 `list_no` 月名單分派前置條件失敗（F061 AC-1） |
| BR-6 | 月名單分派鎖定：`assignment_run.status IN ('pending', 'running')` 時禁止修改 |

## 7. UI/UX 需求

- 頁首顯示目標 `list_nm` + `list_no`
- 部門比例表格：部門代碼 / 名稱 / `ration` 輸入框
- 底部即時加總 + 儲存按鈕啟用狀態
- 「清除比例設定」按鈕（紅色警示按鈕）+ 確認 Modal
- 月名單分派鎖定時：編輯 disabled + hover 提示

## 8. 相依性

- **Blocked By**：F048（清單頁入口）、F050（需先有名單才能為其設定比例）
- **Blocks**：F061（月名單分派 Stage 3 部門分配需讀取各 `list_no` 部門比例；前置條件驗證每個 active `list_no` 均有部門比例設定）

## 9. 交叉參考

- 資料模型：[data-model.md#e07-data-model](../data-model.md#e07-data-model)（`ob_dept_pct`）
- 錯誤處理：[error-handling.md#assignment-errors](../error-handling.md#assignment-errors)
- 架構決策：AD-E07-1（`ob_dept_pct` 即為 per-LIST_NO 設定）
- 相關功能：[F048](F048-view-list-definition.md)、[F050](F050-create-list-definition.md)、[F061](F061-trigger-assignment-run.md)
