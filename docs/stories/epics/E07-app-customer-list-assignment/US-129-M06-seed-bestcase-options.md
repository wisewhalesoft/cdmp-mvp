---
last-updated: 2026-05-20
version: v1.0
change-summary: "新增 story：D2 決議落地 — best_case categorical 欄位補入 Y / N 兩筆 active options，供篩選條件區使用。"
---

# US-129：best_case 篩選欄位補入 Y / N 可選值（Seed Migration）

> **Story ID**：US-129
> **Epic**：[E07 — 客戶名單分派](epic-brief.md)
> **模組**：M06 篩選欄位
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：1

---

## User Story

**As a** 系統管理員（Admin / Migration）
**I want** `best_case` 篩選欄位在 `pooldata_field_option` 中有 Y 與 N 兩筆啟用的可選值
**So that** 業務部長可以在「篩選條件」區新增 `best_case` categorical condition 並選擇案件篩選範圍（優質案件 / 非優質案件）

---

## 背景說明

本 Story 落地 2026-05-20 業務複核決議 D2（Q1 / Q2 answers 已確認）：

- `best_case` 欄位已存在於 F075 白名單 seed（migration `1711360000220-SeedPooldataFieldWhitelist.ts`），`field_type='categorical'`、`is_active=true`、`display_name='優質案件'`
- 但現況 `pooldata_field_option` 中 `column_name='best_case'` **沒有任何 option 紀錄**（migration 1711360000220 留空，備註「依 OBMCODEDF 之後另行補；MVP 此 migration 留空」）
- 本 Story 新增一個 seed migration，補入 `best_case` 的 Y / N 兩筆 active options

**Option label 決議（Q2）**：
- `Y` = `優質案件`
- `N` = `非優質案件`

---

## 驗收標準

### AC-1：pooldata_field_option 中存在 best_case Y / N 兩筆 active options

- **Given** 本 Story 的 seed migration 執行完成
- **When** 查詢 `pooldata_field_option WHERE column_name = 'best_case'`
- **Then** 存在以下兩筆紀錄：
  - `column_name='best_case'`、`option_value='Y'`、`option_label='優質案件'`、`is_active=true`
  - `column_name='best_case'`、`option_value='N'`、`option_label='非優質案件'`、`is_active=true`
- **And** 無其他 `best_case` option 紀錄

### AC-2：API 端點可正確回傳 best_case options

- **Given** seed migration 已執行
- **When** 呼叫 `GET /api/v1/pooldata-fields/best_case/options?active=true`
- **Then** response 回傳 2 筆 option：`[{ optionValue: "Y", optionLabel: "優質案件", isActive: true }, { optionValue: "N", optionLabel: "非優質案件", isActive: true }]`

### AC-3：Migration 為 idempotent（重複執行安全）

- **Given** seed migration 已執行一次
- **When** 再次執行同一 migration（up）
- **Then** 資料庫不產生重複紀錄（採 `ON CONFLICT (column_name, option_value) DO NOTHING`（PostgreSQL）/ `INSERT OR IGNORE`（SQLite））
- **And** 已存在的兩筆 option 不被覆寫或修改

### AC-4：白名單欄位本身狀態確認（防呆驗證）

- **Given** seed migration 執行前後
- **When** 查詢 `pooldata_field_whitelist WHERE column_name = 'best_case'`
- **Then** 存在一筆紀錄，`field_type='categorical'`、`is_active=true`、`display_name='優質案件'`
- **And** 若不存在（異常情況），migration 應先確認白名單欄位存在再插入 option，避免 FK 約束失敗

### AC-5：篩選條件區可正常使用 best_case 欄位

- **Given** seed migration 已執行，US-128 已移除 prodBest 欄位
- **When** 部長在「建立草稿名單」的「篩選條件」區點擊「新增條件」dropdown
- **Then** 可見 `best_case`（顯示名稱「優質案件」，type badge 為 categorical）
- **And** 選取 `best_case` 加入條件後，多選值清單顯示「Y（優質案件）」與「N（非優質案件）」兩個可勾選項
- **And** 業務部長可勾選 Y、N 或兩者，儲存後 `condition_payload` 中記錄 `{ columnName: "best_case", fieldType: "categorical", values: ["Y"] }` 等格式

---

## 技術備註

- **新 seed migration 建議命名**：`{timestamp}-SeedBestCaseOptions.ts`（timestamp 接在 1711360000220 之後，例如 `1711360000221`）
- **Migration 結構**：對齊既有 `1711360000220-SeedPooldataFieldWhitelist.ts` 的模式，同樣支援 PostgreSQL / SQLite 雙資料庫（`isSqlite` 分支）
- **Down migration**：執行 `DELETE FROM pooldata_field_option WHERE column_name = 'best_case' AND option_value IN ('Y', 'N')`；僅刪除本 migration seed 的 2 筆，不刪除管理員透過 F076 手動新增的紀錄
- `pooldata_field_option` 複合 PK 為 `(column_name, option_value)`
- `best_case` 對應 `ob_pool_data.best_case` 欄位（Y/N 二元值），語意為「同一個客戶多個案件中的最佳案件」

---

## 依賴關係

- **Blocked By**：US-125（確認 `pooldata_field_option` 表結構已就緒；本 Story 複用相同表與 ON CONFLICT 模式）
- **Blocks**：US-128（AC-4 的完成驗證前提）
- **相關**：US-103（管理類別型欄位可選值，F076 UI 維護入口）

---

## Definition of Done

- [ ] 新 seed migration 已建立並執行，`pooldata_field_option` 中 `best_case` Y / N 兩筆 records 存在且 `is_active=true`
- [ ] Migration 為 idempotent（ON CONFLICT DO NOTHING 模式驗證）
- [ ] `GET /api/v1/pooldata-fields/best_case/options?active=true` 回傳正確 2 筆
- [ ] 前端篩選條件 dropdown 可選到 `best_case` 並顯示 Y / N 可選值
- [ ] Code review 通過

---

## 相關文件

- **Epic Brief**：[E07 Epic Brief](epic-brief.md)
- **既有白名單 seed**：`apps/api/src/database/migrations/1711360000220-SeedPooldataFieldWhitelist.ts`（`best_case` 欄位已在此 seed，本 Story 補其 options）
- **prodBest 移除 Story**：[US-128](US-128-M01-remove-prodbest-field.md)（依賴本 Story 的 options 完成）
- **F076 可選值管理 UI**：[US-103](US-103-M06-manage-categorical-field-values.md)
- **複核決議來源**：D2（best_case 進白名單）、Q1（display_name = 優質案件）、Q2（Y = 優質案件、N = 非優質案件）
