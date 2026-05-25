---
spec-id: F079
title: 部門比例設定（per-LIST_NO 各部門分派比例）
feature-id: F079
source-story: US-109
epic: E07
module: M03a 部門比例設定階段
priority: P0-MVP
version: "1.3"
date: 2026-05-25
status: Draft
---

# F079: 部門比例設定（per-LIST_NO 各部門分派比例）

Priority: P0-MVP | Status: Draft | Last Updated: 2026-05-25

> **v1.3 修訂（2026-05-25 / commit 38eb0dc 落地）**：§7 UI/UX 補述「Prototype 29a 對齊」項目（5-step stage breadcrumb / Sum Banner / 預估案件數欄）。`directorName` GET response 欄位 v1.x 已有定義，commit 38eb0dc 為實作落地，spec 本身無欄位變動。
> **v1.2 救援重寫（2026-05-16）**：前一輪 PowerShell 編碼事故損毀本檔內容，本版本依 US-109 + AD-E07 v3.0 一致性決議完整重建；Guard 名稱統一為 `DirectorGuard`（廢除 `SalesManagerGuard`）；業務角色欄位 `business_role`；JWT claim 為 `businessRole`；保留 v1.0 / v1.1 所有設計決議與 Phase 1 風險決議落地。
> **v1.1 修訂（2026-05-16 / E07 衍生補修 / system-architect Phase 1 風險決議 #6 落地）**：月跑並發守衛集中至 `AssignmentRunGuardService.assertNoRunningRun()`；Feature Flag fallback 沿用 503 + `FEATURE_NOT_ENABLED`（決議 #2）。

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + `data-model.md#ob-dept-pct-obmdeptpct--per-list-no-部門比例` + `data-model.md#ob-emphire-obemphire--員工主檔` + `error-handling.md#assignment-ratio-errors` + `error-handling.md#assignment-stage-transition-errors` + `error-handling.md#assignment-role-errors` |
| QA / Tester | 本文件 + `error-handling.md#assignment-ratio-errors` + `error-handling.md#assignment-stage-transition-errors` |
| UI/UX Designer | 本文件 §7 UI/UX 需求 |
| Architect | 本文件 + `architecture-spec.md` §3.10（含階段流轉 / `StageTransitionService`）|

---

## 對應 User Story

- 來源 Story：[US-109-M03a-set-dept-ratio.md](../../stories/epics/E07-app-customer-list-assignment/US-109-M03a-set-dept-ratio.md)
- Epic：[E07 — 客戶名單分派](../../stories/epics/E07-app-customer-list-assignment/epic-brief.md)
- 模組：M03a 部門比例設定階段（取代 F060 / US-091）
- 取代：[F060 v1.x DEPRECATED](F060-edit-per-list-dept-ratio.md)

---

## 1. 功能摘要

允許部長 / Admin 對 `stage = 'dept_ratio'` 名單設定各部門 RATION（per-LIST_NO 部門比例）。

**範圍**：
- 僅 `stage = 'dept_ratio'` 名單可寫入；非此階段一律 422 `LIST_STAGE_TRANSITION_FORBIDDEN`
- 部門清單來源：AppDB `ob_emphire` WHERE `resign_date IS NULL` 之 `(dept_code, dept_name)` 不重複組合
- 各部門 RATION 加總須 = 100%（容忍 ±0.01% 浮點誤差，沿用 Invariant I-8）；任一 RATION 須在 [0, 100]
- 名單已停用 / 歷史月份禁止寫入

**Actor 限縮為部長 + Admin**（沿用 `DirectorGuard`，處長無權限；處長轄區於本階段不渲染任何操作按鈕；沿用 F077 角色 × 階段矩陣）。

**取代說明**：本 Feature 取代 [F060 v1.x](F060-edit-per-list-dept-ratio.md)。F060 v1.x 之「業務主管 + 任意 stage 寫入」設計已於 E07 補修批次 4 廢止；F079 限縮至 `stage = 'dept_ratio'` 階段且只允許部長 + Admin 操作。

