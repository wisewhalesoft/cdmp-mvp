---
spec-id: F043
title: ETL 節點執行器
feature-id: F043
source-story: US-056, US-057
epic: E05
priority: P0-MVP
version: "1.0"
date: 2026-03-27
status: Draft
---

# F043: ETL 節點執行器

Priority: P0-MVP | Status: Draft | Last Updated: 2026-03-27

## 1. 功能摘要

定義 ETL Pipeline 中 7 種節點處理器（NodeExecutor）的業務邏輯：`raw_data_extract`、`merge`、`dedup`、`type_cast`、`derived_field`、`field_mapping`、`conditional`。每種處理器實作 `NodeExecutor` 介面（定義於 [F042](F042-etl-execution-engine.md)），接收 `NodeExecutionContext` 並回傳 `DataSet`。

第 8 種節點 `target_load` 因涉及資料庫 UPSERT 與追蹤欄位填充，獨立定義於 [F044](F044-etl-target-load.md)。

## 2. 前置條件

- F042（執行引擎核心框架）已完成，提供 `NodeExecutor` 介面、`NodeExecutionContext`、`DataSet` 型別
- Pipeline 定義中各節點的 `data` 屬性包含該節點類型所需的設定參數

## 3. 共用介面（引用自 F042）

```typescript
interface DataSet {
  rows: Record<string, unknown>[];
  rowCount: number;
}

interface NodeExecutionContext {
  node: PipelineNode;
  inputs: Record<string, DataSet>;
  pipelineId: string;
  logId: string;
  isTestRun: boolean;
  queryRunner: QueryRunner;
}

interface NodeExecutor {
  readonly nodeType: string;
  execute(context: NodeExecutionContext): Promise<DataSet>;
}
```

## 4. 節點處理器規格

---

### 4.1 RawDataExtractExecutor (`raw_data_extract`)

**節點設定參數：**

```typescript
interface RawDataExtractConfig {
  nodeType: 'raw_data_extract';
  label: string;
  rawTable: string;       // 原始資料表名稱（如 'raw_101f6b3e'）
  subtitle?: string;
}
```

**處理邏輯：**

1. 驗證 `data.rawTable` 是否存在於資料庫中
2. 透過 `queryRunner` 執行 `SELECT * FROM {rawTable}`
3. 支援分批讀取（batch size 由引擎設定決定，預設 10,000 筆）
4. 將所有批次合併為單一 DataSet 回傳

**輸入：** 無（根節點，`inputs` 為空物件）

**輸出：** `DataSet`，包含該 raw table 的所有欄位與所有資料列

**錯誤處理：**

| 錯誤情境 | errorMessage |
|---------|-------------|
| rawTable 不存在 | `原始資料表 {rawTable} 不存在` |
| 資料庫查詢失敗 | `原始資料表 {rawTable} 讀取失敗：{error}` |

**Seed Pipeline 中的實例：**

| 節點 ID | rawTable | 說明 |
|---------|----------|------|
| e1 | raw_101f6b3e | [和潤]ZZIP 客戶主檔 |
| e2 | raw_35d85504 | [和勁]ZZIP 客戶主檔 |
| e3 | raw_1138803c | [和潤]MLMC 企金客戶主檔 |
| e4 | raw_aec93e7c | [和勁]MLMC 企金客戶主檔 |
| e5 | raw_50172f04 | [興業]MLMC 客戶主檔 |

---

### 4.2 MergeExecutor (`merge`)

**節點設定參數：**

```typescript
interface MergeConfig {
  nodeType: 'merge';
  label: string;
  joinType: 'FULL';          // MVP 僅支援 FULL OUTER JOIN
  conditions: MergeCondition[];
  subtitle?: string;
}

interface MergeCondition {
  leftColumn: string;
  rightColumn: string;
  operator: '=';             // MVP 僅支援等值 JOIN
}
```

**處理邏輯：**

1. 從 `context.inputs['left-input']` 取得左側 DataSet
2. 從 `context.inputs['right-input']` 取得右側 DataSet
3. 以 `conditions[0].leftColumn` 與 `conditions[0].rightColumn` 為 JOIN key
4. 建立右側的 lookup Map（key → rows 陣列，處理一對多）
5. 執行 FULL OUTER JOIN：
   - 遍歷左側每列，查找右側匹配列
   - 匹配成功：合併兩列，標記右側該 key 已被匹配
   - 左側無匹配：左側欄位保留值，右側欄位全為 null
   - 右側無匹配（遍歷結束後未被匹配的右側列）：左側欄位全為 null，右側欄位保留值

