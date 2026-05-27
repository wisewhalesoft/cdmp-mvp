---
type: test-design-feature
feature_id: F096
feature_name: POOLDATA 篩選欄位白名單 list_type 停用（期別篩選唯一路徑澄清）
priority: P1
related_spec: /docs/specs/features/F096-pooldata-whitelist-list-type-cleanup.md
spec_version: "1.0"
covers:
  - F096
  - AD-E07-26 §26.7
last_updated: 2026-05-27
---

# F096：POOLDATA 篩選欄位白名單 list_type 停用 — 測試設計

> **測試設計重點（v1.0）**：
>
> 1. **Migration / seed m293 正確性**：`pooldata_field_whitelist.list_type` 設為 `is_active=false`；冪等（重複執行安全）；可逆（down() 還原）
> 2. **API regression**：`GET /api/v1/pooldata-fields/available-columns` 不再回傳 `list_type`（F075 BR-13 / AC-10 既有邏輯自動過濾）
> 3. **case_status 仍 active**：`case_status` 條目 `is_active` 不受影響（期別篩選正確入口保留）
> 4. **既有名單相容**：既有 `condition_payload` 中已有 `list_type` 條件的名單，Stage 1 `buildStage1WhereConditions()` 仍可解析執行（停用僅影響「新增」入口）
> 5. **後端 CONDITION_COLUMN_NOT_IN_WHITELIST 防禦**：嘗試新增 `list_type` 條件時，API 回傳 422
>
> **範圍說明**：本 feature 為純資料 / 設定變更，不改變月跑案件數。Migration / seed 為唯一實作產物；不新增表 / 欄位。

---

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + `F096-pooldata-whitelist-list-type-cleanup.md`（v1.0）+ `architecture-spec.md` AD-E07-26 §26.7 + `F075-manage-pooldata-field-whitelist.md`（BR-13 / AC-10：is_active=false 排除邏輯）+ `F050-create-list-definition.md`（case_status 映射）+ whitelist seed migration 所在路徑（參照 F075 v1.6 seed 管理方式）|
| QA / Tester | 本文件 + F075-test.md（TS-F075-M-A1 seed 驗證場景）|

---

## 測試策略概覽

| 項目 | 說明 |
|---|---|
| 主要測試層 | Integration（PostgreSQL TestContainer：migration / seed 行為）；Unit（靜態：API regression guard）|
| 關鍵依賴 | F075 v1.6 之 `GET /api/v1/pooldata-fields/available-columns`（BR-13 排除 is_active=false）既有邏輯；F050 v2.1 `case_status` condition_payload 映射（不受影響）|
| 冪等性 | migration / seed up() 重複執行安全（UPDATE SET is_active=false WHERE column_name='list_type'，已為 false 時無害）|
| 最小影響原則 | 僅影響 `column_name='list_type'` 一筆；其他 whitelist 條目（case_status / best_case 等）一律不受影響 |

### 案例群組自動化就緒度

| 群組 | 案例數 | 自動化適合度 | 測試層 | 說明 |
|---|---|---|---|---|
| TS-F096-MIG-001~004（migration / seed m293）| 4 | 高（需 PG TC）| Integration | up / down / 冪等 / 最小影響 |
| TS-F096-API-001~003（available-columns regression）| 3 | 高（需 PG TC / mock）| Integration | list_type 不再出現；case_status 仍存在；空集合防護 |
| TS-F096-COMPAT-001~002（既有條件相容）| 2 | 高（需 PG TC）| Integration | 既有 condition_payload 仍可解析；新增被攔截 |

---

## 一、Migration / Seed m293 驗證

> **設計依據**：F096 AC-1；AD-E07-26 §26.7；migration / seed `1711360000293-DeactivatePooldataWhitelistListType`
>
> **注意**：依 F096 A-1，實際落地形式（migration 或 seed script）由 tdd-implementation 依既有 F075 v1.6 whitelist seed 管理方式決定。本測試設計覆蓋兩種形式。

---

### TS-F096-MIG-001：migration / seed up() — 將 list_type 設為 is_active=false

- **關聯需求**：F096 AC-1；AD-E07-26 §26.7（`UPDATE pooldata_field_whitelist SET is_active = false WHERE column_name = 'list_type'`）
- **測試類型**：Positive / Integration
- **測試層**：Integration（PostgreSQL TestContainer）
- **前置條件**：
  - PostgreSQL TestContainer 啟動
  - `pooldata_field_whitelist` 表存在，含 `column_name = 'list_type'` 條目，`is_active = true`
  - 尚未執行 migration / seed `1711360000293`
- **步驟**：
  1. 執行 `1711360000293-DeactivatePooldataWhitelistListType` 的 `up()`（或等效 seed run）
  2. 查詢 `SELECT is_active FROM pooldata_field_whitelist WHERE column_name = 'list_type'`
  3. 統計受影響列數（應僅 1 列）
