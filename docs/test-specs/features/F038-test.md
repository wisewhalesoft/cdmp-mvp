---
type: test-design-feature
feature_id: F038
feature_name: 孤兒任務回收（系統啟動時自動修復 running 狀態）
priority: P0-MVP
related_spec: /docs/specs/features/F038-orphan-task-recovery.md
related_arch: /docs/specs/implementation-log/F038-architecture.md
last_updated: 2026-03-25
epic: E04, E05
---

# F038: 孤兒任務回收（系統啟動時自動修復 running 狀態）— 測試設計

---

## Acceptance Test Design

### AC-1：系統啟動時自動回收孤兒擷取任務

| 項目 | 內容 |
|------|------|
| Given | 資料庫中存在 `extraction_tasks`，其 `status = 'running'` 且 `deleted_at IS NULL` |
| When | CDMP 應用程式完成啟動（`OnApplicationBootstrap` 執行） |
| Then | 所有符合條件的擷取任務 `status` 更新為 `'failed'`，`error_message` 填入 `'系統重啟，任務執行中斷，請重新觸發執行'` |
| 驗證步驟 | 1. 查詢 DB 確認 `extraction_tasks.status = 'failed'`<br>2. 確認 `extraction_tasks.error_message = '系統重啟，任務執行中斷，請重新觸發執行'`<br>3. 確認 `extraction_tasks.updated_at` 已更新 |

### AC-2：孤兒擷取日誌同步修復

| 項目 | 內容 |
|------|------|
| Given | 孤兒擷取任務存在對應的 `extraction_logs`，其 `status = 'running'` 且 `finished_at IS NULL` |
| When | 孤兒回收機制執行 |
| Then | 對應日誌的 `status` 更新為 `'failed'`，`finished_at` 填入回收執行時間（非 null），`error_message` 填入 `'系統重啟，執行進程被中斷'` |
| 驗證步驟 | 1. 查詢 DB 確認 `extraction_logs.status = 'failed'`<br>2. 確認 `extraction_logs.finished_at IS NOT NULL`<br>3. 確認 `extraction_logs.error_message = '系統重啟，執行進程被中斷'` |

### AC-3：回收後孤兒擷取任務可正常操作

| 項目 | 內容 |
|------|------|
| Given | 孤兒回收完成，原孤兒擷取任務 `status = 'failed'` |
| When | Admin 對該任務執行重新執行（triggerRun）或刪除（deleteTask） |
| Then | 系統不拋出 `EXTRACTION_RUNNING` 錯誤，操作正常完成 |

### AC-4：系統啟動時自動回收孤兒 ETL Pipeline

| 項目 | 內容 |
|------|------|
| Given | 資料庫中存在 `etl_pipelines`，其 `status = 'running'` 且 `deleted_at IS NULL` |
| When | CDMP 應用程式完成啟動（`OnApplicationBootstrap` 執行） |
| Then | 所有符合條件的 ETL Pipeline `status` 更新為 `'failed'`（`etl_pipelines` 無 `error_message` 欄位，不寫入） |
| 驗證步驟 | 1. 查詢 DB 確認 `etl_pipelines.status = 'failed'`<br>2. 確認 DB Schema 中 `etl_pipelines` 無 `error_message` 欄位（或實作不寫入此欄位） |

### AC-5：孤兒 ETL Pipeline 日誌同步修復

| 項目 | 內容 |
|------|------|
| Given | 孤兒 Pipeline 存在對應的 `etl_pipeline_logs`，其 `status = 'running'` 且 `finished_at IS NULL` |
| When | 孤兒回收機制執行 |
| Then | 日誌 `status = 'failed'`、`finished_at` 非 null、`duration_ms` 非 null（由 `finished_at - started_at` 計算）、`error_message = '系統重啟，Pipeline 執行進程被中斷'` |

### AC-7：無孤兒任務時靜默通過

| 項目 | 內容 |
|------|------|
| Given | 資料庫中不存在任何 `status = 'running'` 的擷取任務或 ETL Pipeline |
| When | CDMP 應用程式啟動 |
| Then | 回收機制正常執行完畢，無任何狀態更新，Logger 記錄「無需修復」相關訊息，不拋出例外 |

### AC-8：回收結果寫入系統日誌

| 項目 | 內容 |
|------|------|
| Given | 孤兒回收機制執行完畢 |
| When | 工程師查看應用程式啟動日誌 |
| Then | Logger 包含：孤兒擷取任務數量與修復數量、孤兒 Pipeline 數量與修復數量、回收總耗時 |

### AC-9：回收在接受請求前完成

| 項目 | 內容 |
|------|------|
| Given | 系統正在執行孤兒回收（`OnApplicationBootstrap` 未返回） |
| When | HTTP 請求在回收期間抵達 |
| Then | 請求等待回收完成後才被處理（NestJS `OnApplicationBootstrap` 保證在 HTTP Server 啟動前執行） |

### AC-10：回收失敗不中止啟動

| 項目 | 內容 |
|------|------|
| Given | 孤兒回收機制在執行過程中發生例外（如 Transaction 失敗） |
| When | 例外被捕獲 |
| Then | 系統記錄 `error` 層級日誌後繼續完成啟動流程，不中止應用程式 |

---

## Test Scenarios

### 一、E04 擷取任務回收（Unit）

#### TS-F038-001：有孤兒擷取任務時，任務 status 更新為 failed（Unit）

| 欄位 | 內容 |
|------|------|
| **Related Requirement** | AC-1, BR-3 |
| **Test Type** | Unit |
| **自動化就緒度** | 高 |
| **前置條件** | mock `taskRepository.createQueryBuilder()` 回傳 1 筆 `status='running', deleted_at=null` 的擷取任務；mock `dataSource.transaction()` 可執行 callback |
| **操作** | 呼叫 `orphanRecoveryService.onApplicationBootstrap()` |
| **預期結果** | 1. mock `EntityManager.createQueryBuilder().update(ExtractionTask).set()` 被呼叫<br>2. `.set()` 的參數中 `status = 'failed'`<br>3. `.set()` 的參數中 `error_message = '系統重啟，任務執行中斷，請重新觸發執行'` |

---

#### TS-F038-002：有孤兒擷取任務時，error_message 填入標準化訊息（Unit）

| 欄位 | 內容 |
|------|------|
| **Related Requirement** | AC-1, 錯誤訊息標準化表 |
| **Test Type** | Unit |
| **自動化就緒度** | 高 |
| **前置條件** | 同 TS-F038-001 |
| **操作** | 呼叫 `onApplicationBootstrap()` |
| **預期結果** | mock 的 `.set()` 呼叫中，`error_message` 精確為 `'系統重啟，任務執行中斷，請重新觸發執行'`（不可有多餘空白或不同內容） |

