---
spec-id: F065
title: 查看歷史執行紀錄清單
feature-id: F065
source-story: US-085
epic: E07
module: M05 快照歷史
priority: P0-MVP
version: "1.0"
date: 2026-04-24
status: Draft
---

# F065: 查看歷史執行紀錄清單

Priority: P0-MVP | Status: Draft | Last Updated: 2026-04-24

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + `data-model.md#e07-data-model` + `error-handling.md#assignment-errors` |
| QA / Tester | 本文件 + `error-handling.md#assignment-errors` |
| UI/UX Designer | 本文件（第 7 節 UI/UX 需求） |
| Architect | 本文件 + `architecture-spec.md` §3.10（AssignmentSnapshot Service） |

---

## 1. 功能摘要

提供業務部長 / 業務處長查看所有歷史月跑的執行紀錄清單，依 `triggered_at DESC` 排序（對應 `assignment_run.triggered_at DESC` 索引）。支援分頁、年月篩選、狀態篩選。清單顯示**所有狀態**的月跑（`completed` / `failed` / `running` / `pending`）；`running` / `pending` 列於操作欄提供「查看進度」入口導向 F062 進度頁。

> **2026-06-26 修正（業務拍板）**：原規格限定 `status IN ('completed', 'failed')`，與 prototype `34-run-history.html`（mock data 含 running 列 + 進度 icon）及實際前端實作不一致。經確認改為**清單納入全部狀態**，`running` 列顯示執行進度 icon。詳見 §6 BR-1。

## 2. 使用者故事

**As a** 業務部長 / 業務處長
**I want** 查看所有歷史月跑的執行紀錄清單
**So that** 可追溯每月的分派執行情況，並快速找到特定月份的執行快照進行查詢或比對

## 3. 前置條件

- 業務部長 / 業務處長已登入並持有有效 JWT Token
- 至少一筆 `assignment_run` 紀錄存在

## 4. 驗收標準

### AC-1：顯示歷史月跑清單

- **Given** 業務部長 / 業務處長進入 M05 快照歷史頁面
- **When** 頁面載入完成
- **Then** 顯示所有月跑清單（**不限狀態**），依 `triggered_at` 降序排列，每列包含：
  - `run_id`（縮短顯示，前 8 碼）
  - `project_workym`（作業年月）
  - `triggered_by`（觸發者**名稱** — 後端以 `assignment_run.triggered_by` UUID join `users.name` 解析；回應另含 `triggeredByName` 欄位，無對應 user 時為 `null`）
  - `triggered_at`
  - `finished_at`
  - `status`
  - `total_cases`（分派筆數）
- **And** 清單支援分頁，每頁預設 20 筆

### AC-1b：操作欄（對齊 prototype `34-run-history.html`）

- **Given** 歷史清單已顯示
- **When** 某一列 `status = 'running'` 或 `'pending'`（執行中 / 待執行）
- **Then** 該列操作欄**僅**顯示「查看進度」icon（導向 F062 進度頁）；其 checkbox **disabled**（執行中不可比對）
- **When** 某一列 `status = 'completed'` 或 `'failed'`
- **Then** 該列操作欄顯示「檢視快照」「結果摘要」「比對基準」三個 icon；`failed` 時「結果摘要」disabled（無結果可摘要）
- **And** 點擊「比對基準」→ 將該列設為比對基準（runA）並自動勾選其 checkbox，沿用「勾選 2 筆 → 比較選定」流程

### AC-2：依年月或狀態篩選

- **Given** 歷史清單已顯示
- **When** 業務部長 / 業務處長使用篩選器（`projectWorkym` 下拉、`status` 下拉）
- **Then** 清單即時過濾顯示符合條件的月跑紀錄

### AC-3：進入快照詳情

- **Given** 歷史清單已顯示
- **When** 業務部長 / 業務處長點擊某一月跑列
- **Then** 跳轉至該月跑的快照詳情頁（F066），URL 為 `/assignment/history/:runId`

### AC-4：比對差異入口

