---
spec-id: F004
title: 建立帳號
feature-id: F004
source-story: US-010
epic: E02
priority: P0-MVP
version: "3.2"
date: 2026-07-13
status: Draft
---

# F004: 建立帳號

Priority: P0-MVP | Status: Draft | Last Updated: 2026-07-13

> **v3.2（2026-07-13 / 新增選填員工編號欄位，ref US-179 / [F113](F113-employee-no-login-identifier.md)）**：`CreateAccountDto` 新增選填 `employeeNo?: string`（格式 `^[A-Za-z0-9_-]{1,32}$`、不含 `@`、trim、原樣儲存不轉大小寫；空值正規化為 NULL）；service 於 Email 唯一性檢查後新增 `employee_no` **有值時唯一**檢查（重複 → HTTP 409 `ACCOUNT_EMPLOYEE_NO_EXISTS`「此員工編號已被使用」，比照既有 `ACCOUNT_EMAIL_EXISTS` 模式）；建立結果 Response 新增 `employee_no`（nullable）。因全域 `ValidationPipe` whitelist，`employeeNo` **必須**加入 DTO 否則被 strip。唯一性採雙軌設計（service 檢查 + MSSQL filtered unique index），欄位契約與格式規範之權威來源為 [F113](F113-employee-no-login-identifier.md)。

## 功能摘要

Admin 可在 CDMP 平台內建立新的使用者帳號，指定姓名、Email、密碼與角色（Admin / User）。建立 User 帳號時可額外選填「業務主管權限」旗標（`is_sales_manager`），以啟用該 User 對 E07 客戶名單分派與 E06 Customer 360 的存取權（參考 AD-E02-1）。此功能為帳號生命週期管理的起點，所有後續帳號管理操作皆依賴帳號的存在。

## User Story

**As a** Admin（管理者）
**I want** 建立一個指定角色的新使用者帳號
**So that** 團隊成員可以以適當的權限存取 CDMP 平台

## 驗收標準

### AC-1：成功建立帳號

- Given Admin 已登入且在帳號管理頁面
- When Admin 填寫所有必填欄位（姓名、Email、密碼、角色）並提交表單
- Then 系統建立帳號，顯示成功訊息，且新帳號出現於帳號清單中

### AC-2：防止重複 Email（大小寫不敏感）

- Given Email 為「User@Example.com」的帳號已存在
- When Admin 嘗試以「user@example.com」建立另一個帳號
- Then 系統將 Email 以 `toLowerCase()` 轉為小寫後進行比對，顯示錯誤訊息「此 Email 已有帳號存在」，且不建立帳號

### AC-3：欄位驗證

- Given Admin 在建立帳號表單
- When Admin 提交表單時有必填欄位未填或資料格式不正確
- Then 系統針對每個不合規欄位顯示具體的驗證錯誤訊息，且不建立帳號

### AC-4：角色選單顯示全部 2 種角色

- Given Admin 在建立帳號表單的角色下拉選單
- When Admin 展開角色選單
- Then 系統顯示全部 2 種角色供選擇：管理者（Admin）、使用者（User）

### AC-5：無效角色代碼驗證

- Given Admin 透過 API 建立帳號
- When 傳入的 role 值不在 2 種有效 role_code 中（如 `analyst`）
- Then 系統回傳 `400 Bad Request`，錯誤碼 `VALIDATION_INVALID_ROLE`

### AC-6：建立 User 帳號時可選填業務主管旗標

- Given Admin 在建立帳號表單，且已選擇角色為「使用者（User）」
- When 表單顯示
- Then 表單額外顯示「業務主管權限」checkbox（預設未勾選，對應 `is_sales_manager = false`）
- And 若 Admin 勾選 checkbox，帳號建立後 `is_sales_manager = true`，該 User 可存取 E07 與 E06
- And 若 Admin 選擇角色為「管理者（Admin）」，「業務主管權限」checkbox 不顯示或停用（Admin 本身已涵蓋所有功能）

### AC-7：Admin 帳號忽略 isSalesManager 參數

- Given Admin 透過 API 建立帳號且 `role = "admin"`
- When Request Body 同時帶有 `isSalesManager = true`
- Then 系統成功建立 Admin 帳號（`201 Created`），並忽略 `isSalesManager` 參數；回傳 Response 中不含 `is_sales_manager` 欄位或該欄位值為 `false`（預設值）

## API 規格

### POST /api/accounts

建立新的使用者帳號。

