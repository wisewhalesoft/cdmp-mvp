---
type: test-design-feature
feature_id: F073-F074-E02
feature_name: E07 角色指派 E02 整合測試（PATCH /accounts/:id/business-role、Guard、JWT payload、合併約束、遷移驗證）
priority: P0-MVP
related_spec: >
  /docs/specs/features/F073-define-director-role.md §5.4
  /docs/specs/features/F074-define-section-chief-role.md §5.4
  /docs/specs/features/F002-user-login.md §4.6
  /docs/specs/architecture-spec.md §3.10 AD-E07 v3.0
  /docs/specs/error-handling.md #assignment-errors
  /docs/specs/features/F006-edit-account.md BR-9
last_updated: 2026-05-16
version: "2.0"
changelog: >
  v2.0（2026-05-16）：business_role 合併重構對齊 AD-E07 v3.0。
  移除：TC-ORTHO-400~407（正交維度 section，is_sales_manager 已廢棄）。
  Rename：TC-E02-100~108 → endpoint /business-role；TC-AUTH-200~205 → claim businessRole；TC-GUARD 移除 SalesManagerGuard 相關場景。
  新增：TC-MERGED（合併互斥約束，10 場景）、TC-MIG（m14 遷移，8 場景）、TC-LEGACY（legacy JWT，5 場景）、TC-DEPRECATED（廢棄端點，5 場景）。
  v1.0（2026-05-16）：初版 43 場景。
---

# F073-F074 E02 整合測試 — 測試設計（v2.0）

> **範圍說明**：本文件涵蓋 E07 重構（AD-E07 v3.0）後新端點（PATCH `/api/v1/accounts/:id/business-role`）、JWT payload `businessRole` claim、新增 Guard（DirectorOrAdminGuard / SectionChiefOrAboveGuard 及其組合）、business_role 合併互斥約束、m14 資料庫遷移、legacy JWT 相容性、廢棄端點 regression 的全部測試設計。E07 模組內部功能（M01~M06）由各 Feature 測試文件負責。

> **重構摘要（AD-E07 v3.0）**：`is_sales_manager`（boolean）與 `e07_role`（enum）合併為單一 `business_role` enum 欄位，值域 `['director', 'section_chief']`，NULL 代表一般業務員；SalesManagerGuard 廢棄；PATCH `/accounts/:id/e07-role` 端點廢棄；PATCH `/accounts/:id/sales-manager-flag` 端點廢棄。

---

## 一、PATCH /accounts/:id/business-role 端點測試（TC-E02-100 ~ TC-E02-115）

### Acceptance Test Design

#### AC-E02-1：admin 成功指派 director 並觸發 token revoke

| 項目 | 內容 |
|------|------|
| Given | admin 已登入；目標帳號 `USER_BIZ_NULL`（business_role=null）存在 |
| When | PATCH `/api/v1/accounts/:id/business-role` body: `{"businessRole":"director"}` |
| Then | HTTP 200；DB `users.business_role = 'director'`；`users.password_changed_at` 更新（> 請求時間戳）；`assignment_audit_log` 含 `action='ASSIGN_ROLE'`、`entity_type='business_role'`、`entity_id='{userId}|director'`；舊 JWT 下次請求回 401 AUTH_TOKEN_REVOKED |

#### AC-E02-2：冪等性（相同值重複 PATCH）

| 項目 | 內容 |
|------|------|
| Given | 目標帳號已為 `business_role='director'` |
| When | 再次 PATCH `{"businessRole":"director"}` |
| Then | HTTP 200；`password_changed_at` **不**更新；`assignment_audit_log` **不**新增 |

> **OQ-E02-001（Pending）**：冪等性行為（password_changed_at 是否更新、audit_log 是否寫入）需 spec-writer 在 F073 v1.2 明確化。目前假設「值未改變 → 不更新 / 不寫」，待確認後可調整 TC-E02-103。

#### AC-E02-3：DTO 白名單過濾（BR-9 regression）

| 項目 | 內容 |
|------|------|
| Given | 目標帳號 `business_role='director'` |
| When | PUT `/api/accounts/:id` body 含 `business_role: "section_chief"` |
| Then | HTTP 200（正常更新 name/email）；DB `business_role` 仍為 `'director'`（PUT endpoint DTO 不含此欄位） |

---

