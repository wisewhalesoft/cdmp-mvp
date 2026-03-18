---
type: test-design-feature
feature_id: F021
feature_name: 立即執行／重新執行擷取任務
priority: P0-MVP
related_spec: /docs/specs/features/F021-run-extraction-task.md
last_updated: 2026-03-18
version_note: v1.2 — 更新 source_schema + source_table 雙欄位設計，SQL 查詢格式更新為 "source_schema"."source_table"
---

# F021: 立即執行／重新執行擷取任務 — 測試設計

---

## Acceptance Test Design

### AC-1：手動觸發執行

| 項目 | 內容 |
|------|------|
| Given | Admin 已登入，ET_SCHEDULED（status=scheduled）存在 |
| When | 呼叫 `POST /api/v1/extraction-tasks/:id/run`，body: { "triggeredBy": "manual" } |
| Then | HTTP 202 Accepted，回傳 ExtractionLog 初始資訊 |
| 驗證步驟 | 1. 回應含 id（ExtractionLog UUID）、status=running、triggeredBy=manual<br>2. ExtractionTask.status 更新為 running<br>3. 使用 `waitForTaskStatus(taskId, 'completed', 5000)` polling 確認非同步執行完成（interval=300ms，timeout=5000ms）<br>4. 確認 AppDB 中 raw data 表存在且含資料（AC-6） |

### AC-2：重新執行失敗任務

| 項目 | 內容 |
|------|------|
| Given | Admin 已登入，ET_FAILED（status=failed）存在 |
| When | 呼叫 `POST /api/v1/extraction-tasks/:id/run`，body: { "triggeredBy": "retry" } |
| Then | HTTP 202，ExtractionLog.triggeredBy=retry |

### AC-4：執行中不可重複觸發

| 項目 | 內容 |
|------|------|
| Given | ET_RUNNING（status=running）存在 |
| When | 呼叫 POST /run |
| Then | HTTP 409，EXTRACTION_RUNNING |

### AC-5：執行完成後狀態更新

| 項目 | 內容 |
|------|------|
| Given | 任務剛觸發執行（status=running） |
| When | 執行完成（成功或失敗） |
| Then | ExtractionTask.status=completed 或 failed，lastExecutionAt 更新，ExtractionLog.finishedAt 設定 |
| 驗證步驟 | 使用 waitForTaskStatus(taskId, 'completed', 5000) 輪詢確認，再查詢 ExtractionTask 與 ExtractionLog 欄位 |

### AC-6：擷取資料真正寫入 AppDB

| 項目 | 內容 |
|------|------|
| Given | 擷取任務執行成功，任務設定 sourceSchema="public"、sourceTable="customers" |
| When | 執行完成（status=completed） |
| Then | AppDB 中 `raw_{task_id_short}` 表存在，資料筆數 = ExtractionTask.extractedCount |
| 驗證步驟 | 1. `SELECT COUNT(*) FROM raw_{task_id_short}`<br>2. 確認筆數與 ExtractionTask.extractedCount 一致<br>3. 抽查至少 1 筆資料，確認欄位值與來源一致<br>4. 確認系統欄位 `_cdmp_extracted_at` 存在且為 TIMESTAMP 類型<br>5. 驗證執行日誌中 SQL 使用 `"public"."customers"` 格式（含雙引號分隔 schema 與 table） |

### AC-7：AppDB raw data 表不存在時自動建立

| 項目 | 內容 |
|------|------|
| Given | 某擷取任務從未執行過（首次執行，raw data 表不存在） |
| When | 觸發擷取作業 |
| Then | 系統自動建立 `raw_{task_id_short}` 表，欄位結構符合來源表 metadata，含 `_cdmp_extracted_at` 系統欄位 |
| 驗證步驟 | 1. 執行前確認 AppDB 中無此 raw data 表<br>2. 觸發並 waitForTaskStatus('completed', 5000)<br>3. 查詢 information_schema 確認 raw data 表已建立<br>4. 確認欄位清單與來源表結構對應<br>5. 若來源表無主鍵，確認 `_cdmp_id` 欄位存在 |

---

## Test Scenarios

