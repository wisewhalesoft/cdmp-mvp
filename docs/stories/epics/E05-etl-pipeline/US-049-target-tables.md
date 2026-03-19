# US-049：目標表 Domain-Oriented 規劃

> **Story ID**：US-049
> **Epic**：[E05 — ETL Pipeline 管理](epic-brief.md)
> **優先級**：Could Have
> **階段**：Phase 1（MVP）
> **預估點數**：5

---

## User Story

**As a** Admin（管理者）
**I want** 在 Load 節點中選擇預先定義的目標表，並進行欄位對應
**So that** ETL 處理後的資料能正確載入到 Domain-Oriented 的目標表中，為未來 Data Mesh 架構奠定基礎

---

## 驗收標準

### AC-1：目標表清單 API
- **Given** 系統已預先定義 4 個 Domain Data Product 目標表
- **When** 我呼叫目標表清單 API
- **Then** 系統回傳所有目標表的名稱、顯示名稱、所屬 Domain、欄位數量與描述

### AC-2：目標表 Schema API
- **Given** 我需要了解某個目標表的詳細結構
- **When** 我呼叫指定目標表的 Schema API
- **Then** 系統回傳該表的所有欄位定義，包含欄位名稱、型別、是否可為 null、是否為主鍵、描述

### AC-3：Load 節點選擇目標表
- **Given** 我在 Pipeline 編輯器中新增或編輯 Load 節點
- **When** 我開啟目標表選擇器
- **Then** 系統列出所有可用目標表，選擇後自動載入該表的欄位定義

### AC-4：欄位對應介面
- **Given** 我已選擇目標表
- **When** 系統顯示欄位對應介面
- **Then** 左側顯示來源欄位（上游節點輸出），右側顯示目標表欄位，支援拖曳或下拉選單進行一對一對應

### AC-5：ETL 追蹤欄位自動填充
- **Given** 目標表包含 `data_source`、`_etl_loaded_at`、`_etl_pipeline_id` 追蹤欄位
- **When** ETL Pipeline 執行 Load 步驟
- **Then** 系統自動填充這三個追蹤欄位，無需使用者手動對應

### AC-6：4 類目標表 Schema 預定義正確
- **Given** 系統初始化完成
- **When** 查詢目標表清單
- **Then** 包含 `customer_core`、`customer_interaction`、`customer_financial`、`customer_service` 四個目標表，各表欄位定義正確

---

## Technical Notes

- 採用 Domain-Oriented 設計，4 個 Domain Data Product
- 系統預先定義 schema，Load 節點直接選擇目標表
- 為未來 Data Mesh 擴展預留架構空間（每個 Domain 可獨立演進 schema）

### 端點

- `GET /api/v1/etl/target-tables` — 取得所有目標表清單
- `GET /api/v1/etl/target-tables/:tableName/schema` — 取得指定目標表的 schema

### Target Tables Response

```json
{
  "data": [
    {
      "tableName": "customer_core",
      "displayName": "Customer Core（身分/主檔）",
      "domain": "core",
      "columnCount": 16,
      "description": "客戶基本身分與主檔資料"
    }
  ]
}
```

