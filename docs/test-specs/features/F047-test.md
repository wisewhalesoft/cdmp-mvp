---
type: test-design-feature
feature_id: F047
feature_name: Customer 360 — 單一客戶詳情
priority: P0-MVP
related_spec: /docs/specs/features/F047-customer-360-detail.md
last_updated: 2026-04-13
---

# F047: Customer 360 — 單一客戶詳情 — 測試設計

---

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + `F047-customer-360-detail.md` + `error-handling.md#c360-errors` + `data-model.md#customer-core-entity` |
| QA / Tester | 本文件 + `error-handling.md#c360-errors` + `test-levels.md` |
| CI/CD Owner | `test-index.md`（自動化就緒度評估章節） |
| Product Analyst | `risks-and-gaps.md` |

---

## 測試策略概覽

| 項目 | 說明 |
|------|------|
| 主要測試層 | API Integration（Supertest + Test Container PostgreSQL）、前端 Unit（React Testing Library） |
| 欄位映射驗證策略 | 種子資料植入已知值（各類型欄位至少有 1 個 non-null 欄位），逐一比對 API Response 欄位名稱（camelCase）與值 |
| 遮罩驗證 | 以 Admin Token 取得明碼值，以 User Token 驗證遮罩格式；NULL 欄位不套用遮罩（回傳 null） |
| 風控旗標觸發條件 | 只以 CHAR(1) 值 `'Y'`（大寫）觸發；`'N'`、`'1'`、null 均不觸發 |
| 資料新鮮度計算 | 使用 clock mock（freezegun 模式）控制「當前時間」，使 `_etl_loaded_at` 到當前時間差精確落在 7 天以內或 7 天以上 |
| 企業類型適應 | 分三組種子客戶（01、02、04）分別驗證 G 分類顯示行為 |

---

## Acceptance Test Design

### AC-1：頁面標題與頂部摘要

| 項目 | 內容 |
|------|------|
| Given | customer_core 存在 customer_id='550e8400-...' 的客戶，已登入使用者（Admin / User） |
| When | 呼叫 `GET /api/v1/c360/customers/550e8400-...` |
| Then | HTTP 200，回應頂層含 customerId；identity 分類含 name、customerTypeCode、customerTypeDesc、sourceCustomerNo（依角色遮罩） |

### AC-2：8 個資料分類顯示

| 項目 | 內容 |
|------|------|
| Given | customer_core 存在完整 85 欄位資料的客戶 |
| When | 呼叫 `GET /api/v1/c360/customers/:customerId` |
| Then | HTTP 200，回應 JSON 包含 8 個頂層分類物件：identity、personalAttributes、contactInfo、addresses、employment、financial、corporate、etlTracking |
| 驗證步驟 | 各分類欄位數量符合規格（A=5、B=13、C=10、D=10、E=12、F=14、G=15、H=5） |

### AC-3：code/desc 欄位顯示格式（API 層）

| 項目 | 內容 |
|------|------|
| Given | maritalStatusCode='1'、maritalStatusDesc='已婚' |
| When | 呼叫 API |
| Then | 回應中 maritalStatusCode='1'、maritalStatusDesc='已婚'（前端根據這兩個欄位組合顯示「已婚（1）」） |
| 驗證步驟 | 1. `_code` 有值、`_desc` 有值：兩者均回傳<br>2. `_code` 有值、`_desc` 為 null：maritalStatusDesc 回傳 null<br>3. 兩者均為 null：均回傳 null（前端顯示「—」） |

### AC-7：頁面找不到客戶

| 項目 | 內容 |
|------|------|
| Given | customer_core 中不存在 customer_id='00000000-0000-0000-0000-000000000000' |
| When | 呼叫 `GET /api/v1/c360/customers/00000000-0000-0000-0000-000000000000` |
| Then | HTTP 404，C360_CUSTOMER_NOT_FOUND |

### AC-8：ETL 資料新鮮度提示

| 項目 | 內容 |
|------|------|
| Given | `_etl_loaded_at` = 8 天前（UTC） |
| When | 呼叫 `GET /api/v1/c360/customers/:customerId` |
| Then | API 回應 etlTracking.etlLoadedAt 欄位可由前端計算天數差；前端顯示警告 Banner「此客戶資料最後更新於 8 天前，可能非最新狀態」 |

