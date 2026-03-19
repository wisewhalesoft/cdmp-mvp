# US-041：建立 Pipeline

> **Story ID**：US-041
> **Epic**：[E05 — ETL Pipeline 管理](epic-brief.md)
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：3

---

## User Story

**As a** Admin（管理者）
**I want** 建立新的 ETL Pipeline，填寫名稱、描述與排程設定
**So that** 我能開始定義資料轉換流程

---

## 驗收標準

### AC-1：成功建立
- **Given** Admin 在 Pipeline 列表頁面點擊「建立 Pipeline」按鈕
- **When** 填寫名稱（必填）、描述（選填）、排程設定後送出表單
- **Then** 系統建立新的 Pipeline，狀態為 draft，版本為 1，並導向 Pipeline 編輯器頁面

### AC-2：名稱唯一驗證
- **Given** 系統中已存在名為「客戶資料同步」的 Pipeline
- **When** Admin 嘗試建立同名的 Pipeline
- **Then** 系統顯示錯誤訊息「Pipeline 名稱已存在」，不建立重複項目

### AC-3：排程設定
- **Given** Admin 在建立 Pipeline 表單中
- **When** 設定排程
- **Then** 可使用 Cron UI 選擇器（選擇頻率、時間）或手動輸入 Cron 表達式，並即時預覽下次執行時間

### AC-4：初始狀態為草稿
- **Given** Admin 成功建立新 Pipeline
- **When** 在 Pipeline 列表中查看
- **Then** 新建立的 Pipeline 狀態為 draft，版本為 1

---

## Technical Notes

- 權限：僅 Admin 可存取

### API 端點

- 端點：`POST /api/v1/etl/pipelines`
- Request：
```json
{
  "name": "string",
  "description": "string",
  "schedule": "0 2 * * *"
}
```
- Response（201 Created）：回傳完整 pipeline 物件
```json
{
  "id": "uuid",
  "name": "string",
  "description": "string",
  "version": 1,
  "status": "draft",
  "schedule": "0 2 * * *",
  "enabled": false,
  "createdBy": "string",
  "createdAt": "ISO8601",
  "updatedAt": "ISO8601"
}
```
- 名稱重複：回傳 `409 Conflict`，`{ "message": "Pipeline 名稱已存在" }`

---

## 測試案例

| # | 測試案例 | 預期結果 |
|---|---------|---------|
| 1 | 填寫名稱與排程後送出 | 成功建立，狀態為 draft，版本為 1 |
| 2 | 未填寫名稱即送出 | 顯示必填欄位驗證錯誤 |
| 3 | 輸入已存在的名稱 | 顯示 409 Conflict 錯誤訊息 |
| 4 | 使用 Cron UI 選擇器設定排程 | 正確產生 Cron 表達式 |
| 5 | 手動輸入無效的 Cron 表達式 | 顯示格式錯誤提示 |
| 6 | 建立後查看列表 | 新 Pipeline 出現在列表中 |
| 7 | 非 Admin 使用者嘗試建立 | 回傳 403 Forbidden |

---

## 依賴關係

- **Blocked By**：無（可獨立開發）
- **Blocks**：US-042、US-044、US-047

---

## Definition of Done

- [ ] 建立 Pipeline API 開發完成
- [ ] 前端建立表單含名稱、描述、排程設定
- [ ] Cron UI 選擇器元件實作
- [ ] 名稱唯一性驗證（前後端）
- [ ] 單元測試覆蓋率達標
- [ ] E2E 測試撰寫完成

---

## 相關文件

- **Epic Brief**：[E05 Epic Brief](epic-brief.md)
