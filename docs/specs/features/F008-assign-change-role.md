---
spec-id: F008
title: 指派／變更角色
feature-id: F008
source-story: US-014
epic: E02
priority: P0-MVP
version: "3.1"
date: 2026-04-24
status: Draft
---

# F008: 指派／變更角色

Priority: P0-MVP | Status: Draft | Last Updated: 2026-04-24

## 功能摘要

Admin 可為任何帳號指派或變更角色，支援 Admin / User 兩種角色；針對 User 角色的帳號，Admin 可額外切換「業務主管權限」旗標（`is_sales_manager`），啟用或停用該 User 對 E07 客戶名單分派與 E06 Customer 360 的存取（參考 AD-E02-1）。角色選單顯示中文名稱，變更時須經確認對話框。系統強制執行「至少保留一位 Admin」規則，防止最後一位 Admin 被降級。角色變更於使用者下次登入或 Token 刷新後生效；旗標變更於下次 API 請求時即時套用（不需等待 Token 刷新，Admin 僅透過 Blocklist 機制可強制既有 Token 失效）。

## User Story

**As a** Admin（管理者）
**I want** 指派或變更使用者帳號的角色
**So that** 我可以依組織職能需求為每位使用者賦予適當的存取範圍，並在人員調動時即時更新

## 驗收標準

### AC-1：角色變更選單顯示全部 2 種角色

- Given Admin 正在查看某帳號的角色設定
- When Admin 展開角色選擇下拉選單
- Then 選單顯示全部 2 種角色：管理者（Admin）、使用者（User）

### AC-2：變更為 User

- Given Admin 正在查看一個角色為「Admin」的帳號（系統中有其他 Admin）
- When Admin 將角色變更為「使用者（User）」並確認
- Then 系統更新角色為 `user`，顯示成功訊息

### AC-3：變更為 Admin

- Given Admin 正在查看一個角色為「User」的帳號
- When Admin 將角色變更為「管理者（Admin）」並確認
- Then 系統更新角色為 `admin`，顯示成功訊息

### AC-4：防止最後一位 Admin 降級

- Given 系統中僅有一個 Admin 帳號
- When 該 Admin 嘗試將自己的角色變更為 User
- Then 系統阻止此操作，並顯示「無法移除最後一位 Admin，系統必須至少保留一個 Admin 帳號。」

### AC-5：角色變更確認對話框

- Given Admin 正在變更某帳號的角色
- When Admin 選擇新角色
- Then 系統顯示確認對話框，說明目前角色（顯示中文名稱）與新角色（顯示中文名稱），待 Admin 確認後才執行變更

### AC-6：角色變更生效時機

- Given Admin 已成功變更某使用者的角色
- When 該使用者的 Token 下次刷新或重新登入後
- Then 新角色的存取設定即時生效

### AC-7：無效角色代碼驗證

- Given Admin 透過 API 變更角色
- When 傳入的 role 值不在 2 種有效 role_code 中（如 `analyst`）
- Then 系統回傳 `400 Bad Request`，錯誤碼 `VALIDATION_INVALID_ROLE`

### AC-8：切換 User 帳號的業務主管旗標

- Given Admin 正在查看角色為「使用者（User）」的帳號
- When Admin 切換「業務主管權限」開關（啟用或停用）
- Then 系統更新該帳號的 `is_sales_manager` 旗標（`true` 或 `false`），顯示成功訊息
- And 旗標變更於該使用者下次 API 請求時即時套用（RBAC 中介層直接讀取資料庫或比對 JWT Payload；舊 JWT 在新旗標下仍持有原值直至過期，參考 AD-E02-1）

### AC-9：Admin 帳號不適用業務主管旗標

- Given Admin 正在查看角色為「管理者（Admin）」的帳號
- When 帳號詳細頁顯示
- Then 介面不顯示「業務主管權限」開關（Admin 角色本身已涵蓋所有功能，旗標無意義）
- And 若透過 API 對 Admin 帳號呼叫旗標切換端點，後端回傳 `400 Bad Request`，錯誤碼 `ACCOUNT_FLAG_NOT_APPLICABLE`，訊息為「Admin 帳號不適用業務主管旗標」

### AC-10：角色降級時旗標處理

