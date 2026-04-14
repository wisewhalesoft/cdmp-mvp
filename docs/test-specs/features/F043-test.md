---
type: test-design-feature
feature_id: F043
feature_name: ETL 節點執行器
priority: P0-MVP
related_spec: /docs/specs/features/F043-etl-node-executors.md
related_story: US-056, US-057（FieldMapping / Conditional）, US-058（Lookup 雙輸入）
last_updated: 2026-04-14
---

# F043: ETL 節點執行器 — 測試設計

## 測試策略

### 單元測試範疇（全部 7 種節點執行器）

各節點執行器為純記憶體轉換函式（除 `raw_data_extract` 需 DB 外），以**純函數**方式測試：
- 輸入：`NodeExecutionContext`（含 Mock DataSet）
- 輸出：驗證回傳的 DataSet

### 整合測試範疇
- **RawDataExtractExecutor**：需要 Mock queryRunner 或 Test Container（驗證真實 SQL 查詢）
- 其餘 6 種節點執行器：可全部以單元測試覆蓋

### 環境依賴
- `raw_data_extract` 的表存在性驗證需要 Mock `queryRunner.query()`
- 所有其他節點執行器無 DB 依賴（In-Memory 轉換）

### 與既有測試的關係
- `mergePhone`、`toDecimal` 已在 `etl-transforms.spec.ts`（TS-F036 系列）覆蓋
- F043 測試聚焦在**執行器層面**（DataSet in / DataSet out），不重複覆蓋純函數層

### LookupExecutor 測試策略（US-058 新增）

LookupExecutor 支援兩種執行模式，測試需分別覆蓋：

| 模式 | 觸發條件 | 對照資料來源 | DB 依賴 |
|------|---------|-------------|---------|
| 雙輸入模式 | `inputs['lookup-input']` 存在 | 直接使用上游 DataSet | 無（純記憶體） |
| 向下相容模式 | `inputs['lookup-input']` 不存在 | Mock queryRunner 查詢 `lookupSource` + `lookupFilter` | 需 Mock queryRunner |

雙輸入模式為純記憶體 LEFT JOIN 操作，可全部以**單元測試**覆蓋。向下相容模式需 Mock `queryRunner.query()` 回傳對照資料列。

---

## Mock 資料設計

### RawDataExtract 測試資料
```typescript
// Mock queryRunner：3 筆資料
const mockRows = [
  { id: 1, CUSTO_NO: 'C001', CUS_NAME: '王大明', UPDATE_DATE: '2024-03-01' },
  { id: 2, CUSTO_NO: 'C002', CUS_NAME: '李小華', UPDATE_DATE: '2024-02-01' },
  { id: 3, CUSTO_NO: 'C003', CUS_NAME: '張三豐', UPDATE_DATE: '2024-01-01' },
];
```

### Merge 測試資料
```typescript
// Left DataSet（3 列，key A001, A002, A003）
const leftRows = [
  { CUSTO_NO: 'A001', NAME: '王大明', AREA: '台北' },
  { CUSTO_NO: 'A002', NAME: '李小華', AREA: '台中' },
  { CUSTO_NO: 'A003', NAME: '張三豐', AREA: '高雄' },
];
// Right DataSet（2 列，key A002, A004）
const rightRows = [
  { CUSTO_NO: 'A002', NAME: '李小花', EXTRA: '備註1' },
  { CUSTO_NO: 'A004', NAME: '陳大為', EXTRA: '備註2' },
];
```

### Dedup 測試資料
```typescript
// 同一個 CUSTO_NO 出現 3 次，時間戳不同
const dedupRows = [
  { CUSTO_NO: 'A001', UPDATE_DATE: '2024-01-01', DATA: '舊資料' },
  { CUSTO_NO: 'A001', UPDATE_DATE: '2024-03-01', DATA: '最新資料' },
  { CUSTO_NO: 'A001', UPDATE_DATE: '2024-02-01', DATA: '中間資料' },
  { CUSTO_NO: 'A002', UPDATE_DATE: null, DATA: 'null時間戳' },
  { CUSTO_NO: 'A002', UPDATE_DATE: '2024-01-01', DATA: '有時間戳' },
];
```

### TypeCast 測試資料
```typescript
const typeCastRows = [
  { CUSTNOWCAPTIAL: '5000000', BIRTH_DATE: '1990-01-15', COUNT: '42' },
  { CUSTNOWCAPTIAL: 'N/A', BIRTH_DATE: 'not-a-date', COUNT: '0' },
  { CUSTNOWCAPTIAL: null, BIRTH_DATE: null, COUNT: null },
  { CUSTNOWCAPTIAL: '-100.5', BIRTH_DATE: '2000-12-31', COUNT: '999' },
];
```

### DerivedField 測試資料（mergePhone）
```typescript
// 2 參數版本
const phoneRows = [
  { CAREA_NO1: '02', CTEL_NO1: '27123456' },    // 正常
  { CAREA_NO1: '00', CTEL_NO1: '0000000000' },  // 全零佔位值
  { CAREA_NO1: null, CTEL_NO1: '27123456' },     // null 區碼
  { CAREA_NO1: '', CTEL_NO1: '27123456' },       // 空字串區碼
  { CAREA_NO1: '00', CTEL_NO1: '27123456' },     // 區碼全零
];

// 3 參數版本（含分機號碼）
const phoneRowsWithExt = [
  { CAREA_NO1: '02', CTEL_NO1: '27123456', EXTEN_NO1: '1234' },   // 有分機
  { CAREA_NO1: '02', CTEL_NO1: '27123456', EXTEN_NO1: null },     // 分機為 null
  { CAREA_NO1: '02', CTEL_NO1: '27123456', EXTEN_NO1: '' },       // 分機為空字串
  { CAREA_NO1: '02', CTEL_NO1: '27123456', EXTEN_NO1: '000' },    // 分機全零
];

// df2 MLMC 2 參數版本（registered_phone / registered_fax / business_fax）
const df2PhoneRows = [
  // registered_phone：CUSTTELCODE + CUSTTEL
  { CUSTTELCODE: '02', CUSTTEL: '87654321' },         // 正常
  { CUSTTELCODE: '00', CUSTTEL: '0000000000' },        // 全零佔位值 → NULL
  { CUSTTELCODE: null, CUSTTEL: '87654321' },          // null 區碼 → NULL
  // registered_fax：CUSTFAXCODE + CUSTFAX
  { CUSTFAXCODE: '02', CUSTFAX: '87651234' },          // 正常
  { CUSTFAXCODE: '00', CUSTFAX: '0000000000' },        // 全零佔位值 → NULL
  // business_fax：BUSINESSFAXCODE + BUSINESSFAX
  { BUSINESSFAXCODE: '07', BUSINESSFAX: '12345678' },  // 正常
  { BUSINESSFAXCODE: '00', BUSINESSFAX: '0000000000' },// 全零佔位值 → NULL
];
```

### FieldMapping 測試資料
```typescript
const mappingConfig = {
  dropUnmapped: true,
  mappings: [
    { sourceColumn: 'CUSTO_NO', targetColumn: 'source_customer_no', defaultValue: null },
    { sourceColumn: 'CUS_NAME', targetColumn: 'name', defaultValue: null },
    { sourceColumn: 'NON_EXIST', targetColumn: 'optional_field', defaultValue: 'default_val' },
    { sourceColumn: 'MISSING_NO_DEFAULT', targetColumn: 'will_be_null', defaultValue: null },
  ],
};
const mappingRow = { CUSTO_NO: 'A001', CUS_NAME: '王大明', EXTRA_FIELD: '多餘欄位' };
```

### Conditional 測試資料（模擬 cd1）
```typescript
// m4 FULL JOIN 後的資料（ZZIP 路線欄位無後綴，MLMC 路線欄位加 _right）
const conditionalRows = [
  {
    source_customer_no: 'Z001', source_updated_at: '2024-03-01',
    name: '王大明（ZZIP）',
    source_customer_no_right: 'Z001', source_updated_at_right: '2024-01-01',
    name_right: 'WANG DAMING（MLMC）',
  },
  {
    source_customer_no: 'Z002', source_updated_at: '2024-01-01',
    name: '李小華（ZZIP）',
    source_customer_no_right: 'Z002', source_updated_at_right: '2024-03-01',
    name_right: 'LI XIAOHUA（MLMC）',
  },
  {
    source_customer_no: 'Z003', source_updated_at: '2024-03-01',
    name: '張三豐（ZZIP）',
    source_customer_no_right: null, source_updated_at_right: null,
    name_right: null,
  },
  {
    source_customer_no: null, source_updated_at: null,
    name: null,
    source_customer_no_right: 'M001', source_updated_at_right: '2024-03-01',
    name_right: 'CHEN DAWEI（MLMC）',
  },
];
```