- **預期結果**：
  - `is_active = false`（已停用）
  - 僅 1 列受影響（`column_name = 'list_type'`）
  - 其他列（`case_status`、`best_case` 等）`is_active` 維持原值不變
- **DB 需求**：PostgreSQL TestContainer

---

### TS-F096-MIG-002：migration / seed down() — 還原 list_type 為 is_active=true（可逆）

- **關聯需求**：F096 AC-1（「`down()` 將 `list_type` 之 `is_active` 還原為 `true`」）
- **測試類型**：Positive / Integration
- **測試層**：Integration（PostgreSQL TestContainer）
- **前置條件**：up() 已執行，`list_type` 之 `is_active = false`
- **步驟**：
  1. 執行 migration / seed `1711360000293` 的 `down()`（或等效 rollback）
  2. 查詢 `SELECT is_active FROM pooldata_field_whitelist WHERE column_name = 'list_type'`
- **預期結果**：
  - `is_active = true`（還原）
  - 其他條目不受 down() 影響
- **DB 需求**：PostgreSQL TestContainer

---

### TS-F096-MIG-003：冪等性 — 重複執行 up() 安全

- **關聯需求**：F096 AC-1（「冪等」）；F075 v1.6 seed 管理慣例
- **測試類型**：Positive / Integration
- **測試層**：Integration（PostgreSQL TestContainer）
- **前置條件**：up() 已執行一次（`list_type` 之 `is_active = false`）
- **步驟**：
  1. **再次執行** up()（模擬重複部署）
  2. 查詢 `is_active` 狀態與總列數
- **預期結果**：
  - `is_active` 仍為 `false`（冪等，無不良副作用）
  - `pooldata_field_whitelist` 總列數不變（非 INSERT，無重複列）
  - 不 throw 任何錯誤
- **DB 需求**：PostgreSQL TestContainer

---

### TS-F096-MIG-004：最小影響範圍 — 僅 list_type 受影響，case_status 等其他條目不變

- **關聯需求**：F096 AC-1（「僅影響 `column_name = 'list_type'` 一筆，不動其餘條目」）
- **測試類型**：Negative / Integration
- **測試層**：Integration（PostgreSQL TestContainer）
- **前置條件**：`pooldata_field_whitelist` 含 `list_type`、`case_status`、`best_case` 等多個條目，各 `is_active` 已知初始值
- **步驟**：
  1. 執行 up()
  2. 查詢 `SELECT column_name, is_active FROM pooldata_field_whitelist WHERE column_name IN ('list_type', 'case_status', 'best_case')`
- **預期結果**：
  - `list_type` → `is_active = false`
  - `case_status` → `is_active` 維持原值（**不受影響**，期別篩選正確入口保留）
  - `best_case` → `is_active` 維持原值
  - 僅 `list_type` 一筆被修改
- **DB 需求**：PostgreSQL TestContainer

---

## 二、available-columns API Regression

> **設計依據**：F096 AC-2；F075 BR-13 / AC-10（`is_active=false` 自動排除，無需前端程式碼變更）

---

### TS-F096-API-001：available-columns 不再包含 list_type

- **關聯需求**：F096 AC-2；F075 BR-13（「排除 `is_active=false` 條目」）；AC-10（端點行為）；AD-E07-26 §26.7
- **測試類型**：Positive / Integration（Regression）
- **測試層**：Integration（PostgreSQL TestContainer 或 mock repository）
- **前置條件**：
  - `pooldata_field_whitelist` 中 `list_type` 之 `is_active = false`（m293 up() 已執行）
  - `GET /api/v1/pooldata-fields/available-columns` 端點遵循 F075 BR-13 排除邏輯
- **步驟**：
  1. 呼叫 `GET /api/v1/pooldata-fields/available-columns`（需有效 JWT）
  2. 驗證 response body 中的欄位清單
- **預期結果**：
  - response 中**不含** `{ columnName: 'list_type', ... }` 或 `'list_type'` 相關條目
  - HTTP 200（端點正常，不因移除一個欄位而報錯）
  - **無需前端程式碼變更**（F075 BR-13 既有過濾邏輯自動處理）
- **DB 需求**：PostgreSQL TestContainer（或 mock `pooldata_field_whitelist` repository）

---

### TS-F096-API-002：available-columns 仍包含 case_status（期別篩選正確入口不消失）

- **關聯需求**：F096 AC-2 / AC-3（「`case_status` → `ob_pool_data.list_type` 為唯一期別篩選路徑，不受本 feature 影響」）
- **測試類型**：Positive / Integration（Regression）
- **測試層**：Integration（PostgreSQL TestContainer 或 mock）
- **前置條件**：同 API-001（m293 已執行）
- **步驟**：
  1. 呼叫 `GET /api/v1/pooldata-fields/available-columns`
  2. 在 response 中搜尋 `case_status` 條目
