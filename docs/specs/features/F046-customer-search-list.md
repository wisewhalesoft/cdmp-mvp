---
spec-id: F046
title: Customer 360 — 客戶搜尋與清單
feature-id: F046
source-story: US-060
epic: E06
priority: P0-MVP
version: "1.0"
date: 2026-04-13
status: Draft
---

# F046: Customer 360 — 客戶搜尋與清單

Priority: P0-MVP | Status: Draft | Last Updated: 2026-04-13

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + `data-model.md#customer-core-entity` + `error-handling.md#c360-errors` |
| QA / Tester | 本文件 + `error-handling.md#c360-errors` |
| UI/UX Designer | 本文件（第 9 節 UI/UX 需求） |
| Architect | 本文件 + `nfr.md#NFR-002` + `data-model.md#customer-core-entity` |

---

## 1. 功能摘要

提供已登入使用者（Admin / User）搜尋與瀏覽客戶清單的能力。系統從 `customer_core` 目標表讀取資料，支援統計摘要卡片、Full-Text Search（姓名）、精確比對（身分證/統編）、客戶類型篩選與分頁。敏感欄位依角色硬編碼遮罩。

## 2. 使用者故事

**As a** 已登入的使用者（Admin 或 User）
**I want** 透過關鍵字搜尋與多條件篩選，快速找到目標客戶並瀏覽客戶清單
**So that** 我能快速定位需要服務或追蹤的客戶，提升工作效率

## 3. 前置條件

- 使用者已通過驗證（E01），持有有效 JWT Token
- `customer_core` 目標表已建立且 Schema 已更新至 85 欄位版本（F036 v2.4）
- **[前置條件]** customer_core 需建立 GIN 全文搜尋索引（需新增獨立 Migration，見第 7.2 節）
- ETL Pipeline（E05）至少已執行過一次，`customer_core` 已有資料（非空狀態另行處理，見 AC-9）

## 4. 驗收標準

### AC-1：進入客戶清單頁面

- Given 已登入的使用者點擊左側 Sidebar「Customer 360」導覽項目
- When 頁面載入完成
- Then 顯示客戶清單，包含統計摘要卡片（總客戶數、個人客戶數、企業客戶數、外籍客戶數）以及分頁列表

### AC-2：關鍵字搜尋（姓名）— Full-Text Search

- Given 使用者在搜尋框輸入客戶姓名關鍵字（至少 2 個字元）
- When 使用者按下 Enter 或點擊搜尋按鈕
- Then 清單以全文搜尋（Full-Text Search）方式搜尋 `name`（中文姓名）及 `english_name` 欄位，返回包含該關鍵字的客戶

### AC-3：精確搜尋（身分證/統編）

- Given 使用者在搜尋框輸入完整的身分證字號或統一編號
- When 使用者按下 Enter 或點擊搜尋按鈕
- Then 清單精確比對 `source_customer_no` 欄位，返回符合的客戶（0 或 1 筆）

### AC-4：依客戶類型篩選

- Given 使用者從「客戶類型」下拉選單選擇篩選條件（全部 / 個人 / 企業 / 外籍）
- When 使用者選擇完成
- Then 前端立即觸發後端 API 請求（`type` 參數），清單更新為對應 `customer_type_code` 的客戶（01=個人、02=企業、04=外籍）
- **[G-05 已解決]**「即時篩選」定義：選單值變更後，前端自動觸發後端 API 查詢，非前端本地過濾

### AC-5：清單欄位顯示

- Given 客戶清單顯示資料
- When 清單載入完成
- Then 每一列顯示以下欄位：客戶姓名/企業名稱、客戶類型、身分證/統編、行動電話、公司名稱
- And 敏感欄位遮罩規則依角色決定（見第 6 節）

### AC-6：分頁

- Given 查詢結果超過 20 筆
- When 清單載入完成
- Then 底部顯示分頁控制元件，每頁顯示 20 筆，可切換頁碼，顯示總筆數

### AC-7：點擊客戶進入 360 檢視

