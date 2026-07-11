---
last-updated: 2026-06-04
version: v1.0
change-summary: "新增 story：ASSIGNDAY 指派日曆來源確認，複用既有 ob_calendar 表（E07-OBCALENDAR-Load ETL），不新建 ETL；明確 ob_assign_set 在 F101 中為 vestigial，不使用。"
---

# US-151：ASSIGNDAY 指派日曆來源 — 複用 ob_calendar（免新建 ETL）

> **Story ID**：US-151
> **Epic**：[E07 — 客戶名單分派](epic-brief.md)
> **模組**：M04 分派執行（前置依賴確認）
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：2
> **Feature**：F101 月名單分派 Stage 3/4 真實比例分派

---

## User Story

**As a** 技術團隊
**I want** 確認 ASSIGNDAY 指派日曆資料使用既有 `ob_calendar` 表（由 E07-OBCALENDAR-Load ETL 維護），不需新建 ETL 或 UI 維護機制
**So that** US-149 ASSIGNDAY 分配功能有明確的資料來源，F101 可在無新增 ETL scope 的前提下完整實作

---

## 背景說明

### 資料來源決策

F101 ASSIGNDAY 日曆資料來源為**既有** `ob_calendar` 表：

| 項目 | 說明 |
|---|---|
| 表名 | `ob_calendar` |
| 關鍵欄位 | `calendar_date`（日期）、`rest_flg`（'0'=工作日, '1'=假日） |
| ETL 任務 | **E07-OBCALENDAR-Load**（raw OBCALENDAR → ob_calendar，full replace） |
| 維護頻率 | 由 E07-OBCALENDAR-Load 排程管理，F101 不新增維護機制 |
| F101 使用方式 | 透過 `calculateDailyEstimate(ym)` 共享邏輯讀取，不直接查詢 `ob_calendar` raw 資料 |

### ob_assign_set 的角色

`ob_assign_set` 表結構雖存在（entity/table 已定義），**F101 不使用它**。`ob_assign_set` 在目前系統中為 vestigial（無資料來源、無任何實作引用）。是否移除此表由架構師決定，超出 F101 scope。

### 前置條件關係

US-149（ASSIGNDAY 分配）依賴本 story 確認的資料來源。若 `ob_calendar` 當月無工作日資料，US-149 AC-5 的 fallback 機制啟動（ASSIGNDAY=NULL + audit warning，月名單分派不中斷）。

---

## 驗收標準

### AC-1：月名單分派目標月份可從 ob_calendar 取得工作日資料

- **Given** 月名單分派目標作業月 = `work_ym`（如 '202607'）；ETL E07-OBCALENDAR-Load 已執行
- **When** `calculateDailyEstimate(ym='202607')` 查詢 `ob_calendar`
- **Then** 返回至少 1 個工作日（`rest_flg='0'` 且 `calendar_date` 在 202607 月份範圍內）
- **And** `calculateDailyEstimate(ym)` 計算出的所有 ratio_rate 之和 = 1000（容許 ±1 以處理 FLOOR 捨去）

### AC-2：calculateDailyEstimate 為 Stage 0 與 Stage 4 ASSIGNDAY 的唯一日曆計算入口

- **Given** Stage 0 試算邏輯與 Stage 4 ASSIGNDAY 分配邏輯
- **When** 代碼審查
- **Then** 兩者均透過同一個 `calculateDailyEstimate(ym)` 方法（或封裝後的共享模組）取得 (casedt, ratio_rate) 清單
- **And** 不存在任何繞過此方法直接查詢 `ob_assign_set` 的 F101 相關代碼

### AC-3：ob_assign_set 在 F101 實作中無任何引用

- **Given** F101 相關實作檔案（Stage 3/4 pipeline, ASSIGNDAY service）
- **When** 靜態代碼掃描（Grep）
- **Then** 搜尋 `ob_assign_set` / `ObAssignSet` / `OBASSIGNSET` 在 F101 新增或修改的代碼中結果為空
- **And** `ob_assign_set` entity/table 不因 F101 新增任何欄位或索引

### AC-4：ob_calendar 無資料時 US-149 AC-5 fallback 正確啟動

- **Given** `ob_calendar` 中目標月份無任何 rest_flg='0' 的記錄（模擬 ETL 尚未執行或月份超出範圍）
- **When** Stage 4 ASSIGNDAY 計算執行
- **Then** `calculateDailyEstimate(ym)` 返回空清單
- **And** US-149 AC-5 fallback 啟動：ASSIGNDAY=NULL、月名單分派不中斷、audit_log 寫入 `ASSIGNDAY_NO_CALENDAR_WARN`

---

## 技術備註

- `ob_calendar.rest_flg` 值：'0' = 工作日，'1' = 假日（含週末與國定假日，依 OBCALENDAR 來源資料）
- `calculateDailyEstimate(ym)` 現有 `calendarSource` 參數預設為 `'weekday'`，使用 `resolveCalendarDay` 判斷工作日；F101 沿用此預設值，不引入新參數
- E07-OBCALENDAR-Load ETL 為已存在任務，F101 不修改其排程或邏輯
- 若 `ob_calendar` 資料覆蓋範圍不含未來月份，業務主管應確保 ETL 在月名單分派前已執行完畢；這是運維層面的前置條件，不屬於 F101 code 範疇
- `ob_assign_set` vestigial 狀態：保留 entity 定義但無任何資料寫入；後續是否廢棄（drop table 或 soft-delete entity）由架構師在 AD 中決策

---

## 測試案例

### TC-151-01：calculateDailyEstimate 正常返回工作日清單

- **Given**：ob_calendar 含 202607 月份 23 個工作日（rest_flg='0'）
- **When**：calculateDailyEstimate(ym='202607') 執行
- **Then**：返回 23 個 (casedt, ratio_rate) 對；所有 ratio_rate 之和 = 1000（baseRatio=43，最後 11 個日期 ratio_rate=44）

### TC-151-02：ob_assign_set 無引用

- **Given**：F101 相關新增/修改的 TypeScript 檔案
- **When**：Grep `ob_assign_set`
- **Then**：0 筆命中（確認 ob_assign_set 未被 F101 引用）

### TC-151-03：ob_calendar 無資料 fallback 鏈路驗證

- **Given**：ob_calendar 中 202607 月份無工作日記錄
- **When**：月名單分派執行
- **Then**：calculateDailyEstimate(ym='202607') 返回空清單；Stage 4 ASSIGNDAY=NULL；audit_log `ASSIGNDAY_NO_CALENDAR_WARN` 存在；月名單分派狀態為 'completed'（非 'failed'）

---

## 依賴關係

- **Blocked By**：無（確認現有 ETL 資料來源，不新增依賴）
- **Blocks**：US-149（ASSIGNDAY 分配依賴本 story 確認的資料來源）

---

## Definition of Done

- [ ] AC-1 ~ AC-4 全部通過
- [ ] TC-151-01 ~ TC-151-03 全部通過
- [ ] `ob_assign_set` 在 F101 代碼中無任何引用（TC-151-02 grep 為空）
- [ ] calculateDailyEstimate 為 Stage 0 與 Stage 4 的共享唯一入口（code review 確認）
- [ ] Code review 通過

---

## 相關文件

- **Epic Brief**：[E07 Epic Brief](epic-brief.md)
- **相關 Stories**：US-149（ASSIGNDAY 分配，直接依賴本 story 確認的資料來源）、US-150（確定性保證）
- **共享邏輯**：`apps/api/src/modules/assignment-list/stage0-estimate.service.ts::calculateDailyEstimate`
