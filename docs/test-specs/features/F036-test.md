---
type: test-design-feature
feature_id: F036
feature_name: 目標表 Domain-Oriented 規劃
priority: P0-MVP
related_spec: /docs/specs/features/F036-target-tables.md
related_story: /docs/stories/epics/E05-etl-pipeline/US-049-target-tables.md
last_updated: 2026-03-25
version: "2.0"
changelog: "重大修訂：由 4 個目標表（舊版）改為 1 個目標表 customer_core（約 45 欄、A~H 八分類）；新增 ETL 轉換規則測試（電話合併、佔位值、型別轉換、衝突解決、代碼描述）；新增前端欄位對應介面測試"
---

# F036: 目標表 Domain-Oriented 規劃 — 測試設計（v2.0）

> **重要異動說明**：本文件已於 2026-03-25 依 US-049 修訂版全面更新。
> Phase 1 MVP 目標表由舊版 4 個（customer_core / customer_interaction / customer_financial / customer_service）調整為 **1 個**（`customer_core`，約 45 欄位，分 A~H 八個分類）。
> customer_interaction / customer_financial / customer_service 移至 Phase 2/3，不在本版本測試範圍內。

---

## Acceptance Test Design

### AC-1：目標表清單 API

| 項目 | 內容 |
|------|------|
| Given | Admin 已登入；系統 Phase 1 MVP 僅預先定義 `customer_core` 一個目標表 |
| When | 呼叫 `GET /api/v1/etl/target-tables` |
| Then | HTTP 200；`data` 陣列含 **1 個**目標表物件；物件含 `tableName`、`displayName`、`domain`、`columnCount`、`description` 欄位 |
| 驗證步驟 | 1. `data.length === 1`<br>2. `data[0].tableName === "customer_core"`<br>3. `data[0].domain === "core"`<br>4. `data[0].columnCount === 45`（允許 ±1，以實際 schema 定義為準）<br>5. `data[0].displayName` 含「Customer Core」字樣<br>6. `data[0].description` 為非空字串 |

### AC-2：目標表 Schema API

| 項目 | 內容 |
|------|------|
| Given | Admin 已登入；指定目標表 `customer_core` 存在 |
| When | 呼叫 `GET /api/v1/etl/target-tables/customer_core/schema` |
| Then | HTTP 200；回應含 `tableName`、`displayName`、`columns` 陣列；`columns` 中每個物件含 `name`、`type`、`nullable`、`isPrimaryKey`、`description` |
| 驗證步驟 | 1. `columns` 陣列長度約 45（以 schema 定義為準）<br>2. 主鍵 `customer_id`：`isPrimaryKey === true`、`nullable === false`、`type === "UUID"`<br>3. 三個 ETL 追蹤欄位（`data_source`、`_etl_loaded_at`、`_etl_pipeline_id`）均存在<br>4. `_etl_loaded_at.nullable === false`；`_etl_pipeline_id.nullable === false`<br>5. 所有 `columns` 物件均含非空 `description` |

### AC-3：Load 節點選擇目標表（前端）

| 項目 | 內容 |
|------|------|
| Given | Admin 在 Pipeline 編輯器中新增或編輯 Load 節點 |
| When | 開啟目標表選擇器下拉選單 |
| Then | 下拉選單顯示 `customer_core`；選擇後系統自動載入該表的欄位定義至欄位對應介面 |
| 驗證步驟 | 1. 下拉選單選項數 = 1（Phase 1 MVP）<br>2. 選擇後欄位對應介面右側欄位清單出現，數量與 `columnCount` 一致<br>3. ETL 追蹤欄位（`data_source`、`_etl_loaded_at`、`_etl_pipeline_id`）標示為「系統自動填充」並呈現灰色、不可手動拖曳 |

### AC-4：欄位對應介面（前端）

| 項目 | 內容 |
|------|------|
| Given | Admin 已選擇目標表 `customer_core` |
| When | 系統顯示欄位對應介面 |
| Then | 左側顯示來源欄位（上游節點輸出），右側顯示目標表欄位，支援拖曳或下拉選單進行一對一對應 |
| 驗證步驟 | 1. 左側列出上游節點所有輸出欄位<br>2. 右側列出 `customer_core` 所有欄位（含已對應/未對應狀態）<br>3. 可進行拖曳或下拉選單一對一對應<br>4. 已對應欄位以視覺化連線或選取標示呈現<br>5. 清除對應後連線消失 |

### AC-5：ETL 追蹤欄位自動填充

| 項目 | 內容 |
|------|------|
| Given | Pipeline 包含 Load 節點，目標表為 `customer_core`，Pipeline 狀態為 published |
| When | ETL Pipeline 執行 Load 步驟，將資料寫入 `customer_core` |
| Then | 每筆寫入資料的 `data_source`、`_etl_loaded_at`、`_etl_pipeline_id` 均由系統自動填充，不為 null，無需使用者手動對應 |
| 驗證步驟 | 1. `data_source` = Pipeline 使用的 Datasource 名稱（非 null）<br>2. `_etl_loaded_at` 為 UTC TIMESTAMP，介於 Pipeline 執行開始與結束時間之間<br>3. `_etl_pipeline_id` = UUID，與本次執行的 Pipeline ID 一致 |

### AC-6：customer_core Schema 預定義正確（Phase 1 MVP）

