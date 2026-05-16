---
type: test-design-feature
feature_id: F073-F074-E02
feature_name: E07 角色指派 E02 整合測試（PATCH /accounts/:id/e07-role、Guard、JWT payload、正交維度）
priority: P0-MVP
related_spec: >
  /docs/specs/features/F073-define-director-role.md §5.4
  /docs/specs/features/F074-define-section-chief-role.md §5.4
  /docs/specs/features/F002-user-login.md §4.6
  /docs/specs/architecture-spec.md §3.10
  /docs/specs/error-handling.md #assignment-errors
  /docs/specs/features/F006-edit-account.md BR-9
last_updated: 2026-05-16
---

# F073-F074 E02 整合測試 — 測試設計

> **範圍說明**：本文件涵蓋 E07 重構（批次 1）新增的 E02 整合端點（PATCH `/api/v1/accounts/:id/e07-role`）、JWT payload `e07_role` claim、新增 Guard（DirectorGuard / SectionChiefGuard 及其組合 Guard）、以及 `is_sales_manager` 與 `e07_role` 正交維度 regression 測試的全部測試設計。不涵蓋 E07 模組內部功能（M01~M06），那些由各 Feature 測試文件負責。

---

## 一、PATCH /accounts/:id/e07-role 端點測試（TC-E02-100 ~ TC-E02-115）

### Acceptance Test Design

#### AC-E02-1：admin 成功指派 director 角色並觸發 token revoke

| 項目 | 內容 |
|------|------|
| Given | admin 已登入；目標帳號 `USER_E07_NULL`（e07_role=null）存在 |
| When | PATCH `/api/v1/accounts/:id/e07-role` body: `{"e07Role":"director"}` |
| Then | HTTP 200；DB `users.e07_role = 'director'`；`users.password_changed_at` 比 PATCH 前大約 1 秒後（+1000ms 誤差 ≤ 50ms 容忍）；`assignment_audit_log` 含 `action='ASSIGN_ROLE'`、`entity_type='e07_role'`、`entity_id='{userId}|director'`；舊 JWT 下次請求回 401 AUTH_TOKEN_REVOKED |

#### AC-E02-2：冪等性（相同值重複 PATCH）

| 項目 | 內容 |
|------|------|
| Given | 目標帳號已為 `e07_role='director'` |
| When | 再次 PATCH `{"e07Role":"director"}` |
| Then | HTTP 200；`password_changed_at` **不**更新（避免不必要 token revoke）；`assignment_audit_log` **不**新增（無變化不寫入）|

> **OQ-E02-001（Pending）**：冪等性行為（password_changed_at 是否更新、audit_log 是否寫入）需 spec-writer 在 F073 v1.2 明確化。目前設計假設「值未改變 → 不更新 password_changed_at / 不寫 audit_log」，待確認後可調整 TC-E02-103。

#### AC-E02-3：DTO 白名單過濾（BR-9 regression）

| 項目 | 內容 |
|------|------|
| Given | 目標帳號 `e07_role='director'` |
| When | PUT `/api/accounts/:id` body 含 `e07_role: "section_chief"` |
| Then | HTTP 200（正常更新 name/email）；DB `e07_role` 仍為 `'director'`（PUT endpoint DTO 不含此欄位） |

---

### Happy Path 測試場景

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TC-E02-100 | admin 設定 user 為 director | F073 §5.4.1 / AC-7 | Integration | 目標帳號 `USER_E07_NULL` 存在，admin JWT 有效 | 1. PATCH `/api/v1/accounts/:id/e07-role` `{"e07Role":"director"}` | HTTP 200；DB `e07_role='director'`；`password_changed_at` 已更新（> 請求時間戳）；回應含 `e07_role` 與 `password_changed_at` 欄位 |
| TC-E02-101 | admin 設定 user 為 section_chief | F074 §5.4 / AC-7 | Integration | 目標帳號 `USER_E07_NULL` 存在 | 1. PATCH `/api/v1/accounts/:id/e07-role` `{"e07Role":"section_chief"}` | HTTP 200；DB `e07_role='section_chief'`；`password_changed_at` 已更新 |
| TC-E02-102 | admin 清除 e07_role（設為 null） | F073 AC-7 / F074 AC-7 | Integration | 目標帳號目前 `e07_role='director'` | 1. PATCH `/api/v1/accounts/:id/e07-role` `{"e07Role":null}` | HTTP 200；DB `e07_role=NULL`；`password_changed_at` 已更新；audit_log 含 `action='REVOKE_ROLE'`、`before_value.e07_role='director'` |
| TC-E02-103 | admin 設定相同值（冪等） | OQ-E02-001 | Integration | 目標帳號 `e07_role='director'` | 1. PATCH `{"e07Role":"director"}` | HTTP 200；DB `e07_role` 未變；待 OQ-E02-001 確認 password_changed_at / audit_log 行為 |