## 2. 使用者故事

**As a** 部長 / Admin
**I want** 在名單推進至「部門比例設定」階段後，為每個在職部門設定 RATION，使加總 = 100%
**So that** 月跑 Stage 3 可依 per-LIST_NO 部門比例分配案件，每份名單可有獨立的部門策略

## 3. 前置條件

- 使用者已通過 E01 驗證並持有 JWT Token
- 使用者具「部長」（`business_role = 'director'`）或 Admin 權限
- 目標 `list_no` 存在於 `ob_list_definition`，`status = 'active'`，`stage = 'dept_ratio'`
- `project_workym >= current_work_ym`（非歷史月份；沿用 F077 BR-3）
- `assignment_run` 中無 `status IN ('pending', 'running')` 紀錄
- `ob_emphire` 至少有 1 筆 `resign_date IS NULL` 紀錄（否則部門清單為空，無法設定）

## 4. 驗收標準

### AC-1：「設定部門比例」入口於五階段清單中渲染

- **Given** 部長 / Admin 在 F048 / F077 清單頁查看部門比例設定階段之 `stage = 'dept_ratio'` 名單
- **When** 頁面顯示該名單操作欄
- **Then** 顯示「設定部門比例」按鈕（沿用 F077 角色 × 階段操作矩陣）
- **And** 處長帳號**完全不渲染**「設定部門比例」按鈕

### AC-2：顯示部門清單與現有比例

- **Given** 部長 / Admin 進入某份名單之部門比例設定頁
- **When** 頁面載入
- **Then** 系統呼叫 GET `/api/v1/assignment/ratios/dept/{listNo}`，後端：
  1. 自 `ob_emphire` 取在職員工不重複部門清單（按 `dept_code` 排序）
  2. 自 `ob_dept_pct` 讀取該 `list_no` 之既有設定（若有）
  3. 兩部門清單合併：`ob_dept_pct` 現有但未涵蓋於在職部門者，於 UI 顯示「該部門已下線」徽章；既有 RATION 仍顯示供使用者決議

### AC-3：修改各部門比例並即時加總

- **Given** 部長 / Admin 在部門比例設定頁進入編輯模式
- **When** 修改某部門 RATION 值（數字輸入框）
- **Then** 頁面即時計算所有部門 RATION 加總，顯示「目前加總：N%」
- **And** 當 `|加總 - 100| <= 0.01`（沿用 I-8 容忍誤差），「儲存」按鈕啟用
- **And** 加總超出容忍範圍時，「儲存」按鈕停用，並顯示提示「目前加總為 N%，需調整至 100% 才能儲存」

### AC-4：RATION 輸入值驗證（範圍 [0, 100]）

- **Given** 部長 / Admin 在 RATION 輸入框輸入值
- **When** 輸入值為負數（< 0）、超過 100（> 100）、或非數字
- **Then** 輸入框即時顯示紅色邊框與錯誤訊息「比例介於 0 到 100 之間」
- **And** 「儲存」按鈕停用
- **And** 後端寫入時（API 5.2 PUT）若任一 RATION 超出 [0, 100] 立刻回 422 `RATIO_OUT_OF_RANGE`

### AC-5：儲存成功

- **Given** 所有部門 RATION 加總落在 [99.99, 100.01] 區間，且每筆 RATION 落於 [0, 100]
- **When** 部長 / Admin 點擊「儲存」
- **Then** 後端執行：
  1. UPSERT `ob_dept_pct`（PK `(project_workym, list_no, obdeptid, ration)`，覆寫該 `list_no + project_workym` 之所有 RATION 紀錄；移除既有但不在新 payload 中的 `obdeptid`）
  2. 寫入 `assignment_audit_log`（`action = 'SET_DEPT_RATIO'`、`entity_type = 'ob_dept_pct'`、`entity_id = list_no`、`before_value` / `after_value` 含完整部門 RATION 陣列）
- **And** 頁面顯示成功提示「名單『{listNm}』部門比例設定已儲存」，切換回唯讀模式
- **And** **稽核失敗僅 Logger.error，不 rollback 業務交易**（沿用 F050 v2.0 BR-11）

