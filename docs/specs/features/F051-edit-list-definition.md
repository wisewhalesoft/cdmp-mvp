---
spec-id: F051
title: 編輯名單定義
feature-id: F051
source-story: US-089, US-106, US-107, US-121, US-123
epic: E07
module: M01 名單定義
priority: P0-MVP
version: "2.1"
date: 2026-05-20
status: Draft
---

# F051: 編輯名單定義

Priority: P0-MVP | Status: Draft | Last Updated: 2026-05-20

> **v2.1（2026-05-20 / 名單定義 whitelist-driven 重構）**：對齊 F050 v2.1。核心變更：
> 1. **`condition_payload` 為 source of truth 之覆寫式編輯**（取代 v2.0 之 5 個一級欄位必填語意；A1 / A2）。
> 2. **舊名單（condition_payload IS NULL）篩選條件區塊唯讀**（拍板 2：無「confirm 轉換」流程；E2 backfill 由 Phase 3a system-architect 一次性執行；US-123 AC-2）。
> 3. **新增 `LEGACY_LIST_CONDITION_READONLY` 錯誤碼**（422，defense-in-depth；拍板 Q3 / US-123 AC-2）。
> 4. **新增 `CONDITION_COLUMN_NOT_IN_WHITELIST` / `RESERVED_FIELD_IN_CONDITIONS`**（與 F050 v2.1 對齊；A3 / J8）。
> 5. **多值 SQL 比對語意對齊 F050 v2.1 BR-7**（categorical IN / numeric BETWEEN / date BETWEEN；A6 / D3）。
> 6. **F068 DEPRECATED**：移除 F068 引用，改引 F075 v1.5 + F076 v1.5（J2）。

> **v2.0（2026-05-16）**：依 F002 v2.0 / AD-E07 v3.0 重構：Guard 改為 `DirectorGuard`（M01 名單 CRUD 寫入限部長）；新增 `cr_enabled` per-list flag 可於本表單調整（取代 F059 全域開關）。

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + `data-model.md#e07-data-model` + `error-handling.md#assignment-errors` |
| QA / Tester | 本文件 + `error-handling.md#assignment-errors` |
| UI/UX Designer | 本文件（第 8 節 UI/UX 需求） |
| Architect | 本文件 + `architecture-spec.md` §3.10 |

---

## 1. 功能摘要

提供業務部長編輯既有 `status = 'active'` 名單定義之 `condition_payload`（覆寫式，無草稿；限 `stage = 'draft'`）。`list_no` 不可修改；系統管理欄位（`list_type` / `project_workym` / `status` / `stage` / audit 欄位）完全不在表單中呈現。**表單必填 `condition_payload`（至少 1 個 conditions）**，欄位來源 F075 v1.5 白名單 active 集合；類別型 / 數值型 / 日期型分別以對應 UI 元件呈現（詳見 §5 / §8）。月跑執行中禁止編輯；`status = 'inactive'` 或 `stage != 'draft'` 的名單不提供編輯入口。**舊遷移名單（`condition_payload IS NULL`）之篩選條件區塊為唯讀**，僅非篩選欄位（`list_nm` / `list_period_*` / `cr_enabled`）可改（拍板 2 / US-123 AC-2）；不提供「confirm 轉換」流程，E2 backfill 由 Phase 3a system-architect 一次性執行。與 F050 v2.1 共用表單欄位規範。

## 2. 使用者故事

**As a** 業務部長
**I want** 編輯既有名單定義的篩選條件
**So that** 在月跑前調整本月各 Stage 的名單條件，確保分派結果符合業務策略

## 3. 前置條件

- 業務部長已登入並持有有效 JWT Token；`businessRole='director'`（M01 名單 CRUD 寫入限部長，後端套用 `DirectorGuard`，依 F002 §4.6.2）
- 目標 `list_no` 存在且 `status = 'active'` AND `stage = 'draft'`
- **v2.1 補述**：對於 `condition_payload IS NULL` 之舊遷移名單，篩選條件區塊唯讀（AC-11），但非篩選欄位（`list_nm` / `list_period_start` / `list_period_end` / `list_interval` / `cr_enabled`）仍可編輯儲存（US-123 AC-2）
- `assignment_run` 當下無 `status IN ('pending', 'running')` 的紀錄

