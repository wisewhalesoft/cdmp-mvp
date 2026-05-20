---
type: test-design-feature
feature_id: F075
feature_name: POOLDATA 篩選欄位白名單管理（含 field_type metadata）
priority: P0-MVP
related_spec: /docs/specs/features/F075-manage-pooldata-field-whitelist.md
spec_version: "1.6"
last_updated: 2026-05-20
covers_ac: [AC-10, AC-11, AC-12, AC-13, AC-14, AC-15]
new_in_v1_4: true
---

# F075: POOLDATA 篩選欄位白名單管理 — 測試設計

> **v1.4 測試設計範圍**：本文件覆蓋 F075 v1.4 新增的 `GET /api/v1/pooldata-fields/available-columns` 端點（AC-10~AC-15）、`getAvailableColumns()` service 方法、`_inferSuggestedFieldType()` pure function、前端下拉 Modal 行為，以及命名漂移回歸防護。v1.0~v1.3 既有 AC（AC-1~AC-9）的測試場景由既有 E2E suite 覆蓋，不在本文件重複列出。

---

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + `F075-manage-pooldata-field-whitelist.md` + `architecture-spec.md §3.10`（v2.12 available-columns 決策）+ `error-handling.md#assignment-code-errors` |
| QA / Tester | 本文件 + `error-handling.md#assignment-code-errors` + `test-levels.md` |
| CI/CD Owner | `test-index.md`（自動化就緒度章節） |
| Product Analyst | `risks-and-gaps.md` |

---

## Glossary（防漂移 — 識別符一覽）

> 所有實作必須嚴格遵守下列識別符，不可替換為括號內的別名。

| 識別符 | 不可改為 |
|---|---|
| `available-columns` | candidates / sourceColumns / poolColumns |
| `availableColumns`（response root key） | candidates / fields / columns |
| `suggestedFieldType` | recommendedType / inferredType / autoType / guessedType |
| `columnName` / `dataType` | column_name / data_type |
| `numeric` / `categorical` / `date` | 不可換用 |
| `POOLDATA_FIELD_DUPLICATE` | WHITELIST_FIELD_DUPLICATE |
| `dropdown-column-name-trigger` | 不改 testid |
| `dropdown-column-name-panel` | 不改 testid |
| `dropdown-column-name-search` | 不改 testid |
| `dropdown-option-${col}` | 不改 testid 格式 |
| `field-type-hint` | 不改 testid |
| `readonly-column-name` | 不改 testid |
| Service method：`getAvailableColumns` | 不改 method 名稱 |
| Service method：`_inferSuggestedFieldType` | 不改 method 名稱 |
| UI 文字：「篩選欄位管理」 | 白名單管理 / POOLDATA 篩選欄位白名單 / 條件欄位管理 |
| UI 文字：「新增篩選欄位」 | 新增白名單欄位 / 新增 POOLDATA 欄位 |

---

## 測試策略概覽

| 項目 | 說明 |
|------|------|
| 主要測試層 | 後端 Unit（service pure function）、後端 Integration（Supertest + SQLite E2E 或 PostgreSQL Test Container）、前端 Component（React Testing Library + MSW） |
| suggestedFieldType 推斷 | `_inferSuggestedFieldType()` 為 pure function，每個 dataType 字串各一 `it()` case，共 15 個 |
| available-columns 過濾 | 含停用欄位過濾（BR-13）需在 PostgreSQL Test Container 中驗證（SQLite 不支援 information_schema） |
| 路由排序回歸 | `GET /api/v1/pooldata-fields/available-columns` 靜態路由必須優先於 `/:columnName` 動態路由，需獨立 E2E 案例驗證 |
| 前端 hint 狀態機 | `data-state` 切換：`suggested` ↔ `user-overridden`（RISK-003 決議：使用者覆寫後即鎖定 user-overridden，僅 dropdown 重選才 reset） |

---

## 後端測試 — 環境策略（RISK-001 決議：方案 C 分層）

> **決議日期**：2026-05-18
>
> E2E 測試依環境能力分層：
>
> | 層級 | 環境 | 涵蓋案例 | 對應測試檔 |
> |------|------|---------|-----------|
> | E2E（SQLite） | SQLite in-memory（既有 suite） | TS-F075-E2E-001~008（Guard / Feature Flag / 路由排序） | `pooldata-field-whitelist.e2e-spec.ts`（補入） |
> | Integration（PostgreSQL TC） | PostgreSQL Test Container（新建） | TS-F075-INT-BE-001~002（過濾邏輯 + 空陣列） | `pooldata-available-columns.integration-spec.ts`（新建） |
>
> **理由**：`information_schema.columns` 為 PostgreSQL 專屬系統目錄，SQLite 不提供對應介面，無法在 SQLite E2E 環境驗證過濾 SQL 行為。PostgreSQL Test Container 在此層獨立啟動，使用最小 schema：僅建立 `pooldata_field_whitelist` 表與 `ob_pool_data`（欄位結構足以供 information_schema 查詢），不需完整 AppDB schema。

---

## 一、Backend 單元測試 — service.spec.ts

### A. `getAvailableColumns()` 整合行為

#### TS-F075-BE-001：正常 happy path — 3 筆未排序 mock → 3 筆升冪 + suggestedFieldType 正確

- **關聯需求**：AC-10、AC-12
- **測試類型**：Positive / Unit
- **前置條件**：mock `dataSource.query` 回傳以下未排序資料（模擬 information_schema 查詢結果）：
  - `[{ column_name: 'zyear', data_type: 'integer' }, { column_name: 'age', data_type: 'date' }, { column_name: 'code', data_type: 'character varying' }]`
