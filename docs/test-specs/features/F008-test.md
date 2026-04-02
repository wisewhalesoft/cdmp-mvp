---
type: test-design-feature
feature_id: F008
feature_name: 指派／變更角色
priority: P0-MVP
related_spec: /specs/features/F008-assign-change-role.md
last_updated: 2026-04-02
---

# F008: 指派／變更角色 — 測試設計

---

## Acceptance Test Design

### AC-1：變更角色（含業務角色）

| 項目 | 內容 |
|------|------|
| Given | 目標帳號角色為 user |
| When | 呼叫 `PATCH /api/accounts/:id/role`，body: {role: "admin"} 或業務角色（如 "analyst"） |
| Then | HTTP 200，role 變更為指定值 |
| 驗證步驟 | 1. 回應中 role 欄位為新值（支援全部 8 種 role_code）<br>2. 確認 GET /api/accounts 清單中該帳號角色已更新，displayName 顯示正確中文名稱 |

### AC-2：最後一位 Admin 保護（含降級為業務角色）

| 項目 | 內容 |
|------|------|
| Given | 系統中僅有一個 Admin 帳號 |
| When | 嘗試將該 Admin 的角色變更為任何非 Admin 角色（包含 user 或任意業務角色） |
| Then | HTTP 422，ACCOUNT_LAST_ADMIN |
| 驗證步驟 | 1. 確認角色未被變更<br>2. 確認錯誤訊息：「無法移除最後一位 Admin，系統必須至少保留一個 Admin 帳號。」 |

### AC-3：角色變更確認對話框（E2E）

| 項目 | 內容 |
|------|------|
| Given | Admin 正在查看某帳號的角色設定 |
| When | Admin 選擇新角色（含業務角色） |
| Then | 前端彈出確認對話框，顯示目前角色中文名稱與新角色中文名稱（含括號別名），Admin 確認後才執行 PATCH API |
| 驗證步驟 | 1. 選擇新角色後確認對話框出現<br>2. 對話框中含目前角色與新角色的中文顯示名稱<br>3. 點擊「取消」後 PATCH API 未被呼叫<br>4. 點擊「確認」後 PATCH API 被呼叫且角色更新成功 |

### AC-5：角色變更選單顯示全部 8 種角色（新增自 US-014 AC-1）

| 項目 | 內容 |
|------|------|
| Given | Admin 正在查看某帳號的角色設定 |
| When | 展開角色選擇下拉選單 |
| Then | 選單顯示全部 8 種角色，文字正確（含括號別名） |
| 驗證步驟 | 1. 確認選項數量 = 8<br>2. 逐一核對顯示文字（與 F045 TS-F045-UI-002 一致） |

### AC-6：角色變更生效時機（Token 刷新）

| 項目 | 內容 |
|------|------|
| Given | Admin 已成功將某使用者的角色由 user 改為 analyst |
| When | 該使用者重新登入取得新 Token |
| Then | 新 Token 的 payload 或對應的使用者資訊反映新角色 analyst |
| 驗證步驟 | 1. 使用舊 Token 驗證角色仍為原值（未立即生效）<br>2. 登出後重新登入<br>3. 確認新 Token 或 GET /api/accounts/me 回傳 role = "analyst" |
| 備註 | Token 立即失效策略由 E01 JWT 黑名單機制決定；此場景驗證角色變更不立即影響當前有效 Session |

---

## Test Scenarios

### Positive Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F008-001 | User 升級為 Admin | AC-1 / US-014 AC-3 | Integration | 目標帳號 role=user | 1. PATCH /api/accounts/:id/role {role: admin} | HTTP 200，role=admin |
| TS-F008-002 | Admin 降級為 User（系統有 >= 2 Admin） | AC-1 / US-014 | Integration | 系統有 2+ Admin | 1. PATCH /api/accounts/:id/role {role: user} | HTTP 200，role=user |
| TS-F008-007 | User 變更為業務角色 business | AC-1 / US-014 AC-2 | Integration | 目標帳號 role=user，F045 Seed Data 存在 | 1. PATCH /api/accounts/:id/role {role: business} | HTTP 200，role=business；GET 清單顯示「業務」 |
| TS-F008-008 | User 變更為業務角色 analyst | AC-1 / US-014 AC-2 | Integration | 目標帳號 role=user | 1. PATCH /api/accounts/:id/role {role: analyst} | HTTP 200，role=analyst；GET 清單顯示「分析師」 |
| TS-F008-009 | 業務角色間互相變更（business → supervisor） | AC-1 / US-014 測試案例 6 | Integration | 目標帳號 role=business | 1. PATCH /api/accounts/:id/role {role: supervisor} | HTTP 200，role=supervisor；GET 清單顯示「主管」 |
| TS-F008-010 | 業務角色間互相變更（backend_ops → customer_service） | AC-1 / US-014 測試案例 7 | Integration | 目標帳號 role=backend_ops | 1. PATCH /api/accounts/:id/role {role: customer_service} | HTTP 200，role=customer_service；GET 清單顯示「客服」 |
| TS-F008-011 | 業務角色升級為 Admin | AC-1 / US-014 AC-3 | Integration | 目標帳號 role=business | 1. PATCH /api/accounts/:id/role {role: admin} | HTTP 200，role=admin |
| TS-F008-012 | Admin 降級為業務角色（系統有 >= 2 Admin） | AC-1 / US-014 | Integration | 系統有 2+ Admin，目標帳號 role=admin | 1. PATCH /api/accounts/:id/role {role: marketing} | HTTP 200，role=marketing；GET 清單顯示「行銷（企劃）」 |

