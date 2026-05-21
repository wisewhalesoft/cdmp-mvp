---
spec-id: F086
title: 部長核准名單（簽核 → 準備完成）
feature-id: F086
source-story: US-116
epic: E07
module: M03c 簽核階段
priority: P0-MVP
version: "1.2.1"
date: 2026-05-21
status: Draft
---

# F086: 部長核准名單（簽核 → 準備完成）

Priority: P0-MVP | Status: Draft | Last Updated: 2026-05-21

> **v1.2.1（2026-05-21 / Phase 5 TDD code drift 修正 D1 follow-up）**：對齊 `AssignmentAuditLog.action` entity enum 與 real code 雙寫實況：
> 1. **`AC` 內 `action = 'APPROVE'` 字串修正**：實際 `AssignmentAuditLog.action` enum（`apps/api/src/database/entities/assignment-audit-log.entity.ts:26-39`）**不包含** `APPROVE`；F086 核准走 `StageTransitionService.advanceTo()` → 寫入 `action = 'STAGE_ADVANCE'`（`stage-transition.service.ts:89`）。spec 內 `action = 'APPROVE'` 改為 `action = 'STAGE_ADVANCE'`。
> 2. **新增 §6.X 核准記錄之資料寫入範式**：明列 real code 行為 — F086 目前**僅單寫** `assignment_audit_log`（action='STAGE_ADVANCE'，含 stage transition），**不寫** `assignment_approval` 表（與 F087 拒絕之雙寫對稱不一致；`stage-action.service.ts:254-279` 之 `approveToReady` 未呼叫 `assignment_approval.insert`）。
> 3. **設計現況 vs spec 預期差距 flag**：F082 v1.1 latestRejection banner 機制透過 `assignment_approval.action='reject'` 查詢觸發；F086 不寫 approval 表，故 `assignment_approval` 表理論上只會累積 reject 記錄。若 PM 希望 F086 也寫 `assignment_approval.action='approve'`（含 approver_name / approved_at），需開另一輪 spec + code 變更（屬未來 enhancement，本 v1.2.1 不規範）。
> 4. **本 v1.2.1 不變動 entity / migration / code / prototype / Transaction / Guard**；僅修 AC 字串 + 新增說明 sub-section。
>
> **v1.2 救援重寫（2026-05-16）**：前一輪編碼事故損毀本檔內容，依 US-116 + AD-E07 v3.0 一致性決議完整重建；Guard 為 `DirectorGuard`；業務角色欄位 `business_role`；JWT claim `businessRole`；保留 v1.0 / v1.1 所有設計決議。
> **v1.1 修訂（2026-05-16 / Phase 1 決議落地）**：月跑並發守衛集中至 `AssignmentRunGuardService.assertNoRunningRun()`（決議 #6）；Feature Flag fallback 503 + `FEATURE_NOT_ENABLED`（決議 #2）。

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + `data-model.md#ob-list-definition` + `error-handling.md#assignment-stage-transition-errors` + `error-handling.md#assignment-role-errors` |
| QA / Tester | 本文件 + `error-handling.md#assignment-role-errors` |
| UI/UX Designer | 本文件 §7 |
| Architect | 本文件 + `architecture-spec.md` §3.10 `StageTransitionService` |

---

## 對應 User Story

- 來源 Story：[US-116-M03c-approve-to-ready.md](../../stories/epics/E07-app-customer-list-assignment/US-116-M03c-approve-to-ready.md)
- Epic：[E07 — 客戶名單分派](../../stories/epics/E07-app-customer-list-assignment/epic-brief.md)
- 模組：M03c 簽核階段（核准操作）

---

## 1. 功能摘要

部長 / Admin 對 `stage = 'approval'` 名單執行核准，使 `stage` 由 `'approval'` 推進至 `'ready'`，名單進入「準備完成」狀態，可供月跑使用。

