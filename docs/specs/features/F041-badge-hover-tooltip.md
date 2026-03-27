---
spec-id: F041
title: Badge Hover Tooltip
feature-id: F041
source-story: US-054
epic: E05
priority: P2
version: "1.0"
date: 2026-03-27
status: Draft
---

# F041: Badge Hover Tooltip

## 1. 功能摘要

當 Admin 將滑鼠 hover 於節點 Badge 上時，顯示一個 Popover Tooltip，呈現該節點類型專屬的欄位變化詳細資訊。Tooltip 包含欄位列表、映射關係、規則摘要等，並提供「點擊查看完整」連結導向屬性面板的欄位流分頁。

## 2. 使用者故事

**As a** Admin（管理者）
**I want** 將滑鼠停留在節點 Badge 上時看到欄位變化的詳細資訊
**So that** 我能在不離開畫布的情況下快速檢視節點的欄位處理細節

## 3. 前置條件

- Admin 已登入且具備 Admin 權限
- Pipeline 編輯器畫布已載入（F029）
- 節點 Badge 已正常顯示（F039）

## 4. 資料模型

### 4.1 Tooltip 內容 Interface

```typescript
/** Tooltip 通用結構 */
interface BadgeTooltipContent {
  nodeType: string;
  title: string;
  sections: TooltipSection[];
  truncated: boolean;       // 是否有被截斷的內容
  totalItemCount: number;   // 完整項目總數
}

/** Tooltip 區段 */
interface TooltipSection {
  label: string;            // 區段標題，例如 "來源欄位"、"映射關係"
  items: TooltipItem[];
}

/** Tooltip 單一項目 */
interface TooltipItem {
  text: string;             // 主要顯示文字
  subtext?: string;         // 次要文字（例如型別、表達式）
  status?: 'added' | 'removed' | 'unchanged' | 'converted';
}

/** Tooltip 定位參數 */
interface TooltipPosition {
  strategy: 'fixed';
  placement: 'bottom';      // 預設下方
  fallbackPlacement: 'top'; // 碰邊界翻轉
  offset: 8;                // 距 Badge 8px
}
```

### 4.2 各節點類型 Tooltip 內容定義

| 節點類型 | 標題 | 內容區段 | 最大項目數 |
|---------|------|---------|-----------|
| `raw_data_extract` | 來源表名 | 前 8 個欄位名稱 | 8 |
| `merge` | 合併結果 | 左右輸入來源+數量、新增/移除/重疊分類 | Diff max 4 |
| `derived_field` | 衍生欄位 | 每個衍生欄位名 + 表達式 | 8 |
| `field_mapping` | 欄位映射 | 前 8 組映射 `source -> target` + 丟棄欄位 | 映射 8 + 丟棄 4 |
| `type_cast` | 型別轉換 | 每個轉換的欄位 + 前後型別 | 8 |
| `conditional` | 條件規則 | 前 3 條規則摘要 | 3 |
| `target_load` | 載入統計 | 對應統計 + 分類覆蓋率進度條 | 8（分類） |

## 5. 元件結構

```
NodeFieldBadge (F039 已有)
  +-- BadgeTooltipPortal (新增)
        +-- BadgeTooltipContainer
              +-- TooltipHeader
              |     +-- title
              +-- TooltipSectionList
              |     +-- TooltipSection (repeat)
              |           +-- section label
              |           +-- TooltipItem (repeat)
              +-- TooltipFooter (條件顯示)
                    +-- "點擊查看完整" link
```

### 5.1 元件職責

| 元件 | 檔案路徑（建議） | 職責 |
|------|------------------|------|
| `BadgeTooltipPortal` | `badge-tooltip.tsx`（新檔） | Portal 容器，使用 `position: fixed` 定位 |
| `BadgeTooltipContainer` | `badge-tooltip.tsx` 內 | Tooltip 主體框架（寬 320px、max-h 400px） |
| `buildTooltipContent` | `badge-tooltip-content.ts`（新檔） | 純函式，根據節點類型產生 `BadgeTooltipContent` |
| `useTooltipPosition` | `use-tooltip-position.ts`（新檔） | 自訂 Hook，計算定位並處理邊界翻轉 |

### 5.2 Tooltip 尺寸與樣式