### AC-6：RATION = 0 視為有效值

- **Given** 部長 / Admin 將某部門 RATION 設為 0%，其他部門加總 = 100%
- **When** 點擊「儲存」
- **Then** 系統允許儲存（0% 表示該部門本月不分派名單）
- **And** 0% 部門紀錄仍寫入 `ob_dept_pct`（仍顯示於清單，便於日後調整）

### AC-7：非 `dept_ratio` 階段拒絕寫入

- **Given** 名單 `stage` 為 `'draft'` / `'personnel_ratio'` / `'approval'` / `'ready'` 任一
- **When** 部長 / Admin 嘗試 PUT `/api/v1/assignment/ratios/dept/{listNo}` 寫入
- **Then** 後端回 422 `LIST_STAGE_TRANSITION_FORBIDDEN`，附說明「目前階段為 {currentStage}，禁止編輯部門比例，請先 Rollback 至部門比例設定階段」
- **And** GET 端點不受此限（推進後仍可唯讀檢視；沿用 US-110 AC-5）

### AC-8：處長無法設定部門比例

- **Given** 帳號僅持有「處長」角色
- **When** 嘗試呼叫 GET / PUT `/api/v1/assignment/ratios/dept/{listNo}`
- **Then** 後端回 403 `AUTH_FORBIDDEN`
- **And** 清單頁中**完全不渲染**「設定部門比例」按鈕

### AC-9：月跑執行中禁止寫入

- **Given** `assignment_run` 有 `status IN ('pending', 'running')` 紀錄
- **When** 部長 / Admin 嘗試進入編輯模式或呼叫 PUT
- **Then** 編輯按鈕為 disabled，hover 顯示「分派執行中，無法修改比例設定」
- **And** 若直接呼叫 API，回 409 `ASSIGNMENT_RUN_ALREADY_RUNNING`

### AC-10：歷史月份拒絕寫入

- **Given** 名單 `project_workym < current_work_ym`
- **When** 部長 / Admin 嘗試呼叫 PUT
- **Then** 後端回 403 `LIST_HISTORICAL_READONLY`
- **And** 清單頁中**完全不渲染**「設定部門比例」按鈕（沿用 F077 AC-2）

### AC-11：稽核日誌

- **Given** 任一 PUT 寫入成功
- **When** 寫入完成
- **Then** `assignment_audit_log` 新增一筆：`action = 'SET_DEPT_RATIO'`、`entity_type = 'ob_dept_pct'`、`entity_id = list_no`、`before_value` 為寫入前部門 RATION 陣列、`after_value` 為寫入後 RATION 陣列

## 5. API 規格

### 5.1 GET /api/v1/assignment/ratios/dept/{listNo}

| 用途 | 取得指定名單之部門清單與現有 RATION 設定 |
|---|---|
| 認證 | JWT 必填 |
| 權限 | `DirectorGuard`（admin OR `business_role = 'director'`）；處長失敗回 403 `AUTH_FORBIDDEN` |

**Response — 200 OK**

```json
{
  "listNo": "OB202605001",
  "listNm": "車貸催收名單",
  "projectWorkym": "202605",
  "stage": "dept_ratio",
  "deptRatios": [
    { "obdeptId": "XTC0", "obdeptNm": "業務一部", "ration": 30.0, "isActive": true, "directorName": "李處長" },
    { "obdeptId": "XTD0", "obdeptNm": "業務二部", "ration": 25.0, "isActive": true, "directorName": "王處長" },
    { "obdeptId": "XTE0", "obdeptNm": "業務三部", "ration": 0.0,  "isActive": true, "directorName": null },
    { "obdeptId": "XTF0", "obdeptNm": "業務四部（已下線）", "ration": 15.0, "isActive": false, "directorName": null }
  ],
  "total": 70.0,
  "isReadOnly": false
}
```

