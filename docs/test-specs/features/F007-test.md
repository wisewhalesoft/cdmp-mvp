---
type: test-design-feature
feature_id: F007
feature_name: 停用／啟用帳號
priority: P1
related_spec: /specs/features/F007-disable-enable-account.md
last_updated: 2026-03-12
---

# F007: 停用／啟用帳號 — 測試設計

---

## Acceptance Test Design

### AC-1：停用帳號

| 項目 | 內容 |
|------|------|
| Given | 目標帳號狀態為 active，該使用者目前已登入 |
| When | 呼叫 `PATCH /api/accounts/:id/status`，body: {status: "disabled"} |
| Then | HTTP 200，status 變更為 disabled |
| 驗證步驟 | 1. 回應中 status=disabled<br>2. 該使用者的舊 Token 已失效（呼叫 API 回傳 401）<br>3. 該使用者無法重新登入（回傳 403 AUTH_ACCOUNT_DISABLED） |

### AC-2：啟用帳號

| 項目 | 內容 |
|------|------|
| Given | 目標帳號狀態為 disabled |
| When | 呼叫 `PATCH /api/accounts/:id/status`，body: {status: "active"} |
| Then | HTTP 200，status 變更為 active，使用者可重新登入 |

### AC-3：防止自我停用

| 項目 | 內容 |
|------|------|
| Given | Admin 查看自己的帳號 |
| When | 嘗試停用自己 |
| Then | HTTP 422，ACCOUNT_SELF_DISABLE |

---

## Test Scenarios

### Positive Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F007-001 | 成功停用帳號 | AC-1 | Integration | 目標帳號 active | 1. PATCH /api/accounts/:id/status {status: disabled} | HTTP 200，status=disabled |
| TS-F007-002 | 停用後 Token 失效 | AC-1, BR-1 | Integration | 目標帳號已登入 | 1. 停用帳號<br>2. 使用該帳號的 Token 呼叫 API | HTTP 401，Token 已失效 |
| TS-F007-003 | 停用後無法登入 | AC-1, BR-2 | Integration | 目標帳號已停用 | 1. POST /api/auth/login {正確憑證} | HTTP 403，AUTH_ACCOUNT_DISABLED |
| TS-F007-004 | 成功啟用帳號 | AC-2 | Integration | 目標帳號 disabled | 1. PATCH /api/accounts/:id/status {status: active} | HTTP 200，status=active |

### Negative Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F007-005 | 防止自我停用 | AC-3 | Integration | Admin 自己的 ID | 1. PATCH /api/accounts/{self-id}/status {status: disabled} | HTTP 422，ACCOUNT_SELF_DISABLE |
| TS-F007-006 | 帳號不存在 | 錯誤處理 | Integration | 無此 ID | 1. PATCH /api/accounts/nonexist/status {status: disabled} | HTTP 404，ACCOUNT_NOT_FOUND |

### Boundary Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F007-007 | 冪等操作 — 停用已停用帳號 | BR-7 | Integration | 目標帳號已 disabled | 1. PATCH /api/accounts/:id/status {status: disabled} | HTTP 200，status 不變（冪等） |
