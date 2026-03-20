---
type: test-design-data
last_updated: 2026-03-20
---

# 測試資料策略

> 本文件定義 CDMP MVP 測試所需的種子資料、邊界值、無效輸入、批量資料與 Mock 策略。

---

## 1. 基礎種子資料

### 1.1 使用者帳號

| 帳號代號 | name | email | role | status | 用途 |
|---------|------|-------|------|--------|------|
| ADMIN_ACTIVE | Admin Active | admin@cdmp.test | admin | active | 主要操作者，執行所有管理功能 |
| ADMIN_ACTIVE_2 | Admin Two | admin2@cdmp.test | admin | active | 多 Admin 場景測試（角色變更保護） |
| USER_ACTIVE | User Active | user@cdmp.test | user | active | User 角色登入、RBAC 測試 |
| ADMIN_DISABLED | Admin Disabled | admin-disabled@cdmp.test | admin | disabled | 停用帳號登入測試 |
| USER_DISABLED | User Disabled | user-disabled@cdmp.test | user | disabled | 停用帳號登入測試 |

**密碼規則：** 所有種子帳號使用 `Test1234`（8 字元，符合最短長度要求），以 bcrypt（cost factor >= 10）雜湊儲存。

### 1.2 資料來源

| 資料來源代號 | name | type | host | port | status | 用途 |
|-------------|------|------|------|------|--------|------|
| DS_MYSQL_CONNECTED | MySQL Production | mysql | db-mysql.test | 3306 | connected | MySQL 連線成功場景 |
| DS_PG_DISCONNECTED | PostgreSQL Staging | postgresql | db-pg.test | 5432 | disconnected | PostgreSQL 斷線場景 |
| DS_MSSQL_UNKNOWN | SQL Server Dev | sqlserver | db-mssql.test | 1433 | unknown | SQL Server 未測試場景 |
| DS_MYSQL_FOR_DELETE | MySQL To Delete | mysql | db-del.test | 3306 | connected | 刪除測試用 |
| DS_DELETED | Deleted Source | mysql | db-deleted.test | 3306 | unknown | 已軟刪除（deleted_at 已設定） |

### 1.3 密碼重設 Token

| Token 代號 | 狀態 | expires_at | used_at | 用途 |
|-----------|------|-----------|---------|------|
| RESET_TOKEN_VALID | 有效 | 當前時間 + 23h | NULL | 成功重設密碼測試 |
| RESET_TOKEN_EXPIRED | 過期 | 當前時間 - 1h | NULL | 過期 Token 測試 |
| RESET_TOKEN_USED | 已使用 | 當前時間 + 23h | 當前時間 - 1h | 已使用 Token 測試 |

### 1.5 擷取任務（ExtractionTask）

| 任務代號 | name | datasourceId | mode | status | enabled | schedule | sourceSchema | sourceTable | 用途 |
|---------|------|-------------|------|--------|---------|----------|-------------|------------|------|
| ET_SCHEDULED | 每日全量同步 | DS_MYSQL_CONNECTED | full | scheduled | true | `0 2 * * *` | "public" | "customers_src" | 標準正向場景、排程觸發測試 |
| ET_INCREMENTAL | 每小時增量同步 | DS_MYSQL_CONNECTED | incremental | scheduled | true | `0 * * * *` | "sales" | "transactions_src" | 增量模式測試，incrementalColumn="updated_at" |
| ET_RUNNING | 執行中任務 | DS_MYSQL_CONNECTED | full | running | true | `0 3 * * *` | "public" | "orders_src" | 重複觸發拒絕、不可編輯/停用/刪除測試 |
| ET_FAILED | 最近失敗任務 | DS_PG_DISCONNECTED | full | failed | true | `0 4 * * *` | "public" | "logs_src" | 重新執行測試，errorMessage 有值 |
| ET_COMPLETED | 已完成任務 | DS_MYSQL_CONNECTED | full | completed | true | `0 5 * * *` | "public" | "customers_src" | 執行完成狀態查詢、F026 raw data 預覽 |
| ET_DISABLED | 已停用任務 | DS_MYSQL_CONNECTED | full | disabled | false | `0 6 * * *` | "analytics" | "reports_src" | 停用狀態、排程跳過、手動仍可執行 |
| ET_DELETED | 已刪除任務 | DS_MYSQL_CONNECTED | full | scheduled | true | `0 7 * * *` | "public" | "archive_src" | 軟刪除後不出現於清單、排程排除、日誌保留 |

**建立者規則：** 所有種子 ExtractionTask 的 `createdBy` 均為 ADMIN_ACTIVE.id。

**日期欄位型別：** 所有 `timestamp` 欄位使用 PostgreSQL `timestamp` 型別（不可使用 `datetime`）。

**sourceSchema 欄位說明：** v1.2 起 ExtractionTask 增加 `source_schema` 欄位（VARCHAR 255，可為 NULL）。種子資料均提供有效 sourceSchema，以驗證下拉選單正確預選。如需測試 sourceSchema=null 場景，需額外建立測試資料。

### 1.6 擷取日誌（ExtractionLog）

| 日誌代號 | taskId | status | triggeredBy | startedAt | finishedAt | 用途 |
|---------|--------|--------|------------|-----------|-----------|------|
| LOG_COMPLETED_MANUAL | ET_SCHEDULED.id | completed | manual | 今日 UTC+8 10:00 | 今日 UTC+8 10:05 | 今日成功統計、觸發方式驗證 |
| LOG_COMPLETED_SCHEDULE | ET_SCHEDULED.id | completed | schedule | 今日 UTC+8 02:00 | 今日 UTC+8 02:03 | 排程觸發驗證 |
| LOG_FAILED_TODAY | ET_FAILED.id | failed | manual | 今日 UTC+8 08:00 | 今日 UTC+8 08:01 | 今日失敗統計、errorMessage="連線被拒絕" |
| LOG_RUNNING_NOW | ET_RUNNING.id | running | manual | 今日 UTC+8 當前時間 | null | 執行中日誌（finishedAt=null） |
| LOG_YESTERDAY | ET_SCHEDULED.id | completed | schedule | 昨日 UTC+8 02:00 | 昨日 UTC+8 02:04 | 確認昨日日誌不計入今日統計 |