---

#### TS-F038-003：有孤兒擷取任務時，對應的 extraction_logs（running + finished_at=null）同步更新為 failed（Unit）

| 欄位 | 內容 |
|------|------|
| **Related Requirement** | AC-2, BR-5 |
| **Test Type** | Unit |
| **自動化就緒度** | 高 |
| **前置條件** | mock `taskRepository` 回傳孤兒任務（id: 'task-uuid-1'）；mock `EntityManager` 可執行 QueryBuilder |
| **操作** | 呼叫 `onApplicationBootstrap()` |
| **預期結果** | 1. `ExtractionLog` 的 update QueryBuilder 被呼叫<br>2. WHERE 條件含 `task_id IN ('task-uuid-1')`<br>3. WHERE 條件含 `status = 'running'`<br>4. WHERE 條件含 `finished_at IS NULL` |

---

#### TS-F038-004：extraction_logs.finished_at 填入回收時間（Unit）

| 欄位 | 內容 |
|------|------|
| **Related Requirement** | AC-2, BR-5 |
| **Test Type** | Unit |
| **自動化就緒度** | 高 |
| **前置條件** | 同 TS-F038-003 |
| **操作** | 呼叫 `onApplicationBootstrap()` |
| **預期結果** | `ExtractionLog` update 的 `.set()` 中，`finished_at` 使用 DB 端 `NOW()`（即 `() => 'NOW()'` 的形式，而非 JavaScript `new Date()`） |

---

#### TS-F038-005：extraction_logs.error_message 填入標準化訊息（Unit）

| 欄位 | 內容 |
|------|------|
| **Related Requirement** | AC-2, 錯誤訊息標準化表 |
| **Test Type** | Unit |
| **自動化就緒度** | 高 |
| **前置條件** | 同 TS-F038-003 |
| **操作** | 呼叫 `onApplicationBootstrap()` |
| **預期結果** | `ExtractionLog` update 的 `.set()` 中，`error_message` 精確為 `'系統重啟，執行進程被中斷'` |

---

#### TS-F038-006：多筆孤兒擷取任務批次回收（Unit）

| 欄位 | 內容 |
|------|------|
| **Related Requirement** | AC-1, AC-2, 邊界情況（批次更新） |
| **Test Type** | Unit |
| **自動化就緒度** | 高 |
| **前置條件** | mock `taskRepository` 回傳 3 筆 `status='running', deleted_at=null` 的任務（id: ['uuid-1', 'uuid-2', 'uuid-3']） |
| **操作** | 呼叫 `onApplicationBootstrap()` |
| **預期結果** | 1. `ExtractionTask` update 的 WHERE IN 條件包含全部 3 個 UUID<br>2. `ExtractionLog` update 的 WHERE IN 條件包含全部 3 個 task UUID<br>3. update QueryBuilder 各只被呼叫 1 次（批次而非逐筆） |

---

#### TS-F038-007：已軟刪除的 running 擷取任務不被回收（Unit）

| 欄位 | 內容 |
|------|------|
| **Related Requirement** | BR-8 |
| **Test Type** | Unit |
| **自動化就緒度** | 高 |
| **前置條件** | mock `taskRepository.createQueryBuilder()` 在 WHERE 條件中驗證含 `deleted_at IS NULL`；設定 DB 中有 `status='running', deleted_at='2026-03-20T00:00:00Z'` 的任務（已軟刪除） |
| **操作** | 呼叫 `onApplicationBootstrap()` |
| **預期結果** | 1. `taskRepository` 的查詢 QueryBuilder 含 `andWhere('task.deleted_at IS NULL')` 的呼叫<br>2. mock 模擬 getMany() 回傳空陣列（已軟刪除任務已被過濾）<br>3. `ExtractionTask` update 不被呼叫 |

---

#### TS-F038-008：孤兒任務有多筆 running 日誌時全部修復（Unit）

| 欄位 | 內容 |
|------|------|
| **Related Requirement** | AC-2, 邊界情況（多筆 running log） |
| **Test Type** | Unit |
| **自動化就緒度** | 高 |
| **前置條件** | mock `taskRepository` 回傳 1 筆孤兒任務（id: 'task-1'）；mock DB 中 task-1 對應 3 筆 `status='running', finished_at=null` 的 extraction_logs |
| **操作** | 呼叫 `onApplicationBootstrap()` |
| **預期結果** | `ExtractionLog` update 的 WHERE 條件為 `task_id IN ('task-1') AND status='running' AND finished_at IS NULL`，不限制每次僅更新 1 筆（批次更新全部 3 筆） |

---

### 二、E05 ETL Pipeline 回收（Unit）

#### TS-F038-009：有孤兒 Pipeline 時，status 從 running 更新為 failed（Unit）

| 欄位 | 內容 |
|------|------|
| **Related Requirement** | AC-4, BR-4 |
| **Test Type** | Unit |
| **自動化就緒度** | 高 |
| **前置條件** | mock `pipelineRepository.createQueryBuilder()` 回傳 1 筆 `status='running', deleted_at=null` 的 Pipeline；mock `dataSource.transaction()` 可執行 callback |
| **操作** | 呼叫 `onApplicationBootstrap()` |
| **預期結果** | mock `EntityManager.createQueryBuilder().update(EtlPipeline).set()` 被呼叫，且 `.set()` 中 `status = 'failed'` |

---

#### TS-F038-010：etl_pipelines 不寫入 error_message 欄位（Unit）

| 欄位 | 內容 |
|------|------|
| **Related Requirement** | AC-4, BR-10 |
| **Test Type** | Unit |
| **自動化就緒度** | 高 |
| **前置條件** | mock `pipelineRepository` 回傳 1 筆孤兒 Pipeline |
| **操作** | 呼叫 `onApplicationBootstrap()` |
| **預期結果** | `EtlPipeline` update 的 `.set()` 呼叫中，**不含 `error_message` 欄位**（`.set()` 參數的 key 列表中無 `error_message`） |

---

#### TS-F038-011：對應的 etl_pipeline_logs 同步更新為 failed（Unit）

