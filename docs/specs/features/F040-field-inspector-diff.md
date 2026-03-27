---
spec-id: F040
title: Inspector Panel 欄位 Diff
feature-id: F040
source-story: US-053
epic: E05
priority: P1
version: "1.0"
date: 2026-03-27
status: Draft
---

# F040: Inspector Panel 欄位 Diff

## 1. 功能摘要

在 Pipeline 編輯器的右側屬性面板（Properties Panel）中，新增「欄位流」分頁或區塊，顯示選中節點的輸入欄位列表、輸出欄位列表，以及兩者之間的 Diff 標記（新增、移除、不變）。支援搜尋過濾，讓 Admin 快速理解該節點對資料欄位的完整影響。

## 2. 使用者故事

**As a** Admin（管理者）
**I want** 在屬性面板中查看選中節點的輸入/輸出欄位差異
**So that** 我能詳細了解每個節點如何改變資料欄位，並在需要時快速搜尋特定欄位

## 3. 前置條件

- Admin 已登入且具備 Admin 權限
- Pipeline 編輯器畫布已載入（F029）
- 已選中一個節點（屬性面板已開啟）
- `computeNodeOutputColumns()` 函式可用

## 4. 資料模型

### 4.1 欄位 Diff 結果 Interface

```typescript
/** 單一欄位的 Diff 狀態 */
type FieldDiffStatus = 'added' | 'removed' | 'unchanged';

/** 單一欄位的 Diff 資訊 */
interface FieldDiffItem {
  fieldName: string;
  status: FieldDiffStatus;
}

/** 節點的完整欄位 Diff */
interface NodeFieldDiff {
  nodeId: string;
  nodeType: string;
  inputFields: string[];
  outputFields: string[];
  diff: FieldDiffItem[];
  summary: {
    added: number;
    removed: number;
    unchanged: number;
  };
}
```

### 4.2 Diff 狀態視覺標記

| 狀態 | 符號 | 色彩 | HEX |
|------|------|------|-----|
| 新增 | 圓點（filled circle） | 綠色 | #22C55E |
| 移除 | 圓點（filled circle） | 紅色 | #EF4444 |
| 不變 | 圓點（outline circle） | 灰色 | #9CA3AF |

## 5. 元件結構

```
PropertiesPanel (修改既有元件)
  +-- Tab: 屬性設定 (既有)
  +-- Tab: 欄位流 (新增)
        +-- FieldDiffSummaryBar
        |     +-- 新增 N / 移除 M / 不變 K
        +-- FieldDiffSearchInput
        +-- FieldDiffList
              +-- FieldDiffItem (repeat)
                    +-- status icon + fieldName
```

### 5.1 元件職責

| 元件 | 檔案路徑（建議） | 職責 |
|------|------------------|------|
| `FieldFlowTab` | `field-flow-tab.tsx`（新檔） | 欄位流分頁容器，組合 Summary、Search、List |
| `FieldDiffSummaryBar` | `field-flow-tab.tsx` 內 | 統計摘要列：顯示新增/移除/不變數量 |
| `FieldDiffSearchInput` | `field-flow-tab.tsx` 內 | 搜尋輸入框，即時過濾欄位列表 |
| `FieldDiffList` | `field-flow-tab.tsx` 內 | 欄位 Diff 列表，按狀態排序 |
| `computeNodeFieldDiff` | `node-field-stats.ts` | 純函式，計算 `NodeFieldDiff` |

### 5.2 資料流

```
選中節點 (selectedNode) + nodes + edges
  |
  v
useNodeFieldDiff(nodeId, nodes, edges)   <-- 自訂 Hook
  |-- 呼叫 computeNodeOutputColumns(nodeId) 取得輸出欄位
  |-- 取得上游節點輸出作為輸入欄位
  |-- 計算 Diff（Set 比較）
  |-- 回傳 NodeFieldDiff
  |
  v
FieldFlowTab 接收 NodeFieldDiff
  |
  v
渲染 SummaryBar + SearchInput + DiffList
```

## 6. 驗收標準

### AC-1: 欄位流分頁存在

- **Given** Admin 點擊畫布上的任意節點
- **When** 右側屬性面板載入
- **Then** 面板頂部顯示分頁切換，包含「屬性設定」與「欄位流」兩個分頁

### AC-2: Diff 摘要列