**時區處理：** `startedAt` 使用 `todayInTaipei()` 工廠函式產生，確保相對於當前台北時間。CI 環境設定 `TZ=Asia/Taipei`。

### 1.4 健康檢查紀錄（DatasourceHealthLog）

| 資料來源 | 紀錄數 | 內容描述 | 用途 |
|---------|--------|---------|------|
| DS_MYSQL_CONNECTED | 48 筆（24h 內） | 全部 success=true，responseTimeMs 100-200ms | 趨勢圖正常場景 |
| DS_PG_DISCONNECTED | 10 筆 | 最近 5 筆 success=false（連續失敗） | 警示清單觸發測試 |
| DS_MSSQL_UNKNOWN | 0 筆 | 無紀錄 | 無資料趨勢圖場景 |

---

## 2. 邊界值資料

### 2.1 密碼長度

| 測試值 | 長度 | 預期結果 | 適用 Feature |
|--------|------|---------|-------------|
| `1234567` | 7 字元 | 驗證失敗 — 低於最短長度 | F004, F009, F010 |
| `12345678` | 8 字元 | 驗證通過 — 恰好最短長度 | F004, F009, F010 |
| `a` × 255 | 255 字元 | 驗證通過 — 長密碼 | F004, F009, F010 |

### 2.2 Port 範圍

| 測試值 | 預期結果 | 適用 Feature |
|--------|---------|-------------|
| `0` | 驗證失敗 — 低於範圍 | F011, F013 |
| `1` | 驗證通過 — 最小值 | F011, F013 |
| `65535` | 驗證通過 — 最大值 | F011, F013 |
| `65536` | 驗證失敗 — 超出範圍 | F011, F013 |
| `-1` | 驗證失敗 — 負數 | F011, F013 |
| `abc` | 驗證失敗 — 非數值 | F011, F013 |

### 2.3 名稱長度

| 欄位 | 測試值 | 長度 | 預期結果 |
|------|--------|------|---------|
| User name | `""` | 0 字元 | 驗證失敗 — 必填 |
| User name | `A` | 1 字元 | 驗證通過 — 最短 |
| User name | `A` × 100 | 100 字元 | 驗證通過 — 最大長度 |
| User name | `A` × 101 | 101 字元 | 驗證失敗 — 超出最大長度 |
| Datasource name | `A` × 100 | 100 字元 | 驗證通過 — 最大長度 |
| Datasource name | `A` × 101 | 101 字元 | 驗證失敗 — 超出最大長度 |
| Datasource description | `A` × 500 | 500 字元 | 驗證通過 — 最大長度 |
| Datasource description | `A` × 501 | 501 字元 | 驗證失敗 — 超出最大長度 |

### 2.4 Email 格式

| 測試值 | 預期結果 |
|--------|---------|
| `user@example.com` | 通過 |
| `USER@EXAMPLE.COM` | 通過（儲存時轉小寫） |
| `user@example` | 失敗 — 缺少頂級域名 |
| `@example.com` | 失敗 — 缺少本地部分 |
| `user@` | 失敗 — 缺少域名 |
| `user` | 失敗 — 非 Email 格式 |
| `""` | 失敗 — 空值 |

### 2.5 分頁參數

| 參數 | 測試值 | 預期結果 |
|------|--------|---------|
| page | 未提供 | 預設 1 |
| page | `0` | 錯誤 — 最小值為 1 |
| page | `1` | 通過 |
| page | 超出總頁數 | 回傳空陣列 |
| limit | 未提供 | 預設 20（擷取任務清單預設 10） |
| limit | `0` | 錯誤 — 最小值為 1 |
| limit | `100` | 通過 — 最大值 |
| limit | `101` | 錯誤 — 超出最大值 |

### 2.6 擷取任務欄位邊界值

| 欄位 | 測試值 | 預期結果 | 適用 Feature |
|------|--------|---------|-------------|
| name | `""` | 驗證失敗 — 必填 | F017, F019 |
| name | `A` × 255 | 驗證通過 — 最大長度 | F017, F019 |
| name | `A` × 256 | 驗證失敗 — 超出最大長度 | F017, F019 |
| sourceTable | `""` | 驗證失敗 — 必填 | F017, F019 |
| sourceTable | `A` × 255 | 驗證通過 — 最大長度 | F017, F019 |
| sourceSchema | 省略（undefined） | 驗證通過 — 選填欄位，儲存為 null | F017, F019 |
| sourceSchema | `""` | 驗證通過 — 空字串儲存為 null 或 ""（視實作而定，需確認） | F017, F019 |
| sourceSchema | `A` × 255 | 驗證通過 — 最大長度 | F017, F019 |
| sourceSchema | `A` × 256 | 驗證失敗 — 超出最大長度 | F017, F019 |
| incrementalColumn | `A` × 255 | 驗證通過 — 最大長度（增量模式） | F017, F019 |
| schedule | `"0 2 * * *"` | 驗證通過 — 合法 cron（5 欄位） | F017, F019 |
| schedule | `"0 2 * * * *"` | 驗證通過 — 合法 cron（6 欄位） | F017, F019 |
| schedule | `"invalid-cron"` | 驗證失敗 — 非法 cron 格式 | F017, F019 |
| schedule | `""` | 驗證失敗 — 必填 | F017, F019 |

### 2.8 F026 raw data 預覽分頁 limit 白名單

