---
spec-id: F111
title: 分派總覽儀表板（客戶名單分派模組新首頁；部長 / 處長 / Admin 唯讀彙總）
feature-id: F111
source-story: US-177
epic: E07
module: M01 名單定義（模組總覽首頁，內容橫跨 M01 / M03d / M04 / M05）
priority: P1
version: "1.0"
date: 2026-07-12
status: Draft
---

# F111: 分派總覽儀表板（客戶名單分派模組新首頁）

Priority: P1（Must Have / Phase 2 Advanced） | Status: Draft | Last Updated: 2026-07-12

> **v1.0（2026-07-12 / US-177 初版）**：新增「分派總覽」（Assignment Overview）頁面作為「客戶名單分派」模組新的入口首頁（sidebar 第 1 項，路由 `/assignment/overview`），原「篩選欄位」降為第 2 項（功能 / 路由不變，僅排序調整）。本頁為**純唯讀彙總視圖**，四大區塊全部彙總既有服務已提供之資料、不新增任何業務邏輯或寫入操作：(1) 名單階段待辦 KPI + 未完成名單清單；(2) 月名單分派就緒狀態 + ETL 前置檢查 + 計分卡狀態；(3) 預計撥打量（本月 / 次月固定對比 + 選定月份每日圖表 + 部門分佈 + 人均可行性）；(4) 最近一次月跑結果回顧（部門落差 + CARD_LEVEL / TIER 分布）。
>
> **架構決策（已定，spec 反映不重議）**：後端新增**單一薄型唯讀聚合端點** `GET /api/v1/assignment/overview?ym=<YYYYMM>`，其 service **組合既有服務**（`AssignmentListService.listLists` / `MonthlyRunReadinessService.calculateReadiness` / `Stage0EstimateService.computeDeptEstimate` / `AssignmentRunService.listRuns` + `AssignmentRunReportService.getSummary` / `SystemService`），**不得引入新的重查詢**。授權採 class 級 `DirectorOrSectionChiefGuard`（比照 US-168 Stage 0 試算頁），處長轄區隔離由 service 層將 actor 傳入 `computeDeptEstimate` 並沿用 `listLists` / readiness 之既有 section_chief 過濾達成（安全邊界）。controller 為純讀（無 `@RequireDirector()` 寫入 method）。
>
> **邊界（交 system-architect / 其他 agent）**：聚合 service 之落點、是否分執行緒 / Promise.allSettled 併行呼叫四來源、`hasActiveLists` 之精確推導機制、端點是否納入 `architecture-spec.md` AD 編號 = §12 Open Questions（OQ-F111-01~04，附建議預設）。前端頁面元件 / 圖表庫接線 / prototype（tdd-implementation / ui-ux-designer 範疇）。無新 HTTP 錯誤碼（§9.1 審查結論）。

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| System Architect | 本文件 §5 / §6 / §12 + `F049-stage0-daily-estimate.md`（`computeDeptEstimate` 契約）+ `F088-ready-stage-summary.md`（readiness 組裝）+ `apps/api/src/modules/assignment/services/monthly-run-readiness.service.ts` + `apps/api/src/modules/assignment-list/stage0-estimate.service.ts` + `apps/api/src/modules/assignment/services/assignment-run-report.service.ts` |
| TDD Developer | 本文件 + `F049-stage0-daily-estimate.md` §17（處長 scope）+ `data-model.md#ob-list-definition-stage` + `error-handling.md#assignment-role-errors` |
| QA / Tester | 本文件 §4 / §5.4 + `error-handling.md#assignment-role-errors` + `error-handling.md#assignment-run-warnings` |
| UI/UX Designer | 本文件 §7 + prototype（總覽頁，ui-ux-designer 產出）+ `F049-stage0-daily-estimate.md` §7（每日圖表 / 部門矩陣樣式參考）+ `F088-ready-stage-summary.md` §7（就緒 banner 樣式參考） |

---

## 對應 User Story

- 來源 Story：[US-177-M01-assignment-overview-dashboard.md](../../stories/epics/E07-app-customer-list-assignment/US-177-M01-assignment-overview-dashboard.md)（AC-1 ~ AC-17，本 spec 之 AC-1 ~ AC-17 與其 1:1 對應）
- Epic：[E07 — 客戶名單分派](../../stories/epics/E07-app-customer-list-assignment/epic-brief.md)
- 模組：M01 名單定義（模組總覽首頁；內容彙總 M01 / M03d / M04 / M05）

---

## 1. 功能摘要

提供部長（Director）/ 處長（Section Chief）/ Admin 一個以本月營運狀況為中心的**唯讀總覽儀表板**，作為「客戶名單分派」模組的新入口首頁（路由 `/assignment/overview`，名稱「分派總覽」）。頁面以四大區塊一次回答「名單流程卡在哪、能不能觸發月名單分派、這個月大概要打多少通電話、上次月跑準不準」四個問題，使用者不需逐一點開名單定義 / 觸發頁 / 試算頁 / 執行歷史即可判斷整體健康狀況，並直接點擊鑽入需處理的既有功能頁。

**核心特性**：

1. **純唯讀彙總**：本頁不新增任何業務邏輯或寫入端點；四大區塊全部由既有服務組合而成，所有可點擊項目行為僅限「導覽」至既有功能頁或聚焦其特定區域（AC-16）。
2. **單一薄型聚合端點**：後端新增 `GET /api/v1/assignment/overview?ym=<YYYYMM>`，其 service 組合既有服務，不引入新的重查詢（§5）。
3. **角色範圍控制**：授權對齊既有 `DirectorOrSectionChiefGuard`；處長自動限定於本人轄區（service 層 scope filter 為安全邊界，非前端遮罩），組織級加總 / 缺口類數據在處長視角下不顯示（AC-2）。
4. **區塊獨立載入 / 失敗**：任一區塊失敗不影響其他三區塊；失敗以明確錯誤標記呈現、不得靜默空白（AC-15）。

**不在範圍**（交其他 agent / 既有頁面）：
- 觸發月名單分派、修改名單設定 / 比例、任何寫入操作（維持於既有功能頁；本頁僅顯示狀態並提供導覽連結）。
- 四大區塊之底層計算邏輯（名單階段統計、readiness、Stage 0 部門估算、月跑結果摘要）均已由既有服務提供，本 spec 不重新定義其演算法。
- 聚合 service 落點 / 併行呼叫策略 / 端點 AD 編號 = system-architect（§12）。
- 前端頁面元件 / 圖表 / prototype = ui-ux-designer / tdd-implementation。

## 2. 使用者故事

**As a** 部長（Director）、處長（Section Chief）或 Admin
**I want** 進入「客戶名單分派」時，第一眼看到以本月營運狀況為中心的總覽儀表板
**So that** 不需逐一點開多個頁面拼湊資訊，即可快速判斷本月分派作業健康狀況並鑽入待處理項目

## 3. 前置條件

- 使用者已通過 E01 驗證並持有有效 JWT Token。
- 使用者 `role = 'admin'`，或 `businessRole IN ('director', 'section_chief')`（對齊 `DirectorOrSectionChiefGuard`）。`role = 'user'` 且無 E07 businessRole 者被 guard 擋下（AC-1）。
- 既有服務與資料已就緒：`ob_list_definition`（名單階段）、`assignment_run` / `ob_monthly_run_result`（月跑）、`etl_pipeline_logs` + 4 張來源表（ETL 前置）、`ob_levelcard_version`（計分卡）、`ob_dept_pct` / `ob_emphire`（部門比例 / 在職人數）。任一來源缺資料時對應區塊以空狀態或錯誤標記呈現（AC-14 / AC-15），不阻擋整頁。
- 處長轄區判定沿用既有 `SectionChiefScopeService.getScopeDeptCode`（`users.email → ob_emphire`，`resign_date IS NULL` 且 `jfun_nm='處長'`）。

