---
type: test-design-feature
feature_id: F044
feature_name: ETL Target Load + UPSERT / fullMode
priority: P0-MVP
related_spec: /docs/specs/features/F044-etl-target-load.md
related_story: US-057（target_load 部分）
last_updated: 2026-04-15
---

# F044: ETL Target Load + UPSERT — 測試設計

## 測試策略

### 單元測試範疇
- **測試執行模式（is_test_run = true）**：不需真實 DB，驗證回傳筆數邏輯
- **目標表存在性驗證**：Mock queryRunner 驗證判斷邏輯
- **批次大小計算**：純數學計算，無 DB 依賴
- **ETL 追蹤欄位填充**：驗證 `_etl_loaded_at` 與 `_etl_pipeline_id` 是否正確附加
- **fullMode=true 正常路徑**：Mock queryRunner 驗證 TRUNCATE SQL 與 INSERT SQL（無 ON CONFLICT）的呼叫序列
- **fullMode=true + is_test_run=true**：Mock queryRunner 驗證 TRUNCATE 未被呼叫（安全防護）
- **fullMode=false（向後相容）**：Mock queryRunner 驗證無 TRUNCATE，UPSERT SQL 含 ON CONFLICT
- **fullMode=true INSERT 部分失敗**：Mock queryRunner 模擬 INSERT 失敗，驗證 TRUNCATE 已執行且節點拋出錯誤
- **fullMode=true 資料品質閘門**：驗證 ghost records 閘門（LENGTH >= 5）在 fullMode INSERT SQL 中仍然生效

### 整合測試範疇
- **UPSERT 寫入驗證（INSERT）**：需要真實 DB（Test Container）
- **UPSERT 寫入驗證（UPDATE）**：需要真實 DB
- **customer_id 在 UPDATE 時不變**：需要真實 DB
- **批次分批寫入正確性**：需要真實 DB（含 batch size 邊界）
- **部分批次失敗**：需要真實 DB（模擬批次失敗）
- **NOT NULL 約束違反**：需要真實 DB
- **fullMode=true 舊資料清空驗證**：需要真實 DB（Test Container），驗證 TRUNCATE 後 ghost records 確實消失、新資料正確寫入

### 測試資料隔離
- 整合測試每次使用不同的 `source_customer_no` 前綴或清空 `customer_core` 表
- 使用 Test Container 確保測試間隔離
- ETL 追蹤欄位 `_etl_loaded_at` 比對時使用時間範圍（執行前 -1s 到執行後 +1s）

---

## Mock 資料設計

### 基本測試 DataSet（UPSERT 驗證）
```typescript
// 新資料（customer_core 中不存在的 source_customer_no）
const insertRows = [
  {
    customer_id: 'uuid-new-001',
    source_customer_no: 'F044-TEST-001',
    name: '王大明',
    customer_type: 'individual_local',
    data_source: 'ZZIP_BAMCUST_M',
    // ... 其他 customer_core 欄位以 null 填入
  },
  {
    customer_id: 'uuid-new-002',
    source_customer_no: 'F044-TEST-002',
    name: '李小華',
    customer_type: 'individual_local',
    data_source: 'MLMCUSTOMER',
  },
];

// 既有資料（customer_core 中已存在，名稱不同）
const updateSeed = {
  customer_id: 'uuid-existing-001',  // 舊 UUID，UPSERT 後應保留
  source_customer_no: 'F044-UPDATE-001',
  name: '舊名稱',
  customer_type: 'individual_local',
  data_source: 'OLD_SOURCE',
  _etl_loaded_at: new Date('2024-01-01'),
  _etl_pipeline_id: 'old-pipeline-id',
};

// UPSERT 時的輸入（同 source_customer_no，但 name 不同）
const updateInputRow = {
  customer_id: 'uuid-new-gen',    // gen_random_uuid 產生的新 UUID，但 UPDATE 時不應寫入
  source_customer_no: 'F044-UPDATE-001',
  name: '新名稱',
  customer_type: 'individual_local',
  data_source: 'ZZIP_BAMCUST_M+MLMCUSTOMER',
};
```