| 參數 | 測試值 | 預期結果 | 適用 Feature |
|------|--------|---------|-------------|
| limit | 未提供 | 預設 50 | F026 |
| limit | `50` | 驗證通過 — 最小允許值 | F026 |
| limit | `100` | 驗證通過 | F026 |
| limit | `200` | 驗證通過 — 最大允許值 | F026 |
| limit | `1` | 驗證失敗 — HTTP 422，不在白名單中 | F026 |
| limit | `300` | 驗證失敗 — HTTP 422，不在白名單中 | F026 |
| limit | `0` | 驗證失敗 — HTTP 422 | F026 |
| page | `0` | 驗證失敗 — HTTP 422，最小值為 1 | F026 |
| page | `1` | 驗證通過 | F026 |
| sortOrder | `asc` | 驗證通過 | F026 |
| sortOrder | `desc` | 驗證通過 | F026 |
| sortOrder | `random` | 驗證失敗 — HTTP 422，僅允許 asc / desc | F026 |

### 2.7 趨勢圖 range 參數白名單

| 測試值 | 預期結果 | 適用 Feature |
|--------|---------|-------------|
| `7d` | 驗證通過 | F024 |
| `14d` | 驗證通過 | F024 |
| `30d` | 驗證通過 | F024 |
| `60d` | 驗證失敗 — HTTP 422，VALIDATION_ERROR | F024 |
| `1d` | 驗證失敗 — HTTP 422，VALIDATION_ERROR | F024 |
| `""` | 驗證失敗 — HTTP 422，VALIDATION_ERROR | F024 |
| 未提供 | 預設 `7d` | F024 |

---

## 3. 無效輸入

### 3.1 XSS Payload

| 輸入值 | 適用欄位 | 預期行為 |
|--------|---------|---------|
| `<script>alert('xss')</script>` | name / email / description | 輸入被消毒或跳脫 |
| `<img src=x onerror=alert(1)>` | name / description | 輸入被消毒或跳脫 |
| `javascript:alert(1)` | host | 輸入被消毒 |

### 3.2 SQL Injection

| 輸入值 | 適用欄位 | 預期行為 |
|--------|---------|---------|
| `' OR '1'='1` | email / password | 參數化查詢阻擋，回傳標準錯誤 |
| `'; DROP TABLE users; --` | search / name | 參數化查詢阻擋，回傳標準錯誤 |
| `1; SELECT * FROM users` | port | 型別驗證阻擋 |
| `col; DROP TABLE users; --` | 來源表欄位名稱（sourceTable 讀取的 metadata） | 欄位名稱 sanitize 阻擋（僅允許字母、數字、底線）；不執行惡意 DDL |
| `raw_evil; DROP TABLE users; --` | （來源表名稱 — 僅驗證系統不接受使用者直接輸入表名） | raw data 表名由系統根據 task_id 自動生成，使用者無法控制；不存在此注入路徑 |

### 3.3 空值與格式錯誤

| 情境 | 輸入 | 預期行為 |
|------|------|---------|
| 空 JSON body | `{}` | 回傳 VALIDATION_ERROR，details 列出所有必填欄位 |
| 非 JSON body | `not json` | 回傳 400 Bad Request |
| 空字串欄位 | `{ "name": "" }` | 回傳 VALIDATION_ERROR |
| null 欄位 | `{ "name": null }` | 回傳 VALIDATION_ERROR |

---

## 4. 批量資料

### 4.1 帳號清單效能測試（NFR-002.5）

| 資料量 | 資料描述 | 用途 |
|--------|---------|------|
| 1,000 筆帳號 | 500 admin + 500 user、800 active + 200 disabled | 分頁效能測試：p95 < 500ms |

**名稱生成規則：** `Test User {001-1000}`
**Email 生成規則：** `testuser{001-1000}@cdmp.test`

### 4.2 資料來源清單與儀表板效能測試（NFR-002.4, NFR-002.5）

| 資料量 | 資料描述 | 用途 |
|--------|---------|------|
| 50 筆資料來源 | 20 mysql + 20 postgresql + 10 sqlserver、30 connected + 10 disconnected + 10 unknown | 儀表板載入 < 2 秒 |
| 健康檢查紀錄 | 每個資料來源 90 天 × 每 30 分鐘 ≈ 4,320 筆/來源，共 ~216,000 筆 | 趨勢圖查詢效能 |

### 4.3 擷取任務清單效能測試（NFR-002.6）

| 資料量 | 資料描述 | 用途 |
|--------|---------|------|
| 1,000 筆擷取任務 | 500 full + 500 incremental、300 scheduled + 200 completed + 200 failed + 150 disabled + 150 running | 清單 API p95 < 500ms |
| ExtractionLog | 每個任務平均 30 筆歷史日誌，共 ~30,000 筆 | 今日統計查詢效能 |

**任務名稱生成規則：** `Extraction Task {0001-1000}`
**scheduleule 生成規則：** 均使用 `0 2 * * *`（測試不觸發實際排程）

### 4.4 擷取監控儀表板效能測試（NFR-002.7）

| 資料量 | 資料描述 | 用途 |
|--------|---------|------|
| 50 筆擷取任務 | 30 scheduled + 10 completed + 5 failed + 5 running | 儀表板初始渲染 < 2 秒 |
| 趨勢圖 ExtractionLog | 過去 30 天每天 20 筆執行紀錄，共 ~600 筆 | 趨勢圖查詢效能 |

---

## 5. 時間敏感資料

### 5.1 Token 過期測試

