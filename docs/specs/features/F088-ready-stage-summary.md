---
spec-id: F088
title: 準備完成階段查詢摘要（部長 + 處長 + Admin 唯讀，含轄區過濾）
feature-id: F088
source-story: US-118
epic: E07
module: M03d 準備完成階段
priority: P0-MVP
version: "1.3.1"
date: 2026-05-26
status: Draft
---

# F088: 準備完成階段查詢摘要（部長 + 處長 + Admin 唯讀，含轄區過濾）

Priority: P0-MVP | Status: Draft | Last Updated: 2026-05-26

> **v1.3.1（2026-05-26 / estimateCases 物化 COUNT 來源升級補註，對齊 F092）**：[F092](F092-stage1-dry-run-estimate.md)（Stage 1 精確化工程 Phase 3）已落地，per-list estimate 升級為完整 Stage 1 鏈唯讀 dry-run。本版**僅補註** `estimateCases` 物化所用之 Stage 0 估算 COUNT 來源由「欄位篩選版」升級為「**完整 Stage 1 鏈 dry-run（≡ 月名單分派案件數）**」（`executeStage1Chain({ dryRun: true })`，含 MONTH_CNT + 近 3 個月去重 + 特殊 DELETE）。影響段落：**§6 BR-10**（補物化 COUNT 來源升級註）、**§5 清單回應欄位表 `estimateCases`**（補來源升級註）。**物化讀寫機制、UI、權限、其他 AC/BR 均不變**；僅 COUNT 內涵升級。交叉引用 [F092 AC-6](F092-stage1-dry-run-estimate.md) / [architecture-spec.md AD-E07-23](../architecture-spec.md)。
>
> **v1.3（2026-05-26 / prototype 29d 對齊 + 重用端點落地）**：本版本對齊 prototype `prototypes/29d-ready-summary.html` 與 real code 之實作落差，重點：
> 1. **§5 API 重用既有端點**：清單頁與詳情頁**不使用**原規劃之專屬端點 `GET /lists/{listNo}/ready-summary`，改為**重用既有端點**：清單頁 `GET /assignment/lists`；詳情頁 `GET /assignment/ratios/dept/{listNo}` + `GET /assignment/ratios/personnel/{listNo}` + `GET /assignment/lists/{listNo}/approval-history`；Stage 0 試算 `GET /assignment/list-definitions/{listNo}/estimate`。原 5.1 / 5.2 描述保留並標記為「規劃版」，實作以 §5.0 重用端點清單為準。
> 2. **§5 清單回應新增欄位**：`GET /assignment/lists` 每筆 list item 新增 `deptCount`（部門數）、`empCount`（業務員數）、`approvedAt`（最新核准時間）、`approverName`（核准者姓名）、`estimateCases`（物化 Stage 0 估算值，可為 null）。
> 3. **§7 UI 對齊 29d**：清單卡片欄位改為部門數 / 業務員數 / 預估案件數 / 建立者 / 核准時間（整卡可點，按鈕「查看摘要」）；詳情頁部門比例表新增「處長」「設定者（含『部長代設定』chip）」欄。
> 4. **新增 BR-10 / BR-11**：物化估算（estimate 於 F086 approve→ready 計算並存，best-effort，計算失敗不阻擋 approve，清單頁讀存值）；設定者 / 代設定判定（`ob_dept_pct.created_by` 解析 user 姓名與 business_role，`businessRole='director'` 視為「部長代設定」）。
> 5. **§12 假設 A-3 標記 resolved**（物化方案取代逐筆即時 COUNT）。
> 6. 本 v1.3 **不變動** entity / migration / data-model.md / architecture-spec.md（欄位與 migration 細節由 system-architect 規範，本 spec 僅描述行為與資料來源）；`approvedAt` / `approverName` 之資料來源依賴 F086 v1.3 補寫 `assignment_approval(action='approve')`。
>
> **v1.2 救援重寫（2026-05-16）**：前一輪 PowerShell 編碼事故損毀本檔，本版本依 US-118 + AD-E07 v3.0 一致性決議完整重建；Guard 統一為 `DirectorOrSectionChiefGuard`（admin / director / section_chief 三角色 + service 層 `scopeByCreator()` 過濾處長轄區）；廢除 `SalesManagerGuard`；business_role 欄位語意對齊；保留 v1.1 之月名單分派前置條件聚合提示。

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + `data-model.md#ob-list-definition-stage` + `data-model.md#ob-dept-pct-obmdeptpct--per-list-no-部門比例` + `data-model.md#ob-empl-set-obemplsetmf--人員比例設定` + `error-handling.md#assignment-stage-transition-errors` |
| QA / Tester | 本文件 + `error-handling.md#assignment-stage-transition-errors` |
| UI/UX Designer | 本文件 §7 + `F082-set-personnel-ratio.md` §7（業務員比例顯示樣式參考） |
| Architect | 本文件 + `architecture-spec.md` §3.10（含 `scopeByCreator()` helper） |

---

## 對應 User Story