> - `isActive = false` 表示該部門已不在 `ob_emphire` 在職清單中。`isReadOnly = true` 表示該名單階段已非 `dept_ratio`（推進後 / Rollback 後唯讀檢視）。
> - `directorName` 為該部門目前處長姓名（見 BR-13 定義），無對應人員時為 `null`。

### 5.2 PUT /api/v1/assignment/ratios/dept/{listNo}

| 用途 | 寫入 / 覆寫指定名單之部門 RATION |
|---|---|
| 認證 | JWT 必填 |
| 權限 | `DirectorGuard` |

**Request Body**

```json
{
  "deptRatios": [
    { "obdeptId": "XTC0", "obdeptNm": "業務一部", "ration": 30.0 },
    { "obdeptId": "XTD0", "obdeptNm": "業務二部", "ration": 25.0 },
    { "obdeptId": "XTE0", "obdeptNm": "業務三部", "ration": 20.0 },
    { "obdeptId": "XTF0", "obdeptNm": "業務四部", "ration": 15.0 },
    { "obdeptId": "XTG0", "obdeptNm": "業務五部", "ration": 10.0 }
  ]
}
```

**Response — 200 OK**

```json
{
  "listNo": "OB202605001",
  "savedCount": 5,
  "total": 100.0,
  "savedAt": "2026-05-15T13:00:00Z",
  "savedBy": "user-uuid-xxx"
}
```

**錯誤代碼**

| HTTP | 錯誤碼 | 說明 |
|---|---|---|
| 401 | AUTH_TOKEN_MISSING / AUTH_TOKEN_EXPIRED | 未登入或 Token 過期 |
| 403 | AUTH_FORBIDDEN | 非 admin / director 任一身份（含處長嘗試設定） |
| 403 | LIST_HISTORICAL_READONLY | `project_workym < current_work_ym` |
| 404 | ASSIGNMENT_LIST_NOT_FOUND | `list_no` 不存在 |
| 409 | ASSIGNMENT_RUN_ALREADY_RUNNING | 月跑進行中 |
| 422 | ASSIGNMENT_LIST_INACTIVE | 名單已停用 |
| 422 | LIST_STAGE_TRANSITION_FORBIDDEN | `stage != 'dept_ratio'` |
| 422 | RATIO_OUT_OF_RANGE | 任一 RATION 超出 [0, 100] |
| 422 | RATIO_SUM_NOT_100 | 加總超出 [99.99, 100.01]（取代 F060 之 `RATIO_SUM_INVALID`，errCode 名稱採用更明確語意 + 容忍說明意涵） |

> **錯誤碼相容性**：`RATIO_SUM_INVALID`（F060 v1.x）保留於 error-handling.md 但標 deprecated，隨 F060 廢止後續實作版次清理；F079 / 後續 M03b spec 統一使用 `RATIO_SUM_NOT_100`。

## 6. 業務規則

