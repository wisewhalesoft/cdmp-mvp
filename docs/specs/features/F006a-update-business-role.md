---
spec-id: F006a
title: 變更帳號業務角色（business_role）
feature-id: F006a
source-story: US-014（接續，取代 F008 v3.x 之 sales-manager-flag / e07-role 端點）
epic: E02 — 帳號與角色管理
priority: P0-MVP
version: "1.0"
date: 2026-05-16
status: Draft
---

# F006a: 變更帳號業務角色（business_role）

Priority: P0-MVP | Status: Draft | Last Updated: 2026-05-16

> **v1.0 / 2026-05-16 新建（E07 合併重構 AD-E07 v3.0）**：本 spec 承接 [F008（DEPRECATED v3.x）](F008-assign-change-role.md)之「業務主管旗標切換」與短期過渡 PATCH `/e07-role` 端點之語意，整合為**單一** PATCH `/api/v1/accounts/:id/business-role` 端點，對應 `users.business_role VARCHAR(20) NULL` 欄位（enum：`'director'` / `'section_chief'` / `NULL`，DB CHECK constraint 強制）。本端點為 `business_role` 欄位之**唯一**寫入入口；既有 PUT `/api/accounts/:id`（F006）**不**包含此欄位。

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + `F002-user-login.md` §4.6 + `data-model.md#user-entity` + `error-handling.md#account-errors` + `error-handling.md#auth-errors` |
| QA / Tester | 本文件 + `F002-user-login.md` §4.5 / §4.6 + `error-handling.md#account-errors` |
| UI/UX Designer | 本文件 §6 UI/UX 需求 + `F005-view-account-list.md`（清單入口） |
| Architect | 本文件 + `architecture-spec.md` §3.10 `AccountsService.updateBusinessRole()` |

---

## 1. 功能摘要

提供 Admin 變更指定使用者帳號之業務角色（`users.business_role`）的能力。本端點寫入後同 transaction 觸發 `password_changed_at` 機制（沿用 F009 / F010 既有方案），使該帳號所有舊 JWT 立即失效，迫使其重新登入以獲取新 `businessRole` claim。本端點**獨立**於 PUT `/accounts/:id`（F006）之外，沿用「敏感欄位獨立端點 + 獨立稽核」之 E02 設計慣例（與舊 F008 sales-manager-flag 端點對稱）。

## 2. User Story

**As a** Admin（系統管理者）
**I want** 透過獨立的 PATCH 端點調整任一帳號的業務角色（業務部長 / 業務處長 / 無）
**So that** 我可以依組織異動即時調整 E07 客戶名單分派模組之存取範圍，且該變更立即生效（使舊 JWT 失效，不需等待自然過期）

## 3. 前置條件

- 呼叫者為 Admin（`role = 'admin'`，由現有 `RolesGuard` + `@Roles('admin')` decorator 強制）
- 目標帳號存在於 `users` 表且未被軟刪除
- `users.business_role` 欄位已透過 m14 migration 建立並具備 CHECK constraint

## 4. 驗收標準

### AC-1：Admin 指派業務部長角色

- **Given** Admin 已登入，目標帳號 `users.business_role = NULL`
- **When** Admin 呼叫 PATCH `/api/v1/accounts/:id/business-role` 帶 body `{ "business_role": "director" }`
- **Then** 回 HTTP 200，response 含更新後 account 物件（含 `business_role: 'director'` 與 `password_changed_at` 新時戳）
- **And** `users.business_role` 已更新為 `'director'`
- **And** `users.password_changed_at` 已更新為 `new Date(Date.now() + 1000)`
- **And** 寫入 `assignment_audit_log`（`action = 'ASSIGN_ROLE'`、`entity_type = 'business_role'`、`entity_id = '{userId}|director'`、`before_value = { business_role: null }`、`after_value = { business_role: 'director' }`、`actor_user_id = adminId`）

### AC-2：Admin 指派業務處長角色

- **Given** Admin 已登入，目標帳號 `users.business_role = NULL` 或 `'director'`（覆蓋）
- **When** Admin 呼叫 PATCH 帶 body `{ "business_role": "section_chief" }`
- **Then** 回 HTTP 200，行為同 AC-1（值改為 `'section_chief'`，audit log entity_id 改為 `'{userId}|section_chief'`）
- **And** 若目標帳號原為 `'director'`，audit log `before_value = { business_role: 'director' }`、`after_value = { business_role: 'section_chief' }`

### AC-3：Admin 撤銷業務角色