### Positive Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F021-001 | 手動觸發執行（scheduled 狀態） | AC-1, BR-4, BR-5 | Integration | ET_SCHEDULED(status=scheduled, sourceSchema="public", sourceTable="customers_src") 存在 | 1. POST /api/v1/extraction-tasks/:id/run {triggeredBy:"manual"}<br>2. waitForTaskStatus(taskId, 'completed', 5000) | HTTP 202，ExtractionLog.triggeredBy=manual；完成後 ExtractionTask.status=completed |
| TS-F021-002 | 重新執行失敗任務 | AC-2, BR-5 | Integration | ET_FAILED(status=failed) 存在 | 1. POST /run {triggeredBy:"retry"}<br>2. waitForTaskStatus(taskId, 'completed', 5000) | HTTP 202，triggeredBy=retry；完成後 status=completed 或 failed |
| TS-F021-003 | 手動觸發已停用任務 | BR-3 | Integration | ET_DISABLED(enabled=false) 存在 | 1. POST /run {triggeredBy:"manual"} | HTTP 202（手動觸發不受 enabled 限制） |
| TS-F021-004 | 執行完成後統計欄位更新 | AC-5, BR-7 | Integration | 任務執行完成 | 1. 確認 completed 後查詢 ExtractionTask | executionCount 加 1，lastExecutionAt 更新，avgDurationMs = 第一次 durationMs |
| TS-F021-005 | ExtractionLog 記錄完整性 | AC-5 | Integration | 任務執行完成 | 1. GET /api/v1/extraction-tasks/:id/logs | ExtractionLog 含 startedAt, finishedAt, durationMs, extractedCount, triggeredBy, createdBy |
| TS-F021-011 | 首次執行自動建立 raw data 表 | AC-7, BR-9 | Integration | 新建任務 ET_NEW（從未執行，AppDB 中無對應 raw data 表） | 1. 確認 AppDB 中無 `raw_{task_id_short}` 表<br>2. POST /run {triggeredBy:"manual"}<br>3. waitForTaskStatus('completed', 5000) | raw data 表自動建立，欄位結構對應來源表；status=completed |
| TS-F021-012 | 首次執行後資料確實寫入 AppDB | AC-6, BR-9, BR-12 | Integration | ET_NEW 首次執行後 completed | 1. `SELECT COUNT(*) FROM raw_{task_id_short}`<br>2. 抽查 1 筆資料欄位 | 筆數 = ExtractionTask.extractedCount；`_cdmp_extracted_at` 欄位存在且有值 |
| TS-F021-013 | 全量模式 TRUNCATE + 重新寫入 | BR-10 | Integration | ET_FULL（已有 raw data 表，內含舊資料 N 筆） | 1. 記錄現有 raw data 表筆數<br>2. 修改來源表（減少部分資料）<br>3. POST /run {triggeredBy:"manual"}<br>4. waitForTaskStatus('completed', 5000) | 全量執行後 raw data 表筆數 = 新來源表筆數（舊資料已 TRUNCATE，不殘留）；extractedCount 對應新筆數 |
| TS-F021-014 | 增量模式追加寫入 | BR-11 | Integration | ET_INCREMENTAL（已有 raw data 表，lastIncrementalValue="2026-01-10"） | 1. 來源表新增 updated_at > "2026-01-10" 的資料<br>2. POST /run {triggeredBy:"manual"}<br>3. waitForTaskStatus('completed', 5000) | raw data 表追加新筆數，舊資料保留；新增筆數 = 來源新增筆數；lastIncrementalValue 更新為最新值 |
| TS-F021-015 | 來源表結構變更後系統重建 raw data 表 | 邊界情況 | Integration | ET_FULL（已執行過，raw data 表存在；此後來源表新增一欄 `new_col`） | 1. POST /run {triggeredBy:"manual"}<br>2. waitForTaskStatus('completed', 5000)<br>3. 查詢 raw data 表欄位清單 | 系統 DROP + 重建 raw data 表；新 raw data 表含 `new_col` 欄位；status=completed |
| TS-F021-016 | 批次寫入正確性（超過 1,000 筆） | BR-12 | Integration | 來源表有 1,001 筆資料 | 1. POST /run {triggeredBy:"manual"}<br>2. waitForTaskStatus('completed', 5000) | raw data 表有 1,001 筆；extractedCount=1,001；進度更新至少 2 次（第一批 1,000 + 最後 1 筆） |

### Negative Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F021-006 | 執行中不可重複觸發 | AC-4, BR-2 | Integration | ET_RUNNING(status=running) 存在 | 1. POST /run {triggeredBy:"manual"} | HTTP 409，EXTRACTION_RUNNING |
| TS-F021-007 | 非 Admin 無權執行 | BR-1 | Integration | USER_ACTIVE 已登入 | 1. 以 User Token 呼叫 POST /run | HTTP 403，AUTH_FORBIDDEN |
| TS-F021-008 | 任務不存在 | F021 BR | Integration | 無此 ID | 1. POST /api/v1/extraction-tasks/nonexistent-uuid/run | HTTP 404，EXTRACTION_NOT_FOUND |
| TS-F021-017 | 動態建表失敗（metadata 讀取失敗） | BR-9，邊界情況 | Integration | 新建任務，sourceSchema="public"、sourceTable="nonexistent_table"（不存在於外部 DB） | 1. POST /run {triggeredBy:"manual"}<br>2. waitForTaskStatus('failed', 5000) | status=failed；ExtractionLog.errorMessage 含 EXTRACTION_TABLE_CREATE_FAILED 或 EXTRACTION_SOURCE_TABLE_NOT_FOUND |
| TS-F021-018 | 批次寫入中途失敗（部分資料保留） | BR-12，邊界情況 | Integration | 來源表有 3,000 筆資料，模擬第 2 批次寫入時 DB 連線中斷 | 1. POST /run {triggeredBy:"manual"}<br>2. waitForTaskStatus('failed', 5000)<br>3. SELECT COUNT(*) FROM raw data 表 | status=failed；已寫入的 1,000 筆資料保留（不回滾）；extractedCount=1,000（已寫入筆數）；ExtractionLog.errorMessage 含 EXTRACTION_BATCH_WRITE_FAILED |
| TS-F021-019 | 來源表結構重建失敗 | 邊界情況 | Integration | 既有 raw data 表（來源表結構變更），模擬 DROP 後重建 DDL 失敗 | 1. POST /run {triggeredBy:"manual"}<br>2. waitForTaskStatus('failed', 5000) | status=failed；ExtractionLog.errorMessage 含 EXTRACTION_TABLE_CREATE_FAILED |

