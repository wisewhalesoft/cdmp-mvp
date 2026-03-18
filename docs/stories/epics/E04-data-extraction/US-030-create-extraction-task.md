# US-030：建立擷取任務

> **Story ID**：US-030
> **Epic**：[E04 — 資料擷取管理](epic-brief.md)
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：8

---

## User Story

**As a** Admin（管理者）
**I want** 建立一個資料擷取任務，並從下拉選單選擇來源 schema 與資料表
**So that** 平台可以從已設定的資料來源中讀取指定的來源資料表，並將 raw data 真正搬移至 CDMP AppDB 的對應資料表中

---

## 驗收標準

### AC-1：成功建立擷取任務
- **Given** Admin 在擷取任務管理頁面
- **When** Admin 依序選定資料來源、schema、資料表，填寫其餘必填欄位後點擊「建立任務」
- **Then** 系統儲存擷取任務設定，`status` 設為 `scheduled`，`enabled` 設為 `true`，顯示成功訊息，且新任務出現於任務清單中

### AC-2：防止重複名稱
- **Given** 名為「每日客戶同步」的擷取任務已存在
- **When** Admin 嘗試建立另一個相同名稱的擷取任務
- **Then** 系統顯示「此名稱的擷取任務已存在」，且不建立該筆記錄

### AC-3：增量模式必填欄位驗證
- **Given** Admin 選擇擷取模式為「增量」
- **When** Admin 未填寫增量欄位（incremental_column）即提交表單
- **Then** 系統顯示「增量模式必須指定增量欄位」的驗證錯誤訊息

### AC-4：欄位驗證
- **Given** Admin 在建立擷取任務表單
- **When** Admin 提交表單時有必填欄位未填或格式不合規（例如：cron 表達式格式錯誤、名稱為空）
- **Then** 系統針對每個不合規欄位顯示具體的驗證錯誤訊息

### AC-5：資料來源下拉選單
- **Given** Admin 在建立擷取任務表單
- **When** Admin 點擊資料來源下拉選單
- **Then** 系統顯示所有已啟用且未刪除的資料來源清單，包含名稱與類型

### AC-6：選定資料來源後載入 Schema 列表
- **Given** Admin 在建立擷取任務表單，且尚未選定資料來源
- **When** Admin 從下拉選單選定一個資料來源
- **Then** 系統顯示 loading 狀態，透過 `GET /api/v1/datasources/:id/schemas` 向後端查詢可用的 schema（或 database）列表，並填充 schema 下拉選單；資料表下拉選單保持停用狀態

### AC-7：選定 Schema 後載入資料表列表
- **Given** Admin 已選定資料來源，且 schema 下拉選單已載入完成
- **When** Admin 從 schema 下拉選單選定一個 schema
- **Then** 系統顯示 loading 狀態，透過 `GET /api/v1/datasources/:id/schemas/:schema/tables` 查詢該 schema 下的資料表列表，並填充資料表下拉選單

### AC-8：載入失敗時顯示錯誤訊息
- **Given** Admin 已選定資料來源，但系統無法連線至外部資料庫（逾時、認證失敗等）
- **When** schema 或資料表列表載入失敗
- **Then** 系統顯示錯誤訊息（例如：「無法連線至資料來源，請至資料來源設定頁面確認連線設定」），schema 與資料表下拉選單保持停用狀態；不提供手動輸入選項，使用者必須先修復連線設定後重新嘗試

### AC-9：變更資料來源時重置 Schema 與資料表
- **Given** Admin 已選定資料來源與 schema，且資料表下拉選單已有選擇值
- **When** Admin 變更資料來源選擇
- **Then** 系統清除 schema 與資料表的選擇值，並重新載入對應的 schema 列表

---

## Technical Notes

- 建立任務端點：`POST /api/v1/extraction-tasks`
- Request body：
  ```json
  {
    "name": "string",
    "datasourceId": "uuid",
    "mode": "full | incremental",
    "sourceSchema": "string (選填，視資料庫類型而定)",
    "sourceTable": "string (必填)",
    "schedule": "string (cron expression)",
    "incrementalColumn": "string (增量模式必填)",
    "lastIncrementalValue": "string (選填)"
  }
  ```
- Response：`201 Created`，回傳完整的 ExtractionTask 物件

**新增 API 端點（Schema / Table 查詢）：**

| 端點 | 說明 |
|------|------|
| `GET /api/v1/datasources/:id/schemas` | 查詢指定資料來源的可用 schema 或 database 列表 |
| `GET /api/v1/datasources/:id/schemas/:schema/tables` | 查詢指定 schema 下的資料表列表 |

- 兩個端點均由後端透過 `IExtractionExecutor` 介面連線外部資料庫查詢，並需處理逾時（建議設定 10 秒逾時）
- 若連線失敗，回傳 `503 Service Unavailable`，前端顯示錯誤訊息，schema 與資料表下拉選單保持停用

**Entity 欄位設計決策：`source_schema` + `source_table` 分離儲存（已確認）**

- 已決定採用 `source_schema VARCHAR(255) NULLABLE` 欄位，與現有 `source_table` 欄位並列（OQ-1 已解決）
- 各資料庫類型的 schema 對應：
  - **PostgreSQL**：`schema`（例如 `public`）
  - **MySQL**：`database`（MySQL 的 schema 概念等同 database）
  - **SQL Server**：`schema`（例如 `dbo`，database 由 Datasource 連線設定決定）
  - **Oracle**：`schema`（等同 owner/user name）
