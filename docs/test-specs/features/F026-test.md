---
type: test-design-feature
feature_id: F026
feature_name: 查看擷取資料預覽
priority: P0-MVP
related_spec: /docs/specs/features/F026-preview-raw-data.md
last_updated: 2026-03-18
version_note: v1.1 — 更新 source_schema + source_table 雙欄位設計；meta 新增 sourceSchema 欄位；顯示格式更新為 sourceSchema.sourceTable
---

# F026: 查看擷取資料預覽 — 測試設計

---

## Acceptance Test Design

### AC-1：進入 raw data 預覽頁面

| 項目 | 內容 |
|------|------|
| Given | Admin 已登入，ET_COMPLETED（至少一次 completed 執行，extractedCount > 0，sourceSchema="public"，sourceTable="customers"）存在，對應 raw data 表存在 |
| When | 呼叫 `GET /api/v1/extraction-tasks/:id/raw-data` |
| Then | HTTP 200，回應含 meta（taskId, rawTableName, sourceSchema, sourceTable, totalCount, page, limit, totalPages, lastUpdatedAt）、columns 陣列、data 陣列 |
| 驗證步驟 | 1. meta.rawTableName 格式符合 `raw_[a-f0-9]{8}`<br>2. meta.sourceSchema = "public"<br>3. meta.sourceTable = "customers"<br>4. meta.totalCount > 0<br>5. columns 陣列含所有欄位名稱（含 `_cdmp_extracted_at`）<br>6. data 陣列長度 ≤ meta.limit<br>7. meta.lastUpdatedAt 對應最後一次 completed ExtractionLog.finishedAt |

### AC-2：分頁瀏覽資料

| 項目 | 內容 |
|------|------|
| Given | Admin 在 raw data 預覽頁面，資料表有 120 筆 |
| When | 呼叫 GET /raw-data?page=1&limit=50 |
| Then | HTTP 200，data.length=50，meta.totalCount=120，meta.totalPages=3，meta.page=1 |

### AC-3：欄位顯示

| 項目 | 內容 |
|------|------|
| Given | Admin 在 raw data 預覽頁面 |
| When | 頁面載入完成 |
| Then | columns 包含來源表的所有欄位名稱及系統欄位（`_cdmp_extracted_at`，若來源表無主鍵則含 `_cdmp_id`）；data 中每筆資料含所有欄位值 |

### AC-4：欄位排序

| 項目 | 內容 |
|------|------|
| Given | Admin 在 raw data 預覽頁面 |
| When | 呼叫 GET /raw-data?sortBy=id&sortOrder=asc |
| Then | 回傳資料依 id 升冪排序；data 第一筆的 id 值最小 |

### AC-5：尚無資料時的空狀態

| 項目 | 內容 |
|------|------|
| Given | raw data 表不存在（任務從未成功執行） |
| When | 呼叫 GET /raw-data |
| Then | HTTP 404，EXTRACTION_RAW_TABLE_NOT_FOUND |

### AC-6：顯示資料摘要資訊

| 項目 | 內容 |
|------|------|
| Given | Admin 在 raw data 預覽頁面，任務 sourceSchema="public"、sourceTable="customers" |
| When | 頁面載入完成 |
| Then | meta 含 rawTableName（`raw_{task_id_short}`）、sourceSchema（"public"）、sourceTable（"customers"）、totalCount（總筆數）、lastUpdatedAt（最後一次 completed ExtractionLog.finishedAt）；頁面顯示來源表格式為 "public.customers" |

---

## Test Scenarios

