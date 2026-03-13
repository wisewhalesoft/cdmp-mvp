---
spec-id: F013
title: 編輯資料來源
feature-id: F013
source-story: US-022
epic: E03
priority: P0-MVP
version: "1.0"
date: 2026-03-06
status: Draft
---

# F013: 編輯資料來源

## 1. 功能摘要

提供系統管理員修改已存在的資料來源連線設定。編輯後系統重新加密憑證（若有更新）、重置連線狀態，並記錄變更至 audit log。

## 2. 使用者故事

**As a** 系統管理員（Admin）
**I want** 編輯已設定的資料來源連線資訊
**So that** 我可以更新連線參數（如主機位址變更、密碼輪替等）

## 3. 驗收標準

### AC-1: 成功編輯資料來源

- **Given** 管理員已登入且開啟某資料來源的編輯表單
- **When** 修改連線欄位（如 host、port、username 等）並提交
- **Then** 系統更新設定，新的憑證以 AES-256 加密儲存，顯示成功訊息，狀態重置為 `unknown`

### AC-2: 密碼欄位處理

- **Given** 管理員開啟資料來源編輯表單
- **When** 密碼欄位顯示為空白，placeholder 文字為「留空以保留現有密碼」
- **Then** 若密碼欄位保持空白提交，系統保留原有密碼不變；若填入新密碼，系統以 AES-256 加密後更新

### AC-3: 名稱唯一性檢查

- **Given** 系統中已存在名稱為「ProductionDB」的其他資料來源
- **When** 管理員將當前資料來源的名稱修改為「ProductionDB」
- **Then** 系統顯示錯誤訊息「此名稱的資料來源已存在」，不更新記錄

## 4. API 規格

### GET /api/datasources/:id

**說明：** 取得單一資料來源詳細資訊（用於載入編輯表單）。

**Response — 200 OK:**

```json
{
  "id": "uuid",
  "name": "string",
  "type": "mysql",
  "host": "string",
  "port": 3306,
  "databaseName": "string",
  "username": "string",
  "description": "string | null",
  "status": "connected",
  "lastTestedAt": "ISO 8601 | null",
  "createdAt": "ISO 8601",
  "updatedAt": "ISO 8601"
}
```

> 注意：Response 中不得包含 password 欄位。

### PUT /api/datasources/:id

**說明：** 更新資料來源設定。

**Request Headers:**

| Header        | 值                       | 必填 |
|---------------|--------------------------|------|
| Authorization | Bearer {token}           | 是   |
| Content-Type  | application/json         | 是   |

**Request Body:**

```json
{
  "name": "string (必填, 唯一, 最大 100 字元)",
  "type": "string (必填, enum: mysql | postgresql | sqlserver)",
  "host": "string (必填, 最大 255 字元)",
  "port": "integer (必填, 1-65535)",
  "databaseName": "string (必填, 最大 100 字元)",
  "username": "string (必填, 最大 100 字元)",
  "password": "string | null (選填，空值或 null 表示保留現有密碼)",
  "description": "string | null (選填, 最大 500 字元)"
}
```

**Response — 200 OK:**

```json
{
  "id": "uuid",
  "name": "string",
  "type": "mysql",
  "host": "string",
  "port": 3306,
  "databaseName": "string",
  "username": "string",
  "description": "string | null",
  "status": "unknown",
  "lastTestedAt": "ISO 8601 | null",
  "createdAt": "ISO 8601",
  "updatedAt": "ISO 8601"
}
```

**錯誤回應：**

| HTTP Status | 錯誤碼           | 說明                         |
|-------------|------------------|------------------------------|
| 400         | VALIDATION_ERROR | 欄位驗證失敗（附各欄位錯誤） |
| 404         | NOT_FOUND        | 資料來源不存在或已被刪除     |
| 409         | DUPLICATE_NAME   | 資料來源名稱已被其他記錄使用 |
| 403         | FORBIDDEN        | 非 Admin 角色無權限操作      |
| 401         | UNAUTHORIZED     | 未登入或 token 無效          |
| 500         | INTERNAL_ERROR   | 伺服器內部錯誤               |