### Happy Path 測試場景

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TC-E02-100 | admin 設定 user 為 director | F073 §5.4.1 / AC-7 | Integration | 目標帳號 `USER_BIZ_NULL` 存在，admin JWT 有效 | 1. PATCH `/api/v1/accounts/:id/business-role` `{"businessRole":"director"}` | HTTP 200；DB `business_role='director'`；`password_changed_at` 已更新（> 請求時間戳）；回應含 `businessRole` 與 `password_changed_at` 欄位 |
| TC-E02-101 | admin 設定 user 為 section_chief | F074 §5.4 / AC-7 | Integration | 目標帳號 `USER_BIZ_NULL` 存在 | 1. PATCH `/api/v1/accounts/:id/business-role` `{"businessRole":"section_chief"}` | HTTP 200；DB `business_role='section_chief'`；`password_changed_at` 已更新 |
| TC-E02-102 | admin 清除 business_role（設為 null） | F073 AC-7 / F074 AC-7 | Integration | 目標帳號目前 `business_role='director'` | 1. PATCH `/api/v1/accounts/:id/business-role` `{"businessRole":null}` | HTTP 200；DB `business_role=NULL`；`password_changed_at` 已更新；audit_log 含 `action='REVOKE_ROLE'`、`before_value.business_role='director'` |
| TC-E02-103 | admin 設定相同值（冪等） | OQ-E02-001 | Integration | 目標帳號 `business_role='director'` | 1. PATCH `{"businessRole":"director"}` | HTTP 200；DB `business_role` 未變；待 OQ-E02-001 確認 password_changed_at / audit_log 行為 |

---

### Negative / Error 測試場景

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TC-E02-104 | 傳入非允許值 | F073 §5.3 | Negative | admin JWT 有效，目標帳號存在 | 1. PATCH `{"businessRole":"manager"}` | HTTP 422；錯誤碼 `ACCOUNT_BUSINESS_ROLE_INVALID` |
| TC-E02-105 | 非 admin 呼叫 | F073 §5.4.1 / §5.3 | Negative | role=user JWT（非 admin）有效 | 1. 以 user JWT 呼叫 PATCH | HTTP 403；錯誤碼 `ACCOUNT_BUSINESS_ROLE_FORBIDDEN` |
| TC-E02-106 | 未登入呼叫 | F073 §5.3 | Negative | 無 Authorization header | 1. 呼叫 PATCH，無 JWT | HTTP 401；錯誤碼 `AUTH_TOKEN_MISSING` 或 `AUTH_TOKEN_INVALID` |
| TC-E02-107 | admin 對自身帳號設定 business_role | OQ-E02-002（Pending） | Negative / Edge | admin 對 `req.user.id == :id` 呼叫 PATCH | 1. admin PATCH 自身帳號 | **OQ-E02-002**：spec 未明確定義自設行為。建議允許（回 200），因 admin 自動繼承 Director 語意，設與不設無功能差異。待 PO 確認後調整 |
| TC-E02-108 | DTO 缺 businessRole 欄位 | F073 §5.4.1 驗證規則 | Negative | admin JWT 有效 | 1. PATCH `{}` | HTTP 400；錯誤碼 `VALIDATION_FAILED`（`businessRole` 為必填欄位） |
| TC-E02-108B | 目標帳號不存在 | F073 §5.4.1 驗證規則 | Negative | 傳入不存在的 user ID | 1. PATCH `/api/v1/accounts/nonexistent-id/business-role` | HTTP 404；錯誤碼 `ACCOUNT_NOT_FOUND` |

---

### Token Revoke 整合驗證

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TC-E02-109 | PATCH 成功後舊 JWT 失效 | F073 §5.4.2 / AC-7 | Integration | 目標帳號持有有效 JWT（舊 token），admin 對其執行 PATCH `business_role` 變更 | 1. 記錄目標帳號舊 JWT<br>2. admin 執行 PATCH（任意值變更）<br>3. 立即以舊 JWT 呼叫 GET /api/v1/auth/me | HTTP 401；錯誤碼 `AUTH_TOKEN_REVOKED`（password_changed_at 比對機制） |
| TC-E02-110 | PATCH 成功後重新登入取得新 JWT 含 businessRole claim | F002 §4.6 / F073 §5.4.2 | Integration | 目標帳號被設為 `business_role='director'` | 1. 目標帳號重新登入（POST /auth/login）<br>2. decode 新 JWT payload | JWT payload 含 `businessRole: 'director'` claim（非 undefined） |

---

### BR-9 PUT /accounts/:id 隔離驗證（Regression）

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TC-E02-111 | PUT body 含 business_role 應被忽略 | F006 BR-9 / F073 BR-9 | Regression | 目標帳號 `business_role='director'` | 1. PUT `/api/accounts/:id` `{name:"X", email:"x@test.com", business_role:"section_chief"}` | HTTP 200；GET 確認 DB `business_role` 仍為 `'director'`（PUT DTO 無此欄位，後端忽略） |
| TC-E02-112 | PUT 正常更新 name/email 不影響 business_role | F006 BR-9 | Regression | 目標帳號 `business_role='section_chief'` | 1. PUT `/api/accounts/:id` `{name:"New Name", email:"new@test.com"}` | HTTP 200；GET 確認 `business_role` 仍為 `'section_chief'` |

---

## 二、JWT Payload 含 businessRole（TC-AUTH-200 ~ TC-AUTH-205）

### Acceptance Test Design

#### AC-AUTH-1：login 後 JWT payload 含最新 businessRole claim

