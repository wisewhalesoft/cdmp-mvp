# US-060：客戶搜尋與清單

> **Story ID**：US-060
> **Epic**：[E06 — Customer 360](epic-brief.md)
> **優先級**：Must Have
> **階段**：Phase 2
> **預估點數**：5
> **變更說明（2026-04-13）**：精簡範圍 — 移除標籤 Badge 顯示與 tagId 篩選；敏感資料遮罩改為 Admin 明碼 / User 固定遮罩（硬編碼）；新增公司名稱欄位；移除 US-064/066/069/072 依賴

---

## User Story

**As a** 已登入的使用者（Admin 或 User）
**I want** 透過關鍵字搜尋與多條件篩選，快速找到目標客戶並瀏覽客戶清單
**So that** 我能快速定位需要服務或追蹤的客戶，提升工作效率

---

## 驗收標準

### AC-1：進入客戶清單頁面
- **Given** 已登入的使用者點擊左側 Sidebar「Customer 360」導覽項目
- **When** 頁面載入完成
- **Then** 顯示客戶清單，包含統計摘要卡片（總客戶數、個人客戶數、企業客戶數、外籍客戶數）以及分頁列表

### AC-2：關鍵字搜尋（姓名）— Full-Text Search
- **Given** 使用者在搜尋框輸入客戶姓名關鍵字（至少 2 個字元）
- **When** 使用者按下 Enter 或點擊搜尋按鈕
- **Then** 清單以全文搜尋（Full-Text Search）方式搜尋 `name`（中文姓名）及 `english_name` 欄位，返回包含該關鍵字的客戶

### AC-3：關鍵字搜尋（身分證/統編）
- **Given** 使用者在搜尋框輸入完整的身分證字號或統一編號
- **When** 使用者按下 Enter 或點擊搜尋按鈕
- **Then** 清單精確比對 `source_customer_no` 欄位，返回符合的客戶（0 或 1 筆）

### AC-4：依客戶類型篩選
- **Given** 使用者從「客戶類型」下拉選單選擇篩選條件（全部 / 個人 / 企業 / 外籍）
- **When** 使用者選擇完成
- **Then** 清單即時篩選對應 `customer_type_code` 的客戶（01=個人、02=企業、04=外籍）

### AC-5：清單欄位顯示
- **Given** 客戶清單顯示資料
- **When** 清單載入完成
- **Then** 每一列顯示以下欄位：客戶姓名/企業名稱、客戶類型、身分證/統編、行動電話、公司名稱
- **And** 敏感欄位（身分證/統編、電話）的遮罩規則：Admin 完整明碼顯示；User 套用固定遮罩

### AC-6：分頁
- **Given** 查詢結果超過 20 筆
- **When** 清單載入完成
- **Then** 底部顯示分頁控制元件，每頁顯示 20 筆，可切換頁碼，顯示總筆數

### AC-7：點擊客戶進入 360 檢視
- **Given** 清單顯示客戶資料
- **When** 使用者點擊某一客戶列（或「查看」按鈕）
- **Then** 導覽至該客戶的 360 檢視頁面（US-061）

### AC-8：空狀態處理
- **Given** 搜尋或篩選後無符合結果
- **When** 清單載入完成
- **Then** 顯示空狀態提示，說明「找不到符合條件的客戶」，並提供清除篩選條件的按鈕

### AC-9：customer_core 資料尚未載入
- **Given** ETL Pipeline 尚未執行，`customer_core` 表無資料
- **When** 使用者進入客戶清單頁面
- **Then** 顯示說明訊息「客戶資料尚未載入，請聯絡管理員執行 ETL Pipeline」，不顯示空的清單

---

## Technical Notes

- 資料來源：直接讀取 `customer_core` 目標表（由 ETL Pipeline 維護）
- 搜尋策略：
  - `name`、`english_name`：使用 PostgreSQL Full-Text Search（`tsvector` + `tsquery`），建議在此兩欄建立 GIN 全文搜尋索引
  - `source_customer_no`：精確比對（完整輸入時觸發）