### Boundary Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F021-009 | 空表擷取（total_count=0） | 邊界情況 | Integration | 來源表為空表（0 筆資料）；raw data 表已存在或首次建立 | 1. POST /run<br>2. waitForTaskStatus(taskId, 'completed', 5000) | status=completed，progressPercent=100，extractedCount=0，totalCount=0；raw data 表存在但無資料列 |
| TS-F021-010 | 增量模式成功後更新最後增量值 | BR-8 | Integration | ET_INCREMENTAL 存在，擷取成功 | 1. POST /run<br>2. waitForTaskStatus(taskId, 'completed', 5000)<br>3. 查詢 ExtractionTask | lastIncrementalValue 更新為本次擷取最後值 |
| TS-F021-020 | 恰好 1,000 筆（批次邊界）寫入 | BR-12 | Integration | 來源表有精確 1,000 筆資料 | 1. POST /run<br>2. waitForTaskStatus('completed', 5000) | extractedCount=1,000；raw data 表有 1,000 筆；進度更新 1 次（第一批即最後批） |
| TS-F021-021 | 來源表無主鍵時系統附加 _cdmp_id | BR-9, AC-7 | Integration | 來源表無主鍵（no PRIMARY KEY constraint） | 1. 新建任務指向此無主鍵表<br>2. POST /run<br>3. waitForTaskStatus('completed', 5000)<br>4. 查詢 raw data 表欄位清單 | raw data 表含 `_cdmp_id` 欄位（SERIAL 類型，主鍵索引）；`_cdmp_extracted_at` 欄位亦存在 |

---

## 效能測試場景（NFR）

| ID | Scenario | Test Type | 測試設計說明 |
|----|----------|-----------|------------|
| TS-F021-PERF-001 | 大量資料擷取（百萬筆）效能 | Performance | 來源表有 1,000,000 筆；執行全量擷取；驗證 raw data 表最終有 1,000,000 筆；觀察批次寫入過程中 extracted_count 的遞增進度。百萬筆場景需使用測試用受控資料集（controlled dataset），不可依賴真實外部 DB；建議以 Test Container 執行。 |

---

## SQL Injection 安全場景

| ID | Scenario | Related Req | Test Type | Steps | Expected Result |
|----|----------|------------|-----------|-------|-----------------|
| TS-F021-SEC-001 | 表名自動生成，不接受使用者輸入（BR-13） | BR-13 | Security | 確認 raw data 表名稱格式 = `raw_` + hex 字元（task_id 前 8 碼）；表名完全由系統生成，不含任何使用者輸入的字元 | 表名格式符合正規表達式 `^raw_[0-9a-f]{8}$`；不存在使用者可控制的字元進入表名 |
| TS-F021-SEC-002 | 來源表欄位名稱 sanitize（防止惡意欄位名稱） | data-model.md#raw-data-table | Security | 來源表含惡意欄位名稱（例：`col; DROP TABLE users; --`）；執行擷取 | 系統對欄位名稱進行 sanitize（僅允許字母、數字、底線）；含非法字元的欄位名稱被拒絕或轉換；任務不應因此執行 DROP 等 DDL |
| TS-F021-SEC-003 | sourceSchema + sourceTable 的 SQL 組合使用雙引號引用（防止保留字衝突） | BR（F021 摘要） | Security | 新建任務，sourceSchema="order"（SQL 保留字），sourceTable="select"（SQL 保留字） | 執行 SQL 查詢時，sourceSchema 與 sourceTable 均以雙引號引用，組合為 `"order"."select"` 格式；查詢不因保留字衝突而失敗 |

---

## sourceSchema + sourceTable SQL 組合格式說明

根據 F021 spec（功能摘要）：

> 來源資料表由 `source_schema` + `source_table` 組合定位，執行時組合為 `"source_schema"."source_table"` 格式

**驗證場景對照：**

| 任務設定 | 執行時 SQL 格式 |
|---------|---------------|
| sourceSchema="public", sourceTable="customers" | `"public"."customers"` |
| sourceSchema="analytics", sourceTable="daily_report" | `"analytics"."daily_report"` |
| sourceSchema=null (或空), sourceTable="customers" | 僅使用 `"customers"`（無 schema 前綴，視 DB 類型而定） |
| sourceSchema="order"（保留字）, sourceTable="select"（保留字） | `"order"."select"`（雙引號防止保留字衝突） |

**影響的場景：** TS-F021-001、TS-F021-011、TS-F021-012、TS-F021-013、TS-F021-014、TS-F021-SEC-003