- Given 清單顯示客戶資料
- When 使用者點擊某一客戶列（或「查看」按鈕）
- Then 導覽至該客戶的 360 檢視頁面（F047 / US-061），URL 為 `/c360/customers/:customerId`

### AC-8：空狀態處理（搜尋無結果）

- Given 搜尋或篩選後無符合結果
- When 清單載入完成
- Then 顯示空狀態提示「找不到符合條件的客戶」，並提供「清除篩選條件」按鈕

### AC-9：customer_core 無資料

- Given ETL Pipeline 尚未執行，`customer_core` 表無資料
- When 使用者進入客戶清單頁面
- Then 顯示說明訊息「客戶資料尚未載入，請聯絡管理員執行 ETL Pipeline」，不顯示空的清單表格
- And 統計摘要卡片數值均顯示 0

## 5. API 規格

### 5.1 GET /api/v1/c360/customers/stats

**說明：** 取得客戶統計摘要。

**Request Headers:**

| Header | 值 | 必填 |
|--------|---|------|
| Authorization | Bearer {token} | 是 |

**Response — 200 OK:**

```json
{
  "total": 1000,
  "individual": 650,
  "corporate": 200,
  "foreign": 150
}
```

| 欄位 | 型別 | 說明 |
|------|------|------|
| total | integer | 總客戶數（`customer_core` 全表 COUNT） |
| individual | integer | 個人客戶數（`customer_type_code = '01'`） |
| corporate | integer | 企業客戶數（`customer_type_code = '02'`） |
| foreign | integer | 外籍客戶數（`customer_type_code = '04'`） |

**錯誤回應：**

| HTTP Status | 錯誤碼 | 說明 |
|-------------|--------|------|
| 401 | AUTH_TOKEN_MISSING / AUTH_TOKEN_EXPIRED / AUTH_TOKEN_INVALID | 未登入或 Token 無效 |
| 500 | SYSTEM_INTERNAL_ERROR | 伺服器內部錯誤 |

---

### 5.2 GET /api/v1/c360/customers

**說明：** 搜尋與分頁瀏覽客戶清單。

**Request Headers:**

| Header | 值 | 必填 |
|--------|---|------|
| Authorization | Bearer {token} | 是 |

**Query Parameters:**

| 參數 | 型別 | 預設值 | 必填 | 說明 |
|------|------|--------|------|------|
| keyword | string | — | 否 | Full-Text Search 關鍵字，搜尋 `name` 及 `english_name`。最少 2 個字元，不足 2 字元回傳 422 |
| idNumber | string | — | 否 | 精確比對 `source_customer_no`（身分證字號或統一編號） |
| type | string | — | 否 | 客戶類型篩選，允許值：`01`（個人）、`02`（企業）、`04`（外籍），支援逗號分隔多值（如 `01,02`） |
| page | integer | 1 | 否 | 頁碼（從 1 開始） |
| pageSize | integer | 20 | 否 | 每頁筆數（最大 100） |

**搜尋優先邏輯 [G-04 已解決]：**

- 若 `idNumber` 參數存在且非空，優先使用精確比對 `source_customer_no`，忽略 `keyword` 參數
- 若僅有 `keyword` 參數，使用 Full-Text Search 搜尋 `name` 及 `english_name`
- 若兩者皆未提供，回傳全部客戶（僅受 `type` 篩選影響）
- `type` 篩選與搜尋條件可同時套用（AND 組合）

**Response — 200 OK:**

```json
{
  "data": [
    {
      "customerId": "550e8400-e29b-41d4-a716-446655440000",
      "name": "王小明",
      "customerTypeCode": "01",
      "customerTypeDesc": "個人",
      "sourceCustomerNo": "A12****89",
      "mobilePhone": "0912***78",
      "companyName": "台灣科技股份有限公司"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 150,
    "totalPages": 8
  }
}
```

