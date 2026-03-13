---
spec-id: F007
title: 停用／啟用帳號
feature-id: F007
source-story: US-013
epic: E02
priority: P1
version: "1.0"
date: 2026-03-06
status: Draft
---

# F007: 停用／啟用帳號

Priority: P1 | Status: Draft | Last Updated: 2026-03-06

## 功能摘要

Admin 可停用或重新啟用使用者帳號，在不永久刪除帳號的情況下控制平台存取權限。停用帳號時系統自動使該使用者所有有效 Session 失效，強制登出。

## User Story

**As a** Admin（管理者）
**I want** 停用或重新啟用使用者帳號
**So that** 我可以在不永久刪除帳號的情況下控制平台存取權限

## 驗收標準

### AC-1：停用帳號

- Given Admin 正在查看一個狀態為 active 的帳號
- When Admin 點擊「停用帳號」，確認對話框出現後確認操作
- Then 帳號狀態變更為 disabled，若該使用者目前在線則被強制登出（所有有效 Session 失效），且帳號在清單中以視覺標記顯示為停用狀態

### AC-2：啟用帳號

- Given Admin 正在查看一個狀態為 disabled 的帳號
- When Admin 點擊「啟用帳號」
- Then 帳號狀態變更為 active，使用者可再次登入

### AC-3：防止自我停用

- Given Admin 正在查看自己的帳號
- When Admin 嘗試停用自己的帳號
- Then 系統阻止此操作，顯示「您無法停用自己的帳號」

## API 規格

### PATCH /api/accounts/:id/status

變更指定帳號的狀態。

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
  "status": "string (必填，enum: 'active' | 'disabled')"
}
```

**Response - 200 OK:**

```json
{
  "id": "string (UUID)",
  "name": "string",
  "email": "string",
  "role": "string",
  "status": "string (更新後的狀態)",
  "updated_at": "string (ISO 8601)"
}
```

**Response - 400 Bad Request (自我停用):**

```json
{
  "error": "SELF_DISABLE_NOT_ALLOWED",
  "message": "您無法停用自己的帳號"
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
| 200 | 狀態變更成功 |
| 400 | 無效的狀態值或自我停用嘗試 |
| 401 | 未提供有效 Token |
| 403 | 非 Admin 角色，無權存取 |
| 404 | 指定帳號不存在 |
| 500 | 伺服器內部錯誤 |

## 商業規則

| 編號 | 規則 |
|------|------|
| BR-1 | 停用帳號時，系統必須使該使用者所有有效的 Session Token 失效 |
| BR-2 | 已停用的帳號無法登入（登入檢查須驗證帳號狀態，參考 E01 驗證流程） |
| BR-3 | Admin 不得停用自己的帳號 |
| BR-4 | 停用操作需要確認對話框，啟用操作不需要 |
| BR-5 | 狀態值僅限 `active` 與 `disabled` |
| BR-6 | 僅 Admin 角色可執行帳號狀態變更 |
| BR-7 | 啟用已啟用的帳號或停用已停用的帳號為冪等操作，不產生錯誤 |

## UI/UX 需求

| 項目 | 說明 |
|------|------|
| 入口 | 帳號清單中每筆帳號的狀態操作按鈕 |
| 按鈕狀態 | 啟用中的帳號顯示「停用」按鈕；已停用的帳號顯示「啟用」按鈕 |
| 確認對話框 | 停用操作需彈出確認對話框，說明停用後果（使用者將被強制登出且無法再登入） |
| 視覺標記 | 停用帳號在清單中以 badge/tag 標記（例如灰色或紅色「已停用」標籤） |
| 自我停用防護 | Admin 自己的帳號停用按鈕應為不可點擊狀態（disabled），或點擊後顯示錯誤訊息 |
| 成功回饋 | 狀態變更後顯示成功訊息，清單中的狀態標記立即更新 |

## 錯誤情境

| 情境 | 系統回應 | HTTP Code |
|------|---------|-----------|
| Admin 嘗試停用自己 | 顯示「您無法停用自己的帳號」 | 400 |
| 帳號不存在 | 顯示「找不到指定的帳號」 | 404 |
| 無效的狀態值 | 顯示「狀態值無效」 | 400 |
| 非 Admin 嘗試存取 | 顯示「您沒有權限執行此操作」 | 403 |
| 未確認即停用 | 前端阻止，不發送 API 請求 | - |

參考：[error-handling.md](../error-handling.md) 取得完整錯誤處理策略。

## 依賴關係

| 類型 | 說明 |
|------|------|
| 前置依賴 | F004（帳號必須存在）、F005（清單提供操作入口）、E01 驗證功能 |
| 被依賴 | E01 登入功能須檢查帳號狀態（已停用帳號登入應被拒絕） |
| NFR 關聯 | NFR-001.1（Session Token 失效機制）、NFR-001.2（RBAC 強制執行） |

## 資料需求

此功能更新 Account Entity 的以下欄位：
- status, updated_at

停用時需額外操作：刪除或失效與該帳號相關的所有 Session Token。

參考：[data-model.md](../data-model.md) 取得完整資料模型定義。

## 安全性考量

- 停用帳號時，必須立即使該使用者所有有效 Session Token 失效，確保已停用使用者無法繼續存取系統
- API 端點須強制 RBAC，僅限 Admin 角色存取
- 自我停用防護須在後端強制執行（不能僅依賴前端檢查）
- 帳號停用事件應記錄至稽核日誌

## 交叉參考

- User Story：[US-013-disable-enable-account.md](../stories/epics/E02-account-role-management/US-013-disable-enable-account.md)
- Epic Brief：[E02 Epic Brief](../stories/epics/E02-account-role-management/epic-brief.md)
- NFR：[NFR-001 安全性需求](../stories/non-functional/NFR-001-security.md)
- 資料模型：[data-model.md](../data-model.md)
- 錯誤處理：[error-handling.md](../error-handling.md)
- 相關功能：F004、F005、E01（登入狀態檢查）
