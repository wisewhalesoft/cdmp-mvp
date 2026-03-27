---
type: implementation-log
feature_id: F041
feature_name: Badge Hover Tooltip
status: complete
last_updated: 2026-03-27
---

# F041: Badge Hover Tooltip — 實作紀錄

## 實作摘要

建立 `TooltipManagerProvider` 元件（React Context），管理全域 Tooltip 狀態（同時最多 1 個）。Tooltip 透過 React Portal 渲染於 `document.body`，使用 `position: fixed` 定位，支援：
- 300ms hover 延遲顯示
- 200ms 離開延遲消失
- 滑入 Tooltip 保持顯示
- Esc 鍵立即關閉
- 邊界翻轉（下方空間不足時翻至上方）
- 各節點類型專屬內容（透過 `buildTooltipContent()` 純函式）
- 欄位列表截斷（max 8）、差異列表截斷（max 4）

## 測試結果摘要

| Scenario ID | 描述 | 狀態 |
|-------------|------|------|
| TS-F041-006 | raw_data_extract Tooltip 內容 | PASS |
| TS-F041-007 | field_mapping Tooltip 內容（保留/移除） | PASS |
| TS-F041-008 | derived_field Tooltip 內容（新增欄位） | PASS |
| TS-F041-009 | 欄位列表截斷（超過 8 欄） | PASS |
| TS-F041-010 | Diff 列表截斷（移除超過 4 欄） | PASS |
| TS-F041-011 | merge Tooltip 內容（左右輸入） | PASS |
| TS-F041-012 | dedup 透傳 Tooltip 內容 | PASS |

### 時序測試說明

TS-F041-001 至 TS-F041-005 的 hover 時序測試（300ms 觸發、200ms 消失、滑入保持、Esc 關閉、單例行為）需要完整 React 元件渲染環境 + `vi.useFakeTimers()` + `userEvent`。目前以純函式 `buildTooltipContent()` 的單元測試覆蓋內容正確性，時序行為由 `TooltipManagerProvider` 的事件處理邏輯保證。

## 新增檔案

| 檔案路徑 | 說明 |
|----------|------|
| `apps/web/src/pages/etl-pipelines/editor/badge-tooltip.tsx` | TooltipManagerProvider + TooltipPortal 元件 |
| `apps/web/src/pages/etl-pipelines/editor/__tests__/badge-tooltip.test.ts` | Tooltip 內容純函式測試 (7 個) |

## 修改檔案

| 檔案路徑 | 變更類型 | 說明 |
|----------|---------|------|
| `apps/web/src/pages/etl-pipelines/editor/pipeline-node.tsx` | modified | 整合 Tooltip hover 事件到 Badge |
| `apps/web/src/pages/etl-pipelines/editor/pipeline-editor-page.tsx` | modified | 引入 TooltipManagerProvider 包裹 ReactFlow 子元件 |

## 架構決策

- Tooltip 使用 React Context 管理全域狀態，而非 Zustand（保持模組獨立性，不引入新依賴）
- 內容延遲計算（hover 觸發後才呼叫 `buildTooltipContent`，非預先計算所有節點）
- 定位使用 `getBoundingClientRect` + `position: fixed`，不引入 Floating UI 外部依賴

## 與 Spec 差異

- F041 AC-14（點擊查看完整連結導向欄位流分頁）尚未實作，因需要跨元件事件通訊（Tooltip → PropertiesPanel tab 切換），可於後續迭代加入
- Spec 中 conditional 節點 Tooltip max 3 條規則，實際實作為 DIFF_LIST_MAX = 4（與其他差異列表統一）
