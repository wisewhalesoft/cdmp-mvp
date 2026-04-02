---
type: test-design-feature
feature_id: F045
feature_name: 業務角色定義（系統預設角色）
priority: P0-MVP
related_spec: /docs/stories/epics/E02-account-role-management/US-017-business-role-definitions.md
last_updated: 2026-04-02
---

# F045: 業務角色定義（系統預設角色）— 測試設計

---

## Acceptance Test Design

### AC-1：系統啟動時預設角色存在

| 項目 | 內容 |
|------|------|
| Given | 系統完成初始化或資料庫遷移（migration/seed 執行完畢） |
| When | Admin 呼叫 `GET /api/roles` 或查看建立帳號表單的角色下拉選單 |
| Then | 系統回傳 8 種角色，每筆含 roleCode、displayName、alias、type，資料與 Seed Data 規格完全一致 |
| 驗證步驟 | 1. 確認回應中 data 陣列長度恰好為 8<br>2. 比對每筆記錄的 roleCode / displayName / alias / type 與規格表一致<br>3. 直接查詢 DB 確認 roles 表有 8 筆且資料正確 |
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
| Then | 每種角色的 displayName 與 alias 欄位與規格完全一致（含無別名的角色回傳空字串或 null） |
| 驗證步驟 | 1. `admin` → displayName="管理者", alias="Admin", type="system"<br>2. `user` → displayName="使用者", alias="User", type="system"<br>3. `business` → displayName="業務", alias=null 或 "—", type="business"<br>4. `marketing` → displayName="行銷", alias="企劃", type="business"<br>5. `customer_service` → displayName="客服", alias=null 或 "—", type="business"<br>6. `analyst` → displayName="分析師", alias=null 或 "—", type="business"<br>7. `supervisor` → displayName="主管", alias=null 或 "—", type="business"<br>8. `backend_ops` → displayName="後端作業", alias="作服", type="business" |
| 測試資料 | ADMIN_ACTIVE Token + 已初始化的 Seed Data |

### AC-4：至少一位 Admin 限制（源自 US-014）

此 AC 的測試設計覆蓋於 F008-test.md（TS-F008-003 最後一位 Admin 保護）。F045 僅驗證 Seed Data 層面的初始狀態，不重複此場景。

---

## Test Scenarios

### Positive Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F045-001 | Seed Data 完整性驗證 — 8 種角色全部存在 | AC-1 / US-017 AC-1 | Integration | 資料庫已執行 migration/seed | 1. 直接查詢 DB roles 表（SELECT * FROM roles ORDER BY type DESC, role_code ASC） | 恰好 8 筆，roleCode 集合 = {admin, user, business, marketing, customer_service, analyst, supervisor, backend_ops} |
| TS-F045-002 | GET /api/roles — Admin 可存取 | AC-1 / US-017 AC-1 | Integration | ADMIN_ACTIVE Token，roles Seed Data 已存在 | 1. 呼叫 GET /api/roles | HTTP 200，data 陣列長度 = 8，每筆含 roleCode / displayName / alias / type |
| TS-F045-003 | 系統角色欄位正確性驗證 | AC-3 / US-017 AC-3 | Integration | ADMIN_ACTIVE Token | 1. GET /api/roles<br>2. 取出 type="system" 的兩筆記錄 | admin → displayName="管理者", alias="Admin"；user → displayName="使用者", alias="User" |
| TS-F045-004 | 業務角色欄位正確性驗證（含別名） | AC-3 / US-017 AC-3 | Integration | ADMIN_ACTIVE Token | 1. GET /api/roles<br>2. 取出 type="business" 的 6 筆記錄 | marketing → alias="企劃"；backend_ops → alias="作服"；其他 4 種 alias 為 null 或 "—" |
| TS-F045-005 | 前端角色選單顯示全部 8 種角色 | AC-3 / US-017 AC-3 | E2E | Admin 已登入，Seed Data 存在 | 1. 瀏覽至建立帳號頁面<br>2. 展開角色下拉選單 | 選單顯示 8 個選項，順序與顯示名稱符合規格（含帶括號別名的：行銷（企劃）、後端作業（作服）） |

