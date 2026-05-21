---
spec-id: F087
title: 部長拒絕名單並退回個別業務比例設定（簽核拒絕）
feature-id: F087
source-story: US-117
epic: E07
module: M03c 簽核階段
priority: P0-MVP
version: "1.2.1"
date: 2026-05-21
status: Draft
---

# F087: 部長拒絕名單並退回個別業務比例設定（簽核拒絕）

Priority: P0-MVP | Status: Draft | Last Updated: 2026-05-21

> **v1.2.1（2026-05-21 / Phase 5 TDD code drift 修正 D1 follow-up）**：對齊 `AssignmentAuditLog.action` entity enum 與 real code 雙寫實況：
> 1. **`AC` 內 `action = 'REJECT'` 字串修正**：實際 `AssignmentAuditLog.action` enum（`apps/api/src/database/entities/assignment-audit-log.entity.ts:26-39`）為 `STAGE_REJECT`（VARCHAR(30)，不包含 `REJECT`）；F087 拒絕走 `StageTransitionService.rejectTo()` → 寫入 `action = 'STAGE_REJECT'`（`stage-transition.service.ts:118-138`）。spec 內 `action = 'REJECT'` 改為 `action = 'STAGE_REJECT'`。
> 2. **新增 §6.X 拒絕記錄之資料雙寫範式**：明列 real code 行為 — F087 拒絕於**同一 transaction** 內**雙寫兩張表**：(a) `assignment_audit_log` action='STAGE_REJECT'（stage transition 稽核）；(b) `assignment_approval` action='reject' + reject_reason（小寫 enum，記錄簽核者 + 拒絕原因，供 F082 v1.1 latestRejection banner 觸發機制查詢）。
> 3. **與 F086 核准單寫之不對稱**：F086 核准目前僅單寫 audit log（不寫 assignment_approval；詳見 [F086 v1.2.1 §6.X](F086-approve-to-ready.md)）；F087 雙寫為**唯一**寫入 `assignment_approval` 表的入口；兩者不對稱屬 code 現況，若 PM 希望對稱化需另開 follow-up。
> 4. **本 v1.2.1 不變動 entity / migration / code / prototype / Transaction / Guard**；BR-11 既已規範 assignment_approval 寫入，本 v1.2.1 補充 §6.X 將兩張表寫入語意整合為完整範式。
>
> **v1.2 救援重寫（2026-05-16）**：前一輪 PowerShell 編碼事故損毀本檔，本版本依 US-117 + AD-E07 v3.0 一致性決議完整重建；Guard 統一為 `DirectorGuard`（拒絕僅部長 / Admin 可操作；廢除 `SalesManagerGuard`）；business_role 欄位語意對齊；保留 v1.1 之 banner 觸發機制與 OQ-C-02 決議。
> **v1.1 修訂（2026-05-16 / OQ-E07-21 落地）**：新增 BR-11「拒絕原因儲存與 banner 觸發來源」明確 F087 寫入 `assignment_approval`、F082 GET 讀取後渲染 banner（UI 規格詳 F082 §7.x）。

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + `data-model.md#assignment-approval-entity` + `data-model.md#ob-empl-set-obemplsetmf--人員比例設定` + `error-handling.md#assignment-stage-transition-errors` + `error-handling.md#assignment-role-errors` |
| QA / Tester | 本文件 + `F082-set-personnel-ratio.md` §7.x（banner 渲染） + `error-handling.md#assignment-stage-transition-errors` |
| UI/UX Designer | 本文件 §7 + `F082-set-personnel-ratio.md` §7.x（banner 內容由本 spec 規範、UI 由 F082 渲染） |
| Architect | 本文件 + `architecture-spec.md` §3.10（含 `StageTransitionService.transit` helper） |

---

## 對應 User Story

- 來源 Story：[US-117-M03c-reject-to-personnel-ratio.md](../../stories/epics/E07-app-customer-list-assignment/US-117-M03c-reject-to-personnel-ratio.md)
- Epic：[E07 — 客戶名單分派](../../stories/epics/E07-app-customer-list-assignment/epic-brief.md)
- 模組：M03c 簽核階段（拒絕分支）

