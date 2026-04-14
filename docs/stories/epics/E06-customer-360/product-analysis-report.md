---
type: product-analysis-report
epic: E06
date: 2026-04-13
status: CONFIRMED
prepared-by: product-analyst
---

# E06 Customer 360 — 產品分析報告

> **適用 Epic**：E06 — Customer 360
> **涵蓋 Stories**：US-060（客戶搜尋與清單）、US-061（單一客戶 360 檢視）
> **分析日期**：2026-04-13
> **報告用途**：供 Spec Writer 接手前的最終確認，標記所有需補強事項與 Feature 分解建議

---

## 1. Story 完整性審查

### 1.1 US-060：客戶搜尋與清單

#### 驗收標準可測試性評估

| AC | 標題 | 可測試性 | 評語 |
|----|------|---------|------|
| AC-1 | 進入客戶清單頁面 | 通過 | Given/When/Then 完整，統計卡片欄位（總計、個人、企業、外籍）明確 |
| AC-2 | Full-Text Search（姓名） | 通過 | 欄位（`name`、`english_name`）明確；「至少 2 個字元」觸發條件可測試 |
| AC-3 | 精確搜尋（身分證/統編） | 通過 | 精確比對 `source_customer_no`，回傳 0 或 1 筆，條件清晰 |
| AC-4 | 依客戶類型篩選 | 通過 | 代碼值（01/02/04）明確對應，「即時篩選」略模糊 — 見下方說明 |
| AC-5 | 清單欄位顯示 | 通過 | 欄位清單及遮罩規則明確；Admin/User 區分可測試 |
| AC-6 | 分頁 | 通過 | 每頁 20 筆、顯示總筆數，可精確驗證 |
| AC-7 | 點擊進入 360 檢視 | 通過 | 導覽目標（US-061）明確 |
| AC-8 | 空狀態處理 | 通過 | 空訊息文案及清除按鈕均可測試 |
| AC-9 | customer_core 無資料 | 通過 | 與 AC-8 情境不同，區分正確 |

**AC-4 補充說明**：「即時篩選」語意不明確 — 是指選單值改變後「無需按確認鍵立即觸發 API 查詢」還是「前端本地過濾」？建議在 Spec 階段明確定義為後端 API 查詢（非前端本地過濾）。

#### API 規格完整性

| 端點 | 狀態 | 缺漏項目 |
|------|------|---------|
| `GET /api/v1/c360/customers/stats` | 部分完整 | 未定義 401 / 403 錯誤回應格式 |
| `GET /api/v1/c360/customers` | 部分完整 | 未定義 401 / 403 錯誤回應；`keyword` 與 `idNumber` 同時傳入時的優先邏輯未說明 |

**發現的問題 — 關鍵字衝突處理**：API 端點同時支援 `keyword`（Full-Text Search）與 `idNumber`（精確比對），但未說明兩者同時傳入的行為。應在 Spec 中明確：

> 若 `idNumber` 存在，優先使用精確比對，忽略 `keyword`；若僅有 `keyword`，則使用 Full-Text Search。

#### 資料欄位映射驗證（對比 Migration 實際欄位）

| US-060 引用欄位 | Migration 實際欄位 | 狀態 | 備註 |
|----------------|-------------------|------|------|
| `name` | `name` | 一致 | |
| `english_name` | `english_name` | 一致 | |
| `source_customer_no` | `source_customer_no` | 一致 | |
| `customer_type_code` | `customer_type`（無 `_code` 後綴） | **不一致** | 見下方重要差異說明 |
| `mobile_phone` | `mobile_phone` | 一致 | |
| `company_name` | `company_name` | 一致 | |

**重要差異 — `customer_type` vs `customer_type_code`**：Migration 中欄位名稱為 `customer_type`（無 `_code` 後綴），但 F036 Spec 及 US-060/US-061 Stories 均引用 `customer_type_code`（含 `_code` 後綴）。此外，Migration 也未包含 `customer_type_desc` 欄位。

此差異代表 Migration 與 F036 Spec 之間存在版本落差：Migration 為早期精簡版本（54 欄位），F036 Spec 描述完整的 85 欄位定義。Stories 中引用的欄位名稱應以 **F036 Spec（v2.4）為準**，Spec Writer 需確認目前生產 Migration 是否已更新至 85 欄位版本（或仍為 54 欄位版本）。

---

### 1.2 US-061：單一客戶 360 檢視

