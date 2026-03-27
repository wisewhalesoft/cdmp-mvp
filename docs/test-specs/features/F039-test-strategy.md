---
type: test-design-strategy-supplement
feature_id: F039
feature_name: 節點欄位變化 Badge + Tooltip — 測試策略補充
priority: P0 (Badge) / P1 (Inspector Diff) / P2 (Tooltip)
last_updated: 2026-03-27
version: "1.0"
---

# F039: 節點欄位變化 Badge + Tooltip — 測試策略

> 本文件補充說明 F039 功能的測試分層架構、Mock 資料使用規則、測試 ID 命名規則與自動化評估。
> 完整測試場景請見 [F039-test.md](F039-test.md)。

---

## 1. 測試分層架構

### 單元測試（Unit Tests）

**目標**：驗證 `computeNodeOutputColumns` 純函式邏輯，覆蓋每種節點類型分支。

**範圍**：
- TS-F039-013 ～ TS-F039-022（computeNodeOutputColumns 10 個場景）
- 不涉及 React 渲染，使用 Vitest 直接 import 並呼叫函式
- API 透過 `vi.mock('@/api/etl-pipelines')` 替換

**原則**：
- 每個節點類型（raw_data_extract / field_mapping / derived_field / merge / type_cast / dedup / conditional）各有獨立測試場景
- 遞迴邏輯（TS-F039-021）需完整 nodes + edges 圖
- 循環圖防護（TS-F039-022）需準備特殊邊界 fixture

**測試檔案建議位置**：
```
apps/web/src/pages/etl-pipelines/editor/__tests__/
  compute-output-columns.test.ts   ← 純函式單元測試
```

---

### 元件整合測試（Component Integration Tests）

**目標**：驗證 Badge 在節點卡片中的渲染，以及 Inspector Panel 欄位 Diff 區塊的展示邏輯。

**範圍**：
- TS-F039-001 ～ TS-F039-012（Badge 渲染 12 個場景）
- TS-F039-023 ～ TS-F039-028（Inspector Panel 6 個場景）
- 使用 `@testing-library/react` 渲染元件，搭配 `waitFor` 等待非同步計算

**原則**：
- Badge 測試針對節點卡片元件（`PipelineNode` 或新增的 `NodeBadge` 元件）
- Inspector Panel 測試針對 `PropertiesPanel` 元件（參考現有 `load-properties.test.tsx`）
- API mock 使用 `vi.mock('@/api/etl-pipelines')`（與現有測試保持一致）
- 必須測試非同步過渡狀態（loading → 計算完成）

**測試檔案建議位置**：
```
apps/web/src/pages/etl-pipelines/editor/__tests__/
  node-badge.test.tsx           ← Badge 渲染測試
  field-flow-inspector.test.tsx ← Inspector Panel Diff 測試
```

---

### 互動測試（Interaction Tests）

**目標**：驗證 Tooltip 的時序觸發、消失延遲、鍵盤關閉、單例行為。

**範圍**：
- TS-F039-029 ～ TS-F039-040（Tooltip 12 個場景）

**原則**：
- 必須使用 `vi.useFakeTimers()` 控制時序，避免真實等待
- 每個測試結束後呼叫 `vi.useRealTimers()` 或在 `afterEach` 還原
- `userEvent.hover` / `userEvent.unhover` 配合 `vi.advanceTimersByTime`
- 邊界定位測試（TS-F039-039）需 mock `getBoundingClientRect`

**測試檔案建議位置**：
```
apps/web/src/pages/etl-pipelines/editor/__tests__/
  badge-tooltip.test.tsx        ← Tooltip 互動測試
```

---

## 2. Mock 資料使用規則

### 共用 Mock Graph（建議抽取為 fixture）

以下 mock 資料建議放置於共用 fixture 檔：
```
apps/web/src/pages/etl-pipelines/editor/__tests__/
  fixtures/
    pipeline-graph.ts    ← nodes, edges, expected outputs
```

**Mock 結構**（詳見 F039-test.md「Mock 資料設計」章節）：

```typescript
// fixtures/pipeline-graph.ts
export const mockSourceColumnsA = ['cust_no', 'name', 'birth_date', 'mobile', 'email']
export const mockSourceColumnsB = ['cust_no', 'score', 'risk_level']

export const mockNodes: Node[] = [
  // n-extract-1, n-extract-2, n-mapping-1, n-derived-1, n-merge-1, n-load-1
]

export const mockEdges: Edge[] = [
  // e1: extract-1 → mapping-1
  // e2: mapping-1 → derived-1
  // e3: derived-1 → merge-1 (left)
  // e4: extract-2 → merge-1 (right)
]

export const expectedOutputs: Record<string, string[]> = {
  'n-extract-1': mockSourceColumnsA,
  'n-mapping-1': ['customer_no', 'full_name', 'email_addr'],
  'n-derived-1': ['customer_no', 'full_name', 'email_addr', 'age_group', 'vip_flag'],
  'n-merge-1':   ['customer_no', 'full_name', 'email_addr', 'age_group', 'vip_flag', 'cust_no', 'score', 'risk_level'],
}
```

### API Mock 設定模式

參考現有 `load-properties.test.tsx`：

```typescript
import * as etlPipelinesApi from '@/api/etl-pipelines'
vi.mock('@/api/etl-pipelines')
const mockedGetRawTableColumns = vi.mocked(etlPipelinesApi.getRawTableColumns)

beforeEach(() => {
  mockedGetRawTableColumns
    .mockResolvedValueOnce({ columns: mockSourceColumnsA })  // n-extract-1
    .mockResolvedValueOnce({ columns: mockSourceColumnsB })  // n-extract-2
})

afterEach(() => {
  vi.clearAllMocks()
})
```