| 欄位 | 內容 |
|------|------|
| **Related Requirement** | AC-5, BR-6 |
| **Test Type** | Unit |
| **自動化就緒度** | 高 |
| **前置條件** | mock `pipelineRepository` 回傳孤兒 Pipeline（id: 'pipeline-uuid-1'） |
| **操作** | 呼叫 `onApplicationBootstrap()` |
| **預期結果** | 1. `EtlPipelineLog` 的 update QueryBuilder 被呼叫<br>2. WHERE 條件含 `pipeline_id IN ('pipeline-uuid-1')`<br>3. WHERE 條件含 `status = 'running'`<br>4. WHERE 條件含 `finished_at IS NULL` |

---

#### TS-F038-012：etl_pipeline_logs.duration_ms 使用 DB 端計算（Unit）

| 欄位 | 內容 |
|------|------|
| **Related Requirement** | AC-5, BR-6 |
| **Test Type** | Unit |
| **自動化就緒度** | 高 |
| **前置條件** | mock `pipelineRepository` 回傳孤兒 Pipeline |
| **操作** | 呼叫 `onApplicationBootstrap()` |
| **預期結果** | `EtlPipelineLog` update 的 `.set()` 中，`duration_ms` 為使用 DB 函式計算的 expression（如 `() => "EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000"`），而非 JavaScript 端計算的靜態數字 |

---

#### TS-F038-013：etl_pipeline_logs.error_message 填入標準化訊息（Unit）

| 欄位 | 內容 |
|------|------|
| **Related Requirement** | AC-5, 錯誤訊息標準化表 |
| **Test Type** | Unit |
| **自動化就緒度** | 高 |
| **前置條件** | mock `pipelineRepository` 回傳孤兒 Pipeline |
| **操作** | 呼叫 `onApplicationBootstrap()` |
| **預期結果** | `EtlPipelineLog` update 的 `.set()` 中，`error_message` 精確為 `'系統重啟，Pipeline 執行進程被中斷'` |

---

#### TS-F038-014：多筆孤兒 Pipeline 批次回收（Unit）

| 欄位 | 內容 |
|------|------|
| **Related Requirement** | AC-4, AC-5, 邊界情況（批次更新） |
| **Test Type** | Unit |
| **自動化就緒度** | 高 |
| **前置條件** | mock `pipelineRepository` 回傳 2 筆孤兒 Pipeline（id: ['p-uuid-1', 'p-uuid-2']） |
| **操作** | 呼叫 `onApplicationBootstrap()` |
| **預期結果** | 1. `EtlPipeline` update 的 WHERE IN 條件包含全部 2 個 UUID<br>2. `EtlPipelineLog` update 的 WHERE IN 條件包含全部 2 個 pipeline UUID<br>3. update QueryBuilder 各只被呼叫 1 次（批次而非逐筆） |

---

#### TS-F038-015：已軟刪除的 running Pipeline 不被回收（Unit）

| 欄位 | 內容 |
|------|------|
| **Related Requirement** | BR-8 |
| **Test Type** | Unit |
| **自動化就緒度** | 高 |
| **前置條件** | mock `pipelineRepository.createQueryBuilder()` 含 `andWhere('p.deleted_at IS NULL')` 的呼叫；設定 DB 中有 `status='running', deleted_at IS NOT NULL` 的 Pipeline |
| **操作** | 呼叫 `onApplicationBootstrap()` |
| **預期結果** | 1. `pipelineRepository` 查詢含 `deleted_at IS NULL` 過濾條件<br>2. mock 的 `getMany()` 回傳空陣列<br>3. `EtlPipeline` update 不被呼叫 |

---

### 三、無孤兒場景（Unit）

#### TS-F038-016：無任何 running 擷取任務時，靜默通過不報錯（Unit）

| 欄位 | 內容 |
|------|------|
| **Related Requirement** | AC-7, BR-1 |
| **Test Type** | Unit |
| **自動化就緒度** | 高 |
| **前置條件** | mock `taskRepository.createQueryBuilder().getMany()` 回傳空陣列 `[]` |
| **操作** | 呼叫 `onApplicationBootstrap()` |
| **預期結果** | 1. `ExtractionTask` update QueryBuilder 不被呼叫<br>2. `ExtractionLog` update QueryBuilder 不被呼叫<br>3. `dataSource.transaction()` 的 E04 分支不被呼叫（或進入後提早返回）<br>4. `onApplicationBootstrap()` 正常 resolve（不 throw） |

---

#### TS-F038-017：無任何 running Pipeline 時，靜默通過不報錯（Unit）

| 欄位 | 內容 |
|------|------|
| **Related Requirement** | AC-7, BR-1 |
| **Test Type** | Unit |
| **自動化就緒度** | 高 |
| **前置條件** | mock `pipelineRepository.createQueryBuilder().getMany()` 回傳空陣列 `[]` |
| **操作** | 呼叫 `onApplicationBootstrap()` |
| **預期結果** | 1. `EtlPipeline` update QueryBuilder 不被呼叫<br>2. `EtlPipelineLog` update QueryBuilder 不被呼叫<br>3. `onApplicationBootstrap()` 正常 resolve（不 throw） |

---

#### TS-F038-018：Logger 記錄「無需修復」訊息（Unit）

| 欄位 | 內容 |
|------|------|
| **Related Requirement** | AC-7, AC-8 |
| **Test Type** | Unit |
| **自動化就緒度** | 高 |
| **前置條件** | mock `taskRepository` 和 `pipelineRepository` 的 `getMany()` 均回傳 `[]`；spy `Logger.log` |
| **操作** | 呼叫 `onApplicationBootstrap()` |
| **預期結果** | `Logger.log()` 被呼叫，至少有 1 次呼叫的訊息包含「無需修復」或「0 筆孤兒」之類的說明文字（對應 AC-7 的「孤兒任務回收完成，無需修復」） |

---

### 四、Transaction 與錯誤處理（Unit）

#### TS-F038-019：E04 回收在同一 Transaction 中完成（任務 + 日誌原子性）（Unit）

| 欄位 | 內容 |
|------|------|
| **Related Requirement** | BR-7 |
| **Test Type** | Unit |
| **自動化就緒度** | 高 |
| **前置條件** | mock `dataSource.transaction()` 為 spy，記錄 callback 中的操作順序；mock `taskRepository` 回傳 1 筆孤兒任務 |
| **操作** | 呼叫 `onApplicationBootstrap()` |
| **預期結果** | 1. `dataSource.transaction()` 被呼叫（E04 分支）<br>2. 在同一個 `transaction callback` 中，`ExtractionTask` update 和 `ExtractionLog` update 均發生<br>3. 兩者使用同一個 `EntityManager` 實例（原子性保證） |

---

#### TS-F038-020：E05 回收在同一 Transaction 中完成（Pipeline + 日誌原子性）（Unit）

