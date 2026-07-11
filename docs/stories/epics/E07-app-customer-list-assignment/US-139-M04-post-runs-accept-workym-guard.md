# US-139：後端 POST /runs 接受 workYm（必填）並補 ground-truth 過去月 guard

> **Story ID**：US-139
> **Epic**：[E07 — 客戶名單分派](epic-brief.md)
> **模組**：M04 分派執行
> **優先級**：Must Have
> **階段**：Phase 1+2（止血 + ground-truth 對齊）
> **預估點數**：3
> **Feature**：F097 作業月語意統一
> **修正對象**：`assignment-run.controller.ts:85-88`（忽略 body 自算 `new Date()`）、`trigger-run.dto.ts`（無 `workYm` 欄位）

---

## User Story

**As a** 業務部長（Director）
**I want** 月名單分派觸發的後端使用我傳入的目標月份，並拒絕我對已過去的月份觸發月名單分派
**So that** 系統行為與 ground-truth SP 的 `@WORKDT >= getdate()` guard 一致，分派結果確實對應我選定的作業月，且不會對歷史月份產生錯誤的分派資料

---

## 背景說明：Ground-truth SP 證據

`reference/SP/SP_INFOT_ASSIGNEXPORTNAMELIST_st1_list.sql`（L24-34，UTF-16LE 解碼驗證）：

```sql
SELECT @WORKDT = PROJECT_WORKYM + '01', ...
FROM OBMLISTDF WHERE LIST_NO = @LIST_NO

IF ISNULL(@IS_ASSIGNED,'N')='Y' OR @WORKDT < getdate()
BEGIN
    RETURN   -- 跳過，不撈這張名單
END
```

`@WORKDT = PROJECT_WORKYM 的 1 號`。Guard 要求 **`@WORKDT >= getdate()`** 才處理。F097 將此 guard 移植至後端 `POST /runs`。

---

## 驗收標準

### AC-1：`TriggerRunDto` 新增必填 `workYm` 欄位

- **Given** `POST /api/v1/assignment/runs`
- **When** request body 包含 `{ workYm: '202606' }`（6 位數字字串，YYYYMM 格式）
- **Then** 後端接受並使用此 `workYm` 作為 `AssignmentRun.project_workym`，而非呼叫 `new Date()`
- **And** `AssignmentRunController.computeCurrentWorkYm()` static method 在此端點不再被呼叫

### AC-2：`workYm` 格式驗證（YYYYMM）

- **Given** request body 包含格式錯誤的 `workYm`（例：`'20266'`、`'202613'`、`'abcdef'`、`null`）
- **When** 請求到達後端 ValidationPipe
- **Then** 回 400 `INVALID_YM_FORMAT`

### AC-3：`workYm` 必填驗證（breaking change — 方案 A）

- **Given** request body 未帶 `workYm` 欄位（如空 body `{}`）
- **When** 請求到達後端 ValidationPipe
- **Then** 回 400 `INVALID_YM_FORMAT`（或通用 400 驗證錯誤）
- **And** 後端**不提供任何 `new Date()` fallback**（此為刻意的 breaking change，前端 US-138 AC-4 必須同步傳值）

### AC-4：過去月 guard（對應 SP `@WORKDT < getdate()`）

- **Given** request body `{ workYm: '202504' }`（假設今天為 2026-05-27，目標月 1 號 = 2025-04-01 < 今天）
- **When** 請求通過格式驗證後進行業務邏輯檢查
- **Then** 回 422，錯誤碼 `RUN_WORKYM_PAST`
- **And** response body `message` 包含「不可對已開始或過去的作業月觸發月名單分派」（或等效說明）

### AC-5：當月 1 號為邊界，當天可觸發（`>=` 語意）

- **Given** 今天（server 時鐘）為 2026-06-01，request body `{ workYm: '202606' }`
- **When** 過去月 guard 計算 `workdt = '20260601'`，比對今天 `20260601`
- **Then** guard 通過（`workdt >= today`，`>=` 邊界，當月 1 號合法）
- **And** 請求繼續進行後續 readiness check 與 run 建立

