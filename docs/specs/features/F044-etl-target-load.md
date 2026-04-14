---
spec-id: F044
title: ETL Target Load + UPSERT
feature-id: F044
source-story: US-057
epic: E05
priority: P0-MVP
version: "1.1"
date: 2026-04-14
status: Draft
---

# F044: ETL Target Load + UPSERT

Priority: P0-MVP | Status: Draft | Last Updated: 2026-04-14

## 1. 功能摘要

`target_load` 節點負責將經過完整 ETL 轉換的資料集 UPSERT 寫入目標表（`customer_core`）。以 `source_customer_no` 唯一索引為 conflict key，新資料 INSERT、既有資料 UPDATE。同時自動填充 ETL 追蹤欄位（`_etl_loaded_at`、`_etl_pipeline_id`、`data_source`）。測試執行模式下跳過實際寫入。

## 2. 前置條件

- F042（執行引擎核心框架）已完成
- F043（節點執行器）已完成，上游節點正確產出資料
- 目標表 `customer_core` 已透過 migration 建立
- 唯一索引 `idx_customer_core_source_no` 存在於 `source_customer_no` 欄位

## 3. 節點設定參數

```typescript
interface TargetLoadConfig {
  nodeType: 'target_load';
  label: string;
  targetTable: string;        // 'customer_core'
  subtitle?: string;
  fieldMappings?: Record<string, string>;  // 保留但 MVP 不使用
}
```

## 4. TypeScript 介面

### 4.1 TargetLoadExecutor

```typescript
class TargetLoadExecutor implements NodeExecutor {
  readonly nodeType = 'target_load';

  async execute(context: NodeExecutionContext): Promise<DataSet> {
    // 見主要流程
  }
}
```

### 4.2 UPSERT 參數

```typescript
interface UpsertOptions {
  targetTable: string;
  conflictColumn: string;           // 'source_customer_no'
  excludeFromUpdate: string[];      // ['customer_id']（UPDATE 時不修改的欄位）
  etlTrackingFields: {
    _etl_loaded_at: Date;
    _etl_pipeline_id: string;
  };
  batchSize: number;                // 每批次筆數（預設 5000）
}
```

## 5. 主要流程

1. 從 `context.inputs['default']` 取得輸入 DataSet
2. 驗證目標表存在（透過 `queryRunner` 查詢 `information_schema.tables`）
3. 若 `context.isTestRun === true`：
   - 跳過步驟 4~8
   - 回傳 `DataSet { rows: [], rowCount: inputDataSet.rowCount }`（記錄預計寫入筆數）
4. 準備 ETL 追蹤欄位值：
   - `_etl_loaded_at` = `new Date()`（當前執行時間）
   - `_etl_pipeline_id` = `context.pipelineId`
5. 對輸入 DataSet 的每列資料：
   - 附加 `_etl_loaded_at` 與 `_etl_pipeline_id`
   - `data_source` 欄位取自輸入資料列（由 df3 derived_field 節點產生），不需額外填充
   - `customer_id` 欄位取自輸入資料列（由 df3 gen_random_uuid 產生），INSERT 時寫入，UPDATE 時不修改
6. **資料品質閘門**（BUG-2 修正）：
   - 跳過 `source_customer_no` 長度 < 5 的記錄（排除 ghost records，如 `"01"`、`"."`、`"0"` 等無效識別碼）
   - 跳過的記錄筆數記錄於節點日誌中
   - **禁止**使用 `information_schema.columns` 的 `is_nullable='NO'` 欄位清單動態推導過濾條件（此為 BUG-2 的根因：MLMC-only 記錄的 `name=null` 或 `customer_type_code=null` 被隱性過濾排除）
   - NOT NULL 欄位為 null 的記錄（如 `name=null`）應正常寫入，由資料庫 constraint 決定是否拒絕
7. **VARCHAR 空字串正規化**：對所有 VARCHAR 型別欄位執行 `NULLIF(TRIM(col), '')`，將空字串與純空白字串統一轉為 null，避免空字串與 NULL 語意不一致
8. 將資料分批（batch size 預設 5000 筆）
9. 逐批執行 UPSERT SQL：

```sql
INSERT INTO customer_core (
  customer_id, source_customer_no, customer_type, name, ...,
  data_source, _etl_loaded_at, _etl_pipeline_id
)
VALUES
  ($1, $2, $3, $4, ..., $N),
  ($N+1, $N+2, ...),
  ...
ON CONFLICT (source_customer_no)
DO UPDATE SET
  customer_type = EXCLUDED.customer_type,
  name = EXCLUDED.name,
  ...
  data_source = EXCLUDED.data_source,
  _etl_loaded_at = EXCLUDED._etl_loaded_at,
  _etl_pipeline_id = EXCLUDED._etl_pipeline_id;
```

