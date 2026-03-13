---
type: test-design-feature
feature_id: F003
feature_name: 登出
priority: P0-MVP
related_spec: /specs/features/F003-logout.md
last_updated: 2026-03-12
---

# F003: 登出 — 測試設計

---

## Acceptance Test Design

### AC-1：成功登出

| 項目 | 內容 |
|------|------|
| Given | 使用者已完成驗證（持有有效 JWT Token） |
| When | 呼叫 `POST /api/auth/logout`，Header 帶入 Authorization: Bearer {token} |
| Then | HTTP 200、message: 「登出成功」 |
| 驗證步驟 | 1. 確認回應 HTTP 200<br>2. Token 已被加入 Blocklist 或 Refresh Token 已被撤銷 |
| 測試資料 | ADMIN_ACTIVE 或 USER_ACTIVE 登入後取得的 Token |

### AC-2：登出後阻擋存取

| 項目 | 內容 |
|------|------|
| Given | 使用者剛完成登出 |
| When | 使用者嘗試導航至受保護頁面 |
| Then | 系統將使用者重新導向至登入頁面 |
| 驗證步驟 | E2E 層級驗證 — 登出後按瀏覽器返回鍵，不顯示受保護內容 |

### AC-3：Token 失效驗證

| 項目 | 內容 |
|------|------|
| Given | 使用者已完成登出，保留舊 Token |
| When | 使用舊 Token 呼叫任意受保護 API |
| Then | HTTP 401、AUTH_TOKEN_REVOKED |
| 驗證步驟 | 1. 記錄登入時取得的 Token<br>2. 執行登出<br>3. 使用舊 Token 呼叫 GET /api/accounts<br>4. 預期 HTTP 401 |
| 測試資料 | ADMIN_ACTIVE 登入後取得的 Token |

---

## Test Scenarios

### Positive Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F003-001 | Admin 成功登出 | AC-1 | Integration | Admin 已登入 | 1. POST /api/auth/logout（Bearer Token） | HTTP 200，「登出成功」 |
| TS-F003-002 | User 成功登出 | AC-1 | Integration | User 已登入 | 1. POST /api/auth/logout（Bearer Token） | HTTP 200，「登出成功」 |
| TS-F003-003 | 登出後舊 Token 被拒絕 | AC-3 | Integration | 使用者已登出 | 1. 使用登出前的 Token 呼叫 GET /api/accounts | HTTP 401，AUTH_TOKEN_REVOKED |

### Negative Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F003-004 | 無 Token 嘗試登出 | 錯誤處理 | Integration | 無 | 1. POST /api/auth/logout（無 Authorization Header） | HTTP 401，AUTH_TOKEN_MISSING |
| TS-F003-005 | 已過期 Token 嘗試登出 | 錯誤處理 | Integration | Token 已過期 | 1. POST /api/auth/logout（過期 Token） | HTTP 401，AUTH_TOKEN_EXPIRED |

### Boundary Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F003-006 | 登出 API 失敗降級處理 | BR-001 | E2E | 使用者已登入，後端不可用 | 1. 模擬後端無回應<br>2. 點擊登出按鈕 | 用戶端 Session 仍被清除，導向登入頁面 |