| 項目 | 內容 |
|------|------|
| Given | 系統初始化完成（migration 已執行） |
| When | 查詢 `GET /api/v1/etl/target-tables` 及 `GET /api/v1/etl/target-tables/customer_core/schema` |
| Then | Phase 1 MVP 僅含 `customer_core` 一個目標表（約 45 欄位），涵蓋 A~H 八個分類，欄位定義與 US-049 規格一致 |
| 驗證步驟 | 1. `data.length === 1`（不含 Phase 2/3 表）<br>2. 欄位涵蓋 A（識別與分類）、B（個人屬性）、C（聯絡資訊）、D（地址）、E（職業與就業）、F（財務與風控）、G（企業客戶專屬）、H（稽核與 ETL 追蹤）<br>3. 各欄位的 `type`、`nullable`、`isPrimaryKey` 與 US-049 欄位定義表一致 |

---

## Test Scenarios

### 類別一：GET /api/v1/etl/target-tables — Positive Scenarios

#### TS-F036-001：Phase 1 MVP 僅回傳 1 個目標表

- **Related Requirement**: AC-1, AC-6
- **Test Type**: Integration / Positive
- **Preconditions**: Admin 已登入（有效 JWT Token）；系統 migration 已執行
- **Steps**:
  1. 以有效 Admin Token 呼叫 `GET /api/v1/etl/target-tables`
- **Expected Result**: HTTP 200；`data` 陣列長度精確等於 **1**；`data[0].tableName === "customer_core"`；不含 `customer_interaction`、`customer_financial`、`customer_service`

---

#### TS-F036-002：目標表清單回應結構完整

- **Related Requirement**: AC-1
- **Test Type**: Integration / Positive
- **Preconditions**: Admin 已登入
- **Steps**:
  1. 呼叫 `GET /api/v1/etl/target-tables`
  2. 驗證 `data[0]` 的物件結構
- **Expected Result**: `data[0]` 含且僅含 `tableName`（string）、`displayName`（string）、`domain`（string）、`columnCount`（number）、`description`（string）五個欄位；各欄位型別正確且值非空

---

#### TS-F036-003：customer_core columnCount 與 domain 值正確

- **Related Requirement**: AC-1, AC-6
- **Test Type**: Integration / Positive
- **Preconditions**: Admin 已登入
- **Steps**:
  1. 呼叫 `GET /api/v1/etl/target-tables`
  2. 驗證 `data[0].columnCount` 與 `data[0].domain`
- **Expected Result**: `columnCount === 45`（以 schema 定義實際值為準，允許微小差異）；`domain === "core"`；`displayName` 含「Customer Core」

---

### 類別二：GET /api/v1/etl/target-tables/:tableName/schema — Positive Scenarios

#### TS-F036-004：customer_core schema 欄位總數正確

- **Related Requirement**: AC-2, AC-6
- **Test Type**: Integration / Positive
- **Preconditions**: Admin 已登入
- **Steps**:
  1. 呼叫 `GET /api/v1/etl/target-tables/customer_core/schema`
  2. 驗證 `columns.length`
- **Expected Result**: HTTP 200；`tableName === "customer_core"`；`columns.length` 約 45（以 migration schema 實際欄位數為準）

---

#### TS-F036-005：識別與分類欄位（A 類）定義正確

- **Related Requirement**: AC-2, AC-6
- **Test Type**: Integration / Positive
- **Preconditions**: Admin 已登入
- **Steps**:
  1. 呼叫 `GET /api/v1/etl/target-tables/customer_core/schema`
  2. 從 `columns` 中篩選 A 類欄位並逐一驗證
- **Expected Result**:
  - `customer_id`：`type="UUID"`, `nullable=false`, `isPrimaryKey=true`
  - `source_customer_no`：`type` 含 `VARCHAR`, `nullable=false`, `isPrimaryKey=false`
  - `customer_type`：`type` 含 `VARCHAR`, `nullable=false`
  - `name`：`type` 含 `VARCHAR`, `nullable=false`
  - `english_name`：`type` 含 `VARCHAR`, `nullable=true`

---

#### TS-F036-006：個人屬性欄位（B 類）定義正確

- **Related Requirement**: AC-2, AC-6
- **Test Type**: Integration / Positive
- **Preconditions**: Admin 已登入
- **Steps**:
  1. 呼叫 `GET /api/v1/etl/target-tables/customer_core/schema`
  2. 從 `columns` 中篩選 B 類欄位並逐一驗證
- **Expected Result**:
  - `gender`：`nullable=true`
  - `date_of_birth`：`type="DATE"`, `nullable=true`
  - `marital_status`：`nullable=true`
  - `education_code`：`nullable=true`
  - `education_desc`：`nullable=true`（US-030 代碼轉換填入）

---

#### TS-F036-007：聯絡資訊欄位（C 類）定義正確

- **Related Requirement**: AC-2, AC-6
- **Test Type**: Integration / Positive
- **Preconditions**: Admin 已登入
- **Steps**:
  1. 呼叫 `GET /api/v1/etl/target-tables/customer_core/schema`
  2. 從 `columns` 中篩選 C 類欄位並逐一驗證
- **Expected Result**:
  - `mobile_phone`、`home_phone`、`contact_phone`、`office_phone`：均 `nullable=true`，`type` 含 `VARCHAR`
  - `email`：`nullable=true`，`type` 含 `VARCHAR`
  - `line_account`：`nullable=true`，`type` 含 `VARCHAR`

---

#### TS-F036-008：財務與風控欄位（F 類）型別定義正確

