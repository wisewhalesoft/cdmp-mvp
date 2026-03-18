---
type: test-design-feature
feature_id: F017
feature_name: 建立擷取任務
priority: P0-MVP
related_spec: /docs/specs/features/F017-create-extraction-task.md
last_updated: 2026-03-18
---

# F017: 建立擷取任務 — 測試設計

---

## Acceptance Test Design

### AC-1：成功建立擷取任務

| 項目 | 內容 |
|------|------|
| Given | Admin 已登入，系統中至少存在一個未刪除的 Datasource |
| When | 呼叫 `POST /api/v1/extraction-tasks`，body 含 name、datasourceId、mode、sourceSchema、sourceTable、schedule |
| Then | HTTP 201，回應含新建任務資訊（status=scheduled, enabled=true, lastExecutionAt=null）；Response 含 sourceSchema、sourceTable、rawTableName 欄位 |
| 驗證步驟 | 1. status = scheduled<br>2. enabled = true<br>3. lastExecutionAt = null<br>4. extractedCount = 0<br>5. createdBy = 操作者 User ID<br>6. sourceSchema = 送出值<br>7. sourceTable = 送出值<br>8. rawTableName 格式符合 `raw_[a-f0-9]{8}`（task_id 前 8 碼）<br>9. 新任務出現於 GET /api/v1/extraction-tasks 清單 |

### AC-2：防止重複名稱

| 項目 | 內容 |
|------|------|
| Given | 名為「每日客戶同步」的擷取任務已存在（未軟刪除） |
| When | 嘗試以相同名稱建立 |
| Then | HTTP 409，EXTRACTION_NAME_EXISTS |

### AC-3：增量模式必填欄位驗證

| 項目 | 內容 |
|------|------|
| Given | Admin 已登入 |
| When | POST /api/v1/extraction-tasks，mode=incremental，未提供 incrementalColumn |
| Then | HTTP 422，VALIDATION_ERROR，details 指出 incrementalColumn 為必填 |

### AC-4：欄位驗證

| 項目 | 內容 |
|------|------|
| Given | Admin 已登入 |
| When | 提交不合規資料（例：name 為空、cron 格式錯誤） |
| Then | HTTP 422，VALIDATION_ERROR，details 列出各欄位錯誤 |

### AC-5：資料來源僅顯示未刪除的

| 項目 | 內容 |
|------|------|
| Given | 系統中有 DS_MYSQL_CONNECTED（未刪除）與 DS_DELETED（已軟刪除） |
| When | 提交 datasourceId = DS_DELETED 的 ID |
| Then | HTTP 422，EXTRACTION_DATASOURCE_NOT_FOUND |

### AC-6：選定資料來源後載入 Schema 列表

| 項目 | 內容 |
|------|------|
| Given | Admin 已登入，DS_MYSQL_CONNECTED 存在且可連線 |
| When | 呼叫 `GET /api/v1/datasources/:id/schemas` |
| Then | HTTP 200，回應含 schemas 陣列，列出可用 schema（或 database）名稱 |
| 驗證步驟 | 1. schemas 為非空陣列<br>2. 陣列中每個元素為字串<br>3. 回應不含敏感連線資訊 |

### AC-7：選定 Schema 後載入資料表列表

| 項目 | 內容 |
|------|------|
| Given | Admin 已登入，DS_MYSQL_CONNECTED 存在且可連線，且已選定有效 schema |
| When | 呼叫 `GET /api/v1/datasources/:id/schemas/:schema/tables` |
| Then | HTTP 200，回應含 tables 陣列，列出該 schema 下的資料表名稱 |
| 驗證步驟 | 1. tables 為陣列（可為空，若該 schema 下無表）<br>2. 陣列中每個元素為字串 |

### AC-8：Schema 或 Table 載入失敗

| 項目 | 內容 |
|------|------|
| Given | 目標 Datasource 存在，但外部資料庫無法連線（逾時、認證失敗等） |
| When | 呼叫 GET /datasources/:id/schemas 或 GET /datasources/:id/schemas/:schema/tables |
| Then | HTTP 503，DATASOURCE_SCHEMA_LOAD_FAILED 或 DATASOURCE_TABLE_LOAD_FAILED |

---

## Test Scenarios

