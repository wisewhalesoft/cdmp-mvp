---
type: test-design-feature
feature_id: F036
feature_name: 目標表 Domain-Oriented 規劃
priority: P0-MVP
related_spec: /docs/specs/features/F036-target-tables.md
last_updated: 2026-03-20
---

# F036: 目標表 Domain-Oriented 規劃 — 測試設計

---

## Acceptance Test Design

### AC-1：目標表清單 API

| 項目 | 內容 |
|------|------|
| Given | Admin 已登入，系統已透過 migration 預先建立 4 個目標表 |
| When | 呼叫 `GET /api/v1/etl/target-tables` |
| Then | HTTP 200，`data` 陣列含 4 個目標表物件，各物件含 `tableName`、`displayName`、`domain`、`columnCount`、`description` 欄位 |
| 驗證步驟 | 1. `data.length === 4`<br>2. `tableName` 值集合 = `{customer_core, customer_interaction, customer_financial, customer_service}`<br>3. `customer_core.columnCount === 16`<br>4. `customer_interaction.columnCount === 14`<br>5. `customer_financial.columnCount === 20`<br>6. `customer_service.columnCount === 17`<br>7. 各物件的 `domain` 值分別為 `core`、`interaction`、`financial`、`service` |

### AC-2：目標表 Schema API

| 項目 | 內容 |
|------|------|
| Given | Admin 已登入，指定目標表存在 |
| When | 呼叫 `GET /api/v1/etl/target-tables/:tableName/schema` |
| Then | HTTP 200，回應含 `tableName`、`displayName`、`columns` 陣列；`columns` 中每個物件含 `name`、`type`、`nullable`、`isPrimaryKey`、`isEtlTracking`、`description` |
| 驗證步驟 | 1. `columns` 陣列長度與對應 `columnCount` 一致<br>2. 主鍵欄位的 `isPrimaryKey === true`、`nullable === false`<br>3. ETL 追蹤欄位的 `isEtlTracking === true`<br>4. `_etl_loaded_at`、`_etl_pipeline_id`、`data_source` 三欄位均標示 `isEtlTracking === true`<br>5. 非追蹤欄位的 `isEtlTracking === false` |

### AC-5：ETL 追蹤欄位自動填充

| 項目 | 內容 |
|------|------|
| Given | Pipeline 包含 Load 節點，目標表為 `customer_core` |
| When | ETL Pipeline 執行 Load 步驟，將資料寫入目標表 |
| Then | 目標表寫入的每一筆資料，`data_source`、`_etl_loaded_at`、`_etl_pipeline_id` 三個欄位均由系統自動填充，不為 null |
| 驗證步驟 | 1. `data_source` = Pipeline 使用的 Datasource 名稱<br>2. `_etl_loaded_at` 為 UTC timestamp，介於 Pipeline 執行開始與結束時間之間<br>3. `_etl_pipeline_id` = 此次執行的 Pipeline ID（UUID） |

### AC-6：4 類目標表 Schema 預定義正確

| 項目 | 內容 |
|------|------|
| Given | 系統初始化完成（migration 已執行） |
| When | 分別查詢 4 個目標表的 schema |
| Then | 各表欄位數量與欄位定義符合 data-model.md 規格 |
| 驗證步驟 | 1. `customer_core`：16 欄，主鍵 `customer_id`（UUID, PK, not null）<br>2. `customer_interaction`：14 欄，主鍵 `interaction_id`（UUID, PK, not null）<br>3. `customer_financial`：20 欄，主鍵 `financial_id`（UUID, PK, not null）<br>4. `customer_service`：17 欄，主鍵 `service_id`（UUID, PK, not null）<br>5. 每個表均含 3 個追蹤欄位（`data_source`、`_etl_loaded_at`、`_etl_pipeline_id`） |

---

## Test Scenarios

