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
- **Given** 系統已預先定義 1 個 Domain Data Product 目標表（Phase 1 MVP）
- **When** 我呼叫目標表清單 API
- **Then** 系統回傳目標表的名稱、顯示名稱、所屬 Domain、欄位數量與描述

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

### AC-6：目標表 Schema 預定義正確
- **Given** 系統初始化完成
- **When** 查詢目標表清單
- **Then** Phase 1 MVP 包含 `customer_core` 一個目標表（79 欄位），欄位定義正確
- **Note** `customer_interaction`、`customer_financial`、`customer_service` 移至 Phase 2/3，待對應來源系統接入後實作

---

## Technical Notes

### 設計原則

- 採用 Domain-Oriented 設計，Phase 1 聚焦 Customer Core 單一 Domain Data Product
- 來源驅動（Source-Driven）：目標表設計嚴格對應現有來源資料，不預建無法填充的空表
- 為未來 Data Mesh 擴展預留架構空間（每個 Domain 可獨立演進 schema）
- Phase 2/3 待互動（CRM）、交易（合約明細）、客服（工單系統）來源接入後再擴充

### 來源資料表

| 來源表 | 系統 | 說明 | 客戶類型 |
|--------|------|------|---------|
| ZZIP_BAMCUST_M | 核心系統 | 客戶主檔（個人/企業/外籍） | CUSTOM_MK: 01=個人, 02=企業, 04=外籍 |
| MLMCUSTOMER | 行銷/租賃系統 | 客戶主檔（個人/企業） | CUTYPE: 1=個人, 2=企業 |

**來源關聯**：兩系統以身分證字號/統一編號作為共同鍵（ZZIP.CUSTO_NO = MLMC.CUSTID）。

### 端點

- `GET /api/v1/etl/target-tables` — 取得所有目標表清單
- `GET /api/v1/etl/target-tables/:tableName/schema` — 取得指定目標表的 schema

### Target Tables Response

```json
{
  "data": [
    {
      "tableName": "customer_core",
      "displayName": "Customer Core（客戶主檔）",
      "domain": "core",
      "columnCount": 79,
      "description": "客戶身分、個人屬性、聯絡、職業、財務概況與風控旗標"
    }
  ]
}
```

### Schema Response

```json
{
  "tableName": "customer_core",
  "displayName": "Customer Core（客戶主檔）",
  "columns": [
    {
      "name": "customer_id",
      "type": "UUID",
      "nullable": false,
      "isPrimaryKey": true,
      "description": "客戶唯一識別碼（代理鍵）"
    }
  ]
}
```

---

## 目標表定義

### Customer Core（客戶主檔）— `customer_core`

#### A. 識別與分類

| 欄位名稱 | 型別 | nullable | PK | 說明 | 來源對應 |
|---------|------|----------|-----|------|---------|
| customer_id | UUID | NO | YES | 客戶唯一識別碼（代理鍵） | ETL 生成 |
| source_customer_no | VARCHAR(20) | NO | | 來源客戶編號（身分證/統編） | ZZIP.CUSTO_NO / MLMC.CUSTID |
| customer_type | VARCHAR(2) | NO | | 客戶類型（01=個人/02=企業/04=外籍） | ZZIP.CUSTOM_MK / MLMC.CUTYPE |
| name | VARCHAR(100) | NO | | 姓名/企業名稱 | ZZIP.CUS_NAME / MLMC.CUSTNAME |
| english_name | VARCHAR(60) | YES | | 英文姓名 | ZZIP.ENG_NAME |

#### B. 個人屬性