- **Related Requirement**: AC-2, AC-6
- **Test Type**: Integration / Positive
- **Preconditions**: Admin 已登入
- **Steps**:
  1. 呼叫 `GET /api/v1/etl/target-tables/customer_core/schema`
  2. 篩選 F 類欄位，驗證 DECIMAL 欄位型別
- **Expected Result**:
  - `monthly_income`：`type` 含 `DECIMAL`
  - `capital`：`type` 含 `DECIMAL`
  - `credit_limit`：`type` 含 `DECIMAL`
  - `address_anomaly_flag`：`type === "SMALLINT"` 或 `"INTEGER"`
  - `mainland_flag`：`type === "SMALLINT"` 或 `"INTEGER"`
  - `debt_flag`、`fine_flag`：`type` 含 `CHAR` 或 `VARCHAR`

---

#### TS-F036-009：ETL 追蹤欄位（H 類）標示正確

- **Related Requirement**: AC-2, AC-5
- **Test Type**: Integration / Positive
- **Preconditions**: Admin 已登入
- **Steps**:
  1. 呼叫 `GET /api/v1/etl/target-tables/customer_core/schema`
  2. 篩選 H 類欄位，驗證 ETL 追蹤欄位屬性
- **Expected Result**:
  - `data_source`：`nullable=false`（NOT NULL 業務欄位）
  - `_etl_loaded_at`：`type="TIMESTAMP"`, `nullable=false`
  - `_etl_pipeline_id`：`type="UUID"`, `nullable=false`
  - `source_created_at`：`type="TIMESTAMP"`, `nullable=true`
  - `source_updated_at`：`type="TIMESTAMP"`, `nullable=true`

---

#### TS-F036-010：主鍵欄位標示正確

- **Related Requirement**: AC-2
- **Test Type**: Integration / Positive
- **Preconditions**: Admin 已登入
- **Steps**:
  1. 呼叫 `GET /api/v1/etl/target-tables/customer_core/schema`
  2. 篩選 `isPrimaryKey === true` 的欄位
- **Expected Result**: 恰好 1 個欄位 `isPrimaryKey === true`；名稱為 `customer_id`；`nullable === false`；`type === "UUID"`；所有其他欄位 `isPrimaryKey === false`

---

#### TS-F036-011：所有欄位均含非空 description

- **Related Requirement**: AC-2
- **Test Type**: Integration / Positive
- **Preconditions**: Admin 已登入
- **Steps**:
  1. 呼叫 `GET /api/v1/etl/target-tables/customer_core/schema`
  2. 遍歷所有 `columns`，驗證每個物件的 `description` 欄位
- **Expected Result**: `columns` 中所有物件均含 `description`，且值為非空字串（`description !== ""`，`description !== null`）

---

### 類別三：Negative Scenarios

#### TS-F036-012：查詢不存在的目標表回 404

- **Related Requirement**: US-049 邊界情況
- **Test Type**: Integration / Negative
- **Preconditions**: Admin 已登入
- **Steps**:
  1. 呼叫 `GET /api/v1/etl/target-tables/customer_unknown/schema`
- **Expected Result**: HTTP 404；`error.code === "PIPELINE_TARGET_TABLE_NOT_FOUND"`；不回傳任何 schema 資料

---

#### TS-F036-013：查詢 Phase 2/3 未建立表回 404

- **Related Requirement**: AC-6（Phase 邊界）
- **Test Type**: Integration / Negative
- **Preconditions**: Admin 已登入；Phase 1 MVP 系統（僅建立 `customer_core`）
- **Steps**:
  1. 分別呼叫 `GET /api/v1/etl/target-tables/customer_interaction/schema`
  2. 呼叫 `GET /api/v1/etl/target-tables/customer_financial/schema`
  3. 呼叫 `GET /api/v1/etl/target-tables/customer_service/schema`
- **Expected Result**: 三個呼叫均回傳 HTTP 404；`error.code === "PIPELINE_TARGET_TABLE_NOT_FOUND"`；確認 Phase 2/3 表未預先建立

---

#### TS-F036-014：User 角色存取目標表清單 API 回 403

- **Related Requirement**: BR-1, RBAC
- **Test Type**: Integration / Negative
- **Preconditions**: 已登入 User 角色（非 Admin）
- **Steps**:
  1. 以 User Token 呼叫 `GET /api/v1/etl/target-tables`
- **Expected Result**: HTTP 403；`error.code === "AUTH_FORBIDDEN"`

---

#### TS-F036-015：User 角色存取目標表 Schema API 回 403

- **Related Requirement**: BR-1, RBAC
- **Test Type**: Integration / Negative
- **Preconditions**: 已登入 User 角色
- **Steps**:
  1. 以 User Token 呼叫 `GET /api/v1/etl/target-tables/customer_core/schema`
- **Expected Result**: HTTP 403；`error.code === "AUTH_FORBIDDEN"`

---

#### TS-F036-016：未登入存取目標表清單 API 回 401

- **Related Requirement**: 認證
- **Test Type**: Integration / Negative
- **Preconditions**: 無 Authorization Header
- **Steps**:
  1. 呼叫 `GET /api/v1/etl/target-tables`（不含 Token）
- **Expected Result**: HTTP 401；`error.code === "AUTH_TOKEN_MISSING"`

---

#### TS-F036-017：未登入存取目標表 Schema API 回 401