| 規則編號 | 說明 |
|---|---|
| BR-1 | **per-LIST_NO 設定**：本 Feature 為 per-LIST_NO 部門比例（無全域比例概念，沿用 F060 BR-1 / OQ-E07-5） |
| BR-2 | **比例驗證（I-8）**：每 `list_no + project_workym` 下所有 RATION 加總須落於 [99.99, 100.01]（容忍 ±0.01% 浮點誤差）；任一 RATION 須於 [0, 100] |
| BR-3 | **`stage = 'dept_ratio'` 限制**：僅此階段可寫入；非此階段一律 422 `LIST_STAGE_TRANSITION_FORBIDDEN`（透過 service 之 `assertStageEquals(listNo, 'dept_ratio')` helper 統一檢查） |
| BR-4 | **`project_workym` 由後端自動填入**：自 `ob_list_definition.project_workym` 寫入 `ob_dept_pct.project_workym`；不允許 request 覆寫 |
| BR-5 | **覆寫式寫入**：PUT 為「整段重寫」語意，後端先 DELETE `ob_dept_pct` 中 `(project_workym, list_no)` 之所有紀錄，再 INSERT request payload；於同一 transaction 中執行（沿用 BR-9 約束） |
| BR-6 | **部門清單來源**：`SELECT DISTINCT dept_code, dept_name FROM ob_emphire WHERE resign_date IS NULL ORDER BY dept_code`；考量資料庫 `dept_code` 為空白填滿，需 `ob_emphire` 載入後統一 RTRIM 處理（沿用 data-model.md `ob_empl_set` 註腳） |
| BR-7 | **角色矩陣（I-7）**：本端點限 `admin` 或 `business_role = 'director'`；處長一律回 403 `AUTH_FORBIDDEN`；本端點對應 `DirectorGuard` |
| BR-8 | **歷史月份攔截（沿用 F077 BR-3）**：`project_workym < current_work_ym` 回 403 `LIST_HISTORICAL_READONLY` |
| BR-9 | **DB 操作原子性**：DELETE 既有 + INSERT 新 RATION + 稽核寫入須於同一 DB transaction 中執行（[ASSUMPTION] 待 system-architect 決議）；若稽核採非同步 queue 模式，業務 commit 後可允許 retry |
| BR-10 | **稽核失敗不 rollback**：操作寫入 `assignment_audit_log` 失敗僅 Logger.error，不 rollback 業務 commit（沿用 F050 v2.0 BR-11） |
| BR-11 | **不可在月跑進行中操作**：`assignment_run.status IN ('pending', 'running')` 時禁止寫入；GET 不受影響。**`assertNoRunningRun()` 由 `AssignmentRunGuardService` 集中實現（v1.1 / 決議 #6）**：F079 PUT service method 入口層呼叫 `await this.assignmentRunGuardService.assertNoRunningRun()`；月跑結束後（`status = 'completed'` / `'failed'`）即可重新操作 |
| BR-12 | **`obdeptnm` 由 request 攜帶**：寫入時 request 帶入之 `obdeptnm` 寫入 `ob_dept_pct.obdeptnm`；GET 時自 `ob_emphire` 即時填入 `dept_name`（避免改名後 UI 顯示舊值） |
| BR-13 | **Feature Flag fallback（v1.1 / 決議 #2）**：F079 端點受 `FeatureFlagGuard` 保護；`ENABLE_E07_REFACTOR_PHASE3 = false` 時回 **503 + `FEATURE_NOT_ENABLED`**（沿用 F050 v2.0 §13.2 統一行為） |
| BR-14 | **處長欄位來源（v1.3 / 2026-05-21）**：GET response 之 `directorName` 由 `ob_emphire` 推導，SQL 規格：`SELECT TRIM(emp_nm) FROM ob_emphire WHERE TRIM(dept_code)=? AND resign_date IS NULL AND TRIM(jfun_nm)='處長' ORDER BY hire_date ASC LIMIT 1`。同部門有多位處長時取最早入職者；查無對應人員時回傳 `null`。不過濾 `noDeputy` 旗標（v1.3 PO 決議：MVP 不引入代理機制，部長/Admin 在 dept_ratio 與 personnel_ratio 階段直接可寫，不需處長代理） |

## 7. UI/UX 需求

- **「設定部門比例」按鈕**：
  - 位於 F048 / F077 清單頁「部門比例設定」階段名單操作欄
  - 處長身份**完全不渲染**
  - 已停用名單 / 非 `dept_ratio` 階段 / 歷史月份**完全不渲染**
  - 月跑進行中 disabled + hover 提示
- **設定頁布局**：
  - 頁首：「名單：{listNm}（{listNo}）— 部門比例設定」
  - 表格欄位：部門代碼 / 部門名稱 / RATION 輸入框 / 是否離線徽章
  - 底部固定列：「目前加總：N% / 100%」+「儲存」按鈕（含驗證控制）+「取消」按鈕
- **數值輸入規格**：
  - 整數或最多兩位小數（HTML `<input type="number" step="0.01" min="0" max="100">`）
  - 即時驗證 + 紅色邊框 + 錯誤訊息
