---
spec-id: F011
title: 新增資料來源
feature-id: F011
source-story: US-020
epic: E03
priority: P0-MVP
version: "1.0"
date: 2026-03-06
status: Draft
---

# F011: 新增資料來源

## 1. 功能摘要

提供系統管理員新增資料庫連線作為資料來源的功能。管理員填寫連線資訊後，系統驗證輸入、加密憑證並儲存設定，使該資料來源可供後續資料同步與查詢使用。

## 2. 使用者故事

**As a** 系統管理員（Admin）
**I want** 新增一個資料庫連線作為資料來源
**So that** 平台可以連接外部資料庫以匯入與管理客戶資料

## 3. 驗收標準

### AC-1: 成功新增資料來源

- **Given** 管理員已登入且具備 Admin 權限，並進入新增資料來源頁面
- **When** 填寫所有必填欄位（name、type、host、port、database_name、username、password）並提交
- **Then** 系統儲存資料來源設定，密碼以 AES-256 加密儲存，顯示成功訊息，該資料來源出現在資料來源清單中

### AC-2: 名稱重複驗證

- **Given** 系統中已存在名稱為「ProductionDB」的資料來源
- **When** 管理員嘗試以相同名稱「ProductionDB」新增資料來源
- **Then** 系統顯示錯誤訊息「此名稱的資料來源已存在」，不建立新記錄

### AC-3: 欄位驗證

- **Given** 管理員在新增表單中輸入資料
- **When** 提交的資料不符合驗證規則（例如 port 非數值、host 為空）
- **Then** 系統針對每個不合規欄位顯示對應的錯誤訊息，不提交表單

## 4. API 規格

### POST /api/datasources

**說明：** 新增一個資料來源設定。

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
  "password": "string (必填)",
  "description": "string (選填, 最大 500 字元)"
}
```

**Response — 201 Created:**

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
  "lastTestedAt": null,
  "createdAt": "ISO 8601",
  "updatedAt": "ISO 8601"
}
```

> 注意：Response 中不得包含 password 欄位。

**錯誤回應：**

| HTTP Status | 錯誤碼               | 說明                         |
|-------------|----------------------|------------------------------|
| 400         | VALIDATION_ERROR     | 欄位驗證失敗（附各欄位錯誤） |
| 409         | DUPLICATE_NAME       | 資料來源名稱已存在           |
| 403         | FORBIDDEN            | 非 Admin 角色無權限操作      |
| 401         | UNAUTHORIZED         | 未登入或 token 無效          |
| 500         | INTERNAL_ERROR       | 伺服器內部錯誤               |

## 5. 商業規則

| 規則編號 | 說明                                                                 |
|----------|----------------------------------------------------------------------|
| BR-1     | 僅具備 Admin 角色的使用者可新增資料來源                              |
| BR-2     | 資料來源名稱在系統內必須唯一（不區分大小寫）                        |
| BR-3     | 密碼必須以 AES-256 加密後儲存，任何 API 回應均不得包含明文密碼      |
| BR-4     | 支援的資料庫類型：mysql、postgresql、sqlserver                       |
| BR-5     | 各類型預設 port：MySQL=3306、PostgreSQL=5432、SQL Server=1433        |
| BR-6     | 新增後資料來源狀態預設為 `unknown`                                   |
| BR-7     | 新增成功後可選擇自動觸發連線測試（參見 F015）                       |

## 6. UI/UX 需求

- 表單包含以下欄位：名稱、類型（下拉選單）、主機位址、連接埠、資料庫名稱、使用者名稱、密碼、描述（選填）
- 選擇資料庫類型後，自動帶入對應的預設 port
- 密碼欄位使用密碼遮罩輸入（type="password"）
- 即時欄位驗證：離開欄位時檢查格式
- 提交按鈕在必填欄位未填寫完成時保持 disabled 狀態
- 成功後導向資料來源清單頁面
- 表單提交期間顯示 loading 狀態，防止重複提交

## 7. 錯誤場景

| 場景                   | 系統回應                                               | 參考                          |
|------------------------|--------------------------------------------------------|-------------------------------|
| 必填欄位未填           | 欄位下方顯示「此欄位為必填」                           | error-handling.md#validation  |
| port 非數值或超出範圍  | 「連接埠必須為 1 至 65535 之間的數字」                 | error-handling.md#validation  |
| 名稱重複               | 「此名稱的資料來源已存在」                             | error-handling.md#duplicate   |
| 非 Admin 操作          | HTTP 403，「您沒有權限執行此操作」                     | error-handling.md#auth        |
| 伺服器錯誤             | 「系統發生錯誤，請稍後再試」                           | error-handling.md#server      |

## 8. 相依性

- **F015（測試資料來源連線）：** 新增後可選擇自動觸發連線測試
- **F012（查看資料來源清單）：** 新增成功後導向清單頁面
- **認證系統：** 需要有效的 Admin 登入 session/token

## 9. 資料需求

- 資料來源實體（Datasource Entity）：參見 `data-model.md#datasource-entity`
- 密碼欄位儲存加密後的值，加密金鑰管理須符合 NFR-001
- 新增記錄時自動設定 `createdAt`、`updatedAt` 時間戳記

## 10. 安全性考量

- 密碼以 AES-256 加密儲存，加密金鑰透過環境變數或金鑰管理服務取得（參見 NFR-001）
- API 回應中永遠不得包含密碼（無論加密與否）
- 操作僅限 Admin 角色，非 Admin 回傳 HTTP 403
- 所有輸入須經伺服器端驗證，防止 SQL Injection 與 XSS
- 新增操作須記錄 audit log（不含憑證值）

## 11. 效能需求

- API 回應時間：< 500ms（不含選填的連線測試）
- 名稱唯一性檢查須使用資料庫索引以確保查詢效能

## 12. 交叉參考

- 資料模型：[data-model.md#datasource-entity](../data-model.md#datasource-entity)
- 錯誤處理：[error-handling.md](../error-handling.md)
- 非功能需求：[nfr.md#NFR-001](../nfr.md#NFR-001)
- 流程圖：[diagrams/F011-add-datasource.mmd](../diagrams/F011-add-datasource.mmd)
- 相關功能：[F012](F012-list-datasources.md)、[F015](F015-test-datasource-connection.md)