### Positive Scenarios — 建立任務 API

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F017-001 | 建立全量擷取任務（含 sourceSchema） | AC-1, BR-4 | Integration | Admin 已登入，DS_MYSQL_CONNECTED 存在 | 1. POST /api/v1/extraction-tasks {name:"每日全量同步", datasourceId, mode:"full", sourceSchema:"public", sourceTable:"customers", schedule:"0 2 * * *"} | HTTP 201，status=scheduled，enabled=true，lastExecutionAt=null，sourceSchema="public"，sourceTable="customers" |
| TS-F017-002 | 建立增量擷取任務 | AC-1, AC-3, BR-3 | Integration | Admin 已登入 | 1. POST /api/v1/extraction-tasks {mode:"incremental", sourceSchema:"sales", sourceTable:"orders", incrementalColumn:"updated_at", lastIncrementalValue:"2026-01-01"} | HTTP 201，incrementalColumn="updated_at"，sourceSchema="sales"，sourceTable="orders" |
| TS-F017-003 | 建立任務後出現於清單 | AC-1 | Integration | 建立任務後 | 1. GET /api/v1/extraction-tasks | 新任務出現於 data 陣列，meta.total 加 1 |
| TS-F017-004 | 軟刪除後同名任務可重新建立 | BR-2 | Integration | 有名為「舊任務」的已軟刪除任務 | 1. POST /api/v1/extraction-tasks {name:"舊任務", sourceSchema:"public", sourceTable:"t"} | HTTP 201（名稱唯一性不含已刪除記錄） |
| TS-F017-005 | Response 含 rawTableName 與 sourceSchema 欄位 | AC-1, BR-13 | Integration | Admin 已登入 | 1. POST /api/v1/extraction-tasks（全量任務，含 sourceSchema）<br>2. 取得 HTTP 201 回應 | 回應 body 含 rawTableName（格式 `raw_` + task_id 前 8 碼，例 `raw_a3f2c1d4`）；含 sourceSchema 欄位 |
| TS-F017-006 | sourceSchema 為 null（不帶 sourceSchema 欄位） | BR-9 | Integration | Admin 已登入（資料庫類型不需要 schema） | 1. POST /api/v1/extraction-tasks {sourceTable:"t", sourceSchema 省略} | HTTP 201；回應中 sourceSchema = null |

### Positive Scenarios — Schema / Table 查詢 API

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F017-007 | GET schemas 回傳 schema 列表 | AC-6, BR-10 | Integration | Admin 已登入，DS_MYSQL_CONNECTED 存在且可連線 | 1. GET /api/v1/datasources/DS_MYSQL_CONNECTED.id/schemas | HTTP 200，{"schemas":["public","information_schema",...]}（陣列，至少含 1 個元素） |
| TS-F017-008 | GET tables 回傳資料表列表 | AC-7, BR-10 | Integration | Admin 已登入，DS_MYSQL_CONNECTED 存在且可連線 | 1. GET /api/v1/datasources/DS_MYSQL_CONNECTED.id/schemas/public/tables | HTTP 200，{"tables":["customers","orders",...]}（陣列） |
| TS-F017-009 | GET schemas 需要 Admin 認證 | BR-1 | Integration | Admin 已登入 | 1. 使用有效 Admin Token 呼叫 GET /datasources/:id/schemas | HTTP 200 |

### Negative Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F017-010 | 名稱重複 | AC-2, BR-2 | Integration | ET_SCHEDULED 已存在（同名） | 1. POST /api/v1/extraction-tasks {name: ET_SCHEDULED.name} | HTTP 409，EXTRACTION_NAME_EXISTS |
| TS-F017-011 | 非 Admin 無權建立任務 | BR-1 | Integration | USER_ACTIVE 已登入 | 1. 以 User Token 呼叫 POST /api/v1/extraction-tasks | HTTP 403，AUTH_FORBIDDEN |
| TS-F017-012 | 指定已刪除的資料來源 | BR-6, AC-5 | Integration | DS_DELETED 存在 | 1. POST 含 datasourceId=DS_DELETED.id | HTTP 422，EXTRACTION_DATASOURCE_NOT_FOUND |
| TS-F017-013 | 增量模式未填增量欄位 | AC-3, BR-3 | Integration | Admin 已登入 | 1. POST {mode:"incremental", sourceTable:"t"}，不含 incrementalColumn | HTTP 422，VALIDATION_ERROR，details 指出 incrementalColumn 為必填 |
| TS-F017-014 | GET schemas — Datasource 不存在 | AC-6 | Integration | 無此 Datasource ID | 1. GET /api/v1/datasources/nonexistent-uuid/schemas | HTTP 404，DS_NOT_FOUND |
| TS-F017-015 | GET schemas — 連線失敗（503） | AC-8, BR-11 | Integration | DS_PG_DISCONNECTED 存在（外部 DB 無法連線） | 1. GET /api/v1/datasources/DS_PG_DISCONNECTED.id/schemas | HTTP 503，DATASOURCE_SCHEMA_LOAD_FAILED |
| TS-F017-016 | GET tables — 連線失敗（503） | AC-8, BR-11 | Integration | DS_PG_DISCONNECTED 存在 | 1. GET /api/v1/datasources/DS_PG_DISCONNECTED.id/schemas/public/tables | HTTP 503，DATASOURCE_TABLE_LOAD_FAILED |
| TS-F017-017 | GET schemas — 非 Admin 無權操作 | BR-1 | Integration | USER_ACTIVE 已登入 | 1. 以 User Token 呼叫 GET /datasources/:id/schemas | HTTP 403，AUTH_FORBIDDEN |
| TS-F017-018 | GET tables — 非 Admin 無權操作 | BR-1 | Integration | USER_ACTIVE 已登入 | 1. 以 User Token 呼叫 GET /datasources/:id/schemas/:schema/tables | HTTP 403，AUTH_FORBIDDEN |