| 測試場景 | 資料需求 | 時間操控方式 |
|---------|---------|------------|
| Access Token 閒置 8h 過期 | 8 小時前發行的 Token | Clock Mock — 將系統時間快轉 8 小時 + 1 秒 |
| 「記住我」Token 30 天過期 | 30 天前發行的 Token | Clock Mock — 將系統時間快轉 30 天 + 1 秒 |
| Password Reset Token 24h 過期 | expires_at 為 24 小時前 | 直接設定 DB 記錄的 expires_at 為過去時間 |
| Token Blocklist 清理 | expires_at 已過的 Blocklist 記錄 | 直接設定 DB 記錄的 expires_at 為過去時間 |
| 健康檢查紀錄 90 天清理 | checked_at 為 91 天前的紀錄 | 直接設定 DB 記錄的 checked_at 為 91 天前 |

### 5.2 排程測試（E03 健康檢查）

| 測試場景 | 資料需求 |
|---------|---------|
| 自動健康檢查每 30 分鐘執行 | 至少 2 個未刪除的資料來源 |
| 健康檢查排除已刪除資料來源 | 1 個未刪除 + 1 個已刪除的資料來源 |

### 5.3 擷取任務排程測試（E04）

| 測試場景 | 資料需求 | 時間操控方式 |
|---------|---------|------------|
| 排程觸發執行 | ET_SCHEDULED(schedule="0 2 * * *"，enabled=true) | scanAndExecute(new Date("2026-03-18T02:00:00Z")) — injectable time 參數，直接呼叫服務函式 |
| 排程不符合當前時間，不觸發 | ET_SCHEDULED(schedule="0 2 * * *") | scanAndExecute(new Date("2026-03-18T03:00:00Z")) — 時間不符合 cron，驗證無新日誌 |
| 停用任務排程跳過 | ET_DISABLED(enabled=false，schedule="0 2 * * *") | scanAndExecute(fakeNow=UTC 02:00) — 驗證 ET_DISABLED 被跳過 |
| 執行中任務排程跳過 | ET_RUNNING(status=running，schedule="0 2 * * *") | scanAndExecute(fakeNow=UTC 02:00) — 驗證 ET_RUNNING 被跳過 |

### 5.4 擷取任務今日統計時區測試（E04）

| 測試場景 | 資料需求 | 說明 |
|---------|---------|------|
| 今日成功統計（UTC+8） | LOG_COMPLETED_MANUAL（startedAt = todayInTaipei() 10:00） | 確認計入今日 |
| 昨日紀錄不計入今日 | LOG_YESTERDAY（startedAt = todayInTaipei() 減 1 天的 02:00） | 確認不計入今日統計 |
| UTC+8 午夜跨日邊界 | UTC+8 00:00 前後各一筆日誌 | 確認以台北時區切日，而非 UTC |

**工廠函式定義：** `todayInTaipei()` 回傳以 UTC+8 當日 00:00:00 為起點的 Date 物件，測試時依此計算各筆日誌的 startedAt。

---

## 6. Mock 策略

### 6.1 目標資料庫 Mock

| Mock 對象 | 模擬行為 | 適用場景 |
|----------|---------|---------|
| MySQL Driver | 連線成功 → 回傳 `SELECT 1` 結果 + 回應時間 | F015 連線成功 |
| PostgreSQL Driver | 連線拒絕 → 拋出 ConnectionRefused | F015 連線失敗 |
| SQL Server Driver | 連線逾時 → 超過 10 秒無回應 | F015 連線逾時 |
| 任意 Driver | 認證失敗 → 拋出 AuthenticationFailed | F015 憑證錯誤 |
| 任意 Driver | 資料庫不存在 → 拋出 DatabaseNotFound | F015 資料庫名稱錯誤 |

**替代方案：** 若使用 Test Container，可啟動真實資料庫實例進行整合測試。

### 6.2 Email 服務 Mock

| Mock 對象 | 模擬行為 | 適用場景 |
|----------|---------|---------|
| SMTP / SendGrid | 發送成功 → 記錄收件人、主旨、內容 | F009 AC-1 發送重設連結 |
| SMTP / SendGrid | 發送失敗 → 拋出 ServiceUnavailable | F009 Email 發送失敗（SYSTEM_EMAIL_SEND_FAILED） |

**驗證方式：** Mock Email Service 應記錄已發送的 Email，供測試驗證收件人與內容。

### 6.3 時鐘 Mock

| Mock 對象 | 模擬行為 | 適用場景 |
|----------|---------|---------|
| System Clock | 快轉至未來時間 | Token 過期測試、Reset Token 過期測試 |
| System Clock | 設定為特定時間點 | 排程觸發測試、90 天紀錄清理測試 |

**實作建議：** 業務邏輯中的 `now()` 呼叫應透過可注入的 Clock 介面取得，使測試可以替換為 Fake Clock。

### 6.4 E04 排程引擎 Mock（Injectable Time）

| Mock 對象 | 模擬行為 | 適用場景 |
|----------|---------|---------|
| scanAndExecute(fakeNow) | 以指定 Date 物件作為「當前時間」執行排程掃描 | F023 排程觸發、跳過、排除測試 |
| waitForTaskStatus(taskId, status, 5000) | 以 300ms interval polling ExtractionTask 狀態，達到預期狀態後回傳 | F021 非同步執行結果驗證 |
| jest.spyOn(Logger, 'error') | 監聽 Logger.error 呼叫，驗證錯誤被記錄 | F023 DB 不可用錯誤處理 |
| DB 連線 stub | throw Error（模擬 DB 暫時不可用） | F023 TS-F023-007 |

**注意：** `scanAndExecute(fakeNow)` 與 `waitForTaskStatus` 均為純測試工具，不需修改任何 production code。production 的排程函式僅需將「取得當前時間」的邏輯抽取為可注入的依賴即可。

---

## 7. 資料隔離策略

### 測試間資料隔離