#### 驗收標準可測試性評估

| AC | 標題 | 可測試性 | 評語 |
|----|------|---------|------|
| AC-1 | 頁面標題與頂部摘要 | 通過 | Header 內容及「返回清單」按鈕可驗證 |
| AC-2 | 8 個資料分類顯示 | 通過 | 8 個分類及欄位群組對應明確 |
| AC-3 | `_code`/`_desc` 欄位顯示格式 | 通過 | 「個人（01）」格式可精確測試 |
| AC-4 | NULL 欄位顯示「—」 | 通過 | 明確、可單元測試 |
| AC-5 | 風控旗標高亮 | 通過 | 觸發條件（`Y` 或 `1`）及顏色（`#F59E0B`）明確可驗 |
| AC-6 | 客戶類型適應顯示 | 通過 | 企業（02）、個人（01）、外籍（04）規則均已說明 |
| AC-7 | 頁面找不到客戶 | 通過 | 404 訊息文案及返回按鈕可測 |
| AC-8 | ETL 資料新鮮度提示 | 通過 | 「超過 7 天」及訊息格式（「N 天前」）明確 |

**AC-5 補充說明**：`fine_flag` 在 Migration 中為 `CHAR(1)`，觸發條件為「`Y` 或 `1`」。由於兩個欄位的資料類型相同但值域混用字元與數字，建議 Spec Writer 在技術備註中統一說明：以 ETL 來源為準，MVP 階段以「值為 `Y`」作為旗標觸發條件，不需兼容 `1`（除非來源系統確認有可能輸入 `1`）。

#### API 規格完整性

| 端點 | 狀態 | 缺漏項目 |
|------|------|---------|
| `GET /api/v1/c360/customers/:customerId` | 部分完整 | Response schema 使用 `{ ... }` 佔位，8 個分類的完整欄位清單未在 API 文件中展開；未定義 404 錯誤回應格式 |

**建議**：Spec Writer 應在 F 編號規格文件中，提供完整 Response JSON schema（含所有 85 欄位的映射），而非以 `{ ... }` 佔位。

#### 資料欄位映射驗證

| US-061 AC-2 引用欄位群組 | F036 實際欄位 | Migration 實際欄位 | 狀態 |
|------------------------|-------------|-------------------|------|
| A：`customer_type`（引用為 `customer_type`） | `customer_type_code` + `customer_type_desc` | `customer_type`（無後綴） | 需確認 |
| B：`marital_status` | `marital_status_code` + `marital_status_desc` | `marital_status`（無後綴） | Migration 落差 |
| B：`id_issue_type`、`id_issue_date`、`id_issue_address`、`driver_license` | F036 中有定義 | Migration 中**未包含** | Migration 落差 |
| B：`father_name`、`mother_name` | F036 中有定義 | Migration 中**未包含** | Migration 落差 |
| C：`registered_phone`、`registered_fax`、`business_fax`、`business_mobile` | F036 中有定義 | Migration 中**未包含** | Migration 落差 |
| D：`registered_zip`、`registered_address`、`maturity_mailing_zip`、`maturity_mailing_address` | F036 中有定義 | Migration 中**未包含** | Migration 落差 |
| E：`role`（客戶角色）、`job_level_code`（F036 拆分為 `job_level_code`）| F036 有 `job_level_code` + `job_level_desc` | Migration 有 `job_level`（無後綴）| Migration 落差 |
| F：`monthly_income_code`、`income_source_code` | F036 有 code + desc 配對 | Migration 有 `monthly_income`（decimal）、`income_source`（無後綴）| 型別不同 |
| F：`highest_transaction_amount`、`highest_transaction_date` | F036 中有定義 | Migration 中**未包含** | Migration 落差 |
| G：`owner_zip`、`owner_address`、`group_owner`、`business_item`、`organization_type`、`parent_customer_name` | F036 中有定義 | Migration 中**未包含** | Migration 落差 |

**結論**：Migration（54 欄位）與 F036 Spec（85 欄位）存在顯著差距。E06 Stories 的欄位引用是基於 F036 Spec（85 欄位完整版）。**Spec Writer 必須先確認 Migration 是否已更新為 85 欄位版本，若尚未更新，E06 實作所依賴的欄位將不存在於資料庫中。**

---

## 2. 缺口與建議

### 2.1 關鍵缺口（需在 Spec 階段解決）

