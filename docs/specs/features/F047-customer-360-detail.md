---
spec-id: F047
title: Customer 360 — 單一客戶詳情
feature-id: F047
source-story: US-061
epic: E06
priority: P0-MVP
version: "1.0"
date: 2026-04-13
status: Draft
---

# F047: Customer 360 — 單一客戶詳情

Priority: P0-MVP | Status: Draft | Last Updated: 2026-04-13

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + `data-model.md#customer-core-entity` + `error-handling.md#c360-errors` |
| QA / Tester | 本文件 + `error-handling.md#c360-errors` |
| UI/UX Designer | 本文件（第 8 節 UI/UX 需求） |
| Architect | 本文件 + `nfr.md#NFR-002` + `data-model.md#customer-core-entity` |

---

## 1. 功能摘要

提供已登入使用者（Admin / User）查看單一客戶的完整 360 側寫。系統以 `customer_id` 查詢 `customer_core` 目標表，將全部 85 個欄位組織為 8 個資料分類回傳。支援 code/desc 格式顯示、NULL 值處理、風控旗標高亮、客戶類型適應顯示、ETL 資料新鮮度警告，以及依角色的敏感資料遮罩。

## 2. 使用者故事

**As a** 已登入的使用者（Admin 或 User）
**I want** 查看單一客戶的完整 360 側寫，包含身分識別、個人屬性、聯絡資訊、地址、職業就業、財務風控、企業資訊等所有維度
**So that** 我能在一個頁面上獲取客戶的完整樣貌，做出更準確的業務判斷或服務決策

## 3. 前置條件

- 使用者已通過驗證（E01），持有有效 JWT Token
- `customer_core` 目標表已建立且 Schema 已更新至 85 欄位版本（F036 v2.4）
- `customer_core` 表中存在目標客戶資料（由 ETL Pipeline 載入）

## 4. 驗收標準

### AC-1：頁面標題與頂部摘要

- Given 使用者從客戶清單（F046）點擊進入某客戶的 360 檢視頁面
- When 頁面載入完成
- Then 頂部顯示客戶摘要 Header：客戶姓名/企業名稱、客戶類型 Badge、客戶編號（Admin 明碼 / User 遮罩），以及「返回清單」按鈕

### AC-2：8 個資料分類顯示

- Given 頁面載入完成
- When 系統從 customer_core 讀取該客戶資料
- Then 頁面以分類卡片或 Accordion 方式，顯示以下 8 個資料分類（對應 customer_core A~H 欄位群組）：
  1. **A. 識別與分類** — customer_id、source_customer_no（User 遮罩）、customer_type_code/desc、name、english_name
  2. **B. 個人屬性** — gender、date_of_birth、marital_status_code/desc、education_code/desc、spouse_name、father_name、mother_name、id_issue_type、id_issue_date、id_issue_address、driver_license
  3. **C. 聯絡資訊** — mobile_phone（User 遮罩）、home_phone（User 遮罩）、contact_phone（User 遮罩）、office_phone（User 遮罩）、registered_phone、registered_fax、business_fax、business_mobile、email（User 遮罩）、line_account
  4. **D. 地址** — residential_zip/address、mailing_zip/address、registered_zip/address、company_zip/address、maturity_mailing_zip/address
  5. **E. 職業與就業** — company_name、occupation_code/desc、job_title_code/desc、job_level_code/desc、industry_code/desc、work_years、company_scale、role
  6. **F. 財務與風控** — monthly_income_code/desc、approved_income、income_source_code/desc、capital、credit_limit、highest_transaction_amount、highest_transaction_date、has_real_estate、debt_flag、fine_flag、address_anomaly_flag、mainland_flag
  7. **G. 企業客戶專屬** — owner_name、owner_id、owner_birth、owner_zip、owner_address、established_capital、employee_count_code/desc、is_listed_code/desc、group_owner、business_item、organization_type、parent_customer_id、parent_customer_name
  8. **H. 稽核與 ETL 追蹤** — source_created_at、source_updated_at、data_source、_etl_loaded_at、_etl_pipeline_id

### AC-3：code/desc 欄位顯示格式

- Given customer_core 包含 `_code` / `_desc` 欄位對
- When 頁面顯示客戶資料
- Then 顯示格式為「描述（代碼）」，例如「個人（01）」
- And 若 `_desc` 為 NULL 但 `_code` 有值，僅顯示代碼值
- And 若 `_code` 與 `_desc` 均為 NULL，顯示「—」