**欄位命名規則：**

```
- 左側欄位：保留原始名稱（不加前綴）
- 右側欄位：
  - 若與左側欄位同名：加 '_right' 後綴（如 CUSTO_NO → CUSTO_NO_right）
  - 若與左側欄位不同名：保留原始名稱
- JOIN key 欄位：合併後只保留一個（取非 null 者，若皆非 null 以左側為主）
```

**特殊規則 — JOIN key 處理：**

- `conditions` 中的 `leftColumn` 與 `rightColumn` 若同名（如 m1 的 `CUSTO_NO = CUSTO_NO`），合併後僅保留一個欄位，值為 `left[key] ?? right[key]`
- 不產生 `{key}_right` 欄位

**輸入：** `{ 'left-input': DataSet, 'right-input': DataSet }`

**輸出：** `DataSet`，rowCount = FULL JOIN 聯集結果數

**錯誤處理：**

| 錯誤情境 | errorMessage |
|---------|-------------|
| 左側輸入缺失 | `Merge 節點缺少左側輸入（left-input）` |
| 右側輸入缺失 | `Merge 節點缺少右側輸入（right-input）` |
| JOIN key 欄位不存在 | `Merge 節點 JOIN key 欄位 {column} 不存在於{側}資料集中` |

**Seed Pipeline 中的實例：**

| 節點 ID | 左側 | 右側 | JOIN key | 說明 |
|---------|------|------|----------|------|
| m1 | e1 | e2 | CUSTO_NO = CUSTO_NO | ZZIP 合併 |
| m2 | e3 | e4 | CUSTID = CUSTID | MLMC 合併 1 |
| m3 | m2 | e5 | CUSTID = CUSTID | MLMC 合併 2 |
| m4 | fm1 | fm2 | source_customer_no = source_customer_no | 最終合併 |

---

### 4.3 DedupExecutor (`dedup`)

**節點設定參數：**

```typescript
interface DedupConfig {
  nodeType: 'dedup';
  label: string;
  keyColumns: string[];                    // 分組 key 欄位
  keepStrategy: 'latest_timestamp';        // MVP 僅支援此策略
  timestampColumn: string;                 // 用於比較的時間戳欄位
  subtitle?: string;
}
```

**處理邏輯：**

1. 從 `context.inputs['default']` 取得輸入 DataSet
2. 以 `keyColumns` 的組合值為 key，將資料列分組
3. 每組內依 `timestampColumn` 降冪排序
4. 每組保留排序後的第一筆（即 `timestampColumn` 最大者）
5. 若同組中多筆 `timestampColumn` 值相同，保留原始陣列中 index 最小者
6. `timestampColumn` 值為 null 視為最小值（排在最後，不被保留）

**輸入：** `{ default: DataSet }`

**輸出：** `DataSet`，rowCount ≤ 輸入 rowCount

**錯誤處理：**

| 錯誤情境 | errorMessage |
|---------|-------------|
| keyColumns 欄位不存在於資料中 | `Dedup 節點 key 欄位 {column} 不存在於資料集中` |
| timestampColumn 不存在 | `Dedup 節點時間戳欄位 {column} 不存在於資料集中` |

**Seed Pipeline 中的實例：**

| 節點 ID | keyColumns | timestampColumn | 說明 |
|---------|-----------|----------------|------|
| d1 | ["CUSTO_NO"] | UPDATE_DATE | ZZIP 去重 |
| d2 | ["CUSTID"] | U_SYSDT | MLMC 去重 |

---

### 4.4 TypeCastExecutor (`type_cast`)

**節點設定參數：**

```typescript
interface TypeCastConfig {
  nodeType: 'type_cast';
  label: string;
  castRules: CastRule[];
  subtitle?: string;
}

interface CastRule {
  column: string;
  sourceType: 'VARCHAR';
  targetType: 'DECIMAL' | 'INTEGER' | 'DATE';
}
```

**處理邏輯：**

1. 從 `context.inputs['default']` 取得輸入 DataSet
2. 對每列資料，逐條 `castRules` 套用轉換
3. 轉換邏輯：

