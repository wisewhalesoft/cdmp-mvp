---
spec-id: F050
title: 新增名單定義
feature-id: F050
source-story: US-088, US-106, US-107, US-120, US-121, US-125, US-126, US-127, US-128, US-129, US-131, US-133, US-144
epic: E07
module: M01 名單定義
priority: P0-MVP
version: "2.3.1"
date: 2026-05-28
status: Draft
---

# F050: 新增名單定義

Priority: P0-MVP | Status: Draft | Last Updated: 2026-05-28

> **v2.3.1（2026-05-28 / US-144 最低條件數語意修正 — 系統固定欄位不計入「≥1 條件」門檻）**：依用戶決議，「名單至少 1 個篩選條件」之門檻改為**僅計算非系統固定（`is_system_fixed = false`）之 conditions**——`best_case`（系統固定、自動注入）**不**計入最低數；使用者必須自行提供至少 1 個非系統固定 condition，否則拒絕（更貼近舊系統：名單必有 `prod_kind` / `list_type` 等使用者條件）。核心變更（不動 v2.3 之 BR-14 注入契約 / AC-17，僅細化最低條件數驗證；沿用既有 `VALIDATION_ERROR` 422，**不**新增錯誤碼）：
> 1. **AC-10 重寫**：最低條件數驗證改為「非系統固定 conditions 數 = 0 即拒絕」；訊息精修為明示「至少 1 個非系統固定 / 使用者自訂篩選條件」。
> 2. **BR-6 補述**：condition_payload 必填之「至少 1 個」語意限定為「至少 1 個 `is_system_fixed = false` 之 condition」。
> 3. **驗證順序明示**：最低條件數檢查發生於 **`validateConditionPayload` 階段、`injectSystemFixedConditions`（BR-14）之前**，故計數對象為**使用者送入之 payload**；無論 incoming payload 是否含 `best_case`，`best_case`（及任何 `is_system_fixed = true` 欄位）一律從計數排除。
> 4. **§5.4 規則表**「`conditions` 至少 1 個」列細化為「至少 1 個非系統固定 condition」。
>
> **v2.3（2026-05-28 / US-144 best_case 系統固定篩選條件 Design A）**：將 `best_case`（優質案件）鎖定為系統固定（system-fixed）篩選條件，使用者無法移除或修改其值，與舊系統（`OBPOOLDATA.BEST_CASE` / `OBMLISTDF.PROD_BEST` 硬編碼 `'Y'`）維持相同業務語意。核心變更（不動既有 v2.2.1 / v2.2 / v2.1.1 / v2.1 之 AC / BR / API contract，僅新增）：
> 1. **新增 BR-14 系統固定條件強制注入（`injectSystemFixedConditions` 契約）**：`createList` 於 condition_payload 驗證（§5.4）通過後、寫入 DB 前，對所有 F075 v1.7 白名單中 `is_system_fixed = true` 之欄位強制注入 / 正規化其固定值（best_case → `{ columnName: 'best_case', fieldType: 'categorical', values: ['Y'] }`）；契約見 BR-14（input payload → output payload，補齊所有 system-fixed 欄位且值強制為固定值）。
> 2. **tamper-normalization 靜默語意**：使用者傳入 `best_case` 之 values 為 `['N']` / `[]` / 缺漏 / 多值，後端**靜默正規化**為 `['Y']`，仍回 201 Created（**不**拒絕、**不**回錯誤碼）；對應新增 AC-17。
> 3. **best_case 非 backward-compat 衍生欄位**：`best_case` 僅存在於 `condition_payload`，**不**在 BR-10 之 5 個 backward-compat 衍生 entity column（`prod_kind` / `caseyear` / `spec_tp` / `case_status` / `settle_src`）範圍內（沿用 v2.1.1 BR-12，已移除之 `prod_best` 一級欄位語意改由 `best_case` condition 承接）。
> 4. **驅動旗標**：系統固定欄位之判定以 F075 v1.7 `pooldata_field_whitelist.is_system_fixed` 旗標為準，**不** hardcode 字串 `'best_case'`（為未來擴充其他系統固定欄位預留）。
> 5. **回填範圍**：Migration 僅回填 `stage = 'draft'` 名單（凍結快照不回填）；migration ordering 與 `is_system_fixed` 欄位 / seed 之 DB 落地由 system-architect（AD-E07-18 或衍生決策）owns，本 spec 僅引用。
> 6. **更新 §6.1 POST 範例 / 錯誤回應表 / §9 相依性 / §10 交叉參考**對齊 US-144（F075 v1.6 → v1.7）。
>
> **v2.2.1（2026-05-21 / Phase 5 TDD code drift 修正）**：Phase 5 TDD implementation 完成後發現 spec 與 entity / production pattern 不一致；本版本以 **code 為 source of truth** 修 spec 文字（不變動 entity / migration / code / prototype）：
> 1. **§6.2 `auditTrail[].action` 列舉值對齊 entity**（D1）：實際 `AssignmentAuditLog.action` enum（`apps/api/src/database/entities/assignment-audit-log.entity.ts:26-39`）為 `CREATE` / `UPDATE` / `DELETE` / `RUN` / `EXPORT` / `CANCEL` / `STAGE_ADVANCE` / `STAGE_ROLLBACK` / `STAGE_REJECT` / `ASSIGN_ROLE` / `REVOKE_ROLE` / `SCORING_INTEGRITY_WARN`（length VARCHAR(30)）；spec 之 `ADVANCE_STAGE` / `APPROVE` 等命名為錯，已修正。
> 2. **§6.2 核准 / 拒絕記錄之資料來源**（D1）：核准 / 拒絕**不**寫 `assignment_audit_log`，而寫 `assignment_approval` 表（`apps/api/src/database/entities/assignment-approval.entity.ts`，action enum 為小寫 `approve` / `reject`）；故 §6.2 response.`auditTrail` 之 ready 階段範例已移除「APPROVE」條目；如需顯示簽核 timeline 需另起 endpoint（建議 `GET /assignment/list-definitions/:listNo/approvals`），本 v2.2.1 不規範新 endpoint，屬未來 enhancement。
> 3. **§6.2 處長轄區隔離 mechanism 對齊 production pattern**（D2）：User entity 無 `dept_code` 欄位；改為沿用 `SectionChiefScopeService`（`apps/api/src/modules/assignment/services/section-chief-scope.service.ts`）之既有 production pattern — 以 `ob_empl_set.created_by = currentUserId` 過濾。cross-reference F063 v1.1 / F064 v1.1 / F066 v1.1 / F067 v1.1 之 SectionChiefScopeService scopeByCreator pattern。
> 4. **本 v2.2.1 不變更 v2.2 既有 BR / AC / sessionStorage signal protocol（BR-13）內容**；僅修 §6.2 範例 JSON / response schema 描述 / 處長轄區段落文字。
>
> **v2.2（2026-05-21 / M01 v2.0~v2.3 Kanban 重構 GAP-G1 / GAP-G2 補完）**：將 Phase 1 確認之兩個 GAP 集中歸入本 spec，避免另立增量 spec：
> 1. **新增 §6.2 Detail Snapshot API**（GAP-G1 / US-131）：新增 `GET /api/v1/assignment/list-definitions/:listNo/full-snapshot` 端點規格（auth / response schema 4 sections / stage-aware null state / error codes），供 [F048 v2.0](F048-view-list-definition.md) Kanban 卡片「查看」按鈕觸發 Detail Drawer 使用。**Detail Snapshot API 為本 spec 之 source-of-truth**，其他 spec 透過 cross-reference 引用。
> 2. **新增 §7 BR-13 sessionStorage Signal Protocol**（GAP-G2 / US-133）：定義 `cdmp.pendingToast` key 命名、payload schema（`{type, msg, sub}`）、producer / consumer 行為、consume-once 語意、適用範圍（限子頁工作流：29a F079 / 29b F082 / 29c F086 / F087 完成或取消後跳回 M01 主頁）。**Signal Protocol 為本 spec 之 single authority**，F079 / F082 / F086 / F087 透過 cross-reference 引用。
> 3. **本 v2.2 不變更既有「新增名單」業務 AC（AC-1~AC-16）/ BR（BR-1~BR-12）**；僅在 §6 與 §7 各新增一個獨立 subsection。既有 v2.1.1 / v2.1 / v2.0 之 contract 完整保留。
>
> **v2.1.1（2026-05-20 / 業務複核補強）**：F050 v2.1 之後依 2026-05-20 業務複核 D1 / D2 / D4 / Q-A / Q-B 決議補強 3 項。核心變更：
> 1. **卡別（`card_type`）改為動態下拉**（US-126 / US-127 / D1 / D4 / Q-A）：UI 元件從文字輸入改為下拉選單，選項來源 `GET /api/v1/assignment/scoring/card-types`；建立模式只列 `status='active'` 卡別；編輯模式（F051）額外保留「該名單已存的 inactive 值」（disabled，可保留不可重選）；首選項為「— 未選擇 —」（空值，預設選中）；前端 v2.0 之 `maxLength={2}` 限制移除（下拉自然消除，後端 `@MaxLength(5)` 對齊 `ob_card_type.card_type VARCHAR(5)`）；具體 API query 形式由 system-architect 決定。
> 2. **「最佳產品（`prod_best`）」一級欄位移除**（US-128 / D2 / Q-B B3）：表單基本資訊區「最佳產品」輸入框移除，前端不再送出 `prodBest` 欄位；`ob_list_definition.prod_best` schema 欄位保留為 deprecated（NOT NULL 放寬為 NULL），既有資料於本次一次性 migration 清空為 NULL（Q-B B3「直接清空」決議；v2.2+ 後續可考慮 DROP COLUMN）；業務語意改由 `condition_payload.conditions[columnName='best_case']` 承接（見第 3 點）。後端 DTO 對 `prodBest` 之處置（`@IsOptional()` backward-compat 接受或刪除）由 system-architect 決定。
> 3. **`best_case` 補入 F075 v1.6 白名單 + F076 v1.6 補 Y/N options seed**（US-128 / US-129）：`best_case`（categorical，display_name「優質案件」）為新名單必要篩選欄位，承接已移除之 `prod_best` 業務語意；對應 options `Y` = 優質案件、`N` = 非優質案件（US-129 AC-1）；前端透過篩選條件區動態加入此欄位設定值。

