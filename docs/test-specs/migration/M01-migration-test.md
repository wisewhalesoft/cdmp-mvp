---
type: test-design-migration
test-spec-id: M01-MIG
feature_name: F050 v2.1 Migration M1~M5 測試設計
priority: P0-MVP
related_spec:
  - /docs/specs/architecture-spec.md §18.4（M1~M5 設計）
  - /docs/specs/features/F076-manage-categorical-field-values.md v1.5
  - /docs/specs/features/F075-manage-pooldata-field-whitelist.md v1.5
covers:
  - F050
  - F076
  - US-121
  - US-125
spec_version: "2.1"
date: 2026-05-20
last_updated: 2026-05-20
---

# M01-MIG：F050 v2.1 Migration M1~M5 測試設計

> 本文件覆蓋 F050 v2.1 重構涉及的 5 個 migration（M1~M5）的單元測試與整合測試。
> 重點驗證：M1 ADD COLUMN 與 GIN index、M2 backfill 正確性（含 OQ-TEST-002 _backfill_empty 語意）、
> M3 spec_tp 32 筆 UPSERT 冪等、M4 case_status 4 筆 + whitelist 1 筆 DO NOTHING 冪等、
> M5 高風險刪除 ob_code_df 與回滾。
> 對應 GAP-LIST §E。

---

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + `architecture-spec.md §18.4` + `F076-test.md`（seed 相關） + `data-model.md #customer-list-definition #pooldata-field-option` |
| QA / Tester | 本文件 + `risks-and-gaps.md`（TEST-RISK-004/005，M5 高風險） |

---

## 測試策略概覽

| 項目 | 說明 |
|---|---|
| 測試層 | Migration Integration（Test Container PostgreSQL）、Unit（migration up/down 邏輯） |
| 測試執行方式 | 每個 migration 獨立 Test Container，測試前執行前置 migration（保持 schema 有序） |
| DDL 清理注意 | M1 ADD COLUMN / M5 DELETE 無法 Transaction Rollback；每個測試 suite 後需 DROP/還原 |
| M5 特殊限制 | 不可在 prod 環境自動執行測試；此測試只在 staging/CI 跑，且 M5 前需確認 F069 已切換 |

---

## M1：ADD COLUMN condition_payload + GIN Index

### MT-M1-001：M1 up() 後 customer_list_definition 含 condition_payload 欄位

- **關聯需求**：§18.4.1（M1 設計）/ GAP E1
- **測試類型**：Positive / Migration Integration（DB Schema 驗證）
- **前置條件**：Test Container PostgreSQL，M1 之前的 migration 已執行（不含 M1）
- **步驟**：
  1. 執行 M1 `up()`
  2. 查詢 `information_schema.columns WHERE table_name='customer_list_definition' AND column_name='condition_payload'`
- **預期結果**：
  - 欄位存在
  - `data_type = 'jsonb'`
  - `is_nullable = 'YES'`（允許 NULL，供 backward-compat）

---

### MT-M1-002：M1 up() 後 GIN index 存在於 condition_payload 欄位

- **關聯需求**：§18.4.1（GIN index）/ GAP E1
- **測試類型**：Positive / Migration Integration（DB Schema 驗證）
- **前置條件**：M1 up() 已執行
- **步驟**：
  1. 查詢 `pg_indexes WHERE tablename='customer_list_definition' AND indexname LIKE '%condition_payload%'`
- **預期結果**：
  - 索引存在
  - `indexdef` 含 `USING gin`（GIN 索引類型）

---

### MT-M1-003：M1 down() 移除 condition_payload 欄位與 GIN index

- **關聯需求**：§18.4.1（可 rollback）/ GAP E1
- **測試類型**：Positive / Migration Integration（Rollback 驗證）
- **前置條件**：M1 up() 已執行
- **步驟**：
  1. 執行 M1 `down()`
  2. 查詢 `information_schema.columns` 確認欄位不存在
  3. 查詢 `pg_indexes` 確認 GIN index 不存在
- **預期結果**：
  - `condition_payload` 欄位不存在
  - GIN index 不存在
  - 既有 customer_list_definition 其他欄位未受影響

---

### MT-M1-004：M1 up() 對現有資料無破壞（既有列 condition_payload 為 NULL）