### Lookup 測試資料（US-058 新增）
```typescript
// 主資料集（5 列，含 CUST_TYPE 比對欄位）
const lookupMainRows = [
  { ID: '001', NAME: '王大明', CUST_TYPE: 'A01' },
  { ID: '002', NAME: '李小華', CUST_TYPE: 'B02' },
  { ID: '003', NAME: '張三豐', CUST_TYPE: 'A01' },  // 與 001 相同 CUST_TYPE
  { ID: '004', NAME: '陳大為', CUST_TYPE: 'Z99' },  // 對照表無此 CODE → null
  { ID: '005', NAME: '劉小雲', CUST_TYPE: null },    // null key → null
];

// 對照資料集（雙輸入模式使用，3 筆，含重複 key 邊界值）
const lookupRefRows = [
  { CODE: 'A01', CODE_DESC: '一般客戶', CODE_CATEGORY: 'INDIVIDUAL' },
  { CODE: 'B02', CODE_DESC: '企業客戶', CODE_CATEGORY: 'CORPORATE' },
  { CODE: 'A01', CODE_DESC: '一般客戶（重複）', CODE_CATEGORY: 'INDIVIDUAL_DUP' }, // 重複 key，取首筆
];

// 空對照資料集（邊界值）
const emptyRefRows: any[] = [];

// 典型節點設定
const lookupConfig = {
  nodeType: 'lookup',
  matchColumn: 'CUST_TYPE',        // 主資料集的比對欄位
  lookupMatchColumn: 'CODE',       // 對照資料集的比對欄位
  outputColumns: [
    { lookupColumn: 'CODE_DESC', outputAlias: 'cust_type_desc' },
    { lookupColumn: 'CODE_CATEGORY', outputAlias: 'cust_category' },
  ],
};

// 向下相容模式節點設定（含 lookupSource / lookupFilter）
const lookupLegacyConfig = {
  ...lookupConfig,
  lookupSource: 'raw_e5a2345c',    // raw table 名稱
  lookupFilter: "TBL_ID = 'A2'",  // SQL 過濾條件
};

// 扇出場景用：3 個 Lookup 節點各自的 context
const fanoutLookupContexts = [
  { nodeId: 'lookup-node-1', mainRows: lookupMainRows, refRows: lookupRefRows },
  { nodeId: 'lookup-node-2', mainRows: lookupMainRows, refRows: lookupRefRows },
  { nodeId: 'lookup-node-3', mainRows: lookupMainRows, refRows: lookupRefRows },
];
```

---

## 測試場景 — RawDataExtractExecutor

### TS-F043-001: 正常讀取 raw table 全部資料

- **Related Requirement**: F043 AC-1 / F043 Section 4.1 / US-056 AC-1
- **Test Type**: 正向
- **測試層次**: 單元測試（Mock queryRunner）
- **Preconditions**:
  - Mock queryRunner.query 回傳 mockRows（3 筆）
  - Mock 表存在性查詢回傳存在
- **Steps**:
  1. 建立 RawDataExtractExecutor
  2. 準備 context（node.data.rawTable = 'raw_test_table'）
  3. 呼叫 execute(context)
- **Expected Result**:
  - 輸出 DataSet.rows 包含 3 筆資料
  - `rowCount = 3`
  - 所有欄位（id, CUSTO_NO, CUS_NAME, UPDATE_DATE）均存在

---

### TS-F043-002: 批次讀取超過 batchSize 的 raw table

- **Related Requirement**: F043 Section 4.1 處理邏輯步驟 3
- **Test Type**: 正向
- **測試層次**: 單元測試（Mock queryRunner）
- **Preconditions**:
  - batchSize = 2（測試用，覆蓋批次邊界）
  - Mock queryRunner 第一批回傳 2 筆，第二批回傳 1 筆，第三批回傳空陣列（結束）
- **Steps**:
  1. 執行 execute(context)，batchSize = 2
- **Expected Result**:
  - Mock queryRunner.query 被呼叫 3 次（LIMIT 2 OFFSET 0 / OFFSET 2 / OFFSET 4）
  - 輸出 DataSet.rowCount = 3（3 筆合併）

---

### TS-F043-003: raw table 不存在時節點 failed

- **Related Requirement**: F043 AC-2（錯誤處理）/ US-056 AC-1
- **Test Type**: 負向
- **測試層次**: 單元測試（Mock queryRunner）
- **Preconditions**:
  - Mock 表存在性查詢回傳不存在（空陣列）
- **Steps**:
  1. 呼叫 execute(context)，rawTable = 'raw_nonexistent'
- **Expected Result**:
  - 拋出例外，message = `原始資料表 raw_nonexistent 不存在`

---

### TS-F043-004: 輸入 DataSet 為空的 raw table 正常回傳

- **Related Requirement**: F043 Section 6 邊界情況
- **Test Type**: 邊界
- **測試層次**: 單元測試（Mock queryRunner）
- **Preconditions**:
  - 表存在，但 queryRunner 首次回傳空陣列
- **Steps**:
  1. 呼叫 execute(context)
- **Expected Result**:
  - 輸出 `{ rows: [], rowCount: 0 }`
  - 節點不拋出錯誤

---

## 測試場景 — MergeExecutor

### TS-F043-005: FULL OUTER JOIN — 左有右無的列

- **Related Requirement**: F043 AC-3 / US-056 AC-2 / US-056 TC-056-02
- **Test Type**: 正向
- **測試層次**: 單元測試
- **Preconditions**:
  - Left：A001, A002, A003；Right：A002, A004
  - JOIN on CUSTO_NO
- **Steps**:
  1. 執行 MergeExecutor，left-input = Left，right-input = Right
- **Expected Result**:
  - 輸出 `rowCount = 4`（A001 左有、A002 雙有、A003 左有、A004 右有）
  - A001 列：left 欄位有值，right 欄位（EXTRA）為 null
  - A003 列：left 欄位有值，right 欄位為 null
  - A004 列：CUSTO_NO = 'A004'，AREA（left 欄位）為 null，EXTRA 有值

---

### TS-F043-006: FULL JOIN 欄位命名衝突加 _right 後綴

- **Related Requirement**: F043 AC-4 / F043 Section 4.2 欄位命名規則
- **Test Type**: 正向
- **測試層次**: 單元測試
- **Preconditions**:
  - Left 有欄位：CUSTO_NO, NAME, AREA
  - Right 有欄位：CUSTO_NO, NAME, EXTRA
  - JOIN on CUSTO_NO（同名 key）
- **Steps**:
  1. 執行 MergeExecutor
- **Expected Result**:
  - 輸出欄位包含：`CUSTO_NO`（合併後單一），`NAME`（left），`NAME_right`（right），`AREA`（left），`EXTRA`（right）
  - 不產生 `CUSTO_NO_right`（JOIN key 同名時僅保留一個）
  - 雙方均有的列，`CUSTO_NO = left.CUSTO_NO`（left 優先）

---

### TS-F043-007: JOIN key 欄位合併 — 取非 null 者（left 優先）

- **Related Requirement**: F043 Section 4.2 特殊規則 JOIN key 處理
- **Test Type**: 邊界
- **測試層次**: 單元測試
- **Preconditions**:
  - 左右側均有 CUSTO_NO = 'A001'（雙方均非 null）
  - Right-only 的列：left.CUSTO_NO = null，right.CUSTO_NO = 'A004'
- **Steps**:
  1. 執行 MergeExecutor FULL JOIN
- **Expected Result**:
  - 雙方均有的列：`CUSTO_NO = 'A001'`（left 優先）
  - 右有左無的列：`CUSTO_NO = 'A004'`（right 的值，因 left 為 null）

---

### TS-F043-008: 一對多 JOIN（左側 key 對應右側多列）

- **Related Requirement**: F043 Section 6 邊界情況 / F043 Section 4.2 步驟 4
- **Test Type**: 邊界
- **測試層次**: 單元測試
- **Preconditions**:
  - Left：A001 × 1 列；Right：A001 × 2 列（不同 EXTRA 值）
- **Steps**:
  1. 執行 MergeExecutor FULL JOIN
- **Expected Result**:
  - 輸出包含 2 列 A001（笛卡爾乘積）
  - 各列的 EXTRA 分別為兩個不同值

---

### TS-F043-009: 左側輸入缺失時拋出錯誤

- **Related Requirement**: F043 Section 4.2 錯誤處理
- **Test Type**: 負向
- **測試層次**: 單元測試
- **Preconditions**: `context.inputs` 中無 `'left-input'` key
- **Steps**:
  1. 呼叫 MergeExecutor.execute(context)
