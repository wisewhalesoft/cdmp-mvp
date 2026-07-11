---
spec-id: CDMP-GLOSSARY
title: CDMP MVP 術語表（Glossary）
version: "1.0"
date: 2026-05-27
status: Draft
feature: F097 作業月語意統一
---

# CDMP MVP — 術語表（Glossary）

> **v1.0 / 2026-05-27 / F097 作業月語意統一初版**
>
> 本術語表為 F097「客戶名單分派作業月語意統一」定義命名的**唯一權威來源**。所有下游 spec-writer / system-architect / tdd-implementation / ui-ux 必須沿用此處的命名，**不得自行建立同義詞或替代詞**，以防止 naming drift。
>
> Technical terms（JWT、API Key、Staging、JSONB、CRUD、React Context 等）保持英文不翻譯。

---

## 使用規則

1. **命名鎖定**：下列各欄「識別碼 / 術語」欄的名稱一旦確認，所有 spec / code / test / UI label 均須統一使用。
2. **UI 標籤**：中文 UI 元件的 label / placeholder / banner 文字，一律查「UI 中文標籤」欄。
3. **DB 欄位**：DB 欄位名稱不隨語意正名而改動（`project_workym` 不改名）。
4. **新術語**：如需新增概念，先在本術語表建立詞條，再在 spec 中引用。
5. **衝突判定**：若既有 spec 描述與本術語表衝突，以本術語表為準，並由 spec-writer 更新對應 spec。

---

## F097 核心術語

### 1. 系統錨點月（current_work_ym）

| 欄位 | 內容 |
|---|---|
| **識別碼** | `current_work_ym` |
| **中文術語** | 系統錨點月 |
| **UI 中文標籤** | 不直接顯示給使用者；後端 API 欄位名稱 `currentWorkYm` |
| **定義** | 真實日曆當月（YYYYMM），代表系統「現在是幾月」的錨點值。每月 1 號 0:00 切換為該月（例：2026-05-27 → `'202605'`）。 |
| **唯一計算點** | 後端 **`SystemService.getCurrentWorkYm()`**（注入自 `SystemModule`）。**全系統唯一合法呼叫 `new Date()` 之處。** |
| **取得方式（前端）** | 前端透過 `GET /api/v1/system/current-work-ym` 取得，**不得在前端自行 `new Date()`** 計算。 |
| **OVERRIDE 支援** | 環境變數 `OVERRIDE_CURRENT_WORK_YM=YYYYMM` 可覆蓋（測試 / 災難復原），格式驗證失敗時退回 `new Date()`。 |
| **用途** | 判定名單歷史/未來/唯讀（F077 BR-3）；月份範圍 ± 12 計算（F077 BR-2）；衍生 `target_work_ym` 的預設值。 |
| **不做什麼** | 不直接用於月名單分派觸發的 `project_workym`（那是 `target_work_ym` 的職責）。 |
| **對應 F077** | F077 AC-3（`current_work_ym` 計算規則，以 F077 為單一權威）；F097 後由 US-143 更新 F077 §7 說明。 |

---

### 2. 分派作業月份 / 作業月（target_work_ym）

| 欄位 | 內容 |
|---|---|
| **識別碼** | `target_work_ym` |
| **中文術語** | 分派作業月份（正式）；作業月（縮寫，可用於說明文字）|
| **UI 中文標籤** | **「分派作業月份」**（固定，供 MonthPicker label / placeholder / banner 使用） |
| **定義** | 使用者正在作業的目標月份（YYYYMM），代表「名單要分派去的那個月」。通常是下個月（5 月準備 6 月名單）。 |
| **預設值** | **`current_work_ym + 1`**（下個月）。由前端共享狀態（`AssignmentWorkYmContext`）初始化並提供。 |
| **來源** | 使用者透過 top-bar MonthPicker 選定。初始值由後端 `SystemService.getDefaultTargetWorkYm()` 邏輯對應（`current_work_ym + 1`）。 |
| **共享狀態實作** | 前端 **React Context**（`AssignmentWorkYmContext`），Provider（`AssignmentWorkYmProvider`）掛載於 assignment 區段 layout 元件。涵蓋四頁：名單定義（M01）/ 準備完成摘要（M03d）/ Stage 0 試算（F049）/ 月名單分派觸發（F061）。 |
| **不涵蓋的頁面** | 月名單分派歷史頁（F065 `run-history`）：維持獨立 local state（查詢任意月歷史 run，語意不同）。下游結果頁（F062 進度 / F063 摘要 / F066 快照 / F067 比對）：不加 MonthPicker，月份來源為 `run.project_workym`。 |
| **用途** | 名單篩選、Stage 0 估算、月名單分派觸發 → 寫入 `AssignmentRun.project_workym`。 |
| **合法範圍** | `current_work_ym ± 12`（共 25 月，對齊 F077 BR-2）。 |
| **對應 story** | US-137（共享 Context 建立）、US-138（觸發頁 MonthPicker）、US-139（後端接受）。 |

