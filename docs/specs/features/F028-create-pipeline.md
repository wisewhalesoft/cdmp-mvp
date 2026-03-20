---
spec-id: F028
title: 建立 Pipeline
feature-id: F028
source-story: US-041
epic: E05
priority: P0-MVP
version: "1.0"
date: 2026-03-19
status: Draft
---

# F028: 建立 Pipeline

## 1. 功能摘要

提供 Admin 建立新 ETL Pipeline 的功能。Admin 填寫名稱、描述與排程設定後，系統建立一個狀態為 `draft`、版本為 1 的 Pipeline，並導向 Pipeline 編輯器頁面。

## 2. 使用者故事

**As a** Admin（管理者）
**I want** 建立新的 ETL Pipeline，填寫名稱、描述與排程設定
**So that** 我能開始定義資料轉換流程

## 3. 前置條件

- Admin 已登入且具備 Admin 權限

## 4. 驗收標準

### AC-1: 成功建立 Pipeline

- **Given** Admin 在 Pipeline 列表頁面點擊「建立 Pipeline」按鈕
- **When** 填寫名稱（必填）、描述（選填）、排程設定（選填）後送出表單
- **Then** 系統建立新的 Pipeline，`status` 為 `draft`，`version` 為 1，`enabled` 為 `false`，並導向 Pipeline 編輯器頁面

### AC-2: 名稱唯一驗證

- **Given** 系統中已存在名為「客戶資料同步」的 Pipeline（未軟刪除）
- **When** Admin 嘗試建立同名的 Pipeline
- **Then** 系統顯示「此名稱的 Pipeline 已存在」錯誤訊息，不建立重複項目

### AC-3: 排程設定

- **Given** Admin 在建立 Pipeline 表單中
- **When** 設定排程
- **Then** 可使用 Cron UI 選擇器（選擇頻率、時間）或手動輸入 Cron 表達式，並即時預覽下次執行時間

### AC-4: 欄位驗證

- **Given** Admin 在建立 Pipeline 表單
- **When** Admin 提交表單時名稱為空
- **Then** 系統顯示「此欄位為必填」的驗證錯誤訊息

### AC-5: 建立後同時建立初始版本

- **Given** Admin 成功建立新 Pipeline
- **When** 系統完成建立
- **Then** 系統同時建立一筆 EtlPipelineVersion（version=1, status=draft, definition 為空結構 `{"nodes":[],"edges":[]}` ）

## 5. 主要流程

1. Admin 在 Pipeline 列表頁面點擊「建立 Pipeline」按鈕
2. 系統顯示建立 Pipeline 對話框或表單
3. Admin 填寫必填欄位：
   - Pipeline 名稱（必填，最大 255 字元）
   - 描述（選填）
   - 排程設定（選填，Cron 表達式）
4. Admin 點擊「建立」
5. 系統執行欄位驗證
6. 系統檢查名稱唯一性
7. 系統儲存 Pipeline，設定 `status = 'draft'`、`enabled = false`、`version = 1`
8. 系統同時建立初始 EtlPipelineVersion（version=1, status=draft）
9. 系統導向該 Pipeline 的編輯器頁面（F029）

## 6. 替代流程

- **不設定排程**：Admin 可不填排程欄位，後續透過編輯或版本發布後再設定

## 7. 邊界情況

- 名稱唯一性僅在未軟刪除的記錄中檢查（`deleted_at IS NULL`）
- Cron 表達式以 UTC 時區解析
- 若輸入無效的 Cron 表達式，顯示格式錯誤提示

## 8. API 規格

### POST /api/v1/etl/pipelines

**Request Headers:**

| Header        | 值                       | 必填 |
|---------------|--------------------------|------|
| Authorization | Bearer {token}           | 是   |
| Content-Type  | application/json         | 是   |

**Request Body:**

```json
{
  "name": "string (必填, 唯一, 最大 255 字元)",
  "description": "string (選填)",
  "schedule": "string (選填, 合法 cron 表達式)"
}
```

**Response -- 201 Created:**

