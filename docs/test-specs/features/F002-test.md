---
type: test-design-feature
feature_id: F002
feature_name: User 登入
priority: P0-MVP
related_spec: /specs/features/F002-user-login.md
last_updated: 2026-03-12
---

# F002: User 登入 — 測試設計

---

## Acceptance Test Design

### AC-1：成功登入

| 項目 | 內容 |
|------|------|
| Given | User 帳號已建立且狀態為 active（USER_ACTIVE 種子帳號） |
| When | 以正確 Email 與密碼呼叫 `POST /api/auth/login` |
| Then | HTTP 200、回應含 `token`（JWT 格式）與 `user` 物件（role: user） |
| 驗證步驟 | 1. 解碼 JWT — 驗證 payload 包含 role=user<br>2. 前端應導向 User 說明頁面（非管理後台） |
| 測試資料 | USER_ACTIVE 種子帳號 |

### AC-2：無效憑證

| 項目 | 內容 |
|------|------|
| Given | 登入端點可用 |
| When | 以錯誤密碼呼叫 `POST /api/auth/login` |
| Then | HTTP 401、AUTH_INVALID_CREDENTIALS（與 F001 行為一致） |
| 測試資料 | USER_ACTIVE（錯誤密碼） |

### AC-3：「記住我」功能

與 F001 AC-3 相同邏輯，驗證 User 角色 Token 有效期。

### AC-4：帳號已停用

| 項目 | 內容 |
|------|------|
| Given | User 帳號狀態為 disabled（USER_DISABLED 種子帳號） |
| When | 以正確憑證呼叫 `POST /api/auth/login` |
| Then | HTTP 403、AUTH_ACCOUNT_DISABLED |
| 測試資料 | USER_DISABLED 種子帳號 |

---

## Test Scenarios

### Positive Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F002-001 | User 正確憑證登入 | AC-1 | Integration | USER_ACTIVE 帳號存在 | 1. POST /api/auth/login，body: {email, password} | HTTP 200，JWT Token 含 role=user |
| TS-F002-002 | 勾選「記住我」登入 | AC-3 | Integration | USER_ACTIVE 帳號存在 | 1. POST /api/auth/login，body: {email, password, rememberMe: true} | HTTP 200，JWT exp = iat + 30d |

### Negative Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F002-003 | User 存取 Admin 專屬 API | AC-1, BR-004 | Integration | USER_ACTIVE 已登入 | 1. 以 User Token 呼叫 GET /api/accounts | HTTP 403，AUTH_FORBIDDEN |
| TS-F002-004 | User 存取多個 Admin 端點 | NFR-001.2 | Integration | USER_ACTIVE 已登入 | 1. 逐一呼叫所有 Admin 專屬端點 | 每個端點均回傳 HTTP 403 |
| TS-F002-005 | User 帳號已停用 | AC-4 | Integration | USER_DISABLED 帳號存在 | 1. POST /api/auth/login，body: {email, password（正確）} | HTTP 403，AUTH_ACCOUNT_DISABLED |
| TS-F002-006 | 錯誤密碼 | AC-2 | Integration | USER_ACTIVE 帳號存在 | 1. POST /api/auth/login，body: {email, password: wrong} | HTTP 401，AUTH_INVALID_CREDENTIALS |

### Boundary Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F002-007 | 未授權存取日誌驗證 | NFR-001.2 | Integration | USER_ACTIVE 已登入 | 1. 以 User Token 呼叫 Admin 端點<br>2. 檢查系統日誌 | 日誌包含 userId、嘗試存取的端點、時間戳記 |
