---
spec-id: F084
title: 個別業務比例設定階段「自動推進」至簽核（手動推進為 fallback）
feature-id: F084
source-story: US-114
epic: E07
module: M03b 個別業務比例設定階段（推進至 M03c）
priority: P0-MVP
version: "2.0.1"
date: 2026-05-25
status: Draft
---

# F084: 個別業務比例設定階段「自動推進」至簽核（手動推進為 fallback）

Priority: P0-MVP | Status: Draft | Last Updated: 2026-05-25

> **v2.0.1 修訂（2026-05-25 / AD-E07-19 落地）**：§5.2 / BR-13 / 降級表之競爭條件處理依 [AD-E07-19](../architecture-spec.md) **改採 blocking advisory lock**（以 `listNo` 為 key、`lock_timeout = 5000ms`），**推翻 v2.0 原 try-lock 降級假設**。並發第二筆 PUT 等待前一並發 tx commit 後取得 lock、再重新偵測 `stage` 判斷 idempotent；lock 等待逾時（>5s）→ 降級 no-op、不報 5xx。**Option B 寫入保留（AD-E07-19 §19.3.3）**：lock 超時 / no-op 降級時，PUT 之比例寫入（在 lock 取得之前完成）**保留、不 rollback**，tx 照常 commit。月跑 guard 行為不變（仍帶 `autoAdvanceFailReason`）。詳 §13 v2.0.1。
>
> **v2.0 改造重寫（2026-05-25 / 對應 US-114 v2.0 auto-advance 改造）**：個別業務比例（`personnel_ratio`）→ 簽核（`approval`）之推進由「**使用者手動點按按鈕**」改為「**F082 PUT `setPersonnelRatios` 成功後同一 transaction 內偵測所有部門完成即自動推進**」。手動 POST `advance-to-approval` endpoint **降為 fallback**（feature flag off 或 auto-advance 因月跑 guard / lock 超時跳過時使用）。
> - **主路徑（§5.2）**：F082 PUT 成功 → 同一 tx 內完成度偵測 → blocking advisory lock（以 `listNo` 為 key）序列化 → idempotent advance → 稽核寫入（皆同一 tx）。
> - **Fallback 路徑（§5.1）**：保留手動 POST endpoint，行為沿用 v1.2.1。
> - **Feature Flag**：新增 `ENABLE_E07_AUTO_ADVANCE_TO_APPROVAL`（prod 預設 **off**），只 gate「自動觸發」行為；既有 `ENABLE_E07_REFACTOR_PHASE3` 仍 gate 整個 P3 功能集（含手動 endpoint）。auto flag off + phase3 on → 退回 v1.x 手動推進行為（詳 §6 BR-16）。
> - **稽核**：auto-advance 沿用既有 `STAGE_ADVANCE` enum（**不擴 enum**），加 `metadata.auto_advanced_by_completion = true` 區分；手動 fallback 路徑不含此 metadata（詳 §6 BR-14）。
> - **容差**：完成度判斷沿用 ±0.01%（I-8 / F082 BR-2），未變動。
> - **降級行為（v2.0.1 對齊 AD-E07-19）**：取得 blocking lock 後 stage 已推進 → idempotent no-op；lock 等待逾時（>5s）→ 降級 no-op；兩者皆 PUT 200 + `autoAdvanced: false`、不帶 failReason、**比例寫入保留不 rollback**；月跑 guard 擋下 → PUT 200 + `autoAdvanced: false` + `autoAdvanceFailReason: "ASSIGNMENT_RUN_ALREADY_RUNNING"`、**不 rollback PUT**（詳 §6 BR-13 / BR-15）。
> - 不變動 entity / migration / code / test / prototype；blocking lock 機制（`pg_advisory_xact_lock` / lock key hash / transaction-scoped）詳 AD-E07-19（§12 A-5 已 Resolved）。
>
> **v1.2.1（2026-05-21 / Phase 5 TDD code drift 修正 D1 follow-up）**：對齊 `AssignmentAuditLog.action` entity enum（`apps/api/src/database/entities/assignment-audit-log.entity.ts:26-39`）：將 spec 內 `action = 'STAGE_ADVANCE'` 字串修正為 **`action = 'STAGE_ADVANCE'`**（entity 實際 enum 為 `STAGE_ADVANCE`，VARCHAR(30)）；real flow 經 `StageTransitionService.advanceTo()` 統一寫入。不變動 entity / migration / code / prototype；不變更其他 BR / AC / 業務邏輯。
>
> **v1.2 救援重寫（2026-05-16）**：前一輪編碼事故損毀本檔內容，依 US-114 + AD-E07 v3.0 一致性決議完整重建；Guard 為 `DirectorOrSectionChiefGuard`（處長亦可推進，前提是「所有部門均完成設定」）；業務角色欄位 `business_role`；JWT claim `businessRole`；保留 v1.0 / v1.1 所有設計決議。
> **v1.1 修訂（2026-05-16 / Phase 1 決議落地）**：月跑並發守衛集中至 `AssignmentRunGuardService.assertNoRunningRun()`（決議 #6）；Feature Flag fallback 503 + `FEATURE_NOT_ENABLED`（決議 #2）。

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + `F082-set-personnel-ratio.md` §5.2（auto-advance 觸發宿主 + response schema）+ `data-model.md#ob-list-definition` + `data-model.md#ob-empl-set-obemplsetmf--人員比例設定` + `data-model.md#ob-emphire-obemphire--員工主檔` + `error-handling.md#assignment-stage-transition-errors` + `error-handling.md#assignment-ratio-errors` + `error-handling.md#assignment-role-errors` |
| QA / Tester | 本文件 + `F082-set-personnel-ratio.md` §5.2 + `error-handling.md#assignment-stage-transition-errors` |
| UI/UX Designer | 本文件 §7 |
| Architect | 本文件（§5.2 / §6 BR-11~BR-16 / §12 A-5~A-7）+ `F082-set-personnel-ratio.md` §5.2 + `architecture-spec.md` §3.10 `StageTransitionService` |

---

## 對應 User Story

- 來源 Story：[US-114-M03b-advance-to-approval.md](../../stories/epics/E07-app-customer-list-assignment/US-114-M03b-advance-to-approval.md)
- Epic：[E07 — 客戶名單分派](../../stories/epics/E07-app-customer-list-assignment/epic-brief.md)
- 模組：M03b 個別業務比例設定階段（推進至 M03c 簽核階段）