- **Expected Result**:
  - 拋出例外，message = `Merge 節點缺少左側輸入（left-input）`

---

### TS-F043-010: 左右側均為空 DataSet 時回傳空結果

- **Related Requirement**: F043 Section 6 邊界情況
- **Test Type**: 邊界
- **測試層次**: 單元測試
- **Preconditions**: left = `{ rows: [], rowCount: 0 }`，right = `{ rows: [], rowCount: 0 }`
- **Steps**:
  1. 執行 MergeExecutor
- **Expected Result**:
  - 輸出 `{ rows: [], rowCount: 0 }`，不拋出錯誤

---

### TS-F043-010A: [BUG-1 修正驗證] 同名 join key FULL JOIN — 額外輸出 `_left` / `_right` 欄位

- **Related Requirement**: F043 Section 4.2 特殊規則 JOIN key 處理 / F043 AC-3a（BUG-1）/ US-056 AC-2a / US-056 TC-056-10
- **Test Type**: 正向（BUG-1 修正驗證）
- **測試層次**: 單元測試
- **Preconditions**:
  - 左側 DataSet（ZZIP 路線 fm1 輸出）：1 列，`source_customer_no = "ZZIP-001"`
  - 右側 DataSet（MLMC 路線 fm2 輸出）：1 列，`source_customer_no = "MLMC-001"`
  - 兩者 `source_customer_no` 不同（無 match），模擬 m4 FULL JOIN 情境
  - JOIN 條件：`leftColumn: "source_customer_no"，rightColumn: "source_customer_no"`（同名 key）
- **Steps**:
  1. 執行 MergeExecutor（m4），left-input = ZZIP 列，right-input = MLMC 列
  2. 取得輸出列陣列（rowCount = 2）
  3. 依 `source_customer_no` 區分 ZZIP-only 與 MLMC-only 兩列
- **Expected Result**:
  - 輸出 `rowCount = 2`（FULL JOIN，無 match 故各自獨立）
  - **ZZIP-only 列**：
    - `source_customer_no = "ZZIP-001"`（COALESCE 結果：左側非 null，取左側）
    - `source_customer_no_left = "ZZIP-001"`（左側原始值）
    - `source_customer_no_right = null`（右側原始值，因無 match）
  - **MLMC-only 列**：
    - `source_customer_no = "MLMC-001"`（COALESCE 結果：左側為 null，取右側）
    - `source_customer_no_left = null`（左側原始值，因無 match）
    - `source_customer_no_right = "MLMC-001"`（右側原始值）
  - 輸出列共含 3 個 join key 相關欄位：`source_customer_no`、`source_customer_no_left`、`source_customer_no_right`

> **背景（BUG-1）**：原實作同名 join key 時僅輸出 COALESCE 後的主 key，不產生 `_left`/`_right` 欄位。導致下游 df3 的 `data_source` CASE WHEN 無法區分記錄來源，所有記錄均被標記為 `"ZZIP_BAMCUST_M+MLMCUSTOMER"`。

---

### TS-F043-010B: [BUG-1 修正驗證] 同名 join key 雙方均 match — `_left` / `_right` 均有值

- **Related Requirement**: F043 Section 4.2 特殊規則 JOIN key 處理 / F043 AC-3a（BUG-1）/ US-056 TC-056-10
- **Test Type**: 邊界（BUG-1 修正驗證，雙方 match 情境）
- **測試層次**: 單元測試
- **Preconditions**:
  - 左側 DataSet：1 列，`source_customer_no = "BOTH-001"`
  - 右側 DataSet：1 列，`source_customer_no = "BOTH-001"`（相同 key，雙方 match）
  - JOIN 條件：同名 key `source_customer_no`
- **Steps**:
  1. 執行 MergeExecutor FULL JOIN
  2. 取得輸出列（rowCount = 1）
- **Expected Result**:
  - 輸出 `rowCount = 1`（雙方 match，合併為單列）
  - `source_customer_no = "BOTH-001"`（COALESCE 結果：左側非 null，取左側）
  - `source_customer_no_left = "BOTH-001"`（左側原始值，非 null）
  - `source_customer_no_right = "BOTH-001"`（右側原始值，非 null）
  - 下游 `data_source` CASE WHEN 可正確判斷為雙來源（`_left IS NOT NULL AND _right IS NOT NULL`）

---

## 測試場景 — DedupExecutor

### TS-F043-011: 保留最新時間戳的列

- **Related Requirement**: F043 AC-5 / US-056 AC-3 / US-056 TC-056-03
- **Test Type**: 正向
- **測試層次**: 單元測試
- **Preconditions**: 同 CUSTO_NO = 'A001' 出現 3 次，UPDATE_DATE 分別為 2024-01-01, 2024-03-01, 2024-02-01
- **Steps**:
  1. 執行 DedupExecutor，keyColumns = ["CUSTO_NO"]，timestampColumn = "UPDATE_DATE"
- **Expected Result**:
  - 輸出只有 1 列 A001
  - `UPDATE_DATE = '2024-03-01'`（最新的）

---

### TS-F043-012: null 時間戳視為最舊（不被保留）

- **Related Requirement**: F043 AC-6 / F043 Section 4.3 步驟 6
- **Test Type**: 邊界
- **測試層次**: 單元測試
- **Preconditions**: A002 有兩列，一列 UPDATE_DATE = '2024-01-01'，另一列 UPDATE_DATE = null
- **Steps**:
  1. 執行 DedupExecutor
- **Expected Result**:
  - 保留 UPDATE_DATE = '2024-01-01' 那列
  - null 時間戳那列被去除

---

### TS-F043-013: 時間戳相同時保留 index 最小者

- **Related Requirement**: F043 Section 4.3 步驟 5
- **Test Type**: 邊界
- **測試層次**: 單元測試
- **Preconditions**:
  - 同 CUSTO_NO = 'A003' 出現 3 次，UPDATE_DATE 全為 '2024-01-01'
  - 三列的 DATA 欄位分別為 '第一筆', '第二筆', '第三筆'
- **Steps**:
  1. 執行 DedupExecutor
- **Expected Result**:
  - 保留第一筆（DATA = '第一筆'，index = 0）

---

### TS-F043-014: 所有 key 唯一時（無重複）回傳與輸入相同

- **Related Requirement**: F043 Section 6 邊界情況
- **Test Type**: 邊界
- **測試層次**: 單元測試
- **Preconditions**: 3 列資料，CUSTO_NO 全部唯一（A001, A002, A003）
- **Steps**:
  1. 執行 DedupExecutor
- **Expected Result**:
  - 輸出 `rowCount = 3`（與輸入相同）

---

### TS-F043-015: keyColumns 欄位不存在時拋出錯誤

- **Related Requirement**: F043 Section 4.3 錯誤處理
- **Test Type**: 負向
- **測試層次**: 單元測試
- **Preconditions**: keyColumns = ["NON_EXIST_COLUMN"]，但資料中無此欄位
- **Steps**:
  1. 執行 DedupExecutor
- **Expected Result**:
  - 拋出例外，message = `Dedup 節點 key 欄位 NON_EXIST_COLUMN 不存在於資料集中`

---

## 測試場景 — TypeCastExecutor

### TS-F043-016: VARCHAR 轉 DECIMAL 成功

- **Related Requirement**: F043 AC-7 / US-056 AC-4 / US-056 TC-056-04
- **Test Type**: 正向
- **測試層次**: 單元測試
- **Preconditions**: CUSTNOWCAPTIAL = '5000000'
- **Steps**:
  1. 執行 TypeCastExecutor，castRule: CUSTNOWCAPTIAL VARCHAR → DECIMAL
- **Expected Result**:
  - 輸出列 `CUSTNOWCAPTIAL = 5000000`（number 型別）

---

### TS-F043-017: VARCHAR 轉 DECIMAL 失敗 → null

- **Related Requirement**: F043 AC-8 / US-056 TC-056-05
- **Test Type**: 負向（轉換失敗容錯）
- **測試層次**: 單元測試
- **Preconditions**: CUSTNOWCAPTIAL = 'N/A'
- **Steps**:
  1. 執行 TypeCastExecutor
- **Expected Result**:
  - 輸出列 `CUSTNOWCAPTIAL = null`（不拋出例外）

---

### TS-F043-018: VARCHAR 轉 INTEGER 成功與失敗

- **Related Requirement**: F043 Section 4.4 轉換邏輯
- **Test Type**: 正向 + 負向
- **測試層次**: 單元測試
- **Steps**:
  1. 輸入 COUNT = '42'，執行 VARCHAR → INTEGER
  2. 輸入 COUNT = 'ABC'，執行 VARCHAR → INTEGER