**範圍**：
- 僅 `stage = 'approval'` 名單可核准；非此階段一律 422 `LIST_STAGE_TRANSITION_FORBIDDEN`
- 核准後設定資料（篩選條件、部門比例、個別業務比例、CR 開關）全部保留為唯讀
- 簽核階段「退回」由拒絕（F087）取代，不提供獨立 Rollback 按鈕；`ready` 狀態之退回由 F089 提供

**Actor**：部長（`business_role = 'director'`）+ Admin；處長無核准權限

## 2. 使用者故事

**As a** 部長 / Admin
**I want** 在確認名單設定無誤後正式核准，使其進入「準備完成」階段
**So that** 名單通過最終審核，標記為可用於月跑的狀態，並在準備完成清單中可見

## 3. 前置條件

- 使用者持 JWT 且 `business_role = 'director'` 或 admin
- 目標 `list_no` 存在，`status = 'active'`，`stage = 'approval'`
- `project_workym >= current_work_ym`
- `assignment_run` 無 `status IN ('pending', 'running')` 紀錄
- 推進至 approval 階段（由 F084 完成）

## 4. 驗收標準

### AC-1：簽核階段顯示「核准」按鈕

- **Given** 部長 / Admin 在 F048 / F077 清單頁查看 `stage = 'approval'` 名單
- **When** 頁面顯示操作欄
- **Then** 顯示「核准」按鈕（與「拒絕」並排，拒絕由 F087 提供）
- **And** 處長帳號**完全不渲染**「核准」與「拒絕」按鈕

### AC-2：核准前可查看完整設定摘要

- **Given** 部長點擊「核准」前
- **When** 進入名單詳情頁或摘要面板
- **Then** 顯示完整設定摘要（篩選條件 + 部門比例 + 個別業務比例 + CR 開關）；摘要為唯讀

### AC-3：核准確認對話框

- **Given** 部長 / Admin 點擊「核准」
- **When** 系統彈出確認對話框
- **Then** 對話框顯示：「確認核准名單『{listNm}』（{listNo}）？核准後名單將進入準備完成階段，可用於月跑。」
- **And** 提供「確認核准」與「取消」兩個按鈕

### AC-4：執行核准

- **Given** 部長 / Admin 點擊「確認核准」
- **When** 後端處理請求（POST `/api/v1/assignment/lists/{listNo}/stage/approve`）
- **Then** 系統更新 `ob_list_definition.stage` 由 `'approval'` 為 `'ready'`
- **And** 寫入 `assignment_audit_log`（`action = 'STAGE_ADVANCE'`、`entity_type = 'list_definition'`、`entity_id = list_no`、`before_value = { stage: 'approval' }`、`after_value = { stage: 'ready' }`、`operator_id = currentUserId`）（v1.2.1 修正：對齊 entity enum，原 `APPROVE` 不存在於 entity union；real flow 經 `StageTransitionService.advanceTo()`）
- **And** **不**寫入 `assignment_approval` 表（v1.2.1 補述 / real code 行為對照）：F086 目前僅單寫 audit log；如需簽核者資訊（approver_name / approved_at），現況無法從 `assignment_approval` 查得 approve 紀錄。詳見 §6.X 補述
- **And** 頁面顯示成功提示「名單『{listNm}』已核准，進入準備完成階段」，清單刷新

### AC-5：核准後名單出現在「準備完成」清單

- **Given** 名單 `stage` 已更新為 `'ready'`
- **When** 部長或處長進入準備完成查詢摘要頁（F088 / US-118）
- **Then** 該名單出現於準備完成清單，可查看完整摘要

### AC-6：月跑執行中禁止核准

- **Given** `assignment_run.status IN ('pending', 'running')`
- **When** 部長 / Admin 嘗試點擊「核准」
- **Then** 按鈕為 disabled，hover 顯示「分派執行中，無法核准名單」
- **And** 若直接呼叫 API，回 409 `ASSIGNMENT_RUN_ALREADY_RUNNING`

