# US-073：資料品質回報機制

> **Story ID**：US-073
> **Epic**：[E06 — Customer 360](epic-brief.md)
> **優先級**：Could Have
> **階段**：Phase 2
> **預估點數**：5
> **變更說明（2026-04-07）**：AC-5 降級——移除「站內通知 Admin」強制要求，改為 Admin 可在管理頁面查看新增的待處理回報；主動推播通知列為 Could Have / Phase 3；Technical Notes 補充「回報紀錄永久保存，不支援刪除」

---

## User Story

**As a** 後端作業（作服）人員或分析師
**I want** 在客戶 360 頁面發現資料異常時，標記「疑似錯誤」並填寫說明，通知管理員或資料工程師
**So that** ETL pipeline 產出的資料品質問題能被系統性收集，建立資料品質的使用者回饋閉環，協助持續改善 customer_core 的資料正確性

---

## 驗收標準

### AC-1：顯示資料品質回報入口
- **Given** 使用者角色為後端作業（作服）或分析師，且正在查看客戶 360 頁面（US-061）
- **When** 頁面載入完成
- **Then** 頁面右上角或每個資料區段旁顯示「回報資料問題」按鈕（或圖示），供使用者點擊

### AC-2：開啟資料品質回報表單
- **Given** 使用者點擊「回報資料問題」按鈕
- **When** 表單 Dialog 開啟
- **Then** 表單包含以下欄位：
  - **問題類型**（必填）：下拉選單，選項為「欄位值疑似錯誤」、「資料缺失」、「資料重複」、「格式異常」、「其他」
  - **問題欄位**（選填）：文字輸入欄位，讓使用者指出哪個欄位有問題（如「mobile_phone」、「address」）
  - **問題說明**（必填）：文字輸入欄位，最多 500 字
  - **嚴重程度**（必填）：單選，選項為「輕微」（不影響作業）、「中等」（作業受到影響）、「嚴重」（無法完成覆核）
  - 系統自動帶入：目前查看的客戶 ID 與姓名（唯讀顯示）

### AC-3：送出資料品質回報
- **Given** 使用者填寫完回報表單，所有必填欄位均已填寫
- **When** 使用者點擊「送出回報」按鈕
- **Then** 系統建立回報紀錄，自動記錄「回報人」（當前登入者帳號 ID）、「建立時間」（系統時間 UTC）、「客戶 ID」，顯示成功通知「資料問題已送出，我們會盡快處理」，表單 Dialog 關閉

### AC-4：表單必填驗證
- **Given** 使用者未填寫必填欄位（問題類型、問題說明、或嚴重程度）
- **When** 使用者點擊「送出回報」按鈕
- **Then** 系統顯示欄位層級錯誤提示（如「請選擇問題類型」），不送出 API 請求

### AC-5：Admin 可查看新增的待處理回報（主動推播通知為 Phase 3）
- **Given** 使用者成功送出資料品質回報，回報狀態初始為「待處理（pending）」
- **When** 回報紀錄建立完成
- **Then** Admin 可在系統管理的「資料品質回報」管理頁面（AC-7）即時看到新增的待處理回報（管理頁面顯示所有狀態為 pending 的回報）；**Phase 2 不實作站內通知或 Email 主動推播**，Admin 需主動進入管理頁面查閱

> **Phase 3 候選**：主動推播通知（站內通知或 Email 通知 Admin 有新回報）列為 Could Have，Phase 3 待評估實作。

### AC-6：查看自己送出的回報（回報人）
- **Given** 使用者角色為後端作業或分析師，曾送出資料品質回報
- **When** 使用者在客戶 360 頁面點擊「查看我的回報」（或進入個人回報清單頁面）
- **Then** 顯示該使用者送出的所有回報紀錄，含狀態（待處理、處理中、已解決、已關閉）

### AC-7：Admin 查看與管理所有回報
- **Given** 登入者角色為 Admin
- **When** Admin 進入系統管理的「資料品質回報」管理頁面
- **Then** 顯示所有使用者送出的回報清單，可依狀態、嚴重程度、問題類型篩選，並可將回報狀態更新為「處理中」、「已解決」、「已關閉」，加入處理備註

### AC-8：僅後端作業與分析師可回報
- **Given** 登入者角色為業務、行銷、客服、或主管
- **When** 使用者查看客戶 360 頁面
- **Then** 不顯示「回報資料問題」按鈕（此功能僅限需要覆核資料正確性的角色）

---

## Technical Notes

- 新增資料表：`data_quality_reports`
  - `id`：UUID (PK)
  - `customer_id`：UUID (FK → customer_core.customer_id)
  - `issue_type`：ENUM（'wrong_value'、'missing_data'、'duplicate'、'format_error'、'other'）
  - `affected_field`：VARCHAR(100) NULLABLE（問題欄位名稱）
  - `description`：VARCHAR(500)（問題說明）
  - `severity`：ENUM（'low'、'medium'、'high'）
  - `status`：ENUM（'pending'、'in_progress'、'resolved'、'closed'），預設 'pending'
  - `admin_note`：VARCHAR(500) NULLABLE（Admin 處理備註）
  - `reported_by`：UUID (FK → accounts.id)（回報人）
  - `created_at`：TIMESTAMP（建立時間 UTC）
  - `updated_at`：TIMESTAMP（更新時間 UTC）