| 策略 | 說明 |
|------|------|
| Transaction Rollback | 每個測試在 Transaction 中執行，結束後 rollback |
| Database Reset | 每個測試套件開始前重置為種子資料狀態 |
| 唯一識別碼 | 測試產生的資料使用可辨識的前綴（如 `test-` 或 UUID） |

### 環境隔離

| 環境 | 用途 | 資料策略 |
|------|------|---------|
| Unit Test | 單元測試 | 無資料庫，純邏輯測試 |
| Integration Test | API 整合測試 | 測試資料庫 + 種子資料 |
| E2E Test | 瀏覽器測試 | 測試資料庫 + 種子資料 + 完整服務 |
| Performance Test | 效能測試 | 測試資料庫 + 批量資料 |

---

## 8. Raw Data 動態表測試資料策略

> 以下策略專門針對 F021（執行擷取任務，資料落地）與 F026（raw data 預覽）的測試需求。

### 8.1 外部來源資料庫 Mock 策略

F021 的 raw data 落地測試需要一個可受控的「外部來源資料庫」：

| 策略 | 說明 | 適用場景 |
|------|------|---------|
| Test Container（推薦） | 以 Docker 啟動真實 MySQL/PostgreSQL 實例，在測試中建立來源表並插入受控資料 | F021 所有 raw data 落地場景 |
| Driver Mock（備選） | Mock 外部 DB Driver，模擬 `SELECT * FROM source_table`、`INFORMATION_SCHEMA` 查詢回傳固定資料 | 不需驗證真實 DB 互動時的單元測試 |

**雙 Test Container 架構：**

測試環境需同時啟動兩個 Test Container：
1. **源 DB Container**（外部資料來源，如 MySQL 5.7）：建立來源表、插入測試資料
2. **AppDB Container**（CDMP AppDB，PostgreSQL 14）：存放 raw data 表，執行後驗證資料落地

### 8.2 來源表種子資料集

| 資料集代號 | 表名 | 欄位結構 | 資料筆數 | 用途 |
|-----------|------|---------|---------|------|
| SRC_TABLE_SIMPLE | customers_src | id(INT PK), name(VARCHAR), email(VARCHAR), created_at(DATETIME) | 10 筆 | 基本 raw data 落地驗證 |
| SRC_TABLE_NO_PK | events_src | event_type(VARCHAR), value(INT), occurred_at(DATETIME) | 10 筆（無主鍵） | `_cdmp_id` 自動附加測試 |
| SRC_TABLE_LARGE | orders_src | id(INT PK), customer_id(INT), amount(DECIMAL), created_at(DATETIME) | 1,001 筆 | 批次寫入邊界（跨越 1,000 筆邊界） |
| SRC_TABLE_INCREMENTAL | transactions_src | id(INT PK), amount(DECIMAL), updated_at(DATETIME) | 100 筆，updated_at 橫跨 2026-01-01 ~ 2026-03-18 | 增量模式測試，lastIncrementalValue="2026-02-01" |
| SRC_TABLE_CHANGED | logs_src（初版：id+message）→（變更後：id+message+severity）| 2 版本的欄位結構 | 5 筆 | 來源表結構變更 → raw data 表重建測試 |
| SRC_TABLE_EVIL_COLS | malicious_src | id(INT), `col; DROP TABLE users; --`(VARCHAR) | 1 筆 | 欄位名稱 sanitize 安全測試 |

**資料生成規則：** SRC_TABLE_LARGE 的 1,001 筆 orders 資料以 factory 函式生成：`Array.from({length:1001}, (_, i) => ({id: i+1, customer_id: Math.ceil((i+1)/10), amount: ((i+1) * 9.99).toFixed(2), created_at: '2026-01-01 00:00:00'}))。`

### 8.3 AppDB raw data 表驗證策略

測試驗證 AppDB 中 raw data 表正確落地，需驗證以下項目：

| 驗證項目 | 驗證方式 |
|---------|---------|
| 表存在 | `SELECT table_name FROM information_schema.tables WHERE table_name = 'raw_{task_id_short}'` |
| 欄位清單 | `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'raw_{task_id_short}'` |
| `_cdmp_extracted_at` 欄位存在 | 同上，確認 `_cdmp_extracted_at` 在 columns 清單中 |
| `_cdmp_id` 欄位（無主鍵來源表） | 同上，確認 `_cdmp_id` 在 columns 清單中（SERIAL 類型） |
| 資料筆數 | `SELECT COUNT(*) FROM raw_{task_id_short}` |
| 資料抽樣 | `SELECT * FROM raw_{task_id_short} LIMIT 3` — 確認欄位值與來源一致 |
| 全量 TRUNCATE 驗證 | 執行前記錄舊表 COUNT，執行後驗證 COUNT = 新來源筆數（不保留舊資料） |
| 增量追加驗證 | 執行前記錄舊表 COUNT，執行後驗證 COUNT = 舊 COUNT + 新增筆數 |

### 8.4 F026 raw data 預覽測試資料集

| 資料集代號 | 說明 | 用途 |
|-----------|------|------|
| RAW_DATA_SMALL | `raw_{task_id_short}` 表有 120 筆（4 個欄位：id, name, value, _cdmp_extracted_at） | 基本分頁、排序測試 |
| RAW_DATA_EMPTY | `raw_{task_id_short}` 表存在但無資料列 | 空資料表測試（AC-5 邊界） |
| RAW_DATA_LARGE | `raw_{task_id_short}` 表有 1,000,000 筆 | F026 效能測試（僅在 QA 環境執行） |
| RAW_DATA_WIDE | `raw_{task_id_short}` 表有 25 個欄位 | 水平捲動測試 |
| RAW_DATA_NO_TABLE | raw data 表不存在 | EXTRACTION_RAW_TABLE_NOT_FOUND 測試 |