### 批次測試 DataSet
```typescript
// 生成 10,000 列測試資料（驗證 batch 分批）
function generateBatchRows(count: number, prefix: string) {
  return Array.from({ length: count }, (_, i) => ({
    customer_id: `uuid-batch-${prefix}-${i}`,
    source_customer_no: `${prefix}-${String(i).padStart(6, '0')}`,
    name: `測試客戶 ${i}`,
    customer_type: 'individual_local',
    data_source: 'TEST',
  }));
}
```

### 空 DataSet
```typescript
const emptyDataSet = { rows: [], rowCount: 0 };
```

---

## 測試場景 — 測試執行模式

### TS-F044-001: is_test_run=true 時跳過 UPSERT，回傳預計筆數

- **Related Requirement**: F044 Section 6.1 / F042 AC-8 / US-057 TC-057-08 / US-055 TC-055-04
- **Test Type**: 正向
- **測試層次**: 單元測試（Mock queryRunner）
- **Preconditions**:
  - Mock 目標表存在性檢查回傳存在
  - 輸入 DataSet 有 100 列
  - `context.isTestRun = true`
- **Steps**:
  1. 執行 TargetLoadExecutor.execute(context)
  2. 記錄 Mock queryRunner.query 的呼叫次數（UPSERT 相關）
- **Expected Result**:
  - 未呼叫任何 INSERT / UPSERT SQL
  - 回傳 `{ rows: [], rowCount: 100 }`（rowCount = 輸入筆數）
  - 節點不拋出錯誤

---

### TS-F044-002: is_test_run=true 時目標表資料不變（整合驗證）

- **Related Requirement**: F044 AC-5 / US-057 TC-057-08
- **Test Type**: 正向
- **測試層次**: 整合測試（Test Container）
- **Preconditions**:
  - customer_core 初始有 5 筆資料
  - 輸入 DataSet 有 3 列新資料
  - isTestRun = true
- **Steps**:
  1. 記錄 customer_core 初始筆數
  2. 執行 TargetLoadExecutor
  3. 查詢 customer_core 現有筆數
- **Expected Result**:
  - customer_core 筆數不變（仍為 5）
  - 節點 status = `'completed'`，outputRowCount = 3

---

## 測試場景 — 目標表存在性驗證

### TS-F044-003: 目標表不存在時節點 failed

- **Related Requirement**: F044 AC-6 / F044 Section 6.2 / US-057 AC-4 / US-057 TC-057-09
- **Test Type**: 負向
- **測試層次**: 單元測試（Mock queryRunner）
- **Preconditions**:
  - Mock queryRunner 的 `information_schema.tables` 查詢回傳空陣列（表不存在）
  - targetTable = 'non_existent_table'
- **Steps**:
  1. 呼叫 TargetLoadExecutor.execute(context)
- **Expected Result**:
  - 拋出例外，message 包含 `目標表 non_existent_table 不存在，請確認 migration 已執行`

---

## 測試場景 — UPSERT 寫入（整合測試）

### TS-F044-004: UPSERT INSERT — 新資料正確寫入

- **Related Requirement**: F044 AC-1 / F044 Section 5 / US-057 AC-3 / US-057 TC-057-05
- **Test Type**: 正向
- **測試層次**: 整合測試（Test Container）
- **Preconditions**:
  - customer_core 中無 source_customer_no = 'F044-TEST-001'
  - 輸入 DataSet：insertRows[0]（name = '王大明'）
- **Steps**:
  1. 執行 TargetLoadExecutor，isTestRun = false
  2. 查詢 customer_core WHERE source_customer_no = 'F044-TEST-001'
- **Expected Result**:
  - customer_core 新增一列
  - `source_customer_no = 'F044-TEST-001'`
  - `name = '王大明'`
  - `_etl_loaded_at` 有值，在執行前後 1 秒範圍內
  - `_etl_pipeline_id = context.pipelineId`

---

### TS-F044-005: UPSERT UPDATE — 既有資料正確更新

- **Related Requirement**: F044 AC-2 / US-057 TC-057-06
- **Test Type**: 正向
- **測試層次**: 整合測試（Test Container）
- **Preconditions**:
  - customer_core 已有 source_customer_no = 'F044-UPDATE-001'，name = '舊名稱'
  - 輸入列：name = '新名稱'（同 source_customer_no）
- **Steps**:
  1. 執行 TargetLoadExecutor
  2. 查詢 customer_core WHERE source_customer_no = 'F044-UPDATE-001'