10. 統計成功 UPSERT 的總筆數
11. 回傳 `DataSet { rows: [], rowCount: totalUpsertedCount }`

**關鍵 SQL 規則：**

- `customer_id` 不在 `DO UPDATE SET` 子句中（UPDATE 時保留原值）
- `source_customer_no` 為 conflict key，不在 `DO UPDATE SET` 中
- 其餘所有欄位（包含 ETL 追蹤欄位）皆在 `DO UPDATE SET` 中

## 6. 替代流程

### 6.1 測試執行（is_test_run = true）

1. 不執行 UPSERT SQL
2. `outputRowCount` = 輸入 DataSet 的 rowCount（預計寫入筆數）
3. 節點 status 標記為 `'completed'`
4. 目標表資料不受影響

### 6.2 目標表不存在

1. 驗證步驟偵測到目標表不存在
2. 節點標記為 `'failed'`
3. `errorMessage` = `目標表 {targetTable} 不存在，請確認 migration 已執行`
4. 觸發 Pipeline 中止流程（F042 AC-6）

### 6.3 批次寫入部分失敗

1. 若某一批次 UPSERT 執行失敗
2. 已寫入的批次**不回滾**（接受部分寫入）
3. 節點標記為 `'failed'`
4. `errorMessage` 記錄失敗批次的起始 offset 與錯誤訊息
5. `outputRowCount` 記錄已成功寫入的筆數

## 7. 邊界情況

| 情境 | 預期行為 |
|------|---------|
| 輸入 DataSet 為空（rowCount = 0） | 不執行 UPSERT，節點 `'completed'`，outputRowCount = 0 |
| 輸入資料列缺少某些 nullable 欄位 | 以 null 寫入（資料庫允許 nullable） |
| 輸入資料列缺少 `source_customer_no` | UPSERT 失敗（NOT NULL 約束），節點 `'failed'` |
| 目標表已有相同 `source_customer_no` 的資料 | 執行 UPDATE（覆蓋除 customer_id 外的所有欄位） |
| 單批次超過 PostgreSQL 參數上限（65535） | 自動縮減 batch size 使參數數 < 65535 |
| 並行 Pipeline 同時 UPSERT 同一 `source_customer_no` | PostgreSQL ON CONFLICT 機制保證原子性，後寫入者覆蓋 |
| `source_customer_no` 長度 < 5（ghost record）（BUG-2 修正） | 跳過不寫入，跳過筆數記錄於節點日誌 |
| 輸入資料 NOT NULL schema 欄位為 null（如 `name=null`）（BUG-2 修正） | 正常寫入，不因 schema `is_nullable='NO'` 過濾排除 |
| VARCHAR 欄位值為空字串或純空白 | `NULLIF(TRIM(col), '')` 正規化為 null 後寫入 |

## 8. ETL 追蹤欄位規格

| 欄位 | 型別 | 填充方式 | 說明 |
|------|------|---------|------|
| `customer_id` | UUID | 輸入資料列（df3 gen_random_uuid） | INSERT 時寫入，UPDATE 時保留原值 |
| `source_customer_no` | VARCHAR(20) | 輸入資料列（fm1/fm2 mapping） | UPSERT conflict key |
| `data_source` | VARCHAR(50) | 輸入資料列（df3 CASE WHEN） | 資料來源識別 |
| `_etl_loaded_at` | TIMESTAMP | `new Date()`（引擎自動填充） | ETL 載入時間 |
| `_etl_pipeline_id` | UUID | `context.pipelineId`（引擎自動填充） | 執行該次 ETL 的 Pipeline ID |

## 9. 批次大小計算

```
maxParamsPerQuery = 65535（PostgreSQL 限制）
columnsPerRow = customer_core 欄位數（約 45）
maxBatchSize = floor(maxParamsPerQuery / columnsPerRow)
actualBatchSize = min(configuredBatchSize, maxBatchSize)
```

預設 `configuredBatchSize = 5000`。當欄位數為 45 時，`maxBatchSize = floor(65535/45) = 1456`，故實際 batch size 為 1456。

## 10. 驗收標準

### AC-1: UPSERT INSERT 新資料

- Given customer_core 中 source_customer_no = "A001" 不存在
- When tl1 執行，輸入含 source_customer_no: "A001", name: "王大明"
- Then customer_core 新增一列，source_customer_no = "A001"，name = "王大明"，_etl_loaded_at 有值

### AC-2: UPSERT UPDATE 既有資料

