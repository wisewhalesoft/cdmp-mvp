---
type: implementation-log
feature_id: F042-F044
feature_name: ETL 執行引擎 In-DB SQL 重構
status: complete
last_updated: 2026-03-27
---

# F042-F044: ETL 執行引擎 In-DB SQL 重構 — Implementation Log

## 背景

原有 ETL 執行引擎採用 In-Memory 策略，ExtractHandler 將所有資料讀入 Node.js 記憶體（rows.push(...batch)），MergeHandler 在記憶體中做 FULL OUTER JOIN，導致 210 萬筆資料時 API server OOM crash。

本次重構改為 **In-DB SQL 策略**：每個節點的輸出改為 PostgreSQL temp table 名稱，所有轉換透過 SQL 完成，零記憶體佔用。

## 核心變更

### DataSet 介面變更
- **Before**: `{ rows: Record<string, unknown>[], rowCount: number }`
- **After**: `{ tempTable: string, rowCount: number }`

### 新增工具函式
- `makeTempTableName(nodeId, logId)` — 產生格式為 `etl_tmp_{nodeId}_{logId前8碼}` 的 temp table 名稱，避免並發衝突

### 8 個 Handler 全部改為 SQL 操作
| Handler | 原策略 | 新策略 |
|---------|--------|--------|
| ExtractHandler | 分批 SELECT + rows.push | `CREATE TEMP TABLE AS SELECT * FROM raw_xxx` |
| MergeHandler | 記憶體 Map + 迭代 JOIN | `CREATE TEMP TABLE AS SELECT ... FULL OUTER JOIN` |
| DedupHandler | 記憶體 Map 分組 | `CREATE TEMP TABLE AS SELECT DISTINCT ON (key) ... ORDER BY key, ts DESC NULLS LAST, ctid ASC` |
| TypeCastHandler | parseFloat/parseInt per row | `CASE WHEN regex THEN CAST ELSE NULL END` |
| DerivedFieldHandler | JS function per row | SQL 表達式：CONCAT, LPAD, gen_random_uuid(), CASE WHEN |
| FieldMappingHandler | JS object mapping | `SELECT src AS target` with dropUnmapped |
| ConditionalHandler | JS evaluateWhen per row | SQL CASE WHEN with left./right. → column resolution |
| TargetLoadHandler | 記憶體批次參數化 UPSERT | `INSERT INTO target SELECT FROM temp ON CONFLICT` |

### NodeOutputStore 變更
- 新增 `getAllTempTables()` — 取得所有 temp table 名稱
- 新增 `cleanupAll(queryRunner)` — DROP 所有 temp tables

### PipelineRunner 變更
- 成功完成與失敗時皆呼叫 `outputStore.cleanupAll(queryRunner)` 清理 temp tables
- 外層 try/catch 確保異常時也能清理

## Test Results Summary

| Scenario ID | Description | Status |
|-------------|------------|--------|
| TS-F042-001 | 線性 Pipeline 拓撲排序 | PASS |
| TS-F042-002 | Seed Pipeline 19 節點排序 | PASS |
| TS-F042-003 | 循環依賴偵測 | PASS |
| TS-F042-004 | 孤立節點順序 | PASS |
| TS-F042-005 | 空 Pipeline 完成 | PASS |
| TS-F042-006 | 單路上游 inputs.default | PASS |
| TS-F042-007 | 雙路上游 left/right-input | PASS |
| TS-F042-008 | 上游缺失 → 空 DataSet | PASS |
| TS-F042-009 | NodeDispatcher 分派 | PASS |
| TS-F042-010 | 未知 nodeType 錯誤 | PASS |
| TS-F042-011 | Running 狀態記錄 | PASS |
| TS-F042-012 | 完成狀態與統計 | PASS |
| TS-F042-013 | 節點失敗 + 中止 | PASS |
| TS-F042-014 | 循環依賴失敗 | PASS |
| TS-F042-015 | 未知 nodeType 中止 | PASS |
| TS-F042-016 | isTestRun 傳遞 | PASS |
| TS-F042-017 | Pipeline 完成後清理（含 DROP TABLE） | PASS |
| TS-F042-018 | 引用計數釋放 | PASS |
| TS-F042-019 | 同層節點順序 | PASS |
| TS-F042-020 | 成功完成 callback | PASS |
| TS-F042-021 | isTestRun 傳播 | PASS |
| TS-F043-001~044 | 8 個 Handler SQL 產出驗證 | PASS (44 tests) |
| TS-F044-001~016 | Target Load UPSERT 驗證 | PASS (12 tests) |
| 新增 | makeTempTableName 命名 | PASS |
| 新增 | NodeOutputStore.getAllTempTables | PASS |
| 新增 | NodeOutputStore.cleanupAll | PASS |