**Headers:**
- `Authorization: Bearer <token>` (必填，Admin 角色)
- `Content-Type: application/json`

**Request Body:**

```json
{
  "name": "string (必填，1-100 字元)",
  "email": "string (必填，有效 Email 格式，RFC 5322 基礎規範)",
  "password": "string (必填，最少 8 字元)",
  "role": "string (必填，enum: 'admin' | 'user')",
  "isSalesManager": "boolean (選填，預設 false，僅在 role='user' 時有效；role='admin' 時忽略)",
  "employeeNo": "string | null (選填 / F113；員工編號，格式 ^[A-Za-z0-9_-]{1,32}$、不含 @、trim；缺省或空值 → null；有值時唯一)"
}
```

**Response - 201 Created:**

```json
{
  "id": "string (UUID)",
  "name": "string",
  "email": "string (已轉為小寫)",
  "role": "string",
  "is_sales_manager": "boolean (role='user' 時回傳；role='admin' 時固定為 false 或省略)",
  "employee_no": "string | null (F113；員工編號，未設定為 null)",
  "status": "active",
  "created_at": "string (ISO 8601)"
}
```

**Response - 400 Bad Request (驗證失敗):**

```json
{
  "error": "VALIDATION_ERROR",
  "message": "輸入資料驗證失敗",
  "details": [
    { "field": "email", "message": "Email 格式不正確" },
    { "field": "password", "message": "密碼長度不得少於 8 個字元" }
  ]
}
```

**Response - 409 Conflict (Email 重複):**

```json
{
  "error": "ACCOUNT_EMAIL_EXISTS",
  "message": "此 Email 已有帳號存在"
}
```

**Response - 409 Conflict (員工編號重複 / F113):**

```json
{
  "error": "ACCOUNT_EMPLOYEE_NO_EXISTS",
  "message": "此員工編號已被使用"
}
```

**Response - 403 Forbidden:**

```json
{
  "error": "FORBIDDEN",
  "message": "您沒有權限執行此操作"
}
```

**Status Codes:**
| Code | 說明 |
|------|------|
| 201 | 帳號建立成功 |
| 400 | 欄位驗證失敗 |
| 401 | 未提供有效 Token |
| 403 | 非 Admin 角色，無權存取 |
| 409 | Email 已存在 |
| 500 | 伺服器內部錯誤 |

## 商業規則

