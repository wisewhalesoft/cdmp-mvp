# US-066：依標籤篩選客戶

> **Story ID**：US-066
> **Epic**：[E06 — Customer 360](epic-brief.md)
> **優先級**：Must Have
> **階段**：Phase 2
> **預估點數**：3

---

## User Story

**As a** 已登入的使用者（Admin 或 User）
**I want** 在客戶清單中依標籤篩選，找出符合特定標籤的客戶群組
**So that** 我能快速定位特定分類的客戶群體（如所有「VIP」客戶），進行後續業務或行銷操作

---

## 驗收標準

### AC-1：標籤篩選控制項
- **Given** 使用者在客戶清單頁面（US-060）
- **When** 頁面載入完成
- **Then** 搜尋篩選區域包含「標籤」多選下拉（Multi-Select Dropdown），列出所有標籤（含色彩圓點與名稱）

### AC-2：選擇單一標籤篩選
- **Given** 使用者從標籤下拉中選擇「VIP」
- **When** 使用者套用篩選
- **Then** 客戶清單僅顯示已指派「VIP」標籤的客戶，並在篩選條件區域顯示已選標籤 Badge

### AC-3：多標籤篩選（AND 邏輯）
- **Given** 使用者從標籤下拉中同時選擇「VIP」與「風險客戶」
- **When** 使用者套用篩選
- **Then** 客戶清單僅顯示同時具備「VIP」**和**「風險客戶」兩個標籤的客戶（交集，AND 邏輯）

### AC-4：多標籤篩選（OR 邏輯切換）
- **Given** 使用者已選擇多個標籤
- **When** 使用者切換篩選邏輯為「任一標籤（OR）」
- **Then** 客戶清單顯示具備所選標籤中**任意一個**的客戶（聯集，OR 邏輯）

### AC-5：標籤篩選與其他條件組合
- **Given** 使用者選擇了標籤篩選「VIP」，且同時設定客戶類型篩選「企業」
- **When** 使用者套用篩選
- **Then** 清單顯示同時符合「VIP 標籤」且「客戶類型為企業」的客戶

### AC-6：清除標籤篩選
- **Given** 標籤篩選已套用
- **When** 使用者點擊標籤 Badge 的「✕」，或點擊「清除所有篩選」按鈕
- **Then** 標籤篩選條件移除，清單回到無標籤篩選的狀態

### AC-7：無符合結果
- **Given** 使用者選擇某個標籤篩選，但無任何客戶指派該標籤
- **When** 篩選套用完成
- **Then** 顯示空狀態提示「找不到符合篩選條件的客戶」，並提供清除篩選按鈕

---

## Technical Notes

- 標籤篩選透過 JOIN `customer_tag_assignments` 表實作（不使用 JSONB 陣列，保持查詢效能）
- AND 邏輯：使用多個 EXISTS 子查詢或 GROUP BY HAVING COUNT = N 實作
- OR 邏輯：使用 IN 子查詢或 JOIN 後 DISTINCT 實作
- 效能考量：`customer_tag_assignments.tag_id` 建立索引，確保標籤篩選查詢效能
- 標籤篩選結果分頁效能需符合 NFR-002（< 500ms，1,000 筆以內）
- URL 狀態持久化：標籤篩選條件反映至 URL Query String（如 `?tagIds=uuid1,uuid2&tagLogic=AND`），支援分享或重新載入保留篩選狀態

### API 端點

**客戶清單（含標籤篩選）**

- 端點：`GET /api/v1/c360/customers?tagIds=uuid1,uuid2&tagLogic=AND&page=1&pageSize=20`
- `tagIds`：逗號分隔的標籤 UUID 清單
- `tagLogic`：`AND`（預設）或 `OR`

---

## 測試案例

| # | 測試案例 | 預期結果 |
|---|---------|---------|
| 1 | 篩選單一標籤「VIP」 | 僅顯示有「VIP」標籤的客戶 |
| 2 | 篩選「VIP」AND「優先服務」（2 個客戶同時有） | 顯示 2 個同時具備兩標籤的客戶 |
| 3 | 篩選「VIP」OR「優先服務」（共 15 個客戶有其一） | 顯示 15 個客戶 |
| 4 | 標籤篩選「VIP」+ 客戶類型「企業」組合 | 顯示 VIP 且企業類型的客戶 |
| 5 | 點擊 Badge 的「✕」清除標籤篩選 | 清單回到無標籤篩選狀態 |
| 6 | 選擇無客戶指派的標籤 | 顯示空狀態提示 |
| 7 | 標籤篩選條件反映在 URL | URL 含 `?tagIds=uuid&tagLogic=AND`，重新載入保留篩選 |

---

## 依賴關係

- **Blocked By**：US-060（客戶清單篩選框架）、US-064（需先有標籤指派資料）
- **Blocks**：無

---

## Definition of Done

- [ ] 客戶清單 API 支援 tagIds 與 tagLogic 查詢參數
- [ ] AND / OR 邏輯的 SQL 實作完成
- [ ] customer_tag_assignments.tag_id 索引建立
- [ ] 前端標籤多選下拉控制項實作完成
- [ ] AND/OR 邏輯切換 UI 實作完成
- [ ] 篩選條件 Badge 顯示與清除功能
- [ ] URL Query String 狀態持久化
- [ ] 效能符合 NFR-002（500ms / 1,000 筆以內）
- [ ] 單元測試覆蓋率達標（> 80%）

---

## 相關文件

- **Epic Brief**：[E06 Epic Brief](epic-brief.md)
- **相關 Story**：US-060（客戶清單）、US-062（建立標籤）、US-064（標籤指派）、US-065（批次標記）
- **NFR**：[NFR-002 效能](../../non-functional/NFR-002-performance.md)