| 項目 | 內容 |
|------|------|
| Given | 帳號已設定 `business_role` 值（director / section_chief / null） |
| When | POST `/api/auth/login` 以正確憑證登入 |
| Then | 回應含 JWT；decode JWT payload，`businessRole` claim 存在且值正確 |

#### AC-AUTH-2：refresh token 後新 JWT 含最新 businessRole

| 項目 | 內容 |
|------|------|
| Given | 帳號 access token 期間 admin 對其 business_role 執行 PATCH 變更（導致舊 access token 失效） |
| When | 帳號以 refresh token 取得新 access token |
| Then | 新 JWT payload 之 `businessRole` claim 反映最新值 |

#### AC-AUTH-3：legacy JWT 相容性

| 項目 | 內容 |
|------|------|
| Given | 存在一個舊 JWT（無 businessRole claim，對應 business_role 欄位加入前發出的 token） |
| When | 以此 legacy JWT 呼叫 E07 Guard 保護的 API |
| Then | Guard 視 `businessRole` 為 null（不因 claim 不存在而拋出 500）；若帳號無 admin，回 403 E07_ROLE_NOT_ASSIGNED |

---

### 測試場景

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TC-AUTH-200 | login 後 JWT decode 含 businessRole=director | F002 §4.6 | Unit / Integration | `USER_DIRECTOR` 種子帳號（business_role='director'）存在 | 1. POST /auth/login<br>2. base64url decode JWT payload | payload.businessRole === 'director' |
| TC-AUTH-201 | login 後 JWT decode 含 businessRole=section_chief | F002 §4.6 | Unit / Integration | `USER_SECTION_CHIEF` 種子帳號（business_role='section_chief'）存在 | 同上 | payload.businessRole === 'section_chief' |
| TC-AUTH-202 | login 後 JWT decode 含 businessRole=null | F002 §4.6 | Unit / Integration | 一般 user 帳號（business_role=null）存在 | 同上 | payload.businessRole === null 或 payload 無 businessRole key（Guard 兩種均視為 null） |
| TC-AUTH-203 | AuthGuard 解析後 req.user.businessRole 正確暴露 | F002 §4.6 / architecture-spec §3.10 AD-E07 v3.0 | Unit（Guard 單元） | mock JWT payload 含 `businessRole:'director'` | 1. 以含 businessRole claim 的 JWT 呼叫受保護端點<br>2. 在 Guard 中攔截 req.user 物件 | req.user.businessRole === 'director' |
| TC-AUTH-204 | refresh token 後新 JWT 含最新 businessRole | F073 §5.4.2 | Integration | 帳號已取得 refresh token；之後 admin PATCH 其 business_role 為 director | 1. access token 失效後以 refresh token 換新<br>2. decode 新 JWT | 新 JWT payload.businessRole === 'director'（非舊值） |
| TC-AUTH-205 | legacy JWT（無 businessRole claim）→ Guard 視為 null | F073 BR-11 / AD-E07 v3.0 | Boundary（Security） | 手工偽造一個無 businessRole key 的 JWT（合法 keypair 簽章） | 1. 以 legacy JWT 呼叫 DirectorOrAdminGuard 保護端點（帳號 role=user） | HTTP 403 E07_ROLE_NOT_ASSIGNED（Guard 不崩潰；null businessRole 不通過 Guard）|

---

## 三、DirectorOrAdminGuard / SectionChiefOrAboveGuard 單元測試（TC-GUARD-300 ~ TC-GUARD-315）

> **重構對齊說明（AD-E07 v3.0）**：SalesManagerGuard 已廢棄，不再測試。Guard 名稱更新：DirectorGuard → DirectorOrAdminGuard；SectionChiefGuard → SectionChiefOrAboveGuard（亦允許 director + admin）。Guard 唯一讀取欄位為 `business_role`（`req.user.businessRole`）。

### 測試場景

#### DirectorOrAdminGuard（TC-GUARD-300 ~ TC-GUARD-304）

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TC-GUARD-300 | DirectorOrAdminGuard：businessRole='director' → 通過 | F073 §5.2 | Unit | mock req.user: `{role:'user', businessRole:'director'}` | 1. 呼叫 DirectorOrAdminGuard.canActivate() | canActivate() === true |
| TC-GUARD-301 | DirectorOrAdminGuard：businessRole='section_chief' → 拒絕 | F073 §5.2 | Unit | mock req.user: `{role:'user', businessRole:'section_chief'}` | 同上 | canActivate() === false（拋 ForbiddenException E07_REQUIRES_DIRECTOR） |
| TC-GUARD-302 | DirectorOrAdminGuard：businessRole=null → 拒絕 | F073 §5.2 | Unit | mock req.user: `{role:'user', businessRole:null}` | 同上 | canActivate() === false |
| TC-GUARD-303 | DirectorOrAdminGuard：role='admin' 自動通過（BR-2） | F073 BR-2 / §5.2 | Unit | mock req.user: `{role:'admin', businessRole:null}` | 同上 | canActivate() === true（admin 無需 director claim） |
| TC-GUARD-304 | DirectorOrAdminGuard：businessRole 欄位不存在（undefined） → 拒絕 | AD-E07 v3.0 legacy 相容 | Unit | mock req.user: `{role:'user'}` （無 businessRole 鍵） | 同上 | canActivate() === false（undefined 視同 null，不拋 500） |

