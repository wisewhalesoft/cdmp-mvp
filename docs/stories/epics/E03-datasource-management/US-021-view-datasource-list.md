# US-021：查看資料來源清單

> **Story ID**：US-021
> **Epic**：[E03 — 資料來源管理](epic-brief.md)
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：3

---

## User Story

**As a** Admin（管理者）
**I want** 以清單或卡片格式查看所有已設定的資料來源
**So that** 我可以快速總覽並存取所有資料庫連線

---

## 驗收標準

### AC-1：顯示資料來源清單
- **Given** Admin 導覽至資料來源管理頁面
- **When** 頁面載入完成
- **Then** 系統顯示所有資料來源，包含：名稱、類型（含圖示）、主機位址、資料庫名稱、連線狀態（已連線／已中斷／未知）、最後測試時間

### AC-2：切換顯示模式
- **Given** Admin 正在查看資料來源清單
- **When** Admin 在「清單」與「卡片」兩種顯示模式之間切換
- **Then** 顯示格式切換，但呈現相同的資料內容

### AC-3：搜尋與篩選
- **Given** Admin 正在查看資料來源清單
- **When** Admin 依名稱搜尋，或依類型、狀態進行篩選
- **Then** 清單更新，僅顯示符合條件的資料來源

### AC-4：空狀態顯示
- **Given** 尚未設定任何資料來源
- **When** 頁面載入
- **Then** 系統顯示空狀態，訊息為「尚未設定任何資料來源」，並提供明顯的「新增資料來源」按鈕

---

## Technical Notes

- 端點：`GET /api/datasources`
- Query params：`?page=1&limit=20&search=keyword&type=mysql&status=connected`
- Response 中密碼欄位必須遮罩
- 顯示模式偏好設定可儲存於 localStorage
- 類型圖示：MySQL（海豚）、PostgreSQL（大象）、SQL Server（菱形）
- 狀態值：`connected`（已連線）、`disconnected`（已中斷）、`unknown`（從未測試）
- 時區處理：後端儲存 UTC 時間，前端顯示時須轉換為 UTC+8（台灣標準時間，Asia/Taipei），包含「最後測試時間」等所有時間欄位

---

## 測試案例

| # | 測試案例 | 預期結果 |
|---|---------|---------|
| 1 | 載入含現有資料來源的頁面 | 顯示清單／卡片 |
| 2 | 切換至卡片顯示 | 渲染卡片版面 |
| 3 | 切換至清單顯示 | 渲染表格版面 |
| 4 | 依名稱搜尋 | 顯示篩選後結果 |
| 5 | 依類型「MySQL」篩選 | 僅顯示 MySQL 資料來源 |
| 6 | 依狀態「已中斷」篩選 | 僅顯示中斷連線的資料來源 |
| 7 | 尚無資料來源 | 顯示空狀態含新增按鈕 |
| 8 | API 回應中的密碼欄位 | 已遮罩／隱藏 |
| 9 | 非 Admin 存取 | 回傳 403 Forbidden |

---

## 依賴關係

- **Blocked By**：US-020（需有資料來源才能列出）
- **Blocks**：US-022、US-023、US-024（清單提供存取各操作的入口）
- E01：Admin 必須先完成驗證
- NFR-002：清單必須在 500ms 內回傳分頁結果

---

## Definition of Done

- [ ] 資料來源清單／卡片 UI 實作完成
- [ ] 清單與卡片切換功能正常
- [ ] 搜尋與篩選功能正常
- [ ] 狀態指示標記正確顯示
- [ ] 空狀態正確處理
- [ ] API 回應中密碼已遮罩
- [ ] 後端 API 含分頁與篩選邏輯
- [ ] 所有驗收標準的單元測試通過

---

## 相關文件

- **Epic Brief**：[E03 Epic Brief](epic-brief.md)
- **NFR**：[NFR-002 效能需求](../../non-functional/NFR-002-performance.md)
- **相關 Stories**：US-020、US-022、US-023、US-024、US-025