---

### Negative / Error 測試場景

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TC-E02-104 | 傳入非允許值 | F073 §5.3 | Negative | admin JWT 有效，目標帳號存在 | 1. PATCH `{"e07Role":"manager"}` | HTTP 422；錯誤碼 `ACCOUNT_E07_ROLE_INVALID` |
| TC-E02-105 | 非 admin 呼叫 | F073 §5.4.1 / §5.3 | Negative | USER 角色 JWT（非 admin）有效 | 1. 以 user JWT 呼叫 PATCH | HTTP 403；錯誤碼 `ACCOUNT_E07_ROLE_FORBIDDEN` |
| TC-E02-106 | 未登入呼叫 | F073 §5.3 | Negative | 無 Authorization header | 1. 呼叫 PATCH，無 JWT | HTTP 401；錯誤碼 `AUTH_TOKEN_MISSING` 或 `AUTH_TOKEN_INVALID` |
| TC-E02-107 | admin 對自身帳號設定 e07_role | OQ-E02-002（Pending） | Negative / Edge | admin 對 `req.user.id == :id` 呼叫 PATCH | 1. admin PATCH 自身帳號 | **OQ-E02-002**：spec 未明確定義自設行為。建議允許（回 200），因 admin 自動繼承 Director 語意，設與不設無功能差異。待 PO 確認後調整 |
| TC-E02-108 | DTO 缺 e07_role 欄位 | F073 §5.4.1 驗證規則 | Negative | admin JWT 有效 | 1. PATCH `{}` | HTTP 400；錯誤碼 `VALIDATION_FAILED`（`e07Role` 為必填欄位） |
| TC-E02-108B | 目標帳號不存在 | F073 §5.4.1 驗證規則 | Negative | 傳入不存在的 user ID | 1. PATCH `/api/v1/accounts/nonexistent-id/e07-role` | HTTP 404；錯誤碼 `ACCOUNT_NOT_FOUND` |

---

### Token Revoke 整合驗證

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TC-E02-109 | PATCH 成功後舊 JWT 失效 | F073 §5.4.2 / AC-7 | Integration | 目標帳號持有有效 JWT（舊 token），admin 對其執行 PATCH `e07_role` 變更 | 1. 記錄目標帳號舊 JWT<br>2. admin 執行 PATCH（任意值變更）<br>3. 立即以舊 JWT 呼叫 GET /api/v1/auth/me | HTTP 401；錯誤碼 `AUTH_TOKEN_REVOKED`（password_changed_at 比對機制） |
| TC-E02-110 | PATCH 成功後重新登入取得新 JWT 含 e07_role claim | F002 §4.6 / F073 §5.4.2 | Integration | 目標帳號被設為 `e07_role='director'` | 1. 目標帳號重新登入（POST /auth/login）<br>2. decode 新 JWT payload | JWT payload 含 `e07_role: 'director'` claim（非 undefined） |

---

### BR-9 PUT /accounts/:id 隔離驗證（Regression）

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TC-E02-111 | PUT body 含 e07_role 應被忽略 | F006 BR-9 / F073 BR-9 | Regression | 目標帳號 `e07_role='director'` | 1. PUT `/api/accounts/:id` `{name:"X", email:"x@test.com", e07_role:"section_chief"}` | HTTP 200；GET 確認 DB `e07_role` 仍為 `'director'`（PUT DTO 無此欄位，後端忽略） |
| TC-E02-112 | PUT 正常更新 name/email 不影響 e07_role | F006 BR-9 | Regression | 目標帳號 `e07_role='section_chief'` | 1. PUT `/api/accounts/:id` `{name:"New Name", email:"new@test.com"}` | HTTP 200；GET 確認 `e07_role` 仍為 `'section_chief'` |

---

## 二、JWT Payload 含 e07_role（TC-AUTH-200 ~ TC-AUTH-205）