| 欄位名稱 | 型別 | nullable | PK | 說明 | 來源對應 |
|---------|------|----------|-----|------|---------|
| gender | VARCHAR(1) | YES | | 性別 | ZZIP.CUS_SEX |
| date_of_birth | DATE | YES | | 生日 | ZZIP.BITBE_DATE |
| marital_status | VARCHAR(1) | YES | | 婚姻狀態 | ZZIP.CMARRY_MK |
| education_code | VARCHAR(2) | YES | | 學歷代碼 | ZZIP.EDUCAT_BACK |
| education_desc | VARCHAR(50) | YES | | 學歷描述 | US-030 代碼轉換 |
| spouse_name | VARCHAR(100) | YES | | 配偶姓名 | ZZIP.SPOUSE_NM |
| father_name | VARCHAR(100) | YES | | 父親姓名 | ZZIP.FATHER_NM |
| mother_name | VARCHAR(100) | YES | | 母親姓名 | ZZIP.MOTHER_NM |
| id_issue_type | VARCHAR(2) | YES | | 發證類別 | ZZIP.ISSUE_CLASS / MLMC.ISSUE_CLASS |
| id_issue_date | TIMESTAMP | YES | | 發證日期 | ZZIP.ISSUE_DATE / MLMC.ISSUE_DT |
| id_issue_address | VARCHAR(100) | YES | | 發證地址 | ZZIP.ISSUE_ADD / MLMC.ISSUE_ADD |
| driver_license | VARCHAR(20) | YES | | 駕照號碼 | ZZIP.DRIVE_LIC |

#### C. 聯絡資訊

| 欄位名稱 | 型別 | nullable | PK | 說明 | 來源對應 | 轉換邏輯 |
|---------|------|----------|-----|------|---------|---------|
| mobile_phone | VARCHAR(20) | YES | | 行動電話 | ZZIP.CELLULAR / MLMC.CUSTMOBILE | 直接映射 |
| home_phone | VARCHAR(20) | YES | | 戶籍電話 | ZZIP.CAREA_NO1 + CTEL_NO1 + CEXTEN_NO1 | 合併為 `{區碼}-{號碼}#{分機}`，無分機時省略 `#{分機}`，佔位值→NULL |
| contact_phone | VARCHAR(20) | YES | | 通訊電話 | ZZIP.CAREA_NO2 + CTEL_NO2 + CEXTEN_NO2 | 合併為 `{區碼}-{號碼}#{分機}`，無分機時省略 `#{分機}`，佔位值→NULL |
| office_phone | VARCHAR(20) | YES | | 公司電話 | ZZIP.CO_CAREA_NO + CO_CTEL_NO + CO_EXTEN_NO / MLMC.BUSINESSTTELCODE + BUSINESSTTEL | 合併為 `{區碼}-{號碼}#{分機}`，無分機時省略 `#{分機}`，佔位值→NULL |
| registered_phone | VARCHAR(20) | YES | | 公司登記電話 | MLMC.CUSTTELCODE + CUSTTEL | 合併為 `{區碼}-{號碼}`，佔位值→NULL |
| registered_fax | VARCHAR(20) | YES | | 公司傳真 | MLMC.CUSTFAXCODE + CUSTFAX | 合併為 `{區碼}-{號碼}`，佔位值→NULL |
| business_fax | VARCHAR(20) | YES | | 營業傳真 | MLMC.BUSINESSFAXCODE + BUSINESSFAX | 合併為 `{區碼}-{號碼}`，佔位值→NULL |
| business_mobile | VARCHAR(20) | YES | | 營業行動電話 | MLMC.BUSINESSMOBILE | 直接映射 |
| email | VARCHAR(40) | YES | | Email | ZZIP.E_MAIL | 直接映射 |
| line_account | VARCHAR(50) | YES | | Line 帳號 | ZZIP.LINE_ACCT | 直接映射 |

#### D. 地址

