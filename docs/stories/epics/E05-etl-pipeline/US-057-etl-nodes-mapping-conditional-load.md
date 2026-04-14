# US-057：ETL 節點實作 — FieldMapping、Conditional、TargetLoad

> **Story ID**：US-057
> **Epic**：[E05 — ETL Pipeline 管理](epic-brief.md)
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：8

---

## User Story

**As a** Admin（管理者）
**I want** FieldMapping / Conditional / TargetLoad 三種節點能執行真正的轉換與寫入邏輯
**So that** 中間資料能正確地進行欄位對應、衝突解決，並最終 UPSERT 寫入 customer_core

---

## 背景

本 Story 涵蓋 Pipeline 後段（下游）三種節點的處理邏輯。這些節點負責最終的欄位整理、業務邏輯條件判斷，以及將資料寫入目標表。

**節點在 seed-pipeline 中的分佈：**
- `field_mapping`：fm1, fm2（2 個）
- `conditional`：cd1（1 個）
- `target_load`：tl1（1 個）

---

## 驗收標準

### AC-1：field_mapping — 欄位重新命名並篩選

- **Given** 節點設定含有 `mappings`（`sourceColumn` → `targetColumn` 的對應清單）與 `dropUnmapped: true`
- **When** 節點執行
- **Then** 對輸入 DataSet 的每列，依 `mappings` 建立新的輸出列：
  - 將 `sourceColumn` 的值複製到 `targetColumn`（欄位重新命名）
  - 若 `sourceColumn` 不存在於資料列中，且 `defaultValue` 不為 null，則以 `defaultValue` 填入
  - 若 `sourceColumn` 不存在且 `defaultValue` 為 null，則 `targetColumn` 設為 null
- **And** 若 `dropUnmapped: true`，輸出列僅包含 `mappings` 中定義的 `targetColumn` 欄位，其餘欄位丟棄
- **And** 輸出 DataSet 的 rowCount 與輸入相同

### AC-2：conditional — 條件式欄位賦值（衝突解決）

- **Given** 節點設定含有 `rules`，每條規則包含 `targetColumn`、`conditions`（`when` / `then`）與 `elseValue`
- **When** 節點執行
- **Then** 對輸入 DataSet 的每列，逐條 rule 執行條件判斷：
  - 逐一評估 `conditions` 中的 `when` 表達式，第一個成立的 `then` 值即為 `targetColumn` 的值
  - 若無任何 `when` 成立，使用 `elseValue` 的值
- **And** 評估完所有 rules 後，以 rules 的 `targetColumn` 欄位值覆蓋輸入列中對應欄位
- **And** 輸出 DataSet 的 rowCount 與輸入相同

**支援的 when 表達式語法（僅 seed-pipeline 使用的格式）：**

| 語法 | 評估邏輯 |
|------|---------|
| `left.{col} >= right.{col}` | 比較兩欄位的值（支援 TIMESTAMP 字串比較、null 安全：任一為 null 則條件不成立） |
| `left.{col} IS NOT NULL` | 欄位值非 null |
| `right.{col} IS NOT NULL` | 欄位值非 null |

**then / elseValue 語法：**

| 語法 | 評估邏輯 |
|------|---------|
| `left.{col}` | 取資料列中對應欄位值 |
| `right.{col}` | 取資料列中對應欄位值 |
| `'{字串常量}'` | 固定字串值 |

> 說明：`left.` / `right.` 前綴來自 merge 節點後的欄位命名約定。在 cd1 節點的輸入資料中，`left.source_updated_at` 與 `right.source_updated_at` 分別代表 ZZIP 路線與 MLMC 路線的更新時間。

### AC-2a：conditional — MLMC-only 記錄完整欄位衝突解決（BUG-2 修正）

- **Given** cd1 輸入含 MLMC-only 記錄（ZZIP 路線欄位全為 null，MLMC 路線欄位存在於 `_right` 後綴欄位中，如 `name_right`、`customer_type_code_right`）
- **When** cd1 執行 rules
- **Then** 對每條 rule，當 `left.{col} IS NOT NULL` 條件不成立（因 ZZIP 路線值為 null），繼續評估下一個 condition 或 `elseValue`
- **And** `elseValue: "right.{col}"` 正確解析為列中的 `{col}_right` 欄位，取得 MLMC 路線的非 null 值
- **And** 輸出列中 `name`、`customer_type_code`、`mobile_phone`、`mailing_address`、`capital`、`office_phone` 等關鍵欄位，對 MLMC-only 記錄均有值（來自 MLMC 路線），不得因 `_right` 欄位未涵蓋而全為 null
- **And** cd1 的 `rules` 必須涵蓋 m4 輸出中所有有 `_right` 後綴版本的欄位，不限於原始 5 個欄位