### Positive Scenarios — 後端 API

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F026-001 | 基本 raw data 查詢（200 + 分頁回應，含 sourceSchema） | AC-1, AC-6 | Integration | ET_COMPLETED（sourceSchema="public", sourceTable="customers"）存在，raw data 表有 100 筆資料 | 1. GET /api/v1/extraction-tasks/:id/raw-data | HTTP 200；meta 含 taskId, rawTableName, sourceSchema="public", sourceTable="customers", totalCount=100, page=1, limit=50, totalPages=2, lastUpdatedAt；columns 非空；data.length=50 |
| TS-F026-002 | 分頁參數 page=2 | AC-2, BR-2 | Integration | raw data 表有 120 筆 | 1. GET /raw-data?page=2&limit=50 | HTTP 200；data.length=50（第 51–100 筆）；meta.page=2 |
| TS-F026-003 | 分頁參數 limit=100 | AC-2, BR-2 | Integration | raw data 表有 120 筆 | 1. GET /raw-data?page=1&limit=100 | HTTP 200；data.length=100；meta.limit=100；meta.totalPages=2 |
| TS-F026-004 | 分頁參數 limit=200 | AC-2, BR-2 | Integration | raw data 表有 250 筆 | 1. GET /raw-data?page=1&limit=200 | HTTP 200；data.length=200；meta.limit=200；meta.totalPages=2 |
| TS-F026-005 | 排序參數（升冪） | AC-4 | Integration | raw data 表有資料，含 id 欄位 | 1. GET /raw-data?sortBy=id&sortOrder=asc | data 按 id 升冪排列；data[0].id ≤ data[1].id |
| TS-F026-006 | 排序參數（降冪） | AC-4 | Integration | raw data 表有資料，含 id 欄位 | 1. GET /raw-data?sortBy=id&sortOrder=desc | data 按 id 降冪排列；data[0].id ≥ data[1].id |
| TS-F026-007 | 系統欄位包含在 columns 與 data 中 | AC-3, BR-4 | Integration | raw data 表含 `_cdmp_extracted_at` 欄位 | 1. GET /raw-data | columns 陣列含 `_cdmp_extracted_at`；data 每筆含 `_cdmp_extracted_at` 值（非 null） |
| TS-F026-008 | 來源表無主鍵時 _cdmp_id 包含在回應中 | AC-3, BR-4 | Integration | raw data 表含 `_cdmp_id`（來源表無主鍵）與 `_cdmp_extracted_at` | 1. GET /raw-data | columns 含 `_cdmp_id` 與 `_cdmp_extracted_at`；data 每筆有 `_cdmp_id` 值 |
| TS-F026-009 | 空資料表（totalCount=0） | 邊界情況 | Integration | raw data 表存在但無資料列（全量 TRUNCATE 後尚未寫入） | 1. GET /raw-data | HTTP 200；meta.totalCount=0；data=[]；meta.totalPages=0；columns 仍含欄位名稱清單 |
| TS-F026-010 | meta.lastUpdatedAt 對應最後 completed 日誌 | AC-6, BR-5 | Integration | ET_COMPLETED 有多筆 ExtractionLog（最新 completed 的 finishedAt = "2026-03-18T12:00:00Z"） | 1. GET /raw-data | meta.lastUpdatedAt = "2026-03-18T12:00:00Z" |
| TS-F026-036A | meta 含 sourceSchema 欄位 | AC-6 | Integration | ET_COMPLETED（sourceSchema="analytics", sourceTable="report"）存在 | 1. GET /api/v1/extraction-tasks/:id/raw-data | meta.sourceSchema = "analytics"；meta.sourceTable = "report" |
| TS-F026-036B | meta.sourceSchema 為 null（不含 schema 的任務） | AC-6 | Integration | ET_COMPLETED（sourceSchema=null, sourceTable="customers"）存在 | 1. GET /api/v1/extraction-tasks/:id/raw-data | meta.sourceSchema = null；meta.sourceTable = "customers" |
| TS-F026-011 | 非索引欄位排序（資料量 > 100,000 筆）附帶 warning | BR-6 | Integration | raw data 表有 100,001 筆資料；sortBy 欄位非索引欄位 | 1. GET /raw-data?sortBy=non_indexed_col&sortOrder=asc | HTTP 200；meta.warning 非 null，包含效能警告訊息；data 仍正確回傳 |