---

## 1. 功能摘要

名單由個別業務比例（`stage = 'personnel_ratio'`）推進至簽核（`stage = 'approval'`）有兩條路徑：**自動推進（主路徑）** 與 **手動推進（fallback）**。

**主路徑 — Auto-Advance（系統自動推進）**：每筆業務員比例 PUT（F082 `setPersonnelRatios`）成功後，後端在**同一 transaction 內**執行完成度偵測；若所有有在職員工的部門 RATION 加總均 = 100%（容忍 ±0.01%，沿用 F082 BR-2 / I-8），系統自動將 `stage` 由 `'personnel_ratio'` 更新為 `'approval'`，無需使用者另行點擊推進按鈕或確認對話框。此路徑由 `ENABLE_E07_AUTO_ADVANCE_TO_APPROVAL` feature flag 控制（prod 預設 off）。

**Fallback 路徑 — 手動推進按鈕**：保留手動 POST `advance-to-approval` endpoint 作為備用，於下列情況使用：
- `ENABLE_E07_AUTO_ADVANCE_TO_APPROVAL` flag = off（退回 v1.x 手動推進行為）
- stage = `personnel_ratio` 且所有部門均已完成，但 auto-advance 因其他原因未觸發（如 auto-advance 偵測時遭月跑 guard 跳過）

**範圍**：
- 僅 `stage = 'personnel_ratio'` 名單可推進；非此階段一律 422 `LIST_STAGE_TRANSITION_FORBIDDEN`
- 推進前置條件：每個有在職員工的部門，業務員 RATION 加總 = 100%（容忍 ±0.01%）
- 推進後個別業務比例（`ob_empl_set`）鎖定，後端依 `stage != 'personnel_ratio'` 拒絕寫入

**Actor**：
- **系統（後端 auto-advance 機制）**：主路徑推進者；偵測 + 推進邏輯附著於 F082 PUT 之同一 transaction
- **處長（section_chief）**：業務員比例的主要寫入者；其 PUT 請求為 auto-advance 的觸發點；section_chief 仍是 PUT 的合法執行者
- **部長（director）+ Admin**：可跨轄區代寫業務員比例，其 PUT 同樣可觸發 auto-advance；於 fallback 路徑亦可不受轄區限制手動推進任何名單
- **觸發者識別**：「最後觸發 auto-advance 的寫入者」= 最後一個 PUT 且導致所有部門完成之操作者，其 user_id 即為稽核 `operator_id`；其角色寫入 `metadata.operator_role`

## 2. 使用者故事

**As a** 系統（後端 auto-advance 機制；處長 / 部長 / Admin 之 PUT 為觸發點）
**I want** 在最後一筆業務員比例 PUT 完成、偵測到所有部門均完成設定時，於同一 transaction 內自動將名單推進至「簽核」階段
**So that** 流程無需等待人工點擊確認即自動進入第四階段，確保簽核節點準時觸發且有完整稽核記錄

> Fallback 視角（手動路徑）：**As a** 部長 / Admin（處長亦可，前提是所有部門均完成設定）**I want** 在 auto-advance 未觸發時，手動將名單推進至「簽核」階段 **So that** 流程仍能進入第四階段。

## 3. 前置條件

### 3.1 Auto-Advance 觸發前置條件（主路徑）

- `ENABLE_E07_AUTO_ADVANCE_TO_APPROVAL` flag = on
- 觸發點：F082 PUT `setPersonnelRatios` 已於同一 transaction 內成功寫入
- 目標 `list_no` 存在，`status = 'active'`，`stage = 'personnel_ratio'`
- 偵測時每個有在職員工的部門之 `ob_empl_set` RATION 加總均 = 100%（容忍 ±0.01%；沿用 F082 BR-2 / I-8）；全員離職部門（`activeEmployeeCount === 0`）短路通過，不參與判斷（沿用 BR-12 / F082 BR-8）
- `project_workym >= current_work_ym`（歷史月份不觸發）
- `assignment_run` 無 `status IN ('pending', 'running')` 紀錄（月跑進行中則跳過 auto-advance、PUT 仍成功）

### 3.2 Fallback 手動推進前置條件

- 使用者持 JWT 且 `business_role IN ('director', 'section_chief')` 或 admin
- 目標 `list_no` 存在，`status = 'active'`，`stage = 'personnel_ratio'`
- `ob_emphire` 中各部門均有 ≥ 1 筆 `resign_date IS NULL` 員工（全員離職部門不阻擋；BR-8）
- 每部門之 `ob_empl_set` RATION 加總 = 100%（容忍 ±0.01%；沿用 I-8）
- `project_workym >= current_work_ym`
- `assignment_run` 無 `status IN ('pending', 'running')` 紀錄

## 4. 驗收標準

> **AC-1~AC-11 為主路徑（auto-advance）**，對齊 US-114 v2.0 AC-1~AC-11；**AC-12 為 fallback（手動推進）**，沿用 v1.2.1 手動行為。

### AC-1：Auto-Advance 觸發條件（主路徑）