### AC-4：NULL 欄位顯示

- Given 某欄位值為 NULL 或空白
- When 頁面顯示該欄位
- Then 顯示「—」（em dash，Unicode U+2014），不顯示空白、null 或 undefined 字串

### AC-5：風控旗標高亮 [G-08 已解決]

- Given 客戶的 `debt_flag` 或 `fine_flag` 欄位值為 `'Y'`
- When F. 財務與風控分類顯示
- Then 對應旗標以警告色（`#F59E0B`）Badge 醒目標示
- **[G-08 決策]** 觸發條件統一為值等於 `'Y'`（大寫），不兼容 `'1'`。理由：`CHAR(1)` 欄位由 ETL 來源系統輸出，MVP 階段以 `'Y'` 為準

### AC-6：客戶類型適應顯示

- Given 客戶類型為企業（`customer_type_code = '02'`）
- When 頁面顯示 G. 企業客戶專屬分類
- Then 顯示完整企業資料（owner 資訊、registered_capital 等）

- Given 客戶類型為個人（`customer_type_code = '01'`）或外籍（`customer_type_code = '04'`）
- When 頁面顯示 G. 企業客戶專屬分類
- Then 該分類顯示「本分類不適用」提示文字，不顯示空白欄位

### AC-7：頁面找不到客戶

- Given URL 中的 `customerId` 不存在於 `customer_core`
- When 頁面嘗試載入資料
- Then API 回傳 404（C360_CUSTOMER_NOT_FOUND）
- And 前端顯示「找不到此客戶資料」錯誤提示，並提供「返回清單」按鈕

### AC-8：ETL 資料新鮮度提示

- Given `_etl_loaded_at` 距今超過 7 天
- When 頁面載入完成
- Then 在頁面頂部（Header 下方）顯示警告 Banner：「此客戶資料最後更新於 N 天前，可能非最新狀態」
- And N 為 `_etl_loaded_at` 距今的天數（取整數，無條件進位）

## 5. API 規格

### 5.1 GET /api/v1/c360/customers/:customerId

**說明：** 取得單一客戶完整 360 詳情。

**Request Headers:**

| Header | 值 | 必填 |
|--------|---|------|
| Authorization | Bearer {token} | 是 |

**Path Parameters:**

| 參數 | 型別 | 說明 |
|------|------|------|
| customerId | string (UUID) | 客戶唯一識別碼（`customer_id`） |

**Response — 200 OK:**

```json
{
  "customerId": "550e8400-e29b-41d4-a716-446655440000",
  "identity": {
    "sourceCustomerNo": "A123456789",
    "customerTypeCode": "01",
    "customerTypeDesc": "個人",
    "name": "王小明",
    "englishName": "Wang Xiao Ming"
  },
  "personalAttributes": {
    "gender": "M",
    "dateOfBirth": "1985-03-15",
    "maritalStatusCode": "1",
    "maritalStatusDesc": "已婚",
    "educationCode": "06",
    "educationDesc": "大學",
    "spouseName": "李小美",
    "fatherName": "王大明",
    "motherName": "陳小花",
    "idIssueType": "01",
    "idIssueDate": "2020-01-15T00:00:00.000Z",
    "idIssueAddress": "台北市中正區",
    "driverLicense": "D123456789"
  },
  "contactInfo": {
    "mobilePhone": "0912345678",
    "homePhone": "02-23456789",
    "contactPhone": "02-34567890",
    "officePhone": "02-45678901#123",
    "registeredPhone": "02-56789012",
    "registeredFax": "02-56789013",
    "businessFax": "02-67890123",
    "businessMobile": "0922333444",
    "email": "wang@example.com",
    "lineAccount": "wang_line"
  },
  "addresses": {
    "residentialZip": "100",
    "residentialAddress": "台北市中正區忠孝東路一段1號",
    "mailingZip": "100",
    "mailingAddress": "台北市中正區忠孝東路一段1號",
    "registeredZip": "110",
    "registeredAddress": "台北市信義區信義路五段7號",
    "companyZip": "110",
    "companyAddress": "台北市信義區松仁路100號",
    "maturityMailingZip": "100",
    "maturityMailingAddress": "台北市中正區忠孝東路一段1號"
  },
  "employment": {
    "companyName": "台灣科技股份有限公司",
    "occupationCode": "0301",
    "occupationDesc": "軟體工程師",
    "jobTitleCode": "0102",
    "jobTitleDesc": "經理",
    "jobLevelCode": "03",
    "jobLevelDesc": "中階主管",
    "industryCode": "H",
    "industryDesc": "資訊及通訊傳播業",
    "workYears": 10.5,
    "companyScale": "1",
    "role": "一般客戶"
  },
  "financial": {
    "monthlyIncomeCode": "05",
    "monthlyIncomeDesc": "5萬~10萬",
    "approvedIncome": 80000,
    "incomeSourceCode": "01",
    "incomeSourceDesc": "薪資所得",
    "capital": null,
    "creditLimit": 500000,
    "highestTransactionAmount": 1200000,
    "highestTransactionDate": "2025-06-15T00:00:00.000Z",
    "hasRealEstate": "Y",
    "debtFlag": "N",
    "fineFlag": "N",
    "addressAnomalyFlag": 0,
    "mainlandFlag": 0
  },
  "corporate": {
    "ownerName": null,
    "ownerId": null,
    "ownerBirth": null,
    "ownerZip": null,
    "ownerAddress": null,
    "establishedCapital": null,
    "employeeCountCode": null,
    "employeeCountDesc": null,
    "isListedCode": null,
    "isListedDesc": null,
    "groupOwner": null,
    "businessItem": null,
    "organizationType": null,
    "parentCustomerId": null,
    "parentCustomerName": null
  },
  "etlTracking": {
    "sourceCreatedAt": "2020-05-10T08:30:00.000Z",
    "sourceUpdatedAt": "2025-12-01T14:22:00.000Z",
    "dataSource": "ZZIP+MLMC",
    "etlLoadedAt": "2026-04-10T03:00:00.000Z",
    "etlPipelineId": "660e8400-e29b-41d4-a716-446655440001"
  }
}
```

