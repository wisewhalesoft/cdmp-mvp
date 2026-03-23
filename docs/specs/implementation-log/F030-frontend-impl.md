---
type: implementation-log
feature_id: F030
feature_name: 執行 Pipeline（前端）
status: complete
last_updated: 2026-03-23
---

# F030: 執行 Pipeline（前端） — 實作日誌

## 修改檔案

| 檔案 | 修改內容 |
|------|---------|
| `packages/shared/src/index.ts` | 新增 `ExecutePipelineResponse`, `TestPipelineResponse`, `PipelineProgressResponse` |
| `apps/web/src/api/etl-pipelines.ts` | 新增 `executePipeline()`, `testPipeline()`, `getPipelineProgress()` |
| `apps/web/src/pages/etl-pipelines/pipeline-list-page.tsx` | 操作欄 icon buttons、running 進度條、5 秒 polling |

## UI 元件對照（原型 17-pipeline-management.html）

### 操作欄按鈕（依 pipeline.status）

| Status | 編輯 | 執行/測試 | Toggle | 日誌 | 刪除 |
|--------|------|----------|--------|------|------|
| active | Pencil (hover:blue) | Play (hover:blue) | ToggleRight (green) | FileText | Trash2 |
| draft | Pencil (hover:blue) | Play (hover:amber) | ToggleLeft (disabled+tooltip) | FileText | Trash2 |
| running | Pencil (disabled) | Play (disabled) | ToggleRight (disabled) | FileText | Trash2 (disabled) |
| failed | Pencil (hover:blue) | RotateCcw (amber) | ToggleRight (green) | FileText | Trash2 |
| disabled | Pencil (hover:blue) | Play (hover:blue) | ToggleLeft (gray) | FileText | Trash2 |

### Running 進度列

- 獨立 `<tr>` 行：`bg-blue-50/30`, `colSpan={10}`
- 進度條：`h-1.5`, `bg-gray-200` 背景, `bg-blue-600` 填充, `animate-pulse`
- 百分比：`text-xs font-medium text-blue-600`
- 節點資訊：`目前節點：{currentNodeName}（{processedCount}/{totalCount} 筆）`

### Polling 機制

- 觸發條件：列表中有 `status='running'` 的 pipeline
- 間隔：5 秒 (`setInterval(poll, 5000)`)
- 停止條件：所有 running pipeline 的 progress.status 為 `completed` 或 `failed` 時重新 fetchData
- 清理：useEffect cleanup 清除 interval
