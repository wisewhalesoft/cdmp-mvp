---
type: test-design-integration
test-spec-id: M01
feature_name: Whitelist-Driven 條件 Payload 端對端整合測試
priority: P0-MVP
related_spec:
  - /docs/specs/features/F050-create-list-definition.md v2.1
  - /docs/specs/features/F051-edit-list-definition.md v2.1
  - /docs/specs/architecture-spec.md §18
covers:
  - F050
  - F051
  - US-121
  - US-122
  - US-123
spec_version: "2.1"
date: 2026-05-20
last_updated: 2026-05-20
---

# M01：Whitelist-Driven 條件 Payload 端對端整合測試

> 本文件覆蓋 F050 v2.1 / F051 v2.1 的 **後端整合場景**（Supertest + Test Container PostgreSQL），
> 驗證 condition_payload JSONB 讀寫、Stage 1 動態 SQL 生成、backward-compat 衍生欄位、
> prod_kind 交集唯一性、caseyear wildcard 語意，以及 _backfill_empty 名單的 skip 行為。
> 對應 GAP-LIST §A~G、OQ-TEST-001 解答、OQ-TEST-002 解答。

---

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + `F050-test.md` + `F051-test.md` + `architecture-spec.md §18.2/§18.5/§18.8` + `data-model.md#customer-list-definition` |
| QA / Tester | 本文件 + `F050-test.md` + `F051-test.md` |

---

## 測試策略概覽

| 項目 | 說明 |
|---|---|
| 測試層 | Integration（Supertest + Test Container PostgreSQL / SQLite） |
| DB 環境 | PostgreSQL（condition_payload 為 JSONB）；SQLite（condition_payload 為 TEXT + transformer）|
| 資料前置 | 每個 test suite 前執行 factory：seedPooldataFieldWhitelist（6 rows）+ seedPooldataFieldOptions（caseyear 8 rows / case_status 4 rows / spec_tp **52 rows**，OBMCODEDF TBL_ID='12'）|
| 清理策略 | afterEach truncate customer_list_definition + condition_payload（CASCADE） |

---

## 一、condition_payload 寫入與讀取

### IT-M01-001：建立名單 condition_payload 寫入 JSONB 並可正確讀取

- **關聯需求**：F050 AC-5 / US-121 AC-1 / §18.2.1
- **測試類型**：Positive / Integration
- **前置條件**：whitelist 含 `prod_kind` 欄位
- **步驟**：
  1. POST `/api/v1/customer-lists`，body 含 `conditions: [{ columnName: "prod_kind", fieldType: "categorical", values: ["01","02"] }]`
  2. GET `/api/v1/customer-lists/:id`
- **預期結果**：
  - POST 回 201
  - GET response 的 `conditions` 陣列含 `{ columnName: "prod_kind", fieldType: "categorical", values: ["01","02"] }`
  - DB `condition_payload` 欄位為有效 JSONB（`jsonb_typeof(condition_payload) = 'array'`）

---

### IT-M01-002：condition_payload 含多條件（categorical + numeric）寫入後讀取一致

- **關聯需求**：F050 AC-5 / §18.2.2
- **測試類型**：Positive / Integration
- **前置條件**：whitelist 含 `prod_kind`（categorical）和 `year_cnt`（numeric）
- **步驟**：
  1. POST 建立名單，conditions 含 2 個條件：prod_kind categorical + year_cnt numeric（min:1, max:5）
  2. GET 取回名單
- **預期結果**：
  - GET 回傳 conditions 陣列包含 2 個條件
  - numeric 條件：`{ columnName: "year_cnt", fieldType: "numeric", min: 1, max: 5 }`
  - prod_kind 衍生：backward-compat `prod_kind` 欄位 = `"01$02"`（若 values=['01','02']）

---

### IT-M01-003：condition_payload 含 date_range 欄位寫入後讀取正確

- **關聯需求**：F050 AC-5 / §18.2.3
- **測試類型**：Positive / Integration
- **前置條件**：whitelist 含 `eff_date`（date_range 型別）
- **步驟**：
  1. POST 建立名單，conditions 含 `{ columnName: "eff_date", fieldType: "date_range", dateStart: "2024-01-01", dateEnd: "2024-12-31" }`
  2. GET 取回名單
