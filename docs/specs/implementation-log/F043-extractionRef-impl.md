---
type: implementation-log
feature_id: F043
feature_name: ETL 節點執行器 — extractionRef/lookupRef 邏輯參照
status: complete
last_updated: 2026-04-15
---

# F043: extractionRef/lookupRef 邏輯參照 — 實作日誌

## 測試結果摘要

| Scenario ID | 說明 | 狀態 |
|-------------|------|------|
| TS-F043-059 | extractionRef 成功解析 — 使用動態 raw_table_name | PASS |
| TS-F043-060 | extractionRef 查不到，fallback rawTable + warning | PASS |
| TS-F043-061 | extractionRef 查不到且無 rawTable — 節點 failed | PASS |
| TS-F043-062 | 向後相容 — 無 extractionRef，直接用 rawTable | PASS |
| TS-F043-063 | lookupRef 成功解析（單輸入模式） | PASS |
| TS-F043-064 | lookupRef 查不到，fallback lookupSource + warning | PASS |
| TS-F043-065 | lookupRef 查不到且無 lookupSource — 節點 failed | PASS |
| TS-F043-066 | 向後相容 — 無 lookupRef，直接用 lookupSource | PASS |

全部 55 個測試（含既有 47 + 新增 8）均 PASS。

## 異動檔案

| 檔案路徑 | 異動類型 | 說明 |
|----------|---------|------|
| apps/api/src/modules/etl/engine/types.ts | unchanged | NodeExecutionContext 介面不需修改 |
| apps/api/src/modules/etl/engine/handlers/resolve-raw-table.ts | new | 共用 `resolveRawTable()` 函數，ExtractHandler/LookupHandler 共用 |
| apps/api/src/modules/etl/engine/handlers/extract-handler.ts | modified | execute() 開頭呼叫 resolveRawTable() 解析動態表名 |
| apps/api/src/modules/etl/engine/handlers/lookup-handler.ts | modified | legacy mode 中呼叫 resolveRawTable() 解析動態表名 |
| apps/api/src/modules/etl/__tests__/engine-node-executors.spec.ts | modified | 新增 8 個測試場景（TS-F043-059~066） |
| scripts/seed-pipeline-definition.json | modified | 5 個 Extract 節點加 extractionRef，28 個 Lookup 節點加 lookupRef |

## 架構決策

- **共用函數 `resolveRawTable()`**：ExtractHandler 與 LookupHandler 的 ref 解析邏輯完全對稱，抽取為共用函數避免重複
- **Warning 機制**：透過 `console.warn()` 記錄 fallback 警告，測試中用 `vi.spyOn(console, 'warn')` 驗證，不修改 NodeExecutionContext 介面
- **向後相容**：無 extractionRef/lookupRef 欄位時，行為與修改前完全相同（既有測試 TS-F043-001~004 不受影響）
- **SQL 查詢**：使用 `extraction_tasks JOIN datasources` 取得最近一次有效的 `raw_table_name`，以 `last_execution_at DESC NULLS LAST` 排序

## 阻塞問題

無。
