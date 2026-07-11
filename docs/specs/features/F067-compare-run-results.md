---
spec-id: F067
title: 比對兩次執行結果差異
feature-id: F067
source-story: US-087
epic: E07
module: M05 快照歷史
priority: P0-MVP
version: "1.1"
date: 2026-05-17
status: Draft
---

# F067: 比對兩次執行結果差異

Priority: P0-MVP | Status: Draft | Last Updated: 2026-05-17

> **v1.1（2026-05-17 / AD-E07 v3.0 處長轄區補修）**：依 F002 §4.6.2 + AD-E07 v3.0，補入處長視角差異比對 `scopeByCreator()` filter 規格（AC-7 + BR-7 + BR-8 + §7 效能需求備註）。處長視角差異比對與人員配對不一致率計算範圍 = 處長轄區內案件；部長 / Admin = 全公司；NFR-005 警示門檻（> 3%）之計算分母同步限縮，避免處長視角下被無關案件稀釋。

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + `data-model.md#e07-data-model` + `error-handling.md#assignment-errors` + `diagrams/F067-run-comparison-flow.mmd` |
| QA / Tester | 本文件 + `nfr.md`（NFR-005） + `diagrams/F067-run-comparison-flow.mmd` |
| UI/UX Designer | 本文件（第 9 節 UI/UX 需求） |
| Architect | 本文件 + `architecture-spec.md` §3.10 |

---

## 1. 功能摘要

提供業務部長 / 業務處長選擇任意兩次月名單分派的結果進行差異比對，包含摘要層級差異、設定差異、客戶層級集合差異，以及**人員配對一致性 diff**（NFR-005 主驗收工具：比較同 APPL_NO 的 `ob_emplid` 是否一致，計算人員配對不一致率，超過 3% 觸發紅色警示）。比對完全由應用層計算，不額外寫入資料。使用者確認升級為 **P0-MVP**（原 epic-brief Should Have）。

## 2. 使用者故事

**As a** 業務部長 / 業務處長
**I want** 選擇任意兩次月名單分派的結果進行差異比對
**So that** 清楚了解調整計分設定或比例設定後對最終分派結果的具體影響（新增了哪些客戶、移除了哪些客戶、等級有何變化、人員配對是否一致）

## 3. 前置條件

- 業務部長 / 業務處長已登入並持有有效 JWT Token
- 兩個目標 `run_id` 均存在且 `status = 'completed'`
- 兩個 `run_id` 的三份快照均已寫入

## 4. 驗收標準

### AC-1：選擇兩次月名單分派進行比對

- **Given** 業務部長 / 業務處長在 F065 歷史清單或 F066 快照詳情頁
- **When** 業務部長 / 業務處長選擇「比對差異」功能並選定 Base run_id 與 Compare run_id
- **Then** 頁面顯示兩次月名單分派的基本資訊並排（`project_workym`、`triggered_at`、`total_cases`）
- **And** 若兩次月名單分派的 `project_workym` 相同，顯示提示「同月比對通常用於重跑調參情境」（不阻擋比對）

### AC-2：摘要層級差異報告

- **Given** 兩次月名單分派已選定
- **When** 比對計算完成
- **Then** 顯示摘要差異：
  - 總分派筆數差異（Base N → Compare M，差異 ±X）
  - 各部門分配量差異表（Base 量 / Compare 量 / 差異值）
  - 各 CARD_LEVEL 等級分佈差異表

### AC-3：人員配對一致性 diff（NFR-005 主驗收工具）

- **Given** 兩次月名單分派已選定且均為 `completed` 狀態
- **When** 比對計算完成
- **Then** 系統顯示「人員配對不一致」報告，包含：
  - 兩次月名單分派中分派給不同業務員的案件清單（每列顯示 `appl_no`、Base `ob_emplid`、Compare `ob_emplid`）
  - **人員配對不一致率** = 不一致案件數 / 同批次總案件數 × 100%
  - 若不一致率 > 3%，顯示紅色警示並連結至 NFR-005
- **And** 提供「下載不一致案件清單」按鈕，匯出 Excel 格式（欄位：`appl_no`、Base `ob_emplid`、Compare `ob_emplid`）

### AC-4：設定差異報告

- **Given** 兩次月名單分派已選定
- **When** 業務部長 / 業務處長查看「設定差異」區塊
- **Then** 列出兩份 `config` 快照的差異項目：
  - 計分版本是否變更（`card_version`）
  - 各 LIST_NO 部門比例是否有調整（差異 ≥ 1% 標示）
  - CR 回分規則是否有切換

### AC-5：客戶層級差異查詢

- **Given** 比對摘要已顯示
- **When** 業務部長 / 業務處長點擊「查看新增客戶」或「查看移除客戶」
- **Then** 顯示僅出現在 Compare 結果而不在 Base 結果中的客戶清單（新增），以及僅在 Base 而不在 Compare 中的客戶清單（移除）
- **And** 每列顯示 `custo_no`、`cust_name`

### AC-7：處長視角差異比對僅計算轄區內案件（v1.1 新增）

