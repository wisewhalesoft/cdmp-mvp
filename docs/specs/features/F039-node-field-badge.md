---
spec-id: F039
title: 節點欄位變化統計 Badge
feature-id: F039
source-story: US-052
epic: E05
priority: P0-MVP
version: "1.0"
date: 2026-03-27
status: Draft
---

# F039: 節點欄位變化統計 Badge

## 1. 功能摘要

在 Pipeline 編輯器中，每個 React Flow 節點卡片底部顯示一行統計 Badge，摘要該節點對資料欄位的變化（新增、移除、轉換、合併等）。Badge 根據節點類型呈現不同格式與色彩，讓 Admin 不需點開屬性面板即可掌握各節點的欄位流向概況。

## 2. 使用者故事

**As a** Admin（管理者）
**I want** 在 Pipeline 畫布上的每個節點卡片看到欄位變化的統計摘要
**So that** 我能快速瞭解各節點對欄位的影響，無需逐一點開屬性面板

## 3. 前置條件

- Admin 已登入且具備 Admin 權限
- Pipeline 編輯器畫布已載入（F029）
- `computeNodeOutputColumns()` 函式可用於計算節點輸出欄位

## 4. 資料模型

### 4.1 Badge 計算結果 Interface

```typescript
/** 節點欄位統計摘要 — Badge 渲染所需的資料 */
interface NodeFieldStats {
  nodeType: string;
  inputFieldCount: number;
  outputFieldCount: number;
  /** 節點類型專屬的 metadata */
  meta: NodeFieldStatsMeta;
}

/** 各節點類型的專屬 metadata（Discriminated Union） */
type NodeFieldStatsMeta =
  | { type: 'raw_data_extract'; columnCount: number }
  | { type: 'merge'; leftCount: number; rightCount: number; outputCount: number }
  | { type: 'derived_field'; derivedCount: number }
  | { type: 'field_mapping'; inputCount: number; outputCount: number; droppedCount: number }
  | { type: 'type_cast'; castCount: number }
  | { type: 'conditional'; ruleCount: number }
  | { type: 'target_load'; loadCount: number }
  | { type: 'dedup'; outputCount: number }
  | { type: 'passthrough'; outputCount: number }; // filter, null_handler 等透傳型節點

/** Badge 渲染描述 */
interface BadgeDescriptor {
  label: string;       // 例如 "→ 12 欄位"、"左 8 + 右 6 → 14"
  colorClass: string;  // Tailwind class，例如 "bg-blue-50 text-blue-700"
  colorHex: string;    // 用於 inline style fallback，例如 "#3B82F6"
}
```

### 4.2 色彩系統

| 語意     | HEX 色碼   | Tailwind Class              | 適用節點類型                        |
|----------|------------|-----------------------------|------------------------------------|
| 新增     | #22C55E    | `bg-green-50 text-green-700` | `derived_field`, `target_load`, `field_mapping`（無移除時） |
| 移除     | #EF4444    | `bg-red-50 text-red-700`     | `field_mapping`（有移除時）         |
| 合併     | #F59E0B    | `bg-amber-50 text-amber-700` | `merge`, `conditional`             |
| 透傳     | #9CA3AF    | `bg-gray-50 text-gray-600`   | `type_cast`, `dedup`, `filter` 等  |
| 擷取     | #3B82F6    | `bg-blue-50 text-blue-700`   | `raw_data_extract`                 |

## 5. 元件結構

```
PipelineNode (修改既有元件)
  +-- NodeFieldBadge (新增子元件)
        +-- badgeDescriptor: BadgeDescriptor
```

### 5.1 元件職責

| 元件 | 檔案路徑（建議） | 職責 |
|------|------------------|------|
| `PipelineNode` | `pipeline-node.tsx` | 既有節點卡片元件，新增 Badge 渲染區域 |
| `NodeFieldBadge` | `node-field-badge.tsx`（新檔） | 接收 `BadgeDescriptor`，渲染單行 Badge |
| `computeNodeFieldStats` | `node-field-stats.ts`（新檔） | 純函式，計算 `NodeFieldStats` |
| `getBadgeDescriptor` | `node-field-stats.ts` | 純函式，將 `NodeFieldStats` 轉換為 `BadgeDescriptor` |