> **根因**：原實作 cd1 只設定 name、mobile_phone、mailing_address、capital、office_phone 共 5 個欄位的衝突解決規則，其餘欄位（如 customer_type_code、各地址欄位等）對 MLMC-only 記錄保持左側（ZZIP）值，即 null。後續 `target-load-handler.ts` 的 NOT NULL 過濾（name=null、customer_type_code=null）導致整列被排除。

### AC-3：target_load — UPSERT 寫入目標表

- **Given** 節點設定含有 `targetTable`（如 `customer_core`）
- **When** 節點執行（且非測試執行）
- **Then** 引擎將輸入 DataSet 的所有資料列，以批次方式 UPSERT 寫入目標表：
  - UPSERT 策略：以 `source_customer_no` 欄位為唯一鍵（依 `idx_customer_core_source_no` 唯一索引）
  - 若 `source_customer_no` 已存在：UPDATE 所有非主鍵欄位
  - 若 `source_customer_no` 不存在：INSERT 新列
- **And** 自動填充 ETL 追蹤欄位（不需出現在輸入資料列中）：
  - `_etl_loaded_at`：當前執行時間（`new Date()`）
  - `_etl_pipeline_id`：執行中的 `pipeline.id`
  - `data_source`：取自輸入資料列的 `data_source` 欄位（由 df3 derived_field 節點產生）
- **And** `customer_id` 欄位不由引擎填充，以資料庫 DEFAULT `gen_random_uuid()` 自動生成（INSERT 時），UPDATE 時不修改 `customer_id`
- **And** 所有 UPSERT 操作使用單一資料庫 transaction：若批次中任何一批失敗，整個 target_load 節點標記為 `'failed'`，已寫入的批次**不回滾**（接受部分寫入，但記錄失敗節點的錯誤訊息與失敗批次起始 offset）
- **And** 節點完成後，`node_logs[tl1].outputRowCount` 記錄成功 UPSERT 的總筆數

### AC-3a：target_load — 將隱性 NOT NULL 過濾改為顯式資料品質閘門（BUG-2 修正）

- **Given** tl1 輸入含 MLMC-only 記錄，其中 `name = null`（上游 cd1 已透過 COALESCE 從 `_right` 欄位補值，但仍可能為 null）
- **When** tl1 執行 UPSERT
- **Then** 該記錄正常寫入 `customer_core`，`name` 欄位為 null，不被排除
- **And** tl1 的資料品質閘門（過濾邏輯）僅保留以下一條顯式規則：`source_customer_no` 長度 < 5 的記錄跳過（排除 ghost records，如 `"01"`、`` "`" ``、`"0"`、`"."` 等無效識別碼）
- **And** tl1 不得使用 DB schema 的 `is_nullable='NO'` 欄位清單動態推導過濾條件（此為隱性過濾的根因，造成 MLMC-only 記錄的 null 欄位被誤判為無效資料）

> **根因（BUG-2）**：`target-load-handler.ts:77-85` 依據 `is_nullable='NO'` 的欄位清單過濾輸入資料列，將 `name=null` 或 `customer_type_code=null` 的記錄排除。MLMC-only 記錄在 cd1 衝突解決後，若其 `_right` 欄位已補值則不為 null；但過濾邏輯早於 conditional COALESCE 完成前執行，或 cd1 rules 未完整涵蓋所有欄位，造成記錄被靜默丟棄。修正後改為顯式 `source_customer_no` 長度閘門，不再依賴 schema 動態過濾。

### AC-4：target_load — 目標表不存在時的處理

- **Given** `targetTable` 設定值在資料庫中不存在（或目標表未完成 migration）
- **When** tl1 節點執行
- **Then** 節點標記為 `'failed'`，錯誤訊息為「目標表 {targetTable} 不存在，請確認 migration 已執行」

### AC-5：field_mapping 輸入欄位缺失的容錯

- **Given** mappings 中 `sourceColumn = "home_phone"` 但上游資料列中不存在此欄位（如 MLMC 路線資料）
- **When** fm1 執行
- **Then** 輸出列的 `home_phone = null`（不拋出例外），繼續處理其他欄位

---

## 技術備註

### UPSERT SQL（PostgreSQL）

```sql
INSERT INTO customer_core ({columns})
VALUES ({values})
ON CONFLICT (source_customer_no)
DO UPDATE SET
  {col1} = EXCLUDED.{col1},
  {col2} = EXCLUDED.{col2},
  ...
  _etl_loaded_at = EXCLUDED._etl_loaded_at,
  _etl_pipeline_id = EXCLUDED._etl_pipeline_id;
```

