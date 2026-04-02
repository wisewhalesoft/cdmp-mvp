---
spec-id: F008
title: 指派／變更角色
feature-id: F008
source-story: US-014
epic: E02
priority: P0-MVP
version: "2.0"
date: 2026-04-02
status: Draft
---

# F008: 指派／變更角色

Priority: P0-MVP | Status: Draft | Last Updated: 2026-04-02

## 功能摘要

Admin 可為任何帳號指派或變更角色，支援全部 8 種角色（2 系統角色 + 6 業務角色）。角色選單顯示中文名稱，變更時須經確認對話框。系統強制執行「至少保留一位 Admin」規則，防止最後一位 Admin 被降級。角色變更於使用者下次登入或 Token 刷新後生效。業務角色決定使用者在 Customer 360 模組中的欄位可見性與功能存取（由 US-068 設定）。

## User Story

**As a** Admin（管理者）
**I want** 指派或變更使用者帳號的角色（含系統角色與六種業務角色）
**So that** 我可以依組織職能需求為每位使用者賦予適當的存取範圍，並在人員調動時即時更新

## 驗收標準

### AC-1：角色變更選單顯示全部 8 種角色

- Given Admin 正在查看某帳號的角色設定
- When Admin 展開角色選擇下拉選單
- Then 選單顯示全部 8 種角色：管理者（Admin）、使用者（User）、業務、行銷（企劃）、客服、分析師、主管、後端作業（作服）

### AC-2：變更為業務角色

- Given Admin 正在查看一個角色為「User」的帳號
- When Admin 將角色變更為「分析師」並確認
- Then 系統更新角色為 `analyst`，顯示成功訊息，且清單顯示「分析師」；使用者下次登入後 Customer 360 模組依分析師角色的設定顯示對應欄位

### AC-3：變更為 Admin

- Given Admin 正在查看一個角色為業務角色（如「業務」）的帳號
- When Admin 將角色變更為「管理者（Admin）」並確認
- Then 系統更新角色為 `admin`，顯示成功訊息

### AC-4：防止最後一位 Admin 降級

- Given 系統中僅有一個 Admin 帳號
- When 該 Admin 嘗試將自己的角色變更為任何非 Admin 角色（包含業務角色）
- Then 系統阻止此操作，並顯示「無法移除最後一位 Admin，系統必須至少保留一個 Admin 帳號。」

### AC-5：角色變更確認對話框

- Given Admin 正在變更某帳號的角色
- When Admin 選擇新角色
- Then 系統顯示確認對話框，說明目前角色（顯示中文名稱）與新角色（顯示中文名稱），待 Admin 確認後才執行變更

### AC-6：角色變更生效時機

- Given Admin 已成功變更某使用者的角色
- When 該使用者的 Token 下次刷新或重新登入後
- Then 新角色的存取設定（含 Customer 360 的欄位可見性與功能開關）即時生效

### AC-7：無效角色代碼驗證