- **加總顯示**：當值與 100% 容忍以內顯示綠色，超出範圍顯示紅色
- **「部門已下線」徽章**：`isActive = false` 之列以灰色背景 + 「已下線」徽章顯示，仍可編輯 RATION（給使用者決議是否歸零或保留歷史紀錄）
- **成功提示 toast**：「名單『{listNm}』部門比例設定已儲存」
- **唯讀模式**：當 `stage != 'dept_ratio'`（推進後 / Rollback 後檢視），顯示唯讀表格，不渲染「儲存」按鈕，表格上方顯示「此名單已推進至 {currentStage} 階段，部門比例為唯讀；如需修改請先 Rollback 至部門比例設定階段」
- **Prototype 對齊（v1.3 補述，2026-05-25 / commit 38eb0dc）**：實作以 `prototypes/dept-ratio-29a.html`（prototype 29a）為 ground truth；包含 (a) 5-step stage breadcrumb（草稿 → 部門比例 → 個別業務比例 → 簽核 → 完成）、(b) Sum Banner（頁面頂部即時加總顯示）、(c) 「預估案件數」欄位（依 `deptRatio × 該名單總筆數` 即時換算）。具體版面 / 色塊 / spacing 以 prototype 為準；React 實作偏離 prototype 視同 bug 需依 CLAUDE.md frontend 規則回報

## 8. 依賴關係

- **Blocked By**：
  - F078（草稿推進至部門比例設定，產生 `stage = 'dept_ratio'` 名單）
  - F050 v2.0（建立草稿名單）
  - F077 v1.0（`current_work_ym` 規則 + `stage` 欄位 + 角色 × 階段操作矩陣）
  - F048 v2.0（M01 入口骨架）
- **Blocks**：
  - F080（推進至個別業務比例設定，前置條件為 RATION 加總 = 100%）
  - F061（月跑 Stage 3 部門分派讀取 `ob_dept_pct`）
- **Rollback 反向**：F081（M03a Rollback 至草稿，清空本 Feature 寫入之 `ob_dept_pct`）
- **取代**：[F060 v1.x DEPRECATED](F060-edit-per-list-dept-ratio.md)

## 9. 交叉參照