### Negative Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F045-006 | 非 Admin 呼叫 GET /api/roles — 被拒 | US-017 AC-2 | Integration | USER_ACTIVE Token | 1. 以 User Token 呼叫 GET /api/roles | HTTP 403，AUTH_FORBIDDEN |
| TS-F045-007 | 業務角色 Token 呼叫 GET /api/roles — 被拒 | US-017 AC-2 | Integration | 角色為 analyst 的帳號 Token | 1. 以 analyst Token 呼叫 GET /api/roles | HTTP 403，AUTH_FORBIDDEN |
| TS-F045-008 | POST /api/roles 嘗試新增角色 — 403 | US-017 AC-2 | Integration | ADMIN_ACTIVE Token | 1. POST /api/roles {roleCode: "custom_role", displayName: "自訂"} | HTTP 403，訊息含「系統預設，不支援自訂新增或刪除」 |
| TS-F045-009 | DELETE /api/roles/business — 刪除業務角色被拒 | US-017 AC-2 | Integration | ADMIN_ACTIVE Token | 1. DELETE /api/roles/business | HTTP 403，roles 表中 business 角色仍存在 |
| TS-F045-010 | DELETE /api/roles/admin — 刪除系統角色被拒 | US-017 AC-2 | Integration | ADMIN_ACTIVE Token | 1. DELETE /api/roles/admin | HTTP 403，roles 表中 admin 角色仍存在 |
| TS-F045-011 | 無 Token 呼叫 GET /api/roles — 401 | 安全性 | Integration | 無 Authorization Header | 1. GET /api/roles（無 Token） | HTTP 401，AUTH_TOKEN_MISSING |

### Boundary Scenarios

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F045-012 | Seed Data 冪等性 — 重複執行 migration 不產生重複角色 | US-017 Seed Data 設計 | Integration | roles 表已有 8 筆 Seed Data | 1. 重新執行 seed/migration 腳本<br>2. 查詢 DB roles 表 | 仍只有 8 筆，無重複記錄（Upsert 或 INSERT ... ON CONFLICT DO NOTHING 設計） |
| TS-F045-013 | GET /api/roles 回應不含敏感欄位 | 安全性 | Integration | ADMIN_ACTIVE Token | 1. GET /api/roles<br>2. 檢查每筆記錄的所有欄位 | 回應僅含 roleCode / displayName / alias / type，不含 id、created_at、updated_at 等內部欄位（依規格決定） |

---

## 前端角色選單測試補充

下列前端場景為 F004、F008 共用的角色選單驗證，在此集中描述（避免重複），F004/F008 測試文件可交叉引用。

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TS-F045-UI-001 | 建立帳號角色選單 — 顯示 8 種且帶正確別名 | US-010 AC-4 / US-017 AC-3 | E2E | Admin 已登入 | 1. 瀏覽建立帳號頁<br>2. 展開角色下拉選單<br>3. 逐一核對選項文字 | 8 個選項顯示正確：管理者（Admin）、使用者（User）、業務、行銷（企劃）、客服、分析師、主管、後端作業（作服） |
| TS-F045-UI-002 | 角色變更選單 — 顯示 8 種且帶正確別名 | US-014 AC-1 / US-017 AC-3 | E2E | Admin 已登入，目標帳號存在 | 1. 瀏覽帳號詳細頁<br>2. 展開角色變更下拉選單<br>3. 逐一核對選項文字 | 8 個選項文字與 TS-F045-UI-001 一致 |

---

## 風險與注意事項

1. **alias 的 null vs 空字串**：US-017 規格中無別名的角色以「—」表示，但 API 回應應使用 null 或空字串。需確認後端 API 的實際欄位值（目前列為開放問題）。
2. **角色排列順序**：`GET /api/roles` 回應中 8 種角色的排列順序（system 優先或按 role_code 字母排序）規格未明確說明，前端選單排列順序應在實作前向 Product 確認。
3. **c360_role_permissions 整合測試**：US-017 Technical Notes 說明 `c360_role_permissions` 使用 role_code 作為外鍵，整合測試需在 US-068 實作後補充驗證。