---

## 1. 功能摘要

允許部長 / Admin 對 `stage = 'approval'` 之名單填寫拒絕原因並執行拒絕操作；系統將名單階段從 `'approval'` 退回 `'personnel_ratio'`，並**清空該名單所有部門之 `ob_empl_set` 紀錄**（個別業務比例需處長重新設定）。

**設計要點**（OQ-C-02 確認）：
- 簽核階段之「退回」以「拒絕（Reject）」操作實現，**取代** Rollback button（不另設 Rollback 按鈕；F087 即為簽核階段之退回機制）
- 拒絕原因為**必填**（max 500 字），儲存於 `assignment_approval.reject_reason`
- 退回後，**部門比例（`ob_dept_pct`）保留不變**；僅個別業務比例（`ob_empl_set`）清空
- 拒絕原因經 F082 GET response `latestRejection` 欄位回傳，由 F082 §7.x 渲染 banner 通知處長

## 2. 使用者故事

**As a** 部長（Director）或 Admin
**I want** 在名單簽核階段發現比例設定不符合業務需求時，能填寫拒絕原因並退回至「個別業務比例設定」階段
**So that** 處長能根據明確的拒絕原因針對性修正，不需重走部門比例設定流程

## 3. 前置條件

- 使用者已通過 E01 驗證並持有 JWT Token
- 使用者具「部長」或「Admin」權限（處長**無此權限**）
- 目標 `list_no` 存在於 `ob_list_definition`、`status = 'active'`、`stage = 'approval'`
- `project_workym >= current_work_ym`（非歷史月份）
- `assignment_run` 中無 `status IN ('pending', 'running')` 紀錄

## 4. 驗收標準

### AC-1：簽核階段名單顯示「拒絕」按鈕

- **Given** 部長或 Admin 在 F048 / F077 清單頁查看 `stage = 'approval'` 之名單
- **When** 頁面顯示操作欄
- **Then** 顯示「拒絕」按鈕（與「核准」按鈕並排，沿用 F086）
- **And** 處長帳號**不顯示「拒絕」按鈕**

### AC-2：拒絕對話框與必填驗證

- **Given** 部長或 Admin 點擊「拒絕」按鈕
- **When** 系統彈出拒絕對話框
- **Then** 對話框顯示拒絕原因文字輸入框（必填，max 500 字），附說明：「請填寫拒絕原因，處長將可查閱此訊息」
- **And** 空白拒絕原因不允許提交（前端驗證：「請填寫拒絕原因」；後端驗證：422 `REJECT_REASON_REQUIRED`）
- **And** 對話框提供「確認拒絕」與「取消」兩個按鈕

### AC-3：確認拒絕後階段退回與清空個別業務比例

- **Given** 部長或 Admin 填寫拒絕原因後點擊「確認拒絕」
- **When** 後端處理拒絕請求（POST `/api/v1/assignment/lists/{listNo}/reject`）
- **Then** 後端於同一 DB transaction 內執行：
  1. UPDATE `ob_list_definition.stage` FROM `'approval'` TO `'personnel_ratio'`
  2. DELETE FROM `ob_empl_set` WHERE `list_no = {listNo}`（清空所有部門之個別業務比例）
  3. INSERT INTO `assignment_approval`（`list_no`、`action = 'reject'`、`reject_reason`、`approver_id = currentUserId`、`approved_at = now()`）
  4. INSERT INTO `assignment_audit_log`（`action = 'STAGE_REJECT'`、`entity_type = 'list_definition'`、`entity_id = list_no`、`before_value = { stage: 'approval' }`、`after_value = { stage: 'personnel_ratio', rejectReason: '...' }`）（v1.2.1 修正：對齊 entity enum，原 `REJECT` 不存在於 entity union；real flow 經 `StageTransitionService.rejectTo()`）
  5. **同 transaction** INSERT INTO `assignment_approval`（`action = 'reject'`（小寫）、`list_no`、`reject_reason`、`approver_id`、`approver_name`、`approver_role`、`approved_at`）（v1.2.1 補述：雙寫範式，BR-11 既有規範，詳見 §6.X）
