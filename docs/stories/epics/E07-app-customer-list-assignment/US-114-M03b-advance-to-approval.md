# US-114：個別業務比例設定階段自動推進至簽核

> **Story ID**：US-114
> **Epic**：[E07 — 客戶名單分派](epic-brief.md)
> **模組**：M03b 個別業務比例設定階段
> **優先級**：Must Have
> **階段**：Phase 1（MVP）
> **預估點數**：3
> **版本**：v2.0（2026-05-25）

---

## User Story

**As a** 系統（後端 auto-advance 機制）
**I want** 在最後一筆業務員比例 PUT 完成、偵測到所有部門均完成設定時，於同一 transaction 內自動將名單推進至「簽核」階段
**So that** 流程無需等待人工點擊確認，自動進入第四階段，確保簽核節點準時觸發且有完整稽核記錄

---

## 背景說明

本 Story 是五階段流程（US-105）中，從「個別業務比例設定（Stage 3 / `personnel_ratio`）」推進至「簽核（Stage 4 / `approval`）」的自動推進機制。

### 觸發模型（v2.0 核心變更）

**主要路徑：Auto-Advance（系統自動推進）**

每筆業務員比例 PUT（F082 `setPersonnelRatios`）成功後，後端在**同一 transaction 內**執行完成度偵測：若所有部門業務員 RATION 加總均 = 100%（容忍 ±0.01%，沿用 F082 I-8），系統自動將名單 `stage` 由 `'personnel_ratio'` 更新為 `'approval'`，無需使用者另行點擊推進按鈕或確認對話框。

**Fallback 路徑：手動推進按鈕（feature flag off 或 auto-advance 未觸發時）**

在下列情況下，手動「推進至簽核」按鈕保留為備用操作路徑：
- `ENABLE_E07_AUTO_ADVANCE_TO_APPROVAL` feature flag 為 off（此時退回 v1.x 手動推進行為）
- stage = `personnel_ratio` 且所有部門均已完成（`allDeptsCompleted = true`），但 auto-advance 因其他原因未觸發（如月跑進行中導致 auto-advance 跳過）

**Actor 說明**

- **處長（section_chief）**：業務員比例的主要寫入者；其 PUT 請求為 auto-advance 的觸發點；section_chief 仍是 PUT 的合法執行者
- **部長（director）/ Admin**：可跨轄區代寫業務員比例；其 PUT 同樣可觸發 auto-advance
- 「最後觸發 auto-advance 的寫入者」= 最後一個 PUT 且導致所有部門完成的操作者，其 user_id 即為稽核日誌的 `operator_id`
- 若某部門無對應處長帳號（或未指派），業務員比例由部長代設，部長的 PUT 同樣可觸發 auto-advance，稽核 `operator_id` 記錄代操部長

**既有邏輯沿用**

- 全員離職部門（BR-8）：`ob_emphire` 無任何在職員工之部門，RATION 加總可 = 0%，不阻擋 auto-advance（沿用 F082 v1.3 決議 #1 全員離職短路邏輯，此處不新開規則）
- 月跑並發守衛：auto-advance 偵測到月跑進行中時，跳過推進但**不 rollback 本次 PUT**（PUT 仍回 200）

---

## 驗收標準

### AC-1：Auto-Advance 觸發條件

- **Given** 名單 `stage = 'personnel_ratio'`，`ENABLE_E07_AUTO_ADVANCE_TO_APPROVAL` flag = on
- **When** 任一處長 / 部長 / Admin 成功執行 PUT 業務員比例（F082），且後端在同一 transaction 內偵測到**所有有在職員工的部門** RATION 加總均 = 100%（容忍 ±0.01%）
- **Then** 系統自動將名單 `stage` 由 `'personnel_ratio'` 更新為 `'approval'`，無需使用者另行操作
- **And** PUT response 含 `autoAdvanced: true` 及 `newStage: "approval"` 欄位