---

## Test Scenarios

### A. API Unit Tests — 詳情端點

| ID | 場景 | 關聯需求 | 測試類型 | 前置條件 | 步驟 | 預期結果 |
|----|------|---------|---------|---------|------|---------|
| TS-F047-001 | 回傳完整客戶資料（8 個分類） | AC-2 | Integration | customer_core 存在 85 欄位完整資料的客戶；Admin Token | 1. 以 Admin Token 呼叫 `GET /api/v1/c360/customers/:customerId` | HTTP 200；回應含 customerId、identity、personalAttributes、contactInfo、addresses、employment、financial、corporate、etlTracking 共 9 個頂層鍵 |
| TS-F047-002 | 不存在的 customerId 回傳 404 | AC-7 | Integration | customer_core 不存在此 UUID | 1. 呼叫 `GET /api/v1/c360/customers/00000000-0000-0000-0000-000000000000` | HTTP 404，C360_CUSTOMER_NOT_FOUND |
| TS-F047-003 | 非 UUID 格式的 customerId 回傳 400 | 第 5.1 節 | Integration | 無 | 1. 呼叫 `GET /api/v1/c360/customers/invalid-id-format` | HTTP 400（或 422），錯誤訊息說明格式無效；不得回傳 500 |
| TS-F047-004 | 未登入呼叫詳情 API 回傳 401 | 第 5.1 節錯誤回應 | Integration | 無有效 Token | 1. 不帶 Authorization Header 呼叫 `GET /api/v1/c360/customers/:customerId` | HTTP 401，AUTH_TOKEN_MISSING |

### B. 欄位映射測試

| ID | 場景 | 關聯需求 | 測試類型 | 前置條件 | 步驟 | 預期結果 |
|----|------|---------|---------|---------|------|---------|
| TS-F047-005 | A 分類（identity）欄位映射正確 | 第 5.2 節 A | Integration | customer_core 種子資料：source_customer_no='A123456789'、customer_type_code='01'、customer_type_desc='個人'、name='王小明'、english_name='Wang Xiao Ming'；Admin Token | 1. 呼叫 `GET /api/v1/c360/customers/:customerId` | identity.sourceCustomerNo='A123456789'（Admin 明碼）；identity.customerTypeCode='01'；identity.customerTypeDesc='個人'；identity.name='王小明'；identity.englishName='Wang Xiao Ming' |
| TS-F047-006 | B 分類（personalAttributes）欄位映射正確 | 第 5.2 節 B | Integration | customer_core 種子資料含 gender、date_of_birth、marital_status_code、marital_status_desc、education_code、education_desc 等 13 個欄位有值；Admin Token | 1. 呼叫 `GET /api/v1/c360/customers/:customerId` | personalAttributes 含 gender、dateOfBirth、maritalStatusCode、maritalStatusDesc、educationCode、educationDesc、spouseName、fatherName、motherName、idIssueType、idIssueDate、idIssueAddress、driverLicense；各欄位值與種子資料一致 |
| TS-F047-007 | C 分類（contactInfo）欄位映射正確 | 第 5.2 節 C | Integration | customer_core 種子資料含 mobile_phone、home_phone、contact_phone、office_phone、registered_phone、registered_fax、business_fax、business_mobile、email、line_account；Admin Token | 1. 呼叫 `GET /api/v1/c360/customers/:customerId` | contactInfo 含 10 個欄位，值與種子資料一致（Admin 明碼） |
| TS-F047-008 | D 分類（addresses）欄位映射正確 | 第 5.2 節 D | Integration | customer_core 種子資料含 5 組 zip/address 欄位對；Admin Token | 1. 呼叫 `GET /api/v1/c360/customers/:customerId` | addresses 含 residentialZip、residentialAddress、mailingZip、mailingAddress、registeredZip、registeredAddress、companyZip、companyAddress、maturityMailingZip、maturityMailingAddress；值與種子資料一致 |
| TS-F047-009 | E 分類（employment）欄位映射正確 | 第 5.2 節 E | Integration | customer_core 種子資料含 company_name、occupation_code/desc、job_title_code/desc、job_level_code/desc、industry_code/desc、work_years、company_scale、role；Admin Token | 1. 呼叫 `GET /api/v1/c360/customers/:customerId` | employment 含 12 個欄位，值與種子資料一致 |
| TS-F047-010 | F 分類（financial）欄位映射正確 | 第 5.2 節 F | Integration | customer_core 種子資料含 monthly_income_code/desc、approved_income、income_source_code/desc、capital、credit_limit、highest_transaction_amount、highest_transaction_date、has_real_estate、debt_flag='N'、fine_flag='N'、address_anomaly_flag、mainland_flag；Admin Token | 1. 呼叫 `GET /api/v1/c360/customers/:customerId` | financial 含 14 個欄位，值與種子資料一致 |
| TS-F047-011 | G 分類（corporate）欄位映射正確（企業客戶） | 第 5.2 節 G | Integration | customer_core 種子資料 customer_type_code='02'，含 owner_name、owner_id 等 15 個企業欄位有值；Admin Token | 1. 呼叫 `GET /api/v1/c360/customers/:customerId` | corporate 含 15 個欄位，值與種子資料一致；ownerName、ownerId 等非 null |
| TS-F047-012 | H 分類（etlTracking）欄位映射正確 | 第 5.2 節 H | Integration | customer_core 種子資料含 source_created_at、source_updated_at、data_source、_etl_loaded_at、_etl_pipeline_id；Admin Token | 1. 呼叫 `GET /api/v1/c360/customers/:customerId` | etlTracking 含 sourceCreatedAt、sourceUpdatedAt、dataSource、etlLoadedAt、etlPipelineId；值與種子資料一致；時間欄位為 ISO 8601 UTC 格式 |