- 來源 Story：[US-118-M03d-ready-stage-summary.md](../../stories/epics/E07-app-customer-list-assignment/US-118-M03d-ready-stage-summary.md)
- Epic：[E07 — 客戶名單分派](../../stories/epics/E07-app-customer-list-assignment/epic-brief.md)
- 模組：M03d 準備完成階段

---

## 1. 功能摘要

提供部長 / 處長 / Admin 查詢 `stage = 'ready'` 名單之完整設定摘要：篩選條件、部門比例、個別業務比例、CR 開關狀態。本頁面為**完全唯讀**（無任何編輯按鈕），主要用途：

1. 月名單分派前最終確認所有名單設定正確
2. 部長透過本頁面確認「所有 active 名單均已就緒」後觸發月名單分派（F061 前置條件）

**範圍**：
- 處長僅可查看本轄區之 ready 名單與本轄區業務員比例（依 `created_by` 過濾，沿用 F074 BR-1）
- 部長 / Admin 可查看所有 ready 名單與所有部門業務員比例
- 任何修改請求一律 422 `LIST_STAGE_TRANSITION_FORBIDDEN`（需先 F089 Rollback 至 `approval`）

## 2. 使用者故事

**As a** 部長（Director）/ 處長（Section Chief）/ Admin
**I want** 在名單進入「準備完成」階段後，查看該名單完整設定摘要
**So that** 月名單分派前可做最終確認，避免帶著錯誤設定進入月名單分派

## 3. 前置條件

- 使用者已通過 E01 驗證並持有 JWT Token
- 使用者具「部長」或「處長」或「Admin」權限
- 至少一份名單 `stage = 'ready'`

## 4. 驗收標準

> **v1.3 端點對照**：以下 AC 內 `ready-summary` 端點為原規劃版，real code 改以 §5.0 重用既有端點組裝（清單 `GET /assignment/lists`、詳情 `ratios/dept` + `ratios/personnel` + `approval-history` + `estimate`）。AC 之**行為驗收（顯示內容 / 過濾 / 權限）不變**，僅資料取得管道改為重用端點；下游 agent 以 §5.0 為實作依據。

### AC-1：準備完成名單清單頁

- **Given** 部長 / Admin 進入準備完成摘要頁（sidebar「準備完成摘要」或 F077「準備完成」頁籤）
- **When** 清單頁載入（`GET /assignment/lists?ym={ym}&stage=ready`）
- **Then** 顯示所有 ready 狀態之名單卡片（每卡含 `listNo` / `listNm` / `ready` badge / **部門數** / **業務員數** / **預估案件數** / **建立者** / **核准時間**；卡片欄位見 §5.0.1 / §7）
- **And** 處長進入相同頁面時，**僅顯示本轄區**（service 層依 `scopeByCreator()` 過濾）之 ready 名單
- **And** `approvedAt` / `approverName` 來源見 §5.0.2（依賴 F086 v1.3 補寫 `assignment_approval`）；`estimateCases` 為物化值（見 BR-10），缺值顯示「—」

### AC-2：查看單一名單完整設定摘要

- **Given** 部長 / 處長 / Admin 在 ready 名單清單點擊某卡片（整卡可點 / 「查看摘要」按鈕）
- **When** 進入名單詳情頁（§5.0「詳情頁」端點組裝：`GET /assignment/lists`（該筆）+ `ratios/dept/{listNo}` + `ratios/personnel/{listNo}` + `lists/{listNo}/approval-history`）
- **Then** 顯示以下區塊（均為唯讀）：
  1. **篩選條件**：展開顯示所有篩選欄位與條件值（JSONB 轉換為可讀格式）
  2. **部門比例**：各部門 `dept_name` + **處長** + **設定者（含『部長代設定』chip，見 BR-11）** + `ration`（%）表格，底部顯示加總（應 = 100%）
  3. **個別業務比例**：按部門分組，各業務員 `emp_nm` + `ration`（%），各部門底部顯示加總
  4. **簽核歷史**：approve / reject 紀錄時間軸（approve 列來源見 §5.0.2 / F086 v1.3）
- **And** 頁面無任何「編輯」「修改」「儲存」等可操作按鈕或控件

### AC-3：處長僅可查看本轄區業務員比例

- **Given** 帳號 `business_role = 'section_chief'`
- **When** 查看 ready 名單清單或詳情頁
- **Then** 個別業務比例區塊**僅顯示本處長轄區的部門業務員**（其他部門業務員不顯示）
- **And** 篩選條件、部門比例、CR 開關可完整查看（全名單共用，非按轄區過濾）

### AC-4：月名單分派前置條件聚合提示（部長 / Admin）

