---
spec-id: F064
title: 匯出分派結果
feature-id: F064
source-story: US-084
epic: E07
module: M04 分派執行
priority: P0-MVP
version: "1.0"
date: 2026-04-24
status: Draft
---

# F064: 匯出分派結果

Priority: P0-MVP | Status: Draft | Last Updated: 2026-04-24

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + `data-model.md#e07-data-model` + `error-handling.md#assignment-errors` |
| QA / Tester | 本文件 + `nfr.md`（匯出效能） |
| UI/UX Designer | 本文件（第 7 節 UI/UX 需求） |
| Architect | 本文件 + `architecture-spec.md` §3.10 |

---

## 1. 功能摘要

提供業務主管將已完成月跑的分派結果匯出為 Excel 或 CSV 檔案。大量資料採 streaming 寫入，避免記憶體溢出。匯出欄位對應舊系統 SP_INFOT_ASSIGNEXPORTNAMELIST 輸出格式，讓業務主管可直接交付予業務員或上傳至 CRM。

## 2. 使用者故事

**As a** 業務主管
**I want** 將本月分派結果匯出為 Excel 或 CSV 檔案
**So that** 可將名單交付給業務人員使用，或上傳至 CRM / 電話系統，完成最後一哩路

## 3. 前置條件

- 業務主管已登入並持有有效 JWT Token
- 目標 `run_id` 存在於 `assignment_run` 且 `status = 'completed'`

## 4. 驗收標準

### AC-1：觸發匯出並下載檔案

- **Given** 月跑已完成（`status = 'completed'`）
- **When** 業務主管點擊「匯出結果」並選擇格式（Excel / CSV）
- **Then** 系統產生對應格式檔案，瀏覽器觸發下載
- **And** 檔案名稱格式：`assignment_result_{YYYYMM}_{run_id 前 8 碼}.xlsx`（或 `.csv`）

### AC-2：匯出欄位包含關鍵資訊

- **Given** 匯出動作觸發
- **When** 檔案產生完成
- **Then** 匯出檔案包含欄位：客戶編號（`custo_no`）、客戶姓名（`cust_name`）、CARD_LEVEL 等級、TIER_LEVEL 代碼、分配部門代碼（`dept_id`）、分配部門名稱（`dept_name`）、分配人員工號（`emplid`）、分配人員姓名（由 `ob_emphire.emp_nm` join 取得，join 鍵 `ob_pool_data_list.emplid = ob_emphire.emp_id`）、分配日期（`assignday`）
- **And** 每一列代表一筆分派紀錄

### AC-3：月跑未完成時阻擋匯出

- **Given** 目標 `run_id` 的 `status` 為 `pending` / `running` / `failed`
- **When** 業務主管嘗試匯出
- **Then** 回傳 422 `ASSIGNMENT_RUN_NOT_COMPLETED`，前端匯出按鈕 disabled 並顯示提示「分派執行中，完成後才能匯出」

### AC-4：大量資料串流匯出

- **Given** 分派結果超過 50,000 筆
- **When** 業務主管觸發匯出
- **Then** 系統採 streaming 寫入（不完整讀入記憶體），顯示「正在產生檔案，請稍候…」提示
- **And** 檔案產生完成後自動下載
- **And** 若超過 5 分鐘仍未完成，中斷匯出並回傳 500 `EXPORT_FILE_EXPIRED`，訊息：「檔案產生逾時，請稍後再試或聯繫 IT」

### AC-5：匯出操作稽核

- **Given** 匯出成功完成
- **When** 後端處理完成
- **Then** 寫入 `assignment_audit_log`（`action = 'EXPORT'`, `entity_type = 'assignment_run'`, `entity_id = run_id`, `after_value` 記錄檔案格式與筆數）

## 5. API 規格

### 5.1 GET /api/v1/assignment/runs/:runId/export

**Query Parameters**

| 參數 | 型別 | 必填 | 說明 |
|---|---|---|---|
| format | string | 是 | `xlsx` / `csv` |

**Response — 200 OK**

- `Content-Type`: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`（xlsx）或 `text/csv`
- `Content-Disposition`: `attachment; filename="assignment_result_202605_550e8400.xlsx"`
- Response body：檔案二進位內容（streaming）

**錯誤回應**

| HTTP | 錯誤碼 | 說明 |
|---|---|---|
| 401 | AUTH_TOKEN_MISSING | 未登入 |
| 403 | AUTH_FORBIDDEN | `is_sales_manager` 未啟用 |
| 404 | ASSIGNMENT_RUN_NOT_FOUND | `run_id` 不存在 |
| 422 | ASSIGNMENT_RUN_NOT_COMPLETED | 月跑尚未完成 |
| 500 | EXPORT_FILE_EXPIRED | 匯出超過 5 分鐘 timeout |

## 6. 商業規則

| 規則編號 | 說明 |
|---|---|
| BR-1 | 資料來源：`assignment_run_snapshot.payload`（`snapshot_type = 'result'`） |
| BR-2 | 大量資料採 streaming 寫入，不完整讀入記憶體 |
| BR-3 | 匯出逾時上限 5 分鐘；超過回傳 `EXPORT_FILE_EXPIRED` |
| BR-4 | 檔案名稱包含 `YYYYMM` + `run_id 前 8 碼`，便於業務主管識別 |
| BR-5 | 每次匯出寫入 `assignment_audit_log`（稽核用途） |

## 7. UI/UX 需求

- 「匯出結果」按鈕：顯示格式選擇下拉（Excel / CSV）
- 匯出進行中：顯示 loading spinner + 「正在產生檔案」訊息
- 匯出失敗：顯示錯誤 toast + 「重試」按鈕

## 8. 相依性

- **Blocked By**：F061（月跑已完成，快照已寫入）
- **Blocks**：無

## 9. 交叉參考

- 資料模型：[data-model.md#e07-data-model](../data-model.md#e07-data-model)（`assignment_run_snapshot`）；[data-model.md#ob-emphire-entity](../data-model.md#ob-emphire-entity)（員工姓名 join 來源 `ob_emphire`，採 E04 + E05 雙層 ETL 同步）
- 錯誤處理：[error-handling.md#assignment-errors](../error-handling.md#assignment-errors)
- 架構決策：AD-E07-2
- 相關功能：[F061](F061-trigger-assignment-run.md)、[F063](F063-view-run-result-summary.md)

## 10. 假設

| # | 假設 | 標記 |
|---|---|---|
| A-1 | ~~員工姓名由員工主檔 join 取得（`[ASSUMPTION]` 表名由 system-architect 確認）~~ **已解決（2026-05-04，2026-05-05 同步機制更新）**：員工姓名由 `ob_emphire.emp_nm` join 取得（`ob_pool_data_list.emplid = ob_emphire.emp_id`）；`ob_emphire` 採 **E04 + E05 雙層 ETL** 從舊 OB DB `OBEMPHIRE` 同步至 AppDB（E04 抓 raw → E05 Pipeline TargetLoad full replace，OBEMPHIRE 採 full 全量重抓策略）。詳見 [data-model.md#ob-emphire-entity](../data-model.md#ob-emphire-entity) 與 [architecture-spec.md §E07-C](../architecture-spec.md#e07-c-etl-設計)。對應 OQ-E07-12 / OQ-E07-15 已 Resolved。 | Resolved |
| A-2 | 匯出格式預設支援 xlsx 與 csv；Excel 使用 streaming 庫（如 `exceljs` stream mode） | [ASSUMPTION] |