- **Expected Result**:
  - '42' → `42`（number）
  - 'ABC' → `null`

---

### TS-F043-019: VARCHAR 轉 DATE 成功與失敗

- **Related Requirement**: F043 Section 4.4 轉換邏輯
- **Test Type**: 正向 + 負向
- **測試層次**: 單元測試
- **Steps**:
  1. 輸入 BIRTH_DATE = '1990-01-15'，執行 VARCHAR → DATE
  2. 輸入 BIRTH_DATE = 'not-a-date'，執行 VARCHAR → DATE
- **Expected Result**:
  - '1990-01-15' → 有效的 Date 物件
  - 'not-a-date' → `null`

---

### TS-F043-020: 欄位值為 null 時跳過轉換

- **Related Requirement**: F043 Section 4.4 步驟 5
- **Test Type**: 邊界
- **測試層次**: 單元測試
- **Preconditions**: CUSTNOWCAPTIAL = null
- **Steps**:
  1. 執行 TypeCastExecutor
- **Expected Result**:
  - 輸出列 `CUSTNOWCAPTIAL = null`（保持 null，不拋錯）

---

### TS-F043-021: 不支援的轉換組合拋出錯誤

- **Related Requirement**: F043 Section 4.4 錯誤處理
- **Test Type**: 負向
- **測試層次**: 單元測試
- **Preconditions**: castRule 為 INTEGER → VARCHAR（不支援）
- **Steps**:
  1. 執行 TypeCastExecutor
- **Expected Result**:
  - 拋出例外，message 包含 `不支援的型別轉換：INTEGER → VARCHAR`

---

### TS-F043-022: 欄位不存在靜默跳過

- **Related Requirement**: F043 Section 4.4 錯誤處理
- **Test Type**: 邊界
- **測試層次**: 單元測試
- **Preconditions**: castRule 中 column = 'NON_EXIST'，但資料列無此欄位
- **Steps**:
  1. 執行 TypeCastExecutor
- **Expected Result**:
  - 不拋出例外，靜默跳過，該欄位維持 null

---

## 測試場景 — DerivedFieldExecutor

### TS-F043-023: mergePhone 正常合併

- **Related Requirement**: F043 AC-9 / US-056 TC-056-06
- **Test Type**: 正向
- **測試層次**: 單元測試
- **Preconditions**: CAREA_NO1 = '02', CTEL_NO1 = '27123456'
- **Steps**:
  1. 執行 DerivedFieldExecutor，expression = `mergePhone(CAREA_NO1, CTEL_NO1)`，outputColumn = 'home_phone'
- **Expected Result**:
  - 輸出列包含 `home_phone = '02-27123456'`
  - 原始欄位 CAREA_NO1, CTEL_NO1 仍然保留

---

### TS-F043-023A: df2 registered_phone — mergePhone(CUSTTELCODE, CUSTTEL) 正常合併

- **Related Requirement**: F043 Section 4.5 / US-049 C 類聯絡資訊（v2.2 新增）
- **Test Type**: 正向
- **測試層次**: 單元測試
- **Preconditions**: CUSTTELCODE = '02', CUSTTEL = '87654321'
- **Steps**:
  1. 執行 DerivedFieldExecutor，expression = `mergePhone(CUSTTELCODE, CUSTTEL)`，outputColumn = 'registered_phone'
- **Expected Result**:
  - 輸出列包含 `registered_phone = '02-87654321'`
  - 原始欄位 CUSTTELCODE, CUSTTEL 仍然保留

---

### TS-F043-023B: df2 registered_fax — mergePhone(CUSTFAXCODE, CUSTFAX) 正常合併

- **Related Requirement**: F043 Section 4.5 / US-049 C 類聯絡資訊（v2.2 新增）
- **Test Type**: 正向
- **測試層次**: 單元測試
- **Preconditions**: CUSTFAXCODE = '02', CUSTFAX = '87651234'
- **Steps**:
  1. 執行 DerivedFieldExecutor，expression = `mergePhone(CUSTFAXCODE, CUSTFAX)`，outputColumn = 'registered_fax'
- **Expected Result**:
  - 輸出列包含 `registered_fax = '02-87651234'`
  - 原始欄位 CUSTFAXCODE, CUSTFAX 仍然保留

---

### TS-F043-023C: df2 business_fax — mergePhone(BUSINESSFAXCODE, BUSINESSFAX) 正常合併

- **Related Requirement**: F043 Section 4.5 / US-049 C 類聯絡資訊（v2.2 新增）
- **Test Type**: 正向
- **測試層次**: 單元測試
- **Preconditions**: BUSINESSFAXCODE = '07', BUSINESSFAX = '12345678'
- **Steps**:
  1. 執行 DerivedFieldExecutor，expression = `mergePhone(BUSINESSFAXCODE, BUSINESSFAX)`，outputColumn = 'business_fax'
- **Expected Result**:
  - 輸出列包含 `business_fax = '07-12345678'`
  - 原始欄位 BUSINESSFAXCODE, BUSINESSFAX 仍然保留

---

### TS-F043-024: mergePhone 佔位值（全零）回傳 null

- **Related Requirement**: F043 AC-10 / F043 Section 4.5 佔位值過濾規則
- **Test Type**: 負向（佔位值過濾）
- **測試層次**: 單元測試
- **Steps**:
  1. CAREA_NO1 = '00', CTEL_NO1 = '0000000000' → 期望 null
  2. CAREA_NO1 = '00', CTEL_NO1 = '27123456' → 期望 null（區碼全零）
  3. CAREA_NO1 = '02', CTEL_NO1 = '00000000' → 期望 null（號碼全零）
  4. CAREA_NO1 = null, CTEL_NO1 = '27123456' → 期望 null
  5. CAREA_NO1 = '', CTEL_NO1 = '27123456' → 期望 null
- **Expected Result**: 以上所有情境均回傳 null

---

### TS-F043-024B: mergePhone 3 參數 — 有分機號碼時附加 `#分機`

- **Related Requirement**: F043 Section 4.5 mergePhone 函數（3 參數版本）
- **Test Type**: 正向
- **測試層次**: 單元測試
- **Preconditions**: CAREA_NO1 = '02', CTEL_NO1 = '27123456', EXTEN_NO1 = '1234'
- **Steps**:
  1. 執行 DerivedFieldExecutor，expression = `mergePhone(CAREA_NO1, CTEL_NO1, EXTEN_NO1)`，outputColumn = 'home_phone'
- **Expected Result**:
  - 輸出列包含 `home_phone = '02-27123456#1234'`（格式：`{區碼}-{號碼}#{分機}`）

---

### TS-F043-024C: mergePhone 3 參數 — 分機為 null 時省略 `#分機`

- **Related Requirement**: F043 Section 4.5 mergePhone 函數（3 參數版本）
- **Test Type**: 邊界
- **測試層次**: 單元測試
- **Preconditions**: CAREA_NO1 = '02', CTEL_NO1 = '27123456', EXTEN_NO1 = null
- **Steps**:
  1. 執行 DerivedFieldExecutor，expression = `mergePhone(CAREA_NO1, CTEL_NO1, EXTEN_NO1)`，outputColumn = 'home_phone'
- **Expected Result**:
  - 輸出列包含 `home_phone = '02-27123456'`（無 `#` 後綴，與 2 參數版本行為一致）

---

### TS-F043-024D: mergePhone 3 參數 — 分機為空字串時省略 `#分機`

- **Related Requirement**: F043 Section 4.5 mergePhone 函數（3 參數版本）
- **Test Type**: 邊界
- **測試層次**: 單元測試
- **Preconditions**: CAREA_NO1 = '02', CTEL_NO1 = '27123456', EXTEN_NO1 = ''
- **Steps**:
  1. 執行 DerivedFieldExecutor，expression = `mergePhone(CAREA_NO1, CTEL_NO1, EXTEN_NO1)`，outputColumn = 'home_phone'
- **Expected Result**:
  - 輸出列包含 `home_phone = '02-27123456'`（空字串分機視同無分機）

---

### TS-F043-024E: mergePhone 3 參數 — 分機為全零時省略 `#分機`

- **Related Requirement**: F043 Section 4.5 mergePhone 函數（3 參數版本，佔位值過濾）
- **Test Type**: 邊界（佔位值過濾）
- **測試層次**: 單元測試
- **Preconditions**: CAREA_NO1 = '02', CTEL_NO1 = '27123456', EXTEN_NO1 = '000'
- **Steps**:
  1. 執行 DerivedFieldExecutor，expression = `mergePhone(CAREA_NO1, CTEL_NO1, EXTEN_NO1)`，outputColumn = 'home_phone'
