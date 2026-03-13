---
type: test-design-feature
feature_id: F009
feature_name: 自助式密碼重設
priority: P0-MVP
related_spec: /specs/features/F009-self-service-password-reset.md
last_updated: 2026-03-12
---

# F009: 自助式密碼重設 — 測試設計

---

## Acceptance Test Design

### AC-1：發送重設連結（已註冊 Email）

| 項目 | 內容 |
|------|------|
| Given | ADMIN_ACTIVE 帳號存在 |
| When | 呼叫 `POST /api/auth/forgot-password`，body: {email: admin@cdmp.test} |
| Then | HTTP 200、message: 「若此 Email 存在，重設連結已寄出」 |
| 驗證步驟 | 1. 確認回應 HTTP 200<br>2. 驗證 Mock Email Service 收到一封 Email<br>3. 驗證 Email 收件人為 admin@cdmp.test<br>4. 驗證 Email 內容含重設連結（含 Token）<br>5. 驗證 PasswordResetToken 記錄已建立（DB 查詢） |
| 測試資料 | ADMIN_ACTIVE 種子帳號、Mock Email Service |

### AC-2：不揭露帳號是否存在

| 項目 | 內容 |
|------|------|
| Given | nonexist@test.com 不存在於系統中 |
| When | 呼叫 `POST /api/auth/forgot-password`，body: {email: nonexist@test.com} |
| Then | HTTP 200、message: 「若此 Email 存在，重設連結已寄出」（與 AC-1 回應完全一致） |
| 驗證步驟 | 1. 確認回應 HTTP 200（非 404）<br>2. 驗證 Mock Email Service 未收到 Email<br>3. 比較 AC-1 與 AC-2 的回應時間差異 < 100ms（防止 timing attack） |
| 測試資料 | 不存在的 Email |

### AC-3：成功重設密碼

| 項目 | 內容 |
|------|------|
| Given | RESET_TOKEN_VALID 存在於 DB |
| When | 呼叫 `POST /api/auth/reset-password`，body: {token, newPassword: "NewPass99"} |
| Then | HTTP 200、message: 「密碼已成功重設，請重新登入」 |
| 驗證步驟 | 1. 確認回應 HTTP 200<br>2. 驗證 Token 記錄 used_at 已設定<br>3. 驗證可用新密碼登入<br>4. 驗證舊密碼無法登入<br>5. 驗證該使用者所有舊 Session Token 已失效 |
| 測試資料 | RESET_TOKEN_VALID、USER_ACTIVE 帳號 |

### AC-4：重設連結過期

| 項目 | 內容 |
|------|------|
| Given | RESET_TOKEN_EXPIRED 存在於 DB（expires_at 已過） |
| When | 呼叫 `POST /api/auth/reset-password`，body: {token, newPassword: "NewPass99"} |
| Then | HTTP 422、AUTH_RESET_TOKEN_EXPIRED |
| 測試資料 | RESET_TOKEN_EXPIRED |

---

## Test Scenarios

### Positive Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F009-001 | 已註冊 Email 發送重設連結 | AC-1 | Integration | ADMIN_ACTIVE 存在 | 1. POST /api/auth/forgot-password {email} | HTTP 200，Email 已發送 |
| TS-F009-002 | 有效 Token 成功重設密碼 | AC-3 | Integration | RESET_TOKEN_VALID 存在 | 1. POST /api/auth/reset-password {token, newPassword} | HTTP 200，密碼已更新 |
| TS-F009-003 | 重設後可用新密碼登入 | AC-3 | Integration | 密碼已重設 | 1. POST /api/auth/login {email, newPassword} | HTTP 200，登入成功 |

### Negative Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F009-004 | 未註冊 Email 不揭露帳號存在 | AC-2 | Integration | Email 不存在 | 1. POST /api/auth/forgot-password {email: nonexist} | HTTP 200（與已註冊回應一致），無 Email 發送 |
| TS-F009-005 | 過期 Token 重設失敗 | AC-4 | Integration | RESET_TOKEN_EXPIRED | 1. POST /api/auth/reset-password {token, newPassword} | HTTP 422，AUTH_RESET_TOKEN_EXPIRED |
| TS-F009-006 | 已使用 Token 重設失敗 | BR-2, BR-3 | Integration | RESET_TOKEN_USED | 1. POST /api/auth/reset-password {token, newPassword} | HTTP 422，AUTH_RESET_TOKEN_USED |
| TS-F009-007 | 無效 Token 格式 | 錯誤處理 | Integration | 無 | 1. POST /api/auth/reset-password {token: "invalid", newPassword} | HTTP 422，AUTH_RESET_TOKEN_INVALID |
| TS-F009-008 | 重設後舊 Session Token 失效 | BR-7 | Integration | 使用者已登入 + 密碼已重設 | 1. 重設密碼<br>2. 使用舊 Token 呼叫 API | HTTP 401，Token 已失效 |

### Boundary Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F009-009 | 新密碼恰好 8 字元 | BR-5 | Integration | RESET_TOKEN_VALID | 1. POST /api/auth/reset-password {token, newPassword: "12345678"} | HTTP 200，重設成功 |
| TS-F009-010 | 新密碼僅 7 字元 | BR-5 | Integration | RESET_TOKEN_VALID | 1. POST /api/auth/reset-password {token, newPassword: "1234567"} | HTTP 422，VALIDATION_PASSWORD_LENGTH |