- **Related Requirement**: 認證
- **Test Type**: Integration / Negative
- **Preconditions**: 無 Authorization Header
- **Steps**:
  1. 呼叫 `GET /api/v1/etl/target-tables/customer_core/schema`（不含 Token）
- **Expected Result**: HTTP 401；`error.code === "AUTH_TOKEN_MISSING"`

---

### 類別四：ETL 轉換規則 — Unit Tests

#### TS-F036-018：電話合併函式 — 正常合併

- **Related Requirement**: US-049 ETL 轉換規則（電話合併）
- **Test Type**: Unit / Positive
- **Preconditions**: 電話合併轉換函式已實作
- **Steps**:
  1. 傳入 `areaCode = "02"`, `telNo = "27123456"`
  2. 呼叫電話合併函式
- **Expected Result**: 回傳 `"02-27123456"`（格式為 `{區碼}-{號碼}`）

---

#### TS-F036-019：電話合併函式 — 佔位值過濾為 NULL

- **Related Requirement**: US-049 ETL 轉換規則（佔位值→NULL）
- **Test Type**: Unit / Negative（邊界）
- **Preconditions**: 電話合併轉換函式已實作；已知佔位值為 `00-0000000000`
- **Steps**:
  1. 傳入 `areaCode = "00"`, `telNo = "0000000000"`
  2. 呼叫電話合併函式
- **Expected Result**: 回傳 `null`（不回傳 `"00-0000000000"` 或空字串）

---

#### TS-F036-020：電話合併函式 — 各電話欄位佔位值均過濾

- **Related Requirement**: US-049 ETL 轉換規則（C 類聯絡資訊）
- **Test Type**: Unit / Boundary
- **Preconditions**: 電話合併轉換函式已實作
- **Steps**:
  1. 對 `home_phone`（CAREA_NO1 + CTEL_NO1）傳入佔位值
  2. 對 `contact_phone`（CAREA_NO2 + CTEL_NO2）傳入佔位值
  3. 對 `office_phone`（CO_CAREA_NO + CO_CTEL_NO）傳入佔位值
- **Expected Result**: 三個欄位均回傳 `null`

---

#### TS-F036-021：電話合併函式 — 區碼或號碼為空時回傳 NULL

- **Related Requirement**: US-049 ETL 轉換規則（邊界情況）
- **Test Type**: Unit / Boundary
- **Preconditions**: 電話合併轉換函式已實作
- **Steps**:
  1. 傳入 `areaCode = null`, `telNo = "27123456"`
  2. 傳入 `areaCode = "02"`, `telNo = null`
  3. 傳入 `areaCode = ""`, `telNo = ""`
- **Expected Result**: 三種情況均回傳 `null`（不拋出例外）

---

#### TS-F036-022：DECIMAL 型別轉換函式 — 有效 varchar 數字

- **Related Requirement**: US-049 ETL 轉換規則（資本額型別：varchar→DECIMAL）
- **Test Type**: Unit / Positive
- **Preconditions**: varchar→DECIMAL 轉換函式已實作（對應 MLMC.CUSTNOWCAPTIAL）
- **Steps**:
  1. 傳入字串 `"5000000"` 呼叫轉換函式
  2. 傳入字串 `"12500000.50"` 呼叫轉換函式
  3. 傳入字串 `"0"` 呼叫轉換函式
- **Expected Result**: 分別回傳 DECIMAL `5000000`、`12500000.50`、`0`；精度無損失

---

#### TS-F036-023：DECIMAL 型別轉換函式 — 無效輸入

- **Related Requirement**: US-049 ETL 轉換規則（資本額型別邊界）
- **Test Type**: Unit / Negative
- **Preconditions**: varchar→DECIMAL 轉換函式已實作
- **Steps**:
  1. 傳入 `"ABC"` 呼叫轉換函式
  2. 傳入 `""` 呼叫轉換函式
  3. 傳入 `null` 呼叫轉換函式
- **Expected Result**: `"ABC"` 回傳 `null`（或拋出轉換錯誤，由規格決定）；`""` 和 `null` 均回傳 `null`；不拋出未處理例外

---

#### TS-F036-024：客戶類型對應函式 — MLMC.CUTYPE 轉換

- **Related Requirement**: US-049 ETL 轉換規則（客戶類型對應：MLMC.CUTYPE 需轉換 1→01, 2→02）
- **Test Type**: Unit / Positive
- **Preconditions**: 客戶類型對應函式已實作
- **Steps**:
  1. 傳入 MLMC 來源值 `"1"` 呼叫轉換函式
  2. 傳入 MLMC 來源值 `"2"` 呼叫轉換函式
- **Expected Result**: `"1"` → `"01"`；`"2"` → `"02"`；格式補零確保兩位字元

---

#### TS-F036-025：客戶類型對應函式 — ZZIP.CUSTOM_MK 直接映射

- **Related Requirement**: US-049 ETL 轉換規則（ZZIP 直接映射）
- **Test Type**: Unit / Positive
- **Preconditions**: 客戶類型對應函式已實作
- **Steps**:
  1. 傳入 ZZIP 來源值 `"01"`（個人）
  2. 傳入 ZZIP 來源值 `"02"`（企業）
  3. 傳入 ZZIP 來源值 `"04"`（外籍）
- **Expected Result**: 三個值均直接映射，不需轉換：`"01"` → `"01"`；`"02"` → `"02"`；`"04"` → `"04"`

---

#### TS-F036-026：代碼描述轉換 — code 保留、desc 由對照表填入