**總計**: 81 engine tests PASS + 75 其他 ETL tests PASS = **156 tests PASS**

## Files Changed

| File Path | Change Type | Description |
|-----------|------------|-------------|
| `apps/api/src/modules/etl/engine/types.ts` | modified | DataSet 改為 `{ tempTable, rowCount }`，新增 `makeTempTableName()` |
| `apps/api/src/modules/etl/engine/node-output-store.ts` | modified | 新增 `getAllTempTables()` 和 `cleanupAll(queryRunner)` |
| `apps/api/src/modules/etl/engine/pipeline-runner.ts` | modified | 成功/失敗/異常皆呼叫 `cleanupAll(queryRunner)` |
| `apps/api/src/modules/etl/engine/handlers/extract-handler.ts` | rewritten | `CREATE TEMP TABLE AS SELECT * FROM raw_xxx` |
| `apps/api/src/modules/etl/engine/handlers/merge-handler.ts` | rewritten | SQL FULL OUTER JOIN with COALESCE + _right suffix |
| `apps/api/src/modules/etl/engine/handlers/dedup-handler.ts` | rewritten | SQL DISTINCT ON + ORDER BY DESC NULLS LAST |
| `apps/api/src/modules/etl/engine/handlers/type-cast-handler.ts` | rewritten | SQL CAST with regex validation |
| `apps/api/src/modules/etl/engine/handlers/derived-field-handler.ts` | rewritten | SQL: CONCAT, LPAD, gen_random_uuid(), CASE WHEN |
| `apps/api/src/modules/etl/engine/handlers/field-mapping-handler.ts` | rewritten | SQL SELECT AS with dropUnmapped |
| `apps/api/src/modules/etl/engine/handlers/conditional-handler.ts` | rewritten | SQL CASE WHEN with column resolution |
| `apps/api/src/modules/etl/engine/handlers/target-load-handler.ts` | rewritten | `INSERT INTO target SELECT FROM temp ON CONFLICT` |
| `apps/api/src/modules/etl/__tests__/engine-core.spec.ts` | modified | DataSet 改為 tempTable 引用，新增 temp table 清理測試 |
| `apps/api/src/modules/etl/__tests__/engine-node-executors.spec.ts` | rewritten | 驗證 SQL 產出而非記憶體資料 |
| `apps/api/src/modules/etl/__tests__/engine-target-load.spec.ts` | rewritten | 驗證 SQL UPSERT 產出 |

## Architectural Decisions

1. **Temp table 命名規則**: `etl_tmp_{nodeId}_{logId前8碼}`，確保並發執行不衝突
2. **TypeCast 安全轉換**: 使用 regex 驗證後再 CAST，避免 SQL 錯誤（`'^-?[0-9]+(\.[0-9]+)?$'` for DECIMAL）
3. **Dedup 穩定排序**: 使用 `ctid ASC` 作為 tie-breaker，確保時間戳相同時保留第一筆
4. **mergePhone SQL 實作**: 完整複製原始 JS 邏輯（null、空字串、全零檢查）為 SQL CASE WHEN；支援選用第三參數 extenCol（分機），有分機時產生 `CONCAT(area, '-', tel, '#', exten)`，分機為 null/空字串/全零時省略 `#exten` 部分
5. **TargetLoad 單次 UPSERT**: 不再需要記憶體批次，直接 `INSERT INTO target SELECT FROM temp`
6. **執行服務無需修改**: `etl-pipeline-execution.service.ts` 公開 API 不變，因 PipelineRunner 內部處理 cleanup
7. **emptyDataSet**: temp table 為空字串 + rowCount=0，handler 遇到 rowCount=0 直接回傳，不執行 SQL
