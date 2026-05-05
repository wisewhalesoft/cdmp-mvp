---
spec-id: F067
title: 比對兩次執行結果差異
feature-id: F067
source-story: US-087
epic: E07
module: M05 快照歷史
priority: P0-MVP
version: "1.0"
date: 2026-04-24
status: Draft
---

# F067: 比對兩次執行結果差異

Priority: P0-MVP | Status: Draft | Last Updated: 2026-04-24

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + `data-model.md#e07-data-model` + `error-handling.md#assignment-errors` + `diagrams/F067-run-comparison-flow.mmd` |
| QA / Tester | 本文件 + `nfr.md`（NFR-005） + `diagrams/F067-run-comparison-flow.mmd` |
| UI/UX Designer | 本文件（第 9 節 UI/UX 需求） |
| Architect | 本文件 + `architecture-spec.md` §3.10 |

---

## 1. 功能摘要

提供業務主管選擇任意兩次月跑的結果進行差異比對，包含摘要層級差異、設定差異、客戶層級集合差異，以及**人員配對一致性 diff**（NFR-005 主驗收工具：比較同 APPL_NO 的 `ob_emplid` 是否一致，計算人員配對不一致率，超過 3% 觸發紅色警示）。比對完全由應用層計算，不額外寫入資料。使用者確認升級為 **P0-MVP**（原 epic-brief Should Have）。

## 2. 使用者故事

**As a** 業務主管
**I want** 選擇任意兩次月跑的結果進行差異比對
**So that** 清楚了解調整計分設定或比例設定後對最終分派結果的具體影響（新增了哪些客戶、移除了哪些客戶、等級有何變化、人員配對是否一致）

## 3. 前置條件

- 業務主管已登入並持有有效 JWT Token
- 兩個目標 `run_id` 均存在且 `status = 'completed'`
- 兩個 `run_id` 的三份快照均已寫入

## 4. 驗收標準

### AC-1：選擇兩次月跑進行比對

- **Given** 業務主管在 F065 歷史清單或 F066 快照詳情頁
- **When** 業務主管選擇「比對差異」功能並選定 Base run_id 與 Compare run_id
- **Then** 頁面顯示兩次月跑的基本資訊並排（`project_workym`、`triggered_at`、`total_cases`）
- **And** 若兩次月跑的 `project_workym` 相同，顯示提示「同月比對通常用於重跑調參情境」（不阻擋比對）

### AC-2：摘要層級差異報告

- **Given** 兩次月跑已選定
- **When** 比對計算完成
- **Then** 顯示摘要差異：
  - 總分派筆數差異（Base N → Compare M，差異 ±X）
  - 各部門分配量差異表（Base 量 / Compare 量 / 差異值）
  - 各 CARD_LEVEL 等級分佈差異表

### AC-3：人員配對一致性 diff（NFR-005 主驗收工具）

- **Given** 兩次月跑已選定且均為 `completed` 狀態
- **When** 比對計算完成
- **Then** 系統顯示「人員配對不一致」報告，包含：
  - 兩次月跑中分派給不同業務員的案件清單（每列顯示 `appl_no`、Base `ob_emplid`、Compare `ob_emplid`）
  - **人員配對不一致率** = 不一致案件數 / 同批次總案件數 × 100%
  - 若不一致率 > 3%，顯示紅色警示並連結至 NFR-005
- **And** 提供「下載不一致案件清單」按鈕，匯出 Excel 格式（欄位：`appl_no`、Base `ob_emplid`、Compare `ob_emplid`）

### AC-4：設定差異報告

- **Given** 兩次月跑已選定
- **When** 業務主管查看「設定差異」區塊
- **Then** 列出兩份 `config` 快照的差異項目：
  - 計分版本是否變更（`card_version`）
  - 各 LIST_NO 部門比例是否有調整（差異 ≥ 1% 標示）
  - CR 回分規則是否有切換

### AC-5：客戶層級差異查詢

- **Given** 比對摘要已顯示
- **When** 業務主管點擊「查看新增客戶」或「查看移除客戶」
- **Then** 顯示僅出現在 Compare 結果而不在 Base 結果中的客戶清單（新增），以及僅在 Base 而不在 Compare 中的客戶清單（移除）
- **And** 每列顯示 `custo_no`、`cust_name`

### AC-6：非 completed 狀態阻擋比對

- **Given** 任一 `run_id` 的 `status` 不為 `completed`
- **When** 業務主管嘗試比對
- **Then** 回傳 422 `ASSIGNMENT_RUN_NOT_COMPARABLE`，訊息：「僅 completed 狀態的月跑可比對」

## 5. API 規格

### 5.1 GET /api/v1/assignment/history/compare

**Query Parameters**

| 參數 | 型別 | 必填 | 說明 |
|---|---|---|---|
| runA | UUID | 是 | Base run_id |
| runB | UUID | 是 | Compare run_id |

**Response — 200 OK**