`customer_id` 不在 `DO UPDATE SET` 子句中（保留原值）。

### conditional 節點中 left. / right. 欄位解析

cd1 的輸入來自 m4（FULL OUTER JOIN fm1 與 fm2）。m4 執行後，資料列中含有：
- ZZIP 路線的欄位（來自 fm1 輸出）
- MLMC 路線的欄位（若與 ZZIP 同名，加 `_right` 後綴）

`left.source_updated_at` 解析為列中的 `source_updated_at` 欄位（ZZIP 路線）。
`right.source_updated_at` 解析為列中的 `source_updated_at_right` 欄位（MLMC 路線，若名稱衝突）。

> 開放問題：merge 節點後的欄位命名規則（是否加前綴、加什麼前綴）須在 US-055 框架決定後，US-056 與 US-057 統一遵循。

### target_load 批次大小

每批次 UPSERT 的筆數上限定義於 US-058（批次策略）。target_load 節點讀取批次設定，逐批呼叫資料庫，不一次性將全部 DataSet 傳入單一 SQL 指令。

### 測試執行（is_test_run = true）行為

當 `is_test_run = true` 時，target_load 節點：
1. **不執行** UPSERT
2. 記錄預計寫入筆數（`outputRowCount = inputDataSet.rowCount`）
3. 節點 status 標記為 `'completed'`（模擬成功）

---

## 測試案例

### TC-057-01：field_mapping 正確重新命名欄位

- **Given**：輸入列含有 `CUSTO_NO: "A001"`, `CUS_NAME: "王大明"`
- **When**：fm1 執行 `[{sourceColumn: "CUSTO_NO", targetColumn: "source_customer_no"}, {sourceColumn: "CUS_NAME", targetColumn: "name"}]`，`dropUnmapped: true`
- **Then**：輸出列含有 `source_customer_no: "A001"`, `name: "王大明"`，不含 `CUSTO_NO` 與 `CUS_NAME`

### TC-057-02：field_mapping dropUnmapped 丟棄未映射欄位

- **Given**：輸入列含有 100 個欄位，mappings 只定義 48 組
- **When**：fm1 執行，`dropUnmapped: true`
- **Then**：輸出列只有 48 個欄位，其餘 52 個欄位不存在

### TC-057-03：conditional 選擇較新的值

- **Given**：列中 `source_updated_at = "2024-03-01"`, `source_updated_at_right = "2024-01-01"`, `name = "王大明"`, `name_right = "WANG DAMING"`
- **When**：cd1 執行 rule `{targetColumn: "name", when: "left.source_updated_at >= right.source_updated_at", then: "left.name", else: "right.name"}`
- **Then**：輸出列的 `name = "王大明"`（left 較新，選 left）

### TC-057-04：conditional 選擇 right（right 較新）

- **Given**：列中 `source_updated_at = "2024-01-01"`, `source_updated_at_right = "2024-03-01"`, `name = "王大明"`, `name_right = "WANG DAMING"`
- **When**：cd1 執行同上 rule
- **Then**：輸出列的 `name = "WANG DAMING"`（right 較新，選 right）

### TC-057-05：target_load UPSERT 新資料

- **Given**：customer_core 表中 `source_customer_no = "A001"` 不存在
- **When**：tl1 執行，輸入含 `source_customer_no: "A001"`, `name: "王大明"` 的列
- **Then**：customer_core 新增一列，`source_customer_no = "A001"`, `name = "王大明"`, `_etl_loaded_at` 有值

### TC-057-06：target_load UPSERT 更新既有資料

- **Given**：customer_core 表中 `source_customer_no = "A001"` 已存在，`name = "舊名稱"`
- **When**：tl1 執行，輸入含 `source_customer_no: "A001"`, `name: "新名稱"` 的列
- **Then**：customer_core 中 `source_customer_no = "A001"` 的列 `name` 更新為 "新名稱"，`customer_id` 不變

### TC-057-07：target_load ETL 追蹤欄位自動填充

- **Given**：tl1 執行，pipeline_id = "uuid-pipeline-1"
- **When**：UPSERT 完成
- **Then**：所有寫入列的 `_etl_pipeline_id = "uuid-pipeline-1"`, `_etl_loaded_at` 為本次執行時間

### TC-057-08：target_load 測試執行不寫入

- **Given**：is_test_run = true
- **When**：tl1 執行
- **Then**：customer_core 資料筆數不變；tl1 status = `'completed'`，outputRowCount = 輸入筆數

### TC-057-09：target_load 目標表不存在

