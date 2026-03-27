---
type: test-design-feature
feature_id: F039
feature_name: 節點欄位變化統計 Badge
priority: P0-MVP
related_spec: F039-node-field-badge.md
last_updated: 2026-03-27
version: "1.0"
---

# F039: 節點欄位變化統計 Badge — 測試設計

> **功能範圍**：ETL Pipeline 視覺化編輯器節點卡片底部的欄位統計 Badge。
> **相關測試**：P1 Inspector Diff → [F040-test.md](F040-test.md) / P2 Tooltip → [F041-test.md](F041-test.md)
> **測試檔案位置**：`apps/web/src/pages/etl-pipelines/editor/__tests__/`
> **技術棧**：React + TypeScript + React Flow；Vitest + @testing-library/react + @testing-library/user-event

---

## Acceptance Test Design

### AC-1：Badge 渲染（P0）

| 項目 | 內容 |
|------|------|
| Given | Pipeline 編輯器已載入，各節點已完成設定（rawTable 已選、expressions 已定義等） |
| When | `computeNodeOutputColumns()` 完成計算後渲染節點卡片 |
| Then | 節點卡片底部出現 Badge，文字與色彩符合節點類型規格；欄位計數與 `computeNodeOutputColumns()` 回傳結果一致 |

---

## Mock 資料設計

以下 Mock 資料供全部測試案例共用，涵蓋一條完整的 Pipeline 圖（5 個節點、4 條邊）。

### Mock Pipeline Graph

```
raw_data_extract (n-extract-1)
        |
  field_mapping (n-mapping-1)   — dropUnmapped=true，僅保留 3 欄
        |
  derived_field (n-derived-1)   — 新增 2 衍生欄位
        |
     merge (n-merge-1)          — 左側 = derived，右側 = raw_data_extract (n-extract-2)
        |
  target_load (n-load-1)
```

#### 節點定義（nodes）

```typescript
// n-extract-1：5 欄原始資料（mock getRawTableColumns 回傳）
mockSourceColumnsA = ['cust_no', 'name', 'birth_date', 'mobile', 'email']

// n-extract-2：3 欄原始資料（右側合併來源）
mockSourceColumnsB = ['cust_no', 'score', 'risk_level']

// n-mapping-1：field_mapping，dropUnmapped=true
// mappings: [
//   { sourceColumn: 'cust_no', targetColumn: 'customer_no' },
//   { sourceColumn: 'name',    targetColumn: 'full_name'   },
//   { sourceColumn: 'email',   targetColumn: 'email_addr'  },
// ]
// 輸出：['customer_no', 'full_name', 'email_addr']（3 欄，移除 birth_date/mobile）

// n-derived-1：derived_field
// expressions: [
//   { outputColumn: 'age_group' },
//   { outputColumn: 'vip_flag' },
// ]
// 輸出：['customer_no', 'full_name', 'email_addr', 'age_group', 'vip_flag']（5 欄）

// n-merge-1：merge
// 左輸入：n-derived-1 → ['customer_no', 'full_name', 'email_addr', 'age_group', 'vip_flag']
// 右輸入：n-extract-2  → ['cust_no', 'score', 'risk_level']
// 輸出（聯集）：['customer_no', 'full_name', 'email_addr', 'age_group', 'vip_flag', 'cust_no', 'score', 'risk_level']（8 欄）

// n-load-1：target_load（selectedTable='customer_core'）
```

#### 邊定義（edges）

```typescript
{ id: 'e1', source: 'n-extract-1', target: 'n-mapping-1' }
{ id: 'e2', source: 'n-mapping-1', target: 'n-derived-1' }
{ id: 'e3', source: 'n-derived-1', target: 'n-merge-1', sourceHandle: 'left-output'  }
{ id: 'e4', source: 'n-extract-2', target: 'n-merge-1', sourceHandle: 'right-output' }
```

### API Mock 設定