## 4. 驗收標準

> 本節 AC-1 ~ AC-17 與 [US-177](../../stories/epics/E07-app-customer-list-assignment/US-177-M01-assignment-overview-dashboard.md) AC-1 ~ AC-17 **1:1 對應**（同編號同語意），供 test-designer 直接映射 TC。

### AC-1：頁面存取範圍與角色守衛

- **Given** 任意已登入使用者導航至 `/assignment/overview`
- **When** 端點進行存取權限判斷
- **Then** `businessRole = 'director'`、`businessRole = 'section_chief'`、`role = 'admin'` 三者均可成功呼叫 `GET /assignment/overview`（HTTP 200，對齊 `DirectorOrSectionChiefGuard`）
- **And** `role = 'user'`（無 E07 businessRole）呼叫時 → **403 `E07_ROLE_NOT_ASSIGNED`**；前端主體內容被封鎖，顯示「分派總覽為部長 / 處長 / Admin 專屬功能」說明卡，不顯示任何區塊資料
- **And** `admin` 之資料範圍視角等同部長（全公司、不限轄區；`scope.scoped = false`）

### AC-2：處長轄區範圍標示與資料限定

- **Given** 使用者為處長（`section_chief`）
- **When** 端點回應
- **Then** response `scope = { role: 'section_chief', deptCode: <轄區代號>, scoped: true }`，前端據以顯示「轄區檢視」識別徽章 + 處長所屬部門名稱（比照 US-105 AC-4 / US-168 AC-1 徽章語意）
- **And** 四大區塊中所有「依部門拆分」之資料列（名單階段待辦之未完成名單、預計撥打量之部門分佈、最近月跑之部門落差）僅含處長本人轄區部門資料列，其他部門資料列**完全不存在於 response**（非數字遮罩；沿用各來源服務既有 section_chief 過濾）
- **And** 組織級加總 / 缺口類數值（`days[].orgTotal` / `days[].deptAssignedTotal` / `days[].gap`、部門分佈 `ratio` 佔比）在處長視角下為 `null`（依 `computeDeptEstimate` 既有 BR-13 行為，該類數值在 scoped 模式本就無意義）

### AC-3：分派作業月份選擇器（四區塊共用）

- **Given** 使用者進入分派總覽頁
- **When** 頁面載入
- **Then** 頁面頂端顯示「分派作業月份」選擇器，預設值為下月（`target_work_ym`，比照 US-138 / F077 v1.4 預設邏輯；前端於 `AssignmentWorkYmProvider` 共用此狀態）
- **And** 選擇器變更月份後，前端以新 `ym` 重新請求 `GET /assignment/overview?ym=<新月份>`，四大區塊全部依新選定月份重新載入（單一端點一次回四區塊）
- **And** 月份切換期間，尚未回應之區塊各自顯示載入中狀態（AC-15），不阻擋其他已完成區塊

### AC-4：區塊一 — 名單階段待辦 KPI 卡

- **Given** 分派總覽頁已載入選定月份資料
- **When** 呈現「名單階段待辦」區塊
- **Then** 顯示五張 KPI 卡對應五個流程階段（沿用 Kanban 五階段：草稿 draft / 部門比例 dept_ratio / 個別比例 personnel_ratio / 待簽核 approval / 準備完成 ready），各卡顯示 `stageTodo.stageCounts.<stage>` 數量
- **And** 點擊任一階段 KPI 卡，導向 M01 名單定義主頁（Kanban，`/assignment/list-definitions`），並以該階段為篩選 / 聚焦
- **And** 若選定月份查無任何名單（`stageTodo.hasAnyList = false`），五張卡均顯示 0，並顯示引導文案「本月尚無名單定義，請至名單定義頁建立」+「前往建立」連結

### AC-5：區塊一 — 未完成名單待辦清單

- **Given** 選定月份存在尚未達 `ready` 階段之名單
- **When** 「名單階段待辦」區塊呈現
- **Then** 顯示「未完成名單待辦清單」，逐筆列出每份未就緒名單之 `listNo`、`listNm`、目前階段 `stage`（來源：`listLists` 之 `status='active' AND stage != 'ready'` 名單列）
- **And** 每一筆可點擊，導向該名單於 M01 之詳情（Detail Drawer，對齊 US-131）
- **And** 若本月所有名單皆已 `ready`（或本月無 active 名單），`stageTodo.notReadyLists = []`，前端顯示「目前無未完成名單」正向提示，而非空白

### AC-6：區塊二 — 月名單分派就緒狀態摘要

- **Given** 分派總覽頁已載入選定月份資料
- **When** 呈現「月名單分派就緒狀態」區塊
- **Then** 顯示是否所有 active 名單皆已就緒（`runReadiness.allReady` 燈號）、`runReadiness.readyCount / runReadiness.totalActiveLists`（如「8 / 10」）
- **And** 顯示 `runReadiness.monthlyRunStatus`（`none` 無執行紀錄 / `pending` 等待中 / `running` 執行中 / `completed` 已完成 / `failed` 失敗），狀態清楚區分於名單就緒狀態（兩者為不同維度）
- **And** 若 `monthlyRunStatus = 'running'`，額外標示「月名單分派執行中」提示

### AC-7：區塊二 — ETL 來源資料前置檢查與計分卡狀態

- **Given** 「月名單分派就緒狀態」區塊已載入
- **When** 呈現前置檢查明細
- **Then** 顯示 4 項來源資料同步狀態（`runReadiness.etlStatus.{pooldata, emphire, calendar, arreturndf}`，各自 `status` ∈ `completed`/`failed`/`running`/`missing` 與 `rowCount`），以業務命名對照：客戶名單池（pooldata）/ 在職名單（emphire）/ 工作日曆（calendar）/ 最低回收上限（arreturndf）
- **And** 顯示計分卡（計分版本）是否啟用（`runReadiness.scoringActive`，是 / 否）
- **And** 任一項目未通過（`status != 'completed'` 或 `rowCount = 0`）時以警示樣式呈現 + 簡短原因（例：「客戶名單池尚未同步」/「工作日曆為空表」），不顯示完整技術錯誤堆疊；`runReadiness.sourcesAllHaveData = false` 時列出 `emptySourceTables`

### AC-8：區塊二 — 觸發權限差異化呈現（本頁僅狀態，不觸發）

- **Given** 「月名單分派就緒狀態」區塊已顯示
- **When** 使用者檢視此區塊可操作元素
- **Then** 本頁**不提供**觸發月名單分派的按鈕（觸發維持於既有「觸發月名單分派」頁 `/assignment/run`）
- **And** 部長 / admin 視角（`runReadiness.canNavigateToTrigger = true`）顯示「前往觸發月名單分派」導覽連結
- **And** 處長視角（`canNavigateToTrigger = false`）**不顯示**任何導覽至觸發頁的連結或按鈕（處長對觸發無操作權限，比照 M07 角色矩陣），僅呈現唯讀狀態

### AC-9：區塊三 — 本月 vs 次月預計撥打總量

- **Given** 分派總覽頁已載入
- **When** 呈現「預計撥打量」區塊
- **Then** 顯示本月（`dialingVolume.headline.currentMonth`）與次月（`dialingVolume.headline.nextMonth`）之預計總撥打量（案件數）並排比較
- **And** 若其中一個月份查無任何 active 名單或估算資料（`hasActiveLists = false`），該月份 `total = null`，前端顯示「—」+「本月尚無啟用名單」等說明，**不得**顯示 0 或造成誤解的數字（empty ≠ zero，BR-4）
- **And** 此區塊之月份對比**固定為「本月 / 次月」**（`current_work_ym` / `target_work_ym`），與 AC-3 之月份選擇器為兩個獨立維度（選擇器影響其他三區塊看哪個月，本 AC 為固定營運節奏參考，不受選擇器影響，BR-6）

