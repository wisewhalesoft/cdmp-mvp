---
type: test-design-feature
feature_id: F041
feature_name: Badge Hover Tooltip
priority: P2
related_spec: F041-badge-hover-tooltip.md
last_updated: 2026-03-27
version: "1.0"
---

# F041: Badge Hover Tooltip — 測試設計

> **功能範圍**：Hover 節點 Badge 時顯示的 Tooltip Popover。
> **前置功能**：F039（Badge）
> **測試檔案位置**：`apps/web/src/pages/etl-pipelines/editor/__tests__/`
> **技術棧**：React + TypeScript + React Flow；Vitest + @testing-library/react + @testing-library/user-event
> **注意**：Tooltip 相關測試需使用 `@testing-library/user-event` 的 hover 事件，搭配 Vitest fake timer 控制時序。

---

## Acceptance Test Design

### AC-1：Badge Hover Tooltip

| 項目 | 內容 |
|------|------|
| Given | Badge 已渲染 |
| When | 使用者將滑鼠懸停於 Badge 上超過 300ms |
| Then | 出現 popover tooltip 顯示該節點類型對應的詳細欄位資訊；移開滑鼠 200ms 後消失；Esc 鍵立即關閉；同一時刻最多 1 個 tooltip 存在 |

---

## Mock 資料

共用 F039-test.md 中的 Mock Pipeline Graph（5 節點 + 4 邊）。

---

## 測試案例

### TS-F041-001：hover 300ms 後 Tooltip 出現

- **相關需求**：P2 Tooltip，觸發時序
- **測試類型**：Positive / 時序
- **前置條件**：
  - Badge 已渲染（`n-extract-1`，文字 `→ 5 欄位`）
  - 使用 `vi.useFakeTimers()`
- **步驟**：
  1. `userEvent.hover` 滑鼠移至 Badge 上
  2. `vi.advanceTimersByTime(299)`（尚未超過 300ms）
  3. 查詢 `[data-testid="badge-tooltip"]`
  4. `vi.advanceTimersByTime(1)`（達到 300ms）
  5. 再次查詢 tooltip
- **預期結果**：
  - 步驟 3：tooltip 不存在（`queryByTestId` 回傳 null）
  - 步驟 5：tooltip 存在且可見

---

### TS-F041-002：移開滑鼠後 200ms Tooltip 消失

- **相關需求**：P2 Tooltip，消失時序
- **測試類型**：Positive / 時序
- **前置條件**：
  - Tooltip 已顯示（已經過 hover 300ms）
  - 使用 fake timer
- **步驟**：
  1. `userEvent.unhover` 滑鼠移離 Badge
  2. `vi.advanceTimersByTime(199)`（尚未 200ms）
  3. 查詢 tooltip
  4. `vi.advanceTimersByTime(1)`（達 200ms）
  5. 再次查詢 tooltip
- **預期結果**：
  - 步驟 3：tooltip 仍存在（消失延遲尚未觸發）
  - 步驟 5：tooltip 不存在

---

### TS-F041-003：滑入 Tooltip 後 Tooltip 保持可見

- **相關需求**：P2 Tooltip，可互動性（滑入保持）
- **測試類型**：Positive
- **前置條件**：
  - Tooltip 已顯示，使用 fake timer
- **步驟**：
  1. `userEvent.unhover` Badge（開始 200ms 倒數）
  2. `vi.advanceTimersByTime(100)`（倒數中）
  3. `userEvent.hover` 移入 tooltip 本體
  4. `vi.advanceTimersByTime(200)`（繼續推進時間）
  5. 查詢 tooltip
- **預期結果**：
  - 步驟 5：tooltip 仍存在（滑入 tooltip 取消消失計時器）

---

### TS-F041-004：Esc 鍵立即關閉 Tooltip

- **相關需求**：P2 Tooltip，Esc 關閉
- **測試類型**：Positive / 鍵盤
- **前置條件**：
  - Tooltip 已顯示
- **步驟**：
  1. `userEvent.keyboard('{Escape}')`
  2. 查詢 `[data-testid="badge-tooltip"]`
- **預期結果**：
  - Tooltip 立即消失（不需等待 200ms 延遲）
  - `queryByTestId('badge-tooltip')` 回傳 null

---

### TS-F041-005：同時最多 1 個 Tooltip（新 hover 關閉舊 tooltip）

- **相關需求**：P2 Tooltip，單例行為
- **測試類型**：Positive / 並發情境
- **前置條件**：
  - 畫布含 `n-extract-1` 和 `n-extract-2` 兩個節點，各有 Badge
  - 使用 fake timer
- **步驟**：
  1. hover `n-extract-1` 的 Badge，等待 300ms
  2. 驗證 tooltip 顯示（對應 `n-extract-1`）
  3. hover `n-extract-2` 的 Badge，等待 300ms
  4. 查詢所有 `[data-testid="badge-tooltip"]` 元素數量
- **預期結果**：
  - 步驟 4：tooltip 元素數量 = 1
  - 存在的 tooltip 內容對應 `n-extract-2`（新的）
  - `n-extract-1` 的 tooltip 已消失

---

### TS-F041-006：raw_data_extract Tooltip 內容

- **相關需求**：P2 Tooltip，節點類型 `raw_data_extract` 專屬內容
- **測試類型**：Positive
- **前置條件**：
  - `n-extract-1`，rawTable = `'raw_zzip_bamcust_m'`，回傳 `mockSourceColumnsA`（5 欄）
  - Tooltip 已顯示
