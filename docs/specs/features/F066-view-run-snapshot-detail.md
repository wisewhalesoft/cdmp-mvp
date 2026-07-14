---
spec-id: F066
title: 查看執行快照詳情
feature-id: F066
source-story: US-086
epic: E07
module: M05 快照歷史
priority: P0-MVP
version: "1.3"
date: 2026-07-14
status: Draft
---

# F066: 查看執行快照詳情

Priority: P0-MVP | Status: Draft | Last Updated: 2026-07-14

> **v1.3（2026-07-14 / 使用者友善重構 + 分派結果對齊匯出格式）**：本次不變更快照儲存與過濾語意，僅重構前端呈現與新增一個唯讀分頁端點。三項變更：
> 1. **契約對齊修正（已合入）**：前端原讀 `data.data` / `data.runId`，後端單份快照端點實際回傳 `runMeta` / `payload` → 頁面全空。已更正為讀 `payload` / `runMeta`（見 §5.2a）。
> 2. **UI 使用者友善重構（AC-7）**：移除開發術語（`type=config`、`READ-ONLY 不可變`、`AD-E07-3`、除錯用原始 JSON、`payload`/`JSONB`/`OBPOOLDATA`/`endpoint` 等），排版對齊「篩選欄位」（`prototypes/37-base-code.html`）與「計分卡設定」（`prototypes/28-scoring-config.html`）：標題+說明區塊、頂部 run 資訊卡、底線式分頁、中文欄名（代碼降為灰色小字）、decode badge、豐富空/載入狀態。
> 3. **分派結果對齊匯出 23 欄（AC-8 + §5.3）**：`result` 分頁改以新分頁端點 `GET /assignment/runs/:runId/result` 呈現 F064 匯出之 23 欄（含部門/姓名/名單名稱等 join decode），取代原由快照 payload 自動推導欄位（payload 僅含 9/23 欄）。快照 payload 仍保留供下載。
>
> **路由更正**：本 spec v1.1 之 API 章節誤寫 `/assignment/history/:runId/...`；實作權威路由為 `/api/v1/assignment/runs/:runId/...`（見 `AssignmentRunController`）。v1.3 起 §5 一律以實作路由為準。
>
> **v1.1（2026-05-17 / AD-E07 v3.0 處長轄區補修）**：依 F002 §4.6.2 + AD-E07 v3.0，補入處長視角分型 snapshot 過濾規格（AC-6 + BR-5 + BR-6）。`type = 'config'` 共用設定不過濾；`type = 'input_list'` / `'result'` 走 `scopeByCreator()` filter 僅顯示處長轄區案件；service 層 helper pattern 與 F063 / F064 / F057 v1.1 / F082 BR-3 一致。

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + `data-model.md#e07-data-model` + `error-handling.md#assignment-errors` + `diagrams/F066-snapshot-detail-flow.mmd` |
| QA / Tester | 本文件 + `error-handling.md#assignment-errors` |
| UI/UX Designer | 本文件（第 7 節 UI/UX 需求） + `diagrams/F066-snapshot-detail-flow.mmd` |
| Architect | 本文件 + `architecture-spec.md` §3.10（AssignmentSnapshot Service） |

---

## 1. 功能摘要

提供業務部長 / 業務處長查看特定月名單分派的三份執行快照詳細內容（`config` / `input_list` / `result`）。快照為不可修改的唯讀紀錄（INSERT-only）；JSONB payload 由前端解析並以表格方式呈現。`input_list` 與 `result` 快照提供搜尋功能（依客戶編號 / 人員工號）。

## 2. 使用者故事

**As a** 業務部長 / 業務處長
**I want** 查看特定月名單分派的三份執行快照詳細內容
**So that** 可完整追溯當時的執行設定、輸入名單與分派結果，作為稽核依據或問題排查參考

## 3. 前置條件

- 業務部長 / 業務處長已登入並持有有效 JWT Token
- 目標 `run_id` 存在於 `assignment_run`
- `assignment_run_snapshot` 已寫入三份快照（`config` / `input_list` / `result`）

## 4. 驗收標準

### AC-1：顯示快照總覽

- **Given** 業務部長 / 業務處長從 F065 歷史清單進入某月名單分派的詳情頁
- **When** 頁面載入完成
- **Then** 顯示月名單分派基本資訊（`run_id`、`project_workym`、`triggered_by`、`triggered_at`、`finished_at`、`status`、`total_cases`）
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

### AC-6：處長視角依 snapshotType 分型過濾（v1.1 新增）