### AC-10：區塊三 — 每日撥打量圖表

- **Given** 「預計撥打量」區塊已載入
- **When** 呈現每日分佈
- **Then** 以圖表呈現**選定月份**（AC-3 選擇器所選）各工作日之預估撥打量（`dialingVolume.selected.days[]`，每筆 `date` / `weekday` / `isWorkday` / `orgTotal` / `deptCells[].cases`），非工作日（`isWorkday = false`）不計入或明確標示（`deptCells = []`、`orgTotal = 0`）
- **And** 圖表資料點可查看當日詳細數字（hover 顯示件數）

### AC-11：區塊三 — 部門分佈與人均每日可行性

- **Given** 「預計撥打量」區塊已載入
- **When** 呈現部門維度資料
- **Then** 顯示各部門預估撥打量分佈（`dialingVolume.selected.deptDistribution[]`，部門名稱 `deptName` + 件數 `totalCases` + 佔比 `ratio`）
- **And** 顯示各部門「人均每日件數」可行性指標（`days[].deptCells[].perPerson`），超過負荷門檻（`selected.threshold`，沿用 US-169 邏輯與門檻）之部門格以警示樣式標示（`overThreshold = true`）；`threshold = null`（未設定）時不顯示警示（沿用 US-169 AC-4 降級）
- **And** 部門在職人數為 0 導致無法計算人均值時（`perPerson = null`），顯示「—」+ 說明，不得顯示 0 / `Infinity` / `NaN`（沿用 US-169 AC-2）

### AC-12：區塊三 — 處長僅見本部門撥打量數據

- **Given** 使用者為處長
- **When** 「預計撥打量」區塊呈現
- **Then** 每日圖表、部門分佈、人均可行性三者均僅呈現處長本人轄區部門資料（`departments` / `deptCells` / `deptDistribution` 僅含轄區 deptCode；`days[].orgTotal` / `deptAssignedTotal` / `gap` = null）
- **And** 本月 / 次月總量對比（AC-9）之 `total` 僅反映其轄區部門加總（`headline.*.scopedToDept = true`）；前端明確標示「（僅本部門）」避免與部長全公司數字混淆

### AC-13：區塊四 — 最近一次月跑結果回顧

- **Given** 選定月份存在至少一筆已完成（`completed`）的月名單分派
- **When** 呈現「最近一次月跑結果」區塊
- **Then** `recentRun.hasCompletedRun = true`，顯示該月**最近一次完成**月跑（BR-7 最新完成優先）之部門「設定比例 vs 實際落差」摘要（`deptSummary[]`：`deptName` / `configRatio` / `actualRatio` / `deviation` / `alert`），`alert = true` 之部門以警示樣式標示（落差門檻沿用 NFR-005）
- **And** 顯示該次月跑之 CARD_LEVEL 分布（`levelDistribution[]`：`cardLevel` / `count` / `ratio`）與 TIER 分布（`tierDistribution[]`：`tierLevel` / `count` / `ratio`）
- **And** 提供「查看完整結果摘要」（M04 結果摘要頁，帶 `recentRun.runId`）與「查看執行歷史」（M05 `/assignment/history`）連結
- **And** 處長視角下 `deptSummary` 僅含其轄區部門資料列（沿用 `getSummary(runId, actor)` 之 F063 AC-5 既有 scope，比照 AC-2）

### AC-14：區塊四 — 選定月份尚無已完成月跑時的空狀態

- **Given** 選定月份沒有任何 `completed` 狀態的月名單分派紀錄
- **When** 呈現「最近一次月跑結果」區塊
- **Then** `recentRun.hasCompletedRun = false`，前端顯示明確空狀態文案，**不**自動 fallback 顯示其他月份結果
- **And** 依 `recentRun.emptyReason` 反映狀態（BR-8）：
  - `noRun`（選定月份完全無任何月跑紀錄，`latestRunStatus = null`）→ 「本月尚無已完成的月名單分派結果」
  - `noCompletedRun`（有 `failed` / `running` / `pending` 但無 `completed`，`latestRunStatus ∈ {failed, running, pending}`）→ 反映該狀態之文案（例：`running` → 「本月月名單分派執行中，尚無可回顧結果」；`failed` → 「本月最近一次月名單分派執行失敗，尚無可回顧結果」）

### AC-15：跨區塊 Loading / Empty / Error 狀態規範

- **Given** 分派總覽頁之任一區塊
- **When** 該區塊對應資料分別處於載入中、回傳空資料、或請求失敗（含逾時）三種情形
- **Then** 三種情形須各自明確、可視覺區分：載入中顯示載入指示（非空白）；空資料顯示各 AC 定義之空狀態文案（非空白、非顯示 0 或誤導性數字）；失敗顯示明確錯誤提示（如「本區塊資料暫時無法取得，請稍後重試」）
- **And** 任一區塊失敗**不得**影響其他三區塊：後端將每個區塊獨立包裝，單一來源失敗僅使該區塊回 `{ error: true, errorCode, message }`、其餘三區塊正常回傳、HTTP 整體仍為 200（BR-9）
- **And** 失敗提示不得以靜默空白呈現（本專案已有因逾時導致頁面靜默空白之既有事故，本頁須明確規避）

### AC-16：唯讀特性 — 頁面不執行任何寫入操作

- **Given** 使用者在分派總覽頁任何區塊互動
- **When** 檢視頁面所有可操作元素
- **Then** 所有可點擊項目（KPI 卡、待辦清單項目、各類連結）行為**僅限導覽**（跳轉既有功能頁或聚焦既有頁面特定區域）
- **And** `GET /assignment/overview` 端點與本頁前端**不呼叫**任何建立 / 修改 / 刪除業務資料之 API（不觸發月名單分派、不修改名單設定、不修改比例）；聚合 service 僅執行 SELECT 類讀取（BR-10）

### AC-17：Sidebar 導覽入口變更

- **Given** 使用者於側邊欄看到「客戶名單分派」模組群組
- **When** 展開該模組群組頁面清單
- **Then** 「分派總覽」（`/assignment/overview`）為該群組**第 1 個項目**（模組預設進入頁）
- **And** 原位居第 1 項之「篩選欄位」（`/assignment/field-base`）調整為**第 2 項**，其頁面功能與路由本身不變（僅排序調整）
- **And** 使用者直接點擊「客戶名單分派」模組群組本身（若可點擊導覽）時，導向 `/assignment/overview`

## 5. API 規格

### 5.1 端點

| 屬性 | 值 |
|---|---|
| Method / Path | `GET /api/v1/assignment/overview` |
| 用途 | 一次回傳分派總覽四大區塊之彙總資料（唯讀） |
| 認證 | JWT 必填 |
| 授權 | class 級 `DirectorOrSectionChiefGuard` + `@RequireDirectorOrSectionChief()`（admin OR businessRole IN ('director','section_chief')）；controller 純讀、**無** `@RequireDirector()` 寫入 method |
| Feature Flag | 沿用 E07 既有 `FeatureFlagGuard`（若既有 E07 controller 一致掛載；HOW 由 architect 依現況決定，OQ-F111-04） |

**Query 參數**

| 名稱 | 型別 | 必填 | 預設 | 說明 |
|---|---|---|---|---|
| `ym` | string（`YYYYMM`，`@Matches(/^\d{6}$/)`） | 否 | server 端 `SystemService.getCurrentWorkYm()` | 選定分派作業月份；前端**一律傳入**月份選擇器所選值（AC-3）。格式不符 → 400 `VALIDATION_ERROR` |

> **併行呼叫**：聚合 service 對四個來源之呼叫應彼此獨立（建議 `Promise.allSettled`，使單一來源失敗降級為該區塊 `{ error: true }`、不拖垮整體，BR-9）；併行 / 序列策略為 architect 實作細節（OQ-F111-02）。