- **Expected Result**:
  - `name = '新名稱'`（已更新）
  - 整體 customer_core 筆數不增加（非新增）

---

### TS-F044-006: customer_id 在 UPSERT UPDATE 時不被覆蓋

- **Related Requirement**: F044 AC-4 / F044 Section 5 關鍵 SQL 規則 / US-057 TC-057-06
- **Test Type**: 正向
- **測試層次**: 整合測試（Test Container）
- **Preconditions**:
  - customer_core 已有 source_customer_no = 'F044-UPDATE-001'，customer_id = 'uuid-existing-001'
  - 輸入列含 customer_id = 'uuid-new-gen'（不同 UUID）
- **Steps**:
  1. 執行 TargetLoadExecutor（UPSERT）
  2. 查詢 customer_core 的 customer_id
- **Expected Result**:
  - `customer_id` 仍為 `'uuid-existing-001'`（原值）
  - `'uuid-new-gen'` 未寫入

---

### TS-F044-007: ETL 追蹤欄位自動填充

- **Related Requirement**: F044 AC-3 / F044 Section 8 / US-057 TC-057-07
- **Test Type**: 正向
- **測試層次**: 整合測試（Test Container）
- **Preconditions**:
  - pipelineId = 'test-pipeline-uuid-123'
  - 執行時間記錄為 `beforeExec`
- **Steps**:
  1. 執行 TargetLoadExecutor，pipelineId = 'test-pipeline-uuid-123'
  2. 查詢 customer_core 的 _etl_loaded_at 與 _etl_pipeline_id
- **Expected Result**:
  - `_etl_pipeline_id = 'test-pipeline-uuid-123'`
  - `_etl_loaded_at >= beforeExec` 且 `_etl_loaded_at <= beforeExec + 5s`

---

### TS-F044-008: 批次 UPSERT — 10,000 列分批正確寫入

- **Related Requirement**: F044 AC-7 / F044 Section 9
- **Test Type**: 正向
- **測試層次**: 整合測試（Test Container）
- **Preconditions**: 10,000 列不重複的測試資料
- **Steps**:
  1. 執行 TargetLoadExecutor，batch size = 771（欄位數 85，計算公式：floor(65535/85)）
  2. 完成後查詢 customer_core 筆數
- **Expected Result**:
  - customer_core 新增 10,000 列
  - 節點 outputRowCount = 10,000
  - 批次數 = ceil(10000 / 771) = 13 批（12 批 771 + 1 批 748）

---

### TS-F044-009: 批次邊界 — 恰好等於 batch size 的輸入

- **Related Requirement**: F044 Section 9 批次大小計算
- **Test Type**: 邊界
- **測試層次**: 整合測試（Test Container）
- **Preconditions**: 輸入 DataSet 恰好 771 列（= 1 批）
- **Steps**:
  1. 執行 TargetLoadExecutor
- **Expected Result**:
  - 僅執行 1 批 UPSERT
  - customer_core 正確寫入 771 列

---

### TS-F044-010: 批次邊界 — 超過一批（1,457 列）

- **Related Requirement**: F044 Section 9
- **Test Type**: 邊界
- **測試層次**: 整合測試（Test Container）
- **Preconditions**: 輸入 DataSet 772 列
- **Steps**:
  1. 執行 TargetLoadExecutor
- **Expected Result**:
  - 執行 2 批（第一批 771，第二批 1）
  - customer_core 正確寫入 772 列

---

### TS-F044-011: 輸入 DataSet 為空時不執行 UPSERT

- **Related Requirement**: F044 AC-8 / F044 Section 7 邊界情況
- **Test Type**: 邊界
- **測試層次**: 整合測試（Test Container）
- **Preconditions**: 輸入 `{ rows: [], rowCount: 0 }`
- **Steps**:
  1. 記錄 customer_core 初始筆數
  2. 執行 TargetLoadExecutor
  3. 查詢 customer_core 筆數
- **Expected Result**:
  - 未執行任何 UPSERT SQL
  - customer_core 筆數不變
  - 節點 status = `'completed'`，outputRowCount = 0

---

### TS-F044-012: 輸入列缺少 nullable 欄位時以 null 寫入