| 欄位 | 型別 | 來源欄位 | nullable | 說明 |
|------|------|---------|----------|------|
| customerId | string (UUID) | `customer_id` | NO | 客戶唯一識別碼 |
| name | string | `name` | NO | 客戶姓名/企業名稱 |
| customerTypeCode | string | `customer_type_code` | NO | 客戶類型代碼 |
| customerTypeDesc | string | `customer_type_desc` | YES | 客戶類型描述 |
| sourceCustomerNo | string | `source_customer_no` | NO | 身分證/統編（依角色遮罩） |
| mobilePhone | string \| null | `mobile_phone` | YES | 行動電話（依角色遮罩） |
| companyName | string \| null | `company_name` | YES | 服務公司/企業名稱 |

**錯誤回應：**

| HTTP Status | 錯誤碼 | 說明 |
|-------------|--------|------|
| 401 | AUTH_TOKEN_MISSING / AUTH_TOKEN_EXPIRED / AUTH_TOKEN_INVALID | 未登入或 Token 無效 |
| 422 | C360_SEARCH_MIN_LENGTH | keyword 不足 2 個字元 |
| 500 | SYSTEM_INTERNAL_ERROR | 伺服器內部錯誤 |

## 6. 敏感資料遮罩規則

遮罩邏輯硬編碼於 API 層（Service 或 Serializer），依 JWT Token 中的 `role` 判斷。

| 欄位 | 來源欄位 | Admin | User 遮罩規則 | 遮罩範例 |
|------|---------|-------|---------------|---------|
| sourceCustomerNo | `source_customer_no` | 完整明碼 | 前 3 碼 + 後 2 碼顯示，中間以 `*` 替代 | `A12****89` |
| mobilePhone | `mobile_phone` | 完整明碼 | 前 4 碼 + 後 2 碼顯示，中間以 `*` 替代 | `0912***78` |

**遮罩函式規格：**

- `maskIdNumber(value: string): string` — 保留前 3 碼 + 後 2 碼，中間以 `*` 填充至原始長度
- `maskPhone(value: string): string` — 保留前 4 碼 + 後 2 碼，中間以 `*` 填充至原始長度
- 若欄位值為 NULL，回傳 `null`，不套用遮罩

## 7. Full-Text Search 實作規格

### 7.1 搜尋策略

| 搜尋方式 | 觸發條件 | 搜尋欄位 | PostgreSQL 實作 |
|---------|---------|---------|----------------|
| Full-Text Search | `keyword` 參數存在（>= 2 字元） | `name`, `english_name` | `tsvector` + `tsquery` + GIN 索引 |
| 精確比對 | `idNumber` 參數存在 | `source_customer_no` | `WHERE source_customer_no = :idNumber` |

### 7.2 GIN 索引 Migration

需建立獨立的 Migration 檔案以新增 GIN 全文搜尋索引：

```sql
-- Migration: AddCustomerCoreFullTextIndex
CREATE INDEX IF NOT EXISTS idx_customer_core_fulltext
  ON customer_core
  USING GIN (to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(english_name, '')));
```

**注意事項：**

- 使用 `'simple'` 語言設定，因為主要搜尋中文姓名，不需要詞幹處理（stemming）
- 使用 `coalesce` 處理 NULL 值，避免 tsvector 建立失敗
- 此索引需在 E06 實作前建立，屬於 F046 前置條件

### 7.3 查詢語法

```sql
SELECT * FROM customer_core
WHERE to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(english_name, ''))
   @@ plainto_tsquery('simple', :keyword)
```

## 8. 篩選邏輯

### 8.1 客戶類型篩選

| 篩選值 | 對應 SQL 條件 |
|--------|-------------|
| 全部（空值） | 不加 WHERE 條件 |
| `01` | `WHERE customer_type_code = '01'` |
| `02` | `WHERE customer_type_code = '02'` |
| `04` | `WHERE customer_type_code = '04'` |
| `01,02` | `WHERE customer_type_code IN ('01', '02')` |

### 8.2 組合篩選

搜尋條件（keyword / idNumber）與類型篩選可同時套用，以 AND 組合：

```sql
WHERE (搜尋條件) AND (類型篩選條件)
```

## 9. UI/UX 需求

本節供 UI/UX Designer 參考，描述頁面功能需求與互動行為，不指定視覺設計細節。

### 9.1 頁面結構