### AC-2：Auto-Advance 稽核記錄

- **Given** auto-advance 成功觸發
- **When** stage 更新完成，稽核寫入於同一 transaction 內完成
- **Then** `assignment_audit_log` 新增一筆，含：
  - `action = 'STAGE_ADVANCE'`
  - `operator_id` = 觸發完成的最後一個 PUT 寫入者（處長 / 部長 / Admin）之 user_id
  - `before_payload.stage = 'personnel_ratio'`
  - `after_payload.stage = 'approval'`
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
- **And** 兩筆 PUT 本身均回 200；先到者 response 含 `autoAdvanced: true`，後到者 `autoAdvanced: false`（因 stage 已推進）

### AC-5：Auto-Advance 因月跑 Guard 失敗，PUT 本身仍成功

- **Given** 名單 `stage = 'personnel_ratio'`，flag = on
- **When** 某 PUT 完成後所有部門均達到完成條件，但 auto-advance 在偵測時遇到月跑 guard 阻擋（`assignment_run.status IN ('pending', 'running')`）
- **Then** PUT 本身仍回 200，**不因 auto-advance 失敗而 rollback**
- **And** PUT response 含 `autoAdvanced: false`、`autoAdvanceFailReason: "ASSIGNMENT_RUN_ALREADY_RUNNING"`
- **And** stage 維持 `'personnel_ratio'`；前端顯示 toast 提示「比例已儲存；因分派執行中，請待月跑完成後手動推進至簽核」

### AC-6：最後完成部門時的使用者體驗

- **Given** flag = on，PUT 觸發 auto-advance 成功（`autoAdvanced: true`）
- **When** PUT response 返回前端
- **Then** 前端顯示 toast「名單『{LIST_NM}』已自動推進至簽核階段，等待部長核准」
- **And** 前端 redirect 至名單列表，該名單階段標籤更新為「簽核」

### AC-7：Fallback 手動推進按鈕顯示條件

- **Given** 名單 `stage = 'personnel_ratio'` 且所有部門均已完成設定（`allDeptsCompleted = true`）
- **When** `ENABLE_E07_AUTO_ADVANCE_TO_APPROVAL` flag = off，**或** auto-advance 因其他原因未觸發（如 AC-5 場景）
- **Then** 部長 / Admin 看到可點擊的「推進至簽核」按鈕；處長若本部門已完成亦看到該按鈕
- **And** 月跑進行中時，按鈕為 disabled，hover 顯示「分派執行中，無法推進」
- **And** 非 `personnel_ratio` 階段 / 已停用 / 歷史月份時，按鈕完全不渲染

### AC-8：Feature Flag Off — Auto-Advance 完全不執行

- **Given** `ENABLE_E07_AUTO_ADVANCE_TO_APPROVAL` = off
- **When** 任何處長 / 部長 / Admin 執行 PUT 業務員比例
- **Then** PUT response 不觸發 auto-advance（`autoAdvanced: false` 或不含該欄位）
- **And** stage 不自動更新；系統退回 v1.x 手動推進行為，前端顯示手動推進按鈕（若所有部門均完成）

### AC-9：無代理處長時部長代設並觸發推進

- **Given** 某部門無對應處長帳號（或未指派），業務員比例由部長代設
- **When** 部長完成最後一個部門的 PUT，auto-advance 偵測所有部門均完成
- **Then** 系統允許 auto-advance，不因「處長帳號缺失」而阻擋；稽核 `operator_id` 記錄代操部長

### AC-10：推進後個別業務比例不可修改

- **Given** 名單 `stage = 'approval'`（auto-advance 或手動推進後）
- **When** 任意角色嘗試呼叫 PUT 業務員比例（F082）
- **Then** 後端回 422 `LIST_STAGE_TRANSITION_FORBIDDEN`

### AC-11：歷史月份不觸發 Auto-Advance

