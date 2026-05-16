---
spec-id: F005
title: 查看帳號清單
feature-id: F005
source-story: US-011
epic: E02
priority: P0-MVP
version: "3.2"
date: 2026-05-16
status: Draft
---

> **v3.2 / 2026-05-16 變更（E07 合併重構 AD-E07 v3.0）**：API response 與資料讀取欄位由 `is_sales_manager`（v3.1 boolean）改為 `business_role`（VARCHAR enum: `'director'` / `'section_chief'` / `null`）；UI 清單欄位由「業務主管 badge」改為「業務角色 badge」（部長 / 處長 / 不顯示）；操作選單「角色變更」改為「變更業務角色」並指向 [F006a](F006a-update-business-role.md)；F008 標 DEPRECATED。本 v3.2 banner 為精簡補修；完整重寫請以本 banner 與 [F006a](F006a-update-business-role.md) / [F002 v2.0 §4.5](F002-user-login.md#45-登入後導向與可用功能rbac--實質身份矩陣) 為唯一權威來源（response body 中 `is_sales_manager` 欄位請替換為 `business_role` 字串 enum）。

# F005: 查看帳號清單

Priority: P0-MVP | Status: Draft | Last Updated: 2026-04-24

## 功能摘要

Admin 可查看所有使用者帳號的分頁清單，包含搜尋與篩選功能（角色篩選支援 Admin / User 兩種角色）。角色欄位以中文顯示名稱呈現。此清單為帳號管理操作（編輯、停用/啟用、角色變更、密碼重設）的主要入口。

## User Story

**As a** Admin（管理者）
**I want** 查看所有使用者帳號的清單
**So that** 我可以管理並監督所有平台使用者

## 驗收標準

### AC-1：顯示分頁帳號清單

- Given Admin 已登入且導覽至帳號管理頁面
- When 頁面載入完成
- Then 系統顯示分頁帳號清單，每筆包含：姓名、Email、角色（以中文顯示名稱呈現：「管理者」或「使用者」）、狀態（active / disabled）、建立日期（created_at）

### AC-2：搜尋與篩選（大小寫不敏感）

- Given Admin 正在查看帳號清單
- When Admin 輸入搜尋關鍵字（例如輸入「john」可匹配「John」或「JOHN」），或選擇篩選條件（依角色或狀態）
- Then 系統以大小寫不敏感方式比對姓名與 Email，清單更新僅顯示符合條件的帳號

### AC-3：依角色篩選

- Given Admin 正在查看帳號清單
- When Admin 從角色篩選下拉選單選擇「管理者」或「使用者」
- Then 系統僅顯示對應 role_code 的帳號

### AC-4：無結果空狀態

- Given 目前沒有任何帳號符合搜尋或篩選條件
- When 清單渲染
- Then 系統顯示「找不到帳號」訊息，並建議調整篩選條件

## API 規格

### GET /api/accounts

取得帳號分頁清單。

**Headers:**
- `Authorization: Bearer <token>` (必填，Admin 角色)

**Query Parameters:**

| 參數 | 類型 | 必填 | 預設值 | 說明 |
|------|------|------|--------|------|
| page | integer | 否 | 1 | 頁碼，最小值 1 |
| limit | integer | 否 | 20 | 每頁筆數，範圍 1-100 |
| search | string | 否 | - | 搜尋關鍵字，比對姓名與 Email（大小寫不敏感） |
| role | string | 否 | - | 篩選角色：`admin` 或 `user` |
| status | string | 否 | - | 篩選狀態：`active` 或 `disabled` |

**Response - 200 OK:**

```json
{
  "data": [
    {
      "id": "string (UUID)",
      "name": "string",
      "email": "string",
      "role": {
        "roleCode": "string",
        "displayName": "string"
      },
      "business_role": "string | null (enum: 'director' | 'section_chief' | null；Admin 帳號邏輯上不適用此欄位，可能為 null 或原值，前端不顯示)",
      "status": "string",
      "created_at": "string (ISO 8601)"
    }
  ],
  "total": "integer (符合條件的總筆數)",
  "page": "integer (當前頁碼)",
  "limit": "integer (每頁筆數)"
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
| 200 | 成功取得清單 |
| 400 | Query parameter 格式錯誤 |
| 401 | 未提供有效 Token |
| 403 | 非 Admin 角色，無權存取 |
| 500 | 伺服器內部錯誤 |

## 商業規則

| 編號 | 規則 |
|------|------|
| BR-1 | 預設排序為 created_at DESC（最新建立的帳號在前） |
| BR-2 | 預設每頁顯示 20 筆 |
| BR-3 | 搜尋為大小寫不敏感，SQL 層使用 `ILIKE` 或 `LOWER()` 比對 |
| BR-4 | 搜尋範圍包含姓名與 Email 兩個欄位 |
| BR-5 | 篩選條件可組合使用（search + role + status） |
| BR-6 | 僅 Admin 角色可存取帳號清單 |
| BR-7 | 回傳的帳號資料不包含 password_hash 欄位 |
| BR-8 | API response 中 `business_role` 欄位為資料庫原值（enum：`'director'` / `'section_chief'` / `null`）；Admin 帳號邏輯上不適用此欄位，UI 僅在 `role='user'` 時呈現對應 label 與「變更業務角色」入口（指向 [F006a](F006a-update-business-role.md)） |
| BR-9 | UI 4 角色 label 顯示規則：admin → 「系統管理者」；user + business_role='director' → 「業務部長」；user + business_role='section_chief' → 「業務處長」；user + business_role=null → 「一般使用者」（依 [F002 §4.5](F002-user-login.md#45-帳號角色定義v20--ad-e07-v30) 為唯一權威來源） |

## UI/UX 需求

| 項目 | 說明 |
|------|------|
| 清單欄位 | 姓名、Email、角色（中文顯示名稱依 BR-9 4 角色 label）、業務角色 badge（`role='user'` 且 `business_role='director'` 顯示「業務部長」；`'section_chief'` 顯示「業務處長」；`null` 不顯示；admin 不顯示）、狀態、建立日期、操作（編輯／停用／**變更業務角色**（指向 [F006a](F006a-update-business-role.md)）／重設密碼） |
| 搜尋 | 搜尋框位於清單上方，支援即時搜尋或按鍵搜尋 |
| 篩選 | 角色篩選（全部/管理者/使用者）與狀態篩選（全部/啟用/停用），角色篩選選項由 `GET /api/roles` 動態載入 |
| 分頁 | 清單下方顯示分頁控制項，包含當前頁碼、總頁數、每頁筆數選擇 |
| 狀態標記 | 停用帳號以視覺標記（badge/tag）區分，例如灰色或紅色標籤 |
| 空狀態 | 無結果時顯示「找不到帳號」文字，附帶建議調整篩選條件的提示 |
| 建立入口 | 清單上方顯示「建立帳號」按鈕，連結至 F004 功能 |

## 錯誤情境

| 情境 | 系統回應 | HTTP Code |
|------|---------|-----------|
| 非 Admin 嘗試存取 | 顯示「您沒有權限執行此操作」 | 403 |
| 未驗證 Token | 重導至登入頁面 | 401 |
| page 或 limit 格式錯誤 | 顯示參數錯誤訊息 | 400 |
| 伺服器錯誤 | 顯示通用錯誤訊息，建議稍後再試 | 500 |

參考：[error-handling.md](../error-handling.md) 取得完整錯誤處理策略。

## 依賴關係

| 類型 | 說明 |
|------|------|
| 前置依賴 | E01 驗證功能（Admin 必須已登入）、F004（需有帳號資料才能列出） |
| 被依賴 | F006（編輯帳號）、F007（停用/啟用帳號）、F008（指派/變更角色）、F010（Admin 重設密碼）—— 清單提供這些操作的入口 |
| NFR 關聯 | NFR-002.5（清單效能要求） |

## 資料需求

此功能讀取 Account Entity 的以下欄位：
- id, name, email, role, business_role, status, created_at

不回傳 password_hash 或其他敏感欄位。

參考：[data-model.md](../data-model.md) 取得完整資料模型定義。

## 安全性考量

- API 端點須強制 RBAC，僅限 Admin 角色存取
- 回傳資料不得包含 password_hash 欄位
- 搜尋輸入須進行 SQL injection 防護（參數化查詢）

## 效能需求

- 在資料量不超過 1,000 筆帳號時，API 回應時間 P95 必須低於 500ms（依 NFR-002.5）
- 搜尋與篩選查詢須使用適當的資料庫索引以確保效能
- 分頁機制避免一次載入全部資料

## 交叉參考

- User Story：[US-011-view-account-list.md](../../stories/epics/E02-account-role-management/US-011-view-account-list.md)
- Epic Brief：[E02 Epic Brief](../../stories/epics/E02-account-role-management/epic-brief.md)
- NFR：[NFR-002 效能需求](../../stories/non-functional/NFR-002-performance.md)
- 資料模型：[data-model.md](../data-model.md)
- 錯誤處理：[error-handling.md](../error-handling.md)
- 相關功能：F004、F006、F007、F008、F010、F045