- Given customer_core 中 source_customer_no = "A001" 已存在，name = "舊名稱"
- When tl1 執行，輸入含 source_customer_no: "A001", name: "新名稱"
- Then name 更新為 "新名稱"，customer_id 不變

### AC-3: ETL 追蹤欄位自動填充

- Given tl1 執行，pipeline_id = "uuid-pipeline-1"
- When UPSERT 完成
- Then 所有寫入列的 _etl_pipeline_id = "uuid-pipeline-1"，_etl_loaded_at 為本次執行時間

### AC-4: customer_id UPDATE 時不變

- Given customer_core 中 source_customer_no = "A001" 已存在，customer_id = "uuid-old"
- When tl1 再次 UPSERT source_customer_no = "A001"（輸入資料含 customer_id = "uuid-new"）
- Then customer_id 仍為 "uuid-old"（不被覆蓋）

### AC-5: 測試執行不寫入

- Given is_test_run = true
- When tl1 執行
- Then customer_core 資料筆數不變
- And tl1 status = `'completed'`，outputRowCount = 輸入筆數

### AC-6: 目標表不存在

- Given targetTable = "non_existent_table"
- When tl1 執行
- Then tl1 status = `'failed'`，errorMessage 包含「目標表 non_existent_table 不存在」

### AC-7: 批次寫入

- Given 輸入 DataSet 有 10,000 列
- When tl1 執行（batch size = 1456）
- Then 分 7 批（1456 × 6 + 1264）完成 UPSERT
- And outputRowCount = 10000

### AC-8: 空資料集輸入

- Given 輸入 DataSet rowCount = 0
- When tl1 執行
- Then 不執行 UPSERT，節點 `'completed'`，outputRowCount = 0

### AC-9: 部分批次失敗

- Given 第 3 批 UPSERT 時資料庫連線中斷
- When 引擎捕獲錯誤
- Then tl1 status = `'failed'`，outputRowCount 記錄已成功寫入的筆數（前 2 批）
- And errorMessage 包含失敗批次 offset 與錯誤訊息

### AC-10: MLMC-only 記錄不因 name=null 被排除（BUG-2 修正）

- Given tl1 輸入含一列 `source_customer_no = "MLMC-999"`、`name = null`、`customer_type_code = "02"`
- When tl1 執行 UPSERT
- Then `customer_core` 中 `source_customer_no = "MLMC-999"` 記錄存在，`name = null`
- And `node_logs[tl1].outputRowCount` 包含此列（不遺失）

### AC-11: ghost record 閘門過濾短識別碼（BUG-2 修正）

- Given tl1 輸入含三列：`source_customer_no = "01"`（長度 2）、`source_customer_no = "."`（長度 1）、`source_customer_no = "VALID001"`（長度 8）
- When tl1 執行 UPSERT
- Then `customer_core` 中只寫入 `source_customer_no = "VALID001"` 的列
- And 前兩列因 `source_customer_no` 長度 < 5 被跳過
- And `node_logs[tl1].outputRowCount = 1`，跳過筆數記錄於節點日誌中

### AC-12: VARCHAR 空字串正規化為 null

- Given tl1 輸入含一列 `source_customer_no = "TEST001"`、`name = "  "`（純空白）、`email = ""`（空字串）
- When tl1 執行 UPSERT
- Then `customer_core` 中 `source_customer_no = "TEST001"` 記錄的 `name = null`、`email = null`（經 `NULLIF(TRIM(col), '')` 正規化）

## 11. 錯誤場景

| 場景 | 系統回應 | 參考 |
|------|---------|------|
| 目標表不存在 | 節點 `failed`，Pipeline 中止 | error-handling.md#etl-pipeline-errors |
| NOT NULL 約束違反 | 節點 `failed`，記錄違反的欄位與行 | error-handling.md#etl-pipeline-errors |
| 資料庫連線中斷 | 節點 `failed`，記錄已寫入筆數 | error-handling.md#etl-pipeline-errors |
| PostgreSQL 參數上限超過 | 自動調整 batch size（非錯誤） | — |

## 12. 相關文件

- 執行引擎框架：[F042-etl-execution-engine.md](F042-etl-execution-engine.md)
- 節點執行器：[F043-etl-node-executors.md](F043-etl-node-executors.md)
- 目標表定義：[F036-target-tables.md](F036-target-tables.md)（第 11 節 customer_core 欄位定義）
- UPSERT SQL：本文件第 5 節
- Pipeline 定義：`scripts/seed-pipeline-definition.json`（tl1 節點）
- 資料模型：[data-model.md](../data-model.md#target-tables)