---

### 3. DB 欄位 project_workym（不改名）

| 欄位 | 內容 |
|---|---|
| **DB 欄位名稱** | `project_workym`（`assignment_run` 資料表）|
| **不改名理由** | 欄位語意本就正確（「名單作業月份」），歷史問題出在預設值錯誤（餵了執行月而非目標月）。欄位名稱維持不動避免 migration 風險。 |
| **語意（F097 後）** | 此次月名單分派所服務的**目標分派月份**（= `target_work_ym`），由使用者選定，寫入於月名單分派觸發時。 |
| **語意（F097 前，歷史資料）** | 歷史 run 記錄的 `project_workym` 儲存的是「執行月」（`new Date()` 當時的月份），與目標月語意不同。見 forward-only 政策。 |
| **API 回傳欄位名** | `projectWorkym`（camelCase，前端 TypeScript interface）|
| **對應 story** | US-139 AC-7（寫入正確月份）、US-141（下游頁讀取）。 |

---

### 4. 目標月 workdt

| 欄位 | 內容 |
|---|---|
| **識別碼** | `workdt` |
| **中文術語** | 目標月基準日 |
| **定義** | `target_work_ym`（YYYYMM）轉換為的日期物件，計算方式為 `target_work_ym + '01'`（目標月 1 號，例：`'202606'` → `new Date('2026-06-01')`）。 |
| **用途** | （1）過去月 guard 比對基準：`workdt < today` 則拒絕觸發。（2）Stage 1 去重視窗計算：`[workdt − 3 個月, MIN(MAX(assignday), workdt − 1 日)]`（去重上界語意 = 作業月上月底）。 |
| **對應 SP** | `reference/SP/SP_INFOT_ASSIGNEXPORTNAMELIST_st1_list.sql` 中的 `@WORKDT = PROJECT_WORKYM + '01'`（UTF-16LE 解碼驗證）。 |
| **對應 story** | US-139 AC-4/5（guard 計算）、US-142 AC-1（去重視窗）。 |

---

### 5. 過去月 guard（past-month guard）

| 欄位 | 內容 |
|---|---|
| **識別碼** | past-month guard（技術術語）；中文可說「過去月保護」 |
| **定義** | 後端 `POST /api/v1/assignment/runs` 的前置保護邏輯：若 `workdt`（= `target_work_ym` 的 1 號）< 今天（server 時鐘），則拒絕觸發月名單分派，回 422 `RUN_WORKYM_PAST`。 |
| **邊界規則** | 使用 **`>=`**（`workdt >= today`）：即目標月 1 號當天（如 6 月 1 日跑 6 月月名單分派）合法通過。對應 SP `@WORKDT < getdate()` 的等價移植。 |
| **錯誤碼** | `RUN_WORKYM_PAST`（422 Unprocessable Entity，待新增至 `error-handling.md`）。 |
| **ground-truth** | `reference/SP/SP_INFOT_ASSIGNEXPORTNAMELIST_st1_list.sql` L24-34：`IF ISNULL(@IS_ASSIGNED,'N')='Y' OR @WORKDT < getdate() BEGIN RETURN END`（UTF-16LE 解碼驗證）。 |
| **對應 story** | US-139 AC-3/4/5。 |

---

### 6. 去重視窗（dedup window）

