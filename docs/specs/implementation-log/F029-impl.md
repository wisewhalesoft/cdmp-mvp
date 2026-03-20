---
type: implementation-log
feature_id: F029
feature_name: 視覺化轉換編輯器（後端 API）
status: complete
last_updated: 2026-03-20
---

# F029: 視覺化轉換編輯器（後端 API） — 實作日誌

## 測試結果摘要

| Scenario ID | 說明 | 狀態 |
|-------------|------|------|
| TS-F029-001 | 取得空定義（初始狀態） | PASS |
| TS-F029-002 | 取得含節點與連線的定義 | PASS |
| TS-F029-003 | 儲存空定義（草稿允許） | PASS |
| TS-F029-004 | 儲存含節點與連線的定義並更新 step_count | PASS |
| TS-F029-005 | 儲存含 changeSummary 的定義 | PASS |
| TS-F029-006 | 儲存含不完整設定的節點（草稿允許） | PASS |
| TS-F029-007 | 覆寫既有定義 | PASS |
| TS-F029-008 | 取得可用 raw data 表清單 | PASS |
| TS-F029-009 | 空 raw data 清單（無已執行任務） | PASS |
| TS-F029-010 | 非法連線：Load → Extract | PASS |
| TS-F029-011 | 非法連線：Load → Transform | PASS |
| TS-F029-012 | 非法連線：Extract → Load（跳過 Transform） | PASS |
| TS-F029-013 | 非法連線：逆向（循環）連線 | PASS |
| TS-F029-014 | 非法連線：Load → Load | PASS |
| TS-F029-015 | 合法連線：Extract → Transform | PASS |
| TS-F029-016 | 合法連線：Transform → Transform | PASS |
| TS-F029-017 | 合法連線：Transform → Load | PASS |
| TS-F029-018 | 重複 Extract 來源（同一 rawTableId 出現兩次） | PASS |
| TS-F029-019 | transform-merge JSONB 結構儲存與還原 | PASS |
| TS-F029-020 | transform-filter JSONB 結構儲存與還原 | PASS |
| TS-F029-021 | transform-masking JSONB 結構儲存與還原 | PASS |
| TS-F029-022 | GET Pipeline 不存在 → 404 | PASS |
| TS-F029-023 | PUT Pipeline 不存在 → 404 | PASS |
| TS-F029-024 | User 角色無權呼叫 GET definition → 403 | PASS |
| TS-F029-025 | User 角色無權呼叫 PUT definition → 403 | PASS |
| TS-F029-026 | 未登入（無 Token）→ 401 | PASS |
| TS-F029-027 | changeSummary 500 字元（邊界值，接受） | PASS |
| TS-F029-028 | changeSummary 501 字元（超出上限，拒絕） | PASS |
| TS-F029-029 ~ 031 | 前端場景（未儲存離開確認、非法連線視覺提示） | SKIP（前端實作範疇） |

共 67 個 E2E 測試通過（22 個 F027 + 17 個 F028 + 28 個 F029）。全部 328 個 E2E 測試無迴歸。

## 變更檔案

### 新增

| 檔案 | 說明 |
|------|------|
| `apps/api/src/modules/etl/dto/save-definition.dto.ts` | SaveDefinitionDto（definition 物件必填、changeSummary 選填 MaxLength(500)） |

### 修改

| 檔案 | 說明 |
|------|------|
| `apps/api/src/common/errors/error-codes.ts` | 新增 PIPELINE_INVALID_CONNECTION 錯誤碼與訊息 |
| `packages/shared/src/index.ts` | 新增 F029 型別（PipelineNode、PipelineEdge、PipelineDefinition、GetDefinitionResponse、SaveDefinitionRequest/Response、RawTableItem、RawTablesResponse）及 PIPELINE_INVALID_CONNECTION 錯誤碼 |
| `apps/api/src/modules/etl/etl-pipeline.service.ts` | 新增 getDefinition()、saveDefinition()、validateConnections()、detectCycle()、validateDuplicateExtractSources() 方法 |
| `apps/api/src/modules/etl/etl-pipeline.controller.ts` | 新增 GET :id/definition、PUT :id/definition 端點 |
| `apps/api/src/modules/extraction-task/extraction-task.controller.ts` | 新增 GET raw-tables 端點 |
| `apps/api/src/modules/extraction-task/extraction-task.service.ts` | 新增 getRawTables() 方法 |
| `apps/api/test/etl-pipeline.e2e-spec.ts` | 新增 F029 describe block（28 個測試場景） |

## 實作決策與注意事項

1. **連線驗證策略**：後端在 PUT definition 時執行完整連線驗證（BR-2 ~ BR-5），包含節點類型規則檢查與 DFS 循環偵測。前端亦可在拖拉時做即時阻擋，但後端為最終防線。
2. **節點類型分類**：`getNodeCategory()` 將所有 `transform-*` 前綴的節點類型歸類為 transform，避免需要列舉全部 13 種 Transform 節點。
3. **循環偵測**：使用 DFS + inStack 演算法偵測有向圖中的循環，時間複雜度 O(V+E)。
4. **重複 Extract 來源檢查**：在儲存前檢查所有 Extract 節點的 `rawTableId` 是否有重複，錯誤碼複用 PIPELINE_INVALID_CONNECTION（訊息中附加「重複來源」文字）。
5. **JSONB 完整性**：使用 `simple-json` 欄位型別（F028 已建立），確保 SQLite 和 PostgreSQL 環境下 definition 結構完整保留。
6. **raw-tables 端點**：放在 ExtractionTaskController 中而非 EtlPipelineController，因為資料來源是 ExtractionTask 模組。路由 `GET raw-tables` 放在 `GET :id` 之前以避免路徑衝突。
7. **raw-tables 過濾條件**：目前僅過濾 `raw_table_name IS NOT NULL` 且 `deleted_at IS NULL`，不限定 status。此決策可於後續根據 Product 需求調整。
8. **Controller 路由順序**：`GET :id/definition` 和 `PUT :id/definition` 放在 `GET stats` 之後、`GET` 列表之前，確保參數路由不會攔截 stats 路徑。