### Acceptance Test Design

#### AC-AUTH-1：login 後 JWT payload 含最新 e07_role claim

| 項目 | 內容 |
|------|------|
| Given | 帳號已設定 `e07_role` 值（director / section_chief / null） |
| When | POST `/api/auth/login` 以正確憑證登入 |
| Then | 回應含 JWT；decode JWT payload，`e07_role` claim 存在且值正確 |

#### AC-AUTH-2：refresh token 後新 JWT 含最新 e07_role

| 項目 | 內容 |
|------|------|
| Given | 帳號 access token 期間 admin 對其 e07_role 執行 PATCH 變更（導致舊 access token 失效） |
| When | 帳號以 refresh token 取得新 access token |
| Then | 新 JWT payload 之 `e07_role` claim 反映最新值（非舊的 access token 時的值） |

#### AC-AUTH-3：legacy JWT 相容性

| 項目 | 內容 |
|------|------|
| Given | 存在一個舊 JWT（無 e07_role claim，對應 e07_role 欄位加入前發出的 token） |
| When | 以此 legacy JWT 呼叫 E07 Guard 保護的 API |
| Then | Guard 視 `e07_role` 為 null（不因 claim 不存在而拋出 500）；若帳號無 admin，回 403 AUTH_FORBIDDEN |

---

### 測試場景

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TC-AUTH-200 | login 後 JWT decode 含 e07_role=director | F002 §4.6 | Unit / Integration | `USER_DIRECTOR` 種子帳號（e07_role='director'）存在 | 1. POST /auth/login<br>2. base64url decode JWT payload | payload.e07_role === 'director' |
| TC-AUTH-201 | login 後 JWT decode 含 e07_role=section_chief | F002 §4.6 | Unit / Integration | `USER_SECTION_CHIEF` 種子帳號（e07_role='section_chief'）存在 | 同上 | payload.e07_role === 'section_chief' |
| TC-AUTH-202 | login 後 JWT decode 含 e07_role=null | F002 §4.6 | Unit / Integration | 一般 user 帳號（e07_role=null）存在 | 同上 | payload.e07_role === null 或 payload 無 e07_role key（Guard 兩種均視為 null） |
| TC-AUTH-203 | AuthGuard 解析後 req.user.e07_role 正確暴露 | F002 §4.6 / architecture-spec §3.10 | Unit（Guard 單元） | mock JWT payload 含 `e07_role:'director'` | 1. 以含 e07_role claim 的 JWT 呼叫受保護端點<br>2. 在 Guard 中攔截 req.user 物件 | req.user.e07_role === 'director' |
| TC-AUTH-204 | refresh token 後新 JWT 含最新 e07_role | F073 §5.4.2 | Integration | 帳號已取得 refresh token；之後 admin PATCH 其 e07_role 為 director | 1. access token 失效後以 refresh token 換新<br>2. decode 新 JWT | 新 JWT payload.e07_role === 'director'（非舊值） |
| TC-AUTH-205 | legacy JWT（無 e07_role claim）→ Guard 視為 null | F073 BR-11 | Boundary（Security） | 手工偽造一個無 e07_role key 的 JWT（不修改簽章，須為合法舊 payload 格式） | 1. 以 legacy JWT 呼叫 SalesManagerGuard 保護端點（該帳號 is_sales_manager=false / role=user） | HTTP 403 AUTH_FORBIDDEN（Guard 不崩潰；null e07_role 不通過 SalesManagerGuard）|

---

## 三、DirectorGuard / SectionChiefGuard 單元測試（TC-GUARD-300 ~ TC-GUARD-315）

### 測試場景

#### DirectorGuard（TC-GUARD-300 ~ TC-GUARD-304）

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TC-GUARD-300 | DirectorGuard：e07_role='director' → 通過 | F073 §5.2 | Unit | mock req.user: `{role:'user', e07_role:'director'}` | 1. 呼叫 DirectorGuard.canActivate() | canActivate() === true |
| TC-GUARD-301 | DirectorGuard：e07_role='section_chief' → 拒絕 | F073 §5.2 | Unit | mock req.user: `{role:'user', e07_role:'section_chief'}` | 同上 | canActivate() === false（或拋 ForbiddenException(E07_FORBIDDEN_DIRECTOR_ONLY)） |
| TC-GUARD-302 | DirectorGuard：e07_role=null → 拒絕 | F073 §5.2 | Unit | mock req.user: `{role:'user', e07_role:null}` | 同上 | canActivate() === false |
| TC-GUARD-303 | DirectorGuard：role='admin' 自動通過（BR-2） | F073 BR-2 / §5.2 | Unit | mock req.user: `{role:'admin', e07_role:null}` | 同上 | canActivate() === true（admin 無需 director claim） |
| TC-GUARD-304 | DirectorGuard：is_sales_manager=true + e07_role=null → 拒絕 | F073 BR-11 正交 | Unit | mock req.user: `{role:'user', is_sales_manager:true, e07_role:null}` | 同上 | canActivate() === false（DirectorGuard 不讀 is_sales_manager） |