- **Given** 登入者 `businessRole = 'section_chief'`（業務處長）且通過 `DirectorOrSectionChiefGuard`
- **When** 業務處長呼叫 `GET /api/v1/assignment/history/:runId/snapshot`（總覽）或 `GET /api/v1/assignment/history/:runId/snapshot/search?snapshotType={type}`（5.2 搜尋端點）
- **Then** 整體查詢不被阻擋（回 200 OK；不回 403）
- **And** 依 `snapshotType` 分型套用 `scopeByCreator(actorUser)` helper：
  - `type = 'config'`：**不過濾**（config 為共用設定快照，部門比例 / 計分版本等屬全公司設定，處長有完整檢視權限）
  - `type = 'input_list'`：**過濾**，僅顯示處長轄區內 `created_by` 對應之員工 / 部門所屬之案件（`custo_no` 集合縮小）
  - `type = 'result'`：**過濾**，僅顯示處長轄區內 `created_by` 對應之員工 / 部門所屬之分派結果列
- **And** 總覽端點（5.1）回 response 時：`snapshots.config` 不變、`snapshots.inputList.totalCount` / `byListNo` 與 `snapshots.result.totalCount` / `byDept` / `byLevel` 為處長轄區縮小後之聚合
- **And** `businessRole = 'director'` / `role = 'admin'`：bypass filter，全部 snapshot 回原值

### AC-5：run_id 不存在或快照缺失

- **Given** URL 中的 `run_id` 不存在於 `assignment_run`，或 `assignment_run_snapshot` 缺少某份快照
- **When** 業務部長 / 業務處長進入詳情頁
- **Then** 回傳 404 `ASSIGNMENT_RUN_NOT_FOUND`，前端顯示「找不到該月名單分派紀錄或快照不完整」

### AC-7：使用者友善呈現（v1.3 新增）

- **Given** 業務部長 / 業務處長進入快照詳情頁
- **When** 頁面載入完成
- **Then** 頁面**不得**出現下列開發術語或內部代碼（對使用者無意義）：
  - `type = config` / `type = input_list` / `type = result`（分頁標題只顯示中文名稱）
  - `READ-ONLY 不可變`（改以中性用語如「唯讀紀錄」表示）、內部決策碼 `AD-E07-3`（保留期只顯示人類可讀的年限）
  - 「展開原始 JSON（除錯用）」原始 payload 區塊（一般業務角色不顯示；下載仍保留）
  - 資料表英文欄位 key 直接當表頭（`listNo` / `cardType` / `dept_id` / `emplid` / `ration` …）、以及 `payload` / `JSONB` / `OBPOOLDATA` / `list_definition` / `assignment_run_snapshot` / `endpoint` 等字樣
- **And** 版面對齊「篩選欄位」與「計分卡設定」頁：頁面標題 + 一行說明區塊、頂部 run 資訊卡（涵蓋 AC-1 欄位、代碼配人類可讀名稱）、**底線式分頁**（非藥丸式）、表格欄名一律中文（原始代碼降為灰色小字次要顯示）、類別值以 decode badge 呈現（如 `CARD_TYPE` / `TIER_LEVEL` / 是否分配 CR）
- **And** 三態呈現齊備（永不留白）：載入中提示、查無資料之空狀態（含情境化文案）、錯誤狀態

### AC-8：分派結果對齊匯出 23 欄（v1.3 新增）

- **Given** 業務部長 / 業務處長點擊「分派結果」分頁
- **When** 分頁內容載入
- **Then** 以表格呈現 F064 匯出（`EXPORT_HEADER_V2`）之 **23 欄**（分處 / 案號 / 指派日 / 名單代號 / 名單名稱 / 進件日 / CR_ID / CR_NM / 是否分配CR / TIER / 部門代號 / 部門名稱 / 員編 / 姓名 / 職級 / 專案類別 / 專案名稱 / 逾期天數 / 客戶利率 / STA_CODE / 案件狀態 / 廠牌名稱 / 名單週期月數），欄值格式與匯出一致（指派日 `YYYYMMDD`、進件日 `YYYY/MM/DD`、join-miss → 空）
- **And** 資料來源為新分頁端點 `GET /assignment/runs/:runId/result`（§5.3），**非**快照 payload（payload 僅含 9/23 欄，缺部門名稱 / 姓名 / 名單名稱等）
- **And** 提供分頁控制與依 `客戶編號 / 人員工號 / 案號` 之後端搜尋（對齊 AC-4；比對欄位皆在 `ob_monthly_run_result` 上，`COUNT` 免 join 巨量 pool 表）
- **And** 處長視角沿用 §5.3 之 `scopeByCreator` 過濾（BR-5 / BR-6 語意一致：縮小集合、不回 403）

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