### AC-7：非 `approval` 階段拒絕核准

- **Given** 名單 `stage` 為其他階段
- **When** 呼叫 POST `/api/v1/assignment/lists/{listNo}/stage/approve`
- **Then** 後端回 422 `LIST_STAGE_TRANSITION_FORBIDDEN`，附說明「目前階段為 {currentStage}，不可核准」

### AC-8：處長無核准權限

- **Given** 帳號僅持有「處長」角色
- **When** 嘗試呼叫核准 API
- **Then** 後端回 403 `AUTH_FORBIDDEN`
- **And** 清單頁無「核准」按鈕

### AC-9：歷史月份拒絕核准

- **Given** 名單 `project_workym < current_work_ym`
- **When** 部長嘗試核准
- **Then** 回 403 `LIST_HISTORICAL_READONLY`

### AC-10：稽核日誌

- **Given** 任一核准成功
- **When** 寫入完成
- **Then** `assignment_audit_log` 新增一筆 `action = 'STAGE_ADVANCE'`，含 before/after stage、operator_id、timestamp（v1.2.1 修正：對齊 entity enum）
- **And** **不**寫入 `assignment_approval` 表（real code 行為；詳見 §6.X 補述 / 設計現況差距 flag）

## 5. API 規格

### 5.1 POST /api/v1/assignment/lists/{listNo}/stage/approve

| 用途 | 將指定名單由簽核階段核准至準備完成 |
|---|---|
| 認證 | JWT 必填 |
| 權限 | `DirectorGuard` |

**Request Body**：（無 body 或可選 `{ "comment": "可選備註" }`）

**Response — 200 OK**

```json
{
  "listNo": "OB202605001",
  "previousStage": "approval",
  "currentStage": "ready",
  "approvedAt": "2026-05-15T13:00:00Z",
  "approvedBy": "user-uuid-xxx"
}
```

**錯誤代碼**

| HTTP | 錯誤碼 | 說明 |
|---|---|---|
| 401 | AUTH_TOKEN_MISSING / AUTH_TOKEN_EXPIRED | 未登入或 Token 過期 |
| 403 | AUTH_FORBIDDEN | 處長嘗試核准 |
| 403 | LIST_HISTORICAL_READONLY | 歷史月份 |
| 404 | ASSIGNMENT_LIST_NOT_FOUND | `list_no` 不存在 |
| 409 | ASSIGNMENT_RUN_ALREADY_RUNNING | 月跑進行中 |
| 422 | ASSIGNMENT_LIST_INACTIVE | 名單已停用 |
| 422 | LIST_STAGE_TRANSITION_FORBIDDEN | `stage != 'approval'` |
| 503 | FEATURE_NOT_ENABLED | Feature Flag `ENABLE_E07_REFACTOR_PHASE3 = false` |

## 6. 業務規則

| 規則編號 | 說明 |
|---|---|
| BR-1 | **`stage = 'approval'` 限制**：僅此階段可核准；透過 `StageTransitionService.assertStageEquals(listNo, 'approval')` 統一檢查 |
| BR-2 | **角色矩陣（I-7）**：本端點限 `admin` 或 `business_role = 'director'`；處長一律 403 |
| BR-3 | **歷史月份攔截**：`project_workym < current_work_ym` 回 403 `LIST_HISTORICAL_READONLY`（沿用 F077 BR-3） |
| BR-4 | **設定資料保留**：核准操作僅更新 `stage`，不動其他欄位（篩選條件 / `ob_dept_pct` / `ob_empl_set` / CR 開關全部保留） |
| BR-5 | **無獨立 Rollback**：簽核階段不提供「Rollback」按鈕；退回機制由拒絕（F087）提供，將名單退回 `personnel_ratio` 並清空處長設定；`ready` 狀態之退回由 F089 提供（Rollback 至 approval） |
| BR-6 | **稽核失敗不 rollback**：稽核寫入失敗僅 Logger.error，不 rollback 業務 commit（沿用 F050 v2.0 BR-11） |
| BR-7 | **DB 操作原子性**：`stage` 更新 + 稽核寫入須於同一 transaction 中執行（[ASSUMPTION] 待 system-architect 決議） |
| BR-8 | **月跑並發守衛（v1.1 / 決議 #6）**：F086 service method 入口層呼叫 `await this.assignmentRunGuardService.assertNoRunningRun()` |
| BR-9 | **Feature Flag fallback（v1.1 / 決議 #2）**：F086 端點受 `FeatureFlagGuard` 保護；`ENABLE_E07_REFACTOR_PHASE3 = false` 時回 503 + `FEATURE_NOT_ENABLED` |
| BR-10 | **核准後 ready 名單可由 F089 退回**：核准後若需修改，部長可透過 F089 將 `ready` 退回 `approval`，再透過 F087 拒絕退回 `personnel_ratio` |

