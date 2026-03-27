---
type: test-design-feature
feature_id: F040
feature_name: Inspector Panel 欄位 Diff
priority: P1
related_spec: F040-field-inspector-diff.md
last_updated: 2026-03-27
version: "1.0"
---

# F040: Inspector Panel 欄位 Diff — 測試設計

> **功能範圍**：點擊節點後右側屬性面板的「欄位流」區塊，顯示輸入/輸出欄位列表與 Diff 標記。
> **前置功能**：F039（Badge + computeNodeOutputColumns）
> **測試檔案位置**：`apps/web/src/pages/etl-pipelines/editor/__tests__/`
> **技術棧**：React + TypeScript + React Flow；Vitest + @testing-library/react + @testing-library/user-event

---

## Acceptance Test Design

### AC-1：Inspector Panel 欄位 Diff

| 項目 | 內容 |
|------|------|
| Given | 使用者點擊節點 |
| When | 右側屬性面板開啟 |
| Then | 面板新增「欄位流」區塊，顯示輸入/輸出欄位列表，各欄位依 diff 狀態標示新增（綠色）、移除（紅色）或不變（灰色） |

---

## Mock 資料

共用 F039-test.md 中的 Mock Pipeline Graph（5 節點 + 4 邊）。

---

## 測試案例

### TS-F040-001：欄位流區塊正常顯示

- **相關需求**：P1 Inspector Panel 欄位流
- **測試類型**：Positive
- **前置條件**：
  - 使用者點擊 `n-mapping-1` 節點（field_mapping）
  - 上游輸入 5 欄，輸出 3 欄
- **步驟**：
  1. render `PropertiesPanel`，`selectedNode = n-mapping-1`
  2. 等待 `computeNodeOutputColumns` 完成
  3. 查詢 `[data-testid="field-flow-section"]`
- **預期結果**：
  - 「欄位流」區塊存在於 DOM
  - 顯示「輸入欄位」標題與 5 個欄位項目
  - 顯示「輸出欄位」標題與 3 個欄位項目

---

### TS-F040-002：Diff 標記 — 新增欄位顯示綠色

- **相關需求**：P1 欄位 Diff 標記，新增
- **測試類型**：Positive
- **前置條件**：
  - 點擊 `n-derived-1` 節點
  - 輸入欄位：`['customer_no', 'full_name', 'email_addr']`（3 欄）
  - 輸出欄位：`['customer_no', 'full_name', 'email_addr', 'age_group', 'vip_flag']`（5 欄）
- **步驟**：
  1. 渲染面板，等待計算完成
  2. 查詢欄位列表項目
- **預期結果**：
  - `age_group` 和 `vip_flag` 的列表項目含綠色標記（`data-diff="added"` 或等效 class `text-green-*`）
  - `customer_no`、`full_name`、`email_addr` 的列表項目含灰色標記（`data-diff="unchanged"`）
  - 不存在紅色標記項目（無移除）

---

### TS-F040-003：Diff 標記 — 移除欄位顯示紅色

- **相關需求**：P1 欄位 Diff 標記，移除
- **測試類型**：Positive
- **前置條件**：
  - 點擊 `n-mapping-1` 節點（field_mapping，dropUnmapped=true）
  - 輸入：`['cust_no', 'name', 'birth_date', 'mobile', 'email']`（5 欄）
  - 輸出：`['customer_no', 'full_name', 'email_addr']`（3 欄）
- **步驟**：
  1. 渲染面板，等待計算完成
  2. 查詢輸入欄位中被移除的項目
- **預期結果**：
  - `birth_date` 和 `mobile` 在「輸入欄位」區域顯示紅色刪除線或標記（`data-diff="removed"`）
  - `customer_no`、`full_name`、`email_addr` 在「輸出欄位」區域顯示灰色不變標記

---

### TS-F040-004：Diff 標記 — 透傳節點全部欄位不變（灰色）

- **相關需求**：P1 欄位 Diff，透傳情境
- **測試類型**：Positive
- **前置條件**：
  - 點擊 `dedup` 節點，上游 4 欄，輸出相同 4 欄
- **步驟**：
  1. 渲染面板，等待計算完成
- **預期結果**：
  - 所有 4 個欄位項目均含灰色不變標記（`data-diff="unchanged"`）
  - 無綠色新增標記，無紅色移除標記

---

### TS-F040-005：欄位流區塊 — 無上游節點時顯示空狀態

- **相關需求**：P1 欄位流，邊界情境
- **測試類型**：Boundary
- **前置條件**：
  - 點擊孤立 `field_mapping` 節點（無 incoming edges）
- **步驟**：
  1. 渲染面板
- **預期結果**：
  - 「輸入欄位」顯示空狀態提示（如「尚無上游輸入」），而非空列表
  - 不拋出 runtime error

---

### TS-F040-006：欄位流區塊 — raw_data_extract 無輸入欄位

- **相關需求**：P1 欄位流，Extract 節點特性
- **測試類型**：Boundary
- **前置條件**：
  - 點擊 `raw_data_extract` 節點（此類型本身即資料來源，無上游輸入）
- **步驟**：
  1. 渲染面板，等待計算完成
- **預期結果**：
  - 「輸入欄位」區塊不顯示或顯示「（來源節點）」說明
  - 「輸出欄位」區塊顯示 API 回傳的欄位清單（綠色「新增」標記，因無輸入可對比）

---
