---
type: test-design-feature
feature_id: F010
feature_name: Admin 重設使用者密碼
priority: P0-MVP
related_spec: /specs/features/F010-admin-reset-password.md
last_updated: 2026-03-12
---

# F010: Admin 重設使用者密碼 — 測試設計

---

## Acceptance Test Design

### AC-1：成功重設密碼

| 項目 | 內容 |
|------|------|
| Given | Admin 已登入，目標帳號存在 |
| When | 呼叫 `POST /api/accounts/:id/reset-password`，body: {newPassword: "NewPass99"} |
| Then | HTTP 200、message: 「密碼已重設，使用者需以新密碼重新登入」 |
| 驗證步驟 | 1. 該使用者可用新密碼登入<br>2. 該使用者所有舊 Session Token 已失效<br>3. 日誌中無新密碼明文 |

### AC-2：密碼規則驗證

| 項目 | 內容 |
|------|------|
| Given | Admin 已登入 |
| When | 新密碼少於 8 字元 |
| Then | HTTP 422，VALIDATION_PASSWORD_LENGTH |

### AC-3：不可重設自己的密碼

| 項目 | 內容 |
|------|------|
| Given | Admin 查看自己的帳號 |
| When | 嘗試重設自己的密碼 |
| Then | HTTP 422，ACCOUNT_SELF_RESET |

---

## Test Scenarios

### Positive Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F010-001 | 成功重設密碼 | AC-1 | Integration | 目標帳號存在 | 1. POST /api/accounts/:id/reset-password {newPassword}<br>2. 以新密碼登入 | HTTP 200，登入成功 |
| TS-F010-002 | 重設後舊 Token 失效 | AC-1, BR-5 | Integration | 目標使用者已登入 | 1. 重設密碼<br>2. 使用目標使用者舊 Token 呼叫 API | HTTP 401，Token 已失效 |

### Negative Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F010-003 | 不可重設自己密碼 | AC-3 | Integration | Admin 自己的 ID | 1. POST /api/accounts/{self-id}/reset-password | HTTP 422，ACCOUNT_SELF_RESET |
| TS-F010-004 | 帳號不存在 | 錯誤處理 | Integration | 無此 ID | 1. POST /api/accounts/nonexist/reset-password | HTTP 404，ACCOUNT_NOT_FOUND |
| TS-F010-005 | 密碼不足 8 字元 | AC-2 | Integration | Admin 已登入 | 1. POST /api/accounts/:id/reset-password {newPassword: "short"} | HTTP 422，VALIDATION_PASSWORD_LENGTH |

### Boundary Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F010-006 | 密碼恰好 8 字元 | BR-3 | Integration | 目標帳號存在 | 1. POST /api/accounts/:id/reset-password {newPassword: "12345678"} | HTTP 200，重設成功 |
