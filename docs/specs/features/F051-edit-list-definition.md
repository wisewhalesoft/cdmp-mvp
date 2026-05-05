---
spec-id: F051
title: 編輯名單定義
feature-id: F051
source-story: US-089
epic: E07
module: M01 名單定義
priority: P0-MVP
version: "1.0"
date: 2026-04-24
status: Draft
---

# F051: 編輯名單定義

Priority: P0-MVP | Status: Draft | Last Updated: 2026-04-24

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + `data-model.md#e07-data-model` + `error-handling.md#assignment-errors` |
| QA / Tester | 本文件 + `error-handling.md#assignment-errors` |
| UI/UX Designer | 本文件（第 8 節 UI/UX 需求） |
| Architect | 本文件 + `architecture-spec.md` §3.10 |

---

## 1. 功能摘要

提供業務主管編輯既有 `status = 'active'` 名單定義的篩選條件（覆寫式，無草稿）。`list_no` 不可修改；系統管理欄位（`list_type` / `project_workym` / `status` / audit 欄位）完全不在表單中呈現。月跑執行中禁止編輯；`status = 'inactive'` 的名單不提供編輯入口。與 F050 共用表單欄位規範。

## 2. 使用者故事

**As a** 業務主管
**I want** 編輯既有名單定義的篩選條件
**So that** 在月跑前調整本月各 Stage 的名單條件，確保分派結果符合業務策略

## 3. 前置條件

- 業務主管已登入並持有有效 JWT Token
- 目標 `list_no` 存在且 `status = 'active'`
- `assignment_run` 當下無 `status IN ('pending', 'running')` 的紀錄

## 4. 驗收標準

### AC-1：進入編輯表單

- **Given** 業務主管在 F048 清單頁點擊某個 `status = 'active'` 名單的「編輯」按鈕
- **When** 系統載入編輯頁面
- **Then** 顯示該 `list_no` 的現有欄位值並填入各表單元件（詳見第 5 節表單欄位規範）
- **And** `list_no` 以唯讀方式顯示於頁首
- **And** 系統管理欄位（`list_type` / `project_workym` / `status` / audit 欄位）完全不在表單中呈現

### AC-2：覆寫式儲存

- **Given** 業務主管修改欄位後點擊「儲存」
- **When** 前端驗證全部通過
- **Then** 系統以覆寫方式更新 `ob_list_definition` 對應列（無草稿、無版本分岔）
- **And** `updated_by` / `updated_at` / `updated_by_prog` 由後端自動填入
- **And** 儲存成功後顯示成功提示並返回 F048 清單頁
- **And** 寫入 `assignment_audit_log`（`action = 'UPDATE'`, `before_value` + `after_value` JSONB 對照）

### AC-3：LIST_PERIOD_END ≥ LIST_PERIOD_START 驗證

- **Given** 業務主管輸入 `list_period_start` 與 `list_period_end`
- **When** 任一欄位值變更後
- **Then** 若 `list_period_end < list_period_start`，顯示錯誤「結束期數需大於等於開始期數」，儲存按鈕停用

### AC-4：已停用名單不提供編輯入口

- **Given** 業務主管在「已停用」頁籤查看名單
- **When** 頁面顯示已停用名單列表
- **Then** 每列不顯示「編輯」按鈕，僅供唯讀查閱
- **And** 若直接 HTTP 請求編輯已停用名單的 API，後端回傳 422 `ASSIGNMENT_LIST_INACTIVE`（訊息：「已停用名單不可編輯」）

### AC-5：月跑執行中禁止編輯

- **Given** `assignment_run` 有 `status IN ('pending', 'running')` 的紀錄
- **When** 業務主管嘗試點擊任何名單的「編輯」按鈕
- **Then** 編輯按鈕為 disabled，hover 顯示提示「分派執行中，無法修改名單定義」
- **And** 若直接呼叫 API，回傳 409 `ASSIGNMENT_RUN_ALREADY_RUNNING`

### AC-6：必填欄位驗證

- **Given** 業務主管清空任一必填欄位後點擊「儲存」
- **When** 前端進行表單驗證
- **Then** 對應欄位顯示紅色邊框與錯誤訊息「此欄位為必填」，儲存請求不發送

