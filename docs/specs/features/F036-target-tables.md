---
spec-id: F036
title: 目標表 Domain-Oriented 規劃
feature-id: F036
source-story: US-049
epic: E05
priority: P0-MVP
version: "1.0"
date: 2026-03-19
status: Draft
---

# F036: 目標表 Domain-Oriented 規劃

## 1. 功能摘要

系統預先定義 4 個 Domain-Oriented 目標表（customer_core / customer_interaction / customer_financial / customer_service），提供 API 查詢目標表清單與 schema。Load 節點可選擇目標表並進行欄位對應，ETL 追蹤欄位（data_source / _etl_loaded_at / _etl_pipeline_id）由系統自動填充。

## 2. 使用者故事

**As a** Admin（管理者）
**I want** 在 Load 節點中選擇預先定義的目標表，並進行欄位對應
**So that** ETL 處理後的資料能正確載入到 Domain-Oriented 的目標表中

## 3. 前置條件

- Admin 已登入且具備 Admin 權限
- 系統已透過 migration 預先建立 4 個目標表

## 4. 驗收標準

### AC-1: 目標表清單 API

- **Given** 系統已預先定義 4 個 Domain Data Product 目標表
- **When** 呼叫目標表清單 API
- **Then** 系統回傳所有目標表的名稱、顯示名稱、所屬 Domain、欄位數量與描述

### AC-2: 目標表 Schema API

- **Given** 需要了解某個目標表的詳細結構
- **When** 呼叫指定目標表的 Schema API
- **Then** 系統回傳該表的所有欄位定義，包含欄位名稱、型別、是否可為 null、是否為主鍵、描述

### AC-3: Load 節點選擇目標表

- **Given** Admin 在 Pipeline 編輯器中新增或編輯 Load 節點
- **When** 開啟目標表選擇器
- **Then** 系統列出所有可用目標表，選擇後自動載入該表的欄位定義

### AC-4: 欄位對應介面

- **Given** Admin 已選擇目標表
- **When** 系統顯示欄位對應介面
- **Then** 左側顯示來源欄位（上游節點輸出），右側顯示目標表欄位，支援拖曳或下拉選單進行一對一對應

### AC-5: ETL 追蹤欄位自動填充

- **Given** 目標表包含 `data_source`、`_etl_loaded_at`、`_etl_pipeline_id` 追蹤欄位
- **When** ETL Pipeline 執行 Load 步驟
- **Then** 系統自動填充這三個追蹤欄位，無需使用者手動對應

### AC-6: 4 類目標表 Schema 預定義正確

- **Given** 系統初始化完成
- **When** 查詢目標表清單
- **Then** 包含 `customer_core`（16 欄位）、`customer_interaction`（14 欄位）、`customer_financial`（20 欄位）、`customer_service`（17 欄位）四個目標表，各表欄位定義正確

## 5. 主要流程

1. Admin 在 Pipeline 編輯器中新增 Load 節點
2. Admin 點擊 Load 節點，右側屬性面板載入
3. Admin 從目標表下拉選單選擇一個目標表
4. 系統自動載入該目標表的欄位定義
5. Admin 進行來源欄位與目標欄位的一對一對應
6. ETL 追蹤欄位（data_source / _etl_loaded_at / _etl_pipeline_id）標示為「系統自動填充」，不需手動對應

## 6. 替代流程

- 無

## 7. 邊界情況

- 查詢不存在的目標表名稱：回傳 404
- 追蹤欄位在欄位對應介面中以灰色標示，無法手動對應

## 8. API 規格

### GET /api/v1/etl/target-tables

**Request Headers:**

| Header        | 值                       | 必填 |
|---------------|--------------------------|------|
| Authorization | Bearer {token}           | 是   |

**Response -- 200 OK:**

