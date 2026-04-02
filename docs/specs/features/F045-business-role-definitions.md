---
spec-id: F045
title: 業務角色定義（系統預設角色）
feature-id: F045
source-story: US-017
epic: E02
priority: P0-MVP
version: "1.0"
date: 2026-04-02
status: Draft
---

# F045: 業務角色定義（系統預設角色）

Priority: P0-MVP | Status: Draft | Last Updated: 2026-04-02

## 功能摘要

系統預設 8 種角色（2 種系統角色 + 6 種業務角色），透過 Seed Data migration 於系統初始化時自動建立。角色清單透過 API 提供查詢，但不開放新增或刪除。業務角色與 Customer 360 模組（US-068）的欄位可見性、遮罩規則緊密耦合，須確保 `role_code` 一致性。

## User Story

**As a** Admin（管理者）
**I want** 在系統帳號管理中看到完整的角色清單（含系統角色與業務角色），並於指派帳號時從清單中選擇適當角色
**So that** 我可以依據每位使用者的業務職能，指派對應的角色，以確保 Customer 360 及其他模組的存取控制能正確套用

## 角色定義

系統採用**雙層角色架構**：

### 系統角色（System Roles）

| role_code | display_name | alias | type |
|-----------|-------------|-------|------|
| admin | 管理者 | Admin | system |
| user | 使用者 | User | system |

### 業務角色（Business Roles）

| role_code | display_name | alias | type |
|-----------|-------------|-------|------|
| business | 業務 | — | business |
| marketing | 行銷 | 企劃 | business |
| customer_service | 客服 | — | business |
| analyst | 分析師 | — | business |
| supervisor | 主管 | — | business |
| backend_ops | 後端作業 | 作服 | business |

**設計決策（2026-04-02 業務確認）**：六種業務角色為系統預設角色（Seed Data），不開放 Admin 自行新增或刪除。原因：業務角色與 Customer 360 模組（US-068）的欄位可見性、遮罩規則、功能開關緊密耦合，角色名稱必須與 `c360_role_permissions` 資料表保持一致，任意新增角色將導致存取控制規則失效。

## 驗收標準

### AC-1：系統啟動時預設角色存在

- Given 系統完成初始化或資料庫遷移
- When Admin 查詢角色清單（`GET /api/roles`）
- Then 系統回傳全部 8 種角色，每筆包含 `roleCode`、`displayName`、`alias`、`type`

### AC-2：角色資料完整性

- Given 系統已完成 Seed Data migration
- When 驗證角色資料
- Then 全部 8 筆角色的 `role_code`、`display_name`、`alias`、`type` 欄位值與上方角色定義表完全一致

### AC-3：Admin 無法新增角色

- Given Admin 嘗試透過 API 新增角色
- When 發送 `POST /api/roles` 請求
- Then 系統回傳 `403 Forbidden`，錯誤碼 `ROLE_MODIFICATION_FORBIDDEN`，訊息為「角色為系統預設，不支援自訂新增或刪除」

### AC-4：Admin 無法刪除角色

- Given Admin 嘗試透過 API 刪除角色
- When 發送 `DELETE /api/roles/:code` 請求
- Then 系統回傳 `403 Forbidden`，錯誤碼 `ROLE_MODIFICATION_FORBIDDEN`，訊息為「角色為系統預設，不支援自訂新增或刪除」

### AC-5：非 Admin 無法存取角色清單

- Given 非 Admin 角色的使用者嘗試存取角色清單
- When 發送 `GET /api/roles` 請求
- Then 系統回傳 `403 Forbidden`

### AC-6：角色顯示名稱與別名正確

- Given Admin 在建立帳號或指派角色的介面
- When 角色選單顯示
- Then 每種角色顯示正確中文名稱與別名（如 `marketing` 顯示「行銷（企劃）」、`backend_ops` 顯示「後端作業（作服）」）

## API 規格

### GET /api/roles

查詢所有系統預設角色清單。

**Headers:**
- `Authorization: Bearer <token>` (必填，Admin 角色)

**Response - 200 OK:**

```json
{
  "data": [
    {
      "roleCode": "admin",
      "displayName": "管理者",
      "alias": "Admin",
      "type": "system"
    },
    {
      "roleCode": "user",
      "displayName": "使用者",
      "alias": "User",
      "type": "system"
    },
    {
      "roleCode": "business",
      "displayName": "業務",
      "alias": null,
      "type": "business"
    },
    {
      "roleCode": "marketing",
      "displayName": "行銷",
      "alias": "企劃",
      "type": "business"
    },
    {
      "roleCode": "customer_service",
      "displayName": "客服",
      "alias": null,
      "type": "business"
    },
    {
      "roleCode": "analyst",
      "displayName": "分析師",
      "alias": null,
      "type": "business"
    },
    {
      "roleCode": "supervisor",
      "displayName": "主管",
      "alias": null,
      "type": "business"
    },
    {
      "roleCode": "backend_ops",
      "displayName": "後端作業",
      "alias": "作服",
      "type": "business"
    }
  ]
}
```

**Response - 403 Forbidden:**

```json
{
  "error": {
    "code": "AUTH_FORBIDDEN",
    "message": "您沒有權限執行此操作"
  }
}
```

### POST /api/roles（不提供）

系統不提供此端點。若有人嘗試存取：