| # | 缺口類型 | 描述 | 影響 Story | 建議處理 |
|---|---------|------|-----------|---------|
| G-01 | Schema 版本不一致 | Migration（54 欄位）vs F036 Spec（85 欄位）存在落差 | US-060、US-061 | Spec Writer 確認目前 DB 實際欄位，或要求 E05 補 Migration |
| G-02 | 欄位命名不一致 | `customer_type` vs `customer_type_code`；`marital_status` vs `marital_status_code`；`job_level` vs `job_level_code` | US-060、US-061 | 以 F036 Spec 為主，Spec Writer 統一命名 |
| G-03 | API 錯誤回應未定義 | 兩個端點的 401/403/404 錯誤格式均未明確 | US-060、US-061 | Spec Writer 參照 error-handling.md 補充 |
| G-04 | `keyword` + `idNumber` 共存邏輯 | 兩個搜尋參數同時傳入的優先順序未定義 | US-060 | Spec Writer 明確：idNumber 優先，忽略 keyword |
| G-05 | 「即時篩選」定義模糊 | AC-4 的「即時篩選」未明確是否為後端查詢 | US-060 | Spec Writer 明確：類型選單變更後觸發後端 API 請求 |
| G-06 | AC-2 最小字元限制前端行為 | 「至少 2 個字元」的邊界行為（不足 2 字元時 UI 呈現）未定義 | US-060 | Spec Writer 補充：不足 2 字元不觸發搜尋，顯示灰色提示 |
| G-07 | US-061 API Response schema 不完整 | 8 個分類使用 `{ ... }` 佔位，無法直接用於開發 | US-061 | Spec Writer 展開完整欄位清單 |
| G-08 | `fine_flag` 觸發值域模糊 | AC-5 描述「`Y` 或 `1`」，但應以來源系統實際輸出為準 | US-061 | Spec Writer 確認來源系統輸出值，統一觸發條件 |

### 2.2 次要建議（不影響核心實作）

| # | 類型 | 描述 |
|---|------|------|
| M-01 | 效能 NFR 未登記 | NFR-002「受影響的 Stories」表未包含 US-060/US-061，建議更新 NFR-002 加入此兩條 |
| M-02 | Email 遮罩規則一致性 | US-060（清單頁）未顯示 Email 欄位，但 US-061（360 頁）有 Email 遮罩。清單欄位中若未來加入 Email，規則應保持一致，Spec Writer 可做備註 |
| M-03 | `address_anomaly_flag` 與 `mainland_flag` 顯示邏輯 | 這兩個 `SMALLINT` 旗標未在 AC-5 中列為風控高亮項目；建議 Spec Writer 確認是否應與 `debt_flag`/`fine_flag` 同樣高亮 |
| M-04 | GIN 索引需求 | US-060 Technical Notes 指出需建立 GIN 全文搜尋索引，但 Migration 中未包含；需確認是否在單獨 Migration 中建立 |

---

## 3. 依賴關係驗證

### 3.1 上游依賴

| 依賴項目 | 聲明於 | 實際狀態 | 評估 |
|---------|-------|---------|------|
| E01（使用者驗證） | Epic Brief | E01 為 Phase 1，應已完成 | 依賴正確 |
| E05 US-049（customer_core 目標表存在） | US-060、US-061 | Migration 存在，但為 54 欄位精簡版 | **需確認是否已更新至 85 欄位** |
| E05 US-057（ETL TargetLoad 節點完成，資料已載入） | Epic Brief | Phase 1 功能，應已完成 | 依賴正確 |

### 3.2 缺漏依賴

目前故事中宣告「Blocked By US-049」，但未明確宣告依賴 **GIN 全文搜尋索引的建立**。此索引是 US-060 AC-2（Full-Text Search）的必要條件，但不包含在任何現有 Migration 中。建議在 Spec Writer 階段新增此前置條件。

### 3.3 下游封鎖

E06 不封鎖任何下游 Story，此設計正確（Customer 360 為消費端模組）。

---

## 4. Feature 分解建議（供 Spec Writer 參考）

建議將 E06 拆分為以下兩個 Feature Spec：

### F046：Customer 360 — 客戶搜尋與清單 API

**對應 Story**：US-060

**範圍**：
- `GET /api/v1/c360/customers/stats` — 統計摘要 API
- `GET /api/v1/c360/customers` — 分頁清單 API（含 Full-Text Search、精確比對、類型篩選）
- API 層的敏感資料遮罩邏輯（Admin/User 分支）
- PostgreSQL GIN 全文搜尋索引建立（需補 Migration）
- 前端：統計卡片、搜尋框、類型下拉、分頁元件、空狀態畫面