- **預期結果**：
  - conditions 正確含 date_range 條件
  - dateStart/dateEnd 格式保持 ISO 8601（`YYYY-MM-DD`）

---

### IT-M01-004：columnName 不在 whitelist 時 POST 回 422 CONDITION_COLUMN_NOT_IN_WHITELIST

- **關聯需求**：F050 AC-6 / §18.2.4 / GAP A1
- **測試類型**：Negative / Integration
- **前置條件**：whitelist 不含 `illegal_field`
- **步驟**：
  1. POST 建立名單，conditions 含 `{ columnName: "illegal_field", fieldType: "categorical", values: ["X"] }`
- **預期結果**：
  - HTTP 422
  - `error_code: "CONDITION_COLUMN_NOT_IN_WHITELIST"`
  - 名單未建立（DB 無新紀錄）

---

### IT-M01-005：list_period_start / list_period_end 出現在 conditions 時回 400 RESERVED_FIELD_IN_CONDITIONS

- **關聯需求**：F050 AC-7 / §18.2.5 / GAP A2
- **測試類型**：Negative / Integration
- **步驟**：
  1. POST 建立名單，conditions 含 `{ columnName: "list_period_start", fieldType: "date_range", ... }`
- **預期結果**：
  - HTTP 400
  - `error_code: "RESERVED_FIELD_IN_CONDITIONS"`

---

## 二、backward-compat 衍生欄位

### IT-M01-006：POST 建立名單後 backward-compat 欄位正確衍生（categorical）

- **關聯需求**：US-123 AC-1 / §18.2.8 / GAP C1
- **測試類型**：Positive / Integration
- **前置條件**：whitelist 含 prod_kind / caseyear / spec_tp / case_status
- **步驟**：
  1. POST 建立名單，conditions 含 prod_kind values=['A1','A2']、caseyear values=['1','3']、spec_tp values=['01']、case_status values=['02']
  2. 直接查詢 DB `customer_list_definition` 表對應欄位
- **預期結果**：
  - `prod_kind` DB 欄位 = `"A1$A2"`
  - `caseyear` DB 欄位 = `"1$3"`
  - `spec_tp` DB 欄位 = `"01"`
  - `case_status` DB 欄位 = `"02"`

---

### IT-M01-007：PUT 更新名單 conditions 後 backward-compat 欄位同步更新

- **關聯需求**：US-123 AC-2 / §18.2.9 / GAP C2
- **測試類型**：Positive / Integration
- **步驟**：
  1. 建立名單（draft），prod_kind values=['A1']
  2. PUT 更新 conditions，prod_kind values=['A1','B2']
  3. 查詢 DB
- **預期結果**：
  - 更新後 `prod_kind` DB 欄位 = `"A1$B2"`（衍生值已同步更新）

---

### IT-M01-008：conditions 中不含 settle_src 時，settle_src DB 欄位為 NULL

- **關聯需求**：US-123 AC-3 / §18.2.8 / GAP C3
- **測試類型**：Boundary / Integration
- **步驟**：
  1. POST 建立名單，conditions 不含 settle_src
  2. 查詢 DB `settle_src` 欄位
- **預期結果**：`settle_src` = NULL（非空字串，非預設值）

---

## 三、Stage 1 動態 SQL 生成

### IT-M01-009：Stage 1 Path A — condition_payload 生成正確 SQL（categorical）

- **關聯需求**：US-122 AC-1 / §18.5.1 / GAP D1
- **測試類型**：Positive / Integration
- **前置條件**：名單 stage = ready，condition_payload 含 prod_kind categorical values=['01','02']
- **步驟**：
  1. 觸發 Stage 1 執行（或呼叫 buildStage1Query 整合測試）
  2. 攔截生成的 SQL 或查詢 staging 結果
- **預期結果**：
  - 生成 SQL 含 `ob_pool_data.prod_kind IN ('01', '02')`（Path A）
  - **不**含對 entity 欄位的 legacy fallback 邏輯
  - ob_pool_data 結果依 prod_kind 過濾

---

### IT-M01-010：Stage 1 Path A — numeric 欄位生成 BETWEEN 或 >= AND <= SQL