| 欄位 | 內容 |
|------|------|
| **Related Requirement** | BR-7 |
| **Test Type** | Unit |
| **自動化就緒度** | 高 |
| **前置條件** | mock `dataSource.transaction()` 為 spy；mock `pipelineRepository` 回傳 1 筆孤兒 Pipeline |
| **操作** | 呼叫 `onApplicationBootstrap()` |
| **預期結果** | 1. `dataSource.transaction()` 被呼叫（E05 分支）<br>2. 在同一個 `transaction callback` 中，`EtlPipeline` update 和 `EtlPipelineLog` update 均發生<br>3. 兩者使用同一個 `EntityManager` 實例 |

---

#### TS-F038-021：E04 回收失敗時，E05 回收仍正常執行（Unit）

| 欄位 | 內容 |
|------|------|
| **Related Requirement** | AC-10, BR-11, 替代流程 |
| **Test Type** | Unit |
| **自動化就緒度** | 高 |
| **前置條件** | mock `taskRepository` 回傳 1 筆孤兒任務；mock `dataSource.transaction()` 第一次呼叫（E04 分支）拋出 `Error('DB connection lost')`；mock `pipelineRepository` 回傳 1 筆孤兒 Pipeline；mock `dataSource.transaction()` 第二次呼叫（E05 分支）正常執行；spy `Logger.error` 和 `Logger.log` |
| **操作** | 呼叫 `onApplicationBootstrap()` |
| **預期結果** | 1. `Logger.error()` 被呼叫 1 次（E04 回收失敗）<br>2. E05 分支的 `dataSource.transaction()` 仍被呼叫（E04 失敗不中止 E05）<br>3. `EtlPipeline` update 和 `EtlPipelineLog` update 均發生<br>4. `onApplicationBootstrap()` 正常 resolve（不 throw） |

---

#### TS-F038-022：E05 回收失敗時，E04 回收結果不受影響（Unit）

| 欄位 | 內容 |
|------|------|
| **Related Requirement** | AC-10, BR-11, 替代流程 |
| **Test Type** | Unit |
| **自動化就緒度** | 高 |
| **前置條件** | mock `taskRepository` 回傳 1 筆孤兒任務；mock E04 分支的 `dataSource.transaction()` 正常執行；mock `pipelineRepository` 回傳 1 筆孤兒 Pipeline；mock E05 分支的 `dataSource.transaction()` 拋出例外；spy `Logger.error` |
| **操作** | 呼叫 `onApplicationBootstrap()` |
| **預期結果** | 1. E04 分支的 `ExtractionTask` update 正常完成（mock 記錄顯示已呼叫）<br>2. `Logger.error()` 被呼叫 1 次（E05 回收失敗）<br>3. `onApplicationBootstrap()` 正常 resolve（不 throw）<br>4. E04 mock 的 update 呼叫不受 E05 失敗影響（各自獨立） |

---

#### TS-F038-023：回收失敗時不中止啟動（Logger.error 但不拋出例外）（Unit）

| 欄位 | 內容 |
|------|------|
| **Related Requirement** | AC-10, BR-11 |
| **Test Type** | Unit |
| **自動化就緒度** | 高 |
| **前置條件** | mock E04 和 E05 兩個 `dataSource.transaction()` 均拋出例外；spy `Logger.error` |
| **操作** | `await expect(orphanRecoveryService.onApplicationBootstrap()).resolves.not.toThrow()` |
| **預期結果** | 1. `onApplicationBootstrap()` 的 Promise 正常 resolve（不 reject）<br>2. `Logger.error()` 被呼叫 2 次（E04 失敗 + E05 失敗各 1 次）<br>3. `Logger.log()` 仍被呼叫（回收摘要日誌，即使兩組均失敗） |

---

### 五、Logger 驗證（Unit）

#### TS-F038-024：Logger 記錄回收的擷取任務數量（Unit）

| 欄位 | 內容 |
|------|------|
| **Related Requirement** | AC-8, BR-9 |
| **Test Type** | Unit |
| **自動化就緒度** | 高 |
| **前置條件** | mock `taskRepository` 回傳 3 筆孤兒任務；spy `Logger.log` |
| **操作** | 呼叫 `onApplicationBootstrap()` |
| **預期結果** | `Logger.log()` 的某次呼叫訊息包含數字 `3`（代表修復 3 筆擷取任務）以及「擷取任務」或「extraction」相關關鍵字 |

---

#### TS-F038-025：Logger 記錄回收的 Pipeline 數量（Unit）

| 欄位 | 內容 |
|------|------|
| **Related Requirement** | AC-8, BR-9 |
| **Test Type** | Unit |
| **自動化就緒度** | 高 |
| **前置條件** | mock `pipelineRepository` 回傳 2 筆孤兒 Pipeline；spy `Logger.log` |
| **操作** | 呼叫 `onApplicationBootstrap()` |
| **預期結果** | `Logger.log()` 的某次呼叫訊息包含數字 `2`（代表修復 2 筆 Pipeline）以及「Pipeline」或「pipeline」相關關鍵字 |

---

#### TS-F038-026：Logger 記錄執行時間（Unit）

| 欄位 | 內容 |
|------|------|
| **Related Requirement** | AC-8, BR-9 |
| **Test Type** | Unit |
| **自動化就緒度** | 中（需 spy `Date.now()` 或使用 jest fake timers） |
| **前置條件** | mock `taskRepository` 和 `pipelineRepository` 各回傳 0 筆；spy `Logger.log`；使用 jest fake timers 控制 `Date.now()` 在 bootstrap 前後分別回傳不同值（如前: 1000、後: 1042，差值 42ms） |
| **操作** | 呼叫 `onApplicationBootstrap()` |
| **預期結果** | `Logger.log()` 的摘要訊息包含耗時相關數字（如 `42ms`）或時間單位關鍵字 |

---

### 六、冪等性（Unit）

#### TS-F038-027：連續執行兩次回收，第二次無副作用（Unit）

| 欄位 | 內容 |
|------|------|
| **Related Requirement** | AC-7, BR-1, 邊界情況（快速重啟） |
| **Test Type** | Unit |
| **自動化就緒度** | 高 |
| **前置條件** | 第一次呼叫：mock `taskRepository` 回傳 1 筆孤兒任務，模擬 update 成功；第二次呼叫：mock `taskRepository` 回傳 0 筆（模擬第一次回收已完成，DB 中無 running 任務）；spy `dataSource.transaction` |
| **操作** | 依序呼叫兩次 `onApplicationBootstrap()` |
| **預期結果** | 1. 第一次：`dataSource.transaction()` E04 分支被呼叫 1 次<br>2. 第二次：`dataSource.transaction()` E04 分支不被呼叫（或進入後因 ids 為空而提早返回）<br>3. 兩次均正常 resolve，無例外 |