1. **統計摘要卡片區域**（頁面頂部）
   - 4 張統計卡片：總客戶數、個人客戶數、企業客戶數、外籍客戶數
   - 資料來源：`GET /api/v1/c360/customers/stats`
   - 數值應為整數格式，無小數點

2. **搜尋與篩選區域**
   - 搜尋輸入框：placeholder 提示「搜尋客戶姓名或輸入身分證/統編」
   - 搜尋觸發方式：按下 Enter 或點擊搜尋按鈕
   - 客戶類型下拉選單：選項為「全部」「個人」「企業」「外籍」，選擇後立即觸發 API 查詢

3. **客戶清單表格**
   - 欄位：客戶姓名/企業名稱、客戶類型、身分證/統編、行動電話、公司名稱
   - 每列可點擊，點擊後導覽至 F047 客戶 360 詳情頁
   - 表格右側可提供「查看」按鈕作為輔助導覽入口

4. **分頁控制元件**（表格底部）
   - 顯示當前頁碼、總頁數、總筆數
   - 提供上一頁、下一頁、頁碼跳轉控制

### 9.2 搜尋框行為 [G-06 已解決]

- 使用者輸入不足 2 個字元時，不觸發搜尋
- 搜尋框下方顯示灰色提示文字「請輸入至少 2 個字元」
- 使用者輸入達 2 個字元以上且按下 Enter 或點擊搜尋按鈕後，觸發 API 查詢
- 前端發送 API 請求前須檢查 keyword 長度，不足 2 字元不發送請求

### 9.3 遮罩欄位顯示

- Admin 角色：所有欄位完整明碼顯示
- User 角色：`sourceCustomerNo` 及 `mobilePhone` 欄位顯示遮罩值（API 已處理遮罩，前端直接渲染）

### 9.4 空狀態

| 情境 | 顯示內容 |
|------|---------|
| 搜尋/篩選無結果 | 「找不到符合條件的客戶」+ 「清除篩選條件」按鈕 |
| customer_core 無資料 | 「客戶資料尚未載入，請聯絡管理員執行 ETL Pipeline」（不顯示表格框架） |

### 9.5 導覽

- 左側 Sidebar 新增「Customer 360」導覽項目
- 點擊後進入客戶清單頁面（`/c360/customers`）
- 點擊客戶列導覽至 `/c360/customers/:customerId`（F047）

## 10. 商業規則

| 規則編號 | 說明 |
|----------|------|
| BR-1 | 所有已登入角色（Admin / User）皆可存取客戶清單，無角色限制 |
| BR-2 | 敏感資料遮罩硬編碼於 API 層，依 JWT Token 中的 role 判斷 |
| BR-3 | `idNumber` 搜尋優先於 `keyword`；兩者同時存在時忽略 `keyword` |
| BR-4 | 預設排序：依 `name` 欄位升序排列 |
| BR-5 | 搜尋為不區分大小寫（`english_name` 搜尋時） |
| BR-6 | 後端儲存 UTC 時間，API 回應以 ISO 8601 UTC 格式輸出，前端顯示時轉換為 UTC+8（Asia/Taipei） |
| BR-7 | 統計摘要卡片數值為即時查詢，不使用快取 |
| BR-8 | 篩選類型為後端 API 查詢（`type` 參數），非前端本地過濾 |

## 11. 效能需求

| 項目 | 閾值 | 參考 |
|------|------|------|
| 客戶清單分頁查詢回應時間 | < 500ms（1,000 筆以內） | NFR-002.5 |
| 統計摘要查詢回應時間 | < 500ms | NFR-002.1 |
| Full-Text Search 回應時間 | < 500ms（1,000 筆以內，GIN 索引加速） | NFR-002.5 |
| 前端搜尋 debounce | 無（按 Enter 或點擊觸發，非即時搜尋） | — |

## 12. 錯誤場景

| 場景 | 系統回應 | 參考 |
|------|---------|------|
| 未登入存取 | HTTP 401，導向登入頁面 | error-handling.md#auth-errors |
| keyword 不足 2 字元 | HTTP 422，C360_SEARCH_MIN_LENGTH | error-handling.md#c360-errors |
| API 載入失敗 | 顯示「無法載入客戶清單，請重新整理頁面」 | error-handling.md#system-errors |
| 統計 API 載入失敗 | 統計卡片顯示「—」，不影響清單顯示 | — |

