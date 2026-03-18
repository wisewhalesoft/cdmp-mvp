---
type: test-design-feature
feature_id: F019
feature_name: 編輯擷取任務
priority: P0-MVP
related_spec: /docs/specs/features/F019-edit-extraction-task.md
last_updated: 2026-03-18
---

# F019: 編輯擷取任務 — 測試設計

---

## Acceptance Test Design

### AC-1：成功編輯擷取任務

| 項目 | 內容 |
|------|------|
| Given | Admin 已登入，ET_SCHEDULED 存在且 status != running |
| When | 呼叫 `PATCH /api/v1/extraction-tasks/:id`，body 含修改欄位 |
| Then | HTTP 200，回應含更新後完整 ExtractionTask 物件（格式同 F017 Response，含 sourceSchema、sourceTable 與 rawTableName） |
| 驗證步驟 | 1. 回應欄位與送出值一致<br>2. updated_at 已更新<br>3. GET /api/v1/extraction-tasks 清單反映最新資料 |

### AC-2：執行中任務不可編輯

| 項目 | 內容 |
|------|------|
| Given | ET_RUNNING 的 status = running |
| When | 呼叫 PATCH /api/v1/extraction-tasks/ET_RUNNING.id |
| Then | HTTP 409，EXTRACTION_RUNNING |

### AC-3：表單預填既有值（含 Schema / Table 預選）

| 項目 | 內容 |
|------|------|
| Given | Admin 已登入，ET_SCHEDULED（sourceSchema="public", sourceTable="customers"）存在 |
| When | 呼叫 `GET /api/v1/extraction-tasks/:id` |
| Then | HTTP 200，所有欄位含既有值（含 sourceSchema、sourceTable 與 rawTableName），供前端表單預填與下拉預選使用 |

### AC-4：編輯時的欄位驗證

| 項目 | 內容 |
|------|------|
| Given | Admin 已登入 |
| When | PATCH 含 name=""（空字串）或 schedule="invalid-cron" |
| Then | HTTP 422，VALIDATION_ERROR，details 列出錯誤欄位 |

### AC-5：編輯表單開啟時自動載入既有 Schema / Table

| 項目 | 內容 |
|------|------|
| Given | Admin 開啟某任務的編輯表單，任務已有 datasourceId、sourceSchema="public"、sourceTable="customers" |
| When | 表單載入完成（同步呼叫兩個 API） |
| Then | 系統呼叫 GET /datasources/:id/schemas → schema 下拉顯示列表並預選 "public"；同步呼叫 GET /datasources/:id/schemas/public/tables → table 下拉顯示列表並預選 "customers" |

### AC-6：變更 Datasource 時重置並重新載入

| 項目 | 內容 |
|------|------|
| Given | Admin 在編輯表單中，目前已有選定的 Datasource、Schema="public"、Table="customers" |
| When | Admin 切換 Datasource 至另一個 |
| Then | Schema 與 Table 選擇值清空；重新載入新 Datasource 的 schema 列表 |

### AC-7：變更 Schema 時重置並重新載入 Table

| 項目 | 內容 |
|------|------|
| Given | Admin 在編輯表單中，已選定 Datasource 與 Schema |
| When | Admin 切換 Schema |
| Then | Table 選擇值清空；重新載入新 Schema 下的 table 列表 |

### AC-8：連線失敗時下拉停用

| 項目 | 內容 |
|------|------|
| Given | Admin 在編輯表單，外部 DB 無法連線 |
| When | schema 或 table 列表載入失敗 |
| Then | 顯示錯誤訊息；schema 與 table 下拉停用；不提供手動輸入 fallback |

### AC-9：變更來源資料表時顯示 raw data 重建警告

| 項目 | 內容 |
|------|------|
| Given | Admin 在編輯表單中，任務已成功執行過（execution_count > 0），既有 sourceSchema="public"、sourceTable="customers" |
| When | Admin 變更 schema 或 table 選擇（與既有值不同） |
| Then | 系統顯示警告訊息：「變更來源資料表後，下次執行時系統將重新推斷欄位結構，既有 raw data 表可能被重建」；Admin 需確認後才繼續 |

---

## Test Scenarios