| 欄位 | 內容 |
|---|---|
| **識別碼** | dedup window（英文技術術語）；中文「近 3 個月去重視窗」 |
| **定義** | Stage 1 挑案時排除近期已派案件的時間範圍：`[workdt − 3 個月, MIN(MAX(ob_pool_data_list.assignday), workdt − 1 日)]`。 |
| **上界語意（F097 後）** | **作業月上月底**（`workdt − 1 日`，即 target-relative），F097 前為執行月上月底（差一個月）。 |
| **`computeDedupWindow` 邏輯** | F091 v2.0 已定義，**F097 不修改此函式**；語意對齊依靠傳入正確的 `workdt`（來自正確的 `project_workym`）。 |
| **ETL 近似落差（已接受）** | ETL 載入 `ob_pool_data_list` 上界為真實日曆本月 1 號，非目標月相對；`MAX(assignday)` 可能不含作業月前月的最後幾天，`MIN()` 以 `workdt − 1 日` 兜底。此為已接受的近似（OQ-STAGE1-02，非本輪修正範疇）。 |
| **對應 spec** | F091 v2.0 §5.2 BR-2；US-142。 |

---

### 7. forward-only（歷史資料不回填）

| 欄位 | 內容 |
|---|---|
| **識別碼** | forward-only（技術策略詞） |
| **定義** | F097 部署後，**既有歷史 run 記錄的 `project_workym`（執行月語意）不進行任何回填或修正**，維持原值。僅 F097 部署後新觸發的 run 才套用「目標分派月」語意。 |
| **理由** | 回填風險高（歷史 run 的「執行月」≠ 其「目標月」，無可靠方式反推）；業務決策為接受此語意混雜，以文件標注邊界。 |
| **標注要求** | 程式碼（`AssignmentRunService.triggerRun` 附近）與 CHANGELOG 須明確記載 forward-only 策略生效日期（F097 部署日）。 |
| **對應 story** | US-141 AC-4；US-142 背景說明。 |

---

### 8. 共享月份狀態（shared month state）

| 欄位 | 內容 |
|---|---|
| **識別碼** | 共享月份狀態（中文）；shared month state（英文） |
| **實作方式（已拍板）** | **React Context（`AssignmentWorkYmContext`）**，Provider（`AssignmentWorkYmProvider`）掛載於 assignment 區段的 layout 元件。不使用 Zustand / Redux / URL query param。 |
| **涵蓋頁面** | （1）名單定義頁（`list-definition`，F048/F077）；（2）準備完成摘要頁（`ready-summary`，F088）；（3）Stage 0 試算頁（`stage0-estimate`，F049）；（4）月名單分派觸發頁（`trigger-run`，F061）。 |
| **不涵蓋頁面** | 月名單分派歷史頁（`run-history`，F065）：獨立 local state。下游結果頁（進度 / 摘要 / 快照 / 比對）：不加 MonthPicker，月份來自 `run.project_workym`。 |
| **Context 提供的值** | `currentWorkYm`（系統錨點月）、`targetWorkYm`（作業月，預設下月）、`setTargetWorkYm`（更新 setter）。 |
| **初始化流程** | Provider 掛載時呼叫 `GET /api/v1/system/current-work-ym` → 取得 `currentWorkYm` → 計算 `targetWorkYm = currentWorkYm + 1` → 存入 Context。 |
| **對應 story** | US-137（完整規格）。 |

---

## 舊術語對照（F097 廢棄 / 不再使用）

| 舊術語 / 舊做法 | 狀態 | 取代為 |
|---|---|---|
| 前端 `function currentWorkYm() { const now = new Date(); ... }` | **廢棄**（F097 移除） | 改由 `AssignmentWorkYmContext.currentWorkYm` 取得 |
| 後端 `AssignmentListController.computeCurrentWorkYm()` static method | **廢棄**（F097 移除） | 改呼叫 `SystemService.getCurrentWorkYm()` |
| 後端 `Stage0EstimateController.computeCurrentWorkYm()` static method | **廢棄**（F097 移除） | 同上 |
| 後端 `AssignmentRunController.computeCurrentWorkYm()` static method | **廢棄**（F097 移除，`triggerRun` handler） | 改讀 `dto.workYm` |
| `POST /runs` body 無 `workYm`（後端自算） | **廢棄**（F097 breaking change） | `workYm` 必填，前端明確傳入 |
| UI 標籤「作業年月 {ym}」、「當月」、「本月」（指作業月） | **廢棄**（F097 替換） | 改為「分派作業月份」 |

---

## 版本紀錄

| 版本 | 日期 | 說明 |
|---|---|---|
| v1.0 | 2026-05-27 | 初版（F097 作業月語意統一）：定義 `current_work_ym` / `target_work_ym` / `project_workym` / `workdt` / 過去月 guard / 去重視窗 / forward-only / 共享月份狀態（React Context）。 |
