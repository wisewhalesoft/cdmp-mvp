---
spec-id: F059
title: 開關 CR 回分規則
feature-id: F059
source-story: US-080
epic: E07
module: M03 分派比例
priority: P0-MVP
version: "1.0"
date: 2026-04-24
status: Draft
---

# F059: 開關 CR 回分規則

Priority: P0-MVP | Status: Draft | Last Updated: 2026-04-24

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + `data-model.md#e07-data-model` + `error-handling.md#assignment-errors` |
| QA / Tester | 本文件 + `error-handling.md#assignment-errors` |
| UI/UX Designer | 本文件（第 7 節 UI/UX 需求） |
| Architect | 本文件 + `architecture-spec.md` §3.10 |

---

## 1. 功能摘要

提供業務主管切換 CR（Customer Recycling，回收客戶）回分規則的啟用/停用狀態。CR 回分規則為全域開關，於月跑 Stage 3（部門分配）執行時作為優先指定機制。月跑執行中禁止切換。

## 2. 使用者故事

**As a** 業務主管
**I want** 切換 CR 回分規則的啟用或停用狀態
**So that** 靈活控制本月是否將曾被分派但未成交的客戶重新納入分派名單，而不需要 IT 修改程式邏輯

## 3. 前置條件

- 業務主管已登入並持有有效 JWT Token
- 系統已初始化 CR 回分設定紀錄（`[ASSUMPTION]` 儲存於 `ob_assign_set` 或獨立配置表）
- `assignment_run` 當下無 `status IN ('pending', 'running')` 的紀錄

## 4. 驗收標準

### AC-1：顯示 CR 回分規則目前狀態

- **Given** 業務主管進入分派比例頁面的 CR 回分設定區塊
- **When** 頁面載入完成
- **Then** 顯示 CR 回分規則的目前狀態（啟用 / 停用）及最後更新時間、更新者

### AC-2：切換 CR 回分規則狀態（含確認對話框）

- **Given** 業務主管查看 CR 回分規則區塊
- **When** 業務主管點擊切換開關
- **Then** 顯示確認對話框：「確定將 CR 回分規則{切換至啟用/停用}？此變更將影響下一次月跑的 Stage 3 部門分配邏輯。」
- **And** 業務主管點擊「確認」後，對應設定欄位由 `'Y'` ↔ `'N'`
- **And** 寫入 `assignment_audit_log`（`action = 'UPDATE'`, `entity_type = 'cr_reassignment_flag'`）
- **And** 頁面顯示切換成功提示

### AC-3：月跑執行中禁止切換

- **Given** `assignment_run` 有 `status IN ('pending', 'running')` 的紀錄
- **When** 業務主管嘗試點擊 CR 切換開關
- **Then** 切換開關為 disabled，提示「分派執行中，無法變更 CR 回分規則」
- **And** API 回傳 409 `ASSIGNMENT_RUN_ALREADY_RUNNING`

## 5. API 規格

### 5.1 GET /api/v1/assignment/ratios/cr-rule

**Response — 200 OK**

```json
{
  "enabled": true,
  "lastUpdatedBy": "sales_manager_01",
  "lastUpdatedAt": "2026-04-20T08:00:00Z"
}
```

### 5.2 PUT /api/v1/assignment/ratios/cr-rule

**Request Body**

```json
{
  "enabled": true
}
```

**Response — 200 OK**

```json
{
  "enabled": true,
  "updatedAt": "2026-04-24T12:00:00Z"
}
```

**錯誤回應**

| HTTP | 錯誤碼 | 說明 |
|---|---|---|
| 401 | AUTH_TOKEN_MISSING | 未登入 |
| 403 | AUTH_FORBIDDEN | `is_sales_manager` 未啟用 |
| 409 | ASSIGNMENT_RUN_ALREADY_RUNNING | 月跑執行中 |

## 6. 商業規則

| 規則編號 | 說明 |
|---|---|
| BR-1 | CR 回分規則為全域開關，影響所有部門的當下以後月跑 |
| BR-2 | 月跑執行中禁止切換；完成後自動恢復可切換 |
| BR-3 | 每次切換必須透過確認對話框，避免誤操作 |
| BR-4 | 目前狀態於月跑觸發時由 config 快照記錄，歷史可透過 F066 追溯 |

## 7. UI/UX 需求

- 切換開關（Toggle Switch）+ 當前狀態文字
- 顯示最後更新者與時間
- 確認 Modal：警告切換將影響下一次月跑
- 月跑鎖定時：開關 disabled + hover 提示

## 8. 相依性

- **Blocked By**：F001（登入驗證）
- **Blocks**：F061（月跑 Stage 3 依此開關決定是否執行 CR 回分優先指定）

## 9. 交叉參考

- 資料模型：[data-model.md#e07-data-model](../data-model.md#e07-data-model)（`ob_assign_set` 或等同配置表，由 system-architect 確認）
- 錯誤處理：[error-handling.md#assignment-errors](../error-handling.md#assignment-errors)
- 架構決策：AD-E07-1
- 相關功能：[F061](F061-trigger-assignment-run.md)、[F066](F066-view-run-snapshot-detail.md)

## 10. 假設

| # | 假設 | 標記 |
|---|---|---|
| A-1 | CR 回分全域開關實際儲存位置（表名 / 欄位）由 system-architect 確認；映射自舊系統 `OBASSIGNSET` | [ASSUMPTION] |