### Negative Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F008-003 | 最後一位 Admin 降級為 User — 被阻止 | AC-2 / US-014 AC-4 | Integration | 系統僅 1 個 Admin | 1. PATCH /api/accounts/:id/role {role: user} | HTTP 422，ACCOUNT_LAST_ADMIN；錯誤訊息：「無法移除最後一位 Admin，系統必須至少保留一個 Admin 帳號。」 |
| TS-F008-013 | 最後一位 Admin 降級為業務角色 — 被阻止 | AC-2 / US-014 AC-4 | Integration | 系統僅 1 個 Admin | 1. PATCH /api/accounts/:id/role {role: analyst} | HTTP 422，ACCOUNT_LAST_ADMIN |
| TS-F008-014 | 最後一位 Admin 降級（嘗試全部 6 種業務角色） | AC-2 / US-014 AC-4 | Integration | 系統僅 1 個 Admin | 1. 依次嘗試 PATCH role: business / marketing / customer_service / supervisor / backend_ops | 全部回傳 HTTP 422，ACCOUNT_LAST_ADMIN；DB 角色始終保持 admin |
| TS-F008-004 | 帳號不存在 | 錯誤處理 | Integration | 無此 ID | 1. PATCH /api/accounts/nonexist-id/role {role: admin} | HTTP 404，ACCOUNT_NOT_FOUND |
| TS-F008-005 | 無效角色值（manager） | 驗證 / US-014 測試案例 8 | Integration | Admin 已登入 | 1. PATCH /api/accounts/:id/role {role: "manager"} | HTTP 422，VALIDATION_INVALID_ROLE |
| TS-F008-015 | 非 Admin 嘗試變更角色 | BR-5 / US-014 測試案例 10 | Integration | analyst 角色帳號已登入 | 1. 以業務角色 Token 呼叫 PATCH /api/accounts/:id/role | HTTP 403，AUTH_FORBIDDEN |

### Boundary Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F008-006 | 冪等操作 — 設定相同角色（admin → admin） | BR-6 | Integration | 目標帳號 role=admin | 1. PATCH /api/accounts/:id/role {role: admin} | HTTP 200，角色不變（冪等） |
| TS-F008-016 | 冪等操作 — 設定相同業務角色（analyst → analyst） | BR-6 | Integration | 目標帳號 role=analyst | 1. PATCH /api/accounts/:id/role {role: analyst} | HTTP 200，角色不變（冪等） |

### 前端場景

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F008-FE-001 | 角色選單顯示 8 種角色 | AC-5 / US-014 AC-1 | E2E | Admin 已登入，F045 Seed Data 存在 | 1. 開啟帳號詳細頁<br>2. 展開角色下拉選單 | 共 8 個選項，文字正確（含括號別名） |
| TS-F008-FE-002 | 確認對話框 — 顯示中文角色名稱 | AC-3 / US-014 AC-5 | E2E | Admin 已登入，目標帳號 role=business | 1. 展開角色選單<br>2. 選擇「分析師」 | 對話框顯示：目前角色「業務」→ 新角色「分析師」，含確認與取消按鈕 |
| TS-F008-FE-003 | 取消確認 — PATCH API 未被呼叫 | AC-3 / US-014 AC-5 | E2E | Admin 已登入 | 1. 選擇新角色後對話框出現<br>2. 點擊「取消」 | 對話框關閉，角色未變更，PATCH API 未發出 |
| TS-F008-FE-004 | 角色變更後清單立即更新中文名稱 | AC-1 / US-014 AC-2 | E2E | Admin 已登入，目標帳號 role=user | 1. 變更角色為「行銷（企劃）」並確認 | 成功訊息顯示；帳號清單角色欄位立即更新為「行銷（企劃）」 |