```json
{
  "base": { "runId": "...", "projectWorkym": "202604", "totalCases": 9000 },
  "compare": { "runId": "...", "projectWorkym": "202605", "totalCases": 9500 },
  "summary": {
    "totalDiff": 500,
    "deptDiff": [{ "deptId": "D01", "baseCount": 2700, "compareCount": 3230, "diff": 530 }],
    "levelDiff": [{ "cardLevel": "A", "baseCount": 1800, "compareCount": 2000, "diff": 200 }]
  },
  "configDiff": {
    "cardVersionChanged": { "from": 2, "to": 3 },
    "deptRatioChanges": [{ "listNo": "OB202605001", "deptId": "D01", "from": 30, "to": 35 }],
    "crRuleChanged": { "from": false, "to": true }
  },
  "personnelMismatch": {
    "list": [{ "applNo": "A001", "baseEmplId": "EMP001", "compareEmplId": "EMP002" }],
    "mismatchCount": 200,
    "totalCount": 9000,
    "rate": 0.0222,
    "alert": false
  },
  "customerDiff": {
    "added": [{ "custoNo": "C001", "custName": "王大明" }],
    "removed": [{ "custoNo": "C100", "custName": "李小華" }]
  }
}
```

### 5.2 GET /api/v1/assignment/history/compare/mismatch/export

**Query Parameters**：同 5.1。

**Response — 200 OK**：Excel 檔案（streaming），`Content-Disposition: attachment`。

**錯誤回應**

| HTTP | 錯誤碼 | 說明 |
|---|---|---|
| 401 | AUTH_TOKEN_MISSING | 未登入 |
| 403 | AUTH_FORBIDDEN | `is_sales_manager` 未啟用 |
| 404 | ASSIGNMENT_RUN_NOT_FOUND | 任一 `run_id` 不存在 |
| 422 | ASSIGNMENT_RUN_NOT_COMPARABLE | 任一 `run_id` 非 `completed` 狀態 |

## 6. 商業規則

| 規則編號 | 說明 |
|---|---|
| BR-1 | 比對完全由應用層計算（讀兩份 `result` 快照 + 兩份 `config` 快照） |
| BR-2 | 人員配對不一致率 = 不一致案件數（`appl_no` join 後 `ob_emplid` 不同）/ 同批次總案件數 |
| BR-3 | 不一致率警示門檻：> 3% 觸發紅色警示（對應 NFR-005） |
| BR-4 | 客戶層級 diff 採集合運算：`Compare - Base` 為新增；`Base - Compare` 為移除 |
| BR-5 | 同月比對允許執行，僅顯示提示（不阻擋） |
| BR-6 | 比對結果不寫入資料庫（唯讀計算） |

## 7. 效能需求

| 項目 | 閾值 | 參考 |
|---|---|---|
| 比對計算時間（10 萬筆 × 2 份快照） | < 30 秒 | `[ASSUMPTION]`（測試驗證） |
| 不一致案件清單 Excel 匯出 | < 2 分鐘 | 採 streaming 寫入 |

## 8. 錯誤場景

| 場景 | 系統回應 | 參考 |
|---|---|---|
| run_id 不存在 | 404 `ASSIGNMENT_RUN_NOT_FOUND` | error-handling.md#assignment-errors |
| 非 completed 狀態 | 422 `ASSIGNMENT_RUN_NOT_COMPARABLE` | error-handling.md#assignment-errors |
| 快照資料量過大致計算超時 | 500 `SYSTEM_INTERNAL_ERROR`（Logger 記錄具體原因） | error-handling.md#system-errors |

## 9. UI/UX 需求

- 頁首：兩次月跑基本資訊並排卡片
- 摘要差異區：表格 + 差異值（正數綠 / 負數紅）
- 人員配對一致性區：醒目顯示不一致率（> 3% 紅色）+ 「下載不一致案件清單」按鈕
- 設定差異區：`config` 快照 diff 表格
- 客戶層級差異：「查看新增客戶」/「查看移除客戶」切換按鈕 + 彈窗清單

## 10. 相依性

- **Blocked By**：F066（兩次月跑的快照詳情需可讀取）
- **Blocks**：無（本 Feature 為終端消費功能）

## 11. 交叉參考

- 資料模型：[data-model.md#e07-data-model](../data-model.md#e07-data-model)（`assignment_run`、`assignment_run_snapshot`）
- 錯誤處理：[error-handling.md#assignment-errors](../error-handling.md#assignment-errors)
- 非功能需求：[nfr.md](../nfr.md)（NFR-005 人員配對不一致率 < 3%）
- 流程圖：[diagrams/F067-run-comparison-flow.mmd](../diagrams/F067-run-comparison-flow.mmd)
- 架構決策：AD-E07-2
- 相關功能：[F061](F061-trigger-assignment-run.md)、[F065](F065-view-run-history-list.md)、[F066](F066-view-run-snapshot-detail.md)
