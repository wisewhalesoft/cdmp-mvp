---
spec-id: F050
title: 新增名單定義
feature-id: F050
source-story: US-088
epic: E07
module: M01 名單定義
priority: P0-MVP
version: "1.0"
date: 2026-04-24
status: Draft
---

# F050: 新增名單定義

Priority: P0-MVP | Status: Draft | Last Updated: 2026-04-24

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + `data-model.md#e07-data-model` + `error-handling.md#assignment-errors` + F051 表單欄位規範 |
| QA / Tester | 本文件 + `error-handling.md#assignment-errors` |
| UI/UX Designer | 本文件（第 8 節 UI/UX 需求） |
| Architect | 本文件 + `architecture-spec.md` §3.10（LIST_NO 自動產生規則） |

---

## 1. 功能摘要

提供業務主管新增名單定義功能，支援空白表單與「從既有名單複製」兩種建立模式。系統依格式 `OB{YYYYMM}{NNN}` 自動產生 `list_no`，同月流水號上限 999 筆；`prod_kind + card_type` 組合在當月 active 名單中必須唯一。月跑執行中禁止新增。本 Feature 與 F051 共用表單欄位規範。

## 2. 使用者故事

**As a** 業務主管
**I want** 新增或從既有名單複製建立一筆新的名單定義
**So that** 彈性設定本月各 Stage 的客戶篩選條件，不需仰賴 IT 手動操作資料庫

## 3. 前置條件

- 業務主管已登入並持有有效 JWT Token
- `ob_code_df` 中 `PROD_KIND` / `SPEC_TP` / `CASEYEAR` 代碼已維護（由 F068 處理）
- `assignment_run` 當下無 `status IN ('pending', 'running')` 的紀錄

## 4. 驗收標準

### AC-1：從空白表單新增

- **Given** 業務主管在 F048 名單定義清單頁點擊「新增名單定義」
- **When** 系統開啟新增表單
- **Then** 顯示空白表單含全部可編輯欄位（詳見第 5 節表單欄位規範，與 F051 一致）
- **And** `list_no` 欄位不顯示（儲存後系統自動產生）

### AC-2：LIST_NO 自動產生規則

- **Given** 業務主管填妥表單並點擊「儲存」
- **When** 後端處理新增請求
- **Then** 系統依格式 `OB{YYYYMM}{NNN}` 自動產生 `list_no`，共 11 碼（OB 固定 + YYYYMM 當月 + NNN 該月流水號 001~999）
- **And** 新產生的 `list_no` 不與任何現有 `list_no` 重複
- **And** `list_type` 後端自動填入固定值 `'01'`，`status` 初始為 `'active'`，`project_workym` 填入當前作業年月

### AC-3：同月 999 筆上限硬阻擋

- **Given** 本月 `ob_list_definition` 已有 999 筆紀錄（含 active + inactive）
- **When** 業務主管嘗試新增第 1000 筆
- **Then** 系統回傳 422 `LIST_NO_LIMIT_EXCEEDED`，訊息：「本月（YYYYMM）名單定義已達 999 筆上限，無法新增」
- **And** 不產生新紀錄

### AC-4：PROD_KIND + CARD_TYPE 組合重複檢查

- **Given** 業務主管填入的 `prod_kind + card_type` 組合，在當前作業年月下已存在 `status = 'active'` 的名單
- **When** 業務主管點擊「儲存」
- **Then** 系統硬阻擋，回傳 422 `LIST_NO_DUPLICATE`，訊息：「相同產品類別（PROD_KIND）與卡別（CARD_TYPE）的有效名單已存在（LIST_NO: {衝突 list_no}），請停用既有名單或修改條件」
- **And** 不產生新紀錄

### AC-5：複製名單功能

- **Given** 業務主管在新增表單點擊「複製名單」按鈕
- **When** 系統開啟複製來源選擇器（下拉或搜尋彈窗，顯示所有 `status = 'active'` 的既有名單）
- **Then** 業務主管選擇某一來源名單後，表單各欄位自動填入來源名單的對應值
- **And** `list_no` 仍為空（儲存後重新產生），`list_nm` 可自由修改

### AC-6：月跑執行中禁止新增

- **Given** `assignment_run` 有 `status IN ('pending', 'running')` 的紀錄
- **When** 業務主管嘗試點擊「新增名單定義」按鈕
- **Then** 按鈕為 disabled，hover 顯示提示「分派執行中，無法新增名單定義」

### AC-7：必填欄位驗證

- **Given** 業務主管未填寫任一必填欄位即點擊「儲存」
- **When** 前端進行表單驗證
- **Then** 對應欄位顯示紅色邊框與錯誤訊息「此欄位為必填」，儲存請求不發送

### AC-8：LIST_PERIOD_END ≥ LIST_PERIOD_START 驗證

- **Given** 業務主管輸入 `list_period_start` 與 `list_period_end`
- **When** 任一欄位值變更後
- **Then** 若 `list_period_end < list_period_start`，顯示錯誤「結束期數需大於等於開始期數」，儲存按鈕停用

### AC-9：儲存成功後的操作