- **關聯需求**：US-122 AC-2 / §18.5.1 / GAP D2
- **測試類型**：Positive / Integration
- **前置條件**：名單 condition_payload 含 year_cnt numeric min=2 max=5
- **步驟**：
  1. 觸發 Stage 1，檢查生成 SQL
- **預期結果**：
  - 生成 SQL 含 `ob_pool_data.year_cnt >= 2 AND ob_pool_data.year_cnt <= 5`（或等效 BETWEEN）

---

### IT-M01-011：Stage 1 Path B — condition_payload IS NULL 使用 entity 欄位 fallback

- **關聯需求**：US-122 AC-5 / §18.5.2（Path B）/ GAP D4
- **測試類型**：Positive / Integration（legacy list）
- **前置條件**：Legacy 名單（condition_payload IS NULL），entity 欄位 prod_kind='01$02'
- **步驟**：
  1. 觸發 Stage 1 for legacy 名單
- **預期結果**：
  - 生成 SQL 使用 entity 欄位 fallback：`ob_pool_data.prod_kind IN ('01', '02')`（從 `prod_kind='01$02'` 解析）
  - Path B fallback 正常執行，不報錯

---

### IT-M01-012：Stage 1 date_range 欄位生成正確日期範圍 SQL

- **關聯需求**：US-122 AC-3 / §18.5.1 / GAP D3
- **測試類型**：Positive / Integration
- **前置條件**：condition_payload 含 eff_date date_range dateStart='2024-01-01' dateEnd='2024-12-31'
- **步驟**：
  1. 觸發 Stage 1，檢查 SQL
- **預期結果**：
  - 含 `ob_pool_data.eff_date >= '2024-01-01' AND ob_pool_data.eff_date <= '2024-12-31'`

---

## 四、caseyear wildcard 語意（OQ-TEST-001 解答）

### IT-M01-013：caseyear values=['99'] — Stage 1 不加 year_cnt 比對條件（全部年期）

- **關聯需求**：OQ-TEST-001 解答 / §18.5.1（caseyear wildcard 規則）
- **測試類型**：Boundary / Integration
- **前置條件**：名單 condition_payload 含 caseyear categorical values=['99']（99 = wildcard，代表「全部年期」）
- **步驟**：
  1. 觸發 Stage 1，檢查生成 SQL
- **預期結果**：
  - 生成 SQL **不含** `year_cnt` 相關條件（IN、=、BETWEEN 均不出現）
  - Stage 1 視 caseyear='99' 為「不過濾年期」，不加任何 year_cnt 約束

---

### IT-M01-014：caseyear values=['1','99'] — 含 99 時仍不加 year_cnt 比對條件

- **關聯需求**：OQ-TEST-001 解答（混合值含 99 仍為 wildcard）
- **測試類型**：Boundary / Integration
- **前置條件**：名單 condition_payload 含 caseyear categorical values=['1','99']
- **步驟**：
  1. 觸發 Stage 1，檢查生成 SQL
- **預期結果**：
  - 生成 SQL **不含** `year_cnt` 條件（values 中含 99 → 整個 caseyear 條件視為 wildcard）
  - **注意**：不可只過濾 year_cnt=1，必須完全省略年期條件

---

### IT-M01-015：caseyear values=['1','3'] — 不含 99 時正常生成 year_cnt IN 比對

- **關聯需求**：OQ-TEST-001 解答（無 99 則正常比對）
- **測試類型**：Positive / Integration
- **前置條件**：名單 condition_payload 含 caseyear categorical values=['1','3']
- **步驟**：
  1. 觸發 Stage 1，檢查生成 SQL
- **預期結果**：
  - 生成 SQL 含 `ob_pool_data.year_cnt IN (1, 3)`（或等效整數比對）
  - 不含 year_cnt=99 的條件

---

## 五、_backfill_empty 名單 Stage 1 Skip（OQ-TEST-002 解答）

### IT-M01-016：_backfill_empty 名單 Stage 1 跳過執行並記錄 Logger.warn

- **關聯需求**：OQ-TEST-002 解答 / §18.2.12（_backfill_empty 語意）
- **測試類型**：Boundary / Integration
- **前置條件**：
  - 名單 condition_payload = `[]`（空陣列）且 `_backfill_empty = true`
  - 名單 stage = ready