- **Given** 名單 `project_workym < current_work_ym`
- **When** 任意 PUT 觸發 auto-advance 偵測
- **Then** auto-advance 不執行；手動推進 API 回 403 `LIST_HISTORICAL_READONLY`

---

## 技術備註

- **觸發點**：`setPersonnelRatios`（F082 PUT endpoint）service method 成功後，於同一 database transaction 內呼叫完成度偵測邏輯；完成度通過則於同一 tx 內執行 stage 更新與稽核寫入
- **競爭條件保護**：以 `listNo` 為 key 的 advisory lock 將並發 auto-advance 偵測序列化；第二筆請求進入時若 stage 已非 `'personnel_ratio'`，視為 idempotent no-op
- **完成度判斷**：「所有有在職員工的部門 RATION 加總 = 100%（±0.01%）」；全員離職部門（`activeEmployeeCount === 0`）不參與判斷，直接短路通過（沿用 F082 BR-8，不新開規則）
- **PUT Response 新欄位**：`autoAdvanced: boolean`、`newStage: string | null`、`autoAdvanceFailReason?: string`
- **稽核 metadata**：auto-advance 路徑寫入 `auto_advanced_by_completion: true`；手動 fallback 路徑不含此 metadata
- **Feature Flag 名稱**：`ENABLE_E07_AUTO_ADVANCE_TO_APPROVAL`；prod 預設 off；flag off 時 auto-advance 邏輯完全不執行
- **月跑 Guard 失敗行為**：auto-advance 偵測到月跑進行中時跳過推進，PUT 本身不 rollback，response 含 `autoAdvanceFailReason`
- **不引入 Grace Period**：推進後如需修改，沿用 F085 Rollback 路徑

---

## 測試案例

### TC-114-01：最後一個部門完成時自動推進（處長觸發）

- **Given**：LIST_NO = 'OB202506001'，stage = 'personnel_ratio'；3 個部門，XTC0 / XTD0 已完成，XTE0 尚未完成；處長 A（轄區 XTE0）；flag = on
- **When**：處長 A 執行 PUT，設定 XTE0 所有業務員比例，各在職員工比例加總 = 100%
- **Then**：PUT response 含 `autoAdvanced: true`、`newStage: "approval"`；stage 更新為 'approval'；稽核日誌含 `action = 'STAGE_ADVANCE'`、`auto_advanced_by_completion: true`、`operator_id = 處長 A`；前端 toast 顯示「已自動推進至簽核階段」並 redirect

### TC-114-02：部門尚未全部完成，PUT 成功但不推進

- **Given**：LIST_NO = 'OB202506001'，stage = 'personnel_ratio'；部門 XTD0 加總 = 80%（未完成）；flag = on
- **When**：處長 A 執行 PUT 更新 XTC0
- **Then**：PUT 回 200；response 含 `autoAdvanced: false`；stage 維持 'personnel_ratio'

### TC-114-03：兩處長並發 PUT，只推進一次

- **Given**：LIST_NO = 'OB202506001'；處長 A（XTC0）與處長 B（XTD0）幾乎同時執行最後一個各自部門的 PUT；flag = on
- **When**：並發請求同時到達後端
- **Then**：advisory lock 序列化；先到者 response 含 `autoAdvanced: true`；後到者 response 含 `autoAdvanced: false`（stage 已 = 'approval'）；稽核日誌只新增一筆 STAGE_ADVANCE

### TC-114-04：PUT 觸發 auto-advance 但月跑進行中

- **Given**：AssignmentRun status = 'running'；此 PUT 後所有部門均完成；flag = on
- **When**：處長執行 PUT
- **Then**：PUT 回 200；stage 維持 'personnel_ratio'；response 含 `autoAdvanced: false`、`autoAdvanceFailReason: "ASSIGNMENT_RUN_ALREADY_RUNNING"`；前端 toast 提示「比例已儲存；因分派執行中，請待月跑完成後手動推進至簽核」

