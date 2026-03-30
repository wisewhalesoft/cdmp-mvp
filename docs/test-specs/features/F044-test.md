---
type: test-design-feature
feature_id: F044
feature_name: ETL Target Load + UPSERT
priority: P0-MVP
related_spec: /docs/specs/features/F044-etl-target-load.md
related_story: US-057（target_load 部分）
last_updated: 2026-03-27
---

# F044: ETL Target Load + UPSERT — 測試設計

## 測試策略

### 單元測試範疇
- **測試執行模式（is_test_run = true）**：不需真實 DB，驗證回傳筆數邏輯
- **目標表存在性驗證**：Mock queryRunner 驗證判斷邏輯
- **批次大小計算**：純數學計算，無 DB 依賴
- **ETL 追蹤欄位填充**：驗證 `_etl_loaded_at` 與 `_etl_pipeline_id` 是否正確附加

### 整合測試範疇
- **UPSERT 寫入驗證（INSERT）**：需要真實 DB（Test Container）
- **UPSERT 寫入驗證（UPDATE）**：需要真實 DB
- **customer_id 在 UPDATE 時不變**：需要真實 DB
- **批次分批寫入正確性**：需要真實 DB（含 batch size 邊界）
- **部分批次失敗**：需要真實 DB（模擬批次失敗）
- **NOT NULL 約束違反**：需要真實 DB

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
  1. 執行 TargetLoadExecutor，batch size = 1456（欄位數約 45，計算公式：floor(65535/45)）
  2. 完成後查詢 customer_core 筆數
- **Expected Result**:
  - customer_core 新增 10,000 列
  - 節點 outputRowCount = 10,000
  - 批次數 = ceil(10000 / 1456) = 7 批（6 批 1456 + 1 批 1264）

---

### TS-F044-009: 批次邊界 — 恰好等於 batch size 的輸入

- **Related Requirement**: F044 Section 9 批次大小計算
- **Test Type**: 邊界
- **測試層次**: 整合測試（Test Container）
- **Preconditions**: 輸入 DataSet 恰好 1456 列（= 1 批）
- **Steps**:
  1. 執行 TargetLoadExecutor
- **Expected Result**:
  - 僅執行 1 批 UPSERT
  - customer_core 正確寫入 1456 列

---

### TS-F044-010: 批次邊界 — 超過一批（1,457 列）

- **Related Requirement**: F044 Section 9
- **Test Type**: 邊界
- **測試層次**: 整合測試（Test Container）
- **Preconditions**: 輸入 DataSet 1,457 列
- **Steps**:
  1. 執行 TargetLoadExecutor
- **Expected Result**:
  - 執行 2 批（第一批 1456，第二批 1）
  - customer_core 正確寫入 1,457 列

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

---

### TS-F044-014: 部分批次失敗 — 已寫入批次不回滾

- **Related Requirement**: F044 AC-9 / F044 Section 6.3
- **Test Type**: 負向
- **測試層次**: 整合測試（Test Container）
- **Preconditions**:
  - 輸入 4,000 列（3 批：1456 + 1456 + 1088）
  - Mock 第 3 批 UPSERT 拋出錯誤（模擬 DB 連線中斷）
- **Steps**:
  1. 執行 TargetLoadExecutor
  2. 查詢 customer_core 筆數
- **Expected Result**:
  - customer_core 已有前 2 批寫入（1456 × 2 = 2,912 列）（不回滾）
  - 節點 status = `'failed'`
  - `outputRowCount = 2912`（已成功寫入的筆數）
  - errorMessage 包含失敗批次的起始 offset 與錯誤訊息

---

## 測試場景 — 批次大小計算

### TS-F044-015: 批次大小計算公式驗證

- **Related Requirement**: F044 Section 9 批次大小計算
- **Test Type**: 正向
- **測試層次**: 單元測試（純函數）
- **Steps**:
  1. 呼叫批次大小計算函式，columnsPerRow = 45，configuredBatchSize = 5000
- **Expected Result**:
  - `maxBatchSize = floor(65535 / 45) = 1456`
  - `actualBatchSize = min(5000, 1456) = 1456`

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
