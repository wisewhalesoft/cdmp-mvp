---
spec-id: F082
title: 個別業務比例設定（per-LIST_NO 各部門業務員 RATION，處長主操 + 部長代操作）
feature-id: F082
source-story: US-112
epic: E07
module: M03b 個別業務比例設定階段
priority: P0-MVP
version: "1.7"
date: 2026-05-25
status: Draft
---

# F082: 個別業務比例設定（per-LIST_NO 各部門業務員 RATION，處長主操 + 部長代操作）

Priority: P0-MVP | Status: Draft | Last Updated: 2026-05-25

> **v1.7 修訂（2026-05-25 / F084 v2.0 auto-advance 改造同步）**：本 PUT `setPersonnelRatios` 成為 F084 v2.0「自動推進至簽核」之**觸發宿主**。(1) §5.2 PUT response 補 `autoAdvanced: boolean` / `newStage: string | null` / `autoAdvanceFailReason?: string | null` 三欄位 + 欄位語意說明；(2) 新增 §6 BR-19「Auto-Advance 觸發宿主」（觸發行為 / advisory lock / 月跑 guard 降級 / 稽核細節全由 F084 規範，本 BR 僅說明觸發掛載點）；(3) §8 Blocks 之 F084 條目補註「auto-advance 觸發宿主」。**本 PUT 既有寫入 / 校驗 / 容差 ±0.01% / 轄區 Guard / 稽核語意完全不變**；auto-advance 由 `ENABLE_E07_AUTO_ADVANCE_TO_APPROVAL` flag（prod 預設 off）控制，flag off 時完全不執行。
>
> **v1.6 修訂（2026-05-25 / commits 6402cd3 / 150acbe / 38eb0dc 落地）**：(1) 新 BR-17 FE per-row ±N% 模板採「baseline + per-employee templates」模型保證對稱性（baseline 設定時機三種：首次進入 / 均等分配 / 手動編輯）；(2) 新 BR-18 service GET 只回 `deptRatio > 0` 之部門（null / 0 隱藏；> 0 顯示）；(3) §5.1 GET response 補 `directorName: string | null` 欄位，定義對齊 F079 §5.1。
> **v1.5 修訂（2026-05-22 / commit 977ed09 落地；補入 changelog）**：處長轄區判定改用 `resolveSectionChiefScope(userId)` 由 `users.email ↔ ob_emphire.email + jfun_nm='處長' + 在職` 反查 `dept_code`，廢除原 `scopeByCreator(ob_empl_set.created_by)` 邏輯以解「首次 GET 時 ob_empl_set 為空 → 處長永遠回空清單」之 chicken-and-egg；BR-3 / BR-14 / §5.x 已於 977ed09 commit body 更新但漏記 changelog，本次補入。
> **v1.4 救援重寫（2026-05-16）**：前一輪 PowerShell 編碼事故損毀本檔內容，本版本依 US-112 + AD-E07 v3.0 一致性決議完整重建；Guard 名稱統一為 `DirectorOrSectionChiefGuard` + `SectionChiefScopeGuard`（廢除 `SalesManagerGuard`）；業務角色欄位 `business_role`；JWT claim 為 `businessRole`；保留 v1.0~v1.3 所有設計決議與 6 風險決議落地。
> **v1.3 修訂（2026-05-16 / system-architect Phase 1 風險決議落地）**：(1) **全員離職部門**（決議 #1，選項 D）：per-DEPT sum = 0% 容許；GET response 補 `activeCount` / `sumValidated` / `allResigned` 欄位；新增 AC-14。(2) **Feature Flag fallback**（決議 #2，選項 A）：F082 上 `FeatureFlagGuard`，flag=false 時回 503 + `FEATURE_NOT_ENABLED`（沿用 F050 v2.0 §13 統一行為）；新增 AC-15。(3) **SectionChiefScopeGuard method 分支**（決議 #4）：GET 不攔截、service 走 `scopeByCreator()` 統一 filter；PUT / POST 攔截，越權回 403 `PERSONNEL_RATIO_OUT_OF_SCOPE`。(4) **月跑並發守衛**（決議 #6）：所有寫入 service method 入口層呼叫 `AssignmentRunGuardService.assertNoRunningRun()` 集中實現。(5) **test fixture 策略**（決議 #5）：integration test 使用 `apps/api/test/fixtures/ob-emphire.fixture.ts` 之 `buildObEmphire()` factory + `allResignedDeptSeed` 等場景 helper。(6) §12 A-1 / A-6 升 ✅ Resolved。
> **v1.2 修訂（2026-05-16 / E07 衍生補修）**：PO 決議 F082-A 落地：業務員清單來源改為**全部含已離職員工**（`isResigned = true` flag），UI 顯示「離職」badge；per-DEPT 比例驗證**僅排除離職員工**；既有 `ob_empl_set` ration 紀錄保留供歷史追溯；GET response 補 `isResigned` 欄位；`appdb.ob_emphire` 由 ETL E07-OBEMPHIRE-Load pipeline 載入至 AppDB 表。
> **v1.1 修訂（2026-05-15 / E07 補修批次 6）**：新增 §7.x「拒絕 banner 渲染與互動」UI 規格（OQ-E07-21 用戶決議落地：F087 拒絕後於 F082 頁面右上方顯示 banner，可關閉 / 收合）；GET response 補 `latestRejection` 欄位（資料來源由 F087 BR-11 寫入）；新 BR-2a「相對 % UI 顯示語意」（OQ-E07-40 落地）。

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + `data-model.md#ob-empl-set-obemplsetmf--人員比例設定` + `data-model.md#ob-emphire-obemphire--員工主檔` + `data-model.md#ob-dept-pct-obmdeptpct--per-list-no-部門比例` + `error-handling.md#assignment-ratio-errors` + `error-handling.md#assignment-stage-transition-errors` + `error-handling.md#assignment-role-errors` |
| QA / Tester | 本文件 + `error-handling.md#assignment-ratio-errors` + `error-handling.md#assignment-role-errors` |
| UI/UX Designer | 本文件 §7 UI/UX 需求 + `F083-quick-ratio-template.md`（快速模板按鈕） |
| Architect | 本文件 + `architecture-spec.md` §3.10（含階段流轉、`StageTransitionService.assertStageEquals`、`PersonnelRatioValidationService`、`SectionChiefScopeGuard` 設計） |

---

## 對應 User Story

- 來源 Story：[US-112-M03b-set-personnel-ratio.md](../../stories/epics/E07-app-customer-list-assignment/US-112-M03b-set-personnel-ratio.md)
- Epic：[E07 — 客戶名單分派](../../stories/epics/E07-app-customer-list-assignment/epic-brief.md)
- 模組：M03b 個別業務比例設定階段（取代 F058 / US-079）
- 取代：[F058 v1.x DEPRECATED](F058-edit-personnel-ratio.md)

---

## 1. 功能摘要

允許處長 / 部長 / Admin 對 `stage = 'personnel_ratio'` 名單之每個部門業務員設定 RATION（per-LIST_NO + per-DEPT 業務員比例）。