- **Expected Result**:
  - 輸出列包含 `home_phone = '02-27123456'`（全零分機視為佔位值，省略 `#` 後綴）

---

### TS-F043-024F: mergePhone 3 參數 — SQL 生成驗證（CASE WHEN 含 `#` 分隔符）

- **Related Requirement**: F043 Section 4.5 mergePhone SQL 產生邏輯
- **Test Type**: 正向（SQL 產生）
- **測試層次**: 單元測試（檢驗 SQL AST 或產生的 SQL 字串）
- **Preconditions**: DerivedFieldExecutor 支援將 `mergePhone(area, tel, exten)` 編譯為 SQL CASE WHEN 表達式
- **Steps**:
  1. 呼叫 mergePhone SQL 產生器，傳入 3 個欄位參數（area='CAREA_NO1', tel='CTEL_NO1', exten='EXTEN_NO1'）
  2. 取得產生的 SQL 字串（或 SQL AST）
- **Expected Result**:
  - SQL 包含 `CASE WHEN` 結構
  - SQL 包含 `'#'` 字面值作為分機分隔符
  - 當 exten 為 null 或全零時的分支不含 `'#'`（透過 `WHEN exten IS NULL` 或 `WHEN exten = '000'` 判斷）
  - 基礎格式：`{area}-{tel}` 部分與 2 參數版本 SQL 格式一致

---

### TS-F043-025: padStart 字串補零

- **Related Requirement**: F043 AC-11 / US-056 TC-056-08
- **Test Type**: 正向
- **測試層次**: 單元測試
- **Preconditions**: CUTYPE = '1'
- **Steps**:
  1. 執行 DerivedFieldExecutor，expression = `padStart(CUTYPE, 2, '0')`，outputColumn = 'customer_type_mapped'
- **Expected Result**:
  - `customer_type_mapped = '01'`

---

### TS-F043-026: padStart 欄位值已達目標長度

- **Related Requirement**: F043 Section 4.5 padStart 函數
- **Test Type**: 邊界
- **測試層次**: 單元測試
- **Preconditions**: CUTYPE = '02'（已有 2 位）
- **Steps**:
  1. 執行 padStart(CUTYPE, 2, '0')
- **Expected Result**:
  - `customer_type_mapped = '02'`（不改變）

---

### TS-F043-026A: [BUG-3 修正驗證] ZZIP CUSTOM_MK 補零 — `padStart(CUSTOM_MK, 2, '0')` 使 Lookup 命中

- **Related Requirement**: F043 Section 4.5 padStart 函數 / US-056 TC-056-09b（BUG-3）
- **Test Type**: 正向（BUG-3 修正驗證）
- **測試層次**: 單元測試
- **Preconditions**:
  - 列中 `CUSTOM_MK = "1"`（ZZIP 來源單位數格式）
  - expression = `padStart(CUSTOM_MK, 2, '0')`，outputColumn = `'CUSTOM_MK'`（覆蓋原欄位）
- **Steps**:
  1. 執行 DerivedFieldExecutor，節點 = `df_zzip_ctype_pad`
  2. 取得輸出列的 CUSTOM_MK 值
- **Expected Result**:
  - 輸出列 `CUSTOM_MK = "01"`（補零後可命中 Lookup lk_ctype1 的 `TBL_CD = "01"` 條目）

> **背景（BUG-3）**：ZZIP 來源的 `CUSTOM_MK` 欄位同時存在 `"1"` 和 `"01"` 兩種格式，而 lk_ctype1 對照表統一使用 `"01"`，導致 `"1"` 無法命中對照描述。修正方式為在 ZZIP 分支的 Lookup 節點前插入 `df_zzip_ctype_pad`（derived_field）節點執行 padStart 正規化。此為 **pipeline definition 設定層**修改，`padStart` 函數邏輯本身不需更動；現有 TS-F043-025/026 已覆蓋 padStart 函數正確性，本場景驗證 BUG-3 的具體修正情境。

---

### TS-F043-027: gen_random_uuid 產生唯一 UUID v4

- **Related Requirement**: F043 AC-12 / US-056 TC-056-09
- **Test Type**: 正向
- **測試層次**: 單元測試
- **Preconditions**: 1000 列資料
- **Steps**:
  1. 執行 DerivedFieldExecutor，expression = `gen_random_uuid()`，outputColumn = 'customer_id'
- **Expected Result**:
  - 1000 列的 customer_id 均符合 UUID v4 格式（正規表達式 `/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i`）
  - 1000 個 UUID 互不重複（Set 去重後長度仍為 1000）

---

### TS-F043-028: CASE WHEN — 雙側均非 null 時使用第一個 THEN

- **Related Requirement**: F043 AC-13 / US-056 AC-5
- **Test Type**: 正向
- **測試層次**: 單元測試
- **Preconditions**:
  - 列中 source_customer_no = 'Z001'（非 null），source_customer_no_right = 'M001'（非 null）
  - expression: `CASE WHEN left.source_customer_no IS NOT NULL AND right.source_customer_no IS NOT NULL THEN 'ZZIP_BAMCUST_M+MLMCUSTOMER' WHEN left.source_customer_no IS NOT NULL THEN 'ZZIP_BAMCUST_M' ELSE 'MLMCUSTOMER' END`
- **Steps**:
  1. 執行 DerivedFieldExecutor，outputColumn = 'data_source'
- **Expected Result**:
  - `data_source = 'ZZIP_BAMCUST_M+MLMCUSTOMER'`

---

### TS-F043-029: CASE WHEN — 僅左側非 null 時使用第二個 THEN

- **Related Requirement**: F043 AC-13
- **Test Type**: 正向
- **測試層次**: 單元測試
- **Preconditions**:
  - source_customer_no = 'Z002'（非 null），source_customer_no_right = null
- **Steps**:
  1. 執行 DerivedFieldExecutor（同 TS-F043-028 的 expression）
- **Expected Result**:
  - `data_source = 'ZZIP_BAMCUST_M'`

---

### TS-F043-030: CASE WHEN — 左側為 null 時使用 ELSE

- **Related Requirement**: F043 Section 4.5 CASE WHEN 支援語法
- **Test Type**: 正向
- **測試層次**: 單元測試
- **Preconditions**:
  - source_customer_no = null，source_customer_no_right = 'M001'（非 null）
- **Steps**:
  1. 執行 DerivedFieldExecutor（同上 expression）
- **Expected Result**:
  - `data_source = 'MLMCUSTOMER'`

---

### TS-F043-031: 表達式參照欄位不存在時 outputColumn 設為 null

- **Related Requirement**: F043 Section 4.5 錯誤處理
- **Test Type**: 邊界
- **測試層次**: 單元測試
- **Preconditions**: expression = `mergePhone(NON_EXIST_AREA, NON_EXIST_TEL)`，欄位不存在於資料列
- **Steps**:
  1. 執行 DerivedFieldExecutor
- **Expected Result**:
  - 不拋出例外
  - `home_phone = null`

---

### TS-F043-032: 不支援的表達式函數拋出錯誤

- **Related Requirement**: F043 Section 4.5 錯誤處理
- **Test Type**: 負向
- **測試層次**: 單元測試
- **Preconditions**: expression = `unsupported_func(COL1)`
- **Steps**:
  1. 執行 DerivedFieldExecutor
- **Expected Result**:
  - 拋出例外，message = `不支援的表達式函數：unsupported_func`

---

## 測試場景 — FieldMappingExecutor

### TS-F043-033: dropUnmapped=true 時輸出只含映射欄位

- **Related Requirement**: F043 AC-14 / US-057 AC-1 / US-057 TC-057-01
- **Test Type**: 正向
- **測試層次**: 單元測試
- **Preconditions**: 輸入含 3 個欄位（CUSTO_NO, CUS_NAME, EXTRA_FIELD），mappings 定義 2 組映射，dropUnmapped = true
- **Steps**:
  1. 執行 FieldMappingExecutor
- **Expected Result**:
  - 輸出列包含 `source_customer_no`, `name`
  - 不含 `CUSTO_NO`, `CUS_NAME`, `EXTRA_FIELD`

---

### TS-F043-034: dropUnmapped=false 時保留所有原始欄位

- **Related Requirement**: F043 Section 4.6 步驟 4
- **Test Type**: 正向
- **測試層次**: 單元測試
- **Preconditions**: 輸入含 3 個欄位，dropUnmapped = false
- **Steps**:
  1. 執行 FieldMappingExecutor，dropUnmapped = false