- **預期結果**：
  - response 含 `case_status`（`is_active = true`，未被影響）
  - `case_status` 的 `fieldType` / `label` 等欄位值與 m293 前一致（無副作用）
- **DB 需求**：PostgreSQL TestContainer

---

### TS-F096-API-003：available-columns — m293 前後 diff 驗證（僅 list_type 消失）

- **關聯需求**：F096 AC-1 / AC-2（最小影響原則）
- **測試類型**：Positive / Integration
- **測試層**：Integration（PostgreSQL TestContainer）
- **前置條件**：PostgreSQL TestContainer，`pooldata_field_whitelist` 初始含 `list_type`（`is_active=true`）與其他條目
- **步驟**：
  1. 呼叫 `GET /api/v1/pooldata-fields/available-columns`，記錄 `beforeColumns`（含 `list_type`）
  2. 執行 m293 up()
  3. 再次呼叫 `GET /api/v1/pooldata-fields/available-columns`，記錄 `afterColumns`
  4. 比對 `beforeColumns` 與 `afterColumns` 的差異
- **預期結果**：
  - `afterColumns = beforeColumns - { list_type }`（精確：僅少了 `list_type` 一條）
  - 其他欄位的數量與內容完全相同
- **DB 需求**：PostgreSQL TestContainer

---

## 三、既有名單相容性

> **設計依據**：F096 AC-3 / AC-4；Stage 1 `buildStage1WhereConditions()` 處理既有 `list_type` 條件

---

### TS-F096-COMPAT-001：既有 condition_payload 含 list_type 的名單仍可被 Stage 1 解析執行

- **關聯需求**：F096 AC-4（「停用僅影響『新增條件時的 dropdown 可選項』，不影響既有已存條件之解析」）；AD-E07-26 §26.7
- **測試類型**：Positive / Integration
- **測試層**：Integration（PostgreSQL TestContainer + `buildStage1WhereConditions` mock）
- **前置條件**：
  - 名單 `condition_payload = { conditions: [{ columnName: 'list_type', filterType: 'categorical', values: ['01'] }] }`（m293 前建立的既有名單）
  - `pooldata_field_whitelist` 中 `list_type` 之 `is_active = false`（m293 已執行）
- **步驟**：
  1. 呼叫 `buildStage1WhereConditions(list)`（傳入含 `list_type` condition 的名單）
  2. 驗證函式回傳有效 WHERE fragment
- **預期結果**：
  - `buildStage1WhereConditions` **不丟 CONDITION_COLUMN_NOT_IN_WHITELIST**（停用僅影響前端新增入口，不影響已存條件解析）
  - 回傳的 WHERE fragment 含 `"list_type" IN (:...catX)` 或等效（既有條件仍可執行）
  - **Stage 1 月跑對含 list_type 既有條件之名單，案件挑選行為不受 m293 影響**

---

### TS-F096-COMPAT-002：嘗試新增 list_type 條件 — 後端 CONDITION_COLUMN_NOT_IN_WHITELIST 攔截

- **關聯需求**：F096 AC-4（「後端 `CONDITION_COLUMN_NOT_IN_WHITELIST` 校驗會攔截 `is_active=false` 視同不在白名單」）；F050 / F051 v2.1 後端校驗邏輯
- **測試類型**：Negative / Integration
- **測試層**：Integration（API mock 或 PostgreSQL TestContainer）
- **前置條件**：`pooldata_field_whitelist` 中 `list_type` 之 `is_active = false`
- **步驟**：
  1. 呼叫 `POST /api/v1/assignment/lists`（新增名單），帶入 `condition_payload = { conditions: [{ columnName: 'list_type', ... }] }`
  2. 驗證 API response
- **預期結果**：
  - HTTP 422，錯誤碼 `CONDITION_COLUMN_NOT_IN_WHITELIST`（或等效）
  - 表示 `list_type` 不再是可新增的篩選欄位（defense-in-depth 後端校驗）
  - 前端 dropdown 亦不列出（AC-2 前端無需修改）

---

## 自動化就緒度

| 場景群組 | 自動化適合度 | 說明 |
|---|---|---|
| TS-F096-MIG-001~004（migration / seed）| 高（需 PG TC）| SQL UPDATE 冪等 + 最小影響驗證 |
| TS-F096-API-001~003（available-columns regression）| 高（需 PG TC 或 mock）| F075 BR-13 既有邏輯；diff 驗證為 golden master |
| TS-F096-COMPAT-001~002（既有條件相容）| 高（需 PG TC）| COMPAT-001 依 F050 條件解析邏輯；COMPAT-002 驗後端 422 |