- **Given** 登入者 `businessRole = 'section_chief'`（業務處長）且通過 `DirectorOrSectionChiefGuard`，且 Base + Compare 兩 `run_id` 均 `status = 'completed'`
- **When** 業務處長呼叫 `GET /api/v1/assignment/history/compare?runA=...&runB=...` 或 `GET /api/v1/assignment/history/compare/mismatch/export`
- **Then** 整體比對不被阻擋（回 200 OK；不回 403）
- **And** service 層執行 `scopeByCreator(actorUser)` helper：兩份 `result` 快照於應用層計算前，先過濾僅保留處長轄區內 `created_by` 對應之員工 / 部門所屬之案件
- **And** `summary.totalDiff` / `summary.deptDiff` / `summary.levelDiff` 為處長轄區內案件之差異統計
- **And** `personnelMismatch.list` 僅含處長轄區內案件之 `appl_no`；`personnelMismatch.totalCount` = 處長轄區內 Base + Compare 共同案件數（非全公司總數）；`personnelMismatch.rate = mismatchCount / totalCount`（分母同步限縮，避免被轄區外案件稀釋）
- **And** `customerDiff.added` / `customerDiff.removed` 僅含處長轄區內之客戶
- **And** `configDiff` **不過濾**（與 F066 BR-5 一致：`config` 為共用設定快照）
- **And** 5.2 匯出端點之 Excel 檔案僅含處長轄區內之不一致案件列
- **And** `businessRole = 'director'` / `role = 'admin'`：bypass filter，計算全公司差異（與 v1.0 原行為一致）

### AC-6：非 completed 狀態阻擋比對

- **Given** 任一 `run_id` 的 `status` 不為 `completed`
- **When** 業務部長 / 業務處長嘗試比對
- **Then** 回傳 422 `ASSIGNMENT_RUN_NOT_COMPARABLE`，訊息：「僅 completed 狀態的月名單分派可比對」

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
| 403 | E07_ROLE_NOT_ASSIGNED | `businessRole` 非 `'director'` / `'section_chief'`（`DirectorOrSectionChiefGuard` 攔截，依 F002 §4.6.2） |
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
| BR-7 | **處長轄區過濾（v1.1 新增）**：service 層使用 `scopeByCreator(actorUser)` helper 統一過濾（與 F063 BR-6 / F064 BR-6 / F066 BR-5 / F057 v1.1 / F082 BR-3 一致 pattern）；`businessRole = 'section_chief'` 自動於兩份 `result` 快照之應用層計算前先做過濾；`configDiff` 不過濾（與 F066 BR-5 一致）；`businessRole = 'director'` / `role = 'admin'` bypass filter |
| BR-8 | **NFR-005 計算範圍對應（v1.1 新增）**：處長視角 → 人員配對不一致率分母 = 處長轄區內 Base ∩ Compare 案件數；部長 / Admin 視角 → 分母 = 全公司 Base ∩ Compare 案件數；BR-3 之 3% 警示門檻於兩種視角皆適用，但分子分母同步限縮，避免處長視角下警示語意失真 |

## 7. 效能需求

| 項目 | 閾值 | 參考 |
|---|---|---|
| 比對計算時間（10 萬筆 × 2 份快照） | < 30 秒 | `[ASSUMPTION]`（測試驗證） |
| 不一致案件清單 Excel 匯出 | < 2 分鐘 | 採 streaming 寫入 |
| 處長視角比對計算時間 | < 30 秒（同部長視角閾值） | v1.1：scopeByCreator 過濾於應用層執行，資料集小於全公司，預期效能更佳 |

## 8. 錯誤場景

| 場景 | 系統回應 | 參考 |
|---|---|---|
| run_id 不存在 | 404 `ASSIGNMENT_RUN_NOT_FOUND` | error-handling.md#assignment-errors |
| 非 completed 狀態 | 422 `ASSIGNMENT_RUN_NOT_COMPARABLE` | error-handling.md#assignment-errors |
| 快照資料量過大致計算超時 | 500 `SYSTEM_INTERNAL_ERROR`（Logger 記錄具體原因） | error-handling.md#system-errors |

## 9. UI/UX 需求

- 頁首：兩次月名單分派基本資訊並排卡片
- 摘要差異區：表格 + 差異值（正數綠 / 負數紅）
- 人員配對一致性區：醒目顯示不一致率（> 3% 紅色）+ 「下載不一致案件清單」按鈕
- 設定差異區：`config` 快照 diff 表格
- 客戶層級差異：「查看新增客戶」/「查看移除客戶」切換按鈕 + 彈窗清單

## 10. 相依性

- **Blocked By**：F066（兩次月名單分派的快照詳情需可讀取）
- **Blocks**：無（本 Feature 為終端消費功能）

## 11. 交叉參考

- 資料模型：[data-model.md#e07-data-model](../data-model.md#e07-data-model)（`assignment_run`、`assignment_run_snapshot`）
- 錯誤處理：[error-handling.md#assignment-errors](../error-handling.md#assignment-errors)
- 非功能需求：[nfr.md](../nfr.md)（NFR-005 人員配對不一致率 < 3%）
- 流程圖：[diagrams/F067-run-comparison-flow.mmd](../diagrams/F067-run-comparison-flow.mmd)
- 架構決策：AD-E07-2
- 相關功能：[F061](F061-trigger-assignment-run.md)、[F065](F065-view-run-history-list.md)、[F066](F066-view-run-snapshot-detail.md)
