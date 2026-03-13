---
spec-id: F010
title: Admin 重設使用者密碼
feature-id: F010
source-story: US-016
epic: E02
priority: P0-MVP
version: "1.0"
date: 2026-03-06
status: Draft
---

# F010: Admin 重設使用者密碼

Priority: P0-MVP | Status: Draft | Last Updated: 2026-03-06

## 功能摘要

Admin 可直接為其他使用者重設密碼，無需經過 Email 驗證流程。此功能適用於使用者無法透過自助式重設（F009）恢復存取權的情境（例如無法收取 Email）。此功能與 F009（自助式密碼重設）為完全獨立的流程。

## User Story

**As a** Admin（管理者）
**I want** 替其他使用者重設密碼
**So that** 當使用者無法自行重設密碼時，我可以協助恢復其平台存取權

## 驗收標準

### AC-1：成功重設密碼

- Given Admin 在帳號管理頁面查看某使用者帳號
- When Admin 點擊「重設密碼」，輸入新密碼（最少 8 字元）並確認
- Then 系統以 bcrypt 雜湊儲存新密碼、失效該使用者所有現有 Session Token，並顯示成功訊息「密碼已重設，使用者需以新密碼重新登入」

### AC-2：密碼規則驗證

- Given Admin 為某使用者輸入新密碼
- When 新密碼不符合密碼規則（少於 8 字元）
- Then 系統顯示驗證錯誤訊息，且不執行重設

### AC-3：不可重設自己的密碼

- Given Admin 在帳號清單中查看自己的帳號
- When Admin 嘗試透過此功能重設自己的密碼
- Then 系統顯示「請透過個人設定變更您自己的密碼」，且不執行重設

## API 規格

### POST /api/accounts/:id/reset-password

Admin 為指定帳號重設密碼。

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
  "newPassword": "string (必填，最少 8 字元)"
}
```

**Response - 200 OK:**

```json
{
  "message": "密碼已重設，使用者需以新密碼重新登入"
}
```

**Response - 400 Bad Request (自我重設):**

```json
{
  "error": "SELF_RESET_NOT_ALLOWED",
  "message": "請透過個人設定變更您自己的密碼"
}
```

**Response - 400 Bad Request (密碼驗證失敗):**

```json
{
  "error": "VALIDATION_ERROR",
  "message": "輸入資料驗證失敗",
  "details": [
    { "field": "newPassword", "message": "密碼長度不得少於 8 個字元" }
  ]
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
| 200 | 密碼重設成功 |
| 400 | 密碼驗證失敗或自我重設嘗試 |
| 401 | 未提供有效 Token |
| 403 | 非 Admin 角色，無權存取 |
| 404 | 指定帳號不存在 |
| 500 | 伺服器內部錯誤 |

## 商業規則

| 編號 | 規則 |
|------|------|
| BR-1 | 僅 Admin 角色可執行此操作 |
| BR-2 | Admin 不可透過此功能重設自己的密碼（應使用個人設定頁面） |
| BR-3 | 新密碼須符合既有密碼規則（最少 8 字元） |
| BR-4 | 新密碼以 bcrypt 雜湊處理後儲存（成本因子 >= 10） |
| BR-5 | 重設成功後，該使用者所有現有 Session Token 必須失效 |
| BR-6 | 此操作與 F009（自助式密碼重設）為完全獨立的流程，不需要 Email 驗證 |
| BR-7 | 密碼重設事件應記錄至稽核日誌 |

## UI/UX 需求

| 項目 | 說明 |
|------|------|
| 入口 | 帳號清單或帳號詳細頁面中的「重設密碼」按鈕 |
| 重設對話框 | 彈出對話框包含：新密碼輸入欄位 + 確認密碼欄位 + 確認按鈕 + 取消按鈕 |
| 密碼遮罩 | 密碼欄位預設遮罩，可選擇切換顯示/隱藏 |
| 密碼規則提示 | 在密碼輸入欄位旁顯示密碼最短長度要求 |
| 成功回饋 | 顯示「密碼已重設，使用者需以新密碼重新登入」 |
| 自我重設防護 | Admin 自己的帳號「重設密碼」按鈕應為不可點擊狀態（disabled），或點擊後顯示提示訊息 |

## 錯誤情境

| 情境 | 系統回應 | HTTP Code |
|------|---------|-----------|
| 新密碼少於 8 字元 | 顯示「密碼長度不得少於 8 個字元」 | 400 |
| Admin 嘗試重設自己的密碼 | 顯示「請透過個人設定變更您自己的密碼」 | 400 |
| 帳號不存在 | 顯示「找不到指定的帳號」 | 404 |
| 非 Admin 嘗試存取 | 顯示「您沒有權限執行此操作」 | 403 |
| 未驗證 Token | 重導至登入頁面 | 401 |

參考：[error-handling.md](../error-handling.md) 取得完整錯誤處理策略。

## 依賴關係

| 類型 | 說明 |
|------|------|
| 前置依賴 | F004（帳號必須存在）、F005（清單提供操作入口）、E01 驗證功能 |
| 被依賴 | 無 |
| NFR 關聯 | NFR-001.3（密碼雜湊安全性）、NFR-001.1（Session Token 失效） |

## 資料需求

此功能更新 Account Entity 的以下欄位：
- password_hash, updated_at

重設成功後需額外操作：刪除或失效與該帳號相關的所有 Session Token。

參考：[data-model.md](../data-model.md) 取得完整資料模型定義。

## 安全性考量

- 密碼以 bcrypt 雜湊處理（成本因子 >= 10），明文密碼絕不儲存或記錄
- API 端點須強制 RBAC，僅限 Admin 角色存取
- 自我重設防護須在後端強制執行（不能僅依賴前端檢查）
- 重設成功後，目標使用者所有現有 Session Token 必須失效
- 密碼重設事件應記錄至稽核日誌，但日誌中不得包含密碼明文
- API Request / Response 中不得回傳 password_hash

## 交叉參考

- User Story：[US-016-admin-reset-password.md](../stories/epics/E02-account-role-management/US-016-admin-reset-password.md)
- Epic Brief：[E02 Epic Brief](../stories/epics/E02-account-role-management/epic-brief.md)
- NFR：[NFR-001 安全性需求](../stories/non-functional/NFR-001-security.md)
- 資料模型：[data-model.md](../data-model.md)
- 錯誤處理：[error-handling.md](../error-handling.md)
- 相關功能：F004（帳號建立）、F005（帳號清單）、F009（自助式密碼重設，獨立流程）