### 5.2 完整欄位映射 [G-07 已解決]

以下為 `customer_core` 全部 85 欄位至 API Response 的完整映射。

#### A. identity — 識別與分類（5 欄位）

| API 欄位名（camelCase） | 來源欄位 | 型別 | nullable |
|------------------------|---------|------|----------|
| sourceCustomerNo | source_customer_no | string | NO |
| customerTypeCode | customer_type_code | string | NO |
| customerTypeDesc | customer_type_desc | string | YES |
| name | name | string | NO |
| englishName | english_name | string | YES |

> `customer_id` 映射至頂層 `customerId` 欄位。

#### B. personalAttributes — 個人屬性（11 欄位）

| API 欄位名（camelCase） | 來源欄位 | 型別 | nullable |
|------------------------|---------|------|----------|
| gender | gender | string | YES |
| dateOfBirth | date_of_birth | string (date) | YES |
| maritalStatusCode | marital_status_code | string | YES |
| maritalStatusDesc | marital_status_desc | string | YES |
| educationCode | education_code | string | YES |
| educationDesc | education_desc | string | YES |
| spouseName | spouse_name | string | YES |
| fatherName | father_name | string | YES |
| motherName | mother_name | string | YES |
| idIssueType | id_issue_type | string | YES |
| idIssueDate | id_issue_date | string (ISO8601) | YES |
| idIssueAddress | id_issue_address | string | YES |
| driverLicense | driver_license | string | YES |

#### C. contactInfo — 聯絡資訊（10 欄位）

| API 欄位名（camelCase） | 來源欄位 | 型別 | nullable | 遮罩（User） |
|------------------------|---------|------|----------|-------------|
| mobilePhone | mobile_phone | string | YES | 前 4 碼 + 後 2 碼 |
| homePhone | home_phone | string | YES | 前 4 碼 + 後 2 碼 |
| contactPhone | contact_phone | string | YES | 前 4 碼 + 後 2 碼 |
| officePhone | office_phone | string | YES | 前 4 碼 + 後 2 碼 |
| registeredPhone | registered_phone | string | YES | 不遮罩 |
| registeredFax | registered_fax | string | YES | 不遮罩 |
| businessFax | business_fax | string | YES | 不遮罩 |
| businessMobile | business_mobile | string | YES | 不遮罩 |
| email | email | string | YES | @ 前顯示前 2 字元 |
| lineAccount | line_account | string | YES | 不遮罩 |

#### D. addresses — 地址（10 欄位）

