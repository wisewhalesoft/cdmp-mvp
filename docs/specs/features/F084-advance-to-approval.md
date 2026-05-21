---
spec-id: F084
title: 個別業務比例設定階段推進至簽核
feature-id: F084
source-story: US-114
epic: E07
module: M03b 個別業務比例設定階段（推進至 M03c）
priority: P0-MVP
version: "1.2.1"
date: 2026-05-21
status: Draft
---

# F084: 個別業務比例設定階段推進至簽核

Priority: P0-MVP | Status: Draft | Last Updated: 2026-05-21

> **v1.2.1（2026-05-21 / Phase 5 TDD code drift 修正 D1 follow-up）**：對齊 `AssignmentAuditLog.action` entity enum（`apps/api/src/database/entities/assignment-audit-log.entity.ts:26-39`）：將 spec 內 `action = 'STAGE_ADVANCE'` 字串修正為 **`action = 'STAGE_ADVANCE'`**（entity 實際 enum 為 `STAGE_ADVANCE`，VARCHAR(30)）；real flow 經 `StageTransitionService.advanceTo()` 統一寫入。不變動 entity / migration / code / prototype；不變更其他 BR / AC / 業務邏輯。
>
> **v1.2 救援重寫（2026-05-16）**：前一輪編碼事故損毀本檔內容，依 US-114 + AD-E07 v3.0 一致性決議完整重建；Guard 為 `DirectorOrSectionChiefGuard`（處長亦可推進，前提是「所有部門均完成設定」）；業務角色欄位 `business_role`；JWT claim `businessRole`；保留 v1.0 / v1.1 所有設計決議。
> **v1.1 修訂（2026-05-16 / Phase 1 決議落地）**：月跑並發守衛集中至 `AssignmentRunGuardService.assertNoRunningRun()`（決議 #6）；Feature Flag fallback 503 + `FEATURE_NOT_ENABLED`（決議 #2）。

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + `data-model.md#ob-list-definition` + `data-model.md#ob-empl-set-obemplsetmf--人員比例設定` + `data-model.md#ob-emphire-obemphire--員工主檔` + `error-handling.md#assignment-stage-transition-errors` + `error-handling.md#assignment-ratio-errors` + `error-handling.md#assignment-role-errors` |
| QA / Tester | 本文件 + `error-handling.md#assignment-stage-transition-errors` |
| UI/UX Designer | 本文件 §7 |
| Architect | 本文件 + `architecture-spec.md` §3.10 `StageTransitionService` |

---

## 對應 User Story

- 來源 Story：[US-114-M03b-advance-to-approval.md](../../stories/epics/E07-app-customer-list-assignment/US-114-M03b-advance-to-approval.md)
- Epic：[E07 — 客戶名單分派](../../stories/epics/E07-app-customer-list-assignment/epic-brief.md)
- 模組：M03b 個別業務比例設定階段（推進至 M03c 簽核階段）

---

## 1. 功能摘要

部長 / Admin / 處長對 `stage = 'personnel_ratio'` 名單執行推進，使 `stage` 由 `'personnel_ratio'` 推進至 `'approval'`。處長亦可觸發推進，前提是**所有部門均完成設定**（每部門業務員 RATION 加總 = 100%）。

**範圍**：
- 僅 `stage = 'personnel_ratio'` 名單可推進；非此階段一律 422 `LIST_STAGE_TRANSITION_FORBIDDEN`
- 推進前置條件：每個有在職員工的部門，業務員 RATION 加總 = 100%（容忍 ±0.01%）
- 推進後個別業務比例（`ob_empl_set`）鎖定，後端依 `stage != 'personnel_ratio'` 拒絕寫入

**Actor**：
- **部長 + Admin**：可不受轄區限制推進任何名單
- **處長**：可推進，但所有部門均需完成設定；若仍有部門未完成（含本部門以外其他處長轄區），推進回 422

## 2. 使用者故事

**As a** 部長 / Admin（處長亦可，前提是所有部門均完成設定）
**I want** 在確認所有部門的個別業務比例均完成設定後，將名單推進至「簽核」階段
**So that** 流程進入第四階段，等待部長正式核准

## 3. 前置條件

