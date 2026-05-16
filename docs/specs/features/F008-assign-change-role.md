---
spec-id: F008
title: 指派／變更角色
feature-id: F008
source-story: US-014
epic: E02
priority: P0-MVP
version: "3.0-DEPRECATED"
date: 2026-05-16
status: Deprecated
---

# F008: 指派／變更角色（DEPRECATED）

Priority: P0-MVP | Status: **DEPRECATED v3.0** | Last Updated: 2026-05-16

> **⚠️ DEPRECATED（v3.0-DEPRECATED / 2026-05-16 / E07 合併重構 AD-E07 v3.0）**：本 spec 因 E07 重構廢除 `users.is_sales_manager` 欄位而**整體廢棄**。
>
> **廢棄範圍**：
> - PATCH `/api/v1/accounts/:id/sales-manager-flag` 端點廢除
> - v1.4 短期過渡 PATCH `/api/v1/accounts/:id/e07-role` 端點廢除
> - 「變更角色 dialog」內「業務主管權限」checkbox 廢除
> - 「業務主管」label 廢除（改用「業務部長」/「業務處長」/「一般使用者」三 label）
>
> **取代路徑**：
> - **變更業務角色** → 改走 [F006a：PATCH `/api/v1/accounts/:id/business-role`](F006a-update-business-role.md)（單一端點，body `{ business_role: 'director' | 'section_chief' | null }`）
> - **變更系統角色（admin / user）** → 仍由本 spec 之 PATCH `/role` 端點承擔，但本 spec 已停止維護；如需重新啟用 PATCH `/role` 之語意，請另起 spec（建議 F008a 或 F006b）
>
> **資料模型變更**：`users.is_sales_manager` 欄位於 m14 migration DROP；新增 `users.business_role VARCHAR(20) NULL`（CHECK constraint enum）。詳見 [data-model.md#user-entity](../data-model.md#user-entity)。
>
> **保留原因**：本檔保留以便歷史追溯（v3.2 之前的設計脈絡 + audit log 中 `ASSIGN_SALES_MANAGER` / `REVOKE_SALES_MANAGER` 行為解讀）；新功能 spec **不**應引用本檔。
>
> **以下原 v3.2 內容保留供歷史追溯，不再具備有效性**。

## 功能摘要

Admin 可為任何帳號指派或變更角色，支援 Admin / User 兩種角色（以及由 F045 Seed Data 定義的業務角色清單）；針對 User 角色的帳號，Admin 可額外調整「業務主管權限」旗標（`is_sales_manager`），啟用或停用該 User 對 E07 客戶名單分派與 E06 Customer 360 的存取（參考 AD-E02-1）。

**操作入口採合併 UX**：列表頁僅提供「變更角色」按鈕作為唯一入口；點擊後開啟「變更角色 dialog」，內含「新角色」select 與（僅當新角色 = User 時顯示的）「業務主管權限」checkbox，可於同一次操作中同時調整兩個欄位。後端仍維持兩個獨立的 PATCH 端點（`/role` 與 `/sales-manager-flag`），由前端依需要 sequential 呼叫（先 role 後 flag），不新增複合 API。

角色選單顯示中文名稱，變更時須經確認對話框（純摘要，顯示目前角色 → 新角色，並在新角色 = User 時補上旗標啟用狀態）。系統強制執行「至少保留一位 Admin」規則，防止最後一位 Admin 被降級。角色變更於使用者下次登入或 Token 刷新後生效；旗標變更於下次 API 請求時即時套用（不需等待 Token 刷新，Admin 僅透過 Blocklist 機制可強制既有 Token 失效）。

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
- When Admin 於變更角色 dialog 選擇新角色並點擊「下一步」
- Then 系統顯示確認對話框（純摘要，不可編輯），內容包含：帳號名稱、目前角色（中文名稱）、新角色（中文名稱）
- And 若新角色 = 使用者（User），確認對話框額外顯示「業務主管權限：已啟用 / 未啟用」摘要列
- And 待 Admin 點擊「確認變更」後才執行 API 呼叫

### AC-6：角色變更生效時機

- Given Admin 已成功變更某使用者的角色
- When 該使用者的 Token 下次刷新或重新登入後
- Then 新角色的存取設定即時生效

### AC-7：無效角色代碼驗證

- Given Admin 透過 API 變更角色
- When 傳入的 role 值不在 2 種有效 role_code 中（如 `analyst`）
- Then 系統回傳 `400 Bad Request`，錯誤碼 `VALIDATION_INVALID_ROLE`

### AC-8：在變更角色 dialog 內同時調整業務主管旗標

- Given Admin 在變更角色 dialog 選擇新角色為「使用者（User）」
- When dialog 內的「業務主管權限」checkbox 顯示，且預設值帶入目標帳號目前的 `is_sales_manager` 值
- Then Admin 可在同一次操作中勾選或取消勾選該 checkbox 以調整旗標
- And 確認後系統依需要呼叫 `PATCH /api/accounts/:id/sales-manager-flag` 端點，顯示合併成功訊息
- And 旗標變更於該使用者下次 API 請求時即時套用（RBAC 中介層直接讀取資料庫或比對 JWT Payload；舊 JWT 在新旗標下仍持有原值直至過期，參考 AD-E02-1）

### AC-9：Admin 角色不顯示業務主管 checkbox（UI 層阻擋 + 後端防線）

- Given Admin 在變更角色 dialog 選擇新角色為「管理者（Admin）」（或選擇任一業務角色）
- When dialog 重新渲染
- Then 「業務主管權限」checkbox 區塊隱藏，且 checkbox 狀態重置為未勾選
- And 後端維持防線：若仍有客戶端對 Admin 帳號呼叫 `PATCH /api/accounts/:id/sales-manager-flag`，後端回傳 `400 Bad Request`，錯誤碼 `ACCOUNT_FLAG_NOT_APPLICABLE`，訊息為「Admin 帳號不適用業務主管旗標」

### AC-10：合併操作中的旗標處理（升降級 edge case）

- Given Admin 將一個角色為「管理者（Admin）」的帳號變更為「使用者（User）」
- When Admin 於 dialog 內勾選或取消勾選業務主管 checkbox 並確認
- Then 前端依序呼叫 `PATCH /role` 與 `PATCH /sales-manager-flag`；該帳號最終 `role = 'user'` 且 `is_sales_manager` 為 Admin 勾選的目標值
- Given Admin 將一個角色為「使用者（User）」且 `is_sales_manager = true` 的帳號變更為「管理者（Admin）」
- When 變更完成
- Then 前端**僅**呼叫 `PATCH /role`，**不**呼叫 `PATCH /sales-manager-flag`（避免對 Admin 帳號觸發 `ACCOUNT_FLAG_NOT_APPLICABLE`）
- And `is_sales_manager` 欄位值保留於資料庫原值（不影響 Admin 權限判定，因 Admin 為超集）；若日後再次降級為 User，旗標仍維持原值

### AC-11：合併呼叫的順序與錯誤回滾

- Given Admin 同時變更目標 User 的 role 與 `is_sales_manager`（兩者皆有變動）
- When Admin 點擊確認對話框的「確認變更」
- Then 前端**依序**呼叫：先 `PATCH /api/accounts/:id/role`，後 `PATCH /api/accounts/:id/sales-manager-flag`（僅當新 role = `user` 且 flag 有變更時才呼叫第二支）
- And 若 role 端點失敗：前端中止後續呼叫，UI 不更新，顯示 role 端點對應的錯誤訊息（例如 `ACCOUNT_LAST_ADMIN`、`VALIDATION_INVALID_ROLE`）
- And 若 role 端點成功但 flag 端點失敗：前端列表頁角色欄位更新為新 role，但保留 `is_sales_manager` 顯示為原值；顯示 flag 端點對應錯誤訊息並提示「角色已變更為 X，但業務主管權限調整失敗，請稍後重試」
- And 若兩者皆成功（或只需呼叫其中一支且成功）：顯示單一合併成功訊息，例如「角色已變更為使用者（User），業務主管權限已啟用」

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

### 前端合併呼叫策略

變更角色 dialog 採合併 UX，但後端維持兩個獨立端點。前端依以下規則編排：

| 情境 | role 是否變更 | flag 是否變更 | 新 role | 前端呼叫順序 |
|------|---------------|---------------|---------|--------------|
| A | 是 | 否 | `user` 或 `admin` | 僅 `PATCH /role` |
| B | 是 | 是 | `user` | 先 `PATCH /role`，後 `PATCH /sales-manager-flag` |
| C | 是 | 是（原為 true） | `admin` | 僅 `PATCH /role`（不呼叫 flag 端點，避免 `ACCOUNT_FLAG_NOT_APPLICABLE`；資料庫保留 flag 原值） |
| D | 否 | 是 | `user` | 僅 `PATCH /sales-manager-flag` |
| E | 否 | 否 | – | 前端阻止 submit（確認對話框前已校驗，顯示「未變更」提示） |

**錯誤回滾語意**：
- 兩個端點各自原子（atomic），後端不提供分散式交易；
- 若先呼叫的 `PATCH /role` 失敗 → 前端中止，UI 不更新；
- 若 `PATCH /role` 成功但後續 `PATCH /sales-manager-flag` 失敗 → role 已落庫，前端不嘗試 rollback role；UI 顯示部分成功訊息並提示 Admin 稍後重試 flag 調整（詳見 AC-11）。
- 兩端點仍互相獨立，保持單一職責；本 spec 不引入新的複合 API。

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
| BR-12 | 前端合併呼叫策略：先 `PATCH /role` 後 `PATCH /sales-manager-flag`；若新 role = `admin` 則前端**不**呼叫 flag 端點（避免 `ACCOUNT_FLAG_NOT_APPLICABLE`）。兩個 PATCH 端點後端仍各自獨立、各自原子；不引入複合 API（詳見「前端合併呼叫策略」表）。 |

## UI/UX 需求

| 項目 | 說明 |
|------|------|
| 唯一入口 | 帳號清單列表頁「變更角色」按鈕（移除原本的列表頁 toggle switch 與帳號詳細頁 toggle，僅保留唯一入口） |
| 變更角色 dialog（Modal 5） | 內含「新角色」select（系統角色：管理者／使用者；業務角色：F045 Seed 定義的清單）+ 「業務主管權限」checkbox |
| 業務主管 checkbox 連動規則 | 僅當新角色 = 使用者（User）時顯示；切到任一其他角色（Admin 或業務角色）時自動隱藏並重置 checkbox 為未勾選 |
| checkbox 預設值 | 開啟 dialog 時若目標帳號目前 `role = user`，checkbox 預填為目前 `is_sales_manager` 值；其他情境（Admin 升降級為 User）預設未勾選 |
| 確認對話框（Modal 5b） | 純摘要、不可編輯。顯示：帳號名稱、目前角色 → 新角色；若新角色 = User，補上「業務主管權限：已啟用 / 未啟用」摘要列 |
| 列表頁徽章顯示 | 列表頁可保留「業務主管」chip 徽章作為唯讀顯示（樣式參考 prototype 27 line 122-126；prototype 07 列表頁區塊 D）；不再提供 toggle 操作 |
| Admin 角色顯示 | Admin 角色帳號的列表列不顯示業務主管 chip；變更角色 dialog 在新角色 = Admin 時隱藏 checkbox |
| 角色選項載入 | 下拉選單顯示中文名稱，由 `GET /api/roles` 動態載入（F045） |
| 成功回饋 | 角色變更或旗標調整成功後顯示**單一**合併成功訊息（例如「角色已變更為使用者（User），業務主管權限已啟用」），清單立即更新對應欄位 |
| 錯誤回饋 | role 端點失敗時：dialog 保留，列表不更新；flag 端點失敗時：列表 role 已更新，提示 Admin 稍後重試旗標調整。最後 Admin 保護觸發時顯示明確錯誤訊息；後端對 Admin 帳號回 `ACCOUNT_FLAG_NOT_APPLICABLE` 視為前端策略失誤（BR-12 應已阻擋） |

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
- 合併 UX（變更角色 dialog 同時調整 role 與 `is_sales_manager`）不引入新的後端安全顧慮：兩個 PATCH 端點各自獨立驗證 RBAC（限 Admin）、目標帳號狀態（exists、最後 Admin、role 為 user 等）；前端僅做呼叫編排，不放大攻擊面，且後端 BR-9 防線（`ACCOUNT_FLAG_NOT_APPLICABLE`）仍對任何直接打 API 的客戶端有效

## 交叉參考

- User Story：[US-014-assign-change-role.md](../../stories/epics/E02-account-role-management/US-014-assign-change-role.md)
- Epic Brief：[E02 Epic Brief](../../stories/epics/E02-account-role-management/epic-brief.md)
- NFR：[NFR-001 安全性需求](../../stories/non-functional/NFR-001-security.md)
- 資料模型：[data-model.md](../data-model.md)
- 錯誤處理：[error-handling.md](../error-handling.md)
- 相關功能：F004、F005、F006、F045

## 更新紀錄

| 版本 | 日期 | 變更內容 |
|------|------|---------|
| 3.2 | 2026-05-13 | 合併 UX 決策：將原本「變更角色」與「切換業務主管旗標」兩個獨立操作整併為單一「變更角色 dialog」（內含 role select + sales-manager checkbox）。移除列表頁 toggle switch 與帳號詳細頁 toggle UI。新增 AC-11（合併呼叫順序與錯誤回滾）與 BR-12（前端合併呼叫策略）。後端維持兩個獨立 PATCH 端點不變；不新增複合 API。基於 prototypes/07-account-list.html Modal 5 / Modal 5b 最新版設計。 |
| 3.1 | 2026-04-24 | 新增業務主管旗標切換功能（AC-8 ~ AC-10、BR-9 ~ BR-11、`PATCH /api/accounts/:id/sales-manager-flag` 端點）。 |
