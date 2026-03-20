---
type: implementation-log
feature_id: F029
feature_name: 視覺化轉換編輯器（前端）
status: complete
last_updated: 2026-03-20
---

# F029: 視覺化轉換編輯器 — 前端實作日誌

## 測試結果摘要

| Scenario ID | 說明 | 狀態 |
|-------------|------|------|
| TS-F029-029-01 | Extract -> Extract 連線阻止 | PASS |
| TS-F029-029-02 | Load -> 任何節點連線阻止（Load 為終端） | PASS |
| TS-F029-029-03 | 任何節點 -> Extract 連線阻止（Extract 為起點） | PASS |
| TS-F029-029-04 | Extract -> Transform 連線允許 | PASS |
| TS-F029-029-05 | Transform -> Transform 連線允許 | PASS |
| TS-F029-029-06 | Transform -> Load 連線允許 | PASS |
| TS-F029-029-07 | Extract -> Load 連線允許 | PASS |
| TS-F029-030 | 未儲存離開確認（beforeunload + navigate guard） | PASS |
| TS-F029-031-01 | 儲存按鈕存在且文字正確 | PASS |
| TS-F029-031-02 | 點擊儲存呼叫 savePipelineDefinition API | PASS |
| TS-F029-031-03 | 儲存成功顯示 Toast | PASS |

共 460 個前端測試通過（439 個既有 + 21 個 F029 新增）。

## 變更檔案

### 新增

| 檔案 | 說明 |
|------|------|
| `apps/web/src/pages/etl-pipelines/editor/index.ts` | 編輯器模組 barrel export |
| `apps/web/src/pages/etl-pipelines/editor/pipeline-editor-page.tsx` | 編輯器主頁面（三欄佈局、React Flow 畫布、拖放、儲存、未儲存警告） |
| `apps/web/src/pages/etl-pipelines/editor/node-types.ts` | 節點類型定義（15 種節點）、分類顏色、連線驗證規則 |
| `apps/web/src/pages/etl-pipelines/editor/pipeline-node.tsx` | React Flow 自訂節點元件（含 Handle、分類色彩、選中狀態） |
| `apps/web/src/pages/etl-pipelines/editor/toolbox.tsx` | 左側工具箱元件（手風琴分類、拖拉支援） |
| `apps/web/src/pages/etl-pipelines/editor/properties-panel.tsx` | 右側屬性面板（Extract/NULL Handler/格式轉換/型別轉換/Load 專屬表單） |
| `apps/web/src/pages/etl-pipelines/__tests__/pipeline-editor-page.test.tsx` | 編輯器前端測試（21 個測試案例） |

### 修改

| 檔案 | 說明 |
|------|------|
| `apps/web/src/api/etl-pipelines.ts` | 新增 `getPipelineDefinition`、`savePipelineDefinition`、`getRawTables` API 函式 |
| `apps/web/src/App.tsx` | 新增 `/etl-pipelines/:id/editor` 路由 |
| `apps/web/src/pages/etl-pipelines/pipeline-list-page.tsx` | 新增「編輯」按鈕欄位導向編輯器頁面 |
| `apps/web/package.json` | 新增 `@xyflow/react` 依賴（React Flow v12） |

## 實作決策與注意事項

1. **React Flow v12**：使用 `@xyflow/react` 套件（v12 命名空間），而非舊版 `reactflow`。
2. **未儲存離開保護**：使用 `beforeunload` event + 自訂 `safeNavigate()` 函式，避免 `useBlocker` 對 data router 的依賴（`MemoryRouter` 在測試環境中不支援 `useBlocker`）。
3. **連線驗證規則**：在 `node-types.ts` 的 `canConnect()` 中實作：
   - Extract 節點不可作為連線目標（僅為起點）
   - Load 節點不可作為連線來源（僅為終端）
   - Extract -> Extract 不允許
4. **節點卡片樣式**：嚴格依照原型 `18-pipeline-editor.html`：
   - `bg-white rounded-lg shadow-md border-l-4 px-4 py-3 w-[180px]`
   - Extract: `border-l-blue-500`，Transform: `border-l-amber-500`，Load: `border-l-green-500`
   - 選中狀態：`ring-2 ring-[#2563EB]`
5. **工具箱**：手風琴式分類，支援拖拉（`draggable` + `dataTransfer`），項目數量標籤（Extract: 1, Transform: 13, Load: 1）。
6. **屬性面板**：根據選中節點類型切換表單，支援：
   - Extract：Raw Data 來源表下拉選單
   - NULL 處理：欄位 chips + 策略下拉 + 預設值
   - 格式轉換：規則卡片（欄位/格式類型/來源格式/目標格式）
   - 型別轉換：轉換清單（欄位/來源型別/目標型別）
   - Load：目標表選擇 + 欄位對應表格 + ETL 追蹤欄位
7. **空畫布提示**：`nodes.length === 0` 時顯示居中提示，與原型一致。
8. **Toast 通知**：儲存成功後顯示 3 秒自動消失的 Toast。
9. **測試策略**：使用 mock 的 `@xyflow/react` 避免 jsdom 對 SVG/Canvas 支援不足的問題，連線驗證邏輯直接測試 `canConnect()` 純函式。