- **Given** Admin 切換至「欄位流」分頁，選中的是一個 `field_mapping` 節點
- **When** 分頁內容載入完成
- **Then** 頂部顯示摘要列，格式為：`+N 新增 / -M 移除 / K 不變`，數字對應實際 Diff 結果

### AC-3: 欄位 Diff 列表

- **Given** Admin 在「欄位流」分頁
- **When** 分頁內容載入完成
- **Then** 顯示所有欄位的 Diff 列表，每個欄位前方顯示對應狀態的彩色圓點標記

### AC-4: 列表排序

- **Given** Admin 在「欄位流」分頁查看 Diff 列表
- **When** 列表渲染完成
- **Then** 欄位排序為：新增（綠色）在前、移除（紅色）次之、不變（灰色）在後

### AC-5: 搜尋過濾

- **Given** Admin 在「欄位流」分頁，列表顯示 20 個欄位
- **When** Admin 在搜尋框輸入 `customer`
- **Then** 列表即時過濾，僅顯示欄位名稱包含 `customer` 的項目（不區分大小寫）

### AC-6: 空狀態

- **Given** Admin 選中一個剛拖入畫布的 Extract 節點（尚未選擇來源表）
- **When** 切換至「欄位流」分頁
- **Then** 顯示空狀態提示：「尚無欄位資料，請先完成節點設定」

### AC-7: 搜尋無結果

- **Given** Admin 在搜尋框輸入了不存在的欄位名稱
- **When** 過濾後無符合項目
- **Then** 列表顯示「無符合的欄位」提示

### AC-8: 載入中狀態

- **Given** 選中的節點為 Extract 節點，正在呼叫 API 取得 raw table columns
- **When** API 請求進行中
- **Then** 欄位流分頁顯示載入指示器（spinner）

## 7. 主要流程

1. Admin 點擊畫布上的節點
2. 右側屬性面板開啟，預設顯示「屬性設定」分頁
3. Admin 點擊「欄位流」分頁
4. 系統計算該節點的輸入/輸出欄位 Diff
5. 渲染摘要列與 Diff 列表
6. Admin 可使用搜尋框過濾欄位

## 8. 替代流程

- **上游節點未設定**：輸入欄位為空陣列，所有輸出欄位標記為「新增」
- **節點無輸出**：輸出欄位為空陣列，所有輸入欄位標記為「移除」
- **透傳型節點**（filter, dedup 等）：所有欄位標記為「不變」

## 9. 邊界情況

| 場景 | 預期行為 |
|------|---------|
| 輸入輸出完全相同 | 所有欄位標記為「不變」，摘要顯示 `+0 / -0 / N 不變` |
| 欄位數量超過 100 | 列表可捲動，不分頁截斷 |
| 欄位名稱含特殊字元（底線、數字開頭） | 正常顯示 |
| 快速切換節點 | 取消前一個節點的計算，顯示新節點的 Diff |
| `computeNodeOutputColumns` 失敗 | 顯示錯誤提示：「無法計算欄位，請檢查上游節點設定」 |

## 10. 商業規則

| 規則編號 | 說明 |
|----------|------|
| BR-40-1 | 欄位 Diff 為唯讀資訊，不可由此介面修改欄位 |
| BR-40-2 | Diff 計算邏輯必須與 `computeNodeOutputColumns` 一致 |
| BR-40-3 | 搜尋為即時前端過濾（不發 API 請求） |

## 11. 錯誤場景

| 場景 | 系統回應 | 參考 |
|------|---------|------|
| 欄位計算失敗 | 欄位流分頁顯示友善錯誤訊息 | 前端本地處理 |
| 快速切換節點導致 Race Condition | 使用 AbortController / cleanup 確保僅顯示最新結果 | 前端本地處理 |

## 12. 相依性

- **F029（Pipeline 編輯器）**：依賴 `PropertiesPanel` 元件與 `computeNodeOutputColumns` 函式
- **F039（節點欄位 Badge）**：共用 `computeNodeFieldStats` / `node-field-stats.ts`

## 13. 交叉參考

- Pipeline 編輯器基礎：[F029-pipeline-editor.md](F029-pipeline-editor.md)
- 節點欄位 Badge：[F039-node-field-badge.md](F039-node-field-badge.md)
- Badge Hover Tooltip：[F041-badge-hover-tooltip.md](F041-badge-hover-tooltip.md)
- 圖表：[diagrams/F039-node-field-badge.mmd](../diagrams/F039-node-field-badge.mmd)