- 執行 SQL 時，若 `source_schema` 有值，後端組合為 `"schema"."table"` 格式（各 DB 類型依實際語法處理）

**其他注意事項：**

- 資料來源下拉清單端點：複用 `GET /api/datasources`（篩選 `enabled=true`, `deleted_at IS NULL`）
- 建立時 `status` 預設為 `scheduled`，`enabled` 預設為 `true`
- 時區處理：後端儲存 UTC 時間，前端顯示時轉換為 UTC+8（Asia/Taipei）
- `IExtractionExecutor` 需新增 `listSchemas` 與 `listTables` 方法（實作細節待 spec-writer 確認，見 OQ-2）

---

## 測試案例

| # | 測試案例 | 預期結果 |
|---|---------|---------|
| 1 | 以有效資料建立全量擷取任務（透過下拉選單選擇 schema + table） | 建立成功，status 為 scheduled |
| 2 | 建立增量擷取任務（含增量欄位） | 建立成功 |
| 3 | 使用重複名稱建立 | 顯示錯誤訊息 |
| 4 | 增量模式未填增量欄位 | 驗證錯誤訊息 |
| 5 | 缺少任務名稱 | 驗證錯誤訊息 |
| 6 | Cron 表達式格式錯誤 | 驗證錯誤訊息 |
| 7 | 未選擇來源資料表即提交 | 驗證錯誤訊息 |
| 8 | 選定資料來源後 schema 列表載入成功 | schema 下拉選單顯示列表，資料表下拉停用 |
| 9 | 選定 schema 後資料表列表載入成功 | 資料表下拉選單顯示列表 |
| 10 | 資料來源連線失敗時載入 schema 列表 | 顯示錯誤提示，schema 與資料表下拉保持停用，不提供手動輸入 |
| 11 | 變更資料來源後 schema 與資料表重置 | 下拉選單清空並重新載入 |
| 12 | 選定不存在的資料來源 | 回傳 400 Bad Request |
| 13 | 非 Admin 嘗試建立 | 回傳 403 Forbidden |

---

## 依賴關係

- **Blocked By**：US-001（Admin 必須先完成驗證）、US-020（需有資料來源存在）
- **Blocks**：US-031、US-032、US-033、US-034、US-035、US-036、US-037、US-038（擷取任務必須存在才能進行後續操作）

---

## Open Questions

- [x] **OQ-1（架構）**：`source_schema` 欄位是否加入 Entity？還是維持單一 `source_table` 欄位，但由後端根據資料庫類型自動處理 schema prefix？
  - **決策（2026-03-18）**：採用拆分欄位設計，確認使用 `source_schema` + `source_table` 兩個獨立欄位。請更新 data-model.md。
- [ ] **OQ-2（執行器介面）**：`IExtractionExecutor` 需新增 `listSchemas(datasourceId)` 與 `listTables(datasourceId, schema)` 兩個方法，各資料庫類型的實作方式需確認（如 MySQL 用 `SHOW DATABASES`、SQL Server 用 `INFORMATION_SCHEMA.TABLES`）。
  - **狀態（2026-03-18）**：待 spec-writer 確認實作細節。
- [x] **OQ-3（手動輸入 fallback 範圍）**：連線失敗時允許手動輸入是否為 MVP 需求？
  - **決策（2026-03-18）**：不需要手動輸入 fallback。連線失敗時一律顯示錯誤訊息，要求使用者修復連線設定後重新嘗試。
- [x] **OQ-4（列表快取）**：schema / table 列表是否需要快取機制？
  - **決策（2026-03-18）**：不需要快取機制，每次開表單直接向外部資料庫查詢。

---

## Definition of Done

- [ ] 建立擷取任務表單 UI 含所有必填欄位
- [ ] 資料來源下拉選單載入已啟用的資料來源
- [ ] 選定資料來源後，呼叫 `GET /api/v1/datasources/:id/schemas` 載入 schema 列表
- [ ] 選定 schema 後，呼叫 `GET /api/v1/datasources/:id/schemas/:schema/tables` 載入資料表列表
- [ ] Schema 與資料表載入期間顯示 loading 狀態，下拉選單停用
- [ ] 載入失敗時顯示錯誤提示，schema 與資料表下拉保持停用，不提供手動輸入
- [ ] 變更資料來源時自動清除 schema 與資料表選擇並重新載入
- [ ] 擷取模式選擇器（全量 / 增量）
- [ ] 增量模式時動態顯示增量欄位輸入框
- [ ] Cron 表達式輸入與格式驗證
- [ ] 後端 API 端點含驗證邏輯
- [ ] 重複名稱檢查實作完成
- [ ] 任務建立後系統自動於 AppDB 建立 raw data 對應表（命名：`raw_{task_id_short}`）
- [ ] 成功／錯誤回饋訊息正確顯示
- [ ] 所有驗收標準的單元測試通過

---

## 相關文件

- **Epic Brief**：[E04 Epic Brief](epic-brief.md)
- **相關 Stories**：US-031、US-032、US-033、US-034、US-035、US-036、US-037、US-038