#### SectionChiefOrAboveGuard（TC-GUARD-305 ~ TC-GUARD-309）

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TC-GUARD-305 | SectionChiefOrAboveGuard：businessRole='section_chief' → 通過 | F074 §5.2 | Unit | mock req.user: `{role:'user', businessRole:'section_chief'}` | 1. SectionChiefOrAboveGuard.canActivate() | true |
| TC-GUARD-306 | SectionChiefOrAboveGuard：businessRole='director' → 通過（director 高於 section_chief） | F074 §5.2 / AD-E07 v3.0 | Unit | mock req.user: `{role:'user', businessRole:'director'}` | 同上 | true（SectionChiefOrAboveGuard 允許 director 及以上） |
| TC-GUARD-307 | SectionChiefOrAboveGuard：businessRole=null → 拒絕 | F074 §5.2 | Unit | mock req.user: `{role:'user', businessRole:null}` | 同上 | false |
| TC-GUARD-308 | SectionChiefOrAboveGuard：role='admin' → 通過（admin 繼承） | F073 BR-2 | Unit | mock req.user: `{role:'admin', businessRole:null}` | 同上 | true（admin 視為 director，高於 section_chief） |
| TC-GUARD-309 | SectionChiefOrAboveGuard：businessRole 欄位不存在（undefined） → 拒絕 | AD-E07 v3.0 legacy 相容 | Unit | mock req.user: `{role:'user'}` （無 businessRole 鍵） | 同上 | false（不拋 500） |

#### SectionChiefScopeGuard（TC-GUARD-310 ~ TC-GUARD-311）

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TC-GUARD-310 | SectionChiefScopeGuard：GET 請求不攔截 | architecture-spec §3.10 AD-E07 v3.0 決議 | Unit | mock req.method='GET', req.user: section_chief | 1. SectionChiefScopeGuard.canActivate() | true（GET 不檢查 created_by 欄位轄區）|
| TC-GUARD-311 | SectionChiefScopeGuard：PUT 他人轄區 → 403 | F074 AC-3 / §5.2 | Integration | businessRole='section_chief' 帳號 A；PUT target 記錄之 `created_by` 等於帳號 B | 1. 以帳號 A JWT 對屬於帳號 B 的記錄執行 PUT | HTTP 403；錯誤碼 `E07_FORBIDDEN_SECTION_CHIEF_SCOPE` |

#### 組合 Guard 整合（TC-GUARD-312 ~ TC-GUARD-315）

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TC-GUARD-312 | DirectorOrAdminGuard：role=admin → true | F073 BR-2 | Unit | mock req.user: `{role:'admin', businessRole:null}` | canActivate() | true |
| TC-GUARD-313 | DirectorOrAdminGuard：businessRole=director → true | F073 §5.2 | Unit | mock req.user: `{role:'user', businessRole:'director'}` | canActivate() | true |
| TC-GUARD-314 | DirectorOrAdminGuard：businessRole=section_chief → false | F073 AC-6 | Unit | mock req.user: `{role:'user', businessRole:'section_chief'}` | canActivate() | false（處長無法通過部長專屬 Guard） |
| TC-GUARD-315 | SectionChiefOrAboveGuard：全部允許身份 → true；其他 → false | F073 AC-5 / F074 §5.2 | Unit | 測試三組：director / section_chief / admin（全為 true）；role=user + businessRole=null（false） | canActivate() 四次 | director/section_chief/admin 全回 true；無 business_role 回 false |

---

## 四、business_role 合併互斥約束測試（TC-MERGED-001 ~ TC-MERGED-010）

### Acceptance Test Design

#### AC-MERGED-1：business_role 為單一 enum 值，互斥保證

| 項目 | 內容 |
|------|------|
| Given | 任何 user |
| When | PATCH /business-role 成功 |
| Then | DB `users.business_role` 欄位只含 `'director'`、`'section_chief'` 或 NULL，不存在複合值；前端無需雙欄位管理 |

#### AC-MERGED-2：admin 不受 business_role 限制（自動視為 director）

| 項目 | 內容 |
|------|------|
| Given | role=admin 的帳號，business_role=null |
| When | 呼叫 E07 任何端點 |
| Then | admin 自動通過所有 DirectorOrAdminGuard；不需設定 business_role |

---

