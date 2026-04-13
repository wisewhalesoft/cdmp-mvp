---
type: test-design-feature
feature_id: F045
feature_name: 系統角色定義（系統預設角色）
priority: P0-MVP
related_spec: /docs/stories/epics/E02-account-role-management/US-017-business-role-definitions.md
last_updated: 2026-04-13
---

# F045: 系統角色定義（系統預設角色）— 測試設計

---

## Acceptance Test Design

### AC-1：系統啟動時預設角色存在

| 項目 | 內容 |
|------|------|
| Given | 系統完成初始化或資料庫遷移（migration/seed 執行完畢） |
| When | Admin 呼叫 `GET /api/roles` 或查看建立帳號表單的角色下拉選單 |
| Then | 系統回傳 2 種角色（admin、user），每筆含 roleCode、displayName、alias、type，資料與 Seed Data 規格完全一致 |
| 驗證步驟 | 1. 確認回應中 data 陣列長度恰好為 2<br>2. 比對每筆記錄的 roleCode / displayName / alias / type 與規格表一致<br>3. 直接查詢 DB 確認 roles 表有 2 筆且資料正確 |
| 測試資料 | 乾淨的資料庫環境 + migration/seed 執行完成 |

### AC-2：Admin 無法新增或刪除角色

| 項目 | 內容 |
|------|------|
| Given | Admin 已登入 |
| When | 呼叫 `POST /api/roles` 嘗試新增角色，或呼叫 `DELETE /api/roles/:code` 嘗試刪除角色 |
| Then | 回傳 HTTP 403 Forbidden，訊息為「角色為系統預設，不支援自訂新增或刪除」 |
| 驗證步驟 | 1. 確認 HTTP 403<br>2. 確認回應含有明確的拒絕訊息<br>3. 確認 DB 中角色資料未被異動 |
| 測試資料 | ADMIN_ACTIVE Token |

### AC-3：角色顯示名稱與別名正確

| 項目 | 內容 |
|------|------|
| Given | Admin 已登入 |
| When | 呼叫 `GET /api/roles` |
| Then | 每種角色的 displayName 與 alias 欄位與規格完全一致 |
| 驗證步驟 | 1. `admin` → displayName="管理者", alias="Admin", type="system"<br>2. `user` → displayName="使用者", alias="User", type="system" |
| 測試資料 | ADMIN_ACTIVE Token + 已初始化的 Seed Data |

### AC-4：至少一位 Admin 限制（源自 US-014）

此 AC 的測試設計覆蓋於 F008-test.md（TS-F008-003 最後一位 Admin 保護）。F045 僅驗證 Seed Data 層面的初始狀態，不重複此場景。

---

## Test Scenarios

### Positive Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F045-001 | Seed Data 完整性驗證 — 2 種角色全部存在 | AC-1 / US-017 AC-1 | Integration | 資料庫已執行 migration/seed | 1. 直接查詢 DB roles 表（SELECT * FROM roles ORDER BY role_code ASC） | 恰好 2 筆，roleCode 集合 = {admin, user} |
| TS-F045-002 | GET /api/roles — Admin 可存取 | AC-1 / US-017 AC-1 | Integration | ADMIN_ACTIVE Token，roles Seed Data 已存在 | 1. 呼叫 GET /api/roles | HTTP 200，data 陣列長度 = 2，每筆含 roleCode / displayName / alias / type |
| TS-F045-003 | 系統角色欄位正確性驗證 | AC-3 / US-017 AC-3 | Integration | ADMIN_ACTIVE Token | 1. GET /api/roles<br>2. 取出全部 2 筆記錄 | admin → displayName="管理者", alias="Admin", type="system"；user → displayName="使用者", alias="User", type="system" |
| TS-F045-004 | 前端角色選單顯示 2 種角色 | AC-3 / US-017 AC-3 | E2E | Admin 已登入，Seed Data 存在 | 1. 瀏覽至建立帳號頁面<br>2. 展開角色下拉選單 | 選單顯示 2 個選項：管理者（Admin）、使用者（User） |

### Negative Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F045-005 | 非 Admin 呼叫 GET /api/roles — 被拒 | US-017 AC-2 | Integration | USER_ACTIVE Token | 1. 以 User Token 呼叫 GET /api/roles | HTTP 403，AUTH_FORBIDDEN |
| TS-F045-006 | POST /api/roles 嘗試新增角色 — 403 | US-017 AC-2 | Integration | ADMIN_ACTIVE Token | 1. POST /api/roles {roleCode: "custom_role", displayName: "自訂"} | HTTP 403，訊息含「系統預設，不支援自訂新增或刪除」 |
| TS-F045-007 | DELETE /api/roles/user — 刪除系統角色被拒 | US-017 AC-2 | Integration | ADMIN_ACTIVE Token | 1. DELETE /api/roles/user | HTTP 403，roles 表中 user 角色仍存在 |
| TS-F045-008 | DELETE /api/roles/admin — 刪除系統角色被拒 | US-017 AC-2 | Integration | ADMIN_ACTIVE Token | 1. DELETE /api/roles/admin | HTTP 403，roles 表中 admin 角色仍存在 |
| TS-F045-009 | 無 Token 呼叫 GET /api/roles — 401 | 安全性 | Integration | 無 Authorization Header | 1. GET /api/roles（無 Token） | HTTP 401，AUTH_TOKEN_MISSING |

### Boundary Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F045-010 | Seed Data 冪等性 — 重複執行 migration 不產生重複角色 | US-017 Seed Data 設計 | Integration | roles 表已有 2 筆 Seed Data | 1. 重新執行 seed/migration 腳本<br>2. 查詢 DB roles 表 | 仍只有 2 筆，無重複記錄（Upsert 或 INSERT ... ON CONFLICT DO NOTHING 設計） |
| TS-F045-011 | GET /api/roles 回應不含敏感欄位 | 安全性 | Integration | ADMIN_ACTIVE Token | 1. GET /api/roles<br>2. 檢查每筆記錄的所有欄位 | 回應僅含 roleCode / displayName / alias / type，不含 id、created_at、updated_at 等內部欄位（依規格決定） |

---

## 前端角色選單測試補充

下列前端場景為 F004、F008 共用的角色選單驗證，在此集中描述（避免重複），F004/F008 測試文件可交叉引用。

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F045-UI-001 | 建立帳號角色選單 — 顯示 2 種且帶正確別名 | US-010 AC-4 / US-017 AC-3 | E2E | Admin 已登入 | 1. 瀏覽建立帳號頁<br>2. 展開角色下拉選單<br>3. 逐一核對選項文字 | 2 個選項顯示正確：管理者（Admin）、使用者（User） |
| TS-F045-UI-002 | 角色變更選單 — 顯示 2 種且帶正確別名 | US-014 AC-1 / US-017 AC-3 | E2E | Admin 已登入，目標帳號存在 | 1. 瀏覽帳號詳細頁<br>2. 展開角色變更下拉選單<br>3. 逐一核對選項文字 | 2 個選項文字與 TS-F045-UI-001 一致 |

---

## 風險與注意事項

1. **角色排列順序**：`GET /api/roles` 回應中 2 種角色的排列順序規格未明確說明，前端選單排列順序應在實作前向 Product 確認。