- **關聯需求**：§18.4.1（backward-compat）/ §18.10 Risk-1
- **測試類型**：Boundary / Migration Integration
- **前置條件**：執行 M1 前，customer_list_definition 已有 3 筆既有資料
- **步驟**：
  1. 執行 M1 up()
  2. 查詢既有 3 筆資料的 condition_payload
- **預期結果**：
  - 3 筆既有資料 `condition_payload = NULL`（ADD COLUMN DEFAULT NULL）
  - 其他欄位值未被修改

---

## M2：Backfill entity 欄位 → condition_payload

### MT-M2-001：M2 backfill 將 prod_kind='A1$A2' 正確轉換為 condition_payload JSONB

- **關聯需求**：§18.4.2（M2 backfill 規則）/ GAP E2 / §18.10 Risk-6
- **測試類型**：Positive / Migration Integration
- **前置條件**：
  - M1 up() 完成
  - 插入測試名單：prod_kind='A1$A2'，caseyear='1$3'，spec_tp='01'，case_status='02'，settle_src='X'
- **步驟**：
  1. 執行 M2 up()（backfill）
  2. 查詢此名單的 condition_payload
- **預期結果**：
  - `condition_payload` 為有效 JSONB 陣列
  - 含 `{ "columnName": "prod_kind", "fieldType": "categorical", "values": ["A1", "A2"] }`
  - 含 `{ "columnName": "caseyear", "fieldType": "categorical", "values": ["1", "3"] }`
  - 含 `{ "columnName": "spec_tp", "fieldType": "categorical", "values": ["01"] }`
  - 含 `{ "columnName": "case_status", "fieldType": "categorical", "values": ["02"] }`
  - 含 `{ "columnName": "settle_src", "fieldType": "categorical", "values": ["X"] }`

---

### MT-M2-002：M2 backfill — entity 欄位含 NULL 時該條件不加入 condition_payload

- **關聯需求**：§18.4.2（NULL 欄位不轉換）/ GAP E2
- **測試類型**：Boundary / Migration Integration
- **前置條件**：
  - M1 up() 完成
  - 插入測試名單：prod_kind='A1'，caseyear=NULL，spec_tp=NULL，case_status=NULL，settle_src=NULL
- **步驟**：
  1. 執行 M2 up()
  2. 查詢此名單的 condition_payload
- **預期結果**：
  - condition_payload 僅含 1 個條件：prod_kind categorical values=['A1']
  - **不含** caseyear / spec_tp / case_status / settle_src 條件（NULL 欄位不轉換）

---

### MT-M2-003：M2 backfill — 5 個 entity 欄位皆為 NULL 時產生 _backfill_empty: true（OQ-TEST-002）

- **關聯需求**：OQ-TEST-002 解答 / §18.4.2（_backfill_empty 語意）/ GAP E2
- **測試類型**：Boundary / Migration Integration
- **前置條件**：
  - M1 up() 完成
  - 插入測試名單：prod_kind=NULL，caseyear=NULL，spec_tp=NULL，case_status=NULL，settle_src=NULL
- **步驟**：
  1. 執行 M2 up()
  2. 查詢此名單的 condition_payload
- **預期結果**：
  - `condition_payload = '[]'`（空陣列 JSONB）
  - 名單標記 `_backfill_empty = true`（依 schema 實作，可能為獨立欄位或 metadata）
  - Stage 1 執行時此名單將 skip（見 IT-M01-016）

---

### MT-M2-004：M2 backfill — numeric 欄位 min/max 格式正確轉換

- **關聯需求**：§18.4.2（numeric 欄位轉換規則）/ GAP E2
- **測試類型**：Positive / Migration Integration
- **前置條件**：
  - 插入測試名單含 year_cnt entity 欄位值 = `"2$5"`（代表 min=2, max=5）
- **步驟**：
  1. 執行 M2 up()
  2. 查詢 condition_payload
- **預期結果**：
  - 含 `{ "columnName": "year_cnt", "fieldType": "numeric", "min": 2, "max": 5 }`

---

### MT-M2-005：M2 backfill — 已有 condition_payload 的名單不被覆蓋（冪等保護）

- **關聯需求**：§18.4.2（冪等）/ GAP E2
- **測試類型**：Boundary / Migration Integration
- **前置條件**：
  - M1 up() 完成
  - 手動 UPDATE 某名單 condition_payload = `'[{"columnName":"prod_kind","fieldType":"categorical","values":["MANUAL"]}]'`
