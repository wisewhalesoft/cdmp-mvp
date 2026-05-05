---
spec-id: F049
title: Stage 0 每日分派數量估算
feature-id: F049
source-story: US-071
epic: E07
module: M01 名單定義
priority: P0-MVP
version: "1.0"
date: 2026-04-24
status: Draft
---

# F049: Stage 0 每日分派數量估算（含單一 LIST_NO 案件試算）

Priority: P0-MVP | Status: Draft | Last Updated: 2026-04-24

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + `data-model.md#e07-data-model` + `error-handling.md#assignment-errors` |
| QA / Tester | 本文件 + `error-handling.md#assignment-errors` |
| UI/UX Designer | 本文件（第 8 節 UI/UX 需求） + `diagrams/F049-stage0-estimate-flow.mmd` |
| Architect | 本文件 + `architecture-spec.md` §3.10 |

---

## 1. 功能摘要

提供 Stage 0「每日電訪名單」預估分派數量與單一 `list_no` 即時案件試算能力，供業務主管在觸發月跑前評估本月工作量配置是否合理、Pool 資料新鮮度是否足夠。本功能為唯讀計算，不寫入 `ob_pool_data_list` 或 `assignment_run`。

## 2. 使用者故事

**As a** 業務主管
**I want** 查看 Stage 0（每日電訪名單）的每日預估分派數量，並能針對單一 `list_no` 即時試算符合條件的案件數
**So that** 可在觸發月跑前評估每日工作量配置、調整比例設定，並確認名單條件涵蓋正確的案件範圍

## 3. 前置條件

- 業務主管已登入並持有有效 JWT Token
- 至少一筆 `ob_list_definition` 的 `status = 'active'` 且 `project_workym = :currentYm`
- `ob_pool_data` 已由 E04 擷取任務匯入當月資料（若無資料，估算結果為 0）

## 4. 驗收標準

### AC-1：顯示 Stage 0 每日估算表

- **Given** 業務主管已進入名單定義頁面並選擇「Stage 0 估算」
- **When** 頁面載入估算資料
- **Then** 顯示本月每個工作日的預估分派件數，表格欄位含：日期、星期、預估件數
- **And** 表格底部顯示本月預估總件數與實際工作天數

### AC-2：估算基準說明

- **Given** Stage 0 估算表已顯示
- **When** 業務主管查看估算說明區
- **Then** 顯示估算所使用的基準參數：`ob_pool_data` 總筆數、每日分派比例係數、排除週末/國定假日邏輯

### AC-3：Pool 筆數偏低警示

- **Given** `ob_pool_data` 本月筆數低於警示門檻（預設 1,000 筆；閾值可於環境變數 `STAGE0_POOL_WARN_THRESHOLD` 配置）
- **When** 估算計算完成
- **Then** 在估算表上方顯示橘色警示：「Pool 資料筆數偏低（現有 N 筆），請確認資料擷取任務已正常執行」

### AC-4：單一 LIST_NO 即時案件試算

- **Given** 業務主管在名單定義清單（F048）中查看某 `status = 'active'` 的名單
- **When** 業務主管點擊該列的「計算案件數量」按鈕
- **Then** 系統依該 `list_no` 的篩選條件（`prod_kind` / `caseyear` / `spec_tp` / `list_period_start` ~ `list_period_end` / `settle_src`）即時 COUNT `ob_pool_data`，回傳「符合條件案件數：N 筆」
- **And** 此試算不執行實際月跑，不寫入 `ob_pool_data_list`，不建立 `assignment_run` 紀錄

### AC-5：試算逾時保護

- **Given** 單一 LIST_NO 試算查詢超過 10 秒仍未返回
- **When** 後端偵測逾時
- **Then** 中斷查詢並回傳 `STAGE0_ESTIMATE_TIMEOUT` 錯誤，提示業務主管稍後再試或聯繫 IT 檢查 `ob_pool_data` 索引

## 5. API 規格

### 5.1 GET /api/v1/assignment/stage0/daily-estimate

| Query Parameter | 型別 | 必填 | 說明 |
|---|---|---|---|
| ym | string（YYYYMM） | 否 | 預設為目前作業年月 |

**Response — 200 OK**

