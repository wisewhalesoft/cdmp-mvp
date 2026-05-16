---
spec-id: F050
title: 新增名單定義
feature-id: F050
source-story: US-088
epic: E07
module: M01 名單定義
priority: P0-MVP
version: "2.0"
date: 2026-05-16
status: Draft
---

# F050: 新增名單定義

Priority: P0-MVP | Status: Draft | Last Updated: 2026-05-16

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

提供業務部長新增名單定義功能，支援空白表單與「從既有名單複製」兩種建立模式。系統依格式 `OB{YYYYMM}{NNN}` 自動產生 `list_no`，同月流水號上限 999 筆；`prod_kind + card_type` 組合在當月 active 名單中必須唯一。表單必填多選欄位 `case_status`（案件結清期別）。月跑執行中禁止新增。本 Feature 與 F051 共用表單欄位規範。

## 2. 使用者故事

**As a** 業務部長
**I want** 新增或從既有名單複製建立一筆新的名單定義
**So that** 彈性設定本月各 Stage 的客戶篩選條件，不需仰賴 IT 手動操作資料庫

## 3. 前置條件

- 業務部長已登入並持有有效 JWT Token；`businessRole='director'`（M01 名單 CRUD 寫入限部長，後端套用 `DirectorGuard`，依 F002 §4.6.2）
- `ob_code_df` 中 `PROD_KIND` / `SPEC_TP` / `CASE_STATUS` 代碼已維護（由 F068 處理）；**`CASEYEAR` 不從 `ob_code_df` 載入**，由前端固定 11 個 CheckBox（value 0~10）渲染，無前置代碼維護需求（OQ-E07-24 ✅ Resolved 2026-05-12）
- `assignment_run` 當下無 `status IN ('pending', 'running')` 的紀錄

## 4. 驗收標準

### AC-1：從空白表單新增

- **Given** 業務部長在 F048 名單定義清單頁點擊「新增名單定義」
- **When** 系統開啟新增表單
- **Then** 顯示空白表單含全部可編輯欄位（詳見第 5 節表單欄位規範，與 F051 一致）
- **And** `list_no` 欄位不顯示（儲存後系統自動產生）

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
- **When** 系統開啟複製來源選擇器（下拉或搜尋彈窗，顯示所有 `status = 'active'` 的既有名單）
- **Then** 業務部長選擇某一來源名單後，表單各欄位自動填入來源名單的對應值
- **And** `list_no` 仍為空（儲存後重新產生），`list_nm` 可自由修改

### AC-6：月跑執行中禁止新增

- **Given** `assignment_run` 有 `status IN ('pending', 'running')` 的紀錄
- **When** 業務部長嘗試點擊「新增名單定義」按鈕
- **Then** 按鈕為 disabled，hover 顯示提示「分派執行中，無法新增名單定義」

### AC-7：必填欄位驗證

- **Given** 業務部長未填寫任一必填欄位即點擊「儲存」
- **When** 前端進行表單驗證
- **Then** 對應欄位顯示紅色邊框與錯誤訊息「此欄位為必填」，儲存請求不發送
- **And** 必填欄位範圍包含：`list_nm` / `prod_kind` / `caseyear` / `spec_tp` / `case_status` / `list_period_start` / `list_period_end` / `list_interval` / `settle_src`

### AC-7b：case_status 必填多選驗證

- **Given** 業務部長在新增表單操作案件結清期別欄位
- **When** 業務部長未勾選任何 `case_status` 選項即點擊「儲存」
- **Then** 前端阻擋送出並顯示錯誤「案件結清期別為必填，請至少選取一項」
- **And** 若前端被繞過，後端回傳 422 `CASE_STATUS_REQUIRED`，訊息：「案件結清期別為必填，請至少選取一項」
- **And** `case_status` 可選選項由 `ob_code_df`（`tbl_id = 'CASE_STATUS'`）動態載入，業務部長可勾選一個或多個選項，多選值以 `$$` 分隔儲存（例如 `01$$02$$03`），與 `caseyear` / `spec_tp` 同模式

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

## 5. 表單欄位規範

### 5.1 必填欄位