### 5.2 Response 型別（`AssignmentOverviewResponse` — @cdmp/shared DTO）

> 頂層為單一物件，含 `selectedYm` / `currentWorkYm` / `targetWorkYm` / `scope` 回顯 + 四個以區塊命名之子物件（`stageTodo` / `runReadiness` / `dialingVolume` / `recentRun`）。每個區塊子物件為**判別聯集**（discriminated union on `error`）：成功為 `{ error: false, ...資料 }`，失敗為 `{ error: true, errorCode, message }`（BR-9）。

```ts
// ---- 區塊錯誤包裝（AC-15 / BR-9）----
interface OverviewBlockError {
  error: true;
  errorCode:
    | 'STAGE_TODO_UNAVAILABLE'
    | 'RUN_READINESS_UNAVAILABLE'
    | 'DIALING_VOLUME_UNAVAILABLE'
    | 'RECENT_RUN_UNAVAILABLE';
  message: string;                 // 使用者可讀（zh-TW），非技術堆疊
}
type OverviewBlock<T> = ({ error: false } & T) | OverviewBlockError;

// ---- 頂層 ----
interface AssignmentOverviewResponse {
  selectedYm: string;              // 本次查詢月份（YYYYMM）；= query.ym 或 current_work_ym
  currentWorkYm: string;           // SystemService.getCurrentWorkYm()
  targetWorkYm: string;            // SystemService.getDefaultTargetWorkYm()（= current+1）
  scope: OverviewScope;
  stageTodo: OverviewBlock<StageTodoBlock>;         // 區塊一
  runReadiness: OverviewBlock<RunReadinessBlock>;   // 區塊二
  dialingVolume: OverviewBlock<DialingVolumeBlock>; // 區塊三
  recentRun: OverviewBlock<RecentRunBlock>;         // 區塊四
}

interface OverviewScope {
  role: 'director' | 'section_chief' | 'admin';
  deptCode: string | null;         // section_chief 之轄區代號；director/admin = null
  scoped: boolean;                 // section_chief = true；director/admin = false
}
```

#### 5.2.1 區塊一 `StageTodoBlock`（名單階段待辦；來源 `AssignmentListService.listLists({ ym, actor })`）

```ts
interface StageTodoBlock {
  stageCounts: {                   // listLists().stageCounts 原樣
    draft: number;
    dept_ratio: number;
    personnel_ratio: number;
    approval: number;
    ready: number;
    disabled: number;
  };
  notReadyLists: NotReadyListItem[]; // status='active' AND stage != 'ready' 之名單（全數，不分頁，OQ-177-02）
  notReadyCount: number;             // = notReadyLists.length（前端據以判斷是否顯示「查看全部」，OQ-177-02）
  hasAnyList: boolean;               // 選定月份是否存在任何 ob_list_definition（含 disabled）；false → AC-4 空狀態
}

interface NotReadyListItem {
  listNo: string;
  listNm: string;
  stage: string;                   // 'draft' | 'dept_ratio' | 'personnel_ratio' | 'approval'
}
```

> **scope**：處長模式下 `listLists` 既有 section_chief 過濾（`EXISTS ob_dept_pct.obdeptid = scope`）自動生效，`stageCounts` 與 `notReadyLists` 僅涵蓋其轄區名單。`hasAnyList` 亦於 scope 內判定。

#### 5.2.2 區塊二 `RunReadinessBlock`（就緒狀態 + ETL 前置；來源 `MonthlyRunReadinessService.calculateReadiness(ym)`）

```ts
interface RunReadinessBlock {
  totalActiveLists: number;        // status='active' 且 stage != 'draft'
  readyCount: number;              // 其中 stage='ready'
  allReady: boolean;
  notReadyLists: Array<{ listNo: string; listNm: string; stage: string }>;
  monthlyRunStatus: 'none' | 'pending' | 'running' | 'completed' | 'failed';
  scoringActive: boolean;          // 是否有 ob_levelcard_version.status='active'
  etlStatus: {
    pooldata: EtlSourceStatus;
    emphire: EtlSourceStatus;
    calendar: EtlSourceStatus;
    arreturndf: EtlSourceStatus;
  };
  sourcesAllHaveData: boolean;
  emptySourceTables: string[];     // rowCount=0 之來源表名（如 'ob_calendar'）
  canNavigateToTrigger: boolean;   // AC-8：director/admin=true；section_chief=false（衍生自 scope.role）
}

interface EtlSourceStatus {
  status: 'completed' | 'failed' | 'running' | 'missing';
  lastRunAt: string | null;        // ISO 8601
  rowCount: number;                // 目標表真實筆數；0 = 空表（即使 log completed）
}
```

> **註**：`RunReadinessBlock.notReadyLists` 之母體為「active 且 `stage != 'draft'`」（readiness 語意），與區塊一 `StageTodoBlock.notReadyLists`（active 且 `stage != 'ready'`，**含** draft）母體不同；兩者服務語意各自維持不變，前端分別呈現於各區塊，不可互相取代。`calculateReadiness` 目前不吃 actor 參數；處長 scope 對本區塊之限縮由 architect 依既有服務行為決定（OQ-F111-03，建議預設：readiness 之名單就緒屬全月營運狀態、對處長維持全月視角即可，ETL / 計分卡為全域狀態本就與轄區無關）。

#### 5.2.3 區塊三 `DialingVolumeBlock`（預計撥打量；來源 `Stage0EstimateService.computeDeptEstimate({ ym, actor })`）

```ts
interface DialingVolumeBlock {
  headline: {                      // AC-9 固定本月/次月對比（不受 AC-3 選擇器影響，BR-6）
    currentMonth: MonthTotal;      // computeDeptEstimate(current_work_ym, actor)
    nextMonth: MonthTotal;         // computeDeptEstimate(target_work_ym,  actor)
  };
  selected: DeptEstimateProjection; // computeDeptEstimate(selectedYm, actor)：每日圖表 + 部門分佈 + 可行性
}

interface MonthTotal {
  ym: string;
  total: number | null;            // Σ over workdays Σ deptCells[].cases；hasActiveLists=false → null（empty≠zero，BR-4）
  hasActiveLists: boolean;         // 該月（依 actor scope）是否 ≥1 active 名單
  scopedToDept: boolean;           // section_chief=true（total 僅本部門，AC-12「（僅本部門）」）；director/admin=false
}

interface DeptEstimateProjection { // 取 computeDeptEstimate 回應之相關欄位（F049 §14.3 契約）
  ym: string;
  mode: 'aggregated' | 'single-list'; // 本頁固定 'aggregated'（全名單彙總）
  calendarSource: 'weekday' | 'weekday-only' | 'all'; // 本頁固定預設 'weekday'
  startDate: string;               // YYYY-MM-DD
  endDate: string;
  departments: Array<{ deptCode: string; deptName: string; activeHeadcount: number }>;
  days: DialingDay[];
  threshold: number | null;        // 每人每日上限；未設定=null（AC-11 降級）
  deptDistribution: DeptDistributionItem[]; // 衍生彙總（AC-11 部門分佈，避免前端逐日加總）
  warnings: Array<{ code: string; deptCode?: string; listNo?: string; message?: string }>;
  poolCount: number;
  poolWarning: 'POOL_COUNT_LOW' | null;
}

interface DialingDay {
  date: string;                    // YYYY-MM-DD
  weekday: string;                 // 中文星期
  isWorkday: boolean;              // 非工作日 → deptCells=[]、orgTotal=0
  orgTotal: number | null;         // 全名單總量；休息日=0；section_chief=null（AC-2/AC-12）
  deptAssignedTotal: number | null;// Σ 已設定比例部門件數；section_chief=null
  gap: number | null;              // org_total − deptAssignedTotal（≥0）；section_chief=null
  deptCells: Array<{ deptCode: string; cases: number; perPerson: number | null; overThreshold: boolean }>;
}

interface DeptDistributionItem {
  deptCode: string;
  deptName: string;
  totalCases: number;              // Σ over workdays 該部門 deptCells.cases
  ratio: number | null;            // totalCases ÷ Σ_all_dept totalCases（%，一位小數）；section_chief=null（組織級佔比隱藏，AC-2）
}
```