### Negative Scenarios — 後端 API

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F026-012 | 擷取任務不存在 | AC-5 | Integration | 無此 task ID | 1. GET /api/v1/extraction-tasks/nonexistent-uuid/raw-data | HTTP 404，EXTRACTION_NOT_FOUND |
| TS-F026-013 | raw data 表不存在（從未成功執行） | AC-5, BR 邊界 | Integration | ET_SCHEDULED（從未執行成功，無 raw data 表） | 1. GET /raw-data | HTTP 404，EXTRACTION_RAW_TABLE_NOT_FOUND |
| TS-F026-014 | 非 Admin 無權查詢 | BR-1 | Integration | USER_ACTIVE 已登入 | 1. 以 User Token 呼叫 GET /raw-data | HTTP 403，AUTH_FORBIDDEN |
| TS-F026-015 | 無效的分頁參數 page=0 | 驗證規則 | Integration | Admin 已登入 | 1. GET /raw-data?page=0 | HTTP 422，VALIDATION_ERROR，details 指出 page 必須 >= 1 |
| TS-F026-016 | 無效的分頁參數 limit=300 | BR-2，驗證規則 | Integration | Admin 已登入 | 1. GET /raw-data?limit=300 | HTTP 422，VALIDATION_ERROR，details 指出 limit 僅允許 50 / 100 / 200 |
| TS-F026-017 | 無效的分頁參數 limit=1 | BR-2，驗證規則 | Integration | Admin 已登入 | 1. GET /raw-data?limit=1 | HTTP 422，VALIDATION_ERROR，details 指出 limit 僅允許 50 / 100 / 200 |
| TS-F026-018 | 無效的排序方向 sortOrder=random | 驗證規則 | Integration | Admin 已登入 | 1. GET /raw-data?sortBy=id&sortOrder=random | HTTP 422，VALIDATION_ERROR，details 指出 sortOrder 僅允許 asc / desc |
| TS-F026-019 | 未登入存取 | 認證 | Integration | 無 Authorization Header | 1. GET /raw-data（不含 Token） | HTTP 401，AUTH_TOKEN_MISSING |

### Boundary Scenarios — 後端 API

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F026-020 | 最後一頁資料（筆數不足整頁） | AC-2 | Integration | raw data 表有 120 筆；limit=50 | 1. GET /raw-data?page=3&limit=50 | HTTP 200；data.length=20（最後 20 筆）；meta.page=3；meta.totalCount=120 |
| TS-F026-021 | 超出最大頁碼 | 邊界情況 | Integration | raw data 表有 100 筆；limit=50（共 2 頁） | 1. GET /raw-data?page=5&limit=50 | HTTP 200；data=[]（無資料）；meta.page=5；meta.totalCount=100 |
| TS-F026-022 | 不指定 sortBy（使用預設排序） | BR-7 | Integration | raw data 表有資料 | 1. GET /raw-data（不帶 sortBy 參數） | HTTP 200；資料按主鍵或 `_cdmp_id` 預設排序 |
| TS-F026-023 | 索引欄位排序時 meta.warning 為 null | BR-6 | Integration | raw data 表有 100,001 筆資料；sortBy 欄位為主鍵（已建索引） | 1. GET /raw-data?sortBy=id&sortOrder=asc | HTTP 200；meta.warning = null（索引欄位不觸發警告） |

---