| 欄位 | Schema 欄位名 | UI 元件 | 說明 |
|---|---|---|---|
| 名單名稱 | `list_nm` | 文字框，max 45 | — |
| 產品類別 | `prod_kind` | 單選下拉，來源 `ob_code_df`（`tbl_id = 'PROD_KIND'`） | — |
| 進件/滿期/中結年數 | `caseyear` | 多選 CHKBOX + 全選，**前端固定 11 個選項**（value `0`/`1`/`2`/`3`/`4`/`5`/`6`/`7`/`8`/`9`/`10`，每個 value 直接代表合約年數整數），多值以 `$$` 分隔 | 對應 `ob_pool_data.year_cnt`（整數）比對；**不從 `ob_code_df` 載入**（OQ-E07-24 ✅ Resolved 2026-05-12，證據 `reference/Areas/OBZ/Views/OBZ020/edit.cshtml:174-235`） |
| 專案類別 | `spec_tp` | 多選 CHKBOX，來源 `ob_code_df`，多值以 `$$` 分隔 | — |
| 案件結清期別 | `case_status` | 多選 CHKBOX，來源 `ob_code_df`（`tbl_id = 'CASE_STATUS'`），多值以 `$$` 分隔 | 至少選 1 項；選項由代碼維護（F068）管理，初始 4 項：`01` 期中（不含當月滿期）/`02` 中結/`03` 滿期（含當月滿期）/`04` 滿期。**4 個值的業務語意對照詳見下方 §5.1.1** |
| 開始撈取期數 | `list_period_start` | 數字框，max 3 | 月份 |
| 結束撈取期數 | `list_period_end` | 數字框，max 3 | 需 ≥ `list_period_start` |
| 間隔期數 | `list_interval` | 數字框，max 3 | 月份 |
| 被他行代償案件 | `settle_src` | 多選 CHKBOX：「含」(Y) / 「不含」(N)，多值以 `$$` 分隔 | — |

