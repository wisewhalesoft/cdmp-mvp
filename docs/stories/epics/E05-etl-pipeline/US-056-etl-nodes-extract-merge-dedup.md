# US-056：ETL 節點實作 — Extract、Merge、Dedup、TypeCast、DerivedField

> **Story ID**：US-056
> **Epic**：[E05 — ETL Pipeline 管理](epic-brief.md)
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：13

---

## User Story

**As a** Admin（管理者）
**I want** Extract / Merge / Dedup / TypeCast / DerivedField 五種節點能執行真正的轉換邏輯
**So that** raw data 能正確經過資料擷取、合併、去重、型別轉換與衍生欄位運算，產出乾淨的中間資料

---

## 背景

本 Story 涵蓋 Pipeline 前段（上游）五種節點的處理邏輯。這些節點負責資料的讀取、整合與初步清理，為後續的映射與載入準備正確的資料集。

**節點在 seed-pipeline 中的分佈：**
- `raw_data_extract`：e1, e2, e3, e4, e5（5 個）
- `merge`：m1, m2, m3, m4（4 個）
- `dedup`：d1, d2（2 個）
- `type_cast`：tc1（1 個）
- `derived_field`：df1, df2, df3（3 個）

---

## 驗收標準

### AC-1：raw_data_extract — 從 raw table 讀取資料

- **Given** 節點設定含有 `data.rawTable`（如 `raw_101f6b3e`）
- **When** 節點執行
- **Then** 引擎透過 TypeORM QueryRunner 以 `SELECT * FROM {rawTable}` 讀取全部資料，以批次方式（batch）載入記憶體
- **And** 輸出 DataSet 包含該表所有欄位與資料列
- **And** 若指定的 rawTable 不存在，節點標記為 `'failed'`，錯誤訊息為「原始資料表 {rawTable} 不存在」

### AC-2：merge — FULL OUTER JOIN 合併兩路資料集

- **Given** 節點設定含有 `joinType: "FULL"`、`conditions`（join keys）、兩路上游輸入（left DataSet、right DataSet）
- **When** 節點執行
- **Then** 引擎在記憶體中執行 FULL OUTER JOIN：
  - 以 `conditions` 中的欄位為 key，建立兩路的 lookup Map
  - 合併規則：
    - 兩路都有符合 key 的列：產生一列，left 欄位保留（加前綴 `left.`）、right 欄位保留（加前綴 `right.`），衝突欄位以前綴區分
    - 只有 left 有的列：right 欄位全為 null
    - 只有 right 有的列：left 欄位全為 null
- **And** 輸出 DataSet 的 rowCount 等於 FULL JOIN 後的聯集結果數
- **And** 若 join key 欄位在 left 或 right DataSet 中不存在，節點標記為 `'failed'`

**欄位命名規則（merge 節點後）：**

```
左側欄位：原欄位名稱（不加前綴，直接保留）
右側欄位：若與左側同名，加 `_right` 後綴；否則直接保留
```

> 注意：seed-pipeline 中的 merge 節點後緊跟 dedup，dedup 直接使用 `CUSTO_NO` 或 `CUSTID` 作為 keyColumn，代表 merge 後的欄位名稱應保持原始名稱（不加前綴），僅在衝突時加後綴。

### AC-3：dedup — 依 key 欄位去重

- **Given** 節點設定含有 `keyColumns`（如 `["CUSTO_NO"]`）、`keepStrategy: "latest_timestamp"`、`timestampColumn`（如 `"UPDATE_DATE"`）
- **When** 節點執行
- **Then** 引擎在記憶體中以 `keyColumns` 分組，每組保留 `timestampColumn` 值最大的一列
- **And** 若同一 key 的多列 `timestampColumn` 值相同，保留陣列中第一筆（index 最小）
- **And** 若 `timestampColumn` 值為 null，視為最舊（排在最後，不被保留）
- **And** 輸出 DataSet 的 rowCount ≤ 輸入 rowCount

### AC-4：type_cast — 欄位型別轉換

