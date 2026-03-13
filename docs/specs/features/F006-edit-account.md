---
spec-id: F006
title: 編輯帳號
feature-id: F006
source-story: US-012
epic: E02
priority: P0-MVP
version: "1.0"
date: 2026-03-06
status: Draft
---

# F006: 編輯帳號

Priority: P0-MVP | Status: Draft | Last Updated: 2026-03-06

## 功能摘要

Admin 可編輯現有使用者帳號的姓名與 Email。此功能範圍僅限基本資料的修改，不包含密碼變更（由 F010 處理）與角色變更（由 F008 處理）。

## User Story

**As a** Admin（管理者）
**I want** 編輯現有使用者帳號的詳細資料
**So that** 我可以保持使用者資訊的準確性與時效性

## 驗收標準

### AC-1：成功編輯帳號

- Given Admin 正在查看某帳號的詳細資料或帳號清單
- When Admin 修改帳號姓名或 Email 並儲存
- Then 系統更新帳號資料，顯示成功訊息，且變更立即反映於 UI

### AC-2：Email 唯一性驗證（大小寫不敏感）

- Given Admin 正在編輯某帳號的 Email
- When Admin 將 Email 變更為已被另一個帳號使用的地址（比對前以 `toLowerCase()` 轉為小寫）
- Then 系統顯示「此 Email 已被使用」，且不儲存變更

### AC-3：欄位驗證

- Given Admin 正在編輯帳號
- When Admin 清空必填欄位或輸入不合規資料
- Then 系統顯示驗證錯誤訊息，且不儲存變更

## API 規格

### PUT /api/accounts/:id

更新指定帳號的基本資料。

**Headers:**
- `Authorization: Bearer <token>` (必填，Admin 角色)
- `Content-Type: application/json`

**Path Parameters:**

| 參數 | 類型 | 說明 |
|------|------|------|
| id | UUID | 帳號唯一識別碼 |

**Request Body:**

```json
{
  "name": "string (必填，1-100 字元)",
  "email": "string (必填，有效 Email 格式)"
}
```

**Response - 200 OK:**

```json
{
  "id": "string (UUID)",
  "name": "string",
  "email": "string (已轉為小寫)",
  "role": "string",
  "status": "string",
  "created_at": "string (ISO 8601)",
  "updated_at": "string (ISO 8601)"
}
```

**Response - 400 Bad Request (驗證失敗):**

```json
{
  "error": "VALIDATION_ERROR",
  "message": "輸入資料驗證失敗",
  "details": [
    { "field": "email", "message": "Email 格式不正確" }
  ]
}
```

**Response - 409 Conflict (Email 重複):**

```json
{
  "error": "DUPLICATE_EMAIL",
  "message": "此 Email 已被使用"
}
```

**Response - 404 Not Found:**

```json
{
  "error": "NOT_FOUND",
  "message": "找不到指定的帳號"
}
```

**Status Codes:**
| Code | 說明 |
|------|------|
| 200 | 帳號更新成功 |
| 400 | 欄位驗證失敗 |
| 401 | 未提供有效 Token |
| 403 | 非 Admin 角色，無權存取 |
| 404 | 指定帳號不存在 |
| 409 | Email 已被其他帳號使用 |
| 500 | 伺服器內部錯誤 |

## 商業規則

| 編號 | 規則 |
|------|------|
| BR-1 | 可編輯欄位僅限姓名與 Email |
| BR-2 | Email 在儲存前一律以 `toLowerCase()` 轉為小寫，與 F004 一致 |
| BR-3 | Email 唯一性檢查須排除自身帳號（同一帳號的 Email 未變更時不應觸發重複錯誤） |
| BR-4 | 密碼變更不在此功能範圍（由 F010 處理） |
| BR-5 | 角色變更不在此功能範圍（由 F008 處理） |
| BR-6 | 僅 Admin 角色可編輯帳號 |
| BR-7 | 建議使用 Optimistic Locking 防止並發編輯衝突 |

## UI/UX 需求

| 項目 | 說明 |
|------|------|
| 入口 | 帳號清單中每筆帳號的「編輯」操作按鈕 |
| 表單 | 編輯表單或對話框，預填現有姓名與 Email |
| 欄位驗證 | 每個欄位在失焦或提交時顯示即時驗證訊息 |
| 成功回饋 | 顯示成功訊息，變更立即反映於帳號清單或詳細頁面 |
| 錯誤回饋 | 每個欄位下方顯示對應的驗證錯誤訊息；重複 Email 錯誤顯示於 Email 欄位下方 |
| 取消操作 | 提供「取消」按鈕，放棄未儲存的變更 |

## 錯誤情境

| 情境 | 系統回應 | HTTP Code |
|------|---------|-----------|
| 清空必填欄位 | 顯示各欄位對應驗證錯誤 | 400 |
| Email 格式不正確 | 顯示「Email 格式不正確」 | 400 |
| Email 已被其他帳號使用（大小寫不敏感） | 顯示「此 Email 已被使用」 | 409 |
| 帳號不存在 | 顯示「找不到指定的帳號」 | 404 |
| 非 Admin 嘗試存取 | 顯示「您沒有權限執行此操作」 | 403 |
| 並發編輯衝突 | 顯示「此帳號已被其他人修改，請重新載入後再試」 | 409 |

參考：[error-handling.md](../error-handling.md) 取得完整錯誤處理策略。

## 依賴關係

| 類型 | 說明 |
|------|------|
| 前置依賴 | F004（帳號必須存在）、F005（清單提供編輯操作入口）、E01 驗證功能 |
| 被依賴 | 無 |
| NFR 關聯 | NFR-001.2（RBAC 強制執行） |

## 資料需求

此功能更新 Account Entity 的以下欄位：
- name, email, updated_at

Email 唯一性由資料庫層級的 unique constraint 保障。

參考：[data-model.md](../data-model.md) 取得完整資料模型定義。

## 安全性考量

- API 端點須強制 RBAC，僅限 Admin 角色存取
- 回傳資料不得包含 password_hash 欄位
- Email 唯一性檢查須在資料庫層級以 unique constraint 強制執行，防止 race condition
- 輸入資料須進行適當的 sanitization 防止 XSS

## 交叉參考

- User Story：[US-012-edit-account.md](../stories/epics/E02-account-role-management/US-012-edit-account.md)
- Epic Brief：[E02 Epic Brief](../stories/epics/E02-account-role-management/epic-brief.md)
- 資料模型：[data-model.md](../data-model.md)
- 錯誤處理：[error-handling.md](../error-handling.md)
- 相關功能：F004、F005、F008（角色變更）、F010（密碼重設）