- **And** 頁面成功提示「名單『{listNm}』已拒絕並退回個別業務比例設定階段」
- **And** 清單刷新顯示新階段

### AC-4：拒絕原因可供查閱（透過 F082 banner）

- **Given** 名單已退回至 `'personnel_ratio'`
- **When** 處長進入 F082 個別業務比例設定頁
- **Then** F082 GET response 回傳 `latestRejection` 欄位（含 `rejectReason` / `rejectorName` / `rejectorRole` / `rejectedAt`）
- **And** F082 §7.x 渲染拒絕 banner（顯示拒絕原因、拒絕者、拒絕時間；可關閉 / 收合）
- **And** 部長 / Admin 進入 F082 亦可看到此 banner（追蹤自己之操作）

### AC-5：退回後個別業務比例需重新設定，部門比例保留

- **Given** 名單已退回至 `'personnel_ratio'`
- **When** 處長進入 F082
- **Then** 本部門所有業務員的 RATION 均顯示為空（GET response employees[].ration = null；前端顯示為「未設定」或預設值 100% / N）
- **And** `ob_dept_pct` 保留原設定（部長 / Admin 進入部門比例頁看到既有比例不變）

### AC-6：月跑執行中禁止拒絕

- **Given** `assignment_run` 中存在 `status IN ('pending', 'running')` 紀錄
- **When** 部長或 Admin 嘗試點擊「拒絕」按鈕
- **Then** 拒絕按鈕為 disabled，hover 顯示「分派執行中，無法執行拒絕操作」
- **And** 若直接呼叫 API，service method 入口層 `AssignmentRunGuardService.assertNoRunningRun()` 拋 `ConflictException` 回 409 `ASSIGNMENT_RUN_ALREADY_RUNNING`

### AC-7：處長無法拒絕

- **Given** 帳號 `business_role = 'section_chief'`
- **When** 嘗試呼叫 POST `/api/v1/assignment/lists/{listNo}/reject`
- **Then** 後端 `DirectorGuard` 攔截，回 403 `AUTH_FORBIDDEN`
- **And** 前端清單頁無「拒絕」按鈕

### AC-8：非 `approval` 階段禁止拒絕

- **Given** 名單 `stage != 'approval'`
- **When** 部長嘗試呼叫拒絕 API
- **Then** 後端回 422 `LIST_STAGE_TRANSITION_FORBIDDEN`（透過 `StageTransitionService.assertStageEquals(listNo, 'approval')` 統一檢查）

### AC-9：歷史月份禁止拒絕

- **Given** 名單 `project_workym < current_work_ym`
- **When** 部長嘗試呼叫拒絕 API
- **Then** 後端回 403 `LIST_HISTORICAL_READONLY`
- **And** 清單頁中**完全不渲染**「拒絕」按鈕（沿用 F077 AC-2）

### AC-10：稽核日誌

- **Given** 任一成功拒絕操作
- **When** 操作完成
- **Then** `assignment_audit_log` 寫入一筆：`action = 'STAGE_REJECT'`（v1.2.1 修正：對齊 entity enum）、`entity_type = 'list_definition'`、`entity_id = list_no`、`before_value = { stage: 'approval' }`、`after_value = { stage: 'personnel_ratio', rejectReason: '原文', rejectorId: 'user-uuid' }`
- **And** **同 transaction** `assignment_approval` 寫入一筆：`action = 'reject'`（**小寫**，對齊 `AssignmentApproval.action` entity enum）、`reject_reason`、`approver_id`、`approver_name`、`approver_role`、`approved_at`（v1.2.1 補述：雙寫範式，BR-11 既有規範，詳見 §6.X）

## 5. API 規格

### 5.1 POST /api/v1/assignment/lists/{listNo}/reject

| 屬性 | 值 |
|---|---|
| 用途 | 部長 / Admin 對 `stage = 'approval'` 之名單執行拒絕並退回 `personnel_ratio` |
| 認證 | JWT 必填 |
| 授權 | `DirectorGuard`（admin OR business_role = 'director'） |