---

### 七、E04 擷取任務回收（Integration）

#### TS-F038-028：有孤兒擷取任務時，DB 中 status 確實更新為 failed（Integration）

| 欄位 | 內容 |
|------|------|
| **Related Requirement** | AC-1, BR-3 |
| **Test Type** | Integration |
| **自動化就緒度** | 高（需 Test Container PostgreSQL） |
| **前置條件** | 使用 NestJS Testing Module 建立完整的 `OrphanRecoveryModule`；Test Container PostgreSQL 作為 AppDB；種子資料：1 筆 `extraction_tasks`（`status='running', deleted_at=null`），對應 1 筆 `extraction_logs`（`status='running', finished_at=null`） |
| **操作** | 呼叫 `orphanRecoveryService.onApplicationBootstrap()` |
| **預期結果** | 1. 查詢 DB：`extraction_tasks.status = 'failed'`<br>2. 查詢 DB：`extraction_tasks.error_message = '系統重啟，任務執行中斷，請重新觸發執行'` |

---

#### TS-F038-029：孤兒擷取日誌 status/finished_at/error_message 正確更新（Integration）

| 欄位 | 內容 |
|------|------|
| **Related Requirement** | AC-2, BR-5 |
| **Test Type** | Integration |
| **自動化就緒度** | 高（需 Test Container PostgreSQL） |
| **前置條件** | 同 TS-F038-028 |
| **操作** | 呼叫 `onApplicationBootstrap()` |
| **預期結果** | 1. 查詢 DB：`extraction_logs.status = 'failed'`<br>2. 查詢 DB：`extraction_logs.finished_at IS NOT NULL`<br>3. 查詢 DB：`extraction_logs.error_message = '系統重啟，執行進程被中斷'`<br>4. `extraction_logs.finished_at` 值在測試執行時間的合理範圍內（不是遠古或未來時間） |

---

#### TS-F038-030：多筆孤兒擷取任務批次回收（Integration）

| 欄位 | 內容 |
|------|------|
| **Related Requirement** | AC-1, AC-2, 邊界情況（批次更新） |
| **Test Type** | Integration |
| **自動化就緒度** | 高（需 Test Container PostgreSQL） |
| **前置條件** | 種子資料：3 筆孤兒擷取任務，各自對應 1～2 筆 running extraction_logs（共 5 筆 logs） |
| **操作** | 呼叫 `onApplicationBootstrap()` |
| **預期結果** | 1. DB 中所有 3 筆任務的 `status = 'failed'`<br>2. DB 中所有 5 筆日誌的 `status = 'failed'`<br>3. DB 中無任何 `extraction_tasks.status = 'running'` 或 `extraction_logs.status = 'running'` 的孤兒殘留 |

---

#### TS-F038-031：已軟刪除的 running 任務不被回收（Integration）

| 欄位 | 內容 |
|------|------|
| **Related Requirement** | BR-8 |
| **Test Type** | Integration |
| **自動化就緒度** | 高（需 Test Container PostgreSQL） |
| **前置條件** | 種子資料：1 筆 `extraction_tasks`（`status='running', deleted_at='2026-03-20T00:00:00.000Z'`，已軟刪除）；1 筆對應的 `extraction_logs`（`status='running', finished_at=null`） |
| **操作** | 呼叫 `onApplicationBootstrap()` |
| **預期結果** | 1. DB 中 `extraction_tasks.status` 仍為 `'running'`（未被修改）<br>2. DB 中 `extraction_logs.status` 仍為 `'running'`（未被修改）<br>3. `onApplicationBootstrap()` 正常 resolve，無例外 |

---

#### TS-F038-032：孤兒任務對應零筆日誌時，任務仍更新為 failed 且不報錯（Integration）

| 欄位 | 內容 |
|------|------|
| **Related Requirement** | 邊界情況（孤兒任務無對應日誌） |
| **Test Type** | Integration |
| **自動化就緒度** | 高（需 Test Container PostgreSQL） |
| **前置條件** | 種子資料：1 筆孤兒擷取任務（`status='running', deleted_at=null`）；`extraction_logs` 中無此任務的對應記錄（log 建立失敗的極端情況） |
| **操作** | 呼叫 `onApplicationBootstrap()` |
| **預期結果** | 1. DB 中 `extraction_tasks.status = 'failed'`<br>2. `extraction_logs` 無新增記錄<br>3. `onApplicationBootstrap()` 正常 resolve，無例外 |

---

### 八、E05 ETL Pipeline 回收（Integration）

#### TS-F038-033：有孤兒 Pipeline 時，DB 中 status 確實更新為 failed（Integration）

| 欄位 | 內容 |
|------|------|
| **Related Requirement** | AC-4, BR-4 |
| **Test Type** | Integration |
| **自動化就緒度** | 高（需 Test Container PostgreSQL） |
| **前置條件** | 種子資料：1 筆孤兒 `etl_pipelines`（`status='running', deleted_at=null`）；對應 1 筆 `etl_pipeline_logs`（`status='running', finished_at=null, started_at=NOW()-interval '10 seconds'`） |
| **操作** | 呼叫 `onApplicationBootstrap()` |
| **預期結果** | 1. 查詢 DB：`etl_pipelines.status = 'failed'`<br>2. 查詢 DB：`etl_pipelines` 資料列中無 `error_message` 欄位（或該欄位不存在） |

---

#### TS-F038-034：etl_pipeline_logs finished_at 和 duration_ms 正確計算（Integration）

| 欄位 | 內容 |
|------|------|
| **Related Requirement** | AC-5, BR-6 |
| **Test Type** | Integration |
| **自動化就緒度** | 高（需 Test Container PostgreSQL；duration_ms 只驗證非 null） |
| **前置條件** | 種子資料：1 筆孤兒 Pipeline + 1 筆 `etl_pipeline_logs`（`status='running', finished_at=null, started_at` 設為 10 秒前） |
| **操作** | 呼叫 `onApplicationBootstrap()` |
| **預期結果** | 1. 查詢 DB：`etl_pipeline_logs.status = 'failed'`<br>2. 查詢 DB：`etl_pipeline_logs.finished_at IS NOT NULL`<br>3. 查詢 DB：`etl_pipeline_logs.duration_ms IS NOT NULL`（值為非 null 的正整數；不驗證精確值，因 PostgreSQL `EXTRACT` 結果精度在 SQLite 測試環境不相容）<br>4. 查詢 DB：`etl_pipeline_logs.error_message = '系統重啟，Pipeline 執行進程被中斷'` |
| **備注** | `duration_ms` 使用 PostgreSQL 的 `EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000` 計算，SQLite 不相容。Integration 測試若使用 Test Container PostgreSQL，應驗證 `duration_ms > 0`；若使用 SQLite in-memory，只驗證 `IS NOT NULL` |