| API 欄位名（camelCase） | 來源欄位 | 型別 | nullable |
|------------------------|---------|------|----------|
| residentialZip | residential_zip | string | YES |
| residentialAddress | residential_address | string | YES |
| mailingZip | mailing_zip | string | YES |
| mailingAddress | mailing_address | string | YES |
| registeredZip | registered_zip | string | YES |
| registeredAddress | registered_address | string | YES |
| companyZip | company_zip | string | YES |
| companyAddress | company_address | string | YES |
| maturityMailingZip | maturity_mailing_zip | string | YES |
| maturityMailingAddress | maturity_mailing_address | string | YES |

#### E. employment — 職業與就業（12 欄位）

| API 欄位名（camelCase） | 來源欄位 | 型別 | nullable |
|------------------------|---------|------|----------|
| companyName | company_name | string | YES |
| occupationCode | occupation_code | string | YES |
| occupationDesc | occupation_desc | string | YES |
| jobTitleCode | job_title_code | string | YES |
| jobTitleDesc | job_title_desc | string | YES |
| jobLevelCode | job_level_code | string | YES |
| jobLevelDesc | job_level_desc | string | YES |
| industryCode | industry_code | string | YES |
| industryDesc | industry_desc | string | YES |
| workYears | work_years | number | YES |
| companyScale | company_scale | string | YES |
| role | role | string | YES |

#### F. financial — 財務與風控（14 欄位）

| API 欄位名（camelCase） | 來源欄位 | 型別 | nullable |
|------------------------|---------|------|----------|
| monthlyIncomeCode | monthly_income_code | string | YES |
| monthlyIncomeDesc | monthly_income_desc | string | YES |
| approvedIncome | approved_income | integer | YES |
| incomeSourceCode | income_source_code | string | YES |
| incomeSourceDesc | income_source_desc | string | YES |
| capital | capital | number | YES |
| creditLimit | credit_limit | number | YES |
| highestTransactionAmount | highest_transaction_amount | number | YES |
| highestTransactionDate | highest_transaction_date | string (ISO8601) | YES |
| hasRealEstate | has_real_estate | string | YES |
| debtFlag | debt_flag | string | YES |
| fineFlag | fine_flag | string | YES |
| addressAnomalyFlag | address_anomaly_flag | integer | YES |
| mainlandFlag | mainland_flag | integer | YES |

#### G. corporate — 企業客戶專屬（15 欄位）

| API 欄位名（camelCase） | 來源欄位 | 型別 | nullable |
|------------------------|---------|------|----------|
| ownerName | owner_name | string | YES |
| ownerId | owner_id | string | YES |
| ownerBirth | owner_birth | string (date) | YES |
| ownerZip | owner_zip | string | YES |
| ownerAddress | owner_address | string | YES |
| establishedCapital | established_capital | number | YES |
| employeeCountCode | employee_count_code | string | YES |
| employeeCountDesc | employee_count_desc | string | YES |
| isListedCode | is_listed_code | string | YES |
| isListedDesc | is_listed_desc | string | YES |
| groupOwner | group_owner | string | YES |
| businessItem | business_item | string | YES |
| organizationType | organization_type | string | YES |
| parentCustomerId | parent_customer_id | string | YES |
| parentCustomerName | parent_customer_name | string | YES |

#### H. etlTracking — 稽核與 ETL 追蹤（5 欄位）

| API 欄位名（camelCase） | 來源欄位 | 型別 | nullable |
|------------------------|---------|------|----------|
| sourceCreatedAt | source_created_at | string (ISO8601) | YES |
| sourceUpdatedAt | source_updated_at | string (ISO8601) | YES |
| dataSource | data_source | string | NO |
| etlLoadedAt | _etl_loaded_at | string (ISO8601) | NO |
| etlPipelineId | _etl_pipeline_id | string (UUID) | NO |

**欄位總計：** 1（customerId）+ 5 + 13 + 10 + 10 + 12 + 14 + 15 + 5 = **85 欄位**

---

**錯誤回應：**

| HTTP Status | 錯誤碼 | 說明 |
|-------------|--------|------|
| 401 | AUTH_TOKEN_MISSING / AUTH_TOKEN_EXPIRED / AUTH_TOKEN_INVALID | 未登入或 Token 無效 |
| 404 | C360_CUSTOMER_NOT_FOUND | 客戶 ID 不存在於 customer_core |
| 500 | SYSTEM_INTERNAL_ERROR | 伺服器內部錯誤 |

## 6. 敏感資料遮罩規則

遮罩邏輯硬編碼於 API 層（Service 或 Serializer），依 JWT Token 中的 `role` 判斷。