- **步驟**：
  1. 觸發月跑，此名單進入 Stage 1 排程
  2. 觀察 Stage 1 執行行為與 log 輸出
  3. 查詢 assignment_run 紀錄
- **預期結果**：
  - Stage 1 **跳過**此名單（不執行 SQL query）
  - Logger.warn 含識別資訊（list_id / list_name）和 reason `"EMPTY_CONDITIONS"`
  - assignment_run 整體狀態 **不因此名單 skip 而失敗**（其他名單正常執行）
  - result summary 此名單標記 `status: "skipped"`, `reason: "EMPTY_CONDITIONS"`

---

### IT-M01-017：_backfill_empty 名單 result summary 標記 skipped 欄位

- **關聯需求**：OQ-TEST-002 解答 / result summary schema
- **測試類型**：Positive / Integration
- **前置條件**：同 IT-M01-016，月跑包含 1 個 _backfill_empty 名單 + 1 個正常名單
- **步驟**：
  1. 觸發月跑完成
  2. GET assignment_run result summary API
- **預期結果**：
  - result summary JSON 中，_backfill_empty 名單條目：`{ list_id: "...", status: "skipped", reason: "EMPTY_CONDITIONS" }`
  - 正常名單條目：`{ list_id: "...", status: "completed", count: N }`
  - **不含** `skipped_count`、`failed_count`（依實際 schema 確認，若有則驗證值正確）

---

## 六、prod_kind 交集唯一性

### IT-M01-018：新建名單 prod_kind 與現有 ready 名單重疊時回 409 PROD_KIND_CONFLICT

- **關聯需求**：F050 AC-14 / §18.8 / GAP B3
- **測試類型**：Negative / Integration
- **前置條件**：已有 stage=ready 名單，condition_payload prod_kind values=['01','02']
- **步驟**：
  1. POST 建立新名單，prod_kind values=['02','03']（'02' 與現有重疊）
- **預期結果**：
  - HTTP 409
  - `error_code` 含 prod_kind 衝突語意（依 error-handling.md 確認確切錯誤碼）
  - 新名單未建立

---

### IT-M01-019：更新名單 prod_kind 排除自身後不觸發 409

- **關聯需求**：F051 AC-12 / §18.8（excludeSelf）/ GAP B4
- **測試類型**：Positive / Integration
- **前置條件**：名單 A（stage=draft），prod_kind=['01']；名單 B（stage=ready），prod_kind=['02']
- **步驟**：
  1. PUT 更新名單 A，prod_kind=['01','03']（不與名單 B 重疊）
- **預期結果**：
  - HTTP 200，更新成功（excludeSelf 正確排除自身比對）

---

## 七、LEGACY 名單唯讀保護

### IT-M01-020：PUT 更新 LEGACY 名單 conditions 時回 422 LEGACY_LIST_CONDITION_READONLY

- **關聯需求**：F051 AC-11 / §18.2.6 / GAP G2
- **測試類型**：Negative / Integration
- **前置條件**：名單 condition_payload IS NULL（LEGACY 名單）
- **步驟**：
  1. PUT 更新 LEGACY 名單，body 含 `conditions: [...]`
- **預期結果**：
  - HTTP 422
  - `error_code: "LEGACY_LIST_CONDITION_READONLY"`
  - 名單 condition_payload 仍為 NULL

---

### IT-M01-021：POST 複製 LEGACY 名單時回 422 LEGACY_LIST_NOT_COPYABLE

- **關聯需求**：F050 AC-15 / §18.2.10 / GAP G3
- **測試類型**：Negative / Integration
- **前置條件**：來源名單 condition_payload IS NULL（LEGACY）
- **步驟**：
  1. POST `/api/v1/customer-lists/:id/copy`，來源為 LEGACY 名單
- **預期結果**：
  - HTTP 422
  - `error_code: "LEGACY_LIST_NOT_COPYABLE"`

---

## 八、columnName SQL Injection 防禦（Phase 5b 追補）

> 以下 2 個場景對應 Phase 5b 波 5（commit `070a407`）實作的 `SAFE_COLUMN_NAME_RE` allowlist 防禦。
> 5b implementation log O-5B-001 要求 test-designer 正式追補此編號。
> 對應 composer unit spec UCQ-025~029 / §18.5 columnName allowlist 防禦規則（`/^[a-z][a-z0-9_]{0,63}$/`）。