```json
{
  "ym": "202605",
  "workingDays": 22,
  "totalEstimate": 50000,
  "dailyEstimates": [
    { "date": "2026-05-02", "weekday": "一", "estimate": 2272 }
  ],
  "poolCount": 50000,
  "warning": null
}
```

若 `poolCount` 低於 `STAGE0_POOL_WARN_THRESHOLD`，`warning` 設為 `"POOL_COUNT_LOW"`。

### 5.2 GET /api/v1/assignment/list-definitions/:listNo/estimate

**Response — 200 OK**

```json
{
  "listNo": "OB202605001",
  "count": 8500
}
```

**錯誤回應**

| HTTP | 錯誤碼 | 說明 |
|---|---|---|
| 401 | AUTH_TOKEN_MISSING | 未登入 |
| 403 | AUTH_FORBIDDEN | `is_sales_manager` 未啟用 |
| 404 | ASSIGNMENT_LIST_NOT_FOUND | `list_no` 不存在或 `status = 'inactive'` |
| 500 | STAGE0_ESTIMATE_TIMEOUT | 試算查詢超過 10 秒 |

## 6. 商業規則

| 規則編號 | 說明 |
|---|---|
| BR-1 | 試算僅為預覽，不寫入任何分派結果；實際件數以月跑結果為準 |
| BR-2 | 工作日計算排除週末與假日；資料來源為 AppDB `ob_calendar`（由 E04 通用擷取任務從舊 OB DB 同步），篩選條件 `WHERE rest_flg = '0' AND calendar_date BETWEEN :startDate AND :endDate` |
| BR-3 | 試算查詢逾時上限 10 秒，超過則回傳 `STAGE0_ESTIMATE_TIMEOUT` |
| BR-4 | Pool 筆數警示門檻可於環境變數 `STAGE0_POOL_WARN_THRESHOLD` 配置（預設 1000） |

## 7. 錯誤場景

| 場景 | 系統回應 | 參考 |
|---|---|---|
| `list_no` 不存在 | 404 `ASSIGNMENT_LIST_NOT_FOUND` | error-handling.md#assignment-errors |
| 試算查詢逾時 | 500 `STAGE0_ESTIMATE_TIMEOUT` | error-handling.md#assignment-errors |
| Pool 資料為空 | 200 `{ count: 0 }` | — |

## 8. UI/UX 需求

- 每日估算表：日期 / 星期 / 預估件數 + 底部總計
- 橘色警示列：Pool 筆數低於門檻時顯示
- 單一 LIST_NO 試算：清單列的「計算案件數量」按鈕觸發 Modal 或 inline 顯示結果
- 試算結果以粗體顯示：「符合條件案件數：N 筆」

## 9. 相依性

- **Blocked By**：F048（名單定義清單）、E04 擷取任務（`ob_pool_data` 資料來源）
- **Blocks**：F061（觸發月跑前業務主管依此決定是否執行）

## 10. 交叉參考

- 資料模型：[data-model.md#e07-data-model](../data-model.md#e07-data-model)（`ob_pool_data`、`ob_list_definition`）；[data-model.md#ob-calendar-entity](../data-model.md#ob-calendar-entity)（工作日表，由 E04 同步）
- 錯誤處理：[error-handling.md#assignment-errors](../error-handling.md#assignment-errors)
- 流程圖：[diagrams/F049-stage0-estimate-flow.mmd](../diagrams/F049-stage0-estimate-flow.mmd)
- 架構決策：AD-E07-1（OB 資料遷移）、E07 與 E04 依賴關係
- 相關功能：[F048](F048-view-list-definition.md)、[F061](F061-trigger-assignment-run.md)

## 11. 假設

| # | 假設 | 標記 |
|---|---|---|
| A-1 | ~~工作日/假日表由現有系統基礎資料或 `ob_calendar` 提供~~ **已解決（2026-05-04）**：採 `ob_calendar`（AppDB），由 E04 通用擷取任務從舊 OB DB `OBCALENDAR` 同步至 AppDB；詳見 [data-model.md#ob-calendar-entity](../data-model.md#ob-calendar-entity)。對應 OQ-E07-10 / OQ-E07-15 已 Resolved。 | Resolved |
| A-2 | 每日分派比例係數為「`ob_pool_data` 總筆數 / 工作天數」等分 | [ASSUMPTION] |
