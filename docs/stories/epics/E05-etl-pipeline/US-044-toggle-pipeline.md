# US-044：啟用／停用 Pipeline

> **Story ID**：US-044
> **Epic**：[E05 — ETL Pipeline 管理](epic-brief.md)
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：2

---

## User Story

**As a** Admin（管理者）
**I want** 啟用或停用 Pipeline
**So that** 我能控制哪些 Pipeline 在排程時自動執行，暫停不需要的 Pipeline

---

## 驗收標準

### AC-1：停用 Pipeline
- **Given** 一個狀態為 active 且 enabled = true 的 Pipeline
- **When** Admin 點擊「停用」按鈕
- **Then** Pipeline 的 enabled 變為 false，status 變為 disabled，排程自動暫停

### AC-2：啟用 Pipeline（已發布版本）
- **Given** 一個已有發布版本且 enabled = false 的 Pipeline
- **When** Admin 點擊「啟用」按鈕
- **Then** Pipeline 的 enabled 變為 true，status 變為 active，排程恢復

### AC-3：草稿不可啟用
- **Given** 一個狀態為 draft（無發布版本）的 Pipeline
- **When** Admin 嘗試啟用
- **Then** 系統回傳 400 Bad Request，顯示「需先發布 Pipeline 才能啟用」

### AC-4：狀態切換後排程同步更新
- **Given** Admin 切換了 Pipeline 的啟用／停用狀態
- **When** 操作完成
- **Then** 排程系統同步更新：停用時移除排程任務，啟用時註冊排程任務

---

## Technical Notes

### API 端點

- 端點：`PATCH /api/v1/etl/pipelines/:id/toggle`
- Request：
```json
{
  "enabled": true
}
```
- Response（200 OK）：回傳更新後的 pipeline 物件
```json
{
  "id": "uuid",
  "name": "string",
  "status": "active",
  "enabled": true,
  "schedule": "0 2 * * *",
  "updatedAt": "ISO8601"
}
```
- 草稿啟用：回傳 `400 Bad Request`，`{ "message": "需先發布 Pipeline 才能啟用" }`

### 狀態轉換規則

- 停用：`active` → `disabled`（enabled = false）
- 啟用：`disabled` → `active`（enabled = true，前提為已有發布版本）
- 草稿（draft）無法啟用

---

## 測試案例

| # | 測試案例 | 預期結果 |
|---|---------|---------|
| 1 | 停用 active Pipeline | status 變為 disabled，enabled = false |
| 2 | 啟用已發布的 disabled Pipeline | status 變為 active，enabled = true |
| 3 | 嘗試啟用 draft Pipeline | 回傳 400 Bad Request |
| 4 | 停用後確認排程已暫停 | 排程任務被移除 |
| 5 | 啟用後確認排程已恢復 | 排程任務被註冊 |
| 6 | 非 Admin 使用者嘗試操作 | 回傳 403 Forbidden |

---

## 依賴關係

- **Blocked By**：US-041（需有 Pipeline 存在）
- **Blocks**：無

---

## Definition of Done

- [ ] Toggle API 開發完成
- [ ] 狀態轉換邏輯實作（含草稿檢查）
- [ ] 排程系統同步更新（啟用時註冊、停用時移除）
- [ ] 前端啟用／停用切換 UI
- [ ] 單元測試覆蓋率達標
- [ ] E2E 測試撰寫完成

---

## 相關文件

- **Epic Brief**：[E05 Epic Brief](epic-brief.md)