- **Related Requirement**: US-049 ETL 轉換規則（代碼描述：_code 保留原始代碼，_desc 由 US-030 對照表轉換）
- **Test Type**: Unit / Positive
- **Preconditions**: 代碼對照表已載入（US-030）；代碼描述轉換函式已實作
- **Steps**:
  1. 傳入 `education_code = "03"` 呼叫轉換函式
  2. 驗證 `education_code` 欄位值
  3. 驗證 `education_desc` 欄位值
- **Expected Result**: `education_code === "03"`（原始值保留）；`education_desc` = 對應的學歷描述字串（由 US-030 對照表轉換，非空）

---

#### TS-F036-027：代碼描述轉換 — 未知代碼的 desc 處理

- **Related Requirement**: US-049 ETL 轉換規則（代碼描述邊界）
- **Test Type**: Unit / Boundary
- **Preconditions**: 代碼對照表已載入
- **Steps**:
  1. 傳入 `occupation_code = "XXXX"`（對照表中不存在）
  2. 呼叫轉換函式
- **Expected Result**: `occupation_code === "XXXX"`（保留原始值）；`occupation_desc === null`（或系統定義的預設值，需確認規格）

---

### 類別五：衝突解決 — Integration Tests

#### TS-F036-028：同一客戶兩來源衝突以 source_updated_at 較新者為準

- **Related Requirement**: US-049 ETL 轉換規則（衝突解決；由 US-042 處理）
- **Test Type**: Integration / Positive
- **Preconditions**: ZZIP 與 MLMC 來源均有同一客戶（相同 CUSTO_NO = CUSTID）；MLMC 記錄的 `source_updated_at`（U_SYSDT）比 ZZIP（UPDATE_DATE）更新
- **Steps**:
  1. 備妥測試資料：同一客戶在兩來源均有記錄，`mailing_address` 欄位值不同；MLMC 的 `U_SYSDT` 晚於 ZZIP 的 `UPDATE_DATE`
  2. 執行 ETL Pipeline（含 Load 節點，目標表為 `customer_core`）
  3. 查詢 `customer_core` 目標表中該客戶記錄
- **Expected Result**: `mailing_address` 值來自 MLMC（較新來源）；`source_updated_at` = MLMC 的 `U_SYSDT` 時間戳

---

#### TS-F036-029：同一客戶兩來源衝突 — ZZIP 較新者為準

- **Related Requirement**: US-049 ETL 轉換規則（衝突解決）
- **Test Type**: Integration / Positive
- **Preconditions**: ZZIP 記錄的 `UPDATE_DATE` 比 MLMC 的 `U_SYSDT` 更新
- **Steps**:
  1. 備妥測試資料：同一客戶兩來源均有，ZZIP 的 `UPDATE_DATE` 晚於 MLMC 的 `U_SYSDT`；`name` 欄位值不同
  2. 執行 ETL Pipeline
  3. 查詢目標表該客戶記錄
- **Expected Result**: `name` 值來自 ZZIP（較新來源）；`source_updated_at` = ZZIP 的 `UPDATE_DATE`

---

### 類別六：前端介面 — Integration Tests

#### TS-F036-030：Load 節點開啟目標表選擇器顯示 1 個選項

- **Related Requirement**: AC-3
- **Test Type**: Integration（Frontend）/ Positive
- **Preconditions**: Admin 已登入；Pipeline 編輯器已開啟；Load 節點已新增
- **Steps**:
  1. 點擊 Load 節點，右側屬性面板出現
  2. 點擊目標表下拉選單
- **Expected Result**: 下拉選單顯示 1 個選項：`Customer Core（客戶主檔）`；不顯示 `customer_interaction`、`customer_financial`、`customer_service`

---

#### TS-F036-031：選擇目標表後自動載入欄位對應介面

- **Related Requirement**: AC-3, AC-4
- **Test Type**: Integration（Frontend）/ Positive
- **Preconditions**: Load 節點已開啟屬性面板；上游節點已有輸出欄位
- **Steps**:
  1. 從下拉選單選擇 `customer_core`
  2. 觀察欄位對應介面
- **Expected Result**: 右側目標欄位清單自動出現，欄位數量與 API 回傳的 `columnCount` 一致；介面不需手動刷新；左側顯示上游節點輸出欄位

---

#### TS-F036-032：ETL 追蹤欄位在欄位對應介面中不可手動對應

- **Related Requirement**: AC-3, AC-5, US-049 UI/UX
- **Test Type**: Integration（Frontend）/ Positive
- **Preconditions**: 已選擇目標表 `customer_core`，欄位對應介面已載入
- **Steps**:
  1. 在右側目標欄位清單中找到 `data_source`、`_etl_loaded_at`、`_etl_pipeline_id`
  2. 嘗試拖曳來源欄位到追蹤欄位
  3. 觀察追蹤欄位的視覺呈現
- **Expected Result**: 三個追蹤欄位以灰色標示並顯示「系統自動填充」文字；無法手動拖曳或選取；嘗試操作後不建立對應關係

---

#### TS-F036-033：欄位對應介面支援拖曳一對一對應

- **Related Requirement**: AC-4
- **Test Type**: Integration（Frontend）/ Positive
- **Preconditions**: 已選擇目標表，欄位對應介面已載入；上游節點有輸出欄位
- **Steps**:
  1. 從左側來源欄位清單拖曳一個欄位到右側目標欄位
  2. 確認對應建立後，觀察已對應欄位的視覺狀態
  3. 再次拖曳同一來源欄位到另一目標欄位