- **Given** Admin 已登入，目標帳號 `users.business_role IN ('director', 'section_chief')`
- **When** Admin 呼叫 PATCH 帶 body `{ "business_role": null }`（顯式 null）
- **Then** 回 HTTP 200，`users.business_role` 更新為 `NULL`
- **And** `users.password_changed_at` 更新（使舊 JWT 失效）
- **And** 寫入 audit log（`action = 'REVOKE_ROLE'`、`entity_type = 'business_role'`、`entity_id = '{userId}|{oldRole}'`、`before_value = { business_role: oldRole }`、`after_value = { business_role: null }`）
- **And** 該帳號重新登入後新 JWT payload `businessRole = null`，後續呼叫 E07 端點回 403 `E07_ROLE_NOT_ASSIGNED`

### AC-4：值不在允許列表回 422

- **Given** Admin 已登入
- **When** Admin 呼叫 PATCH 帶 body `{ "business_role": "manager" }`（或 `'admin'` / `''` / 數字等非允許值）
- **Then** 回 HTTP 422，錯誤碼 `ACCOUNT_BUSINESS_ROLE_INVALID`
- **And** response `details` 含 `allowedValues: ['director', 'section_chief', null]`
- **And** `users.business_role` **不**變更，audit log **不**寫入

### AC-5：非 Admin 呼叫者回 403

- **Given** 非 Admin 帳號（`role = 'user'`，無論 `business_role` 為何）已登入
- **When** 該帳號呼叫 PATCH `/api/v1/accounts/:id/business-role`
- **Then** 回 HTTP 403，錯誤碼 `AUTH_FORBIDDEN`（沿用既有 `RolesGuard` 行為；訊息**不**揭露端點存在細節）
- **And** `users.business_role` **不**變更，audit log **不**寫入

### AC-6：目標帳號不存在回 404

- **Given** Admin 已登入，路徑參數 `:id` 對應之帳號不存在於 `users` 表
- **When** Admin 呼叫 PATCH
- **Then** 回 HTTP 404，錯誤碼 `ACCOUNT_NOT_FOUND`

### AC-7：缺 body 欄位回 400

- **Given** Admin 已登入
- **When** Admin 呼叫 PATCH 帶 body `{}`（缺 `business_role` key）
- **Then** 回 HTTP 400，錯誤碼 `VALIDATION_ERROR`（DTO `@IsNotEmpty` 觸發；訊息「`business_role` 為必填欄位（值可為 null 表示撤銷）」）

### AC-8：變更後立即觸發 Token revoke

- **Given** User A 已登入並持有 JWT（`businessRole = null`）
- **When** Admin 透過本端點將 A 之 `business_role` 設為 `'director'`
- **Then** A 用舊 JWT 發任一 API 請求時，AuthGuard 因 `JWT.iat * 1000 < users.password_changed_at` 比對成立，回 401 `AUTH_TOKEN_REVOKED`
- **And** A 重新登入後新 JWT payload 含 `businessRole = 'director'`，後續可正常存取 E07 端點

## 5. API 規格

### 5.1 端點定義

| 方法 | 路徑 | 說明 | Guard |
|---|---|---|---|
| PATCH | `/api/v1/accounts/:id/business-role` | 變更指定帳號之業務角色 | 既有 `RolesGuard` + `@Roles('admin')` |

### 5.2 Request

**Headers**：
- `Authorization: Bearer <admin-token>`（必填）
- `Content-Type: application/json`

**Path Parameters**：

| 參數 | 類型 | 說明 |
|---|---|---|
| `id` | UUID | 目標帳號之 `users.id` |

**Body**：

```json
{ "business_role": "director" }
```

允許值：`"director"` / `"section_chief"` / `null`（顯式 null 表示撤銷既有角色）

**DTO 規格**（`UpdateBusinessRoleDto`）：

```typescript
class UpdateBusinessRoleDto {
  @IsIn(['director', 'section_chief', null])
  @IsDefined({ message: 'business_role 為必填欄位（值可為 null 表示撤銷）' })
  business_role: 'director' | 'section_chief' | null;
}
```

> `@IsDefined` 確保 key 存在；`@IsIn` 含 `null` 確保 null 為允許值。

### 5.3 Response

**200 OK**：

```json
{
  "id": "uuid",
  "name": "string",
  "email": "string",
  "role": { "roleCode": "user", "displayName": "使用者" },
  "business_role": "director",
  "status": "active",
  "password_changed_at": "2026-05-16T10:30:01.123Z",
  "created_at": "...",
  "updated_at": "..."
}
```