```typescript
// vi.mock('@/api/etl-pipelines') 之後：
// n-extract-1 對應的 raw table
mockedGetRawTableColumns.mockResolvedValueOnce({
  columns: mockSourceColumnsA
})
// n-extract-2 對應的 raw table
mockedGetRawTableColumns.mockResolvedValueOnce({
  columns: mockSourceColumnsB
})
```

### 各節點 Badge 預期輸出速查表

| 節點 ID | 節點類型 | Badge 文字 | 色彩語意 | 計數說明 |
|---------|---------|-----------|---------|---------|
| n-extract-1 | raw_data_extract | `→ 5 欄位` | 藍色 | 5 欄原始資料 |
| n-extract-2 | raw_data_extract | `→ 3 欄位` | 藍色 | 3 欄原始資料 |
| n-mapping-1 | field_mapping | `5 → 3（-2）` | 紅色 | 輸入 5，輸出 3，移除 2 |
| n-derived-1 | derived_field | `+2 衍生欄位` | 綠色 | 新增 2 衍生欄位 |
| n-merge-1 | merge | `左 5 + 右 3 → 8` | 橘色 | 左 5 + 右 3 聯集 8 |
| n-load-1 | target_load | `載入 8 欄位` | 綠色 | 來自上游 8 欄 |

### 各節點 computeNodeOutputColumns 預期輸出

| 節點 ID | 預期輸出欄位陣列 |
|---------|----------------|
| n-extract-1 | `['cust_no', 'name', 'birth_date', 'mobile', 'email']` |
| n-mapping-1 | `['customer_no', 'full_name', 'email_addr']` |
| n-derived-1 | `['customer_no', 'full_name', 'email_addr', 'age_group', 'vip_flag']` |
| n-merge-1 | `['customer_no', 'full_name', 'email_addr', 'age_group', 'vip_flag', 'cust_no', 'score', 'risk_level']` |

---

## P0 — Badge 測試案例

### TS-F039-001：raw_data_extract Badge 文字與色彩

- **相關需求**：P0 Badge，節點類型 `raw_data_extract`
- **測試類型**：Positive
- **前置條件**：
  - 節點 `n-extract-1` 存在，`rawTable = 'raw_zzip_bamcust_m'`
  - `getRawTableColumns` mock 回傳 `mockSourceColumnsA`（5 欄）
- **步驟**：
  1. 渲染含 `n-extract-1` 的節點卡片
  2. 等待 `computeNodeOutputColumns` 非同步完成（`waitFor`）
  3. 查詢 `data-testid="node-badge"` 元素
- **預期結果**：
  - Badge 文字為 `→ 5 欄位`
  - Badge 元素含 CSS class `bg-blue-50` 與 `text-blue-700`（或等效藍色 Tailwind class）
  - `aria-label` 包含欄位數 `5`

---

### TS-F039-002：field_mapping Badge 文字與紅色（dropUnmapped=true）

- **相關需求**：P0 Badge，節點類型 `field_mapping`
- **測試類型**：Positive
- **前置條件**：
  - 節點 `n-mapping-1`，上游為 `n-extract-1`（5 欄輸入），mappings 3 筆，`dropUnmapped=true`
- **步驟**：
  1. 渲染含 `n-mapping-1` 的節點卡片（含完整 nodes/edges graph）
  2. 等待計算完成
  3. 查詢 `[data-testid="node-badge"]`
- **預期結果**：
  - Badge 文字為 `5 → 3（-2）`
  - Badge 元素含紅色 CSS class（`bg-red-50 text-red-700` 或等效）

---

### TS-F039-003：field_mapping Badge（dropUnmapped=false — 透傳模式）

- **相關需求**：P0 Badge，field_mapping 透傳模式
- **測試類型**：Positive（分支情境）
- **前置條件**：
  - 節點設定 `dropUnmapped=false`，mappings 3 筆，上游 5 欄
- **步驟**：
  1. 渲染節點，等待計算完成
