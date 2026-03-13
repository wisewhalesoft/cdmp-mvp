---
type: test-design-feature
feature_id: F004
feature_name: 建立帳號
priority: P0-MVP
related_spec: /specs/features/F004-create-account.md
last_updated: 2026-03-12
---

# F004: 建立帳號 — 測試設計

---

## Acceptance Test Design

### AC-1：成功建立帳號

| 項目 | 內容 |
|------|------|
| Given | Admin 已登入（ADMIN_ACTIVE） |
| When | 呼叫 `POST /api/accounts`，body: {name, email, password, role} |
| Then | HTTP 201、回應含新建帳號資訊（id, name, email, role=指定值, status=active） |
| 驗證步驟 | 1. 確認回應 HTTP 201<br>2. 回應不含 password_hash<br>3. email 已轉為小寫<br>4. status = active<br>5. 新帳號出現於 GET /api/accounts 清單中 |
| 測試資料 | ADMIN_ACTIVE Token + 新帳號資料 |

### AC-2：防止重複 Email（大小寫不敏感）

| 項目 | 內容 |
|------|------|
| Given | admin@cdmp.test 已存在 |
| When | 以 ADMIN@CDMP.TEST 建立帳號 |
| Then | HTTP 409、ACCOUNT_EMAIL_EXISTS |
| 驗證步驟 | 1. 確認 HTTP 409<br>2. 確認帳號未被建立 |
| 測試資料 | ADMIN_ACTIVE Token + 重複 Email |

### AC-3：欄位驗證

| 項目 | 內容 |
|------|------|
| Given | Admin 已登入 |
| When | 提交不合規資料（缺少必填欄位、格式錯誤） |
| Then | HTTP 422、VALIDATION_ERROR，details 列出各欄位錯誤 |
| 驗證步驟 | 1. 確認 HTTP 422<br>2. details 陣列包含對應欄位的錯誤訊息 |

---

## Test Scenarios

### Positive Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F004-001 | 成功建立 Admin 帳號 | AC-1 | Integration | Admin 已登入 | 1. POST /api/accounts {name, email, password, role: admin} | HTTP 201，帳號建立成功 |
| TS-F004-002 | 成功建立 User 帳號 | AC-1 | Integration | Admin 已登入 | 1. POST /api/accounts {name, email, password, role: user} | HTTP 201，role=user |
| TS-F004-003 | Email 自動轉小寫 | AC-2, BR-2 | Integration | Admin 已登入 | 1. POST /api/accounts {email: "Test@CDMP.Test"} | HTTP 201，回應中 email = "test@cdmp.test" |

### Negative Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F004-004 | Email 重複（大小寫不敏感） | AC-2 | Integration | admin@cdmp.test 已存在 | 1. POST /api/accounts {email: "ADMIN@CDMP.TEST"} | HTTP 409，ACCOUNT_EMAIL_EXISTS |
| TS-F004-005 | 非 Admin 嘗試建立帳號 | BR-4 | Integration | USER_ACTIVE 已登入 | 1. 以 User Token 呼叫 POST /api/accounts | HTTP 403，AUTH_FORBIDDEN |
| TS-F004-006 | 無效角色值 | AC-3 | Integration | Admin 已登入 | 1. POST /api/accounts {role: "superadmin"} | HTTP 422，VALIDATION_INVALID_ROLE |

### Boundary Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F004-007 | 密碼恰好 8 字元 | BR-7 | Integration | Admin 已登入 | 1. POST /api/accounts {password: "12345678"} | HTTP 201，建立成功 |
| TS-F004-008 | 密碼僅 7 字元 | BR-7 | Integration | Admin 已登入 | 1. POST /api/accounts {password: "1234567"} | HTTP 422，VALIDATION_PASSWORD_LENGTH |