| 欄位 | 來源欄位 | Admin | User 遮罩規則 | 遮罩範例 |
|------|---------|-------|---------------|---------|
| sourceCustomerNo | source_customer_no | 完整明碼 | 前 3 碼 + 後 2 碼，中間 `*` | `A12****89` |
| mobilePhone | mobile_phone | 完整明碼 | 前 4 碼 + 後 2 碼，中間 `*` | `0912***78` |
| homePhone | home_phone | 完整明碼 | 前 4 碼 + 後 2 碼，中間 `*` | `02-2***89` |
| contactPhone | contact_phone | 完整明碼 | 前 4 碼 + 後 2 碼，中間 `*` | `02-3***90` |
| officePhone | office_phone | 完整明碼 | 前 4 碼 + 後 2 碼，中間 `*` | `02-4***01` |
| email | email | 完整明碼 | @ 前僅顯示前 2 字元，其餘 `*` | `wa****@gmail.com` |

**遮罩函式規格：**

- `maskIdNumber(value: string): string` — 保留前 3 碼 + 後 2 碼，中間以 `*` 填充至原始長度
- `maskPhone(value: string): string` — 保留前 4 碼 + 後 2 碼，中間以 `*` 填充至原始長度
- `maskEmail(value: string): string` — @ 前保留前 2 字元，其餘以 `*` 填充；@ 後（含 domain）完整顯示
- 若欄位值為 NULL，回傳 `null`，不套用遮罩
- 遮罩函式與 F046 共用，建議實作為共用 utility

## 7. 顯示邏輯規則

### 7.1 code/desc 格式

| 情境 | 顯示格式 | 範例 |
|------|---------|------|
| `_desc` 有值、`_code` 有值 | 「描述（代碼）」 | 「個人（01）」 |
| `_desc` 為 NULL、`_code` 有值 | 僅顯示代碼 | 「01」 |
| `_desc` 有值、`_code` 為 NULL | 僅顯示描述 | 「個人」 |
| 兩者均為 NULL | 「—」 | 「—」 |

### 7.2 NULL 值處理

所有欄位值為 NULL 或空字串時，前端一律顯示「—」（em dash，Unicode U+2014）。

### 7.3 風控旗標高亮 [G-08 已解決]

| 欄位 | 型別 | 高亮觸發條件 | 高亮樣式 | 未觸發顯示 |
|------|------|------------|---------|-----------|
| debt_flag | CHAR(1) | 值 = `'Y'` | 警告色 Badge（`#F59E0B`） | 一般文字 |
| fine_flag | CHAR(1) | 值 = `'Y'` | 警告色 Badge（`#F59E0B`） | 一般文字 |

- `address_anomaly_flag`（SMALLINT）與 `mainland_flag`（SMALLINT）**不列入**風控高亮項目（MVP 範圍），以一般欄位方式顯示數值
- 觸發條件統一為字元 `'Y'`（大寫），不兼容 `'1'`

### 7.4 客戶類型適應顯示

| customer_type_code | B. 個人屬性 | G. 企業客戶專屬 |
|-------------------|------------|----------------|
| `'01'`（個人） | 完整顯示所有欄位 | 顯示「本分類不適用」 |
| `'02'`（企業） | 完整顯示所有欄位 | 完整顯示所有欄位 |
| `'04'`（外籍） | 完整顯示所有欄位 | 顯示「本分類不適用」 |

**說明：** 外籍客戶視同個人客戶，B 分類個人屬性欄位正常顯示，G 分類企業資訊顯示「本分類不適用」。

### 7.5 ETL 資料新鮮度判斷

- 計算公式：`daysSinceUpdate = Math.ceil((now - _etl_loaded_at) / (24 * 60 * 60 * 1000))`
- 閾值：超過 7 天顯示警告
- 時區：`_etl_loaded_at` 為 UTC，計算時以 UTC 為基準
- 警告文案：「此客戶資料最後更新於 {N} 天前，可能非最新狀態」

### 7.6 時區顯示

後端儲存 UTC 時間，API 回應以 ISO 8601 UTC 格式輸出。前端顯示時轉換為 UTC+8（Asia/Taipei）：

| 欄位 | 前端顯示格式 |
|------|-------------|
| dateOfBirth | YYYY-MM-DD |
| idIssueDate | YYYY-MM-DD |
| highestTransactionDate | YYYY-MM-DD |
| ownerBirth | YYYY-MM-DD |
| sourceCreatedAt | YYYY-MM-DD HH:mm |
| sourceUpdatedAt | YYYY-MM-DD HH:mm |
| etlLoadedAt | YYYY-MM-DD HH:mm |