- **步驟**：
  1. 呼叫 `getAvailableColumns()`
  2. 驗證回傳值
- **預期結果**：
  - `availableColumns` 長度 = 3
  - 順序為 `age → code → zyear`（字母升冪）
  - `age.columnName='age'`、`age.dataType='date'`、`age.suggestedFieldType='date'`
  - `code.columnName='code'`、`code.dataType='character varying'`、`code.suggestedFieldType='categorical'`
  - `zyear.columnName='zyear'`、`zyear.dataType='integer'`、`zyear.suggestedFieldType='numeric'`
  - response key 均為 camelCase（`columnName` 非 `column_name`；`dataType` 非 `data_type`）

---

#### TS-F075-BE-002：empty 情境 — mock query 回 `[]` → 回傳 `{ availableColumns: [] }`

- **關聯需求**：AC-10、AC-13
- **測試類型**：Positive / Unit
- **前置條件**：mock `dataSource.query` 回傳空陣列 `[]`
- **步驟**：呼叫 `getAvailableColumns()`
- **預期結果**：回傳 `{ availableColumns: [] }`；不拋出例外；HTTP 層收到後應回 200

---

#### TS-F075-BE-003：排序驗證 — mock 5 筆亂序 → 輸出字母升冪

- **關聯需求**：AC-10
- **測試類型**：Positive / Unit
- **前置條件**：mock `dataSource.query` 回傳 `[{column_name:'zyear',...}, {column_name:'age',...}, {column_name:'month_cnt',...}, {column_name:'birth_date',...}, {column_name:'fund_type',...}]`（故意亂序）
- **步驟**：呼叫 `getAvailableColumns()`
- **預期結果**：`availableColumns` 順序為 `age → birth_date → fund_type → month_cnt → zyear`
- **備註**：架構決策（architecture-spec v2.12）指定 SQL 含 `ORDER BY column_name ASC`，但 service 仍應確保輸出順序正確；此 test 以 mock 未排序輸入驗證 service 層排序行為

---

#### TS-F075-BE-004：欄位命名 mapping 正確 — DB 下底線 → response camelCase

- **關聯需求**：AC-10
- **測試類型**：Positive / Unit
- **前置條件**：mock query 回傳 `[{ column_name: 'risk_level', data_type: 'varchar' }]`
- **步驟**：呼叫 `getAvailableColumns()`
- **預期結果**：回傳物件含 `columnName: 'risk_level'`、`dataType: 'varchar'`；不含 `column_name` 或 `data_type` key

---

### B. `_inferSuggestedFieldType()` 推斷規則逐一驗證

> 每個 case 對應一個 `it()` 標題格式：`'_inferSuggestedFieldType("{input}") 應回傳 "{expected}"'`

#### TS-F075-BE-010：`'numeric'` → `'numeric'`

- **關聯需求**：AC-12、BR-12、§5.5
- **前置條件**：輸入 `dataType = 'numeric'`（PostgreSQL information_schema 對應數值型別之實際回傳值）
- **預期結果**：`suggestedFieldType = 'numeric'`

---

#### TS-F075-BE-011：`'integer'` → `'numeric'`

- **關聯需求**：AC-12、BR-12
- **前置條件**：輸入 `dataType = 'integer'`
- **預期結果**：`suggestedFieldType = 'numeric'`

---

#### TS-F075-BE-012：`'bigint'` → `'numeric'`

- **關聯需求**：AC-12、BR-12
- **前置條件**：輸入 `dataType = 'bigint'`
- **預期結果**：`suggestedFieldType = 'numeric'`

---

#### TS-F075-BE-013：`'double precision'` → `'numeric'`

- **關聯需求**：AC-12、BR-12
- **前置條件**：輸入 `dataType = 'double precision'`（含空格，information_schema 原始字串）
- **預期結果**：`suggestedFieldType = 'numeric'`

---

#### TS-F075-BE-014：`'real'` → `'numeric'`

- **關聯需求**：AC-12、BR-12
- **前置條件**：輸入 `dataType = 'real'`
- **預期結果**：`suggestedFieldType = 'numeric'`

---

#### TS-F075-BE-015：`'date'` → `'date'`

- **關聯需求**：AC-12、BR-12
- **前置條件**：輸入 `dataType = 'date'`
- **預期結果**：`suggestedFieldType = 'date'`

---

#### TS-F075-BE-016：`'timestamp without time zone'` → `'date'`

- **關聯需求**：AC-12、BR-12
- **前置條件**：輸入 `dataType = 'timestamp without time zone'`（information_schema 完整名稱，含空格）
- **預期結果**：`suggestedFieldType = 'date'`

---

#### TS-F075-BE-017：`'timestamp with time zone'` → `'date'`

- **關聯需求**：AC-12、BR-12
- **前置條件**：輸入 `dataType = 'timestamp with time zone'`（information_schema 完整名稱）
- **預期結果**：`suggestedFieldType = 'date'`

---

#### TS-F075-BE-018：`'character varying'` → `'categorical'`

- **關聯需求**：AC-12、BR-12（保守原則）
- **前置條件**：輸入 `dataType = 'character varying'`（PostgreSQL VARCHAR 於 information_schema 之標準名稱）
- **預期結果**：`suggestedFieldType = 'categorical'`

---

#### TS-F075-BE-019：`'text'` → `'categorical'`

- **關聯需求**：AC-12、BR-12（保守原則）
- **前置條件**：輸入 `dataType = 'text'`
- **預期結果**：`suggestedFieldType = 'categorical'`

---

#### TS-F075-BE-020：`'boolean'` → `'categorical'`