- 使用者持 JWT 且 `business_role IN ('director', 'section_chief')` 或 admin
- 目標 `list_no` 存在，`status = 'active'`，`stage = 'personnel_ratio'`
- `ob_emphire` 中各部門均有 ≥ 1 筆 `resign_date IS NULL` 員工
- 每部門之 `ob_empl_set` RATION 加總 = 100%（容忍 ±0.01%；沿用 I-8）
- `project_workym >= current_work_ym`
- `assignment_run` 無 `status IN ('pending', 'running')` 紀錄

## 4. 驗收標準

### AC-1：推進按鈕顯示規則

- **Given** 名單 `stage = 'personnel_ratio'`
- **When** 部長 / Admin / 處長查看操作欄
- **Then** 部長 / Admin 看到「推進至簽核」按鈕（始終可點）
- **And** 處長若本部門業務員比例已設定完成，亦看到「推進至簽核」按鈕；若本部門尚未完成，按鈕為 disabled 並 hover 提示「本部門業務員比例尚未設定完成」

### AC-2：推進前置條件驗證（所有部門均完成）

- **Given** 任意角色點擊「推進至簽核」
- **When** 系統驗證每個有在職員工的部門 RATION 加總是否 = 100%
- **Then** 若仍有部門加總 ≠ 100%（或無紀錄），回 422 `STAGE_ADVANCE_PRECONDITION_FAILED`，附訊息「以下部門的個別業務比例尚未完成設定：{deptName_1}、{deptName_2}…，請完成後再推進」
- **And** 前置條件通過後彈出確認對話框

### AC-3：確認推進對話框

- **Given** 前置條件驗證通過
- **When** 系統彈出確認對話框
- **Then** 對話框顯示：「確認將名單『{listNm}』（{listNo}）推進至簽核階段？推進後個別業務比例將鎖定，無法再修改（如需修改請先 Rollback）。」
- **And** 提供「確認推進」與「取消」兩個按鈕

### AC-4：執行推進

- **Given** 使用者點擊「確認推進」
- **When** 後端處理請求（POST `/api/v1/assignment/lists/{listNo}/stage/advance-to-approval`）
- **Then** 系統更新 `ob_list_definition.stage` 由 `'personnel_ratio'` 為 `'approval'`
- **And** 寫入 `assignment_audit_log`（`action = 'STAGE_ADVANCE'`、before/after stage、operator_id）
- **And** 頁面顯示成功提示「名單『{listNm}』已推進至簽核階段，等待部長核准」，清單刷新

### AC-5：無代理處長時部長可代推進

- **Given** 某部門無對應處長帳號（或處長未指派），業務員比例由部長代設
- **When** 部長確認所有部門均完成並推進
- **Then** 系統允許推進，不因「處長帳號缺失」而阻擋

### AC-6：處長推進但有其他部門未完成被阻擋

- **Given** 處長 A（轄區 XTC0）已完成本部門設定，但部門 XTD0 尚未完成
- **When** 處長 A 點擊「推進至簽核」
- **Then** 後端回 422 `STAGE_ADVANCE_PRECONDITION_FAILED`，附訊息「所有部門均需完成設定才可推進；以下部門尚未完成：XTD0」

### AC-7：月跑執行中禁止推進

- **Given** `assignment_run.status IN ('pending', 'running')`
- **When** 任意角色嘗試推進
- **Then** 推進按鈕為 disabled，hover 顯示「分派執行中，無法推進」
- **And** 若直接呼叫 API，回 409 `ASSIGNMENT_RUN_ALREADY_RUNNING`

### AC-8：推進後個別業務比例不可修改

- **Given** 名單 `stage = 'approval'`
- **When** 部長嘗試呼叫 PUT `/api/v1/assignment/ratios/personnel/{listNo}`（F082）
- **Then** 後端回 422 `LIST_STAGE_TRANSITION_FORBIDDEN`

### AC-9：歷史月份拒絕推進

- **Given** 名單 `project_workym < current_work_ym`
- **When** 任意角色嘗試推進
- **Then** 回 403 `LIST_HISTORICAL_READONLY`

### AC-10：稽核日誌

- **Given** 任一推進成功
- **When** 寫入完成
- **Then** `assignment_audit_log` 新增一筆 `action = 'STAGE_ADVANCE'`，含 before/after stage、operator_id、timestamp、operator_role

## 5. API 規格

### 5.1 POST /api/v1/assignment/lists/{listNo}/stage/advance-to-approval