### Positive Scenarios — GET /api/v1/etl/target-tables

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F036-001 | 回傳 4 個目標表清單 | AC-1, AC-6 | Integration | Admin 已登入；系統 migration 已執行 | 1. 以有效 Admin Token 呼叫 `GET /api/v1/etl/target-tables` | HTTP 200；`data.length === 4`；tableName 集合為 `customer_core`、`customer_interaction`、`customer_financial`、`customer_service` |
| TS-F036-002 | 各目標表 columnCount 正確 | AC-1, AC-6 | Integration | Admin 已登入 | 1. 呼叫 `GET /api/v1/etl/target-tables`<br>2. 逐一驗證各表 `columnCount` | `customer_core.columnCount === 16`；`customer_interaction.columnCount === 14`；`customer_financial.columnCount === 20`；`customer_service.columnCount === 17` |
| TS-F036-003 | 各目標表回應欄位結構完整 | AC-1 | Integration | Admin 已登入 | 1. 呼叫 `GET /api/v1/etl/target-tables`<br>2. 驗證 `data[0]` 的欄位 | 每個物件均含 `tableName`（string）、`displayName`（string）、`domain`（string）、`columnCount`（number）、`description`（string）；無多餘或缺少欄位 |
| TS-F036-004 | domain 欄位值正確對應 | AC-1 | Integration | Admin 已登入 | 1. 呼叫 `GET /api/v1/etl/target-tables`<br>2. 驗證各表 `domain` 值 | `customer_core.domain === "core"`；`customer_interaction.domain === "interaction"`；`customer_financial.domain === "financial"`；`customer_service.domain === "service"` |

### Positive Scenarios — GET /api/v1/etl/target-tables/:tableName/schema

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F036-005 | customer_core schema 欄位清單正確 | AC-2, AC-6 | Integration | Admin 已登入 | 1. 呼叫 `GET /api/v1/etl/target-tables/customer_core/schema` | HTTP 200；`columns.length === 16`；含 `customer_id`（UUID, PK, not null）；含 `id_number`（VARCHAR, nullable=true）；含所有 data-model.md 定義欄位 |
| TS-F036-006 | customer_interaction schema 欄位清單正確 | AC-2, AC-6 | Integration | Admin 已登入 | 1. 呼叫 `GET /api/v1/etl/target-tables/customer_interaction/schema` | HTTP 200；`columns.length === 14`；含 `interaction_id`（UUID, PK, not null）；含 `interaction_type`、`channel`、`direction`、`interaction_date`、`campaign_id`、`campaign_name`、`response_status`、`content_summary`、`agent_id` 欄位 |
| TS-F036-007 | customer_financial schema 欄位清單正確 | AC-2, AC-6 | Integration | Admin 已登入 | 1. 呼叫 `GET /api/v1/etl/target-tables/customer_financial/schema` | HTTP 200；`columns.length === 20`；含 `financial_id`（UUID, PK, not null）；含 `principal_amount`（DECIMAL）、`monthly_payment`（DECIMAL）、`interest_rate`（DECIMAL）、`overdue_days`（INTEGER）、`overdue_amount`（DECIMAL）、`credit_score`（INTEGER）、`risk_level`（VARCHAR） |
| TS-F036-008 | customer_service schema 欄位清單正確 | AC-2, AC-6 | Integration | Admin 已登入 | 1. 呼叫 `GET /api/v1/etl/target-tables/customer_service/schema` | HTTP 200；`columns.length === 17`；含 `service_id`（UUID, PK, not null）；含 `case_number`、`case_type`、`category`、`priority`、`status`、`channel`、`description`、`resolution`、`assigned_to`、`opened_at`、`resolved_at`、`satisfaction_score` 欄位 |
| TS-F036-009 | schema 回應中 ETL 追蹤欄位標示正確 | AC-2, AC-5, BR-2 | Integration | Admin 已登入 | 1. 呼叫 `GET /api/v1/etl/target-tables/customer_core/schema`<br>2. 篩選 `isEtlTracking === true` 的欄位 | `isEtlTracking === true` 的欄位名稱集合 = `{data_source, _etl_loaded_at, _etl_pipeline_id}`；其餘欄位 `isEtlTracking === false` |
| TS-F036-010 | schema 回應中主鍵欄位標示正確 | AC-2, BR-3 | Integration | Admin 已登入 | 1. 呼叫 `GET /api/v1/etl/target-tables/customer_financial/schema`<br>2. 篩選 `isPrimaryKey === true` 的欄位 | 恰好一個欄位 `isPrimaryKey === true`，名稱為 `financial_id`；該欄位 `nullable === false`；其餘欄位 `isPrimaryKey === false` |
| TS-F036-011 | schema 回應中追蹤欄位 nullable 標示正確 | AC-2, BR-2 | Integration | Admin 已登入 | 1. 呼叫 `GET /api/v1/etl/target-tables/customer_core/schema`<br>2. 驗證追蹤欄位 `nullable` | `_etl_loaded_at.nullable === false`；`_etl_pipeline_id.nullable === false`；`data_source.nullable === true`（允許 null） |
| TS-F036-012 | schema 回應中各欄位均含 description | AC-2 | Integration | Admin 已登入 | 1. 呼叫 `GET /api/v1/etl/target-tables/customer_service/schema`<br>2. 驗證每個欄位物件含 `description` | `columns` 中所有物件均含 `description` 欄位且為非空字串 |