## 5. 商業規則

| 規則編號 | 說明                                                                       |
|----------|----------------------------------------------------------------------------|
| BR-1     | 僅具備 Admin 角色的使用者可編輯資料來源                                    |
| BR-2     | 密碼欄位為空值或 null 時，保留資料庫中現有的加密密碼                       |
| BR-3     | 密碼欄位有值時，以 AES-256 加密後覆寫儲存                                 |
| BR-4     | 編輯成功後，狀態（status）一律重置為 `unknown`，促使管理員重新測試連線     |
| BR-5     | 名稱唯一性檢查須排除自身記錄（即允許保留原名稱）                           |
| BR-6     | 變更須記錄至 audit log，包含變更的欄位名稱，但不得記錄憑證值（password）   |
| BR-7     | 不可編輯已軟刪除的資料來源（返回 404）                                     |

## 6. UI/UX 需求

- 編輯表單預先填入現有資料（密碼欄位除外）
- 密碼欄位顯示空白，placeholder 為「留空以保留現有密碼」
- 密碼欄位使用密碼遮罩輸入（type="password"）
- 即時欄位驗證：離開欄位時檢查格式（與新增表單相同規則）
- 表單底部提供「儲存」與「取消」按鈕
- 取消操作：若有未儲存的變更，顯示確認對話框
- 儲存成功後導向資料來源清單頁面
- 提交期間顯示 loading 狀態，防止重複提交

## 7. 錯誤場景

| 場景                         | 系統回應                                               | 參考                          |
|------------------------------|--------------------------------------------------------|-------------------------------|
| 資料來源不存在或已被刪除     | HTTP 404，顯示「找不到指定的資料來源」                 | error-handling.md#not-found   |
| 名稱與其他資料來源重複       | 「此名稱的資料來源已存在」                             | error-handling.md#duplicate   |
| 必填欄位未填                 | 欄位下方顯示「此欄位為必填」                           | error-handling.md#validation  |
| port 非數值或超出範圍        | 「連接埠必須為 1 至 65535 之間的數字」                 | error-handling.md#validation  |
| 非 Admin 操作                | HTTP 403，「您沒有權限執行此操作」                     | error-handling.md#auth        |
| 並行編輯衝突（Optimistic Lock）| HTTP 409，「此資料來源已被其他人修改，請重新載入」    | error-handling.md#conflict    |

## 8. 相依性

- **F011（新增資料來源）：** 共用相同的表單驗證規則
- **F015（測試資料來源連線）：** 編輯後建議重新測試連線
- **F012（查看資料來源清單）：** 編輯入口來自清單頁面，儲存後返回清單
- **認證系統：** 需要有效的 Admin 登入 session/token

## 9. 資料需求

- 資料來源實體（Datasource Entity）：參見 `data-model.md#datasource-entity`
- 編輯時更新 `updatedAt` 時間戳記
- 狀態重置：`status` 設為 `unknown`，`lastTestedAt` 保留不變
- Audit log 記錄：操作者、操作時間、變更欄位列表（不含憑證值）

## 10. 安全性考量

- 密碼以 AES-256 加密儲存（參見 NFR-001）
- API 回應中永遠不得包含密碼
- Audit log 不得記錄密碼的新值或舊值
- 操作僅限 Admin 角色，非 Admin 回傳 HTTP 403
- 所有輸入須經伺服器端驗證

## 11. 效能需求

- GET /api/datasources/:id 回應時間：< 200ms
- PUT /api/datasources/:id 回應時間：< 500ms

## 12. 交叉參考

- 資料模型：[data-model.md#datasource-entity](../data-model.md#datasource-entity)
- 錯誤處理：[error-handling.md](../error-handling.md)
- 非功能需求：[nfr.md#NFR-001](../nfr.md#NFR-001)
- 流程圖：[diagrams/F013-edit-datasource.mmd](../diagrams/F013-edit-datasource.mmd)
- 相關功能：[F011](F011-add-datasource.md)、[F012](F012-list-datasources.md)、[F015](F015-test-datasource-connection.md)