### Positive Scenarios — 編輯任務 API

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F019-001 | 成功編輯任務名稱 | AC-1 | Integration | ET_SCHEDULED 存在 | 1. PATCH /api/v1/extraction-tasks/:id {name:"新名稱"} | HTTP 200，name="新名稱" |
| TS-F019-002 | 成功修改排程 cron | AC-1, BR-5 | Integration | ET_SCHEDULED 存在 | 1. PATCH {:id} {schedule:"0 3 * * *"} | HTTP 200，schedule="0 3 * * *" |
| TS-F019-003 | 全量切換至增量模式 | AC-1, BR-4 | Integration | ET_SCHEDULED(mode=full) 存在 | 1. PATCH {:id} {mode:"incremental", incrementalColumn:"id"} | HTTP 200，mode=incremental，incrementalColumn="id" |
| TS-F019-004 | 名稱唯一性排除自身 | BR-3 | Integration | ET_SCHEDULED 存在 | 1. PATCH {:id} {name: ET_SCHEDULED.name}（名稱不變） | HTTP 200（自身名稱不觸發重複驗證） |
| TS-F019-005 | 成功修改 sourceSchema + sourceTable | AC-1, BR-6 | Integration | ET_SCHEDULED 存在 | 1. PATCH {:id} {sourceSchema:"analytics", sourceTable:"new_table_name"} | HTTP 200，sourceSchema="analytics"，sourceTable="new_table_name"；rawTableName 不變（表名由 task_id 決定，不因 sourceSchema/sourceTable 變更而改變） |
| TS-F019-006 | 成功修改 sourceTable 不帶 sourceSchema | AC-1 | Integration | ET_SCHEDULED 存在 | 1. PATCH {:id} {sourceTable:"another_table"}（不修改 sourceSchema） | HTTP 200，sourceTable="another_table"；sourceSchema 保持原值 |

### Negative Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F019-007 | 執行中任務無法編輯 | AC-2, BR-2 | Integration | ET_RUNNING 存在 | 1. PATCH /api/v1/extraction-tasks/ET_RUNNING.id {name:"x"} | HTTP 409，EXTRACTION_RUNNING |
| TS-F019-008 | 名稱重複（與其他任務） | AC-4 | Integration | ET_SCHEDULED, ET_COMPLETED 存在 | 1. PATCH ET_SCHEDULED.id {name: ET_COMPLETED.name} | HTTP 409，EXTRACTION_NAME_EXISTS |
| TS-F019-009 | 非 Admin 無權編輯 | BR-1 | Integration | USER_ACTIVE 已登入 | 1. 以 User Token 呼叫 PATCH /api/v1/extraction-tasks/:id | HTTP 403，AUTH_FORBIDDEN |
| TS-F019-010 | 任務不存在 | AC-2 | Integration | 無此 ID | 1. PATCH /api/v1/extraction-tasks/nonexistent-uuid | HTTP 404，EXTRACTION_NOT_FOUND |

### Boundary Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F019-011 | 增量切換至全量（增量欄位保留但不作執行依據） | AC-1 | Integration | ET_INCREMENTAL(mode=incremental, incrementalColumn="updated_at") | 1. PATCH {:id} {mode:"full"} | HTTP 200，mode=full；incrementalColumn 欄位保留原值（不清除） |
| TS-F019-012 | 變更 sourceSchema + sourceTable 後再次查詢確認欄位 | BR-6 | Integration | ET_COMPLETED（已有執行記錄）存在 | 1. PATCH {:id} {sourceSchema:"new_schema", sourceTable:"another_table"}<br>2. GET /api/v1/extraction-tasks/:id | 回應 sourceSchema="new_schema"，sourceTable="another_table"；rawTableName 不變；BR-6 注記：下次執行將重建 raw data 表 |

---

## 前端 UI 行為測試場景

### 編輯表單初始化（載入既有 Schema / Table）

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F019-FE-001 | 編輯表單開啟時自動載入並預選既有 Schema / Table | AC-3, AC-5, BR-7 | Frontend | ET_SCHEDULED（sourceSchema="public", sourceTable="customers"）; mock GET schemas 回傳 ["public","analytics"]；mock GET tables 回傳 ["customers","orders"] | 1. 開啟 ET_SCHEDULED 的編輯表單<br>2. 等待表單載入完成 | Schema 下拉顯示 ["public","analytics"] 且預選 "public"；Table 下拉顯示 ["customers","orders"] 且預選 "customers"；兩個 API 請求同步發出 |
| TS-F019-FE-002 | 編輯表單初始化時同步呼叫兩個 API | AC-5 | Frontend | 任務有 datasourceId + sourceSchema + sourceTable | 1. 開啟編輯表單<br>2. 攔截 API 請求 | GET /datasources/:id/schemas 與 GET /datasources/:id/schemas/:schema/tables 幾乎同時發出（並行，非序列） |

