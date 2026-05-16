---
spec-id: F066
title: 查看執行快照詳情
feature-id: F066
source-story: US-086
epic: E07
module: M05 快照歷史
priority: P0-MVP
version: "1.0"
date: 2026-04-24
status: Draft
---

# F066: 查看執行快照詳情

Priority: P0-MVP | Status: Draft | Last Updated: 2026-04-24

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + `data-model.md#e07-data-model` + `error-handling.md#assignment-errors` + `diagrams/F066-snapshot-detail-flow.mmd` |
| QA / Tester | 本文件 + `error-handling.md#assignment-errors` |
| UI/UX Designer | 本文件（第 7 節 UI/UX 需求） + `diagrams/F066-snapshot-detail-flow.mmd` |
| Architect | 本文件 + `architecture-spec.md` §3.10（AssignmentSnapshot Service） |

---

## 1. 功能摘要

提供業務部長 / 業務處長查看特定月跑的三份執行快照詳細內容（`config` / `input_list` / `result`）。快照為不可修改的唯讀紀錄（INSERT-only）；JSONB payload 由前端解析並以表格方式呈現。`input_list` 與 `result` 快照提供搜尋功能（依客戶編號 / 人員工號）。

## 2. 使用者故事

**As a** 業務部長 / 業務處長
**I want** 查看特定月跑的三份執行快照詳細內容
**So that** 可完整追溯當時的執行設定、輸入名單與分派結果，作為稽核依據或問題排查參考

## 3. 前置條件

- 業務部長 / 業務處長已登入並持有有效 JWT Token
- 目標 `run_id` 存在於 `assignment_run`
- `assignment_run_snapshot` 已寫入三份快照（`config` / `input_list` / `result`）

## 4. 驗收標準

### AC-1：顯示快照總覽

- **Given** 業務部長 / 業務處長從 F065 歷史清單進入某月跑的詳情頁
- **When** 頁面載入完成
- **Then** 顯示月跑基本資訊（`run_id`、`project_workym`、`triggered_by`、`triggered_at`、`finished_at`、`status`、`total_cases`）
- **And** 顯示三個快照分頁索引：「設定快照」、「輸入名單快照」、「結果快照」

### AC-2：查看設定快照（config）

- **Given** 業務部長 / 業務處長點擊「設定快照」分頁
- **When** 分頁內容載入
- **Then** 顯示本次執行時使用的完整設定參數：
  - 計分版本號與備註（`card_type` / `card_version`）
  - 各 LIST_NO 部門比例設定（表格呈現）
  - 各部門人員比例設定（可收合的巢狀表格）
  - CR 回分規則狀態（啟用 / 停用）

### AC-3：查看輸入名單快照（input_list）

- **Given** 業務部長 / 業務處長點擊「輸入名單快照」分頁
- **When** 分頁內容載入
- **Then** 顯示 Stage 1 的原始名單摘要：總筆數、各 LIST_NO 筆數
- **And** 提供搜尋功能：可依客戶編號（`custo_no`）查詢是否在輸入名單中

### AC-4：查看結果快照（result）

- **Given** 業務部長 / 業務處長點擊「結果快照」分頁
- **When** 分頁內容載入
- **Then** 顯示最終分派結果：總筆數、各部門分配量、各等級分佈
- **And** 提供搜尋功能：可依客戶編號（`custo_no`）或人員工號（`emplid`）查詢分派紀錄

### AC-5：run_id 不存在或快照缺失

- **Given** URL 中的 `run_id` 不存在於 `assignment_run`，或 `assignment_run_snapshot` 缺少某份快照
- **When** 業務部長 / 業務處長進入詳情頁
- **Then** 回傳 404 `ASSIGNMENT_RUN_NOT_FOUND`，前端顯示「找不到該月跑紀錄或快照不完整」

## 5. API 規格

### 5.1 GET /api/v1/assignment/history/:runId/snapshot

**Response — 200 OK**

```json
{
  "runMeta": {
    "runId": "550e8400-e29b-41d4-a716-446655440000",
    "projectWorkym": "202605",
    "triggeredBy": "sales_manager_01",
    "triggeredAt": "2026-04-24T12:00:00Z",
    "finishedAt": "2026-04-24T12:30:00Z",
    "status": "completed",
    "totalCases": 9500
  },
  "snapshots": {
    "config": { "cardVersion": 3, "deptRatios": [...], "personnelRatios": [...], "crEnabled": true },
    "inputList": { "totalCount": 10000, "byListNo": { "OB202605001": 5000, "OB202605002": 5000 } },
    "result": { "totalCount": 9500, "byDept": [...], "byLevel": [...] }
  }
}
```

### 5.2 GET /api/v1/assignment/history/:runId/snapshot/search（選用，若資料量 > 100,000 筆）

**Query Parameters**

| 參數 | 型別 | 必填 | 說明 |
|---|---|---|---|
| snapshotType | string | 是 | `input_list` / `result` |
| custoNo | string | 否 | 客戶編號 |
| emplId | string | 否 | 人員工號 |

**Response — 200 OK**：符合條件的紀錄清單。

**錯誤回應**

| HTTP | 錯誤碼 | 說明 |
|---|---|---|
| 401 | AUTH_TOKEN_MISSING | 未登入 |
| 403 | E07_ROLE_NOT_ASSIGNED | `businessRole` 非 `'director'` / `'section_chief'`（`DirectorOrSectionChiefGuard` 攔截，依 F002 §4.6.2） |
| 404 | ASSIGNMENT_RUN_NOT_FOUND | `run_id` 不存在或快照缺失 |

## 6. 商業規則

| 規則編號 | 說明 |
|---|---|
| BR-1 | 快照為 INSERT-only，不可修改或刪除 |
| BR-2 | JSONB payload 預設由前端解析；資料量 > 100,000 筆時啟用後端搜尋 API（5.2） |
| BR-3 | `input_list` 快照間接保存月跑當時的名單定義篩選結果，可追溯名單條件變更的影響 |
| BR-4 | 快照保留期與 `assignment_run` 相同（3 年，AD-E07-3） |

## 7. UI/UX 需求

- 月跑基本資訊卡片：頂部固定顯示
- 三個分頁索引：Config / Input List / Result
- Config 分頁：階層式表格（部門 → LIST_NO → 人員）
- Input List / Result 分頁：可搜尋表格
- 大型快照資料：若單份 payload > 5 MB，顯示「快照資料量較大，載入中…」提示

## 8. 相依性

- **Blocked By**：F061（快照由月跑完成時寫入）、F065（入口頁）
- **Blocks**：F067（比對差異需要能查看個別快照詳情）

## 9. 交叉參考

- 資料模型：[data-model.md#e07-data-model](../data-model.md#e07-data-model)（`assignment_run`、`assignment_run_snapshot`）
- 錯誤處理：[error-handling.md#assignment-errors](../error-handling.md#assignment-errors)
- 流程圖：[diagrams/F066-snapshot-detail-flow.mmd](../diagrams/F066-snapshot-detail-flow.mmd)
- 架構決策：AD-E07-2、AD-E07-3（保留 3 年）
- 相關功能：[F061](F061-trigger-assignment-run.md)、[F065](F065-view-run-history-list.md)、[F067](F067-compare-run-results.md)