- **Given** 部長或 Admin 在 ready 名單清單頁
- **When** 頁面載入
- **Then** 系統由 `GET /assignment/lists`（ready / not-ready 名單分布）+ `GET /api/v1/assignment/runs/readiness` 組裝當月 active 名單就緒狀態（原規劃版 `GET /assignment/ready-summary` 未實作，見 §5.0 / §5.2）
- **And** 若本月所有 active 名單（`status = 'active'` 且非 `'draft'`）均已進入 `'ready'` 狀態，頁面頂部顯示綠色提示「本月所有名單均已 ready · 可執行月名單分派」
- **And** 若仍有名單未達 ready，頁面頂部顯示警告提示「本月仍有 {N} 筆名單未進入 ready 階段，無法執行月名單分派」，列出未就緒名單（`{listNo}（{stage}）`）

### AC-5：唯讀保護（後端守衛）

- **Given** 名單 `stage = 'ready'`
- **When** 任何使用者透過 API 嘗試修改篩選條件 / 部門比例 / 個別業務比例 / CR 開關
- **Then** 後端回 422 `LIST_STAGE_TRANSITION_FORBIDDEN`，提示「準備完成階段的名單設定為唯讀，如需修改請先 Rollback 至簽核」

### AC-6：歷史月份查詢

- **Given** 名單 `project_workym < current_work_ym`
- **When** 使用者查詢 ready 名單
- **Then** GET 端點允許查詢（歷史唯讀 OK）
- **And** UI 標示「歷史月份（{projectWorkym}）」

### AC-7：處長跨轄區查詢防護

- **Given** 處長 A 嘗試查詢處長 B 之轄區業務員比例
- **When** GET `/api/v1/assignment/ratios/personnel/{listNo}`（詳情頁個別業務比例端點）
- **Then** service 層 `scopeByCreator()` 過濾後，回 200 OK 但個別業務比例之部門陣列僅含處長 A 本轄區部門（他人轄區部門不出現，不洩漏其存在性）
- **And** 篩選條件、部門比例（`ratios/dept`）仍正常顯示（這些為全名單共用資料）

## 5. API 規格

### 5.0 重用既有端點（v1.3 / real code 實作以此為準）

> **實作落差說明**：原規劃版（§5.1 / §5.2）設計專屬端點 `GET /lists/{listNo}/ready-summary` 與 `GET /assignment/ready-summary`，但 real code **未實作**該專屬端點；前端清單頁與詳情頁改為**重用既有端點**組裝資料。§5.1 / §5.2 之 response 範例保留作為「資料概念對照（規劃版）」，下游 agent 實作時以本 §5.0 重用端點清單為準。

**清單頁（模式 A · 所有 ready 名單）**

| 端點 | 用途 | 授權 | 備註 |
|---|---|---|---|
| `GET /api/v1/assignment/lists?ym={ym}&stage=ready` | 取得 ready 名單清單（含本 spec v1.3 新增之卡片欄位，見 §5.0.1） | `DirectorOrSectionChiefGuard`（唯讀，class 級 base guard） | service 層依 `actor` 套用處長轄區過濾（沿用 F077 v1.3 BR-4） |

**詳情頁（模式 B · 單一名單摘要）**

| 端點 | 用途 | 授權 |
|---|---|---|
| `GET /api/v1/assignment/lists?ym={ym}&stage=ready`（取出對應 listNo 該筆） | 名單標題 / 篩選條件 / 卡片欄位（部門數 / 業務員數 / 預估案件數 / 建立者 / 核准資訊） | `DirectorOrSectionChiefGuard` |
| `GET /api/v1/assignment/ratios/dept/{listNo}` | 部門比例表（含處長 / 設定者欄之來源資料，見 §7） | `DirectorOrSectionChiefGuard` |
| `GET /api/v1/assignment/ratios/personnel/{listNo}` | 個別業務比例（按部門分組，處長視角僅本轄區） | `DirectorOrSectionChiefGuard` |
| `GET /api/v1/assignment/lists/{listNo}/approval-history` | 簽核歷史（approve / reject 紀錄，依 `approved_at DESC`；approve 列來源見 §5.0.2 / F086 v1.3） | `DirectorOrSectionChiefGuard` |
| `GET /api/v1/assignment/list-definitions/{listNo}/estimate` | Stage 0 即時試算（詳情頁可即時重算，與清單頁物化值並存；見 BR-10） | `DirectorGuard` |

> **聚合 banner（模式 A · 部長 / Admin 月名單分派前置條件提示）**：原 §5.2 之 `GET /api/v1/assignment/ready-summary?ym={ym}` 聚合端點屬規劃版；real code 中月名單分派就緒狀態由清單回應（`GET /assignment/lists` 之 ready / not-ready 名單分布）+ `GET /api/v1/assignment/runs/readiness` 組裝，前端據以渲染綠色 / 警告 banner（UI 規格見 §7）。

#### 5.0.1 GET /api/v1/assignment/lists 每筆 list item — v1.3 新增欄位

> 本 spec 在既有 `GET /assignment/lists` 回應之每筆名單物件上新增以下欄位，供清單卡片（§7）渲染；其餘既有欄位（`listNo` / `listNm` / `stage` / `projectWorkym` / 篩選欄位等）不變。