- **Expected Result**: 拖曳後顯示連線或配對標示；同一來源欄位只能對應一個目標欄位（一對一）；原對應移除，新對應建立

---

#### TS-F036-034：欄位對應介面支援下拉選單一對一對應

- **Related Requirement**: AC-4
- **Test Type**: Integration（Frontend）/ Positive
- **Preconditions**: 欄位對應介面已載入
- **Steps**:
  1. 在右側目標欄位旁的下拉選單中選擇一個來源欄位
  2. 驗證對應建立
- **Expected Result**: 下拉選單顯示所有可用來源欄位（不含已對應的欄位或追蹤欄位）；選擇後建立對應，視覺標示更新

---

### 類別七：ETL 追蹤欄位自動填充 — Integration Tests (E2E 級)

#### TS-F036-035：Load 執行後追蹤欄位自動填充（非 null）

- **Related Requirement**: AC-5, BR-2
- **Test Type**: Integration（E2E 級）/ Positive
- **Preconditions**: Admin 已登入；Pipeline 含 Load 節點，目標表為 `customer_core`；Pipeline 狀態為 published；來源資料已準備
- **Steps**:
  1. 觸發 Pipeline 執行（`POST /api/v1/pipelines/:id/run`）
  2. 使用 polling 等待 Pipeline 狀態變為 `completed`（最多 30 秒，interval 500ms）
  3. 直接查詢 `customer_core` 目標表，取出本次寫入的資料列
- **Expected Result**: 每筆資料 `_etl_loaded_at` 不為 null；`_etl_pipeline_id` 不為 null，為有效 UUID；`data_source` 不為 null

---

#### TS-F036-036：Load 執行後追蹤欄位值合理性驗證

- **Related Requirement**: AC-5, BR-2
- **Test Type**: Integration（E2E 級）/ Positive
- **Preconditions**: 同 TS-F036-035；測試前記錄執行開始時間 `T_start`
- **Steps**:
  1. 記錄 `T_start = now()`
  2. 觸發 Pipeline 執行，等待完成，記錄 `T_end = now()`
  3. 查詢 `customer_core` 目標表寫入資料
- **Expected Result**: `_etl_loaded_at` 值介於 `T_start` 與 `T_end` 之間（UTC）；`_etl_pipeline_id` 與 EtlPipelineLog 中的 pipeline_run_id 一致；`data_source` 值等於 Pipeline 使用的 Datasource 識別名稱

---

### 類別八：Boundary Scenarios

#### TS-F036-037：目標表名稱含特殊字元回 404 或 400

- **Related Requirement**: 邊界情況
- **Test Type**: Integration / Boundary
- **Preconditions**: Admin 已登入
- **Steps**:
  1. 呼叫 `GET /api/v1/etl/target-tables/customer%20core/schema`（含空格的 URL encoding）
  2. 呼叫 `GET /api/v1/etl/target-tables/customer-core/schema`（含連字號）
- **Expected Result**: 兩個呼叫均回傳 HTTP 404（`PIPELINE_TARGET_TABLE_NOT_FOUND`）或 HTTP 400；不回傳 `customer_core` 的任何資料

---

#### TS-F036-038：空路徑參數回 404

- **Related Requirement**: 邊界情況
- **Test Type**: Integration / Boundary
- **Preconditions**: Admin 已登入
- **Steps**:
  1. 呼叫 `GET /api/v1/etl/target-tables//schema`（路徑含空字串）
- **Expected Result**: HTTP 404（路由不匹配）或 HTTP 400；不回傳任何目標表資料（以實際框架路由行為為準）

---

### 類別九：Schema 定義正確性 — Unit Tests

#### TS-F036-039：customer_core Schema 定義物件涵蓋所有 A~H 分類欄位

- **Related Requirement**: AC-6
- **Test Type**: Unit / Positive
- **Preconditions**: `customer_core` schema 定義物件（靜態設定或 migration）已存在
- **Steps**:
  1. 讀取 `customer_core` 的 schema 定義（不透過 API，直接測試 schema 定義層）
  2. 驗證各分類欄位存在性
- **Expected Result**:
  - A 類（5 欄）：`customer_id`、`source_customer_no`、`customer_type`、`name`、`english_name` 均存在
  - B 類（5 欄）：`gender`、`date_of_birth`、`marital_status`、`education_code`、`education_desc` 均存在
  - C 類（6 欄）：`mobile_phone`、`home_phone`、`contact_phone`、`office_phone`、`email`、`line_account` 均存在
  - D 類（6 欄）：`residential_zip`、`residential_address`、`mailing_zip`、`mailing_address`、`company_zip`、`company_address` 均存在
  - E 類（10 欄）：`company_name`、`occupation_code`、`occupation_desc`、`job_title_code`、`job_title_desc`、`job_level`、`industry_code`、`industry_desc`、`work_years`、`company_scale` 均存在
  - F 類（10 欄）：`monthly_income`、`approved_income`、`income_source`、`capital`、`credit_limit`、`has_real_estate`、`debt_flag`、`fine_flag`、`address_anomaly_flag`、`mainland_flag` 均存在
  - G 類（7 欄）：`owner_name`、`owner_id`、`owner_birth`、`established_capital`、`employee_count`、`is_listed`、`parent_customer_id` 均存在
  - H 類（5 欄）：`source_created_at`、`source_updated_at`、`data_source`、`_etl_loaded_at`、`_etl_pipeline_id` 均存在