## 4. 驗收標準

### AC-1：進入編輯表單（v2.1 重寫）

- **Given** 業務部長在 F048 清單頁點擊某個 `status = 'active'` AND `stage = 'draft'` 名單的「編輯」按鈕
- **When** 系統載入編輯頁面
- **Then** 顯示該 `list_no` 的現有欄位值並填入各表單元件
- **And** 若名單 `condition_payload IS NOT NULL`：篩選條件區塊解析 JSONB 為動態 conditions 並依各條件之 `fieldType` 渲染對應 UI 元件（categorical 多選含勾選狀態、numeric min/max、date 區間）
- **And** 若名單 `condition_payload IS NULL`（舊遷移名單）：篩選條件區塊呈現 5 個 backward-compat entity column（`prod_kind` / `caseyear` / `spec_tp` / `case_status` / `settle_src`）值並標示「（舊格式）」前綴；所有條件欄位元件 disabled（read-only）；顯示提示訊息「此名單使用舊格式儲存，篩選條件暫時無法編輯。待系統完成資料轉換後，即可在此介面修改篩選條件」（AC-11 / US-123 AC-2）
- **And** `list_no` 以唯讀方式顯示於頁首
- **And** 系統管理欄位（`list_type` / `project_workym` / `status` / `stage` / audit 欄位）完全不在表單中呈現

### AC-2：覆寫式儲存

- **Given** 業務部長修改欄位後點擊「儲存」
- **When** 前端驗證全部通過
- **Then** 系統以覆寫方式更新 `ob_list_definition` 對應列（無草稿、無版本分岔）
- **And** `updated_by` / `updated_at` / `updated_by_prog` 由後端自動填入
- **And** 儲存成功後顯示成功提示並返回 F048 清單頁
- **And** 寫入 `assignment_audit_log`（`action = 'UPDATE'`, `before_value` + `after_value` JSONB 對照）

### AC-3：LIST_PERIOD_END ≥ LIST_PERIOD_START 驗證

- **Given** 業務部長輸入 `list_period_start` 與 `list_period_end`
- **When** 任一欄位值變更後
- **Then** 若 `list_period_end < list_period_start`，顯示錯誤「結束期數需大於等於開始期數」，儲存按鈕停用

### AC-4：已停用名單不提供編輯入口

- **Given** 業務部長在「已停用」頁籤查看名單
- **When** 頁面顯示已停用名單列表
- **Then** 每列不顯示「編輯」按鈕，僅供唯讀查閱
- **And** 若直接 HTTP 請求編輯已停用名單的 API，後端回傳 422 `ASSIGNMENT_LIST_INACTIVE`（訊息：「已停用名單不可編輯」）

### AC-5：月跑執行中禁止編輯

- **Given** `assignment_run` 有 `status IN ('pending', 'running')` 的紀錄
- **When** 業務部長嘗試點擊任何名單的「編輯」按鈕
- **Then** 編輯按鈕為 disabled，hover 顯示提示「分派執行中，無法修改名單定義」
- **And** 若直接呼叫 API，回傳 409 `ASSIGNMENT_RUN_ALREADY_RUNNING`

### AC-6：必填欄位驗證（v2.1 重寫）

- **Given** 業務部長清空任一必填欄位後點擊「儲存」
- **When** 前端進行表單驗證
- **Then** 對應欄位顯示紅色邊框與錯誤訊息「此欄位為必填」，儲存請求不發送
- **And** 必填欄位範圍縮減為：`list_nm` / `list_period_start` / `list_period_end` / `list_interval` / `condition_payload`（至少 1 個 conditions）
- **And** 5 個原 v2.0 一級欄位（`prod_kind` / `caseyear` / `spec_tp` / `case_status` / `settle_src`）**不再為前端必填欄位**；由後端依 `condition_payload` 衍生填入（J6 / BR-10）
- **And** 若前端被繞過，後端驗證 `condition_payload.conditions` 為空時回 422，訊息「篩選條件不得為空，請至少設定一個欄位」