#### SectionChiefGuard（TC-GUARD-305 ~ TC-GUARD-309）

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TC-GUARD-305 | SectionChiefGuard：e07_role='section_chief' → 通過 | F074 §5.2 | Unit | mock req.user: `{role:'user', e07_role:'section_chief'}` | 1. SectionChiefGuard.canActivate() | true |
| TC-GUARD-306 | SectionChiefGuard：e07_role='director' → 拒絕 | F074 §5.2 | Unit | mock req.user: `{role:'user', e07_role:'director'}` | 同上 | false（SectionChiefGuard 僅允許 section_chief 本身，不含 director 升級） |
| TC-GUARD-307 | SectionChiefGuard：e07_role=null → 拒絕 | F074 §5.2 | Unit | mock req.user: `{role:'user', e07_role:null}` | 同上 | false |
| TC-GUARD-308 | SectionChiefGuard：role='admin' → 通過（admin 繼承） | F073 BR-2 | Unit | mock req.user: `{role:'admin', e07_role:null}` | 同上 | true（admin 視為 director，高於 section_chief）|
| TC-GUARD-309 | SectionChiefGuard：is_sales_manager=true + e07_role=null → 拒絕 | F074 BR-10 正交 | Unit | mock req.user: `{role:'user', is_sales_manager:true, e07_role:null}` | 同上 | false（不讀 is_sales_manager） |

#### SectionChiefScopeGuard（TC-GUARD-310 ~ TC-GUARD-311）

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TC-GUARD-310 | SectionChiefScopeGuard：GET 請求不攔截 | architecture-spec §3.10 系統決議 #4 | Unit | mock req.method='GET', req.user: section_chief | 1. SectionChiefScopeGuard.canActivate() | true（GET 不檢查 created_by 欄位轄區）|
| TC-GUARD-311 | SectionChiefScopeGuard：PUT 他人轄區 → 403 | F074 AC-3 / §5.2 | Integration | 處長帳號 A；PUT target 記錄之 `created_by` 等於帳號 B（非 A） | 1. 以帳號 A JWT 對屬於帳號 B 的記錄執行 PUT | HTTP 403；錯誤碼 `E07_FORBIDDEN_SECTION_CHIEF_SCOPE` |

#### 組合 Guard（TC-GUARD-312 ~ TC-GUARD-315）

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TC-GUARD-312 | DirectorOrAdminGuard：role=admin → true | F073 BR-2 | Unit | mock req.user: `{role:'admin', e07_role:null}` | canActivate() | true |
| TC-GUARD-313 | DirectorOrAdminGuard：e07_role=director → true | F073 §5.2 | Unit | mock req.user: `{role:'user', e07_role:'director'}` | canActivate() | true |
| TC-GUARD-314 | DirectorOrAdminGuard：e07_role=section_chief → false | F073 AC-6 | Unit | mock req.user: `{role:'user', e07_role:'section_chief'}` | canActivate() | false（處長無法通過部長專屬 Guard） |
| TC-GUARD-315 | SectionChiefOrAboveGuard：全部允許身份 → true；其他 → false | F073 AC-5 / F074 §5.2 | Unit | 測試三組：director / section_chief / admin（全為 true）；role=user + e07_role=null（false） | canActivate() 四次 | director/section_chief/admin 全回 true；無 E07 角色回 false |

---

## 四、is_sales_manager 與 e07_role 正交維度 Regression（TC-ORTHO-400 ~ TC-ORTHO-407）

### Acceptance Test Design

#### AC-ORTHO-1：正交獨立性驗證（BR-11）