### 測試場景

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TC-MERGED-001 | PATCH /business-role 設 director → 成功 + password_changed_at 更新 | AD-E07 v3.0 / F073 §5.4.1 | Integration | 目標帳號 `USER_BIZ_NULL`（business_role=null）存在，admin JWT 有效 | 1. PATCH `/api/v1/accounts/:id/business-role` `{"businessRole":"director"}` | HTTP 200；DB business_role='director'；password_changed_at > 請求前時間戳；audit_log 寫入 |
| TC-MERGED-002 | PATCH /business-role 設 section_chief → 成功 | AD-E07 v3.0 / F074 §5.4 | Integration | 目標帳號 `USER_BIZ_NULL` 存在 | 1. PATCH `{"businessRole":"section_chief"}` | HTTP 200；DB business_role='section_chief'；password_changed_at 已更新 |
| TC-MERGED-003 | PATCH /business-role 設 null → 成功（降為一般業務員） | AD-E07 v3.0 | Integration | 目標帳號 business_role='director' | 1. PATCH `{"businessRole":null}` | HTTP 200；DB business_role=NULL；audit_log action='REVOKE_ROLE' |
| TC-MERGED-004 | PATCH /business-role 傳入 'manager' → 422 ACCOUNT_BUSINESS_ROLE_INVALID | AD-E07 v3.0 / DB CHECK constraint | Negative | admin JWT 有效 | 1. PATCH `{"businessRole":"manager"}` | HTTP 422；錯誤碼 `ACCOUNT_BUSINESS_ROLE_INVALID`；DB 值不變 |
| TC-MERGED-005 | admin user 嘗試設定自身 business_role | OQ-E02-002 / AD-E07 v3.0 | Edge | admin 對 req.user.id == :id 呼叫 PATCH | 1. admin PATCH 自身帳號 `{"businessRole":"director"}` | 待 OQ-E02-002 確認；建議 HTTP 200（admin 語意等同 director，操作無害）或 422 ACCOUNT_ADMIN_CANNOT_SET_ROLE |
| TC-MERGED-006 | DB CHECK constraint 阻擋直接 INSERT 非法 business_role 值 | AD-E07 v3.0 DB schema | DB Layer | 直接對 users 表執行 INSERT，business_role='manager' | 1. SQL INSERT users (..., business_role) VALUES (..., 'manager') | DB 拋出 CHECK constraint 違反錯誤；INSERT 失敗（DBA 層保護，防應用層繞過） |
| TC-MERGED-007 | admin 不需 business_role 即可進入 E07 全功能（自動視為 director） | F073 BR-2 / AD-E07 v3.0 | Integration | role=admin 帳號，business_role=null；E07 部長專屬端點（DirectorOrAdminGuard） | 1. 以 admin JWT 呼叫 E07 部長專屬端點 | HTTP 200（admin bypass，不要求 businessRole='director'） |
| TC-MERGED-008 | director user 進入 E07 全功能 → 成功 | F073 §5.2 / AD-E07 v3.0 | Integration | businessRole='director' JWT；E07 部長專屬端點 | 1. 以 director JWT 呼叫部長專屬端點 | HTTP 200 |
| TC-MERGED-009 | section_chief user 進入部長專屬功能 → 403 E07_REQUIRES_DIRECTOR | F073 AC-6 / AD-E07 v3.0 | Integration | businessRole='section_chief' JWT；E07 部長專屬端點（DirectorOrAdminGuard） | 1. 以 section_chief JWT 呼叫部長專屬端點 | HTTP 403；錯誤碼 `E07_REQUIRES_DIRECTOR` |
| TC-MERGED-010 | section_chief 進入本轄區功能 → 成功；進入他人轄區 → 403 | F074 AC-3 / AD-E07 v3.0 | Integration | businessRole='section_chief' 帳號 A；本轄區記錄 created_by=A；他轄區記錄 created_by=B | 1. PUT 本轄區記錄（200）<br>2. PUT 他轄區記錄（403） | 本轄區 HTTP 200；他轄區 HTTP 403 `E07_FORBIDDEN_SECTION_CHIEF_SCOPE` |

---

## 五、m14 資料庫遷移測試（TC-MIG-m14-001 ~ TC-MIG-m14-008）

### Acceptance Test Design

#### AC-MIG-1：m14 正確新增 business_role 欄位並移除舊欄位

| 項目 | 內容 |
|------|------|
| Given | 資料庫處於 m13 狀態（含 is_sales_manager、e07_role 欄位） |
| When | 執行 m14 migration up() |
| Then | `users.business_role` 欄位存在，型別為 enum('director','section_chief')，允許 NULL；`users.is_sales_manager` 欄位不存在；`users.e07_role` 欄位不存在 |

---