- **關聯需求**：AC-12、BR-12（保守原則）
- **前置條件**：輸入 `dataType = 'boolean'`
- **預期結果**：`suggestedFieldType = 'categorical'`

---

#### TS-F075-BE-021：`null` → `'categorical'`

- **關聯需求**：AC-12、BR-12（保守原則）
- **前置條件**：輸入 `dataType = null`
- **預期結果**：`suggestedFieldType = 'categorical'`；不拋出例外（null-safe）

---

#### TS-F075-BE-022：`undefined` → `'categorical'`

- **關聯需求**：AC-12、BR-12（保守原則）
- **前置條件**：輸入 `dataType = undefined`
- **預期結果**：`suggestedFieldType = 'categorical'`；不拋出例外（undefined-safe）

---

#### TS-F075-BE-023：`'unknown_type_xyz'` → `'categorical'`

- **關聯需求**：AC-12、BR-12（保守原則）
- **前置條件**：輸入 `dataType = 'unknown_type_xyz'`（無法識別的自訂字串）
- **預期結果**：`suggestedFieldType = 'categorical'`

---

#### TS-F075-BE-024：`'decimal'` → `'categorical'`（Decimal 邊界備忘）

- **關聯需求**：AC-12、§5.5（備忘）
- **測試類型**：Boundary
- **前置條件**：輸入 `dataType = 'decimal'`
- **預期結果**：`suggestedFieldType = 'categorical'`
- **重要備註**：
  - spec §5.5 文件表格列出 `decimal`，但 PostgreSQL `information_schema.columns.data_type` **實際回傳** `'numeric'`，不回傳 `'decimal'`
  - 正常生產路徑由 TS-F075-BE-010（`'numeric'` → `'numeric'`）覆蓋
  - 本 case 驗證「即使傳入 `'decimal'` 字串，保守原則 fallback 行為正確（不誤判為 numeric）」
  - TDD Developer 注意：若日後有特殊需求需將 `'decimal'` 映射為 `'numeric'`，須更新推斷規則表並將本 case 從 `categorical` 改為 `numeric`，**同時更新 spec §5.5**

---

## 二、Backend E2E 測試 — pooldata-field-whitelist.e2e-spec.ts（補入）

> 環境：SQLite in-memory（沿用既有 E2E suite）。本節案例不測試 information_schema 查詢行為（見第三節）。

### A. 權限矩陣 — `GET /api/v1/pooldata-fields/available-columns`

#### TS-F075-E2E-001：部長（`business_role='director'`）→ 200 OK

- **關聯需求**：AC-11
- **測試類型**：Positive
- **前置條件**：部長身份 JWT（`business_role='director'`）；Feature Flag `ENABLE_E07_REFACTOR_PHASE3 = true`
- **步驟**：GET `/api/v1/pooldata-fields/available-columns`
- **預期結果**：HTTP 200；response body 含 `availableColumns` key（值為陣列，空或非空均可）

---

#### TS-F075-E2E-002：Admin → 200 OK

- **關聯需求**：AC-11
- **測試類型**：Positive
- **前置條件**：Admin 身份 JWT；Feature Flag = true
- **步驟**：GET `/api/v1/pooldata-fields/available-columns`
- **預期結果**：HTTP 200；response body 含 `availableColumns` key

---

#### TS-F075-E2E-003：處長（`business_role='section_chief'`）→ 403 `AUTH_FORBIDDEN`

- **關聯需求**：AC-11、BR-5
- **測試類型**：Negative
- **前置條件**：處長身份 JWT（`business_role='section_chief'`）；Feature Flag = true
- **步驟**：GET `/api/v1/pooldata-fields/available-columns`
- **預期結果**：HTTP 403；`errorCode = 'AUTH_FORBIDDEN'`
- **說明**：`GET /available-columns` 受 `DirectorGuard`（非 `DirectorOrSectionChiefGuard`）保護，與寫入端點一致（v2.12 架構決策）

---

#### TS-F075-E2E-004：課長 → 403 `AUTH_FORBIDDEN`

- **關聯需求**：AC-11
- **測試類型**：Negative
- **前置條件**：課長身份 JWT（`business_role` 對應課長角色）；Feature Flag = true
- **步驟**：GET `/api/v1/pooldata-fields/available-columns`
- **預期結果**：HTTP 403；`errorCode = 'AUTH_FORBIDDEN'`

---

#### TS-F075-E2E-005：業務人員 → 403 `AUTH_FORBIDDEN`

- **關聯需求**：AC-11
- **測試類型**：Negative
- **前置條件**：業務人員身份 JWT（`business_role='sales'` 或等效最低業務角色）；Feature Flag = true
- **步驟**：GET `/api/v1/pooldata-fields/available-columns`
- **預期結果**：HTTP 403；`errorCode = 'AUTH_FORBIDDEN'`

---

#### TS-F075-E2E-006：未登入（無 Token）→ 401 `AUTH_TOKEN_MISSING`

- **關聯需求**：§5.5 錯誤碼表
- **測試類型**：Negative
- **前置條件**：無 Authorization header
- **步驟**：GET `/api/v1/pooldata-fields/available-columns`
- **預期結果**：HTTP 401；`errorCode = 'AUTH_TOKEN_MISSING'`

---

### B. Feature Flag 測試

#### TS-F075-E2E-007：Feature Flag 關閉 → 503 `FEATURE_NOT_ENABLED`

