---
type: test-design-feature
feature_id: F001
feature_name: Admin 登入
priority: P0-MVP
related_spec: /specs/features/F001-admin-login.md
last_updated: 2026-03-12
---

# F001: Admin 登入 — 測試設計

---

## Acceptance Test Design

### AC-1：成功登入

| 項目 | 內容 |
|------|------|
| Given | Admin 帳號已建立且狀態為 active（ADMIN_ACTIVE 種子帳號） |
| When | 以正確 Email 與密碼呼叫 `POST /api/auth/login` |
| Then | HTTP 200、回應含 `token`（JWT 格式）與 `user` 物件（role: admin） |
| 驗證步驟 | 1. 解碼 JWT — 驗證 payload 包含 userId、role=admin、iat、exp<br>2. 驗證 exp - iat = 8h（未勾選 rememberMe）<br>3. 使用回傳 Token 呼叫受保護端點 — 預期成功 |
| 測試資料 | ADMIN_ACTIVE 種子帳號 |

### AC-2：無效憑證

| 項目 | 內容 |
|------|------|
| Given | 登入端點可用 |
| When | 以錯誤密碼或不存在的 Email 呼叫 `POST /api/auth/login` |
| Then | HTTP 401、error code: AUTH_INVALID_CREDENTIALS、message: 「Email 或密碼錯誤」 |
| 驗證步驟 | 1. 錯誤密碼與不存在 Email 的回應完全一致（不揭露帳號是否存在）<br>2. 回應時間差異不超過 100ms（防止 timing attack） |
| 測試資料 | ADMIN_ACTIVE（錯誤密碼）、nonexistent@test.com |

### AC-3：「記住我」功能

| 項目 | 內容 |
|------|------|
| Given | ADMIN_ACTIVE 種子帳號 |
| When | 以 `rememberMe: true` 呼叫 `POST /api/auth/login` |
| Then | HTTP 200、JWT exp - iat = 30 天 |
| 驗證步驟 | 1. 解碼 JWT — 驗證 exp - iat = 30d<br>2. 對比未勾選時 exp - iat = 8h |
| 測試資料 | ADMIN_ACTIVE 種子帳號 |

### AC-4：帳號已停用

| 項目 | 內容 |
|------|------|
| Given | Admin 帳號狀態為 disabled（ADMIN_DISABLED 種子帳號） |
| When | 以正確憑證呼叫 `POST /api/auth/login` |
| Then | HTTP 403、error code: AUTH_ACCOUNT_DISABLED、message: 「您的帳號已被停用，請聯絡管理員。」 |
| 驗證步驟 | 1. 確認不發行 JWT Token<br>2. 確認錯誤碼與訊息符合規格 |
| 測試資料 | ADMIN_DISABLED 種子帳號 |

---

## Test Scenarios

### Positive Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F001-001 | Admin 正確憑證登入 | AC-1 | Integration | ADMIN_ACTIVE 帳號存在 | 1. POST /api/auth/login，body: {email, password} | HTTP 200，JWT Token 含 role=admin |
| TS-F001-002 | 勾選「記住我」登入 | AC-3 | Integration | ADMIN_ACTIVE 帳號存在 | 1. POST /api/auth/login，body: {email, password, rememberMe: true} | HTTP 200，JWT exp = iat + 30d |
| TS-F001-003 | 未勾選「記住我」登入 | AC-3 | Integration | ADMIN_ACTIVE 帳號存在 | 1. POST /api/auth/login，body: {email, password, rememberMe: false} | HTTP 200，JWT exp = iat + 8h |

### Negative Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F001-004 | 錯誤密碼 | AC-2 | Integration | ADMIN_ACTIVE 帳號存在 | 1. POST /api/auth/login，body: {email: admin@cdmp.test, password: wrong} | HTTP 401，AUTH_INVALID_CREDENTIALS |
| TS-F001-005 | 不存在的 Email | AC-2 | Integration | 無 | 1. POST /api/auth/login，body: {email: nonexist@test.com, password: any} | HTTP 401，AUTH_INVALID_CREDENTIALS（與 TS-F001-004 回應一致） |
| TS-F001-006 | 帳號已停用 | AC-4 | Integration | ADMIN_DISABLED 帳號存在 | 1. POST /api/auth/login，body: {email, password（正確）} | HTTP 403，AUTH_ACCOUNT_DISABLED |
| TS-F001-007 | SQL Injection 嘗試 | BR-006, 安全性 | Integration | 無 | 1. POST /api/auth/login，body: {email: "' OR '1'='1", password: "test"} | HTTP 401，AUTH_INVALID_CREDENTIALS（輸入已消毒） |

### Boundary Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F001-008 | Rate Limiting 超過 5 次/分鐘 | BR-004, OQ-5 | Integration | 無 | 1. 連續 6 次錯誤密碼登入（同一 IP） | 第 6 次回傳 HTTP 429，RATE_LIMITED |
