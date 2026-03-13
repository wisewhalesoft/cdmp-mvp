---
spec-id: F008
title: 指派／變更角色
feature-id: F008
source-story: US-014
epic: E02
priority: P0-MVP
version: "1.0"
date: 2026-03-06
status: Draft
---

# F008: 指派／變更角色

Priority: P0-MVP | Status: Draft | Last Updated: 2026-03-06

## 功能摘要

Admin 可為任何帳號指派或變更角色。系統強制執行「至少保留一位 Admin」規則，防止最後一位 Admin 被降級。角色變更於使用者下次登入或 Token 刷新後生效。

## User Story

**As a** Admin（管理者）
**I want** 指派或變更使用者帳號的角色
**So that** 我可以隨組織需求變化授予或撤銷管理員權限

## 驗收標準

### AC-1：變更角色

- Given Admin 正在查看一個角色為 User 的帳號
- When Admin 將角色變更為 Admin，確認對話框顯示目前角色與新角色後確認操作
- Then 系統更新角色，顯示成功訊息，且變更於使用者下次登入或 Token 刷新後生效

### AC-2：最後一位 Admin 保護

- Given 系統中僅有一個 Admin 帳號
- When 該 Admin 嘗試將自己（或被他人嘗試）的角色變更為 User
- Then 系統阻止此操作，顯示「無法移除最後一位 Admin，系統必須至少保留一個 Admin 帳號。」

### AC-3：角色變更確認

- Given Admin 正在變更某帳號的角色
- When Admin 選擇新角色
- Then 系統顯示確認對話框，明確說明目前角色與新角色，待 Admin 確認後才執行變更

## API 規格

### PATCH /api/accounts/:id/role

變更指定帳號的角色。

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
  "role": "string (必填，enum: 'admin' | 'user')"
}
```

**Response - 200 OK:**

```json
{
  "id": "string (UUID)",
  "name": "string",
  "email": "string",
  "role": "string (更新後的角色)",
  "status": "string",
  "updated_at": "string (ISO 8601)"
}
```

**Response - 400 Bad Request (最後一位 Admin):**

```json
{
  "error": "LAST_ADMIN_PROTECTION",
  "message": "無法移除最後一位 Admin，系統必須至少保留一個 Admin 帳號。"
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
| 200 | 角色變更成功 |
| 400 | 無效的角色值或最後 Admin 保護觸發 |
| 401 | 未提供有效 Token |
| 403 | 非 Admin 角色，無權存取 |
| 404 | 指定帳號不存在 |
| 500 | 伺服器內部錯誤 |

## 商業規則

| 編號 | 規則 |
|------|------|
| BR-1 | MVP 可用角色僅限 `admin` 與 `user` |
| BR-2 | 後端必須強制執行「至少一位 Admin」規則：在執行降級前，計算系統中現有 Admin 數量 |
| BR-3 | 角色變更需要確認對話框，顯示目前角色與新角色 |
| BR-4 | 角色變更於 Token 下次刷新或使用者重新登入後生效（不立即影響當前 Session） |
| BR-5 | 僅 Admin 角色可執行角色變更 |
| BR-6 | 將角色變更為相同角色為冪等操作，不產生錯誤 |

## UI/UX 需求

| 項目 | 說明 |
|------|------|
| 入口 | 帳號清單或帳號詳細頁面中的角色選擇器（下拉選單） |
| 確認對話框 | 選擇新角色後彈出確認對話框，內容包含：帳號名稱、目前角色、新角色 |
| 成功回饋 | 顯示成功訊息，清單中的角色欄位立即更新 |
| 錯誤回饋 | 最後 Admin 保護觸發時顯示明確的錯誤訊息 |
| 角色選項 | 下拉選單僅顯示 Admin 與 User 兩個選項 |

## 錯誤情境

| 情境 | 系統回應 | HTTP Code |
|------|---------|-----------|
| 降級最後一位 Admin | 顯示「無法移除最後一位 Admin，系統必須至少保留一個 Admin 帳號。」 | 400 |
| 帳號不存在 | 顯示「找不到指定的帳號」 | 404 |
| 無效的角色值 | 顯示「角色值無效」 | 400 |
| 非 Admin 嘗試存取 | 顯示「您沒有權限執行此操作」 | 403 |
| 未確認即變更 | 前端阻止，不發送 API 請求 | - |

參考：[error-handling.md](../error-handling.md) 取得完整錯誤處理策略。

## 依賴關係

| 類型 | 說明 |
|------|------|
| 前置依賴 | F004（帳號必須存在且具有當前角色）、F005（清單提供操作入口）、E01 驗證功能 |
| 被依賴 | 無 |
| NFR 關聯 | NFR-001.2（RBAC 強制執行） |

## 資料需求

此功能更新 Account Entity 的以下欄位：
- role, updated_at

參考：[data-model.md](../data-model.md) 取得完整資料模型定義。

## 安全性考量

- 後端必須在角色變更前驗證「至少一位 Admin」規則，此檢查須在資料庫交易（transaction）中執行，防止 race condition
- API 端點須強制 RBAC，僅限 Admin 角色存取
- 角色變更不立即影響當前 Session（用戶須重新登入或等待 Token 刷新）

## 交叉參考

- User Story：[US-014-assign-change-role.md](../stories/epics/E02-account-role-management/US-014-assign-change-role.md)
- Epic Brief：[E02 Epic Brief](../stories/epics/E02-account-role-management/epic-brief.md)
- NFR：[NFR-001 安全性需求](../stories/non-functional/NFR-001-security.md)
- 資料模型：[data-model.md](../data-model.md)
- 錯誤處理：[error-handling.md](../error-handling.md)
- 相關功能：F004、F005、F006
