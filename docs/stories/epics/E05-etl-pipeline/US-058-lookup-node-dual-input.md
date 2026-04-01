# US-058：Lookup 節點雙輸入重設計

> **Story ID**：US-058
> **Epic**：[E05 — ETL Pipeline 管理](epic-brief.md)
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：5

---

## User Story

**As a** Admin（管理者）
**I want** 在 Pipeline 中將 Lookup（查找）節點的對照來源直接連接至上游節點
**So that** 對照表的來源一目了然、可視覺化追溯，並可透過上游 Filter 節點彈性預篩對照資料，無需在 Lookup 節點內手動輸入 raw table 名稱與過濾條件

---

## 背景

### 現有設計問題

原 Lookup 節點為單輸入設計，對照來源透過屬性面板中的 `lookupSource`（raw table 名稱字串，如 `raw_e5a2345c`）與 `lookupFilter`（SQL 過濾條件字串，如 `TBL_ID = 'A2'`）手動指定。此設計造成：

1. 使用者需記憶 raw table 名稱，無法從畫布視覺化追溯對照來源
2. 過濾邏輯內嵌在節點屬性中，無法複用、不易維護
3. 與 Merge（合併）節點的雙輸入設計不一致，增加學習門檻

### 新設計方案

比照 Merge 節點的雙輸入架構，Lookup 節點新增第二個輸入端口：

| 端口名稱 | handle 識別碼 | 說明 |
|---------|--------------|------|
| 主資料流 | `main-input`（或 default，保持向下相容） | 原有主資料流，與現有相同 |
| 對照來源 | `lookup-input` | 新增，對照表資料流入點 |

Pipeline Runner 的 `collectInputs()` 已透過 `edge.targetHandle ?? 'default'` 進行 key-value 路由，後端無需修改路由邏輯，只需在 LookupHandler 中按 handle 名稱讀取對應 DataSet。

---

## 驗收標準

### AC-1：雙輸入模式 — 從 lookup-input 讀取對照資料

- **Given** Lookup 節點的 `inputs` 中同時包含 `main-input`（或 `default`）與 `lookup-input` 兩個 DataSet
- **When** LookupHandler 執行
- **Then** 引擎以 `inputs["lookup-input"]` 作為對照資料集（不再查詢資料庫取得 raw table）
- **And** 引擎以 `inputs["main-input"] ?? inputs["default"]` 作為主資料集
- **And** 忽略節點設定中的 `lookupSource` 與 `lookupFilter` 欄位（雙輸入模式不適用）

### AC-2：雙輸入模式 — JOIN 邏輯執行

- **Given** 主資料集與對照資料集均已讀取，節點設定含有 `matchColumn`（主資料集比對欄位）、`lookupMatchColumn`（對照資料集比對欄位）、`outputColumns`（從對照資料集輸出的欄位清單）
- **When** LookupHandler 執行 JOIN 邏輯
- **Then** 引擎以 `lookupMatchColumn` 為 key 對對照資料集建立 lookup Map
- **And** 對主資料集每一列，以 `matchColumn` 的值查找 lookup Map 取得對照列
- **And** 將 `outputColumns` 中指定的欄位從對照列複製至主資料列（欄位不存在時補 null）
- **And** 主資料集中無對應對照列的資料行保留原始欄位，`outputColumns` 欄位補 null
- **And** 輸出 DataSet 的 rowCount 與主資料集相同（LEFT JOIN 語意）

### AC-3：向下相容 — 單輸入模式（僅 main-input）

- **Given** Lookup 節點的 `inputs` 中**只有** `main-input`（或 `default`），**沒有** `lookup-input`
- **When** LookupHandler 執行
- **Then** 引擎退回使用 `lookupSource`（raw table 名稱）與 `lookupFilter`（過濾條件）從資料庫查詢對照資料
- **And** 後續 JOIN 邏輯與雙輸入模式相同（AC-2 相同）
- **And** 此路徑確保所有使用舊版 Pipeline 定義的 Lookup 節點不受影響

### AC-4：向下相容 — 舊版 Pipeline 定義可正常執行

- **Given** 資料庫中存有使用舊版 Lookup 節點定義的 Pipeline（定義中無 `lookup-input` edge，但含有 `lookupSource` 與 `lookupFilter`）
- **When** 執行該 Pipeline
- **Then** LookupHandler 自動以單輸入模式執行，不拋出錯誤，結果與重設計前相同

### AC-5：缺少必要輸入時的錯誤處理

- **Given** Lookup 節點的 `inputs` 中無 `main-input` 且無 `default`（主資料流缺失）
- **When** LookupHandler 執行
- **Then** 節點標記為 `'failed'`，錯誤訊息為「Lookup 節點缺少主資料流輸入（main-input）」
- **And** Pipeline 執行終止並記錄錯誤至 node_logs

### AC-6：雙輸入模式 — 比對欄位不存在的錯誤處理

- **Given** 節點設定的 `matchColumn` 在主資料集中不存在，或 `lookupMatchColumn` 在對照資料集中不存在
- **When** LookupHandler 執行
- **Then** 節點標記為 `'failed'`，錯誤訊息說明缺少的欄位名稱與所屬資料集
- **And** Pipeline 執行終止並記錄錯誤至 node_logs

---

## Technical Notes

### Pipeline Runner 路由機制（已支援，無需修改）

`pipeline-runner.ts` 的 `collectInputs()` 已實作：

