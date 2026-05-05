---
spec-id: F048
title: 查看本月名單定義清單
feature-id: F048
source-story: US-070
epic: E07
module: M01 名單定義
priority: P0-MVP
version: "1.0"
date: 2026-04-24
status: Draft
---

# F048: 查看本月名單定義清單

Priority: P0-MVP | Status: Draft | Last Updated: 2026-04-24

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + `data-model.md#e07-data-model` + `error-handling.md#assignment-errors` |
| QA / Tester | 本文件 + `error-handling.md#assignment-errors` |
| UI/UX Designer | 本文件（第 8 節 UI/UX 需求） |
| Architect | 本文件 + `architecture-spec.md` §3.10（AssignmentList Service）|

---

## 1. 功能摘要

提供業務主管（`user + is_sales_manager = true`）查看本作業年月（YYYYMM）所有 active 名單定義的入口頁。頁面以「使用中 / 已停用」雙頁籤呈現，並作為 M01 所有操作的入口（新增 → F050、編輯 → F051、停用 → F052、per-LIST_NO 部門比例 → F060、單一 LIST_NO 案件試算 → F049）。月跑執行中全部操作按鈕鎖定。

## 2. 使用者故事

**As a** 業務主管
**I want** 查看本月各 Stage 的名單定義條件清單
**So that** 在觸發月跑之前確認每個 Stage 的篩選條件與預期涵蓋範圍符合本月業務策略

## 3. 前置條件

- 使用者已通過驗證（E01），持有有效 JWT Token
- JWT payload `role = user` 且 `is_sales_manager = true`（或 `role = admin`，管理者為超集）
- AppDB 已完成 E07 schema migration（`ob_list_definition`、`assignment_run` 等表已建立）

## 4. 驗收標準

### AC-1：顯示本月名單定義清單

- **Given** 業務主管已登入並進入名單定義頁面
- **When** 頁面載入完成
- **Then** 顯示本作業年月（YYYYMM）下所有 `status = 'active'` 的名單定義列表，每列包含：`list_no`、`list_nm`、`prod_kind`、篩選條件摘要（`caseyear` / `spec_tp` / `list_period_start`~`list_period_end`）、預估客戶數量，並提供「編輯」、「停用」、「設定部門比例」、「計算案件數量」操作欄
- **And** 清單依 `list_no` 升序排列
- **And** 頁面標頭顯示「新增名單定義」按鈕（觸發 F050）

### AC-2：展開單一名單條件詳情

- **Given** 名單定義清單已顯示
- **When** 業務主管點擊某一名單列
- **Then** 展開或跳至詳情頁，顯示該名單的完整篩選條件（每個條件欄位名稱、運算子、條件值）

### AC-3：無資料時的引導提示

- **Given** 本月 `ob_list_definition` 無 `project_workym = :currentYm AND status = 'active'` 記錄
- **When** 頁面載入完成
- **Then** 顯示空白狀態提示：「本月（YYYYMM）尚無名單定義，請點擊『新增名單定義』建立本月分派條件」

### AC-4：月跑執行中所有操作按鈕鎖定

- **Given** `assignment_run` 存在 `status IN ('pending', 'running')` 的紀錄
- **When** 業務主管在本頁面
- **Then** 「新增名單定義」按鈕、每列的「編輯」、「停用」、「設定部門比例」按鈕均為 disabled 狀態
- **And** 頁面頂部顯示橘色通知列：「分派執行中，名單定義暫時鎖定，無法進行新增、編輯或停用操作」

### AC-5：使用中／已停用頁籤切換

- **Given** 業務主管已進入名單定義頁面
- **When** 頁面載入完成
- **Then** 顯示兩個獨立頁籤：「使用中」（`status = 'active'`）與「已停用」（`status = 'inactive'`）
- **And** 預設顯示「使用中」頁籤；「已停用」頁籤僅供唯讀查閱，不顯示「編輯」與「停用」按鈕

## 5. API 規格