> **v2.1（2026-05-20 / 名單定義 whitelist-driven 重構）**：依 GAP-LIST §A1~A6 解除 spec 內部矛盾。核心變更：
> 1. **`condition_payload` 為 source of truth**（取代 v2.0 之 5 個一級欄位 prod_kind / caseyear / spec_tp / case_status / settle_src 必填語意；A1 / A2）。
> 2. **新增 columnName 白名單驗證**（必須存在於 F075 v1.5 白名單且 `is_active = true`；違反回 422 `CONDITION_COLUMN_NOT_IN_WHITELIST`；A3 / 拍板 1）。
> 3. **新增 list_period_* 保留欄位防呆**（list_period_start / list_period_end / list_interval 為一級欄位，禁止入 conditions；違反回 400 `RESERVED_FIELD_IN_CONDITIONS`；J8 / 拍板 3）。
> 4. **caseyear 選項來源遷移**（從前端 hardcoded 11 筆 → `pooldata_field_option` 動態載入 8 筆 0~6 + 99；A4 / J5）。
> 5. **case_status 選項來源遷移**（從 `ob_code_df` `tbl_id='CASE_STATUS'` → `pooldata_field_option` `column_name='case_status'`；A5 / E4）。
> 6. **多值 SQL 比對語意**（categorical 改用 `IN (...)`、numeric 用 `BETWEEN`、date 用 `BETWEEN`，取代舊 SP `LIKE '%val$$%'` 三段比對；A6 / D3）。
> 7. **5 個 entity column 降為 backward-compat 衍生欄位**（後端依 condition_payload 衍生填入，前端不送出；J6）。
> 8. **新增 `LEGACY_LIST_NOT_COPYABLE` 錯誤碼**（複製來源限 condition_payload 非 NULL；422，defense-in-depth；US-123 衍生 / 拍板 Q4）。
> 9. **F068 DEPRECATED**：本 spec 移除 F068 引用，改引 F075 v1.5 + F076 v1.5（J2）。

> **v2.0（2026-05-16）**：依 F002 v2.0 / AD-E07 v3.0 重構：Guard 改為 `DirectorGuard`（M01 名單 CRUD 寫入限部長）；新增 `cr_enabled` per-list flag 取代 F059 全域開關（F059 已 DEPRECATED）。

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + `data-model.md#e07-data-model` + `error-handling.md#assignment-errors` + F051 表單欄位規範 |
| QA / Tester | 本文件 + `error-handling.md#assignment-errors` |
| UI/UX Designer | 本文件（第 8 節 UI/UX 需求） |
| Architect | 本文件 + `architecture-spec.md` §3.10（LIST_NO 自動產生規則） |

---

## 1. 功能摘要

提供業務部長新增名單定義功能，支援空白表單與「從既有名單複製」兩種建立模式。系統依格式 `OB{YYYYMM}{NNN}` 自動產生 `list_no`，同月流水號上限 999 筆；`prod_kind + card_type` 組合在當月 active 名單中必須唯一。**表單必填 `condition_payload`（至少 1 個 conditions），欄位來源為 F075 v1.5 白名單 active 集合；`list_period_start` / `list_period_end` / `list_interval` 維持為一級欄位（J8），不納入 conditions**。月跑執行中禁止新增。本 Feature 與 F051 共用表單欄位規範。

## 2. 使用者故事

**As a** 業務部長
**I want** 新增或從既有名單複製建立一筆新的名單定義
**So that** 彈性設定本月各 Stage 的客戶篩選條件，不需仰賴 IT 手動操作資料庫

## 3. 前置條件

- 業務部長已登入並持有有效 JWT Token；`businessRole='director'`（M01 名單 CRUD 寫入限部長，後端套用 `DirectorGuard`，依 F002 §4.6.2）
- **`pooldata_field_whitelist`（由 F075 v1.5 維護）已 seed 含 caseyear 與 case_status 條目**，對應 `pooldata_field_option`（由 F076 v1.5 維護）已 seed 對應可選值（caseyear 8 筆、case_status 4 筆、prod_kind 3 筆、spec_tp **52 筆 OBMCODEDF dump（TBL_ID='12'）**、settle_src 2 筆、list_type 3 筆；US-125 AC-1 / AC-2 / AC-5）
- ~~`ob_code_df` 中 `PROD_KIND` / `SPEC_TP` / `CASE_STATUS` 代碼已維護（由 F068 處理）~~（**v2.1 廢除**：F068 已 DEPRECATED；篩選欄位可選值來源改為 F075 + F076，J1 / J2）
- ~~`CASEYEAR` 不從 `ob_code_df` 載入，由前端固定 11 個 CheckBox（value 0~10）渲染~~（**v2.1 廢除**：caseyear 改為 `pooldata_field_option` 動態載入 8 筆 0~6 + 99，A4 / J5）
- **v2.1.1（2026-05-20 / US-128 / US-129）**：`pooldata_field_whitelist` 已 seed `best_case`（display_name「優質案件」、categorical、`is_active=true`；F075 v1.6 / US-128）；對應 `pooldata_field_option` 已 seed `best_case` `Y` / `N` 兩筆 active options（F076 v1.6 / US-129 AC-1）
- **v2.1.1（2026-05-20 / US-126 / US-127）**：`ob_card_type` 已 seed 至少 1 筆 `status='active'` 紀錄（由 F070 / F071 系列維護）；卡別下拉資料來源 API `GET /api/v1/assignment/scoring/card-types` 可用
- `assignment_run` 當下無 `status IN ('pending', 'running')` 的紀錄

## 4. 驗收標準

### AC-1：從空白表單新增

- **Given** 業務部長在 F048 名單定義清單頁點擊「新增名單定義」
- **When** 系統開啟新增表單
- **Then** 顯示空白表單含基本欄位（`list_nm` / `card_type`（v2.1.1：下拉選單，見 AC-16）/ `list_period_start` / `list_period_end` / `list_interval` / `cr_enabled`）；篩選條件區塊初始為空，等待使用者透過動態 dropdown 新增 F075 v1.6 白名單 `is_active=true` 欄位（含 v2.1.1 新增之 `best_case`；詳見第 5 節表單欄位規範，與 F051 一致）
- **v2.1.1（2026-05-20 / US-128）**：表單已移除「最佳產品」（`prod_best`）一級欄位；對應業務語意改由篩選條件區 `best_case` categorical condition 設定（見 §5.4 + AC-16）
- **And** `list_no` 欄位不顯示（儲存後系統自動產生）
- **And** 5 個 backward-compat 欄位（`prod_kind` / `caseyear` / `spec_tp` / `case_status` / `settle_src`）由後端依 `condition_payload` 衍生填入，前端不送出（J6 / BR-10）

### AC-2：LIST_NO 自動產生規則

- **Given** 業務部長填妥表單並點擊「儲存」
- **When** 後端處理新增請求
- **Then** 系統依格式 `OB{YYYYMM}{NNN}` 自動產生 `list_no`，共 11 碼（OB 固定 + YYYYMM 當月 + NNN 該月流水號 001~999）
- **And** 新產生的 `list_no` 不與任何現有 `list_no` 重複
- **And** `list_type` 後端自動填入固定值 `'01'`，`status` 初始為 `'active'`，`project_workym` 填入當前作業年月

### AC-3：同月 999 筆上限硬阻擋

- **Given** 本月 `ob_list_definition` 已有 999 筆紀錄（含 active + inactive）
- **When** 業務部長嘗試新增第 1000 筆
- **Then** 系統回傳 422 `LIST_NO_LIMIT_EXCEEDED`，訊息：「本月（YYYYMM）名單定義已達 999 筆上限，無法新增」
- **And** 不產生新紀錄

### AC-4：PROD_KIND + CARD_TYPE 組合重複檢查

- **Given** 業務部長填入的 `prod_kind + card_type` 組合，在當前作業年月下已存在 `status = 'active'` 的名單
- **When** 業務部長點擊「儲存」
- **Then** 系統硬阻擋，回傳 422 `LIST_NO_DUPLICATE`，訊息：「相同產品類別（PROD_KIND）與卡別（CARD_TYPE）的有效名單已存在（LIST_NO: {衝突 list_no}），請停用既有名單或修改條件」
- **And** 不產生新紀錄

### AC-5：複製名單功能

- **Given** 業務部長在新增表單點擊「複製名單」按鈕
- **When** 系統開啟複製來源選擇器（下拉或搜尋彈窗，顯示所有 `status = 'active'` AND `stage = 'ready'` AND `condition_payload IS NOT NULL` 之既有名單；上月）
- **Then** 業務部長選擇某一來源名單後，新表單自動填入來源名單之 **`condition_payload`**（整段 JSONB 複製）與 `list_period_start` / `list_period_end` / `list_interval`；`list_nm` 仍為空待填；`cr_enabled` 恢復預設 `true`（不沿用上月設定，data-model 規則）；比例資料（部門 / 個別業務）不複製
- **And** `list_no` 仍為空（儲存後重新產生），`list_nm` 可自由修改
- **And** 5 個 backward-compat 欄位不由前端複製；後端依新 `condition_payload` 衍生填入（BR-10）
- **And** 若來源名單 `condition_payload IS NULL`（舊遷移名單），前端 dropdown 已過濾不列出；若繞過直接呼叫 API，後端回 422 `LEGACY_LIST_NOT_COPYABLE`（defense-in-depth，拍板 Q4）

### AC-6：月跑執行中禁止新增

- **Given** `assignment_run` 有 `status IN ('pending', 'running')` 的紀錄
- **When** 業務部長嘗試點擊「新增名單定義」按鈕
- **Then** 按鈕為 disabled，hover 顯示提示「分派執行中，無法新增名單定義」

### AC-7：必填欄位驗證（v2.1 重寫）

- **Given** 業務部長未填寫任一必填欄位即點擊「儲存」
- **When** 前端進行表單驗證
- **Then** 對應欄位顯示紅色邊框與錯誤訊息「此欄位為必填」，儲存請求不發送
- **And** 必填欄位範圍縮減為：`list_nm` / `list_period_start` / `list_period_end` / `list_interval` / `condition_payload`（至少 1 個 conditions）
- **And** 5 個原 v2.0 一級欄位（`prod_kind` / `caseyear` / `spec_tp` / `case_status` / `settle_src`）**不再為前端必填欄位**；由後端依 `condition_payload` 衍生填入（BR-10 / J6 / A1）
- **And** 前端阻擋後送出時，若 `condition_payload.conditions` 仍為空，後端回 422，訊息「篩選條件不得為空，請至少設定一個欄位」（對應 US-121 AC-1 / US-106 AC-12）

### AC-8：LIST_PERIOD_END ≥ LIST_PERIOD_START 驗證

- **Given** 業務部長輸入 `list_period_start` 與 `list_period_end`
- **When** 任一欄位值變更後
- **Then** 若 `list_period_end < list_period_start`，顯示錯誤「結束期數需大於等於開始期數」，儲存按鈕停用

### AC-9：儲存成功後的操作

- **Given** 新增表單所有驗證通過
- **When** 業務部長點擊「儲存」並後端成功寫入
- **Then** 頁面顯示成功提示含新產生的 `list_no`
- **And** 返回 F048 名單定義清單頁，新建名單出現在「使用中」頁籤清單中
- **And** 寫入 `assignment_audit_log`（`action = 'CREATE'`, `entity_type = 'ob_list_definition'`, `entity_id = list_no`）

### AC-10：condition_payload 最低條件數驗證（v2.3.1 重寫 / US-144 / 原 v2.1 新增 US-121 AC-1 / US-106 AC-12）