---

#### TS-F038-035：多筆孤兒 Pipeline 批次回收（Integration）

| 欄位 | 內容 |
|------|------|
| **Related Requirement** | AC-4, AC-5, 邊界情況（批次更新） |
| **Test Type** | Integration |
| **自動化就緒度** | 高（需 Test Container PostgreSQL） |
| **前置條件** | 種子資料：2 筆孤兒 Pipeline，各對應 2 筆 running pipeline_logs（共 4 筆 logs） |
| **操作** | 呼叫 `onApplicationBootstrap()` |
| **預期結果** | 1. DB 中所有 2 筆 Pipeline 的 `status = 'failed'`<br>2. DB 中所有 4 筆 log 的 `status = 'failed'`、`finished_at IS NOT NULL`、`duration_ms IS NOT NULL` |

---

#### TS-F038-036：已軟刪除的 running Pipeline 不被回收（Integration）

| 欄位 | 內容 |
|------|------|
| **Related Requirement** | BR-8 |
| **Test Type** | Integration |
| **自動化就緒度** | 高（需 Test Container PostgreSQL） |
| **前置條件** | 種子資料：1 筆 `etl_pipelines`（`status='running', deleted_at IS NOT NULL`）；對應 1 筆 running `etl_pipeline_logs` |
| **操作** | 呼叫 `onApplicationBootstrap()` |
| **預期結果** | 1. DB 中 `etl_pipelines.status` 仍為 `'running'`（未被修改）<br>2. DB 中 `etl_pipeline_logs.status` 仍為 `'running'`（未被修改）<br>3. `onApplicationBootstrap()` 正常 resolve |

---

### 九、無孤兒場景（Integration）

#### TS-F038-037：無任何 running 任務/Pipeline 時，不更新任何資料（Integration）

| 欄位 | 內容 |
|------|------|
| **Related Requirement** | AC-7, BR-1 |
| **Test Type** | Integration |
| **自動化就緒度** | 高（需 Test Container PostgreSQL） |
| **前置條件** | DB 中無任何 `status='running'` 的擷取任務或 ETL Pipeline（或只有 `status='failed'` 與 `status='completed'` 的記錄） |
| **操作** | 呼叫 `onApplicationBootstrap()` |
| **預期結果** | 1. DB 中所有 `extraction_tasks` 和 `etl_pipelines` 的 `status` 值維持原狀（無 update 被執行）<br>2. `onApplicationBootstrap()` 正常 resolve，不拋出例外 |

---

### 十、Transaction 與錯誤處理（Integration）

#### TS-F038-038：E04 Transaction 失敗時，任務和日誌均回滾（Integration）

| 欄位 | 內容 |
|------|------|
| **Related Requirement** | BR-7, AC-10 |
| **Test Type** | Integration |
| **自動化就緒度** | 中（需 Test Container PostgreSQL + 可注入的 Transaction 模擬） |
| **前置條件** | 種子資料：1 筆孤兒擷取任務 + 對應日誌；在 E04 Transaction callback 中，模擬 `ExtractionLog` update 操作後拋出例外（驗證回滾） |
| **操作** | 呼叫 `onApplicationBootstrap()` |
| **預期結果** | 1. DB 中 `extraction_tasks.status` 仍為 `'running'`（Transaction 回滾，任務未被修改）<br>2. DB 中 `extraction_logs.status` 仍為 `'running'`（Transaction 回滾，日誌未被修改）<br>3. `onApplicationBootstrap()` 正常 resolve（AC-10，不中止啟動） |
| **備注** | 此場景驗證 Transaction 的原子性：E04 Transaction 若失敗，`extraction_tasks` 和 `extraction_logs` 的更新均回滾，不留下半更新狀態 |

---

#### TS-F038-039：E04 回收失敗時，E05 回收仍完整執行（Integration）

| 欄位 | 內容 |
|------|------|
| **Related Requirement** | AC-10, BR-11 |
| **Test Type** | Integration |
| **自動化就緒度** | 中（需能注入讓 E04 Transaction 失敗的機制） |
| **前置條件** | 種子資料：1 筆孤兒擷取任務 + 1 筆孤兒 Pipeline；使用 mock 或 spy 讓 E04 的 `dataSource.transaction()` 拋出例外，E05 的 `dataSource.transaction()` 正常執行 |
| **操作** | 呼叫 `onApplicationBootstrap()` |
| **預期結果** | 1. DB 中 `extraction_tasks.status` 仍為 `'running'`（E04 失敗，Transaction 回滾）<br>2. DB 中 `etl_pipelines.status = 'failed'`（E05 正常完成）<br>3. DB 中 `etl_pipeline_logs.status = 'failed'`（E05 正常完成）<br>4. `onApplicationBootstrap()` 正常 resolve |

---

### 十一、執行時序（Integration）

#### TS-F038-040：回收在排程引擎首次掃描前完成（Integration）

| 欄位 | 內容 |
|------|------|
| **Related Requirement** | AC-9, 架構設計 2.3（Module 註冊順序） |
| **Test Type** | Integration |
| **自動化就緒度** | 中（需驗證 Module import 順序） |
| **前置條件** | 查看 `app.module.ts` 的 `imports` 陣列順序 |
| **操作** | 靜態驗證 `AppModule` 中 `OrphanRecoveryModule` 位於 `SchedulerModule` 之前的位置 |
| **預期結果** | 1. `AppModule.imports` 陣列中，`OrphanRecoveryModule` 的索引值 < `SchedulerModule` 的索引值<br>2. `OrphanRecoveryModule` 的索引值 > `ExtractionTaskModule` 和 `EtlModule` 的索引值 |
| **備注** | NestJS `OnApplicationBootstrap` 依 Module import 順序依序觸發。此場景可作為靜態架構驗證（code review 層面），也可設計為 E2E 啟動順序追蹤測試（spy `Logger.log` 驗證回收日誌出現在排程日誌之前） |

---

### 十二、回收後操作驗證（Integration）