- **Given** 節點設定含有 `castRules`，每條規則包含 `column`、`sourceType`、`targetType`
- **When** 節點執行
- **Then** 對每列資料，引擎逐欄套用轉換規則：

  | sourceType | targetType | 轉換邏輯 |
  |------------|------------|---------|
  | VARCHAR | DECIMAL | `parseFloat(value)`，無法轉換（非數字字串）則設為 null |
  | VARCHAR | INTEGER | `parseInt(value, 10)`，無法轉換則設為 null |
  | VARCHAR | DATE | `new Date(value)`，無效日期則設為 null |
  | 其他組合 | — | 節點標記為 `'failed'`，錯誤訊息說明不支援的轉換組合 |

- **And** 轉換後的欄位值替換原始欄位值（欄位名稱不變）
- **And** 輸出 DataSet 的 rowCount 與輸入相同

### AC-5：derived_field — 執行表達式產生新欄位

- **Given** 節點設定含有 `expressions`，每條包含 `outputColumn`、`expression`、`outputType`
- **When** 節點執行
- **Then** 引擎對每列資料逐一執行表達式，將結果寫入 `outputColumn`（若欄位已存在則覆蓋）

**支援的表達式函數：**

| 函數 | 語法 | 邏輯說明 |
|------|------|---------|
| `mergePhone` | `mergePhone(areaCol, telCol)` | 讀取列中 `areaCol` 與 `telCol` 的值，組合為 `{area}-{tel}` 格式；若合併結果為佔位值（如 `00-0000000000`、區碼為空、號碼為空），輸出 null |
| `padStart` | `padStart(col, length, char)` | 讀取列中 `col` 欄位的值，等同 JS `String(value).padStart(length, char)` |
| `gen_random_uuid` | `gen_random_uuid()` | 產生 UUID v4 字串 |
| `CASE WHEN ... THEN ... ELSE ...` | SQL-like CASE 語法 | 支援 `WHEN left.{col} IS NOT NULL AND right.{col} IS NOT NULL THEN '{val}' WHEN left.{col} IS NOT NULL THEN '{val}' ELSE '{val}'` 語法；`left.` / `right.` 前綴對應列中的欄位名稱 |

**佔位值定義（mergePhone 輸出 null 的條件）：**

- 合併結果為 `00-0000000000`
- 區碼為空字串或 null
- 電話號碼為空字串或 null
- 區碼與號碼均為全零（如 `000`, `0000000`）

- **And** 輸出 DataSet 包含所有原有欄位加上新增的 `outputColumn` 欄位
- **And** 若表達式參照的欄位不存在於資料列中，該列的 `outputColumn` 設為 null（不拋出錯誤）

---

## 技術備註

### raw_data_extract 與批次讀取

由於 `raw_101f6b3e` 約有 210 萬筆，不可一次 `SELECT *` 全部載入記憶體。批次讀取策略定義於 US-058，本 Story 只需確保 raw_data_extract 節點**支援分批取回資料**，並最終將所有資料合為一個 DataSet 傳入下游（或以 streaming 方式逐批傳遞，實作細節由 US-058 決定）。

### merge 節點的 JOIN key 衝突處理

seed-pipeline 中的 m1（合併 e1、e2）條件為：
```
leftColumn: "CUSTO_NO", rightColumn: "CUSTO_NO"
```

兩邊都有 `CUSTO_NO`，merge 後只保留一個 `CUSTO_NO`（取非 null 者，若皆非 null 以 left 為主）。這符合 dedup 節點後直接使用 `CUSTO_NO` 作為 keyColumn 的需求。

### derived_field — df3 的 CASE 表達式

df3 中的 `data_source` 表達式語法：
```
CASE WHEN left.source_customer_no IS NOT NULL AND right.source_customer_no IS NOT NULL
     THEN 'ZZIP_BAMCUST_M+MLMCUSTOMER'
     WHEN left.source_customer_no IS NOT NULL
     THEN 'ZZIP_BAMCUST_M'
     ELSE 'MLMCUSTOMER' END
```

此表達式在 merge m4 之後的資料列中執行。`left.source_customer_no` 與 `right.source_customer_no` 分別對應 ZZIP 路線（fm1 輸出）與 MLMC 路線（fm2 輸出）的欄位，需依照 merge 後的欄位命名規則正確解析。

---

## 測試案例

### TC-056-01：raw_data_extract 讀取正確筆數