### AC-7：PROD_KIND + CARD_TYPE 組合變更後的重複檢查

- **Given** 業務主管修改 `prod_kind` 或 `card_type` 使其與當月其他 active 名單組合衝突
- **When** 業務主管點擊「儲存」
- **Then** 系統回傳 422 `LIST_NO_DUPLICATE`，訊息：「相同 PROD_KIND 與 CARD_TYPE 的有效名單已存在（LIST_NO: {衝突 list_no}）」
- **And** 不更新紀錄

## 5. 表單欄位規範

詳見 [F050 §5 表單欄位規範](F050-create-list-definition.md#5-表單欄位規範)。F050 與 F051 共用完全相同的必填 / 選填 / 系統管理欄位定義。

## 6. API 規格

### 6.1 PUT /api/v1/assignment/list-definitions/:listNo

**Request Body**：與 F050 POST 相同，但不含 `copyFromListNo` 欄位。

**Response — 200 OK**

```json
{
  "listNo": "OB202605011",
  "listNm": "測試名單 A",
  "status": "active",
  "updatedAt": "2026-04-24T12:00:00Z"
}
```

**錯誤回應**

| HTTP | 錯誤碼 | 說明 |
|---|---|---|
| 401 | AUTH_TOKEN_MISSING | 未登入 |
| 403 | AUTH_FORBIDDEN | `is_sales_manager` 未啟用 |
| 404 | ASSIGNMENT_LIST_NOT_FOUND | `list_no` 不存在 |
| 409 | ASSIGNMENT_RUN_ALREADY_RUNNING | 月跑執行中 |
| 422 | ASSIGNMENT_LIST_INACTIVE | 已停用名單不可編輯 |
| 422 | LIST_NO_DUPLICATE | `prod_kind + card_type` 組合衝突 |
| 422 | VALIDATION_ERROR | 欄位驗證失敗 |

## 7. 商業規則

| 規則編號 | 說明 |
|---|---|
| BR-1 | 覆寫式編輯：無草稿版本、無發布流程、無 rollback；歷史追溯透過 `assignment_audit_log.before_value` / `after_value` |
| BR-2 | `list_no` 不可修改；系統管理欄位（`list_type` / `project_workym` / `status` / audit）不在表單中 |
| BR-3 | `card_type` 為獨立輸入欄位，不由 `list_nm` 解析（A43 決議：遷移沿用舊值） |
| BR-4 | 編輯已停用名單需回傳 `ASSIGNMENT_LIST_INACTIVE`；前端額外於 `status = 'inactive'` 時隱藏編輯按鈕 |
| BR-5 | `prod_kind + card_type` 重複檢查範圍：當前作業年月內的其他 active 名單（不含本身） |

## 8. UI/UX 需求

- 頁首顯示唯讀的 `list_no`（不可編輯）
- 表單分區與 F050 一致
- 若 `status = 'inactive'`：前端隱藏編輯按鈕，僅於已停用頁籤顯示「查看詳情」
- 月跑鎖定時：編輯按鈕 disabled + hover 提示
- **多值欄位儲存規範**：`PROD_KIND` / `SPEC_TP` / `SETTLE_SRC` / `CASEYEAR` 為多選欄位，UI 載入時將 `ob_list_definition` 中的 `$$` 分隔字串解析回多選狀態，提交時再以 `$$` 分隔字串序列化寫回。詳見 [data-model.md `ob_list_definition` 多值欄位儲存規範](../data-model.md#ob-list-definition-obmlistdf--名單定義)

## 9. 相依性

- **Blocked By**：F048（清單頁入口）、F050（需先有名單才能編輯）、F068（代碼維護）
- **Blocks**：無

## 10. 交叉參考

- 資料模型：[data-model.md#e07-data-model](../data-model.md#e07-data-model)
- 錯誤處理：[error-handling.md#assignment-errors](../error-handling.md#assignment-errors)
- 架構決策：AD-E07-1
- 相關功能：[F048](F048-view-list-definition.md)、[F050](F050-create-list-definition.md)、[F052](F052-disable-list-definition.md)、[F068](F068-edit-base-code.md)
