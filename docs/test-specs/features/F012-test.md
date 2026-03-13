---
type: test-design-feature
feature_id: F012
feature_name: 查看資料來源清單
priority: P0-MVP
related_spec: /specs/features/F012-list-datasources.md
last_updated: 2026-03-12
---

# F012: 查看資料來源清單 — 測試設計

---

## Acceptance Test Design

### AC-1：載入資料來源清單

| 項目 | 內容 |
|------|------|
| Given | Admin 已登入，系統中有多個資料來源 |
| When | 呼叫 `GET /api/datasources` |
| Then | HTTP 200，回應含 data 陣列 + pagination 物件 |
| 驗證步驟 | 1. 每筆包含 id, name, type, host, port, databaseName, username, status, lastTestedAt<br>2. 不含 password 欄位<br>3. 不含已軟刪除的記錄<br>4. 預設排序 created_at DESC |

### AC-2：搜尋與篩選

| 項目 | 內容 |
|------|------|
| Given | 系統中有多個資料來源 |
| When | 呼叫 `GET /api/datasources?search=mysql&type=mysql&status=connected` |
| Then | 僅回傳符合所有條件的資料來源 |

### AC-3：空狀態

| 項目 | 內容 |
|------|------|
| Given | 系統中無任何資料來源（或全部已軟刪除） |
| When | 呼叫 `GET /api/datasources` |
| Then | HTTP 200，data: []，total: 0 |

---

## Test Scenarios

### Positive Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F012-001 | 載入資料來源清單 | AC-1 | Integration | 至少 3 個資料來源 | 1. GET /api/datasources | HTTP 200，data 含資料來源列表 |
| TS-F012-002 | 依名稱搜尋 | AC-2 | Integration | 含 "MySQL" 名稱的資料來源 | 1. GET /api/datasources?search=mysql | 結果包含名稱含 "mysql" 的記錄 |
| TS-F012-003 | 依類型篩選 | AC-2 | Integration | 含 mysql 和 postgresql 類型 | 1. GET /api/datasources?type=mysql | 僅回傳 type=mysql 的記錄 |
| TS-F012-004 | 依狀態篩選 | AC-2 | Integration | 含不同狀態 | 1. GET /api/datasources?status=connected | 僅回傳 status=connected 的記錄 |

### Negative Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F012-005 | 已軟刪除記錄不顯示 | BR-2 | Integration | DS_DELETED 存在 | 1. GET /api/datasources | 結果不含 DS_DELETED |
| TS-F012-006 | 非 Admin 存取清單 | BR-1 | Integration | USER_ACTIVE 已登入 | 1. 以 User Token 呼叫 GET /api/datasources | HTTP 403，AUTH_FORBIDDEN |

### Boundary Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F012-007 | 密碼欄位不存在於回應 | BR-3, NFR-001.4 | Integration | 資料來源存在 | 1. GET /api/datasources<br>2. 檢查每筆記錄 | 無 password / encrypted_password 欄位 |