### AC-7：PROD_KIND + CARD_TYPE 組合變更後的重複檢查

- **Given** 業務部長修改 `condition_payload` 中 `prod_kind` 條件或 `card_type` 使其與當月其他 active 名單組合衝突
- **When** 業務部長點擊「儲存」
- **Then** 系統回傳 422 `LIST_NO_DUPLICATE`，訊息：「相同 PROD_KIND 與 CARD_TYPE 的有效名單已存在（LIST_NO: {衝突 list_no}）」
- **And** 不更新紀錄
- **And** **v2.1 補述**：`prod_kind` 由 `condition_payload` 衍生（BR-10），唯一性檢查的具體比對語意（多值交集 / 子集 / 完全相等）由 Phase 3a system-architect 設計（BR-5 / 拍板 Q5）

### AC-8：columnName 白名單驗證（v2.1 新增 / US-121 AC-2 / 對齊 F050 v2.1 AC-11）

- **Given** 業務部長儲存名單時，`condition_payload.conditions` 中任一條件之 `columnName` 不存在於 F075 v1.5 白名單或對應欄位 `is_active = false`
- **When** 後端驗證 condition_payload
- **Then** 回 422 `CONDITION_COLUMN_NOT_IN_WHITELIST`，response body 含不合法之 `columnName`
- **And** 前端 dropdown 已過濾 `is_active = false` 欄位；本 AC 為 defense-in-depth（拍板 1）

### AC-9：list_period_* 不可入 conditions（v2.1 新增 / US-121 AC-5 / 對齊 F050 v2.1 AC-12）

- **Given** `condition_payload.conditions` 包含 `columnName` 為 `list_period_start` / `list_period_end` / `list_interval` 任一者
- **When** 後端驗證 condition_payload
- **Then** 回 400 `RESERVED_FIELD_IN_CONDITIONS`，訊息明示三個欄位為一級保留欄位
- **And** 前端 dropdown 不列出此三個欄位；本 AC 為 defense-in-depth（J8 / 拍板 3）

### AC-10：INACTIVE 選項警示（非阻擋，v2.1 新增 / US-121 AC-4 / 對齊 F050 v2.1 AC-13）

- **Given** `condition_payload.conditions` 中任一 categorical 條件之 `values` 陣列包含 `pooldata_field_option.is_active = false` 之選項值
- **When** 後端驗證並準備寫入
- **Then** 後端以 200 OK 成功更新，但 response body 附加 `warnings: [{ code: "WHITELIST_OPTION_INACTIVE", affectedFields: ["<columnName>"] }]`
- **And** 前端顯示非阻擋式提示

### AC-11：舊名單篩選條件區塊唯讀（v2.1 新增 / US-123 AC-2 / 拍板 2）

- **Given** 業務部長進入編輯表單，名單 `condition_payload IS NULL`（舊遷移名單）且 `stage = 'draft'`
- **When** 系統載入編輯頁面
- **Then** 篩選條件區塊呈現為唯讀模式：5 個 backward-compat entity column 值以「（舊格式）PROD_KIND=…；SPEC_TP=…；CASE_STATUS=…」格式顯示；所有輸入元件與「新增 / 刪除條件」按鈕停用
- **And** 顯示提示訊息：「此名單使用舊格式儲存，篩選條件暫時無法編輯。待系統完成資料轉換後，即可在此介面修改篩選條件」
- **And** 非篩選欄位（`list_nm` / `list_period_start` / `list_period_end` / `list_interval` / `cr_enabled`）仍可正常編輯儲存（US-123 AC-2 / TC-123-03）
- **And** 業務部長仍可於本頁執行：推進階段（透過 F078）、停用名單（透過 F052，需仍為 draft）
- **And** 若前端被繞過，後端對 condition_payload IS NULL 之名單寫入 condition_payload 時回 422 `LEGACY_LIST_CONDITION_READONLY`（defense-in-depth；拍板 Q3）
- **And** E2 backfill（entity column → condition_payload 轉換）由 Phase 3a system-architect 一次性執行；**不提供** per-user 之 confirm 轉換流程（拍板 2 / E2 / J6）