- **步驟**：
  1. 執行 M2 up()
  2. 查詢此名單的 condition_payload
- **預期結果**：
  - condition_payload 仍為 MANUAL 版本（M2 不覆蓋已有值，`WHERE condition_payload IS NULL`）

---

### MT-M2-006：M2 down() 將 condition_payload 清除為 NULL

- **關聯需求**：§18.4.2（rollback）/ GAP E2
- **測試類型**：Positive / Migration Integration（Rollback 驗證）
- **前置條件**：M2 up() 已執行
- **步驟**：
  1. 執行 M2 down()
  2. 查詢所有名單的 condition_payload
- **預期結果**：
  - 所有名單 condition_payload = NULL（M2 down 清除 backfill 資料）

---

## M3：spec_tp 32 筆 UPSERT

### MT-M3-001：M3 up() 後 pooldata_field_option spec_tp 共 32 筆

- **關聯需求**：F076 AC-3 v1.5 / §18.4.3（M3）/ GAP E5 / TS-F076-003
- **測試類型**：Positive / Migration Integration（DB 驗證）
- **前置條件**：M3（`1711360000283-UpsertSpecTpOptions32.ts`）之前的 migration 已執行
- **步驟**：
  1. 執行 M3 up()
  2. 查詢 `SELECT COUNT(*) FROM pooldata_field_option WHERE column_name = 'spec_tp'`
- **預期結果**：
  - count = 32（真實 OBMCODEDF TBL_ID='09' dump）
  - 所有 32 筆 `is_active = true`
  - **注意**：TEST-RISK-005 — Phase 5 TDD Developer 需先讀取 `reference/DumpData/OBMCODEDF_20260505.csv` 核實確切筆數，若非 32 則以 CSV 實際值為準

---

### MT-M3-002：M3 up() 重複執行不產生重複（UPSERT 冪等）

- **關聯需求**：F076 AC-3 / M3 idempotency / TS-F076-004
- **測試類型**：Boundary / Migration Integration（冪等驗證）
- **前置條件**：M3 up() 已執行一次
- **步驟**：
  1. 再次執行 M3 up()（第二次）
  2. 查詢 `SELECT COUNT(*) FROM pooldata_field_option WHERE column_name = 'spec_tp'`
- **預期結果**：
  - count 與第一次執行後相同（ON CONFLICT DO UPDATE 不新增重複）

---

### MT-M3-003：M3 down() 移除 spec_tp 所有 option 記錄

- **關聯需求**：§18.4.3（M3 rollback）
- **測試類型**：Positive / Migration Integration（Rollback 驗證）
- **前置條件**：M3 up() 已執行
- **步驟**：
  1. 執行 M3 down()
  2. 查詢 `SELECT COUNT(*) FROM pooldata_field_option WHERE column_name = 'spec_tp'`
- **預期結果**：count = 0（M3 回滾後 spec_tp option 清空）

---

## M4：case_status 4 筆 + whitelist 1 筆

### MT-M4-001：M4 up() 後 case_status options 共 4 筆（01/02/03/04）

- **關聯需求**：F076 AC-3 v1.5 / §18.4.4（M4）/ GAP E4 / TS-F076-001
- **測試類型**：Positive / Migration Integration（DB 驗證）
- **前置條件**：M4（`1711360000284-SeedCaseStatusWhitelistAndOptions.ts`）up() 執行前
- **步驟**：
  1. 執行 M4 up()
  2. 查詢 `SELECT option_value, option_label, is_active FROM pooldata_field_option WHERE column_name = 'case_status' ORDER BY option_value`
- **預期結果**：
  - 回傳 4 筆，option_value 分別為 '01'、'02'、'03'、'04'
  - 所有 is_active = true
  - '01' 含「期中」；'02' 含「中結」；'03'/'04' 含「滿期」

---

### MT-M4-002：M4 up() 同時將 case_status 加入 pooldata_field_whitelist

- **關聯需求**：F075 AC-1 v1.5 / §18.4.4（M4 whitelist seed）/ GAP E4
- **測試類型**：Positive / Migration Integration（DB 驗證）
- **前置條件**：M4 up() 已執行
- **步驟**：
  1. 查詢 `SELECT column_name, field_type, is_active FROM pooldata_field_whitelist WHERE column_name = 'case_status'`
