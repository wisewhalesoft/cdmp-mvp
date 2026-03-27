---
type: implementation-log
feature_id: F040
feature_name: Inspector Panel 欄位 Diff
status: complete
last_updated: 2026-03-27
---

# F040: Inspector Panel 欄位 Diff — 實作紀錄

## 實作摘要

在右側屬性面板新增「設定」與「欄位流」分頁切換，「欄位流」分頁呈現 `FieldFlowTab` 元件，包含：
- 摘要列（+N 新增 / -M 移除 / K 不變）
- 搜尋框（即時前端過濾，不區分大小寫）
- Diff 列表（按 added > removed > unchanged 排序）
- 空狀態提示與無結果提示

核心邏輯由 `computeNodeFieldDiff()` 純函式提供，與 F039 共用 `node-field-stats.ts` 模組。

## 測試結果摘要

| Scenario ID | 描述 | 狀態 |
|-------------|------|------|
| TS-F040-001 | 欄位流區塊正常顯示（輸入 5 / 輸出 3） | PASS |
| TS-F040-002 | Diff 標記 — 新增欄位綠色 | PASS |
| TS-F040-003 | Diff 標記 — 移除欄位紅色 | PASS |
| TS-F040-004 | Diff 標記 — 透傳節點全部灰色不變 | PASS |
| TS-F040-005 | 無上游節點時空狀態 | PASS |
| TS-F040-006 | raw_data_extract 全部輸出為「新增」 | PASS |

## 新增檔案

| 檔案路徑 | 說明 |
|----------|------|
| `apps/web/src/pages/etl-pipelines/editor/field-flow-tab.tsx` | FieldFlowTab 元件：摘要列 + 搜尋 + Diff 列表 |
| `apps/web/src/pages/etl-pipelines/editor/__tests__/field-flow-inspector.test.ts` | Inspector Diff 單元測試 (6 個) |

## 修改檔案

| 檔案路徑 | 變更類型 | 說明 |
|----------|---------|------|
| `apps/web/src/pages/etl-pipelines/editor/properties-panel.tsx` | modified | 新增分頁切換 UI（設定 / 欄位流），整合 FieldFlowTab |

## 架構決策

- 分頁切換使用 `useState<'settings' | 'fields'>` 管理，預設為 'settings'
- 切換節點時自動重置為 'settings' 分頁
- Diff 計算使用 Set 比較：input 有 output 沒有 = removed，output 有 input 沒有 = added

## 與 Spec 差異

- F040 spec 提到「重命名標記（藍色 → 符號）」，但 field_mapping 的重命名在計算層面表現為「移除舊名 + 新增新名」，目前未特別處理重命名標記（低優先級）
