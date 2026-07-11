---
spec-id: F096
title: POOLDATA 篩選欄位白名單 list_type 停用（期別篩選唯一路徑澄清）
feature-id: F096
source-story: AD 驅動（AD-E07-26 §26.7）
epic: E07
module: M01 名單定義 / 代碼維護（白名單清理）
priority: P1
version: "1.0"
date: 2026-05-27
status: Draft
---

# F096: POOLDATA 篩選欄位白名單 list_type 停用（期別篩選唯一路徑澄清）

Priority: P1 | Status: Draft | Last Updated: 2026-05-27

> **v1.0（2026-05-27 / AD-E07-26 §26.7 白名單清理）**：依 [architecture-spec.md AD-E07-26 v1.1 §26.7](../architecture-spec.md)（DP 已 Resolved）落地。將 `pooldata_field_whitelist` 中 `column_name = 'list_type'` 條目設為 `is_active = false`（migration / seed `1711360000293`），使該欄位**不再暴露於前端篩選欄位 dropdown**。澄清 **`case_status → ob_pool_data.list_type` 為唯一期別篩選路徑**，移除 `ob_list_definition.list_type`（系統常數 `'01'`）作為篩選欄位之語意混淆入口。
>
> **背景**：`ob_list_definition.list_type` 為固定常數 `'01'`（對所有名單相同），不應作為使用者可選篩選欄位；期別篩選之正確欄位為 `ob_pool_data.list_type`（值域 `'01'~'04'`），由使用者輸入之 `case_status` 於 Stage 1 SQL 映射而來（[F050 v2.1](F050-create-list-definition.md) condition_payload 之 `case_status` 條目）。
>
> **Phase 對應**：屬單源化 / 清理工程之 **Phase B**（[AD-E07-25 §25.7](../architecture-spec.md) Phase B 群組之清理項）。為純資料 / 設定變更，不改變月名單分派案件數。
>
> **刻意未動（邊界）**：不變更 `architecture-spec.md`（AD-E07-26 §26.7 為權威）；不撰寫 code / test（由 tdd-implementation 落地）；不變更 `case_status` / `pooldata_field_option` 之既有設計（[F075 v1.6](F075-manage-pooldata-field-whitelist.md) / [F076 v1.6](F076-manage-categorical-field-values.md)）；本 feature 僅停用 `list_type` 一個白名單條目 + 澄清期別篩選路徑。

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + [architecture-spec.md AD-E07-26 §26.7](../architecture-spec.md)（**權威**）+ [F075 v1.6](F075-manage-pooldata-field-whitelist.md)（whitelist seed + BR-13 排除 is_active=false）+ [F050 v2.1](F050-create-list-definition.md)（case_status 映射）+ `apps/api/src/modules/...`（whitelist seed migration） |
| QA / Tester | 本文件（§4 AC）+ [F075 AC-10](F075-manage-pooldata-field-whitelist.md)（available-columns 排除規則） |
| Architect | 本文件 + [architecture-spec.md AD-E07-26 §26.7](../architecture-spec.md) |
| DBA | 本文件 §5（migration / seed `1711360000293`） |

---

## 1. 功能摘要

將 `pooldata_field_whitelist` 中 `column_name = 'list_type'` 之條目 `is_active` 設為 `false`（migration / seed `1711360000293`），使前端 `GET /api/v1/pooldata-fields/available-columns` dropdown 不再列出 `list_type`。同時於文件層澄清：名單之期別篩選唯一路徑為 `condition_payload.case_status → ob_pool_data.list_type`（Stage 1 SQL 映射），`ob_list_definition.list_type`（固定常數 `'01'`）與期別篩選無關，不應作為篩選欄位暴露。

## 2. 使用者故事

**As a** 業務部長 / 系統維運人員
**I want** 名單篩選欄位下拉選單不再出現語意混淆的 `list_type`（固定常數），只保留正確的期別篩選入口 `case_status`
**So that** 我設定名單篩選條件時不會誤選對所有名單固定為 '01' 的 `list_type`，期別篩選只透過 `case_status` 一個明確入口

## 3. 前置條件

- [F075 v1.6](F075-manage-pooldata-field-whitelist.md) 之 `pooldata_field_whitelist` 表與 seed（含 `list_type` 條目，目前 `is_active=true`）已存在
- `GET /api/v1/pooldata-fields/available-columns` 端點已遵循 [F075 BR-13 / AC-10](F075-manage-pooldata-field-whitelist.md)（排除 `is_active=false` 條目）
- [F050 v2.1](F050-create-list-definition.md) / [F051 v2.1](F051-edit-list-definition.md) 之 `case_status` condition_payload 路徑可用（期別篩選正確入口）

## 4. 驗收標準

### AC-1：停用 `list_type` 白名單條目（migration / seed `1711360000293`）

