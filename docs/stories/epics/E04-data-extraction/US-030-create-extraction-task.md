# US-030：建立擷取任務

> **Story ID**：US-030
> **Epic**：[E04 — 資料擷取管理](epic-brief.md)
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：5

---

## User Story

**As a** Admin（管理者）
**I want** 建立一個資料擷取任務
**So that** 平台可以從已設定的資料來源中擷取資料至指定的目標資料表

---

## 驗收標準

### AC-1：成功建立擷取任務
- **Given** Admin 在擷取任務管理頁面
- **When** Admin 填寫必填欄位（名稱、資料來源、擷取模式、目標資料表、排程）並點擊「建立任務」
- **Then** 系統儲存擷取任務設定，狀態設為 `scheduled`，顯示成功訊息，且新任務出現於任務清單中

### AC-2：防止重複名稱
- **Given** 名為「每日客戶同步」的擷取任務已存在
- **When** Admin 嘗試建立另一個相同名稱的擷取任務
- **Then** 系統顯示「此名稱的擷取任務已存在」，且不建立該筆記錄

### AC-3：增量模式必填欄位驗證
- **Given** Admin 選擇擷取模式為「增量」
- **When** Admin 未填寫增量欄位（incremental_column）即提交表單
- **Then** 系統顯示「增量模式必須指定增量欄位」的驗證錯誤訊息

### AC-4：欄位驗證
- **Given** Admin 在建立擷取任務表單
- **When** Admin 提交表單時有必填欄位未填或格式不合規（例如：cron 表達式格式錯誤、名稱為空）
- **Then** 系統針對每個不合規欄位顯示具體的驗證錯誤訊息

### AC-5：資料來源下拉選單
- **Given** Admin 在建立擷取任務表單
- **When** Admin 點擊資料來源下拉選單
- **Then** 系統顯示所有已啟用且未刪除的資料來源清單，包含名稱與類型

---

## Technical Notes

- 端點：`POST /api/extraction-tasks`
- Request body：
  ```json
  {
    "name": "string",
    "datasourceId": "uuid",
    "mode": "full | incremental",
    "targetTable": "string",
    "schedule": "string (cron expression)",
    "incrementalColumn": "string (增量模式必填)",
    "lastIncrementalValue": "string (選填)"
  }
  ```
- Response：`201 Created`，回傳完整的 ExtractionTask 物件
- 支援模式：`full`（全量）、`incremental`（增量）
- Cron 表達式驗證：使用 `cron-parser` 或類似套件驗證格式
- 資料來源下拉清單端點：複用 `GET /api/datasources`（篩選 `enabled=true`, `deleted_at IS NULL`）
- 建立時 `status` 預設為 `scheduled`，`enabled` 預設為 `true`
- 時區處理：後端儲存 UTC 時間，前端顯示時轉換為 UTC+8（Asia/Taipei）

---

## 測試案例

| # | 測試案例 | 預期結果 |
|---|---------|---------|
| 1 | 以有效資料建立全量擷取任務 | 建立成功，status 為 scheduled |
| 2 | 建立增量擷取任務（含增量欄位） | 建立成功 |
| 3 | 使用重複名稱建立 | 顯示錯誤訊息 |
| 4 | 增量模式未填增量欄位 | 驗證錯誤訊息 |
| 5 | 缺少任務名稱 | 驗證錯誤訊息 |
| 6 | Cron 表達式格式錯誤 | 驗證錯誤訊息 |
| 7 | 缺少目標資料表 | 驗證錯誤訊息 |
| 8 | 選擇不存在的資料來源 | 回傳 400 Bad Request |
| 9 | 非 Admin 嘗試建立 | 回傳 403 Forbidden |

---

## 依賴關係

- **Blocked By**：US-001（Admin 必須先完成驗證）、US-020（需有資料來源存在）
- **Blocks**：US-031、US-032、US-033、US-034、US-035、US-036、US-037、US-038（擷取任務必須存在才能進行後續操作）

---

## Definition of Done

- [ ] 建立擷取任務表單 UI 含所有必填欄位
- [ ] 資料來源下拉選單載入已啟用的資料來源
- [ ] 擷取模式選擇器（全量 / 增量）
- [ ] 增量模式時動態顯示增量欄位輸入框
- [ ] Cron 表達式輸入與格式驗證
- [ ] 後端 API 端點含驗證邏輯
- [ ] 重複名稱檢查實作完成
- [ ] 成功／錯誤回饋訊息正確顯示
- [ ] 所有驗收標準的單元測試通過

---

## 相關文件

- **Epic Brief**：[E04 Epic Brief](epic-brief.md)
- **相關 Stories**：US-031、US-032、US-033、US-034、US-035、US-036、US-037、US-038