### 測試場景

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TC-MIG-m14-001 | m14 ADD business_role 欄位 + CHECK constraint | AD-E07 v3.0 DB schema | Integration（Migration） | DB 處於 m13 狀態 | 1. 執行 m14 up()<br>2. 查詢 information_schema.columns | business_role 欄位存在；型別為 enum 或 varchar with CHECK；允許 NULL；CHECK 約束限制值域為 ['director','section_chief'] |
| TC-MIG-m14-002 | m14 DROP is_sales_manager 欄位 | AD-E07 v3.0 | Integration（Migration） | m14 已執行 | 1. 查詢 information_schema.columns | is_sales_manager 欄位不存在於 users 表 |
| TC-MIG-m14-003 | m14 DROP e07_role 欄位（若存在） | AD-E07 v3.0 | Integration（Migration） | m14 已執行 | 1. 查詢 information_schema.columns | e07_role 欄位不存在於 users 表 |
| TC-MIG-m14-004 | 既有 is_sales_manager=true 的 user 遷移後 business_role=NULL | AD-E07 v3.0 遷移策略 | Integration（Migration） | m13 狀態下存在 is_sales_manager=true 的 user seed | 1. 執行 m14 up()<br>2. 查詢該 user 的 business_role | business_role=NULL（舊旗標不自動對應至 director；需 admin 手動補設） |
| TC-MIG-m14-005 | admin 後續補設 is_sales_manager=true 使用者為 director 流程 | AD-E07 v3.0 遷移策略 | Integration | m14 執行後；目標 user business_role=NULL | 1. admin PATCH /business-role `{"businessRole":"director"}`<br>2. 確認 DB 與 audit_log | HTTP 200；business_role='director'；audit_log 記錄 action='ASSIGN_ROLE' |
| TC-MIG-m14-006 | m14 執行後新建立 user 預設 business_role=NULL | AD-E07 v3.0 | Integration | m14 已執行 | 1. POST /accounts 建立新 user<br>2. GET 該 user | response.businessRole === null；DB business_role=NULL |
| TC-MIG-m14-007 | m14 與 m01~m13 並存不衝突（全量 migrate） | AD-E07 v3.0 | Integration（Migration） | 空資料庫 | 1. 執行 migrate:latest（含 m01 至 m14）<br>2. 確認所有 migration 狀態 | 全部 migration 標記為 applied；無錯誤 |
| TC-MIG-m14-008 | m14 rollback（down() 邏輯） | AD-E07 v3.0 | Integration（Migration） | m14 已執行 | 1. 執行 m14 down()<br>2. 查詢 schema | business_role 欄位不存在；is_sales_manager 欄位復原（若 down() 有實作復原邏輯）；或確認 down() 為 no-op 並記錄為已知限制 |

---

## 六、Legacy JWT 相容性測試（TC-LEGACY-001 ~ TC-LEGACY-005）

### Acceptance Test Design

#### AC-LEGACY-1：無 businessRole claim 的 legacy token 不崩潰系統

| 項目 | 內容 |
|------|------|
| Given | 舊 JWT（business_role 欄位加入前簽發，無 businessRole claim） |
| When | 以此 token 呼叫任何受保護端點 |
| Then | AuthGuard 正常解析，req.user.businessRole = undefined 或 null；不拋出 500；Guard 視其為無業務角色 |

---

### 測試場景

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TC-LEGACY-001 | 無 businessRole claim 的 legacy JWT → AuthGuard 解析後 req.user.businessRole = null | AD-E07 v3.0 / F073 BR-11 | Unit（Guard 單元） | 用合法 keypair 產生無 businessRole key 的 JWT（有效簽章） | 1. 以 legacy JWT 呼叫 GET /auth/me<br>2. 在 Guard 攔截 req.user | req.user.businessRole === null 或 undefined（不拋 500）；HTTP 200 if admin，HTTP 200 if user（/auth/me 無 business_role Guard） |
| TC-LEGACY-002 | legacy JWT 進入 E07 端點（DirectorOrAdminGuard） → 403 E07_ROLE_NOT_ASSIGNED | AD-E07 v3.0 | Integration | legacy JWT，帳號 role=user | 1. 以 legacy JWT 呼叫 E07 部長專屬端點 | HTTP 403；錯誤碼 `E07_ROLE_NOT_ASSIGNED`（null businessRole 不通過 DirectorOrAdminGuard） |
| TC-LEGACY-003 | legacy JWT，帳號 role=admin → 仍允許進入 E07 端點 | F073 BR-2 / AD-E07 v3.0 | Integration | legacy JWT，帳號 role=admin | 1. 以 legacy admin JWT 呼叫 E07 部長專屬端點 | HTTP 200（admin bypass 不依賴 businessRole claim） |
| TC-LEGACY-004 | refresh token 後新 JWT 含正確 businessRole claim（雙寫機制） | AD-E07 v3.0 / F073 §5.4.2 | Integration | 帳號已取得 refresh token；access token 期間 PATCH business_role='director' | 1. 以 refresh token 換取新 access token<br>2. decode 新 JWT payload | payload.businessRole === 'director'（refresh 後自動帶入最新值） |
| TC-LEGACY-005 | legacy JWT 過期 → 401 AUTH_TOKEN_EXPIRED（非 LEGACY 特殊處理） | F002 §4.5 | Negative | 過期的 legacy JWT（exp 已超過） | 1. 以過期 legacy JWT 呼叫任何端點 | HTTP 401；錯誤碼 `AUTH_TOKEN_EXPIRED`（不因無 businessRole claim 回 502/500） |

