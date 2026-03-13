---
type: test-design-data
last_updated: 2026-03-12
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
| limit | 未提供 | 預設 20 |
| limit | `0` | 錯誤 — 最小值為 1 |
| limit | `100` | 通過 — 最大值 |
| limit | `101` | 錯誤 — 超出最大值 |

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

### 5.2 排程測試

| 測試場景 | 資料需求 |
|---------|---------|
| 自動健康檢查每 30 分鐘執行 | 至少 2 個未刪除的資料來源 |
| 健康檢查排除已刪除資料來源 | 1 個未刪除 + 1 個已刪除的資料來源 |

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