**Request Body**

```json
{
  "rejectReason": "XTC0 的 EMP001 比例需調整為 0%，請重新設定"
}
```

**Response — 200 OK**

```json
{
  "listNo": "OB202605001",
  "previousStage": "approval",
  "currentStage": "personnel_ratio",
  "rejectReason": "XTC0 的 EMP001 比例需調整為 0%，請重新設定",
  "rejectorId": "user-uuid-director-A",
  "rejectorName": "張部長",
  "rejectedAt": "2026-05-16T10:00:00Z",
  "clearedEmployeeRatios": 12
}
```

**錯誤回應**

| HTTP | 錯誤碼 | 說明 |
|---|---|---|
| 401 | AUTH_TOKEN_MISSING / AUTH_TOKEN_EXPIRED | 未登入或 Token 過期 |
| 403 | AUTH_FORBIDDEN | 非 admin / director（含處長嘗試呼叫） |
| 403 | LIST_HISTORICAL_READONLY | `project_workym < current_work_ym` |
| 404 | ASSIGNMENT_LIST_NOT_FOUND | `list_no` 不存在 |
| 409 | ASSIGNMENT_RUN_ALREADY_RUNNING | 月跑執行中 |
| 422 | ASSIGNMENT_LIST_INACTIVE | 名單已停用 |
| 422 | LIST_STAGE_TRANSITION_FORBIDDEN | `stage != 'approval'` |
| 422 | REJECT_REASON_REQUIRED | **v1.0 新增**：`rejectReason` 為空或僅含空白字元 |
| 422 | REJECT_REASON_TOO_LONG | **v1.0 新增**：`rejectReason` 超過 500 字 |
| 503 | FEATURE_NOT_ENABLED | feature flag `ENABLE_E07_REFACTOR_PHASE3 = false` |

## 6. 商業規則