### TC-114-05：Feature Flag Off，PUT 不觸發推進

- **Given**：`ENABLE_E07_AUTO_ADVANCE_TO_APPROVAL` = off；此 PUT 後所有部門均完成
- **When**：處長執行 PUT
- **Then**：PUT 回 200；不含 `autoAdvanced` 欄位（或 false）；stage 不更新；前端顯示可點擊的手動推進按鈕

### TC-114-06：全員離職部門不阻擋 Auto-Advance（沿用 BR-8）

- **Given**：部門 XTE0 所有員工均已離職（activeCount = 0）；其餘部門在職員工比例加總均 = 100%；flag = on
- **When**：最後一個有效部門 PUT 完成
- **Then**：auto-advance 正常觸發；XTE0 不參與完成度判斷（短路通過）；stage 更新為 'approval'

### TC-114-07：Fallback 手動推進（Flag Off 路徑）

- **Given**：flag = off；stage = 'personnel_ratio'；所有部門均完成；部長帳號
- **When**：部長點擊「推進至簽核」手動按鈕並確認
- **Then**：POST advance-to-approval API 執行；stage 更新為 'approval'；稽核日誌寫入（`action = 'STAGE_ADVANCE'`，不含 `auto_advanced_by_completion` metadata）

### TC-114-08：推進後嘗試修改業務員比例被拒絕

- **Given**：stage = 'approval'（auto-advance 觸發後）
- **When**：任意角色嘗試 PUT 業務員比例（F082）
- **Then**：後端回 422 `LIST_STAGE_TRANSITION_FORBIDDEN`

---

## 依賴關係

- **Blocked By**：US-112（個別業務比例設定，PUT 端點為 auto-advance 的觸發點）、US-100（部長角色定義）、US-101（處長角色定義，含合法 PUT 寫入者身份）
- **Blocks**：US-116（部長核准，推進後才能執行）、US-117（部長拒絕，推進後才有拒絕入口）
- **Rollback 反向**：US-117（拒絕操作 = 簽核退回個別業務比例）；US-115 亦可在推進前 Rollback

---

## Definition of Done

- [ ] 驗收標準全部通過
- [ ] TC-114-01：最後部門完成自動推進（處長觸發，同一 tx 內執行）
- [ ] TC-114-02：部門未全完成，PUT 成功但不推進
- [ ] TC-114-03：並發 PUT advisory lock 序列化，只推進一次，稽核日誌不重複
- [ ] TC-114-04：PUT 成功但 auto-advance 因月跑 guard 失敗，PUT 仍 200
- [ ] TC-114-05：Feature Flag off，auto-advance 不執行，手動按鈕出現
- [ ] TC-114-06：全員離職部門不阻擋 auto-advance（BR-8 短路）
- [ ] TC-114-07：Fallback 手動推進（flag off 路徑），稽核不含 auto_advanced_by_completion
- [ ] TC-114-08：推進後 PUT 業務員比例被拒絕（422 LIST_STAGE_TRANSITION_FORBIDDEN）
- [ ] PUT response 結構含 `autoAdvanced` / `newStage` / `autoAdvanceFailReason` 欄位
- [ ] AssignmentAuditLog 含 `auto_advanced_by_completion: true` metadata（auto-advance 路徑）
- [ ] 單元測試覆蓋率 ≥ 80%
- [ ] Code review 通過
- [ ] 文件已更新

---

## 相關文件

- **Epic Brief**：[E07 Epic Brief](epic-brief.md)
- **相關 Stories**：US-112（個別業務比例設定，PUT 端點為觸發點）、US-115（Rollback 至部門比例）、US-116（部長核准）、US-117（部長拒絕）、US-101（處長角色與 PUT 寫入權限）
- **Feature Flag**：`ENABLE_E07_AUTO_ADVANCE_TO_APPROVAL`（prod 預設 off；flag off 時退回 v1.x 手動推進行為）