### 5.2 資料流

```
React Flow nodes/edges (state)
  |
  v
useNodeFieldStats(nodeId, nodes, edges)   <-- 自訂 Hook
  |-- 呼叫 computeNodeOutputColumns() 取得輸出欄位
  |-- 呼叫 computeNodeOutputColumns() 取得輸入欄位（上游節點）
  |-- 計算 NodeFieldStats
  |-- 轉換為 BadgeDescriptor
  |
  v
PipelineNode props.data.__badgeDescriptor
  |
  v
NodeFieldBadge 渲染
```

## 6. 驗收標準

### AC-1: Extract 節點 Badge

- **Given** 畫布上有一個 `raw_data_extract` 節點，已選擇來源表且該表有 12 個欄位
- **When** 畫布渲染完成
- **Then** 節點底部顯示藍色 Badge，文字為 `-> 12 欄位`

### AC-2: Merge 節點 Badge

- **Given** 畫布上有一個 `merge` 節點，左輸入有 8 個欄位，右輸入有 6 個欄位，合併輸出 14 個欄位
- **When** 畫布渲染完成
- **Then** 節點底部顯示橘色 Badge，文字為 `左 8 + 右 6 -> 14`

### AC-3: Derived Field 節點 Badge

- **Given** 畫布上有一個 `derived_field` 節點，設定了 3 個衍生欄位
- **When** 畫布渲染完成
- **Then** 節點底部顯示綠色 Badge，文字為 `+3 衍生欄位`

### AC-4: Field Mapping 節點 Badge（有移除）

- **Given** 畫布上有一個 `field_mapping` 節點，輸入 10 個欄位，輸出 8 個欄位（移除 2 個）
- **When** 畫布渲染完成
- **Then** 節點底部顯示紅色 Badge，文字為 `10 -> 8 (-2)`

### AC-5: Field Mapping 節點 Badge（無移除）

- **Given** 畫布上有一個 `field_mapping` 節點，輸入 10 個欄位，輸出 12 個欄位（僅新增映射）
- **When** 畫布渲染完成
- **Then** 節點底部顯示綠色 Badge，文字為 `10 -> 12`

### AC-6: Type Cast 節點 Badge

- **Given** 畫布上有一個 `type_cast` 節點，設定了 5 組型別轉換
- **When** 畫布渲染完成
- **Then** 節點底部顯示灰色 Badge，文字為 `5 型別轉換`

### AC-7: Conditional 節點 Badge

- **Given** 畫布上有一個 `conditional` 節點，設定了 4 條規則
- **When** 畫布渲染完成
- **Then** 節點底部顯示橘色 Badge，文字為 `4 條件規則`

### AC-8: Target Load 節點 Badge

- **Given** 畫布上有一個 `target_load` 節點，載入 20 個欄位
- **When** 畫布渲染完成
- **Then** 節點底部顯示綠色 Badge，文字為 `載入 20 欄位`

### AC-9: Dedup 節點 Badge

- **Given** 畫布上有一個 `dedup` 節點，輸出 15 個欄位
- **When** 畫布渲染完成
- **Then** 節點底部顯示灰色 Badge，文字為 `-> 15`

### AC-10: 未設定節點不顯示 Badge

- **Given** 畫布上有一個剛拖入的 `raw_data_extract` 節點，尚未選擇來源表
- **When** 畫布渲染完成
- **Then** 節點底部不顯示 Badge（或顯示淡灰虛線佔位）

### AC-11: Badge 即時更新

- **Given** 畫布上有一個 `derived_field` 節點，目前顯示 `+2 衍生欄位`
- **When** Admin 在屬性面板新增第 3 個衍生欄位
- **Then** Badge 即時更新為 `+3 衍生欄位`，不需手動刷新