| 規則編號 | 說明 |
|---|---|
| BR-1 | **拒絕僅部長 / Admin 可執行**：`DirectorGuard` 攔截處長與其他角色；處長透過 banner 接收拒絕通知，但無拒絕權限 |
| BR-2 | **僅 `stage = 'approval'` 可拒絕**：其他階段一律 422 `LIST_STAGE_TRANSITION_FORBIDDEN`（透過 `StageTransitionService.assertStageEquals(listNo, 'approval')` 統一檢查） |
| BR-3 | **拒絕原因必填**：空白或僅含空白字元回 422 `REJECT_REASON_REQUIRED`；超過 500 字回 422 `REJECT_REASON_TOO_LONG` |
| BR-4 | **退回階段固定為 `personnel_ratio`**：不可參數化退回至其他階段（如 `dept_ratio` / `draft`）；若需退回至更早階段，需由處長 / 部長手動執行 F085 / F081 |
| BR-5 | **清空 `ob_empl_set`**：DELETE 該 `list_no` 之所有部門紀錄；不可僅清空單一部門（簡化語意） |
| BR-6 | **保留 `ob_dept_pct`**：部門比例不受拒絕影響；部長若希望修改部門比例，需先 F085 Rollback 至 `dept_ratio` 階段（非本 spec 範圍） |
| BR-7 | **DB transaction**：UPDATE stage + DELETE ob_empl_set + INSERT assignment_approval + INSERT assignment_audit_log 須於同一 transaction 內執行 |
| BR-8 | **稽核失敗不 rollback**：稽核寫入 `assignment_audit_log` 失敗僅 Logger.error，不 rollback 業務 commit（沿用 F050 v2.0 BR-11） |
| BR-9 | **不可與月跑並發**：service method 入口層呼叫 `AssignmentRunGuardService.assertNoRunningRun()`；`status IN ('pending', 'running')` 時拋 409 |
| BR-10 | **歷史月份阻截**：`project_workym < current_work_ym` 一律 403 `LIST_HISTORICAL_READONLY` |
| BR-11 | **拒絕原因儲存與 banner 觸發來源（v1.1 新增 / OQ-E07-21 落地）**：(1) `assignment_approval` 寫入時包含 `{ list_no, action: 'reject', reject_reason, approver_id, approved_at }`；(2) F082 GET response `latestRejection` 欄位之資料來源：`SELECT TOP 1 reject_reason, approver_id AS rejector_id, approver_name, approver_role AS rejector_role, approved_at AS rejected_at FROM assignment_approval WHERE list_no = :listNo AND action = 'reject' ORDER BY approved_at DESC`；若最近一筆為 `action = 'approve'` 或無 approval 紀錄，回 `null`；(3) banner UI 規格詳 [F082 §7.x](F082-set-personnel-ratio.md#7x-拒絕-banner-渲染與互動規格)（本 spec 不重複描述 UI）；(4) F086 核准或 F089 Rollback 後，`latestRejection` 變為 `null`（banner 自動消失） |
| BR-12 | **Feature Flag fallback**：本 spec POST 端點掛 `FeatureFlagGuard`；`ENABLE_E07_REFACTOR_PHASE3 = false` 時回 503 + `FEATURE_NOT_ENABLED`（沿用 F082 BR-16） |

### 6.X 拒絕記錄之資料雙寫範式（v1.2.1 新增 / D1 follow-up / real code 行為對照）

> Source-of-truth：`apps/api/src/modules/assignment-stage/stage-action.service.ts:284-356` `rejectToPersonnelRatio()` 方法 + `apps/api/src/modules/assignment/services/stage-transition.service.ts:118-138` `rejectTo()` helper。

**Real code 行為**：F087 拒絕操作於**同一 DB transaction** 內執行**雙寫兩張表** + 一個業務動作：

1. `UPDATE ob_list_definition SET stage = 'personnel_ratio' WHERE list_no = :listNo`
2. `DELETE FROM ob_empl_set WHERE list_no = :listNo`（清空所有部門業務員 RATION）
3. `INSERT INTO assignment_audit_log` 一筆（由 `StageTransitionService.rejectTo()` 寫入）：
   - `action = 'STAGE_REJECT'`（VARCHAR(30)，對齊 entity union；v1.2.1 修正：原 spec 寫 `'REJECT'` 為錯）
   - `entity_type = 'list_definition'`
   - `entity_id = list_no`
   - `actor_id = currentUserId`
   - `after_value = { fromStage: 'approval', toStage: 'personnel_ratio', rejectReason }`
4. `INSERT INTO assignment_approval` 一筆（由 `stage-action.service.ts:332-344` 之 postActionFn 寫入）：
   - `action = 'reject'`（**小寫**，VARCHAR(10)，對齊 `AssignmentApproval.action` entity union `'approve' | 'reject'`）
   - `list_no`
   - `reject_reason`（trimmed，≤500 字）
   - `approver_id = currentUserId`
   - `approver_name = currentUserId`（placeholder，real code 行為，未來可補真實姓名 lookup）
   - `approver_role`（`admin` 為 `'admin'`，否則為 `actor.businessRole`）
   - `approved_at = rejectedAt`（同一 Date 物件，與 audit log timestamp 一致）

**設計理由：為何雙寫兩張表？**

| 資料表 | 用途 | enum 風格 | 寫入欄位 |
|---|---|---|---|
| `assignment_audit_log` | 通用稽核：所有 stage transition / CRUD / 月跑 / 角色變更（12 種 action） | 大寫 SNAKE_CASE | 共用欄位（`before_value` / `after_value` JSON）|
| `assignment_approval` | 簽核專屬：僅 approve / reject 兩種行為 | 小寫 | 專屬欄位（`reject_reason` / `approver_*`）|

兩張表並存原因：
- 通用稽核需要保持 schema 一致以支援 EXPORT / RUN / CANCEL / SCORING_INTEGRITY_WARN 等多種 action；不適合塞 `reject_reason` 等專屬欄位
- 簽核需要 banner 觸發機制（F082 v1.1 latestRejection）以 `assignment_approval.action='reject'` 為唯一查詢源（avoiding JSON path lookup on `audit_log.after_value`）
- 兩張表透過同一 DB transaction 保持原子性，避免狀態不一致

**與 F086 核准之不對稱**：

- F086 核准目前**僅單寫** `assignment_audit_log` action='STAGE_ADVANCE'，**不**寫 `assignment_approval`（詳見 [F086 v1.2.1 §6.X](F086-approve-to-ready.md)）
- 結果：`assignment_approval` 表在 production 環境理論上**只會累積 `action='reject'` 紀錄**
- 影響 F082 v1.1 latestRejection banner：實際使用上不受影響（banner 僅查 reject），但若未來需顯示「核准歷史」需先解決 F086 不寫 approval 表之 follow-up

**事務原子性保證**：

- 4 個 DB write 於同一 `dataSource.transaction(async (mgr) => {...})` 區塊內執行
- 任一 step 失敗（含 audit log insert 失敗），整個 transaction rollback；spec 既有 BR-7 規範
- BR-8 之「稽核失敗不 rollback」**不適用**於本流程之 audit_log INSERT（該 INSERT 在 transaction 內，必失敗則 rollback）；BR-8 適用範圍為 service-layer logger error，而非 DB transaction 內的 audit INSERT

## 7. UI/UX 需求

- **「拒絕」按鈕位置**：F048 / F077 清單頁 `stage = 'approval'` 名單之操作欄，與「核准」按鈕並排
- **權限與狀態**：
  - 處長：**不渲染**「拒絕」按鈕
  - 部長 / Admin：渲染
  - 歷史月份 / 已停用名單 / 非 `approval` 階段 / 月跑中**完全不渲染**或 disabled + hover 提示
- **拒絕對話框**：
  - 標題：「拒絕名單：{listNm}（{listNo}）」
  - 文字輸入框（多行 textarea，max 500 字，含字數計數器 N / 500）
  - 說明文字：「請填寫拒絕原因，處長將可查閱此訊息」
  - 「確認拒絕」按鈕（紅色或警示色）
  - 「取消」按鈕（中性色）
  - 空白原因時「確認拒絕」按鈕 disabled，前端顯示提示「請填寫拒絕原因」
- **成功提示 toast**：「名單『{listNm}』已拒絕並退回個別業務比例設定階段」
- **拒絕 banner**：由 F082 §7.x 渲染（本 spec 僅規範資料來源；banner UI 規格不重複定義）
- **二次確認對話框**（建議）：點擊「確認拒絕」後彈出二次確認「確認要拒絕並清空 {N} 筆個別業務比例設定嗎？此操作不可復原，處長需重新設定。」
  - 「確認」/「再考慮」兩按鈕
  - 此規格為建議；UI/UX agent 可依用戶體驗評估是否實作

## 8. 相依性

- **Blocked By**：
  - F084（推進至簽核，提供 `stage = 'approval'` 名單）
  - F082（個別業務比例設定，本 Feature 清空之來源）
  - F073（部長角色定義）
- **Blocks**：
  - F082（退回後處長重新設定；本 spec 之 banner 由 F082 §7.x 渲染）
- **相關**：F086（核准操作，與本 Feature 並列為簽核階段二選一）、F089（準備完成 Rollback；M03d 之退回機制）

## 9. 交叉參考

- **權威矩陣**：[F002 §4.6 E07 角色矩陣](F002-user-login.md#e07-角色矩陣)
- **資料模型**：
  - [data-model.md#assignment-approval-entity](../data-model.md#assignment-approval-entity)（拒絕原因儲存表）
  - [data-model.md#ob-empl-set-obemplsetmf--人員比例設定](../data-model.md#ob_empl_setobemplsetmf--人員比例設定)（清空目標）
  - [data-model.md#ob-list-definition-stage](../data-model.md#ob-list-definition-stage)
- **錯誤處理**：
  - [error-handling.md#assignment-stage-transition-errors](../error-handling.md#assignment-stage-transition-errors)（`LIST_STAGE_TRANSITION_FORBIDDEN` / `REJECT_REASON_REQUIRED` / `REJECT_REASON_TOO_LONG`）
  - [error-handling.md#assignment-role-errors](../error-handling.md#assignment-role-errors)（`AUTH_FORBIDDEN`）
- **架構決策**：
  - [F073](F073-define-director-role.md)（部長角色與 `DirectorGuard`）
  - OQ-C-02（簽核退回機制以拒絕實現，不另設 Rollback button）
  - OQ-E07-21（banner 觸發與 UI 渲染協作）
- **相關功能**：
  - [F082](F082-set-personnel-ratio.md)（退回後處長重新設定；banner UI §7.x）
  - [F084](F084-advance-to-approval.md)（推進至簽核）
  - [F086](F086-approve-to-ready.md)（核准操作，並列為簽核階段二選一）
  - [F089](F089-rollback-to-approval.md)（準備完成 Rollback 至簽核，本 spec 之逆方向）
- **圖表**：[diagrams/F087-reject-flow.mmd](../diagrams/F087-reject-flow.mmd)（簽核拒絕流程，含 stage 退回 + ob_empl_set 清空 + banner 觸發）

## 10. 測試覆蓋率要求

- 單元測試覆蓋率 ≥ 80%
- 後端關鍵測試案例：
  - 部長拒絕 `stage = 'approval'` 名單 → 200 OK + stage 變為 `personnel_ratio` + `ob_empl_set` 清空 + `assignment_approval` 寫入
  - 部長拒絕後 GET F082 → `latestRejection != null`、含完整拒絕資訊
  - Admin 拒絕 → 200 OK
  - 處長拒絕 → 403 `AUTH_FORBIDDEN`
  - 一般 user 拒絕 → 403 `AUTH_FORBIDDEN`
  - 空白拒絕原因 → 422 `REJECT_REASON_REQUIRED`
  - 拒絕原因 501 字 → 422 `REJECT_REASON_TOO_LONG`
  - 拒絕 `stage = 'personnel_ratio'` 名單 → 422 `LIST_STAGE_TRANSITION_FORBIDDEN`
  - 拒絕 `stage = 'ready'` 名單 → 422 `LIST_STAGE_TRANSITION_FORBIDDEN`
  - 拒絕歷史月份名單 → 403 `LIST_HISTORICAL_READONLY`
  - 拒絕月跑執行中名單 → 409 `ASSIGNMENT_RUN_ALREADY_RUNNING`
  - 拒絕後 `ob_dept_pct` 保留不變（驗證部門比例未清空）
  - 拒絕成功後再次拒絕（stage 已是 `personnel_ratio`）→ 422 `LIST_STAGE_TRANSITION_FORBIDDEN`
  - Transaction 完整性：拒絕過程中若 INSERT `assignment_approval` 失敗 → stage 與 `ob_empl_set` 一併 rollback
  - 稽核 `before_value` / `after_value` 完整寫入
  - Feature flag = false → 503 `FEATURE_NOT_ENABLED`
- 前端關鍵測試案例：
  - 部長視角清單頁渲染「拒絕」按鈕
  - 處長視角清單頁**不渲染**「拒絕」按鈕
  - 點擊「拒絕」開啟對話框、字數計數正確
  - 空白原因「確認拒絕」按鈕 disabled
  - 拒絕成功後清單頁刷新顯示新階段
  - 處長重新進入 F082 後看到拒絕 banner（含完整拒絕原因）
- E2E：F084 推進至 approval → F087 部長拒絕（填寫原因）→ 處長進入 F082 看到 banner + 業務員 RATION 為空 → 處長重設 → F084 再次推進

## 11. 實作 Checklist

- [ ] 後端實作 `POST /api/v1/assignment/lists/{listNo}/reject` 端點 + Service
- [ ] 後端套 `DirectorGuard`（admin OR business_role = 'director'）
- [ ] 後端套 `StageTransitionService.assertStageEquals(listNo, 'approval')`
- [ ] 後端 service method 入口層呼叫 `AssignmentRunGuardService.assertNoRunningRun()`
- [ ] 後端套 `LIST_HISTORICAL_READONLY` Guard
- [ ] 後端套 `FeatureFlagGuard`
- [ ] DB transaction 包含：UPDATE stage + DELETE ob_empl_set + INSERT assignment_approval + INSERT assignment_audit_log
- [ ] error-handling.md 新增 `REJECT_REASON_REQUIRED` / `REJECT_REASON_TOO_LONG` 2 個錯誤碼
- [ ] 前端「拒絕」按鈕渲染（角色與階段判斷）
- [ ] 前端拒絕對話框（textarea + 字數計數 + 必填驗證）
- [ ] 前端成功 toast 與清單刷新
- [ ] F082 GET response 加入 `latestRejection` 欄位（cross-spec 與 F082 共同實作）
- [ ] 圖表：[diagrams/F087-reject-flow.mmd](../diagrams/F087-reject-flow.mmd)
- [ ] E2E：F084 → F087 → F082 → F084 完整路徑

## 12. 假設

| # | 假設 | 標記 |
|---|---|---|
| A-1 | **`assignment_approval` 表 schema**：本 spec 假設此表存在且含 `list_no, action ('approve'|'reject'), reject_reason VARCHAR(500), approver_id, approver_name, approver_role, approved_at` 欄位；具體 schema 由 data-model.md 規範，system-architect 確認欄位 | [ASSUMPTION] 待 system-architect / data-model.md 確認 |
| A-2 | **二次確認對話框是否必要**：本 spec 建議實作（避免誤觸清空 `ob_empl_set`）；UI/UX agent 可評估使用者體驗後決定 | [ASSUMPTION] 待 UI/UX |
| A-3 | **退回後是否清空 `assignment_approval`**：本 spec 預設保留所有 approval 紀錄（含 reject 與 approve）以追蹤完整簽核歷史；F082 banner 僅顯示「最近一筆 reject」；F086 核准後 banner 自動消失（因 `latestRejection` 變為 null） | [ASSUMPTION] 待 system-architect |

## 13. 變更紀錄

| 版本 | 日期 | 變更內容 |
|---|---|---|
| v1.0 | 2026-05-15 | 初版（對應 US-117，E07 補修批次 5）：依 OQ-C-02 確認以「拒絕」取代 Rollback button；新增拒絕原因必填驗證；清空 `ob_empl_set` + 保留 `ob_dept_pct`；新增 `REJECT_REASON_REQUIRED` / `REJECT_REASON_TOO_LONG` 2 個錯誤碼 |
| v1.1 | 2026-05-16 | **E07 補修批次 6 修訂（OQ-E07-21 落地）**：新增 BR-11「拒絕原因儲存與 banner 觸發來源」，明確 F087 寫入 `assignment_approval`、F082 GET 讀取後渲染 banner（UI 規格詳 F082 §7.x，本 spec 不重複描述 UI） |
| **v1.2** | **2026-05-16** | **【救援重寫 / 編碼事故修復】**：依 US-117 + AD-E07 v3.0 一致性決議完整重建本檔；Guard 統一為 `DirectorGuard`（廢除 `SalesManagerGuard`）；business_role 欄位語意對齊 F074 v2.0；保留 v1.1 之 banner 觸發機制與 OQ-C-02 決議 |
| v1.2.1 | 2026-05-21 | **Phase 5 TDD code drift 修正（D1 follow-up）**：(1) 對齊 `AssignmentAuditLog.action` entity enum — 將 spec 內 `action = 'REJECT'` 字串修正為 `action = 'STAGE_REJECT'`（AC-4 / AC-13），entity union 為 `STAGE_REJECT`（VARCHAR(30)），原 `REJECT` 不存在；real flow 經 `StageTransitionService.rejectTo()`；(2) AC-4 step 4 / AC-13 補述同 transaction INSERT `assignment_approval`（`action='reject'` 小寫，對齊 AssignmentApproval entity union）；(3) 新增 §6.X 拒絕記錄之資料雙寫範式：明列 real code 同 transaction 內 4 個 DB write 順序（UPDATE stage / DELETE ob_empl_set / INSERT assignment_audit_log STAGE_REJECT / INSERT assignment_approval reject）+ 設計理由（為何雙寫兩張表）+ 與 F086 不對稱說明 + 事務原子性保證。不變動業務邏輯 / API endpoint / Transaction / Guard |