- **Given** 業務部長在新增表單之篩選條件區塊未新增任何**非系統固定**篩選條件（即除自動注入之 `best_case` 外，無使用者自訂條件；可能完全為空，或僅含 `best_case`）
- **When** 點擊「儲存」
- **Then** 前端阻擋送出並顯示錯誤「請至少設定一個篩選條件」（系統固定條件如優質案件不計入）
- **And** 若前端被繞過，後端於 `validateConditionPayload` 計算 `condition_payload.conditions` 中 `is_system_fixed = false` 之條件數；若該數為 0 即回 422 `VALIDATION_ERROR`，訊息「篩選條件不得為空，請至少設定一個非系統固定（使用者自訂）篩選欄位」
- **And** **驗證順序**：本最低條件數檢查在 `validateConditionPayload` 階段、`injectSystemFixedConditions`（BR-14）**之前**執行，故計數對象為**使用者送入之 payload**；無論 incoming payload 是否已含 `best_case`，`best_case`（及任何 `is_system_fixed = true` 之欄位）一律從計數排除（系統固定欄位即使存在亦不滿足最低門檻）
- **And** 系統固定欄位之判定以 F075 v1.7 `pooldata_field_whitelist.is_system_fixed = true` 為準（不 hardcode 字串；對齊 BR-14 / BR-16）
- **And** 沿用既有 `VALIDATION_ERROR`（422），**不**新增錯誤碼
- **And** 本 AC 取代 v2.0 AC-7「9 個一級欄位必填」語意（A1 / A2）

### AC-11：columnName 白名單驗證（v2.1 新增 / US-121 AC-2 / US-106 AC-13）

- **Given** 業務部長儲存名單時，`condition_payload.conditions` 中任一條件之 `columnName` 不存在於 `pooldata_field_whitelist` 或對應欄位 `is_active = false`
- **When** 後端驗證 condition_payload
- **Then** 回 422 `CONDITION_COLUMN_NOT_IN_WHITELIST`，response body 含不合法之 `columnName`
- **And** 前端 dropdown 已過濾 `is_active = false` 欄位；本 AC 為 defense-in-depth（A3 / 拍板 1）

### AC-12：list_period_* 不可入 conditions（v2.1 新增 / US-121 AC-5 / J8 / 拍板 3）

- **Given** `condition_payload.conditions` 包含 `columnName` 為 `list_period_start` / `list_period_end` / `list_interval` 任一者
- **When** 後端驗證 condition_payload
- **Then** 回 400 `RESERVED_FIELD_IN_CONDITIONS`，訊息明示三個欄位為一級保留欄位，應透過表單獨立欄位設定
- **And** 前端 dropdown 不列出此三個欄位；本 AC 為 defense-in-depth

### AC-13：INACTIVE 選項警示（非阻擋，v2.1 新增 / US-121 AC-4）

- **Given** `condition_payload.conditions` 中任一 categorical 條件之 `values` 陣列包含 `pooldata_field_option.is_active = false` 之選項值
- **When** 後端驗證並準備寫入
- **Then** 後端以 201 Created 成功寫入，但 response body 附加 `warnings: [{ code: "WHITELIST_OPTION_INACTIVE", affectedFields: ["<columnName>"] }]`
- **And** 前端顯示非阻擋式提示：「部分篩選條件的選項值已停用，請確認是否仍符合業務需求」
- **And** 與 F076 v1.5 BR-4「停用後不回溯」語意一致；月跑 Stage 1 仍可正常以已固化條件過濾

### AC-14：stage 保護（v2.1 新增 / US-121 AC-3 / K1 / K3）

- **Given** 名單 `stage` 不為 `'draft'`
- **When** 任何使用者嘗試對該名單寫入 `condition_payload`（透過 F050 POST 為「新建」場景；本 AC 主要規範對應 F051 PUT 編輯場景，本 spec 沿用同語意）
- **Then** 回 422 `LIST_STAGE_TRANSITION_FORBIDDEN`（沿用既有錯誤碼）
- **And** 月跑執行中（AssignmentRun status='running'）優先於 stage guard，即使 stage='draft' 仍回 409 `ASSIGNMENT_RUN_ALREADY_RUNNING`
- **And** Rollback 操作完成後（M03a/b/c/d）stage 回 'draft'，condition_payload 重新可寫入（K3）

### AC-15：backward-compat 衍生欄位（v2.1 新增 / J6 / BR-10）

- **Given** 業務部長成功送出含 `condition_payload` 之新建請求
- **When** 後端寫入 `ob_list_definition`
- **Then** 5 個 backward-compat 欄位（`prod_kind` / `caseyear` / `spec_tp` / `case_status` / `settle_src`）由後端依 `condition_payload` 衍生填入並一併寫入 entity column（衍生規則由 Phase 3a system-architect 設計，本 spec 僅聲明意圖；對應 GAP-LIST §C3）
- **And** 此 5 個欄位作為舊讀取端（含 F048 清單頁、F051 編輯頁載入 fallback、月跑 Stage 1 condition_payload IS NULL fallback）之 backward-compat 來源
- **And** GET API（含 F048 / F051 載入）回應 body 同時含 `conditionPayload` 與 5 個衍生欄位；條件來源以 `conditionPayload` 為準

### AC-16：cardType 下拉契約（v2.1.1 新增 / US-126 / US-127 / D1 / D4 / Q-A）

- **Given** 業務部長進入「建立草稿名單」頁
- **When** 頁面載入完成
- **Then** 卡別欄位顯示為下拉選單（`<select>`），選項來源為 `GET /api/v1/assignment/scoring/card-types`（具體 query 形式由 system-architect 決定，spec 不規範）
- **And** 選項顯示文字格式為 `{card_type} — {card_name}（{prod_kind}）`，依 `card_type` 升冪排列
- **And** **建立模式（F050）**：下拉僅列出 `status='active'` 的卡別
- **And** **編輯模式（F051）**：下拉列出 `status='active'` 的卡別 + 該名單現存的 inactive 值（若 `ob_list_definition.card_type` 對應之 `ob_card_type.status='inactive'`），inactive 選項以 HTML `disabled` 屬性呈現、文字附加「（已停用 — 僅供保留舊值）」，使用者可保留原值但無法主動重選；可改選 active 卡別或「— 未選擇 —」清除
- **And** 下拉第一個選項固定為「— 未選擇 —」（空值），新建表單預設選中此選項（卡別維持選填語意）
- **And** 選取具體卡別時，前端 DTO 送出 `cardType: "<card_type>"`（僅 `card_type` 代碼字串，不含 `card_name` / `prod_kind` 顯示文字）；選擇「— 未選擇 —」時不傳 `cardType` 欄位（或傳 `null`）
- **And** 後端寫入 `ob_list_definition.card_type` 之值範圍對齊 `ob_card_type.card_type`（VARCHAR(5)，`^[A-Z0-9]{1,5}$`）；v2.0 之前端 `maxLength={2}` 限制已移除（下拉自然消除），後端 `@MaxLength(5)` 對齊
- **And** 若 `GET /api/v1/assignment/scoring/card-types` API 呼叫失敗（網路錯誤或 5xx），卡別欄位顯示 fallback 提示「卡別資料載入失敗，請重新整理頁面」；不阻擋其他欄位填寫與儲存（卡別為選填欄位，使用者仍可以「不選卡別」方式完成建立）
- **And** 載入中下拉為 disabled 狀態，避免選項未就緒時送出

### AC-17：best_case 系統固定條件強制注入與 tamper-normalization（v2.3 新增 / US-144 / Design A）

- **Given** 業務部長或 Admin 填妥基本資訊與其他篩選條件，點擊「儲存」
- **When** 後端 `createList` 服務方法於 condition_payload 驗證（§5.4）通過後、寫入 DB 前執行 `injectSystemFixedConditions`（BR-14）
- **Then** 寫入 `ob_list_definition.condition_payload` 之 `conditions` 中必定包含 `{ columnName: 'best_case', fieldType: 'categorical', values: ['Y'] }` 條目，無論使用者是否自行加入（對應 US-144 AC-1）
- **And** 若使用者 payload 中未包含 `best_case`，後端靜默注入；若已包含但 `values` 不為 `['Y']`（例如傳入 `['N']` / `[]` / 多值），後端靜默正規化為 `['Y']`，仍回 **201 Created（不拒絕、不回錯誤碼）**（tamper-proof；對應 US-144 AC-1 / TC-144-01）
- **And** 系統固定欄位之判定以 F075 v1.7 `pooldata_field_whitelist.is_system_fixed = true` 為準，後端**不** hardcode 字串 `'best_case'`（BR-14；為未來擴充其他系統固定欄位預留）
- **And** `best_case` 僅寫入 `condition_payload`，**不**屬於 BR-10 之 5 個 backward-compat 衍生 entity column 範圍（沿用 BR-12；其業務語意承接已移除之 `prod_best` 一級欄位）
- **And** 「從上月名單複製」場景（AC-5）即使來源名單 `condition_payload` 不含 `best_case`，`injectSystemFixedConditions` 仍於 `createList` 強制注入 `best_case: ['Y']`（對應 US-144 AC-9）
- **And** 前端篩選條件區之鎖定列渲染（🔒、無刪除按鈕、值 disabled）與「新增條件」dropdown 排除 `best_case` 之 UI 行為，依 F075 v1.7 API 回傳之 `isSystemFixed` 旗標驅動（US-144 AC-3 / AC-4；UI 細節由 ui-ux-designer 決議）

## 5. 表單欄位規範

### 5.1 必填欄位（v2.1 重寫）

| 欄位 | Schema 欄位名 | UI 元件 | 說明 |
|---|---|---|---|
| 名單名稱 | `list_nm` | 文字框，max 45 | — |
| 篩選條件 | `condition_payload` | 動態條件區塊（見 §5.4 JSON schema） | 必填，至少 1 個 conditions；欄位來源 = F075 v1.5 白名單 `is_active=true`；類別型欄位之 values 來源 = F076 v1.5 `is_active=true`；數值型 = `min` / `max`；日期型 = `dateStart` / `dateEnd`；違反白名單回 422 `CONDITION_COLUMN_NOT_IN_WHITELIST`（AC-11） |
| 開始撈取期數 | `list_period_start` | 數字框，max 3 | 月份；一級欄位，**不可入 conditions**（BR-8） |
| 結束撈取期數 | `list_period_end` | 數字框，max 3 | 需 ≥ `list_period_start`；一級欄位，**不可入 conditions**（BR-8） |
| 間隔期數 | `list_interval` | 數字框，max 3 | 月份；一級欄位，**不可入 conditions**（BR-8） |

**v2.1 移除欄位**（不再為前端必填一級欄位，改由後端依 `condition_payload` 衍生填入；J6 / BR-10）：

