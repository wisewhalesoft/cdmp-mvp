# US-036：排程自動執行

> **Story ID**：US-036
> **Epic**：[E04 — 資料擷取管理](epic-brief.md)
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：5

---

## User Story

**As a** Admin（管理者）
**I want** 擷取任務能依設定的排程自動執行
**So that** 資料可以定期自動更新，無需手動觸發

---

## 驗收標準

### AC-1：依排程自動執行
- **Given** 系統中有已啟用的擷取任務，且設定了 cron 排程
- **When** 到達排程觸發時間
- **Then** 系統自動執行該擷取任務，建立 ExtractionLog（triggered_by = 'schedule'），更新任務狀態與執行結果

### AC-2：跳過停用任務
- **Given** 某擷取任務的 `enabled` 為 `false`
- **When** 到達該任務的排程觸發時間
- **Then** 系統跳過該任務，不執行擷取作業，不建立 ExtractionLog

### AC-3：跳過執行中任務
- **Given** 某擷取任務的 status 為 `running`
- **When** 到達該任務的排程觸發時間
- **Then** 系統跳過該任務，避免重複執行，待當前執行完成後由下次排程觸發

### AC-4：排程執行記錄
- **Given** 排程自動執行完成
- **When** Admin 查看該任務的日誌
- **Then** ExtractionLog 的 `triggered_by` 欄位為 `schedule`，可與手動觸發區分

### AC-5：軟刪除任務排除
- **Given** 某擷取任務已被軟刪除（`deleted_at IS NOT NULL`）
- **When** 排程引擎掃描待執行任務
- **Then** 系統排除該任務，不納入排程觸發範圍

---

## Technical Notes

- 擴展現有 `@nestjs/schedule` 模組
- 排程引擎設計：
  1. 主排程以固定頻率（建議每分鐘）掃描所有符合條件的任務
  2. 篩選條件：`enabled = true AND deleted_at IS NULL AND status != 'running'`
  3. 比對每個任務的 cron 表達式是否符合當前時間
  4. 符合條件的任務觸發執行（複用 US-034 的執行邏輯）
- Cron 表達式解析：使用 `cron-parser` 套件
- 共用執行邏輯：排程觸發與手動觸發（US-034）共用相同的執行流程，差異僅在 `triggered_by` 欄位
- 並發控制：同一任務同時只能有一個執行實例
- 時區處理：cron 表達式以 UTC 時區解析，後端儲存 UTC 時間

---

## 測試案例

| # | 測試案例 | 預期結果 |
|---|---------|---------|
| 1 | 已啟用任務到達排程時間 | 自動執行，建立日誌 |
| 2 | 停用任務到達排程時間 | 不執行，無日誌 |
| 3 | 執行中任務到達排程時間 | 跳過，不重複執行 |
| 4 | 軟刪除任務 | 排除於排程範圍外 |
| 5 | 排程執行的日誌 triggered_by | 值為 schedule |
| 6 | 排程執行成功 | 任務 status 更新為 completed |
| 7 | 排程執行失敗 | 任務 status 更新為 failed，記錄錯誤訊息 |
| 8 | Cron 表達式 `0 2 * * *` | 每日凌晨 2:00 UTC 觸發 |
| 9 | 多任務同時到達排程時間 | 各自獨立執行 |

---

## 依賴關係

- **Blocked By**：US-030（需有擷取任務存在）、US-034（共用執行邏輯）
- **Blocks**：無
- 與 US-033 關聯：排程引擎需檢查 `enabled` 狀態

---

## Definition of Done

- [ ] 排程引擎基於 @nestjs/schedule 實作完成
- [ ] 主排程每分鐘掃描待執行任務
- [ ] 正確解析 cron 表達式並觸發對應任務
- [ ] 停用任務與執行中任務正確跳過
- [ ] 軟刪除任務排除在排程範圍外
- [ ] 排程觸發與手動觸發共用執行邏輯
- [ ] 並發控制確保同一任務不重複執行
- [ ] ExtractionLog 正確記錄 triggered_by = 'schedule'
- [ ] 所有驗收標準的單元測試通過

---

## 相關文件

- **Epic Brief**：[E04 Epic Brief](epic-brief.md)
- **相關 Stories**：US-030、US-033、US-034