```typescript
// edge.targetHandle ?? 'default' 作為 inputs 的 key
inputs[edge.targetHandle ?? 'default'] = nodeOutputMap.get(edge.source)
```

因此：
- 連接至 Lookup 節點主端口的 edge（`targetHandle` 未設定或為 `"main-input"`）→ `inputs["main-input"]` 或 `inputs["default"]`
- 連接至 Lookup 節點對照端口的 edge（`targetHandle: "lookup-input"`）→ `inputs["lookup-input"]`

### LookupHandler 執行模式判斷

```typescript
// 偽程式碼，不規定實作細節
const lookupDataSet = inputs["lookup-input"]
const mainDataSet = inputs["main-input"] ?? inputs["default"]

if (lookupDataSet) {
  // 雙輸入模式：直接使用 lookupDataSet
} else {
  // 向下相容模式：從 DB 查詢 lookupSource + lookupFilter
}
```

### 節點 JSON Schema（雙輸入模式新增欄位）

```json
{
  "type": "transform-lookup",
  "data": {
    "matchColumn": "CUST_TYPE",
    "lookupMatchColumn": "CODE",
    "outputColumns": ["CODE_DESC", "CODE_CATEGORY"],
    "lookupSource": "",
    "lookupFilter": ""
  }
}
```

雙輸入模式下 `lookupSource` 與 `lookupFilter` 為空字串或省略，不影響向下相容。

### 拓撲排序相容性

現有 Kahn's algorithm 已支援扇出（一個 Extract 節點可連接多個下游節點），引用計數（refCount）已正確處理多 outgoing edges，不需修改。

---

## 測試案例

### TC-058-01：雙輸入模式 — 正確執行 JOIN

- **Given**：主資料集 100 列（含 `CUST_TYPE` 欄位，值如 "A01"、"B02"）；對照資料集 10 列（含 `CODE`、`CODE_DESC` 欄位）；節點設定 `matchColumn: "CUST_TYPE"`、`lookupMatchColumn: "CODE"`、`outputColumns: ["CODE_DESC"]`；`inputs["lookup-input"]` 已設定
- **When**：LookupHandler 執行
- **Then**：輸出 100 列，有對應對照列的資料行 `CODE_DESC` 有值，無對應的 `CODE_DESC` 為 null

### TC-058-02：雙輸入模式 — 對照資料集無符合 key

- **Given**：主資料集中 `CUST_TYPE = "Z99"` 在對照資料集中無對應 `CODE`
- **When**：LookupHandler 執行
- **Then**：該列保留，`outputColumns` 中的欄位值為 null（不被排除）

### TC-058-03：向下相容模式 — 無 lookup-input 時使用 lookupSource

- **Given**：Lookup 節點 `inputs` 中只有 `default`（無 `lookup-input`）；`lookupSource: "raw_e5a2345c"`；`lookupFilter: "TBL_ID = 'A2'"`
- **When**：LookupHandler 執行
- **Then**：引擎查詢資料庫取得 `raw_e5a2345c` 中 `TBL_ID = 'A2'` 的資料列作為對照集，JOIN 邏輯正常執行

### TC-058-04：舊版 Pipeline 定義不受影響

- **Given**：資料庫中的 Pipeline 版本定義使用舊 Lookup schema（含 `lookupSource`、`lookupFilter`，無 `lookup-input` edge）
- **When**：執行該 Pipeline
- **Then**：Pipeline 正常完成，Lookup 節點狀態為 `'completed'`

### TC-058-05：主資料流缺失時標記失敗

- **Given**：Lookup 節點的 `inputs` 為空物件（無任何輸入）
- **When**：LookupHandler 執行
- **Then**：節點狀態為 `'failed'`，錯誤訊息包含「缺少主資料流輸入」

### TC-058-06：比對欄位不存在時標記失敗

- **Given**：主資料集欄位中不含 `matchColumn` 指定的欄位名稱
- **When**：LookupHandler 執行
- **Then**：節點狀態為 `'failed'`，錯誤訊息說明欄位名稱與所屬資料集

---

## 依賴關係

- **Blocked By**：
  - US-055（需要執行引擎框架與 `inputs` 路由機制）
  - US-042（前端 edge 必須攜帶 `targetHandle: "lookup-input"` 才能正確路由至 LookupHandler）
- **Blocks**：無

---

## Definition of Done

- [ ] LookupHandler 支援雙輸入模式（從 `inputs["lookup-input"]` 讀取對照資料集）
- [ ] LookupHandler 保留向下相容的單輸入模式（從 DB 查詢 `lookupSource + lookupFilter`）
- [ ] 模式判斷邏輯清晰，依 `inputs["lookup-input"]` 是否存在自動切換
- [ ] 主資料流缺失、比對欄位不存在的錯誤處理正確
- [ ] 所有測試案例（TC-058-01 ~ TC-058-06）通過
- [ ] 舊版 Pipeline 定義（含 `lookupSource`、`lookupFilter`）可正常執行，結果不變

---

## 相關文件

- **Epic Brief**：[E05 Epic Brief](epic-brief.md)
- **前端 Story**：[US-042 視覺化轉換編輯器](US-042-pipeline-editor.md)（AC-7a ~ AC-7d：Lookup 節點前端雙輸入設計）
- **執行引擎框架**：[US-055 ETL 執行引擎核心框架](US-055-etl-execution-engine-core.md)
- **相關節點實作**：[US-056](US-056-etl-nodes-extract-merge-dedup.md)（Merge 雙輸入參考實作）