| 欄位名稱 | 型別 | nullable | PK | 說明 | 來源對應 |
|---------|------|----------|-----|------|---------|
| residential_zip | VARCHAR(6) | YES | | 戶籍郵遞區號 | ZZIP.HPOST_NUM |
| residential_address | VARCHAR(100) | YES | | 戶籍地址 | ZZIP.HPOST_ADD |
| mailing_zip | VARCHAR(6) | YES | | 通訊郵遞區號 | ZZIP.CPOST_NUM |
| mailing_address | VARCHAR(100) | YES | | 通訊地址 | ZZIP.COMM_ADD |
| registered_zip | VARCHAR(6) | YES | | 公司登記郵遞區號 | MLMC.CUSTZIPCODE |
| registered_address | VARCHAR(100) | YES | | 公司登記地址 | MLMC.CUSTADDR |
| company_zip | VARCHAR(6) | YES | | 營業地址郵遞區號 | ZZIP.CO_NUM / MLMC.BUSINESSZIPCODE |
| company_address | VARCHAR(100) | YES | | 營業地址 | ZZIP.UNIT_ADD / MLMC.BUSINESSADDR |
| maturity_mailing_zip | VARCHAR(6) | YES | | 滿期寄送郵遞區號 | ZZIP.EPRPOST_NUM |
| maturity_mailing_address | VARCHAR(100) | YES | | 滿期寄送地址 | ZZIP.EPRPOST_ADD |

#### E. 職業與就業

| 欄位名稱 | 型別 | nullable | PK | 說明 | 來源對應 |
|---------|------|----------|-----|------|---------|
| company_name | VARCHAR(100) | YES | | 服務公司/企業名稱 | ZZIP.CO_NAME / MLMC.CUSTNAME（企業時） |
| occupation_code | VARCHAR(4) | YES | | 職業代碼 | ZZIP.VOCATION_CODE |
| occupation_desc | VARCHAR(50) | YES | | 職業描述 | US-030 代碼轉換 |
| job_title_code | VARCHAR(4) | YES | | 職稱代碼 | ZZIP.JOB_TITLE |
| job_title_desc | VARCHAR(50) | YES | | 職稱描述 | US-030 代碼轉換 |
| job_level | VARCHAR(2) | YES | | 職級 | ZZIP.JOB_LEVEL |
| industry_code | VARCHAR(6) | YES | | 行業代碼 | ZZIP.INDUSTRY / MLMC.INDUID（2016年起取代已停用CUROUT，對照表MLSTDINDUMF） |
| industry_desc | VARCHAR(100) | YES | | 行業描述 | MLMC.BUSINESS / US-030 代碼轉換 |
| work_years | DECIMAL(8,2) | YES | | 年資 | ZZIP.N_WORK_YEAR |
| company_scale | VARCHAR(1) | YES | | 公司規模（1:>=1000萬or公教/2:<1000萬/3:其他） | ZZIP.COMP_DIM |
| role_code | VARCHAR(4) | YES | | 客戶角色代碼 | ZZIP.CROLE |
| role_desc | VARCHAR(50) | YES | | 客戶角色描述 | US-030 代碼轉換 |

#### F. 財務與風控

| 欄位名稱 | 型別 | nullable | PK | 說明 | 來源對應 |
|---------|------|----------|-----|------|---------|
| monthly_income | DECIMAL(8,0) | YES | | 月所得 | ZZIP.MONTH_INCOME（text→DECIMAL） |
| approved_income | INTEGER | YES | | 認定月收入 | ZZIP.INCOME_APPROVED |
| income_source | VARCHAR(5) | YES | | 收入來源代碼 | ZZIP.INCOME_SOURCE |
| capital | DECIMAL(12,0) | YES | | 實收資本額 | ZZIP.CAPITAL / MLMC.CUSTNOWCAPTIAL（varchar→DECIMAL） |
| credit_limit | DECIMAL(12,0) | YES | | 額度總額 | MLMC.FAMOUNT |
| highest_transaction_amount | DECIMAL(12,0) | YES | | 最高往來金額 | MLMC.HFAMOUNT |
| highest_transaction_date | TIMESTAMP | YES | | 最高往來日期 | MLMC.HCDATE |
| has_real_estate | VARCHAR(1) | YES | | 自有不動產 | ZZIP.IMMOPRO_MK |
| debt_flag | CHAR(1) | YES | | 消債旗標 | ZZIP.DEBT_FLG |
| fine_flag | CHAR(1) | YES | | 違規欠稅旗標（>2萬） | ZZIP.FINE_FLG |
| address_anomaly_flag | SMALLINT | YES | | 地址異常註記 | ZZIP.ADDR_FLG |
| mainland_flag | SMALLINT | YES | | 大陸籍旗標 | ZZIP.LAND_FLG |

