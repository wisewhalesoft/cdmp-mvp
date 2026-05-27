---
spec-id: F097
title: 客戶名單分派「作業月」語意統一（target_work_ym 分離 + 過去月 guard + 去重視窗對齊）
feature-id: F097
source-story: US-137, US-138, US-139, US-140, US-141, US-142, US-143
epic: E07
module: M04 分派執行（跨 M01 / M04 作業月語意統一）
priority: P0-MVP
version: "1.0"
date: 2026-05-27
status: Draft
---

# F097: 客戶名單分派「作業月」語意統一

Priority: P0-MVP | Status: Draft | Last Updated: 2026-05-27

> ⚠️ **PRODUCTION 行為變更警告（必讀）**：本 feature 修正月跑觸發所寫入之 `AssignmentRun.project_workym` 語意（由「執行月」改為使用者選定之「目標分派月」），並補入 ground-truth SP 之過去月 guard。**`POST /api/v1/assignment/runs` 為 breaking change**（`workYm` 由「後端自算、忽略 body」改為「必填、缺省回錯」）。deploy 後既有歷史 run 之 `project_workym` 採 **forward-only 不回填**（語意混雜，見 §6 BR-9）。
>
> **v1.0（2026-05-27 / F097 作業月語意統一，P1+P2+P3 合併一次到位）**：依 [proposals/work-ym-semantics-unification.md §0](../proposals/work-ym-semantics-unification.md)（已拍板）與 US-137~US-143 落地：
> 1. **概念分離**：`current_work_ym`（系統錨點月，`new Date()`）與 `target_work_ym`（作業月 / 目標分派月，預設 `current_work_ym + 1`）分離（§4 BR-1）。
> 2. **前端共享狀態**：四頁（名單定義 / 準備完成摘要 / Stage 0 試算 / 月跑觸發）共享 `AssignmentWorkYmContext`，預設下月（§5.1 / US-137）。
> 3. **POST /runs 接受 workYm（必填）+ 過去月 guard**（§5.2 / US-138 / US-139）。
> 4. **後端 `computeCurrentWorkYm()` 收斂至 `SystemService`** + 新增 `getDefaultTargetWorkYm()`（§5.3 / US-140）。
> 5. **下游結果頁讀 `run.project_workym`，不加 MonthPicker**（§5.4 / US-141）。
> 6. **Stage 1 去重視窗靠正確 `workdt` 自動對齊，不改 `computeDedupWindow`**（§5.5 / US-142）。
>
> **刻意未動（邊界）**：
> - **不變更 `architecture-spec.md`**（AD 由 system-architect 維護）。
> - **F077 spec 已由 spec-writer 同步至 v1.4**（US-143 / OQ-F097-02 採行；限定範圍：預設月改下月 + `AssignmentWorkYmContext` 說明 + BR-7 C-4 修正）；**未動 F077 §5.2 ym error code**（既有 400→422 技術債，OQ-F097-01 方案 A 不清此塊，僅加 note）。詳 §10。
> - **不變更 F091 `computeDedupWindow` 邏輯**（§5.5 / US-142 AC-2，可用 git diff 驗證無變更）。
> - **不撰寫 code / test**（由 tdd-implementation 落地）。
> - **不變更 `data-model.md`**：DB 欄位 `assignment_run.project_workym` 不改名（[glossary §3](../glossary.md)），無新增欄位、無 migration。

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + [glossary.md](../glossary.md)（**命名單一權威**）+ `reference/SP/SP_INFOT_ASSIGNEXPORTNAMELIST_st1_list.sql`（L24-34 guard ground truth，**UTF-16LE 解碼驗證**）+ [F091 v2.0](F091-stage1-complete-month-cnt-dedup-special-delete.md)（`computeDedupWindow`）+ `apps/api/src/modules/system/system.service.ts`（`getCurrentWorkYm` 既有） |
| QA / Tester | 本文件（§4 AC + §5.6 錯誤碼三分支 + §7 錯誤場景）+ [error-handling.md#assignment-run-errors](../error-handling.md#assignment-run-errors)（`RUN_WORKYM_PAST` 422）+ [error-handling.md#assignment-list-errors](../error-handling.md#assignment-list-errors)（`WORK_YM_INVALID_FORMAT` 422 沿用） |
| UI/UX Designer | 本文件 §5.1 / §5.4 + [glossary.md](../glossary.md)（UI 標籤「分派作業月份」）+ `/prototypes`（觸發頁 / 四頁 MonthPicker） |
| Architect | 本文件 + [proposals/work-ym-semantics-unification.md](../proposals/work-ym-semantics-unification.md) |

---

## 1. 功能摘要

統一客戶名單分派模組中「作業月」之語意，消除「執行當下的日曆月」與「名單要派去作業的那個月」兩種意義混用所造成的 live 不一致（5 月選 6 月預覽卻跑 5 月）。核心做法為分離兩個概念並建立單一真實來源：

- **`current_work_ym`（系統錨點月）**：真實日曆當月（`new Date()`），由後端 `SystemService.getCurrentWorkYm()` 計算，全系統唯一合法呼叫 `new Date()` 之處；用途為判定歷史/未來/唯讀（F077 BR-3）、月份範圍 ± 12（F077 BR-2）、衍生預設作業月。
- **`target_work_ym`（作業月 / 目標分派月）**：使用者正在作業的目標月份（YYYYMM），預設 = `current_work_ym + 1`（下月）。涵蓋四頁，由前端 `AssignmentWorkYmContext` 共享；月跑觸發時寫入 `AssignmentRun.project_workym`。

下游結果頁（進度 / 摘要 / 快照 / 比對）不加 MonthPicker，月份單一真實來源 = 該筆 `run.project_workym`。Stage 1 去重視窗靠傳入正確 `workdt`（= `project_workym + '01'`）自動對齊 ground-truth SP 語意。

## 2. 使用者故事

**As a** 業務部長（Director）/ 處長（Section Chief）
**I want** 在分派工作流四頁共享同一「分派作業月份」（預設下月），且月跑觸發確實以我選定的月份執行、拒絕對過去月觸發
**So that** 5 月下旬為 6 月準備名單後按下「啟動月跑」跑的是 6 月名單，名單定義 / 估算 / 觸發 / 去重全程針對同一目標月，與原系統 SP `@WORKDT >= getdate()` 行為一致

## 3. 前置條件

- `GET /api/v1/system/current-work-ym` 端點已存在（[F077 §5.1](F077-month-switch-and-stage-overview.md)）。
- `SystemService.getCurrentWorkYm()` 已存在且為 `@Injectable()`（[glossary §1](../glossary.md)）。
- [F091 v2.0](F091-stage1-complete-month-cnt-dedup-special-delete.md) 之 `computeDedupWindow(workdt, poolDataListRepo)` 已實作。
- 既有 `AssignmentRun.project_workym` 欄位可用（語意正確，僅預設值來源錯誤，見 [glossary §3](../glossary.md)）。
- 既有四頁路由與 `assignment` 區段 layout 元件可掛載 Context Provider。

## 4. 驗收標準

> AC 編號對應來源 story。逐條以 [glossary.md](../glossary.md) 命名為準；guard 行為以 `reference/SP/SP_INFOT_ASSIGNEXPORTNAMELIST_st1_list.sql` L24-34 為 ground truth。

### AC-1：前端共享狀態預設為下月（US-137 AC-1 / AC-7）

- **Given** 使用者首次進入 assignment 四頁任一頁
- **When** `AssignmentWorkYmProvider` 初始化並呼叫 `GET /api/v1/system/current-work-ym`
- **Then** 取得 `currentWorkYm`（YYYYMM）後，`target_work_ym` 預設 = `currentWorkYm + 1`
- **And** 跨年邊界：`currentWorkYm = '202512'` → `target_work_ym = '202601'`（非 `'202513'`）
- **And** 四頁均以此 `target_work_ym` 作為月份篩選預設值

### AC-2：一處切換四頁同步（US-137 AC-2）

- **Given** 使用者於四頁任一頁 MonthPicker 選擇新月份（在 `current_work_ym ± 12` 合法範圍內，對齊 [F077 BR-2](F077-month-switch-and-stage-overview.md)）
- **When** 選擇完成
- **Then** 共享 Context 之 `target_work_ym` 更新
- **And** 其他三頁下次渲染 / 下次 fetch 使用更新後之 `target_work_ym`

### AC-3：`run-history` 頁不共享 Context（US-137 AC-4 / US-141 AC-5）

- **Given** 使用者於月跑歷史頁（F065）操作 MonthPicker
- **When** 選擇任意月份
- **Then** 歷史頁月份選取**不影響**共享 `target_work_ym`；反之共享狀態變更不影響歷史頁查詢月份

### AC-4：UI 標籤統一「分派作業月份」，無新增 sidebar 路由（US-137 AC-5 / AC-6 / US-138 AC-1）

- **Given** 四頁與觸發頁之 MonthPicker
- **When** 頁面渲染
- **Then** label / placeholder 一律顯示「分派作業月份」（對齊 [glossary §2](../glossary.md)）
- **And** 不出現「作業年月」、「當月」、「本月」等舊標籤字串
- **And** F097 不新增任何 E07 sidebar 路由（所有變更為既有頁面行為調整）

### AC-5：觸發頁 readiness check 使用選定月（US-138 AC-2 / AC-3）

- **Given** 部長於觸發頁選定 `target_work_ym = '202606'`
- **When** 頁面自動查詢 `GET /api/v1/assignment/runs/readiness`
- **Then** query 帶 `?ym=202606`（選定月），而非 `new Date()` 算出之當月
- **And** 移除原 `function currentWorkYm() { const now = new Date(); ... }` helper

### AC-6：觸發 API 攜帶選定月（breaking change，US-138 AC-4 / AC-5）

- **Given** 部長點擊「啟動月跑」並於 confirm modal 確認
- **When** 前端呼叫 `POST /api/v1/assignment/runs`
- **Then** request body 包含 `{ workYm: '202606' }`（選定月，YYYYMM）
- **And** `triggerRun()` API client 函式簽名改為 `triggerRun(workYm: string): Promise<TriggerRunResponse>`
- **And** confirm modal 標題顯示「確認觸發 2026-06 月跑？」（格式化自 `target_work_ym`，不顯示 `new Date()` 月份）

### AC-7：處長於觸發頁 MonthPicker 唯讀（US-138 AC-6）

- **Given** 使用者 `businessRole = 'section_chief'` 進入觸發頁
- **When** 頁面顯示
- **Then** MonthPicker 呈現唯讀（disabled），顯示共享 `target_work_ym` 作為參考；處長唯讀 banner 維持現有行為

### AC-8：`TriggerRunDto` 新增必填 `workYm`，後端使用其值（US-139 AC-1）

- **Given** `POST /api/v1/assignment/runs`，body 含 `{ workYm: '202606' }`
- **When** 通過驗證
- **Then** 後端使用此 `workYm` 作為 `AssignmentRun.project_workym`，**不呼叫 `new Date()`**
- **And** `AssignmentRunController.computeCurrentWorkYm()` static method 在此 handler 不再被呼叫

### AC-9：`workYm` 格式驗證（US-139 AC-2 / OQ-F097-01 分支 (2) / OQ-F097-03）

- **Given** body **已帶** `workYm` 但格式錯誤（例：`'20266'`（非 6 碼）、`'202613'`（MM=13）、`'abcdef'`）
- **When** 請求到達後端 ValidationPipe
- **Then** 回 **422 `WORK_YM_INVALID_FORMAT`**（沿用既有碼，§5.6 分支 (2)）
- **And** 月份合法性要求 `MM ∈ 01~12`，以嚴格 regex `^\d{4}(0[1-9]|1[0-2])$`（或等效 DTO / guard 兜底）攔截；`'202613'` 於格式層即被拒，不依賴過去月 guard

### AC-10：`workYm` 必填，無 fallback（breaking change，方案 A，US-139 AC-3 / OQ-F097-01 分支 (1)）

- **Given** body **未帶** `workYm`（如空 body `{}` 或 `workYm: null`）
- **When** 請求到達後端 ValidationPipe
- **Then** 回 **400**（缺少必要欄位，通用驗證錯誤，§5.6 分支 (1)；對齊 error-handling.md「400 = 缺少必要欄位」慣例）
- **And** 後端**不提供任何 `new Date()` fallback**（刻意之 breaking change；前端 AC-6 必須同步傳值）

### AC-11：過去月 guard（對應 SP `@WORKDT < getdate()`，US-139 AC-4）

- **Given** body `{ workYm: '202504' }`（假設今天 2026-05-27，目標月 1 號 = 2025-04-01 < 今天）
- **When** 通過格式驗證後進行業務邏輯檢查
- **Then** 回 422，錯誤碼 `RUN_WORKYM_PAST`（§5.6 分支 (3)）
- **And** response `message` 表達「不可對已開始或過去的作業月觸發月跑」（或等效說明）

### AC-12：當月 1 號為邊界，當天可觸發（`>=` 語意，US-139 AC-5）

- **Given** 今天（server 時鐘）為 2026-06-01，body `{ workYm: '202606' }`
- **When** guard 計算 `workdt = 2026-06-01`，比對今天
- **Then** guard 通過（`workdt >= today`，邊界當天合法），繼續後續 readiness check 與 run 建立

### AC-13：未來月份正常通過 guard（US-139 AC-6）

- **Given** body `{ workYm: '202607' }`（目標月 1 號 > 今天）
- **When** guard 執行
- **Then** guard 通過，繼續後續流程

### AC-14：`project_workym` 寫入選定月（end-to-end，US-138 AC-7 / US-139 AC-7）

- **Given** guard 通過，body `{ workYm: '202606' }`
- **When** `AssignmentRunService.triggerRun()` 建立 run 記錄
- **Then** `assignment_run.project_workym = '202606'`（目標月，**非執行當下月份**）
- **And** 回傳之 `TriggerRunResponse.ym = '202606'`

### AC-15：`computeCurrentWorkYm()` 收斂至 `SystemService`（US-140 AC-1 / AC-2 / AC-6）

- **Given** `assignment-list.controller.ts` / `stage0-estimate.controller.ts` / `assignment-run.controller.ts` 各有 `computeCurrentWorkYm()` static method
- **When** F097 完成
- **Then** 上述三個 static method 完全移除，各 controller 改注入 `SystemService` 並呼叫 `this.systemService.getCurrentWorkYm()`
- **And** `assignment-stage` 下 `dept-ratio.controller` / `personnel-ratio.controller` / `stage-action.controller` 等呼叫方同步改呼叫 `SystemService.getCurrentWorkYm()`，行為不變
- **And** 既有 service 層（`assertYmInRange` / `assertNotHistorical` 等）邏輯不需改動，僅改 controller 取值來源

### AC-16：`SystemService.getDefaultTargetWorkYm()` 新增（US-140 AC-3 / AC-4 / AC-5）

- **Given** `SystemService` 現有 `getCurrentWorkYm(now?: Date): string`
- **When** 呼叫 `SystemService.getDefaultTargetWorkYm(now?: Date): string`
- **Then** 回傳 `getCurrentWorkYm(now)` 加一個月之 YYYYMM
- **And** 跨年邊界：`getCurrentWorkYm()` 回 `'202512'` → `getDefaultTargetWorkYm()` 回 `'202601'`
- **And** OVERRIDE：`OVERRIDE_CURRENT_WORK_YM = '202506'` → `getDefaultTargetWorkYm()` 回 `'202507'`

### AC-17：下游結果頁月份來自 `run.project_workym`，無 MonthPicker（US-141 AC-1 / AC-2 / AC-3）

- **Given** 使用者進入月跑進度頁（F062）/ 結果摘要頁（F063）/ 快照詳情頁（F066）/ 比對差異頁（F067）
- **When** 頁面載入並呼叫 `GET /api/v1/assignment/runs/:runId`
- **Then** 月份資訊取自 response 之 `project_workym`，**非**共享 `target_work_ym` Context
- **And** 此四頁**不出現** MonthPicker；月份以靜態標籤顯示（前置文字「分派作業月份」，格式如「2026年06月」或「2026-06」，依各頁現有設計）
- **And** 即使使用者在其他頁切換共享 `target_work_ym`，此四頁顯示月份不受影響

### AC-18：forward-only — 歷史 run 之 `project_workym` 不回填（US-141 AC-4）

- **Given** F097 部署前已存在之歷史 run，其 `project_workym` 為「執行月」語意
- **When** 使用者查看其結果頁
- **Then** 系統顯示既有 `project_workym` 值，**不進行任何資料回填或修正**
- **And** forward-only 策略以**程式碼注釋或 CHANGELOG** 記載（`AssignmentRunService.triggerRun` 附近），標注生效日期 = F097 部署日；**不呈現給一般使用者**（[glossary §7](../glossary.md)）

### AC-19：Stage 1 去重視窗 `workdt` 使用 `project_workym + '01'`（US-142 AC-1 / AC-3）

- **Given** `AssignmentRun.project_workym = '202606'`（由 AC-8/14 正確寫入目標月）
- **When** 後端執行 Stage 1 去重（`executeStage1Chain` / `computeDedupWindow` 路徑）
- **Then** `workdt = new Date('2026-06-01')`（目標月 1 號）
- **And** 去重視窗 = `[2026-03-01, MIN(MAX(ob_pool_data_list.assignday), 2026-05-31)]`，上界語意 = 「作業月上月底（2026-05-31）」
- **And**（regression）F097 前 `project_workym = '202605'` → 上界 `2026-04-30`；F097 後 `'202606'` → 上界 `2026-05-31`，整體後移一個月

### AC-20：`computeDedupWindow` 函式本身不修改（US-142 AC-2）

- **Given** [F091 v2.0](F091-stage1-complete-month-cnt-dedup-special-delete.md) 之 `computeDedupWindow(workdt, poolDataListRepo)`
- **When** F097 完成
- **Then** 該函式簽名與內部邏輯**無任何程式碼變更**（可用 git diff 驗證）；語意對齊完全依靠傳入正確 `workdt`

### AC-21：ETL 切點近似落差文件化（US-142 AC-4）

- **Given** ETL 載入 `ob_pool_data_list` 上界仍為「真實日曆本月 1 號」（與目標月無關，以執行時月份為基準）
- **When** 5 月下旬跑 6 月月跑
- **Then** 系統接受此近似：`MAX(assignday)` 可能不含作業月上月之最後幾天，`MIN()` 以 `workdt − 1 日` 兜底
- **And** 此已接受之近似於 `computeDedupWindow` 附近以程式碼注釋標記（對應 [F091 OQ-STAGE1-02](F091-stage1-complete-month-cnt-dedup-special-delete.md)，本輪不修正）

## 5. API 規格 / 資料契約

### 5.1 前端共享狀態：`AssignmentWorkYmContext`（US-137）

| 項目 | 內容 |
|---|---|
| 實作 | React Context（`AssignmentWorkYmContext`），Provider（`AssignmentWorkYmProvider`）掛載於 assignment 區段 layout（**不使用 Zustand / Redux / URL query param**，[glossary §8](../glossary.md)）|
| 涵蓋頁面 | 名單定義（F048/F077）/ 準備完成摘要（F088）/ Stage 0 試算（F049）/ 月跑觸發（F061）|
| 不涵蓋頁面 | 月跑歷史（F065，獨立 local state）；下游結果頁（F062/F063/F066/F067，讀 `run.project_workym`，不加 MonthPicker）|
| Context 提供值 | `currentWorkYm`（系統錨點月）、`targetWorkYm`（作業月，預設下月）、`setTargetWorkYm`（setter）|
| 初始化流程 | Provider 掛載時呼叫一次 `GET /api/v1/system/current-work-ym` → 取得 `currentWorkYm` → 計算 `targetWorkYm = currentWorkYm + 1` → 存入 Context |
| testid（E2E）| 觸發頁 MonthPicker 新增 `data-testid="trigger-run-month-picker"`；既有 `btn-start-run` / `confirm-trigger-modal` 保留 |

### 5.2 POST /api/v1/assignment/runs（DTO 變更 + guard）（US-138 / US-139）

| 用途 | 觸發月跑（以選定之目標分派月為對象）|
|---|---|
| 認證 | JWT 必填 |
| 權限 | 既有月跑觸發權限（部長；處長唯讀）— 本 feature 不變更 Guard |

**Request body — `TriggerRunDto`（變更）**

```json
{
  "workYm": "202606"
}
```

| 欄位 | 型別 | 必填 | 驗證 | 變更 |
|---|---|---|---|---|
| `workYm` | string | **是（方案 A，無 fallback）** | `@IsNotEmpty()` + `@Matches(/^\d{6}$/)`（YYYYMM）；月份合法性驗證歸屬見 §11 OQ-F097-03 | **新增欄位**（F097 前 body 被忽略，後端自算 `new Date()`）|

**業務邏輯順序（建議，US-139 技術備註）**：

1. ValidationPipe 驗 `workYm` 必填 + 格式（AC-9 / AC-10）。
2. 過去月 guard（AC-11 / AC-12 / AC-13）：`now = SystemService.getCurrentWorkYm()` 為基準計算 server 當下日期；`workdt = workYm 的 1 號`；若 `workdt < today` → 422 `RUN_WORKYM_PAST`（`>=` 邊界當天合法）。
3. 既有 `assertNoRunningRun(workYm)`（同月運行中 → 409 `ASSIGNMENT_RUN_ALREADY_RUNNING`，沿用）。
4. 既有 readiness / precheck（`ASSIGNMENT_RUN_PRECHECK_FAILED`，沿用）。
5. 建立 run，`project_workym = workYm`（AC-14）。

**Response — 既有 `TriggerRunResponse`**：`ym` 欄位回傳 `workYm`（選定月）。

> ⚠️ **過去月 guard ground truth**：`reference/SP/SP_INFOT_ASSIGNEXPORTNAMELIST_st1_list.sql` L25/L31（UTF-16LE 解碼驗證）：`@WORKDT = PROJECT_WORKYM + '01'`，`IF ... or @WORKDT < getdate() BEGIN RETURN END`。後端以 `>=` 等價移植（`workdt >= today` 通過）。

### 5.3 SystemService 收斂（US-140）

| 方法 | 簽名 | 說明 |
|---|---|---|
| `getCurrentWorkYm` | `getCurrentWorkYm(now?: Date): string` | **既有**，唯一合法 `new Date()` 之處；含 `OVERRIDE_CURRENT_WORK_YM` 支援 |
| `getDefaultTargetWorkYm` | `getDefaultTargetWorkYm(now?: Date): string` | **新增**，回 `getCurrentWorkYm(now)` + 1 月（跨年正確 + OVERRIDE 套用）|

- 移除三個 controller static `computeCurrentWorkYm()`（`assignment-list` / `stage0-estimate` / `assignment-run`），改注入 `SystemService`。
- `assignment-stage` 下各 controller 呼叫方同步更新。
- 純 refactor，業務行為不變（AC-15）。

### 5.4 下游結果頁月份來源（US-141）

- 四頁（F062 / F063 / F066 / F067）以 `runId` 為主鍵；月份來自 `GET /assignment/runs/:runId` response 之 `project_workym`（API 回傳欄位名 `projectWorkym`，camelCase，[glossary §3](../glossary.md)）。
- 不加 MonthPicker、不納入共享 Context（AC-17）。
- 若某頁有殘留本地月份 state，移除之。

### 5.5 Stage 1 去重視窗對齊（US-142）

- `executeStage1Chain` / `runStage1ForList` 取得之 `workdt = project_workym + '01'`；因 `project_workym` 已為目標月（AC-14），`computeDedupWindow` 既有 `MIN(MAX(assignday), workdt − 1 日)` 結構自動回到 SP 語意。
- **`computeDedupWindow` 函式不改**（AC-20）；ETL 切點近似落差文件化（AC-21）。

### 5.6 錯誤碼三分支（OQ-F097-01 / OQ-F097-03 已裁示 — 方案 A）

> **裁示結果（2026-05-27）**：`POST /runs` 之 `workYm` 驗證依下列三分支，與既有 `error-handling.md` 慣例對齊；**僅新增一個碼 `RUN_WORKYM_PAST`（422）**，格式錯誤沿用既有 `WORK_YM_INVALID_FORMAT`（422），缺省走通用 400。

| 分支 | 條件 | HTTP | 錯誤碼 | 登記狀態 |
|---|---|---|---|---|
| (1) 缺省 | body 未帶 `workYm`（如空 body `{}`） | **400** | 通用「缺少必要欄位」（NestJS ValidationPipe 預設，對齊 error-handling.md L25「400 = JSON 格式錯誤、缺少必要欄位」） | 沿用既有 400 慣例，不新增碼 |
| (2) 格式不正確 | `workYm` 已帶但非 6 碼，或 `MM ∉ 01~12`（如 `'20266'` / `'202613'` / `'abcdef'`） | **422** | `WORK_YM_INVALID_FORMAT`（**沿用既有**） | error-handling.md#assignment-list-errors 既有，擴充適用至 `POST /runs` body `workYm` |
| (3) 過去月 | `workYm` 合法但對應目標月 1 號 < 今天 | **422** | `RUN_WORKYM_PAST`（**新增**） | 本 feature 新增至 error-handling.md#assignment-run-errors |

> **格式驗證實作（OQ-F097-03 已決）**：`workYm` 月份合法性要求 `MM ∈ 01~12`。建議用嚴格 regex `@Matches(/^\d{4}(0[1-9]|1[0-2])$/)`（或等效 DTO / guard 兜底）；違反回 422 `WORK_YM_INVALID_FORMAT`。`'202613'`（MM=13）於此層即被攔截，不依賴過去月 guard 之 Invalid Date 行為。
>
> **缺省 vs 帶值之 status 差異說明**：缺省（`null` / 未帶欄位）= 缺必填 → 400；帶了值但格式錯 = 驗證失敗 → 422。二者刻意分流（對齊 error-handling.md 頂部「狀態碼」表慣例），前端 AC-6 必須明確傳值故正常流程不應觸發 (1)。

## 6. 業務規則

| 規則編號 | 說明 |
|---|---|
| BR-1 | **概念分離**：`current_work_ym`（系統錨點月，`new Date()`）≠ `target_work_ym`（作業月 / 目標分派月，預設 `current_work_ym + 1`）；前者唯一計算點 `SystemService.getCurrentWorkYm()`，後者前端 `AssignmentWorkYmContext` 共享（[glossary §1 / §2](../glossary.md)）|
| BR-2 | **預設下月**：`target_work_ym` 預設 = `current_work_ym + 1`，跨年邊界正確（12 月 → 次年 1 月）|
| BR-3 | **共享狀態 = React Context**：涵蓋四頁；`run-history` 與下游結果頁排除（[glossary §8](../glossary.md)）|
| BR-4 | **`workYm` 必填、無 fallback（方案 A）**：`POST /runs` 不提供任何 `new Date()` 預設，前端必須明確傳入（刻意 breaking change，已拍板）|
| BR-5 | **過去月 guard 使用 `>=`**：`workdt >= today` 即當月 1 號當天可觸發（SP `@WORKDT < getdate()` 邏輯等價）|
| BR-6 | **guard 以 server 時鐘為準**：比對基準為後端當下時間（`SystemService.getCurrentWorkYm()` 計算），不依賴前端時鐘 |
| BR-7 | **`current_work_ym` 計算單一來源**：收斂至 `SystemService`，三個 controller static copy 移除（[glossary §1 / 舊術語對照](../glossary.md)）|
| BR-8 | **下游結果頁單一真實來源 = `run.project_workym`**：不加 MonthPicker、不讀共享 Context |
| BR-9 | **forward-only 不回填**：F097 部署後既有歷史 run 之 `project_workym`（執行月語意）保留現狀，僅以注釋 / CHANGELOG 標注；不回填（回填無可靠反推方式，業務接受語意混雜，[glossary §7](../glossary.md)）|
| BR-10 | **去重視窗靠正確 `workdt` 自動對齊**：`computeDedupWindow` 邏輯不改；上界語意正名為「作業月上月底」；ETL 切點近似維持（[glossary §6](../glossary.md) / [F091 BR-2](F091-stage1-complete-month-cnt-dedup-special-delete.md)）|
| BR-11 | **`current_work_ym ± 12` 範圍與預設 +1 相容**：`target_work_ym` 預設值落於合法範圍，無需特殊處理（[F077 BR-2](F077-month-switch-and-stage-overview.md)）|
| BR-12 | **DB 欄位 `project_workym` 不改名**：語意本就正確，避免 migration 風險（[glossary §3](../glossary.md)）|

## 7. 錯誤場景

| 場景 | 系統回應 | 參考 |
|---|---|---|
| `POST /runs` 缺 `workYm`（未帶 / null）| **400** 缺少必要欄位（通用驗證錯誤）；無 `new Date()` fallback（BR-4）| §5.6 分支 (1) / AC-10 |
| `workYm` 帶值但格式非 YYYYMM 或 MM ∉ 01~12 | **422 `WORK_YM_INVALID_FORMAT`**（沿用既有碼）| §5.6 分支 (2) / AC-9 |
| `workYm` 對應目標月 < 今天 | **422 `RUN_WORKYM_PAST`**（新增碼）；message 表達「不可對已開始或過去的作業月觸發月跑」| §5.6 分支 (3) / AC-11 |
| `workYm` 超出 `current_work_ym ± 12` | 沿用既有 `WORK_YM_OUT_OF_RANGE`（422）— 本 feature 不新增（[F077 BR-2](F077-month-switch-and-stage-overview.md)）；guard 順序與 range 檢查之先後待 tdd 依既有 pipeline 實作 | error-handling.md#assignment-list-errors |
| 同月已有運行中 run | 沿用既有 `ASSIGNMENT_RUN_ALREADY_RUNNING`（409）| error-handling.md#assignment-run-errors |
| 月跑前置條件未滿足 | 沿用既有 `ASSIGNMENT_RUN_PRECHECK_FAILED`（422）| error-handling.md#assignment-run-errors |
| 歷史 run 之 `project_workym` 為執行月語意 | forward-only：顯示既有值不回填，注釋標注（BR-9）| AC-18 |
| ETL 尚未補入作業月上月最末派案 | 去重近似：`MIN()` 以 `workdt − 1 日` 兜底（已接受，[F091 OQ-STAGE1-02](F091-stage1-complete-month-cnt-dedup-special-delete.md)）| AC-21 |

## 8. 相依性

- **Blocked By**：
  - `GET /api/v1/system/current-work-ym`（[F077](F077-month-switch-and-stage-overview.md)，已存在）
  - [F091 v2.0](F091-stage1-complete-month-cnt-dedup-special-delete.md)（`computeDedupWindow` 已存在）
- **Story 內部順序**（US 依賴）：
  - US-140（SystemService 收斂）→ US-139（guard 用 `getCurrentWorkYm()` 取 now）
  - US-137（共享 Context）→ US-138（觸發頁讀 Context）
  - US-139 + US-138 → US-141（`project_workym` 正確後下游語意才成立）
  - US-139 + US-138 → US-142（`workdt` 正確後去重才對齊）
  - US-137~US-142 → US-143（功能完成後才更新 F077 spec 描述）
- **Blocks**：無（本 feature 為現有工作流之語意修正）
- **跨 spec 影響**：F077（US-143 升 v1.4，**本 feature 不改，見 §10 / §11 OQ-F097-02**）；`error-handling.md`（新增錯誤碼，**待 §11 OQ-F097-01 裁示後登記**）

## 9. 交叉參照

- **命名權威**：[glossary.md](../glossary.md)（`current_work_ym` / `target_work_ym` / `project_workym` / `workdt` / 過去月 guard / 去重視窗 / forward-only / 共享月份狀態）
- **設計提案**：[proposals/work-ym-semantics-unification.md](../proposals/work-ym-semantics-unification.md) §0（拍板）/ §4（概念分離）/ §5（D1~D7）/ §7（R1~R5）
- **來源 story**：[US-137](../../stories/epics/E07-app-customer-list-assignment/US-137-M04-shared-target-work-ym-state.md) ~ [US-143](../../stories/epics/E07-app-customer-list-assignment/US-143-M01-f077-default-month-rename.md)
- **ground truth SP**：`reference/SP/SP_INFOT_ASSIGNEXPORTNAMELIST_st1_list.sql`（L24-34 guard，**UTF-16LE 解碼驗證**）
- **既有 spec**：[F077](F077-month-switch-and-stage-overview.md)（`current_work_ym` / 月份範圍）、[F091 v2.0](F091-stage1-complete-month-cnt-dedup-special-delete.md)（`computeDedupWindow`）、[F090 v2.0](F090-obpooldata-list-etl.md)（`ob_pool_data_list` 單源化）、[F061](F061-trigger-assignment-run.md)（月跑觸發）、[F049](F049-stage0-daily-estimate.md)、[F088](F088-ready-stage-summary.md)、[F065](F065-run-history.md)、F062 / F063 / F066 / F067（下游結果頁）
- **錯誤處理**：[error-handling.md#assignment-run-errors](../error-handling.md#assignment-run-errors)（新增 `RUN_WORKYM_PAST` 422，已登記）

## 10. 跨 spec 影響註記

> 本 feature 嚴格職責邊界：只寫 F097。以下為對其他文件之影響與已落地之同步狀態。

- **F077（已升 v1.4）**：依 US-143 由 spec-writer 同步（限定範圍）：§7 + AC-1 / AC-3（預設月改 `target_work_ym` = `current_work_ym + 1`，涵蓋四頁 + `AssignmentWorkYmContext` 說明 + 月跑歷史頁獨立）、§1 摘要、AC-6、BR-7 C-4（殘留舊文字「`created_by = currentUserId` 過濾」改 `SectionChiefScopeService.getScopeDeptCode(userId)`，對齊 BR-4 v1.4）、§10 測試覆蓋目標、§13 變更紀錄、spec-index F077 版本/date。**刻意未動**：F077 §5.2 之 `INVALID_YM_FORMAT` / `INVALID_YM_RANGE`（400）既有技術債（OQ-F097-01 方案 A 不清此塊），僅於該處加 note 指向未來 cleanup。
- **error-handling.md（已更新）**：新增 `RUN_WORKYM_PAST`（422）至 `#assignment-run-errors`（OQ-F097-01 方案 A）；格式錯誤沿用既有 `WORK_YM_INVALID_FORMAT`（422，擴充適用至 `POST /runs` body `workYm`），缺省走通用 400；**未新增** `INVALID_YM_FORMAT`。
- **spec-index.md（已更新）**：F097 登記於 Features 表；F077 版本/date 同步至 v1.4。
- **F091 / F090 / data-model.md**：無變更（`computeDedupWindow` 不改、無新欄位、`project_workym` 不改名）。

## 11. 假設與開放問題（Open Questions）

> OQ-F097-01 / 02 / 03 已於 2026-05-27 由使用者裁示（見各列「裁示」欄）；僅 OQ-F097-04 維持 Open（Low，已接受近似）。

| OQ 編號 | 議題 | 證據 | 裁示（2026-05-27）| 狀態 |
|---|---|---|---|---|
| **OQ-F097-01** | **錯誤碼慣例衝突**：US-139 指定 `INVALID_YM_FORMAT`（400），但 `error-handling.md` 既有等價碼為 `WORK_YM_INVALID_FORMAT`（422），且頂部「狀態碼」表明定「欄位格式不正確」歸 422、400 僅限「JSON 格式錯誤 / 缺少必要欄位」。`RUN_WORKYM_PAST`（422）與既有慣例相容。| error-handling.md L25/L30/L251/L252；F077 L240-241；US-139 | **方案 A（採行）**：三分支（§5.6）— (1) 缺省 → 400 通用缺必填；(2) 帶值但格式錯 / MM 非 01~12 → 422 沿用 `WORK_YM_INVALID_FORMAT`；(3) 過去月 → 422 新增 `RUN_WORKYM_PAST`。**不新增 `INVALID_YM_FORMAT`**。error-handling.md 僅登記 `RUN_WORKYM_PAST` 一個新碼。 | **Resolved** |
| OQ-F097-02 | **F077 升版執行權責**：US-143 指派 spec-writer 升 F077 至 v1.4；本 agent 任務原指示「只在 F097 註記不改 F077」 | agent 任務 vs US-143 執行者欄 | **採行**：本 spec-writer 接續執行 US-143（限定範圍：預設月改下月 / 四頁 / UI 標籤「分派作業月份」/ 順修 BR-7 C-4 殘留舊文字）；**不動 F077 §5.2 ym error code**（400→422 既有技術債，使用者選 A 不清，僅加 note 指向未來 cleanup）。F077 已升至 v1.4。 | **Resolved** |
| OQ-F097-03 | **`workYm` 月份合法性驗證歸屬**：`@Matches(/^\d{6}$/)` 只驗 6 位數字，不擋 `'202613'`（MM=13）| US-139 AC-2 | **採行**：月份合法性要求 MM 為 01~12，用嚴格 regex `^\d{4}(0[1-9]|1[0-2])$`（或等效 DTO / guard 兜底），違反回 422 `WORK_YM_INVALID_FORMAT`（已寫入 AC-9 / §5.6）。 | **Resolved** |
| OQ-F097-04 | **ETL 切點近似落差**（沿用 F091）：去重上界 ETL 載入點為真實日曆本月而非目標月相對 | [F091 OQ-STAGE1-02](F091-stage1-complete-month-cnt-dedup-special-delete.md) | 維持近似（不建 OBASSIGNSET ETL），業務驗收近似誤差不可接受時再啟動 | Open（Low，已接受近似）|

| # | 假設 | 標記 |
|---|---|---|
| A-1 | `AssignmentWorkYmContext` / `AssignmentWorkYmProvider` 命名與掛載點（`AssignmentLayout` 或 Router children wrapper）由 tdd-implementation 依既有路由結構決定；本 feature 僅要求「四頁共享、`run-history` 與結果頁排除」| [ASSUMPTION] |
| A-2 | `getDefaultTargetWorkYm` 與前端 `addOneMonth` 之具體實作（字串切片 vs Date 運算）由 tdd-implementation 決定，須通過跨年邊界 + OVERRIDE 測試 | [ASSUMPTION] |
| A-3 | （已解除）§5.6 錯誤碼三分支由 OQ-F097-01 方案 A 拍板：僅新增 `RUN_WORKYM_PAST`（422），格式沿用 `WORK_YM_INVALID_FORMAT`（422），缺省走 400；AC-9~AC-11 已回填 | Resolved（OQ-F097-01）|
| A-4 | 過去月 guard 於 `triggerRun()` 之插入點（格式驗證後、`assertNoRunningRun` 前）為建議順序，最終由 tdd 依既有 pipeline 確認 | [ASSUMPTION] |

## 12. 測試覆蓋率要求

- 單元測試覆蓋率 ≥ 80%
- 後端關鍵測試案例：
  - `SystemService.getDefaultTargetWorkYm()`：一般月 +1、跨年（`'202512'` → `'202601'`）、OVERRIDE（`'202506'` → `'202507'`）
  - `POST /runs` 必填驗證（空 body）、格式驗證（`'20266'` / `'202613'` / `'abcdef'` / `null`）
  - 過去月 guard：過去月（422）、當月 1 號邊界（`>=` 通過）、未來月（通過）；以 `SystemService.getCurrentWorkYm()` mock server 時鐘
  - `project_workym` 寫入 = 選定 `workYm`（非 `new Date()`）
  - 三 controller `computeCurrentWorkYm()` 移除後行為不變（regression）；`assignment-stage` 呼叫方改 `SystemService` 後行為不變
  - Stage 1 去重：`project_workym = '202606'` → `workdt = 2026-06-01` → 上界 `2026-05-31`；regression：`'202605'` 上界 `2026-04-30` vs `'202606'` 上界 `2026-05-31`（後移一個月）
  - `computeDedupWindow` 無 git diff（函式不變，AC-20）
- 前端關鍵測試案例：
  - `AssignmentWorkYmProvider` 初始值 = `current_work_ym + 1`；跨年邊界
  - 一處切換四頁同步；`run-history` 不受影響、不影響共享狀態
  - MonthPicker label 「分派作業月份」；無「作業年月 / 當月 / 本月」字串
  - 觸發頁 readiness check 帶選定 `?ym=`；`triggerRun(workYm)` 帶 body；confirm modal 顯示選定月
  - 處長觸發頁 MonthPicker disabled
  - 下游四頁無 MonthPicker、月份取自 `run.project_workym`、不隨共享狀態變動
  - 無新增 sidebar 路由（sidebar config 未變動）
- E2E：四頁切月同步 → 觸發頁選 6 月 → readiness 帶 6 月 → 確認 modal 顯示 2026-06 → run.project_workym = '202606' → 進度頁顯示 6 月（不隨他頁切換變動）

## 13. 變更紀錄

| 版本 | 日期 | 變更內容 |
|---|---|---|
| v1.0 | 2026-05-27 | 初版（F097 作業月語意統一，P1+P2+P3 合併）：分離 `current_work_ym` / `target_work_ym`；前端 `AssignmentWorkYmContext` 四頁共享預設下月；`POST /runs` 接受必填 `workYm` + 過去月 guard（`>=`）；`SystemService` 收斂 + `getDefaultTargetWorkYm()`；下游結果頁讀 `run.project_workym`；Stage 1 去重靠正確 `workdt` 自動對齊（`computeDedupWindow` 不改）；forward-only 不回填。 |
| v1.0（裁示回填）| 2026-05-27 | OQ-F097-01 / 02 / 03 裁示落地：**錯誤碼方案 A** — 缺省 400 / 格式錯 422 `WORK_YM_INVALID_FORMAT`（沿用）/ 過去月 422 `RUN_WORKYM_PAST`（新增，已登記 error-handling.md），**不新增 `INVALID_YM_FORMAT`**；§5.6 改三分支表、AC-9/AC-10/AC-11 回填；月份合法性 regex `^\d{4}(0[1-9]|1[0-2])$`（OQ-F097-03）。**F077 已同步至 v1.4**（US-143 / OQ-F097-02，限定範圍，未動其 §5.2 ym error code）。 |
