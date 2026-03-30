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

- **Given**：輸入列含有 100 個欄位，mappings 只定義 38 組
- **When**：fm1 執行，`dropUnmapped: true`
- **Then**：輸出列只有 38 個欄位，其餘 62 個欄位不存在

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

---

## 依賴關係

- **Blocked By**：US-055（框架：DataSet 介面、nodeOutputMap）、US-056（field_mapping 依賴 merge / derived_field 的輸出欄位命名）
- **Blocks**：無

---

## Definition of Done

- [ ] field_mapping 節點實作完成（dropUnmapped 邏輯正確）
- [ ] conditional 節點實作完成，支援 `>=`、`IS NOT NULL` 比較與 `left.` / `right.` 欄位解析
- [ ] target_load 節點實作完成，UPSERT 邏輯正確（INSERT + ON CONFLICT DO UPDATE）
- [ ] ETL 追蹤欄位自動填充（`_etl_loaded_at`、`_etl_pipeline_id`、`data_source`）
- [ ] 測試執行跳過 UPSERT 且節點 status 為 completed
- [ ] 各節點單元測試完成，覆蓋正常路徑與邊界情況
- [ ] 整合測試：以 seed-pipeline-definition.json 完整執行後，customer_core 確實有資料寫入（非測試執行模式）

---

## 相關文件

- **Epic Brief**：[E05 Epic Brief](epic-brief.md)
- **Pipeline 定義**：`scripts/seed-pipeline-definition.json`
- **目標表 Schema**：`apps/api/src/modules/etl/target-table-schemas.ts`
- **目標表 Migration**：`apps/api/src/database/migrations/1711360000000-CreateCustomerCore.ts`
- **F036 ETL 轉換規則**：`docs/specs/features/F036-target-tables.md`
- **相關 Stories**：US-055（框架）、US-056（上游節點）、US-058（批次策略）