| 屬性 | 值 |
|------|-----|
| 寬度 | 320px |
| 最大高度 | 400px |
| 背景色 | `#FFFFFF` |
| 邊框 | `1px solid #E5E7EB`（gray-200） |
| 圓角 | 8px |
| 陰影 | `0 4px 12px rgba(0,0,0,0.15)` |
| 內距 | 12px |
| 字體大小 | 主文字 13px、次文字 12px、標題 14px |
| 溢出 | `overflow-y: auto` |

## 6. 驗收標準

### AC-1: Hover 觸發

- **Given** 畫布上有一個已設定的節點，底部顯示 Badge
- **When** Admin 將滑鼠移至 Badge 上方並停留 300ms
- **Then** Badge 下方 8px 處顯示 Tooltip

### AC-2: Hover 消失

- **Given** Tooltip 已顯示
- **When** Admin 將滑鼠移離 Badge 且不進入 Tooltip 區域，經過 200ms
- **Then** Tooltip 消失

### AC-3: 滑入 Tooltip 保持顯示

- **Given** Tooltip 已顯示
- **When** Admin 將滑鼠從 Badge 移入 Tooltip 區域
- **Then** Tooltip 保持顯示，不消失

### AC-4: 從 Tooltip 移出後消失

- **Given** Admin 滑鼠在 Tooltip 區域內
- **When** 滑鼠移出 Tooltip 區域，經過 200ms
- **Then** Tooltip 消失

### AC-5: 單一 Tooltip 限制

- **Given** 節點 A 的 Tooltip 已顯示
- **When** Admin 將滑鼠移至節點 B 的 Badge
- **Then** 節點 A 的 Tooltip 立即消失，300ms 後顯示節點 B 的 Tooltip

### AC-6: Extract 節點 Tooltip

- **Given** 選中的 `raw_data_extract` 節點已選擇來源表 `raw_customer_sync`，該表有 15 個欄位
- **When** Tooltip 顯示
- **Then** 標題為「raw_customer_sync」，列出前 8 個欄位名稱，底部顯示「+7 個欄位... 點擊查看完整」

### AC-7: Merge 節點 Tooltip

- **Given** `merge` 節點左輸入 `客戶基本` 8 欄、右輸入 `交易紀錄` 6 欄、合併輸出 12 欄
- **When** Tooltip 顯示
- **Then** 標題為「合併結果」，顯示三個區段：(1) 左輸入來源+數量、(2) 右輸入來源+數量、(3) 新增/移除/重疊分類（Diff max 4 項）

### AC-8: Derived Field 節點 Tooltip

- **Given** `derived_field` 節點設定了 5 個衍生欄位
- **When** Tooltip 顯示
- **Then** 列出每個衍生欄位名稱 + 其表達式（例如 `full_name: {first_name} + " " + {last_name}`）

### AC-9: Field Mapping 節點 Tooltip

- **Given** `field_mapping` 節點設定了 12 組映射，其中 3 個欄位被丟棄
- **When** Tooltip 顯示
- **Then** 列出前 8 組映射（格式 `source -> target`），接著列出丟棄欄位（max 4），底部顯示截斷提示

### AC-10: Type Cast 節點 Tooltip

- **Given** `type_cast` 節點設定了 6 組型別轉換
- **When** Tooltip 顯示
- **Then** 列出每組轉換的欄位名稱 + 前後型別（例如 `birth_date: VARCHAR -> DATE`）

### AC-11: Conditional 節點 Tooltip

- **Given** `conditional` 節點設定了 5 條規則
- **When** Tooltip 顯示
- **Then** 列出前 3 條規則摘要，底部顯示「+2 條規則... 點擊查看完整」

### AC-12: Target Load 節點 Tooltip

- **Given** `target_load` 節點載入至 `customer_core`，54 個欄位中 20 個已對應
- **When** Tooltip 顯示
- **Then** 標題為「載入至 customer_core」，顯示對應統計，並按分類（A~H）顯示覆蓋率進度條

### AC-13: 邊界翻轉

- **Given** 節點位於畫布底部邊緣附近
- **When** Tooltip 預設位置會超出可視區域
- **Then** Tooltip 自動翻轉至 Badge 上方 8px 處

### AC-14: 點擊查看完整

- **Given** Tooltip 顯示中，底部有「點擊查看完整」連結
- **When** Admin 點擊該連結
- **Then** 選中該節點、開啟屬性面板並切換至「欄位流」分頁（F040），Tooltip 消失

## 7. 主要流程