#### TS-F038-041：回收後可對原孤兒擷取任務執行 triggerRun（不再拋出 EXTRACTION_RUNNING）（Integration）

| 欄位 | 內容 |
|------|------|
| **Related Requirement** | AC-3, F021 相依 |
| **Test Type** | Integration |
| **自動化就緒度** | 高（需 Test Container PostgreSQL） |
| **前置條件** | 種子資料：1 筆孤兒擷取任務（`status='running', deleted_at=null`）；執行 `onApplicationBootstrap()` 完成回收；任務 `status` 已變為 `'failed'` |
| **操作** | 呼叫 `POST /api/v1/extraction-tasks/:id/run`（或直接呼叫 Service 層的 `triggerRun(taskId)`） |
| **預期結果** | 1. 不回傳 HTTP 409 / 不拋出 `EXTRACTION_RUNNING` 錯誤<br>2. 操作正常被接受（HTTP 202 Accepted 或 Service 方法正常返回） |

---

#### TS-F038-042：回收後可對原孤兒擷取任務執行 deleteTask（不再拋出 EXTRACTION_RUNNING）（Integration）

| 欄位 | 內容 |
|------|------|
| **Related Requirement** | AC-3, F025 相依 |
| **Test Type** | Integration |
| **自動化就緒度** | 高（需 Test Container PostgreSQL） |
| **前置條件** | 同 TS-F038-041，回收完成後任務 `status = 'failed'` |
| **操作** | 呼叫 `DELETE /api/v1/extraction-tasks/:id`（或 Service 層的 `deleteTask(taskId)`） |
| **預期結果** | 1. 不回傳 HTTP 409 / 不拋出 `EXTRACTION_RUNNING` 錯誤<br>2. 刪除操作成功（HTTP 200 或 204，或 Service 正常返回）<br>3. 查詢 DB：`extraction_tasks.deleted_at IS NOT NULL`（軟刪除完成） |

---

#### TS-F038-043：回收後可對原孤兒 Pipeline 執行 triggerExecute（不再拋出 PIPELINE_RUNNING）（Integration）

| 欄位 | 內容 |
|------|------|
| **Related Requirement** | AC-6, F030 相依 |
| **Test Type** | Integration |
| **自動化就緒度** | 高（需 Test Container PostgreSQL） |
| **前置條件** | 種子資料：1 筆孤兒 `etl_pipelines`（`status='running', deleted_at=null`，且有合法的 definition）；執行 `onApplicationBootstrap()` 完成回收；Pipeline `status` 已變為 `'failed'` |
| **操作** | 呼叫 `POST /api/v1/etl/pipelines/:id/execute`（或 Service 層的 `triggerExecute(pipelineId)`） |
| **預期結果** | 1. 不回傳 HTTP 409 / 不拋出 `PIPELINE_RUNNING` 錯誤<br>2. 操作正常被接受（HTTP 202 Accepted 或 Service 方法正常返回） |

---

### 十三、冪等性（Integration）

#### TS-F038-044：連續執行兩次回收，第二次 DB 無副作用（Integration）

| 欄位 | 內容 |
|------|------|
| **Related Requirement** | AC-7, BR-1, 邊界情況（快速重啟） |
| **Test Type** | Integration |
| **自動化就緒度** | 高（需 Test Container PostgreSQL） |
| **前置條件** | 種子資料：1 筆孤兒擷取任務 + 1 筆孤兒 Pipeline |
| **操作** | 1. 第一次呼叫 `onApplicationBootstrap()`<br>2. 確認 DB 狀態均為 `'failed'`<br>3. 第二次呼叫 `onApplicationBootstrap()` |
| **預期結果** | 1. 第一次：任務與 Pipeline 均更新為 `'failed'`<br>2. 第二次：DB 中無任何 `status='running'` 記錄，回收機制靜默通過<br>3. 第二次 `updated_at` 未被觸碰（或即使 UPDATE 執行，WHERE 條件 `status='running'` 匹配 0 筆，實際無副作用）<br>4. 兩次 `onApplicationBootstrap()` 均正常 resolve |

---

### 十四、非功能需求

#### TS-F038-045：孤兒回收執行時間不超過 5 秒（NFR-002.12）（Integration）

| 欄位 | 內容 |
|------|------|
| **Related Requirement** | F038 規格 Section 10（非功能需求），NFR-002.12 |
| **Test Type** | Integration / 效能 |
| **自動化就緒度** | 中（需 Test Container PostgreSQL + 受控種子資料集） |
| **前置條件** | 種子資料：預置 20 筆孤兒擷取任務 + 20 筆孤兒 Pipeline（各帶 1～5 筆 running logs，共約 80 筆 logs），模擬較大孤兒數量場景；使用 `Date.now()` 記錄開始與結束時間 |
| **操作** | 呼叫 `onApplicationBootstrap()` |
| **預期結果** | 整個 `onApplicationBootstrap()` 的執行時間 < 5000ms（正常情況下應遠低於此閾值，個位數孤兒時通常 < 100ms） |
| **備注** | 此測試驗證最壞情況下的效能下界。若正式環境孤兒數量可能達百筆以上（如大規模批次崩潰），需重新評估 NFR 閾值 |

---

## 測試資料需求

### 種子資料樣板

#### E04 孤兒任務種子

```
ExtractionTask（孤兒）：
  id: <UUID>
  name: '孤兒任務測試 #1'
  status: 'running'
  deleted_at: null
  created_at: NOW() - interval '1 hour'
  updated_at: NOW() - interval '1 hour'

ExtractionLog（對應孤兒日誌）：
  id: <UUID>
  task_id: <上述 ExtractionTask.id>
  status: 'running'
  started_at: NOW() - interval '1 hour'
  finished_at: null
  error_message: null
  triggered_by: 'manual'
```

#### E04 軟刪除任務種子（不應被回收）

```
ExtractionTask（已軟刪除）：
  id: <UUID>
  status: 'running'
  deleted_at: NOW() - interval '2 days'  -- IS NOT NULL，已軟刪除
```

#### E05 孤兒 Pipeline 種子

```
EtlPipeline（孤兒）：
  id: <UUID>
  name: '孤兒 Pipeline 測試 #1'
  status: 'running'
  deleted_at: null
  created_at: NOW() - interval '30 minutes'

EtlPipelineLog（對應孤兒日誌）：
  id: <UUID>
  pipeline_id: <上述 EtlPipeline.id>
  status: 'running'
  started_at: NOW() - interval '30 minutes'
  finished_at: null
  duration_ms: null
  error_message: null
  is_test_run: false
  triggered_by: 'manual'
```

