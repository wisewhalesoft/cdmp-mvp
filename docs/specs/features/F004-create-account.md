---
spec-id: F004
title: 建立帳號
feature-id: F004
source-story: US-010
epic: E02
priority: P0-MVP
version: "1.0"
date: 2026-03-06
status: Draft
---

# F004: 建立帳號

Priority: P0-MVP | Status: Draft | Last Updated: 2026-03-06

## 功能摘要

Admin 可在 CDMP 平台內建立新的使用者帳號，指定姓名、Email、密碼與角色。此功能為帳號生命週期管理的起點，所有後續帳號管理操作皆依賴帳號的存在。

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
  "role": "string (必填，enum: 'admin' | 'user')"
}
```

**Response - 201 Created:**

```json
{
  "id": "string (UUID)",
  "name": "string",
  "email": "string (已轉為小寫)",
  "role": "string",
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
  "error": "DUPLICATE_EMAIL",
  "message": "此 Email 已有帳號存在"
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
| BR-3 | MVP 可用角色僅限 `admin` 與 `user` |
| BR-4 | 僅 Admin 角色可建立帳號 |
| BR-5 | 新建帳號預設狀態為 `active` |
| BR-6 | Email 格式驗證須符合 RFC 5322 基礎規範 |
| BR-7 | 密碼最短長度為 8 個字元 |
| BR-8 | 姓名為必填欄位，長度 1-100 字元 |

## UI/UX 需求

| 項目 | 說明 |
|------|------|
| 入口 | 帳號管理頁面中的「建立帳號」按鈕 |
| 表單欄位 | 姓名（文字輸入）、Email（Email 輸入）、密碼（密碼輸入）、角色（下拉選單：Admin / User） |
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
| 角色值不在允許範圍 | 顯示「角色值無效」 | 400 |

參考：[error-handling.md](../error-handling.md) 取得完整錯誤處理策略。

## 依賴關係

| 類型 | 說明 |
|------|------|
| 前置依賴 | E01 驗證功能（Admin 必須已登入） |
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
| role | enum (admin, user) | 是 | 使用者角色 |
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

- User Story：[US-010-create-account.md](../stories/epics/E02-account-role-management/US-010-create-account.md)
- Epic Brief：[E02 Epic Brief](../stories/epics/E02-account-role-management/epic-brief.md)
- NFR：[NFR-001 安全性需求](../stories/non-functional/NFR-001-security.md)
- 資料模型：[data-model.md](../data-model.md)
- 錯誤處理：[error-handling.md](../error-handling.md)
- 相關功能：F005、F006、F007、F008、F009、F010