- **Expected Result**:
  - 輸出列包含所有原始欄位 + 新增的 targetColumn 欄位

---

### TS-F043-035: sourceColumn 不存在 — defaultValue 非 null 時使用 defaultValue

- **Related Requirement**: F043 AC-15 / US-057 AC-5
- **Test Type**: 邊界
- **測試層次**: 單元測試
- **Preconditions**: sourceColumn = 'NON_EXIST'，defaultValue = 'default_val'
- **Steps**:
  1. 執行 FieldMappingExecutor
- **Expected Result**:
  - 輸出列 `optional_field = 'default_val'`（不拋出例外）

---

### TS-F043-036: sourceColumn 不存在 — defaultValue 為 null 時輸出 null

- **Related Requirement**: F043 Section 4.6 步驟 2
- **Test Type**: 邊界
- **測試層次**: 單元測試
- **Preconditions**: sourceColumn = 'MISSING_NO_DEFAULT'，defaultValue = null
- **Steps**:
  1. 執行 FieldMappingExecutor
- **Expected Result**:
  - 輸出列 `will_be_null = null`（不拋出例外）

---

### TS-F043-037: mappings 為空且 dropUnmapped=true 時輸出空列

- **Related Requirement**: F043 Section 4.6 錯誤處理
- **Test Type**: 邊界
- **測試層次**: 單元測試
- **Preconditions**: mappings = []，dropUnmapped = true
- **Steps**:
  1. 執行 FieldMappingExecutor
- **Expected Result**:
  - 輸出每列為空物件（0 個欄位）
  - rowCount 與輸入相同

---

### TS-F043-037B: fm2 MLMC 映射（37 組映射）完整性驗證

- **Related Requirement**: F043 Section 4.6 / US-049 MLMC 映射（v2.2+v2.4：含 registered_phone/registered_fax/business_fax/business_mobile/owner_zip/owner_address/group_owner/employee_count_code/employee_count_desc/is_listed_code/is_listed_desc/business_item/organization_type/parent_customer_name 等欄位）
- **Test Type**: 正向
- **測試層次**: 單元測試
- **Preconditions**:
  - 輸入 DataSet 含 MLMC 來源欄位（含 v2.2 新增欄位），dropUnmapped = true
  - fm2 mappings 共 37 組（包含 C 類 4 個新增電話/傳真欄位、D 類 2 個新增地址欄位、G 類 6 個新增企業欄位）
- **Steps**:
  1. 建立含 37 組 mappings 的 FieldMappingExecutor 設定
  2. 以含所有 MLMC 來源欄位的測試列執行
- **Expected Result**:
  - 輸出列包含 37 個 targetColumn 欄位（dropUnmapped = true，無 MLMC 原始欄位名稱）
  - 新增欄位正確映射：`registered_phone`（CUSTTELCODE→CUSTTEL 合併後）、`registered_fax`、`business_fax`、`business_mobile`（BUSINESSMOBILE）
  - 新增 D 類：`registered_zip`（CUSTZIPCODE）、`registered_address`（CUSTADDR）
  - 新增 G 類：`owner_zip`（OWNERZIPCODE）、`owner_address`（OWNERADDR）、`group_owner`（GROUPOWNER）、`employee_count_code`（EMPLOYEE）、`employee_count_desc`（代碼對照）、`is_listed_code`（LISTED）、`is_listed_desc`（代碼對照）、`business_item`（v2.4 新增）、`organization_type`（ORGATYPE）、`parent_customer_name`（PARENTCUSTNAME）
  - 所有 37 個目標欄位均存在於輸出列中

---

## 測試場景 — ConditionalExecutor

### TS-F043-038: left >= right 成立時選 left 的值

- **Related Requirement**: F043 AC-16 / US-057 AC-2 / US-057 TC-057-03
- **Test Type**: 正向
- **測試層次**: 單元測試
- **Preconditions**:
  - source_updated_at = '2024-03-01', source_updated_at_right = '2024-01-01'
  - name = '王大明（ZZIP）', name_right = 'WANG DAMING（MLMC）'
- **Steps**:
  1. 執行 ConditionalExecutor，rule: `WHEN left.source_updated_at >= right.source_updated_at THEN left.name ELSE right.name`
- **Expected Result**:
  - `name = '王大明（ZZIP）'`（left 較新，選 left）

---

### TS-F043-039: left < right 時選 right 的值

- **Related Requirement**: F043 AC-16 / US-057 TC-057-04
- **Test Type**: 正向
- **測試層次**: 單元測試
- **Preconditions**:
  - source_updated_at = '2024-01-01', source_updated_at_right = '2024-03-01'
  - name = '王大明（ZZIP）', name_right = 'WANG DAMING（MLMC）'
- **Steps**:
  1. 執行 ConditionalExecutor（同上 rule）
- **Expected Result**:
  - `name = 'WANG DAMING（MLMC）'`（right 較新）

---

### TS-F043-040: null 安全 — 任一側為 null 時 >= 不成立

- **Related Requirement**: F043 AC-17 / F043 Section 4.7 null 安全規則
- **Test Type**: 邊界
- **測試層次**: 單元測試
- **Preconditions**:
  - source_updated_at = '2024-03-01', source_updated_at_right = null
- **Steps**:
  1. 執行 ConditionalExecutor，when = `left.source_updated_at >= right.source_updated_at`
- **Expected Result**:
  - when 條件不成立（null 安全）
  - 使用 elseValue

---

### TS-F043-041: IS NOT NULL 條件正確評估

- **Related Requirement**: F043 Section 4.7 when 表達式解析
- **Test Type**: 正向 + 邊界
- **測試層次**: 單元測試
- **Steps**:
  1. source_customer_no = 'Z001'（非 null）→ `left.source_customer_no IS NOT NULL` 應成立
  2. source_customer_no = null → `left.source_customer_no IS NOT NULL` 不成立
  3. source_customer_no_right = null → `right.source_customer_no IS NOT NULL` 不成立（right. 對應 `_right` 後綴欄位）
- **Expected Result**:
  - 條件評估與上述一致

---

### TS-F043-042: 所有 when 都不成立時使用 elseValue

- **Related Requirement**: F043 Section 4.7 步驟 2c
- **Test Type**: 邊界
- **測試層次**: 單元測試
- **Preconditions**:
  - source_updated_at = null, source_updated_at_right = null
  - elseValue = `'UNKNOWN'`（字串常量）
- **Steps**:
  1. 執行 ConditionalExecutor（含 IS NOT NULL 條件的 rule）
- **Expected Result**:
  - `targetColumn = 'UNKNOWN'`

---

### TS-F043-043: then/elseValue 為字串常量時正確解析

- **Related Requirement**: F043 Section 4.7 then / elseValue 解析
- **Test Type**: 正向
- **測試層次**: 單元測試
- **Preconditions**: then = `'ZZIP_BAMCUST_M'`（含引號的字串常量）
- **Steps**:
  1. 執行 ConditionalExecutor，when 條件成立
- **Expected Result**:
  - `targetColumn = 'ZZIP_BAMCUST_M'`（去除引號後的字串值）

---

### TS-F043-044: 輸入 DataSet 為空時各節點正常回傳空 DataSet

- **Related Requirement**: F043 Section 6 邊界情況（所有節點通用）
- **Test Type**: 邊界
- **測試層次**: 單元測試
- **Preconditions**: 輸入 `{ rows: [], rowCount: 0 }`
- **Steps**:
  1. 對 dedup, type_cast, derived_field, field_mapping, conditional 各節點執行，輸入空 DataSet
- **Expected Result**:
  - 所有節點輸出 `{ rows: [], rowCount: 0 }`

---

### TS-F043-044A: [BUG-2 修正驗證] MLMC-only 記錄透過 elseValue 正確解析 `_right` 欄位

- **Related Requirement**: F043 AC-16 / US-057 AC-2a（BUG-2）/ US-057 TC-057-10
- **Test Type**: 正向（BUG-2 修正驗證）
- **測試層次**: 單元測試
- **Preconditions**:
  - cd1 輸入列（模擬 m4 FULL JOIN 後 MLMC-only 記錄）：
    ```
    name = null
    name_right = "企業甲"
    source_updated_at = null
    source_updated_at_right = "2024-01-01"
    customer_type_code = null
    customer_type_code_right = "02"
    ```
  - rule：`{ targetColumn: "name", conditions: [{ when: "left.source_updated_at >= right.source_updated_at", then: "left.name" }], elseValue: "right.name" }`
- **Steps**:
  1. 執行 ConditionalExecutor，輸入含上述 MLMC-only 列
  2. 驗證 `name` 欄位輸出值