**Response - 403 Forbidden:**

```json
{
  "error": {
    "code": "ROLE_MODIFICATION_FORBIDDEN",
    "message": "角色為系統預設，不支援自訂新增或刪除"
  }
}
```

### DELETE /api/roles/:code（不提供）

系統不提供此端點。若有人嘗試存取：

**Response - 403 Forbidden:**

```json
{
  "error": {
    "code": "ROLE_MODIFICATION_FORBIDDEN",
    "message": "角色為系統預設，不支援自訂新增或刪除"
  }
}
```

**Status Codes:**
| Code | 說明 |
|------|------|
| 200 | 成功取得角色清單 |
| 401 | 未提供有效 Token |
| 403 | 非 Admin 角色或嘗試修改角色 |
| 500 | 伺服器內部錯誤 |

## 商業規則

| 編號 | 規則 |
|------|------|
| BR-1 | 系統角色共 8 種（2 系統 + 6 業務），均為 Seed Data，不可由使用者新增或刪除 |
| BR-2 | `role_code` 為角色的唯一識別鍵，跨模組整合（如 `c360_role_permissions`）以此欄位為外鍵 |
| BR-3 | 角色 Seed Data 透過 migration script 於系統初次部署時自動建立 |
| BR-4 | migration 須為冪等（idempotent）：重複執行不產生錯誤或重複資料 |
| BR-5 | 不提供 `POST /api/roles` 與 `DELETE /api/roles/:code` 端點（後端強制保護） |
| BR-6 | 僅 Admin 角色可存取 `GET /api/roles` 端點 |
| BR-7 | 角色顯示名稱的格式規則：無 alias 時顯示 `display_name`；有 alias 時顯示 `display_name（alias）`，如「行銷（企劃）」 |

## Seed Data Migration 規格

### migration 腳本需求

1. 建立 `roles` 表（若不存在）
2. 插入 8 筆角色 Seed Data
3. migration 須為冪等：使用 `INSERT ... ON CONFLICT DO NOTHING` 或等效語法
4. 須在 Account 表的 role 欄位 migration 之前執行（確保外鍵完整性）

### Seed Data 內容

```
role_code        | display_name | alias  | type
-----------------+--------------+--------+---------
admin            | 管理者       | Admin  | system
user             | 使用者       | User   | system
business         | 業務         | NULL   | business
marketing        | 行銷         | 企劃   | business
customer_service | 客服         | NULL   | business
analyst          | 分析師       | NULL   | business
supervisor       | 主管         | NULL   | business
backend_ops      | 後端作業     | 作服   | business
```

## 錯誤情境

| 情境 | 系統回應 | HTTP Code |
|------|---------|-----------|
| 非 Admin 存取 GET /api/roles | 顯示「您沒有權限執行此操作」 | 403 |
| 嘗試 POST /api/roles | 顯示「角色為系統預設，不支援自訂新增或刪除」 | 403 |
| 嘗試 DELETE /api/roles/:code | 顯示「角色為系統預設，不支援自訂新增或刪除」 | 403 |
| 查詢時角色資料不存在（Seed Data 未初始化） | 回傳空陣列，系統日誌記錄警告 | 200 |

參考：[error-handling.md](../error-handling.md#role-errors) 取得完整錯誤處理策略。

## 依賴關係

| 類型 | 說明 |
|------|------|
| 前置依賴 | E01 驗證功能（Admin 必須已登入） |
| 被依賴 | F004（建立帳號需選擇角色）、F008（指派/變更角色需完整角色清單）、US-068（Customer 360 角色存取設定依賴 role_code） |
| NFR 關聯 | NFR-001.2（RBAC 強制執行） |

## 資料需求

### Role Entity

參見 [data-model.md](../data-model.md#role-entity) 取得完整 Role 實體定義。

| 欄位 | 類型 | 必填 | 說明 |
|------|------|------|------|
| role_code | string (50) | 是 | 角色唯一識別碼（主鍵） |
| display_name | string (50) | 是 | 角色中文顯示名稱 |
| alias | string (50) | 否 | 角色別名（如「企劃」、「作服」） |
| type | enum (system, business) | 是 | 角色類型 |
| created_at | timestamp | 是 | 建立時間（Seed Data 建立時設定） |

## 安全性考量

- `GET /api/roles` 端點須強制 RBAC，僅限 Admin 角色存取
- 後端須確保不提供角色新增/刪除的 API 端點，或對任何嘗試回傳 403
- Seed Data migration 腳本須納入版本控制，不可手動修改生產資料庫中的角色資料

## 效能需求

- `GET /api/roles` API 回應時間 P95 < 200ms（固定 8 筆資料，無分頁需求）

## 交叉參考

- User Story：[US-017-business-role-definitions.md](../../stories/epics/E02-account-role-management/US-017-business-role-definitions.md)
- Epic Brief：[E02 Epic Brief](../../stories/epics/E02-account-role-management/epic-brief.md)
- NFR：[NFR-001 安全性需求](../../stories/non-functional/NFR-001-security.md)
- 資料模型：[data-model.md](../data-model.md#role-entity)
- 錯誤處理：[error-handling.md](../error-handling.md#role-errors)
- 相關功能：F004（建立帳號）、F005（查看帳號清單）、F008（指派/變更角色）