## Positive Scenarios — 前端（UI 行為）

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F026-024 | API 層 getRawData(taskId, params) 正確呼叫 | AC-1 | Unit（API 層） | API 模組初始化 | 1. 呼叫 getRawData(taskId, {page:1, limit:50})<br>2. 確認 HTTP 請求參數 | 請求發送至 `GET /api/v1/extraction-tasks/{taskId}/raw-data?page=1&limit=50`；Authorization Header 含有效 Token |
| TS-F026-025 | 預覽頁面載入 + 資料表格顯示 | AC-1, AC-3 | Frontend | mock API 回傳 100 筆資料 | 1. 進入預覽頁面<br>2. 等待頁面載入完成 | 頁面頂部顯示資料摘要（rawTableName, totalCount, lastUpdatedAt）；資料以表格呈現；欄位標題對應 columns |
| TS-F026-026 | 分頁互動（切換至第 2 頁） | AC-2 | Frontend | 資料有 120 筆，limit=50 | 1. 點擊分頁控制的「第 2 頁」 | API 以 page=2 重新請求；表格顯示第 2 頁資料；分頁元件顯示目前頁碼=2 |
| TS-F026-027 | 每頁筆數選擇器切換至 100 筆 | AC-2, BR-2 | Frontend | 初始 limit=50 | 1. 在每頁筆數選擇器選擇「100」 | API 以 limit=100, page=1 重新請求；表格顯示最多 100 筆；分頁重置至第 1 頁 |
| TS-F026-028 | 欄位標題點擊排序（升冪 → 降冪） | AC-4 | Frontend | 資料表格已顯示 | 1. 點擊欄位標題「id」（第一次）<br>2. 點擊欄位標題「id」（第二次） | 第一次：API 以 sortBy=id&sortOrder=asc 請求；欄位標題顯示升冪箭頭。第二次：API 以 sortBy=id&sortOrder=desc 請求；欄位標題顯示降冪箭頭 |
| TS-F026-029 | 從日誌 Drawer 點擊「預覽資料」導航 | F022 AC-6 | Frontend E2E | 日誌面板開啟，含 completed (extractedCount > 0) 日誌 | 1. 點擊日誌列表中的「預覽資料」連結 | 頁面導覽至 raw data 預覽頁面；URL 含正確的 taskId |
| TS-F026-030 | 資料摘要區塊顯示正確資訊（含來源表格式） | AC-6, BR-5 | Frontend | mock API 回傳 meta.rawTableName="raw_a3f2c1d4", meta.sourceSchema="public", meta.sourceTable="customers", totalCount=1000, lastUpdatedAt="2026-03-18T12:00:00Z" | 1. 進入預覽頁面 | 頁面頂部顯示表名「raw_a3f2c1d4」；來源表顯示為「public.customers」（sourceSchema.sourceTable 格式）；總筆數「1,000」；最後更新時間以 UTC+8 格式顯示（2026-03-18 20:00） |
| TS-F026-030A | 來源表顯示格式（sourceSchema 為 null） | AC-6 | Frontend | mock API 回傳 meta.sourceSchema=null, meta.sourceTable="customers" | 1. 進入預覽頁面 | 來源表顯示為「customers」（無 schema 前綴，不顯示 "null.customers"） |

---

## Negative Scenarios — 前端（UI 行為）

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F026-031 | 空狀態顯示（raw data 表不存在） | AC-5 | Frontend | mock API 回傳 HTTP 404 EXTRACTION_RAW_TABLE_NOT_FOUND | 1. 進入預覽頁面 | 顯示空狀態訊息「此任務尚無已擷取的資料，請先執行擷取任務」；「立即執行」快捷按鈕存在 |
| TS-F026-032 | 載入中狀態（skeleton/spinner） | 非功能 | Frontend | mock API 延遲 500ms 回應 | 1. 進入預覽頁面<br>2. 觀察頁面尚在載入時 | 顯示 loading 狀態（skeleton 或 spinner）；資料尚未顯示；不顯示技術錯誤訊息 |
| TS-F026-033 | 非索引欄位排序警告 banner 顯示 | BR-6 | Frontend | mock API 回傳 meta.warning="此欄位非索引欄位，排序效能可能受影響" | 1. 點擊非索引欄位排序<br>2. 收到含 warning 的回應 | 頁面顯示 warning 訊息（toast 或 inline banner）；資料仍正常顯示 |
| TS-F026-034 | API 錯誤時不顯示技術錯誤 | 非功能 | Frontend | mock API 回傳 HTTP 500 | 1. 進入預覽頁面 | 顯示「系統發生非預期錯誤，請稍後再試」；不顯示技術 stack trace 或錯誤碼細節 |