| 項目 | 內容 |
|------|------|
| Given | 帳號同時持有 `is_sales_manager` 與 `e07_role` 兩個屬性 |
| When | 分別呼叫 SalesManagerGuard 保護端點與 DirectorGuard 保護端點 |
| Then | 兩個 Guard 各自獨立判斷，不互相替代；`is_sales_manager=true` 僅對 SalesManagerGuard 有效，`e07_role='director'` 僅對 DirectorGuard 有效 |

---

### 測試場景

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TC-ORTHO-400 | 同時 is_sales_manager=true + e07_role='director' → 兩 Guard 皆通過 | F073 BR-11 | Integration | `USER_DIRECTOR_SM`：is_sales_manager=true + e07_role='director'（buildUserAsDirector fixture） | 1. 呼叫 SalesManagerGuard 保護端點<br>2. 呼叫 DirectorGuard 保護端點 | 兩者均 HTTP 200（雙重通過） |
| TC-ORTHO-401 | is_sales_manager=true + e07_role=null → SalesManagerGuard 通過；DirectorGuard 拒絕 | F073 BR-11 | Integration | `USER_SM_NO_E07`：is_sales_manager=true + e07_role=null（buildUserWithSalesManagerFlag fixture） | 1. 呼叫 SalesManagerGuard 端點<br>2. 呼叫 DirectorGuard 端點 | SalesManagerGuard 端點 200；DirectorGuard 端點 403 E07_FORBIDDEN_DIRECTOR_ONLY |
| TC-ORTHO-402 | is_sales_manager=false + e07_role='section_chief' → SalesManagerGuard 拒絕；SectionChiefGuard 通過 | F074 BR-10 | Integration | `USER_ORTHO_SECTION_CHIEF`：is_sales_manager=false + e07_role='section_chief'（buildUserOrthogonalSectionChief fixture）— 對應 prototype 07 林宥嘉 row 場景 | 1. 呼叫 SalesManagerGuard 端點<br>2. 呼叫 SectionChiefGuard 端點 | SalesManagerGuard 403；SectionChiefGuard 200 |
| TC-ORTHO-403 | 既有 E07 controller（SalesManagerGuard）對 is_sales_manager=true + e07_role=null user → 仍允許 | 向後相容性 | Integration | 既有 E07 controller（如 F050 名單列表），使用 SalesManagerGuard 保護 | 以 is_sales_manager=true + e07_role=null JWT 呼叫 | HTTP 200（SalesManagerGuard 仍以 is_sales_manager 判斷，向後相容） |
| TC-ORTHO-404 | F073/F074 新 controller（DirectorGuard）對 is_sales_manager=true + e07_role=null user → 拒絕 | F073 BR-11 | Integration | 新 DirectorGuard 保護的部長專屬端點 | 以 is_sales_manager=true + e07_role=null JWT 呼叫 | HTTP 403 E07_FORBIDDEN_DIRECTOR_ONLY（新 Guard 不讀 is_sales_manager） |
| TC-ORTHO-405 | PATCH e07_role 不影響 is_sales_manager | F073 BR-11 | Regression | 目標帳號 is_sales_manager=true + e07_role=null；admin PATCH e07_role='director' | 1. 執行 PATCH<br>2. GET 帳號資料 | is_sales_manager 仍為 true（PATCH e07-role 端點不觸及 is_sales_manager 欄位） |
| TC-ORTHO-406 | PATCH sales-manager-flag 不影響 e07_role | F073 BR-11 | Regression | 目標帳號 is_sales_manager=false + e07_role='director'；admin PATCH is_sales_manager=true | 1. 執行 PATCH sales-manager-flag 端點<br>2. GET 帳號資料 | e07_role 仍為 'director'（兩端點各自獨立） |
| TC-ORTHO-407 | audit log 雙寫獨立：PATCH e07_role 寫 ASSIGN_ROLE；PATCH sales-manager-flag 寫 SALES_MANAGER_CHANGED | F073 BR-6 | Regression | 對同一帳號先後執行兩個 PATCH 端點 | 1. 查 assignment_audit_log | 兩條 audit log 各自獨立，entity_type 分別為 `'e07_role'` 與 `'is_sales_manager'`；不互相混寫 |

---

## 五、測試資料需求（Fixture）

### 種子帳號擴充建議

建議在 `apps/api/test/fixtures/users.fixture.ts` 擴充以下 builder 函式（設計層定義，不寫實作程式碼）：