### C. 敏感資料遮罩測試

| ID | 場景 | 關聯需求 | 測試類型 | 前置條件 | 步驟 | 預期結果 |
|----|------|---------|---------|---------|------|---------|
| TS-F047-013 | Admin 看到所有敏感欄位完整明碼 | 第 6 節遮罩規則 | Integration | customer_core 含完整聯絡資訊的客戶；Admin Token | 1. 以 Admin Token 呼叫 `GET /api/v1/c360/customers/:customerId` | identity.sourceCustomerNo='A123456789'（完整）；contactInfo.mobilePhone='0912345678'（完整）；contactInfo.email='wang@example.com'（完整） |
| TS-F047-014 | User 看到遮罩後的 source_customer_no | 第 6 節遮罩規則 | Integration | customer_core 含 source_customer_no='A123456789' 的客戶；User Token | 1. 以 User Token 呼叫 `GET /api/v1/c360/customers/:customerId` | identity.sourceCustomerNo = 'A12****89'（前 3 + 後 2，中間 `*` 填充） |
| TS-F047-015 | User 看到遮罩後的 mobile_phone | 第 6 節遮罩規則 | Integration | customer_core 含 mobile_phone='0912345678' 的客戶；User Token | 1. 以 User Token 呼叫 `GET /api/v1/c360/customers/:customerId` | contactInfo.mobilePhone = '0912***78'（前 4 + 後 2，中間 `*` 填充） |
| TS-F047-016 | User 看到遮罩後的 email | 第 6 節遮罩規則 | Integration | customer_core 含 email='wang@example.com' 的客戶；User Token | 1. 以 User Token 呼叫 `GET /api/v1/c360/customers/:customerId` | contactInfo.email = 'wa****@example.com'（@ 前僅保留前 2 字元，其餘以 `*` 填充，@ 後 domain 完整顯示） |
| TS-F047-017 | User 看到遮罩後的 home_phone、contact_phone、office_phone | 第 6 節遮罩規則 | Integration | customer_core 含 home_phone='02-23456789'、contact_phone='02-34567890'、office_phone='02-45678901#123' 的客戶；User Token | 1. 以 User Token 呼叫 `GET /api/v1/c360/customers/:customerId` | contactInfo.homePhone = '02-2***89'；contactInfo.contactPhone = '02-3***90'；contactInfo.officePhone = '02-4***01'（各前 4 + 後 2，中間 `*` 填充） |

### D. 顯示邏輯測試