---

## 3. 測試 ID 命名規則

| 格式 | 說明 | 範例 |
|------|------|------|
| `TS-F039-NNN` | Feature F039 的第 NNN 個測試場景 | TS-F039-001 |
| 001–012 | P0 Badge 測試（節點渲染） | TS-F039-001 到 TS-F039-012 |
| 013–022 | P0 computeNodeOutputColumns 單元測試 | TS-F039-013 到 TS-F039-022 |
| 023–028 | P1 Inspector Panel 欄位 Diff | TS-F039-023 到 TS-F039-028 |
| 029–040 | P2 Tooltip 互動測試 | TS-F039-029 到 TS-F039-040 |

---

## 4. data-testid 屬性規劃

| 元素 | data-testid | 說明 |
|------|------------|------|
| 節點 Badge 元素 | `node-badge` | 存在於每個已計算的節點卡片底部 |
| Tooltip popover | `badge-tooltip` | hover 觸發後出現的 popover 容器 |
| Inspector 欄位流區塊 | `field-flow-section` | PropertiesPanel 中的欄位 Diff 區塊 |
| 欄位 Diff 輸入列表 | `field-flow-input-list` | 輸入欄位列表容器 |
| 欄位 Diff 輸出列表 | `field-flow-output-list` | 輸出欄位列表容器 |
| 欄位項目（個別） | `field-item` | 每個欄位的列表項目，含 `data-diff` 屬性 |

### data-diff 屬性值

| 值 | 說明 | 視覺呈現 |
|----|------|---------|
| `added` | 新增欄位 | 綠色 |
| `removed` | 移除欄位 | 紅色刪除線 |
| `unchanged` | 不變欄位 | 灰色 |

---

## 5. Badge 色彩規格對應表

| 節點類型 | 語意顏色 | Tailwind Class（建議）|
|---------|---------|---------------------|
| raw_data_extract | 藍色 | `bg-blue-50 text-blue-700` |
| field_mapping（有移除）| 紅色 | `bg-red-50 text-red-700` |
| field_mapping（無移除）| 灰色 | `bg-gray-100 text-gray-600` |
| derived_field | 綠色 | `bg-green-50 text-green-700` |
| merge | 橘色 | `bg-amber-50 text-amber-700` |
| type_cast | 灰色 | `bg-gray-100 text-gray-600` |
| conditional | 橘色 | `bg-amber-50 text-amber-700` |
| target_load | 綠色 | `bg-green-50 text-green-700` |
| dedup | 灰色 | `bg-gray-100 text-gray-600` |

> **注意**：色彩測試以 CSS class 名稱或 `data-color` 屬性進行驗證，不依賴視覺截圖比對，確保可自動化。

---

## 6. 自動化就緒度評估

| 測試範圍 | 場景數 | 自動化可行度 | 備註 |
|---------|--------|------------|------|
| computeNodeOutputColumns 單元測試 | 10 | 完全自動化 | Pure function，無副作用 |
| Badge 渲染測試（P0）| 12 | 完全自動化 | @testing-library/react + waitFor |
| Inspector Panel Diff（P1）| 6 | 完全自動化 | @testing-library/react |
| Tooltip 時序測試（P2）| 8 | 完全自動化 | vi.useFakeTimers() + userEvent |
| Tooltip 邊界定位（P2）| 1 | 部分自動化 | 需 mock getBoundingClientRect |
| Tooltip 可滾動（P2）| 1 | 完全自動化 | CSS 屬性驗證 |
| **合計** | **38** | **37/38 可自動化** | |

---

## 7. 測試執行順序建議

```
1. compute-output-columns.test.ts   ← 優先跑純函式，最快
2. node-badge.test.tsx              ← Badge 渲染，依賴 computeNodeOutputColumns
3. field-flow-inspector.test.tsx    ← Inspector Diff，依賴 computeNodeOutputColumns
4. badge-tooltip.test.tsx           ← Tooltip，依賴 Badge 渲染
```

---

## 8. 與現有測試的關係

| 現有測試 | 關聯方式 |
|---------|---------|
| `load-properties.test.tsx` | F039 Inspector Panel 測試（field-flow-inspector.test.tsx）應沿用相同的 render helper 模式與 API mock 設定 |
| `node-types.ts` 中的 `getCategoryColor` | Badge 色彩測試應與此函式的回傳值保持一致，避免重複定義期望值 |

---

## 9. 阻斷性開放問題

以下問題若未解決，對應測試場景無法最終確定：

| 問題 ID | 描述 | 阻斷場景 |
|--------|------|---------|
| OQ-F039-002 | `dropUnmapped=false` 時欄位改名行為 | TS-F039-015 |
| OQ-F039-004 | merge 節點左/右輸入識別方式（Handle ID vs 邊順序）| TS-F039-005、TS-F039-017、TS-F039-035 |

低優先問題（不阻斷但需後續確認）：

| 問題 ID | 描述 | 影響場景 |
|--------|------|---------|
| OQ-F039-001 | `dropUnmapped=false` Badge 文字格式 | TS-F039-003 |
| OQ-F039-003 | Tooltip 邊界定位 pure function 提取 | TS-F039-039 |
| OQ-F039-005 | computeNodeOutputColumns 快取機制 | TS-F039-021 |