1. Admin 將滑鼠移至節點 Badge 上方
2. 300ms 後系統顯示 Tooltip
3. 系統根據節點類型產生專屬內容
4. 系統計算 Tooltip 定位（預設下方、碰邊界翻轉）
5. 渲染 Tooltip Portal
6. Admin 可將滑鼠移入 Tooltip 檢視內容
7. Admin 移出後 200ms Tooltip 消失

## 8. 替代流程

- **節點未設定**：Tooltip 顯示「尚未設定」提示，不列出欄位
- **點擊查看完整**：觸發節點選中 + 屬性面板切換（見 AC-14）
- **畫布縮放很小**（Badge 不可見）：不觸發 Tooltip

## 9. 邊界情況

| 場景 | 預期行為 |
|------|---------|
| 快速在多個 Badge 間移動滑鼠 | 每次僅顯示最後停留的 Badge 的 Tooltip |
| Tooltip 內容超過 400px 高度 | Tooltip 內部可捲動 |
| 畫布正在平移或縮放中 | 不觸發 Tooltip |
| 欄位名稱很長（超過 Tooltip 寬度） | 文字以 `text-overflow: ellipsis` 截斷 |
| 節點被刪除時 Tooltip 正在顯示 | Tooltip 立即消失 |
| 進度條覆蓋率為 0% | 顯示空進度條，不隱藏 |

## 10. 互動時序

### 10.1 Hover 計時器邏輯

```
滑鼠進入 Badge → 啟動 300ms 計時器
  |-- 300ms 內移出 → 取消計時器，不顯示
  |-- 300ms 到達 → 顯示 Tooltip

滑鼠離開 Badge → 啟動 200ms 計時器
  |-- 200ms 內進入 Tooltip → 取消計時器，保持顯示
  |-- 200ms 到達 → 隱藏 Tooltip

滑鼠離開 Tooltip → 啟動 200ms 計時器
  |-- 200ms 內回到 Badge 或 Tooltip → 取消計時器，保持顯示
  |-- 200ms 到達 → 隱藏 Tooltip
```

### 10.2 全域 Tooltip 管理

- 使用 React Context 或 Zustand store 管理「目前顯示的 Tooltip nodeId」
- 同一時間最多顯示 1 個 Tooltip
- 新的 Tooltip 觸發時，立即關閉舊的

## 11. 效能考量

| 項目 | 目標 |
|------|------|
| Tooltip 內容計算 | < 50ms（利用 F039 已計算的快取資料） |
| 定位計算 | < 10ms |
| Portal 渲染 | < 16ms（一幀內完成） |

**最佳化策略：**
- Tooltip 內容延遲計算（hover 觸發後才計算，非預先計算所有節點）
- Portal 使用 `React.createPortal` 掛載於 document.body
- 定位使用 `getBoundingClientRect` + `position: fixed`

## 12. 商業規則

| 規則編號 | 說明 |
|----------|------|
| BR-41-1 | 同一時間畫布上最多顯示 1 個 Tooltip |
| BR-41-2 | Tooltip 為唯讀資訊，不可在 Tooltip 內編輯 |
| BR-41-3 | 列表截斷規則：欄位 max 8 項、Diff max 4 項、規則 max 3 項 |
| BR-41-4 | 截斷時必須顯示剩餘數量與「點擊查看完整」連結 |
| BR-41-5 | Tooltip 不得遮擋 Badge 本身 |

## 13. 錯誤場景

| 場景 | 系統回應 | 參考 |
|------|---------|------|
| Tooltip 內容計算失敗 | Tooltip 顯示「無法載入詳細資訊」 | 前端本地處理 |
| 定位計算異常（getBoundingClientRect 回傳 0） | Tooltip 不顯示 | 前端本地處理 |

## 14. 相依性

- **F039（節點欄位 Badge）**：本功能為 F039 Badge 的 hover 擴充
- **F040（Inspector Panel 欄位 Diff）**：「點擊查看完整」連結需導向 F040 的欄位流分頁
- **F029（Pipeline 編輯器）**：依賴畫布與節點選中機制

## 15. 交叉參考

- 節點欄位 Badge：[F039-node-field-badge.md](F039-node-field-badge.md)
- Inspector Panel 欄位 Diff：[F040-field-inspector-diff.md](F040-field-inspector-diff.md)
- Pipeline 編輯器基礎：[F029-pipeline-editor.md](F029-pipeline-editor.md)
- 圖表：[diagrams/F041-badge-hover-tooltip.mmd](../diagrams/F041-badge-hover-tooltip.mmd)