### 5.1.1 case_status 4 個值業務語意對照表

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
| 卡別 | `card_type` | 文字框，max 2 | 獨立輸入，不由 `list_nm` 解析（A43 決議） |
| 最佳產品 | `prod_best` | 文字框，max 5 | — |
| 啟用 CR 回分 | `cr_enabled` | Toggle / Checkbox，預設 false | **v2.0 新增**：per-list flag，取代原 F059 全域開關（F059 已 DEPRECATED）。`BOOLEAN NOT NULL DEFAULT false`；月跑 Stage 3 依此 flag 決定是否將該名單套用 CR（Customer Recycling）回分規則。詳見 [data-model.md `ob_list_definition.cr_enabled`](../data-model.md#ob-list-definition-obmlistdf--名單定義) |

### 5.3 系統管理欄位（表單不顯示）

- `list_no`（系統自動產生）
- `list_type = '01'`（後端固定）— **僅系統內部分類用，表示「分派名單」類型，業務部長不設定此欄位；與案件結清期別 `case_status` 為兩個不同欄位**：`list_type` 為系統分類常數、`case_status` 為業務部長於表單必填多選的篩選條件，原系統 `LIST_TYPE` 欄位的業務語意已由 `case_status` 取代
- `project_workym = :currentYm`（後端自動填入）
- `status = 'active'`（新增時固定）
- `created_by`, `created_at`, `updated_by`, `updated_at`（後端自動填入）

## 6. API 規格

### 6.1 POST /api/v1/assignment/list-definitions

**Request Body**

```json
{
  "listNm": "車貸月跑名單",
  "prodKind": "01",
  "caseYear": "1$$2",
  "specTp": "S1",
  "caseStatus": "01$$02",
  "listPeriodStart": 1,
  "listPeriodEnd": 6,
  "listInterval": 1,
  "settleSrc": "Y",
  "cardType": "01",
  "prodBest": null,
  "crEnabled": false,
  "copyFromListNo": null
}
```

`crEnabled` 為選填 boolean（預設 false），v2.0 新增 per-list flag，取代 F059 全域開關。

`caseStatus` 為必填多選欄位，至少需傳入一個有效代碼值，多值以 `$$` 分隔（如 `01$$02$$03`）；可選代碼來源 `ob_code_df` `tbl_id = 'CASE_STATUS'`。

`copyFromListNo` 為選填，若提供則表示「從既有名單複製」；後端可用於稽核記錄來源。

**Response — 201 Created**

```json
{
  "listNo": "OB202605001",
  "listNm": "車貸月跑名單",
  "status": "active",
  "projectWorkym": "202605"
}
```

**錯誤回應**

| HTTP | 錯誤碼 | 說明 |
|---|---|---|
| 401 | AUTH_TOKEN_MISSING | 未登入 |
| 403 | E07_REQUIRES_DIRECTOR | `businessRole` 非 `'director'`（`DirectorGuard` 攔截，依 F002 §4.6.2） |
| 409 | ASSIGNMENT_RUN_ALREADY_RUNNING | 月跑執行中 |
| 422 | LIST_NO_LIMIT_EXCEEDED | 本月已達 999 筆 |
| 422 | LIST_NO_DUPLICATE | `prod_kind + card_type` 組合已存在 active 名單 |
| 422 | CASE_STATUS_REQUIRED | `case_status` 為空或未提供（前端阻擋後的後端保護） |
| 422 | VALIDATION_ERROR | 欄位驗證失敗（詳見 details） |

## 7. 商業規則

| 規則編號 | 說明 |
|---|---|
| BR-1 | `list_no` 產生邏輯：後端查詢當月最大既有流水號 + 1；若無既有則從 001 開始；達 999 回傳 `LIST_NO_LIMIT_EXCEEDED` |
| BR-2 | `prod_kind + card_type` 組合僅在 `status = 'active'` 範圍內檢查唯一性；停用紀錄不納入 |
| BR-3 | 多值欄位（`caseyear` / `spec_tp` / `settle_src` / `case_status`）以 `$$` 為分隔符儲存（如 `0$$1$$2$$3`、`01$$02$$03`） |
| BR-4 | 月跑執行鎖由 `assignment_run.status IN ('pending', 'running')` 判斷 |
| BR-5 | 所有寫入操作必須同步寫入 `assignment_audit_log`；稽核寫入失敗僅記錄 Logger.error，不 rollback 業務操作 |
| BR-6 | `case_status` 為獨立業務欄位（非 `list_type`），用於限定此名單篩選時的案件結清期別範圍；必填，至少選 1 項；可選代碼由 F068 維護 |
| BR-7 | `case_status` 多選的篩選邏輯為 **OR**（符合任一勾選期別的案件即納入篩選範圍）。✅ **Resolved（2026-05-12）**：SP 直接證據確認（`SP_INFOT_ASSIGNEXPORTNAMELIST_st1_list.sql` 行 54，`fn_SplitString_cte` + `IN` 語義即 OR，無需業務確認）。中央追蹤：[OQ-E07-21](../open-questions.md) |

## 8. UI/UX 需求

- 表單分區：基本資訊（`list_nm` / `prod_kind` / `card_type` / `prod_best`）、名單條件（`caseyear` / `spec_tp` / `case_status` / `settle_src`）、期間設定（`list_period_start` / `list_period_end` / `list_interval`）
- 「複製名單」按鈕位於表單標頭，開啟 Modal 選擇來源；複製來源的 `case_status` 值需一併複製到新表單
- 即時驗證：欄位失去焦點時觸發
- 儲存按鈕：全部必填（含 `case_status` 至少選 1 項）+ `list_period_end >= list_period_start` 通過才啟用
- **多值欄位儲存規範**：`PROD_KIND` / `SPEC_TP` / `SETTLE_SRC` / `CASEYEAR` / `CASE_STATUS` 為多選欄位（CHKBOX 或多選下拉），UI 提交時將選中項以 `$$` 分隔字串序列化（如 `02$$04$$05`、`01$$02$$03`）儲存至 `ob_list_definition`；單選時不加分隔符（如 `Y`）。詳見 [data-model.md `ob_list_definition` 多值欄位儲存規範](../data-model.md#ob-list-definition-obmlistdf--名單定義)
- **CASEYEAR 選項來源**：本欄位 11 個 CheckBox（value `0`~`10`）由前端 hard-coded 渲染，不調用 `GET /api/v1/assignment/codes?tblId=CASEYEAR`（該 endpoint 對 CASEYEAR 直接回 `CODE_TYPE_INVALID`）。舊系統前端保留 `99 = 10年以上` 第 12 個選項但被 Razor 註解掉未啟用（`reference/Areas/OBZ/Views/OBZ020/edit.cshtml:174-235`），新系統暫不納入；若未來業務需要再行擴充。多選含「全選」勾選框。

## 9. 相依性

- **Blocked By**：F048（清單頁入口）、F068（`PROD_KIND` / `SPEC_TP` / `CASE_STATUS` 代碼維護；CASEYEAR 為前端 hard-coded 不阻擋）
- **Blocks**：F061（月跑需有 active 名單定義）、F060（per-LIST_NO 部門比例）

## 10. 交叉參考

- 資料模型：[data-model.md#e07-data-model](../data-model.md#e07-data-model)（`ob_list_definition`、`ob_code_df`）
- 錯誤處理：[error-handling.md#assignment-errors](../error-handling.md#assignment-errors)
- 架構決策：AD-E07-1、AD-E07-2
- 相關功能：[F048](F048-view-list-definition.md)、[F051](F051-edit-list-definition.md)、[F068](F068-edit-base-code.md)