| sourceType | targetType | 轉換邏輯 | 失敗處理 |
|------------|------------|---------|---------|
| VARCHAR | DECIMAL | `parseFloat(String(value))` | `NaN` → `null` |
| VARCHAR | INTEGER | `parseInt(String(value), 10)` | `NaN` → `null` |
| VARCHAR | DATE | `new Date(String(value))` | Invalid Date → `null` |

4. 轉換後的值替換原始欄位值（欄位名稱不變）
5. 值為 `null` 或 `undefined` 時，直接跳過轉換，保持 `null`

**輸入：** `{ default: DataSet }`

**輸出：** `DataSet`，rowCount 與輸入相同

**錯誤處理：**

| 錯誤情境 | errorMessage |
|---------|-------------|
| 不支援的轉換組合（如 INTEGER → VARCHAR） | `不支援的型別轉換：{sourceType} → {targetType}` |
| column 不存在 | 靜默跳過（不拋出錯誤），該欄位維持 null |

**Seed Pipeline 中的實例：**

| 節點 ID | castRules | 說明 |
|---------|----------|------|
| tc1 | CUSTNOWCAPTIAL: VARCHAR→DECIMAL, CUSTCREATECAPTIAL: VARCHAR→DECIMAL | MLMC 型別轉換 |

---

### 4.5 DerivedFieldExecutor (`derived_field`)

**節點設定參數：**

```typescript
interface DerivedFieldConfig {
  nodeType: 'derived_field';
  label: string;
  expressions: DerivedExpression[];
  subtitle?: string;
}

interface DerivedExpression {
  outputColumn: string;
  expression: string;        // 表達式字串
  outputType: 'VARCHAR';     // MVP 輸出類型
}
```

**支援的表達式函數：**

| 函數 | 語法範例 | 處理邏輯 |
|------|---------|---------|
| `mergePhone` | `mergePhone(CAREA_NO1, CTEL_NO1)` 或 `mergePhone(CAREA_NO1, CTEL_NO1, CEXTEN_NO1)` | 讀取列中指定欄位值，有分機時組合為 `{area}-{tel}#{exten}`，無分機時組合為 `{area}-{tel}`；分機為 null、空字串或全零時不附加 `#exten`；佔位值條件成立時回傳 null |
| `padStart` | `padStart(CUTYPE, 2, '0')` | 讀取列中指定欄位值，執行 `String(value).padStart(length, char)` |
| `gen_random_uuid` | `gen_random_uuid()` | 產生 UUID v4 字串（使用 `crypto.randomUUID()` 或等效實作） |
| `CASE WHEN...` | `CASE WHEN left.{col} IS NOT NULL THEN '{val}' ELSE '{val}' END` | SQL-like 條件表達式，依序評估 WHEN 子句 |

**表達式解析規則：**

1. 以正則表達式識別函數名稱與參數
2. `mergePhone(col1, col2)` 或 `mergePhone(col1, col2, col3)` — 解析出兩或三個欄位名稱，從資料列中取值；第三參數（分機）為選用
3. `padStart(col, length, char)` — 解析出欄位名稱、長度（number）、填充字元（string）
4. `gen_random_uuid()` — 無參數，直接產生 UUID
5. `CASE WHEN ... END` — 解析 WHEN/THEN/ELSE 子句

**CASE WHEN 子句支援的條件語法：**

| 語法 | 評估邏輯 |
|------|---------|
| `left.{col} IS NOT NULL AND right.{col} IS NOT NULL` | 兩個欄位均非 null |
| `left.{col} IS NOT NULL` | 欄位值非 null |
| `right.{col} IS NOT NULL` | 欄位值非 null |

- `left.{col}` 解析為資料列中名為 `{col}` 的欄位
- `right.{col}` 解析為資料列中名為 `{col}_right` 的欄位（若存在），否則嘗試 `{col}`

**CASE WHEN 的 THEN/ELSE 值語法：**

| 語法 | 評估邏輯 |
|------|---------|
| `left.{col}` | 取資料列中 `{col}` 欄位值 |
| `right.{col}` | 取資料列中 `{col}_right` 欄位值（若存在），否則 `{col}` |
| `'{literal}'` | 固定字串常量 |

**mergePhone 佔位值過濾規則（輸出 null 的條件）：**

- 合併結果為 `00-0000000000`
- 區碼為空字串、null、或全零
- 電話號碼為空字串、null、或全零
- 區碼與號碼均為全零（如 `000`, `0000000`）

**輸入：** `{ default: DataSet }`

**輸出：** `DataSet`，包含所有原有欄位加上 `outputColumn` 欄位。rowCount 與輸入相同。

