---
type: test-design-feature
feature_id: F013
feature_name: 編輯資料來源
priority: P0-MVP
related_spec: /specs/features/F013-edit-datasource.md
last_updated: 2026-03-12
---

# F013: 編輯資料來源 — 測試設計

---

## Acceptance Test Design

### AC-1：成功編輯資料來源

| 項目 | 內容 |
|------|------|
| Given | Admin 已登入，目標資料來源存在 |
| When | 呼叫 `PUT /api/datasources/:id`，body: {name, type, host, port, ...} |
| Then | HTTP 200，status 重置為 unknown，updatedAt 已更新 |
| 驗證步驟 | 1. 欄位已更新<br>2. status = unknown（重置）<br>3. 回應不含 password |

### AC-2：密碼欄位處理

| 項目 | 內容 |
|------|------|
| Given | 資料來源已有密碼 |
| When | 密碼欄位為空值或 null |
| Then | 保留原有密碼不變 |
| 驗證步驟 | 1. 更新後使用 F015 測試連線 — 仍使用原密碼（連線應成功） |

### AC-3：名稱唯一性檢查

| 項目 | 內容 |
|------|------|
| Given | 另一資料來源名稱為「ProductionDB」 |
| When | 將當前資料來源名稱修改為「ProductionDB」 |
| Then | HTTP 409，DS_NAME_EXISTS |

---

## Test Scenarios

### Positive Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F013-001 | 成功修改連線參數 | AC-1 | Integration | 資料來源存在 | 1. PUT /api/datasources/:id {host: "new-host"} | HTTP 200，host 已更新，status=unknown |
| TS-F013-002 | 密碼為空保留現有密碼 | AC-2 | Integration | 資料來源存在 | 1. PUT /api/datasources/:id {password: null, ...} | HTTP 200，密碼未變更 |
| TS-F013-003 | 更新密碼 | AC-2 | Integration | 資料來源存在 | 1. PUT /api/datasources/:id {password: "newpass"} | HTTP 200，密碼已更新（DB 中為新加密值） |
| TS-F013-004 | 名稱保留原值不觸發重複 | AC-3, BR-5 | Integration | 資料來源名稱為 X | 1. PUT /api/datasources/:id {name: X} | HTTP 200，更新成功（自身排除） |

### Negative Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F013-005 | 名稱與其他資料來源重複 | AC-3 | Integration | 另一資料來源名稱已存在 | 1. PUT /api/datasources/:id {name: 重複名稱} | HTTP 409，DS_NAME_EXISTS |
| TS-F013-006 | 資料來源不存在或已刪除 | BR-7 | Integration | ID 不存在 | 1. PUT /api/datasources/nonexist | HTTP 404，DS_NOT_FOUND |
| TS-F013-007 | 非 Admin 編輯 | BR-1 | Integration | USER_ACTIVE 已登入 | 1. 以 User Token 呼叫 PUT /api/datasources/:id | HTTP 403，AUTH_FORBIDDEN |

### Boundary Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F013-008 | Port 邊界值 | 驗證 | Integration | 資料來源存在 | 1. port=0 → 422<br>2. port=1 → 200<br>3. port=65535 → 200<br>4. port=65536 → 422 | 依 port 範圍驗證 |