| Fixture 名稱 | role | is_sales_manager | e07_role | 用途 |
|------------|------|-----------------|----------|------|
| `buildAdminUser()` | admin | false | null | TC-E02-10x 呼叫者身份；TC-GUARD-30x admin 繼承 |
| `buildUserWithSalesManagerFlag()` | user | **true** | null | TC-ORTHO-401 / TC-ORTHO-403 向後相容驗證 |
| `buildUserAsDirector()` | user | true | **'director'** | TC-ORTHO-400 / TC-AUTH-200 |
| `buildUserAsSectionChief()` | user | true | **'section_chief'** | TC-AUTH-201 / TC-GUARD-305 |
| `buildUserOrthogonalSectionChief()` | user | **false** | **'section_chief'** | TC-ORTHO-402 — 驗證正交（林宥嘉場景） |
| `buildUserAsBusinessman()` | user | false | null | TC-ORTHO-404 / TC-E02-105 一般 user 無任何 E07 角色 |
| `buildUserE07Null()` | user | false | null | TC-E02-100~102 PATCH 目標帳號（指派前初始狀態） |

> **buildUserOrthogonalSectionChief()** 為此批次最關鍵 fixture：`is_sales_manager=false + e07_role='section_chief'` 組合驗證兩欄位正交性，不可以 `buildUserAsSectionChief`（is_sales_manager=true）替代。

### DB Transaction 驗證注意

TC-E02-100~102 的 DB 驗證（`e07_role` + `password_changed_at` + `assignment_audit_log` 三欄位）須在同一測試斷言中驗證，確認 transaction 原子性：任一欄位更新失敗時，其他欄位亦回滾。

---

## 六、自動化就緒度評估

| 類別 | 場景數 | 自動化評估 |
|------|--------|-----------|
| PATCH 端點 API Integration | 13（TC-E02-100~112） | 完全自動化；需 test DB seed + cleanup |
| JWT payload 驗證 | 6（TC-AUTH-200~205） | 完全自動化；TC-AUTH-205 需 mock JWT factory |
| Guard 單元測試 | 16（TC-GUARD-300~315） | 完全自動化；純單元測試，無 DB 依賴 |
| 正交維度 Regression | 8（TC-ORTHO-400~407） | 完全自動化；TC-ORTHO-403 需先確認既有 SalesManagerGuard 邏輯 |
| **合計** | **43** | |

### 環境依賴

| 依賴項 | 影響場景 | Mock 策略 |
|--------|---------|-----------|
| DB（users + assignment_audit_log） | TC-E02-100~112 | Test DB seed + after each cleanup |
| 時鐘（password_changed_at +1000ms） | TC-E02-100~102 / TC-E02-109 | 不需 mock；比對方向（>`請求時間戳`）即可，不需精確計時 |
| JWT 簽章驗證 | TC-AUTH-205（legacy JWT） | 須用合法 keypair 產生「無 e07_role claim」的舊 JWT；建議加入 JWT factory helper |
| SalesManagerGuard 舊邏輯 | TC-ORTHO-403 | 確認 F050+ controller 仍使用 SalesManagerGuard（對照 memory feedback_e07_controllers_use_sales_manager_guard.md） |

---

## 七、開放問題（Pending）

| ID | 問題 | 影響場景 | 責任方 |
|----|------|---------|--------|
| OQ-E02-001 | 冪等性：PATCH e07_role 傳入相同值時，password_changed_at 是否更新？audit_log 是否寫入？ | TC-E02-103 | PO / spec-writer（F073 v1.2） |
| OQ-E02-002 | admin 對自身帳號設定 e07_role 是否允許？（建議允許，理由：admin 自動視為 director，無功能差異） | TC-E02-107 | PO |
| OQ-E02-003 | TC-AUTH-202：login 後 e07_role=null 帳號的 JWT payload，應含 `e07_role: null` key，還是完全不含 key？影響 Guard 的 null 判斷實作 | TC-AUTH-202 / TC-AUTH-205 | system-architect / spec-writer（F002 v1.4 補充） |
| OQ-E02-004 | TC-GUARD-306（SectionChiefGuard + e07_role=director）：並任場景中若 controller 套的是 SectionChiefGuard（而非 SectionChiefOrAboveGuard），director 應是通過還是拒絕？需確認 Guard 組合設計 | TC-GUARD-306 / TC-GUARD-315 | system-architect（architecture-spec §3.10） |