### Boundary Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F017-019 | Cron 表達式邊界驗證 | AC-4, BR-5, BR-7 | Integration | Admin 已登入 | 1. schedule="0 2 * * *"（合法）→ 201<br>2. schedule="invalid-cron"（非法）→ 422<br>3. schedule=""（空）→ 422 | 合法 cron 表達式建立成功，非法格式回傳 VALIDATION_ERROR |
| TS-F017-020 | sourceTable 欄位為必填驗證 | AC-4, BR-9 | Integration | Admin 已登入 | 1. POST 含所有必填欄位，但省略 sourceTable<br>2. POST 含 sourceTable=""（空字串） | 兩者均回傳 HTTP 422，VALIDATION_ERROR，details 指出 sourceTable 為必填 |

---

## 前端 UI 行為測試場景

### 連鎖下拉選單互動

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F017-FE-001 | 初始狀態：Schema 與 Table 下拉停用 | BR-8, UI/UX | Frontend | 建立任務表單開啟，尚未選定資料來源 | 1. 觀察 Schema 下拉選單狀態<br>2. 觀察 Table 下拉選單狀態 | Schema 下拉選單為停用（disabled）狀態；Table 下拉選單為停用狀態；兩者無選項 |
| TS-F017-FE-002 | 選定 Datasource 後自動載入 Schema 列表 | AC-6, BR-10 | Frontend | mock GET /datasources/:id/schemas 回傳 ["public","sales"] | 1. 從 Datasource 下拉選單選擇 DS_MYSQL_CONNECTED<br>2. 觀察 Schema 下拉選單變化 | Schema 下拉選單顯示 loading 狀態；載入完成後啟用並含 "public"、"sales" 兩個選項；Table 下拉選單仍為停用狀態 |
| TS-F017-FE-003 | 選定 Schema 後自動載入 Table 列表 | AC-7, BR-10 | Frontend | mock GET /datasources/:id/schemas/public/tables 回傳 ["customers","orders"] | 1. 選定 Datasource 後再選定 Schema="public"<br>2. 觀察 Table 下拉選單變化 | Table 下拉選單顯示 loading 狀態；載入完成後啟用並含 "customers"、"orders" 選項 |
| TS-F017-FE-004 | 變更 Datasource 時重置 Schema 與 Table | AC-9, BR-8 | Frontend | 已選定 Datasource A、Schema="public"、Table="customers" | 1. 切換 Datasource 至另一個<br>2. 觀察 Schema 與 Table 下拉選單 | Schema 選擇值清空、重新顯示 loading 並載入新 Datasource 的 schema；Table 選擇值清空且保持停用狀態 |
| TS-F017-FE-005 | Schema 載入失敗時顯示錯誤並停用下拉 | AC-8, BR-11 | Frontend | mock GET /datasources/:id/schemas 回傳 HTTP 503 | 1. 選定 Datasource<br>2. 觀察 Schema 下拉選單 | 顯示錯誤訊息「無法連線至資料來源，請至資料來源設定頁面確認連線設定」；Schema 下拉選單停用；不提供手動輸入選項 |
| TS-F017-FE-006 | Table 載入失敗時顯示錯誤並停用下拉 | AC-8, BR-11 | Frontend | mock GET /datasources/:id/schemas/public/tables 回傳 HTTP 503 | 1. 選定 Datasource 與 Schema<br>2. 觀察 Table 下拉選單 | 顯示錯誤訊息；Table 下拉選單停用；不提供手動輸入選項 |

---

## 特殊說明

### sourceSchema 欄位說明

- `sourceSchema` 在 F017 API spec 中標示為「選填」（`string (選填, 最大 255 字元)`）
- 測試設計中，**前端必須透過下拉選單選擇**，無手動輸入 fallback（BR-8、BR-11）
- 後端 API 接受 `sourceSchema` 為空/null，適用於某些資料庫類型不需要 schema 前綴的情境（如 MySQL database 概念可直接指定 table）
- 所有含 `sourceSchema` 的 Response 驗證需確認欄位存在（值可為 null）