- **關聯需求**：BR-10、v1.4 架構決策（§5.5）
- **測試類型**：Negative
- **前置條件**：部長身份 JWT；Feature Flag `ENABLE_E07_REFACTOR_PHASE3 = false`（測試環境注入）
- **步驟**：GET `/api/v1/pooldata-fields/available-columns`
- **預期結果**：HTTP 503；`errorCode = 'FEATURE_NOT_ENABLED'`
- **說明**：`available-columns` 端點屬新增 Modal dropdown 資料來源，強耦合於寫入流程，因此與 POST/PATCH/DELETE 一樣受 FeatureFlagGuard 保護

---

### C. 路由排序回歸測試

#### TS-F075-E2E-008：`available-columns` 靜態路由優先於 `/:columnName` 動態路由

- **關聯需求**：architecture-spec v2.12 §3.10（NestJS 靜態路由優先規則）
- **測試類型**：Regression
- **前置條件**：部長身份 JWT；Feature Flag = true；DB 中不存在 `column_name='available-columns'` 的白名單紀錄
- **步驟**：GET `/api/v1/pooldata-fields/available-columns`
- **預期結果**：HTTP 200（由 `getAvailableColumns` handler 處理），**不為** 404 `POOLDATA_FIELD_NOT_FOUND`
- **失敗判定**：回傳 HTTP 404 表示 `available-columns` 被誤認為 columnName 路徑參數，靜態路由未置頂
- **TDD Developer 注意**：NestJS Controller 內 `@Get('available-columns')` 必須宣告在 `@Get(':columnName')` **之前**

---

## 三、Backend Integration 測試 — pooldata-available-columns.integration-spec.ts（新建）

> **環境**：PostgreSQL Test Container（獨立，僅含 `pooldata_field_whitelist` + `ob_pool_data` 表結構）
> **啟動成本**：約 15-20 秒，建議在 CI 獨立 job 執行（不納入 fast unit test suite）
>
> **Test Container 初始化步驟**（供 TDD Developer 參考）：
> 1. 啟動 PostgreSQL Test Container
> 2. 建立 `pooldata_field_whitelist` 表（含 `column_name VARCHAR UNIQUE`, `is_active BOOLEAN`）
> 3. 建立 `ob_pool_data` 表，含測試所需欄位（DDL 使用各 case 說明中的欄位結構）
> 4. 各 test case 前後清理 `pooldata_field_whitelist` 表（preserve `ob_pool_data` schema）

### A. 過濾邏輯 — BR-13 含停用欄位

#### TS-F075-INT-BE-001：8 筆白名單（7 啟用 + 1 停用 payt_term）+ 1 新欄位 → 只回傳 1 筆

- **關聯需求**：AC-10、BR-13
- **測試類型**：Positive / Integration
- **前置條件**：
  - `ob_pool_data` schema 含欄位：`prod_kind`、`list_type`、`best_case`、`spec_tp`、`caseyear`、`settle_src`、`month_cnt`、`payt_term`、`risk_level`（共 9 欄）
  - `pooldata_field_whitelist` 已有 8 筆：前 7 欄 `is_active=true`，`payt_term` 的 `is_active=false`（停用）
- **步驟**：呼叫 `getAvailableColumns()`（使用真實 DataSource 連至 Test Container）
- **預期結果**：
  - `availableColumns` 長度 = 1
  - `availableColumns[0].columnName = 'risk_level'`
  - `payt_term` **不出現**在結果中（雖已停用，但仍被過濾，符合 BR-13）
- **驗證 BR-13 核心**：停用欄位 `payt_term` 已在 `pooldata_field_whitelist`（`is_active=false`），available-columns 查詢應排除**所有**白名單紀錄（含停用），防止繞過 AC-5 唯一性

---

#### TS-F075-INT-BE-002：所有欄位皆已列入白名單 → 回傳空陣列（合法）

- **關聯需求**：AC-10、AC-13
- **測試類型**：Positive / Integration
- **前置條件**：
  - `ob_pool_data` schema 含欄位：`prod_kind`、`list_type`（共 2 欄，最小化 setup）
  - `pooldata_field_whitelist` 已有 `prod_kind`（`is_active=true`）、`list_type`（`is_active=true`）
- **步驟**：呼叫 `getAvailableColumns()`
- **預期結果**：`{ availableColumns: [] }`；HTTP 200（空陣列為合法狀態，不拋錯）
- **說明**：OBPOOLDATA 所有欄位皆已列入白名單時，Modal 應顯示空態提示，儲存按鈕停用（見 AC-13）

---

## 四、Frontend 測試 — field-whitelist-page.test.tsx（補入）

> **Mock 策略**：使用 MSW（推薦）或 `vi.mock` 攔截以下端點：
> - `GET /api/v1/pooldata-fields/available-columns` → 依各 test case 返回對應 mock response
> - `GET /api/v1/pooldata-fields` → 回傳預設白名單列表（避免頁面初始 render 失敗）
> - `POST /api/v1/pooldata-fields` → 依 test case 返回 201 或 4xx
>
> **標準 available-columns mock response**（3 筆，供多個 case 共用）：
>
> ```json
> {
>   "availableColumns": [
>     { "columnName": "AGE", "dataType": "date", "suggestedFieldType": "date" },
>     { "columnName": "CODE", "dataType": "character varying", "suggestedFieldType": "categorical" },
>     { "columnName": "ZYEAR", "dataType": "integer", "suggestedFieldType": "numeric" }
>   ]
> }
> ```

### A. 渲染驗證 — UI 命名規範（AC-10 §7 UI/UX 需求）

#### TS-F075-FE-001：頁面 H1 / breadcrumb / AppLayout title 顯示「篩選欄位管理」