**邊界**：不包含單一客戶詳情頁（屬 F047）

**可獨立測試**：是（可在 US-061 前完成，清單頁可做單獨測試）

---

### F047：Customer 360 — 單一客戶詳情 API

**對應 Story**：US-061

**範圍**：
- `GET /api/v1/c360/customers/:customerId` — 單一客戶詳情 API
- 8 個資料分類的欄位映射邏輯（A~H）
- API 層的敏感資料遮罩邏輯（Admin/User 分支，含 Email 遮罩）
- 前端：360 詳情頁（分類卡片 / Accordion），含 NULL 值「—」處理、code/desc 顯示格式、風控旗標高亮、ETL 新鮮度警告、企業/個人類型適應顯示
- 404 錯誤處理

**邊界**：不包含清單頁（屬 F046）；不包含匯出、互動紀錄、標籤（已移除範圍）

**可獨立測試**：是（需 customer_core 有資料，但不依賴 F046 的前端實作）

---

### Feature 分解說明

兩個 Feature 分解策略的優點：
1. **獨立可交付**：F046 可先上線供驗收，F047 接續實作
2. **單一責任**：清單邏輯（搜尋、篩選、分頁）與詳情邏輯（欄位映射、類型適應顯示）完全分離
3. **測試邊界清晰**：E2E 測試路徑明確（清單→點擊→360 頁面）

---

## 5. 確認狀態

### US-060：客戶搜尋與清單

**狀態**：CONFIRMED（含條件）

核心驗收標準清晰可測，API 端點已定義，遮罩規則明確。以下項目在進入 Spec 寫作前需由 Spec Writer 處理：

- 確認 customer_core Migration 已更新至包含必要欄位（`customer_type_code` 等）
- 明確 `keyword` + `idNumber` 同時傳入的優先邏輯
- 補充 API 錯誤回應格式（401/403）
- 明確「即時篩選」為後端 API 觸發

> **結論：Ready for Spec Writer（待 G-01、G-02、G-04、G-05 在 Spec 文件中解決）**

---

### US-061：單一客戶 360 檢視

**狀態**：CONFIRMED（含條件）

8 個資料分類框架完整，驗收標準可測試，遮罩與空值處理規則明確。以下項目在進入 Spec 寫作前需由 Spec Writer 處理：

- 確認 customer_core Migration 欄位完整性（85 欄位），特別是 Migration 中缺漏的 B/C/D/E/G 分類欄位
- 展開 API Response 完整 JSON schema（取代 `{ ... }` 佔位）
- 確認 `fine_flag` 觸發值域（`Y` 或 `1`，或其他）
- 補充 API 404 錯誤回應格式

> **結論：Ready for Spec Writer（待 G-01、G-07、G-08 在 Spec 文件中解決）**

---

## 附錄 A：NFR-002 更新建議

NFR-002「受影響的 Stories」目前僅列 Phase 1 Stories（US-011、US-021、US-024、US-025）。建議更新以下條目：

| Story ID | 影響說明 |
|----------|---------|
| US-060 | 客戶清單查詢必須在 500ms 內回傳分頁結果（1,000 筆以內） |
| US-061 | 單一客戶 360 詳情頁面載入必須在 1 秒內完成 |

（此建議無需阻擋 Spec 寫作，可在 Spec Writer 作業時一併更新 NFR-002。）

---

## 附錄 B：待確認的開放問題清單

以下問題可在 Spec Writer 作業時透過查閱現有資源或架構師確認解決，不需回到 Product Analyst 階段：

| # | 問題 | 影響 | 可查閱資源 |
|---|------|------|----------|
| Q-01 | customer_core 目前在生產資料庫的實際欄位數是 54 還是 85？ | G-01 | 查閱最新 Migration 檔案清單 |
| Q-02 | `fine_flag` 與 `debt_flag` 的實際來源值是 `'Y'`、`'1'`，還是兩者皆可能？ | G-08 | 查閱 F036 ETL 轉換規則或來源系統說明 |
| Q-03 | GIN 索引是否已在其他 Migration 中建立，或需要新增？ | M-04 | 查閱 migration 目錄 |
| Q-04 | `address_anomaly_flag` 與 `mainland_flag` 是否需在 360 頁面高亮顯示？ | M-03 | 業務方確認 |