---

#### TS-F036-040：customer_core Schema 定義中不含已刻意排除的欄位

- **Related Requirement**: AC-6（刻意不納入 MVP 的來源欄位）
- **Test Type**: Unit / Negative
- **Preconditions**: `customer_core` schema 定義已存在
- **Steps**:
  1. 讀取 `customer_core` 的欄位名稱清單
  2. 驗證排除欄位不存在
- **Expected Result**: 以下欄位均不存在於 schema 中：`spouse_nm`（或 `SPOUSE_NM`）、`father_nm`、`mother_nm`、`print_flg`、`id_check`、`id_check_date`、`issue_add`、`issue_class`、`issue_date`、`old_p_id`、`appli_mark`、`spon_mark`；確認敏感個資欄位已排除

---

---

## 測試資料規格

### customer_core 欄位完整清單（A~H 分類，供測試驗證對照）

**A. 識別與分類（5 欄）**

| 欄位名稱 | 型別 | Nullable | isPrimaryKey | 說明 |
|----------|------|----------|--------------|------|
| customer_id | UUID | false | true | ETL 生成代理鍵 |
| source_customer_no | VARCHAR(20) | false | false | 來源客戶編號（身分證/統編） |
| customer_type | VARCHAR(2) | false | false | 01=個人/02=企業/04=外籍 |
| name | VARCHAR(100) | false | false | 姓名/企業名稱 |
| english_name | VARCHAR(60) | true | false | 英文姓名 |

**B. 個人屬性（5 欄）**

| 欄位名稱 | 型別 | Nullable | isPrimaryKey | 說明 |
|----------|------|----------|--------------|------|
| gender | VARCHAR(1) | true | false | 性別 |
| date_of_birth | DATE | true | false | 生日 |
| marital_status | VARCHAR(1) | true | false | 婚姻狀態 |
| education_code | VARCHAR(2) | true | false | 學歷代碼（原始值） |
| education_desc | VARCHAR(50) | true | false | 學歷描述（US-030 轉換） |

**C. 聯絡資訊（6 欄）**

| 欄位名稱 | 型別 | Nullable | isPrimaryKey | 轉換邏輯 |
|----------|------|----------|--------------|---------|
| mobile_phone | VARCHAR(20) | true | false | 直接映射 |
| home_phone | VARCHAR(20) | true | false | 合併 CAREA_NO1+CTEL_NO1；佔位值→NULL |
| contact_phone | VARCHAR(20) | true | false | 合併 CAREA_NO2+CTEL_NO2；佔位值→NULL |
| office_phone | VARCHAR(20) | true | false | 合併 CO_CAREA_NO+CO_CTEL_NO；佔位值→NULL |
| email | VARCHAR(40) | true | false | 直接映射 |
| line_account | VARCHAR(50) | true | false | 直接映射 |

**D. 地址（6 欄）**

| 欄位名稱 | 型別 | Nullable | isPrimaryKey |
|----------|------|----------|--------------|
| residential_zip | VARCHAR(6) | true | false |
| residential_address | VARCHAR(100) | true | false |
| mailing_zip | VARCHAR(6) | true | false |
| mailing_address | VARCHAR(100) | true | false |
| company_zip | VARCHAR(6) | true | false |
| company_address | VARCHAR(100) | true | false |

**E. 職業與就業（10 欄）**

| 欄位名稱 | 型別 | Nullable | isPrimaryKey |
|----------|------|----------|--------------|
| company_name | VARCHAR(100) | true | false |
| occupation_code | VARCHAR(4) | true | false |
| occupation_desc | VARCHAR(50) | true | false |
| job_title_code | VARCHAR(4) | true | false |
| job_title_desc | VARCHAR(50) | true | false |
| job_level | VARCHAR(2) | true | false |
| industry_code | VARCHAR(6) | true | false |
| industry_desc | VARCHAR(100) | true | false |
| work_years | DECIMAL(8,2) | true | false |
| company_scale | VARCHAR(1) | true | false |

**F. 財務與風控（10 欄）**

| 欄位名稱 | 型別 | Nullable | isPrimaryKey | 備註 |
|----------|------|----------|--------------|------|
| monthly_income | DECIMAL(8,0) | true | false | |
| approved_income | INTEGER | true | false | |
| income_source | VARCHAR(5) | true | false | |
| capital | DECIMAL(12,0) | true | false | MLMC.CUSTNOWCAPTIAL varchar→DECIMAL |
| credit_limit | DECIMAL(12,0) | true | false | |
| has_real_estate | VARCHAR(1) | true | false | |
| debt_flag | CHAR(1) | true | false | |
| fine_flag | CHAR(1) | true | false | |
| address_anomaly_flag | SMALLINT | true | false | |
| mainland_flag | SMALLINT | true | false | |

**G. 企業客戶專屬（7 欄）**

| 欄位名稱 | 型別 | Nullable | isPrimaryKey | 備註 |
|----------|------|----------|--------------|------|
| owner_name | VARCHAR(50) | true | false | |
| owner_id | VARCHAR(10) | true | false | |
| owner_birth | DATE | true | false | |
| established_capital | DECIMAL(12,0) | true | false | MLMC.CUSTCREATECAPTIAL varchar→DECIMAL |
| employee_count | VARCHAR(6) | true | false | |
| is_listed | VARCHAR(6) | true | false | |
| parent_customer_id | VARCHAR(10) | true | false | |