| 欄位 | 型別 | 來源 | 說明 |
|---|---|---|---|
| `deptCount` | number | `COUNT(ob_dept_pct WHERE list_no = :listNo)` | 該名單之部門數 |
| `empCount` | number | `COUNT(ob_empl_set WHERE list_no = :listNo)` | 該名單之業務員（個別比例）數；29d 卡片標示為「業務員」 |
| `approvedAt` | string \| null | `assignment_approval` 中最新 `action='approve'` 之 `approved_at` | 最新核准時間；ISO 8601；無核准紀錄時為 `null`（依賴 F086 v1.3 補寫，見 §5.0.2） |
| `approverName` | string \| null | 最新 `action='approve'` 之 `approver_name` | 核准者姓名；無核准紀錄時為 `null` |
| `estimateCases` | number \| null | `ob_list_definition` 物化估算欄位（由 F086 approve→ready 計算並存，見 BR-10）；**物化 COUNT 來源自 [F092](F092-stage1-dry-run-estimate.md) 起升級為完整 Stage 1 鏈 dry-run（≡ 月名單分派案件數），非欄位篩選版** | 預估案件數；尚未物化或計算失敗時為 `null`，前端顯示「—」 |

> **效能原則（A-3 resolved）**：`estimateCases` 採**物化快取**讀取存值，**不**在 `listLists` 內逐筆即時對 `ob_pool_data`（百萬列）執行 COUNT；理由：per-list COUNT × N 張卡 = N 次重查詢，違反 ETL/scale 原則。`deptCount` / `empCount` 為對小表（`ob_dept_pct` / `ob_empl_set`，每名單數十列）之 COUNT，可即時聚合。

#### 5.0.2 approve 列之資料來源（依賴 F086 v1.3）

> 清單卡片之 `approvedAt` / `approverName` 與詳情頁簽核歷史之 approve 列，資料來源為 `assignment_approval` 表中 `action='approve'` 之紀錄。F086 v1.2.1 之 real code **僅單寫** `assignment_audit_log`、**不寫** `assignment_approval`，故該資料來源在 F086 v1.3 補寫 `assignment_approval(action='approve')` 後方可用（見 [F086 v1.3 §6.X](F086-approve-to-ready.md)）。在 F086 v1.3 落地前，`approvedAt` / `approverName` 可能為 `null`，approve 列可能缺失。

### 5.1 [規劃版 / 未實作] GET /api/v1/assignment/lists/{listNo}/ready-summary

> **規劃版資料概念對照**：本端點為原始設計，real code **未實作**；保留以下 response 作為「單一名單摘要應涵蓋之資料概念」之對照。實際取得方式見 §5.0「詳情頁」端點組裝。

| 屬性 | 值 |
|---|---|
| 用途 | 取得單一 ready 名單之完整設定摘要 |
| 認證 | JWT 必填 |
| 授權 | `DirectorOrSectionChiefGuard`（admin OR business_role IN ('director', 'section_chief')） |

**Response — 200 OK**

```json
{
  "listNo": "OB202605001",
  "listNm": "車貸催收名單",
  "projectWorkym": "202605",
  "stage": "ready",
  "approverName": "張部長",
  "approvedAt": "2026-05-15T13:00:00Z",
  "filterConditions": {
    "prodKind": ["01", "02"],
    "overdueDays": { "min": 30, "max": 90 }
  },
  "deptRatios": [
    { "deptCode": "XTC0", "deptName": "業務一處", "ration": 30.0 },
    { "deptCode": "XTD0", "deptName": "業務二處", "ration": 70.0 }
  ],
  "deptRatioSum": 100.0,
  "individualRatios": {
    "departments": [
      {
        "deptCode": "XTC0",
        "deptName": "業務一處",
        "deptRatio": 30.0,
        "isInScope": true,
        "employees": [
          { "empId": "EMP001", "empName": "張三", "ration": 60.0 },
          { "empId": "EMP002", "empName": "李四", "ration": 40.0 }
        ],
        "deptSum": 100.0
      }
    ]
  },
  "crEnabled": true
}
```

> 處長視角下，`individualRatios.departments` 僅含本轄區部門；部長 / Admin 視角下含所有部門。

### 5.2 [規劃版 / 未實作] GET /api/v1/assignment/ready-summary

> **規劃版資料概念對照**：本聚合端點為原始設計，real code **未實作**；月名單分派就緒狀態於實作中改由 `GET /assignment/lists`（ready / not-ready 名單分布）+ `GET /api/v1/assignment/runs/readiness` 組裝（見 §5.0）。保留以下 response 作為「聚合狀態應涵蓋之資料概念」之對照。

| 屬性 | 值 |
|---|---|
| 用途 | 取得當月 ready 名單聚合狀態，供月名單分派前置條件提示 |
| 認證 | JWT 必填 |
| 授權 | `DirectorGuard`（admin OR business_role = 'director'） |

**Query 參數**

| 名稱 | 必填 | 說明 |
|------|------|------|
| `ym` | 是 | 工作月份（格式 YYYYMM）；通常為 current_work_ym |