- **關聯需求**：§7 UI 命名規範、v1.4
- **測試類型**：Positive / Component
- **前置條件**：render 篩選欄位管理頁面元件（部長角色）
- **步驟**：查詢 DOM 中文字
- **預期結果**：
  - H1 文字含「篩選欄位管理」
  - breadcrumb 最末節點文字為「篩選欄位管理」
  - AppLayout title prop 含「篩選欄位管理」
  - 以上三處均不含「白名單管理」或「POOLDATA 篩選欄位白名單」字串

---

#### TS-F075-FE-002：點「新增篩選欄位」按鈕 → Modal 開啟 → Modal 標題為「新增篩選欄位」

- **關聯需求**：AC-13、§7（Modal 標題命名規範）
- **測試類型**：Positive / Component
- **前置條件**：render 頁面（部長角色）；標準 mock response
- **步驟**：
  1. 取得 `data-testid="btn-create-field"` 按鈕
  2. `userEvent.click`
  3. 驗證 Modal
- **預期結果**：
  - Modal（`data-testid="create-field-modal"`）變為可見
  - Modal 標題文字為「新增篩選欄位」
  - 標題不含「新增白名單欄位」或「新增 POOLDATA 欄位」

---

### B. Dropdown 渲染與互動

#### TS-F075-FE-003：Modal 開啟後 dropdown 選項數量正確

- **關聯需求**：AC-13、BR-11
- **測試類型**：Positive / Component
- **前置條件**：render 頁面（部長角色）；standard mock response（3 筆）；Modal 已開啟
- **步驟**：
  1. `userEvent.click` `dropdown-column-name-trigger`（開啟 panel）
  2. 查詢所有 `[data-testid^="dropdown-option-"]` 元素
- **預期結果**：找到 3 個 option 元素（`dropdown-option-AGE`、`dropdown-option-CODE`、`dropdown-option-ZYEAR` 各 1 個）

---

#### TS-F075-FE-004：點 dropdown trigger → panel 可見且 `data-state` 切換為 `'open'`

- **關聯需求**：AC-13
- **測試類型**：Positive / Component
- **前置條件**：同 TS-F075-FE-003
- **步驟**：`userEvent.click` `dropdown-column-name-trigger`
- **預期結果**：
  - `data-testid="dropdown-column-name-panel"` 從 hidden 變為可見
  - `dropdown-column-name-trigger` 的 `data-state` 屬性由 `'closed'` 切換為 `'open'`

---

#### TS-F075-FE-005：搜尋過濾 — 輸入 `'ye'` → 只顯示 zyear

- **關聯需求**：AC-13（dropdown 含搜尋功能）
- **測試類型**：Positive / Component
- **前置條件**：同 TS-F075-FE-003；dropdown panel 已開啟
- **步驟**：
  1. `userEvent.type` `dropdown-column-name-search`，輸入 `'ye'`
  2. 查詢 option 可見性
- **預期結果**：
  - `dropdown-option-zyear` 可見
  - `dropdown-option-age` 不可見
  - `dropdown-option-code` 不可見

---

### C. 點選 dropdown 選項 → hint 與 radio 行為

#### TS-F075-FE-006：選中 AGE（`suggestedFieldType='date'`）→ trigger label 更新 + hint 顯示 + radio 預選 date

- **關聯需求**：AC-14、BR-12
- **測試類型**：Positive / Component
- **前置條件**：standard mock response；Modal 開啟；dropdown panel 開啟
- **步驟**：`userEvent.click` `dropdown-option-age`
- **預期結果**：
  - `dropdown-column-name-trigger` label 文字顯示 `'age'`
  - `field-type-hint` 從 hidden 變為可見
  - `field-type-hint` `data-state` = `'suggested'`
  - hint 文字含「系統推斷」與 `'date'`，且含 `dataType=date` 資訊
  - `field-type-radio-date` 為 checked（`radio.checked = true`）
  - `field-type-radio-numeric`、`field-type-radio-categorical` 未 checked

---

#### TS-F075-FE-007：選中 zyear（`suggestedFieldType='numeric'`）→ radio 預選 numeric

- **關聯需求**：AC-14、BR-12
- **測試類型**：Positive / Component
- **前置條件**：standard mock response；Modal 開啟；dropdown panel 開啟
- **步驟**：`userEvent.click` `dropdown-option-ZYEAR`
- **預期結果**：
  - `field-type-radio-numeric` 為 checked
  - hint 文字含 `'numeric'` 與 `'integer'`（`dataType=integer`）

---

#### TS-F075-FE-008：選中 CODE（`suggestedFieldType='categorical'`）→ radio 預選 categorical

- **關聯需求**：AC-14、BR-12
- **測試類型**：Positive / Component
- **前置條件**：standard mock response；Modal 開啟；dropdown panel 開啟
- **步驟**：`userEvent.click` `dropdown-option-CODE`
- **預期結果**：
  - `field-type-radio-categorical` 為 checked
  - hint 文字含 `'categorical'`

---

### D. 使用者覆寫 radio → hint `data-state` 切換

#### TS-F075-FE-009：覆寫 → hint `data-state` 切換為 `'user-overridden'`

- **關聯需求**：AC-14、BR-12
- **測試類型**：Positive / Component
- **前置條件**：TS-F075-FE-006 完成後（已選中 AGE，`suggestedFieldType='date'`，`data-state='suggested'`）
- **步驟**：`userEvent.click` `field-type-radio-numeric`（覆寫預選值）
- **預期結果**：
  - `field-type-hint` `data-state` 由 `'suggested'` 切換為 `'user-overridden'`
  - `data-hint-variant="user-overridden"` 的元素可見，文字含「使用者選擇」
  - `data-hint-variant="suggested"` 的元素不可見

---

#### TS-F075-FE-010：點回原 suggestedFieldType → `data-state` 仍為 `'user-overridden'`（RISK-003 決議）