#### G. 企業客戶專屬

| 欄位名稱 | 型別 | nullable | PK | 說明 | 來源對應 |
|---------|------|----------|-----|------|---------|
| owner_name | VARCHAR(50) | YES | | 負責人姓名 | MLMC.OWNER |
| owner_id | VARCHAR(10) | YES | | 負責人身分證字號 | MLMC.OWNERID |
| owner_birth | DATE | YES | | 負責人生日 | MLMC.OWNERBIRTH |
| owner_zip | VARCHAR(6) | YES | | 負責人郵遞區號 | MLMC.OWNERZIPCODE |
| owner_address | VARCHAR(100) | YES | | 負責人地址 | MLMC.OWNERADDR |
| established_capital | DECIMAL(12,0) | YES | | 登記資本額 | MLMC.CUSTCREATECAPTIAL（varchar→DECIMAL） |
| employee_count | VARCHAR(6) | YES | | 員工人數 | MLMC.EMPLOYEE |
| is_listed | VARCHAR(6) | YES | | 上市櫃 | MLMC.LISTED |
| parent_customer_id | VARCHAR(10) | YES | | 母公司客戶 ID | MLMC.PARENTCUSTID |
| group_owner | VARCHAR(50) | YES | | 集團實際負責人 | MLMC.GROUPOWNER |
| company_attr_code | VARCHAR(6) | YES | | 公司屬性 | MLMC.COMPTYPE |
| organization_type | VARCHAR(6) | YES | | 組織形態（代碼表 LCCODEMF） | MLMC.ORGATYPE |
| parent_customer_name | VARCHAR(100) | YES | | 母公司名稱 | MLMC.PARENTCUSTNAME |

#### H. 稽核與 ETL 追蹤

| 欄位名稱 | 型別 | nullable | PK | 說明 | 來源對應 |
|---------|------|----------|-----|------|---------|
| source_created_at | TIMESTAMP | YES | | 來源建檔日期 | ZZIP.INSERT_DATE / MLMC.CUSTCREATEDATE |
| source_updated_at | TIMESTAMP | YES | | 來源最後更新 | ZZIP.UPDATE_DATE / MLMC.U_SYSDT |
| data_source | VARCHAR(50) | NO | | 資料來源識別 | ETL 自動填充 |
| _etl_loaded_at | TIMESTAMP | NO | | ETL 載入時間 | ETL 自動填充 |
| _etl_pipeline_id | UUID | NO | | 載入的 Pipeline ID | ETL 自動填充 |

### 共通 ETL 追蹤欄位

每個目標表都包含以下 3 個追蹤欄位，由系統自動填充：

| 欄位 | 說明 |
|------|------|
| `data_source` | 資料來源識別 |
| `_etl_loaded_at` | ETL 載入時間（自動記錄） |
| `_etl_pipeline_id` | 執行載入的 Pipeline ID（自動記錄） |

### ETL 轉換規則

| 規則 | 說明 |
|------|------|
| 電話合併（含分機） | mergePhone(區碼, 號碼, 分機) 格式：`{區碼}-{號碼}#{分機}`；無分機時省略 `#{分機}`；佔位值（如 `00-0000000000`）過濾為 NULL。適用：home_phone（CAREA_NO1, CTEL_NO1, CEXTEN_NO1）、contact_phone（CAREA_NO2, CTEL_NO2, CEXTEN_NO2）、office_phone（CO_CAREA_NO, CO_CTEL_NO, CO_EXTEN_NO） |
| 電話合併（不含分機，MLMC df2） | mergePhone(區碼, 號碼) 格式：`{區碼}-{號碼}`；佔位值過濾為 NULL。MLMC df2 轉換新增 3 組：registered_phone（CUSTTELCODE, CUSTTEL）、registered_fax（CUSTFAXCODE, CUSTFAX）、business_fax（BUSINESSFAXCODE, BUSINESSFAX）。df2 subtitle 從「customer_type + phone」更新為「customer_type + 4 組電話/傳真」 |
| 衝突解決 | 同一客戶在兩來源有衝突時，以 `source_updated_at` 較新者為準（於 US-042 處理） |
| 代碼描述 | `_code` 欄位保留原始代碼，`_desc` 欄位由 US-030 取得對照表、US-042 轉換填入 |
| 資本額型別 | MLMC.CUSTNOWCAPTIAL / CUSTCREATECAPTIAL：varchar → DECIMAL |
| 月所得型別 | ZZIP.MONTH_INCOME：text → DECIMAL(8,0) |
| 客戶類型對應 | ZZIP.CUSTOM_MK 直接映射；MLMC.CUTYPE 需轉換（1→01, 2→02） |