- **預期結果**：
  - 輸出欄位數為 5（未刪除未對應欄位）
  - Badge 文字為 `5 → 5（-0）` 或 `5 欄位`（依實作規格，視 -0 是否省略）
  - 色彩為灰色（無移除時不應顯示紅色）

> **開放問題 OQ-F039-001**：`dropUnmapped=false` 時 Badge 文字格式尚未明確定義，建議確認是否省略 `（-0）`，或改用灰色透傳顯示。

---

### TS-F039-004：derived_field Badge 文字與綠色

- **相關需求**：P0 Badge，節點類型 `derived_field`
- **測試類型**：Positive
- **前置條件**：
  - 節點 `n-derived-1`，上游 3 欄，expressions 含 2 筆（`age_group`, `vip_flag`）
- **步驟**：
  1. 渲染節點，等待計算完成
- **預期結果**：
  - Badge 文字為 `+2 衍生欄位`
  - Badge 含綠色 CSS class（`bg-green-50 text-green-700` 或等效）

---

### TS-F039-005：merge Badge 文字與橘色

- **相關需求**：P0 Badge，節點類型 `merge`
- **測試類型**：Positive
- **前置條件**：
  - 節點 `n-merge-1`，左輸入 5 欄、右輸入 3 欄（聯集 8 欄）
- **步驟**：
  1. 渲染節點，等待計算完成
- **預期結果**：
  - Badge 文字為 `左 5 + 右 3 → 8`
  - Badge 含橘色 CSS class（`bg-amber-50 text-amber-700` 或等效）

---

### TS-F039-006：target_load Badge 文字與綠色

- **相關需求**：P0 Badge，節點類型 `target_load`
- **測試類型**：Positive
- **前置條件**：
  - 節點 `n-load-1`，上游（`n-merge-1`）輸出 8 欄
- **步驟**：
  1. 渲染節點，等待計算完成
- **預期結果**：
  - Badge 文字為 `載入 8 欄位`
  - Badge 含綠色 CSS class

---

### TS-F039-007：type_cast Badge 文字與灰色

- **相關需求**：P0 Badge，節點類型 `type_cast`
- **測試類型**：Positive
- **前置條件**：
  - 單一 `type_cast` 節點，上游 4 欄，casts 設定 4 筆（型別轉換，欄位數不變）
- **步驟**：
  1. 渲染節點，等待計算完成
- **預期結果**：
  - Badge 文字為 `4 型別轉換`（cast 筆數，非欄位數）
  - Badge 含灰色 CSS class

---

### TS-F039-008：conditional Badge 文字與橘色

- **相關需求**：P0 Badge，節點類型 `conditional`
- **測試類型**：Positive
- **前置條件**：
  - 單一 `conditional` 節點，rules 3 筆，上游 5 欄（透傳）
- **步驟**：
  1. 渲染節點，等待計算完成
- **預期結果**：
  - Badge 文字為 `3 條件規則`
  - Badge 含橘色 CSS class

---

### TS-F039-009：dedup Badge 文字與灰色

- **相關需求**：P0 Badge，節點類型 `dedup`
- **測試類型**：Positive
- **前置條件**：
  - 單一 `dedup` 節點，上游 6 欄（透傳）
- **步驟**：
  1. 渲染節點，等待計算完成
- **預期結果**：
  - Badge 文字為 `→ 6`
  - Badge 含灰色 CSS class

---

### TS-F039-010：Badge 計算中顯示 Loading 狀態

- **相關需求**：P0 Badge，非同步計算期間的使用者體驗
- **測試類型**：Positive（過渡狀態）
- **前置條件**：
  - `getRawTableColumns` mock 使用 `mockResolvedValueOnce` 延遲回應（不立即 resolve）
- **步驟**：
  1. 渲染節點卡片
  2. 在 promise 尚未 resolve 時立即查詢 Badge
- **預期結果**：
  - Badge 顯示 loading 佔位符（如 skeleton 或 `…`）或不顯示 Badge
  - 不應顯示空字串或 `0 欄位` 等誤導性文字

---

### TS-F039-011：Badge 計算失敗（API 錯誤）

