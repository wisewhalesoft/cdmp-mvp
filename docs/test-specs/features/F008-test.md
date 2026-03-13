---
type: test-design-feature
feature_id: F008
feature_name: 指派／變更角色
priority: P0-MVP
related_spec: /specs/features/F008-assign-change-role.md
last_updated: 2026-03-12
---

# F008: 指派／變更角色 — 測試設計

---

## Acceptance Test Design

### AC-1：變更角色

| 項目 | 內容 |
|------|------|
| Given | 目標帳號角色為 user |
| When | 呼叫 `PATCH /api/accounts/:id/role`，body: {role: "admin"} |
| Then | HTTP 200，role 變更為 admin |
| 驗證步驟 | 1. 回應中 role=admin<br>2. 確認 GET /api/accounts/:id 回傳更新後的角色 |

### AC-2：最後一位 Admin 保護

| 項目 | 內容 |
|------|------|
| Given | 系統中僅有一個 Admin 帳號 |
| When | 嘗試將該 Admin 的角色變更為 user |
| Then | HTTP 422，ACCOUNT_LAST_ADMIN |
| 驗證步驟 | 1. 確認角色未被變更<br>2. 確認錯誤訊息：「無法移除最後一位 Admin，系統必須至少保留一個 Admin 帳號。」 |

### AC-3：角色變更確認（E2E）

E2E 層級驗證：前端顯示確認對話框，包含目前角色與新角色。

---

## Test Scenarios

### Positive Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F008-001 | User 升級為 Admin | AC-1 | Integration | 目標帳號 role=user | 1. PATCH /api/accounts/:id/role {role: admin} | HTTP 200，role=admin |
| TS-F008-002 | Admin 降級為 User（系統有 >= 2 Admin） | AC-1 | Integration | 系統有 2+ Admin | 1. PATCH /api/accounts/:id/role {role: user} | HTTP 200，role=user |

### Negative Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F008-003 | 最後一位 Admin 保護 | AC-2 | Integration | 系統僅 1 個 Admin | 1. PATCH /api/accounts/:id/role {role: user} | HTTP 422，ACCOUNT_LAST_ADMIN |
| TS-F008-004 | 帳號不存在 | 錯誤處理 | Integration | 無此 ID | 1. PATCH /api/accounts/nonexist/role {role: admin} | HTTP 404，ACCOUNT_NOT_FOUND |
| TS-F008-005 | 無效角色值 | 驗證 | Integration | Admin 已登入 | 1. PATCH /api/accounts/:id/role {role: "superadmin"} | HTTP 422，VALIDATION_INVALID_ROLE |

### Boundary Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F008-006 | 冪等操作 — 設定相同角色 | BR-6 | Integration | 目標帳號 role=admin | 1. PATCH /api/accounts/:id/role {role: admin} | HTTP 200，角色不變（冪等） |