- **Given** `pooldata_field_whitelist` 含 `column_name = 'list_type'` 之條目（`is_active = true`）
- **When** migration / seed `1711360000293-DeactivatePooldataWhitelistListType` 執行
- **Then** 該條目 `is_active` 設為 `false`：`UPDATE pooldata_field_whitelist SET is_active = false WHERE column_name = 'list_type'`
- **And** 僅影響 `column_name = 'list_type'` 一筆，不動其餘條目（`case_status` / `best_case` / 其他維持原狀）
- **And**（可逆）`down()` 將 `list_type` 之 `is_active` 還原為 `true`

> **[ASSUMPTION] A-1**：`1711360000293` 命名 + 「以 migration 或 seed 操作落地」由 [AD-E07-26 §26.7](../architecture-spec.md) 拍板（若 `pooldata_field_whitelist` 由 seed 管理則作為 seed 操作）；tdd-implementation 依既有 whitelist seed 管理方式（migration vs seed script）決定落地形式。

### AC-2：前端 available-columns dropdown 不再顯示 list_type

- **Given** AC-1 已執行（`list_type` 條目 `is_active = false`）
- **When** 前端呼叫 `GET /api/v1/pooldata-fields/available-columns`（[F075 AC-10](F075-manage-pooldata-field-whitelist.md)）
- **Then** 回傳結果**不含 `list_type`**（端點已遵循 [F075 BR-13](F075-manage-pooldata-field-whitelist.md) 排除 `is_active=false`）
- **And** **無需前端程式碼變更**（dropdown 自動不再顯示，[AD-E07-26 §26.7 注意段](../architecture-spec.md)）

### AC-3：期別篩選唯一路徑澄清（case_status → ob_pool_data.list_type）

- **Given** 名單需設定期別篩選
- **When** 使用者於篩選條件區設定期別
- **Then** 唯一路徑為 `condition_payload.case_status`（categorical，選項來源 [F076](F076-manage-categorical-field-values.md)），Stage 1 `buildStage1WhereConditions()` 將其映射為 `ob_pool_data.list_type IN (...)`（[AD-E07-26 §26.7 映射說明](../architecture-spec.md)）
- **And** `ob_list_definition.list_type`（= `'01'` 常數）與此期別篩選**無關**，不作為篩選欄位

### AC-4：既有名單之 list_type 條件相容處理

- **Given** 既有名單之 `condition_payload` 可能含 `list_type` 條件（停用前建立）
- **When** 該名單被讀取 / 月名單分派 Stage 1 執行
- **Then** 既有 `condition_payload` 中之 `list_type` 條件**仍可被 Stage 1 解析執行**（停用僅影響「新增條件時的 dropdown 可選項」，不影響既有已存條件之解析）
- **And**（編輯防呆）若使用者於編輯頁嘗試**重新加入** `list_type` 條件，因 dropdown 已不列出而無法新增；後端 [F050/F051 v2.1 `CONDITION_COLUMN_NOT_IN_WHITELIST`](F050-create-list-definition.md) 校驗會攔截（`is_active=false` 視同不在白名單，defense-in-depth）

> **[ASSUMPTION] A-2**：既有名單之 `condition_payload` 中 `list_type` 條件之回填 / 清理（是否一併 backfill 移除）非本 feature 範疇；本 feature 僅停用「未來新增」入口。既有條件之處理若需要，列為 follow-up（OQ-WL-01）。

## 5. 資料契約 / Schema 變更

> 本 feature **不新增表 / 不新增欄位**；僅變更 `pooldata_field_whitelist` 既有 `list_type` 條目之 `is_active` 值。

### 5.1 migration / seed `1711360000293-DeactivatePooldataWhitelistListType`

```sql
-- up()
UPDATE pooldata_field_whitelist
SET    is_active = false
WHERE  column_name = 'list_type';

-- down()
UPDATE pooldata_field_whitelist
SET    is_active = true
WHERE  column_name = 'list_type';
```

> 若 `pooldata_field_whitelist` 由 seed script 管理（非 migration），則改為調整 seed 中 `list_type` 條目之 `is_active` 為 `false`（[AD-E07-26 §26.7](../architecture-spec.md)）。

### 5.2 期別篩選路徑（澄清，非 schema 變更）

```
condition_payload.case_status（使用者選擇的期別代碼，如 ['01','02']）
    ↓ Stage 1 buildStage1WhereConditions()
ob_pool_data.list_type IN ('01','02')   ← 實際 SQL 篩選欄位（唯一期別篩選路徑）
```

`ob_list_definition.list_type`（= `'01'` 常數）≠ 期別篩選欄位；不應出現在 `pooldata_field_whitelist`（AD-E07-26 §26.7）。

## 6. 商業規則