- **Expected Result**:
  - `when "left.source_updated_at >= right.source_updated_at"` 不成立（`source_updated_at = null`，null 安全規則）
  - fallback 到 `elseValue: "right.name"`，解析為列中 `name_right` 欄位
  - 輸出列 `name = "企業甲"`（不為 null）

> **背景（BUG-2 cd1 部分）**：cd1 rules 原僅涵蓋 5 個欄位（name、mobile_phone、mailing_address、capital、office_phone），其餘欄位如 `customer_type_code` 對 MLMC-only 記錄保持左側（ZZIP）值即 null。修正後 rules 擴充至 14 個欄位，確保所有有 `_right` 後綴的欄位均被正確解決。

---

### TS-F043-044B: [BUG-2 修正驗證] ZZIP-only 記錄保持 left 欄位值（conditional 不誤取 null）

- **Related Requirement**: F043 AC-16 / US-057 AC-2a（BUG-2）/ US-057 TC-057-11
- **Test Type**: 正向（BUG-2 修正驗證）
- **測試層次**: 單元測試
- **Preconditions**:
  - cd1 輸入列（ZZIP-only 記錄）：
    ```
    name = "個人丙"
    name_right = null
    source_updated_at = "2024-02-01"
    source_updated_at_right = null
    ```
  - 同上 rule（含 IS NOT NULL 條件）
- **Steps**:
  1. 執行 ConditionalExecutor
  2. 驗證 `name` 欄位輸出值
- **Expected Result**:
  - `when "left.source_updated_at >= right.source_updated_at"` 不成立（right 為 null，null 安全）
  - 檢查後續 condition（若有 `left.source_updated_at IS NOT NULL`）：成立，取 `left.name`
  - 輸出列 `name = "個人丙"`（ZZIP 路線值正確保留）

> **注意**：本場景確認 BUG-2 修正後 ConditionalExecutor 既不誤丟 ZZIP-only 記錄，也不誤取 null 的 `_right` 欄位。

---

### TS-F043-044C: [BUG-1 修正驗證] df3 CASE WHEN 三種來源標記正確性（整合場景）

- **Related Requirement**: F043 AC-13 / US-056 TC-056-11 / F043 Section 4.5 DerivedFieldExecutor
- **Test Type**: 正向（BUG-1 修正驗證，整合場景）
- **測試層次**: 單元測試
- **Preconditions**:
  - m4 FULL JOIN 後輸出含三種記錄（BUG-1 修正後包含 `_left`/`_right` 欄位）：
    - (A) 雙來源：`source_customer_no_left = "ZZIP-001"`，`source_customer_no_right = "MLMC-001"`
    - (B) ZZIP-only：`source_customer_no_left = "ZZIP-001"`，`source_customer_no_right = null`
    - (C) MLMC-only：`source_customer_no_left = null`，`source_customer_no_right = "MLMC-001"`
  - df3 CASE WHEN 表達式（BUG-1 修正後語法）：
    ```
    CASE WHEN source_customer_no_left IS NOT NULL AND source_customer_no_right IS NOT NULL
         THEN 'ZZIP_BAMCUST_M+MLMCUSTOMER'
         WHEN source_customer_no_left IS NOT NULL
         THEN 'ZZIP_BAMCUST_M'
         ELSE 'MLMCUSTOMER' END
    ```
- **Steps**:
  1. 對三種記錄分別執行 DerivedFieldExecutor，outputColumn = 'data_source'
- **Expected Result**:
  - (A) 雙來源：`data_source = "ZZIP_BAMCUST_M+MLMCUSTOMER"`
  - (B) ZZIP-only：`data_source = "ZZIP_BAMCUST_M"`
  - (C) MLMC-only：`data_source = "MLMCUSTOMER"`

> **背景（BUG-1）**：修正前 df3 表達式引用 `left.source_customer_no` / `right.source_customer_no`，因 merge 的 COALESCE 行為兩者解析到同一個非 null 欄位，導致所有記錄均標記為 `"ZZIP_BAMCUST_M+MLMCUSTOMER"`。修正後改用 `source_customer_no_left` / `source_customer_no_right` 實體欄位（由 BUG-1 新增）。

---

> **ConditionalExecutor buildCaseSql NULL-guard 覆蓋說明**：現有測試資料（conditionalRows，第 142-171 行）已包含 MLMC-only（`source_customer_no_right = 'M001'`、左側 null）與 ZZIP-only（`source_customer_no_right = null`、左側非 null）兩種情境。TS-F043-038~044 的現有場景已透過 `IS NOT NULL` / `>=` / null 安全規則驗證 `buildCaseSql` 對這兩種情境的正確性，BUG-2 修正後 cd1 rules 涵蓋 14 個欄位，僅需確保 ConditionalExecutor 能正確處理任意 `_right` 後綴欄位，不需針對特定欄位數量新增額外測試場景。

---

## 測試場景 — LookupExecutor（US-058 新增）

### TS-F043-045: 雙輸入模式 — LEFT JOIN 正確產出結果

- **Related Requirement**: F043 AC-18 / US-058 AC-1, AC-2 / US-058 TC-058-01
- **Test Type**: 正向
- **測試層次**: 單元測試
- **Preconditions**:
  - `context.inputs['default']` = lookupMainRows（5 列，含 CUST_TYPE）
  - `context.inputs['lookup-input']` = lookupRefRows（3 筆對照資料，含重複 key）
  - 節點設定 = lookupConfig（matchColumn: 'CUST_TYPE', lookupMatchColumn: 'CODE', outputColumns 包含 CODE_DESC→cust_type_desc、CODE_CATEGORY→cust_category）
- **Steps**:
  1. 建立 LookupExecutor
  2. 呼叫 execute(context)
- **Expected Result**:
  - 輸出 `rowCount = 5`（LEFT JOIN，主資料集列數不變）
  - ID='001'（CUST_TYPE='A01'）：`cust_type_desc = '一般客戶'`、`cust_category = 'INDIVIDUAL'`（取首筆，忽略重複 key）
  - ID='002'（CUST_TYPE='B02'）：`cust_type_desc = '企業客戶'`、`cust_category = 'CORPORATE'`
  - ID='003'（CUST_TYPE='A01'）：同 001，`cust_type_desc = '一般客戶'`
  - 輸出列保留主資料集所有原始欄位（ID, NAME, CUST_TYPE）

---

### TS-F043-046: 雙輸入模式 — 無匹配 key 的列 outputColumns 補 null

- **Related Requirement**: F043 AC-19 / US-058 AC-2 / US-058 TC-058-02
- **Test Type**: 正向（LEFT JOIN 語意驗證）
- **測試層次**: 單元測試
- **Preconditions**:
  - `context.inputs['default']` 含 ID='004'（CUST_TYPE='Z99'），對照資料集中無此 CODE
  - `context.inputs['lookup-input']` = lookupRefRows
- **Steps**:
  1. 執行 LookupExecutor
- **Expected Result**:
  - ID='004' 列保留（不被排除）
  - `cust_type_desc = null`、`cust_category = null`
  - `rowCount` 仍包含此列

---

### TS-F043-047: 雙輸入模式 — 主資料集 key 為 null 時 outputColumns 補 null

- **Related Requirement**: F043 Section 6 邊界情況（null key）
- **Test Type**: 邊界
- **測試層次**: 單元測試
- **Preconditions**:
  - `context.inputs['default']` 含 ID='005'（CUST_TYPE=null）
  - `context.inputs['lookup-input']` = lookupRefRows
- **Steps**:
  1. 執行 LookupExecutor
- **Expected Result**:
  - ID='005' 列保留
  - `cust_type_desc = null`、`cust_category = null`（null key 不匹配任何對照列）

---

### TS-F043-048: 雙輸入模式 — 對照資料集有重複 key 時取首筆

- **Related Requirement**: F043 Section 6 邊界情況（重複 key）
- **Test Type**: 邊界
- **測試層次**: 單元測試
- **Preconditions**:
  - 對照資料集中 CODE='A01' 出現兩次（`CODE_DESC` 分別為 '一般客戶' 與 '一般客戶（重複）'）
  - 主資料集含 CUST_TYPE='A01' 的列
- **Steps**:
  1. 執行 LookupExecutor
- **Expected Result**:
  - CUST_TYPE='A01' 的列：`cust_type_desc = '一般客戶'`（lookup Map 先入為主，取首筆）
  - `cust_category = 'INDIVIDUAL'`（非重複列的值）

---

### TS-F043-049: 雙輸入模式 — 空對照資料集時所有 outputColumns 為 null

