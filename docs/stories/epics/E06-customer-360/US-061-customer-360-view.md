# US-061：單一客戶 360 檢視

> **Story ID**：US-061
> **Epic**：[E06 — Customer 360](epic-brief.md)
> **優先級**：Must Have
> **階段**：Phase 2
> **預估點數**：8
> **變更說明（2026-04-13）**：精簡範圍 — 移除 AC-5（標籤管理入口）、AC-10（角色適應性頁面整合）；敏感資料遮罩改為 Admin 明碼 / User 固定遮罩（硬編碼）；移除 US-064/067 依賴；API Response 移除 tags 欄位

---

## User Story

**As a** 已登入的使用者（Admin 或 User）
**I want** 查看單一客戶的完整 360 側寫，包含身分識別、個人屬性、聯絡資訊、地址、職業就業、財務風控、企業資訊等所有維度
**So that** 我能在一個頁面上獲取客戶的完整樣貌，做出更準確的業務判斷或服務決策

---

## 驗收標準

### AC-1：頁面標題與頂部摘要
- **Given** 使用者從客戶清單點擊進入某客戶的 360 檢視頁面
- **When** 頁面載入完成
- **Then** 頂部顯示客戶摘要 Header：客戶姓名/企業名稱、客戶類型 Badge、客戶編號（Admin 明碼 / User 遮罩），以及「返回清單」按鈕

### AC-2：資料分類 Tabs 或 Sections 顯示
- **Given** 頁面載入完成
- **When** 系統從 customer_core 讀取該客戶資料
- **Then** 頁面以分類卡片或 Accordion 方式，顯示以下 8 個資料分類（對應 customer_core A~H 欄位群組）：
  1. **A. 識別與分類** — customer_id、source_customer_no（User 遮罩）、customer_type、name、english_name
  2. **B. 個人屬性** — gender、date_of_birth、marital_status、education、spouse_name、family members
  3. **C. 聯絡資訊** — mobile_phone（User 遮罩）、home_phone、contact_phone、office_phone、email（User 遮罩）、line_account
  4. **D. 地址** — residential_address、mailing_address、company_address 等各類地址
  5. **E. 職業與就業** — company_name、occupation、job_title、job_level、industry、work_years
  6. **F. 財務與風控** — monthly_income、approved_income、capital、credit_limit、risk flags（debt_flag、fine_flag 等）
  7. **G. 企業客戶專屬** — owner 資訊、established_capital、employee_count、is_listed（個人客戶此分類顯示「本分類不適用」）
  8. **H. 稽核與 ETL 追蹤** — source_created_at、source_updated_at、data_source、_etl_loaded_at、_etl_pipeline_id

### AC-3：程式碼欄位顯示描述值
- **Given** customer_core 包含 `_code` / `_desc` 欄位對
- **When** 頁面顯示客戶資料
- **Then** 優先顯示 `_desc` 描述值（如「個人」），並在括號內顯示原始 `_code`（如「01」），例如：「個人（01）」

### AC-4：NULL 欄位的顯示方式
- **Given** 某欄位值為 NULL 或空白
- **When** 頁面顯示該欄位
- **Then** 顯示「—」（破折號）而非空白，不顯示 null 或 undefined 字串

### AC-5：風控旗標高亮
- **Given** 客戶的 debt_flag、fine_flag 欄位值為「Y」或「1」
- **When** F. 財務與風控分類顯示
- **Then** 對應旗標以警告色（#F59E0B）Badge 醒目標示，不影響其他欄位顯示

### AC-6：客戶類型適應顯示
- **Given** 客戶類型為企業（customer_type_code = '02'）
- **When** 頁面顯示 B. 個人屬性分類
- **Then** 隱藏純個人屬性欄位（gender、date_of_birth、spouse_name 等），顯示企業專屬欄位（company_name、owner 資訊等）
- **補充**：外籍客戶（customer_type_code = '04'）視同個人客戶，B 分類個人屬性欄位正常顯示（gender、date_of_birth 等），G 分類企業客戶專屬資訊依個人客戶規則顯示「本分類不適用」

### AC-7：頁面找不到客戶
- **Given** URL 中的 customer_id 不存在於 customer_core
- **When** 頁面嘗試載入資料
- **Then** 顯示「找不到此客戶資料」錯誤提示，並提供「返回清單」按鈕