### IT-M01-022：columnName 含特殊字元時 Composer skip 並記錄 Logger.warn

- **關聯需求**：§18.5（columnName allowlist 防禦）/ 5b UCQ-025/026/027
- **測試類型**：Negative / Security / Integration
- **前置條件**：
  - 名單 condition_payload 含非法 columnName（如 `"; DROP TABLE ob_pool_data; --"`）
  - 名單 stage = ready
- **步驟**：
  1. 觸發 Stage 1，此名單 condition_payload 含以下任一非法 columnName：
     - `"; DROP TABLE ob_pool_data; --"`（SQL Injection payload）
     - `"PROD_KIND"`（大寫，不符合 `^[a-z]` 規則）
     - `"prod kind"`（含空白）
  2. 觀察 Composer 行為與 Logger 輸出
- **預期結果**：
  - Composer 對該 condition 條目執行 **skip**（不生成對應 SQL fragment）
  - Logger.warn 含 `INVALID_COLUMN_NAME` 識別碼及非法 columnName 值
  - Stage 1 整體仍繼續執行（非法條件被 skip，其餘合法條件正常生成 SQL）
  - **不因非法 columnName 拋出 500 或中斷月跑**

---

### IT-M01-023：columnName 符合 allowlist regex 時正常通過

- **關聯需求**：§18.5（columnName allowlist 防禦邊界）/ 5b UCQ-028/029
- **測試類型**：Positive / Boundary / Integration
- **前置條件**：
  - 名單 condition_payload 含合法 columnName（符合 `^[a-z][a-z0-9_]{0,63}$`）
- **步驟**：
  1. 觸發 Stage 1，此名單 condition_payload 含以下邊界合法值：
     - `"prod_kind"`（最短合法，lowercase 開頭）
     - `"a" + "b".repeat(63)`（64 字元，最長合法邊界）
  2. 檢查生成 SQL
- **預期結果**：
  - Composer **不 skip** 上述 columnName（視為合法）
  - 生成對應 SQL fragment（categorical / numeric 依 fieldType 各自對應）
  - Logger **不**輸出 `INVALID_COLUMN_NAME` warn

---

## 附錄：GAP 覆蓋對照

| GAP 分類 | 覆蓋場景 |
|---|---|
| A1（columnName whitelist 驗證） | IT-M01-004 |
| A2（reserved field 驗證） | IT-M01-005 |
| B3（prod_kind 交集唯一新建） | IT-M01-018 |
| B4（prod_kind 交集唯一更新 excludeSelf） | IT-M01-019 |
| C1（categorical backward-compat 衍生） | IT-M01-006 |
| C2（update 後 backward-compat 同步） | IT-M01-007 |
| C3（缺少欄位 → NULL） | IT-M01-008 |
| D1（Stage 1 categorical SQL） | IT-M01-009 |
| D2（Stage 1 numeric SQL） | IT-M01-010 |
| D3（Stage 1 date_range SQL） | IT-M01-012 |
| D4（Stage 1 Path B fallback） | IT-M01-011 |
| G2（LEGACY readonly condition） | IT-M01-020 |
| G3（LEGACY not copyable） | IT-M01-021 |
| OQ-TEST-001（caseyear 99 wildcard） | IT-M01-013、IT-M01-014、IT-M01-015 |
| OQ-TEST-002（_backfill_empty skip） | IT-M01-016、IT-M01-017 |
| §18.5 columnName allowlist 防禦（5b 追補） | IT-M01-022、IT-M01-023 |

## 附錄：AD-E07-18 §18.10 高風險案例覆蓋

| §18.10 案例 | 覆蓋場景 |
|---|---|
| Risk-1（Path A/B 切換邊界） | IT-M01-011（Path B）、IT-M01-009（Path A）|
| Risk-2（caseyear 99 wildcard） | IT-M01-013、IT-M01-014 |
| Risk-3（_backfill_empty skip） | IT-M01-016、IT-M01-017 |
| Risk-5（prod_kind 交集唯一性） | IT-M01-018、IT-M01-019 |
| Risk-6（backward-compat 衍生正確性） | IT-M01-006、IT-M01-007 |