- **Given** 新增表單所有驗證通過
- **When** 業務主管點擊「儲存」並後端成功寫入
- **Then** 頁面顯示成功提示含新產生的 `list_no`
- **And** 返回 F048 名單定義清單頁，新建名單出現在「使用中」頁籤清單中
- **And** 寫入 `assignment_audit_log`（`action = 'CREATE'`, `entity_type = 'ob_list_definition'`, `entity_id = list_no`）

## 5. 表單欄位規範

### 5.1 必填欄位

| 欄位 | Schema 欄位名 | UI 元件 | 說明 |
|---|---|---|---|
| 名單名稱 | `list_nm` | 文字框，max 45 | — |
| 產品類別 | `prod_kind` | 單選下拉，來源 `ob_code_df`（`tbl_id = 'PROD_KIND'`） | — |
| 進件/滿期/中結年數 | `caseyear` | 多選 CHKBOX + 全選，來源 `ob_code_df`，多值以 `$$` 分隔 | — |
| 專案類別 | `spec_tp` | 多選 CHKBOX，來源 `ob_code_df`，多值以 `$$` 分隔 | — |
| 開始撈取期數 | `list_period_start` | 數字框，max 3 | 月份 |
| 結束撈取期數 | `list_period_end` | 數字框，max 3 | 需 ≥ `list_period_start` |
| 間隔期數 | `list_interval` | 數字框，max 3 | 月份 |
| 被他行代償案件 | `settle_src` | 多選 CHKBOX：「含」(Y) / 「不含」(N)，多值以 `$$` 分隔 | — |

### 5.2 選填欄位

| 欄位 | Schema 欄位名 | UI 元件 | 說明 |
|---|---|---|---|
| 卡別 | `card_type` | 文字框，max 2 | 獨立輸入，不由 `list_nm` 解析（A43 決議） |
| 最佳產品 | `prod_best` | 文字框，max 5 | — |

### 5.3 系統管理欄位（表單不顯示）

- `list_no`（系統自動產生）
- `list_type = '01'`（後端固定）
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
  "listPeriodStart": 1,
  "listPeriodEnd": 6,
  "listInterval": 1,
  "settleSrc": "Y",
  "cardType": "01",
  "prodBest": null,
  "copyFromListNo": null
}
```

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
| 403 | AUTH_FORBIDDEN | `is_sales_manager` 未啟用 |
| 409 | ASSIGNMENT_RUN_ALREADY_RUNNING | 月跑執行中 |
| 422 | LIST_NO_LIMIT_EXCEEDED | 本月已達 999 筆 |
| 422 | LIST_NO_DUPLICATE | `prod_kind + card_type` 組合已存在 active 名單 |
| 422 | VALIDATION_ERROR | 欄位驗證失敗（詳見 details） |

## 7. 商業規則

| 規則編號 | 說明 |
|---|---|
| BR-1 | `list_no` 產生邏輯：後端查詢當月最大既有流水號 + 1；若無既有則從 001 開始；達 999 回傳 `LIST_NO_LIMIT_EXCEEDED` |
| BR-2 | `prod_kind + card_type` 組合僅在 `status = 'active'` 範圍內檢查唯一性；停用紀錄不納入 |
| BR-3 | 多值欄位（`caseyear` / `spec_tp` / `settle_src`）以 `$$` 為分隔符儲存（如 `0$$1$$2$$3`） |
| BR-4 | 月跑執行鎖由 `assignment_run.status IN ('pending', 'running')` 判斷 |
| BR-5 | 所有寫入操作必須同步寫入 `assignment_audit_log`；稽核寫入失敗僅記錄 Logger.error，不 rollback 業務操作 |

## 8. UI/UX 需求

- 表單分區：基本資訊（`list_nm` / `prod_kind` / `card_type` / `prod_best`）、名單條件（`caseyear` / `spec_tp` / `settle_src`）、期間設定（`list_period_start` / `list_period_end` / `list_interval`）
- 「複製名單」按鈕位於表單標頭，開啟 Modal 選擇來源
- 即時驗證：欄位失去焦點時觸發
- 儲存按鈕：全部必填 + `list_period_end >= list_period_start` 通過才啟用
- **多值欄位儲存規範**：`PROD_KIND` / `SPEC_TP` / `SETTLE_SRC` / `CASEYEAR` 為多選欄位（CHKBOX 或多選下拉），UI 提交時將選中項以 `$$` 分隔字串序列化（如 `02$$04$$05`）儲存至 `ob_list_definition`；單選時不加分隔符（如 `Y`）。詳見 [data-model.md `ob_list_definition` 多值欄位儲存規範](../data-model.md#ob-list-definition-obmlistdf--名單定義)

## 9. 相依性

- **Blocked By**：F048（清單頁入口）、F068（`PROD_KIND` / `SPEC_TP` / `CASEYEAR` 代碼維護）
- **Blocks**：F061（月跑需有 active 名單定義）、F060（per-LIST_NO 部門比例）

## 10. 交叉參考

- 資料模型：[data-model.md#e07-data-model](../data-model.md#e07-data-model)（`ob_list_definition`、`ob_code_df`）
- 錯誤處理：[error-handling.md#assignment-errors](../error-handling.md#assignment-errors)
- 架構決策：AD-E07-1、AD-E07-2
- 相關功能：[F048](F048-view-list-definition.md)、[F051](F051-edit-list-definition.md)、[F068](F068-edit-base-code.md)