### AC-12：stage 保護（v2.1 新增 / US-121 AC-3 / K1 / K3）

- **Given** 名單 `stage` 不為 `'draft'`
- **When** 業務部長嘗試對該名單 PUT condition_payload
- **Then** 回 422 `LIST_STAGE_TRANSITION_FORBIDDEN`（沿用既有錯誤碼）
- **And** 月跑執行中（AssignmentRun status='running'）優先於 stage guard，即使 stage='draft' 仍回 409 `ASSIGNMENT_RUN_ALREADY_RUNNING`（AC-5）
- **And** Rollback 操作完成後（M03a/b/c/d）stage 回 'draft'，condition_payload 重新可寫入（K3）

### AC-13：backward-compat 衍生欄位（v2.1 新增 / J6 / BR-7）

- **Given** 業務部長成功送出含 `condition_payload` 之 PUT 請求
- **When** 後端覆寫 `ob_list_definition`
- **Then** 5 個 backward-compat 欄位（`prod_kind` / `caseyear` / `spec_tp` / `case_status` / `settle_src`）由後端依新 `condition_payload` 衍生填入並一併覆寫 entity column（衍生規則由 Phase 3a system-architect 設計；GAP-LIST §C3）
- **And** GET API 回應 body 同時含 `conditionPayload` 與 5 個衍生欄位；條件來源以 `conditionPayload` 為準

## 5. 表單欄位規範