- **Given**：`raw_101f6b3e` 表有 2,100,000 筆資料
- **When**：e1 節點執行
- **Then**：輸出 DataSet 的 rowCount = 2,100,000

### TC-056-02：merge FULL JOIN 結果驗證

- **Given**：left DataSet 有 100 列（key 值 A~J 各 10 組），right DataSet 有 80 列（key 值 F~O 各 8 組）
- **When**：m1（FULL JOIN on CUSTO_NO）執行
- **Then**：輸出 rowCount = 180（左有右無 + 右有左無 + 兩邊皆有的聯集）；僅 F~J key 的列兩邊均有值

### TC-056-03：dedup 保留最新時間戳

- **Given**：CUSTO_NO = "A001" 出現 3 次，UPDATE_DATE 分別為 2024-01-01、2024-03-01、2024-02-01
- **When**：d1 節點執行
- **Then**：輸出只保留 UPDATE_DATE = 2024-03-01 的那一列

### TC-056-04：type_cast VARCHAR 轉 DECIMAL

- **Given**：列中 CUSTNOWCAPTIAL = "5000000"
- **When**：tc1 節點執行
- **Then**：輸出列中 CUSTNOWCAPTIAL = 5000000（數字型別）

### TC-056-05：type_cast 非數字字串轉 DECIMAL

- **Given**：列中 CUSTNOWCAPTIAL = "N/A"
- **When**：tc1 節點執行
- **Then**：輸出列中 CUSTNOWCAPTIAL = null（不拋出例外）

### TC-056-06：mergePhone 正常合併

- **Given**：列中 CAREA_NO1 = "02"，CTEL_NO1 = "27123456"
- **When**：df1 執行 `mergePhone(CAREA_NO1, CTEL_NO1)`
- **Then**：home_phone = "02-27123456"

### TC-056-07：mergePhone 佔位值過濾

- **Given**：列中 CAREA_NO1 = "00"，CTEL_NO1 = "0000000000"
- **When**：df1 執行 `mergePhone(CAREA_NO1, CTEL_NO1)`
- **Then**：home_phone = null

### TC-056-08：padStart 字串補零

- **Given**：列中 CUTYPE = "1"
- **When**：df2 執行 `padStart(CUTYPE, 2, '0')`
- **Then**：customer_type_mapped = "01"

### TC-056-09：gen_random_uuid 產生 UUID

- **Given**：df3 節點執行 `gen_random_uuid()`
- **When**：對 1000 列資料執行
- **Then**：1000 列的 customer_id 均為合法 UUID v4，且互不重複

---

## 依賴關係

- **Blocked By**：US-055（需要執行引擎框架、DataSet 介面、nodeOutputMap）
- **Blocks**：US-057（FieldMapping 與 Conditional 依賴 Extract → Merge → Dedup → DerivedField 的輸出）
- **Blocks**：US-058（批次策略依賴 raw_data_extract 的讀取介面）

---

## Definition of Done

- [ ] raw_data_extract 節點實作完成，支援從 raw table 讀取資料
- [ ] merge 節點（FULL OUTER JOIN）記憶體內實作完成
- [ ] dedup 節點（latest_timestamp 策略）實作完成
- [ ] type_cast 節點（VARCHAR → DECIMAL / INTEGER / DATE）實作完成
- [ ] derived_field 節點實作完成，支援 mergePhone / padStart / gen_random_uuid / CASE WHEN
- [ ] mergePhone 佔位值過濾邏輯正確
- [ ] 各節點單元測試完成，覆蓋正常路徑與邊界情況
- [ ] 以 seed-pipeline-definition.json 執行時，前 15 個節點（e1~fm2）全部 completed，無 failed

---

## 相關文件

- **Epic Brief**：[E05 Epic Brief](epic-brief.md)
- **Pipeline 定義**：`scripts/seed-pipeline-definition.json`
- **目標表 Schema**：`apps/api/src/modules/etl/target-table-schemas.ts`
- **ETL 轉換規則**：`docs/specs/features/F036-target-tables.md`（第 12 節）
- **相關 Stories**：US-055（框架）、US-057（FieldMapping / Conditional / TargetLoad）、US-058（批次策略）