### AC-8：ETL 資料新鮮度提示
- **Given** `_etl_loaded_at` 距今超過 7 天
- **When** 頁面載入完成
- **Then** 在頁面頂部顯示警告提示：「此客戶資料最後更新於 N 天前，可能非最新狀態」

---

## Technical Notes

- 資料來源：直接讀取 `customer_core` 目標表，以 `customer_id`（UUID）作為查詢鍵
- 敏感資料遮罩規則：硬編碼於 API 層，依呼叫者角色決定：
  - Admin：所有欄位完整明碼顯示
  - User：身分證前 3 碼 + 後 2 碼顯示（例：`A12****89`）；電話前 4 碼 + 後 2 碼顯示（例：`0912***78`）；Email @ 前僅顯示前 2 字元（例：`wa****@gmail.com`）
- 企業分類（G 類欄位）：僅 customer_type_code = '02' 時顯示完整企業資料；個人客戶（'01'）與外籍客戶（'04'）均顯示「本分類不適用」
- 時區：`_etl_loaded_at`、`source_created_at`、`source_updated_at` 後端儲存 UTC，前端顯示轉換為 UTC+8
- 效能：頁面載入時間 < 1 秒（單筆查詢，NFR-002）

### API 端點

**單一客戶詳情**

- 端點：`GET /api/v1/c360/customers/:customerId`
- Response：
```json
{
  "customerId": "uuid",
  "identity": {
    "sourceCustomerNo": "A12****89",
    "customerTypeCode": "01",
    "customerTypeDesc": "個人",
    "name": "王小明",
    "englishName": "Wang Xiao Ming"
  },
  "personalAttributes": { ... },
  "contactInfo": { ... },
  "addresses": { ... },
  "employment": { ... },
  "financial": { ... },
  "corporate": { ... },
  "etlTracking": {
    "sourceCreatedAt": "ISO8601",
    "sourceUpdatedAt": "ISO8601",
    "dataSource": "ZZIP+MLMC",
    "etlLoadedAt": "ISO8601",
    "etlPipelineId": "uuid"
  }
}
```

---

## 測試案例

| # | 測試案例 | 預期結果 |
|---|---------|---------|
| 1 | 進入個人客戶（type=01）360 頁面 | 顯示 A~F、H 分類，G 分類顯示「不適用」 |
| 2 | 進入企業客戶（type=02）360 頁面 | 顯示 A~H 全部分類，G 分類有完整資料 |
| 3 | 欄位 date_of_birth 為 NULL | 顯示「—」，不顯示空白 |
| 4 | debt_flag = 'Y' | F 分類的消債旗標以警告色 Badge 標示 |
| 5 | customer_type_desc 有值 | 顯示「個人（01）」格式 |
| 6 | _etl_loaded_at 距今 10 天 | 頂部顯示資料新鮮度警告 |
| 7 | 存取不存在的 customer_id | 顯示 404 錯誤提示與返回按鈕 |
| 8 | 未登入直接存取 URL | 導向登入頁面（401）|
| 9 | Admin 查看 mobile_phone 0912345678 | 完整明碼顯示 `0912345678` |
| 10 | User 查看 mobile_phone 0912345678 | 遮罩顯示 `0912***78` |

---

## 依賴關係

- **Blocked By**：US-060（客戶清單為主要入口）、US-049（customer_core 目標表）
- **Blocks**：無

---

## Definition of Done

- [ ] 單一客戶詳情 API 實作完成（含 8 個資料分類的欄位映射）
- [ ] 敏感資料遮罩硬編碼於 API 層（Admin 明碼 / User 固定遮罩）
- [ ] 前端頁面含 8 個資料分類展示（分類卡片或 Accordion）
- [ ] NULL 欄位顯示「—」處理完成
- [ ] 企業/個人客戶的適應性顯示邏輯實作完成
- [ ] 風控旗標高亮顯示實作完成
- [ ] ETL 資料新鮮度警告實作完成（超過 7 天）
- [ ] 頁面不存在時的 404 處理
- [ ] 效能符合 NFR-002（1 秒內載入）
- [ ] 單元測試覆蓋率達標（> 80%）

---

## 相關文件

- **Epic Brief**：[E06 Epic Brief](epic-brief.md)
- **依賴**：US-049（customer_core 欄位定義）
- **相關 Story**：US-060（客戶搜尋）
- **NFR**：[NFR-002 效能](../../non-functional/NFR-002-performance.md)