---

## Boundary Scenarios — 前端（UI 行為）

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F026-035 | 大量資料警告 banner（totalCount > 100,000） | BR-6 | Frontend | mock API 回傳 meta.totalCount=1,000,000，meta.warning 非 null | 1. 進入預覽頁面（百萬筆資料） | 頁面顯示效能警告提示（totalCount 或 warning 訊息）；不阻擋使用者繼續瀏覽 |
| TS-F026-036 | 大量欄位時表格支援水平捲動 | AC-3 | Frontend | mock API 回傳 25 個欄位 | 1. 進入預覽頁面 | 表格容器支援水平捲動（overflow-x: auto）；所有欄位均可透過捲動存取；頁面不因欄位過多而版面破裂 |

---

## 效能測試場景（NFR）

| ID | Scenario | Test Type | 驗收閾值 | 測試設計說明 |
|----|----------|-----------|---------|------------|
| TS-F026-PERF-001 | 百萬筆資料前段分頁查詢（page ≤ 100） | Performance | 回應時間 < 2 秒（P95） | raw data 表有 1,000,000 筆；GET /raw-data?page=1&limit=50；量測 P95 回應時間 |
| TS-F026-PERF-002 | 百萬筆資料後段分頁查詢（page > 1,000） | Performance | 回應時間 < 5 秒（P95） | raw data 表有 1,000,000 筆；GET /raw-data?page=5000&limit=50；量測 P95 回應時間 |
| TS-F026-PERF-003 | 已索引欄位排序查詢效能 | Performance | 回應時間 < 2 秒（P95） | raw data 表有 1,000,000 筆；sortBy 為已建索引欄位；量測 P95 回應時間 |

---

## 補充說明

### rawTableName 格式驗證規則

所有測試中涉及 `rawTableName` 的驗證，均使用正規表達式 `^raw_[0-9a-f]{8}$` 驗證格式。

### 來源表顯示格式規則（sourceSchema.sourceTable）

F026 spec AC-6 定義：頁面頂部顯示來源表為 `sourceSchema.sourceTable` 格式。

| 情境 | sourceSchema | sourceTable | 頁面顯示 |
|------|-------------|-------------|---------|
| 一般情況 | "public" | "customers" | `public.customers` |
| 跨 schema | "analytics" | "daily_report" | `analytics.daily_report` |
| 無 schema（null） | null | "customers" | `customers`（不顯示 "null.customers"） |

**前端實作建議：** `sourceSchema ? `${sourceSchema}.${sourceTable}` : sourceTable`

### meta 回應欄位更新（v1.1）

F026 API Response 的 `meta` 物件新增 `sourceSchema` 欄位：

```json
{
  "meta": {
    "taskId": "uuid",
    "rawTableName": "raw_a3f2c1d4",
    "sourceSchema": "public",
    "sourceTable": "customers",
    "totalCount": 1000000,
    ...
  }
}
```

`sourceSchema` 可為 `null`（適用於不需要 schema 前綴的資料庫類型）。

### 前端時區顯示驗證原則

`_cdmp_extracted_at` 與 `lastUpdatedAt` 等時間欄位，前端需轉換為 UTC+8（Asia/Taipei）顯示。測試驗證時以 `todayInTaipei()` 工廠函式產生的基準時間比對。

### 效能測試環境說明

百萬筆資料的效能測試（TS-F026-PERF-001 ~ 003）需使用 Test Container 或受控資料集（controlled dataset），不依賴真實外部 DB，由 QA 工程師單獨執行，不納入一般 CI Pipeline。