- **Given** 歷史清單已顯示
- **When** 業務部長 / 業務處長勾選兩筆紀錄並點擊「比對」
- **Then** 跳轉至 F067 比對頁，帶入兩個 `run_id`（URL: `/assignment/compare?runA=:baseId&runB=:compareId`）
- **And** 若勾選數量 ≠ 2，按鈕 disabled

## 5. API 規格

### 5.1 GET /api/v1/assignment/history

**Query Parameters**

| 參數 | 型別 | 必填 | 說明 |
|---|---|---|---|
| ym | string（YYYYMM） | 否 | 作業年月篩選 |
| status | string | 否 | `completed` / `failed` |
| page | integer | 否 | 預設 1 |
| pageSize | integer | 否 | 預設 20，最大 100 |

**Response — 200 OK**

```json
{
  "data": [
    {
      "runId": "550e8400-e29b-41d4-a716-446655440000",
      "projectWorkym": "202605",
      "triggeredBy": "a1b2c3d4-e5f6-7890-abcd-ef0123456789",
      "triggeredByName": "王部長",
      "triggeredAt": "2026-04-24T12:00:00Z",
      "finishedAt": "2026-04-24T12:30:00Z",
      "status": "completed",
      "totalCases": 9500
    }
  ],
  "pagination": { "page": 1, "pageSize": 20, "total": 15, "totalPages": 1 }
}
```

**錯誤回應**

| HTTP | 錯誤碼 | 說明 |
|---|---|---|
| 401 | AUTH_TOKEN_MISSING | 未登入 |
| 403 | E07_ROLE_NOT_ASSIGNED | `businessRole` 非 `'director'` / `'section_chief'`（`DirectorOrSectionChiefGuard` 攔截，依 F002 §4.6.2） |

## 6. 商業規則

| 規則編號 | 說明 |
|---|---|
| BR-1 | 清單顯示**所有狀態**的月跑（`completed` / `failed` / `running` / `pending`）。`running` / `pending` 列：操作欄僅顯示「查看進度」icon（導向 F062）、checkbox disabled。**（2026-06-26 修正：原為「僅顯示 completed/failed」，與 prototype 34 及實作不符，經業務拍板改為全狀態）** |
| BR-2 | 預設排序：`triggered_at DESC`（對應 `assignment_run.triggered_at DESC` 索引） |
| BR-3 | 分頁強制：預設 20 筆/頁，最大 100 筆/頁 |
| BR-4 | 比對功能：勾選數量必須 = 2 才啟用「比對」按鈕；`running` / `pending` 列不可勾選 |
| BR-5 | 觸發者顯示**名稱**：後端以 `triggered_by`（UUID）join `users.name` 解析為 `triggeredByName`；查無對應 user 時 `triggeredByName = null`，前端 fallback 顯示原 `triggeredBy` 值 |

## 7. UI/UX 需求

- 篩選器：年月下拉 + 狀態下拉 + 觸發者下拉（顯示**名稱**）
- 清單表格：可勾選（checkbox）、可點擊進入詳情
- 「比對」按鈕：勾選數 = 2 時啟用
- 狀態欄位：`completed` 綠色、`failed` 紅色、`running` 藍色（icon 旋轉）、`pending` 灰色
- 操作欄（對齊 prototype 34，見 AC-1b）：
  - `running` / `pending` → 「查看進度」（Activity icon）
  - `completed` → 「檢視快照」「結果摘要」「比對基準」
  - `failed` → 「檢視快照」「結果摘要」(disabled)「比對基準」

## 8. 相依性

- **Blocked By**：F061（至少一次月跑完成後才有歷史紀錄）
- **Blocks**：F066（快照詳情頁入口）、F067（比對差異入口）

## 9. 交叉參考

- 資料模型：[data-model.md#e07-data-model](../data-model.md#e07-data-model)（`assignment_run`）
- 錯誤處理：[error-handling.md#assignment-errors](../error-handling.md#assignment-errors)
- 架構決策：AD-E07-2
- 相關功能：[F061](F061-trigger-assignment-run.md)、[F066](F066-view-run-snapshot-detail.md)、[F067](F067-compare-run-results.md)