### Negative Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F036-013 | 查詢不存在的目標表 404 | 邊界情況，F036 第 7 節 | Integration | Admin 已登入 | 1. 呼叫 `GET /api/v1/etl/target-tables/customer_unknown/schema` | HTTP 404；`error.code === "PIPELINE_TARGET_TABLE_NOT_FOUND"`；`error.message === "找不到指定的目標表"` |
| TS-F036-014 | User 角色存取目標表清單 API 回 403 | BR-1, RBAC | Integration | USER_ACTIVE 已登入（非 Admin 角色） | 1. 以 User Token 呼叫 `GET /api/v1/etl/target-tables` | HTTP 403；`error.code === "AUTH_FORBIDDEN"` |
| TS-F036-015 | User 角色存取目標表 Schema API 回 403 | BR-1, RBAC | Integration | USER_ACTIVE 已登入 | 1. 以 User Token 呼叫 `GET /api/v1/etl/target-tables/customer_core/schema` | HTTP 403；`error.code === "AUTH_FORBIDDEN"` |
| TS-F036-016 | 未登入存取目標表清單 API 回 401 | 認證 | Integration | 無 Authorization Header | 1. 呼叫 `GET /api/v1/etl/target-tables`（不含 Token） | HTTP 401；`error.code === "AUTH_TOKEN_MISSING"` |
| TS-F036-017 | 未登入存取目標表 Schema API 回 401 | 認證 | Integration | 無 Authorization Header | 1. 呼叫 `GET /api/v1/etl/target-tables/customer_core/schema`（不含 Token） | HTTP 401；`error.code === "AUTH_TOKEN_MISSING"` |

### Integration Scenario — ETL 追蹤欄位自動填充

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F036-018 | Load 執行後追蹤欄位自動填充（非 null） | AC-5, BR-2 | Integration（E2E 級） | Admin 已登入；Pipeline 含 Load 節點，目標表為 `customer_core`；Pipeline 狀態為 published | 1. 觸發 Pipeline 執行<br>2. 等待 Pipeline 狀態變為 completed<br>3. 查詢 `customer_core` 目標表中本次寫入的資料列 | 每筆資料的 `_etl_loaded_at` 不為 null，型別為 TIMESTAMP；`_etl_pipeline_id` 不為 null，值等於本次 Pipeline 執行的 ID（UUID 格式）；`data_source` 不為 null，值等於 Pipeline 所使用的 Datasource 名稱 |
| TS-F036-019 | Load 執行後追蹤欄位值合理性驗證 | AC-5, BR-2 | Integration（E2E 級） | 同 TS-F036-018；記錄 Pipeline 執行開始時間 `T_start` 與結束時間 `T_end` | 1. 觸發 Pipeline 執行並記錄 `T_start`<br>2. 等待 Pipeline 完成，記錄 `T_end`<br>3. 查詢 `customer_core` 目標表寫入資料 | `_etl_loaded_at` 值介於 `T_start` 與 `T_end` 之間（UTC）；`_etl_pipeline_id` 與 EtlPipelineLog 中的 pipeline_id 一致 |

### Boundary Scenario

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F036-020 | 目標表名稱為空字串時回 404 | 邊界情況 | Integration | Admin 已登入 | 1. 呼叫 `GET /api/v1/etl/target-tables//schema`（路徑含空字串） | HTTP 404（路由不存在）或 HTTP 400；不回傳任何目標表資料 |

---

## 測試資料規格

### 目標表完整欄位清單（供測試驗證對照）

**customer_core（16 欄）**

| 欄位名稱 | 型別 | Nullable | isPrimaryKey | isEtlTracking |
|----------|------|----------|--------------|---------------|
| customer_id | UUID | false | true | false |
| id_number | VARCHAR | true | false | false |
| name | VARCHAR | true | false | false |
| gender | VARCHAR | true | false | false |
| date_of_birth | DATE | true | false | false |
| phone | VARCHAR | true | false | false |
| email | VARCHAR | true | false | false |
| address | TEXT | true | false | false |
| occupation | VARCHAR | true | false | false |
| company_name | VARCHAR | true | false | false |
| customer_type | VARCHAR | true | false | false |
| registration_date | TIMESTAMP | true | false | false |
| data_source | VARCHAR | true | false | true |
| last_updated_at | TIMESTAMP | true | false | false |
| _etl_loaded_at | TIMESTAMP | false | false | true |
| _etl_pipeline_id | UUID | false | false | true |

**customer_interaction（14 欄）**

