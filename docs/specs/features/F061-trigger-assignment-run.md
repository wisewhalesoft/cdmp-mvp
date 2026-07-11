---
spec-id: F061
title: 觸發分派月名單分派
feature-id: F061
source-story: US-081, US-132
epic: E07
module: M04 分派執行
priority: P0-MVP
version: "1.4"
date: 2026-05-21
status: Draft
---

# F061: 觸發分派月名單分派

Priority: P0-MVP | Status: Draft | Last Updated: 2026-05-21

> **v1.4（2026-05-21 / M01 v2.0~v2.3 Kanban 重構 / GAP-G3 對應 US-132）**：核心變更：
> 1. **§4 新增 AC-Banner-1~3**：月名單分派唯一入口為 [F048 v2.0](F048-view-list-definition.md) Kanban Ready 欄頂 CTA Banner 主按鈕（藍底白字「執行 YYYY-MM 月名單分派」，附 play-circle icon），對應 US-132 GAP-G3。
> 2. **§4 AC-No-Per-Card-Trigger 新增**：Ready 階段名單卡片**完全不渲染** per-card「觸發」按鈕（月名單分派為月份級操作，per-list 觸發違反 F078 原子性月名單分派語意；對應 US-132 AC-6）。
> 3. **§9 UI/UX 補 CTA Banner 規範**：渲染條件（`stageCounts.ready ≥ 1` + 目前作業月份 + 月名單分派未鎖）、disabled 狀態（月名單分派執行中改琥珀色）、與 secondary「試算」按鈕並排佈局（spec 見 [F049 v1.1 §8](F049-stage0-daily-estimate.md)）；Toolbar 不再渲染「執行月名單分派」按鈕（重複入口移除）。
> 4. **本 v1.4 不變更月名單分派業務邏輯**（API endpoint / 前置條件檢查 / 非同步執行 / 快照原子性 / 月名單分派鎖 / Stage 2 soft check）；僅 UI 入口位置與按鈕渲染規則變更。
>
> **v1.3（2026-05-18）**：新增「分數區間空集合」soft check 機制：
> 1. **AC-7c 新增**：Stage 2 偵測某維度 `ob_levelcard_score` 為空 → 該維度跳過計分，記入 `assignment_run.skipped_cases` 與 `warning_summary='ALL_SCORES_EMPTY'`
> 2. **BR-13 新增**：soft check 在 application 層（`ScoringIntegrityCheckService`）獨立執行，**不嵌入 `fn_calc_tier_level`**；每維度每 rule_violated 寫一筆彙總 audit log（含 `violatedRowCount`）
> 3. 對齊 F054 v1.3 之 BR-9（`level1` NULL / 空字串 / TRIM 規一化）：Stage 2 比對 `card_level` ↔ `ob_levelcard_score.level1` 時亦套用同規一化規則
>
> **v1.2（2026-05-16）**：依 F002 v2.0 / AD-E07 v3.0 重構：
> 1. Guard 改為 `DirectorGuard`（M04 月名單分派觸發為部長專屬，依 F002 §4.6.2；F062~F067 月名單分派歷史查詢已開放處長 `DirectorOrSectionChiefGuard`）
> 2. **月名單分派前置條件擴充**（Stage 0 前置）：每張 active `ob_list_definition` 之 `card_type` 必須對應 `ob_card_type.status='active'` 且該 CARD_TYPE 之計分版本（`ob_levelcard_version` / `ob_levelcard_level` / `ob_tier`）已就緒，否則 422
> 3. **新增 BR-12 邊緣 CARD_TYPE 跳過**：Stage 1 過濾結果若包含「邊緣 CARD_TYPE」（即名單定義引用之 `card_type` 在 `ob_card_type` 不存在或非 active），該批案件不進入 Stage 2，記入 `skippedCases` 並寫 `assignment_run.warning_summary`
> 4. CR 回分由「全域開關」（原 F059）改為 **per-list flag**（`ob_list_definition.cr_enabled`）：Stage 3 對每張名單依該 flag 決定是否套用 CR 回分

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + `data-model.md#e07-data-model` + `error-handling.md#assignment-errors` + `diagrams/F061-assignment-run-flow.mmd` + `diagrams/F061-assignment-run-states.mmd` |
| QA / Tester | 本文件 + `error-handling.md#assignment-errors` + `nfr.md`（NFR-003/004/005） |
| UI/UX Designer | 本文件（第 9 節 UI/UX 需求） + 狀態圖 |
| Architect | 本文件 + `architecture-spec.md` §3.10、§5.12（AD-E07-2）、`diagrams/F061-*.mmd` |