| ID | 場景 | 關聯需求 | 測試類型 | 前置條件 | 步驟 | 預期結果 |
|----|------|---------|---------|---------|------|---------|
| TS-F047-018 | code/desc 欄位組合：desc 與 code 均有值 | AC-3，第 7.1 節 | Frontend Unit | stub API 回傳 maritalStatusCode='1'、maritalStatusDesc='已婚' | 1. 渲染詳情頁 B 分類 | 「婚姻狀態」欄位顯示「已婚（1）」 |
| TS-F047-019 | NULL 欄位在前端顯示「—」 | AC-4，第 7.2 節 | Frontend Unit | stub API 回傳 spouseName=null、capital=null | 1. 渲染詳情頁 | 「配偶姓名」與「資本額」欄位顯示「—」；不顯示 'null'、'undefined' 或空白 |
| TS-F047-020 | debt_flag='Y' 時顯示警告色 Badge | AC-5，第 7.3 節 | Frontend Unit | stub API 回傳 financial.debtFlag='Y' | 1. 渲染詳情頁 F 分類 | debt_flag 欄位以警告色 Badge 顯示（色碼 #F59E0B）；不以一般文字顯示 |
| TS-F047-021 | fine_flag='Y' 時顯示警告色 Badge | AC-5，第 7.3 節 | Frontend Unit | stub API 回傳 financial.fineFlag='Y' | 1. 渲染詳情頁 F 分類 | fine_flag 欄位以警告色 Badge 顯示（色碼 #F59E0B） |
| TS-F047-022 | 風控旗標值非 'Y' 時不觸發高亮 | AC-5，第 7.3 節 | Frontend Unit | stub API 回傳 financial.debtFlag='N'、financial.fineFlag=null | 1. 渲染詳情頁 F 分類 | debt_flag 與 fine_flag 均以一般文字顯示；不出現警告色 Badge |

### E. 客戶類型適應顯示測試

| ID | 場景 | 關聯需求 | 測試類型 | 前置條件 | 步驟 | 預期結果 |
|----|------|---------|---------|---------|------|---------|
| TS-F047-023 | 個人客戶（01）— G 分類顯示「本分類不適用」 | AC-6，第 7.4 節 | Frontend Unit | stub API 回傳 identity.customerTypeCode='01'，corporate 所有欄位均為 null | 1. 渲染詳情頁 | G 分類區塊顯示「本分類不適用」提示；不顯示空的欄位列表 |
| TS-F047-024 | 企業客戶（02）— G 分類顯示完整企業資料 | AC-6，第 7.4 節 | Frontend Unit | stub API 回傳 identity.customerTypeCode='02'，corporate 含 ownerName='張三'、establishedCapital=1000000 等有值欄位 | 1. 渲染詳情頁 | G 分類完整顯示企業欄位；不顯示「本分類不適用」 |
| TS-F047-025 | 外籍客戶（04）— G 分類顯示「本分類不適用」 | AC-6，第 7.4 節 | Frontend Unit | stub API 回傳 identity.customerTypeCode='04'，corporate 所有欄位均為 null | 1. 渲染詳情頁 | G 分類區塊顯示「本分類不適用」；外籍客戶 B 分類（個人屬性）正常顯示 |

### F. 資料新鮮度測試

| ID | 場景 | 關聯需求 | 測試類型 | 前置條件 | 步驟 | 預期結果 |
|----|------|---------|---------|---------|------|---------|
| TS-F047-026 | _etl_loaded_at 在 7 天以內 — 不顯示警告 | AC-8，第 7.5 節 | Frontend Unit | stub API 回傳 etlTracking.etlLoadedAt = 6 天前的 ISO 8601 UTC 時間；使用 clock mock 固定「當前時間」 | 1. 渲染詳情頁 | 頁面不顯示資料新鮮度警告 Banner |
| TS-F047-027 | _etl_loaded_at 超過 7 天 — 顯示警告 Banner | AC-8，第 7.5 節 | Frontend Unit | stub API 回傳 etlTracking.etlLoadedAt = 8 天前的 ISO 8601 UTC 時間；使用 clock mock 固定「當前時間」 | 1. 渲染詳情頁 | 顯示警告 Banner「此客戶資料最後更新於 8 天前，可能非最新狀態」；N = Math.ceil(差距天數) |

### G. 效能測試