- **Related Requirement**: F043 AC-24 / F043 Section 6 邊界情況
- **Test Type**: 邊界
- **測試層次**: 單元測試
- **Preconditions**:
  - `context.inputs['default']` = lookupMainRows（5 列）
  - `context.inputs['lookup-input']` = `{ rows: [], rowCount: 0 }`
- **Steps**:
  1. 執行 LookupExecutor
- **Expected Result**:
  - 輸出 `rowCount = 5`（主資料集列數不變）
  - 所有列的 `cust_type_desc = null`、`cust_category = null`

---

### TS-F043-050: 向下相容模式 — 無 lookup-input 時使用 lookupSource + lookupFilter 查詢

- **Related Requirement**: F043 AC-20 / US-058 AC-3 / US-058 TC-058-03
- **Test Type**: 正向
- **測試層次**: 單元測試（Mock queryRunner）
- **Preconditions**:
  - `context.inputs` 中只有 `'default'`（無 `'lookup-input'`）
  - 節點設定 = lookupLegacyConfig（含 lookupSource: 'raw_e5a2345c', lookupFilter: "TBL_ID = 'A2'"）
  - Mock queryRunner.query 在收到 `SELECT * FROM raw_e5a2345c WHERE TBL_ID = 'A2'` 時回傳 lookupRefRows（2 筆有效資料）
- **Steps**:
  1. 執行 LookupExecutor
- **Expected Result**:
  - Mock queryRunner.query 被呼叫一次，SQL 包含 `FROM raw_e5a2345c` 與 `TBL_ID = 'A2'`
  - 輸出 rowCount 與主資料集相同（LEFT JOIN 語意）
  - 有對應對照列的主資料集列，`cust_type_desc` 有值

---

### TS-F043-051: 向下相容模式 — lookupFilter 為空時執行全表查詢

- **Related Requirement**: F043 Section 4.8 處理邏輯（向下相容模式）步驟 2
- **Test Type**: 正向
- **測試層次**: 單元測試（Mock queryRunner）
- **Preconditions**:
  - `context.inputs` 中只有 `'default'`（無 `'lookup-input'`）
  - 節點設定：lookupSource = 'raw_e5a2345c'，lookupFilter = ''（空字串）
  - Mock queryRunner.query 回傳 lookupRefRows
- **Steps**:
  1. 執行 LookupExecutor
- **Expected Result**:
  - Mock queryRunner.query 被呼叫一次，SQL 為 `SELECT * FROM raw_e5a2345c`（不含 WHERE）
  - 節點正常完成，不拋出錯誤

---

### TS-F043-052: 向下相容模式 — lookupSource 表不存在時拋出錯誤

- **Related Requirement**: F043 Section 4.8 錯誤處理 / US-058 AC-5
- **Test Type**: 負向
- **測試層次**: 單元測試（Mock queryRunner）
- **Preconditions**:
  - `context.inputs` 中只有 `'default'`（無 `'lookup-input'`）
  - Mock queryRunner.query 拋出例外（模擬表不存在）
- **Steps**:
  1. 執行 LookupExecutor，lookupSource = 'raw_nonexistent'
- **Expected Result**:
  - 拋出例外，message 包含 `對照表 raw_nonexistent 不存在` 或 `對照表查詢失敗`

---

### TS-F043-053: 舊版 Pipeline 定義（含 lookupSource/lookupFilter，無 lookup-input）可正常執行

- **Related Requirement**: F043 AC-21 / US-058 AC-4 / US-058 TC-058-04
- **Test Type**: 正向（向下相容驗證）
- **測試層次**: 單元測試（Mock queryRunner）
- **Preconditions**:
  - `context.inputs` 結構模擬舊版：只有 `'default'` key
  - 節點設定為舊版 Lookup schema（含 lookupSource、lookupFilter，無 lookup-input 相關設定）
  - Mock queryRunner 回傳 2 筆對照資料
- **Steps**:
  1. 執行 LookupExecutor（不帶 lookup-input）
- **Expected Result**:
  - 節點正常完成，不拋出錯誤
  - 結果與雙輸入模式相同邏輯（LEFT JOIN，有對應則填值，無對應則 null）

---

### TS-F043-054: 雙輸入模式忽略 lookupSource / lookupFilter 欄位

- **Related Requirement**: F043 Section 6 邊界情況（雙輸入模式忽略 lookupSource/lookupFilter）
- **Test Type**: 邊界（模式切換驗證）
- **測試層次**: 單元測試（Mock queryRunner）
- **Preconditions**:
  - `context.inputs` 同時含有 `'default'` 與 `'lookup-input'`
  - 節點設定中仍有 lookupSource = 'raw_e5a2345c' 與 lookupFilter = "TBL_ID = 'A2'"
  - Mock queryRunner 設為可偵測是否被呼叫
- **Steps**:
  1. 執行 LookupExecutor
- **Expected Result**:
  - Mock queryRunner.query **未被呼叫**（雙輸入模式不查詢資料庫）
  - 輸出資料以 `inputs['lookup-input']` 為對照來源

---

### TS-F043-055: 主資料流缺失時節點標記 failed

- **Related Requirement**: F043 AC-22 / US-058 AC-5 / US-058 TC-058-05
- **Test Type**: 負向
- **測試層次**: 單元測試
- **Preconditions**:
  - `context.inputs` 為空物件（無 `'default'` 亦無 `'main-input'`）
- **Steps**:
  1. 呼叫 LookupExecutor.execute(context)
- **Expected Result**:
  - 拋出例外，message = `Lookup 節點缺少主資料流輸入（main-input）`

---

### TS-F043-056: 主資料集 matchColumn 不存在時節點標記 failed

- **Related Requirement**: F043 AC-23 / US-058 AC-6 / US-058 TC-058-06
- **Test Type**: 負向
- **測試層次**: 單元測試
- **Preconditions**:
  - `context.inputs['default']` = lookupMainRows（欄位：ID, NAME, CUST_TYPE）
  - `context.inputs['lookup-input']` = lookupRefRows
  - 節點設定 matchColumn = 'NONEXISTENT_COL'（不存在於主資料集）
- **Steps**:
  1. 執行 LookupExecutor
- **Expected Result**:
  - 拋出例外，message 包含 `NONEXISTENT_COL` 與「主資料集」說明

---

### TS-F043-057: 對照資料集 lookupMatchColumn 不存在時節點標記 failed

- **Related Requirement**: F043 AC-23 / US-058 AC-6
- **Test Type**: 負向
- **測試層次**: 單元測試
- **Preconditions**:
  - `context.inputs['default']` = lookupMainRows
  - `context.inputs['lookup-input']` = lookupRefRows（欄位：CODE, CODE_DESC, CODE_CATEGORY）
  - 節點設定 lookupMatchColumn = 'NONEXISTENT_REF_COL'（不存在於對照資料集）
- **Steps**:
  1. 執行 LookupExecutor
- **Expected Result**:
  - 拋出例外，message 包含 `NONEXISTENT_REF_COL` 與「對照資料集」說明

---

### TS-F043-058: 扇出場景 — 同一 Extract 接多個 Filter 各接不同 Lookup 節點

- **Related Requirement**: F029 AC-7b（扇出支援）/ F043 Section 4.8 扇出
- **Test Type**: 整合
- **測試層次**: 整合測試（需 F042 ExecutionEngine 框架支援）
- **Preconditions**:
  - Pipeline 定義包含：
    - 1 個 Extract 節點（node-ext）
    - 3 個 Filter Transform 節點（filter-1, filter-2, filter-3）分別連接 Extract 輸出
    - 3 個 Lookup 節點（lookup-1, lookup-2, lookup-3），各自的 `lookup-input` 分別連接對應 Filter
  - Edges：
    - `{source: 'node-ext', target: 'filter-1'}`
    - `{source: 'node-ext', target: 'filter-2'}`
    - `{source: 'node-ext', target: 'filter-3'}`
    - `{source: 'filter-1', target: 'lookup-1', targetHandle: 'lookup-input'}`
    - `{source: 'filter-2', target: 'lookup-2', targetHandle: 'lookup-input'}`
    - `{source: 'filter-3', target: 'lookup-3', targetHandle: 'lookup-input'}`
  - 每個 Lookup 節點也各有一條 `default` 輸入（主資料流）
- **Steps**:
  1. 透過 F042 ExecutionEngine 執行完整 Pipeline
- **Expected Result**:
  - 三個 Lookup 節點均各自正確取得對應 Filter 的輸出作為 `lookup-input`
  - 三個 Lookup 節點各自完成 LEFT JOIN，輸出互相獨立
  - node_logs 中三個 Lookup 節點均記錄 `status='completed'`
  - 節點 status 標記為 `'completed'`，不拋出錯誤