- **關聯需求**：AC-14、BR-12
- **測試類型**：Regression
- **前置條件**：TS-F075-FE-009 完成後（已覆寫為 numeric，`data-state='user-overridden'`）
- **步驟**：`userEvent.click` `field-type-radio-date`（點回原 suggestedFieldType `'date'`）
- **預期結果**：
  - `field-type-hint` `data-state` **仍為** `'user-overridden'`（不回到 `'suggested'`）
  - hint 文字仍為「使用者選擇」
- **業務決議（2026-05-18）**：使用者一旦介入 radio 選擇，即視為「使用者決策」語意；即使最終值與系統推斷相同，仍維持 `user-overridden`。唯一重置路徑為「dropdown 重新選擇另一欄位」（觸發 `onColumnSelected`，reset `hasUserOverridden = false`）。
- **TDD Developer 注意**：React state 需維持 `hasUserOverridden: boolean` flag；`dropdown` 重選時呼叫 `setHasUserOverridden(false)`；radio `onChange` 一律呼叫 `setHasUserOverridden(true)`

---

#### TS-F075-FE-011：dropdown 重選另一欄位 → `data-state` 重置為 `'suggested'`

- **關聯需求**：AC-14、BR-12
- **測試類型**：Positive / Component
- **前置條件**：TS-F075-FE-010 完成後（`data-state='user-overridden'`）；dropdown 仍開啟或重新開啟
- **步驟**：`userEvent.click` `dropdown-option-CODE`（重選不同欄位）
- **預期結果**：
  - `field-type-hint` `data-state` 重置為 `'suggested'`
  - radio 重新預選為 CODE 的 `suggestedFieldType`（`'categorical'`）
  - hint 文字再次顯示「系統推斷」文字

---

### E. Empty 情境

#### TS-F075-FE-012：API 回空陣列 → dropdown 空態顯示 + submit 停用

- **關聯需求**：AC-13、BR-11
- **測試類型**：Negative / Component
- **前置條件**：mock `GET /api/v1/pooldata-fields/available-columns` 回 `{ "availableColumns": [] }`；Modal 開啟
- **步驟**：
  1. `userEvent.click` `dropdown-column-name-trigger`
  2. 驗證空態與按鈕狀態
- **預期結果**：
  - dropdown panel 開啟後顯示空態提示（prototype `#columnDropdownEmpty`，建議補 `data-testid="dropdown-column-name-empty"`）
  - `btn-submit-create-field` 具有 `disabled` 屬性
- **RISK-F075-004**：prototype 原始 `#columnDropdownEmpty` 無 testid；TDD Developer 實作時需補充 `data-testid="dropdown-column-name-empty"` 至對應元素

---

### F. 成功與錯誤 Toast

#### TS-F075-FE-013：新增成功 → toast 以 displayName 為主（AC-15）

- **關聯需求**：AC-15
- **測試類型**：Positive / Component
- **前置條件**：
  - standard mock response
  - mock `POST /api/v1/pooldata-fields` 回傳 201：`{ "columnName": "risk_level", "displayName": "風險等級", "fieldType": "categorical", "isActive": true }`
  - Modal 已填寫：選擇 zyear（或任意欄位）、displayName 輸入「風險等級」、fieldType 選 categorical
- **步驟**：`userEvent.click` `btn-submit-create-field`
- **預期結果**：
  - toast 文字含「欄位『風險等級』已新增」
  - toast 文字**不以** `'risk_level'`（columnName）為主標
  - Modal 關閉

---

#### TS-F075-FE-014：POST 回 409 `POOLDATA_FIELD_DUPLICATE` → 錯誤 toast

- **關聯需求**：AC-5
- **測試類型**：Negative / Component
- **前置條件**：mock `POST /api/v1/pooldata-fields` 回 409：`{ "errorCode": "POOLDATA_FIELD_DUPLICATE" }`
- **步驟**：submit Modal
- **預期結果**：
  - 顯示錯誤提示（含「已存在」或對應語意）
  - Modal **不關閉**
  - `errorCode` 不含 `'WHITELIST_FIELD_DUPLICATE'`（已廢棄字串）

---

#### TS-F075-FE-015：POST 回 500 → 一般性錯誤 toast，Modal 不關閉

- **關聯需求**：§7（UI 錯誤處理）
- **測試類型**：Negative / Component
- **前置條件**：mock `POST /api/v1/pooldata-fields` 回 500 internal server error
- **步驟**：submit Modal
- **預期結果**：顯示一般性錯誤 toast；Modal 不關閉

---

### G. Edit 模式 Regression

#### TS-F075-FE-016：開啟 Edit Modal → dropdown 區塊不存在（非 CSS 隱藏）+ readonly chip 顯示 + hint 不存在

- **關聯需求**：AC-6、§7（編輯 Modal 設計）
- **測試類型**：Regression
- **前置條件**：render 頁面（部長角色）；某欄位（如 prod_kind）的「編輯」按鈕可點擊
- **步驟**：`userEvent.click` 對應欄位的「編輯」按鈕
- **預期結果**：
  - `dropdown-column-name-trigger` 在 DOM 中不存在（非 `display:none`）；或其父容器 `columnDropdownWrap` 不可見
  - `readonly-column-name` 元素可見，文字顯示正確的 columnName（如 `'prod_kind'`）
  - `field-type-hint` 在 DOM 中不存在（Edit 模式無需 suggested hint，使用者已知欄位）
- **說明**：防止 v1.4 新增 dropdown 邏輯影響既有 Edit 流程

---

## 五、跨模組整合測試

#### TS-F075-INT-001：F075 GET `/api/v1/pooldata-fields` contract 不破壞（F050 下游相容）