**Response — 200 OK**

```json
{
  "workYm": "202605",
  "totalActiveLists": 5,
  "readyCount": 4,
  "notReadyLists": [
    { "listNo": "OB202605005", "listNm": "個貸名單", "stage": "personnel_ratio" }
  ],
  "allReady": false,
  "monthlyRunStatus": "pending"
}
```

> `allReady = true` 表示所有 active 名單均為 ready，前端顯示綠色提示「所有名單已就緒，可觸發月名單分派」；`false` 時顯示警告與 `notReadyLists`。

**錯誤回應（兩端點共用）**

| HTTP | 錯誤碼 | 說明 |
|---|---|---|
| 401 | AUTH_TOKEN_MISSING / AUTH_TOKEN_EXPIRED | 未登入或 Token 過期 |
| 403 | AUTH_FORBIDDEN | 非 admin / director / section_chief 任一身份 |
| 404 | ASSIGNMENT_LIST_NOT_FOUND | `list_no` 不存在（5.1 端點） |
| 422 | ASSIGNMENT_LIST_INACTIVE | 名單已停用 |
| 422 | LIST_STAGE_TRANSITION_FORBIDDEN | `stage != 'ready'`（5.1 端點） |
| 503 | FEATURE_NOT_ENABLED | feature flag `ENABLE_E07_REFACTOR_PHASE3 = false` |

## 6. 商業規則

| 規則編號 | 說明 |
|---|---|
| BR-1 | **完全唯讀**：本 spec 不提供任何寫入端點；任何修改請求由其他 spec（F079 / F082 / F086 / F089）負責，且要求對應的 stage 條件 |
| BR-2 | **處長轄區過濾**：service 層使用 `scopeByCreator()` helper 過濾 `individualRatios.departments`；部門比例、篩選條件、CR 開關**不過濾**（全名單共用） |
| BR-3 | **角色矩陣**：admin / director / section_chief 三角色可查詢；其他回 403 `AUTH_FORBIDDEN` |
| BR-4 | **聚合查詢僅部長 / Admin**：5.2 端點僅供部長 / Admin 使用（處長無此聚合需求），由 `DirectorGuard` 保護 |
| BR-5 | **聚合查詢範圍**：`totalActiveLists` 計算 `status = 'active'` 且 `stage != 'draft'` 之名單；`readyCount` 計算其中 `stage = 'ready'` 者；`allReady = (readyCount === totalActiveLists)` |
| BR-6 | **月名單分派狀態欄位**：`monthlyRunStatus` 反映當月 `assignment_run` 最新狀態，可能值：`'none'`（尚未觸發）/ `'pending'` / `'running'` / `'completed'` / `'failed'`；若 `status = 'running'` 則前端隱藏「觸發月名單分派」按鈕並顯示「分派執行中」 |
| BR-7 | **歷史月份允許查詢**：與 F082 / F079 寫入端點不同，本 spec 查詢端點允許歷史月份；UI 標示「歷史月份」即可 |
| BR-8 | **CR 開關來源**：`cr_enabled` 欄位儲存位置依 F048 / US-120 規範；本 spec 僅讀取 |
| BR-9 | **Feature Flag fallback**：本 spec 兩端點均掛 `FeatureFlagGuard`；`ENABLE_E07_REFACTOR_PHASE3 = false` 時回 503 + `FEATURE_NOT_ENABLED` |
| BR-10 | **預估案件數採物化快取（v1.3 新增；v1.3.1 補註物化 COUNT 來源升級）**：`estimateCases` 於 F086 approve→ready 當下計算一次 Stage 0 估算並物化儲存至 `ob_list_definition`（欄位 / migration 細節由 system-architect 規範）；計算為 **best-effort**，失敗僅 log、**不**阻擋 approve（見 [F086 v1.3 §6.X](F086-approve-to-ready.md)）。清單頁 `GET /assignment/lists` **直接讀取存值**，**不**在 `listLists` 內逐筆對 `ob_pool_data` 即時 COUNT（per-list COUNT × N 卡 = N 次掃百萬列重查詢，違反 ETL/scale 原則）。物化值缺失（尚未計算 / 計算失敗）時回 `null`，前端顯示「—」。詳情頁另可呼叫 `GET /assignment/list-definitions/{listNo}/estimate` 取即時試算值。<br>**物化 COUNT 來源升級（自 [F092](F092-stage1-dry-run-estimate.md) Stage 1 精確化 Phase 3 起）**：物化計算所用之 Stage 0 估算 COUNT 由「欄位篩選版」升級為**完整 Stage 1 鏈唯讀 dry-run COUNT**（`executeStage1Chain({ dryRun: true })`，含 MONTH_CNT 期別過濾 + 近 3 個月去重 + 特殊 DELETE，精確 ≡ 月名單分派案件數；見 [F092 AC-6](F092-stage1-dry-run-estimate.md) / [architecture-spec.md AD-E07-23](../architecture-spec.md)）。**物化讀寫機制（best-effort、清單頁讀存值、不即時逐筆 COUNT）不變**，僅 COUNT 內涵升級；因完整鏈含去重查詢，approve→ready 物化計算耗時可能略增，由物化（非即時）設計吸收。 |
| BR-11 | **設定者 / 代設定判定（v1.3 新增）**：詳情頁部門比例表之「設定者」欄由 `ob_dept_pct.created_by` 解析：以 `created_by` 查 user 取得姓名與 `business_role`；(1) 若該設定者 `businessRole = 'director'`，視為**「部長代設定」**（29d chip：「該部門由部長代設定」，warning 色）；(2) 否則視為**「由處長設定」**（29d chip：「由 {處長姓名} 設定」，green 色）。「處長」欄顯示該部門所屬處長姓名（部門 → 處長對應沿用 F074 轄區定義）。 |