### 5.2a 實作權威路由與單份快照回應契約（v1.3 對齊）

實作之快照端點掛於 `AssignmentRunController`（前綴 `/api/v1/assignment/runs`）：

| 方法 | 路由 | 說明 |
|---|---|---|
| GET | `/api/v1/assignment/runs/:runId/snapshot` | 三份快照總覽（`{ runMeta, snapshots: { config, inputList, result } }`） |
| GET | `/api/v1/assignment/runs/:runId/snapshot/:type` | 單份快照 |

**單份快照回應 — 200 OK**（權威 shape；前端須讀 `payload` / `runMeta`，勿讀 `data` / `runId`）：

```json
{
  "runMeta": { "runId": "...", "projectWorkym": "202607", "triggeredBy": "...", "triggeredAt": "...", "finishedAt": "...", "status": "completed", "totalCases": 115197 },
  "type": "config",
  "payload": { "...": "..." }
}
```

### 5.3 GET /api/v1/assignment/runs/:runId/result（v1.3 新增 — 分派結果友善分頁）

唯讀分頁端點，供「分派結果」分頁以 F064 匯出之 23 欄呈現。重用 `AssignmentRunReportService` 之 join 血緣（`ob_monthly_run_result r` INNER JOIN `ob_pool_data o` + LEFT JOIN `ob_emphire e` / `ob_list_definition d`）、`EXPORT_HEADER_V2`（23 欄標籤）與 `formatRow()`（欄值格式）。

**Query Parameters**

| 參數 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| page | number | 否 | 1 | 頁碼（1-based） |
| pageSize | number | 否 | 50 | 每頁列數（上限 200） |
| q | string | 否 | — | 搜尋字串；比對 `r.custo_no` / `r.emplid` / `r.appl_no`（皆位於 `ob_monthly_run_result`，`COUNT` 免 join 巨量 pool 表） |

**Response — 200 OK**

```json
{
  "runId": "...",
  "columns": [ { "key": "deptName", "label": "分處" }, { "key": "applNo", "label": "案號" }, "... 23 欄" ],
  "rows": [ { "deptName": "台北分處", "applNo": "A112030571", "assignday": "20260701", "...": "..." } ],
  "page": 1,
  "pageSize": 50,
  "total": 115197
}
```

**規則**

- 排序固定 `ORDER BY r.list_no, r.orgno, r.appl_no`（與匯出 I-EXP-DET-01 一致）。
- 分頁採 `OFFSET/FETCH`（UI 逐頁瀏覽；搜尋收斂結果，深頁由搜尋取代）。`total` 以 `COUNT(*)` over `r`（+ scope + 搜尋）計算。
- 欄值格式重用 `formatRow()`：指派日 `YYYYMMDD`、進件日 `YYYY/MM/DD`、emphire join-miss → 部門名稱/姓名/職級空、員編仍輸出。
- RBAC：`DirectorOrSectionChiefGuard`；處長走 `scopeByCreator`（`r.emplid IN (...)`；無轄區 → `total=0` + 空 rows，回 200，不回 403，同 BR-6）。

**錯誤回應**

| HTTP | 錯誤碼 | 說明 |
|---|---|---|
| 401 | AUTH_TOKEN_MISSING | 未登入 |
| 403 | E07_ROLE_NOT_ASSIGNED | 角色非部長 / 處長 |
| 404 | ASSIGNMENT_RUN_NOT_FOUND | `run_id` 不存在 |

## 6. 商業規則