- **步驟**：
  1. 查詢 tooltip 內容
- **預期結果**：
  - Tooltip 標題包含 `raw_zzip_bamcust_m` 或類似來源說明
  - 欄位列表顯示所有 5 欄名稱（`cust_no`, `name`, `birth_date`, `mobile`, `email`）

---

### TS-F041-007：field_mapping Tooltip 內容（保留/移除欄位）

- **相關需求**：P2 Tooltip，節點類型 `field_mapping` 專屬內容
- **測試類型**：Positive
- **前置條件**：
  - `n-mapping-1`，輸入 5 欄，輸出 3 欄，移除 2 欄
  - Tooltip 已顯示
- **步驟**：
  1. 查詢 tooltip 內容區塊
- **預期結果**：
  - Tooltip 含「保留」欄位列表（3 欄）
  - Tooltip 含「移除」欄位列表（2 欄：`birth_date`, `mobile`）
  - 兩個列表以視覺分隔顯示

---

### TS-F041-008：derived_field Tooltip 內容（新增欄位列表）

- **相關需求**：P2 Tooltip，節點類型 `derived_field` 專屬內容
- **測試類型**：Positive
- **前置條件**：
  - `n-derived-1`，2 個衍生欄位：`age_group`, `vip_flag`
  - Tooltip 已顯示
- **步驟**：
  1. 查詢 tooltip 新增欄位區塊
- **預期結果**：
  - Tooltip 顯示「新增欄位」標題
  - 列表含 `age_group` 和 `vip_flag`
  - 既有欄位（`customer_no` 等）不出現於「新增」區塊

---

### TS-F041-009：Tooltip 欄位列表截斷（超過 8 欄）

- **相關需求**：P2 Tooltip，欄位列表 max 8 截斷
- **測試類型**：Boundary
- **前置條件**：
  - 節點輸出 10 欄（超過截斷閾值 8）
  - Tooltip 已顯示
- **步驟**：
  1. 計算 tooltip 內欄位列表項目數量
  2. 查詢是否存在「還有 N 個欄位」提示文字
- **預期結果**：
  - 列表項目恰好 8 個（截斷）
  - 顯示「還有 2 個欄位」或等效摘要提示
  - 不顯示第 9、10 個欄位名稱

---

### TS-F041-010：Tooltip Diff 列表截斷（差異超過 4 欄）

- **相關需求**：P2 Tooltip，差異列表 max 4 截斷
- **測試類型**：Boundary
- **前置條件**：
  - `field_mapping` 節點移除 6 欄（超過截斷閾值 4）
  - Tooltip 已顯示
- **步驟**：
  1. 計算 tooltip「移除」列表項目數量
  2. 查詢截斷提示
- **預期結果**：
  - 「移除」列表最多顯示 4 個欄位名稱
  - 顯示「還有 2 個移除欄位」或等效提示

---

### TS-F041-011：Tooltip 邊界定位（Badge 靠近視窗邊緣）

- **相關需求**：P2 Tooltip，邊界定位
- **測試類型**：Boundary
- **前置條件**：
  - Badge 位置設定在 `{ x: 0, y: 10 }`（靠近視窗左側）
  - Tooltip 已顯示
- **步驟**：
  1. 取得 tooltip 的 `getBoundingClientRect()`
- **預期結果**：
  - `tooltip.left >= 0`（tooltip 不超出視窗左側）
  - `tooltip.right <= window.innerWidth`（不超出視窗右側）

> **注意**：此測試在 JSDOM 環境中 `getBoundingClientRect()` 回傳全為 0，需使用 `vi.spyOn(element, 'getBoundingClientRect')` mock 定位邏輯；或將邊界定位邏輯提取為獨立 pure function 進行單元測試。

---

### TS-F041-012：Tooltip 可滾動（欄位超過顯示高度）

- **相關需求**：P2 Tooltip，可滾動互動
- **測試類型**：Positive / 互動
- **前置條件**：
  - 節點輸出 8 欄（達截斷上限），Tooltip 已顯示
- **步驟**：
  1. 查詢 tooltip 容器元素
  2. 驗證滾動相關 CSS 屬性
- **預期結果**：
  - tooltip 容器含 `overflow-y: auto` 或 `overflow-y: scroll` style
  - tooltip 容器設有 `max-height`（非無限高度）

---

## 附錄：Tooltip 內容對照表

| 節點類型 | Tooltip 標題 | 主要列表 | 次要列表 | 截斷規則 |
|---------|------------|---------|---------|---------|
| raw_data_extract | 輸出欄位（N 欄） | 所有輸出欄位 | — | 欄位 max 8 |
| field_mapping | 欄位映射摘要 | 保留欄位 | 移除欄位 | 差異 max 4 |
| derived_field | 衍生欄位（+N） | 新增欄位名稱 | 原有欄位 | 欄位 max 8 |
| merge | 合併摘要 | 左側輸入欄位 | 右側輸入欄位 | 各 max 4 |
| type_cast | 型別轉換（N 筆） | 轉換欄位列表 | — | 差異 max 4 |
| conditional | 條件規則（N 筆） | 條件名稱列表 | — | 差異 max 4 |
| target_load | 載入欄位（N 欄） | 已映射欄位 | — | 欄位 max 8 |
| dedup | 透傳欄位（N 欄） | 所有欄位 | — | 欄位 max 8 |

---