- **權限矩陣**：[F002 §4.6 E07 角色矩陣](F002-user-login.md#e07-角色矩陣)
- **資料模型**：
  - [data-model.md#ob-dept-pct-obmdeptpct--per-list-no-部門比例](../data-model.md#ob_dept_pctobmdeptpct--per-list-no-部門比例)
  - [data-model.md#ob-emphire-obemphire--員工主檔](../data-model.md#ob_emphireobemphire--員工主檔)
  - [data-model.md#current-work-ym-rule](../data-model.md#current-work-ym-rule)
- **錯誤代碼**：
  - [error-handling.md#assignment-ratio-errors](../error-handling.md#assignment-ratio-errors)（`RATIO_SUM_NOT_100` / `RATIO_OUT_OF_RANGE`）
  - [error-handling.md#assignment-stage-transition-errors](../error-handling.md#assignment-stage-transition-errors)（`LIST_STAGE_TRANSITION_FORBIDDEN`）
  - [error-handling.md#assignment-role-errors](../error-handling.md#assignment-role-errors)
- **架構決議**：AD-E07-1（OB 表遷移）、[ASSUMPTION] 五階段 `StageTransitionService` helper（見 §12 A-1）
- **相關功能**：
  - [F048 v2.0](F048-view-list-definition.md) / [F077](F077-month-switch-and-stage-overview.md)（M01 入口）
  - [F078](F078-draft-advance-to-dept-ratio.md)（草稿推進至本 Feature 前置）
  - [F080](F080-advance-to-personnel-ratio.md)（部門比例推進至個別業務比例，本 Feature 後續）
  - [F081](F081-rollback-to-draft.md)（部門比例 Rollback 至草稿）
  - [F060 v1.x DEPRECATED](F060-edit-per-list-dept-ratio.md)
  - [F061](F061-trigger-assignment-run.md)（月跑 Stage 3 讀取）
- **圖表**：
  - [diagrams/F079-dept-ratio-flow.mmd](../diagrams/F079-dept-ratio-flow.mmd)（部門比例設定流程，含 advance / rollback 分支說明）
  - [diagrams/F077-stage-overview.mmd](../diagrams/F077-stage-overview.mmd)（五階段總覽流程）

## 10. 測試覆蓋目標

- 單元測試覆蓋率 ≥ 80%
- 後端關鍵測試案例：
  - GET 回傳「在職部門 + 既有但已下線部門」混合清單
  - PUT 加總 = 100.00 → 成功儲存
  - PUT 加總 = 99.99 / 100.01 → 成功儲存（容忍邊界內）
  - PUT 加總 = 99.98 / 100.02 → 422 `RATIO_SUM_NOT_100`（容忍邊界外）
  - PUT 任一值 = -0.01 → 422 `RATIO_OUT_OF_RANGE`
  - PUT 任一值 = 100.01 → 422 `RATIO_OUT_OF_RANGE`
  - PUT RATION = 0 + 其他加總 100% → 成功儲存（AC-6）
  - PUT 對 `stage = 'draft'` 名單 → 422 `LIST_STAGE_TRANSITION_FORBIDDEN`
  - PUT 對 `stage = 'personnel_ratio'` 名單 → 422 `LIST_STAGE_TRANSITION_FORBIDDEN`（推進後拒絕）
  - PUT 處長帳號 → 403 `AUTH_FORBIDDEN`
  - PUT 歷史月份 → 403 `LIST_HISTORICAL_READONLY`
  - PUT 月跑進行中 → 409 `ASSIGNMENT_RUN_ALREADY_RUNNING`
  - PUT 覆寫式寫入：原有 5 筆，新寫入 3 筆，DB 應剩 3 筆
  - 稽核 `before_value` / `after_value` 完整寫入
- 前端關鍵測試案例：
  - 處長 / 非 `dept_ratio` 階段 / 已停用 / 歷史月份「設定部門比例」按鈕**完全不渲染**
  - 即時加總顏色變化（綠色 / 紅色）
  - 數值欄位輸入錯誤即時阻擋
  - 唯讀模式正確渲染（推進後檢視）
- E2E：草稿建立（F050 v2.0）→ 推進（F078）→ 設定部門比例（F079）→ 加總 100% → 推進個別業務比例（F080）

## 11. 實作 Checklist

- [ ] 後端新增 `GET /api/v1/assignment/ratios/dept/{listNo}` 端點 + Service
- [ ] 後端新增 `PUT /api/v1/assignment/ratios/dept/{listNo}` 端點 + Service
- [ ] 後端套 `DirectorGuard` + `assertStageEquals(listNo, 'dept_ratio')` + `LIST_HISTORICAL_READONLY` Guard + 月跑鎖檢查
- [ ] 後端共用部門比例驗證 helper（建議封裝為 `RatioValidationService.assertSumEquals100(ratios)` + `assertEachInRange(ratios, 0, 100)`，供後續 M03b 個別業務比例共用）
- [ ] error-handling.md 新增 `RATIO_SUM_NOT_100` / `RATIO_OUT_OF_RANGE` / `STAGE_ADVANCE_PRECONDITION_FAILED` / `STAGE_ROLLBACK_BLOCKED` 4 個錯誤碼（供 F080 / F081 共用）
- [ ] 前端「設定部門比例」按鈕渲染條件
- [ ] 前端比例設定頁：即時加總 / 範圍驗證 / 唯讀模式
- [ ] 圖表：[diagrams/F079-dept-ratio-flow.mmd](../diagrams/F079-dept-ratio-flow.mmd)
- [ ] 整合測試：F078 → F079 → F080 路徑驗證

## 12. 假設

| # | 假設 | 標記 |
|---|---|---|
| A-1 | **`StageTransitionService` 共用 helper 設計**：本 spec 不直接呼叫推進 / Rollback，但 §6 BR-3 `assertStageEquals(listNo, 'dept_ratio')` 與 F078 共用 helper 約束；建議 system-architect 提出 `StageTransitionService` 模組（`advanceTo` / `rollbackTo` / `assertStageEquals` 三個 helper），供 F078 / F079 / F080 / F081 / 後續 M03b/c/d 共用 | [ASSUMPTION] 待 system-architect |
| A-2 | **覆寫式寫入 transaction 範圍**：DELETE 既有 + INSERT 新 RATION 是否強制於 transaction 由 system-architect 決議；本 spec 預設於同 transaction（見 BR-9） | [ASSUMPTION] 待 system-architect |
| A-3 | **「部門已下線」徽章**：當 `ob_dept_pct` 既有部門已不在 `ob_emphire` 在職清單時，UI 顯示「已下線」徽章（AC-2 / §7）；是否強制使用者於儲存前歸零由 [ASSUMPTION] 待 PO 決議；本 spec 預設不強制，保留使用者決議空間 | [ASSUMPTION] 待 PO |
| A-4 | **比例容忍誤差 ±0.01%**：本 spec 用 ±0.01% 容忍（I-8 規範）；資料型別 `NUMERIC(9,1)` 在 DB 上無浮點誤差，但保留容忍以容納前端 JavaScript Number 計算誤差 | 沿用 I-8 |
| A-5 | **本 Feature 是否納入 feature flag `ENABLE_E07_REFACTOR_PHASE3` gating**：F079 / F080 / F081 屬「五階段流轉引入」之 M03a 階段；F060 v1.x 之既有 PUT `/api/v1/assignment/ratios/dept/:listNo` 端點與本 Feature 路由完全相同；若 F060 v1.x 與 F079 同時上線將產生路由衝突。**建議於 F050 v2.0 §13 之 `ENABLE_E07_REFACTOR_PHASE3` flag gating**（flag = false 沿用 F060 v1.x 行為；flag = true 切換為 F079 行為）；並於 F060 廢止上線時新增「F060 路由殘留偵測」並回 500 `LIST_DRAFT_ADVANCE_BLOCKED_LEGACY_F059`（共用既有 errCode）或新增 `LIST_RATIO_BLOCKED_LEGACY_F060` 錯誤碼。實作細節由 system-architect 決議 | [ASSUMPTION] 待 system-architect。**詳見 open-questions.md OQ-E07-37** |

## 13. 變更紀錄

| 版本 | 日期 | 變更內容 |
|---|---|---|
| v1.0 | 2026-05-15 | 初版（取代 US-109，E07 補修批次 4）：取代 F060 v1.x；限 `stage = 'dept_ratio'` 寫入；限部長 + Admin（`DirectorGuard`）；新增 `RATIO_SUM_NOT_100` / `RATIO_OUT_OF_RANGE` 錯誤碼；新增「部門已下線」UX 徽章；新增 [F079-dept-ratio-flow.mmd](../diagrams/F079-dept-ratio-flow.mmd) 圖表；feature flag gating 評估納入 §12 A-5 待 system-architect 決議 |
| v1.1 | 2026-05-16 | **E07 補修衍生（system-architect Phase 1 風險決議落地）**：(1) **決議 #6**：BR-11 補「`assertNoRunningRun()` 由 `AssignmentRunGuardService` 集中實現」；(2) **決議 #2**：新增 BR-13 Feature Flag fallback（503 + `FEATURE_NOT_ENABLED`） |
| v1.2 | 2026-05-16 | **救援重寫**：前一輪 PowerShell 編碼事故損毀本檔內容，依 US-109 + AD-E07 v3.0 一致性決議完整重建；保留 v1.0 / v1.1 所有設計決議 |
| v1.3 | 2026-05-25 | **【Prototype 29a 對齊補述 / commit 38eb0dc】**：§7 UI/UX 補述「Prototype 對齊」項目，列出 prototype 29a 已落地之三項：(1) 5-step stage breadcrumb；(2) Sum Banner；(3) 預估案件數欄位。BR-14 之 `directorName` 欄位於 commit 38eb0dc 已實作並寫入 GET response（spec 在 v1.x 已有此欄位定義，無需再動）。本次只追加 §7 對齊註腳 + 本變更紀錄 |