- **相關需求**：P0 Badge，錯誤處理
- **測試類型**：Negative
- **前置條件**：
  - `getRawTableColumns` mock 回傳 rejected promise（模擬 API 失敗）
- **步驟**：
  1. 渲染含 `raw_data_extract` 節點的卡片
  2. 等待 promise reject
- **預期結果**：
  - Badge 不顯示錯誤 stack trace
  - Badge 顯示降級文字（如 `—` 或 `計算失敗`）
  - 節點卡片其餘部分不受影響（正常渲染標題、圖示）

---

### TS-F039-012：無上游節點的 transform 節點 Badge

- **相關需求**：P0 Badge，邊界情境
- **測試類型**：Boundary
- **前置條件**：
  - `field_mapping` 節點存在，但 edges 中無任何指向該節點的邊（孤立節點）
- **步驟**：
  1. 渲染孤立節點卡片
  2. 等待計算完成
- **預期結果**：
  - 輸入欄位數為 0
  - Badge 文字為 `0 → 0（-0）` 或顯示空狀態（依規格）
  - 不拋出 runtime error

---

## P0 — computeNodeOutputColumns 單元測試案例

> 以下場景測試 `computeNodeOutputColumns` 純函式邏輯，不涉及 React 渲染，使用 Vitest 直接測試。

### TS-F039-013：raw_data_extract — 正確透過 API 取得欄位

- **相關需求**：`computeNodeOutputColumns` 邏輯，raw_data_extract 分支
- **測試類型**：Unit / Positive
- **前置條件**：
  - `getRawTableColumns` mock 回傳 `['col_a', 'col_b', 'col_c']`
  - node `data.rawTable = 'raw_test_table'`
- **步驟**：
  1. 呼叫 `computeNodeOutputColumns('n-extract-1', [extractNode], [])`
  2. await 結果
- **預期結果**：
  - 回傳 `['col_a', 'col_b', 'col_c']`
  - `getRawTableColumns` 被呼叫 1 次，參數為 `'raw_test_table'`

---

### TS-F039-014：field_mapping（dropUnmapped=true）— 只保留 targetColumn

- **相關需求**：`computeNodeOutputColumns` 邏輯，field_mapping + dropUnmapped
- **測試類型**：Unit / Positive
- **前置條件**：
  - 上游節點已 resolve 為 `['a', 'b', 'c', 'd']`（4 欄）
  - mappings：`[{ sourceColumn: 'a', targetColumn: 'x' }, { sourceColumn: 'c', targetColumn: 'z' }]`
  - `dropUnmapped = true`
- **步驟**：
  1. 呼叫 `computeNodeOutputColumns('n-mapping-1', nodes, edges)`
- **預期結果**：
  - 回傳 `['x', 'z']`（僅 2 欄）
  - `b` 和 `d` 不出現於結果

---

### TS-F039-015：field_mapping（dropUnmapped=false）— 透傳全部欄位

- **相關需求**：`computeNodeOutputColumns` 邏輯，透傳分支
- **測試類型**：Unit / Positive
- **前置條件**：
  - 上游 `['a', 'b', 'c', 'd']`，`dropUnmapped = false`，mappings 2 筆
- **步驟**：
  1. 呼叫 `computeNodeOutputColumns`
- **預期結果**：
  - 回傳 `['x', 'b', 'z', 'd']`（對應欄位重命名，未對應欄位原名保留）
  - 或回傳 `['a', 'b', 'c', 'd']`（若透傳不重命名，依實作確認）

> **開放問題 OQ-F039-002**：`dropUnmapped=false` 時，已設定 mapping 的欄位是否改名（`sourceColumn` → `targetColumn`）？規格未明確說明，需與前端開發確認。

---

### TS-F039-016：derived_field — 輸入欄位加上新增欄位