| 用途 | 將指定名單由個別業務比例設定推進至簽核 |
|---|---|
| 認證 | JWT 必填 |
| 權限 | `DirectorOrSectionChiefGuard`（admin / director / section_chief 皆可）|

**Request Body**：（無 body）

**Response — 200 OK**

```json
{
  "listNo": "OB202605001",
  "previousStage": "personnel_ratio",
  "currentStage": "approval",
  "advancedAt": "2026-05-15T13:00:00Z",
  "advancedBy": "user-uuid-xxx",
  "advancedByRole": "section_chief"
}
```

**錯誤代碼**

| HTTP | 錯誤碼 | 說明 |
|---|---|---|
| 401 | AUTH_TOKEN_MISSING / AUTH_TOKEN_EXPIRED | 未登入或 Token 過期 |
| 403 | AUTH_FORBIDDEN | 非 admin / director / section_chief 任一身份 |
| 403 | LIST_HISTORICAL_READONLY | 歷史月份 |
| 404 | ASSIGNMENT_LIST_NOT_FOUND | `list_no` 不存在 |
| 409 | ASSIGNMENT_RUN_ALREADY_RUNNING | 月跑進行中 |
| 422 | ASSIGNMENT_LIST_INACTIVE | 名單已停用 |
| 422 | LIST_STAGE_TRANSITION_FORBIDDEN | `stage != 'personnel_ratio'` |
| 422 | STAGE_ADVANCE_PRECONDITION_FAILED | 仍有部門未完成（response 含 `incompleteDepts: ['XTD0', ...]`） |
| 503 | FEATURE_NOT_ENABLED | Feature Flag 關閉 |

## 6. 業務規則

| 規則編號 | 說明 |
|---|---|
| BR-1 | **`stage = 'personnel_ratio'` 限制**：透過 `StageTransitionService.assertStageEquals(listNo, 'personnel_ratio')` 統一檢查 |
| BR-2 | **前置條件：所有部門加總 = 100%**：對每個 `ob_emphire` 在職部門驗證 `ob_empl_set` RATION 加總；任一部門加總 ≠ 100% 或無紀錄 → 422 `STAGE_ADVANCE_PRECONDITION_FAILED`；response 含 `incompleteDepts` 陣列 |
| BR-3 | **角色矩陣（I-7 變體）**：本端點為 M03b 階段唯一可由處長觸發之推進；後端 Guard 為 `DirectorOrSectionChiefGuard`（admin / director / section_chief 皆通過）；處長無轄區限制（因前置條件已驗證所有部門完成） |
| BR-4 | **歷史月份攔截**：沿用 F077 BR-3 |
| BR-5 | **推進後個別業務比例鎖定**：後端依 `stage != 'personnel_ratio'` 拒絕 `ob_empl_set` 寫入（由 F082 PUT API 統一檢查） |
| BR-6 | **稽核失敗不 rollback**：沿用 F050 v2.0 BR-11；稽核 `metadata.operator_role` 紀錄推進者角色（`director` / `section_chief` / `admin`）以利後續追溯 |
| BR-7 | **DB 操作原子性**：`stage` 更新 + 稽核寫入須於同一 transaction |
| BR-8 | **全員離職部門處理**：若某部門 `ob_emphire` 無任何在職員工（`activeEmployeeCount === 0`），該部門 RATION 加總可 = 0%（沿用 F082 v1.3 全員離職分支）；不阻擋推進 |
| BR-9 | **月跑並發守衛（v1.1 / 決議 #6）**：F084 service method 入口層呼叫 `await this.assignmentRunGuardService.assertNoRunningRun()` |
| BR-10 | **Feature Flag fallback（v1.1 / 決議 #2）**：F084 端點受 `FeatureFlagGuard` 保護；flag = false 時回 503 `FEATURE_NOT_ENABLED` |

## 7. UI/UX 需求

- **「推進至簽核」按鈕**：
  - 位於 F048 / F077 清單頁個別業務比例階段名單操作欄
  - 部長 / Admin：始終顯示
  - 處長：顯示，但本部門未完成時 disabled + hover 提示「本部門業務員比例尚未設定完成」
  - 已停用 / 非 `personnel_ratio` 階段 / 歷史月份**完全不渲染**
  - 月跑進行中 disabled + hover 提示
- **確認對話框**：
  - 標題：「推進確認」
  - 內容：「確認將名單『{listNm}』（{listNo}）推進至簽核階段？推進後個別業務比例將鎖定，無法再修改（如需修改請先 Rollback）。」
  - 按鈕：「確認推進」（primary）/「取消」