- Given Admin 透過 API 變更角色
- When 傳入的 role 值不在 8 種有效 role_code 中（如 `manager`）
- Then 系統回傳 `400 Bad Request`，錯誤碼 `VALIDATION_INVALID_ROLE`

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
  "role": "string (必填，enum: 'admin' | 'user' | 'business' | 'marketing' | 'customer_service' | 'analyst' | 'supervisor' | 'backend_ops')"
}
```

**Response - 200 OK:**

```json
{
  "id": "string (UUID)",
  "name": "string",
  "email": "string",
  "role": {
    "roleCode": "string",
    "displayName": "string"
  },
  "status": "string",
  "updated_at": "string (ISO 8601)"
}
```

**Response - 400 Bad Request (無效角色):**

```json
{
  "error": {
    "code": "VALIDATION_INVALID_ROLE",
    "message": "角色值無效，必須為系統定義的 8 種角色之一"
  }
}
```

**Response - 422 Unprocessable Entity (最後一位 Admin):**

```json
{
  "error": {
    "code": "ACCOUNT_LAST_ADMIN",
    "message": "無法移除最後一位 Admin，系統必須至少保留一個 Admin 帳號。"
  }
}
```

**Response - 404 Not Found:**

```json
{
  "error": {
    "code": "ACCOUNT_NOT_FOUND",
    "message": "找不到指定的帳號"
  }
}
```

**Status Codes:**
| Code | 說明 |
|------|------|
| 200 | 角色變更成功 |
| 400 | 無效的角色值 |
| 401 | 未提供有效 Token |
| 403 | 非 Admin 角色，無權存取 |
| 404 | 指定帳號不存在 |
| 422 | 最後 Admin 保護觸發 |
| 500 | 伺服器內部錯誤 |

## 商業規則

| 編號 | 規則 |
|------|------|
| BR-1 | 可用角色共 8 種：`admin`、`user`、`business`、`marketing`、`customer_service`、`analyst`、`supervisor`、`backend_ops`（由 F045 Seed Data 定義） |
| BR-2 | 後端必須強制執行「至少一位 Admin」規則：在執行降級前，計算系統中現有 Admin 數量 |
| BR-3 | 角色變更需要確認對話框，顯示目前角色中文名稱與新角色中文名稱 |
| BR-4 | 角色變更於 Token 下次刷新或使用者重新登入後生效（不立即影響當前 Session） |
| BR-5 | 僅 Admin 角色可執行角色變更 |
| BR-6 | 將角色變更為相同角色為冪等操作，不產生錯誤 |
| BR-7 | 後端須驗證傳入的 role_code 為 F045 定義的有效值，無效時回傳 `400 Bad Request` |
| BR-8 | 角色變更不影響帳號的密碼、姓名、Email 等資料 |

## UI/UX 需求

| 項目 | 說明 |
|------|------|
| 入口 | 帳號清單或帳號詳細頁面中的角色選擇器（下拉選單） |
| 角色選項 | 下拉選單顯示全部 8 種角色的中文名稱，由 `GET /api/roles` 動態載入 |
| 確認對話框 | 選擇新角色後彈出確認對話框，內容包含：帳號名稱、目前角色（中文名稱）、新角色（中文名稱） |
| 成功回饋 | 顯示成功訊息，清單中的角色欄位立即更新為新角色的中文名稱 |
| 錯誤回饋 | 最後 Admin 保護觸發時顯示明確的錯誤訊息 |

## 錯誤情境

| 情境 | 系統回應 | HTTP Code |
|------|---------|-----------|
| 降級最後一位 Admin（改為任何非 Admin 角色） | 顯示「無法移除最後一位 Admin，系統必須至少保留一個 Admin 帳號。」 | 422 |
| 帳號不存在 | 顯示「找不到指定的帳號」 | 404 |
| 無效的角色值（不在 8 種 role_code 中） | 顯示「角色值無效」 | 400 |
| 非 Admin 嘗試存取 | 顯示「您沒有權限執行此操作」 | 403 |
| 未確認即變更 | 前端阻止，不發送 API 請求 | - |

參考：[error-handling.md](../error-handling.md) 取得完整錯誤處理策略。

## 依賴關係

| 類型 | 說明 |
|------|------|
| 前置依賴 | F004（帳號必須存在且具有當前角色）、F005（清單提供操作入口）、F045（角色 Seed Data 必須存在，角色下拉選單由 `GET /api/roles` 載入）、E01 驗證功能 |
| 被依賴 | US-068（Customer 360 角色存取設定依賴使用者已被指派正確業務角色） |
| NFR 關聯 | NFR-001.2（RBAC 強制執行） |

## 資料需求

此功能更新 Account Entity 的以下欄位：
- role, updated_at

role 值必須為 `roles` 表中存在的 `role_code`。

參考：[data-model.md](../data-model.md) 取得完整資料模型定義。

## 安全性考量

- 後端必須在角色變更前驗證「至少一位 Admin」規則，此檢查須在資料庫交易（transaction）中執行，防止 race condition
- API 端點須強制 RBAC，僅限 Admin 角色存取
- 角色變更不立即影響當前 Session（用戶須重新登入或等待 Token 刷新）
- 後端須驗證 role_code 為 `roles` 表中有效值

## 交叉參考

- User Story：[US-014-assign-change-role.md](../../stories/epics/E02-account-role-management/US-014-assign-change-role.md)
- Epic Brief：[E02 Epic Brief](../../stories/epics/E02-account-role-management/epic-brief.md)
- NFR：[NFR-001 安全性需求](../../stories/non-functional/NFR-001-security.md)
- 資料模型：[data-model.md](../data-model.md)
- 錯誤處理：[error-handling.md](../error-handling.md)
- 相關功能：F004、F005、F006、F045