> **`headline.total` 計算**：對指定月份呼叫 `computeDeptEstimate` 後，`total = Σ_{d ∈ days, isWorkday} Σ_{c ∈ days[d].deptCells} c.cases`（處長模式下 `deptCells` 僅含轄區部門 → total 自然為本部門加總，AC-12）。`selectedYm === currentWorkYm` 時 headline.currentMonth 與 selected 可共用同一次 `computeDeptEstimate` 結果（去重，OQ-F111-02）。
>
> **`hasActiveLists` 推導**：該月（依 actor scope）`status='active'` 之 `ob_list_definition` 是否 ≥1；HOW（`computeDeptEstimate` 內部旗標 vs 輕量 COUNT）由 architect 定（OQ-F111-01，建議預設：由 `computeDeptEstimate` 暴露 active-list 存在旗標，避免額外查詢）。`hasActiveLists=false` ⇒ `total=null`。
>
> **`deptDistribution` 為衍生便利欄**：由 `days[].deptCells` 於 service 端一次彙總（in-memory 小矩陣，無額外查詢），供 AC-11 部門分佈直接渲染；與 `days` 資料一致、非新查詢來源。

#### 5.2.4 區塊四 `RecentRunBlock`（最近一次月跑結果；來源 `AssignmentRunService.listRuns({ym})` + `AssignmentRunReportService.getSummary(runId, actor)`）

```ts
type RecentRunBlock = RecentRunPresent | RecentRunEmpty;

interface RecentRunPresent {
  hasCompletedRun: true;
  runId: string;
  projectWorkym: string;
  finishedAt: string | null;       // ISO 8601
  totalCases: number | null;
  coverageRate: number;            // getSummary().coverageRate
  emplCount: number;               // 分派業務員數（context）
  deptSummary: Array<{
    deptId: string;
    deptName: string | null;
    configRatio: number;
    actualCount: number;
    actualRatio: number;
    deviation: number;
    alert: boolean;                // |deviation| > NFR-005 門檻
  }>;
  levelDistribution: Array<{ cardLevel: string; count: number; ratio: number }>;
  tierDistribution: Array<{ tierLevel: string; count: number; ratio: number }>;
}

interface RecentRunEmpty {
  hasCompletedRun: false;
  emptyReason: 'noRun' | 'noCompletedRun'; // OQ-177-01 解法（BR-8）
  latestRunStatus: 'failed' | 'running' | 'pending' | null; // noRun → null
  latestRunId: string | null;      // noCompletedRun 時之最新 run id（供 M05 歷史深連，選用）；noRun → null
}
```

> **scope**：`getSummary(runId, actor)` 既有 section_chief 過濾（F063 AC-5）自動使 `deptSummary` 僅含轄區部門列（AC-13 末條）。`levelDistribution` / `tierDistribution` 為全域分布（getSummary 現況），非部門維度、不受 scope 影響。

### 5.3 Response 範例（部長視角，選定月份 = 202608）

```jsonc
{
  "selectedYm": "202608",
  "currentWorkYm": "202607",
  "targetWorkYm": "202608",
  "scope": { "role": "director", "deptCode": null, "scoped": false },
  "stageTodo": {
    "error": false,
    "stageCounts": { "draft": 1, "dept_ratio": 0, "personnel_ratio": 1, "approval": 0, "ready": 8, "disabled": 2 },
    "notReadyLists": [
      { "listNo": "OB202608005", "listNm": "個貸名單", "stage": "personnel_ratio" },
      { "listNo": "OB202608009", "listNm": "車貸名單", "stage": "draft" }
    ],
    "notReadyCount": 2,
    "hasAnyList": true
  },
  "runReadiness": {
    "error": false,
    "totalActiveLists": 10, "readyCount": 8, "allReady": false,
    "notReadyLists": [ { "listNo": "OB202608005", "listNm": "個貸名單", "stage": "personnel_ratio" } ],
    "monthlyRunStatus": "pending",
    "scoringActive": true,
    "etlStatus": {
      "pooldata":  { "status": "completed", "lastRunAt": "2026-08-01T02:10:00Z", "rowCount": 3631548 },
      "emphire":   { "status": "completed", "lastRunAt": "2026-08-01T02:12:00Z", "rowCount": 1180 },
      "calendar":  { "status": "completed", "lastRunAt": "2026-08-01T02:13:00Z", "rowCount": 366 },
      "arreturndf":{ "status": "completed", "lastRunAt": "2026-08-01T02:15:00Z", "rowCount": 55863 }
    },
    "sourcesAllHaveData": true, "emptySourceTables": [],
    "canNavigateToTrigger": true
  },
  "dialingVolume": {
    "error": false,
    "headline": {
      "currentMonth": { "ym": "202607", "total": 42350, "hasActiveLists": true,  "scopedToDept": false },
      "nextMonth":    { "ym": "202608", "total": null,  "hasActiveLists": false, "scopedToDept": false }
    },
    "selected": {
      "ym": "202608", "mode": "aggregated", "calendarSource": "weekday",
      "startDate": "2026-08-01", "endDate": "2026-08-31",
      "departments": [ { "deptCode": "XVE1", "deptName": "北區電銷1", "activeHeadcount": 27 } ],
      "days": [
        { "date": "2026-08-03", "weekday": "一", "isWorkday": true, "orgTotal": 1234, "deptAssignedTotal": 1100, "gap": 134,
          "deptCells": [ { "deptCode": "XVE1", "cases": 480, "perPerson": 18, "overThreshold": true } ] },
        { "date": "2026-08-09", "weekday": "日", "isWorkday": false, "orgTotal": 0, "deptAssignedTotal": 0, "gap": 0, "deptCells": [] }
      ],
      "threshold": 15,
      "deptDistribution": [ { "deptCode": "XVE1", "deptName": "北區電銷1", "totalCases": 9600, "ratio": 32.3 } ],
      "warnings": [], "poolCount": 50000, "poolWarning": null
    }
  },
  "recentRun": {
    "error": false, "hasCompletedRun": true,
    "runId": "e3c839b7-1111-2222-3333-444455556666", "projectWorkym": "202608",
    "finishedAt": "2026-08-02T09:00:00Z", "totalCases": 55863, "coverageRate": 0.98, "emplCount": 91,
    "deptSummary": [ { "deptId": "XVE1", "deptName": "北區電銷1", "configRatio": 32.5, "actualCount": 18200, "actualRatio": 32.6, "deviation": 0.1, "alert": false } ],
    "levelDistribution": [ { "cardLevel": "A", "count": 6271, "ratio": 11.2 } ],
    "tierDistribution": [ { "tierLevel": "T1", "count": 1748, "ratio": 3.1 } ]
  }
}
```

### 5.4 錯誤回應

| HTTP | 錯誤碼 | 說明 |
|---|---|---|
| 401 | `AUTH_TOKEN_MISSING` / `AUTH_TOKEN_EXPIRED` | 未登入或 Token 過期 |
| 403 | `E07_ROLE_NOT_ASSIGNED` | 非 admin 且 businessRole 非 director / section_chief（含 `role='user'`，AC-1）；`DirectorOrSectionChiefGuard` 攔截 |
| 400 | `VALIDATION_ERROR` | `ym` 格式非 `YYYYMM` |

