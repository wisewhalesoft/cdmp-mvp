---
type: test-design-feature
feature_id: F014
feature_name: 刪除資料來源
priority: P1
related_spec: /specs/features/F014-delete-datasource.md
last_updated: 2026-03-12
---

# F014: 刪除資料來源 — 測試設計

---

## Acceptance Test Design

### AC-1：確認刪除成功

| 項目 | 內容 |
|------|------|
| Given | Admin 已登入，目標資料來源存在 |
| When | 呼叫 `DELETE /api/datasources/:id` |
| Then | HTTP 200，message: 「資料來源已成功刪除」 |
| 驗證步驟 | 1. DB 中 deleted_at 已設定（非 NULL）<br>2. GET /api/datasources 不再包含該記錄<br>3. GET /api/datasources/dashboard 不再包含該記錄 |

### AC-4：軟刪除機制

| 項目 | 內容 |
|------|------|
| Given | 資料來源已刪除 |
| When | 直接查詢 DB |
| Then | 記錄仍存在，deleted_at 已設定 |

---

## Test Scenarios

### Positive Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F014-001 | 成功軟刪除 | AC-1, AC-4 | Integration | DS_MYSQL_FOR_DELETE 存在 | 1. DELETE /api/datasources/:id | HTTP 200，deleted_at 已設定 |
| TS-F014-002 | 刪除後從清單消失 | AC-1 | Integration | 資料來源已刪除 | 1. GET /api/datasources | 不包含已刪除記錄 |

### Negative Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F014-003 | 刪除不存在的資料來源 | BR-4 | Integration | ID 不存在 | 1. DELETE /api/datasources/nonexist | HTTP 404，DS_NOT_FOUND |
| TS-F014-004 | 重複刪除已軟刪除記錄 | BR-4 | Integration | DS_DELETED 已刪除 | 1. DELETE /api/datasources/{deleted-id} | HTTP 404，DS_NOT_FOUND |

### Boundary Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F014-005 | 刪除後同名資料來源可重新建立 | BR-2, BR-3 | Integration | 已刪除名稱為 X 的資料來源 | 1. POST /api/datasources {name: X} | HTTP 201，建立成功（軟刪除名稱不佔用唯一性） |