**效能測試資料建立方式（RAW_DATA_LARGE）：**
使用 `INSERT INTO raw_{task_id_short} SELECT generate_series(1, 1000000) AS id, 'name_' || generate_series(1, 1000000)::text AS name, now() AS _cdmp_extracted_at`（PostgreSQL 語法）。需在 QA 環境預先建立，不在 CI 每次執行。

### 8.5 rawTableName 格式驗證規則

所有測試中需驗證 rawTableName 格式的場景，均使用以下正規表達式：

```
/^raw_[0-9a-f]{8}$/
```

rawTableName 由系統根據 `task_id`（UUID）的前 8 碼（hex 字元）自動生成。範例：
- task_id = `a3f2c1d4-xxxx-xxxx-xxxx-xxxxxxxxxxxx` → rawTableName = `raw_a3f2c1d4`
- task_id = `0098beef-xxxx-xxxx-xxxx-xxxxxxxxxxxx` → rawTableName = `raw_0098beef`

---

## 9. Schema / Table 查詢 API 測試資料策略（F017 v1.2、F019 v1.2）

> 以下策略針對新增的兩個 API 端點：`GET /datasources/:id/schemas` 與 `GET /datasources/:id/schemas/:schema/tables`。

### 9.1 各資料庫類型的 Schema 概念差異

不同資料庫對「schema」的概念不同，測試資料需反映此差異：

| 資料庫類型 | Schema 概念 | Mock 回應範例 |
|-----------|------------|-------------|
| PostgreSQL | schema（public, information_schema, pg_catalog, pg_temp） | `{"schemas":["public","analytics","information_schema"]}` |
| MySQL | database（無 schema，等同 database） | `{"schemas":["cdmp_db","test_db","information_schema"]}` |
| SQL Server | schema（dbo, sys, guest, INFORMATION_SCHEMA） | `{"schemas":["dbo","sys","INFORMATION_SCHEMA"]}` |

**注意：** 不同 DB 類型回傳的 schema 列表含義不同（MySQL 回傳 database 名稱），但 API 介面統一使用 `schemas` 陣列表示，前端下拉選單統一顯示。

### 9.2 Schema / Table 查詢 API Mock 資料集

| Mock 資料集代號 | 對應 Datasource | GET /schemas 回應 | GET /schemas/:schema/tables 回應 | 用途 |
|---------------|----------------|------------------|--------------------------------|------|
| SCHEMA_MOCK_PG | DS_MYSQL_CONNECTED（以 PG 為例） | `{"schemas":["public","analytics","information_schema"]}` | `{"tables":["customers","orders","products"]}` | 標準成功場景（前端下拉載入） |
| SCHEMA_MOCK_MYSQL | DS_MYSQL_CONNECTED | `{"schemas":["cdmp_db","test_db"]}` | `{"tables":["users","transactions"]}` | MySQL database 概念測試 |
| SCHEMA_MOCK_EMPTY_TABLES | DS_MYSQL_CONNECTED | `{"schemas":["public"]}` | `{"tables":[]}` | schema 下無任何 table 的邊界情況 |
| SCHEMA_MOCK_FAIL | DS_PG_DISCONNECTED | HTTP 503，DATASOURCE_SCHEMA_LOAD_FAILED | HTTP 503，DATASOURCE_TABLE_LOAD_FAILED | 連線失敗場景 |
| TABLE_MOCK_FAIL | DS_PG_DISCONNECTED（schema 存在但 table 載入失敗） | `{"schemas":["public"]}` | HTTP 503，DATASOURCE_TABLE_LOAD_FAILED | schema 載入成功但 table 載入失敗 |

### 9.3 前端連鎖下拉選單測試資料需求

前端測試（F017 FE、F019 FE）使用 mock API，需以下測試資料：

| 場景 | Mock 設定 | 驗證重點 |
|------|---------|---------|
| 選定 Datasource → 載入 schemas | GET /schemas stub 回傳 SCHEMA_MOCK_PG | Schema 下拉呈現選項、Table 下拉仍停用 |
| 選定 Schema → 載入 tables | GET /schemas/:schema/tables stub 回傳 SCHEMA_MOCK_PG | Table 下拉呈現選項、可選擇 |
| 連線失敗（schema 載入） | GET /schemas stub 回傳 HTTP 503 | 錯誤訊息出現、下拉停用、無手動輸入 |
| 連線失敗（table 載入） | GET /schemas/:schema/tables stub 回傳 HTTP 503 | 同上（TABLE 層級） |
| 編輯表單預選 | GET /schemas 含既有 schema，GET /tables 含既有 table | 下拉預選正確值 |
| 變更 Datasource → 重置 | 切換 Datasource 後 GET /schemas 以新 ID 呼叫 | 舊 schema/table 清空，新 schemas 載入 |

### 9.4 Schema / Table 查詢錯誤碼

| 錯誤碼 | HTTP Status | 觸發場景 | 適用測試 |
|--------|------------|---------|---------|
| `DATASOURCE_SCHEMA_LOAD_FAILED` | 503 | 外部 DB 連線失敗（逾時、認證失敗、DB 不可用）→ schema 列表無法取得 | TS-F017-015、F019 FE-005 |
| `DATASOURCE_TABLE_LOAD_FAILED` | 503 | 外部 DB 連線失敗 → table 列表無法取得 | TS-F017-016 |
| `DS_NOT_FOUND` | 404 | 指定的 Datasource 不存在或已軟刪除 | TS-F017-014 |

**前端行為要求（BR-11、BR-12）：**
- 連線失敗時下拉停用，不提供手動輸入 fallback
- 每次開啟表單均即時查詢（不使用快取）

---

## 10. E05 ETL Pipeline 管理模組測試資料策略（F027–F036）

> 本章節定義 E05 模組所需的種子資料、狀態工廠、邊界值與時區處理策略。

### 10.1 Pipeline 狀態種子資料