### 連鎖下拉選單互動（編輯模式）

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F019-FE-003 | 變更 Datasource 時重置 Schema 與 Table | AC-6, BR-8 | Frontend | 已選定 Datasource A、Schema="public"、Table="customers" | 1. 切換 Datasource 至 Datasource B<br>2. 觀察 Schema 與 Table 下拉狀態 | Schema 選擇值清空、重新顯示 loading 並載入新 Datasource 的 schema；Table 選擇值清空且保持停用狀態 |
| TS-F019-FE-004 | 變更 Schema 時重置 Table | AC-7, BR-8 | Frontend | 已選定 Datasource 與 Schema="public"、Table="customers" | 1. 切換 Schema 至 "analytics"<br>2. 觀察 Table 下拉狀態 | Table 選擇值清空；顯示 loading 並載入 "analytics" 下的 table 列表 |
| TS-F019-FE-005 | 連線失敗時下拉停用 | AC-8, BR-9 | Frontend | mock GET schemas 回傳 HTTP 503 | 1. 開啟編輯表單（或切換 Datasource）<br>2. 觀察 schema 下拉狀態 | 顯示錯誤訊息「無法連線至資料來源，請至資料來源設定頁面確認連線設定」；Schema 下拉停用；不提供手動輸入 |

### 變更來源資料表警告 Modal

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F019-FE-006 | 變更 sourceTable 時顯示警告 Modal（execution_count > 0） | AC-9, BR-10 | Frontend | ET_COMPLETED（execution_count > 0）的編輯表單，既有 sourceTable="customers" | 1. 在 Table 下拉選單切換至 "orders"（與既有值不同）<br>2. 觀察是否出現警告 | 系統顯示警告 Modal：「變更來源資料表後，下次執行時系統將重新推斷欄位結構，既有 raw data 表可能被重建」；含「確認變更」與「取消」按鈕 |
| TS-F019-FE-007 | 變更 sourceSchema 時也觸發警告 Modal | AC-9, BR-10 | Frontend | 同上 | 1. 在 Schema 下拉選單切換至 "analytics"（不同的 schema） | 同上：顯示相同的警告 Modal |
| TS-F019-FE-008 | 警告 Modal 點擊「確認變更」→ 更新成功 | AC-9, BR-10 | Frontend | 警告 Modal 已顯示 | 1. 點擊 Modal 的「確認變更」按鈕<br>2. 繼續填寫並提交表單 | Modal 關閉；新選擇的 schema/table 值保留；可正常提交 PATCH 請求 |
| TS-F019-FE-009 | 警告 Modal 點擊「取消」→ 回復原值 | AC-9, BR-10 | Frontend | 警告 Modal 已顯示，原值 sourceTable="customers" | 1. 點擊 Modal 的「取消」按鈕<br>2. 觀察 Table 下拉選單 | Modal 關閉；Table 下拉選單回復顯示原值 "customers"；Schema 下拉亦回復（若有變更） |
| TS-F019-FE-010 | 首次執行的任務（execution_count = 0）變更 Table 不顯示警告 | AC-9, BR-10 | Frontend | 新建任務（execution_count = 0）的編輯表單 | 1. 在 Table 下拉選單切換至不同選項 | 不顯示警告 Modal；直接更新選擇值 |

---

## BR-6 特殊說明

**BR-6（變更 sourceSchema 或 sourceTable 後可能重建 raw data 表）的測試設計方式：**

BR-6 的重建行為發生於「下次執行時」（F021 執行流程），非 PATCH 當下。因此 F019 的測試僅驗證：

1. PATCH 成功後 sourceSchema 與 sourceTable 已更新
2. rawTableName 不因 sourceSchema/sourceTable 變更而改變（rawTableName 由 task_id 決定）

BR-6 的動態重建行為由 F021 的 TS-F021-015（來源表結構變更後的重建）負責完整驗證。

前端 AC-9 警告 Modal 的觸發條件：`execution_count > 0` 且 sourceSchema 或 sourceTable 有實際變更（非初始值）。