| 欄位名稱 | 型別 | Nullable | isPrimaryKey | isEtlTracking |
|----------|------|----------|--------------|---------------|
| interaction_id | UUID | false | true | false |
| customer_id | UUID | true | false | false |
| interaction_type | VARCHAR | true | false | false |
| channel | VARCHAR | true | false | false |
| direction | VARCHAR | true | false | false |
| interaction_date | TIMESTAMP | true | false | false |
| campaign_id | VARCHAR | true | false | false |
| campaign_name | VARCHAR | true | false | false |
| response_status | VARCHAR | true | false | false |
| content_summary | TEXT | true | false | false |
| agent_id | VARCHAR | true | false | false |
| data_source | VARCHAR | true | false | true |
| _etl_loaded_at | TIMESTAMP | false | false | true |
| _etl_pipeline_id | UUID | false | false | true |

**customer_financial（20 欄）**

| 欄位名稱 | 型別 | Nullable | isPrimaryKey | isEtlTracking |
|----------|------|----------|--------------|---------------|
| financial_id | UUID | false | true | false |
| customer_id | UUID | true | false | false |
| contract_id | VARCHAR | true | false | false |
| contract_type | VARCHAR | true | false | false |
| vehicle_model | VARCHAR | true | false | false |
| vehicle_year | INTEGER | true | false | false |
| principal_amount | DECIMAL | true | false | false |
| monthly_payment | DECIMAL | true | false | false |
| interest_rate | DECIMAL | true | false | false |
| term_months | INTEGER | true | false | false |
| payment_status | VARCHAR | true | false | false |
| overdue_days | INTEGER | true | false | false |
| overdue_amount | DECIMAL | true | false | false |
| credit_score | INTEGER | true | false | false |
| risk_level | VARCHAR | true | false | false |
| contract_start_date | DATE | true | false | false |
| contract_end_date | DATE | true | false | false |
| data_source | VARCHAR | true | false | true |
| _etl_loaded_at | TIMESTAMP | false | false | true |
| _etl_pipeline_id | UUID | false | false | true |

**customer_service（17 欄）**

| 欄位名稱 | 型別 | Nullable | isPrimaryKey | isEtlTracking |
|----------|------|----------|--------------|---------------|
| service_id | UUID | false | true | false |
| customer_id | UUID | true | false | false |
| case_number | VARCHAR | true | false | false |
| case_type | VARCHAR | true | false | false |
| category | VARCHAR | true | false | false |
| priority | VARCHAR | true | false | false |
| status | VARCHAR | true | false | false |
| channel | VARCHAR | true | false | false |
| description | TEXT | true | false | false |
| resolution | TEXT | true | false | false |
| assigned_to | VARCHAR | true | false | false |
| opened_at | TIMESTAMP | true | false | false |
| resolved_at | TIMESTAMP | true | false | false |
| satisfaction_score | INTEGER | true | false | false |
| data_source | VARCHAR | true | false | true |
| _etl_loaded_at | TIMESTAMP | false | false | true |
| _etl_pipeline_id | UUID | false | false | true |

---

## 覆蓋率摘要

| 類別 | 場景數 |
|------|--------|
| Positive（目標表清單 API） | 4 |
| Positive（Schema API） | 8 |
| Negative（錯誤與安全） | 5 |
| Integration（ETL 自動填充） | 2 |
| Boundary | 1 |
| **總計** | **20** |

---

## 風險與注意事項

1. **TS-F036-018 / TS-F036-019（ETL 追蹤欄位自動填充）**：屬於跨模組 E2E 級測試，依賴 F029（Pipeline 編輯器）與 F030（Pipeline 執行）模組完成。實作順序建議：先以 unit test 驗證 Load 節點注入追蹤欄位的邏輯，再以 Integration test 驗證完整 Pipeline 執行。

2. **data_source 的 isEtlTracking 判定**：`data_source` 欄位在 data-model.md 中標示 `nullable=true`，但規格（AC-5）要求「由系統自動填充」。測試需確認 schema API 回傳 `isEtlTracking=true`，實際寫入行為可允許 null（當 Datasource 名稱未設定時）。此行為需向 Arch 確認。

3. **靜態 schema 不可自訂（BR-4）**：目前未設計「Admin 嘗試新增目標表欄位」的拒絕測試，因為規格中無對應 API。若日後規格新增此端點，需補充負面測試。

4. **TS-F036-020（空字串路徑）**：實際 HTTP 行為取決於框架路由設定，結果可能為 404 或路由不匹配錯誤，需以實際框架行為為準，本場景設計作為探索性測試。