## 7. 主要流程

1. 畫布載入時，系統對每個節點計算 `NodeFieldStats`
2. 將 `NodeFieldStats` 轉換為 `BadgeDescriptor`
3. `PipelineNode` 渲染時在卡片底部顯示 `NodeFieldBadge`
4. 當節點資料或連線變更時，受影響的節點重新計算

## 8. 替代流程

- **上游節點尚未設定**：Badge 顯示 `-> 0 欄位` 或不顯示
- **API 呼叫失敗**（例如取得 raw table columns 失敗）：Badge 不顯示，不影響其他功能
- **循環連線**（理論上不會發生，有 `canConnect` 防護）：`computeNodeOutputColumns` 的 `visited` Set 防止無限遞迴，Badge 顯示 `-> 0`

## 9. 邊界情況

| 場景 | 預期行為 |
|------|---------|
| 節點剛拖入畫布，尚無任何設定 | 不顯示 Badge 或顯示 `--` 佔位符 |
| 欄位數為 0 | 顯示 `-> 0 欄位` |
| 欄位數超過 999 | 顯示實際數字，不截斷 |
| `computeNodeOutputColumns` 回傳 Promise rejection | Badge 靜默隱藏，console.warn 記錄 |
| 大量節點（>50）同時計算 | 使用 debounce（300ms）避免效能問題 |
| Merge 節點只有單邊輸入 | 顯示 `左 N + 右 0 -> N` 或 `左 0 + 右 M -> M` |

## 10. 效能考量

| 項目 | 目標 |
|------|------|
| 單節點 Badge 計算延遲 | < 50ms（本地計算，不含 API） |
| 包含 API 呼叫（extract 節點） | < 500ms（利用既有快取） |
| 全畫布 Badge 初始化（20 節點） | < 2 秒 |
| 節點變更後 Badge 更新 | < 300ms（debounce 後） |

**最佳化策略：**
- `computeNodeOutputColumns` 結果以 `nodeId + data hash` 為 key 進行 memo 快取
- 連線變更時僅重新計算受影響的下游節點鏈
- 使用 `useMemo` 或 `React.memo` 防止不必要的重渲染

## 11. 商業規則

| 規則編號 | 說明 |
|----------|------|
| BR-39-1 | Badge 為唯讀資訊顯示，不可由使用者直接編輯 |
| BR-39-2 | Badge 的計算邏輯必須與 `computeNodeOutputColumns` 保持一致 |
| BR-39-3 | Badge 計算失敗不得阻斷使用者的編輯操作 |
| BR-39-4 | Badge 色彩必須與色彩系統定義一致（第 4.2 節） |

## 12. 錯誤場景

| 場景 | 系統回應 | 參考 |
|------|---------|------|
| `computeNodeOutputColumns` 拋出例外 | Badge 靜默隱藏，console.warn 記錄錯誤 | 前端本地處理 |
| raw table columns API 失敗 | Extract 節點 Badge 不顯示 | error-handling.md#etl-pipeline-errors |
| 節點 data 結構異常（缺少預期欄位） | Badge 不顯示，降級為安全模式 | 前端本地處理 |

## 13. 相依性

- **F029（Pipeline 編輯器）**：本功能為 F029 的擴充，依賴 `PipelineNode` 元件與 `computeNodeOutputColumns` 函式
- **F036（目標表）**：`target_load` 節點 Badge 需要目標表欄位資訊
- **React Flow**：`@xyflow/react` — 節點渲染機制

## 14. 交叉參考

- Pipeline 編輯器基礎：[F029-pipeline-editor.md](F029-pipeline-editor.md)
- Inspector Panel 欄位 Diff：[F040-field-inspector-diff.md](F040-field-inspector-diff.md)
- Badge Hover Tooltip：[F041-badge-hover-tooltip.md](F041-badge-hover-tooltip.md)
- 資料模型：[data-model.md](../data-model.md)
- 圖表：[diagrams/F039-node-field-badge.mmd](../diagrams/F039-node-field-badge.mmd)