以下種子資料供 E05 測試套件共用，依 Feature 需要選取適當資料集。

#### EtlPipeline 種子資料

| 資料代號 | status | enabled | schedule | deleted_at | 對應 EtlPipelineVersion | 用途 |
|---------|--------|---------|----------|------------|----------------------|------|
| PL_DRAFT | draft | false | null | null | v1（status=draft） | 測試執行、無排程場景、草稿不可啟用 |
| PL_ACTIVE | active | true | `0 2 * * *` | null | v1（status=published） | 手動執行、停用/啟用、列表場景 |
| PL_ACTIVE_NO_SCHEDULE | active | true | null | null | v1（status=published） | 停用時不呼叫 removeJob |
| PL_RUNNING | running | true | `0 3 * * *` | null | v1（status=published）+ 1 筆 status=running 的 EtlPipelineLog | 重複觸發 409、排程跳過 |
| PL_FAILED | failed | true | null | null | v1（status=published） | 重新執行（triggered_by=retry）、停用 failed |
| PL_DISABLED | disabled | false | `0 4 * * *` | null | v1（status=published） | 啟用場景 |
| PL_WITH_VERSIONS | active | true | `0 2 * * *` | null | v1（published）、v2（published）、v3（draft） | F033 版本管理、排程最新版本 |
| PL_WITH_LOGS | active | true | null | null | v1（published）+ 3 筆 EtlPipelineLog | F032 日誌查詢 |
| PL_SOFT_DELETED | — | — | — | UTC 時間戳記（非 null） | v1（draft）+ 2 筆 EtlPipelineLog | 軟刪除排除、日誌保留驗證 |
| PL_SCHEDULED | active | true | `0 2 * * *` | null | v1（published）、v2（published，較新） | F030/F033 排程觸發最新版本 |

**建立者規則：** 所有種子 EtlPipeline 的 `created_by` 均為 ADMIN_ACTIVE.id。

**日期欄位型別：** 所有 `timestamp` 欄位使用 PostgreSQL `timestamp` 型別（不可使用 `datetime`）。

#### EtlPipelineVersion 種子資料

| 資料代號 | pipeline_id | version | status | definition | change_summary | 用途 |
|---------|-------------|---------|--------|-----------|---------------|------|
| PV_DRAFT | PL_DRAFT.id | 1 | draft | `{"nodes":[],"edges":[]}` | null | 初始狀態 |
| PV_TESTING | PL_DRAFT.id（另一組）| 1 | testing | 含 1 個節點的 definition | "初次設定" | 發布前置條件驗證 |
| PV_PUBLISHED | PL_ACTIVE.id | 1 | published | 含 3 個節點、2 條連線的 definition | "發布版本 1" | 標準正向場景 |
| PV_ROLLBACK_SOURCE | PL_WITH_VERSIONS.id | 1 | published | SEED_DEFINITION_V1（已知結構） | "初版" | F033 回滾來源 |
| PV_DIFF_V1 | PL_WITH_VERSIONS.id | 1 | published | SEED_DEFINITION_V1 | "v1" | F033 Diff 比對基準 |
| PV_DIFF_V2 | PL_WITH_VERSIONS.id | 2 | published | SEED_DEFINITION_V2（含明確差異） | "v2" | F033 Diff 比對目標 |

**SEED_DEFINITION_V1 / V2 格式** 請參閱 F033-test.md「Test Data Requirements」章節。

#### EtlPipelineLog 種子資料

| 資料代號 | pipeline_id | version | status | triggered_by | is_test_run | started_at | finished_at | 用途 |
|---------|-------------|---------|--------|-------------|------------|-----------|------------|------|
| LOG_MANUAL_COMPLETED | PL_ACTIVE.id | 1 | completed | manual | false | 今日 UTC+8 10:00（`todayInTaipei()`） | 今日 UTC+8 10:05 | 今日成功統計、手動觸發 |
| LOG_SCHEDULE_COMPLETED | PL_ACTIVE.id | 1 | completed | schedule | false | 今日 UTC+8 02:00（`todayInTaipei()`） | 今日 UTC+8 02:03 | 排程觸發驗證 |
| LOG_TEST_RUN | PL_DRAFT.id | 1 | completed | test | true | 今日 UTC+8 09:00 | 今日 UTC+8 09:02 | is_test_run 隔離；版本 draft→testing |
| LOG_FAILED_TODAY | PL_FAILED.id | 1 | failed | manual | false | 今日 UTC+8 08:00 | 今日 UTC+8 08:01 | 今日失敗統計；errorMessage 非空 |
| LOG_RUNNING_NOW | PL_RUNNING.id | 1 | running | manual | false | 今日 UTC+8 當前時間 | null | 執行中狀態；finishedAt=null |
| LOG_YESTERDAY | PL_ACTIVE.id | 1 | completed | schedule | false | 昨日 UTC+8 02:00（`todayInTaipei() - 1 day`） | 昨日 UTC+8 02:04 | 確認昨日紀錄不計入今日統計 |

**時區處理**：`started_at` / `finished_at` 使用 `todayInTaipei()` 工廠函式產生，確保相對於當前台北時間。CI 環境設定 `TZ=Asia/Taipei`。

### 10.2 版本狀態流轉測試資料

| 狀態流轉目標 | 前置 EtlPipeline 狀態 | 前置 EtlPipelineVersion 狀態 | 前置 EtlPipelineLog | 操作 |
|------------|---------------------|---------------------------|------------------|------|
| draft → testing | draft | draft | 無 | POST /test + waitForPipelineStatus completed |
| testing → published | draft（有 testing 版本） | testing | is_test_run=true, status=completed | PATCH /versions/:id/publish |
| published → 排程可觸發 | active | published | — | scanAndExecute(fakeNow=觸發時間) |
| active → disabled | active | published | — | PATCH /toggle enabled=false |
| disabled → active | disabled | published | — | PATCH /toggle enabled=true |