- **Related Requirement**: F044 Section 7 邊界情況（nullable 欄位）
- **Test Type**: 邊界
- **測試層次**: 整合測試（Test Container）
- **Preconditions**: 輸入列只有 source_customer_no, name, customer_type, data_source 四個欄位（其他 nullable 欄位缺失）
- **Steps**:
  1. 執行 TargetLoadExecutor
  2. 查詢 customer_core
- **Expected Result**:
  - 資料正常寫入，缺失的 nullable 欄位值為 null
  - 不拋出錯誤

---

### TS-F044-013: 輸入列缺少 source_customer_no 時 UPSERT 失敗

- **Related Requirement**: F044 Section 7 邊界情況（NOT NULL 約束）
- **Test Type**: 負向
- **測試層次**: 整合測試（Test Container）
- **Preconditions**: 輸入列無 source_customer_no 欄位（或值為 null）
- **Steps**:
  1. 執行 TargetLoadExecutor
- **Expected Result**:
  - 節點拋出例外（NOT NULL 約束違反）
  - 節點標記為 `'failed'`

> **注意（BUG-2 修正後）**：`source_customer_no = null` 仍由 DB NOT NULL constraint 拒絕（此場景仍適用）。BUG-2 新增的 ghost record 閘門僅過濾長度 < 5 的非 null 識別碼（如 `"01"`、`"."`），兩者邏輯不衝突。閘門在 UPSERT SQL 執行前過濾，null 識別碼不進入閘門判斷，直接由 DB constraint 處理。

---

### TS-F044-014: 部分批次失敗 — 已寫入批次不回滾

- **Related Requirement**: F044 AC-9 / F044 Section 6.3
- **Test Type**: 負向
- **測試層次**: 整合測試（Test Container）
- **Preconditions**:
  - 輸入 2,000 列（3 批：771 + 771 + 458）
  - Mock 第 3 批 UPSERT 拋出錯誤（模擬 DB 連線中斷）
- **Steps**:
  1. 執行 TargetLoadExecutor
  2. 查詢 customer_core 筆數
- **Expected Result**:
  - customer_core 已有前 2 批寫入（771 × 2 = 1,542 列）（不回滾）
  - 節點 status = `'failed'`
  - `outputRowCount = 1542`（已成功寫入的筆數）
  - errorMessage 包含失敗批次的起始 offset 與錯誤訊息

---

## 測試場景 — 批次大小計算

### TS-F044-015: 批次大小計算公式驗證

- **Related Requirement**: F044 Section 9 批次大小計算
- **Test Type**: 正向
- **測試層次**: 單元測試（純函數）
- **Steps**:
  1. 呼叫批次大小計算函式，columnsPerRow = 85，configuredBatchSize = 5000
- **Expected Result**:
  - `maxBatchSize = floor(65535 / 85) = 771`
  - `actualBatchSize = min(5000, 771) = 771`

---

### TS-F044-016: 欄位數少時以 configuredBatchSize 為準

- **Related Requirement**: F044 Section 9
- **Test Type**: 邊界
- **測試層次**: 單元測試（純函數）
- **Steps**:
  1. 呼叫批次大小計算函式，columnsPerRow = 10，configuredBatchSize = 500
- **Expected Result**:
  - `maxBatchSize = floor(65535 / 10) = 6553`
  - `actualBatchSize = min(500, 6553) = 500`（configuredBatchSize 較小）

---

## 測試場景 — 並行安全

### TS-F044-017: 並行 UPSERT 同一 source_customer_no 的原子性（說明性）

- **Related Requirement**: F044 Section 7 邊界情況（並行 Pipeline）
- **Test Type**: 說明性（設計說明，非可執行場景）
- **備註**:
  - PostgreSQL 的 `ON CONFLICT` 機制在資料庫層保證原子性
  - 後寫入者覆蓋先寫入者（UPSERT 語意）
  - 此場景由 PostgreSQL 引擎保證，不需額外測試
  - 架構決策：每批次獨立 commit，接受「最終一致」語意

---

## 測試場景 — BUG-2 修正驗證

### TS-F044-018: [BUG-2 修正驗證] MLMC-only 記錄 `name=null` 正常寫入，不被隱性過濾排除