- **Given**：targetTable = "non_existent_table"
- **When**：tl1 執行
- **Then**：tl1 status = `'failed'`，errorMessage 包含「目標表 non_existent_table 不存在」

### TC-057-10：conditional MLMC-only 記錄透過 elseValue 正確取得欄位值（BUG-2 修正驗證）

- **Given**：cd1 輸入列含 `name = null`、`name_right = "企業甲"`、`source_updated_at = null`、`source_updated_at_right = "2024-01-01"`
- **When**：cd1 執行 rule `{targetColumn: "name", conditions: [{when: "left.source_updated_at >= right.source_updated_at", then: "left.name"}], elseValue: "right.name"}`
- **Then**：輸出列 `name = "企業甲"`（`left.source_updated_at IS NOT NULL` 不成立，fallback 到 `elseValue`，`right.name` 解析為 `name_right` 欄位）

### TC-057-11：conditional ZZIP-only 記錄保持 left 欄位值（BUG-2 修正驗證）

- **Given**：cd1 輸入列含 `name = "個人丙"`、`name_right = null`、`source_updated_at = "2024-02-01"`、`source_updated_at_right = null`
- **When**：cd1 執行同上 rule
- **Then**：輸出列 `name = "個人丙"`（`left.source_updated_at >= right.source_updated_at` 條件中 right 為 null 不成立，但 `left.source_updated_at IS NOT NULL` 成立，取 `left.name`）

### TC-057-12：target_load 不因 name=null 排除 MLMC-only 記錄（BUG-2 修正驗證）

- **Given**：tl1 輸入含一列 `source_customer_no = "MLMC-999"`、`name = null`、`customer_type_code = "02"`
- **When**：tl1 執行 UPSERT
- **Then**：`customer_core` 中 `source_customer_no = "MLMC-999"` 記錄存在，`name = null`，`node_logs[tl1].outputRowCount` 包含此列（不遺失）

### TC-057-13：target_load ghost record 閘門過濾短識別碼（BUG-2 修正驗證）

- **Given**：tl1 輸入含三列：`source_customer_no = "01"`（長度 2）、`source_customer_no = "."`（長度 1）、`source_customer_no = "VALID001"`（長度 8）
- **When**：tl1 執行 UPSERT
- **Then**：`customer_core` 中只寫入 `source_customer_no = "VALID001"` 的列；前兩列因 `source_customer_no` 長度 < 5 被跳過，`node_logs[tl1].outputRowCount = 1`，跳過筆數記錄於節點日誌中

---

## 依賴關係

- **Blocked By**：US-055（框架：DataSet 介面、nodeOutputMap）、US-056（field_mapping 依賴 merge / derived_field 的輸出欄位命名）
- **Blocks**：無

---

## Definition of Done

- [ ] field_mapping 節點實作完成（dropUnmapped 邏輯正確）
- [ ] conditional 節點實作完成，支援 `>=`、`IS NOT NULL` 比較與 `left.` / `right.` 欄位解析
- [ ] conditional 節點 rules 涵蓋 m4 輸出所有有 `_right` 後綴的欄位，MLMC-only 記錄關鍵欄位均有值（BUG-2 修正驗證）
- [ ] target_load 節點實作完成，UPSERT 邏輯正確（INSERT + ON CONFLICT DO UPDATE）
- [ ] target_load 資料品質閘門改為顯式 `source_customer_no` 長度 >= 5 過濾，移除基於 `is_nullable='NO'` 的隱性 schema 過濾（BUG-2 修正驗證）
- [ ] ETL 追蹤欄位自動填充（`_etl_loaded_at`、`_etl_pipeline_id`、`data_source`）
- [ ] 測試執行跳過 UPSERT 且節點 status 為 completed
- [ ] 各節點單元測試完成，覆蓋正常路徑與邊界情況
- [ ] 整合測試：以 seed-pipeline-definition.json 完整執行後，customer_core 確實有資料寫入（非測試執行模式）
- [ ] 整合測試：pipeline 執行後 customer_core 中 MLMC-only 記錄筆數 > 0（BUG-2 整合驗證）

---

## 相關文件

- **Epic Brief**：[E05 Epic Brief](epic-brief.md)
- **Pipeline 定義**：`scripts/seed-pipeline-definition.json`
- **目標表 Schema**：`apps/api/src/modules/etl/target-table-schemas.ts`
- **目標表 Migration**：`apps/api/src/database/migrations/1711360000000-CreateCustomerCore.ts`
- **F036 ETL 轉換規則**：`docs/specs/features/F036-target-tables.md`
- **相關 Stories**：US-055（框架）、US-056（上游節點）、US-058（批次策略）