- **未完成部門列示**（前置條件失敗時）：
  - Modal 顯示「以下部門的個別業務比例尚未完成設定：{deptName_1}、{deptName_2}…」
  - 提供「我知道了」按鈕關閉
- **成功提示 toast**：「名單『{listNm}』已推進至簽核階段，等待部長核准」
- **推進後狀態**：清單頁該名單階段標籤更新為「簽核」，操作欄顯示「核准」（F086）+「拒絕」（F087）

## 8. 依賴關係

- **Blocked By**：
  - F082（個別業務比例設定，產生 `ob_empl_set` 紀錄）
  - F079 / F080（部門比例 + 推進至個別業務比例階段）
  - F048 v2.0 / F077（M01 入口骨架 + 角色 × 階段操作矩陣）
- **Blocks**：
  - F086（核准，產生 `stage = 'approval'` 名單後可核准）
  - F087（拒絕，產生 `stage = 'approval'` 名單後可拒絕）
- **Rollback 反向**：
  - F085（個別業務比例 Rollback 至部門比例，可在推進前 Rollback）
  - F087（拒絕 = 簽核退回個別業務比例，清空處長設定）

## 9. 交叉參照

- **權限矩陣**：[F002 §4.6 E07 角色矩陣](F002-user-login.md#e07-角色矩陣)
- **資料模型**：
  - [data-model.md#ob-list-definition](../data-model.md#ob_list_definition)
  - [data-model.md#ob-empl-set-obemplsetmf--人員比例設定](../data-model.md#ob_empl_setobemplsetmf--人員比例設定)
  - [data-model.md#ob-emphire-obemphire--員工主檔](../data-model.md#ob_emphireobemphire--員工主檔)
  - [data-model.md#current-work-ym-rule](../data-model.md#current-work-ym-rule)
- **錯誤代碼**：
  - [error-handling.md#assignment-stage-transition-errors](../error-handling.md#assignment-stage-transition-errors)
  - [error-handling.md#assignment-ratio-errors](../error-handling.md#assignment-ratio-errors)
  - [error-handling.md#assignment-role-errors](../error-handling.md#assignment-role-errors)
- **架構決議**：AD-E07-1、`StageTransitionService` helper（沿用 F079 §12 A-1）
- **相關功能**：
  - [F082](F082-set-personnel-ratio.md)（個別業務比例設定，本 Feature 前置）
  - [F085](F085-rollback-to-dept-ratio.md)（個別業務比例 Rollback 至部門比例）
  - [F086](F086-approve-to-ready.md)（核准，本 Feature 後續）
  - [F087](F087-reject-list.md)（拒絕，本 Feature 後續反向）
  - [F077](F077-month-switch-and-stage-overview.md)（M01 入口）
- **圖表**：
  - [diagrams/F084-advance-flow.mmd](../diagrams/F084-advance-flow.mmd)
  - [diagrams/F077-stage-overview.mmd](../diagrams/F077-stage-overview.mmd)

## 10. 測試覆蓋目標

- 單元測試覆蓋率 ≥ 80%
- 後端關鍵測試案例：
  - 部長推進（所有 3 部門加總 = 100%）→ 200 OK，stage 更新為 `'approval'`，稽核寫入
  - Admin 推進 → 200 OK
  - 處長 A 推進（所有部門完成）→ 200 OK
  - 處長 A 推進但 XTD0 未完成 → 422 `STAGE_ADVANCE_PRECONDITION_FAILED`，response 含 `incompleteDepts: ['XTD0']`
  - 部長推進但任一部門加總 = 80% → 422 `STAGE_ADVANCE_PRECONDITION_FAILED`
  - 全員離職部門加總 = 0% → 不阻擋推進（BR-8）
  - 推進 `stage = 'draft'` / `'dept_ratio'` / `'approval'` / `'ready'` 名單 → 422 `LIST_STAGE_TRANSITION_FORBIDDEN`
  - 月跑進行中 → 409 `ASSIGNMENT_RUN_ALREADY_RUNNING`
  - 歷史月份 → 403 `LIST_HISTORICAL_READONLY`
  - Feature Flag 關閉 → 503 `FEATURE_NOT_ENABLED`
  - 推進後嘗試 PUT 個別業務比例 → 422 `LIST_STAGE_TRANSITION_FORBIDDEN`
  - 稽核 `metadata.operator_role` 紀錄推進者角色
- 前端關鍵測試案例：
  - 處長本部門未完成時按鈕 disabled
  - 部長 / Admin 始終顯示按鈕
  - 非 `personnel_ratio` 階段 / 已停用 / 歷史月份按鈕**完全不渲染**
  - 未完成部門列示 Modal
- E2E：F082 各部門設定加總 100% → F084 推進 → F086 核准

## 11. 實作 Checklist

- [ ] 後端新增 `POST /api/v1/assignment/lists/{listNo}/stage/advance-to-approval` 端點 + Service
- [ ] 後端套 `DirectorOrSectionChiefGuard` + `StageTransitionService.assertStageEquals(listNo, 'personnel_ratio')` + `RatioValidationService.assertAllDeptsSumEquals100(listNo)` + `LIST_HISTORICAL_READONLY` Guard + `AssignmentRunGuardService.assertNoRunningRun()` + `FeatureFlagGuard`
- [ ] 後端 stage 更新與稽核寫入於同一 transaction
- [ ] 前端「推進至簽核」按鈕渲染條件（含處長本部門未完成 disabled 邏輯）
- [ ] 前端確認對話框 + 未完成部門列示 Modal
- [ ] 圖表：[diagrams/F084-advance-flow.mmd](../diagrams/F084-advance-flow.mmd)
- [ ] 整合測試：F082 → F084 → F086 路徑驗證

## 12. 假設

| # | 假設 | 標記 |
|---|---|---|
| A-1 | **`StageTransitionService` 共用 helper**：本 spec 透過 `StageTransitionService.advanceTo(listNo, 'approval')` 與 `assertStageEquals(listNo, 'personnel_ratio')` 執行；helper 設計沿用 F079 §12 A-1 | [ASSUMPTION] 待 system-architect |
| A-2 | **`RatioValidationService.assertAllDeptsSumEquals100` 設計**：新增 method，接受 listNo，內部依 `ob_emphire` 在職部門遍歷檢查每部門 `ob_empl_set` 加總；全員離職部門早期短路 return（沿用 F082 v1.3 決議 #1） | [ASSUMPTION] 待 system-architect |
| A-3 | **處長推進操作稽核標記**：`assignment_audit_log.metadata.operator_role` 欄位用以區分由「處長代推」與「部長推進」；MVP 用 metadata JSONB 欄位承擔（避免 schema 變更） | [ASSUMPTION] 待 system-architect |
| A-4 | **Feature Flag gating 範圍**：F084 與 F078 / F079 / F080 / F081 / F085 / F086 / F087 / F089 同屬 `ENABLE_E07_REFACTOR_PHASE3` flag gating | 沿用 F050 v2.0 §13.2 |

## 13. 變更紀錄

| 版本 | 日期 | 變更內容 |
|---|---|---|
| v1.0 | 2026-05-15 | 初版（取代 US-114，E07 補修批次 4）：限 `stage = 'personnel_ratio'` 推進；Actor 新增處長（前提是所有部門完成）；Guard 為 `DirectorOrSectionChiefGuard`；前置條件「所有部門加總 = 100%」；response 含 `incompleteDepts` |
| v1.1 | 2026-05-16 | **Phase 1 風險決議落地**：(1) 決議 #6：BR-9 補「`assertNoRunningRun()` 由 `AssignmentRunGuardService` 集中實現」；(2) 決議 #2：新增 BR-10 Feature Flag fallback（503 + `FEATURE_NOT_ENABLED`） |
| v1.2 | 2026-05-16 | **救援重寫**：前一輪編碼事故損毀本檔內容，依 US-114 + AD-E07 v3.0 一致性決議完整重建；保留 v1.0 / v1.1 所有設計決議 |
| v1.2.1 | 2026-05-21 | **Phase 5 TDD code drift 修正（D1 follow-up）**：對齊 `AssignmentAuditLog.action` entity enum（`apps/api/src/database/entities/assignment-audit-log.entity.ts:26-39`）— 將 spec 全文之 `action = 'ADVANCE_STAGE'` 字串修正為 `action = 'STAGE_ADVANCE'`；real flow 經 `StageTransitionService.advanceTo()` 統一寫入。不變動業務邏輯 / API endpoint / Transaction / Guard |