| 規則編號 | 說明 |
|---|---|
| BR-1 | **list_type 白名單停用**（AD-E07-26 §26.7）：`pooldata_field_whitelist` 之 `list_type` 條目 `is_active = false`；前端 dropdown 不再顯示 |
| BR-2 | **期別篩選唯一路徑**：`case_status → ob_pool_data.list_type` 為唯一期別篩選路徑；白名單不提供第二個入口 |
| BR-3 | **available-columns 自動排除**（沿用 [F075 BR-13](F075-manage-pooldata-field-whitelist.md)）：端點排除 `is_active=false`，無需前端改 code（AC-2）|
| BR-4 | **既有條件相容**：停用僅影響「新增條件之 dropdown」；既有 `condition_payload` 之 `list_type` 條件仍可解析執行（AC-4）|
| BR-5 | **僅影響單一條目**：本 feature 僅停用 `list_type`，不動 `case_status` / `best_case` / 其他白名單欄位（AC-1）|

## 7. 錯誤場景

| 場景 | 系統回應 | 參考 |
|---|---|---|
| 使用者於編輯頁嘗試重新加入 `list_type` 條件 | dropdown 已不列出（AC-2）；若繞過，後端 `CONDITION_COLUMN_NOT_IN_WHITELIST`（is_active=false 視同不在白名單）| [F050/F051 v2.1](F050-create-list-definition.md) |
| 既有名單含 `list_type` 條件 | Stage 1 仍正常解析執行（AC-4）；不報錯 | [F091](F091-stage1-complete-month-cnt-dedup-special-delete.md) |
| down() 還原後 list_type 重新顯示 | 預期行為（可逆）；available-columns 重新列出 | AC-1 |

## 8. 相依性

- **Blocked By**：[F075 v1.6](F075-manage-pooldata-field-whitelist.md)（whitelist 表 + seed + BR-13）
- **Blocks**：無
- **相關**：[F050 v2.1](F050-create-list-definition.md) / [F051 v2.1](F051-edit-list-definition.md)（case_status 期別篩選路徑 + CONDITION_COLUMN_NOT_IN_WHITELIST 校驗）

## 9. 交叉參考

- 架構決策：[architecture-spec.md AD-E07-26 §26.7 v1.1](../architecture-spec.md)（白名單清理 + 期別篩選唯一路徑，**權威來源**）
- 既有 whitelist：[F075 v1.6](F075-manage-pooldata-field-whitelist.md)（`pooldata_field_whitelist` seed `list_type` 條目 + `GET available-columns` AC-10 / BR-13）
- 期別篩選路徑：[F050 v2.1](F050-create-list-definition.md)（`case_status` condition_payload）、[F076 v1.6](F076-manage-categorical-field-values.md)（case_status 選項）
- 錯誤處理：[error-handling.md#assignment-list-errors](../error-handling.md#assignment-list-errors)（`CONDITION_COLUMN_NOT_IN_WHITELIST`）
- 相關功能：[F091 v2.0](F091-stage1-complete-month-cnt-dedup-special-delete.md)（Stage 1 buildStage1WhereConditions 映射）

## 10. 測試覆蓋率要求

- 單元測試覆蓋率 ≥ 80%
- 關鍵測試案例：
  - migration up：`list_type` 條目 `is_active` 由 true → false；其餘條目不變
  - migration down：`list_type` `is_active` 還原 true
  - `GET available-columns`：停用後結果不含 `list_type`，仍含 `case_status` / `best_case` 等其餘啟用條目（AC-2）
  - 既有名單含 `list_type` 條件：Stage 1 仍正常解析（AC-4，回歸）
  - 編輯頁重新加入 `list_type`（繞過 dropdown）：後端回 `CONDITION_COLUMN_NOT_IN_WHITELIST`（AC-4）
  - 僅影響單一條目：執行後 whitelist 之其他欄位 `is_active` 不變（AC-1 / BR-5）

## 11. 假設

| # | 假設 | 標記 |
|---|---|---|
| A-1 | `1711360000293` 命名 + migration vs seed 落地形式由 AD-E07-26 §26.7 + 既有 whitelist 管理方式決定 | Resolved（引用 AD-E07-26）|
| A-2 | 既有名單 `condition_payload` 中 `list_type` 條件之回填清理非本 feature 範疇；僅停用未來新增入口 | [ASSUMPTION]（OQ-WL-01）|

## 12. Follow-up / Open Questions

| OQ 編號 | 議題 | 現況決策 | 狀態 |
|---|---|---|---|
| OQ-WL-01 | 既有名單 `condition_payload` 中 `list_type` 條件是否一併 backfill 移除 | 本輪僅停用新增入口；既有條件保留可解析；如業務要求清理再評估 | Open（Low，follow-up）|

## 13. Production 影響標注

- **本 feature 為白名單設定變更，不改變月名單分派案件數**：停用僅影響「新增名單篩選條件時的 dropdown 可選項」，既有名單之 `condition_payload`（含可能的 `list_type` 條件）仍正常解析執行。
- 屬 **Phase B**（清理項，[AD-E07-25 §25.7](../architecture-spec.md) Phase B 群組）；可獨立於 Phase A 落地。
- 唯一可見變化：名單篩選欄位 dropdown 不再出現 `list_type`；無前端 code 變更（available-columns 端點自動排除 `is_active=false`）。
</content>