- **回報紀錄永久保存，不支援刪除**：`data_quality_reports` 資料表不提供刪除 API（DELETE），不支援軟刪除，所有回報永久保存以供稽核追蹤；狀態可更新（pending → in_progress → resolved / closed），但記錄本身不可刪除
- Phase 2 不實作通知推播機制；Admin 需主動進入管理頁面查看待處理回報（AC-5 說明）；主動推播通知（站內通知/Email）列為 Phase 3 Could Have
- 角色控制由後端 API 依角色驗證：允許回報的角色為後端作業（`backend_ops`）與分析師（`analyst`）
- 此功能與 ETL Pipeline 的 E05 模組解耦，不直接修改 customer_core 資料，僅記錄回饋供人工後續處理

### API 端點

**送出資料品質回報**

- 端點：`POST /api/v1/c360/customers/:customerId/quality-reports`
- Request Body：
```json
{
  "issueType": "wrong_value",
  "affectedField": "mobile_phone",
  "description": "客戶手機號碼格式異常，疑似為市話號碼",
  "severity": "medium"
}
```
- Response（201）：
```json
{
  "id": "uuid",
  "status": "pending",
  "createdAt": "ISO8601"
}
```
- 錯誤（403）：角色不允許回報（非後端作業或分析師）

**查詢個人回報清單**

- 端點：`GET /api/v1/c360/quality-reports/my?page=1&pageSize=20`
- Response：分頁清單，含每筆回報的狀態與 Admin 備註

**Admin 查詢所有回報（Admin Only）**

- 端點：`GET /api/v1/admin/quality-reports?status=pending&severity=high&page=1&pageSize=20`

**Admin 更新回報狀態（Admin Only）**

- 端點：`PATCH /api/v1/admin/quality-reports/:reportId`
- Request Body：`{ "status": "resolved", "adminNote": "已通知資料工程師修正 ETL 映射規則" }`

---

## 測試案例

| # | 測試案例 | 預期結果 |
|---|---------|---------|
| 1 | 後端作業角色查看客戶 360 頁面 | 顯示「回報資料問題」按鈕 |
| 2 | 分析師角色查看客戶 360 頁面 | 顯示「回報資料問題」按鈕 |
| 3 | 業務角色查看客戶 360 頁面 | 不顯示「回報資料問題」按鈕 |
| 4 | 後端作業填寫完整表單後送出 | 回報成功，顯示成功通知，Dialog 關閉 |
| 5 | 未填「問題說明」即送出 | 顯示「請輸入問題說明」錯誤提示，不送出 |
| 6 | 送出後，Admin 進入管理頁面 | 管理頁面清單顯示新增的待處理回報（含客戶名稱、問題類型、嚴重程度、回報人），無主動推播通知 |
| 7 | 回報人查看個人回報清單 | 顯示所有自己送出的回報及當前狀態 |
| 8 | Admin 將回報狀態更新為「已解決」並加入備註 | 狀態更新成功，備註儲存 |
| 9 | 非後端作業/分析師角色直接呼叫回報 API | 回傳 403 |
| 10 | 未登入呼叫回報 API | 回傳 401 |

---

## 依賴關係

- **Blocked By**：
  - US-061（回報功能嵌入客戶 360 頁面）
  - E01（使用者驗證，記錄回報人身份）
- **Blocks**：無

---

## Definition of Done

- [ ] `data_quality_reports` 資料表 Migration 完成
- [ ] 回報 API（POST /api/v1/c360/customers/:customerId/quality-reports）實作完成
- [ ] 角色存取控制：僅後端作業與分析師可呼叫回報 API（後端 403 攔截）
- [ ] 個人回報清單 API 實作完成
- [ ] Admin 回報管理 API（查詢、狀態更新）實作完成
- [ ] Phase 2 不實作通知推播（主動推播通知為 Phase 3 Could Have）
- [ ] 前端客戶 360 頁面嵌入「回報資料問題」按鈕與表單 Dialog
- [ ] 表單含問題類型、問題欄位、問題說明、嚴重程度等欄位與必填驗證
- [ ] Admin 回報管理頁面（查看清單、篩選、更新狀態）實作完成
- [ ] 單元測試覆蓋率達標（> 80%）
- [ ] 未登入呼叫 API 回傳 401

---

## 相關文件

- **Epic Brief**：[E06 Epic Brief](epic-brief.md)
- **依賴**：US-061（客戶 360 頁面）、E01（使用者驗證）
- **相關 Story**：US-061（客戶 360 檢視）、US-068（角色存取設定）
- **NFR**：[NFR-001 安全性](../../non-functional/NFR-001-security.md)（稽核與資料保護）