| ~~欄位~~ | ~~Schema~~ | v2.1 處置 |
|---|---|---|
| ~~產品類別~~ | ~~`prod_kind`~~ | 改由 condition_payload 動態欄位設定；後端衍生填入 entity column |
| ~~進件/滿期/中結年數~~ | ~~`caseyear`~~ | 同上；選項來源從前端 hardcoded 11 筆改為 `pooldata_field_option` 動態 8 筆（J5 / A4） |
| ~~專案類別~~ | ~~`spec_tp`~~ | 同上；選項來源從 `ob_code_df` 改為 `pooldata_field_option`（F076 v1.5 補真實 OBMCODEDF dump **52 筆**，TBL_ID='12'） |
| ~~案件結清期別~~ | ~~`case_status`~~ | 同上；選項來源從 `ob_code_df` `tbl_id='CASE_STATUS'` 改為 `pooldata_field_option` `column_name='case_status'`（A5 / E4） |
| ~~被他行代償案件~~ | ~~`settle_src`~~ | 同上 |

### 5.1.1 case_status 4 個值業務語意對照表

> **v2.1 補述（2026-05-20）**：本表保留為 case_status 4 個 option_label 之業務語意 tooltip 來源；可選值儲存位置在 v2.1 已遷移自 `ob_code_df` `tbl_id='CASE_STATUS'` 至 `pooldata_field_option` `column_name='case_status'`（4 筆，由 F076 v1.5 維護；US-125 AC-2）。前端載入 case_status 多選元件時呼叫 `GET /api/v1/pooldata-fields/case_status/options?active=true`；本表 4 個 STA_CODE 對照仍有效。

> **結案來源**：`reference/SP/USP_OB_OBPOOLDATA.sql:189-216` CASE WHEN 賦值邏輯 + DB 實證查詢 `ob_pool_data`（共 1,487,695 筆，sta_code 分布驗證），OQ-E07-23 ✅ Resolved 2026-05-12。

| 代碼 | 名稱 | 對應 STA_CODE | 案件實況 | 業務目標（建議） |
|------|------|---------------|----------|-----------------|
| `01` | 期中(不含當月滿期) | 05~89（**active 處理中**） | 距滿期 > 1 月 **OR** 剩餘期數 > 2 | 一般期中案件 |
| `02` | 中結 | 98 | 已中途結清（CRM 記帳狀態） | 中結客戶 |
| `03` | 滿期(含當月滿期) | 05~89（**仍 active**） | 本月即將滿期（距滿期 ≤ 1 月 **AND** 剩餘期數 ≤ 2）**但尚未結清** | 主動續貸、防流失 |
| `04` | 滿期 | 90（**已完成結清**） | 已完整結清完成 | 回找維繫、再行銷 |

**`03` vs `04` 根本差異**：兩者文字均含「滿期」，差別在 **STA_CODE 不同** — `03` 仍是 active 處理中（即將到期、尚未結清），`04` 已是結清狀態（已完成）。業務上 `03` 用於攔截即將流失的客戶（防流失/續貸），`04` 用於回找已結清客戶再次接觸（維繫/再行銷）。

**DB 實證筆數分布**（`ob_pool_data` 1,487,695 筆，2026-05-12 查詢）：

| 代碼 | 筆數 |
|------|------|
| `01` 期中 | 331,577 |
| `02` 中結 | 403,504 |
| `03` 滿期(含當月) | 4,711 |
| `04` 滿期 | 747,903 |

**計算與比對機制**：以上分類規則由舊系統 SP `USP_OB_OBPOOLDATA.sql:189-216` 以 `STA_CODE` / `MATURITY_DT` / `DEAL_NUM-PAYT_NUM` 計算後寫入 `ob_pool_data.list_type`。新系統 Stage 1 直接讀取 `ob_pool_data.list_type` 與業務部長於本表單選擇之 `ob_list_definition.case_status` 比對（OR 邏輯，BR-7，AD-E07-14）。

> 業務目標欄位標註「（建議）」表示為依 SP 邏輯與舊系統業務反推之合理推論，作為前端 tooltip 提示用途；非絕對化定義，實際業務操作以業務部長之名單條件設定為準。

### 5.2 選填欄位

