---
type: test-design-feature
feature_id: F011
feature_name: 新增資料來源
priority: P0-MVP
related_spec: /specs/features/F011-add-datasource.md
last_updated: 2026-03-12
---

# F011: 新增資料來源 — 測試設計

---

## Acceptance Test Design

### AC-1：成功新增資料來源

| 項目 | 內容 |
|------|------|
| Given | Admin 已登入 |
| When | 呼叫 `POST /api/datasources`，body: {name, type, host, port, databaseName, username, password} |
| Then | HTTP 201，回應含新建資料來源資訊（status=unknown, lastTestedAt=null） |
| 驗證步驟 | 1. 回應不含 password 欄位<br>2. status = unknown<br>3. 密碼在 DB 中為 AES-256 加密儲存（非明文）<br>4. 新資料來源出現於 GET /api/datasources 清單 |

### AC-2：名稱重複驗證（複合唯一性）

| 項目 | 內容 |
|------|------|
| Given | 名稱「MySQL Production」且資料庫名稱「prod_db」的資料來源已存在 |
| When | 嘗試以相同名稱「MySQL Production」與相同資料庫名稱「prod_db」建立 |
| Then | HTTP 409，DS_NAME_EXISTS |

### AC-2b：不同資料庫允許相同名稱

| 項目 | 內容 |
|------|------|
| Given | 名稱「MySQL Production」且資料庫名稱「prod_db」的資料來源已存在 |
| When | 以相同名稱「MySQL Production」但資料庫名稱「staging_db」建立 |
| Then | HTTP 201，建立成功 |

### AC-3：欄位驗證

| 項目 | 內容 |
|------|------|
| Given | Admin 已登入 |
| When | 提交不合規資料 |
| Then | HTTP 422，VALIDATION_ERROR，details 列出錯誤 |

---

## Test Scenarios

### Positive Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F011-001 | 新增 MySQL 資料來源 | AC-1 | Integration | Admin 已登入 | 1. POST /api/datasources {type: mysql, port: 3306, ...} | HTTP 201，status=unknown |
| TS-F011-002 | 新增 PostgreSQL 資料來源 | AC-1 | Integration | Admin 已登入 | 1. POST /api/datasources {type: postgresql, port: 5432, ...} | HTTP 201 |
| TS-F011-003 | 新增 SQL Server 資料來源 | AC-1 | Integration | Admin 已登入 | 1. POST /api/datasources {type: sqlserver, port: 1433, ...} | HTTP 201 |
| TS-F011-004 | 密碼加密儲存驗證 | BR-3, NFR-001.4 | Integration | 資料來源已建立 | 1. 直接查詢 DB encrypted_password 欄位 | 欄位值非明文（AES-256 加密格式） |

### Negative Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F011-005 | 名稱＋資料庫名稱重複 | AC-2 | Integration | 名稱「MySQL Production」且 databaseName「prod_db」的資料來源存在 | 1. POST /api/datasources {name: "MySQL Production", databaseName: "prod_db"} | HTTP 409，DS_NAME_EXISTS |
| TS-F011-005b | 相同名稱不同資料庫允許建立 | AC-2b | Integration | 名稱「MySQL Production」且 databaseName「prod_db」的資料來源存在 | 1. POST /api/datasources {name: "MySQL Production", databaseName: "staging_db"} | HTTP 201，建立成功 |
| TS-F011-006 | 非 Admin 新增 | BR-1 | Integration | USER_ACTIVE 已登入 | 1. 以 User Token 呼叫 POST /api/datasources | HTTP 403，AUTH_FORBIDDEN |
| TS-F011-007 | 無效類型 | AC-3 | Integration | Admin 已登入 | 1. POST /api/datasources {type: "oracle"} | HTTP 422，VALIDATION_INVALID_TYPE |

### Boundary Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F011-008 | Port 邊界值 | AC-3 | Integration | Admin 已登入 | 1. port=0 → 422<br>2. port=1 → 201<br>3. port=65535 → 201<br>4. port=65536 → 422 | 依 port 範圍 1-65535 驗證 |