## 8. UI/UX 需求

本節供 UI/UX Designer 參考，描述頁面功能需求與互動行為，不指定視覺設計細節。

### 8.1 頁面結構

1. **頂部 Header 區域**
   - 左側：「返回清單」按鈕（導覽至 F046 `/c360/customers`）
   - 中央/主要區域：客戶姓名（大字體）、客戶類型 Badge（如「個人」「企業」「外籍」）、客戶編號（依角色遮罩）
   - 資料新鮮度警告 Banner（條件觸發，見 AC-8）

2. **資料分類區域**（8 個分類卡片或 Accordion）
   - 每個分類為一個獨立的視覺區塊
   - 分類標題標示分類名稱（如「A. 識別與分類」）
   - 分類內容以欄位標籤 + 欄位值的格式呈現（如表格或 key-value 列表）

### 8.2 各分類欄位配置

#### A. 識別與分類

| 顯示標籤 | API 欄位 | 備註 |
|---------|---------|------|
| 客戶 ID | customerId | UUID 格式 |
| 客戶編號 | sourceCustomerNo | User 遮罩 |
| 客戶類型 | customerTypeCode + customerTypeDesc | code/desc 格式 |
| 姓名/企業名稱 | name | — |
| 英文姓名 | englishName | — |

#### B. 個人屬性

| 顯示標籤 | API 欄位 | 備註 |
|---------|---------|------|
| 性別 | gender | — |
| 生日 | dateOfBirth | YYYY-MM-DD |
| 婚姻狀態 | maritalStatusCode + maritalStatusDesc | code/desc 格式 |
| 學歷 | educationCode + educationDesc | code/desc 格式 |
| 配偶姓名 | spouseName | — |
| 父親姓名 | fatherName | — |
| 母親姓名 | motherName | — |
| 發證類別 | idIssueType | — |
| 發證日期 | idIssueDate | YYYY-MM-DD |
| 發證地址 | idIssueAddress | — |
| 駕照號碼 | driverLicense | — |

#### C. 聯絡資訊

| 顯示標籤 | API 欄位 | 備註 |
|---------|---------|------|
| 行動電話 | mobilePhone | User 遮罩 |
| 戶籍電話 | homePhone | User 遮罩 |
| 通訊電話 | contactPhone | User 遮罩 |
| 公司電話 | officePhone | User 遮罩 |
| 公司登記電話 | registeredPhone | — |
| 公司傳真 | registeredFax | — |
| 營業傳真 | businessFax | — |
| 營業行動電話 | businessMobile | — |
| Email | email | User 遮罩 |
| Line 帳號 | lineAccount | — |

#### D. 地址

| 顯示標籤 | API 欄位 | 備註 |
|---------|---------|------|
| 戶籍地址 | residentialZip + residentialAddress | 郵遞區號 + 地址 |
| 通訊地址 | mailingZip + mailingAddress | 郵遞區號 + 地址 |
| 公司登記地址 | registeredZip + registeredAddress | 郵遞區號 + 地址 |
| 營業地址 | companyZip + companyAddress | 郵遞區號 + 地址 |
| 滿期寄送地址 | maturityMailingZip + maturityMailingAddress | 郵遞區號 + 地址 |

#### E. 職業與就業

| 顯示標籤 | API 欄位 | 備註 |
|---------|---------|------|
| 服務公司 | companyName | — |
| 職業 | occupationCode + occupationDesc | code/desc 格式 |
| 職稱 | jobTitleCode + jobTitleDesc | code/desc 格式 |
| 職級 | jobLevelCode + jobLevelDesc | code/desc 格式 |
| 行業 | industryCode + industryDesc | code/desc 格式 |
| 年資 | workYears | 數值，單位「年」 |
| 公司規模 | companyScale | — |
| 客戶角色 | role | — |

#### F. 財務與風控