- 篩選欄位：`customer_type_code`（IN 查詢）
- 權限：所有已登入角色（Admin / User）皆可存取客戶清單
- 敏感資料遮罩：硬編碼於 API 層，依呼叫者角色（Admin / User）決定：
  - Admin：所有欄位完整明碼
  - User：身分證前 3 碼 + 後 2 碼顯示（例：`A12****89`）；電話前 4 碼 + 後 2 碼顯示（例：`0912***78`）
- 效能：清單查詢回應時間 < 500ms（1,000 筆以內，NFR-002）
- 時區：後端儲存 UTC，前端顯示轉換為 UTC+8

### API 端點

**統計摘要**

- 端點：`GET /api/v1/c360/customers/stats`
- Response：
```json
{
  "total": 0,
  "individual": 0,
  "corporate": 0,
  "foreign": 0
}
```

**客戶清單**

- 端點：`GET /api/v1/c360/customers?keyword=&type=&page=1&pageSize=20`
- Query 參數：`keyword`（模糊搜尋姓名/英文名）、`idNumber`（精確比對身分證/統編）、`type`（01/02/04）
- Response：
```json
{
  "data": [
    {
      "customerId": "uuid",
      "name": "string",
      "customerTypeCode": "01",
      "customerTypeDesc": "個人",
      "sourceCustomerNo": "A12****89",
      "mobilePhone": "0912***78",
      "companyName": "string"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 0,
    "totalPages": 0
  }
}
```

---

## 測試案例

| # | 測試案例 | 預期結果 |
|---|---------|---------|
| 1 | customer_core 有 50 筆資料，進入清單頁 | 統計卡片顯示正確，列表顯示前 20 筆，分頁顯示 3 頁 |
| 2 | 搜尋「王小明」 | Full-Text Search 搜尋 name/english_name，顯示包含「王小明」的客戶 |
| 3 | 搜尋「A123456789」（完整身分證） | 精確比對 source_customer_no，顯示 0 或 1 筆 |
| 4 | 篩選客戶類型為「企業」 | 僅顯示 customer_type_code = '02' 的客戶 |
| 5 | 關鍵字搜尋 + 客戶類型篩選組合 | 同時套用兩個條件篩選 |
| 6 | Admin 查看清單中的 source_customer_no | 完整明碼顯示 `A123456789` |
| 7 | User 查看清單中的 source_customer_no | 固定遮罩顯示 `A12****89` |
| 8 | customer_core 無資料 | 顯示「客戶資料尚未載入」說明訊息 |
| 9 | 搜尋結果為空 | 顯示空狀態提示與清除篩選按鈕 |
| 10 | 點擊客戶列 | 導覽至 US-061 客戶 360 檢視頁面 |
| 11 | 未登入使用者直接存取 URL | 導向登入頁面（401）|

---

## 依賴關係

- **Blocked By**：US-049（customer_core 目標表必須存在）
- **Blocks**：US-061（客戶搜尋為進入 360 檢視的主要入口）

---

## Definition of Done

- [ ] 客戶清單 API 實作完成（含統計、分頁、Full-Text Search、篩選）
- [ ] PostgreSQL GIN 全文搜尋索引建立（name、english_name 欄位）
- [ ] 敏感資料遮罩硬編碼於 API 層（Admin 明碼 / User 固定遮罩）
- [ ] 前端頁面含統計卡片、搜尋框、客戶類型篩選、分頁
- [ ] 清單欄位包含：客戶姓名、客戶類型、身分證/統編、行動電話、公司名稱
- [ ] 空狀態與無資料說明畫面實作完成
- [ ] 點擊客戶列可導覽至 US-061
- [ ] 效能符合 NFR-002（500ms / 1,000 筆以內）
- [ ] 單元測試覆蓋率達標（> 80%）
- [ ] 權限驗證（未登入導向登入頁）

---

## 相關文件

- **Epic Brief**：[E06 Epic Brief](epic-brief.md)
- **依賴**：US-049（customer_core 目標表）
- **相關 Story**：US-061（客戶 360 檢視）
- **NFR**：[NFR-002 效能](../../non-functional/NFR-002-performance.md)