---

## 1. 功能摘要

提供業務部長一鍵觸發本月名單分派月名單分派（Stage 0 前置 → Stage 1 名單建立 → Stage 2 計分 → Stage 3 部門分配 + CR 回分 → Stage 4 人員分配 + st4_exchange → 快照原子性寫入）。採非同步執行模型（202 Accepted），同月僅允許一個 pending/running 月名單分派。月名單分派完成後三份快照（`config` / `input_list` / `result`）在同一 DB Transaction 中原子性寫入，任一失敗則全部 Rollback。

Stage 2 計分前由 application 層 `ScoringIntegrityCheckService` 執行 soft check（BR-13），偵測「active 維度但無 score 列」之歷史殘留，該維度跳過計分並記入 `skipped_cases` 與 `warning_summary`，月名單分派仍可 `completed`。

## 2. 使用者故事

**As a** 業務部長
**I want** 點擊一個按鈕觸發本月的名單分派月名單分派
**So that** 系統根據目前的名單定義、計分設定、部門比例與人員比例，自動完成全流程分派計算，無需 IT 手動執行 SQL

## 3. 前置條件

- 業務部長已登入並持有有效 JWT Token
- `businessRole='director'`（M04 月名單分派觸發限部長，後端套用 `DirectorGuard`，依 F002 §4.6.2）
- 本月名單定義已就緒（F048 ~ F050）；每張 active `ob_list_definition` 之 `card_type` 已對應 `ob_card_type.status='active'` 且該 CARD_TYPE 計分版本就緒
- 每個 active `list_no` 的部門比例加總 = 100%（[F079](F079-set-dept-ratio.md) v1.0，取代原 F060 已 DEPRECATED）
- 所有啟用部門 × LIST_NO 的個別業務人員比例加總 = 100%（[F082](F082-set-per-sales-ratio.md) v1.3，取代原 F058 已 DEPRECATED）
- 計分版本有 `status = 'active'` 紀錄（F054 / F055 / F056）
- `ob_pool_data` 已由 **E04 + E05 雙層 ETL** 流程載入當月資料（詳見 [architecture-spec.md §E07-C](../architecture-spec.md#e07-c-etl-設計)）

## 4. 驗收標準

### AC-1：Stage 0 前置條件檢查

- **Given** 業務部長在 M04 分派執行頁面點擊「執行月名單分派」按鈕
- **When** 系統進行前置條件驗證
- **Then** 依序檢查：
  1. `ob_list_definition` 有本作業年月（`project_workym = :currentYm`）且 `status = 'active'` 紀錄至少一筆
  2. 每張 active `ob_list_definition` 之 `card_type` 必須存在於 `ob_card_type.status='active'`，且該 CARD_TYPE 對應 `ob_levelcard_version.status='active'` 與至少一筆 `ob_levelcard_level` / `ob_tier` 設定（v1.2 新增）
  3. 每個 active `list_no` 在 `ob_dept_pct` 均有部門比例設定，且加總 = 100%（M03a / F079）
  4. 所有啟用部門 × LIST_NO 組合的個別業務比例加總 = 100%（`ob_empl_set` / M03b / F082）
  5. 計分版本有 `ob_levelcard_version.status = 'active'`
  6. 目前無 `status IN ('pending', 'running')` 的月名單分派
- **And** 任一條件未滿足，顯示具體失敗原因清單，不啟動月名單分派；回傳 422 `ASSIGNMENT_RUN_PRECHECK_FAILED`

> **註（v1.3）**：本前置檢查**不包含**「每個 active `ob_levelcard_column` 是否至少有一筆 score 列」的硬阻擋。該情境屬歷史殘留 / race condition，改由 Stage 2 之 soft check（BR-13 / AC-7c）以 `warning_summary` 形式提示而非阻擋月名單分派，避免單一維度殘留資料污染導致整月無法執行。

### AC-2：月名單分派啟動並產生 run_id

- **Given** 所有前置條件均已通過
- **When** 業務部長於確認對話框點擊「確認執行」
- **Then** 系統 INSERT `assignment_run`（`status = 'pending'`, `project_workym = :currentYm`, `triggered_by = user_id`），產生唯一 `run_id`（UUID）
- **And** API 立即回傳 `202 Accepted` + `{ runId, status: 'pending' }`
- **And** 前端跳轉至 F062 執行進度頁

### AC-3：非同步執行 Stage 1~4

- **Given** 月名單分派已啟動
- **When** 後端背景 Promise chain 非同步執行
- **Then** 依序執行：
  - Stage 1：讀 `ob_pool_data` + 套用 `ob_list_definition` 篩選 → 產出候選名單
  - Stage 2：**先**由 application 層 `ScoringIntegrityCheckService` 執行 soft check（BR-13，AC-7c），標記 `ALL_SCORES_EMPTY` 之維度；**再**呼叫 `fn_calc_tier_level(...)` PostgreSQL function（AD-E07-3），套用 `ob_levelcard_*` 計分；TIER_LEVEL 對應採 `ob_tier` join，若 `ob_pool_data_list.card_level` 在 `ob_tier` 找不到對應紀錄，回退以 `card_type` 比對 fallback 規則（`card_level IS NULL` 那筆，如 `M5` → `T5M`）；比對 `card_level` ↔ `ob_levelcard_score.level1` 時套用 F054 v1.3 BR-9 規一化規則（NULL ↔ '' 等價、TRIM）
  - Stage 3：讀 `ob_dept_pct` 部門比例 + CR 回分優先指定（**v1.2 變更：依每張 `ob_list_definition.cr_enabled` per-list flag 決定，取代原 F059 全域開關**）→ 寫 `ob_pool_data_list.dept_id`
  - Stage 4：讀 `ob_empl_set` 人員比例 + st4_exchange（T1/T2/T3 新件 10% 轉資深）→ 寫 `ob_pool_data_list.emplid`；員工基本資料（在職判定、部門對應、員工姓名）由 `ob_emphire` join 取得（採 E04 + E05 雙層 ETL 從舊 OB DB 同步，OBEMPHIRE 採 full 全量重抓策略，詳見 [architecture-spec.md §E07-C](../architecture-spec.md#e07-c-etl-設計)）
- **And** 每個 Stage 成功後更新 `assignment_run`（`status = 'running'` + stage log）

### AC-4：三份快照原子性寫入

- **Given** Stage 1~4 全部成功
- **When** 系統寫入執行快照
- **Then** 在同一 DB Transaction 中原子性寫入三份快照至 `assignment_run_snapshot`：
  - `snapshot_type = 'config'`：記錄本次執行設定（計分版本 + per-LIST_NO 部門比例 + 人員比例 + CR 開關）
  - `snapshot_type = 'input_list'`：記錄 Stage 1 輸出（候選名單）
  - `snapshot_type = 'result'`：記錄 Stage 4 輸出（最終分派）
- **And** Transaction commit 成功後 UPDATE `assignment_run`（`status = 'completed'`, `finished_at = NOW()`, `total_cases = N`）

### AC-5：月名單分派失敗處理

- **Given** 月名單分派執行過程中任一 Stage 發生錯誤或快照寫入 Transaction 失敗
- **When** 錯誤被捕獲
- **Then** Transaction Rollback（若已進入快照階段）
- **And** UPDATE `assignment_run`（`status = 'failed'`, `error_message = 'Stage_X failed: {detail}'`）
- **And** F062 進度頁顯示失敗提示；業務部長可修正後重新觸發

### AC-6：同月併發執行防護

- **Given** 目前有 `status IN ('pending', 'running')` 的月名單分派
- **When** 業務部長再次點擊「執行月名單分派」
- **Then** 系統回傳 409 `ASSIGNMENT_RUN_ALREADY_RUNNING`，訊息：「分派執行中（run_id: {current}），請等待完成後再觸發」

### AC-7b：邊緣 CARD_TYPE 案件跳過（v1.2 新增，BR-12）

- **Given** Stage 1 候選名單包含某 `card_type` 引用之 CARD_TYPE 在 `ob_card_type` 不存在或 `status != 'active'`（前置條件未捕獲的 race condition：名單前置檢查後、Stage 1 執行前被 F072 停用）
- **When** Stage 2 計分執行
- **Then** 該批邊緣案件**不進入計分**，記入 `assignment_run.skipped_cases`（含 `card_type`、`appl_no` 計數、原因）
- **And** 月名單分派繼續執行其餘案件，最終 `status = 'completed'`，但 `warning_summary` 註明 `BR-12_EDGE_CARD_TYPE_SKIPPED`
- **And** F063 結果摘要頁顯示「本次有 N 筆案件因 CARD_TYPE 邊緣狀態被跳過，詳見快照」

### AC-7c：分數區間空集合 soft check（v1.3 新增，BR-13）

- **Given** Stage 2 計分前，某 active `ob_levelcard_column`（`status='active'`）之 `ob_levelcard_score` 對應列為空（歷史殘留 / race condition）
- **When** Application 層 `ScoringIntegrityCheckService`（**非 `fn_calc_tier_level` 內部**）執行 soft check
- **Then** 該維度**跳過計分**，相關案件之該維度貢獻分數視為 0（不阻擋 Stage 2 整體執行）
- **And** 記入 `assignment_run.skipped_cases` JSONB（每筆含 `cardType`、`columnName`、`affectedApplNoCount`、`reason='ALL_SCORES_EMPTY'`）
- **And** `assignment_run.warning_summary` 標記 `'ALL_SCORES_EMPTY'`（取代「最高警示等級」概念；若同時存在 `BR-12_EDGE_CARD_TYPE_SKIPPED`，warning_summary 為陣列 / 逗號分隔字串記錄多個警告碼）
- **And** 寫入 `assignment_audit_log`：**每維度每 `rule_violated` 寫一筆彙總列**，欄位含：
  - `action='SCORING_INTEGRITY_WARN'`
  - `run_id`、`card_type`、`column_name`
  - `rule_violated='ALL_SCORES_EMPTY'`
  - `violated_row_count`（受影響之 `appl_no` 計數）
  - 不寫每筆 appl_no 明細列（避免日誌爆量）
- **And** 月名單分派仍可 `status='completed'`；F063 結果摘要頁顯示「本次有 N 個計分維度因無分數區間設定被跳過，詳見快照」
- **And** F063 / F066 快照詳情頁可下鑽查看 `skipped_cases` 明細

### AC-7：允許 completed 狀態重跑

- **Given** 本月已有 `status = 'completed'` 的月名單分派（`run_id = 'prev-001'`）
- **When** 業務部長再次點擊「執行月名單分派」並確認
- **Then** 前置條件通過（completed 不阻擋重跑），系統建立新月名單分派並產生新 `run_id`（`'new-002'`）
- **And** 前次月名單分派快照（`'prev-001'`）完整保留於 `assignment_run_snapshot`，不被覆蓋或刪除

### AC-Banner-1：月名單分派唯一入口為 Ready 欄頂 CTA Banner 主按鈕（v1.4 新增 / US-132 / GAP-G3）

- **Given** 業務部長 / Admin 在 [F048 v2.0](F048-view-list-definition.md) Kanban 主頁、目前作業月份、`stageCounts.ready ≥ 1`、月名單分派未鎖
- **When** Kanban Ready 欄渲染
- **Then** 欄頭與卡片區之間顯示 CTA Banner（綠色底色 `#F0FDF4` + 綠色邊框 `#BBF7D0`）
- **And** Banner 上半部文字：「✓ `{stageCounts.ready}` 份名單已準備完成」（綠色 `#15803D`，附 check-circle-2 icon）
- **And** Banner 下半部含兩個並排按鈕：
  1. **主按鈕**（藍底白字）：「執行 `{currentWorkYm}` 月名單分派」，附 play-circle icon；點擊跳轉至 `31-trigger-run` 觸發月名單分派流程（最終呼叫 POST `/api/v1/assignment/runs`）
  2. **secondary 按鈕**（白底藍邊）：「試算」，附 calculator icon；點擊跳轉至 `30-stage0-estimate` Stage 0 試算頁（spec 見 [F049 v1.1 §8](F049-stage0-daily-estimate.md)）
- **And** 兩按鈕同列（`flex items-center gap-2`），主按鈕為 `flex-1`（撐滿剩餘空間），secondary 為 `shrink-0`（固定寬度）
- **And** Toolbar 不再渲染「執行月名單分派」按鈕（重複入口移除，對應 [F048 v2.0 AC-K7](F048-view-list-definition.md)）

### AC-Banner-2：Ready 欄無就緒名單時不渲染 Banner（v1.4 新增 / US-132 AC-2）

- **Given** `stageCounts.ready = 0`
- **When** Kanban 渲染
- **Then** Ready 欄頂部**不渲染** CTA Banner（欄頭直接銜接「無名單」提示）
- **And** 月名單分派入口完全不可達；使用者需先將至少 1 份名單推進至 ready 階段（透過 F086 簽核核准）才能觸發月名單分派

### AC-Banner-3：歷史月份不渲染 Banner（v1.4 新增 / US-132 AC-3）

- **Given** 使用者切換至歷史月份（`ym < current_work_ym`）
- **When** Kanban 渲染歷史月份 ready 欄
- **Then** 即使該月 ready 欄有名單，也**不渲染** CTA Banner（避免歷史月份觸發月名單分派）
- **And** ready 欄卡片進入唯讀模式（依 [F048 v2.0 AC-K6](F048-view-list-definition.md) / [F077 v1.3 BR-7 C-1](F077-month-switch-and-stage-overview.md)）

### AC-Banner-4：月名單分派執行中 Banner 進入禁用狀態（v1.4 新增 / US-132 AC-4）

- **Given** 目前有 `AssignmentRun.status IN ('pending','running')` 之月名單分派
- **When** Kanban 渲染（目前作業月份、ready 欄有 ≥1 名單）
- **Then** CTA Banner 底色改為琥珀色（`#FEF3C7` + 邊框 `#FDE68A`），頂部文字改為「分派執行中，無法重新觸發」（附 alert-triangle icon）
- **And** 主按鈕與 secondary「試算」按鈕**均為 disabled**（灰色背景 / 灰色文字 / `cursor-not-allowed`），點擊無動作
- **And** 主按鈕文字改為「分派執行中，無法重新觸發」（附 lock icon）

### AC-No-Per-Card-Trigger：Ready 階段卡片**不**渲染 per-card 觸發按鈕（v1.4 新增 / US-132 AC-6）

- **Given** 部長 / Admin 查看 `ready` 階段名單卡片
- **When** 卡片渲染操作按鈕區
- **Then** 卡片上**無任何**「觸發月名單分派」 / 「執行」 / 「Run」相關按鈕（per-list 觸發違反 F078 原子性月名單分派語意 — 月名單分派為**月份級**操作）
- **And** ready 階段卡片之操作按鈕依 [F077 v1.3 BR-7](F077-month-switch-and-stage-overview.md) Role × Stage 矩陣僅顯示：「退回」（F089）/ 「查看」（觸發 Detail Drawer，依 F050 v2.2 §6.2）
- **And** 月名單分派入口統一由 Ready 欄頂 CTA Banner 提供（AC-Banner-1）

## 5. API 規格

### 5.1 POST /api/v1/assignment/runs

**Request Body**：空（或 `{ "confirm": true }` 用於前置檢查與確認的二階段呼叫 `[ASSUMPTION]`）。

**Response — 202 Accepted**

```json
{
  "runId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "pending",
  "projectWorkym": "202605",
  "triggeredAt": "2026-04-24T12:00:00Z"
}
```

**錯誤回應**

| HTTP | 錯誤碼 | 說明 |
|---|---|---|
| 401 | AUTH_TOKEN_MISSING | 未登入 |
| 403 | E07_REQUIRES_DIRECTOR | `businessRole` 非 `'director'`（`DirectorGuard` 攔截，依 F002 §4.6.2） |
| 409 | ASSIGNMENT_RUN_ALREADY_RUNNING | 同月已有 pending/running 月名單分派 |
| 422 | ASSIGNMENT_RUN_PRECHECK_FAILED | 前置條件失敗（回應含 details 陣列列出失敗項目） |

## 6. 商業規則

| 規則編號 | 說明 |
|---|---|
| BR-1 | 月名單分派採非同步執行（AD-E07-2）；API 回傳 202 後於背景 Promise chain 執行 |
| BR-2 | 同月僅允許一個 `status IN ('pending', 'running')` 紀錄；透過 DB UNIQUE constraint 或應用層檢查 |
| BR-3 | 三份快照在同一 DB Transaction 中寫入；任一失敗整體 Rollback，`assignment_run.status` 改為 `failed`（AD-E07-2） |
| BR-4 | 允許 completed 狀態重跑；前次快照保留 |
| BR-5 | 執行觸發不受日期限制（舊系統「每月 21 日後才能執行」的限制已移除） |
| BR-6 | **CR 回分為 per-list 邏輯（v1.2 改寫）**：Stage 3 對每張 `ob_list_definition` 依其 `cr_enabled BOOLEAN NOT NULL DEFAULT false` 決定是否套用 CR 回分；原 F059 全域開關已 v2.0-DEPRECATED |
| BR-7 | 複雜計分邏輯（Stage 2）由 PostgreSQL function 實作（AD-E07-3） |
| BR-8 | Stage 1~4 執行過程中，所有 E07 CRUD 操作鎖定（參見 F048/F050/F051/F052/F054~F056/F068/F079/F082 的月名單分派鎖規則） |
| BR-12 | **邊緣 CARD_TYPE 跳過（v1.2 新增）**：Stage 2 若遇到引用之 `card_type` 在 `ob_card_type` 不存在或非 active 之候選案件，該批案件不進入計分，記入 `assignment_run.skipped_cases` JSONB 欄位（含 `cardType`、`applNoCount`、原因），月名單分派仍可 `completed`，`warning_summary` 標 `BR-12_EDGE_CARD_TYPE_SKIPPED`；前置條件 AC-1 已盡力捕獲此情境，BR-12 為 race condition 保護網 |
| BR-13 | **分數區間空集合 soft check（v1.3 新增）**：<br>(1) Stage 2 計分前由 application 層獨立 service（`ScoringIntegrityCheckService`）執行檢查，**不嵌入 `fn_calc_tier_level` PostgreSQL function 內部**（保持 SQL function 之純計算職責）<br>(2) 偵測規則：對每個 active `ob_levelcard_column`，檢查 `ob_levelcard_score` 是否存在至少一筆對應列；若為空，該維度標記 `ALL_SCORES_EMPTY` 並跳過計分<br>(3) 該維度貢獻分數視為 0；月名單分派不阻擋繼續執行<br>(4) `assignment_run.warning_summary` 以 `rule_violated` 名稱（`ALL_SCORES_EMPTY`）取代「最高警示等級」概念；多個警告碼共存時以陣列 / 逗號分隔記錄<br>(5) **Audit log 寫入規則**：每維度每 `rule_violated` 寫一筆彙總列（`action='SCORING_INTEGRITY_WARN'`，含 `card_type` / `column_name` / `rule_violated` / `violated_row_count`），**不寫每筆 appl_no 明細**避免日誌爆量<br>(6) 與 F054 AC-1b 編輯端提示為「時點互補」關係：F054 防止部長進入編輯時看不到問題、F061 BR-13 防止寫入端歷史殘留污染月名單分派結果 |
| BR-14 | **`level1` 規一化對齊**（v1.3 新增）：Stage 2 比對 `ob_pool_data_list.card_level` ↔ `ob_levelcard_score.level1` 時套用 F054 v1.3 BR-9 規一化規則：NULL 與 '' 等價、比對前對兩側執行 TRIM；確保 ETL 載入殘留之 SQL Server CHAR padding 不影響計分結果 |

## 7. 效能需求

| 項目 | 閾值 | 參考 |
|---|---|---|
| 10 萬筆案件完整月名單分派時間 | < 30 分鐘 | NFR-003 |
| 快照三份寫入 Transaction 時間 | < 60 秒 | NFR-004 |
| 結果準確性（與舊 SP 誤差） | 人員配對不一致率 < 3% | NFR-005（由 F067 驗證） |
| Soft check (BR-13) 執行時間 | < 5 秒（每月名單分派） | v1.3 新增；單純 COUNT(*) GROUP BY 查詢 |

## 8. 錯誤場景

| 場景 | 系統回應 | 參考 |
|---|---|---|
| 前置條件失敗 | 422 `ASSIGNMENT_RUN_PRECHECK_FAILED` + details | error-handling.md#assignment-errors |
| 同月已有 running | 409 `ASSIGNMENT_RUN_ALREADY_RUNNING` | error-handling.md#assignment-errors |
| Stage X 執行失敗 | `assignment_run.status = 'failed'`；`error_message` 記錄 | — |
| 快照寫入失敗 | Transaction Rollback；`status = 'failed'` | — |
| 邊緣 CARD_TYPE 案件 | 跳過，記 `warning_summary='BR-12_EDGE_CARD_TYPE_SKIPPED'`，月名單分派 completed | AC-7b / BR-12 |
| 分數區間空集合 | 該維度跳過，記 `warning_summary='ALL_SCORES_EMPTY'`，月名單分派 completed（v1.3 新增） | AC-7c / BR-13 |

## 9. UI/UX 需求（v1.4 重寫）

### 9.1 月名單分派唯一入口：Ready 欄頂 CTA Banner（v1.4 / US-132 / GAP-G3）

**位置**：[F048 v2.0](F048-view-list-definition.md) Kanban 主頁之 `ready` 欄頭與卡片區之間。

**渲染條件矩陣**（依 AC-Banner-1~4）：

| 條件 | Banner 樣式 | 主按鈕（執行月名單分派） | secondary 按鈕（試算） |
|---|---|---|---|
| `ready ≥ 1` + 當月 + 月名單分派未鎖 | 綠色底色（`#F0FDF4`）+ 綠色邊框 | 藍底白字「執行 `{ym}` 月名單分派」+ play-circle icon，可點擊 | 白底藍邊「試算」+ calculator icon，可點擊 |
| `ready = 0` | 不渲染整個 Banner | — | — |
| 歷史月份 | 不渲染整個 Banner | — | — |
| 月名單分派執行中（`status IN ('pending','running')`） | 琥珀色底色（`#FEF3C7`）+ alert-triangle icon | 文字改為「分派執行中，無法重新觸發」+ lock icon，**disabled** | **disabled** |

**佈局規範**：兩按鈕同列 `flex items-center gap-2`；主按鈕 `flex-1`（撐滿）、secondary `shrink-0`（固定）。

### 9.2 Toolbar 規則（v1.4 / US-070 v2.3）

- F048 v2.0 Toolbar **不渲染**「執行月名單分派」按鈕（重複入口移除；月名單分派唯一入口為本節 §9.1 Ready CTA Banner 主按鈕）
- F048 v2.0 Toolbar **不渲染**「Stage 0 試算」按鈕（試算入口為本節 §9.1 Ready CTA Banner secondary 按鈕，spec 見 [F049 v1.1 §8](F049-stage0-daily-estimate.md)）

### 9.3 Per-card 觸發按鈕已移除（v1.4 / US-132 AC-6）

- Ready 階段卡片**不渲染** per-card「觸發月名單分派」/「執行」按鈕（依 AC-No-Per-Card-Trigger）
- Ready 階段卡片操作按鈕依 [F077 v1.3 BR-7](F077-month-switch-and-stage-overview.md) 矩陣僅顯示「退回」+「查看」

### 9.4 觸發後流程

- 確認對話框：顯示本次執行的關鍵參數（作業年月 / active 名單數 / 計分版本）
- 觸發後自動跳轉 F062 進度頁
- 前置條件失敗：Modal 顯示失敗項目清單，提供跳轉修正入口（F079 / F082 / F048 等）
- 月名單分派完成時若 `warning_summary` 非空：F063 結果摘要頁以醒目橫幅顯示警告碼與對應筆數（v1.3）

### 9.5 Prototype canonical reference

`prototypes/27-list-definition.html` v2.3 之 `readyCtaHtml` 段落（正常 banner + locked banner 兩個樣式）：
- 正常 banner：綠底（`bg:#F0FDF4`）+ 主按鈕（藍底「執行 {ym} 月名單分派」）+ secondary（白底藍邊「試算」）
- locked banner：琥珀底（`bg:#FEF3C7`）+ 主按鈕（灰底「分派執行中，無法重新觸發」disabled）+ secondary（灰底「試算」disabled）

## 10. 相依性

- **Blocked By**：F048, F050, F054, F055, [F079](F079-set-dept-ratio.md)（M03a 部門比例，取代原 F060 已 DEPRECATED）, [F082](F082-set-per-sales-ratio.md)（M03b 個別業務比例，取代原 F058 已 DEPRECATED）（前置條件來源）、E04 + E05 雙層 ETL（`ob_pool_data` / `ob_emphire` / `ob_calendar` 資料來源，詳見 [architecture-spec.md §E07-C](../architecture-spec.md#e07-c-etl-設計)）
- **Blocks**：F062（進度）、F063（結果摘要）、F064（匯出）、F065（歷史清單）、F066（快照詳情）、F067（差異比對）

## 11. 交叉參考

- 資料模型：[data-model.md#e07-data-model](../data-model.md#e07-data-model)（`assignment_run`、`assignment_run_snapshot`、`ob_pool_data_list`）；[data-model.md#ob-emphire-entity](../data-model.md#ob-emphire-entity)（Stage 4 員工資料 join 來源，採 E04 + E05 雙層 ETL 同步）；[data-model.md#ob-calendar-entity](../data-model.md#ob-calendar-entity)（工作日表，Stage 0/1 期間計算）
  - **待 system-architect 同步（v1.3）**：`assignment_run.warning_summary` 欄位定義（VARCHAR 或 TEXT，支援多警告碼以陣列 / 逗號分隔儲存）；`assignment_run.skipped_cases` JSONB 欄位 schema 須涵蓋 `BR-12_EDGE_CARD_TYPE_SKIPPED` 與 `ALL_SCORES_EMPTY` 兩類 reason 之差異欄位（前者以 `cardType` 為主鍵、後者以 `cardType + columnName` 為主鍵）
  - **待 system-architect 同步（v1.3）**：`assignment_audit_log` 須支援 `action='SCORING_INTEGRITY_WARN'` 之彙總列寫入（含 `run_id` / `card_type` / `column_name` / `rule_violated` / `violated_row_count` 欄位）
- 錯誤處理：[error-handling.md#assignment-errors](../error-handling.md#assignment-errors)
  - **待 system-architect 同步（v1.3）**：補入 `ALL_SCORES_EMPTY` 警告碼語意說明（非錯誤碼、屬 warning_summary 標記、月名單分派仍可 completed）
- 非功能需求：[nfr.md](../nfr.md)（NFR-003 / NFR-004 / NFR-005）
- 流程圖：[diagrams/F061-assignment-run-flow.mmd](../diagrams/F061-assignment-run-flow.mmd)
  - **待 system-architect 同步（v1.3）**：Stage 2 流程須補入 `ScoringIntegrityCheckService` soft check 節點（位於 `fn_calc_tier_level` 呼叫之前）
- 狀態圖：[diagrams/F061-assignment-run-states.mmd](../diagrams/F061-assignment-run-states.mmd)
- 架構決策：AD-E07-1（OB 遷移）、AD-E07-2（非同步 + 快照原子性）、AD-E07-3（PostgreSQL function）
- 相關功能：F048, F050, F054, F055, F056, ~~F058（DEPRECATED → F082）~~, ~~F059（DEPRECATED → F050/F051 cr_enabled）~~, ~~F060（DEPRECATED → F079）~~, F062, F063, F064, F065, F066, F067, [F002 §4.6 角色矩陣](F002-user-login.md)
- **時點互補規則**：本 spec BR-13 / AC-7c（月名單分派 Stage 2 寫入端 soft check）與 F054 v1.3 AC-1b（M02 Tab 2 編輯端歷史殘留提示）為「同問題不同時點」之雙重防護網

## 12. 變更紀錄

| 版本 | 日期 | 變更內容 |
|---|---|---|
| v1.0 | 2026-05-10 | 初版（非同步執行、Stage 1-4、三份快照原子性、`assignment_run` 狀態機） |
| v1.1 | 2026-05-13 | 補入 AC-7 允許 completed 重跑、BR-4 / BR-5 規則 |
| v1.2 | 2026-05-16 | 依 F002 v2.0 / AD-E07 v3.0 重構：Guard 改 `DirectorGuard`、前置條件擴充 CARD_TYPE active 檢查、新增 BR-12 邊緣 CARD_TYPE 跳過（AC-7b）、CR 回分由全域開關改為 per-list flag（BR-6 / `ob_list_definition.cr_enabled`） |
| v1.3 | 2026-05-18 | （1）新增 AC-7c 分數區間空集合 soft check：active 維度若 `ob_levelcard_score` 為空，該維度跳過計分，記入 `skipped_cases` 與 `warning_summary='ALL_SCORES_EMPTY'`。（2）新增 BR-13：soft check 在 application 層 `ScoringIntegrityCheckService` 獨立執行（不嵌入 `fn_calc_tier_level`）；每維度每 `rule_violated` 寫一筆彙總 audit log 含 `violated_row_count`，不寫 appl_no 明細。（3）新增 BR-14：Stage 2 比對 `card_level` ↔ `level1` 套用 F054 v1.3 BR-9 規一化（NULL ↔ '' 等價、TRIM）。（4）以 `rule_violated='ALL_SCORES_EMPTY'` 取代「最高警示等級」概念；多警告碼以陣列 / 逗號分隔。（5）AC-3 Stage 2 流程補入 soft check 前置節點與規一化規則。（6）效能補 soft check < 5 秒閾值。（7）§11 註記待 system-architect 同步 data-model.md / error-handling.md / diagram 之項目。（8）與 F054 AC-1b 互為時點互補防護網。 |
| v1.4 | 2026-05-21 | **M01 v2.0~v2.3 Kanban 重構 / GAP-G3 對應 US-132**：(1) 新增 AC-Banner-1~4：月名單分派唯一入口為 Kanban Ready 欄頂 CTA Banner 主按鈕（綠底「執行 {ym} 月名單分派」），月名單分派執行中改琥珀色 disabled；(2) 新增 AC-No-Per-Card-Trigger：Ready 階段卡片完全不渲染 per-card 觸發按鈕（per-list 觸發違反 F078 原子性月名單分派語意）；(3) §9 UI/UX 重寫，補 CTA Banner 渲染條件矩陣 + Toolbar 規則（不渲染重複入口）+ Per-card 移除 + Prototype reference；(4) 本 v1.4 不變更月名單分派業務邏輯（API / 前置條件 / 非同步 / 快照原子性 / soft check 等）；(5) 與 [F048 v2.0 AC-K7](F048-view-list-definition.md) / [F049 v1.1 AC-Banner-Entry](F049-stage0-daily-estimate.md) 共構月名單分派唯一入口邊界 |