### 關鍵邊界值

| 邊界情境 | 測試場景 | 說明 |
|---------|---------|------|
| 0 筆孤兒（E04） | TS-F038-016, TS-F038-037 | 靜默通過，無 DB 更新 |
| 1 筆孤兒（E04） | TS-F038-028, TS-F038-029 | 基本回收驗證 |
| 3 筆孤兒（E04） | TS-F038-030 | 批次更新驗證 |
| 1 筆孤兒 + 0 筆日誌 | TS-F038-032 | 無對應日誌的極端情況 |
| 1 筆孤兒 + 3 筆日誌 | TS-F038-008 | 多筆日誌全部修復 |
| 已軟刪除 running 任務 | TS-F038-031, TS-F038-036 | 不應被回收 |
| 第 2 次 bootstrap（0 筆可回收） | TS-F038-044 | 冪等性驗證 |

---

## 測試層級分佈

| 場景 ID | 測試層級 | 說明 |
|---------|---------|------|
| TS-F038-001 ~ TS-F038-027 | Unit | Mock Repository + Mock DataSource，無 DB |
| TS-F038-028 ~ TS-F038-044 | Integration | Test Container PostgreSQL（僅 AppDB，無需外部 DB） |
| TS-F038-045 | Integration / 效能 | Test Container PostgreSQL + 20 筆以上種子資料 |

---

## 自動化就緒度評估

| 類別 | 場景數 | 自動化就緒度 | 說明 |
|------|--------|------------|------|
| Unit（mock Repository） | 27 | 高 | Jest + @nestjs/testing，標準 mock 模式 |
| Integration（Test Container） | 16 | 高 | 需 Test Container PostgreSQL；無前端、無外部 DB 依賴 |
| 效能（NFR） | 1 | 中 | 需受控大量種子資料集；建議僅在 QA 環境執行 |
| 執行時序（Module 順序） | 1 | 中 | 可作為靜態架構審查或 E2E 啟動追蹤測試 |

---

## 風險與注意事項

### RISK-F038-001：duration_ms 的 SQLite 相容性

**風險描述**：`etl_pipeline_logs.duration_ms` 使用 PostgreSQL 專屬的 `EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000` 語法計算。若 Integration 測試環境使用 SQLite（`better-sqlite3`），此語法無法執行，導致回收失敗或測試無法驗證該欄位。

**因應方式**：
1. Integration 測試強制使用 Test Container PostgreSQL（推薦）
2. 若必須使用 SQLite，`duration_ms` 驗證條件降為 `IS NOT NULL`（不驗證精確值）
3. 或將 duration 計算邏輯抽象為可替換的方法（允許測試替換 SQL expression）

**影響場景**：TS-F038-034, TS-F038-035

---

### RISK-F038-002：OnApplicationBootstrap 測試需完整 NestJS Testing Module

**風險描述**：`OrphanRecoveryService` 透過 NestJS DI 注入 Repository 和 DataSource。Integration 測試必須使用 `@nestjs/testing` 的 `Test.createTestingModule()` 建立完整模組環境，不可直接 `new OrphanRecoveryService()`。

**因應方式**：Integration 測試使用下列模組建立方式：
```
Test.createTestingModule({
  imports: [
    TypeOrmModule.forRoot({ type: 'postgres', ...testContainerConfig }),
    TypeOrmModule.forFeature([ExtractionTask, ExtractionLog, EtlPipeline, EtlPipelineLog]),
  ],
  providers: [OrphanRecoveryService],
})
```

**影響場景**：所有 Integration 場景（TS-F038-028 ~ TS-F038-044）

---

### RISK-F038-003：E04 Transaction 失敗的 Integration 測試注入複雜度

**風險描述**：TS-F038-038（Transaction 回滾驗證）和 TS-F038-039（E04 失敗時 E05 仍執行）需要讓 E04 的 Transaction 在特定步驟失敗。在 Integration 測試中，模擬 DB Transaction 中途失敗較複雜（需要 spy `DataSource.transaction` 或注入特殊 mock）。

**因應方式**：
1. 優先以 Unit 測試（TS-F038-021）覆蓋獨立 Transaction 的控制流邏輯
2. Integration 層面（TS-F038-038, TS-F038-039）可降低優先級，標記為「手動整合測試」
3. 或在 `OrphanRecoveryService` 的私有方法設計上提供 TestingModule 可替換的 DataSource mock

**影響場景**：TS-F038-038, TS-F038-039

---

### RISK-F038-004：UpdateDateColumn 的自動更新行為

**風險描述**：TypeORM QueryBuilder `.update().set()` 操作不觸發 `@UpdateDateColumn()` 的自動更新。規格需要 `extraction_tasks.updated_at` 和 `etl_pipelines.updated_at` 也被更新，否則 Admin 查看任務時看到的「最後更新時間」仍為孤兒發生的舊時間。

**測試驗證點**：TS-F038-028（Integration）需驗證 `extraction_tasks.updated_at` 在回收後有更新（值不等於種子資料的 `created_at`）。若實作未明確在 `.set()` 中加入 `updated_at: () => 'NOW()'`，此驗證會失敗。

**影響場景**：TS-F038-028

---

## 開放問題

| ID | 問題 | 影響場景 | 優先級 |
|----|------|---------|--------|
| OQ-F038-001 | `extraction_logs.duration_ms` 欄位是否存在？AC-2 規格未要求計算此欄位（不同於 ETL Pipeline Log），但如果 `ExtractionLog` Entity 有此欄位，回收時是否應計算並填入？ | TS-F038-029 | 低（現有規格已明確：ExtractionLog 不計算 duration_ms） |
| OQ-F038-002 | 回收後 `extraction_tasks.updated_at` 和 `etl_pipelines.updated_at` 是否必須更新？規格未明確要求，但 `@UpdateDateColumn()` 在 QueryBuilder 操作時不自動觸發，需實作明確加入 `updated_at: () => 'NOW()'` | TS-F038-028 | 中（影響 Admin 查看任務的「最後更新時間」正確性） |
| OQ-F038-003 | `etl_pipeline_logs.duration_ms` 欄位型別為 INT。PostgreSQL 的 `EXTRACT(EPOCH FROM ...) * 1000` 回傳 `double precision`，截斷為 INT 時精度損失是否可接受？（長時間宕機後孤兒 duration_ms 可能達數百萬毫秒，INT 最大值 2,147,483,647ms ≈ 24.8 天，若宕機超過 24.8 天會 overflow） | TS-F038-034 | 低（MVP 場景不太可能發生，記錄備查） |