| 顯示標籤 | API 欄位 | 備註 |
|---------|---------|------|
| 月所得 | monthlyIncomeCode + monthlyIncomeDesc | code/desc 格式 |
| 認定月收入 | approvedIncome | 數值，加千位分隔符 |
| 收入來源 | incomeSourceCode + incomeSourceDesc | code/desc 格式 |
| 實收資本額 | capital | 數值，加千位分隔符 |
| 額度總額 | creditLimit | 數值，加千位分隔符 |
| 最高往來金額 | highestTransactionAmount | 數值，加千位分隔符 |
| 最高往來日期 | highestTransactionDate | YYYY-MM-DD |
| 自有不動產 | hasRealEstate | — |
| 消債旗標 | debtFlag | 值為 'Y' 時高亮 Badge |
| 違規欠稅旗標 | fineFlag | 值為 'Y' 時高亮 Badge |
| 地址異常註記 | addressAnomalyFlag | 一般顯示 |
| 大陸籍旗標 | mainlandFlag | 一般顯示 |

#### G. 企業客戶專屬

| 顯示標籤 | API 欄位 | 備註 |
|---------|---------|------|
| 負責人姓名 | ownerName | — |
| 負責人身分證 | ownerId | — |
| 負責人生日 | ownerBirth | YYYY-MM-DD |
| 負責人郵遞區號 | ownerZip | — |
| 負責人地址 | ownerAddress | — |
| 登記資本額 | establishedCapital | 數值，加千位分隔符 |
| 員工人數 | employeeCountCode + employeeCountDesc | code/desc 格式 |
| 上市櫃 | isListedCode + isListedDesc | code/desc 格式 |
| 集團實際負責人 | groupOwner | — |
| 營業項目 | businessItem | — |
| 組織形態 | organizationType | — |
| 母公司客戶 ID | parentCustomerId | — |
| 母公司名稱 | parentCustomerName | — |

#### H. 稽核與 ETL 追蹤

| 顯示標籤 | API 欄位 | 備註 |
|---------|---------|------|
| 來源建檔日期 | sourceCreatedAt | YYYY-MM-DD HH:mm (UTC+8) |
| 來源最後更新 | sourceUpdatedAt | YYYY-MM-DD HH:mm (UTC+8) |
| 資料來源 | dataSource | — |
| ETL 載入時間 | etlLoadedAt | YYYY-MM-DD HH:mm (UTC+8) |
| Pipeline ID | etlPipelineId | UUID 格式 |

### 8.3 風控旗標 Badge

- 觸發條件：`debtFlag === 'Y'` 或 `fineFlag === 'Y'`
- Badge 底色：`#F59E0B`（琥珀色警告）
- Badge 文字：欄位標籤（如「消債旗標」）
- 未觸發時：以一般文字格式顯示欄位值

### 8.4 資料新鮮度警告 Banner

- 位置：Header 下方，分類區域上方
- 觸發條件：`_etl_loaded_at` 距今超過 7 天
- 樣式：警告色背景 Banner
- 文案：「此客戶資料最後更新於 {N} 天前，可能非最新狀態」

### 8.5 404 錯誤狀態

- 顯示文案：「找不到此客戶資料」
- 提供「返回清單」按鈕
- 不顯示任何分類卡片

### 8.6 導覽

- URL 格式：`/c360/customers/:customerId`
- 「返回清單」按鈕導覽至 `/c360/customers`（F046）
- 瀏覽器後退鍵回到客戶清單

## 9. 商業規則

| 規則編號 | 說明 |
|----------|------|
| BR-1 | 所有已登入角色（Admin / User）皆可存取單一客戶 360 詳情，無角色限制 |
| BR-2 | 敏感資料遮罩硬編碼於 API 層，依 JWT Token 中的 role 判斷 |
| BR-3 | code/desc 欄位顯示格式為「描述（代碼）」 |
| BR-4 | NULL 欄位一律顯示「—」（em dash） |
| BR-5 | 風控旗標觸發條件為值等於 `'Y'`（大寫字元），不兼容 `'1'` |
| BR-6 | 個人客戶（01）與外籍客戶（04）的 G 分類顯示「本分類不適用」 |
| BR-7 | 後端儲存 UTC 時間，API 回應以 ISO 8601 UTC 格式輸出，前端顯示轉換為 UTC+8 |
| BR-8 | 資料新鮮度警告閾值為 7 天 |
| BR-9 | 本頁面為唯讀，不提供任何資料編輯功能 |

## 10. 效能需求

| 項目 | 閾值 | 參考 |
|------|------|------|
| 單一客戶詳情 API 回應時間 | < 500ms | NFR-002.1 |
| 頁面載入完成時間（含前端渲染） | < 1 秒 | US-061 需求 |

## 11. 錯誤場景