- **預期結果**：
  - 1 筆記錄，`column_name = 'case_status'`，`field_type = 'categorical'`，`is_active = true`

---

### MT-M4-003：M4 up() 重複執行不產生重複（DO NOTHING 冪等）

- **關聯需求**：F076 AC-3 / M4 idempotency / TS-F076-005
- **測試類型**：Boundary / Migration Integration（冪等驗證）
- **前置條件**：M4 up() 已執行一次
- **步驟**：
  1. 再次執行 M4 up()（第二次）
  2. 查詢 `SELECT COUNT(*) FROM pooldata_field_option WHERE column_name = 'case_status'`
  3. 查詢 `SELECT COUNT(*) FROM pooldata_field_whitelist WHERE column_name = 'case_status'`
- **預期結果**：
  - options count = 4（不因重複執行增加）
  - whitelist count = 1（不因重複執行增加）

---

### MT-M4-004：M4 down() 移除 case_status options 與 whitelist 記錄

- **關聯需求**：§18.4.4（M4 rollback）
- **測試類型**：Positive / Migration Integration（Rollback 驗證）
- **前置條件**：M4 up() 已執行
- **步驟**：
  1. 執行 M4 down()
  2. 查詢 case_status options count（應為 0）
  3. 查詢 pooldata_field_whitelist 中 case_status（應不存在）
- **預期結果**：
  - options count = 0
  - whitelist 無 case_status 記錄

---

## M5：刪除 ob_code_df TBL_ID = 'PROD_KIND','SPEC_TP','CASE_STATUS'（高風險）

> **警告**：M5 為不可逆操作（刪除生產資料表紀錄），只在 staging/CI 環境執行測試。
> M5 must 在 F069 切換來源後方可執行（見 TS-F068-DEP-008 閘門驗證）。
> 對應 §18.10 Risk-9、TEST-RISK-004。
>
> **tbl_id 採英文常數**：m150 migration 已將 ob_code_df.tbl_id 從數字碼轉換為英文常數
> （原 '01'→'PROD_KIND'、'22'→'CASE_STATUS' 等）。本 M5 section 所有 tbl_id 值
> 均以 m150 轉碼後的英文常數為準：`'PROD_KIND'`、`'SPEC_TP'`、`'CASE_STATUS'`。
> 舊測試稿中的 `'02'`、`'05'`、`'09'` 為無效值，DB 中不存在。

### MT-M5-001：M5 執行前提 — F069 不再讀取 ob_code_df（部署閘門前置驗證）

- **關聯需求**：AD-E07-18 §18.2.7 / §18.10 Risk-9 / TS-F068-DEP-008
- **測試類型**：Negative / Deployment Gate（CI 前置檢查）
- **前置條件**：staging 環境，F069 Service 已切換為讀取 pooldata_field_option
- **步驟**：
  1. 執行 CI gate 腳本：掃描 F069 Service 不含 `FROM ob_code_df WHERE tbl_id` 的 SQL
  2. Gate 通過後方允許 M5 執行
- **預期結果**：
  - F069 Service 程式碼中不含 ob_code_df 直接查詢
  - Gate 通過（exit code 0）
  - M5 migration 允許繼續

---

### MT-M5-002：M5 up() 刪除 TBL_ID='PROD_KIND' 的所有紀錄

- **關聯需求**：§18.4.5（M5 DELETE）/ GAP E3
- **測試類型**：Positive / Migration Integration（DB 驗證，staging only）
- **前置條件**：
  - staging DB ob_code_df 含 TBL_ID='PROD_KIND' 的紀錄（m150 轉碼後）
  - M5 部署閘門前置驗證通過
- **步驟**：
  1. 記錄 M5 執行前 `SELECT COUNT(*) FROM ob_code_df WHERE tbl_id='PROD_KIND'`（基線）
  2. 執行 M5 up()
  3. 查詢 `SELECT COUNT(*) FROM ob_code_df WHERE tbl_id='PROD_KIND'`
- **預期結果**：
  - 執行後 count = 0
  - 執行前 count > 0（基線確認）

---

### MT-M5-003：M5 up() 刪除 TBL_ID='SPEC_TP' 與 'CASE_STATUS' 的所有紀錄