| 編號 | 規則 |
|------|------|
| BR-1 | 密碼必須在儲存前以 bcrypt 雜湊處理（成本因子 >= 10），明文密碼絕不儲存或記錄於日誌 |
| BR-2 | Email 在儲存前一律以 `toLowerCase()` 轉為小寫，確保大小寫不敏感的唯一性 |
| BR-3 | 可用角色共 2 種：`admin`、`user`（由 F045 Seed Data 定義） |
| BR-4 | 僅 Admin 角色可建立帳號 |
| BR-5 | 新建帳號預設狀態為 `active` |
| BR-6 | Email 格式驗證須符合 RFC 5322 基礎規範 |
| BR-7 | 密碼最短長度為 8 個字元 |
| BR-8 | 姓名為必填欄位，長度 1-100 字元 |
| BR-9 | `isSalesManager` 為選填布林欄位，預設 `false`；僅在 `role = "user"` 時有效，若 `role = "admin"` 則後端忽略此參數（不回傳驗證錯誤，寫入值固定為 `false`） |
| BR-10 | `users.is_sales_manager` 欄位為 `BOOLEAN NOT NULL DEFAULT FALSE`（參考 AD-E02-1 與 data-model.md） |
| BR-11 | `employeeNo` 為選填欄位（F113）：格式 `^[A-Za-z0-9_-]{1,32}$`、不含 `@`、trim 首尾空白、原樣儲存（不轉大小寫）；空字串／純空白正規化為 NULL。**有值時唯一**——service 於儲存前檢查 `employee_no` 重複，重複拋 409 `ACCOUNT_EMPLOYEE_NO_EXISTS`（比照 Email 唯一性檢查）。唯一性雙軌設計（service 檢查 + MSSQL filtered unique index）與完整格式規範見 [F113 §3](F113-employee-no-login-identifier.md#3-欄位契約employee_no)。 |

## UI/UX 需求

| 項目 | 說明 |
|------|------|
| 入口 | 帳號管理頁面中的「建立帳號」按鈕 |
| 表單欄位 | 姓名（文字輸入）、Email（Email 輸入）、密碼（密碼輸入）、角色（下拉選單：Admin / User，由 `GET /api/roles` 動態載入）、業務主管權限（checkbox，僅在角色為 User 時顯示，預設未勾選） |
| 角色連動顯示 | 選擇 User 角色時動態顯示「業務主管權限」checkbox；切換為 Admin 時自動隱藏該 checkbox 並重置為未勾選 |
| 欄位驗證 | 每個欄位在失焦或提交時顯示即時驗證訊息 |
| 成功回饋 | 顯示成功訊息，並自動返回帳號清單或將新帳號加入清單 |
| 錯誤回饋 | 每個欄位下方顯示對應的驗證錯誤訊息；重複 Email 錯誤顯示於 Email 欄位下方 |
| 密碼遮罩 | 密碼欄位預設遮罩，可選擇切換顯示/隱藏 |

## 錯誤情境

| 情境 | 系統回應 | HTTP Code |
|------|---------|-----------|
| 未填寫必填欄位 | 顯示各欄位對應驗證錯誤 | 400 |
| Email 格式不正確 | 顯示「Email 格式不正確」 | 400 |
| 密碼少於 8 字元 | 顯示「密碼長度不得少於 8 個字元」 | 400 |
| Email 已存在（大小寫不敏感） | 顯示「此 Email 已有帳號存在」 | 409 |
| 非 Admin 嘗試存取 | 顯示「您沒有權限執行此操作」 | 403 |
| 未驗證 Token | 重導至登入頁面 | 401 |
| 角色值不在 2 種有效 role_code 中 | 顯示「角色值無效」 | 400 |

參考：[error-handling.md](../error-handling.md) 取得完整錯誤處理策略。

## 依賴關係

| 類型 | 說明 |
|------|------|
| 前置依賴 | E01 驗證功能（Admin 必須已登入）、F045（角色 Seed Data 必須存在，角色下拉選單由 `GET /api/roles` 載入） |
| 被依賴 | F005（查看帳號清單）、F006（編輯帳號）、F007（停用/啟用帳號）、F008（指派/變更角色）、F009（自助式密碼重設）、F010（Admin 重設密碼） |
| NFR 關聯 | NFR-001（密碼雜湊安全性）、NFR-001.2（RBAC 強制執行） |

## 資料需求

### Account Entity

| 欄位 | 類型 | 必填 | 說明 |
|------|------|------|------|
| id | UUID | 是 | 系統產生的唯一識別碼 |
| name | string (1-100) | 是 | 使用者姓名 |
| email | string | 是 | 使用者 Email（小寫儲存，唯一） |
| password_hash | string | 是 | bcrypt 雜湊後的密碼 |
| role | string (FK -> roles.role_code) | 是 | 使用者角色：admin / user |
| is_sales_manager | boolean | 是 | 業務主管旗標，NOT NULL DEFAULT FALSE；僅在 role='user' 時具業務意義 |
| employee_no | string (VARCHAR(32)) | 否 | 員工編號（F113），nullable、有值時唯一（filtered unique index，見 data-model.md）；作為替代登入識別碼 |
| status | enum (active, disabled) | 是 | 帳號狀態，預設 active |
| created_at | timestamp | 是 | 建立時間 |
| updated_at | timestamp | 是 | 最後更新時間 |

參考：[data-model.md](../data-model.md) 取得完整資料模型定義。

## 安全性考量

- 密碼以 bcrypt 雜湊處理（成本因子 >= 10），明文密碼絕不出現於資料庫或日誌中
- API 端點須強制 RBAC，僅限 Admin 角色存取
- 未授權存取嘗試須記錄至稽核日誌
- Email 唯一性檢查須在資料庫層級以 unique constraint 強制執行，防止 race condition
- API Response 不得回傳 password_hash 欄位

## 效能需求

- API 回應時間 P95 < 500ms（依 NFR-002.1）
- bcrypt 雜湊運算不得阻塞其他請求處理

## 交叉參考

- User Story：[US-010-create-account.md](../../stories/epics/E02-account-role-management/US-010-create-account.md)
- Epic Brief：[E02 Epic Brief](../../stories/epics/E02-account-role-management/epic-brief.md)
- NFR：[NFR-001 安全性需求](../../stories/non-functional/NFR-001-security.md)
- 資料模型：[data-model.md](../data-model.md)
- 錯誤處理：[error-handling.md](../error-handling.md)
- 相關功能：F005、F006、F007、F008、F009、F010、F045、[F113](F113-employee-no-login-identifier.md)（員工編號欄位契約權威來源）
