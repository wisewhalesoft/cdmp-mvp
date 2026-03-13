---
type: test-design-feature
feature_id: F015
feature_name: 測試連線
priority: P0-MVP
related_spec: /specs/features/F015-test-datasource-connection.md
last_updated: 2026-03-12
---

# F015: 測試連線 — 測試設計

---

## Acceptance Test Design

### AC-1：連線測試成功

| 項目 | 內容 |
|------|------|
| Given | 資料來源存在且目標資料庫可達 |
| When | 呼叫 `POST /api/datasources/:id/test` |
| Then | HTTP 200，{success: true, message: "連線成功", responseTime: N} |
| 驗證步驟 | 1. success = true<br>2. responseTime 為正整數<br>3. 資料來源 status 更新為 connected<br>4. lastTestedAt 已更新<br>5. datasource_health_logs 新增一筆成功記錄 |

### AC-2：連線測試失敗

| 項目 | 內容 |
|------|------|
| Given | 資料來源存在但連線設定有誤 |
| When | 呼叫 `POST /api/datasources/:id/test` |
| Then | HTTP 200，{success: false, message: 描述性錯誤, responseTime: null} |
| 驗證步驟 | 1. success = false<br>2. message 為描述性錯誤（如「連線被拒」「驗證失敗」）<br>3. status 更新為 disconnected<br>4. health log 新增一筆失敗記錄 |

### AC-3：連線逾時

| 項目 | 內容 |
|------|------|
| Given | 目標主機無回應 |
| When | 呼叫 `POST /api/datasources/:id/test`，等待超過 10 秒 |
| Then | HTTP 200，{success: false, message: "連線逾時（10 秒）", responseTime: null} |
| 驗證步驟 | 1. API 在 10-11 秒內回傳（不超過 11 秒）<br>2. status 更新為 disconnected |

---

## Test Scenarios

### Positive Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F015-001 | MySQL 連線成功 | AC-1 | Integration | Mock MySQL 連線成功 | 1. POST /api/datasources/:id/test | success=true, responseTime > 0, status=connected |
| TS-F015-002 | PostgreSQL 連線成功 | AC-1 | Integration | Mock PostgreSQL 連線成功 | 1. POST /api/datasources/:id/test | success=true |
| TS-F015-003 | Health log 記錄建立 | BR-8 | Integration | 測試完成 | 1. 查詢 datasource_health_logs | 新增一筆記錄，success / responseTime / checked_at 正確 |

### Negative Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F015-004 | 主機不可達 | AC-2 | Integration | Mock 連線拒絕 | 1. POST /api/datasources/:id/test | success=false, message 含「連線被拒」, status=disconnected |
| TS-F015-005 | 憑證錯誤 | AC-2 | Integration | Mock 認證失敗 | 1. POST /api/datasources/:id/test | success=false, message 含「驗證失敗」 |
| TS-F015-006 | 連線逾時（10 秒） | AC-3 | Integration | Mock 無回應 | 1. POST /api/datasources/:id/test | success=false, message 含「連線逾時」, 回應時間 ~10s |
| TS-F015-007 | 資料來源不存在 | 錯誤處理 | Integration | ID 不存在 | 1. POST /api/datasources/nonexist/test | HTTP 404，DS_NOT_FOUND |

### Boundary Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F015-008 | 資料庫名稱不存在 | 錯誤碼 | Integration | Mock 資料庫不存在 | 1. POST /api/datasources/:id/test | success=false, message 含「找不到指定的資料庫」 |