## 7. UI/UX 需求

- **準備完成名單清單頁**（v1.3 對齊 prototype 29d 模式 A，`prototypes/29d-ready-summary.html` L168-214）：
  - 入口：左側 sidebar「客戶名單分派」群組下「準備完成摘要」（29d L65）；亦可由 F077 五階段總覽頁「準備完成」頁籤進入
  - **名單卡片列表**（取代原表格，依 `created_at` 倒序）：每張卡可整卡點擊進入詳情；卡片欄位對齊 29d L615-640：
    - 上排：`listNo`（mono）+ `ready` 階段 badge（綠）
    - 標題：`listNm`
    - 資訊列（icon + 值）：**部門數**（`deptCount`）/ **業務員數**（`empCount`）/ **預估案件數**（`~{estimateCases}`，物化值，`null` 顯示「—」）/ **建立者**（`createdBy`）/ **核准時間**（`approvedAt`）
    - 卡片右側按鈕「查看摘要」（eye icon）；點按鈕或整卡均進入詳情（`event.stopPropagation` 避免重複觸發）
  - 部長 / Admin 視角：頁首顯示**月名單分派前置條件聚合提示 banner**（29d L171-201）：
    - 所有 active 名單均已 ready → 綠色 banner「本月所有名單均已 ready · 可執行月名單分派」+「執行月名單分派」按鈕（連至 F061）
    - 仍有名單未就緒 → 警告色 banner「本月仍有 {N} 筆名單未進入 ready 階段，無法執行月名單分派」+ 未就緒名單清單（`{listNo}（{stage}）`）；「執行月名單分派」按鈕 disabled
  - 處長視角：僅顯示本轄區之 ready 名單（依 `scopeByCreator()` 過濾）；無「執行月名單分派」權限（按鈕不渲染）；轄區無 ready 名單時顯示空狀態卡（29d L604-611）
- **名單詳情頁布局**：
  - 標題：「準備完成階段摘要：{listNm}（{listNo}）」
  - 唯讀提示 banner：「此名單已進入準備完成階段，所有設定為唯讀。如需修改請先 Rollback 至簽核階段（部長 / Admin）」
  - 區塊 1 — **篩選條件**：可摺疊區塊，展開顯示 JSONB 之各欄位與條件值（建議以 key-value table 或巢狀清單呈現）
  - 區塊 2 — **部門比例**：表格（對齊 29d L299-313），欄位：**部門代號 / 部門名稱 / 處長 / 設定者 / RATION（%）**；底部「加總：100%」
    - **處長**欄：顯示該部門所屬處長姓名（user-cog icon）
    - **設定者**欄：依 BR-11 判定 — 「部長代設定」時顯示 warning 色 chip「該部門由部長代設定」（crown icon）；否則顯示 green 色 chip「由 {處長姓名} 設定」（user-cog icon）
  - 區塊 3 — **個別業務比例**：按部門分組之子區塊，每部門一表格，欄位：員工工號 / 員工姓名 / 比例（%）；各部門底部「加總：100%」
    - 處長視角：僅本轄區部門
    - 部長 / Admin 視角：所有部門
  - 區塊 4 — **CR 回分開關**：簡單標示「啟用」/「停用」（可加 icon）
- **核准資訊區塊**：頁面右上角顯示「核准者：{approverName} / 核准時間：{approvedAt 格式化}」
- **跳轉動作（部長 / Admin）**：
  - 頁面底部「Rollback 至簽核」按鈕（連至 F089，僅部長 / Admin 可見）
  - 「觸發月名單分派」按鈕（如 `allReady = true`，連至 F061）
- **無觸發月名單分派權限提示**：處長視角不顯示「觸發月名單分派」按鈕

## 8. 相依性

- **Blocked By**：
  - F086（核准至 ready，提供 `stage = 'ready'` 名單）
  - F082（個別業務比例設定，提供 `ob_empl_set` 資料）
  - F079（部門比例設定，提供 `ob_dept_pct` 資料）
  - F073（部長角色）/ F074（處長角色與轄區）
  - F077（五階段總覽，本 spec 入口）
- **Blocks**：
  - F061（月名單分派觸發，本 spec 提供月名單分派前置條件聚合確認入口）
  - F089（準備完成 Rollback，本 spec 之逆操作入口）