| 場景 | 系統回應 | 參考 |
|------|---------|------|
| 未登入存取 | HTTP 401，導向登入頁面 | error-handling.md#auth-errors |
| customer_id 不存在 | HTTP 404，C360_CUSTOMER_NOT_FOUND | error-handling.md#c360-errors |
| API 載入失敗 | 顯示「無法載入客戶資料，請重新整理頁面」 | error-handling.md#system-errors |

## 12. 測試案例

| # | 測試案例 | 預期結果 |
|---|---------|---------|
| 1 | 進入個人客戶（type=01）360 頁面 | 顯示 A~F、H 分類完整資料，G 分類顯示「本分類不適用」 |
| 2 | 進入企業客戶（type=02）360 頁面 | 顯示 A~H 全部分類，G 分類有完整企業資料 |
| 3 | 進入外籍客戶（type=04）360 頁面 | 顯示 A~F、H 分類完整資料，G 分類顯示「本分類不適用」 |
| 4 | 欄位 date_of_birth 為 NULL | 顯示「—」，不顯示空白 |
| 5 | customer_type_desc = '個人'、customer_type_code = '01' | 顯示「個人（01）」 |
| 6 | marital_status_desc 為 NULL、marital_status_code = '1' | 僅顯示「1」 |
| 7 | debt_flag = 'Y' | F 分類的消債旗標以 #F59E0B 警告色 Badge 標示 |
| 8 | fine_flag = 'N' | F 分類的違規欠稅旗標以一般文字顯示 |
| 9 | debt_flag = 'Y' 且 fine_flag = 'Y' | 兩個旗標均以警告色 Badge 標示 |
| 10 | _etl_loaded_at 距今 10 天 | 頂部顯示「此客戶資料最後更新於 10 天前，可能非最新狀態」 |
| 11 | _etl_loaded_at 距今 3 天 | 不顯示資料新鮮度警告 |
| 12 | 存取不存在的 customer_id | 顯示 404 錯誤提示「找不到此客戶資料」與「返回清單」按鈕 |
| 13 | 未登入直接存取 URL | 導向登入頁面（401） |
| 14 | Admin 查看 mobile_phone 0912345678 | 完整明碼顯示 `0912345678` |
| 15 | User 查看 mobile_phone 0912345678 | 遮罩顯示 `0912***78` |
| 16 | User 查看 email wang@gmail.com | 遮罩顯示 `wa****@gmail.com` |
| 17 | Admin 查看 source_customer_no A123456789 | 完整明碼顯示 `A123456789` |
| 18 | User 查看 source_customer_no A123456789 | 遮罩顯示 `A12****89` |
| 19 | 企業客戶，G 分類 owner_name 有值 | 正確顯示負責人姓名 |
| 20 | 個人客戶，G 分類全部欄位 | 顯示「本分類不適用」，不顯示空白欄位 |

## 13. 假設與限制

### 假設

| 編號 | 假設 |
|------|------|
| A-1 | `customer_core` 目標表已更新至 F036 v2.4 定義的 85 欄位版本 |
| A-2 | [ASSUMPTION] 目前生產環境的 Migration 為 54 欄位精簡版，需先完成 Migration 升級至 85 欄位。此為 F047 的前置依賴 |
| A-3 | 遮罩函式與 F046 共用同一套 utility |

### 限制

| 編號 | 限制 |
|------|------|
| C-1 | 本頁面為唯讀，不提供資料編輯功能 |
| C-2 | 遮罩規則為硬編碼，不支援動態設定 |
| C-3 | 不支援多客戶同時檢視 |

## 14. 相依性

- **Blocked By**：
  - F036 / US-049（customer_core 目標表 85 欄位 Schema 必須就緒）
  - F046 / US-060（客戶清單為主要入口）
  - F044 / US-057（ETL TargetLoad 完成，資料已載入 customer_core）
  - E01（使用者驗證）
- **Blocks**：無（Customer 360 為消費端模組）
- **認證系統**：需要有效的已登入 Session/Token（Admin 或 User）

## 15. 交叉參考

- 資料模型：[data-model.md#customer-core-entity](../data-model.md#customer-core-entity)
- 錯誤處理：[error-handling.md#c360-errors](../error-handling.md#c360-errors)
- 非功能需求：[nfr.md#NFR-002](../nfr.md#NFR-002)
- 流程圖：[diagrams/F047-customer-360-detail.mmd](../diagrams/F047-customer-360-detail.mmd)
- 相關功能：[F046](F046-customer-search-list.md)（客戶搜尋與清單）
- 目標表定義：[F036](F036-target-tables.md)（customer_core 85 欄位完整定義）