- Given Admin 將一個角色為「管理者（Admin）」的帳號變更為「使用者（User）」
- When 變更完成
- Then 該帳號的 `is_sales_manager` 欄位保留其原值（DB 預設 `false`，除非先前已被設為 `true`），Admin 後續可透過旗標切換端點調整
- Given Admin 將一個角色為「使用者（User）」且 `is_sales_manager = true` 的帳號變更為「管理者（Admin）」
- When 變更完成
- Then 該帳號角色為 `admin`，`is_sales_manager` 欄位值保留於資料庫（不影響 Admin 權限判定，因 Admin 為超集）；若日後再次降級為 User，旗標仍維持原值

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
  "role": {
    "roleCode": "string",
    "displayName": "string"
  },
  "is_sales_manager": "boolean (保留欄位原值，不因角色變更而重置)",
  "status": "string",
  "updated_at": "string (ISO 8601)"
}
```

**Response - 400 Bad Request (無效角色):**

```json
{
  "error": {
    "code": "VALIDATION_INVALID_ROLE",
    "message": "角色值無效，必須為 admin 或 user"
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

### PATCH /api/accounts/:id/sales-manager-flag

切換指定帳號的業務主管旗標（`is_sales_manager`）。

> **命名備註**：端點路徑 `sales-manager-flag` 為本 Spec 預設命名，待確認 naming convention with system-architect。Request body 欄位採 camelCase（`isSalesManager`）以維持與 `POST /api/accounts` 的 request payload 一致。

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
  "isSalesManager": "boolean (必填)"
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
  "is_sales_manager": "boolean (更新後的值)",
  "status": "string",
  "updated_at": "string (ISO 8601)"
}
```

**Response - 400 Bad Request (Admin 帳號不適用旗標):**

```json
{
  "error": {
    "code": "ACCOUNT_FLAG_NOT_APPLICABLE",
    "message": "Admin 帳號不適用業務主管旗標"
  }
}
```

**Response - 400 Bad Request (缺少必填欄位或型別錯誤):**

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "isSalesManager 必須為布林值"
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
| 200 | 旗標切換成功（冪等：相同值亦回傳 200） |
| 400 | Request Body 格式錯誤，或目標帳號為 Admin 角色（不適用旗標） |
| 401 | 未提供有效 Token |
| 403 | 非 Admin 角色，無權存取 |
| 404 | 指定帳號不存在 |
| 500 | 伺服器內部錯誤 |

## 商業規則

| 編號 | 規則 |
|------|------|
| BR-1 | 可用角色共 2 種：`admin`、`user`（由 F045 Seed Data 定義） |
| BR-2 | 後端必須強制執行「至少一位 Admin」規則：在執行降級前，計算系統中現有 Admin 數量 |
| BR-3 | 角色變更需要確認對話框，顯示目前角色中文名稱與新角色中文名稱 |
| BR-4 | 角色變更於 Token 下次刷新或使用者重新登入後生效（不立即影響當前 Session） |
| BR-5 | 僅 Admin 角色可執行角色變更 |
| BR-6 | 將角色變更為相同角色為冪等操作，不產生錯誤 |
| BR-7 | 後端須驗證傳入的 role_code 為 F045 定義的有效值，無效時回傳 `400 Bad Request` |
| BR-8 | 角色變更不影響帳號的密碼、姓名、Email、`is_sales_manager` 旗標等資料 |
| BR-9 | 業務主管旗標切換僅可針對 `role = "user"` 的帳號執行；Admin 帳號呼叫旗標切換端點時回傳 `400 Bad Request`，錯誤碼 `ACCOUNT_FLAG_NOT_APPLICABLE` |
| BR-10 | 旗標切換為冪等操作：將旗標設為與現值相同時回傳 `200 OK`，不產生錯誤 |
| BR-11 | 旗標變更不立即使既有 JWT 失效：舊 Token 於過期前仍持有原 `is_sales_manager` 值；若需即時失效，後端須將該 Token 加入 Blocklist（AD-E02-1 補充） |

## UI/UX 需求

| 項目 | 說明 |
|------|------|
| 入口 | 帳號清單或帳號詳細頁面中的角色選擇器（下拉選單）；User 角色帳號另提供「業務主管權限」開關（toggle）入口 |
| 角色選項 | 下拉選單顯示全部 2 種角色的中文名稱，由 `GET /api/roles` 動態載入 |
| 確認對話框 | 選擇新角色後彈出確認對話框，內容包含：帳號名稱、目前角色（中文名稱）、新角色（中文名稱） |
| 業務主管旗標 UI | 僅在 `role = "user"` 的帳號詳細頁顯示為 toggle switch；`role = "admin"` 的帳號不顯示此開關 |
| 旗標切換確認 | 啟用旗標時建議顯示確認對話框，告知「此 User 將獲得 E07 客戶名單分派全功能與 E06 Customer 360 的存取權」；停用旗標時可直接執行或顯示簡短確認 |
| 成功回饋 | 角色變更或旗標切換成功後顯示成功訊息，清單／詳細頁立即更新對應欄位 |
| 錯誤回饋 | 最後 Admin 保護觸發時顯示明確的錯誤訊息；Admin 帳號誤觸旗標切換端點時顯示「Admin 帳號不適用業務主管旗標」 |

## 錯誤情境

| 情境 | 系統回應 | HTTP Code |
|------|---------|-----------|
| 降級最後一位 Admin | 顯示「無法移除最後一位 Admin，系統必須至少保留一個 Admin 帳號。」 | 422 |
| 帳號不存在 | 顯示「找不到指定的帳號」 | 404 |
| 無效的角色值（不在 2 種 role_code 中） | 顯示「角色值無效」 | 400 |
| 對 Admin 帳號呼叫旗標切換端點 | 顯示「Admin 帳號不適用業務主管旗標」 | 400 |
| 旗標切換 Request Body `isSalesManager` 非布林值 | 顯示「isSalesManager 必須為布林值」 | 400 |
| 非 Admin 嘗試存取 | 顯示「您沒有權限執行此操作」 | 403 |
| 未確認即變更 | 前端阻止，不發送 API 請求 | - |

參考：[error-handling.md](../error-handling.md) 取得完整錯誤處理策略。

## 依賴關係

| 類型 | 說明 |
|------|------|
| 前置依賴 | F004（帳號必須存在且具有當前角色）、F005（清單提供操作入口）、F045（角色 Seed Data 必須存在，角色下拉選單由 `GET /api/roles` 載入）、E01 驗證功能 |
| 被依賴 | 無 |
| NFR 關聯 | NFR-001.2（RBAC 強制執行） |

## 資料需求

此功能更新 Account Entity 的以下欄位：
- `PATCH /api/accounts/:id/role`：更新 `role`、`updated_at`
- `PATCH /api/accounts/:id/sales-manager-flag`：更新 `is_sales_manager`、`updated_at`

`role` 值必須為 `roles` 表中存在的 `role_code`。`is_sales_manager` 為 `BOOLEAN NOT NULL DEFAULT FALSE`（詳見 data-model.md）。

參考：[data-model.md](../data-model.md) 取得完整資料模型定義。

## 安全性考量

- 後端必須在角色變更前驗證「至少一位 Admin」規則，此檢查須在資料庫交易（transaction）中執行，防止 race condition
- API 端點須強制 RBAC，僅限 Admin 角色存取
- 角色變更不立即影響當前 Session（用戶須重新登入或等待 Token 刷新）
- 旗標切換不立即使既有 JWT 失效；若業務需求要求即時撤銷 E07 存取權，後端須將使用者 Token 加入 Blocklist（參考 AD-E02-1）
- 後端須驗證 role_code 為 `roles` 表中有效值
- 旗標切換端點須在 RBAC 中介層額外驗證目標帳號的 `role` 為 `user`，避免旗標被誤設於 Admin 帳號

## 交叉參考

- User Story：[US-014-assign-change-role.md](../../stories/epics/E02-account-role-management/US-014-assign-change-role.md)
- Epic Brief：[E02 Epic Brief](../../stories/epics/E02-account-role-management/epic-brief.md)
- NFR：[NFR-001 安全性需求](../../stories/non-functional/NFR-001-security.md)
- 資料模型：[data-model.md](../data-model.md)
- 錯誤處理：[error-handling.md](../error-handling.md)
- 相關功能：F004、F005、F006、F045