### 6.X 核准記錄之資料寫入範式（v1.2.1 新增 / D1 follow-up / real code 行為對照）

> Source-of-truth：`apps/api/src/modules/assignment-stage/stage-action.service.ts:254-279` `approveToReady()` 方法 + `apps/api/src/modules/assignment/services/stage-transition.service.ts:77-93` `advanceTo()` helper。

**Real code 行為**：F086 核准操作於同一 DB transaction 內僅執行兩個 DB write：

1. `UPDATE ob_list_definition SET stage = 'ready' WHERE list_no = :listNo`
2. `INSERT INTO assignment_audit_log` 一筆（由 `StageTransitionService.advanceTo()` 統一寫入）：
   - `action = 'STAGE_ADVANCE'`（VARCHAR(30)，對齊 entity union）
   - `entity_type = 'list_definition'`
   - `entity_id = list_no`
   - `actor_id = currentUserId`
   - `after_value = { fromStage: 'approval', toStage: 'ready' }`

**Real code **不**寫入** `assignment_approval` 表**：

- `stage-action.service.ts:254-279` 之 `approveToReady()` 未呼叫 `assignment_approval.insert`；對照 `rejectToPersonnelRatio()`（行 284-356）顯式呼叫 `mgr.insert(AssignmentApproval, ...)`（行 333-343）
- 結果：`assignment_approval` 表在 production 環境理論上**只會累積 `action='reject'` 紀錄**，不會有 `action='approve'` 紀錄
- 影響範圍：
  - F082 v1.1 latestRejection banner 透過 `assignment_approval WHERE action='reject'` 查詢觸發，**不**受 F086 寫入缺失影響（仍可正確顯示最新拒絕原因）
  - 若 UI 需顯示「上一次核准者 / 核准時間」資訊，現況**無法**從 `assignment_approval` 查得；僅能從 `assignment_audit_log WHERE action='STAGE_ADVANCE' AND after_value->>'toStage' = 'ready'` 反推

**設計現況 vs spec 預期差距 flag**：

- v2.2.1 follow-up flag 與本次 D1 修正 task 之 user 指示原本預期 F086 採「雙寫範式」（同 F087 reject 之 audit_log + assignment_approval 雙寫）；但 real code 僅單寫 audit log
- 本 v1.2.1 **不變更 code**，僅對齊 spec 至 real flow；若 PM 確認 F086 應補寫 `assignment_approval.action='approve'`（含 `approver_name` / `approved_at` / `approver_role`），需開新一輪 spec + code 變更（屬未來 enhancement）
- 建議追蹤 issue：F086 是否補雙寫 — 屬 future decision，本 v1.2.1 不規範

## 7. UI/UX 需求

- **「核准」按鈕**：
  - 位於 F048 / F077 清單頁「簽核」階段名單操作欄，與「拒絕」並排
  - 處長身份**完全不渲染**
  - 已停用 / 非 `approval` 階段 / 歷史月份**完全不渲染**
  - 月跑進行中 disabled + hover 提示
