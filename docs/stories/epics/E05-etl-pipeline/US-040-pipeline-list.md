# US-040：查看 Pipeline 列表

> **Story ID**：US-040
> **Epic**：[E05 — ETL Pipeline 管理](epic-brief.md)
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：5

---

## User Story

**As a** Admin（管理者）
**I want** 查看所有 ETL Pipeline 的列表與統計資訊
**So that** 我能掌握 Pipeline 的整體狀態，快速找到需要關注的 Pipeline

---

## 驗收標準

### AC-1：統計卡片
- **Given** Admin 進入 Pipeline 列表頁面
- **When** 頁面載入完成
- **Then** 頂部顯示 5 項統計卡片：總 Pipeline 數、啟用中、執行中、草稿、今日處理筆數

### AC-2：Pipeline 列表
- **Given** 系統中存在 Pipeline 資料
- **When** 頁面載入完成
- **Then** 列表顯示以下欄位：名稱、版本、步驟數、狀態（draft/active/running/failed/disabled）、排程、最後執行時間、下次執行時間、處理筆數、建立者

### AC-3：狀態篩選
- **Given** Admin 在 Pipeline 列表頁面
- **When** 從狀態下拉選單選擇特定狀態（如 active）
- **Then** 列表僅顯示該狀態的 Pipeline

### AC-4：關鍵字搜尋
- **Given** Admin 在 Pipeline 列表頁面
- **When** 在搜尋框輸入關鍵字
- **Then** 列表以模糊比對方式篩選名稱包含該關鍵字的 Pipeline

### AC-5：分頁
- **Given** Pipeline 資料超過 10 筆
- **When** 頁面載入完成
- **Then** 列表每頁顯示 10 筆，底部顯示分頁控制元件，可切換頁碼

### AC-6：空狀態
- **Given** 系統中無任何 Pipeline 資料（或篩選結果為空）
- **When** 頁面載入完成
- **Then** 顯示空狀態提示，引導使用者建立第一個 Pipeline

---

## Technical Notes

- 權限：僅 Admin 可存取
- 時區：後端儲存 UTC，前端顯示轉換為 UTC+8
- 效能：頁面需於 2 秒內載入完成（NFR-002）

### API 端點

**統計資訊**

- 端點：`GET /api/v1/etl/pipelines/stats`
- Response：
```json
{
  "total": 0,
  "active": 0,
  "running": 0,
  "draft": 0,
  "todayProcessed": 0
}
```

**Pipeline 列表**

- 端點：`GET /api/v1/etl/pipelines?status=&keyword=&page=1&pageSize=10`
- Response：
```json
{
  "data": [
    {
      "id": "uuid",
      "name": "string",
      "version": 1,
      "stepCount": 3,
      "status": "draft",
      "schedule": "0 2 * * *",
      "lastExecutionAt": "ISO8601",
      "nextExecutionAt": "ISO8601",
      "processedCount": 0,
      "createdBy": "string",
      "createdAt": "ISO8601"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 10,
    "total": 0,
    "totalPages": 0
  }
}
```

---

## 測試案例

| # | 測試案例 | 預期結果 |
|---|---------|---------|
| 1 | 載入頁面，系統有 3 個 Pipeline（1 active、1 draft、1 running） | 統計卡片顯示正確數值，列表顯示 3 筆資料 |
| 2 | 狀態篩選選擇 active | 僅顯示 active 狀態的 Pipeline |
| 3 | 搜尋框輸入「客戶」 | 列表顯示名稱包含「客戶」的 Pipeline |
| 4 | 系統有 25 筆 Pipeline，切換至第 2 頁 | 顯示第 11~20 筆資料 |
| 5 | 系統無任何 Pipeline | 顯示空狀態提示畫面 |
| 6 | 篩選 + 搜尋組合使用 | 同時套用狀態篩選與關鍵字搜尋 |
| 7 | 非 Admin 使用者嘗試存取 | 回傳 403 Forbidden |

---

## 依賴關係

- **Blocked By**：無（可獨立開發）
- **Blocks**：US-041

---

## Definition of Done

- [ ] 統計 API 與列表 API 開發完成
- [ ] 前端頁面含統計卡片、列表、篩選、搜尋、分頁功能
- [ ] 空狀態畫面設計與實作
- [ ] 時區轉換正確（UTC → UTC+8）
- [ ] 權限驗證（僅 Admin）
- [ ] 單元測試覆蓋率達標
- [ ] E2E 測試撰寫完成
- [ ] 效能符合 NFR-002（2 秒內載入）

---

## 相關文件

- **Epic Brief**：[E05 Epic Brief](epic-brief.md)
