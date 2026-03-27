---
type: implementation-log
feature_id: F039
feature_name: 節點欄位變化統計 Badge
status: complete
last_updated: 2026-03-27
---

# F039: 節點欄位變化統計 Badge — 實作紀錄

## 實作摘要

將 `computeNodeOutputColumns()` 從 `properties-panel.tsx` 提取為獨立模組 `node-field-stats.ts`，新增 `computeNodeFieldStats()` 與 `getBadgeDescriptor()` 純函式。建立 `NodeFieldBadge` 元件與 `useNodeFieldStats` Hook，整合至 `PipelineNode` 節點卡片底部。各節點類型依規格顯示對應格式與色彩的 Badge。

## 測試結果摘要

| Scenario ID | 描述 | 狀態 |
|-------------|------|------|
| TS-F039-001 | raw_data_extract Badge 文字與藍色 | PASS |
| TS-F039-002 | field_mapping Badge (dropUnmapped=true) 紅色 | PASS |
| TS-F039-003 | field_mapping Badge (dropUnmapped=false) 灰色 | PASS |
| TS-F039-004 | derived_field Badge 綠色 | PASS |
| TS-F039-005 | merge Badge 橘色 | PASS |
| TS-F039-006 | target_load Badge 綠色 | PASS |
| TS-F039-007 | type_cast Badge 灰色 | PASS |
| TS-F039-008 | conditional Badge 橘色 | PASS |
| TS-F039-009 | dedup Badge 灰色 | PASS |
| TS-F039-010 | 未設定節點不顯示 Badge | PASS |
| TS-F039-011 | API 錯誤不顯示 Badge | PASS |
| TS-F039-012 | 孤立 transform 節點不顯示 Badge | PASS |
| TS-F039-013 | computeNodeOutputColumns: raw_data_extract | PASS |
| TS-F039-014 | computeNodeOutputColumns: field_mapping dropUnmapped=true | PASS |
| TS-F039-015 | computeNodeOutputColumns: field_mapping dropUnmapped=false | PASS |
| TS-F039-016 | computeNodeOutputColumns: derived_field | PASS |
| TS-F039-017 | computeNodeOutputColumns: merge 聯集去重 | PASS |
| TS-F039-018 | computeNodeOutputColumns: type_cast 透傳 | PASS |
| TS-F039-019 | computeNodeOutputColumns: dedup 透傳 | PASS |
| TS-F039-020 | computeNodeOutputColumns: conditional 透傳 | PASS |
| TS-F039-021 | 遞迴圖遍歷多層 transform 鏈 | PASS |
| TS-F039-022 | 循環圖保護（防無限遞迴） | PASS |

## 新增檔案

| 檔案路徑 | 說明 |
|----------|------|
| `apps/web/src/pages/etl-pipelines/editor/node-field-stats.ts` | 核心純函式模組：computeNodeOutputColumns, computeNodeFieldStats, getBadgeDescriptor, computeNodeFieldDiff, buildTooltipContent |
| `apps/web/src/pages/etl-pipelines/editor/node-field-badge.tsx` | NodeFieldBadge 元件 |
| `apps/web/src/pages/etl-pipelines/editor/use-node-field-stats.ts` | useNodeFieldStats React Hook |
| `apps/web/src/pages/etl-pipelines/editor/badge-tooltip.tsx` | TooltipManagerProvider 與 BadgeTooltipPortal 元件 |
| `apps/web/src/pages/etl-pipelines/editor/field-flow-tab.tsx` | FieldFlowTab 元件（F040 使用） |
| `apps/web/src/pages/etl-pipelines/editor/__tests__/fixtures/pipeline-graph.ts` | 共用 Mock 資料 |
| `apps/web/src/pages/etl-pipelines/editor/__tests__/compute-output-columns.test.ts` | 純函式單元測試 (12 個) |
| `apps/web/src/pages/etl-pipelines/editor/__tests__/node-badge.test.ts` | Badge 渲染測試 (12 個) |

## 修改檔案

| 檔案路徑 | 變更類型 | 說明 |
|----------|---------|------|
| `apps/web/src/pages/etl-pipelines/editor/pipeline-node.tsx` | modified | 整合 NodeFieldBadge + useNodeFieldStats + Tooltip hover |
| `apps/web/src/pages/etl-pipelines/editor/pipeline-editor-page.tsx` | modified | 引入 TooltipManagerProvider 包裹 ReactFlow |
| `apps/web/src/pages/etl-pipelines/editor/properties-panel.tsx` | modified | 移除本地 computeNodeOutputColumns，改用 node-field-stats 模組；新增分頁 UI |

## 架構決策

- `computeNodeOutputColumns` 從 properties-panel.tsx 提取至 node-field-stats.ts，改為直接遞迴（而非原本的「從 parent 開始」語意），所有節點類型（包含 target_load）均可直接調用
- Badge 使用 `useReactFlow()` 在 PipelineNode 內部取得完整 nodes/edges，無需透過 props 傳遞
- Tooltip 使用 React Context 實現全域單例管理（同一時間最多 1 個 Tooltip）

## 開放問題

- OQ-F039-001：`dropUnmapped=false` 時 Badge 文字格式，目前實作為 `N → M` 灰色顯示
- OQ-F039-002：`dropUnmapped=false` 時欄位改名行為，目前實作為就地重命名（sourceColumn 位置替換為 targetColumn）