### AC-6：未來月份正常通過 guard

- **Given** request body `{ workYm: '202607' }`（目標月 1 號 = 2026-07-01 > 今天）
- **When** 過去月 guard 執行
- **Then** guard 通過，繼續執行後續流程

### AC-7：`AssignmentRun.project_workym` 寫入選定月份

- **Given** guard 通過，request body `{ workYm: '202606' }`
- **When** `AssignmentRunService.triggerRun()` 建立 run 記錄
- **Then** `assignment_run.project_workym = '202606'`（不使用 `new Date()`）

---

## 錯誤碼新增

| HTTP | 錯誤碼 | 說明 |
|---|---|---|
| 400 | `INVALID_YM_FORMAT` | `workYm` 缺省或格式非 YYYYMM（已有，擴充適用場景） |
| 422 | `RUN_WORKYM_PAST` | **新增**：`workYm` 對應之目標月 1 號 < 今天（過去月 guard） |

> `RUN_WORKYM_PAST` 須新增至 `error-handling.md`，由 spec-writer 負責更新該文件。

---

## 業務規則

| 規則 | 說明 |
|---|---|
| BR-1 | **`workYm` 必填，無 fallback**：`POST /runs` 不提供任何 `new Date()` 預設，前端必須明確傳入選定月份（方案 A，已拍板） |
| BR-2 | **過去月 guard 使用 `>=`**：`workdt >= getdate()` 即當月 1 號當天可觸發（對應 SP `@WORKDT < getdate()` 的邏輯等價） |
| BR-3 | **guard 以 server 時鐘為準**：過去月比對基準為後端 server 當下時間（使用 `SystemService.getCurrentWorkYm()` 計算基準日），不依賴前端時鐘 |

---

## 技術備註

- `TriggerRunDto` 新增 `@IsNotEmpty() @Matches(/^\d{6}$/) workYm: string`。
- Controller L85-88 現行：`const ym = AssignmentRunController.computeCurrentWorkYm();`，改為從 `_dto.workYm` 取值。
- 過去月 guard 實作建議於 `AssignmentRunService.triggerRun()` 最前段（格式驗證後、`assertNoRunningRun` 前）：計算 `workdt = new Date(workYm.slice(0,4), +workYm.slice(4,6) - 1, 1)`，比對 `workdt < today`。
- `SystemService.getCurrentWorkYm()` 用於 guard 計算基準（`now`），對齊 US-140 的 service 收斂目標。

---

## 依賴關係

- **Blocked By**：US-140（`SystemService` 收斂，guard 使用 `getCurrentWorkYm()` 取 now）
- **Blocks**：US-138 AC-4（前端傳 `workYm`）、US-142（`project_workym` 正確後去重視窗才能對齊）

---

## Definition of Done

- [ ] 驗收標準 AC-1 ~ AC-7 全部通過
- [ ] `RUN_WORKYM_PAST` 已新增至 `error-handling.md`（spec-writer 任務）
- [ ] 單元測試覆蓋率 ≥ 80%（必填驗證 / 格式驗證 / 過去月 / 邊界當月 1 號 / 未來月）
- [ ] `AssignmentRunController.computeCurrentWorkYm()` 在 `triggerRun` handler 中不再被呼叫
- [ ] Code review 通過

---

## 相關文件

- **Glossary**：[docs/specs/glossary.md](../../../specs/glossary.md)（`target_work_ym` / `workdt` / 過去月 guard）
- **Feature Proposal**：[docs/specs/proposals/work-ym-semantics-unification.md](../../../specs/proposals/work-ym-semantics-unification.md) §2（ground-truth 證據）、§5 D3、D4、R5
- **Ground-truth SP**：`reference/SP/SP_INFOT_ASSIGNEXPORTNAMELIST_st1_list.sql` L24-34（UTF-16LE 解碼）
- **相關 Stories**：US-138（前端對應）、US-140（SystemService 收斂）、US-142（去重視窗對齊）