---

## 七、廢棄端點 Regression 測試（TC-DEPRECATED-001 ~ TC-DEPRECATED-005）

### Acceptance Test Design

#### AC-DEPRECATED-1：廢棄端點完全移除，不留任何 route

| 項目 | 內容 |
|------|------|
| Given | AD-E07 v3.0 重構後 |
| When | 呼叫任何已廢棄端點 |
| Then | HTTP 404 ROUTE_NOT_FOUND（端點不存在，非 403 或 405） |

---

### 測試場景

| ID | Scenario | Related Req | Test Type | Preconditions | Steps | Expected Result |
|----|----------|------------|-----------|---------------|-------|-----------------|
| TC-DEPRECATED-001 | PATCH /accounts/:id/sales-manager-flag → 404 ROUTE_NOT_FOUND | AD-E07 v3.0 廢棄 | Regression | admin JWT 有效；任意 user ID | 1. PATCH `/api/v1/accounts/:id/sales-manager-flag` | HTTP 404；錯誤碼 `ROUTE_NOT_FOUND` 或 NestJS 預設 404 |
| TC-DEPRECATED-002 | PATCH /accounts/:id/e07-role → 404 ROUTE_NOT_FOUND | AD-E07 v3.0 廢棄 | Regression | admin JWT 有效；任意 user ID | 1. PATCH `/api/v1/accounts/:id/e07-role` | HTTP 404；錯誤碼 `ROUTE_NOT_FOUND` |
| TC-DEPRECATED-003 | 程式碼 grep SalesManagerGuard 在 src/ → 0 結果（regression guard） | AD-E07 v3.0 廢棄 | Static Analysis | src/ 目錄為最新版本 | 1. grep -r "SalesManagerGuard" apps/api/src/ | 結果為 0 行（SalesManagerGuard class 不存在於 src/ 下任何檔案） |
| TC-DEPRECATED-004 | 程式碼 grep is_sales_manager 在 src/ → 0 結果 | AD-E07 v3.0 廢棄 | Static Analysis | src/ 目錄為最新版本 | 1. grep -r "is_sales_manager" apps/api/src/ | 結果為 0 行（migration 檔除外；需設計 exclusion pattern） |
| TC-DEPRECATED-005 | 程式碼 grep e07_role 在 src/ → 0 結果 | AD-E07 v3.0 廢棄 | Static Analysis | src/ 目錄為最新版本 | 1. grep -r "e07_role" apps/api/src/ | 結果為 0 行（migration 檔及 test/fixtures 除外；需設計 exclusion pattern）|

> **Static Analysis 測試說明**：TC-DEPRECATED-003~005 為 regression guard test，建議實作為 Jest 單元測試，在測試套件中呼叫 Node.js `child_process.execSync('grep ...')` 並斷言 stdout 長度 === 0。此類測試不依賴 DB，可納入 CI 快速通道。exclusion pattern 需排除 `/migrations/` 及 `/test/fixtures/` 目錄。

---

## 八、測試資料需求（Fixture）

### 種子帳號規劃（v2.0 更新）

建議在 `apps/api/test/fixtures/users.fixture.ts` 擴充以下 builder 函式（設計層定義，不寫實作程式碼）：

| Fixture 名稱 | role | business_role | 用途 |
|------------|------|---------------|------|
| `buildAdminUser()` | admin | null | TC-E02-10x 呼叫者身份；TC-GUARD-303 / TC-GUARD-308 / TC-MERGED-007 admin bypass |
| `buildDirectorUser()` | user | **'director'** | TC-AUTH-200 / TC-GUARD-300 / TC-MERGED-008 部長功能全通過 |
| `buildSectionChiefUser()` | user | **'section_chief'** | TC-AUTH-201 / TC-GUARD-305 / TC-MERGED-010 轄區驗證 |
| `buildRegularUser()` | user | null | TC-E02-105 / TC-GUARD-302 / TC-MERGED-009 無業務角色 |
| `buildLegacyUser()` | user | null（JWT 無 businessRole key） | TC-LEGACY-001~005 legacy JWT 相容性測試；用 JWT factory 產生無 businessRole claim 的合法 token |

### 移除舊 Fixture

| 移除的 Fixture | 原因 |
|--------------|------|
| `buildUserWithSalesManagerFlag()` | is_sales_manager 已廢棄，無對應欄位 |
| `buildUserAsDirector()` | 重命名為 `buildDirectorUser()`（語意一致） |
| `buildUserAsSectionChief()` | 重命名為 `buildSectionChiefUser()`（語意一致） |
| `buildUserOrthogonalSectionChief()` | 正交維度已廢棄（is_sales_manager 移除，正交不再有意義） |
| `buildUserAsBusinessman()` | 重命名為 `buildRegularUser()`（語意更清晰） |
| `buildUserE07Null()` | 合併至 `buildRegularUser()`（語意重疊） |