- **核准前摘要面板**（建議）：
  - 顯示完整設定摘要：篩選條件、部門比例（含 RATION）、個別業務比例（每部門業務員 RATION）、CR 開關
  - 摘要為唯讀，無修改入口
- **確認對話框**：
  - 標題：「核准確認」
  - 內容：「確認核准名單『{listNm}』（{listNo}）？核准後名單將進入準備完成階段，可用於月跑。」
  - 按鈕：「確認核准」（primary）/「取消」
- **成功提示 toast**：「名單『{listNm}』已核准，進入準備完成階段」
- **核准後狀態**：清單頁該名單階段標籤更新為「準備完成」，操作欄顯示「退回簽核」（F089 提供）

## 8. 依賴關係

- **Blocked By**：
  - F084（推進至簽核，產生 `stage = 'approval'` 名單）
  - F048 v2.0 / F077（M01 入口骨架 + 角色 × 階段操作矩陣）
- **Blocks**：
  - F088（準備完成階段查詢摘要，核准後名單可見）
  - F061 / F081（月跑觸發，依賴 `stage = 'ready'` 名單）
- **Rollback 反向**：
  - F087（拒絕，退回至 personnel_ratio）
  - F089（準備完成 Rollback 至簽核）

## 9. 交叉參照

- **權限矩陣**：[F002 §4.6 E07 角色矩陣](F002-user-login.md#e07-角色矩陣)
- **資料模型**：
  - [data-model.md#ob-list-definition](../data-model.md#ob_list_definition)（`stage` 欄位）
  - [data-model.md#current-work-ym-rule](../data-model.md#current-work-ym-rule)
- **錯誤代碼**：
  - [error-handling.md#assignment-stage-transition-errors](../error-handling.md#assignment-stage-transition-errors)
  - [error-handling.md#assignment-role-errors](../error-handling.md#assignment-role-errors)
- **架構決議**：AD-E07-1、`StageTransitionService` helper（沿用 F079 §12 A-1）
- **相關功能**：
  - [F084](F084-advance-to-approval.md)（推進至簽核，本 Feature 前置）
  - [F087](F087-reject-list.md)（拒絕，反向操作之一）
  - [F088](F088-ready-list-summary.md)（準備完成查詢摘要）
  - [F089](F089-rollback-to-approval.md)（準備完成 Rollback 至簽核）
  - [F077](F077-month-switch-and-stage-overview.md)（M01 入口）
- **圖表**：
  - [diagrams/F086-approve-flow.mmd](../diagrams/F086-approve-flow.mmd)（核准流程）
  - [diagrams/F077-stage-overview.mmd](../diagrams/F077-stage-overview.mmd)

## 10. 測試覆蓋目標

- 單元測試覆蓋率 ≥ 80%
- 後端關鍵測試案例：
  - 部長核准 `stage = 'approval'` 名單 → 200 OK，stage 更新為 `'ready'`，稽核寫入
  - Admin 核准 → 200 OK
  - 處長核准 → 403 `AUTH_FORBIDDEN`
  - 核准 `stage = 'draft'` / `'dept_ratio'` / `'personnel_ratio'` / `'ready'` 名單 → 422 `LIST_STAGE_TRANSITION_FORBIDDEN`
  - 月跑進行中核准 → 409 `ASSIGNMENT_RUN_ALREADY_RUNNING`
  - 歷史月份核准 → 403 `LIST_HISTORICAL_READONLY`
  - Feature Flag 關閉時核准 → 503 `FEATURE_NOT_ENABLED`
  - 已停用名單核准 → 422 `ASSIGNMENT_LIST_INACTIVE`
  - 稽核 `before_value` / `after_value` 含 stage 轉換完整資訊
  - 設定資料保留：核准前後 `ob_dept_pct` / `ob_empl_set` / 篩選條件 row 數不變
- 前端關鍵測試案例：
  - 處長 / 非 `approval` 階段 / 已停用 / 歷史月份「核准」按鈕**完全不渲染**
  - 確認對話框文案 / 按鈕渲染
  - 月跑進行中按鈕 disabled
- E2E：F084 推進至 approval → F086 核准 → F088 準備完成清單顯示

## 11. 實作 Checklist

- [ ] 後端新增 `POST /api/v1/assignment/lists/{listNo}/stage/approve` 端點 + Service
- [ ] 後端套 `DirectorGuard` + `StageTransitionService.assertStageEquals(listNo, 'approval')` + `LIST_HISTORICAL_READONLY` Guard + `AssignmentRunGuardService.assertNoRunningRun()` + `FeatureFlagGuard`
- [ ] 後端 stage 更新與稽核寫入於同一 transaction
- [ ] 前端「核准」按鈕渲染條件
- [ ] 前端核准前摘要面板（含完整設定）
- [ ] 前端確認對話框
- [ ] 圖表：[diagrams/F086-approve-flow.mmd](../diagrams/F086-approve-flow.mmd)
- [ ] 整合測試：F084 → F086 → F088 路徑驗證

## 12. 假設

| # | 假設 | 標記 |
|---|---|---|
| A-1 | **`StageTransitionService` 共用 helper**：本 spec 透過 `StageTransitionService.advanceTo(listNo, 'ready')` 與 `assertStageEquals(listNo, 'approval')` 執行；helper 設計沿用 F079 §12 A-1 | [ASSUMPTION] 待 system-architect |
| A-2 | **核准備註欄位（comment）**：MVP 不要求填寫；保留欄位於 API request schema 但設為 optional；未來可擴充至稽核 `metadata` 欄 | [ASSUMPTION] 待 PO |
| A-3 | **核准後通知**：核准後是否觸發 email / 站內通知通知處長，MVP 不實作；待 OQ-E07-25 決議 | [ASSUMPTION] 待 PO |
| A-4 | **Feature Flag gating 範圍**：F086 與 F079 / F080 / F081 / F084 / F085 / F087 / F089 同屬 `ENABLE_E07_REFACTOR_PHASE3` flag gating；關閉時整批回 503 | [ASSUMPTION] 沿用 F050 v2.0 §13.2 |

## 13. 變更紀錄

| 版本 | 日期 | 變更內容 |
|---|---|---|
| v1.0 | 2026-05-15 | 初版（取代 US-116，E07 補修批次 4）：限 `stage = 'approval'` 核准；限部長 + Admin（`DirectorGuard`）；新增 `APPROVE` action 至稽核；定義與 F087 / F089 之關係 |
| v1.1 | 2026-05-16 | **Phase 1 風險決議落地**：(1) 決議 #6：BR-8 補「`assertNoRunningRun()` 由 `AssignmentRunGuardService` 集中實現」；(2) 決議 #2：新增 BR-9 Feature Flag fallback（503 + `FEATURE_NOT_ENABLED`） |
| v1.2 | 2026-05-16 | **救援重寫**：前一輪編碼事故損毀本檔內容，依 US-116 + AD-E07 v3.0 一致性決議完整重建；保留 v1.0 / v1.1 所有設計決議 |
| v1.2.1 | 2026-05-21 | **Phase 5 TDD code drift 修正（D1 follow-up）**：(1) 對齊 `AssignmentAuditLog.action` entity enum — 將 spec 內 `action = 'APPROVE'` 字串修正為 `action = 'STAGE_ADVANCE'`（AC-4 / AC-10），entity union 不含 `APPROVE`；real flow 經 `StageTransitionService.advanceTo()` 統一寫入；(2) 新增 §6.X 核准記錄之資料寫入範式：明列 real code 只單寫 audit log，**不**寫 `assignment_approval`（與 F087 拒絕之雙寫不對稱），含設計現況 vs spec 預期之差距 flag。不變動業務邏輯 / API endpoint / Transaction / Guard |