### 10.3 今日統計時區邊界種子資料（E05）

與 E04（F018/F024）使用相同的 `todayInTaipei()` 工廠函式模式。

| 場景 | started_at 設定 | 說明 |
|------|---------------|------|
| 今日 UTC+8 統計（應計入） | `todayInTaipei() + 1 秒`（UTC+8 今日 00:00:01） | 確認計入今日 |
| 昨日 UTC+8 統計（不應計入） | `todayInTaipei() - 1 秒`（UTC+8 昨日 23:59:59） | 確認不計入今日 |
| 午夜跨日邊界 | UTC+8 00:00 前後各一筆（= UTC 前一日 16:00 前後） | 確認以台北時區切日，而非 UTC |

**工廠函式定義：** `todayInTaipei()` 回傳以 UTC+8 當日 00:00:00 為起點的 Date 物件。

### 10.4 邊界值（E05 特有欄位）

| 欄位 | 測試值 | 預期結果 | 適用 Feature |
|------|--------|---------|-------------|
| Pipeline name | `""` | 驗證失敗 — 必填 | F028 |
| Pipeline name | `"A".repeat(255)` | 驗證通過 — 最大長度 | F028 |
| Pipeline name | `"A".repeat(256)` | 驗證失敗 — 超出上限 | F028 |
| schedule（Cron） | `"0 2 * * *"` | 驗證通過 — 5 欄位標準 cron | F028 |
| schedule（Cron） | `"0 0 2 * * *"` | 驗證通過 — 6 欄位擴充 cron | F028 |
| schedule（Cron） | `"2 * * *"` | 驗證失敗 — 4 欄位，不足 | F028 |
| schedule（Cron） | `"99 99 99 99 99"` | 驗證失敗 — 所有欄位超出範圍 | F028 |
| changeSummary | `"A".repeat(500)` | 驗證通過 — 最大長度 | F029 |
| changeSummary | `"A".repeat(501)` | 驗證失敗 — 超出 500 字元上限（VALIDATION_ERROR） | F029 |
| version 號遞增 | 回滾時 max(version)+1 | 正確遞增（非依 created_at） | F033 |
| successRate | todaySuccess=3, todayFailed=1 | successRate=75.0（一位小數） | F035 |
| successRate | todaySuccess=8, todayFailed=1 | successRate=88.9（四捨五入） | F035 |
| successRate（分母為零） | todaySuccess=0, todayFailed=0 | successRate=0.0（不除以零） | F035 |
| progressPercent（分母為零） | totalCount=0 | progressPercent=0.0（不除以零） | F035 |
| F035 trend range | `"7d"` / `"14d"` / `"30d"` | 驗證通過 | F035 |
| F035 trend range | `"60d"` | 驗證失敗 — HTTP 422，VALIDATION_ERROR | F035 |
| columnCount（customer_core） | 16 | 固定值，由 migration 定義 | F036 |
| columnCount（customer_interaction） | 14 | 固定值，由 migration 定義 | F036 |
| columnCount（customer_financial） | 20 | 固定值，由 migration 定義 | F036 |
| columnCount（customer_service） | 17 | 固定值，由 migration 定義 | F036 |

### 10.5 Pipeline 執行排程測試時間點

| 場景 | fakeNow（UTC） | 說明 |
|------|-------------|------|
| 排程觸發（cron `0 2 * * *`） | `2026-01-01T02:00:00Z` | 符合觸發時間 |
| 排程不觸發（cron `0 2 * * *`） | `2026-01-01T03:00:00Z` | 不符合，不應觸發 |
| 排程觸發時 running Pipeline 跳過 | `2026-01-01T02:00:00Z` | 同觸發時間，驗證 running 被跳過 |
| 排程觸發時 draft Pipeline 跳過 | `2026-01-01T02:00:00Z` | 同觸發時間，驗證 draft 不觸發 |

### 10.6 E05 Mock 策略

| Mock 對象 | 模擬行為 | 適用場景 |
|----------|---------|---------|
| `scanAndExecute(fakeNow)` | injectable time 參數，直接呼叫排程掃描邏輯 | F030/F033 排程觸發、跳過、版本選取 |
| `waitForPipelineStatus(logId, status, 10000)` | 300ms interval polling EtlPipelineLog.status | F030/F033 非同步執行結果驗證 |
| 排程引擎 spy（removeJob / addJob） | spy 驗證方法被呼叫，及傳入的 pipelineId 與 schedule 參數 | F031 停用/啟用時排程引擎行為 |
| DB 查詢 stub（SYSTEM_INTERNAL_ERROR） | stub DB 使查詢拋出例外 | F027/F035 伺服器錯誤降級 |
| fake timer（sinon / jest fake timers） | 控制 5 秒 Polling 間隔 | F035 TS-F035-021 Polling 測試 |
| ETL 執行節點 stub（執行失敗） | stub 指定節點拋出 Error | F030 TS-F030-015 執行失敗狀態測試 |

### 10.7 目標表 Schema 測試資料（F036）

F036 測試依賴 Migration 預先建立的靜態 Schema，無需動態建立。測試前置條件：

```
migration 已執行完成（不需手動插入資料）
```

各表欄位完整清單請參閱 F036-test.md「測試資料規格」章節。

**DB 驗證查詢（確認 migration 已執行）：**

```sql
-- 確認 4 個目標表均存在
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('customer_core','customer_interaction','customer_financial','customer_service')
ORDER BY table_name;
-- 期望：4 筆結果

-- 確認追蹤欄位存在（以 customer_core 為例）
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'customer_core'
  AND column_name IN ('data_source','_etl_loaded_at','_etl_pipeline_id')
ORDER BY column_name;
-- 期望：3 筆結果
```