## 9. 交叉參考

- **權威矩陣**：[F002 §4.6 E07 角色矩陣](F002-user-login.md#e07-角色矩陣)
- **資料模型**：
  - [data-model.md#ob-list-definition-stage](../data-model.md#ob-list-definition-stage)（含 `stage` / `cr_enabled` / `filter_conditions`）
  - [data-model.md#ob-dept-pct-obmdeptpct--per-list-no-部門比例](../data-model.md#ob_dept_pctobmdeptpct--per-list-no-部門比例)
  - [data-model.md#ob-empl-set-obemplsetmf--人員比例設定](../data-model.md#ob_empl_setobemplsetmf--人員比例設定)
  - [data-model.md#assignment-approval-entity](../data-model.md#assignment-approval-entity)（核准者資訊）
- **錯誤處理**：[error-handling.md#assignment-stage-transition-errors](../error-handling.md#assignment-stage-transition-errors)
- **架構決策**：
  - [F074](F074-define-section-chief-role.md)（處長轄區 + `scopeByCreator()` helper）
  - AD-E07 v3.0（Guard 體系）
- **相關功能**：
  - [F077](F077-month-switch-and-stage-overview.md)（本 spec 入口）
  - [F086](F086-approve-to-ready.md)（核准至 ready）
  - [F087](F087-reject-to-personnel-ratio.md)（簽核拒絕，本 spec 之逆方向之一）
  - [F089](F089-rollback-to-approval.md)（M03d Rollback，本 spec 之逆操作）
  - [F061](F061-trigger-assignment-run.md)（月名單分派觸發，本 spec 為前置條件確認入口）
  - [F082](F082-set-personnel-ratio.md)（個別業務比例設定，本 spec 之資料來源 + UI 樣式參考）
  - [F079](F079-set-dept-ratio.md)（部門比例設定，本 spec 之資料來源）
- **圖表**：[diagrams/F088-ready-summary-flow.mmd](../diagrams/F088-ready-summary-flow.mmd)（含聚合查詢 + 月名單分派前置條件判斷流程）

## 10. 測試覆蓋率要求

- 單元測試覆蓋率 ≥ 80%
- 後端關鍵測試案例：
  - 部長 GET 5.1 → 回傳完整 4 區塊資料（含所有部門業務員比例）
  - 處長 GET 5.1 → 回傳完整 4 區塊資料，但 `individualRatios.departments` 僅本轄區
  - Admin GET 5.1 → 同部長視角
  - GET 5.1 `stage != 'ready'` → 422 `LIST_STAGE_TRANSITION_FORBIDDEN`
  - GET 5.1 `list_no` 不存在 → 404 `ASSIGNMENT_LIST_NOT_FOUND`
  - GET 5.1 已停用名單 → 422 `ASSIGNMENT_LIST_INACTIVE`
  - GET 5.1 歷史月份 → 200 OK（允許查詢）
  - 一般 user GET 5.1 → 403 `AUTH_FORBIDDEN`
  - 部長 GET 5.2 `allReady = true` 場景 → 回傳 `allReady: true` + 空 `notReadyLists`
  - 部長 GET 5.2 `allReady = false` 場景 → 回傳 `allReady: false` + 含未就緒名單清單
  - 處長 GET 5.2 → 403 `AUTH_FORBIDDEN`（聚合僅部長 / Admin）
  - 任何修改請求對 ready 名單 → 422 `LIST_STAGE_TRANSITION_FORBIDDEN`（由 F079 / F082 / F086 各自 spec 驗證）
  - Feature flag = false → 503 `FEATURE_NOT_ENABLED`
  - 處長 GET 5.1 帶 `deptCode` 屬於他人轄區 → 200 + `individualRatios.departments = []`
  - 處長 GET 5.1 → 篩選條件 / 部門比例 / CR 開關仍完整顯示（不過濾）
- 前端關鍵測試案例：
  - 部長 / Admin 視角顯示月名單分派前置條件聚合 banner
  - `allReady = true` → 綠色 banner + 「觸發月名單分派」按鈕
  - `allReady = false` → 警告 banner + 未就緒名單跳轉連結
  - 處長視角不顯示聚合 banner
  - 詳情頁完全無編輯按鈕
  - 處長視角詳情頁業務員比例僅顯示本轄區
  - 部長 / Admin 視角顯示「Rollback 至簽核」按鈕，處長視角不顯示
- E2E：F086 核准至 ready → 部長 GET 5.2 確認 allReady → F061 月名單分派觸發 → 月名單分派完成

## 11. 實作 Checklist

- [ ] 後端實作 `GET /api/v1/assignment/lists/{listNo}/ready-summary` 端點 + Service
- [ ] 後端實作 `GET /api/v1/assignment/ready-summary?ym={ym}` 聚合端點 + Service
- [ ] 後端套 `DirectorOrSectionChiefGuard`（5.1 端點）/ `DirectorGuard`（5.2 端點）
- [ ] 後端套 service 層 `scopeByCreator()` helper 過濾 `individualRatios.departments`
- [ ] 後端套 `StageTransitionService.assertStageEquals(listNo, 'ready')`（5.1 端點）
- [ ] 後端套 `FeatureFlagGuard`
- [ ] 前端「準備完成」頁籤渲染（F077 整合）
- [ ] 前端月名單分派前置條件聚合 banner（部長 / Admin 視角）
- [ ] 前端名單詳情頁 4 區塊布局（篩選條件 / 部門比例 / 個別業務比例 / CR 開關）
- [ ] 前端處長 vs 部長視角差異（業務員比例過濾、聚合 banner 隱藏、Rollback 按鈕渲染）
- [ ] 前端完全無編輯按鈕之保護（DOM 層 + 路由 Guard）
- [ ] 圖表：[diagrams/F088-ready-summary-flow.mmd](../diagrams/F088-ready-summary-flow.mmd)
- [ ] E2E：F086 → F088 → F061 完整路徑

## 12. 假設

| # | 假設 | 標記 |
|---|---|---|
| A-1 | **CR 開關儲存位置**：本 spec 假設 `cr_enabled` 欄位存於 `ob_list_definition`；具體位置由 US-120 / F048 spec 規範 | [ASSUMPTION] 待 F048 / US-120 確認 |
| A-2 | **`monthlyRunStatus` 計算邏輯**：本 spec 預設取「當月最新一筆 `assignment_run` 之 status」；若同月有多筆 run（如重試），以最新一筆為準；具體邏輯由 F061 spec 規範 | [ASSUMPTION] 待 F061 spec 確認 |
| A-3 | **聚合 / 估算效能**：~~當月 active 名單預估 10~50 份，單次查詢可接受；若未來規模擴大需考慮 cache 或物化視圖~~ → **RESOLVED（v1.3）**：採**物化快取**方案 —`estimateCases` 於 F086 approve→ready 當下計算一次並存至 `ob_list_definition`，清單頁直接讀存值；不在 `listLists` 內逐筆對 `ob_pool_data`（百萬列）即時 COUNT。`deptCount` / `empCount` 為對小表之即時 COUNT，效能無虞。詳見 BR-10 / [F086 v1.3 §6.X](F086-approve-to-ready.md) | **RESOLVED (v1.3)** |
| A-4 | **歷史月份是否顯示月名單分派前置條件 banner**：本 spec 預設僅當月顯示；歷史月份頁面不顯示聚合 banner（避免誤觸發月名單分派） | [ASSUMPTION] 待 UI/UX 確認 |

## 13. 變更紀錄

| 版本 | 日期 | 變更內容 |
|---|---|---|
| v1.0 | 2026-05-15 | 初版（對應 US-118，E07 補修批次 5）：依五階段流程提供 ready 名單摘要查詢；新增 5.2 聚合端點供月名單分派前置條件確認；完全唯讀（不提供寫入端點）；處長轄區過濾以 `scopeByCreator()` helper 統一實作 |
| v1.1 | 2026-05-16 | **E07 補修批次 6 修訂**：補充月名單分派前置條件聚合 banner UI 規格（綠色 / 警告色雙態）；新增 `monthlyRunStatus` 欄位於 5.2 response；BR-6 描述月名單分派狀態欄位語意 |
| **v1.2** | **2026-05-16** | **【救援重寫 / 編碼事故修復】**：依 US-118 + AD-E07 v3.0 一致性決議完整重建本檔；Guard 統一為 `DirectorOrSectionChiefGuard`（5.1 端點）+ `DirectorGuard`（5.2 聚合端點）；廢除 `SalesManagerGuard`；business_role 欄位語意對齊 F074 v2.0；保留 v1.1 之月名單分派前置條件聚合提示 |
| **v1.3** | **2026-05-26** | **【prototype 29d 對齊 + 重用端點落地】**：(1) 新增 §5.0 重用既有端點清單（`GET /assignment/lists` 清單 + `ratios/dept` / `ratios/personnel` / `approval-history` 詳情 + `list-definitions/{listNo}/estimate` 試算），原 §5.1 / §5.2 標記「規劃版 / 未實作」作資料概念對照；(2) §5.0.1 `GET /assignment/lists` 每筆 list item 新增 `deptCount` / `empCount` / `approvedAt` / `approverName` / `estimateCases` 5 欄位；§5.0.2 標註 approve 列依賴 F086 v1.3 補寫 `assignment_approval`；(3) §7 清單卡片改為 29d 卡片布局（部門數 / 業務員數 / 預估案件數 / 建立者 / 核准時間 + 整卡可點 + 「查看摘要」），詳情頁部門比例表新增「處長」「設定者（含『部長代設定』chip）」欄；(4) 新增 BR-10（物化估算 best-effort）+ BR-11（設定者 / 代設定判定）；(5) 假設 A-3 標記 RESOLVED（物化方案）。不變動 entity / migration / data-model.md / architecture-spec.md |