- **關聯需求**：F075 §8（Blocks F050 v2.0）
- **測試類型**：Integration（跨模組）
- **前置條件**：DB 含預設 seed 8 筆白名單
- **步驟**：呼叫 `GET /api/v1/pooldata-fields`
- **預期結果**：
  - HTTP 200
  - response 含 `{ "fields": [...] }` root key（v1.4 未更動此端點）
  - 每筆含 `columnName`、`displayName`、`fieldType`、`isActive`（F050 所需欄位格式）
  - v1.4 新增的 `available-columns` 端點不影響此端點行為

---

#### TS-F075-INT-002：F075 新增 categorical 欄位 → F076 可選值維護頁可見

- **關聯需求**：F075 §8（Blocks F076）
- **測試類型**：Integration（跨模組）
- **前置條件**：DB 中不存在 `risk_level` 欄位
- **步驟**：
  1. `POST /api/v1/pooldata-fields` 新增 `{ columnName: 'risk_level', displayName: '風險等級', fieldType: 'categorical' }`（部長 JWT）
  2. `GET /api/v1/pooldata-fields?active=true`（F076 所使用的端點）
- **預期結果**：
  - 步驟 1 回 HTTP 201
  - 步驟 2 response 的 `fields` 陣列中含 `risk_level`，且 `fieldType = 'categorical'`

---

## 六、風險與決議紀錄

### 已決議項目

| ID | 描述 | 決議 | 日期 |
|---|---|---|---|
| RISK-F075-001 | E2E SQLite vs PostgreSQL 衝突（information_schema 不存在於 SQLite） | 方案 C 分層：Guard/Feature Flag/路由 → SQLite E2E；過濾邏輯 → 獨立 PostgreSQL Test Container（`pooldata-available-columns.integration-spec.ts`） | 2026-05-18 |
| RISK-F075-003 | 點回 suggestedFieldType 是否 reset data-state | 決議：點回原值**不重置**，仍維持 `user-overridden`；唯一重置路徑為 dropdown 重選欄位；TS-F075-FE-010 已採此行為驗證 | 2026-05-18 |

### 待確認項目

| ID | 描述 | 影響 | 建議動作 |
|---|---|---|---|
| RISK-F075-002 | `'decimal'` 字串：spec §5.5 文件列 `decimal`，但 information_schema 實際回傳 `numeric` | TS-F075-BE-024 定義 `decimal` → `categorical`（保守）；若需 `decimal` → `numeric`，須同步更新 spec §5.5 與推斷規則 | 向 Architect 確認 information_schema 是否可能回傳 `decimal` |
| RISK-F075-004 | `columnDropdownEmpty` prototype 元素無 testid | TS-F075-FE-012 無法用 `getByTestId('dropdown-column-name-empty')` 定位 | TDD Developer 實作時補充 `data-testid="dropdown-column-name-empty"`（13 個已定義 testid 不含此項） |
| RISK-F075-005 | `ob_pool_data` vs `ob_pool_data` table_name 大小寫 | information_schema 查詢的 `table_name` 字串需精確比對 DB 實際表名 | architecture-spec v2.12 §3.10 以 `table_name='ob_pool_data'`（小寫底線）為準；Test Container DDL 需用相同名稱 |
| RISK-F075-006 | M06 regression guard 文件格式需與 M02-regression-guards.md 一致 | 若格式不同 QA Agent 讀取困難 | M06-regression-guards.md 以 M02 文件為範本（已執行） |

---

## 八、v1.5 新增測試場景（F050 v2.1 重構配套）

> 以下 2 個場景對應 F075 v1.5 修訂（whitelist seed 從 5 筆更新為 6 筆，加入 case_status）及 F050 v2.1 whitelist-driven 整合需求。

### TS-F075-049：whitelist seed 含 case_status 欄位（v1.5，共 6 筆）

- **關聯需求**：F075 AC-1 v1.5 / F076 AC-3 v1.5 / MT-M4-002
- **測試類型**：Positive / Migration Integration（DB 驗證）
- **前置條件**：M4（`1711360000284-SeedCaseStatusWhitelistAndOptions.ts`）up() 已執行
- **步驟**：
  1. 查詢 `SELECT COUNT(*) FROM pooldata_field_whitelist WHERE is_active = true`
  2. 查詢 `SELECT column_name FROM pooldata_field_whitelist WHERE column_name = 'case_status'`
- **預期結果**：
  - whitelist 共 6 筆（prod_kind / caseyear / spec_tp / case_status / settle_src + 1 筆視 spec 確認）
  - `case_status` 欄位存在，`field_type = 'categorical'`，`is_active = true`

---

### TS-F075-050：GET /api/v1/pooldata-fields/whitelist 回傳 case_status（v1.5 整合）

- **關聯需求**：F075 AC-1 v1.5 / F050 AC-6（columnName 需通過 whitelist 驗證）
- **測試類型**：Positive / Integration（Supertest）
- **前置條件**：M4 seed 已執行；應用程式正常啟動
- **步驟**：
  1. GET `/api/v1/pooldata-fields/whitelist?active=true`
  2. 驗證 response 中含 case_status 欄位
- **預期結果**：
  - response items 陣列含 `{ columnName: "case_status", fieldType: "categorical", isActive: true }`
  - F050 POST 建立名單時 `columnName: "case_status"` 可通過 whitelist 驗證（不回 422 CONDITION_COLUMN_NOT_IN_WHITELIST）

---

## 七、迴歸防護參考