**錯誤處理：**

| 錯誤情境 | 處理方式 |
|---------|---------|
| 表達式參照的欄位不存在 | 該列的 `outputColumn` 設為 null（不拋出錯誤） |
| 不支援的表達式函數 | 節點標記為 `'failed'`，errorMessage 為「不支援的表達式函數：{function}」 |

**Seed Pipeline 中的實例：**

| 節點 ID | expressions 摘要 | 說明 |
|---------|-----------------|------|
| df1 | mergePhone × 3（home_phone, contact_phone, office_phone，含分機） | ZZIP 電話合併（含分機） |
| df2 | padStart(CUTYPE, 2, '0') + mergePhone × 4（BUSINESSTTELCODE/BUSINESSTTEL→office_phone, CUSTTELCODE/CUSTTEL→registered_phone, CUSTFAXCODE/CUSTFAX→registered_fax, BUSINESSFAXCODE/BUSINESSFAX→business_fax） | MLMC 類型轉換 + 4 組電話/傳真合併（5 個表達式） |
| df3 | CASE WHEN（data_source） + gen_random_uuid（customer_id） | 資料來源標記 + UUID 生成 |

---

### 4.6 FieldMappingExecutor (`field_mapping`)

**節點設定參數：**

```typescript
interface FieldMappingConfig {
  nodeType: 'field_mapping';
  label: string;
  dropUnmapped: boolean;
  mappings: FieldMapping[];
  subtitle?: string;
}

interface FieldMapping {
  sourceColumn: string;
  targetColumn: string;
  defaultValue: unknown | null;
}
```

**處理邏輯：**

1. 從 `context.inputs['default']` 取得輸入 DataSet
2. 對每列資料，依 `mappings` 建立新的輸出列：
   - 若 `sourceColumn` 存在於資料列中：將其值複製到 `targetColumn`
   - 若 `sourceColumn` 不存在且 `defaultValue` 非 null：以 `defaultValue` 填入
   - 若 `sourceColumn` 不存在且 `defaultValue` 為 null：`targetColumn` 設為 null
3. 若 `dropUnmapped === true`：輸出列僅包含 `mappings` 中定義的 `targetColumn` 欄位
4. 若 `dropUnmapped === false`：保留所有原始欄位，並新增/覆蓋 `targetColumn` 欄位

**輸入：** `{ default: DataSet }`

**輸出：** `DataSet`，rowCount 與輸入相同

**錯誤處理：**

| 錯誤情境 | 處理方式 |
|---------|---------|
| sourceColumn 不存在 | 靜默處理：以 defaultValue 或 null 填入（不拋出錯誤） |
| mappings 為空陣列 | 若 dropUnmapped=true，輸出空列（每列 0 個欄位） |

**Seed Pipeline 中的實例：**

| 節點 ID | mappings 數量 | dropUnmapped | 說明 |
|---------|--------------|-------------|------|
| fm1 | 48 | true | ZZIP 映射（來源→customer_core 欄位） |
| fm2 | 37 | true | MLMC 映射（來源→customer_core 欄位） |

---

### 4.7 ConditionalExecutor (`conditional`)

**節點設定參數：**

```typescript
interface ConditionalConfig {
  nodeType: 'conditional';
  label: string;
  rules: ConditionalRule[];
  subtitle?: string;
}

interface ConditionalRule {
  targetColumn: string;
  conditions: ConditionalCondition[];
  elseValue: string;           // 欄位參照或字串常量
}

interface ConditionalCondition {
  when: string;                // 條件表達式
  then: string;                // 欄位參照或字串常量
}
```

**處理邏輯：**

1. 從 `context.inputs['default']` 取得輸入 DataSet
2. 對每列資料，逐條 `rules` 處理：
   a. 逐一評估 `conditions[i].when` 表達式
   b. 第一個成立的 `conditions[i].then` 即為 `targetColumn` 的值
   c. 若無任何 when 成立，使用 `elseValue`
3. 以 rules 的 `targetColumn` 值覆蓋輸入列中對應欄位

**when 表達式解析：**

| 語法 | 評估邏輯 |
|------|---------|
| `left.{col} >= right.{col}` | 比較 `row[col]` 與 `row[col + '_right']` 的值（字串比較，適用於 TIMESTAMP 格式） |
| `left.{col} IS NOT NULL` | `row[col] !== null && row[col] !== undefined` |
| `right.{col} IS NOT NULL` | `row[col + '_right'] !== null && row[col + '_right'] !== undefined` |