**範圍**：
- 僅 `stage = 'personnel_ratio'` 名單可寫入；非此階段一律 422 `LIST_STAGE_TRANSITION_FORBIDDEN`
- **業務員清單來源（v1.2 修訂 / PO 決議 F082-A）**：AppDB `ob_emphire` **全部員工**（不過濾 `resign_date IS NULL`），按 `dept_code` 分組；每筆員工帶 `isResigned` flag（`true` 表示 `resign_date IS NOT NULL`，UI 顯示「離職」badge）；`appdb.ob_emphire` 由 ETL E07-OBEMPHIRE-Load pipeline 從來源系統 OBEMPHIRE 載入（每月 full replace；詳 [data-model.md#ob-emphire-entity](../data-model.md#ob-emphire-entity)）
- **Per-DEPT 比例驗證（v1.2 修訂；v1.3 補全員離職分支）**：每 `list_no + deptid_m` 之**在職業務員**（`isResigned = false`）RATION 加總須 = 100%（容忍 ±0.01%；沿用 I-8）；離職員工不參與加總；任一 RATION 須在 [0, 100]
- **全員離職分支（v1.3 / 決議 #1 選項 D）**：若該部門所有員工皆已離職（`activeEmployeeCount === 0`），`PersonnelRatioValidationService.assertDeptSumEquals100()` **早期短路 return**，跳過驗算，容許該部門 sum = 0%，**不阻擋儲存**；GET response 該部門 `sumValidated = false`、`allResigned = true`、`activeCount = 0`
- **轄區隔離（I-3）**：處長僅能存取 `created_by` 屬於自己轄區（`created_by = currentUserId`）之業務員設定；部長 / Admin 可跨轄區
- 名單已停用 / 歷史月份禁止寫入

**取代說明**：本 Feature 取代 [F058 v1.x](F058-edit-personnel-ratio.md)。F058 v1.x 之「業務主管 + 任意 stage 寫入」設計已於 E07 補修批次 5 廢止；F082 限縮至 `stage = 'personnel_ratio'` 階段且新增 Actor 處長 + 部長 + Admin 三角色 + 轄區隔離 Guard。

## 2. 使用者故事

**As a** 處長（Section Chief）/ 部長（Director）/ Admin
**I want** 在名單推進至「個別業務比例設定」階段後，為本部門（處長轄區）或任意部門（部長 / Admin 跨轄區）之業務員設定 RATION，使部門內加總 = 100%
**So that** 月跑時 Stage 4 可依 per-LIST_NO + per-DEPT 業務員比例正確分配案件至個別業務員

## 3. 前置條件

- 使用者已通過 E01 驗證並持有 JWT Token
- 使用者具「處長」或「部長」或「Admin」權限
- 目標 `list_no` 存在於 `ob_list_definition`，`status = 'active'`，`stage = 'personnel_ratio'`
- `project_workym >= current_work_ym`（非歷史月份；沿用 F077 BR-3）
- `assignment_run` 中無 `status IN ('pending', 'running')` 紀錄
- 該名單之 `ob_dept_pct` 已存在 ≥ 1 筆（前置階段 M03a 已完成；F080 推進已驗證）
- `ob_emphire` 資料含至少 1 筆 `resign_date IS NULL` 紀錄

## 4. 驗收標準

### AC-1：「設定個別業務比例」入口於五階段清單中渲染

- **Given** 處長 / 部長 / Admin 在 F048 / F077 清單頁查看個別業務比例設定階段之 `stage = 'personnel_ratio'` 名單
- **When** 頁面顯示該名單操作欄
- **Then**
  - 處長：顯示「設定個別比例」按鈕（沿用 F077 角色 × 階段操作矩陣；後端 GET 端點仍以 `created_by` 過濾轄區內業務員）
  - 部長 / Admin：顯示「設定個別比例」按鈕（不限轄區）
- **And** 點擊按鈕進入個別業務比例設定頁

### AC-2：顯示業務員清單與現有 RATION（含轄區過濾與含離職員工 v1.2）

- **Given** 處長進入個別業務比例設定頁
- **When** 頁面載入
- **Then** 系統呼叫 GET `/api/v1/assignment/ratios/personnel/{listNo}`，依序：
  1. **業務員清單來源（v1.2 修訂 / PO 決議 F082-A）**：從 `appdb.ob_emphire` **全部員工**（不過濾 resign_date），按 `dept_code` 分組；每筆員工帶 `isResigned` flag
  2. **轄區過濾**：處長僅回傳 `ob_empl_set.created_by = currentUserId` 之業務員，且 `ob_empl_set` 中該部門對應之部門屬於處長轄區（沿用 BR-3）
  3. JOIN `ob_empl_set` 讀取既有 RATION（若無紀錄則 `ration = null`，前端顯示「未設定」）；**離職員工於 `ob_empl_set` 仍有 ration 紀錄者一併回傳**（保留歷史追溯，不自動清空）
  4. 各部門加總顯示「目前加總：N%」（**僅計算 `isResigned = false` 之員工**；BR-13）
- **And** 部長 / Admin 可進入任意部門之所有業務員（不過濾轄區）

### AC-3：修改業務員 RATION 並即時更新 per-DEPT 加總

- **Given** 使用者進入編輯模式
- **When** 修改某業務員的 RATION 值（直接輸入框）
- **Then** 頁面即時計算**該業務員所屬部門**之所有業務員 RATION 加總，顯示「{deptName} 目前加總：N%」
- **And** 若 `|該部門加總 - 100| <= 0.01`（沿用 I-8 容忍誤差），該部門子表「儲存」按鈕啟用
- **And** 加總超出容忍範圍時，該部門「儲存」按鈕停用，並顯示提示「{deptName} 目前加總為 N%，需調整至 100% 才能儲存」
- **And** 不同部門之加總獨立驗證；某部門加總 = 100% 不影響其他部門

### AC-4：RATION 輸入值驗證（範圍 [0, 100]）

- **Given** 使用者在 RATION 輸入框輸入值
- **When** 輸入的值為負數（< 0）、超過 100（> 100）、或非數值
- **Then** 輸入框即時顯示紅色框與錯誤訊息「比例需介於 0 到 100 之間」
- **And** 「儲存」按鈕停用
- **And** 後端寫入時若任一 RATION 超出 [0, 100]，回 422 `RATIO_OUT_OF_RANGE`

### AC-5：儲存成功（per-DEPT 寫入）

- **Given** 某部門業務員 RATION 加總落於 [99.99, 100.01] 且每筆 RATION 落於 [0, 100]
- **When** 使用者點擊該部門子表「儲存」按鈕
- **Then** 後端執行：
  1. UPSERT `ob_empl_set`（覆寫式：先 DELETE 該 `(list_no, deptid_m)` 之既有紀錄，再 INSERT request payload；於同一 transaction 內執行）
  2. 寫入 `assignment_audit_log`（`action = 'SET_PERSONNEL_RATIO'`、`entity_type = 'ob_empl_set'`、`entity_id = list_no`、`metadata.deptid_m = {deptCode}`、`before_value` / `after_value` 含該部門業務員 RATION 完整快照）
- **And** 頁面顯示成功提示「{deptName} 個別業務比例已儲存」，該部門子表切換回唯讀模式
- **And** **稽核失敗**僅 Logger.error，不 rollback 業務寫入（沿用 F050 v2.0 BR-11）

### AC-6：RATION = 0 視為有效值

- **Given** 使用者將某業務員 RATION 設為 0%，其他業務員加總 = 100%
- **When** 點擊「儲存」
- **Then** 系統允許儲存（0% 表示該業務員本月不分派任何案件）
- **And** 0% 業務員仍寫入 `ob_empl_set`（保留於清單便於日後調整）

### AC-7：非 `personnel_ratio` 階段禁止寫入

- **Given** 名單 `stage` 為 `'draft'` / `'dept_ratio'` / `'approval'` / `'ready'` 任一
- **When** 使用者透過 PUT `/api/v1/assignment/ratios/personnel/{listNo}` 嘗試寫入
- **Then** 後端回 422 `LIST_STAGE_TRANSITION_FORBIDDEN`，提示「目前階段為 {currentStage}，禁止編輯個別業務比例，請先 Rollback 至個別業務比例設定階段」
- **And** GET 端點不受此限（其他階段仍可唯讀檢視）

### AC-8：跨轄區嘗試操作—處長被回 403

- **Given** 處長 A 嘗試以處長 B 之轄區業務員 ID（`created_by = 處長 B 之 userId`）
- **When** 處長 A 透過 PUT `/api/v1/assignment/ratios/personnel/{listNo}` 嘗試寫入帶有不屬於處長 A 轄區之業務員設定
- **Then** 後端 `SectionChiefScopeGuard` 攔截，回 403 `PERSONNEL_RATIO_OUT_OF_SCOPE`（v1.0 新增）
- **And** GET 端點若處長 A 帶 `?deptCode={處長 B 轄區之部門}`，後端回空清單（不洩漏他人轄區存在性）；service 走 `scopeByCreator()` helper 統一過濾

### AC-9：部長 / Admin 可跨轄區操作

- **Given** 帳號持有「部長」或 Admin 權限
- **When** 進入個別業務比例設定頁
- **Then** 可選擇任一部門，查看並修改該部門所有業務員之 RATION
- **And** 後端 `SectionChiefScopeGuard` 對部長 / Admin 直接放行（不過濾轄區；BR-3）

### AC-10：前置條件—部門尚未設定 `ob_dept_pct` 不可進入個別業務比例

- **Given** 名單 `stage = 'personnel_ratio'`，但 `ob_dept_pct` 中該部門對應之紀錄不存在
- **When** 使用者嘗試對該部門業務員執行 PUT
- **Then** 後端回 422 `PERSONNEL_RATIO_DEPT_NOT_FOUND`（v1.0 新增），訊息：「部門 {deptCode} 尚未於部門比例設定階段配置，無法設定個別業務比例」
- **And** 此情境理論上不應觸發（F080 推進已驗證 `ob_dept_pct` 加總 = 100%），作為防禦 + Rollback 後資料一致性保護

### AC-11：月跑執行中禁止寫入

- **Given** `assignment_run` 中存在 `status IN ('pending', 'running')` 紀錄
- **When** 使用者嘗試進入編輯模式或呼叫 PUT
- **Then** 編輯按鈕顯示 disabled，hover 顯示「分派執行中，無法修改比例設定」
- **And** 若直接呼叫 API，service method 入口層 `AssignmentRunGuardService.assertNoRunningRun()` 拋 `ConflictException` 回 409 `ASSIGNMENT_RUN_ALREADY_RUNNING`（**v1.3 / 決議 #6**：集中於 `AssignmentRunGuardService`）

### AC-12：歷史月份拒絕寫入

- **Given** 名單 `project_workym < current_work_ym`
- **When** 使用者嘗試呼叫 PUT
- **Then** 後端回 403 `LIST_HISTORICAL_READONLY`
- **And** 清單頁中**完全不渲染**「設定個別比例」按鈕（沿用 F077 AC-2）

### AC-13：稽核日誌

- **Given** 任一 PUT 寫入成功
- **When** 寫入完成
- **Then** `assignment_audit_log` 寫入一筆：`action = 'SET_PERSONNEL_RATIO'`、`entity_type = 'ob_empl_set'`、`entity_id = list_no`、`metadata.deptid_m = {deptCode}`、`before_value` 為寫入前該部門所有 RATION 快照、`after_value` 為寫入後 RATION 快照

### AC-14：全員離職部門容許儲存（v1.3 新增 / 決議 #1）

- **Given** 某部門所有員工皆已離職（`isResigned = true` 全員）；`activeEmployeeCount === 0`
- **When** 處長 / Admin 呼叫 PUT `/api/v1/assignment/ratios/personnel/{listNo}`，request body `employees: []`（空清單）或包含 0% RATION 之離職員工（無論皆不影響此情境）
- **Then** `PersonnelRatioValidationService.assertDeptSumEquals100()` **早期短路 return**，**不阻擋儲存**
- **And** 該部門 `ob_empl_set` 寫入空紀錄（DELETE 後無 INSERT）；GET response `departments[x].sumValidated = false`、`allResigned = true`、`activeCount = 0`、`deptSum = 0.0`
- **And** 前端顯示警示：「此部門所有員工皆已離職，比例驗證已跳過」；後續 Stage 4 對此部門不分配任何案件，不影響其他部門

### AC-15：Feature Flag 關閉時 503（v1.3 新增 / 決議 #2）

- **Given** 系統 feature flag `ENABLE_E07_REFACTOR_PHASE3 = false`
- **When** 使用者呼叫 F082 任一 GET / PUT 端點
- **Then** `FeatureFlagGuard` 攔截，回 **503 Service Unavailable** + `FEATURE_NOT_ENABLED`
- **And** 前端可顯示「此功能尚未啟用，請聯繫 IT 維護人員」

## 5. API 規格

### 5.1 GET /api/v1/assignment/ratios/personnel/{listNo}

| 屬性 | 值 |
|---|---|
| 用途 | 取得名單之業務員清單與現有 RATION 設定（含轄區過濾） |
| 認證 | JWT 必填 |
| 授權 | `DirectorOrSectionChiefGuard`（admin OR business_role IN ('director', 'section_chief')）+ `SectionChiefScopeGuard`（service 層過濾轄區） |

**Query 參數**

| 名稱 | 必填 | 說明 |
|------|------|------|
| `deptCode` | 否 | 處長 / Admin 可帶此參數查單一部門；處長忽略此參數（始終回傳自己轄區） |

**Response — 200 OK**

```json
{
  "listNo": "OB202605001",
  "listNm": "車貸催收名單",
  "projectWorkym": "202605",
  "stage": "personnel_ratio",
  "isReadOnly": false,
  "viewerRole": "section_chief",
  "departments": [
    {
      "deptCode": "XTC0",
      "deptName": "業務一處",
      "deptRatio": 30.0,
      "directorName": "李處長",
      "isInScope": true,
      "activeCount": 3,
      "sumValidated": true,
      "allResigned": false,
      "employees": [
        { "empId": "EMP001", "empName": "張三", "ration": 40.0, "createdBy": "user-uuid-section-chief-A", "isResigned": false },
        { "empId": "EMP002", "empName": "李四", "ration": 35.0, "createdBy": "user-uuid-section-chief-A", "isResigned": false },
        { "empId": "EMP003", "empName": "王五", "ration": 25.0, "createdBy": "user-uuid-section-chief-A", "isResigned": false },
        { "empId": "EMP099", "empName": "已離職員工", "ration": 10.0, "createdBy": "user-uuid-section-chief-A", "isResigned": true }
      ],
      "deptSum": 100.0
    }
  ],
  "latestRejection": null
}
```

> `isInScope = true` 表示處長可編輯此部門；處長若帶 `deptCode` 屬於他人轄區，回 200 OK 並 `departments = []`（不洩漏他人轄區存在性）。
> `viewerRole` 用於前端決定是否顯示「部門切換器」（部長 / Admin 顯示，處長隱藏）。
> **`isResigned`（v1.2 新增 / PO 決議 F082-A）**：`true` 表示該員工於 `ob_emphire.resign_date IS NOT NULL`；前端應顯示「離職」badge；`deptSum` 計算僅含 `isResigned = false` 員工；既有 `ration` 紀錄保留供歷史追溯。
> **`activeCount` / `sumValidated` / `allResigned`（v1.3 新增 / 決議 #1 全員離職分支）**：(1) `activeCount`：該部門 `isResigned = false` 員工人數；(2) `sumValidated`：本次回傳之 `deptSum` 是否通過 100% 驗證（容忍 ±0.01%），若 `activeCount === 0` 自動為 `false`；(3) `allResigned`：`activeCount === 0` 時為 `true`，表示該部門所有員工皆已離職，per-DEPT 驗證已跳過儲存，且 `deptSum = 0%` 屬合法情境，前端應於該部門子表顯示警示「此部門所有員工皆已離職，比例驗證已跳過」。
> **`directorName`（v1.6 新增 / commit 38eb0dc）**：該部門目前處長姓名，定義對齊 [F079 §5.1 / F079 BR-14](F079-set-dept-ratio.md#5-api-規格)（`SELECT TRIM(emp_nm) FROM ob_emphire WHERE TRIM(dept_code)=? AND resign_date IS NULL AND TRIM(jfun_nm)='處長' ORDER BY hire_date ASC LIMIT 1`；同部門有多位處長時取最早入職者；查無對應人員時為 `null`）。F082 與 F079 共用同一來源以保持兩頁面顯示一致。
> **`deptRatio > 0` 過濾語意（v1.6 新增 / commit 150acbe / BR-18）**：service GET 只回傳 `deptRatio > 0` 之部門：(1) `deptRatio = null`（該 `(project_workym, list_no, deptCode)` 於 `ob_dept_pct` 無紀錄）→ **隱藏**；(2) `deptRatio = 0`（部長刻意將該部門排除本月分派）→ **隱藏**；(3) `deptRatio > 0` → 顯示。此規則對處長 / 部長 / Admin 一致；用意為個別業務比例設定階段不應呈現本月不參與分派之部門。

#### 5.x SectionChiefScopeGuard 行為對照表（v1.3 新增 / 決議 #4）

`SectionChiefScopeGuard` 依 HTTP method 分支：

| Method | Guard 行為 | 越權回應 |
|---|---|---|
| GET | 不攔截 | service 呼叫 `resolveSectionChiefScope(userId)` 取 dept_code 後過濾 `visibleDeptCodes`；scope=null 或越權帶 `deptCode` 回 200 OK + `departments = []`（不洩漏存在性） |
| PUT / POST | 攔截 | 比對 `dto.deptCode === scope`，不符或 scope=null → 403 `PERSONNEL_RATIO_OUT_OF_SCOPE` |

> Guard 與 service 層分工：(1) GET 路徑由 service `scopeByCreator()` 統一 WHERE 過濾，避免揭露他人轄區存在性；(2) PUT / POST 路徑由 Guard 攔截，避免進入 service 層；(3) admin / director 任意 method 直接放行，不執行轄區檢查。

> **`latestRejection`（v1.1 新增 / OQ-E07-21 落地）**：若該名單最近一次 `assignment_approval` 為 `action = 'reject'`，則回該紀錄之 `{ rejectReason, rejectorName, rejectorRole, rejectedAt }`；若最近一筆為 `action = 'approve'` 或從未被簽核，回 `null`。前端依此欄位渲染 §7.x banner（資料來源由 [F087 §6 BR-11](F087-reject-to-personnel-ratio.md#6-商業規則) 規範）。

### 5.2 PUT /api/v1/assignment/ratios/personnel/{listNo}

| 屬性 | 值 |
|---|---|
| 用途 | 寫入 / 覆寫某名單之單一部門業務員 RATION |
| 認證 | JWT 必填 |
| 授權 | `DirectorOrSectionChiefGuard` + `SectionChiefScopeGuard`（檢查目標 deptCode 屬處長轄區） |

**Request Body**

```json
{
  "deptCode": "XTC0",
  "deptName": "業務一處",
  "employees": [
    { "empId": "EMP001", "empName": "張三", "ration": 40.0 },
    { "empId": "EMP002", "empName": "李四", "ration": 35.0 },
    { "empId": "EMP003", "empName": "王五", "ration": 25.0 }
  ]
}
```

**Response — 200 OK**

```json
{
  "listNo": "OB202605001",
  "deptCode": "XTC0",
  "savedCount": 3,
  "deptSum": 100.0,
  "savedAt": "2026-05-15T13:00:00Z",
  "savedBy": "user-uuid-section-chief-A",
  "autoAdvanced": false,
  "newStage": null,
  "autoAdvanceFailReason": null
}
```

> **`autoAdvanced` / `newStage` / `autoAdvanceFailReason`（v1.7 新增 / F084 v2.0 auto-advance 改造）**：本 PUT 為 F084 v2.0「自動推進至簽核」之**觸發宿主**。PUT 寫入成功後，若 `ENABLE_E07_AUTO_ADVANCE_TO_APPROVAL` flag = on，後端於**同一 transaction 內**偵測該名單所有有在職員工的部門 RATION 加總是否均 = 100%（容忍 ±0.01%，沿用 BR-2 / I-8；全員離職部門短路通過，沿用 BR-13 / F084 BR-12），完成則自動將 `stage` 由 `'personnel_ratio'` 推進至 `'approval'`。三欄位語意：
> - **`autoAdvanced: boolean`**：本次 PUT 是否觸發了自動推進成功。`true` = stage 已自動推進至 `approval`；`false` = 未推進（部分部門未完成 / flag off / 競爭條件 no-op / 月跑 guard 阻擋）。
> - **`newStage: string | null`**：`autoAdvanced = true` 時為 `"approval"`；否則為 `null`。
> - **`autoAdvanceFailReason?: string | null`**：僅於「auto-advance 因月跑 guard 阻擋而跳過」時為 `"ASSIGNMENT_RUN_ALREADY_RUNNING"`（PUT 本身仍回 200、不 rollback）；其餘 `autoAdvanced = false` 情境（部分完成 / flag off / lock 等待逾時降級 / stage 已推進之 idempotent no-op）一律為 `null`（不帶 failReason）。
>
> 觸發流程、advisory lock、idempotent 與降級行為彙總詳 [F084 §5.2](F084-advance-to-approval.md#52-auto-advance-觸發流程主路徑無獨立-endpoint) 與 [F084 §6 BR-11~BR-16](F084-advance-to-approval.md#6-業務規則)。**本 PUT 既有寫入語意（覆寫式、轄區 Guard、容差 ±0.01%、稽核）完全不變**；auto-advance 為附加於成功寫入後之同一 tx 行為。

**錯誤回應**

| HTTP | 錯誤碼 | 說明 |
|---|---|---|
| 401 | AUTH_TOKEN_MISSING / AUTH_TOKEN_EXPIRED | 未登入或 Token 過期 |
| 403 | AUTH_FORBIDDEN | 非 admin / director / section_chief 任一身份 |
| 403 | LIST_HISTORICAL_READONLY | `project_workym < current_work_ym` |
| 403 | PERSONNEL_RATIO_OUT_OF_SCOPE | **v1.0 新增**：處長嘗試寫入不屬於自己轄區之 deptCode 或業務員 |
| 404 | ASSIGNMENT_LIST_NOT_FOUND | `list_no` 不存在 |
| 409 | ASSIGNMENT_RUN_ALREADY_RUNNING | 月跑執行中 |
| 422 | ASSIGNMENT_LIST_INACTIVE | 名單已停用 |
| 422 | LIST_STAGE_TRANSITION_FORBIDDEN | `stage != 'personnel_ratio'` |
| 422 | PERSONNEL_RATIO_DEPT_NOT_FOUND | **v1.0 新增**：`ob_dept_pct` 中該 `(project_workym, list_no, deptCode)` 不存在 |
| 422 | PERSONNEL_RATIO_SUM_NOT_100 | **v1.0 新增**：該部門業務員 RATION 加總超出 [99.99, 100.01] |
| 422 | RATIO_OUT_OF_RANGE | 任一 RATION 超出 [0, 100]（沿用 F079 v1.0 錯誤碼） |
| 503 | FEATURE_NOT_ENABLED | **v1.3 新增**：feature flag `ENABLE_E07_REFACTOR_PHASE3 = false`（決議 #2 / 沿用 F050 v2.0 §13.2 統一 fallback 行為） |

## 6. 商業規則

| 規則編號 | 說明 |
|---|---|
| BR-1 | **per-LIST_NO + per-DEPT 設計**：本 Feature 以 per-LIST_NO + per-DEPT 業務員比例為單位；PUT 端點僅寫入單一部門；多部門需多次呼叫（簡化前端 Guard 與稽核日誌寫入語意） |
| BR-2 | **比例驗證（I-8）**：每 `(list_no, deptid_m)` 下所有 RATION 加總落於 [99.99, 100.01]（容忍 ±0.01%）；任一 RATION 落於 [0, 100]。**注意**：與 F079 之「per-LIST_NO 加總 100%」語意不同；本 Feature 為「per-DEPT 加總 100%」 |
| BR-2a | **「相對 %」UI 顯示語意（OQ-E07-40 用戶決議落地，2026-05-15）**：本 Feature 顯示給處長 / 部長 / Admin 之 RATION 數值均為**相對部門內**的百分比（部門內加總 = 100%），**不顯示對全名單之絕對百分比**（例：部門配額 30%，3 人各介面顯示 ~33.33%，意指相對值）；DB 落地語意（相對 % vs 絕對 %）由 system-architect 決議（[ASSUMPTION] 詳 §12 A-7） |
| BR-3 | **轄區規則（v1.5 修訂 / 2026-05-21；I-3）**：處長轄區由 `resolveSectionChiefScope(userId)` 反查決定（`users.email ↔ ob_emphire.email + jfun_nm='處長' + 在職` → 取 `dept_code`）；service 層改用此 scope 過濾 GET 之 `visibleDeptCodes` 與 PUT 之 `dto.deptCode` 越權檢查。**廢除原 `scopeByCreator(ob_empl_set.created_by)` 邏輯**（chicken-and-egg：首次 GET 時 ob_empl_set 為空 → 處長永遠回空清單）。scope=null 時：GET 回 `departments=[]`、PUT 回 403 `PERSONNEL_RATIO_OUT_OF_SCOPE`。詳 [F074 v2.1 BR-1](F074-define-section-chief-role.md#6-商業規則) |
| BR-4 | **角色矩陣（I-7）**：本 Feature 開放 `admin` / `business_role = 'director'` / `business_role = 'section_chief'`；其他角色回 403 `AUTH_FORBIDDEN`（與 F079 不同；本 Feature 處長為主要 Actor） |
| BR-5 | **`stage = 'personnel_ratio'` 限制**：只允許此階段寫入；非此階段一律 422 `LIST_STAGE_TRANSITION_FORBIDDEN`（透過 `StageTransitionService.assertStageEquals(listNo, 'personnel_ratio')` helper 統一檢查） |
| BR-6 | **業務員清單來源（v1.2 修訂 / PO 決議 F082-A）**：`SELECT emp_id, emp_name, dept_code, dept_name, (resign_date IS NOT NULL) AS is_resigned FROM appdb.ob_emphire ORDER BY dept_code, is_resigned ASC, emp_id`；**全部員工，不過濾 resign_date**；在職員工排序在前；`appdb.ob_emphire` 來源於 [data-model.md#ob-emphire-entity](../data-model.md#ob-emphire-entity） |
| BR-7 | **覆寫式寫入**：PUT 為「該部門整段覆寫式」：先 `(list_no, deptid_m)` 之既有紀錄 DELETE，再 INSERT request payload 之業務員；於同一 transaction 內執行 |
| BR-8 | **DB transaction**：DELETE + INSERT + 稽核寫入需於同一 DB transaction 內執行（[ASSUMPTION] 待 system-architect 決議） |
| BR-9 | **稽核失敗不 rollback**：稽核寫入 `assignment_audit_log` 失敗僅 Logger.error，不 rollback 業務 commit（沿用 F050 v2.0 BR-11） |
| BR-10 | **不可與月跑並發**：`assignment_run.status IN ('pending', 'running')` 時禁止寫入；GET 不受影響 |
| BR-11 | **歷史月份阻截（沿用 F077 BR-3）**：`project_workym < current_work_ym` 一律 403 `LIST_HISTORICAL_READONLY` |
| BR-12 | **前置條件 `ob_dept_pct` 必先建立**：寫入前 service 層查詢 `ob_dept_pct WHERE (project_workym, list_no, obdeptid = :deptCode)` 至少 1 筆；不存在則 422 `PERSONNEL_RATIO_DEPT_NOT_FOUND`（防範前置斷裂；F080 推進已驗證） |
| BR-13 | **離職員工顯示與比例計算規則（v1.2 修訂 / PO 決議 F082-A）**：(1) UI 顯示：`isResigned = true` 員工於業務員清單顯示「離職」badge（灰底 / 警示色），ration 輸入框 disabled 不可編輯；(2) 比例驗證（per-DEPT 加總 100%）：**僅含 `isResigned = false` 之在職員工**；離職員工 ration 不參與加總，亦不影響「儲存」按鈕啟用條件；(3) 既有 `ob_empl_set` 紀錄保留：員工為設定當下在職且已寫入 ration，後續離職時 `ob_empl_set.ration` 紀錄不主動清除（保歷史追溯）；(4) 寫入時防護：PUT request body 的 `employees[]` **不可包含** `isResigned = true` 之員工；若 service 層偵測到 body 含離職 `empId`，回 422 `RATIO_OUT_OF_RANGE`（暫沿用此錯誤碼，提示「員工不存在 / 已離職」之語意，details 含 `invalidEmpIds` + `resignedEmpIds`）；後續批次再評估獨立錯誤碼 `PERSONNEL_RATIO_INVALID_EMPLOYEE` |
| BR-14 | **`SectionChiefScopeGuard` 設計（v1.5 修訂 / 2026-05-21）**：(1) admin / director 直接放行；(2) section_chief 依 HTTP method 分支：GET **不攔截**，由 service 呼叫 `resolveSectionChiefScope(userId)` 取得 dept_code 後過濾 `visibleDeptCodes`（scope=null 或越權帶 `deptCode` 回 200 + `departments=[]`）；PUT / POST **攔截**：比對 `dto.deptCode === scope`，不符或 scope=null 回 403 `PERSONNEL_RATIO_OUT_OF_SCOPE`；(3) **廢除 v1.3 之「`ob_empl_set.created_by` 比對」**（chicken-and-egg）；(4) 後續 M03d / 簽核流程沿用此設計。對照表詳 §5.x |
| BR-15 | **月跑並發守衛（v1.3 / 決議 #6）**：所有 F082 寫入 service method 入口層呼叫 `await this.assignmentRunGuardService.assertNoRunningRun()`；該 service 由 `AssignmentRunGuardService` 集中實現（架構位置：assignment 模組底層，與 `StageTransitionService` 同層）；查詢 `assignment_run.status IN ('pending', 'running')`，若有則拋 `ConflictException` (409) + `ASSIGNMENT_RUN_ALREADY_RUNNING`（月跑必須 `status = 'completed'` / `'failed'`）方能繼續寫入 |
| BR-16 | **Feature Flag fallback（v1.3 / 決議 #2）**：F082 PUT / GET 端點均掛 `FeatureFlagGuard` 保護；`ENABLE_E07_REFACTOR_PHASE3 = false` 時回 **503 Service Unavailable** + `FEATURE_NOT_ENABLED`（沿用 F050 v2.0 §13.2 統一行為）；flag = true 時正常運作 |
| BR-17 | **FE per-row ±N% 模板採 baseline + per-employee templates 模型（v1.6 / commit 6402cd3）**：FE 套用 F083 之 ±N% 模板時，以「baseline + per-employee templates」資料模型計算各業務員之最終 ration，保證**對稱性**（同一 baseline 下，不同員工套用同一 template 必得相同 ration；同一員工反覆套用同一 template 必得相同結果）。**baseline 設定時機（三種）**：(1) **首次進入頁面**：baseline = 後端 GET 回傳之該員工 ration；若全員 ration 皆為 0 或 null（無 `ob_empl_set` 紀錄）則 fallback 為 `100 / activeCount` 均分；(2) **點擊「均等分配」按鈕**：所有員工 baseline 重置為 `100 / activeCount` + 清除所有 per-employee template；(3) **手動編輯 RatioInput**：該員工 baseline = 輸入值 + 清除該員工之 template（不影響其他員工 baseline）。模板計算後仍由 F082 PUT 之主流程 `assertDeptSumEquals100` 校驗（容忍 ±0.01%）；F083 後端 `appliedTemplate` 校驗已弱化為「audit hint + invariant 最小校驗」（詳 [F083 v1.4 §5.2 / BR-9](F083-quick-ratio-template.md#52-後端儲存路徑沿用-f082)） |
| BR-18 | **GET 過濾 deptRatio > 0 部門（v1.6 / commit 150acbe）**：service `getPersonnelRatios()` 只回 `deptRatio > 0` 之部門；`deptRatio = null`（`ob_dept_pct` 無紀錄）或 `deptRatio = 0`（部長刻意排除本月）均**隱藏**。此規則對處長 / 部長 / Admin 一致。理由：個別業務比例設定階段不應呈現本月不參與分派之部門（避免處長對 0% 部門徒勞設定個別比例）。詳 §5.1 GET response 說明 |
| BR-19 | **Auto-Advance 觸發宿主（v1.7 / F084 v2.0 auto-advance 改造）**：本 PUT 為 F084 v2.0「自動推進至簽核」之觸發點。PUT 寫入成功後，若 `ENABLE_E07_AUTO_ADVANCE_TO_APPROVAL` flag = on，後端於**同一 transaction 內**呼叫 F084 auto-advance 完成度偵測；所有有在職員工的部門 RATION 加總均 = 100%（±0.01%，沿用 BR-2；全員離職部門短路沿用 BR-13）則自動推進 `stage` → `'approval'`。觸發行為、advisory lock + idempotent、月跑 guard 降級、稽核（`STAGE_ADVANCE` + `metadata.auto_advanced_by_completion = true`）等細節**全部由 F084 規範**（[F084 §5.2 / §6 BR-11~BR-16](F084-advance-to-approval.md#52-auto-advance-觸發流程主路徑無獨立-endpoint)）；本 BR 僅說明「F082 PUT 為觸發宿主」。結果經本 PUT response `autoAdvanced` / `newStage` / `autoAdvanceFailReason` 三欄位回傳（見 §5.2）。**本 PUT 既有寫入 / 校驗 / 容差 / 轄區 Guard 語意完全不變**；flag = off 時 auto-advance 完全不執行（response `autoAdvanced: false`）。advisory lock 具體 API 與 transaction 邊界待 system-architect（F084 §12 A-5~A-7） |

## 7. UI/UX 需求

- **「設定個別比例」按鈕**：
  - 位於 F048 / F077 清單頁「個別業務比例設定」階段名單之操作欄
  - 處長 / 部長 / Admin 才顯示（沿用 F077 角色 × 階段操作矩陣）
  - 已停用名單 / 非 `personnel_ratio` 階段 / 歷史月份**完全不渲染**
  - 月跑執行中 disabled + hover 提示
- **設定頁面布局**：
  - 標題：「名單：{listNm}（{listNo}）— 個別業務比例設定」
  - 部長 / Admin：頁首多顯示「部門切換器」（下拉選擇器，列出該名單 `ob_dept_pct` 之部門）
  - 處長：頁首僅顯示「本轄區：{deptName}（單一）」標籤，無切換器
  - 主編輯區以部門為單位拆分為多個子表（部長 / Admin 可摺疊；處長僅渲染本轄區部門）
  - 子表欄位：員工工號 / 員工姓名 / RATION 輸入框 / 快速模板按鈕區（詳 F083）/ 操作欄
  - 子表底部：動態加總「{deptName} 目前加總：N% / 100%」「儲存」按鈕（per-DEPT 啟用 / 停用）
- **數值輸入框**：
  - 小數最多兩位（HTML `<input type="number" step="0.01" min="0" max="100">`）
  - 即時驗證 + 紅色框 + 錯誤訊息
- **加總顯示**：當前值與 100% 差以內，加總顯示綠色（容忍範圍內）；超出則紅色
- **預設值與初始狀態**：
  - 已有 `ob_empl_set` 紀錄者直接載入既有 RATION
  - 未有紀錄者載入「系統預設值 = 100% / 該部門業務員人數」（暫存於前端；前端計算並儲存後才落 DB）
- **快速模板按鈕**：詳 [F083 §7](F083-quick-ratio-template.md#7-uiux-需求)（每位業務員列右側按鈕，本 Feature 提供即時加總 + 後端驗證）
- **成功提示 toast**：「{deptName} 個別業務比例已儲存」
- **唯讀模式**：當 `stage != 'personnel_ratio'` 時顯示唯讀子表，不渲染「儲存」按鈕；表格上方顯示提示「此名單已推進至 {currentStage} 階段，個別業務比例為唯讀；如需修改請先 Rollback 至個別業務比例設定階段」
- **轄區外無資料提示**（處長視角）：若處長轄區內無對應部門設定（無論存在與否），顯示「您的轄區內無此名單之業務員設定，請聯繫部長確認」

### 7.x 拒絕 Banner 渲染與互動規格（v1.1 新增 / OQ-E07-21 用戶決議落地）

> **本 Feature（F082 v1.1）規範**：banner **渲染與互動**（樣式 / 內容範圍 / 互動行為 / 視覺風格）。
> **F087 規範**：banner **觸發機制**（拒絕儲存 + GET 回傳 `latestRejection` 欄位）。

- **觸發條件**：F082 GET `/api/v1/assignment/ratios/personnel/{listNo}` 回傳之 `latestRejection != null` 時，前端於頁面右上方渲染 banner（無論使用者主動或被動查看）
- **Banner 內容範例**：「部長 {rejectorName}（{rejectorRole 中譯：部長 / Admin}）於 {rejectedAt 之時間格式 2026/05/15 13:00} 拒絕了此名單。拒絕原因：{rejectReason}」
  - 若 `rejectReason` 超過 80 字，前端應截斷顯示前 30 字 + 「…」+ 「展開全文」連結
- **互動設計**：
  - **可關閉的「✕」按鈕**：點擊後 banner 消失；前端透過 LocalStorage 記憶「(listNo + rejectedAt)」之關閉狀態，之後重新進入 / 重新整理頁面不再顯示
  - **「收合」按鈕**：縮小為單行警示「最近拒絕：{rejectReason 前 30 字}…」（icon 維持顯示，色彩維持警示色）；點擊收合後可展開「展開」連結恢復完整顯示
  - 點擊 banner 任一處可展開 / 收合（避免使用者誤觸到關閉而忽略內含資訊）
  - 處長與部長兩角色均顯示 banner（拒絕原因由部長填寫，處長為主要受眾，但部長亦可看到以追蹤自己之操作）
- **Banner 生命週期**：
  - **每次新拒絕觸發新 banner**：當 F087 寫入新 `assignment_approval` reject 紀錄（`rejectedAt` 變動）時，LocalStorage key 不匹配，banner 自動恢復顯示
  - **核准 / Rollback 時 banner 消失**：F086 寫入新 `action = 'approve'` 紀錄、F089 Rollback 清空 `assignment_approval` 後，GET response `latestRejection = null`，banner 不渲染
- **跨頁面範圍**：banner **僅於 F082 頁面顯示**；F079 / F048 / F077 / F088 不顯示
- **色彩建議**：
  - 警示色（建議橙色 / 黃色，避免極端紅色）+ 警示 icon
  - 邊框寬度建議 4px（左側強調，不喧賓奪主）
  - 完整模式高度 ~ 60~80px；收合模式高度 ~ 32px
  - 拒絕者帳號 ID 以 monospace 字型強調，便於閱讀技術細節
- **可訪問性（Accessibility）**：
  - 適當 ARIA role（建議 `role="alert"`），讓螢幕閱讀器於頁面載入時主動播報
  - 關閉與收合按鈕需含 `aria-label`
  - LocalStorage key 設計：`e07-banner-dismissed-{listNo}-{rejectedAt-timestamp}`（建議結構，由 UI/UX agent 確認）

**Banner 與 F087 cross-spec 邊界**：拒絕原因儲存與資料來源於 [F087 §6 BR-11](F087-reject-to-personnel-ratio.md#6-商業規則) 規範；本節僅規範 UI 渲染與互動行為。

## 8. 相依性

- **Blocked By**：
  - F080（推進至 `personnel_ratio`，提供 `stage = 'personnel_ratio'` 名單）
  - F079（部門比例設定，本 Feature 之前置 `ob_dept_pct` 來源）
  - F074（處長角色定義 + `created_by` 轄區規則，BR-3 來源）
  - F073（部長角色定義，BR-4 來源）
  - F077 v1.0（`current_work_ym` + `stage` + 角色 × 階段操作矩陣）
- **Blocks**：
  - F083（獎懲快速比例模板；本 Feature 之 UI 子模組）
  - F084 v2.0（個別業務比例設定階段「自動推進」至簽核；**本 PUT 為 auto-advance 觸發宿主**，前置條件含本 Feature 之部門加總 = 100%；詳 BR-19 / §5.2）
  - F061（月跑 Stage 4 之人員比例讀取 `ob_empl_set`）
- **Rollback 反向**：F085（M03b Rollback 至 M03a，清空本 Feature 寫入之 `ob_empl_set`）
- **取代**：[F058 v1.x DEPRECATED](F058-edit-personnel-ratio.md)

## 9. 交叉參考

- **權威矩陣**：[F002 §4.6 E07 角色矩陣](F002-user-login.md#e07-角色矩陣)
- **資料模型**：
  - [data-model.md#ob-empl-set-obemplsetmf--人員比例設定](../data-model.md#ob_empl_setobemplsetmf--人員比例設定)
  - [data-model.md#ob-emphire-entity](../data-model.md#ob-emphire-entity)（**v1.2**：來源 `appdb.ob_emphire` 由 ETL E07-OBEMPHIRE-Load pipeline 載入；BR-6 / BR-13 之 `isResigned` 欄位來源 `resign_date IS NOT NULL`）
  - [data-model.md#ob-dept-pct-obmdeptpct--per-list-no-部門比例](../data-model.md#ob_dept_pctobmdeptpct--per-list-no-部門比例)
  - [data-model.md#current-work-ym-rule](../data-model.md#current-work-ym-rule)
- **錯誤處理**：
  - [error-handling.md#assignment-ratio-errors](../error-handling.md#assignment-ratio-errors)（`PERSONNEL_RATIO_SUM_NOT_100` / `PERSONNEL_RATIO_DEPT_NOT_FOUND` / `RATIO_OUT_OF_RANGE`）
  - [error-handling.md#assignment-stage-transition-errors](../error-handling.md#assignment-stage-transition-errors)（`LIST_STAGE_TRANSITION_FORBIDDEN`）
  - [error-handling.md#assignment-role-errors](../error-handling.md#assignment-role-errors)（`PERSONNEL_RATIO_OUT_OF_SCOPE`）
- **架構決策**：
  - [F074](F074-define-section-chief-role.md)（處長角色與 `created_by` 限縮）
  - [F002 §4.6](F002-user-login.md#e07-角色矩陣)（含新 Guard 規格）
  - [ASSUMPTION] 待 `SectionChiefScopeGuard` 設計（§12 A-1，由 system-architect 提出）
- **相關功能**：
  - [F048 v2.0](F048-view-list-definition.md) / [F077](F077-month-switch-and-stage-overview.md)（M01 入口）
  - [F079](F079-set-dept-ratio.md)（部門比例設定，本 Feature 之前置）
  - [F080](F080-advance-to-personnel-ratio.md)（推進至 `personnel_ratio`，本 Feature 之觸發條件）
  - [F083](F083-quick-ratio-template.md)（獎懲快速模板；本 Feature 之 UI 子模組）
  - [F084](F084-advance-to-approval.md)（推進至簽核，本 Feature 之後續）
  - [F085](F085-rollback-to-dept-ratio.md)（Rollback 至部門比例，本 Feature 之逆操作）
  - [F058 v1.x DEPRECATED](F058-edit-personnel-ratio.md)
  - [F061](F061-trigger-assignment-run.md)（月跑 Stage 4 讀取）
- **圖表**：
  - [diagrams/F082-personnel-ratio-flow.mmd](../diagrams/F082-personnel-ratio-flow.mmd)（個別業務比例設定流程，含轄區 Guard + 模板套用 + advance / rollback 子流程）
  - [diagrams/F077-stage-overview.mmd](../diagrams/F077-stage-overview.mmd)（五階段總覽流程）

## 10. 測試覆蓋率要求

- 單元測試覆蓋率 ≥ 80%
- 後端關鍵測試案例：
  - GET 處長視角：僅回傳轄區之業務員（`created_by = currentUserId`）
  - GET 部長視角：回傳所有部門之所有業務員
  - GET 處長帶 `deptCode` 屬於他人轄區 → 200 OK 並 `departments = []`
  - PUT 處長寫入轄區之 deptCode → 成功
  - PUT 處長寫入他人轄區 deptCode → 403 `PERSONNEL_RATIO_OUT_OF_SCOPE`
  - PUT 處長寫入 body 含他人轄區 empId → 403 `PERSONNEL_RATIO_OUT_OF_SCOPE`
  - PUT 部長寫入任意部門 → 成功
  - PUT 加總 = 100.00 → 成功儲存
  - PUT 加總 = 99.99 / 100.01 → 成功儲存（容忍誤差內）
  - PUT 加總 = 99.98 / 100.02 → 422 `PERSONNEL_RATIO_SUM_NOT_100`
  - PUT 任一值 = -0.01 / 100.01 → 422 `RATIO_OUT_OF_RANGE`
  - PUT RATION = 0 + 其他加總 100% → 成功儲存（AC-6）
  - PUT 對 `stage = 'dept_ratio'` 名單 → 422 `LIST_STAGE_TRANSITION_FORBIDDEN`
  - PUT 對 `stage = 'approval'` 名單 → 422 `LIST_STAGE_TRANSITION_FORBIDDEN`
  - PUT `ob_dept_pct` 不存在之部門 → 422 `PERSONNEL_RATIO_DEPT_NOT_FOUND`
  - PUT body 含已離職 empId → 422 `RATIO_OUT_OF_RANGE`（details 含 `invalidEmpIds`）
  - PUT 歷史月份 → 403 `LIST_HISTORICAL_READONLY`
  - PUT 月跑執行中 → 409 `ASSIGNMENT_RUN_ALREADY_RUNNING`（**v1.3**：由 `AssignmentRunGuardService.assertNoRunningRun()` 拋出）
  - **v1.3 新增**：PUT 全部員工離職（`activeCount = 0`）→ 200 OK 容許儲存 + `sumValidated = false` + `allResigned = true`
  - **v1.3 新增**：GET 全部員工離職 → response `activeCount = 0` + `sumValidated = false` + `allResigned = true`
  - **v1.3 新增**：GET / PUT feature flag = false → 503 `FEATURE_NOT_ENABLED`
  - **v1.3 新增**：GET 處長帶他人轄區 `deptCode` → 200 + `departments = []`（Guard 不攔截、service 層 filter）
  - **v1.3 新增**：PUT 處長越權 `deptCode` → 403 `PERSONNEL_RATIO_OUT_OF_SCOPE`（Guard 攔截）
  - PUT 覆寫式寫入：原本 5 筆，新寫入 3 筆 → DB 該部門僅剩 3 筆，**前次稽核紀錄不受影響**
  - 多部門隔離：處長 A 寫入 XTC0 不影響 XTD0 之 `ob_empl_set` 紀錄
  - 稽核 `before_value` / `after_value` 完整寫入；`metadata.deptid_m` 正確紀錄
- 前端關鍵測試案例：
  - 處長視角僅渲染本轄區之單一部門子表
  - 部長視角渲染部門切換器 + 所有部門子表
  - 各部門加總獨立顯示與獨立啟用 / 停用「儲存」按鈕
  - 預設值與既有值載入正確（顯示 100% / N 或既有值）
  - 唯讀模式正確渲染（推進後檢視）
- E2E：F079（部門比例 100%）→ F080（推進至 personnel_ratio）→ F082（處長 A 設定 XTC0 加總 100% 儲存）→ 處長 B 設定 XTD0 加總 100% 儲存 → F084（推進至 approval，要求所有部門完成驗證）

## 11. 實作 Checklist

- [ ] 後端實作 `GET /api/v1/assignment/ratios/personnel/{listNo}` 端點 + Service
- [ ] 後端實作 `PUT /api/v1/assignment/ratios/personnel/{listNo}` 端點 + Service
- [ ] 後端套 `DirectorOrSectionChiefGuard`（admin / director / section_chief）+ `SectionChiefScopeGuard`（service 層 `scopeByCreator()` helper）
- [ ] 後端套 `StageTransitionService.assertStageEquals(listNo, 'personnel_ratio')` + `LIST_HISTORICAL_READONLY` Guard + 月跑檢查
- [ ] 後端套用「per-DEPT 比例驗證」helper（建議新建 `PersonnelRatioValidationService.assertDeptSumEquals100(deptRatios)`，與 F079 之 `RatioValidationService.assertSumEquals100` 並列；詳 §12 A-2）
- [ ] error-handling.md 新增 `PERSONNEL_RATIO_SUM_NOT_100` / `PERSONNEL_RATIO_DEPT_NOT_FOUND` / `PERSONNEL_RATIO_OUT_OF_SCOPE` 3 個錯誤碼
- [ ] 前端「設定個別比例」按鈕渲染條件
- [ ] 前端比例設定頁含部門子表結構 / 處長 vs 部長視角差異 / 動態加總 / 即時驗證 / 唯讀模式切換
- [ ] 前端模板按鈕串接（沿用 F083 模組）
- [ ] 圖表：[diagrams/F082-personnel-ratio-flow.mmd](../diagrams/F082-personnel-ratio-flow.mmd)
- [ ] 整合測試：F080 → F082（多部門隔離）→ F084 路徑驗證
- [ ] **v1.3 / 決議 #6**：實作 `AssignmentRunGuardService.assertNoRunningRun(workYm?)`（assignment 模組底層，與 `StageTransitionService` 同層）；F082 寫入 service 入口層呼叫
- [ ] **v1.3 / 決議 #2**：F082 端點掛 `FeatureFlagGuard`（沿用 F050 v2.0 §13.2 統一機制），flag = false → 503 + `FEATURE_NOT_ENABLED`
- [ ] **v1.3 / 決議 #4**：`SectionChiefScopeGuard` 依 HTTP method 分支實作（GET 不攔截、PUT/POST 攔截）；service 層 `scopeByCreator()` helper 統一處理 GET filter
- [ ] **v1.3 / 決議 #1**：`PersonnelRatioValidationService.assertDeptSumEquals100()` 增加短路邏輯 `if (activeEmployeeCount === 0) return;`；GET response 補 `activeCount` / `sumValidated` / `allResigned` 三欄位
- [ ] **v1.3 / 決議 #5**：建立 `apps/api/test/fixtures/ob-emphire.fixture.ts` 共用 fixture factory（`buildObEmphire()` + `allResignedDeptSeed()` 等場景 helper）

### 測試 Fixture 策略（v1.3 / 決議 #5）

Integration test 使用 `apps/api/test/fixtures/ob-emphire.fixture.ts` 共用 fixture factory：

| Helper | 用途 |
|---|---|
| `buildObEmphire(overrides)` | 建立單一 ob_emphire 紀錄；預設在職、可覆寫任意欄位 |
| `allResignedDeptSeed(deptCode)` | 建立指定部門「全員離職」場景之 seed data（用於 AC-14 測試） |
| `mixedActiveResignedDeptSeed(deptCode, activeCnt, resignedCnt)` | 建立指定部門「部分在職、部分離職」場景之 seed data |

**ob_emphire 必填欄位清單（system-architect 決議）**：
```
emp_id      VARCHAR(10) PK
emp_nm      VARCHAR(50) NULL
dept_code   VARCHAR(10) NULL
resign_date DATE NULL    (NULL = 在職; 非 NULL = 離職)
```

> Fixture 屬實作層產物；本 spec 僅規範介面與必填欄位清單，實作細節詳 [data-model.md#ob-emphire-entity](../data-model.md#ob-emphire-entity)。

## 12. 假設

| # | 假設 | 標記 |
|---|---|---|
| A-1 | ~~**待 `SectionChiefScopeGuard` 設計**~~ **[RESOLVED] 2026-05-16 / system-architect 決議 #4**：依 HTTP method 分支：(1) GET **不攔截**，由 service 走 `scopeByCreator(currentUserId)` 統一 SQL WHERE 過濾（越權回 200 + `departments = []`）；(2) PUT / POST **攔截**，由 request body / params 取出 `deptCode` + `empIds` 比對 `created_by`，不符回 403 `PERSONNEL_RATIO_OUT_OF_SCOPE`；(3) admin / director 任意 method 直接放行。詳 §5.x 對照表 + §6 BR-14 | ✅ Resolved（system-architect，2026-05-16） |
| A-2 | **`PersonnelRatioValidationService` vs `RatioValidationService` 分立**：F079 已建立 `RatioValidationService.assertSumEquals100(ratios)`（per-LIST_NO 加總）。本 Feature 為「per-DEPT 加總」語意不同，建議**新建 `PersonnelRatioValidationService.assertDeptSumEquals100(deptId, ratios)`** 與既有 helper 並列（命名顯式、與 service 對應清晰）；或擴充既有 helper 加 `assertSumEquals100(ratios, scopeLabel)` 之 `scopeLabel` 參數以區分錯誤訊息。建議採前者（兩 service）以對應後續錯誤碼分立（`RATIO_SUM_NOT_100` vs `PERSONNEL_RATIO_SUM_NOT_100`） | [ASSUMPTION] 待 system-architect |
| A-3 | **`ob_empl_set` 是否補建 `project_workym` 欄位**：既有 OBEMPLSETMF schema 無 `project_workym`（PK 為 `(list_no, deptid_m, emplid, ration)`）；F085 Rollback 之以 `list_no` 為單位 DELETE 即可達成月份隔離（因 `list_no` 已含 `OB{YYYYMM}{NNN}` 暗示月份）。**本 spec 不要求補欄位**，但 system-architect 可評估是否補建以對應 F079 / `ob_dept_pct` 之設計一致性（`ob_dept_pct` 已有 `project_workym` 欄位） | [ASSUMPTION] 待 system-architect |
| A-4 | **覆寫式寫入 transaction 邊界**：DELETE 既值 + INSERT 新 RATION 是否強制於同 transaction 待 system-architect 決議；本 spec 預設於同 transaction 內（BR-8） | [ASSUMPTION] 待 system-architect |
| A-5 | **業務員離職資料處理**：~~本 spec 預設「離職員工不顯示於 GET response（過濾掉）」~~ **[RESOLVED] 2026-05-16 / PO 決議 F082-A**：離職員工**保留顯示**並帶 `isResigned = true` flag；UI 顯示「離職」badge；per-DEPT 比例驗證**僅排除離職員工**；既有 `ob_empl_set` ration 紀錄保留供歷史；PUT body 不可包含離職員工（BR-13）。詳 §1 / §6 BR-6 / BR-13 / §5.1 GET response | ✅ Resolved（PO，2026-05-16） |
| A-6 | ~~**本 Feature 是否納入 feature flag**~~ **[RESOLVED] 2026-05-16 / system-architect 決議 #2**：F082 上 `FeatureFlagGuard` 保護；`ENABLE_E07_REFACTOR_PHASE3 = false` 時回 **503 Service Unavailable** + `FEATURE_NOT_ENABLED`（沿用 F050 v2.0 §13.2 統一 fallback 行為）。詳 §6 BR-16 + §5.2 錯誤碼表 | ✅ Resolved（system-architect，2026-05-16） |
| A-7 | **DB 落地語意（相對 % vs 絕對 %）**：BR-2a 已確認 UI 顯示為「相對部門內之百分比」（OQ-E07-40 用戶決議）；但 `ob_empl_set.ration` 欄位之 DB 落地語意（相對 % 直接存值或絕對 % 計算後存）尚未決定。**選項 (A)** 存「相對 %」（與 UI 一致，但 Stage 4 須相乘 `ob_dept_pct.ration`，由 `fn_calc_tier_level` SP 處理邏輯轉換）；**選項 (B)** 存「絕對 %」（前端送出時即 × `ob_dept_pct.ration` 換算，DB 存值即為最終分配比例，UI 顯示時再除回相對值）。建議採 (A) 以與 SP 計算邏輯一致 + UI 顯示不需轉換 + `ob_dept_pct` 與 `ob_empl_set` 各司其職。**待 system-architect 決議** | [ASSUMPTION] 待 system-architect；**詳 open-questions.md OQ-E07-40 落地附註** |

## 13. 變更紀錄

| 版本 | 日期 | 變更內容 |
|---|---|---|
| v1.0 | 2026-05-15 | 初版（對應 US-112，E07 補修批次 5）：取代 F058 v1.x；限 `stage = 'personnel_ratio'` 寫入；新增處長 + 部長 + Admin 三角色 Actor；新增 `SectionChiefScopeGuard`（新 Guard，建議 system-architect 提出）；per-DEPT 加總驗證（與 F079 之 per-LIST_NO 加總語意不同）；新增 `PERSONNEL_RATIO_SUM_NOT_100` / `PERSONNEL_RATIO_DEPT_NOT_FOUND` / `PERSONNEL_RATIO_OUT_OF_SCOPE` 3 個錯誤碼；feature flag gating 評估納入 §12 A-6 待 system-architect 決議；模板按鈕設計交由 F083 規範 |
| v1.1 | 2026-05-15 | **E07 補修批次 6 修訂（OQ-E07-21 + OQ-E07-40 落地）**：(1) 新增 §7.x「拒絕 banner 渲染與互動」UI 規格（可關閉 / 收合 / LocalStorage 記憶 / 跨頁面範圍 / Accessibility）；(2) GET response 補 `latestRejection` 欄位（資料來源由 F087 BR-11 寫入）；(3) 新 BR-2a「相對 %」UI 顯示語意（OQ-E07-40 用戶決議）；(4) 新增 §12 A-7 DB 落地語意（相對 % vs 絕對 %）待 system-architect 決議 |
| v1.2 | 2026-05-16 | **E07 衍生補修（PO 決議 F082-A 落地）**：(1) §1 業務員清單來源改為「全部含已離職員工」（取消 `resign_date IS NULL` 過濾），明確 `appdb.ob_emphire` 由 ETL E07-OBEMPHIRE-Load pipeline 載入至 AppDB 表；(2) §4 AC-2 補「離職員工 GET 仍回傳 + `deptSum` 僅計算在職員工」；(3) §5.1 GET response 補 `isResigned: boolean` 欄位於 employees[] + 範例補離職員工樣本；(4) §6 BR-6 SQL 改為全部 + 加上離職欄位；(5) §6 BR-13 重寫為「離職員工顯示 + 比例驗證規則 + UI badge / 驗證排除 / 歷史紀錄保留 / PUT 防護」4 子規則；(6) §9 補 ETL 來源 cross-ref；(7) §12 A-5 標 ✅ Resolved（PO 決議） |
| v1.3 | 2026-05-16 | **E07 衍生補修（system-architect Phase 1 / 6 個風險決議落地）**：(1) **決議 #1 全員離職部門（選項 D）**：BR-13 補「per-DEPT sum = 0% 容許 + 短路 return」；§5.1 GET response 補 `activeCount` / `sumValidated` / `allResigned` 欄位 + 範例；新增 AC-14「全員離職部門容許儲存」；(2) **決議 #2 Feature Flag fallback**：新增 §6 BR-16 + §5.2 錯誤碼表補 503 `FEATURE_NOT_ENABLED`；新增 AC-15；§12 A-6 標 ✅ Resolved；(3) **決議 #4 SectionChiefScopeGuard method 分支**：補 BR-14 重寫 + 新增 §5.x Guard 行為對照表；§12 A-1 標 ✅ Resolved；(4) **決議 #6 月跑並發守衛**：新增 §6 BR-15 引用 `AssignmentRunGuardService.assertNoRunningRun()`；AC-11 補述 service 集中實現；(5) **決議 #5 測試 fixture 策略**：§11 補測試 Fixture 策略章節（`apps/api/test/fixtures/ob-emphire.fixture.ts` + ob_emphire 必填欄位清單）；(6) §10 測試覆蓋率補 5 個新測試 case；(7) §11 實作 Checklist 補 5 個新工項 |
| **v1.4** | **2026-05-16** | **【救援重寫 / 編碼事故修復】**：依 US-112 + AD-E07 v3.0 一致性決議完整重建本檔；Guard 名稱統一為 `DirectorOrSectionChiefGuard` + `SectionChiefScopeGuard`（廢除 `SalesManagerGuard`）；business_role 欄位語意對齊 F074 v2.0；JWT claim 為 `businessRole`；保留 v1.0~v1.3 所有設計決議與 6 風險決議落地 |
| **v1.5** | **2026-05-22** | **【處長轄區改用 ob_emphire 反查解 chicken-and-egg / commit 977ed09；補入 changelog】**：BR-3 / BR-14 / §5.x 已於 977ed09 commit 落地但漏記 changelog，本次補入。修改要點：(1) BR-3 改寫：處長轄區由 `resolveSectionChiefScope(userId)` 反查（`users.email ↔ ob_emphire.email + jfun_nm='處長' + 在職` → `dept_code`），廢除原 `scopeByCreator(ob_empl_set.created_by)` 邏輯（chicken-and-egg：首次 GET 時 ob_empl_set 為空 → 處長永遠回空清單）；scope=null 時 GET 回 `departments=[]`、PUT 回 403 `PERSONNEL_RATIO_OUT_OF_SCOPE`；(2) BR-14 改寫：`SectionChiefScopeGuard` GET 由 service 走 `resolveSectionChiefScope()`、PUT/POST 攔截 `dto.deptCode === scope`；(3) §5.x Guard 對照表同步更新。沿用 F074 v2.1 BR-1「`jfun_nm='處長'` 為 source of truth」設計，與處長姓名顯示同一資料來源 |
| **v1.6** | **2026-05-25** | **【FE baseline 模板模型 + GET deptRatio>0 過濾 + directorName 欄位 / commits 6402cd3 / 150acbe / 38eb0dc】**：(1) **§6 BR-17 新增**：FE per-row ±N% 模板採「baseline + per-employee templates」模型保證對稱性；列出 baseline 三種設定時機（首次進入 / 均等分配 / 手動編輯）；模板計算後仍由 PUT 主流程 `assertDeptSumEquals100` 校驗；交叉引用 F083 v1.4 弱化校驗（commit 6402cd3）；(2) **§6 BR-18 新增**：service GET 只回 `deptRatio > 0` 部門；`null`（無紀錄）/ `0`（刻意排除）均隱藏；對所有角色一致（commit 150acbe）；(3) **§5.1 GET response 補 `directorName: string | null` 欄位** + 範例 + 定義對齊 [F079 §5.1 / BR-14](F079-set-dept-ratio.md#5-api-規格)（commit 38eb0dc） |
| **v1.7** | **2026-05-25** | **【F084 v2.0 auto-advance 改造同步 / 對應 US-114 v2.0】**：本 PUT 成為 F084 v2.0「自動推進至簽核」之觸發宿主。(1) **§5.2 PUT response 補 `autoAdvanced` / `newStage` / `autoAdvanceFailReason` 三欄位** + 欄位語意說明（`autoAdvanced=true` 時 `newStage="approval"`；僅月跑 guard 阻擋時帶 `autoAdvanceFailReason="ASSIGNMENT_RUN_ALREADY_RUNNING"`，其餘 no-op 情境不帶 failReason）；(2) **§6 BR-19 新增**：「Auto-Advance 觸發宿主」——PUT 成功後同一 tx 內若 flag = on 則呼叫 F084 完成度偵測 + 自動推進；觸發行為 / advisory lock / 月跑 guard 降級 / 稽核（`STAGE_ADVANCE` + `auto_advanced_by_completion`）細節全由 F084 §5.2 / BR-11~BR-16 規範，本 BR 僅說明掛載點；(3) **§8 Blocks** 之 F084 條目補註「auto-advance 觸發宿主」。**既有寫入 / 校驗 / 容差 ±0.01% / 轄區 Guard / 稽核語意完全不變**；由 `ENABLE_E07_AUTO_ADVANCE_TO_APPROVAL` flag（prod 預設 off）控制，flag off 時完全不執行 |