### 5.1 GET /api/v1/assignment/list-definitions

| Query Parameter | 型別 | 必填 | 說明 |
|---|---|---|---|
| ym | string（YYYYMM） | 否 | 預設為目前作業年月 |
| status | string | 否 | `active` / `inactive`，預設 `active` |

**Response — 200 OK**

```json
{
  "data": [
    {
      "listNo": "OB202605001",
      "listNm": "車貸月跑名單",
      "prodKind": "01",
      "caseYear": "1$$2",
      "specTp": "S1",
      "listPeriodStart": 1,
      "listPeriodEnd": 6,
      "listInterval": 1,
      "settleSrc": "Y",
      "cardType": "01",
      "status": "active",
      "estimatedCount": 8500
    }
  ],
  "lockState": {
    "locked": false,
    "reason": null
  }
}
```

| 欄位 | 來源 | 說明 |
|---|---|---|
| data[].listNo | `ob_list_definition.list_no` | 名單編號 |
| data[].listNm | `ob_list_definition.list_nm` | 名單名稱 |
| data[].estimatedCount | 實時計算 | 套用 LIST_NO 篩選條件 COUNT `ob_pool_data` |
| lockState.locked | `assignment_run.status IN ('pending','running')` | 月跑鎖狀態 |

**錯誤回應**

| HTTP | 錯誤碼 | 說明 |
|---|---|---|
| 401 | AUTH_TOKEN_MISSING / AUTH_TOKEN_EXPIRED | 未登入或 Token 無效 |
| 403 | AUTH_FORBIDDEN | `is_sales_manager` 未啟用 |
| 500 | SYSTEM_INTERNAL_ERROR | 伺服器內部錯誤 |

## 6. 商業規則

| 規則編號 | 說明 |
|---|---|
| BR-1 | 僅 `role = user + is_sales_manager = true` 或 `role = admin` 可存取 |
| BR-2 | `ym` 預設值為當前伺服器作業年月（以後端系統時間計算） |
| BR-3 | 月跑鎖由 `assignment_run.status` 即時判斷，無需額外旗標 |
| BR-4 | 「已停用」頁籤記錄為唯讀，不提供重新啟用（MVP 範圍外） |
| BR-5 | `estimatedCount` 於清單 API 以批次聚合計算，避免 N+1 查詢 |

## 7. 錯誤場景

| 場景 | 系統回應 | 參考 |
|---|---|---|
| 未登入存取 | HTTP 401 | error-handling.md#auth-errors |
| `is_sales_manager = false` 的 user | HTTP 403 | error-handling.md#auth-errors |
| 伺服器錯誤 | HTTP 500 | error-handling.md#system-errors |

## 8. UI/UX 需求

- 頁籤：「使用中」（預設）、「已停用」
- 清單欄位：list_no / list_nm / prod_kind / 條件摘要 / 預估客戶數 / 操作
- 月跑執行中：全部操作按鈕 disabled + 橘色通知列
- 空狀態引導：顯示「新增名單定義」CTA
- Prototype 參考（若存在）：`prototypes/e07-m01-list-definition.html`

## 9. 相依性

- **Blocked By**：F001（登入驗證）、F045（`is_sales_manager` 旗標設計）
- **Blocks**：F049, F050, F051, F052, F060, F061

## 10. 交叉參考

- 資料模型：[data-model.md#e07-data-model](../data-model.md#e07-data-model)
- 錯誤處理：[error-handling.md#assignment-errors](../error-handling.md#assignment-errors)
- 非功能需求：[nfr.md](../nfr.md)（NFR-003 執行效能）
- 架構決策：AD-E07-1（OB 遷移至 AppDB）
- 相關功能：[F049](F049-stage0-daily-estimate.md)（Stage 0 估算）、[F050](F050-create-list-definition.md)、[F051](F051-edit-list-definition.md)、[F052](F052-disable-list-definition.md)、[F060](F060-edit-per-list-dept-ratio.md)、[F068](F068-edit-base-code.md)