**null 安全規則：**

- `>=` 比較中，任一方為 null 則條件不成立
- `IS NOT NULL` 嚴格檢查 null 與 undefined

**then / elseValue 解析：**

| 語法 | 評估邏輯 |
|------|---------|
| `left.{col}` | 取 `row[col]` 的值 |
| `right.{col}` | 取 `row[col + '_right']` 的值 |
| `'{literal}'` | 固定字串常量（去除引號） |

**left. / right. 欄位對應規則：**

- `left.{col}` → 對應資料列中的 `{col}` 欄位（ZZIP 路線 / 左側 merge 來源）
- `right.{col}` → 對應資料列中的 `{col}_right` 欄位（MLMC 路線 / 右側 merge 來源）
- 此對應規則與 merge 節點的欄位命名規則一致

**輸入：** `{ default: DataSet }`

**輸出：** `DataSet`，rowCount 與輸入相同

**錯誤處理：**

| 錯誤情境 | 處理方式 |
|---------|---------|
| when 表達式參照的欄位不存在 | 該條件視為不成立 |
| then/elseValue 參照的欄位不存在 | 該 targetColumn 設為 null |
| 不支援的 when 語法 | 節點標記為 `'failed'`，errorMessage 為「不支援的條件語法：{when}」 |

**Seed Pipeline 中的實例：**

| 節點 ID | rules 數量 | 說明 |
|---------|-----------|------|
| cd1 | 5（name, mobile_phone, mailing_address, capital, office_phone） | 以 source_updated_at 較新者為準解決衝突 |

## 5. 節點間資料流概覽（Seed Pipeline）

```
e1(raw_101f6b3e) ──┐
                    ├─→ m1(FULL JOIN CUSTO_NO) → d1(dedup CUSTO_NO) → df1(mergePhone×3,含分機) → fm1(48 mappings)
e2(raw_35d85504) ──┘                                                                          │
                                                                                               ├─→ m4(FULL JOIN source_customer_no) → cd1(衝突解決×5) → df3(data_source + UUID) → tl1
e3(raw_1138803c) ──┐                                                                           │
                    ├─→ m2(FULL JOIN CUSTID) ──┐                                               │
e4(raw_aec93e7c) ──┘                           ├─→ m3(FULL JOIN CUSTID) → d2(dedup CUSTID) → tc1(VARCHAR→DECIMAL) → df2(padStart + mergePhone×4) → fm2(37 mappings)
                                               │
e5(raw_50172f04) ─────────────────────────────┘
```

## 6. 邊界情況

| 情境 | 節點類型 | 預期行為 |
|------|---------|---------|
| 輸入 DataSet 為空（rowCount = 0） | 全部 | 回傳空 DataSet，節點 status `'completed'` |
| merge 左右兩側均為空 | merge | 回傳空 DataSet |
| dedup 所有 key 唯一（無重複） | dedup | 回傳與輸入相同的 DataSet |
| type_cast 欄位值全為 null | type_cast | 全部保持 null，不拋錯 |
| derived_field 表達式欄位不存在 | derived_field | outputColumn 設為 null |
| field_mapping sourceColumn 不存在 | field_mapping | targetColumn 設為 null（或 defaultValue） |
| conditional 所有 when 都不成立 | conditional | 使用 elseValue |
| merge 一對多 JOIN（左側 key 對應右側多列） | merge | 產生多列結果（笛卡爾乘積） |

## 7. 驗收標準

### AC-1: raw_data_extract 正確讀取

- Given raw table 存在且有資料
- When 節點執行
- Then 輸出 DataSet 包含該表所有欄位與所有資料列
- And rowCount 與資料庫記錄數一致

### AC-2: raw_data_extract 表不存在

- Given rawTable 設定值在資料庫中不存在
- When 節點執行
- Then 節點 `'failed'`，errorMessage 為「原始資料表 {rawTable} 不存在」

### AC-3: merge FULL JOIN 正確合併

- Given left 100 列（key A~J 各 10 組），right 80 列（key F~O 各 8 組）
- When merge 節點執行 FULL JOIN
- Then 輸出 rowCount = 180；僅 F~J key 的列兩邊均有值

### AC-4: merge 欄位命名正確

