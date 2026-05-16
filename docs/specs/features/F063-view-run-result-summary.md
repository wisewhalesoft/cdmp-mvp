---
spec-id: F063
title: 查看分派結果摘要
feature-id: F063
source-story: US-083
epic: E07
module: M04 分派執行
priority: P0-MVP
version: "1.0"
date: 2026-04-24
status: Draft
---

# F063: 查看分派結果摘要

Priority: P0-MVP | Status: Draft | Last Updated: 2026-04-24

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + `data-model.md#e07-data-model` + `error-handling.md#assignment-errors` |
| QA / Tester | 本文件 + `nfr.md`（NFR-005） |
| UI/UX Designer | 本文件（第 7 節 UI/UX 需求） |
| Architect | 本文件 + `architecture-spec.md` §3.10 |

---

## 1. 功能摘要

提供業務部長 / 業務處長在月跑完成後快速查看分派結果摘要：整體統計、各部門分配量、各 CARD_LEVEL 等級分佈，以及部門實際比例與設定比例的偏差值。偏差超過 ±3% 以橘色標示（NFR-005 警示門檻）。資料來源為 `assignment_run` 基本資訊 + `assignment_run_snapshot` 的 `result` 快照聚合。

## 2. 使用者故事

**As a** 業務部長 / 業務處長
**I want** 在月跑完成後查看分派結果的摘要統計
**So that** 快速確認本月名單總量、各部門分配量、各等級分佈是否符合預期，決定是否需要調整後重跑

## 3. 前置條件

- 業務部長 / 業務處長已登入並持有有效 JWT Token
- 目標 `run_id` 存在於 `assignment_run` 且 `status = 'completed'`
- `assignment_run_snapshot` 已寫入三份快照（`config` / `input_list` / `result`）

## 4. 驗收標準

### AC-1：顯示整體摘要數據

- **Given** 月跑已完成（`status = 'completed'`）
- **When** 業務部長 / 業務處長進入結果摘要頁
- **Then** 顯示本次月跑的整體統計：
  - `run_id`、`project_workym`、`finished_at`、`duration_ms`
  - 總分派客戶數（`total_cases`）
  - 各 Stage 產出筆數（Stage 1 原始名單數 / Stage 4 最終分派數）
  - 名單覆蓋率（`Stage 4 / Stage 1 × 100%`）

### AC-2：各部門分配量統計

- **Given** 結果摘要頁已顯示
- **When** 業務部長 / 業務處長查看部門分配區塊
- **Then** 顯示各部門的實際分配量與設定比例的對比，欄位：部門代碼、部門名稱、設定比例（%）、實際分配量、實際比例（%）、偏差值
- **And** 偏差值 = 實際比例 - 設定比例；若絕對值 > 3%，以橘色標示（NFR-005 警示）

### AC-3：各等級分佈統計

- **Given** 結果摘要頁已顯示
- **When** 業務部長 / 業務處長查看等級分佈區塊
- **Then** 顯示各 CARD_LEVEL（A/B/C/D 等）的客戶數與佔比

### AC-4：月跑未完成時阻擋

- **Given** 目標 `run_id` 的 `status` 為 `pending` / `running` / `failed`
- **When** 業務部長 / 業務處長嘗試查看結果摘要
- **Then** 回傳 422 `ASSIGNMENT_RUN_NOT_COMPLETED`，訊息：「月跑尚未完成，結果摘要不可用」

## 5. API 規格

### 5.1 GET /api/v1/assignment/runs/:runId/summary

**Response — 200 OK**

```json
{
  "runId": "550e8400-e29b-41d4-a716-446655440000",
  "projectWorkym": "202605",
  "finishedAt": "2026-04-24T12:30:00Z",
  "durationMs": 1800000,
  "totalCases": 9500,
  "stage1Count": 10000,
  "stage4Count": 9500,
  "coverageRate": 0.95,
  "deptSummary": [
    { "deptId": "D01", "deptName": "業務一部", "configRatio": 30.0, "actualCount": 3230, "actualRatio": 34.0, "deviation": 4.0, "alert": true },
    { "deptId": "D02", "deptName": "業務二部", "configRatio": 40.0, "actualCount": 3800, "actualRatio": 40.0, "deviation": 0.0, "alert": false }
  ],
  "levelDistribution": [
    { "cardLevel": "A", "count": 2000, "ratio": 21.0 },
    { "cardLevel": "B", "count": 4000, "ratio": 42.1 },
    { "cardLevel": "C", "count": 3000, "ratio": 31.6 },
    { "cardLevel": "D", "count": 500,  "ratio": 5.3 }
  ]
}
```

**錯誤回應**

| HTTP | 錯誤碼 | 說明 |
|---|---|---|
| 401 | AUTH_TOKEN_MISSING | 未登入 |
| 403 | E07_ROLE_NOT_ASSIGNED | `businessRole` 非 `'director'` / `'section_chief'`（`DirectorOrSectionChiefGuard` 攔截，依 F002 §4.6.2） |
| 404 | ASSIGNMENT_RUN_NOT_FOUND | `run_id` 不存在 |
| 422 | ASSIGNMENT_RUN_NOT_COMPLETED | 月跑尚未完成 |

## 6. 商業規則

| 規則編號 | 說明 |
|---|---|
| BR-1 | 資料來源：`assignment_run` 基本資訊 + `assignment_run_snapshot.payload`（`snapshot_type = 'result'` + `'config'`）聚合計算 |
| BR-2 | 部門偏差警示門檻：絕對值 > 3% 以橘色標示，對應 NFR-005 |
| BR-3 | 本頁為唯讀查看，無編輯功能 |
| BR-4 | `coverageRate = stage4Count / stage1Count`，以小數儲存（0.95 = 95%） |
| BR-5 | 部門名稱（`deptName`）優先使用 `ob_pool_data_list.dept_name` 冗餘欄位；若需於後續擴充員工層級分布，員工資料以 `ob_emphire` join（`emplid = emp_id`）取得，`ob_emphire` 採 E04 + E05 雙層 ETL 從舊 OB DB 同步（OBEMPHIRE 採 full 全量重抓策略，詳見 [architecture-spec.md §E07-C](../architecture-spec.md#e07-c-etl-設計)） |

## 7. UI/UX 需求

- 整體統計卡片：5 個關鍵數字（總分派 / Stage 1 / Stage 4 / 覆蓋率 / 執行時間）
- 部門分配表格：含偏差值欄位，超標紅/橘色標示
- 等級分佈：長條圖或圓餅圖（建議 Recharts，與 E03/E04 Dashboard 一致）
- 頁首顯示 CTA：「匯出結果」（連至 F064）、「查看快照詳情」（連至 F066）

## 8. 相依性

- **Blocked By**：F061（月跑已完成）
- **Blocks**：無

## 9. 交叉參考

- 資料模型：[data-model.md#e07-data-model](../data-model.md#e07-data-model)（`assignment_run`、`assignment_run_snapshot`）；[data-model.md#ob-emphire-entity](../data-model.md#ob-emphire-entity)（員工資料 join 來源，採 E04 + E05 雙層 ETL 同步）
- 錯誤處理：[error-handling.md#assignment-errors](../error-handling.md#assignment-errors)
- 非功能需求：[nfr.md](../nfr.md)（NFR-005）
- 架構決策：AD-E07-2
- 相關功能：[F061](F061-trigger-assignment-run.md)、[F062](F062-view-run-progress.md)、[F064](F064-export-assignment-result.md)、[F066](F066-view-run-snapshot-detail.md)