- **Related Requirement**: F044 AC-10（BUG-2）/ F044 Section 6 步驟 6 / US-057 AC-3a / US-057 TC-057-12
- **Test Type**: 正向（BUG-2 修正驗證）
- **測試層次**: 整合測試（Test Container）
- **Preconditions**:
  - customer_core 中無 `source_customer_no = "MLMC-999"` 的記錄
  - 輸入 DataSet 含一列：
    ```
    source_customer_no = "MLMC-999"
    name = null
    customer_type_code = "02"
    customer_id = "uuid-mlmc-test-001"
    data_source = "MLMCUSTOMER"
    ```
  - isTestRun = false
- **Steps**:
  1. 執行 TargetLoadExecutor
  2. 查詢 customer_core WHERE source_customer_no = "MLMC-999"
  3. 確認 node_logs 的 outputRowCount
- **Expected Result**:
  - customer_core 新增一列，`source_customer_no = "MLMC-999"` 存在
  - 該列 `name = null`（不被排除，資料庫允許 nullable）
  - `customer_type_code = "02"`（正確寫入）
  - `node_logs[tl1].outputRowCount = 1`（此列計入成功 UPSERT 筆數，不遺失）

> **根因（BUG-2）**：修正前 `target-load-handler.ts:77-85` 依 `is_nullable='NO'` 欄位清單過濾輸入列，`name=null` 被隱性排除。修正後移除此動態過濾，改為顯式 `source_customer_no` 長度閘門，`name=null` 的記錄正常寫入由 DB constraint 決定是否拒絕。

---

### TS-F044-019: [BUG-2 修正驗證] ghost record 閘門 — `source_customer_no` 長度 < 5 被跳過，長度 >= 5 通過

- **Related Requirement**: F044 AC-11（BUG-2）/ F044 Section 6 步驟 6 / F044 Section 7 / US-057 AC-3a / US-057 TC-057-13
- **Test Type**: 邊界（BUG-2 修正驗證）
- **測試層次**: 整合測試（Test Container）
- **Preconditions**:
  - customer_core 中無以下任何 source_customer_no 的記錄
  - 輸入 DataSet 含 **4 列**：
    | source_customer_no | 長度 | 預期行為 |
    |--------------------|------|---------|
    | `"01"` | 2 | 跳過（< 5） |
    | `"."` | 1 | 跳過（< 5） |
    | `"ABCDE"` | 5 | 寫入（= 5，邊界通過） |
    | `"VALID001"` | 8 | 寫入（> 5） |
  - 每列均含必要欄位（name、customer_type_code、data_source）
  - isTestRun = false
- **Steps**:
  1. 執行 TargetLoadExecutor
  2. 查詢 customer_core 中哪些 source_customer_no 存在
  3. 確認 node_logs 的 outputRowCount 與跳過筆數記錄
- **Expected Result**:
  - customer_core 中 `source_customer_no = "ABCDE"` 存在（長度 5，恰好通過閘門）
  - customer_core 中 `source_customer_no = "VALID001"` 存在（長度 8，通過閘門）
  - customer_core 中 `source_customer_no = "01"` **不存在**（長度 2，被跳過）
  - customer_core 中 `source_customer_no = "."` **不存在**（長度 1，被跳過）
  - `node_logs[tl1].outputRowCount = 2`（僅計算成功寫入的 2 列）
  - 節點日誌中記錄跳過筆數 = 2（`"01"` 與 `"."` 各 1 筆）
  - 節點 status = `'completed'`（跳過不視為錯誤）

---

### TS-F044-020: [BUG-2 修正驗證] VARCHAR 空字串與純空白正規化為 null（NULLIF(TRIM) 效果）

- **Related Requirement**: F044 AC-12（BUG-2）/ F044 Section 6 步驟 7 / F044 Section 7
- **Test Type**: 正向（BUG-2 修正驗證）
- **測試層次**: 整合測試（Test Container）
- **Preconditions**:
  - customer_core 中無 `source_customer_no = "TEST001"` 的記錄
  - 輸入 DataSet 含 **3 列**（驗證不同空字串情境）：
    | source_customer_no | name | email | 說明 |
    |--------------------|------|-------|------|
    | `"TEST001"` | `"  "`（純空白，2 個空格） | `""`（空字串） | 主要驗證列 |
    | `"TEST002"` | `""\t\n"`（含 tab/換行的空白） | `"  "`（多個空格） | 多類型空白 |
    | `"TEST003"` | `"正常姓名"` | `"test@example.com"` | 對照列（不應被正規化） |
  - isTestRun = false