| 欄位 | Schema 欄位名 | UI 元件 | 說明 |
|---|---|---|---|
| 卡別 | `card_type` | **下拉選單（`<select>`）** | **v2.1.1（2026-05-20 / US-126 / US-127 / D1 / D4 / Q-A）**：UI 從文字輸入改為動態下拉；選項來源 `GET /api/v1/assignment/scoring/card-types`；建立模式僅列 `status='active'` 卡別；編輯模式（F051）額外保留「該名單已存的 inactive 值」（disabled，可保留不可重選）；首選項「— 未選擇 —」（空值，預設選中）；DTO 送出值為 `ob_card_type.card_type` 代碼字串。獨立輸入，不由 `list_nm` 解析（A43 決議）；後端欄位長度對齊 `ob_card_type.card_type VARCHAR(5)`（`^[A-Z0-9]{1,5}$`），v2.0 之前端 `maxLength={2}` 限制已移除。完整契約見 AC-16 |
| 啟用 CR 回分 | `cr_enabled` | Toggle / Checkbox，預設 false | **v2.0 新增**：per-list flag，取代原 F059 全域開關（F059 已 DEPRECATED）。`BOOLEAN NOT NULL DEFAULT false`；月跑 Stage 3 依此 flag 決定是否將該名單套用 CR（Customer Recycling）回分規則。詳見 [data-model.md `ob_list_definition.cr_enabled`](../data-model.md#ob-list-definition-obmlistdf--名單定義) |

**v2.1.1 移除欄位**（不再為前端表單欄位；US-128 / D2 / Q-B B3）：

| ~~欄位~~ | ~~Schema~~ | v2.1.1 處置 |
|---|---|---|
| ~~最佳產品~~ | ~~`prod_best`~~ | 一級欄位移除；業務語意改由篩選條件區 `best_case` categorical condition 取代（值 `Y` = 優質案件 / `N` = 非優質案件；F076 v1.6 / US-129 AC-1）。`ob_list_definition.prod_best` schema 欄位保留為 deprecated（NOT NULL 放寬為 NULL；現有資料於本次一次性 migration 清空為 NULL，Q-B B3 決議）；新名單寫入不填值（後端 DTO 對 `prodBest` 之處置 — `@IsOptional()` backward-compat 接受或刪除 — 由 system-architect 決定）。完全 DROP COLUMN 屬 v2.2+ 後續決策 |

### 5.3 系統管理欄位（表單不顯示）

- `list_no`（系統自動產生）
- `list_type = '01'`（後端固定）— **僅系統內部分類用，表示「分派名單」類型，業務部長不設定此欄位**
- `project_workym = :currentYm`（後端自動填入）
- `status = 'active'`（新增時固定）
- `stage = 'draft'`（新增時固定，F077 五階段流程）
- `created_by`, `created_at`, `updated_by`, `updated_at`（後端自動填入）
- **backward-compat 衍生欄位**（v2.1 / J6 / BR-10）：`prod_kind` / `caseyear` / `spec_tp` / `case_status` / `settle_src` — 表單不顯示，後端依 `condition_payload` 衍生填入並寫入 entity column；衍生規則由 Phase 3a system-architect 設計（GAP-LIST §C3）；作為舊讀取端（F048 清單頁、F051 編輯頁 fallback、月跑 Stage 1 fallback）之 backward-compat 來源
- **`prod_best`（v2.1.1 deprecated / US-128 / Q-B B3）**：表單不顯示、前端不送出；entity column 保留為 deprecated（NOT NULL 放寬為 NULL），既有資料於本次一次性 migration 清空為 NULL；新名單寫入後端應忽略此欄位（具體 backend DTO 是否標 `@IsOptional()` 或刪除由 system-architect 決定）；**不**屬於 backward-compat 衍生欄位範圍（即不由 `condition_payload` 衍生填入），其業務語意改由 `condition_payload.conditions[columnName='best_case']` 承接

### 5.4 condition_payload JSON Schema（v2.1 新增 / A2 解除）

`condition_payload` 為名單篩選條件之 source of truth（取代 v2.0 之 5 個一級欄位必填語意；A1 / A2）。JSON schema：

```json
{
  "conditions": [
    {
      "columnName": "prod_kind",
      "fieldType": "categorical",
      "values": ["01", "02"]
    },
    {
      "columnName": "month_cnt",
      "fieldType": "numeric",
      "min": 1,
      "max": 6
    },
    {
      "columnName": "birth_date",
      "fieldType": "date",
      "dateStart": "1990-01-01",
      "dateEnd": "2005-12-31"
    }
  ],
  "logic": "AND"
}
```

**規則**：

| 規則 | 說明 | 違反處置 |
|---|---|---|
| `conditions` 至少 1 個**非系統固定** condition（v2.3.1 / US-144） | `is_system_fixed = false` 之條件數須 ≥ 1；系統固定欄位（如 `best_case`）不計入。檢查於 `validateConditionPayload`、`injectSystemFixedConditions`（BR-14）**之前**執行，計數對象為使用者送入之 payload | 422 `VALIDATION_ERROR`，訊息「篩選條件不得為空，請至少設定一個非系統固定（使用者自訂）篩選欄位」（AC-10 / BR-6） |
| `logic` 固定 `"AND"` | MVP 僅支援多欄位 AND 組合（同欄位多值為 IN/OR 語意，見 BR-7） | 422 `VALIDATION_ERROR` |
| `columnName` 必在 F075 白名單 `is_active=true` | 後端 service 層校驗（defense-in-depth） | 422 `CONDITION_COLUMN_NOT_IN_WHITELIST`（AC-11 / BR-6） |
| `columnName` lowercase snake_case | regex `/^[a-z][a-z0-9_]{0,63}$/`（對齊 F075 v1.4.3 BR-14） | 422 `VALIDATION_ERROR`（BR-11） |
| `columnName` 不得為 `list_period_start` / `list_period_end` / `list_interval` | 一級保留欄位（J8） | 400 `RESERVED_FIELD_IN_CONDITIONS`（AC-12 / BR-8） |
| `fieldType` 為 `"numeric"` / `"categorical"` / `"date"` 之一 | 對齊 F075 v1.5 `field_type` ENUM | 422 `VALIDATION_ERROR` |
| categorical 條件須含 `values: string[]`（≥1 元素） | 對應 SQL `IN (...)` 比對（BR-7） | 422 `VALIDATION_ERROR` |
| numeric 條件須含 `min` 與 `max`（皆 number；`max >= min`） | 對應 SQL `BETWEEN min AND max` 比對（BR-7） | 422 `VALIDATION_ERROR` |
| date 條件須含 `dateStart` 與 `dateEnd`（ISO 8601；`dateEnd >= dateStart`） | 對應 SQL `BETWEEN` 比對（BR-7） | 422 `VALIDATION_ERROR` |
| categorical values 含 `is_active=false` 之 option | 非阻擋，僅警示 | 201 Created + `warnings: [{ code: "WHITELIST_OPTION_INACTIVE", affectedFields: [...] }]`（AC-13） |

> **v2.1.1 補述（2026-05-20 / US-128 / US-129）**：`best_case`（categorical，display_name「優質案件」）為 F075 v1.6 白名單之一；對應 options `Y` / `N`（F076 v1.6 / US-129 AC-1）；本欄位語意承接已移除之 `prod_best` 一級欄位（見 §5.2 移除欄位段）。
>
> **v2.3 補述（2026-05-28 / US-144 / Design A）**：`best_case` 自 F075 v1.7 起為**系統固定**篩選條件（`pooldata_field_whitelist.is_system_fixed = true`）。使用者送出之 payload 中 `best_case` 之 `values` 無論為何（含 `['N']` / `[]` / 缺漏 / 多值），均於 `injectSystemFixedConditions`（BR-14）階段被**靜默正規化**為 `['Y']`；上表「categorical 條件須含 `values: string[]`（≥1 元素）」「categorical values 含 `is_active=false` 之 option」等一般規則**不**對 system-fixed 欄位拋錯或警示（系統固定值恆為合法）。本注入發生於上表所列一般 condition_payload schema 驗證**之後**，故使用者就 `best_case` 的任何竄改不影響 201 Created 結果（對應 AC-17 / US-144 AC-1）。`best_case` 仍從「新增條件」dropdown 排除、且 UI 渲染為鎖定列（US-144 AC-3 / AC-4），由 `isSystemFixed` 旗標驅動。

## 6. API 規格

> **v2.2 結構說明**：本節包含兩個獨立端點：§6.1 POST 建立名單（既有，v2.1 重寫）、§6.2 GET Detail Snapshot（新增，GAP-G1 / US-131）。

### 6.1 POST /api/v1/assignment/list-definitions（v2.1 重寫）

**Request Body**

```json
{
  "listNm": "車貸月跑名單",
  "listPeriodStart": 1,
  "listPeriodEnd": 6,
  "listInterval": 1,
  "cardType": "S5",
  "crEnabled": false,
  "conditionPayload": {
    "conditions": [
      { "columnName": "prod_kind", "fieldType": "categorical", "values": ["01"] },
      { "columnName": "caseyear", "fieldType": "categorical", "values": ["1", "2"] },
      { "columnName": "spec_tp", "fieldType": "categorical", "values": ["02", "04"] },
      { "columnName": "case_status", "fieldType": "categorical", "values": ["01", "02"] },
      { "columnName": "settle_src", "fieldType": "categorical", "values": ["Y"] },
      { "columnName": "best_case", "fieldType": "categorical", "values": ["Y"] }
    ],
    "logic": "AND"
  },
  "copyFromListNo": null
}
```

**v2.1 變更**：
- 移除 `prodKind` / `caseYear` / `specTp` / `caseStatus` / `settleSrc` 5 個欄位（前端不送出；後端依 `conditionPayload` 衍生填入 entity column，J6 / BR-10）
- 新增 `conditionPayload`（必填；JSON schema 見 §5.4）

**v2.1.1 變更**（2026-05-20 業務複核補強）：
- **移除 `prodBest` 欄位**（US-128 / D2 / Q-B B3）：前端不送出；後端 DTO 對 `prodBest` 之處置（`@IsOptional()` backward-compat 接受或刪除）由 system-architect 決定。
- **`cardType` 值來源變更**（US-126 / US-127 / D1 / D4）：從文字輸入改為 `ob_card_type` 動態下拉送出之代碼字串（範例由 `"01"` 改為 `"S5"` 以示 `ob_card_type.card_type` 真實值範圍）。
- **`conditionPayload.conditions` 合法 columnName 集合擴增**（US-128 / US-129）：新增 `best_case`（categorical，承接已移除之 `prod_best` 業務語意；F075 v1.6 seed）。

**v2.3 變更**（2026-05-28 / US-144 / Design A）：
- **`best_case` 為系統固定條件**：上方 request body 範例之 `best_case` 條目即使前端**完全省略**或傳入非 `['Y']` 之值，後端 `injectSystemFixedConditions`（BR-14）仍於驗證後注入 / 正規化為 `{ columnName: 'best_case', fieldType: 'categorical', values: ['Y'] }`；請求一律回 201 Created（不因 `best_case` 竄改拒絕；AC-17）。Response body 之名單讀取（如 §6.2 full-snapshot）將反映正規化後之 `best_case: ['Y']`。

`crEnabled` 為選填 boolean（預設 false），v2.0 新增 per-list flag，取代 F059 全域開關。

`copyFromListNo` 為選填，若提供則表示「從既有名單複製」；後端可用於稽核記錄來源；來源名單需 `condition_payload IS NOT NULL`（AC-5），否則回 422 `LEGACY_LIST_NOT_COPYABLE`。

**Response — 201 Created**

```json
{
  "listNo": "OB202605001",
  "listNm": "車貸月跑名單",
  "status": "active",
  "projectWorkym": "202605",
  "stage": "draft",
  "warnings": []
}
```

若 conditions 含 `is_active=false` 之 categorical option，response 含 `warnings: [{ code: "WHITELIST_OPTION_INACTIVE", affectedFields: ["..."] }]`（AC-13）。

**錯誤回應**

| HTTP | 錯誤碼 | 說明 |
|---|---|---|
| 400 | RESERVED_FIELD_IN_CONDITIONS | `conditions` 含一級保留欄位 `list_period_start` / `list_period_end` / `list_interval`（AC-12 / BR-8 / J8 / 拍板 3） |
| 401 | AUTH_TOKEN_MISSING | 未登入 |
| 403 | E07_REQUIRES_DIRECTOR | `businessRole` 非 `'director'`（`DirectorGuard` 攔截，依 F002 §4.6.2） |
| 409 | ASSIGNMENT_RUN_ALREADY_RUNNING | 月跑執行中 |
| 422 | CONDITION_COLUMN_NOT_IN_WHITELIST | `conditions[].columnName` 不在 F075 v1.5 白名單或對應欄位 `is_active=false`（AC-11 / BR-6 / 拍板 1） |
| 422 | LEGACY_LIST_NOT_COPYABLE | `copyFromListNo` 指向之來源名單 `condition_payload IS NULL`（舊遷移名單）（AC-5 / 拍板 Q4） |
| 422 | LIST_NO_LIMIT_EXCEEDED | 本月已達 999 筆 |
| 422 | LIST_NO_DUPLICATE | `prod_kind + card_type` 組合已存在 active 名單（v2.1：prod_kind 由 condition_payload 衍生後再做檢查，衍生規則由 Phase 3a 設計，BR-2） |
| 422 | LIST_STAGE_TRANSITION_FORBIDDEN | （F051 編輯場景）對非 draft 階段名單寫入 condition_payload（AC-14 / K1） |
| 422 | VALIDATION_ERROR | 欄位驗證失敗（詳見 details；含 condition_payload schema 違反，例：conditions 為空、columnName 非 lowercase snake_case、fieldType 不合法、numeric `max < min` 等） |
| ~~422~~ | ~~CASE_STATUS_REQUIRED~~ | **v2.1 移除**：case_status 改由 `condition_payload` 必填與 columnName 白名單驗證統一覆蓋（A1 / A5） |

### 6.2 GET /api/v1/assignment/list-definitions/:listNo/full-snapshot（v2.2 新增 / GAP-G1 / US-131）

**用途**：取得指定名單之完整快照，供 [F048 v2.0](F048-view-list-definition.md) Kanban 卡片「查看」按鈕觸發 Detail Drawer 顯示 4 個頁籤（篩選條件 / 部門比例 / 個別比例 / 簽核歷史）使用。本端點為**唯讀**，不修改任何資料。

| 認證 | JWT 必填 |
|---|---|
| 權限 | `DirectorOrSectionChiefGuard`（沿用 [F048 v2.0](F048-view-list-definition.md) §5.1 既有 pattern，依 F002 §4.6.2 / `feedback_e07_b2_rbac_replace_pattern` 標準模式：class 級 `DirectorOrSectionChief` 基準閘 + method 級唯讀，無 `@RequireDirector`） |

**Path Parameter**：

| 名稱 | 型別 | 必填 | 說明 |
|---|---|---|---|
| `listNo` | string | 是 | 11 碼名單編號，regex `^OB[0-9]{9}$` |

**Query Parameter**：無

**Response — 200 OK**

```json
{
  "list": {
    "listNo": "OB202605009",
    "listNm": "2026-05 業務一部 結清強催",
    "stage": "ready",
    "stageLabel": "準備完成",
    "status": "active",
    "projectWorkym": "202605",
    "cardType": "S5",
    "crEnabled": true,
    "listPeriodStart": 1,
    "listPeriodEnd": 6,
    "listInterval": 1,
    "conditionPayload": {
      "conditions": [
        { "columnName": "spec_tp", "fieldType": "categorical", "values": ["12"] },
        { "columnName": "case_status", "fieldType": "categorical", "values": ["02"] }
      ],
      "logic": "AND"
    },
    "legacyEntityFallback": null,
    "createdBy": "user-uuid-001",
    "createdByEmpNm": "王部長",
    "createdAt": "2026-05-09T01:14:00Z",
    "updatedAt": "2026-05-11T01:15:00Z"
  },
  "deptRatios": [
    { "deptCode": "XTA0", "deptName": "業務一部", "ration": 35 },
    { "deptCode": "XTB0", "deptName": "業務二部", "ration": 28 }
  ],
  "personnelRatios": [
    {
      "deptCode": "XTA0",
      "deptName": "業務一部",
      "members": [
        { "emplid": "E001", "empNm": "陳大明", "ration": 12 },
        { "emplid": "E002", "empNm": "林小華", "ration": 13 }
      ]
    }
  ],
  "auditTrail": [
    { "action": "CREATE", "operatorId": "user-uuid-001", "operatorEmpNm": "王部長", "before": null, "after": { "stage": "draft" }, "at": "2026-05-09T01:14:00Z" },
    { "action": "STAGE_ADVANCE", "operatorId": "user-uuid-001", "operatorEmpNm": "王部長", "before": { "stage": "draft" }, "after": { "stage": "dept_ratio" }, "at": "2026-05-09T03:32:00Z" },
    { "action": "STAGE_ADVANCE", "operatorId": "user-uuid-001", "operatorEmpNm": "王部長", "before": { "stage": "dept_ratio" }, "after": { "stage": "personnel_ratio" }, "at": "2026-05-10T02:21:00Z" },
    { "action": "STAGE_ADVANCE", "operatorId": "user-uuid-001", "operatorEmpNm": "王部長", "before": { "stage": "personnel_ratio" }, "after": { "stage": "approval" }, "at": "2026-05-10T08:45:00Z" },
    { "action": "STAGE_ADVANCE", "operatorId": "user-uuid-001", "operatorEmpNm": "王部長", "before": { "stage": "approval" }, "after": { "stage": "ready" }, "at": "2026-05-11T01:15:00Z" }
  ]
}
```

**Response Schema 規範**：

| 區段 | 型別 | 說明 |
|---|---|---|
| `list` | object | 名單基本資料 + 篩選條件；`conditionPayload` 為 JSONB 整段（可為 `null`，舊遷移名單）；`legacyEntityFallback` 僅當 `conditionPayload IS NULL` 時非 null，含 5 個 backward-compat entity column 值（`prodKind` / `caseyear` / `specTp` / `caseStatus` / `settleSrc`，以 `$$` 分隔字串原樣回傳，由前端解析顯示） |
| `deptRatios[]` | array | 各部門配比（依 `ob_dept_pct`）；空陣列代表「尚未設定部門比例」 |
| `personnelRatios[]` | array | 業務員個別配比，依部門分組；空陣列代表「尚未設定個別比例」 |
| `auditTrail[]` | array | 流程 timeline（依 `assignment_audit_log`，過濾 `list_no = :listNo`），依 `created_at` ASC 排序；**僅含 `assignment_audit_log` 之 action enum 條目**（見下方 §6.2.1 對齊 entity） |

**§6.2.1 `auditTrail[].action` 列舉值（v2.2.1 / D1 / 對齊 entity）**：

實際 `AssignmentAuditLog.action` enum 為 VARCHAR(30)，定義於 `apps/api/src/database/entities/assignment-audit-log.entity.ts:26-39`：

| action | 寫入時機 | 對應 spec |
|---|---|---|
| `CREATE` | 名單建立 | F050 v2.1.1 AC-9（本 spec） |
| `UPDATE` | 名單編輯（草稿階段） | F051 |
| `DELETE` | 名單實體刪除（MVP 未使用，停用採軟刪除） | — |
| `RUN` | 月跑觸發 | F061 v1.4 |
| `EXPORT` | 分派結果匯出 | F064 v1.1 AC-5 |
| `CANCEL` | 月跑取消 | F062 Phase 2 |
| `STAGE_ADVANCE` | 階段推進（draft → dept_ratio / dept_ratio → personnel_ratio / personnel_ratio → approval / approval → ready） | F078 / F080 / F084 / F086 |
| `STAGE_ROLLBACK` | 階段退回（dept_ratio → draft / personnel_ratio → dept_ratio / ready → approval） | F081 v1.3 / F085 v1.3 / F089 v1.3 |
| `STAGE_REJECT` | 簽核拒絕（approval → personnel_ratio） | F087 |
| `ASSIGN_ROLE` / `REVOKE_ROLE` | 角色指派 / 撤銷 | F073 / F074 |
| `SCORING_INTEGRITY_WARN` | Stage 2 計分完整性警告（彙總列） | F061 v1.3 BR-13 |

**§6.2.2 核准 / 拒絕記錄之資料來源（v2.2.1 / D1）**：

核准（approve）/ 拒絕（reject）**不**寫入 `assignment_audit_log`，而是寫入獨立的 `assignment_approval` 表（`apps/api/src/database/entities/assignment-approval.entity.ts`）：

- 該表 `action` enum 為**小寫** `approve` / `reject`（VARCHAR(10)），與 `assignment_audit_log.action` 為兩套獨立 enum
- 設計理由：核准 / 拒絕需額外欄位（`reject_reason` / `approver_name` / `approver_role` / `approved_at`），不適合塞入 audit log 之 `before_value` / `after_value` JSON；同時 F087 v1.1 / F082 v1.1 之 latestRejection banner 觸發機制需以 `assignment_approval` 為查詢來源
- 拒絕另寫一筆 `assignment_audit_log.action='STAGE_REJECT'`（簽核拒絕的 stage 轉換稽核）— 兩張表並存
- **§6.2 `auditTrail[]` 不含 approval 條目**；如需顯示完整簽核 timeline（含 approve / reject 之 `approver_name` / `reject_reason`），需另起 endpoint（建議 `GET /assignment/list-definitions/:listNo/approvals`）；本 v2.2.1 不規範新 endpoint，屬未來 enhancement

**Stage-aware null state**（對應 US-131 AC-3 / AC-4 / AC-5，v2.2.1 已對齊 entity enum）：

| stage | `deptRatios` | `personnelRatios` | `auditTrail` |
|---|---|---|---|
| `draft` | `[]` | `[]` | 至少含 `CREATE` 一筆（剛建立時） |
| `dept_ratio` | 有值（合計 100%） | `[]` | 含 `CREATE` / `STAGE_ADVANCE` 至 dept_ratio |
| `personnel_ratio` | 有值 | 有值（合計 100%） | 含上述 + `STAGE_ADVANCE` 至 personnel_ratio |
| `approval` | 有值 | 有值 | 含上述 + `STAGE_ADVANCE` 至 approval |
| `ready` | 有值 | 有值 | 完整 timeline（含多筆 `STAGE_ADVANCE`；可能含 `STAGE_REJECT` 中途退回後再次 `STAGE_ADVANCE`） — **不含**核准 / 拒絕之 `approver_name` / `reject_reason`，該等資料在 `assignment_approval` 表（見 §6.2.2） |

**處長轄區隔離（對應 US-131 AC-4 / v2.2.1 D2 對齊 production pattern）**：

當 `role = 'user'` 且 `businessRole = 'section_chief'` 呼叫本端點時：
- `personnelRatios[]` 中**僅回傳本處長轄區之 `members`**：以 **`ob_empl_set.created_by = currentUserId`** 過濾（沿用 `SectionChiefScopeService` 既有 production pattern，見 `apps/api/src/modules/assignment/services/section-chief-scope.service.ts`；與 F063 v1.1 BR-6 / BR-7 / F064 v1.1 / F066 v1.1 / F067 v1.1 之 scopeByCreator pattern 一致）
- **不**以 `dept_code` 過濾（User entity 無 `dept_code` 欄位；ob_emphire 亦無 `created_by` 欄位，故不可用 ob_emphire 反查部門）
- 過濾粒度為 emplid（個別業務員），故同一部門內可能僅顯示部分業務員（該部門其他業務員若屬其他處長轄區，不會出現於 `members`）
- `deptRatios[]` 不過濾（仍回所有部門配比，因處長可看到全名單分配輪廓）
- `list.createdBy` 不過濾（即使該名單由其他處長 / 部長建立，仍可開啟 Drawer 唯讀檢視；本端點屬唯讀，與 F048 主清單之「處長僅見本轄區卡片」過濾為不同 layer 之 guard）

**錯誤回應**

| HTTP | 錯誤碼 | 說明 |
|---|---|---|
| 401 | AUTH_TOKEN_MISSING / AUTH_TOKEN_EXPIRED | 未登入或 Token 過期 |
| 403 | AUTH_FORBIDDEN | `role = 'user'` 或 `businessRole` 不在 `('director','section_chief')`（`DirectorOrSectionChiefGuard` 攔截） |
| 404 | ASSIGNMENT_LIST_NOT_FOUND | `list_no` 不存在 |
| 500 | SYSTEM_INTERNAL_ERROR | 伺服器內部錯誤 |

**註**：本端點**不**攔截 `LIST_HISTORICAL_READONLY`（歷史月份）— 對應 US-131 AC-1 之明定行為：「歷史月份與目前月份均可開啟 Drawer」；歷史月份限制僅套用於寫入端點，本唯讀端點不適用。同理本端點**不**攔截 `ASSIGNMENT_RUN_ALREADY_RUNNING`（月跑鎖中）— Drawer 在月跑執行中仍可開啟唯讀檢視。

**呼叫者**：
- [F048 v2.0](F048-view-list-definition.md) Kanban 卡片「查看」按鈕（所有 role / 所有 stage / 歷史月份 / 月跑鎖中皆可觸發，對齊 [F077 v1.3 BR-7 C-5](F077-month-switch-and-stage-overview.md)）

## 7. 商業規則

| 規則編號 | 說明 |
|---|---|
| BR-1 | `list_no` 產生邏輯：後端查詢當月最大既有流水號 + 1；若無既有則從 001 開始；達 999 回傳 `LIST_NO_LIMIT_EXCEEDED` |
| BR-2 | `prod_kind + card_type` 組合僅在 `status = 'active'` 範圍內檢查唯一性；停用紀錄不納入。**v2.1 補述**：v2.1 重構後，`prod_kind` 由 `condition_payload` 衍生（BR-10），唯一性檢查的具體比對語意（多值交集 / 子集 / 完全相等等）由 **Phase 3a system-architect** 設計；本 spec 暫保留 v2.0 語意作為過渡定義（拍板 Q5） |
| BR-3 | 多值欄位（`caseyear` / `spec_tp` / `settle_src` / `case_status` / `prod_kind`）寫入 entity column 時以 `$$` 為分隔符儲存（如 `0$$1$$2$$3`、`01$$02$$03`）；v2.1 起此為**後端衍生填入之 backward-compat 格式**（BR-10），前端不直接送出此格式。**v2.1.1 補述（US-128）**：`prod_best` 已從一級欄位移除，**不**屬於 BR-3 衍生欄位之一；其業務語意改由 `condition_payload.conditions[columnName='best_case']` 承接（見 BR-12） |
| BR-4 | 月跑執行鎖由 `assignment_run.status IN ('pending', 'running')` 判斷 |
| BR-5 | 所有寫入操作必須同步寫入 `assignment_audit_log`；稽核寫入失敗僅記錄 Logger.error，不 rollback 業務操作 |
| BR-6 | **condition_payload 為 source of truth（v2.1 重寫，A1 / A2 / A3 解除；v2.3.1 最低條件數修正 / US-144）**：(1) 必填，`conditions` 至少 1 個**非系統固定（`is_system_fixed = false`）condition**——系統固定欄位（如 `best_case`）不計入最低門檻；計數於 `validateConditionPayload`、`injectSystemFixedConditions`（BR-14）**之前**執行，計數對象為使用者送入之 payload（無論是否含 `best_case`，一律排除 `is_system_fixed = true` 欄位）；非系統固定條件數為 0 時回 422 `VALIDATION_ERROR`，訊息「篩選條件不得為空，請至少設定一個非系統固定（使用者自訂）篩選欄位」（AC-10）；(2) 每個 `conditions[].columnName` 必須存在於 F075 v1.5 `pooldata_field_whitelist` 且 `is_active = true`；違反回 422 `CONDITION_COLUMN_NOT_IN_WHITELIST`（拍板 1）；(3) service 層校驗於寫入前執行（defense-in-depth，即使前端 dropdown 已過濾）；(4) `data-model.md` `ob_list_definition.condition_payload` JSONB 欄位之 schema 規範由本 §5.4 定義 |
| BR-7 | **多值 / 區間 SQL 比對語意（v2.1 重寫，A6 / D3 解除）**：(1) categorical 條件以 SQL `columnName IN (v1, v2, ...)` 語意（同欄位多值 OR，符合任一即納入；對應 US-122 AC-2）；(2) numeric 條件以 `columnName BETWEEN min AND max`（含邊界，US-122 AC-3）；(3) date 條件以 `columnName BETWEEN dateStart AND dateEnd`；(4) 多欄位之間以 `AND` 組合；(5) **舊 SP 之 `LIKE '%val$$%' OR LIKE '%$$val' OR = 'val'` 三段比對已棄用**，僅保留於 `condition_payload IS NULL` 之舊名單 fallback 路徑（D4 / US-122 AC-4，由 Phase 3a 實作） |
| BR-8 | **list_period_* 為一級保留欄位（v2.1 新增，J8 / 拍板 3）**：`list_period_start` / `list_period_end` / `list_interval` 為 `ob_list_definition` 一級欄位，禁止納入 `condition_payload.conditions`；違反回 400 `RESERVED_FIELD_IN_CONDITIONS`；前端 dropdown 不列出此三個欄位，後端 service 層 defense-in-depth 校驗 |
| BR-9 | **INACTIVE 選項警示（v2.1 新增，非阻擋）**：寫入時若 `conditions[].values` 含 `pooldata_field_option.is_active=false` 之 option，回 201 Created + `warnings: [{ code: "WHITELIST_OPTION_INACTIVE", affectedFields: [...] }]`；與 F076 v1.5 BR-4「停用後不回溯」語意一致；月跑 Stage 1 仍以已固化條件過濾 |
| BR-10 | **backward-compat 衍生欄位（v2.1 新增，J6 / C3）**：5 個 entity column（`prod_kind` / `caseyear` / `spec_tp` / `case_status` / `settle_src`）由後端依 `condition_payload` 衍生填入並寫入 `ob_list_definition`；衍生規則之具體實作（單值 / 多值 `$$` 分隔組合方式、categorical/numeric/date 轉換語意）由 **Phase 3a system-architect** 設計；本 spec 僅聲明意圖。讀取端（F048 清單頁、F051 編輯頁 fallback、月跑 Stage 1 condition_payload IS NULL fallback）使用此 5 個欄位作為 backward-compat 資料來源。**v2.1.1 補述（US-128）**：`prod_best` **不**在本 BR-10 範圍內（即不由 `condition_payload` 衍生填入；亦不作為 backward-compat 讀取欄位）；其業務語意改由 `condition_payload.conditions[columnName='best_case']` 承接（見 BR-12） |
| BR-11 | **columnName 大小寫 normalize（v2.1 新增）**：API 接受 `conditions[].columnName` 時統一為 lowercase snake_case，對齊 `ob_pool_data` 與 F075 v1.4.3 BR-14；regex 為 `/^[a-z][a-z0-9_]{0,63}$/`；違反回 422 `VALIDATION_ERROR`。**不影響** F068（DEPRECATED v1.3）之 `ob_code_df.tbl_id` 大寫業務常數（屬獨立語境） |
| BR-12 | **best_case 取代 prod_best 之語意映射（v2.1.1 新增，US-128 / US-129 / D2 / Q-B B3）**：(1) 業務語意「最佳產品 / 優質案件」改由 `condition_payload.conditions[columnName='best_case', fieldType='categorical', values: ['Y'\|'N']]` 表達；(2) `ob_list_definition.prod_best` schema 欄位保留為 deprecated（NOT NULL 放寬為 NULL），既有資料於本次一次性 migration 清空為 NULL（Q-B B3 決議）；新名單寫入不填值（後端 DTO 處置由 system-architect 決定）；(3) 月跑 Stage 1 不再讀 `prod_best` 欄位；依 `condition_payload.conditions` 之 `best_case` 條件對 `ob_pool_data.best_case` 以 `IN (...)` 過濾（對應 BR-7）；(4) `best_case` options 來源 = F076 v1.6 `pooldata_field_option WHERE column_name='best_case'`（`Y` = 優質案件、`N` = 非優質案件；US-129 AC-1）；(5) 完全 DROP COLUMN 屬 v2.2+ 後續決策，本 v2.1.1 不執行 |
| BR-13 | **sessionStorage Signal Protocol — `cdmp.pendingToast`（v2.2 新增 / GAP-G2 / US-133 / single authority）**：跨頁 toast 訊號協定，限「子頁工作流完成後返回 M01 主頁」之情境使用。本 BR-13 為**唯一權威來源**，F079 / F082 / F086 / F087 之 §7 UI/UX 需求透過 cross-reference 引用本 BR-13，不重複定義。完整規範如下：<br><br>**(1) Key 命名**：`cdmp.pendingToast`（全小寫、點分隔；對齊 `cdmp.*` 全域 sessionStorage / localStorage key 命名規範）。<br><br>**(2) Payload JSON Schema**：<br>```json<br>{<br>  "type": "success" \| "info" \| "warning" \| "error",  // 必填<br>  "msg": string,                                       // 必填，主訊息（建議 ≤ 60 字）<br>  "sub": string                                        // 選填，副訊息（建議 ≤ 80 字）<br>}<br>```<br>對應 toast UI 4 種樣式（success = 綠 / info = 藍 / warning = 琥珀 / error = 紅）；前端 toast 元件依 `type` 渲染對應 icon 與顏色。<br><br>**(3) Producer 規範**（子頁寫入）：<br>- **寫入時機**：成功 / 取消決定後、`location.href` 跳轉**前**執行<br>- **寫入方式**：`sessionStorage.setItem('cdmp.pendingToast', JSON.stringify(payload))`<br>- **失敗處理**：以 `try/catch` 包覆，sessionStorage API 不可用（無痕模式 / 配額耗盡）時靜默吞 exception，不阻擋跳轉<br>- **適用子頁**：[F079](F079-set-dept-ratio.md) 部門比例設定（29a）、[F082](F082-set-per-sales-ratio.md) 個別比例設定（29b）、[F086](F086-approve-to-ready.md) 簽核核准 / [F087](F087-reject-to-personnel-ratio.md) 簽核拒絕（29c）；其他寫入操作 spec 如需採用須先 cross-reference 本 BR-13<br><br>**(4) Consumer 規範**（M01 主頁讀取）：<br>- **讀取時機**：M01 主頁（[F048 v2.0](F048-view-list-definition.md) Kanban 頁）`DOMContentLoaded`（或 React `useEffect([])`）執行、Kanban 渲染**之後**<br>- **行為**：`sessionStorage.getItem('cdmp.pendingToast')` → `JSON.parse`（包 try/catch）→ 依 `type` 顯示對應樣式 toast → 立即 `sessionStorage.removeItem('cdmp.pendingToast')`<br>- **無效 JSON / 無 key**：靜默不顯示、清除殘留 key（若有）；不拋出 uncaught exception<br><br>**(5) Consume-once 語意**：M01 主頁讀取後**立即** `removeItem`，確保：<br>- 同一 toast 不因頁面重整（F5）重複顯示<br>- 同一 toast 不因瀏覽器返回（browser back）重複顯示<br>- 同一 toast 不因多分頁同時開啟 M01 而重複顯示<br><br>**(6) 適用情境（限定範圍）**：<br>- **適用**：子頁完成（儲存 / 取消）後跳回 M01 主頁之 toast 提示（範例：「{LIST_NM} 部門比例已儲存 / 名單已推進至個別比例設定階段」、「已取消，返回名單定義」）<br>- **不適用**：同頁面內操作 toast（直接用 React state 即可）、Detail Drawer 操作回饋、橫向跨模組跳頁（如 M01 → M02）<br><br>**(7) 跨 spec reference**：F079 / F082 / F086 / F087 spec 之 §7 UI/UX 需求**僅描述**「子頁完成後依 [F050 v2.2 §7 BR-13](F050-create-list-definition.md) 寫入 `cdmp.pendingToast` 並跳回 M01 主頁」即可，不重複展開 payload / consume-once / key 命名等細節。 |
| BR-14 | **系統固定篩選條件強制注入（`injectSystemFixedConditions` 契約）（v2.3 新增 / US-144 / Design A）**：(1) **觸發點**：`createList` 於 §5.4 condition_payload schema 驗證（含 AC-10 ~ AC-13 / BR-6 ~ BR-9 / BR-11）**通過後、寫入 `ob_list_definition` 前**，呼叫 `injectSystemFixedConditions(payload)`。(2) **契約**：input 為通過驗證之 condition_payload；service 層查 F075 v1.7 `pooldata_field_whitelist WHERE is_system_fixed = true` 之所有欄位，對每個 system-fixed 欄位於 output payload 之 `conditions` 中**確保存在對應條目且 `values` 強制為該欄位之固定值**——若 input 缺漏該條目則補入；若已存在則覆寫其 `values`（及 `fieldType`）為固定值。MVP 範圍唯一 system-fixed 欄位為 `best_case`，固定為 `{ columnName: 'best_case', fieldType: 'categorical', values: ['Y'] }`。(3) **tamper-normalization 靜默語意**：使用者就 system-fixed 欄位之任何竄改（傳 `['N']` / `[]` / 多值 / 完全省略）一律靜默正規化，**不**拒絕請求、**不**回錯誤碼，仍回 201 Created（對應 AC-17 / US-144 AC-1 / TC-144-01 / TC-144-02）。(4) **驅動旗標**：固定欄位集合與固定值之判定以 `pooldata_field_whitelist.is_system_fixed` 旗標為準（F075 v1.7 BR-15），**不** hardcode 字串 `'best_case'`，為未來擴充其他系統固定欄位預留。(5) **與 backward-compat 衍生欄位之關係**：`best_case` **不**在 BR-10 之 5 個衍生 entity column 範圍內（沿用 BR-12），僅存於 `condition_payload`。(6) **複製場景**：「從上月複製」（AC-5）之來源名單即使不含 `best_case`，注入仍於 `createList` 強制執行（US-144 AC-9）。(7) **Stage 1 無需修改**：注入後之 `best_case: ['Y']` 由既有 categorical `IN (...)` path（BR-7）產生 `"best_case" IN ('Y')`（US-144 AC-7）。(8) **回填**：既有 `stage = 'draft'` 名單之 `best_case` 回填由 migration 執行（draft only，凍結快照不回填，idempotent；US-144 AC-8）；migration 設計與 ordering 由 system-architect owns（AD-E07-18 或衍生決策），本 spec 僅引用 |
| ~~BR-6 v2.0~~ | ~~`case_status` 為獨立業務欄位...必填，至少選 1 項；可選代碼由 F068 維護~~ | **v2.1 廢除**：case_status 改由 condition_payload 必填 + columnName 白名單驗證統一覆蓋（A1 / A5）；可選代碼來源改為 F076 v1.5 `pooldata_field_option`（US-125 AC-2） |
| ~~BR-7 v2.0~~ | ~~`case_status` 多選的篩選邏輯為 **OR**~~ | **v2.1 重寫**：OR / IN 語意適用所有 categorical 條件（BR-7），不限 case_status |

## 8. UI/UX 需求（v2.1 重寫）

- **表單分區**：
  - 基本資訊：`list_nm` / `card_type`（**v2.1.1：下拉選單**，見 AC-16；v2.1.1 已移除 `prod_best`）
  - 篩選條件：`condition_payload` 動態區塊 — 「新增篩選欄位」按鈕觸發 dropdown，列出 F075 v1.6 白名單 `is_active=true` 之欄位（顯示 `display_name`，送出時使用 lowercase snake_case `column_name`）；**v2.1.1 新增 `best_case`（display_name「優質案件」）為合法可選欄位**；已加入之欄位列為一行，依 `field_type` 渲染不同 UI 元件
  - 期間設定：`list_period_start` / `list_period_end` / `list_interval`（一級欄位，不可入 conditions）
  - CR 設定：`cr_enabled` toggle
- **卡別下拉（v2.1.1 / US-126 / US-127 / D1 / D4 / Q-A）**：完整契約見 AC-16；建立模式只列 active，編輯模式（F051）含「該名單已存的 inactive 值」disabled 保留；首選項「— 未選擇 —」（空值，預設選中）；API 載入失敗 fallback 提示「卡別資料載入失敗，請重新整理頁面」（不阻擋其他欄位儲存）
- **動態條件 UI 元件依 field_type 分流**：
  - `categorical` → 多選 chip / checkbox，選項來源 `GET /api/v1/pooldata-fields/{columnName}/options?active=true`（F076 v1.5）；至少選 1 個值
  - `numeric` → 「最小值（min）」+ 「最大值（max）」雙數字框；前端驗證 `max >= min`
  - `date` → 日期區間（`dateStart` / `dateEnd`）；前端驗證 `dateEnd >= dateStart`
- **「複製名單」按鈕**：位於表單標頭，開啟 Modal 選擇來源；來源 dropdown 過濾條件 `status='active'` AND `stage='ready'` AND `condition_payload IS NOT NULL`（舊遷移名單不可作為複製來源；defense-in-depth：若繞過後端回 422 `LEGACY_LIST_NOT_COPYABLE`，拍板 Q4 / AC-5）；複製後整段 `condition_payload` 與 `list_period_*` 自動填入新表單；`cr_enabled` 恢復預設 `true`；`list_nm` 留空待填
- 即時驗證：欄位失去焦點時觸發
- **儲存按鈕**：以下所有條件通過才啟用 — `list_nm` 非空、`list_period_end >= list_period_start`、`condition_payload.conditions.length >= 1`、所有 categorical 條件至少選 1 個值、所有 numeric 條件 `max >= min`、所有 date 條件 `dateEnd >= dateStart`
- **多值欄位 backward-compat 儲存規範（v2.1）**：v2.0 之「UI 提交時 `$$` 分隔字串」規範**已廢除**；v2.1 起前端送出 `conditionPayload` JSON 結構（`values: string[]`），後端衍生填入 entity column 時才轉為 `$$` 分隔（BR-10）。詳見 [data-model.md `ob_list_definition` 多值欄位儲存規範](../data-model.md#ob-list-definition-obmlistdf--名單定義)
- **caseyear 選項來源（v2.1 重寫）**：caseyear 之 8 個 CheckBox（value `0` / `1` / `2` / `3` / `4` / `5` / `6` / `99`）由 `GET /api/v1/pooldata-fields/caseyear/options?active=true`（F076 v1.5）動態載入，**取代 v2.0 之前端 hard-coded 11 個 0~10**（A4 / J5 / US-125 AC-1 / AC-4）。`99` 顯示輔助說明文字「不限年數（全選）」（沿用 F076 v1.5 §7）。舊系統 hardcoded 11 筆 / 12 個（`reference/Areas/OBZ/Views/OBZ020/edit.cshtml:174-235`）僅供歷史對照；若管理員透過 F076 v1.5 新增 / 停用 caseyear 可選值，表單立即反映變更，不需重新部署前端。
- **case_status 選項來源（v2.1 新增）**：case_status 多選元件選項由 `GET /api/v1/pooldata-fields/case_status/options?active=true`（F076 v1.5）動態載入，4 筆 option_label 沿用 §5.1.1 業務語意對照（A5 / E4 / US-125 AC-2）

## 9. 相依性

- **Blocked By**：F048（清單頁入口）、**F075 v1.7（POOLDATA 篩選欄位白名單；含 case_status 條目 v1.5 + `best_case` 條目 v1.6 + `is_system_fixed` 旗標 v1.7：`best_case.is_system_fixed = true`，驅動 BR-14 注入與前端鎖定列 / dropdown 排除；US-144）**、F076 v1.6（類別型欄位可選值；caseyear / case_status 動態選項來源 v1.5 + **`best_case` Y/N options seed v1.6**；US-125 AC-1 / AC-2 / AC-5、US-129 AC-1）、F069（卡別計分卡主檔；`ob_card_type` 為卡別下拉資料來源；US-126 / US-127）、US-121（condition_payload 驗證規則）、US-125（caseyear / case_status 選項遷移）、**US-129（`best_case` Y/N options seed）**、**US-144（`best_case` 鎖定為系統固定篩選條件 Design A）**
- ~~F068（PROD_KIND / SPEC_TP / CASE_STATUS 代碼維護）~~（**v2.1 廢除**：F068 DEPRECATED v1.3）
- **Blocks**：F061（月跑需有 active 名單定義）、F060（per-LIST_NO 部門比例）
- **§6.2 Detail Snapshot API（v2.2 / GAP-G1）Consumers**：[F048 v2.0](F048-view-list-definition.md)（Kanban 卡片「查看」按鈕觸發 Detail Drawer）
- **§7 BR-13 sessionStorage Signal Protocol（v2.2 / GAP-G2）Consumers**：[F079](F079-set-dept-ratio.md)（29a 部門比例儲存 / 取消）、[F082](F082-set-per-sales-ratio.md)（29b 個別比例儲存 / 取消）、[F086](F086-approve-to-ready.md)（29c 簽核核准）、[F087](F087-reject-to-personnel-ratio.md)（29c 簽核拒絕）

### 9.1 v2.1.1 補強實作順序（解決雙向依賴）

v2.1.1（2026-05-20 業務複核補強）4 個 stories 之間存在雙向依賴：US-128（移除 `prod_best`）AC-4 驗證需要 `best_case` 篩選條件可用，前提為 US-129 seed 已執行；US-129（補 `best_case` options）AC-5 驗證又需要 US-128 已移除 `prod_best`（前端使用者操作前提）。為避免實作期短暫不一致，建議實作順序：

1. **US-129**（M06）：先補 F076 v1.6 `best_case` Y / N options seed migration + F075 v1.6 確認 `best_case` 已在白名單 seed（含此次 spec 修訂落地）
2. **US-128**（M01）：移除 `prod_best` 前端欄位 + entity column 清空 migration（AC-4 驗證可順利通過，因 US-129 已就緒）
3. **US-126 / US-127**（M01）：卡別下拉前端落地（與 US-128 同 sprint 並行）— 不阻擋 US-128，但建議同批 TDD agent 處理以共用 `list-*-draft-page.tsx` 改動

Backend DTO 對 `prodBest` 之處置（`@IsOptional()` 接受或直接刪除）由 system-architect 於實作前決定；本 spec 不規範。本 v2.1.1 補強之 migration（`prod_best` 清空 / `best_case` whitelist + options seed / `card_type` 不涉 DB）與 backend DTO 處置應由 system-architect 補入 AD-E07-18 或衍生決策。

## 10. 交叉參考

- 資料模型：[data-model.md#e07-data-model](../data-model.md#e07-data-model)（`ob_list_definition.condition_payload`、`ob_list_definition.prod_best` v2.1.1 DEPRECATED、`ob_list_definition.card_type` v2.1.1 下拉契約補述、[`ob_card_type` entity](../data-model.md#ob-card-type-entity)）
- 錯誤處理：[error-handling.md#assignment-list-errors](../error-handling.md#assignment-list-errors)（含 v2.1 新增 `CONDITION_COLUMN_NOT_IN_WHITELIST` / `RESERVED_FIELD_IN_CONDITIONS` / `LEGACY_LIST_NOT_COPYABLE`）
- 架構決策：AD-E07-1、AD-E07-2、**AD-E07-18**（F050 v2.1 whitelist-driven 重構：migration M1~M5 / Service 衍生規則 / Stage 1 動態 SQL / prod_kind 唯一性語意 / F068 廢除步驟；Phase 3a 落地，2026-05-20）；Phase 3a 待設計項目已全數由 AD-E07-18 覆蓋（BR-2 / BR-10 / E1~E7）。**v2.1.1 補強之 migration（`prod_best` 清空 / `best_case` whitelist + options seed）與 backend DTO 處置由 system-architect 補入 AD-E07-18 或衍生決策**（spec-writer 不規範架構細節）。**v2.3 補強（US-144）需 system-architect 補入**：(1) `pooldata_field_whitelist.is_system_fixed BOOLEAN NOT NULL DEFAULT false` 欄位 migration + `best_case` seed `is_system_fixed = true`（見 F075 v1.7）；(2) draft-only 之 `best_case: ['Y']` 回填 migration（idempotent，凍結快照不回填）；(3) 上述兩個 migration 與既有 v2.1 / v2.1.1 migration 之 ordering；spec-writer 僅以 BR-14 規範 service 層注入契約，不規範 migration / schema 細節
- 相關功能：[F048](F048-view-list-definition.md)、[F051](F051-edit-list-definition.md)、[F069](F069-edit-card-type.md)（卡別計分卡主檔；卡別下拉資料來源 `ob_card_type`）、**[F075 v1.7](F075-manage-pooldata-field-whitelist.md)（`is_system_fixed` 旗標來源；`best_case.is_system_fixed = true`）**、[F076 v1.6](F076-manage-categorical-field-values.md)、[F077 v1.3](F077-month-switch-and-stage-overview.md)（Role × Stage 矩陣 single authority，本 spec §6.2 / §7 BR-13 對齊）、~~[F068](F068-edit-base-code.md)~~（**DEPRECATED v1.3**）
- 對應 User Story：[US-121](../../stories/epics/E07-app-customer-list-assignment/US-121-M01-whitelist-condition-payload.md)、[US-122](../../stories/epics/E07-app-customer-list-assignment/US-122-M04-stage1-dynamic-filter.md)、[US-123](../../stories/epics/E07-app-customer-list-assignment/US-123-M01-backward-compat-list-read.md)、[US-124](../../stories/epics/E07-app-customer-list-assignment/US-124-M06-deprecate-f068-merge-field-base.md)、[US-125](../../stories/epics/E07-app-customer-list-assignment/US-125-M06-migrate-options-to-whitelist.md)、[US-126](../../stories/epics/E07-app-customer-list-assignment/US-126-M01-cardtype-dropdown-create.md)、[US-127](../../stories/epics/E07-app-customer-list-assignment/US-127-M01-cardtype-dropdown-edit.md)、[US-128](../../stories/epics/E07-app-customer-list-assignment/US-128-M01-remove-prodbest-field.md)、[US-129](../../stories/epics/E07-app-customer-list-assignment/US-129-M06-seed-bestcase-options.md)、**[US-131](../../stories/epics/E07-app-customer-list-assignment/US-131-M01-detail-drawer.md)（§6.2 Detail Snapshot API 來源）**、**[US-133](../../stories/epics/E07-app-customer-list-assignment/US-133-M01-pending-toast-signal.md)（§7 BR-13 sessionStorage Signal Protocol 來源）**、**[US-144](../../stories/epics/E07-app-customer-list-assignment/US-144-M01-bestcase-system-fixed-condition.md)（§4 AC-17 / §7 BR-14 best_case 系統固定條件 Design A 來源）**