- **Given** 名單 `stage = 'personnel_ratio'`，`ENABLE_E07_AUTO_ADVANCE_TO_APPROVAL` flag = on
- **When** 任一處長 / 部長 / Admin 成功執行 PUT 業務員比例（F082），且後端在同一 transaction 內偵測到**所有有在職員工的部門** RATION 加總均 = 100%（容忍 ±0.01%）
- **Then** 系統自動將名單 `stage` 由 `'personnel_ratio'` 更新為 `'approval'`，無需使用者另行操作
- **And** F082 PUT response 含 `autoAdvanced: true` 及 `newStage: "approval"` 欄位（response schema 見 [F082 §5.2](F082-set-personnel-ratio.md#52-put-apiv1assignmentratiospersonnellistno)）

### AC-2：Auto-Advance 稽核記錄

- **Given** auto-advance 成功觸發
- **When** stage 更新完成，稽核寫入於同一 transaction 內完成
- **Then** `assignment_audit_log` 新增一筆，含：
  - `action = 'STAGE_ADVANCE'`（沿用既有 enum，**不擴 enum**）
  - `operator_id` = 觸發完成的最後一個 PUT 寫入者（處長 / 部長 / Admin）之 user_id
  - `before_payload.stage = 'personnel_ratio'`、`after_payload.stage = 'approval'`
  - `metadata.auto_advanced_by_completion = true`
  - `metadata.operator_role` = 觸發者角色（`section_chief` / `director` / `admin`）

### AC-3：PUT 部分完成時不觸發推進

- **Given** 名單 `stage = 'personnel_ratio'`，flag = on
- **When** 某處長執行 PUT，完成後仍有其他部門 RATION 加總 ≠ 100%
- **Then** PUT 正常回 200；response 含 `autoAdvanced: false`；stage 維持 `'personnel_ratio'`；系統不推進

### AC-4：競爭條件處理（兩處長幾乎同時 PUT）

- **Given** 兩個處長 A、B 幾乎同時對同一名單執行 PUT，兩筆 PUT 都可能導致所有部門完成
- **When** 後端收到兩筆並發請求
- **Then** 系統透過 advisory lock（以 `listNo` 為 key）將 auto-advance 偵測序列化，確保只有一筆請求實際執行推進
- **And** 第二筆進入時偵測到 `stage` 已為 `'approval'`，auto-advance 為 idempotent no-op，不重複寫稽核日誌
- **And** 兩筆 PUT 本身均回 200；先到者 response 含 `autoAdvanced: true`，後到者 `autoAdvanced: false`（因 stage 已推進；**不帶 `autoAdvanceFailReason`**）

### AC-5：Auto-Advance 因月跑 Guard 失敗，PUT 本身仍成功

- **Given** 名單 `stage = 'personnel_ratio'`，flag = on
- **When** 某 PUT 完成後所有部門均達到完成條件，但 auto-advance 在偵測時遇到月跑 guard 阻擋（`assignment_run.status IN ('pending', 'running')`）
- **Then** PUT 本身仍回 200，**不因 auto-advance 失敗而 rollback**
- **And** PUT response 含 `autoAdvanced: false`、`autoAdvanceFailReason: "ASSIGNMENT_RUN_ALREADY_RUNNING"`
- **And** stage 維持 `'personnel_ratio'`；前端顯示 toast「比例已儲存；因分派執行中，請待月跑完成後手動推進至簽核」

### AC-6：Auto-Advance 成功的使用者體驗

- **Given** flag = on，PUT 觸發 auto-advance 成功（`autoAdvanced: true`）
- **When** PUT response 返回前端
- **Then** 前端顯示 toast「名單『{listNm}』已自動推進至簽核階段，等待部長核准」
- **And** 前端 redirect 至名單列表，該名單階段標籤更新為「簽核」

### AC-7：Fallback 手動推進按鈕顯示條件

- **Given** 名單 `stage = 'personnel_ratio'` 且所有部門均已完成設定（`allDeptsCompleted = true`）
- **When** `ENABLE_E07_AUTO_ADVANCE_TO_APPROVAL` flag = off，**或** auto-advance 因其他原因未觸發（如 AC-5 月跑 guard 場景）
- **Then** 部長 / Admin 看到可點擊的「推進至簽核」按鈕；處長若本部門已完成亦看到該按鈕
- **And** 月跑進行中時，按鈕為 disabled，hover 顯示「分派執行中，無法推進」
- **And** 非 `personnel_ratio` 階段 / 已停用 / 歷史月份時，按鈕完全不渲染

### AC-8：Feature Flag Off — Auto-Advance 完全不執行

- **Given** `ENABLE_E07_AUTO_ADVANCE_TO_APPROVAL` = off
- **When** 任何處長 / 部長 / Admin 執行 PUT 業務員比例
- **Then** PUT response 不觸發 auto-advance（`autoAdvanced: false`）
- **And** stage 不自動更新；系統退回 v1.x 手動推進行為，前端顯示手動推進按鈕（若所有部門均完成）

### AC-9：無代理處長時部長代設並觸發推進

- **Given** 某部門無對應處長帳號（或未指派），業務員比例由部長代設
- **When** 部長完成最後一個部門的 PUT，auto-advance 偵測所有部門均完成
- **Then** 系統允許 auto-advance，不因「處長帳號缺失」而阻擋；稽核 `operator_id` 記錄代操部長，`metadata.operator_role = 'director'`

### AC-10：推進後個別業務比例不可修改

- **Given** 名單 `stage = 'approval'`（auto-advance 或手動推進後）
- **When** 任意角色嘗試呼叫 PUT 業務員比例（F082）
- **Then** 後端回 422 `LIST_STAGE_TRANSITION_FORBIDDEN`

### AC-11：歷史月份不觸發 Auto-Advance

- **Given** 名單 `project_workym < current_work_ym`
- **When** 任意 PUT 觸發 auto-advance 偵測
- **Then** auto-advance 不執行；手動推進 API（fallback）回 403 `LIST_HISTORICAL_READONLY`

### AC-12：Fallback 手動推進路徑（沿用 v1.2.1）

> 本 AC 描述手動 POST `advance-to-approval` endpoint 行為，適用於 AC-7 之 fallback 觸發情境。

- **Given** flag = off（或 auto-advance 未觸發）且名單 `stage = 'personnel_ratio'`
- **When** 部長 / Admin / 處長點擊「推進至簽核」按鈕並通過前置條件驗證後點擊「確認推進」
- **Then** 後端處理 POST `/api/v1/assignment/lists/{listNo}/stage/advance-to-approval`：
  1. 驗證每個有在職員工的部門 RATION 加總 = 100%；若仍有部門未完成，回 422 `STAGE_ADVANCE_PRECONDITION_FAILED`，response 含 `incompleteDepts: ['XTD0', ...]`，訊息「以下部門的個別業務比例尚未完成設定：{deptName_1}、{deptName_2}…，請完成後再推進」
  2. 通過後更新 `ob_list_definition.stage` 由 `'personnel_ratio'` 為 `'approval'`
  3. 寫入 `assignment_audit_log`（`action = 'STAGE_ADVANCE'`、before/after stage、operator_id、operator_role；**不含** `auto_advanced_by_completion` metadata）
- **And** 頁面顯示成功提示「名單『{listNm}』已推進至簽核階段，等待部長核准」，清單刷新
- **And** 處長若本部門已完成但其他部門未完成，回 422 `STAGE_ADVANCE_PRECONDITION_FAILED`（訊息「所有部門均需完成設定才可推進；以下部門尚未完成：XTD0」）
- **And** 月跑進行中直接呼叫 API → 409 `ASSIGNMENT_RUN_ALREADY_RUNNING`；歷史月份 → 403 `LIST_HISTORICAL_READONLY`；某部門無對應處長帳號由部長代推不阻擋（沿用 v1.2.1 AC-5）

## 5. API 規格

> **路徑總覽**：§5.2 Auto-Advance 為**主路徑**（無獨立 endpoint，附著於 F082 PUT）；§5.1 手動 POST 為 **fallback 路徑**。

### 5.1 (Fallback) POST /api/v1/assignment/lists/{listNo}/stage/advance-to-approval

> **本端點為 fallback 路徑**：於 `ENABLE_E07_AUTO_ADVANCE_TO_APPROVAL` flag = off，或 auto-advance 因月跑 guard 跳過時使用（詳 §5.2 / §6 BR-16）。主路徑見 §5.2。

| 用途 | 將指定名單由個別業務比例設定手動推進至簽核（fallback） |
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
| 503 | FEATURE_NOT_ENABLED | `ENABLE_E07_REFACTOR_PHASE3` Feature Flag 關閉（整個 P3 功能集停用；非 auto-advance flag） |

### 5.2 Auto-Advance 觸發流程（主路徑，無獨立 endpoint）

> **本流程無獨立 HTTP endpoint**：auto-advance 行為附著於 **F082 PUT `setPersonnelRatios`** 之同一 transaction；其結果透過 F082 PUT response 之 `autoAdvanced` / `newStage` / `autoAdvanceFailReason` 欄位回傳（schema 見 [F082 §5.2](F082-set-personnel-ratio.md#52-put-apiv1assignmentratiospersonnellistno)）。

**觸發條件**：`ENABLE_E07_AUTO_ADVANCE_TO_APPROVAL` flag = on 且 F082 PUT 業務員比例寫入成功。

**流程（皆於 F082 PUT 之同一 database transaction 內，行為層描述；實作細節依 [AD-E07-19](../architecture-spec.md)，§12 A-5~A-7）**：

> **前置（Option B 寫入保留）**：本流程於 F082 PUT 之 `ob_empl_set` 比例寫入**完成之後**才執行；auto-advance 任一降級或失敗皆**不 rollback 已完成的比例寫入**，tx 照常 commit（依 AD-E07-19 §19.3.3）。

1. **完成度偵測**：偵測該名單所有「有在職員工的部門」之 `ob_empl_set` RATION 加總是否均 = 100%（容忍 ±0.01%；沿用 F082 BR-2 / I-8）。全員離職部門（`activeEmployeeCount === 0`）短路通過，不參與判斷（BR-12 / F082 BR-8）。
   - 若任一部門尚未完成 → 不推進；PUT response `autoAdvanced: false`、`newStage: null`、不帶 `autoAdvanceFailReason`。
2. **競爭條件序列化（blocking advisory lock，依 AD-E07-19）**：以 `listNo` 為 key 取得 **blocking** advisory lock（若已有並發 tx 持有同一 key，則**等待**其 commit 後再取得），將並發 PUT 之 auto-advance 偵測序列化。
   - **取得 lock 後重新偵測 `stage`**：若 `stage` 已為 `'approval'`（代表先到的並發請求已完成推進）→ idempotent no-op、不重複寫稽核、PUT 回 200 + `autoAdvanced: false`、不帶 `autoAdvanceFailReason`。
   - **lock 等待逾時**（`lock_timeout = 5000ms`，5 秒內仍無法取得）→ 降級為 no-op、PUT 仍回 200 + `autoAdvanced: false`、不帶 `autoAdvanceFailReason`、不報 5xx；**已完成的比例寫入保留**（不 rollback）；使用者可再次 PUT 觸發，或改走手動 fallback（§5.1）。
3. **月跑 guard 檢查**：若偵測時 `assignment_run.status IN ('pending', 'running')` → 跳過推進、**不 rollback PUT**；PUT 回 200 + `autoAdvanced: false` + `autoAdvanceFailReason: "ASSIGNMENT_RUN_ALREADY_RUNNING"`。
4. **idempotent advance**：取得 lock 且重新偵測後 `stage` 仍為 `'personnel_ratio'`：
   - 透過 `StageTransitionService.advanceToInMgr(listNo, 'personnel_ratio', 'approval', actorId, mgr, { auto_advanced_by_completion: true, operator_role })` 更新 stage 為 `'approval'`（**走 F082 PUT 之同一 tx，傳入外部 `EntityManager`，不自開 tx**；依 AD-E07-19）；於同一 tx 寫入 `assignment_audit_log`（`action = 'STAGE_ADVANCE'` + `metadata.auto_advanced_by_completion = true` + `metadata.operator_role`）；PUT response `autoAdvanced: true`、`newStage: "approval"`。

**降級行為彙總**：

> 採 **blocking advisory lock**（依 AD-E07-19）：並發第二筆 PUT 會等待第一筆 commit 後取得 lock，再重新偵測 `stage`。所有情境下 PUT 比例寫入皆保留（Option B，不 rollback）。

| 偵測時情境 | stage 變化 | PUT HTTP | `autoAdvanced` | `newStage` | `autoAdvanceFailReason` | 說明 |
|---|---|---|---|---|---|---|
| flag = off | 不變 | 200 | `false` | `null` | （不帶） | auto-advance 完全不執行 |
| 部分部門未完成 | 不變 | 200 | `false` | `null` | （不帶） | 完成度未達標，不推進 |
| 所有部門完成、成功推進 | → `approval` | 200 | `true` | `"approval"` | （不帶） | 取得 lock 且 stage 仍 `personnel_ratio`，執行推進 + 稽核 |
| 並發第二筆 PUT（等待後取得 lock、stage 已 `approval`、idempotent no-op） | 不變（維持 `approval`） | 200 | `false` | `null` | （不帶） | 第二筆 PUT 的比例寫入保留；等第一筆 commit 後取得 lock，偵測 stage 已 `approval` → idempotent no-op、不重複寫稽核 |
| lock 等待逾時（>5s，`lock_timeout = 5000ms`） | 不變 | 200 | `false` | `null` | （不帶） | **比例已儲存（寫入在 lock 取得之前完成），auto-advance 未執行；不 rollback PUT；使用者可再次 PUT 觸發，或改走手動 fallback（§5.1）** |
| 月跑 guard 阻擋 | 不變 | 200 | `false` | `null` | `"ASSIGNMENT_RUN_ALREADY_RUNNING"` | 跳過推進、不 rollback PUT；可待月跑完成後改走手動 fallback |
| 歷史月份 | 不變 | 200 | `false` | `null` | （不帶） | 歷史月份 PUT 本身已於 F082 被 403 攔截，auto-advance 不執行 |

## 6. 業務規則

> **BR-1~BR-10** 為共用規則 + 手動 fallback 路徑規則（沿用 v1.2.1）；**BR-11~BR-16** 為 v2.0 auto-advance 主路徑新增規則。

| 規則編號 | 說明 |
|---|---|
| BR-1 | **`stage = 'personnel_ratio'` 限制**：透過 `StageTransitionService.assertStageEquals(listNo, 'personnel_ratio')` 統一檢查 |
| BR-2 | **前置條件：所有部門加總 = 100%**：對每個 `ob_emphire` 在職部門驗證 `ob_empl_set` RATION 加總；任一部門加總 ≠ 100% 或無紀錄 →（手動路徑）422 `STAGE_ADVANCE_PRECONDITION_FAILED` + response 含 `incompleteDepts` 陣列；（auto-advance 路徑）不推進、`autoAdvanced: false`（不報錯，PUT 仍 200） |
| BR-3 | **角色矩陣（I-7 變體）**：手動 fallback 端點為 M03b 階段唯一可由處長觸發之推進；後端 Guard 為 `DirectorOrSectionChiefGuard`（admin / director / section_chief 皆通過）；處長無轄區限制（因前置條件已驗證所有部門完成）。auto-advance 路徑之觸發者沿用 F082 PUT 的合法寫入者身份（含 section_chief） |
| BR-4 | **歷史月份攔截**：沿用 F077 BR-3 |
| BR-5 | **推進後個別業務比例鎖定**：後端依 `stage != 'personnel_ratio'` 拒絕 `ob_empl_set` 寫入（由 F082 PUT API 統一檢查） |
| BR-6 | **稽核失敗不 rollback**：沿用 F050 v2.0 BR-11；稽核 `metadata.operator_role` 紀錄推進者角色（`director` / `section_chief` / `admin`）以利後續追溯 |
| BR-7 | **DB 操作原子性**：`stage` 更新 + 稽核寫入須於同一 transaction |
| BR-8 | **全員離職部門處理**：若某部門 `ob_emphire` 無任何在職員工（`activeEmployeeCount === 0`），該部門 RATION 加總可 = 0%（沿用 F082 v1.3 全員離職分支）；不阻擋推進。**auto-advance 完成度判斷沿用此規則，不新開規則** |
| BR-9 | **月跑並發守衛（v1.1 / 決議 #6）**：F084 手動 service method 入口層呼叫 `await this.assignmentRunGuardService.assertNoRunningRun()`；auto-advance 路徑之月跑 guard 行為見 BR-15（不報 409，改 `autoAdvanceFailReason`） |
| BR-10 | **Feature Flag fallback（v1.1 / 決議 #2）**：F084 手動端點受 `FeatureFlagGuard`（`ENABLE_E07_REFACTOR_PHASE3`）保護；flag = false 時回 503 `FEATURE_NOT_ENABLED`。auto-advance 之 flag 關係見 BR-16 |
| BR-11 | **Auto-Advance 觸發點（v2.0）**：auto-advance 偵測與推進邏輯附著於 **F082 PUT `setPersonnelRatios`** service method 成功後，於**同一 database transaction 內**執行；完成度通過則於同一 tx 內執行 stage 更新與稽核寫入。**無獨立 HTTP endpoint**；結果透過 F082 PUT response 欄位回傳（詳 §5.2 / F082 §5.2 / F082 BR-19） |
| BR-12 | **Auto-Advance 完成度判斷（v2.0）**：「所有有在職員工的部門 RATION 加總 = 100%（容忍 **±0.01%**，沿用 I-8 / F082 BR-2）」；全員離職部門（`activeEmployeeCount === 0`）短路通過，不參與判斷（沿用 BR-8 / F082 BR-8，**不新開規則**）。**容差未變動** |
| BR-13 | **競爭條件 blocking advisory lock + idempotent（v2.0 / 依 AD-E07-19）**：以 `listNo` 為 key 之 **blocking** advisory lock 將並發 auto-advance 偵測序列化（並發第二筆 PUT 會**等待**前一並發 tx commit 後再取得 lock）；(1) **取得 lock 後重新偵測，`stage` 已為 `'approval'`**（已被先到請求推進）→ idempotent no-op、**不重複寫稽核日誌**、PUT 回 200 + `autoAdvanced: false`、不帶 `autoAdvanceFailReason`；(2) **lock 等待逾時**（`lock_timeout = 5000ms`，5 秒內仍無法取得）→ 降級為 no-op、PUT 仍回 200 + `autoAdvanced: false`、**不帶 `autoAdvanceFailReason`**、**不報 5xx**。兩種情境均為 200 + `autoAdvanced: false` 且不帶 failReason。**Option B 寫入保留**：lock 超時 / no-op 降級時，本次 PUT 之比例寫入（在 lock 取得之前完成）**保留、不 rollback**，tx 照常 commit（依 AD-E07-19 §19.3.3）；使用者可再次 PUT 觸發，或改走手動 fallback（§5.1）。lock 機制（blocking + `lock_timeout`）依 AD-E07-19 已定案 |
| BR-14 | **稽核沿用 STAGE_ADVANCE（不擴 enum）（v2.0）**：auto-advance 路徑稽核沿用既有 `AssignmentAuditLog.action = 'STAGE_ADVANCE'` enum（**不新增 enum 值**），以 `metadata.auto_advanced_by_completion = true` 區分自動 / 手動；`operator_id` = 最後觸發完成的 PUT 寫入者 user_id；`metadata.operator_role` = 觸發者角色。**手動 fallback 路徑不含 `auto_advanced_by_completion` metadata**（用以區分兩條路徑） |
| BR-15 | **月跑 guard 失敗不 rollback PUT（v2.0）**：auto-advance 偵測到月跑進行中（`assignment_run.status IN ('pending', 'running')`）時，**跳過推進但不 rollback 本次 F082 PUT**；PUT 仍回 200 + `autoAdvanced: false` + `autoAdvanceFailReason: "ASSIGNMENT_RUN_ALREADY_RUNNING"`。此情境下使用者可待月跑完成後改走手動 fallback（§5.1） |
| BR-16 | **雙 Feature Flag 關係（v2.0）**：(1) **`ENABLE_E07_AUTO_ADVANCE_TO_APPROVAL`**（prod 預設 **off**）只 gate「auto-advance 自動觸發」行為；flag = off 時 auto-advance 邏輯完全不執行，PUT response `autoAdvanced: false`。(2) **`ENABLE_E07_REFACTOR_PHASE3`** 仍 gate 整個 E07 P3 功能集（含手動 `advance-to-approval` endpoint + F082 PUT 本體），flag = off 時相關端點回 503 `FEATURE_NOT_ENABLED`。(3) **組合行為**：auto flag off + phase3 on → 退回 v1.x 手動推進行為（手動按鈕 + POST endpoint 正常運作）；phase3 off → 全部 P3 端點 503（auto flag 無論 on/off 皆無作用，因 PUT 本體已被擋下） |

## 7. UI/UX 需求

### 7.1 Auto-Advance 主路徑 UX（flag = on）

- **無推進按鈕互動**：使用者於 F082 個別業務比例設定頁完成最後一筆 PUT 後，無需點擊任何「推進至簽核」按鈕，系統自動推進。
- **Auto-Advance 成功 toast**（PUT response `autoAdvanced: true`）：「名單『{listNm}』已自動推進至簽核階段，等待部長核准」，並 redirect 至名單列表；該名單階段標籤更新為「簽核」。
- **Auto-Advance 因月跑 guard 跳過 toast**（PUT response `autoAdvanced: false` + `autoAdvanceFailReason: "ASSIGNMENT_RUN_ALREADY_RUNNING"`）：「比例已儲存；因分派執行中，請待月跑完成後手動推進至簽核」；此時頁面回退顯示手動「推進至簽核」按鈕作為 fallback（見 §7.2）。
- **部分完成**（`autoAdvanced: false`、無 failReason）：僅顯示 F082 既有「{deptName} 個別業務比例已儲存」toast，不顯示推進相關訊息。

### 7.2 Fallback 手動「推進至簽核」按鈕（flag = off 或 auto-advance 未觸發）

- **顯示條件**：`ENABLE_E07_AUTO_ADVANCE_TO_APPROVAL` flag = off，或 auto-advance 因月跑 guard 跳過（AC-5）。
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
- **後端 Auto-Advance 主路徑測試案例（對齊 US-114 TC-114-01~06）**：
  - TC-114-01：最後一個部門 PUT 完成（處長觸發，flag = on）→ PUT response `autoAdvanced: true` / `newStage: "approval"`；stage 更新為 `'approval'`；稽核 `action = 'STAGE_ADVANCE'` + `auto_advanced_by_completion: true` + `operator_id = 處長 A`（同一 tx）
  - TC-114-02：部門尚未全部完成 PUT → 200 + `autoAdvanced: false`；stage 維持 `'personnel_ratio'`
  - TC-114-03：兩處長並發 PUT → blocking advisory lock 序列化（後到者等待先到者 commit 後取得 lock）；先到者 `autoAdvanced: true`、後到者重新偵測 stage 已 `approval` → `autoAdvanced: false`（idempotent no-op，不帶 failReason）；後到者比例寫入保留；稽核只新增一筆 `STAGE_ADVANCE`
  - TC-114-04：PUT 完成觸發 auto-advance 但月跑進行中 → 200 + `autoAdvanced: false` + `autoAdvanceFailReason: "ASSIGNMENT_RUN_ALREADY_RUNNING"`；stage 不變；不 rollback PUT
  - TC-114-05：Feature flag off + 所有部門完成 PUT → 200 + `autoAdvanced: false`；stage 不更新；前端顯示手動按鈕
  - TC-114-06：全員離職部門（activeCount = 0）不阻擋 auto-advance（BR-8 / BR-12 短路）；其餘部門完成 → stage 更新為 `'approval'`
  - lock 等待逾時（>5s，`lock_timeout = 5000ms`）→ 200 + `autoAdvanced: false`、不帶 failReason、不報 5xx；**比例寫入保留、不 rollback PUT**（BR-13 / Option B）
  - 代操部長完成最後部門 PUT（無代理處長）→ auto-advance 觸發、`operator_id = 代操部長`、`metadata.operator_role = 'director'`（AC-9）
- **後端 Fallback 手動路徑測試案例（對齊 US-114 TC-114-07 + 沿用 v1.2.1）**：
  - TC-114-07：flag = off、所有部門完成、部長點手動推進 → 200 OK，stage 更新為 `'approval'`，稽核 `action = 'STAGE_ADVANCE'`（**不含** `auto_advanced_by_completion` metadata）
  - 處長 A 手動推進但 XTD0 未完成 → 422 `STAGE_ADVANCE_PRECONDITION_FAILED`，response 含 `incompleteDepts: ['XTD0']`
  - 部長手動推進但任一部門加總 = 80% → 422 `STAGE_ADVANCE_PRECONDITION_FAILED`
  - 手動推進 `stage = 'draft'` / `'dept_ratio'` / `'approval'` / `'ready'` 名單 → 422 `LIST_STAGE_TRANSITION_FORBIDDEN`
  - 手動推進月跑進行中 → 409 `ASSIGNMENT_RUN_ALREADY_RUNNING`
  - 手動推進歷史月份 → 403 `LIST_HISTORICAL_READONLY`
  - `ENABLE_E07_REFACTOR_PHASE3` 關閉 → 503 `FEATURE_NOT_ENABLED`
- **共用測試案例**：
  - TC-114-08：推進後（auto 或手動）嘗試 PUT 個別業務比例 → 422 `LIST_STAGE_TRANSITION_FORBIDDEN`
  - 稽核 `metadata.operator_role` 紀錄推進者角色（兩路徑皆驗）
- 前端關鍵測試案例：
  - Auto-Advance：`autoAdvanced: true` → 顯示自動推進 toast + redirect；階段標籤更新為「簽核」
  - Auto-Advance 月跑 guard 跳過：`autoAdvanceFailReason` 存在 → 顯示「比例已儲存；因分派執行中…」toast + 退回顯示手動按鈕
  - Fallback：處長本部門未完成時按鈕 disabled；部長 / Admin 始終顯示按鈕
  - 非 `personnel_ratio` 階段 / 已停用 / 歷史月份按鈕**完全不渲染**
  - 未完成部門列示 Modal（手動路徑）
- E2E：F082 各部門設定加總 100%（最後一筆 PUT 觸發 auto-advance）→ stage 自動推進至 `approval` → F086 核准；及 flag off 時 F082 → F084 手動推進 → F086 路徑

## 11. 實作 Checklist

**Auto-Advance 主路徑（v2.0）**：
- [ ] 後端於 **F082 PUT `setPersonnelRatios` service method 成功後同一 transaction 內** 掛載 auto-advance 偵測（無獨立 endpoint；觸發宿主為 F082 PUT，見 F082 BR-19）
- [ ] 後端完成度偵測：所有在職部門 RATION 加總 = 100%（±0.01%）；全員離職部門短路（沿用 F082 v1.3 短路邏輯，**不新開規則**）
- [ ] 後端 blocking advisory lock（以 `listNo` 為 key、`lock_timeout = 5000ms`）序列化 auto-advance 偵測 + idempotent advance（lock 機制依 AD-E07-19；§12 A-5 已 Resolved）
- [ ] 後端 stage 更新（**auto-advance 路徑用 `StageTransitionService.advanceToInMgr(..., mgr, { auto_advanced_by_completion: true, operator_role })` 過載，傳入外部 `EntityManager` 走同一 tx**）+ 稽核寫入（`STAGE_ADVANCE` + `metadata.auto_advanced_by_completion = true` + `operator_role`）於同一 transaction
- [ ] 後端月跑 guard 跳過分支：偵測到月跑進行中時不推進、不 rollback PUT、回傳 `autoAdvanceFailReason`
- [ ] 後端 `ENABLE_E07_AUTO_ADVANCE_TO_APPROVAL` flag gate（prod 預設 off；off 時 auto-advance 完全不執行）
- [ ] F082 PUT response 補 `autoAdvanced` / `newStage` / `autoAdvanceFailReason` 三欄位（見 F082 §5.2）
- [ ] 前端 PUT response 解析：`autoAdvanced: true` → toast + redirect；`autoAdvanceFailReason` → 提示 + 退回手動按鈕

**Fallback 手動路徑（沿用 v1.2.1）**：
- [ ] 後端保留 `POST /api/v1/assignment/lists/{listNo}/stage/advance-to-approval` 端點 + Service
- [ ] 後端套 `DirectorOrSectionChiefGuard` + `StageTransitionService.assertStageEquals(listNo, 'personnel_ratio')` + `RatioValidationService.assertAllDeptsSumEquals100(listNo)` + `LIST_HISTORICAL_READONLY` Guard + `AssignmentRunGuardService.assertNoRunningRun()` + `FeatureFlagGuard`（`ENABLE_E07_REFACTOR_PHASE3`）
- [ ] 後端 stage 更新與稽核寫入於同一 transaction（手動路徑稽核**不含** `auto_advanced_by_completion`）
- [ ] 前端「推進至簽核」按鈕渲染條件（flag off 或 auto-advance 未觸發；含處長本部門未完成 disabled 邏輯）
- [ ] 前端確認對話框 + 未完成部門列示 Modal

**共用**：
- [ ] 圖表更新：[diagrams/F084-advance-flow.mmd](../diagrams/F084-advance-flow.mmd) 補 auto-advance 主路徑 + fallback 分支（圖表更新由後續實作 / UI-UX agent 處理）
- [ ] 整合測試：F082 最後一筆 PUT 觸發 auto-advance → F086 路徑驗證；flag off 時 F082 → F084 手動 → F086 路徑驗證

## 12. 假設

| # | 假設 | 標記 |
|---|---|---|
| A-1 | **`StageTransitionService` 共用 helper**：手動 fallback 路徑（§5.1 / AC-12）透過 `StageTransitionService.advanceTo(listNo, 'approval')`（**自開 tx**）與 `assertStageEquals(listNo, 'personnel_ratio')` 執行；**auto-advance 主路徑（§5.2）改用新過載 `advanceToInMgr(listNo, 'personnel_ratio', 'approval', actorId, mgr, metadata)`（接受外部 `EntityManager`、不自開 tx、走 F082 PUT 同一 tx；AD-E07-19）**。helper 設計沿用 F079 §12 A-1 | 沿用 F079 §12 A-1；auto-advance 過載 ✅ Resolved（AD-E07-19，2026-05-25） |
| A-2 | **`RatioValidationService.assertAllDeptsSumEquals100` 設計**：新增 method，接受 listNo，內部依 `ob_emphire` 在職部門遍歷檢查每部門 `ob_empl_set` 加總；全員離職部門早期短路 return（沿用 F082 v1.3 決議 #1） | [ASSUMPTION] 待 system-architect |
| A-3 | **處長推進操作稽核標記**：`assignment_audit_log.metadata.operator_role` 欄位用以區分由「處長代推」與「部長推進」；MVP 用 metadata JSONB 欄位承擔（避免 schema 變更） | [ASSUMPTION] 待 system-architect |
| A-4 | **Feature Flag gating 範圍**：F084 手動端點與 F078 / F079 / F080 / F081 / F085 / F086 / F087 / F089 同屬 `ENABLE_E07_REFACTOR_PHASE3` flag gating；auto-advance 行為另由 `ENABLE_E07_AUTO_ADVANCE_TO_APPROVAL` 細粒度 gate（見 BR-16） | 沿用 F050 v2.0 §13.2 |
| A-5 | ~~**Advisory lock 具體 API（v2.0）**：try-lock vs blocking lock 待決議~~ **[RESOLVED] 2026-05-25 / AD-E07-19**：採 **blocking** advisory lock（以 `listNo` 為 key），並發第二筆 PUT 等待前一並發 tx commit 後取得 lock、再重新偵測 `stage` 判斷 idempotent；設定 `lock_timeout = 5000ms`，5 秒逾時則降級為 no-op（不報 5xx）。**Option B 寫入保留**（AD-E07-19 §19.3.3）：比例寫入於 lock 取得之前完成，lock 超時 catch 不 rethrow、tx 照常 commit，不 rollback PUT。具體鎖機制（`pg_advisory_xact_lock` / lock key hash / transaction-scoped 自動釋放）詳 AD-E07-19 | ✅ Resolved（system-architect / AD-E07-19，2026-05-25） |
| A-6 | ~~**「同一 transaction」邊界（v2.0）**：tx scope / 隔離級別 / lock 與 commit 時序待決議~~ **[RESOLVED] 2026-05-25 / AD-E07-19**：`setPersonnelRatios()` 之 tx scope **擴大涵蓋 lock + 完成度偵測 + stage 更新 + 稽核寫入**，與 `ob_empl_set` DELETE/INSERT 同屬一個 transaction scope；(1) `StageTransitionService.advanceToInMgr()` 新增過載接受外部 `EntityManager`、不自開 tx；(2) `PersonnelRatioValidationService.assertAllDeptsSumEquals100WithMgr()` 新增 `EntityManager` 版本（讀同一 tx 內未 commit 之寫入）；(3) 隔離級別維持 **READ COMMITTED**（並發已由 blocking advisory lock 序列化，無需提升隔離級別） | ✅ Resolved（system-architect / AD-E07-19，2026-05-25） |
| A-7 | ~~**`operator_role` 來源（v2.0）**：由觸發 PUT 之 JWT 推導，待決議~~ **[RESOLVED] 2026-05-25 / AD-E07-19**：沿用 `stage-action.service.ts` 既有 `advancedByRole` pattern（`actor.role === 'admin' ? 'admin' : actor.businessRole`）推導 `operator_role`（`section_chief` / `director` / `admin`），寫入 `assignment_audit_log.metadata` JSONB 欄位；**不擴 `AssignmentAuditLog.action` enum**（沿用 A-3 metadata 承載方式，避免 schema 變更） | ✅ Resolved（system-architect / AD-E07-19，2026-05-25） |

## 13. 變更紀錄

| 版本 | 日期 | 變更內容 |
|---|---|---|
| v1.0 | 2026-05-15 | 初版（取代 US-114，E07 補修批次 4）：限 `stage = 'personnel_ratio'` 推進；Actor 新增處長（前提是所有部門完成）；Guard 為 `DirectorOrSectionChiefGuard`；前置條件「所有部門加總 = 100%」；response 含 `incompleteDepts` |
| v1.1 | 2026-05-16 | **Phase 1 風險決議落地**：(1) 決議 #6：BR-9 補「`assertNoRunningRun()` 由 `AssignmentRunGuardService` 集中實現」；(2) 決議 #2：新增 BR-10 Feature Flag fallback（503 + `FEATURE_NOT_ENABLED`） |
| v1.2 | 2026-05-16 | **救援重寫**：前一輪編碼事故損毀本檔內容，依 US-114 + AD-E07 v3.0 一致性決議完整重建；保留 v1.0 / v1.1 所有設計決議 |
| v1.2.1 | 2026-05-21 | **Phase 5 TDD code drift 修正（D1 follow-up）**：對齊 `AssignmentAuditLog.action` entity enum（`apps/api/src/database/entities/assignment-audit-log.entity.ts:26-39`）— 將 spec 全文之 `action = 'ADVANCE_STAGE'` 字串修正為 `action = 'STAGE_ADVANCE'`；real flow 經 `StageTransitionService.advanceTo()` 統一寫入。不變動業務邏輯 / API endpoint / Transaction / Guard |
| **v2.0** | **2026-05-25** | **【auto-advance 改造 / 對應 US-114 v2.0】**：個別業務比例 → 簽核推進由「使用者手動點按」改為「F082 PUT `setPersonnelRatios` 成功後同一 transaction 內偵測所有部門完成即自動推進」，手動 POST endpoint 降為 fallback。(1) §1/§2 主路徑改為系統 auto-advance（Actor 補「系統後端 auto-advance 機制」），保留 fallback 視角；(2) §3 拆分 3.1 auto-advance 觸發前置條件 + 3.2 fallback 前置條件；(3) §4 AC 重構對齊 US-114 AC-1~AC-11（auto-advance 觸發 / 稽核 / 部分完成 / 競爭條件 / 月跑 guard / UX / fallback 顯示 / flag off / 代操處長 / 推進後鎖定 / 歷史月份）+ 新增 AC-12 fallback 手動路徑（彙整 v1.2.1 AC-2/3/4/5/6）；(4) §5.1 標為 fallback、新增 §5.2 Auto-Advance 觸發流程（無獨立 endpoint，附著 F082 PUT，含降級行為彙總表）；(5) §6 新增 BR-11~BR-16（觸發點 / 完成度判斷沿用 BR-8 與 ±0.01% / advisory lock + idempotent / `STAGE_ADVANCE` 不擴 enum + metadata flag / 月跑 guard 不 rollback / 雙 flag 關係）；(6) §7 拆分 7.1 auto-advance UX + 7.2 fallback 手動按鈕；(7) §10 測試對齊 US-114 TC-114-01~08；(8) §12 新增 A-5~A-7（advisory lock API、tx 邊界、operator_role 推導待 system-architect）。**容差維持 ±0.01% 未變動**；**稽核沿用 STAGE_ADVANCE enum，未擴 enum**；**section_chief 仍為合法 PUT 觸發者**；**全員離職沿用既有 BR-8**。保留 v1.0~v1.2.1 所有設計決議與手動 fallback 行為 |
| **v2.0.1** | **2026-05-25** | **【§5.2 / BR-13 降級行為依 AD-E07-19 改採 blocking lock】**：system-architect 完成 AD-E07-19 後，**推翻 v2.0 原 try-lock 降級假設，改採 blocking advisory lock**（以 `listNo` 為 key、`lock_timeout = 5000ms`）。(1) §5.2 step 2 改寫：取得 blocking lock（等待前一並發 tx commit）後重新偵測 stage，已 `approval` → idempotent no-op、lock 等待逾時（>5s）→ 降級 no-op；(2) §5.2 降級表刪除「拿不到 advisory lock」列，新增「並發第二筆 PUT（等待後取得 lock、stage 已 approval、idempotent no-op）」與「lock 等待逾時（>5s）」兩列，並補 說明 欄；(3) BR-13 改寫為 blocking lock 語意，刪除「拿不到 lock 立即 no-op」；(4) **Option B 寫入保留語意（AD-E07-19 §19.3.3）**：lock 超時 / no-op 降級時比例寫入保留、不 rollback PUT，tx 照常 commit；§5.2 / 降級表 / BR-13 / §10 測試均明示；(5) §12 A-5 標 ✅ Resolved（blocking + 5s timeout 已定案）。**月跑 guard 列不動**（仍帶 `autoAdvanceFailReason='ASSIGNMENT_RUN_ALREADY_RUNNING'`）；容差 ±0.01% / STAGE_ADVANCE 不擴 enum / section_chief 觸發者 / 全員離職 BR-8 均不變 |