- Given left 有欄位 CUSTO_NO, CUS_NAME；right 有欄位 CUSTO_NO, CUS_NAME, EXTRA
- When merge on CUSTO_NO 執行
- Then 輸出欄位為 CUSTO_NO, CUS_NAME, CUS_NAME_right, EXTRA

### AC-5: dedup 保留最新時間戳

- Given CUSTO_NO = "A001" 出現 3 次，UPDATE_DATE 分別為 2024-01-01、2024-03-01、2024-02-01
- When dedup 執行
- Then 僅保留 UPDATE_DATE = 2024-03-01 的一列

### AC-6: dedup null 時間戳排最後

- Given 同一 key 有兩列，timestampColumn 分別為 "2024-01-01" 和 null
- When dedup 執行
- Then 保留 "2024-01-01" 那列

### AC-7: type_cast VARCHAR→DECIMAL 正確轉換

- Given CUSTNOWCAPTIAL = "5000000"
- When type_cast 執行
- Then CUSTNOWCAPTIAL = 5000000（number 型別）

### AC-8: type_cast 非數字轉 null

- Given CUSTNOWCAPTIAL = "N/A"
- When type_cast 執行
- Then CUSTNOWCAPTIAL = null

### AC-9: mergePhone 正常合併

- Given CAREA_NO1 = "02", CTEL_NO1 = "27123456"（無分機）
- When derived_field 執行 `mergePhone(CAREA_NO1, CTEL_NO1)`
- Then home_phone = "02-27123456"

- Given CAREA_NO1 = "02", CTEL_NO1 = "27123456", CEXTEN_NO1 = "100"（有分機）
- When derived_field 執行 `mergePhone(CAREA_NO1, CTEL_NO1, CEXTEN_NO1)`
- Then home_phone = "02-27123456#100"

- Given CAREA_NO1 = "02", CTEL_NO1 = "27123456", CEXTEN_NO1 = "000"（分機全零）
- When derived_field 執行 `mergePhone(CAREA_NO1, CTEL_NO1, CEXTEN_NO1)`
- Then home_phone = "02-27123456"（全零分機不附加）

### AC-10: mergePhone 佔位值過濾

- Given CAREA_NO1 = "00", CTEL_NO1 = "0000000000"
- When derived_field 執行 `mergePhone(CAREA_NO1, CTEL_NO1)`
- Then home_phone = null

### AC-11: padStart 字串補零

- Given CUTYPE = "1"
- When derived_field 執行 `padStart(CUTYPE, 2, '0')`
- Then customer_type_mapped = "01"

### AC-12: gen_random_uuid 產生唯一 UUID

- Given 對 1000 列資料執行 `gen_random_uuid()`
- When derived_field 執行
- Then 1000 列的 customer_id 均為合法 UUID v4，且互不重複

### AC-13: CASE WHEN 正確評估

- Given `left.source_customer_no` 非 null 且 `right.source_customer_no` 非 null
- When df3 執行 CASE WHEN 表達式
- Then data_source = "ZZIP_BAMCUST_M+MLMCUSTOMER"

### AC-14: field_mapping 正確重新命名

- Given 輸入含 CUSTO_NO: "A001", CUS_NAME: "王大明"
- When fm1 執行 mappings，dropUnmapped = true
- Then 輸出含 source_customer_no: "A001", name: "王大明"，不含原始欄位名稱

### AC-15: field_mapping 缺失欄位容錯

- Given mappings 中 sourceColumn = "home_phone" 但上游資料不含此欄位
- When fm1 執行
- Then 輸出列的 home_phone = null（不拋出例外）

### AC-16: conditional 選擇較新值

- Given source_updated_at = "2024-03-01", source_updated_at_right = "2024-01-01"
- When cd1 執行 rule（left >= right → left.name）
- Then 輸出 name = left 的 name 值

### AC-17: conditional null 安全

- Given source_updated_at = "2024-03-01", source_updated_at_right = null
- When cd1 執行 `left.source_updated_at >= right.source_updated_at`
- Then 條件不成立（null 安全），使用 elseValue

## 8. 相關文件

- 執行引擎框架：[F042-etl-execution-engine.md](F042-etl-execution-engine.md)
- Target Load：[F044-etl-target-load.md](F044-etl-target-load.md)
- 目標表定義：[F036-target-tables.md](F036-target-tables.md)
- 既有轉換函式：`apps/api/src/modules/etl/etl-transforms.ts`
- Pipeline 定義：`scripts/seed-pipeline-definition.json`
- 資料模型：[data-model.md](../data-model.md)