- **相關需求**：`computeNodeOutputColumns` 邏輯，derived_field 分支
- **測試類型**：Unit / Positive
- **前置條件**：
  - 上游 `['col_1', 'col_2']`
  - expressions：`[{ outputColumn: 'new_col_a' }, { outputColumn: 'new_col_b' }]`
- **步驟**：
  1. 呼叫 `computeNodeOutputColumns`
- **預期結果**：
  - 回傳 `['col_1', 'col_2', 'new_col_a', 'new_col_b']`（順序：原有在前，衍生在後）

---

### TS-F039-017：merge — 左右輸入欄位聯集（去重）

- **相關需求**：`computeNodeOutputColumns` 邏輯，merge 分支
- **測試類型**：Unit / Positive
- **前置條件**：
  - 左側輸入：`['a', 'b', 'c']`
  - 右側輸入：`['c', 'd', 'e']`（`c` 重複）
- **步驟**：
  1. 呼叫 `computeNodeOutputColumns('n-merge-1', nodes, edges)`
- **預期結果**：
  - 回傳 `['a', 'b', 'c', 'd', 'e']`（5 欄，`c` 不重複）
  - 重複欄位僅保留一次（聯集語意）

---

### TS-F039-018：type_cast — 欄位名稱透傳

- **相關需求**：`computeNodeOutputColumns` 邏輯，type_cast 透傳
- **測試類型**：Unit / Positive
- **前置條件**：
  - 上游 `['id', 'amount', 'date_str']`
  - type_cast casts：`[{ column: 'amount', toType: 'DECIMAL' }, { column: 'date_str', toType: 'DATE' }]`
- **步驟**：
  1. 呼叫 `computeNodeOutputColumns`
- **預期結果**：
  - 回傳 `['id', 'amount', 'date_str']`（欄位名稱不變，僅型別轉換）

---

### TS-F039-019：dedup — 欄位名稱透傳

- **相關需求**：`computeNodeOutputColumns` 邏輯，dedup 透傳
- **測試類型**：Unit / Positive
- **前置條件**：
  - 上游 `['x', 'y', 'z']`
- **步驟**：
  1. 呼叫 `computeNodeOutputColumns`
- **預期結果**：
  - 回傳 `['x', 'y', 'z']`（與上游相同）

---

### TS-F039-020：conditional — 欄位名稱透傳

- **相關需求**：`computeNodeOutputColumns` 邏輯，conditional 透傳
- **測試類型**：Unit / Positive
- **前置條件**：
  - 上游 `['col_a', 'col_b']`
  - rules 3 筆（修改欄位值，不新增/刪除欄位）
- **步驟**：
  1. 呼叫 `computeNodeOutputColumns`
- **預期結果**：
  - 回傳 `['col_a', 'col_b']`（欄位清單不變）

---

### TS-F039-021：遞迴圖遍歷 — 多層 transform 鏈

- **相關需求**：`computeNodeOutputColumns` 遞迴邏輯
- **測試類型**：Unit / Positive（整合多節點）
- **前置條件**：
  - 使用 Mock Pipeline Graph：extract → mapping → derived 三層鏈
  - extract 回傳 `mockSourceColumnsA`（5 欄）
- **步驟**：
  1. 呼叫 `computeNodeOutputColumns('n-derived-1', nodes, edges)`
- **預期結果**：
  - 回傳 `['customer_no', 'full_name', 'email_addr', 'age_group', 'vip_flag']`（5 欄）
  - 驗證 `getRawTableColumns` 僅被呼叫 1 次（非重複呼叫）

---

### TS-F039-022：循環圖保護（防無限遞迴）

- **相關需求**：`computeNodeOutputColumns` 安全性
- **測試類型**：Negative / 邊界
- **前置條件**：
  - edges 中存在環狀連接：A → B → A（理論上不應出現，但需防護）
- **步驟**：
  1. 呼叫 `computeNodeOutputColumns('n-a', cycleNodes, cycleEdges)`
- **預期結果**：
  - 函式不進入無限迴圈
  - 回傳空陣列 `[]` 或拋出明確錯誤訊息（而非 stack overflow）

---