- **關聯需求**：§18.4.5（M5 DELETE 三個 TBL_ID）/ GAP E3
- **測試類型**：Positive / Migration Integration（DB 驗證，staging only）
- **前置條件**：同 MT-M5-002
- **步驟**：
  1. 執行 M5 up()
  2. 查詢 `SELECT COUNT(*) FROM ob_code_df WHERE tbl_id IN ('SPEC_TP','CASE_STATUS')`
- **預期結果**：count = 0（兩個 TBL_ID 全部刪除）

---

### MT-M5-004：M5 up() 不影響 ob_code_df 其他 TBL_ID 的紀錄

- **關聯需求**：§18.4.5（精確刪除，不誤刪）/ §18.10 Risk-9
- **測試類型**：Negative / Migration Integration（DB 驗證）
- **前置條件**：staging DB ob_code_df 含其他 TBL_ID（如 '01','03'）的紀錄
- **步驟**：
  1. 記錄其他 TBL_ID 的 COUNT 基線
  2. 執行 M5 up()
  3. 查詢其他 TBL_ID COUNT
- **預期結果**：其他 TBL_ID 的記錄數量不變（精確刪除 'PROD_KIND','SPEC_TP','CASE_STATUS' 只）

---

### MT-M5-005：M5 down() — ob_code_df 紀錄無法還原（不可逆警告）

- **關聯需求**：§18.4.5（M5 不可逆）/ §18.10 Risk-9 / TEST-RISK-004
- **測試類型**：Negative / Migration Integration（Rollback 限制驗證）
- **前置條件**：M5 up() 已執行
- **步驟**：
  1. 嘗試執行 M5 down()
  2. 驗證 down() 行為
- **預期結果**：
  - M5 down() **不還原**已刪除資料（或拋出明確的「不可回滾」錯誤）
  - 若 down() 為空函式（no-op）：驗證 down() 執行後 ob_code_df 仍無 TBL_ID='PROD_KIND','SPEC_TP','CASE_STATUS' 紀錄
  - 文件需明確標注：M5 回滾需從備份還原

---

### MT-M5-006：M5 執行後 F069 prod_kind label 查詢仍正常（pooldata_field_option 接替）

- **關聯需求**：AD-E07-18 §18.2.7（F069 閘門語意）/ §18.10 Risk-9
- **測試類型**：Positive / Integration（End-to-End 驗證）
- **前置條件**：
  - M5 up() 已執行（ob_code_df TBL_ID='PROD_KIND' 已刪除）
  - F069 Service 已切換為讀取 pooldata_field_option
  - pooldata_field_option 含 prod_kind options（M3/M4 seed 後）
- **步驟**：
  1. 呼叫 F069 提供 prod_kind label 的端點
  2. 驗證回應
- **預期結果**：
  - 正常回傳 prod_kind label（來源為 pooldata_field_option）
  - **不因 ob_code_df 刪除而 500 或回傳空資料**

---

## 附錄：GAP 覆蓋對照

| GAP | 覆蓋場景 |
|---|---|
| E1（M1 ADD COLUMN + GIN index） | MT-M1-001、MT-M1-002、MT-M1-003、MT-M1-004 |
| E2（M2 backfill 正確性） | MT-M2-001、MT-M2-002、MT-M2-003、MT-M2-004、MT-M2-005、MT-M2-006 |
| E3（M5 DELETE ob_code_df） | MT-M5-002、MT-M5-003、MT-M5-004、MT-M5-005 |
| E4（M4 case_status seed） | MT-M4-001、MT-M4-002、MT-M4-003、MT-M4-004 |
| E5（M3 spec_tp 32 筆） | MT-M3-001、MT-M3-002、MT-M3-003 |
| OQ-TEST-002（M2 _backfill_empty） | MT-M2-003 |

## 附錄：AD-E07-18 §18.10 高風險案例覆蓋

| §18.10 案例 | 覆蓋場景 |
|---|---|
| Risk-1（M1 ADD COLUMN 對現有資料無損） | MT-M1-004 |
| Risk-4（M2 backfill 冪等） | MT-M2-005 |
| Risk-7（M5 精確刪除，不誤刪其他） | MT-M5-004 |
| Risk-8（M5 F069 閘門） | MT-M5-001、MT-M5-006 |
| Risk-9（M5 不可逆，rollback 警告） | MT-M5-005 |
