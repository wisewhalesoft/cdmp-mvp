# US-064：為客戶新增／移除標籤

> **Story ID**：US-064
> **Epic**：[E06 — Customer 360](epic-brief.md)
> **優先級**：Must Have
> **階段**：Phase 2
> **預估點數**：5

---

## User Story

**As a** 已登入的使用者（Admin 或 User）
**I want** 在客戶 360 頁面或客戶清單中，為單一客戶新增或移除標籤
**So that** 我能即時對客戶進行分類標記，反映最新的業務狀態或客戶屬性

---

## 驗收標準

### AC-1：開啟標籤指派 Panel（從客戶 360 頁面）
- **Given** 使用者在客戶 360 頁面（US-061）查看某客戶
- **When** 使用者點擊標籤區域的「管理標籤」或「＋」按鈕
- **Then** 在頁面右側或以 Popover 方式開啟標籤選擇 Panel，顯示：已指派的標籤（含移除按鈕）、未指派的標籤（可點擊新增）

### AC-2：新增標籤
- **Given** 標籤選擇 Panel 已開啟
- **When** 使用者點擊某個未指派的標籤項目
- **Then** 系統立即建立 customer_tag_assignment 記錄，標籤移至「已指派」區域，客戶 360 頁面頂部的標籤 Badge 即時更新

### AC-3：移除標籤
- **Given** 標籤選擇 Panel 已開啟，客戶已指派某標籤
- **When** 使用者點擊已指派標籤旁的「✕」移除按鈕
- **Then** 系統刪除對應的 customer_tag_assignment 記錄，標籤從「已指派」區域移除，客戶 360 頁面標籤 Badge 即時更新

### AC-4：標籤數量無上限
- **Given** 客戶已指派 10 個標籤
- **When** 使用者再次新增一個新標籤
- **Then** 系統接受操作，客戶標籤數量增加為 11 個（Phase 2 不設上限）

### AC-5：已指派標籤不可重複新增
- **Given** 客戶已指派「VIP」標籤
- **When** 使用者嘗試再次對該客戶新增「VIP」標籤（如透過 API 直接呼叫）
- **Then** 系統回傳 409 Conflict，不建立重複的指派記錄

### AC-6：在客戶清單中快速新增標籤
- **Given** 使用者在客戶清單頁面（US-060）
- **When** 使用者點擊某客戶列的標籤 Badge 區域（或「+標籤」按鈕）
- **Then** 在清單列的旁邊開啟輕量化 Popover，可快速新增標籤，不需離開清單頁面

### AC-7：關閉標籤 Panel
- **Given** 標籤選擇 Panel 已開啟
- **When** 使用者點擊 Panel 外部區域或關閉按鈕
- **Then** Panel 關閉，已執行的標籤操作保持儲存（操作為即時生效，非批次確認）

---

## Technical Notes

- 標籤指派為即時生效（每次點擊均立即呼叫 API），無需「儲存」按鈕確認
- `customer_tag_assignments` 表建立 `(customer_id, tag_id)` 唯一約束，防止重複指派
- 標籤 Panel 中的搜尋功能：當系統標籤數量超過 10 個時，Panel 顯示搜尋框以快速找到目標標籤
- 時區：`assigned_at` 後端儲存 UTC，前端顯示轉換為 UTC+8

### API 端點

**新增標籤指派**

- 端點：`POST /api/v1/c360/customers/:customerId/tags`
- Request Body：`{ "tagId": "uuid" }`
- Response（201 Created）：`{ "assignmentId": "uuid", "tagId": "uuid", "customerId": "uuid", "assignedAt": "ISO8601" }`
- 錯誤（409 Conflict）：重複指派
- 錯誤（404 Not Found）：customerId 或 tagId 不存在

**移除標籤指派**

- 端點：`DELETE /api/v1/c360/customers/:customerId/tags/:tagId`
- Response（200 OK）：`{ "removed": true }`
- 錯誤（404 Not Found）：指派記錄不存在

**查詢客戶已指派標籤**

- 端點：`GET /api/v1/c360/customers/:customerId/tags`
- Response：`{ "tags": [{ "tagId": "uuid", "name": "VIP", "color": "#3B82F6", "assignedAt": "ISO8601" }] }`

---

## 測試案例

| # | 測試案例 | 預期結果 |
|---|---------|---------|
| 1 | 在客戶 360 頁面開啟標籤 Panel | 顯示已指派與未指派標籤分區 |
| 2 | 點擊未指派標籤「VIP」 | 即時新增指派，Panel 中標籤移至已指派區 |
| 3 | 點擊已指派標籤的「✕」 | 即時移除指派，標籤移回未指派區 |
| 4 | 重複新增相同標籤（API） | 回傳 409 Conflict，無重複記錄 |
| 5 | 在客戶清單列點擊「+標籤」 | 開啟輕量化 Popover，可快速新增 |
| 6 | 新增不存在的 tagId（API） | 回傳 404 Not Found |
| 7 | 新增標籤後關閉 Panel 再開啟 | 已指派標籤仍保留（即時儲存） |

---

## 依賴關係

- **Blocked By**：US-061（標籤 Panel 整合於 360 頁面）、US-062（需先有標籤可供指派）
- **Blocks**：US-065（批次標記的基礎邏輯複用此 Story 的指派邏輯）、US-066（標籤篩選依賴指派關係）

---

## Definition of Done

- [ ] 新增標籤指派 API（POST /api/v1/c360/customers/:customerId/tags）實作完成
- [ ] 移除標籤指派 API（DELETE /api/v1/c360/customers/:customerId/tags/:tagId）實作完成
- [ ] 查詢客戶標籤 API（GET /api/v1/c360/customers/:customerId/tags）實作完成
- [ ] 唯一約束驗證（DB 層 + API 層 409 回應）
- [ ] 前端標籤指派 Panel / Popover 實作完成（客戶 360 頁面 + 客戶清單快速新增）
- [ ] 即時更新 UI（新增/移除後 Badge 即時反映）
- [ ] 單元測試覆蓋率達標（> 80%）

---

## 相關文件

- **Epic Brief**：[E06 Epic Brief](epic-brief.md)
- **相關 Story**：US-061（客戶 360 頁面）、US-062（建立標籤）、US-065（批次標記）、US-066（依標籤篩選）