### Schema Response

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
      "description": "客戶唯一識別碼"
    }
  ]
}
```

### 目標表定義

#### 1. Customer Core（身分/主檔）— `customer_core`

| 欄位名稱 | 型別 | 說明 |
|----------|------|------|
| customer_id | UUID PK | 客戶唯一識別碼 |
| id_number | VARCHAR | 身分證號（加密） |
| name | VARCHAR | 姓名 |
| gender | VARCHAR | 性別 |
| date_of_birth | DATE | 生日 |
| phone | VARCHAR | 電話 |
| email | VARCHAR | Email |
| address | TEXT | 地址 |
| occupation | VARCHAR | 職業 |
| company_name | VARCHAR | 公司名稱 |
| customer_type | ENUM: individual/corporate | 客戶類型 |
| registration_date | TIMESTAMP | 建檔日期 |
| data_source | VARCHAR | 資料來源 |
| last_updated_at | TIMESTAMP | 最後更新時間 |
| _etl_loaded_at | TIMESTAMP | ETL 載入時間 |
| _etl_pipeline_id | UUID | 載入的 Pipeline ID |

#### 2. Customer Interaction（行為/接觸）— `customer_interaction`

| 欄位名稱 | 型別 | 說明 |
|----------|------|------|
| interaction_id | UUID PK | 互動唯一識別碼 |
| customer_id | UUID FK | 關聯客戶 |
| interaction_type | ENUM: call/email/sms/visit/app/web/dm | 接觸類型 |
| channel | VARCHAR | 通路 |
| direction | ENUM: inbound/outbound | 方向 |
| interaction_date | TIMESTAMP | 接觸時間 |
| campaign_id | VARCHAR | 行銷活動 ID |
| campaign_name | VARCHAR | 行銷活動名稱 |
| response_status | VARCHAR | 回應狀態 |
| content_summary | TEXT | 內容摘要 |
| agent_id | VARCHAR | 處理人員 |
| data_source | VARCHAR | 資料來源 |
| _etl_loaded_at | TIMESTAMP | ETL 載入時間 |
| _etl_pipeline_id | UUID | 載入的 Pipeline ID |

#### 3. Customer Financial（交易/風控）— `customer_financial`

| 欄位名稱 | 型別 | 說明 |
|----------|------|------|
| financial_id | UUID PK | 財務記錄唯一識別碼 |
| customer_id | UUID FK | 關聯客戶 |
| contract_id | VARCHAR | 合約編號 |
| contract_type | ENUM: loan/lease | 合約類型（貸款/租賃） |
| vehicle_model | VARCHAR | 車型 |
| vehicle_year | INTEGER | 車輛年份 |
| principal_amount | DECIMAL | 本金金額 |
| monthly_payment | DECIMAL | 月付金 |
| interest_rate | DECIMAL | 利率 |
| term_months | INTEGER | 期數 |
| payment_status | ENUM: current/overdue/default/closed | 還款狀態 |
| overdue_days | INTEGER | 逾期天數 |
| overdue_amount | DECIMAL | 逾期金額 |
| credit_score | INTEGER | 信用評分 |
| risk_level | ENUM: low/medium/high/critical | 風險等級 |
| contract_start_date | DATE | 合約起始日 |
| contract_end_date | DATE | 合約結束日 |
| data_source | VARCHAR | 資料來源 |
| _etl_loaded_at | TIMESTAMP | ETL 載入時間 |
| _etl_pipeline_id | UUID | 載入的 Pipeline ID |

#### 4. Customer Service（客服/申訴）— `customer_service`

| 欄位名稱 | 型別 | 說明 |
|----------|------|------|
| service_id | UUID PK | 服務案件唯一識別碼 |
| customer_id | UUID FK | 關聯客戶 |
| case_number | VARCHAR | 案件編號 |
| case_type | ENUM: inquiry/complaint/request/dispute | 案件類型 |
| category | VARCHAR | 分類 |
| priority | ENUM: low/medium/high/urgent | 優先級 |
| status | ENUM: open/in_progress/resolved/closed | 狀態 |
| channel | VARCHAR | 進件通路 |
| description | TEXT | 案件描述 |
| resolution | TEXT | 處理結果 |
| assigned_to | VARCHAR | 指派人員 |
| opened_at | TIMESTAMP | 建立時間 |
| resolved_at | TIMESTAMP | 解決時間 |
| satisfaction_score | INTEGER | 滿意度（1-5） |
| data_source | VARCHAR | 資料來源 |
| _etl_loaded_at | TIMESTAMP | ETL 載入時間 |
| _etl_pipeline_id | UUID | 載入的 Pipeline ID |

### 共通 ETL 追蹤欄位

每個目標表都包含以下 3 個追蹤欄位，由系統自動填充：

| 欄位 | 說明 |
|------|------|
| `data_source` | 資料來源識別 |
| `_etl_loaded_at` | ETL 載入時間（自動記錄） |
| `_etl_pipeline_id` | 執行載入的 Pipeline ID（自動記錄） |

---

## 測試案例

| # | 測試案例 | 預期結果 |
|---|---------|---------|
| 1 | 呼叫目標表清單 API | 回傳 4 個目標表，各含名稱、Domain、欄位數量 |
| 2 | 呼叫 customer_core Schema API | 回傳 16 個欄位定義，型別與描述正確 |
| 3 | 呼叫 customer_interaction Schema API | 回傳 14 個欄位定義，型別與描述正確 |
| 4 | 呼叫 customer_financial Schema API | 回傳 20 個欄位定義，型別與描述正確 |
| 5 | 呼叫 customer_service Schema API | 回傳 17 個欄位定義，型別與描述正確 |
| 6 | 在 Load 節點選擇目標表 | 自動載入目標表欄位定義 |
| 7 | 進行來源欄位與目標欄位對應 | 支援拖曳或下拉選單一對一對應 |
| 8 | 執行 Pipeline 的 Load 步驟 | ETL 追蹤欄位自動填充，無需手動對應 |
| 9 | 呼叫不存在的目標表 Schema API | 回傳 404 Not Found |

---

## 依賴關係

- **Blocked By**：US-042（需有編輯器支援 Load 節點）
- **Blocks**：無

---

## Definition of Done

- [ ] 目標表清單 API 實作完成並通過單元測試
- [ ] 目標表 Schema API 實作完成並通過單元測試
- [ ] 4 個目標表 schema 預定義正確（customer_core、customer_interaction、customer_financial、customer_service）
- [ ] 前端 Load 節點目標表選擇器實作完成
- [ ] 前端欄位對應介面實作完成
- [ ] ETL 追蹤欄位自動填充邏輯實作完成
- [ ] 架構預留 Data Mesh 擴展空間
- [ ] E2E 測試通過

---

## 相關文件

- **Epic Brief**：[E05 Epic Brief](epic-brief.md)