**H. 稽核與 ETL 追蹤（5 欄）**

| 欄位名稱 | 型別 | Nullable | isPrimaryKey | 備註 |
|----------|------|----------|--------------|------|
| source_created_at | TIMESTAMP | true | false | 來源建檔日期 |
| source_updated_at | TIMESTAMP | true | false | 來源最後更新；衝突解決基準 |
| data_source | VARCHAR(50) | false | false | ETL 自動填充 |
| _etl_loaded_at | TIMESTAMP | false | false | ETL 自動填充 |
| _etl_pipeline_id | UUID | false | false | ETL 自動填充 |

### 電話佔位值測試資料

| 欄位 | 來源欄位 | 佔位值（areaCode + telNo）| 預期結果 |
|------|---------|--------------------------|---------|
| home_phone | CAREA_NO1 + CTEL_NO1 | `"00"` + `"0000000000"` | NULL |
| contact_phone | CAREA_NO2 + CTEL_NO2 | `"00"` + `"0000000000"` | NULL |
| office_phone | CO_CAREA_NO + CO_CTEL_NO | `"00"` + `"0000000000"` | NULL |
| home_phone（正常） | CAREA_NO1 + CTEL_NO1 | `"02"` + `"27123456"` | `"02-27123456"` |

### DECIMAL 轉換測試資料

| 來源欄位 | 輸入值（varchar） | 預期輸出（DECIMAL） |
|---------|-----------------|-------------------|
| MLMC.CUSTNOWCAPTIAL | `"5000000"` | `5000000` |
| MLMC.CUSTNOWCAPTIAL | `"12500000.50"` | `12500000.50` |
| MLMC.CUSTNOWCAPTIAL | `"0"` | `0` |
| MLMC.CUSTNOWCAPTIAL | `"ABC"` | `null` |
| MLMC.CUSTNOWCAPTIAL | `""` | `null` |
| MLMC.CUSTCREATECAPTIAL | `"3000000"` | `3000000` |

### 客戶類型對應測試資料

| 來源系統 | 來源欄位 | 輸入值 | 預期輸出（customer_type）|
|---------|---------|--------|------------------------|
| ZZIP | CUSTOM_MK | `"01"` | `"01"`（直接映射） |
| ZZIP | CUSTOM_MK | `"02"` | `"02"`（直接映射） |
| ZZIP | CUSTOM_MK | `"04"` | `"04"`（直接映射） |
| MLMC | CUTYPE | `"1"` | `"01"`（補零轉換） |
| MLMC | CUTYPE | `"2"` | `"02"`（補零轉換） |

---

## 覆蓋率摘要

| 類別 | 場景數 |
|------|--------|
| Positive（目標表清單 API） | 3 |
| Positive（Schema API — 欄位結構） | 8 |
| Negative（錯誤與安全） | 6 |
| Unit（ETL 轉換函式）| 10 |
| Integration（衝突解決） | 2 |
| Integration（前端介面） | 5 |
| Integration（ETL 追蹤欄位） | 2 |
| Boundary | 2 |
| Unit（Schema 定義完整性） | 2 |
| **總計** | **40** |

---

## 風險與注意事項

1. **TS-F036-001 欄位數量驗證（columnCount === 45）**：US-049 規格標注「約 45 欄位」，A~H 分類加總為 49 欄（5+5+6+6+10+10+7+5）。測試時需以 migration 實際建立欄位數為準，測試設計使用「約 45」為合理範圍，建議實作後確認精確值並更新此場景。

2. **TS-F036-013（Phase 2/3 表回 404）**：需確認 Phase 1 migration 確實不建立 `customer_interaction` 等三個表，以避免測試誤判。若 Phase 2 進行時，此場景需移除或修改。

3. **TS-F036-026 / TS-F036-027（代碼描述轉換）**：依賴 US-030 代碼對照表 API 是否已完成。若 US-030 尚未實作，此類場景需以 stub 替代 US-030 對照表。

4. **TS-F036-028 / TS-F036-029（衝突解決）**：依賴 US-042（Pipeline 編輯器 Load 節點）完成。建議先以 unit test 驗證衝突解決邏輯函式，再以 integration test 驗證完整 Pipeline 執行。此邏輯 US-049 標注「於 US-042 處理」，需確認具體實作位置。

5. **TS-F036-035 / TS-F036-036（ETL 追蹤欄位自動填充）**：屬於跨模組 E2E 級測試，依賴 F029（Pipeline 編輯器）、F030（Pipeline 執行）模組完成。polling 逾時閾值（建議 30 秒）需根據實際環境調整。

6. **data_source 欄位 nullable 問題**：US-049 規格標注 `data_source nullable = NO`（H 類欄位表格），但 ETL 追蹤欄位說明標記為「ETL 自動填充」。需確認：Pipeline 執行時 `data_source` 是否一定有值（若 Datasource 未設定識別名稱是否允許 null）。建議向 Arch 確認，並在 TS-F036-009 中反映實際規格。

7. **舊版測試場景已廢棄**：原 F036-test.md v1.0 中的 TS-F036-001（4 個目標表）、TS-F036-002（columnCount 16/14/20/17）、TS-F036-005 至 TS-F036-008（四表 schema 驗證）及 TS-F036-020（空字串路徑）均已被本版本場景取代，請勿再參考舊版文件。
