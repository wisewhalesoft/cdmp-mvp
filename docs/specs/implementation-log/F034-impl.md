---
type: implementation-log
feature_id: F034
feature_name: 刪除 Pipeline
status: complete
last_updated: 2026-03-24
---

# F034: 刪除 Pipeline — 實作紀錄

## 測試結果摘要

### 後端 E2E（12/12 PASS）

| Scenario ID | 說明 | 狀態 |
|-------------|------|------|
| TS-F034-001 | 成功軟刪除 active Pipeline | PASS |
| TS-F034-002 | 成功軟刪除 failed Pipeline | PASS |
| TS-F034-003 | 成功軟刪除 disabled Pipeline | PASS |
| TS-F034-004 | 成功軟刪除 draft Pipeline | PASS |
| TS-F034-005 | 刪除後從列表消失 | PASS |
| TS-F034-006 | 日誌保留（軟刪除後仍可查詢） | PASS |
| TS-F034-007 | 名稱唯一性在軟刪除後釋放 | PASS |
| TS-F034-008 | 執行中 Pipeline 不可刪除 → 409 | PASS |
| TS-F034-009 | 已軟刪除的 Pipeline 再次刪除 → 404 | PASS |
| TS-F034-010 | 不存在的 Pipeline → 404 | PASS |
| TS-F034-011 | User 角色無權刪除 → 403 | PASS |
| TS-F034-012 | 未登入（無 Token）→ 401 | PASS |

### 前端 Unit（3/3 PASS）

| Scenario ID | 說明 | 狀態 |
|-------------|------|------|
| TS-F034-013 | 確認對話框顯示內容正確 | PASS |
| TS-F034-014 | 點擊取消不刪除 Pipeline | PASS |
| TS-F034-015 | 執行中 Pipeline 刪除按鈕停用 | PASS |

## 變更檔案

### 後端

| 檔案路徑 | 變更類型 | 說明 |
|----------|----------|------|
| apps/api/src/modules/etl/etl-pipeline.controller.ts | modified | 新增 `Delete` decorator import；新增 `DELETE :id` 路由呼叫 `deletePipeline()` |
| apps/api/src/modules/etl/etl-pipeline.service.ts | modified | 新增 `deletePipeline(pipelineId)` 方法：查詢 pipeline（排除軟刪除）→ 檢查 running 狀態 → 設定 `deleted_at = new Date()` |
| apps/api/test/etl-pipeline.e2e-spec.ts | modified | 新增 `describe('F034: Delete Pipeline E2E')` 區塊，含 12 個測試場景 |

### 前端

| 檔案路徑 | 變更類型 | 說明 |
|----------|----------|------|
| apps/web/src/api/etl-pipelines.ts | modified | 新增 `deletePipeline()` API 函式 |
| apps/web/src/pages/etl-pipelines/pipeline-list-page.tsx | modified | 新增刪除狀態管理（deleteTarget, deleting）、handleDeleteClick/handleDeleteConfirm/handleDeleteCancel handler、刪除確認對話框（嚴格遵循 prototypes/17-pipeline-management.html） |
| apps/web/src/pages/etl-pipelines/__tests__/pipeline-list-page.test.tsx | modified | 新增 3 個 F034 前端測試 |

### Shared

| 檔案路徑 | 變更類型 | 說明 |
|----------|----------|------|
| packages/shared/src/index.ts | modified | 新增 `DeletePipelineResponse` 介面 |

## 設計決策

| 決策 | 理由 |
|------|------|
| HTTP 200（非 204） | 規格明確定義回應 `{ "message": "Pipeline 已刪除" }`，需要 body |
| Service 層檢查 running 狀態 | 保持 Controller 薄層，業務邏輯集中在 Service |
| 對話框內嵌不獨立元件 | 邏輯簡單且僅此處使用，無需抽取 |
| 排程引擎/名稱唯一性無需改動 | 現有查詢已包含 `deleted_at IS NULL` 條件 |
| 刪除按鈕 tooltip 使用「執行中無法刪除」 | 遵循 prototypes/17-pipeline-management.html 原型定義 |

## 原型遵循確認

刪除確認對話框嚴格遵循 `prototypes/17-pipeline-management.html` line 731-756：
- 寬度 `w-[440px]`，圓角 `rounded-xl shadow-xl`
- 標題紅色 `text-red-500`：「確認刪除 Pipeline」
- 左側 `AlertTriangle` icon + `bg-red-50 rounded-full` 背景
- 內文：「確定要刪除 Pipeline「{name}」嗎？」+ 「刪除後排程將停止，歷史日誌將保留。」
- 「取消」按鈕 + 「確認刪除」紅色按鈕
- 半透明遮罩 `bg-black/50`，點擊遮罩可關閉