### 刻意不納入 MVP 的來源欄位

| 來源欄位 | 理由 |
|---------|------|
| PRINT_FLG / ID_CHECK / ID_CHECK_DATE | 內部作業旗標，非分析必要 |
| OLD_P_ID | 舊系統遷移用，非分析必要 |
| APPLI_MARK / SPON_MARK | 申請人/保證人註記，屬業務流程旗標 |

### Phase 擴展規劃

| Phase | 目標表 | 前提條件 |
|-------|--------|---------|
| Phase 1 MVP | customer_core | 已有來源（ZZIP_BAMCUST_M + MLMCUSTOMER） |
| Phase 2 | customer_financial | 待合約明細系統接入 |
| Phase 2 | customer_interaction | 待 CRM / 行銷自動化系統接入 |
| Phase 3 | customer_service | 待客服工單系統接入 |

---

## 測試案例

| # | 測試案例 | 預期結果 |
|---|---------|---------|
| 1 | 呼叫目標表清單 API | 回傳 1 個目標表（customer_core），含名稱、Domain、欄位數量 |
| 2 | 呼叫 customer_core Schema API | 回傳 79 個欄位定義，型別與描述正確 |
| 3 | 在 Load 節點選擇目標表 | 自動載入目標表欄位定義 |
| 4 | 進行來源欄位與目標欄位對應 | 支援拖曳或下拉選單一對一對應 |
| 5 | 執行 Pipeline 的 Load 步驟 | ETL 追蹤欄位（data_source、_etl_loaded_at、_etl_pipeline_id）自動填充 |
| 6 | 呼叫不存在的目標表 Schema API | 回傳 404 Not Found |
| 7 | 電話欄位含佔位值 `00-0000000000` | ETL 轉換後為 NULL |
| 8 | 同一客戶存在兩來源且資料衝突 | 以 source_updated_at 較新者為準 |
| 9 | MLMC.CUSTNOWCAPTIAL 為 varchar "5000000" | 正確轉換為 DECIMAL 5000000 |

---

## 依賴關係

- **Blocked By**：US-042（需有編輯器支援 Load 節點）、US-030（代碼對照表擷取）
- **Blocks**：無

---

## Definition of Done

- [ ] 目標表清單 API 實作完成並通過單元測試
- [ ] 目標表 Schema API 實作完成並通過單元測試
- [ ] customer_core 目標表 schema 預定義正確（79 欄位，涵蓋 A~H 八個分類）
- [ ] 來源欄位對應表完整且經業務確認
- [ ] 前端 Load 節點目標表選擇器實作完成
- [ ] 前端欄位對應介面實作完成
- [ ] ETL 追蹤欄位自動填充邏輯實作完成
- [ ] ETL 轉換規則實作（電話合併、佔位值過濾、型別轉換）
- [ ] 架構預留 Data Mesh 擴展空間（Phase 2/3 目標表可獨立新增）
- [ ] E2E 測試通過

---

## 相關文件

- **Epic Brief**：[E05 Epic Brief](epic-brief.md)
- **依賴**：US-030（代碼對照表）、US-042（Pipeline 編輯器 Load 節點）
