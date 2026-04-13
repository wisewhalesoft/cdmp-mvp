# Epic Brief：E06 — Customer 360

> **Epic ID**：E06
> **優先級**：P1（Important）
> **階段**：Phase 2（進階）
> **Stories 數量**：2
> **範圍調整（2026-04-13）**：精簡 Epic 範圍，僅保留客戶清單查詢核心功能（US-060、US-061）；移除標籤體系（US-062~US-066）、變更歷史（US-067）、角色權限管理（US-068）、匯出（US-069）、互動紀錄（US-071）、統計報表（US-072）、資料品質回報（US-073）；角色從六種業務角色回歸 Admin / User 兩種角色

## Epic 目標

Customer 360 是 CDMP 平台面向業務使用者的客戶資料查詢模組，讓使用者能從 ETL Pipeline 治理後的 `customer_core` 目標表中，快速搜尋、瀏覽與查看客戶完整側寫。

Phase 2 聚焦兩項核心能力：
1. **客戶搜尋與清單** — 讓使用者快速找到目標客戶，支援多條件篩選
2. **單一客戶 360 檢視** — 整合 customer_core 所有維度的客戶完整側寫

## User Stories

| Story ID | 標題 | 優先級 | 檔案 |
|----------|------|--------|------|
| US-060 | 客戶搜尋與清單 | Must Have | [US-060-customer-search-list.md](US-060-customer-search-list.md) |
| US-061 | 單一客戶 360 檢視 | Must Have | [US-061-customer-360-view.md](US-061-customer-360-view.md) |

## 角色定義

系統使用兩種角色，與 E02 帳號管理模組一致：

| 角色 | 說明 | 敏感資料存取 |
|------|------|-------------|
| Admin | 系統管理者，具備完整平台管理權限 | 完整明碼顯示 |
| User | 一般使用者 | 固定遮罩規則 |

### 敏感資料遮罩規則

- **Admin**：所有欄位完整明碼顯示，不遮罩
- **User**：敏感欄位套用固定遮罩規則，硬編碼於 API 層：
  - 身分證/統編：前 3 碼 + 後 2 碼顯示，中間遮罩（例：`A12****89`）
  - 行動電話：前 4 碼 + 後 2 碼顯示，中間遮罩（例：`0912***78`）
  - Email：@ 前僅顯示前 2 字元，其餘遮罩（例：`wa****@gmail.com`）

## 依賴關係

- **依賴**：
  - E01（使用者必須完成驗證）
  - E05 US-049（customer_core 目標表必須存在且有資料）
  - E05 US-057（ETL TargetLoad 節點完成，資料已載入 customer_core）
- **封鎖下游**：無（Customer 360 為消費端模組，不產出下游依賴）
- **NFR 關聯**：NFR-002（客戶清單分頁效能）

## 成功標準

- 使用者能在 2 秒內找到目標客戶（NFR-002）
- 單一客戶 360 頁面整合 customer_core 全部 8 個資料分類展示
- Admin 可查看所有欄位完整明碼；User 敏感欄位正確遮罩

## 已確認決策

| # | 問題 | 決策結果 |
|---|------|---------|
| 1 | 角色定義 | Admin / User 兩種角色，與 E02 帳號管理一致（2026-04-13 精簡） |
| 2 | 聯絡資訊遮罩處理 | Admin 完整明碼；User 固定遮罩（硬編碼於 API 層） |
| 3 | 客戶搜尋方式 | 支援全文搜尋（Full-Text Search），使用 PostgreSQL full-text search |
| 4 | 敏感資料遮罩粒度 | 以角色（Admin/User）區分，不需要欄位分類級別的動態設定 |

## 已移除功能（2026-04-13 精簡，列為未來候選）

以下功能從 Phase 2 移除，可於未來 Phase 視業務需求重新評估：

| Story ID | 標題 | 原優先級 |
|----------|------|---------|
| US-062 | 建立標籤 | Must Have |
| US-063 | 管理標籤 | Must Have |
| US-064 | 為客戶新增／移除標籤 | Must Have |
| US-065 | 批次標記客戶 | Should Have |
| US-066 | 依標籤篩選客戶 | Must Have |
| US-067 | 客戶資料變更歷史查詢 | Should Have |
| US-068 | Customer 360 角色權限管理 | Should Have |
| US-069 | 客戶名單匯出 | Should Have |
| US-071 | 客戶互動紀錄 | Should Have |
| US-072 | 客戶群組統計報表 | Could Have |
| US-073 | 資料品質回報機制 | Could Have |