> **區塊級軟失敗（非 HTTP 錯誤碼）**：單一來源服務失敗時，整體仍回 **HTTP 200**，僅該區塊為 `{ error: true, errorCode, message }`（BR-9 / AC-15）；`errorCode` ∈ `STAGE_TODO_UNAVAILABLE` / `RUN_READINESS_UNAVAILABLE` / `DIALING_VOLUME_UNAVAILABLE` / `RECENT_RUN_UNAVAILABLE`。此類標記為 response body 內語意欄位、**非** `error-handling.md` 之 HTTP 錯誤碼（§9.1 審查結論）。

## 6. 業務規則

| 規則編號 | 說明 |
|---|---|
| BR-1 | **完全唯讀**：本 spec 不提供任何寫入端點；`GET /assignment/overview` 之 service 僅組合既有服務執行 SELECT 讀取（AC-16 / BR-10）。 |
| BR-2 | **薄型聚合、不新增重查詢**：聚合 service **必須**重用 `AssignmentListService.listLists` / `MonthlyRunReadinessService.calculateReadiness` / `Stage0EstimateService.computeDeptEstimate` / `AssignmentRunService.listRuns` + `AssignmentRunReportService.getSummary` / `SystemService`，不得為本頁另寫繞過既有服務之新查詢邏輯（避免與月跑 / 試算 / 就緒判定產生二套語意）。 |
| BR-3 | **處長 scope = 安全邊界**：處長轄區隔離由各來源服務既有 section_chief 過濾達成（`listLists` 之 `EXISTS ob_dept_pct.obdeptid=scope`、`computeDeptEstimate` 之 dept scope filter、`getSummary(runId, actor)` 之 scoped deptSummary）。聚合 service 將 `actor` 透傳給支援 scope 的來源，**不**於前端做遮罩。組織級加總 / 缺口 / 佔比（`orgTotal` / `deptAssignedTotal` / `gap` / `deptDistribution.ratio`）在 scoped 模式為 `null`（AC-2 / AC-12）。 |
| BR-4 | **empty ≠ zero**：撥打量 headline `total` 於「查無 active 名單」時為 `null`（前端顯示「—」），與真實 `0` 明確區分（AC-9）；區塊一以 `hasAnyList` 區分「本月無任何名單」與「有名單但都 ready」（AC-4）；區塊四以 `hasCompletedRun` + `emptyReason` 區分空狀態種類（AC-14）。任何區塊不得以 `0` 或空白表達「無資料」。 |
| BR-5 | **最近一次月跑選取**：區塊四取選定月份（`selectedYm`）之 `listRuns({ ym })` 中 `status='completed'` 且 `finishedAt`（次選 `triggeredAt`）**最新**之一筆 → `getSummary(runId, actor)`。無任何 completed → `hasCompletedRun=false`（BR-8）。**不** fallback 至其他月份（AC-14）。 |
| BR-6 | **月份選擇器 vs 固定本月/次月軸**：AC-3 之「分派作業月份選擇器」（`selectedYm`）驅動區塊一 / 二 / 四 與區塊三之**每日圖表 + 部門分佈 + 可行性**（`dialingVolume.selected`）；區塊三之 headline「本月 / 次月」對比固定為 `current_work_ym` / `target_work_ym`，**不受**選擇器影響（AC-9 末條）。兩者為獨立維度。 |
| BR-7 | **就緒燈號 vs 月跑狀態為不同維度**：`allReady`（名單是否都 ready）與 `monthlyRunStatus`（月跑執行狀態）為兩個獨立語意欄位，前端須清楚區分、不可混為一談（AC-6）。 |
| BR-8 | **月跑空狀態兩態（OQ-177-01 解法）**：`recentRun.emptyReason` = `'noRun'`（選定月份 `listRuns` 回空、`latestRunStatus=null`）或 `'noCompletedRun'`（有 run 但無 completed，`latestRunStatus ∈ {failed, running, pending}` 取最新一筆 run 之 status）。前端據此給差異化文案（AC-14）。 |
| BR-9 | **區塊獨立失敗（AC-15）**：聚合 service 對四來源之取數彼此獨立包裝；任一失敗 → 該區塊回 `{ error: true, errorCode, message }`、其餘正常、HTTP 整體 200。前端四區塊各自渲染 loading / empty / error，互不阻擋。失敗訊息為 zh-TW 使用者可讀文字、非技術堆疊，且**不得**靜默空白。 |
| BR-10 | **無寫入 API**：本頁前端與端點路徑不呼叫任何 create / update / delete 業務資料之 API；所有互動為路由導覽或既有頁面聚焦（AC-16）。 |
| BR-11 | **待辦清單不分頁（OQ-177-02 解法）**：`stageTodo.notReadyLists` 回傳**全部**未就緒名單（無 server 端分頁）+ `notReadyCount`；前端以固定 max-height 捲動呈現，`notReadyCount > 50` 時顯示前 50 筆 + 「查看全部 → 名單定義」連結（導向 M01）。 |
| BR-12 | **全域重新整理（OQ-177-03 解法）**：頁面提供單一「重新整理」動作，重新請求 `GET /assignment/overview?ym=<selectedYm>`（單一 cheap 呼叫、一次刷新四區塊）；此為 in-scope 功能。 |
| BR-13 | **sidebar 排序（AC-17）**：「客戶名單分派」群組 items 順序調整為：`分派總覽`(#1) → `篩選欄位`(#2) → `計分卡設定` → `名單定義` → `準備完成摘要` → `Stage 0 試算` → `觸發月名單分派` → `執行歷史`。群組 `requires` 維持 `director_or_section_chief`；`分派總覽` item `requires: 'director_or_section_chief'`。群組本身可點擊時導向 `/assignment/overview`。 |

## 7. UI/UX 需求

> UI ground truth 由 ui-ux-designer 產出 prototype（總覽頁）決議視覺；本節約束語意與結構、圖表資料綁定，不規範顏色 / 版位細節。前端以 TanStack Query 單一 query key `['assignment','overview', ym]` + axios `apiClient` 消費本端點；圖表採 recharts。

- **頁面骨架**：置於 `AssignmentWorkYmProvider` layout 內，共用「分派作業月份」狀態（預設下月 `target_work_ym`）。頂端：頁標題「分派總覽」+「分派作業月份」選擇器（AC-3）+「重新整理」按鈕（BR-12）+（處長）「轄區檢視」徽章（AC-2）。四大區塊由上而下排列。
- **區塊一 名單階段待辦**：五張階段 KPI 卡（草稿 / 部門比例 / 個別比例 / 待簽核 / 準備完成），數字綁 `stageTodo.stageCounts`；整卡可點導向 M01 Kanban 並聚焦該階段（AC-4）。下方「未完成名單待辦清單」綁 `stageTodo.notReadyLists`（LIST_NO / LIST_NM / 階段徽章），逐筆可點導向 Detail Drawer（AC-5）；`hasAnyList=false` → AC-4 空狀態；`notReadyLists=[]` → 「目前無未完成名單」正向提示。
- **區塊二 月名單分派就緒狀態**：就緒 / 未就緒燈號（`allReady`）+「readyCount / totalActiveLists」；月跑狀態徽章（`monthlyRunStatus`，`running` 時額外「執行中」提示）。ETL 前置檢查以 4 項（客戶名單池 / 在職名單 / 工作日曆 / 最低回收上限）+ 計分卡狀態呈現，未通過項警示樣式 + 簡短原因（AC-7）。`canNavigateToTrigger=true` 顯示「前往觸發月名單分派」連結（`/assignment/run`）；`false`（處長）不渲染任何觸發連結（AC-8）。
- **區塊三 預計撥打量**：
  - Headline：本月 / 次月總量並排卡（`headline.currentMonth` / `nextMonth`），`total=null` → 「—」+「本月尚無啟用名單」（AC-9）；處長 `scopedToDept=true` → 標示「（僅本部門）」（AC-12）。
  - 每日圖表：recharts bar/line，資料綁 `selected.days[]`（工作日 `orgTotal` 或 Σ`deptCells.cases`）；非工作日不計入 / 明確標示；hover 顯示當日件數（AC-10）。
  - 部門分佈：綁 `selected.deptDistribution[]`（部門名稱 + 件數 + 佔比；處長 `ratio=null` 不顯示組織佔比）。
  - 人均可行性：綁 `days[].deptCells[].perPerson` + `overThreshold`（`threshold`），超門檻紅色警示；`perPerson=null`（在職 0）→「—」+ 說明；`threshold=null` 不警示（AC-11）。
- **區塊四 最近一次月跑結果**：`hasCompletedRun=true` → 部門落差表（`deptSummary`：部門 / 設定比例 / 實際比例 / 落差，`alert` 警示）+ CARD_LEVEL 分布圖（`levelDistribution`）+ TIER 分布圖（`tierDistribution`）+「查看完整結果摘要」（帶 `runId`）/「查看執行歷史」連結（AC-13）；`hasCompletedRun=false` → 依 `emptyReason` / `latestRunStatus` 給差異化空狀態文案，不 fallback 其他月份（AC-14）。
- **跨區塊狀態（AC-15）**：每區塊三態（loading skeleton / empty 文案 / error 提示）視覺可區分；區塊 `{ error: true }` → 顯示 `message` + 重試（重試可整頁重新整理，BR-12），**不得**空白。
- **Sidebar（AC-17 / BR-13）**：「客戶名單分派」群組第 1 項「分派總覽」（route `/assignment/overview`，建議 icon 如 `LayoutDashboard`）；「篩選欄位」降為第 2 項；其餘既有項相對順序不變。App 路由於 assignment layout 下新增 `/assignment/overview`。

## 8. 依賴關係

- **Blocked By**：
  - US-070 / US-105 / US-130（M01 名單階段與 Kanban 資料基礎）；`AssignmentListService.listLists`（`stageCounts` + 名單列）
  - US-131（Detail Drawer，區塊一待辦清單點擊入口）
  - US-081 / F088 / F061（月名單分派前置條件與就緒狀態；`MonthlyRunReadinessService.calculateReadiness`）
  - US-166 / US-167 / US-168 / US-169 / [F049](F049-stage0-daily-estimate.md)（Stage 0 部門維度每日估算 + 可行性 + 處長 scope；`Stage0EstimateService.computeDeptEstimate`）
  - US-083 / US-085 / F063 / F064（結果摘要與執行歷史；`AssignmentRunService.listRuns` + `AssignmentRunReportService.getSummary`）
  - US-104 / US-137 / US-138 / US-140 / F097（作業月份判斷；`SystemService.getCurrentWorkYm` / `getDefaultTargetWorkYm`）
  - US-101（處長角色定義）/ `SectionChiefScopeService`
- **Blocks**：無

## 9. 交叉參照

- **權威角色矩陣**：[F002 E07 角色矩陣](F002-user-login.md#e07-角色矩陣)（本頁授權對齊 `DirectorOrSectionChiefGuard`，與 US-168 Stage 0 試算頁一致；F002 §4.6.2 Guard 對應表可加分派總覽列，交 spec-writer 後續維護）
- **來源服務（既有，本 spec 僅組合）**：
  - `apps/api/src/modules/assignment-list/assignment-list.service.ts`（`listLists`：`stageCounts` + 名單列 + section_chief 過濾）
  - `apps/api/src/modules/assignment/services/monthly-run-readiness.service.ts`（`calculateReadiness`：`ReadinessResult` / `EtlStatusMap`）
  - `apps/api/src/modules/assignment-list/stage0-estimate.service.ts`（`computeDeptEstimate`：`Stage0DeptEstimateResult`）
  - `apps/api/src/modules/assignment/services/assignment-run.service.ts`（`listRuns`：`RunSummary[]`）+ `assignment-run-report.service.ts`（`getSummary`：`SummaryResponse`，含 scoped deptSummary）
- **相關 feature spec**：[F049](F049-stage0-daily-estimate.md)（撥打量 §14~§18 契約）、[F088](F088-ready-stage-summary.md)（就緒狀態組裝 §5.0）、[F063 / F064](F064-export-23col.md)（月跑結果摘要 / scope）
- **NFR**：[NFR-005](../../non-functional/NFR-005-result-accuracy.md)（區塊四部門落差警示門檻）
- **錯誤處理**：[error-handling.md#assignment-role-errors](../error-handling.md#assignment-role-errors)（403 `E07_ROLE_NOT_ASSIGNED`）

### 9.1 錯誤處理審查（結論：無新 HTTP 錯誤碼）

| 情境 | 沿用碼 / 機制 | 說明 |
|---|---|---|
| 非授權角色（含 `user`）存取 | `E07_ROLE_NOT_ASSIGNED`（403） | `DirectorOrSectionChiefGuard` 既有；AC-1 |
| `ym` 格式錯誤 | `VALIDATION_ERROR`（400） | DTO `@Matches` 既有機制 |
| 單一來源服務失敗 | 區塊級 `{ error: true, errorCode, message }`（HTTP 200） | 非 HTTP 錯誤碼，為 response body 語意欄位（BR-9 / AC-15）；不新增 `error-handling.md` 條目 |
| 來源表空 / 未同步 | `runReadiness.etlStatus.*.status='missing'` / `rowCount=0` + `emptySourceTables` | 沿用 readiness 既有欄位（AC-7），非錯誤碼 |
| 選定月份無 completed 月跑 | `recentRun.hasCompletedRun=false` + `emptyReason` | 空狀態，非錯誤（AC-14） |

> 依 F049 v3.19 / F109 / F110 慣例，審查結論為「無新錯誤碼」時**不編輯** `error-handling.md`，僅於本節與 spec-index 橫幅記載。

## 10. 測試覆蓋目標

- 單元測試覆蓋率 ≥ 80%（沿用 DoD）。對應 US-177 TC-177-01 ~ TC-177-14：
  - 部長全公司四區塊（TC-177-01 / AC-1、4~13）
  - 處長僅見轄區（TC-177-02 / AC-2、12、13）：`scope.scoped=true`、部門列僅轄區、`orgTotal`/`gap`/`ratio`=null、`canNavigateToTrigger=false`
  - user 整頁封鎖（TC-177-03 / AC-1）：403 `E07_ROLE_NOT_ASSIGNED`
  - 切換月份四區塊連動（TC-177-04 / AC-3）：不同 `ym` 回不同 `selectedYm` 與四區塊資料
  - KPI 卡導向聚焦（TC-177-05 / AC-4，前端）
  - 待辦清單導向詳情（TC-177-06 / AC-5，前端）
  - ETL 未同步警示（TC-177-07 / AC-7）：`etlStatus.pooldata.status != 'completed'` 或 `rowCount=0` → 警示
  - 處長不顯示觸發連結（TC-177-08 / AC-8）：`canNavigateToTrigger=false`（處長）vs `true`（部長）
  - 次月無估算顯示「—」（TC-177-09 / AC-9）：`nextMonth.total=null`、`hasActiveLists=false`；本月正常數字
  - 超門檻紅色警示（TC-177-10 / AC-11）：`deptCells[].overThreshold=true`
  - 選定月份無 completed 月跑空狀態（TC-177-11 / AC-14）：僅 `failed` → `emptyReason='noCompletedRun'`、`latestRunStatus='failed'`；不 fallback
  - 單一區塊逾時不影響其他（TC-177-12 / AC-15 / BR-9）：模擬 `computeDeptEstimate` throw → `dialingVolume.error=true`、其餘三區塊正常、HTTP 200
  - 無寫入型操作入口（TC-177-13 / AC-16 / BR-10）：端點僅 GET；前端無 mutation
  - Sidebar 排序（TC-177-14 / AC-17）：分派總覽 #1、篩選欄位 #2
- **角色存取矩陣**：director / section_chief / admin → 200；user → 403（AC-1）。
- **empty ≠ zero 守門**（BR-4）：`hasActiveLists=false ⇒ total=null`（非 0）；`hasAnyList=false ⇒` 區塊一空狀態；`hasCompletedRun=false ⇒` 區塊四空狀態。
- **scope 安全邊界**（BR-3）：處長透傳 actor 後，`deptSummary` / `deptDistribution` / `departments` 僅含轄區；直接夾帶他部門參數不洩漏（沿用來源服務既有 scope 測試）。

## 11. 實作 Checklist

- [ ] 後端新增 `GET /api/v1/assignment/overview?ym=` controller（class 級 `DirectorOrSectionChiefGuard` + `@RequireDirectorOrSectionChief()`，純讀）
- [ ] 後端聚合 service：組合 `listLists` / `calculateReadiness` / `computeDeptEstimate`（selected + current + next，去重）/ `listRuns` + `getSummary` / `SystemService`（BR-2 / BR-5）
- [ ] 後端區塊獨立包裝（`Promise.allSettled` → 各區塊 `{error:false,...}` / `{error:true,...}`，BR-9）
- [ ] 後端 `hasActiveLists`（BR-4）/ `deptDistribution` 衍生彙總（§5.2.3）/ `canNavigateToTrigger`（AC-8）
- [ ] `@cdmp/shared` 定義 `AssignmentOverviewResponse` DTO（§5.2）
- [ ] 前端 `/assignment/overview` 頁面（`AssignmentWorkYmProvider` layout；TanStack Query `['assignment','overview',ym]`；recharts）
- [ ] 前端四區塊 loading / empty / error 三態（AC-15）+「重新整理」（BR-12）+ 待辦清單 50 筆上限 + 「查看全部」（BR-11）
- [ ] Sidebar 排序調整：分派總覽 #1 / 篩選欄位 #2（AC-17 / BR-13）+ App 路由新增 `/assignment/overview`
- [ ] 處長「轄區檢視」徽章 + 「（僅本部門）」標示（AC-2 / AC-12）
- [ ] （spec-writer 後續）spec-index 三件套登錄 F111 + F002 §4.6.2 加分派總覽列
- [ ] （architect）§12 OQ-F111-01~04 裁示

## 12. 假設與待架構師裁示（Open Questions）

### 12.1 已解決之 Story 開放問題（本 spec 裁定，下游遵循）

| Story OQ | 裁定 | 落點 |
|---|---|---|
| **OQ-177-01**（空月跑文案）| 兩態：`recentRun.emptyReason = 'noRun'`（無任何 run 紀錄，`latestRunStatus=null`）vs `'noCompletedRun'`（有 `failed`/`running`/`pending` 但無 `completed`，`latestRunStatus` 取最新 run status）。前端據此差異化文案（AC-14）。 | BR-8 / §5.2.4 |
| **OQ-177-02**（待辦清單筆數）| 回傳**全部**未就緒名單（無 server 分頁）+ `notReadyCount`；前端固定 max-height 捲動，`> 50` 顯示前 50 筆 + 「查看全部 → 名單定義」連結。 | BR-11 / §5.2.1 |
| **OQ-177-03**（全域重新整理）| 提供單一「重新整理」動作，重新請求本端點一次刷新四區塊（cheap、in-scope）。 | BR-12 / §7 |

### 12.2 假設

| # | 假設 | 標記 |
|---|---|---|
| A-1 | 四大區塊來源服務（`listLists` / `calculateReadiness` / `computeDeptEstimate` / `listRuns` + `getSummary` / `SystemService`）**均已存在並回傳本 spec 引用之欄位**（已對 real code 查證：`ReadinessResult` / `Stage0DeptEstimateResult` / `SummaryResponse` / `RunSummary` / `stageCounts` 欄位名逐一比對）。 | [RESOLVED] 已查證 |
| A-2 | `SystemService.getDefaultTargetWorkYm()` = `current_work_ym + 1`（比照 F097 / US-138 預設）；`headline.nextMonth.ym = targetWorkYm`。 | [ASSUMPTION] 待 architect 確認方法名/語意 |
| A-3 | 區塊三 headline 需對 current / next / selected 最多 3 次 `computeDeptEstimate`；因其為 in-memory 部門投影（建於 F088 物化 `estimateCases` 之上），成本可接受；`selectedYm===currentWorkYm` 時去重。若實測有效能疑慮，交 architect 以快取 / 併行處理。 | [ASSUMPTION] 效能歸 NFR |

### 12.3 Open Questions（交 system-architect）

| ID | 問題 | spec-writer 建議預設 |
|----|------|---------------------|
| OQ-F111-01 | `MonthTotal.hasActiveLists` 之精確推導：由 `computeDeptEstimate` 內部暴露 active-list 存在旗標，或聚合 service 另做輕量 `COUNT(ob_list_definition WHERE status='active' AND project_workym=:ym [AND scope])`？ | 建議由 `computeDeptEstimate` 暴露 active-list 存在旗標（避免額外查詢、天然套用 scope）；否則輕量 COUNT（走既有 repo）。 |
| OQ-F111-02 | 聚合 service 對四來源之呼叫策略（`Promise.allSettled` 併行 vs 序列）與 headline 3 次 `computeDeptEstimate` 去重機制之落點。 | 建議 `Promise.allSettled` 併行 + `selectedYm===currentWorkYm` 時共用結果；service 落於 `assignment` 模組新 `AssignmentOverviewService`。 |
| OQ-F111-03 | 區塊二 `calculateReadiness(ym)` 目前**不吃 actor**；處長視角下就緒 / ETL / 計分卡是否需 scope 限縮？ | 建議維持全月 / 全域視角（名單就緒為全月營運狀態、ETL / 計分卡為全域，與轄區無關）；處長區塊二 `notReadyLists` 若需限縮轄區，另由 architect 決定是否為 `calculateReadiness` 補 actor 參數（非本 spec 硬性要求）。 |
| OQ-F111-04 | 端點是否掛 `FeatureFlagGuard`（`ENABLE_E07_REFACTOR_PHASE3`）與是否納入 `architecture-spec.md` AD 編號。 | 建議與既有 E07 唯讀端點（如 Stage 0 試算）之 flag 掛載一致；AD 編號由 architect 視需要指派。 |

## 13. 變更紀錄

| 版本 | 日期 | 變更內容 |
|---|---|---|
| v1.0 | 2026-07-12 | 初版（US-177）：新增「分派總覽」唯讀首頁 + 單一薄型聚合端點 `GET /api/v1/assignment/overview?ym=`（組合 `listLists` / `calculateReadiness` / `computeDeptEstimate` / `listRuns`+`getSummary` / `SystemService`，不新增重查詢）。定義 `AssignmentOverviewResponse` DTO（4 區塊判別聯集 + scope 回顯 + 本月/次月 headline）；區塊獨立失敗（HTTP 200 + 區塊 `{error:true}`，BR-9 / AC-15）；empty≠zero（BR-4）；處長 scope 透傳為安全邊界（BR-3）。授權 `DirectorOrSectionChiefGuard`（比照 US-168），user → 403 `E07_ROLE_NOT_ASSIGNED`。Sidebar 分派總覽 #1 / 篩選欄位 #2（AC-17）。Story OQ-177-01/02/03 已裁定（BR-8 兩態空狀態 / BR-11 全回不分頁前端 50 筆上限 / BR-12 全域重新整理 in-scope）。4 個架構 OQ（OQ-F111-01~04）交 system-architect。無新 HTTP 錯誤碼（§9.1）。 |