- **Steps**:
  1. 執行 TargetLoadExecutor
  2. 查詢 customer_core，取得三列的 name 與 email 欄位值
- **Expected Result**:
  - `TEST001` 列：
    - `name = null`（純空白字串 `"  "` 經 `NULLIF(TRIM(col), '')` → null）
    - `email = null`（空字串 `""` 經 `NULLIF(TRIM(col), '')` → null）
  - `TEST002` 列：
    - `name = null`（含 tab/換行的空白視為純空白 → null）
    - `email = null`（多個空格 → null）
  - `TEST003` 列：
    - `name = "正常姓名"`（非空白，不被正規化）
    - `email = "test@example.com"`（非空白，不被正規化）

> **根因（BUG-2）**：源自 MLMC 來源資料中某些欄位以空字串而非 NULL 表示無值，導致 `name = ""` 與 `name = null` 語意不一致，影響下游查詢與合併邏輯。修正後統一以 `NULLIF(TRIM(col), '')` 正規化，空字串與純空白均轉為 null。

---

## 測試場景 — fullMode 全量重寫

### TS-F044-021: fullMode=true 正常路徑 — TRUNCATE 後 INSERT，無 ON CONFLICT

- **Related Requirement**: F044 AC-13 / F044 Section 5b / US-057 AC-3b / US-057 TC-057-14
- **Test Type**: 正向
- **測試層次**: 單元測試（Mock queryRunner）
- **Preconditions**:
  - Mock queryRunner：目標表存在
  - 節點設定 `fullMode: true`
  - `isTestRun = false`
  - 輸入 DataSet：2 列（`source_customer_no = "NEWCUST01"` 與 `"NEWCUST02"`）
- **Steps**:
  1. 執行 TargetLoadHandler.execute(context)，context.node.data 含 `fullMode: true`
  2. 記錄 Mock queryRunner 所有 SQL 呼叫
- **Expected Result**:
  - 有 TRUNCATE SQL 呼叫：`qr.calls` 中存在 `sql.includes('TRUNCATE')`，且 SQL 含 `"customer_core"`
  - 有 INSERT SQL 呼叫：`qr.calls` 中存在 `sql.includes('INSERT INTO "customer_core"')`
  - INSERT SQL **不含** `ON CONFLICT` 子句（`insertCall.sql` 不含 `'ON CONFLICT'`）
  - INSERT SQL 含 ETL 追蹤欄位（`_etl_loaded_at`、`_etl_pipeline_id`）
  - TRUNCATE SQL 呼叫的順序在 INSERT SQL 之前（依 `qr.calls` 陣列 index 驗證）
  - 回傳 `rowCount = 2`

---

### TS-F044-022: fullMode=true + is_test_run=true — 不執行 TRUNCATE（安全防護）

- **Related Requirement**: F044 AC-14 / F044 Section 6.1 / US-057 AC-3b / US-057 TC-057-15
- **Test Type**: 正向（安全防護驗證）
- **測試層次**: 單元測試（Mock queryRunner）
- **Preconditions**:
  - Mock queryRunner：目標表存在
  - 節點設定 `fullMode: true`
  - `isTestRun = true`
  - 輸入 DataSet：3 列
- **Steps**:
  1. 執行 TargetLoadHandler.execute(context)，context 含 `isTestRun: true`、`fullMode: true`
  2. 記錄 Mock queryRunner 所有 SQL 呼叫
- **Expected Result**:
  - 無 TRUNCATE SQL 呼叫：`qr.calls` 中不存在任何 `sql.includes('TRUNCATE')` 的呼叫
  - 無 INSERT SQL 呼叫：`qr.calls` 中不存在 `sql.includes('INSERT INTO')`
  - 回傳 `rowCount = 3`（等於輸入筆數，預計寫入數）
  - 節點不拋出錯誤

---

### TS-F044-023: fullMode=false（或未設定）— 維持 UPSERT 行為，向後相容

- **Related Requirement**: F044 AC-15 / US-057 AC-3b / US-057 TC-057-16
- **Test Type**: 正向（回歸驗證）
- **測試層次**: 單元測試（Mock queryRunner）
- **Preconditions**:
  - Mock queryRunner：目標表存在
  - 節點設定 `fullMode: false`（或節點設定中完全省略 `fullMode` 欄位）
  - `isTestRun = false`
  - 輸入 DataSet：1 列（`source_customer_no = "A001"`，`name = "新名稱"`）