```json
{
  "id": "uuid",
  "name": "string",
  "description": "string | null",
  "version": 1,
  "stepCount": 0,
  "status": "draft",
  "schedule": "string | null",
  "enabled": false,
  "createdBy": "uuid",
  "createdAt": "ISO 8601",
  "updatedAt": "ISO 8601"
}
```

**錯誤回應：**

| HTTP Status | 錯誤碼                 | 說明                               |
|-------------|------------------------|------------------------------------|
| 422         | VALIDATION_ERROR       | 欄位驗證失敗（附各欄位錯誤）       |
| 409         | PIPELINE_NAME_EXISTS   | Pipeline 名稱已存在                |
| 422         | VALIDATION_INVALID_CRON | 排程格式不正確                    |
| 403         | AUTH_FORBIDDEN         | 非 Admin 角色無權限操作            |
| 401         | AUTH_TOKEN_MISSING     | 未登入或 Token 無效                |
| 500         | SYSTEM_INTERNAL_ERROR  | 伺服器內部錯誤                     |

## 9. 商業規則

| 規則編號 | 說明 |
|----------|------|
| BR-1 | 僅具備 Admin 角色的使用者可建立 Pipeline |
| BR-2 | Pipeline 名稱在未刪除記錄中必須唯一 |
| BR-3 | 建立時 `status` 預設為 `draft`，`enabled` 預設為 `false`，`version` 預設為 `1` |
| BR-4 | Cron 表達式必須符合標準格式（5 或 6 欄位），使用 `cron-parser` 或同等套件驗證 |
| BR-5 | 時區處理：後端儲存 UTC 時間，cron 表達式以 UTC 時區解析 |
| BR-6 | 建立時同時建立初始 EtlPipelineVersion |

## 10. UI/UX 需求

- 建立表單包含以下欄位：Pipeline 名稱（必填）、描述（選填，多行文字）、排程設定（選填，Cron 表達式 + UI 選擇器）
- Cron UI 選擇器：選擇頻率（每小時/每日/每週/每月）與時間，自動產生 Cron 表達式
- Cron 表達式旁顯示人類可讀的排程說明（例：「每日凌晨 2:00 UTC」）與下次執行時間預覽
- 即時欄位驗證：離開欄位時檢查格式
- 提交按鈕在名稱未填寫時保持 disabled 狀態
- 成功後導向 Pipeline 編輯器頁面
- 表單提交期間顯示 loading 狀態，防止重複提交

## 11. 錯誤場景

| 場景                         | 系統回應                                             | 參考                                    |
|------------------------------|------------------------------------------------------|-----------------------------------------|
| 名稱未填                     | 欄位下方顯示「此欄位為必填」                         | error-handling.md#validation-errors      |
| Pipeline 名稱重複            | 「此名稱的 Pipeline 已存在」                         | error-handling.md#etl-pipeline-errors    |
| Cron 表達式格式錯誤          | 「排程格式不正確，請輸入合法的 cron 表達式」         | error-handling.md#validation-errors      |
| 非 Admin 操作                | HTTP 403，「您沒有權限執行此操作」                   | error-handling.md#auth-errors            |
| 伺服器錯誤                   | 「系統發生非預期錯誤，請稍後再試」                   | error-handling.md#system-errors          |

## 12. 相依性

- **認證系統**：需要有效的 Admin 登入 Session/Token
- 封鎖：F029, F031, F034

## 13. 資料需求

- EtlPipeline 實體：參見 [data-model.md#etl-pipeline-entity](../data-model.md#etl-pipeline-entity)
- EtlPipelineVersion 實體：參見 [data-model.md#etl-pipeline-version-entity](../data-model.md#etl-pipeline-version-entity)
- 新增記錄時自動設定 `created_at`、`updated_at` 時間戳記
- `created_by` 記錄建立者的 User ID

## 14. 交叉參考

- 資料模型：[data-model.md#etl-pipeline-entity](../data-model.md#etl-pipeline-entity)
- 錯誤處理：[error-handling.md#etl-pipeline-errors](../error-handling.md#etl-pipeline-errors)
- 非功能需求：[nfr.md](../nfr.md)
- 相關功能：[F027](F027-pipeline-list.md)、[F029](F029-pipeline-editor.md)
