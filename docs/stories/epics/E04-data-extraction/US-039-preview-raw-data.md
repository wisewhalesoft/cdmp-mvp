# US-039：查看擷取資料預覽

> **Story ID**：US-039
> **Epic**：[E04 — 資料擷取管理](epic-brief.md)
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：5

---

## User Story

**As a** Admin（管理者）
**I want** 在擷取任務執行完成後，預覽 CDMP AppDB 中已擷取的 raw data
**So that** 我可以確認資料已成功落地、欄位結構正確，並快速抽查資料品質

---

## 驗收標準

### AC-1：進入 raw data 預覽頁面
- **Given** Admin 在擷取任務清單或執行日誌中，某任務至少有一次 completed 的執行記錄（extracted_count > 0）
- **When** Admin 點擊「預覽資料」按鈕或連結
- **Then** 系統開啟該任務的 raw data 預覽頁面，顯示已擷取至 AppDB 的資料內容

### AC-2：分頁瀏覽資料
- **Given** Admin 在 raw data 預覽頁面
- **When** Admin 瀏覽資料列表
- **Then** 系統以分頁方式顯示資料（預設每頁 50 筆），並顯示總筆數與當前頁面資訊；Admin 可切換每頁筆數（50 / 100 / 200 筆）

### AC-3：欄位顯示
- **Given** Admin 在 raw data 預覽頁面
- **When** 頁面載入完成
- **Then** 系統以表格形式顯示 raw data 的所有欄位，欄位標題對應來源表的欄位名稱，每筆資料顯示所有欄位值

### AC-4：欄位排序
- **Given** Admin 在 raw data 預覽頁面
- **When** Admin 點擊某欄位標題
- **Then** 系統依該欄位排序資料（第一次點擊升冪、第二次點擊降冪），並在欄位標題顯示排序方向指示

### AC-5：尚無資料時的空狀態
- **Given** 某擷取任務尚未成功執行（或 extracted_count = 0）
- **When** Admin 嘗試進入 raw data 預覽頁面
- **Then** 系統顯示「此任務尚無已擷取的資料，請先執行擷取任務」的提示訊息，並提供「立即執行」的快捷按鈕

### AC-6：顯示資料摘要資訊
- **Given** Admin 在 raw data 預覽頁面
- **When** 頁面載入完成
- **Then** 頁面頂部顯示資料摘要：AppDB raw data 表名稱（`raw_{task_id_short}`）、總筆數、最後更新時間（對應最後一次 completed 執行的 finished_at）

---

## Technical Notes

- 端點：`GET /api/v1/extraction-tasks/:id/raw-data`
- Query 參數：
  - `page`（預設 1）
  - `limit`（預設 50，允許值：50 / 100 / 200）
  - `sortBy`（欄位名稱，選填）
  - `sortOrder`（`asc` | `desc`，選填，預設 `asc`）
- Response：
  ```json
  {
    "meta": {
      "taskId": "uuid",
      "rawTableName": "raw_a3f2c1d4",
      "totalCount": 1000000,
      "page": 1,
      "limit": 50,
      "totalPages": 20000,
      "lastUpdatedAt": "ISO8601"
    },
    "columns": ["id", "name", "created_at", "..."],
    "data": [
      { "id": 1, "name": "Alice", "created_at": "2026-01-01" },
      "..."
    ]
  }
  ```
- **效能考量（百萬筆資料）**：
  - 查詢使用 `LIMIT` + `OFFSET` 分頁，避免全表掃描
  - raw data 表的主鍵欄位（或系統自動生成的 `_cdmp_id` 欄位）應建立 Index，以加速排序與分頁查詢
  - 若 `sortBy` 為非索引欄位，且資料量 > 100,000 筆，系統應在 Response 加入 `warning` 提醒效能影響，但仍允許查詢
  - 不提供全量下載（避免前端記憶體耗盡），如需匯出資料，為 Phase 2 功能
- **raw data 表結構**：
  - 表名：`raw_{task_id 前 8 碼}`（例如：`raw_a3f2c1d4`）
  - 欄位：來源表欄位 + 系統附加欄位 `_cdmp_extracted_at`（TIMESTAMP，記錄該筆資料的擷取時間）
  - 若來源表無主鍵，系統附加 `_cdmp_id`（SERIAL）作為 raw data 表的唯一識別欄位
- 前端表格應支援水平捲動，處理欄位數量多的情境
- 時區處理：`_cdmp_extracted_at` 等時間欄位，前端顯示時轉換為 UTC+8（Asia/Taipei）

---

## 測試案例

| # | 測試案例 | 預期結果 |
|---|---------|---------|
| 1 | 任務已執行完成，開啟預覽頁 | 顯示 raw data 表格，欄位與來源表一致 |
| 2 | 預設分頁（page=1, limit=50） | 顯示前 50 筆資料，顯示總筆數 |
| 3 | 切換至第 2 頁 | 顯示第 51~100 筆資料 |
| 4 | 變更每頁筆數為 100 | 顯示前 100 筆資料 |
| 5 | 點擊欄位標題排序（升冪） | 資料依該欄位升冪排列，欄位標題顯示上箭頭 |
| 6 | 再次點擊同欄位標題（降冪） | 資料依該欄位降冪排列，欄位標題顯示下箭頭 |
| 7 | 任務尚未執行過 | 顯示空狀態提示，含「立即執行」快捷按鈕 |
| 8 | 資料摘要顯示 | 顯示 raw data 表名、總筆數、最後更新時間 |
| 9 | 百萬筆資料的分頁查詢（page=500） | 回應時間 < 3 秒，資料正確 |
| 10 | 對非索引欄位排序（> 100,000 筆） | 回傳資料並附帶 warning 欄位 |
| 11 | 非 Admin 嘗試存取 | 回傳 403 Forbidden |
| 12 | 指定不存在的 taskId | 回傳 404 Not Found |

---

## 依賴關係

- **Blocked By**：US-034（需有 completed 的執行記錄，AppDB raw data 表才有資料）、US-035（日誌頁面提供進入預覽的入口）
- **Blocks**：無

---

## Definition of Done

- [ ] raw data 預覽頁面 UI，含資料摘要區塊（表名、總筆數、最後更新時間）
- [ ] 分頁元件：可切換頁面、可切換每頁筆數（50 / 100 / 200）
- [ ] 欄位標題點擊排序（升冪 / 降冪），含視覺指示
- [ ] 空狀態處理（未執行 / 無資料），含「立即執行」快捷按鈕
- [ ] 後端 API 端點支援分頁、排序
- [ ] raw data 表的 `_cdmp_id`（或主鍵）建立 Index
- [ ] 非索引欄位排序時附帶效能警告
- [ ] 水平捲動支援（多欄位情境）
- [ ] 時間欄位以 UTC+8 顯示
- [ ] 從擷取日誌（US-035）可連結至本頁
- [ ] 所有驗收標準的單元測試通過

---

## 相關文件

- **Epic Brief**：[E04 Epic Brief](epic-brief.md)
- **相關 Stories**：US-030（建立任務，決定 source_table 與 raw data 表名）、US-034（執行任務，資料落地）、US-035（日誌，提供預覽入口）
- **NFR**：[NFR-002 效能需求](../../non-functional/NFR-002-performance.md)
