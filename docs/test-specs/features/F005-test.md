---
type: test-design-feature
feature_id: F005
feature_name: 查看帳號清單
priority: P0-MVP
related_spec: /specs/features/F005-view-account-list.md
last_updated: 2026-03-12
---

# F005: 查看帳號清單 — 測試設計

---

## Acceptance Test Design

### AC-1：顯示分頁帳號清單

| 項目 | 內容 |
|------|------|
| Given | Admin 已登入，系統中有多個帳號 |
| When | 呼叫 `GET /api/accounts` |
| Then | HTTP 200，回應含 data 陣列（每筆包含 id, name, email, role, status, created_at）+ total + page + limit |
| 驗證步驟 | 1. data 陣列各物件包含所有必要欄位<br>2. 不含 password_hash<br>3. 預設 limit = 20<br>4. 預設排序為 created_at DESC |

### AC-2：搜尋與篩選

| 項目 | 內容 |
|------|------|
| Given | 系統中有多個帳號 |
| When | 呼叫 `GET /api/accounts?search=admin&role=admin&status=active` |
| Then | 僅回傳符合所有條件的帳號 |
| 驗證步驟 | 1. 搜尋為大小寫不敏感<br>2. 多條件可組合<br>3. 結果正確篩選 |

### AC-3：無結果空狀態

| 項目 | 內容 |
|------|------|
| Given | 無帳號符合條件 |
| When | 呼叫 `GET /api/accounts?search=nonexistent` |
| Then | HTTP 200，data: []，total: 0 |

---

## Test Scenarios

### Positive Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F005-001 | 載入預設帳號清單 | AC-1 | Integration | 至少 5 個帳號存在 | 1. GET /api/accounts | HTTP 200，data 含帳號列表，limit=20 |
| TS-F005-002 | 依關鍵字搜尋（大小寫不敏感） | AC-2 | Integration | 帳號含 "Admin Active" | 1. GET /api/accounts?search=admin | 結果包含 name 或 email 含 "admin" 的帳號 |
| TS-F005-003 | 依角色篩選 | AC-2 | Integration | 系統有 admin 和 user 帳號 | 1. GET /api/accounts?role=admin | 僅回傳 role=admin 的帳號 |
| TS-F005-004 | 組合搜尋與篩選 | AC-2 | Integration | 系統有多種帳號 | 1. GET /api/accounts?search=test&status=active | 僅回傳 name/email 含 "test" 且 status=active 的帳號 |

### Negative Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F005-005 | 非 Admin 存取帳號清單 | BR-6 | Integration | USER_ACTIVE 已登入 | 1. 以 User Token 呼叫 GET /api/accounts | HTTP 403，AUTH_FORBIDDEN |
| TS-F005-006 | 搜尋無結果 | AC-3 | Integration | 無符合帳號 | 1. GET /api/accounts?search=zzzznonexist | HTTP 200，data: []，total: 0 |

### Boundary Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F005-007 | 分頁超出總頁數 | 分頁邏輯 | Integration | 5 個帳號 | 1. GET /api/accounts?page=999&limit=20 | HTTP 200，data: []（空頁） |