詳見 [F050 v2.1 §5 表單欄位規範](F050-create-list-definition.md#5-表單欄位規範)。F050 v2.1 與 F051 v2.1 共用完全相同的必填 / 選填 / 系統管理欄位定義，含 `condition_payload` JSON schema（[§5.4](F050-create-list-definition.md#54-condition_payload-json-schemav21-新增--a2-解除)）。

**v2.1 載入差異**：
- `condition_payload IS NOT NULL`：解析 JSONB 為動態 conditions，依 `fieldType` 渲染對應 UI 元件
- `condition_payload IS NULL`（舊名單）：載入 5 個 backward-compat entity column 之 `$$` 分隔字串為唯讀「（舊格式）」摘要顯示（AC-11）；不解析為動態 conditions UI 元件

**`case_status` 4 個值業務語意對照表**：詳見 [F050 v2.1 §5.1.1 case_status 4 個值業務語意對照表](F050-create-list-definition.md#511-case_status-4-個值業務語意對照表)（OQ-E07-23 ✅ Resolved 2026-05-12，依 `reference/SP/USP_OB_OBPOOLDATA.sql:189-216` + DB 1,487,695 筆實證）。v2.1 起選項來源從 `ob_code_df` `tbl_id='CASE_STATUS'` 改為 `pooldata_field_option` `column_name='case_status'`（F076 v1.5；US-125 AC-2）；業務語意對照仍有效，作為 case_status 多選元件之 tooltip 來源。

## 6. API 規格

### 6.1 PUT /api/v1/assignment/list-definitions/:listNo（v2.1 重寫）

**Request Body**：與 F050 v2.1 POST 相同（移除 `prodKind` / `caseYear` / `specTp` / `caseStatus` / `settleSrc` 5 個欄位；改為 `conditionPayload`），但不含 `copyFromListNo` 欄位。`conditionPayload` 為必填，schema 見 [F050 v2.1 §5.4](F050-create-list-definition.md#54-condition_payload-json-schemav21-新增--a2-解除)。`crEnabled`（v2.0 新增）可由部長於編輯時切換，覆寫 `ob_list_definition.cr_enabled`，取代原 F059 全域開關。

**舊名單例外**：若 `list_no` 對應之名單 `condition_payload IS NULL`（舊遷移名單），前端編輯頁不送出 `conditionPayload`（區塊唯讀，AC-11）；僅可 PUT 非篩選欄位（`listNm` / `listPeriodStart` / `listPeriodEnd` / `listInterval` / `crEnabled`）。若前端被繞過送出 `conditionPayload`，後端回 422 `LEGACY_LIST_CONDITION_READONLY`（拍板 Q3）。

**Response — 200 OK**

```json
{
  "listNo": "OB202605011",
  "listNm": "測試名單 A",
  "status": "active",
  "stage": "draft",
  "updatedAt": "2026-04-24T12:00:00Z",
  "warnings": []
}
```

若 conditions 含 `is_active=false` 之 categorical option，response 含 `warnings: [{ code: "WHITELIST_OPTION_INACTIVE", affectedFields: ["..."] }]`（AC-10）。

**錯誤回應**

| HTTP | 錯誤碼 | 說明 |
|---|---|---|
| 400 | RESERVED_FIELD_IN_CONDITIONS | `conditions` 含一級保留欄位 `list_period_start` / `list_period_end` / `list_interval`（AC-9 / J8 / 拍板 3） |
| 401 | AUTH_TOKEN_MISSING | 未登入 |
| 403 | E07_REQUIRES_DIRECTOR | `businessRole` 非 `'director'`（`DirectorGuard` 攔截，依 F002 §4.6.2） |
| 404 | ASSIGNMENT_LIST_NOT_FOUND | `list_no` 不存在 |
| 409 | ASSIGNMENT_RUN_ALREADY_RUNNING | 月跑執行中 |
| 422 | ASSIGNMENT_LIST_INACTIVE | 已停用名單不可編輯 |
| 422 | CONDITION_COLUMN_NOT_IN_WHITELIST | `conditions[].columnName` 不在 F075 v1.5 白名單或對應欄位 `is_active=false`（AC-8 / 拍板 1） |
| 422 | LEGACY_LIST_CONDITION_READONLY | 對 `condition_payload IS NULL` 之舊遷移名單寫入 `conditionPayload`（AC-11 / 拍板 Q3） |
| 422 | LIST_NO_DUPLICATE | `prod_kind + card_type` 組合衝突（v2.1：prod_kind 由 condition_payload 衍生，比對語意由 Phase 3a 設計） |
| 422 | LIST_STAGE_TRANSITION_FORBIDDEN | 對非 draft 階段名單寫入 condition_payload（AC-12 / K1） |
| 422 | VALIDATION_ERROR | 欄位驗證失敗（含 condition_payload schema 違反） |
| ~~422~~ | ~~CASE_STATUS_REQUIRED~~ | **v2.1 移除**：case_status 改由 condition_payload 必填與 columnName 白名單驗證統一覆蓋（A1 / A5） |

## 7. 商業規則

| 規則編號 | 說明 |
|---|---|
| BR-1 | 覆寫式編輯：無草稿版本、無發布流程、無 rollback；歷史追溯透過 `assignment_audit_log.before_value` / `after_value` |
| BR-2 | `list_no` 不可修改；系統管理欄位（`list_type` / `project_workym` / `status` / `stage` / audit）不在表單中 |
| BR-3 | `card_type` 為獨立輸入欄位，不由 `list_nm` 解析（A43 決議：遷移沿用舊值） |
| BR-4 | 編輯已停用名單需回傳 `ASSIGNMENT_LIST_INACTIVE`；前端額外於 `status = 'inactive'` 時隱藏編輯按鈕；非 draft 階段名單回 `LIST_STAGE_TRANSITION_FORBIDDEN`（BR-9） |
| BR-5 | `prod_kind + card_type` 重複檢查範圍：當前作業年月內的其他 active 名單（不含本身）。**v2.1 補述**：v2.1 重構後 `prod_kind` 由 `condition_payload` 衍生（BR-7），唯一性檢查的具體比對語意（多值交集 / 子集 / 完全相等）由 **Phase 3a system-architect** 設計，本 spec 暫保留 v2.0 語意作為過渡定義（拍板 Q5） |
| BR-6 | **condition_payload 為 source of truth（v2.1 重寫，A1 / A2 / A3 解除，對齊 F050 v2.1 BR-6）**：必填、`conditions` 至少 1 個；每個 `conditions[].columnName` 必須存在於 F075 v1.5 白名單且 `is_active = true`；違反回 422 `CONDITION_COLUMN_NOT_IN_WHITELIST` |
| BR-7 | **多值 / 區間 SQL 比對語意（v2.1 重寫，A6 / D3，對齊 F050 v2.1 BR-7）**：categorical 條件 `IN (...)`、numeric `BETWEEN min AND max`、date `BETWEEN dateStart AND dateEnd`；多欄位之間 AND；舊 SP 之 `LIKE '%val$$%' OR LIKE '%$$val' OR = 'val'` 三段比對已棄用，僅保留於 `condition_payload IS NULL` 之舊名單 fallback（D4 / US-122 AC-4） |
| BR-8 | 多值欄位（`caseyear` / `spec_tp` / `settle_src` / `case_status` / `prod_kind`）寫入 entity column 時以 `$$` 為分隔符（v2.1：此為後端衍生填入之 backward-compat 格式，前端不直接送出此格式） |
| BR-9 | **stage 保護（v2.1 新增）**：condition_payload 寫入限 `stage = 'draft'`；非 draft 階段名單寫入回 422 `LIST_STAGE_TRANSITION_FORBIDDEN`（沿用既有錯誤碼；K1 / K3） |
| BR-10 | **list_period_* 為一級保留欄位（v2.1 新增，J8 / 拍板 3，對齊 F050 v2.1 BR-8）**：禁止納入 conditions；違反回 400 `RESERVED_FIELD_IN_CONDITIONS` |
| BR-11 | **舊名單篩選條件區塊唯讀（v2.1 新增，US-123 AC-2 / 拍板 2 / 拍板 Q3）**：對 `condition_payload IS NULL` 之名單寫入 conditionPayload 回 422 `LEGACY_LIST_CONDITION_READONLY`；前端編輯頁該區塊以 read-only 呈現，非篩選欄位（list_nm / list_period_* / cr_enabled）仍可改；**不提供** confirm 轉換流程，E2 backfill 由 Phase 3a system-architect 一次性執行 |
| BR-12 | **INACTIVE 選項警示（v2.1 新增，非阻擋，對齊 F050 v2.1 BR-9）**：寫入時若 conditions 含 `is_active=false` 之 categorical option，回 200 OK + `warnings: [{ code: "WHITELIST_OPTION_INACTIVE", affectedFields: [...] }]` |
| BR-13 | **backward-compat 衍生欄位（v2.1 新增，J6 / C3，對齊 F050 v2.1 BR-10）**：5 個 entity column（`prod_kind` / `caseyear` / `spec_tp` / `case_status` / `settle_src`）由後端依新 `condition_payload` 衍生填入；衍生規則由 Phase 3a system-architect 設計 |
| ~~BR-6 v2.0~~ | ~~`case_status` 為獨立業務欄位...允許覆寫修改多選值,但不允許清空為空值；可選代碼由 F068 維護~~ | **v2.1 廢除**：case_status 改由 condition_payload 必填 + columnName 白名單驗證統一覆蓋；可選代碼來源改為 F076 v1.5 `pooldata_field_option`（US-125 AC-2） |
| ~~BR-7 v2.0~~ | ~~`case_status` 多選的篩選邏輯為 **OR**~~ | **v2.1 重寫**：OR / IN 語意適用所有 categorical 條件（BR-7） |

## 8. UI/UX 需求（v2.1 重寫）

- 頁首顯示唯讀的 `list_no`（不可編輯）
- **表單分區與 F050 v2.1 一致**：基本資訊 / 篩選條件（`condition_payload` 動態區塊）/ 期間設定 / CR 設定
- **載入時行為（v2.1 新增）**：
  - `condition_payload IS NOT NULL`：解析 JSONB 為動態 conditions，依各條件之 `fieldType` 渲染對應 UI 元件（categorical 多選 chip 含勾選狀態、numeric min/max、date 區間）
  - `condition_payload IS NULL`（舊名單）：篩選條件區塊以「（舊格式）」灰色 read-only 摘要呈現 5 個 backward-compat entity column 值；所有條件輸入元件 disabled；顯示提示「此名單使用舊格式儲存，篩選條件暫時無法編輯」（AC-11）
- 若 `status = 'inactive'`：前端隱藏編輯按鈕，僅於已停用頁籤顯示「查看詳情」
- 若 `stage != 'draft'`：前端隱藏編輯按鈕（依 F077 BR-9 角色 × 階段操作矩陣）
- 月跑鎖定時：編輯按鈕 disabled + hover 提示
- **多值欄位 backward-compat 儲存規範（v2.1）**：v2.0 之「UI 載入 `$$` 分隔字串解析回多選 + 提交序列化寫回」規範**已廢除**；v2.1 起前端載入 `conditionPayload` JSON 結構並依 `fieldType` 渲染元件；後端衍生填入 entity column 時才轉為 `$$` 分隔（BR-13）。詳見 [data-model.md `ob_list_definition` 多值欄位儲存規範](../data-model.md#ob-list-definition-obmlistdf--名單定義)
- **caseyear 選項來源（v2.1 重寫）**：與 F050 v2.1 同 — caseyear 8 筆（`0` / `1` / `2` / `3` / `4` / `5` / `6` / `99`）由 `GET /api/v1/pooldata-fields/caseyear/options?active=true`（F076 v1.5）動態載入；編輯時將 `condition_payload` 中 caseyear 條件 `values` 解析回多選勾選狀態。**v2.0 之「前端 hard-coded 11 個 0~10」規範已廢除**（A4 / J5）。舊系統 dump 可能含 `7`~`10` 之歷史值（舊名單 `condition_payload IS NULL` fallback 場景）；condition_payload 中之 caseyear values 應僅含 `0~6` / `99` 之 seed 範圍內值，若繞過送出範圍外值，後端 columnName 白名單驗證雖通過但 INACTIVE 選項警示（BR-12）會觸發
- **case_status 選項來源（v2.1 新增）**：與 F050 v2.1 同 — case_status 4 筆由 `GET /api/v1/pooldata-fields/case_status/options?active=true`（F076 v1.5）動態載入；業務語意對照 tooltip 沿用 F050 v2.1 §5.1.1

## 9. 相依性

- **Blocked By**：F048（清單頁入口）、F050 v2.1（需先有名單才能編輯；本 spec §5 引用 F050 v2.1 §5 / §5.1.1 / §5.4）、F075 v1.5（POOLDATA 篩選欄位白名單）、F076 v1.5（類別型欄位可選值；caseyear / case_status 動態選項來源）、US-121（condition_payload 驗證規則）、US-123（舊名單 backward-compat 讀取）
- ~~F068（PROD_KIND / SPEC_TP / CASE_STATUS 代碼維護）~~（**v2.1 廢除**：F068 DEPRECATED v1.3）
- **Blocks**：無

## 10. 交叉參考

- 資料模型：[data-model.md#e07-data-model](../data-model.md#e07-data-model)（`ob_list_definition.condition_payload`）
- 錯誤處理：[error-handling.md#assignment-list-errors](../error-handling.md#assignment-list-errors)（含 v2.1 新增 `CONDITION_COLUMN_NOT_IN_WHITELIST` / `RESERVED_FIELD_IN_CONDITIONS` / `LEGACY_LIST_CONDITION_READONLY`）
- 架構決策：AD-E07-1、**AD-E07-18**（F050 v2.1 whitelist-driven 重構：migration M1~M5 / Service 衍生規則 / Stage 1 動態 SQL / prod_kind 唯一性語意（BR-5）/ F068 廢除步驟；Phase 3a 落地，2026-05-20）；Phase 3a 待設計項目已全數由 AD-E07-18 覆蓋（BR-5 / BR-13 / E2）
- 相關功能：[F048](F048-view-list-definition.md)、[F050 v2.1](F050-create-list-definition.md)、[F052](F052-disable-list-definition.md)、[F075 v1.5](F075-manage-pooldata-field-whitelist.md)、[F076 v1.5](F076-manage-categorical-field-values.md)、~~[F068](F068-edit-base-code.md)~~（**DEPRECATED v1.3**）
- 對應 User Story：[US-121](../../stories/epics/E07-app-customer-list-assignment/US-121-M01-whitelist-condition-payload.md)、[US-122](../../stories/epics/E07-app-customer-list-assignment/US-122-M04-stage1-dynamic-filter.md)、[US-123](../../stories/epics/E07-app-customer-list-assignment/US-123-M01-backward-compat-list-read.md)