> **Fixture 注意事項**：
> - `buildLegacyUser()` 不需 DB 欄位差異，僅需 JWT factory 在產生 token 時**省略** businessRole key；用於驗證 Guard 的 undefined 處理路徑
> - TC-MIG-m14-004 的種子資料需在 m13 狀態下建立，包含 is_sales_manager=true 的記錄；此 fixture 與其他 fixture 分開，僅用於 migration 測試套件

### DB Transaction 驗證注意

TC-E02-100~102 / TC-MERGED-001~003 的 DB 驗證（`business_role` + `password_changed_at` + `assignment_audit_log` 三欄位）須在同一測試斷言中驗證，確認 transaction 原子性：任一欄位更新失敗時，其他欄位亦回滾。

---

## 九、自動化就緒度評估（v2.0）

| 類別 | 場景數 | 自動化評估 |
|------|--------|-----------|
| PATCH /business-role 端點 API Integration | 13（TC-E02-100~112） | 完全自動化；需 test DB seed + cleanup |
| JWT payload 驗證 | 6（TC-AUTH-200~205） | 完全自動化；TC-AUTH-205 需 JWT factory helper |
| Guard 單元測試 | 16（TC-GUARD-300~315） | 完全自動化；純單元測試，無 DB 依賴 |
| 合併互斥約束 | 10（TC-MERGED-001~010） | 完全自動化；TC-MERGED-006 為 DB 層直接 SQL 測試 |
| m14 遷移測試 | 8（TC-MIG-m14-001~008） | 完全自動化；需獨立 migration test suite（隔離 schema 狀態） |
| Legacy JWT 相容性 | 5（TC-LEGACY-001~005） | 完全自動化；TC-LEGACY-001~004 需 JWT factory |
| 廢棄端點 Regression | 5（TC-DEPRECATED-001~005） | 完全自動化；TC-DEPRECATED-003~005 為 Static Analysis（grep，CI 快速通道） |
| **合計** | **63** | |

### 環境依賴

| 依賴項 | 影響場景 | Mock 策略 |
|--------|---------|-----------|
| DB（users + assignment_audit_log） | TC-E02-100~112 / TC-MERGED-001~006 | Test DB seed + after each cleanup |
| DB schema（migration 測試） | TC-MIG-m14-001~008 | 獨立 migration test DB，up/down 前後 schema 驗證 |
| 時鐘（password_changed_at） | TC-E02-100~102 / TC-MERGED-001~003 | 比對方向（> 請求時間戳），不需精確 mock |
| JWT 簽章驗證（legacy JWT） | TC-AUTH-205 / TC-LEGACY-001~004 | 合法 keypair 產生「無 businessRole claim」的舊 JWT；建議加入 JWT factory helper |
| Static Analysis（grep） | TC-DEPRECATED-003~005 | Node.js child_process.execSync；CI 快速通道，不需 DB |

---

## 十、開放問題（Pending）

| ID | 問題 | 影響場景 | 責任方 |
|----|------|---------|--------|
| OQ-E02-001 | 冪等性：PATCH /business-role 傳入相同值時，password_changed_at 是否更新？audit_log 是否寫入？ | TC-E02-103 | PO / spec-writer（F073 v1.2） |
| OQ-E02-002 | admin 對自身帳號設定 business_role 是否允許？（建議允許，理由：admin 自動視為 director，無功能差異）| TC-E02-107 / TC-MERGED-005 | PO |
| OQ-E02-003 | login 後 business_role=null 帳號的 JWT payload，應含 `businessRole: null` key，還是完全不含 key？影響 Guard 的 null/undefined 判斷實作 | TC-AUTH-202 / TC-LEGACY-001 | system-architect / spec-writer（F002 v1.4 補充） |
| OQ-E02-004 | SectionChiefOrAboveGuard + businessRole=director：已明確通過（AD-E07 v3.0 確認 director 高於 section_chief）。TC-GUARD-306 已對齊，此 OQ 關閉。 | TC-GUARD-306（已解決） | — |
| OQ-MIG-001 | m14 down() 是否復原 is_sales_manager 與 e07_role 欄位？若不復原（no-op），需在 TC-MIG-m14-008 中明確記錄為已知限制，不視為 bug | TC-MIG-m14-008 | system-architect / DBA |
| OQ-DEPR-001 | TC-DEPRECATED-004 grep is_sales_manager 排除規則：是否需排除 test/fixtures/ 目錄？若舊 fixture 尚未清理，需確認清理時程，避免 CI regression 誤報 | TC-DEPRECATED-004 | TDD Developer / QA |