| 規則編號 | 說明 |
|---|---|
| BR-1 | 快照為 INSERT-only，不可修改或刪除 |
| BR-2 | JSONB payload 預設由前端解析；資料量 > 100,000 筆時啟用後端搜尋 API（5.2） |
| BR-3 | `input_list` 快照間接保存月名單分派當時的名單定義篩選結果，可追溯名單條件變更的影響 |
| BR-4 | 快照保留期與 `assignment_run` 相同（3 年，AD-E07-3） |
| BR-5 | **處長轄區分型過濾（v1.1 新增）**：service 層使用 `scopeByCreator(actorUser)` helper，依 `snapshotType` 分流：`config` 不過濾（共用設定）；`input_list` / `result` 過濾僅含處長轄區內案件 / 分派結果；helper pattern 與 F063 BR-6 / F064 BR-6 / F057 v1.1 / F082 BR-3 一致；`businessRole = 'director'` / `role = 'admin'` bypass filter |
| BR-6 | **過濾語意（v1.1 新增）**：過濾為「縮小回傳集合」而非「拒絕請求」；不會回 403 / 422，僅回 200 OK + 縮小後之 payload；若處長轄區內 `input_list` / `result` 子集為空，回 200 OK + `totalCount = 0`（不回 404，404 仍僅針對 AC-5 之 `run_id` 不存在或快照本身缺失）；一般使用者已於 Guard 階段被擋下 |
| BR-7 | **友善呈現（v1.3 新增）**：UI 不得暴露開發術語 / 內部代碼（AC-7 清單）；欄名一律中文、類別值 decode 為 badge；原始快照 JSON 僅保留於「下載快照檔」功能，不於畫面直接顯示（除錯用途改由 admin 專屬或移除） |
| BR-8 | **分派結果資料源（v1.3 新增）**：`result` 分頁改由 §5.3 端點供資料（對齊 F064 匯出 23 欄），不再以快照 payload 自動推導欄位；快照 `result` payload 仍存在且可下載，但畫面呈現以 §5.3 為準 |

## 7. UI/UX 需求

> **v1.3 重構**：排版對齊「篩選欄位」（`prototypes/37-base-code.html` / `field-base-page.tsx` + `fields-tab.tsx`）與「計分卡設定」（`prototypes/28-scoring-config.html` / `scoring-config-page.tsx`）之設計語彙。

- **頁面標題 + 一行說明區塊**（37 pattern）：`快照詳情` + 說明「檢視本次月名單分派當時的設定、輸入名單與分派結果（唯讀）」。
- **頂部 run 資訊卡**（28 context-card pattern）：涵蓋 AC-1 全部欄位（作業月份、狀態、觸發者、觸發/完成時間、總分派筆數），代碼配人類可讀名稱；批次編號（UUID）降為可複製小字，非主要識別。
- **底線式分頁**（match 37 / 28 與 prototype 35；取代現行藥丸式）：設定快照 / 輸入名單 / 分派結果，附筆數 pill。
- **設定快照**：中文欄名表格（名單定義 / 計分卡分數區間 / 分級對應 / 部門比例 / 人員比例），代碼降為灰色小字，`CARD_TYPE` / `TIER_LEVEL` 等以 decode badge 呈現。
- **輸入名單**：中文欄名表格 + 前端過濾（本輪）；後端搜尋為 follow-up（見 §11）。
- **分派結果**：§5.3 端點供之 23 欄表格 + 分頁控制 + 後端搜尋框（客戶編號 / 人員工號 / 案號）。畫面另置 **F115 回寫按鈕之設計位置**（本輪為 disabled 佔位，標「回寫功能・下一階段」；實作見 F115）。
- **三態呈現（永不留白）**：載入中 / 空狀態（情境化文案）/ 錯誤（可重試）。
- 大型快照資料：若單份 payload > 5 MB，顯示「資料量較大，載入中…」提示。

## 8. 相依性

- **Blocked By**：F061（快照由月名單分派完成時寫入）、F065（入口頁）
- **Blocks**：F067（比對差異需要能查看個別快照詳情）
- **Related**：[F115](F115-writeback-obpooldata-list.md)（分派結果回寫 OBPOOLDATA_LIST；回寫按鈕位於本頁分派結果分頁）

## 11. 待辦（Follow-up）

- 輸入名單分頁之後端搜尋端點（AC-3；資料量 > 100,000 筆時，比照 §5.3 result 端點作法補分頁 + 搜尋）。
- 進件日於 SQL 端字串化以徹底繞開時區 getter 歧義（沿用 F064 之 follow-up）。

## 9. 交叉參考

- 資料模型：[data-model.md#e07-data-model](../data-model.md#e07-data-model)（`assignment_run`、`assignment_run_snapshot`）
- 錯誤處理：[error-handling.md#assignment-errors](../error-handling.md#assignment-errors)
- 流程圖：[diagrams/F066-snapshot-detail-flow.mmd](../diagrams/F066-snapshot-detail-flow.mmd)
- 架構決策：AD-E07-2、AD-E07-3（保留 3 年）
- 相關功能：[F061](F061-trigger-assignment-run.md)、[F065](F065-view-run-history-list.md)、[F067](F067-compare-run-results.md)
