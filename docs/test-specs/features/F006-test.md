---
type: test-design-feature
feature_id: F006
feature_name: 編輯帳號
priority: P0-MVP
related_spec: /specs/features/F006-edit-account.md
last_updated: 2026-03-12
---

# F006: 編輯帳號 — 測試設計

---

## Acceptance Test Design

### AC-1：成功編輯帳號

| 項目 | 內容 |
|------|------|
| Given | Admin 已登入，目標帳號存在 |
| When | 呼叫 `PUT /api/accounts/:id`，body: {name: "New Name", email: "new@cdmp.test"} |
| Then | HTTP 200，回應含更新後的帳號資訊，updated_at 已更新 |
| 驗證步驟 | 1. name 已更新<br>2. email 已更新（轉小寫）<br>3. 不含 password_hash<br>4. role 與 status 不變 |

### AC-2：Email 唯一性驗證

| 項目 | 內容 |
|------|------|
| Given | user@cdmp.test 屬於另一帳號 |
| When | 將目標帳號 Email 修改為 USER@CDMP.TEST |
| Then | HTTP 409，ACCOUNT_EMAIL_IN_USE |

### AC-3：欄位驗證

| 項目 | 內容 |
|------|------|
| Given | Admin 已登入 |
| When | 提交空 name 或無效 Email 格式 |
| Then | HTTP 422，VALIDATION_ERROR |

---

## Test Scenarios

### Positive Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F006-001 | 成功修改姓名 | AC-1 | Integration | 目標帳號存在 | 1. PUT /api/accounts/:id {name: "Updated"} | HTTP 200，name 已更新 |
| TS-F006-002 | 成功修改 Email | AC-1 | Integration | 目標帳號存在 | 1. PUT /api/accounts/:id {email: "new@test.com"} | HTTP 200，email 已轉小寫 |
| TS-F006-003 | Email 保留原值不觸發重複錯誤 | AC-2, BR-3 | Integration | 目標帳號 email=user@cdmp.test | 1. PUT /api/accounts/:id {email: "user@cdmp.test"} | HTTP 200，更新成功（自身排除） |

### Negative Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F006-004 | Email 與其他帳號重複 | AC-2 | Integration | 另一帳號 email=admin@cdmp.test | 1. PUT /api/accounts/:id {email: "admin@cdmp.test"} | HTTP 409，ACCOUNT_EMAIL_IN_USE |
| TS-F006-005 | 帳號不存在 | 錯誤處理 | Integration | 無此 ID | 1. PUT /api/accounts/nonexist-id {name, email} | HTTP 404，ACCOUNT_NOT_FOUND |
| TS-F006-006 | 非 Admin 編輯帳號 | BR-6 | Integration | USER_ACTIVE 已登入 | 1. 以 User Token 呼叫 PUT /api/accounts/:id | HTTP 403，AUTH_FORBIDDEN |
| TS-F006-007 | 空姓名 | AC-3 | Integration | Admin 已登入 | 1. PUT /api/accounts/:id {name: ""} | HTTP 422，VALIDATION_ERROR |

### Boundary Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F006-008 | 姓名 100 字元（最大長度） | BR-8 | Integration | Admin 已登入 | 1. PUT /api/accounts/:id {name: "A"×100} | HTTP 200，更新成功 |