- **Steps**:
  1. 執行 TargetLoadHandler.execute(context)，context.node.data 含 `fullMode: false`（或不含 `fullMode`）
  2. 記錄 Mock queryRunner 所有 SQL 呼叫
- **Expected Result**:
  - 無 TRUNCATE SQL 呼叫：`qr.calls` 中不存在任何 `sql.includes('TRUNCATE')` 的呼叫
  - 有 INSERT SQL 呼叫：`qr.calls` 中存在 `sql.includes('INSERT INTO "customer_core"')`
  - INSERT SQL **含** `ON CONFLICT` 子句（`insertCall.sql.includes('ON CONFLICT ("source_customer_no")')`）
  - INSERT SQL **含** `DO UPDATE SET` 子句
  - 回傳 `rowCount = 1`

> **備註（回歸防護）**：此場景確保引入 fullMode 後，原有 UPSERT 路徑行為不受影響。`fullMode` 未設定時應以 `false` 處理（預設值）。

---

### TS-F044-024: fullMode=true INSERT 部分失敗 — TRUNCATE 已執行，節點標記為 failed

- **Related Requirement**: F044 Section 6.6 / F044 Table 7（fullMode INSERT 部分失敗）
- **Test Type**: 負向
- **測試層次**: 單元測試（Mock queryRunner，customHandler 模擬 INSERT 失敗）
- **Preconditions**:
  - Mock queryRunner：`customHandler` 設定為：
    - TRUNCATE SQL → 正常回傳（允許執行）
    - INSERT SQL → 拋出 `Error('DB connection lost during INSERT')`
  - 節點設定 `fullMode: true`
  - `isTestRun = false`
  - 輸入 DataSet：5 列
- **Steps**:
  1. 執行 TargetLoadHandler.execute(context)，預期拋出例外
  2. 記錄 Mock queryRunner 所有 SQL 呼叫
- **Expected Result**:
  - TRUNCATE SQL **已執行**（`qr.calls` 中存在 TRUNCATE 呼叫，即 TRUNCATE 在 INSERT 失敗前完成）
  - 節點拋出例外，錯誤訊息包含 `fullMode` 相關識別字（如 `'fullMode'` 或 `'INSERT 批次失敗'`）
  - 不拋出 TRUNCATE 相關錯誤（TRUNCATE 本身成功）

> **說明（transaction 語意）**：依 F044 Section 6.6，TRUNCATE 已執行時 INSERT 中途失敗，已寫入批次不回滾（接受部分寫入），節點標記 `'failed'`。此場景在 Mock 層次驗證 TRUNCATE → INSERT 的呼叫序列與失敗傳播行為。實際資料殘留效果需 Test Container 層次驗證。

---

### TS-F044-025: fullMode=true 資料品質閘門仍然生效 — ghost records 在 INSERT 前被過濾

- **Related Requirement**: F044 AC-13（「資料品質閘門在 fullMode 下同樣生效」）/ F044 Section 5b / US-057 AC-3b
- **Test Type**: 正向（閘門行為驗證）
- **測試層次**: 單元測試（Mock queryRunner）
- **Preconditions**:
  - Mock queryRunner：目標表存在
  - 節點設定 `fullMode: true`
  - `isTestRun = false`
  - 輸入 DataSet：任意筆數（>0）
- **Steps**:
  1. 執行 TargetLoadHandler.execute(context)，context.node.data 含 `fullMode: true`
  2. 取得 INSERT SQL 呼叫內容
- **Expected Result**:
  - INSERT SQL 含 ghost records 閘門條件：`insertCall.sql.includes('LENGTH(TRIM("source_customer_no")) >= 5')`
  - 閘門條件位於 INSERT 的 SELECT 子句（FROM 暫存表的 WHERE 條件或 CASE WHEN 過濾）
  - 此閘門行為與 UPSERT 模式（TS-F044-019）一致，確保 fullMode 不繞過資料品質保護

> **說明**：fullMode 使用 `INSERT INTO ... SELECT ... FROM dedupTable WHERE LENGTH(TRIM("source_customer_no")) >= 5`，ghost records 在 TRUNCATE 後的 INSERT 來源查詢中被排除，不會因 TRUNCATE 而遺失防護效果。