> `password_changed_at` 用於前端 debug 確認 token revoke 已觸發；前端 UI **不**需顯示此欄位。

**422 Unprocessable Entity**：

```json
{
  "error": {
    "code": "ACCOUNT_BUSINESS_ROLE_INVALID",
    "message": "business_role 值不在允許列表",
    "details": { "allowedValues": ["director", "section_chief", null] }
  }
}
```

**403 Forbidden**（非 Admin）：

```json
{
  "error": {
    "code": "AUTH_FORBIDDEN",
    "message": "您沒有權限執行此操作"
  }
}
```

**404 Not Found**：

```json
{
  "error": {
    "code": "ACCOUNT_NOT_FOUND",
    "message": "找不到指定的帳號"
  }
}
```

**400 Bad Request**：

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "輸入資料驗證失敗",
    "details": [
      { "field": "business_role", "message": "business_role 為必填欄位（值可為 null 表示撤銷）" }
    ]
  }
}
```

| Status | 說明 |
|---|---|
| 200 | 變更成功 |
| 400 | Body 欄位缺失或型別錯誤 |
| 401 | 未提供有效 Token |
| 403 | 非 Admin 呼叫者 |
| 404 | 目標帳號不存在 |
| 422 | `business_role` 值不在允許列表 |
| 500 | 伺服器內部錯誤 |

### 5.4 錯誤碼

| HTTP | 錯誤碼 | 觸發情境 | 出處 |
|---|---|---|---|
| 422 | `ACCOUNT_BUSINESS_ROLE_INVALID` | `business_role` 值非 `'director'` / `'section_chief'` / `null` | [error-handling.md#account-errors](../error-handling.md#account-errors) |
| 403 | `AUTH_FORBIDDEN` | 非 Admin 呼叫（沿用既有 RolesGuard） | [error-handling.md#auth-errors](../error-handling.md#auth-errors) |
| 404 | `ACCOUNT_NOT_FOUND` | 目標帳號不存在 | [error-handling.md#account-errors](../error-handling.md#account-errors) |
| 400 | `VALIDATION_ERROR` | DTO 驗證失敗 | [error-handling.md#general-errors](../error-handling.md#general-errors) |

> **註**：v1.4 短期過渡產物 `ACCOUNT_E07_ROLE_INVALID` / `ACCOUNT_E07_ROLE_FORBIDDEN` 於 v2.0 廢除，由本 spec 之 `ACCOUNT_BUSINESS_ROLE_INVALID` / 既有 `AUTH_FORBIDDEN` 取代（詳見 error-handling.md v1.14）。

### 5.5 Token revoke 機制（沿用 F009 / F010 password_changed_at）

本端點寫入 `business_role` 時**必須**在同一 DB transaction 內同步寫入 `users.password_changed_at`，使該帳號所有舊 JWT 立即失效。此機制由 `AccountsService.updateBusinessRole()` 實作，與舊 F073 §5.4.2 / 舊 F008 sales-manager-flag 端點完全一致：

| 步驟 | 行為 | 實作位置 |
|---|---|---|
| 1 | Admin 呼叫 PATCH `/api/v1/accounts/:id/business-role` | `AccountsController` |
| 2 | `AccountsService.updateBusinessRole(targetUserId, newRole, actorUserId)` 在同一 DB transaction 內：(a) UPDATE `users.business_role`；(b) UPDATE `users.password_changed_at = new Date(Date.now() + 1000)`；(c) INSERT `assignment_audit_log` | `AccountsService` |
| 3 | 該帳號既有所有 JWT 下次帶入 AuthGuard 時，因 `JWT.iat * 1000 < users.password_changed_at` 比對成立而被拒（401 `AUTH_TOKEN_REVOKED`） | AuthGuard（既有，無需修改） |

**為何加 1 秒**：避免同秒內發出之 JWT `iat` 等於 `password_changed_at` 而出現比較邊界 bug（沿用 F009 既有規範）。

**為何不新增 `AuthService.revokeAllUserTokens()` method**：F009 / F010 已驗證 `password_changed_at` 寫入即等價於「revoke all user tokens」效果；新增 wrapper 僅增加跨模組耦合（最低耦合原則，PO 決議 C 於 2026-05-16 確認）。

## 6. 業務規則

| 編號 | 規則 |
|---|---|
| BR-1 | `business_role` 欄位之**唯一**寫入入口為本端點 PATCH `/api/v1/accounts/:id/business-role`；既有 PUT `/api/accounts/:id`（F006）若 body 含 `business_role` 欄位應**忽略**（不寫入、不報錯，沿用對稱設計慣例） |
| BR-2 | 允許值為三值 enum：`'director'` / `'section_chief'` / `null`；DB CHECK constraint 與 DTO `@IsIn` 雙層驗證；其他值（含空字串 `''`）一律拒絕 422 |
| BR-3 | 僅 Admin（`role = 'admin'`）可呼叫；其他角色一律 403 `AUTH_FORBIDDEN`（不揭露端點存在） |
| BR-4 | 寫入 `business_role` 必須在同一 DB transaction 內同步寫入 `users.password_changed_at = new Date(Date.now() + 1000)`，觸發 token revoke |
| BR-5 | 寫入必須同步寫入 `assignment_audit_log`（`action = 'ASSIGN_ROLE'` / `'REVOKE_ROLE'`、`entity_type = 'business_role'`、`entity_id = '{userId}\|{role}'`、含 before / after value） |
| BR-6 | 部長與處長**互斥**（單一欄位設計），不可同時持有；如需切換 `'director'` ↔ `'section_chief'`，本端點直接覆寫即可（無需先撤銷再指派） |
| BR-7 | Admin 自身之 `business_role` 設定**無實質效用**（admin 自動繼承部長全範圍），但本端點不阻擋寫入（資料一致性允許）；前端 UI 可依規格決定是否在 Admin 帳號上隱藏此欄位 |
| BR-8 | 本端點**不**檢查「至少保留一位部長」之類業務規則（業務角色非必要存在，可全空） |

## 7. UI/UX 需求

| 項目 | 說明 |
|---|---|
| 入口 | 帳號清單頁（F005）每筆帳號之操作選單；新增「變更業務角色」項目（與「編輯」/「停用」/「重設密碼」並列） |
| 對話框 | 點擊後開啟對話框，顯示目前 `business_role`（label：「業務部長」/「業務處長」/「未指派」）+ select 控件含三選項（「業務部長」/「業務處長」/「未指派」） |
| 確認 | 變更前須二次確認（顯示「目前角色 → 新角色」摘要 + 「此變更將使該使用者目前的登入立即失效，需重新登入。」提示） |
| 成功回饋 | toast「角色已變更，使用者下次重新登入後生效。」 |
| 錯誤回饋 | 422 顯示「角色值無效」；403 通常不會發生（前端 UI 已限 Admin 可見） |
| Admin 帳號 | 對 Admin 帳號可隱藏本入口（admin 自動繼承部長全範圍，設定業務角色無實質效用；亦可依 UX 偏好顯示供保留資料一致性） |
| label 統一 | 全 UI 使用「業務部長」/「業務處長」/「未指派」三 label（廢除「業務主管」中間語意層） |

> 視覺風格與互動細節由 UI/UX Designer 設計；本 spec 僅定義行為與規則。

## 8. 依賴關係

| 類型 | 項目 | 說明 |
|---|---|---|
| Blocked By | F004（建立帳號） | 帳號須先存在 |
| Blocked By | F005（帳號清單） | 提供操作入口 |
| Blocked By | m14 migration | `users.business_role` 欄位建立 + CHECK constraint + DROP 舊 `is_sales_manager` / `e07_role` 欄位 |
| Blocked By | F009 / F010 | `password_changed_at` 機制已上線並驗證 |
| Blocks | F073 v2.0（部長角色定義） | 提供唯一指派入口 |
| Blocks | F074 v2.0（處長角色定義） | 同上 |
| Blocks | F002 v2.0 §4.6（E07 角色矩陣） | 矩陣依賴本端點作為唯一寫入入口 |
| 取代 | F008 v3.x（DEPRECATED） | sales-manager-flag 端點 + 短期過渡 PATCH `/e07-role` 端點均由本 spec 取代 |
| NFR | NFR-001（安全性） | RBAC 強制執行 + audit log 完整紀錄 |

## 9. 資料需求

### 涉及實體

| 實體 | 操作 | 說明 |
|---|---|---|
| `users` | UPDATE | `business_role`、`password_changed_at`、`updated_at` |
| `assignment_audit_log` | INSERT | 角色變更稽核紀錄 |

### users 表欄位

- `business_role VARCHAR(20) NULL`（CHECK constraint enum：`'director'` / `'section_chief'` / `NULL`）
- `password_changed_at TIMESTAMP`（既有，沿用 F009 / F010 規格）

詳見 [data-model.md#user-entity](../data-model.md#user-entity)。

### assignment_audit_log 寫入規格

| 欄位 | 值 |
|---|---|
| `action` | `'ASSIGN_ROLE'`（指派）/ `'REVOKE_ROLE'`（撤銷為 null） |
| `entity_type` | `'business_role'` |
| `entity_id` | `'{targetUserId}\|{newRole}'`（撤銷時 `{newRole}` 為原舊 role）|
| `actor_user_id` | Admin 之 user_id |
| `before_value` | `{ "business_role": "<oldValue>" }` |
| `after_value` | `{ "business_role": "<newValue>" }` |
| `created_at` | 寫入時間（UTC） |

詳見 [data-model.md#assignment-audit-log](../data-model.md#assignment-audit-log)。

## 10. 安全性考量

- 端點強制 `RolesGuard` + `@Roles('admin')`；非 Admin 一律 403
- audit log 紀錄完整操作軌跡（actor / target / before / after / timestamp）
- response **不**包含 `password_hash`
- DB CHECK constraint 為最後一道防線，即使 DTO 驗證遭繞過仍可阻擋無效值寫入
- token revoke 機制（`password_changed_at`）為延伸自 F009 / F010 之既有安全方案，無新增攻擊面

## 11. 效能需求

- API 回應時間 P95 < 500ms（單筆 UPDATE + 單筆 INSERT，DB 操作預期 < 50ms）
- 無批次需求；單帳號單次呼叫設計

## 12. 測試覆蓋率要求

- 單元測試覆蓋率 ≥ 85%（DTO 驗證、service 層 transaction、AccountsController）
- E2E 測試必須覆蓋：
  - Admin 指派 `'director'` 後該帳號重新登入可進入 M02 寫入端點
  - Admin 指派 `'section_chief'` 後該帳號重新登入可進入 F082 但無法進入 M02
  - Admin 撤銷（設為 null）後該帳號舊 JWT 立即 401 `AUTH_TOKEN_REVOKED`
  - 非 Admin 呼叫回 403 `AUTH_FORBIDDEN`
  - 無效值（`'manager'` / `''` / 數字）回 422 `ACCOUNT_BUSINESS_ROLE_INVALID`
  - 缺 body key 回 400 `VALIDATION_ERROR`
  - 目標帳號不存在回 404 `ACCOUNT_NOT_FOUND`
  - audit log 寫入正確（含 before / after value 比對）
  - `password_changed_at` 寫入後該 user 所有舊 JWT 失效（含其他 device 之 JWT）

## 13. 交叉參考

| 類型 | 連結 |
|---|---|
| 來源 Story | [US-014-assign-change-role.md](../../stories/epics/E02-account-role-management/US-014-assign-change-role.md)（與 F008 共用，本 spec 承接其 sales-manager-flag 部分） |
| 取代 spec | [F008-assign-change-role.md](F008-assign-change-role.md)（DEPRECATED v3.0） |
| 權威矩陣 | [F002 v2.0 §4.5](F002-user-login.md#45-登入後導向與可用功能rbac--實質身份矩陣) / [§4.6](F002-user-login.md#e07-角色矩陣) |
| 相關 Feature | [F006](F006-edit-account.md)（PUT 不含 business_role）、[F073](F073-define-director-role.md)、[F074](F074-define-section-chief-role.md)、[F009](F009-self-service-password-reset.md)、[F010](F010-admin-reset-password.md) |
| 架構規格 | [architecture-spec.md §3.10](../architecture-spec.md) `AccountsService.updateBusinessRole()` |
| 資料模型 | [data-model.md#user-entity](../data-model.md#user-entity) / [#assignment-audit-log](../data-model.md#assignment-audit-log) |
| 錯誤處理 | [error-handling.md v1.14 #account-errors](../error-handling.md#account-errors) |
| Migration | m14（`users.business_role` ADD COLUMN + CHECK constraint + DROP 舊欄位） |

## 14. 變更紀錄

| 版本 | 日期 | 變更內容 |
|---|---|---|
| v1.0 | 2026-05-16 | 初版（E07 合併重構 AD-E07 v3.0）：新建 PATCH `/api/v1/accounts/:id/business-role` 端點作為 `users.business_role` 唯一寫入入口；承接 F008 v3.x sales-manager-flag 端點 + 短期過渡 PATCH `/e07-role` 端點之語意；DTO 採 `@IsIn(['director', 'section_chief', null])` 雙層驗證；沿用 F009 / F010 既有 `password_changed_at` 機制觸發 token revoke；新增錯誤碼 `ACCOUNT_BUSINESS_ROLE_INVALID`（422） |