## 13. 測試案例

| # | 測試案例 | 預期結果 |
|---|---------|---------|
| 1 | customer_core 有 50 筆資料，進入清單頁 | 統計卡片顯示正確數值，列表顯示前 20 筆，分頁顯示 3 頁 |
| 2 | 搜尋「王小明」 | Full-Text Search 搜尋 name/english_name，顯示包含「王小明」的客戶 |
| 3 | 搜尋「A123456789」（完整身分證） | 精確比對 source_customer_no，顯示 0 或 1 筆 |
| 4 | 篩選客戶類型為「企業」 | 僅顯示 customer_type_code = '02' 的客戶 |
| 5 | 關鍵字搜尋 + 客戶類型篩選組合 | 同時套用兩個條件篩選（AND 組合） |
| 6 | Admin 查看清單中的 source_customer_no | 完整明碼顯示 `A123456789` |
| 7 | User 查看清單中的 source_customer_no | 遮罩顯示 `A12****89` |
| 8 | User 查看清單中的 mobile_phone | 遮罩顯示 `0912***78` |
| 9 | customer_core 無資料 | 顯示「客戶資料尚未載入」說明訊息，統計卡片數值為 0 |
| 10 | 搜尋結果為空 | 顯示空狀態提示與「清除篩選條件」按鈕 |
| 11 | 點擊客戶列 | 導覽至 `/c360/customers/:customerId`（F047） |
| 12 | 未登入使用者直接存取 URL | 導向登入頁面（401） |
| 13 | keyword 輸入 1 個字元後按 Enter | 前端不發送請求，顯示「請輸入至少 2 個字元」提示 |
| 14 | 同時傳入 keyword=王 + idNumber=A123456789 | 以 idNumber 精確比對為優先，忽略 keyword |
| 15 | 類型下拉選單選擇「個人」後立即切換為「企業」 | 前端發送 type=02 的 API 請求，清單更新 |

## 14. 假設與限制

### 假設

| 編號 | 假設 |
|------|------|
| A-1 | `customer_core` 目標表已更新至 F036 v2.4 定義的 85 欄位版本（包含 `customer_type_code`、`customer_type_desc` 等帶後綴欄位） |
| A-2 | [ASSUMPTION] 目前生產環境的 Migration 為 54 欄位精簡版，尚需執行 Migration 升級至 85 欄位。此為 E06 的前置依賴 |
| A-3 | GIN 全文搜尋索引需在單獨的 Migration 中建立，不包含在現有 customer_core 建表 Migration 中 |

### 限制

| 編號 | 限制 |
|------|------|
| C-1 | Full-Text Search 使用 PostgreSQL 原生 `tsvector`/`tsquery`，不使用外部搜尋引擎 |
| C-2 | 遮罩規則為硬編碼，不支援動態設定 |
| C-3 | 不支援排序切換（MVP 固定以 `name` 升序排列） |

## 15. 相依性

- **Blocked By**：
  - F036 / US-049（customer_core 目標表 85 欄位 Schema 必須就緒）
  - F044 / US-057（ETL TargetLoad 完成，資料已載入 customer_core）
  - E01（使用者驗證）
- **Blocks**：F047（客戶清單為進入 360 檢視的主要入口）
- **認證系統**：需要有效的已登入 Session/Token（Admin 或 User）

## 16. 交叉參考

- 資料模型：[data-model.md#customer-core-entity](../data-model.md#customer-core-entity)
- 錯誤處理：[error-handling.md#c360-errors](../error-handling.md#c360-errors)
- 非功能需求：[nfr.md#NFR-002](../nfr.md#NFR-002)
- 流程圖：[diagrams/F046-customer-search-list.mmd](../diagrams/F046-customer-search-list.mmd)
- 相關功能：[F047](F047-customer-360-detail.md)（單一客戶 360 詳情）
- 目標表定義：[F036](F036-target-tables.md)（customer_core 85 欄位完整定義）