- `docs/test-specs/regression/M06-regression-guards.md`（本 Feature 對應迴歸防護文件）
  - TC-GUARD-M06-NAMING-001：spec + prototype 關鍵字存在性 / 禁用字串掃描
  - TC-GUARD-M06-NAMING-002：source code 禁用識別符掃描
  - TC-GUARD-M06-F068-001：F068 module 目錄刪除驗證（F050 v2.1 配套）
  - TC-GUARD-M06-F068-002：F068 廢棄錯誤碼不存在於 src/ 驗證
  - TC-GUARD-M06-SIDEBAR-001：Sidebar 不含 F068 廢棄入口（F050 v2.1 配套）

---

## 測試案例數統計

| 分區 | 案例 ID 範圍 | 數量 |
|------|------------|------|
| Backend service 單元測試（A+B） | TS-F075-BE-001~024 | 18 |
| Backend E2E — SQLite（A+B+C） | TS-F075-E2E-001~008 | 8 |
| Backend Integration — PostgreSQL TC（A） | TS-F075-INT-BE-001~002 | 2 |
| Frontend component（A+B+C+D+E+F+G） | TS-F075-FE-001~016 | 16 |
| 跨模組整合 | TS-F075-INT-001~002 | 2 |
| v1.5 新增（F050 v2.1 配套） | TS-F075-049~050 | 2 |
| v1.6 新增（F050 v2.1.1 M-A1 配套） | TS-F075-051~053 | 3 |
| Regression Guard（見 M06-regression-guards.md） | TC-GUARD-M06-NAMING-001~002 | 2 |
| **合計** | | **51** |

---

## 九、v1.6 新增測試場景（F050 v2.1.1 M-A1 seed 配套）

> **v1.6 範圍說明**：F050 v2.1.1 引入 Migration M-A1（`m286-SeedBestCaseFieldAndOptions.ts`），將 `best_case` 寫入 `pooldata_field_whitelist`，使其成為合法篩選欄位。本節場景驗證此 whitelist seed 正確落地，並與 F050-test.md A 群組（TS-F050-A01~A07）形成雙向引用。
>
> **cross-ref**：`docs/test-specs/features/F050-test.md` § 十四 A 群組（Migration M-A1 驗證，TS-F050-A01~A07）

---

### TS-F075-051：M-A1 seed 後 pooldata_field_whitelist 含 best_case 欄位

- **關聯需求**：F075 AC-1 / US-129 AC-2 / TS-F050-A01（跨 Feature 引用）
- **測試類型**：Positive / Migration Integration（DB 驗證）
- **前置條件**：M-A1（`m286-SeedBestCaseFieldAndOptions.ts`）up() 已執行；`pooldata_field_whitelist` 中 `best_case` 尚不存在（或 M-A1 為初次執行）
- **步驟**：
  1. 查詢 `SELECT column_name, field_type, is_active FROM pooldata_field_whitelist WHERE column_name = 'best_case'`
- **預期結果**：
  - 回傳 1 筆
  - `field_type = 'categorical'`
  - `is_active = true`

---

### TS-F075-052：M-A1 seed 重複執行後 best_case 在 whitelist 僅 1 筆（DO NOTHING 冪等）

- **關聯需求**：F075 AC-1 / US-129 AC-5（冪等） / TS-F050-A05（跨 Feature 引用）
- **測試類型**：Boundary / Migration Integration（DB 驗證）
- **前置條件**：M-A1 up() 已執行一次
- **步驟**：
  1. 再次執行 M-A1 up()（第二次）
  2. 查詢 `SELECT COUNT(*) FROM pooldata_field_whitelist WHERE column_name = 'best_case'`
- **預期結果**：count = 1（DO NOTHING 語意，重複執行不新增）

---

### TS-F075-053：M-A1 seed 後 GET /api/v1/pooldata-fields/whitelist 回傳含 best_case

- **關聯需求**：F075 AC-1 / F050 AC-6（columnName 需通過 whitelist 驗證）/ TS-F050-A07（跨 Feature 引用）
- **測試類型**：Positive / Integration（Supertest）
- **前置條件**：M-A1 seed 已執行；應用程式正常啟動
- **步驟**：
  1. GET `/api/v1/pooldata-fields/whitelist?active=true`
  2. 驗證 response 含 best_case
- **預期結果**：
  - response items 陣列含 `{ columnName: "best_case", fieldType: "categorical", isActive: true }`
  - F050 POST 建立名單時 `columnName: "best_case"` 可通過 whitelist 驗證（不回 422 CONDITION_COLUMN_NOT_IN_WHITELIST）
  - **注意**：`best_case` 的有效選項值為大寫 `'Y'`、`'N'`（ob_pool_data ETL 儲存為 varchar(1) 大寫；mock 必須使用大寫，見 [[feedback_mock_real_system_contract]]）

---

### M-A1 UPSERT 語意說明（for TDD Developer）

> **重要**：M-A1 best_case whitelist 的 INSERT 使用 **`DO NOTHING`**（與 M-A2 M-A1 best_case options 的 `DO UPDATE SET option_label` 不同）。原因：whitelist 欄位本身無 label 欄位需覆寫；而 `pooldata_field_option` 的 best_case 選項（`Y` / `N`）使用 `DO UPDATE SET option_label = EXCLUDED.option_label`，確保覆寫 m240 可能的舊標籤（例如 `N='一般案件'` → `N='非優質案件'`）。
>
> - whitelist seed：`INSERT ... ON CONFLICT (column_name) DO NOTHING`
> - options seed：`INSERT ... ON CONFLICT (column_name, option_value) DO UPDATE SET option_label = EXCLUDED.option_label`
>
> **cross-ref**：TS-F050-A03（DO UPDATE 語意驗證）、TS-F050-A04（label 覆寫驗證）