| ID | 場景 | 關聯需求 | 測試類型 | 前置條件 | 步驟 | 預期結果 |
|----|------|---------|---------|---------|------|---------|
| TS-F047-028 | 單一客戶詳情查詢回應時間 < 1 秒 | NFR-002（第 11 節） | Performance | customer_core 含 1,000 筆資料，目標客戶存在 | 1. 以 Admin Token 呼叫 `GET /api/v1/c360/customers/:customerId`<br>2. 記錄 P95 回應時間 | P95 回應時間 < 1,000ms |

### H. 前端測試

| ID | 場景 | 關聯需求 | 測試類型 | 前置條件 | 步驟 | 預期結果 |
|----|------|---------|---------|---------|------|---------|
| TS-F047-029 | Header 渲染客戶姓名、類型 Badge、客戶編號 | AC-1 | Frontend Unit | stub API 回傳 name='王小明'、customerTypeDesc='個人'、sourceCustomerNo='A12****89'（User 遮罩） | 1. 渲染詳情頁 Header 區域 | 顯示「王小明」；顯示「個人」類型 Badge；顯示 'A12****89' 客戶編號 |
| TS-F047-030 | 8 個分類卡片全部渲染正確欄位數 | AC-2 | Frontend Unit | stub API 回傳完整 85 欄位資料 | 1. 渲染詳情頁所有分類 | A~H 各分類卡片/Accordion 均可見；各分類標題文字符合規格（如「A. 識別與分類」） |
| TS-F047-031 | NULL 欄位前端顯示「—」 | AC-4 | Frontend Unit | stub API 回傳多個欄位為 null（如 spouseName=null、capital=null） | 1. 渲染詳情頁 | null 欄位顯示「—」（em dash，U+2014）；不顯示 'null'、'undefined' 或空白字串 |
| TS-F047-032 | 風控旗標 Badge 以警告色渲染 | AC-5 | Frontend Unit | stub API 回傳 debtFlag='Y'、fineFlag='Y' | 1. 渲染詳情頁 F 分類 | 兩個旗標均以警告色 Badge 顯示；Badge 樣式具有 `#F59E0B` 的 Tailwind 色調（amber） |
| TS-F047-033 | 資料新鮮度警告 Banner 顯示 | AC-8 | Frontend Unit | stub API 回傳 etlLoadedAt = 10 天前；clock mock 固定當前時間 | 1. 渲染詳情頁 | Header 下方顯示警告 Banner「此客戶資料最後更新於 10 天前，可能非最新狀態」 |
| TS-F047-034 | 企業客戶 — 隱藏個人欄位敘述並顯示 G 分類 | AC-6 | Frontend Unit | stub API 回傳 customerTypeCode='02'，corporate 有值 | 1. 渲染詳情頁 | G 分類顯示完整企業欄位；不顯示「本分類不適用」 |
| TS-F047-035 | 個人客戶 — G 分類顯示「本分類不適用」 | AC-6 | Frontend Unit | stub API 回傳 customerTypeCode='01' | 1. 渲染詳情頁 | G 分類區塊顯示「本分類不適用」文字；不渲染 ownerName 等企業欄位 |
| TS-F047-036 | 404 狀態渲染錯誤提示與返回按鈕 | AC-7 | Frontend Unit | stub API 回傳 HTTP 404 | 1. 渲染詳情頁 | 顯示「找不到此客戶資料」錯誤提示；顯示「返回清單」按鈕 |
| TS-F047-037 | 「返回清單」按鈕導覽至清單頁 | AC-7，AC-1 | Frontend Unit | 詳情頁已渲染（正常或 404 狀態） | 1. 點擊「返回清單」按鈕 | 導覽至 `/c360/customers` |
| TS-F047-038 | Admin 與 User 的遮罩顯示差異（前端） | 第 6 節遮罩規則 | Frontend Unit | Admin stub 回傳明碼；User stub 回傳遮罩值（API 層已處理遮罩，前端直接渲染） | 1. 以 Admin stub 渲染詳情頁，記錄 sourceCustomerNo 顯示值<br>2. 以 User stub 渲染詳情頁，記錄 sourceCustomerNo 顯示值 | Admin 顯示 'A123456789'（明碼）；User 顯示 'A12****89'（遮罩）；前端無自行遮罩邏輯（值直接來自 API） |