```json
{
  "data": [
    {
      "tableName": "customer_core",
      "displayName": "Customer Core（身分/主檔）",
      "domain": "core",
      "columnCount": 16,
      "description": "客戶基本身分與主檔資料"
    },
    {
      "tableName": "customer_interaction",
      "displayName": "Customer Interaction（行為/接觸）",
      "domain": "interaction",
      "columnCount": 14,
      "description": "客戶行為與接觸紀錄"
    },
    {
      "tableName": "customer_financial",
      "displayName": "Customer Financial（交易/風控）",
      "domain": "financial",
      "columnCount": 20,
      "description": "交易與風控資料"
    },
    {
      "tableName": "customer_service",
      "displayName": "Customer Service（客服/申訴）",
      "domain": "service",
      "columnCount": 17,
      "description": "客服與申訴案件"
    }
  ]
}
```

### GET /api/v1/etl/target-tables/:tableName/schema

**Request Headers:**

| Header        | 值                       | 必填 |
|---------------|--------------------------|------|
| Authorization | Bearer {token}           | 是   |

**Response -- 200 OK:**

```json
{
  "tableName": "customer_core",
  "displayName": "Customer Core（身分/主檔）",
  "columns": [
    {
      "name": "customer_id",
      "type": "UUID",
      "nullable": false,
      "isPrimaryKey": true,
      "isEtlTracking": false,
      "description": "客戶唯一識別碼"
    },
    {
      "name": "_etl_loaded_at",
      "type": "TIMESTAMP",
      "nullable": false,
      "isPrimaryKey": false,
      "isEtlTracking": true,
      "description": "ETL 載入時間（系統自動填充）"
    }
  ]
}
```

**錯誤回應：**

| HTTP Status | 錯誤碼                           | 說明                               |
|-------------|----------------------------------|------------------------------------|
| 404         | PIPELINE_TARGET_TABLE_NOT_FOUND  | 目標表不存在                       |
| 403         | AUTH_FORBIDDEN                   | 非 Admin 角色無權限操作            |
| 401         | AUTH_TOKEN_MISSING               | 未登入或 Token 無效                |

## 9. 商業規則

| 規則編號 | 說明 |
|----------|------|
| BR-1 | 目標表由系統 migration 預先建立，不由 Admin 手動建立 |
| BR-2 | ETL 追蹤欄位（data_source / _etl_loaded_at / _etl_pipeline_id）由系統自動填充 |
| BR-3 | Load 節點執行時使用 UPSERT 策略（以主鍵判斷 INSERT 或 UPDATE） |
| BR-4 | 目標表 schema 為靜態定義，不支援 Admin 自訂欄位 |
| BR-5 | 為未來 Data Mesh 擴展預留架構空間 |

## 10. UI/UX 需求

- Load 節點右側屬性面板：目標表下拉選單（含 Domain 分類標籤）
- 選擇目標表後顯示欄位對應介面：左右兩欄，左側來源欄位、右側目標欄位
- 支援拖曳或下拉選單進行欄位對應
- ETL 追蹤欄位以灰色標示「系統自動填充」，不可手動對應
- 必填欄位（isPrimaryKey=true 且 nullable=false）以紅色星號標示

## 11. 錯誤場景

| 場景                         | 系統回應                                             | 參考                                    |
|------------------------------|------------------------------------------------------|-----------------------------------------|
| 目標表不存在                 | HTTP 404，「找不到指定的目標表」                     | error-handling.md#etl-pipeline-errors    |
| 非 Admin 操作                | HTTP 403，「您沒有權限執行此操作」                   | error-handling.md#auth-errors            |

## 12. 相依性

- **F029（Pipeline 編輯器）**：Load 節點需要目標表選擇
- **認證系統**：需要有效的 Admin 登入 Session/Token

## 13. 資料需求

- 目標表：參見 [data-model.md#target-tables](../data-model.md#target-tables)

## 14. 交叉參考

- 資料模型：[data-model.md#target-tables](../data-model.md#target-tables)
- 錯誤處理：[error-handling.md#etl-pipeline-errors](../error-handling.md#etl-pipeline-errors)
- 相關功能：[F029](F029-pipeline-editor.md)、[F030](F030-execute-pipeline.md)
