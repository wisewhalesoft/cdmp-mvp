---
spec-id: F071
title: 編輯 CARD_TYPE 計分卡類型
feature-id: F071
source-story: US-095
epic: E07
module: M02 計分設定
priority: P0-MVP
version: "1.0"
date: 2026-05-14
status: Draft
---

# F071: 編輯 CARD_TYPE 計分卡類型

Priority: P0-MVP | Status: Draft | Last Updated: 2026-05-14

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + `data-model.md#ob-card-type-entity` + `error-handling.md#assignment-scoring-errors` |
| QA / Tester | 本文件 + `error-handling.md#assignment-scoring-errors` |
| UI/UX Designer | 本文件（第 7 節 UI/UX 需求） |
| Architect | 本文件 + `architecture-spec.md` §3.10 |

---

## 1. 功能摘要

提供業務主管修改既有 CARD_TYPE 紀錄的 `cardName` 與 `prodKind`。`cardType`（代碼）為系統 join key，所有下游表（`ob_levelcard_version` / `ob_levelcard_column` / `ob_levelcard_score` / `ob_levelcard_level` / `ob_tier`）均依此 join，**不允許修改**。月跑執行中禁止編輯。

## 2. 使用者故事

**As a** 業務主管
**I want** 修改計分卡類型的名稱或產品類別綁定
**So that** 當業務定義調整（如卡種更名或產品重分類）時，計分設定能即時反映，無需 IT 介入

## 3. 前置條件

- 業務主管已登入並持有有效 JWT Token
- `is_sales_manager = TRUE`
- 待編輯之 `cardType` 存在於 `ob_card_type` 且 `status = 'active'`
- `assignment_run` 當下無 `status IN ('pending', 'running')` 紀錄

## 4. 驗收標準

### AC-1：開啟編輯 Modal 並預填現值

- **Given** 業務主管在 Tab 1 查看 CARD_TYPE 清單
- **When** 業務主管點擊某列的「編輯」按鈕
- **Then** 開啟編輯 Modal，預填現有 `cardName` 與 `prodKind` 值
- **And** `cardType` 欄位以唯讀方式顯示（disabled），附說明文字：「計分卡代碼為系統 join 鍵，建立後不可修改」

### AC-2：cardType 代碼欄位不可修改

- **Given** 業務主管已開啟編輯 Modal
- **When** 業務主管嘗試在 `cardType` 欄位輸入
- **Then** 欄位 disabled 不接受輸入；若 client 跳過前端阻擋送出含修改之 `cardType` request，後端忽略 `cardType` 欄位（僅 URL path param 為準）

### AC-3：修改 cardName 或 prodKind 並儲存

- **Given** 業務主管修改了 `cardName` 或 `prodKind`
- **When** 業務主管點擊「儲存」
- **Then** `ob_card_type` 對應列 UPDATE（僅 `card_name` / `prod_kind` 欄位）
- **And** 寫入 `assignment_audit_log`（`action = 'UPDATE'`、`entity_type = 'ob_card_type'`、`entity_id = cardType`、`before_value` 含舊值、`after_value` 含新值）
- **And** Modal 關閉，Tab 1 清單刷新顯示更新後資料

### AC-4：cardName 必填驗證

- **Given** 業務主管清空 `cardName` 或 `prodKind`
- **When** 業務主管點擊「儲存」
- **Then** 前端阻擋送出；若繞過前端，後端回 422 `VALIDATION_ERROR`

### AC-5：cardType 不存在

- **Given** URL path 之 `:cardType` 在 `ob_card_type` 中無 active 紀錄
- **When** 後端查找
- **Then** 回 404 `CARD_TYPE_NOT_FOUND`

### AC-6：PROD_KIND 必須屬於啟用期間內紀錄

- **Given** 送出之 `prodKind` 不存在於 `ob_code_df WHERE tbl_id = 'PROD_KIND'` 之啟用期間內紀錄
- **When** 後端驗證
- **Then** 回 422 `VALIDATION_ERROR`

### AC-7：月跑執行中禁止編輯

- **Given** `assignment_run` 有 `status IN ('pending', 'running')` 紀錄
- **When** 業務主管嘗試送出 PUT 請求
- **Then** API 回 409 `ASSIGNMENT_RUN_ALREADY_RUNNING`
- **And** UI 端編輯按鈕 disabled

## 5. API 規格

### 5.1 PUT /api/v1/assignment/scoring/card-types/:cardType

**Controller 規範**：使用 `SalesManagerGuard` + `@RequireSalesManager()`。

**Path Parameters**

| 參數 | 型別 | 必填 | 說明 |
|---|---|---|---|
| cardType | string | 是 | 待編輯之 CARD_TYPE 代碼 |

**Request Body**

```json
{
  "cardName": "汽車高資產期中名單",
  "prodKind": "01"
}
```

| 欄位 | 型別 | 必填 | 說明 |
|------|------|------|------|
| cardName | string，maxLength 20 | 是 | 對應 `ob_card_type.card_name` |
| prodKind | string | 是 | 對應 `ob_card_type.prod_kind`；須存在於 `ob_code_df WHERE tbl_id = 'PROD_KIND'` 啟用期間內 |

> Request body 不接受 `cardType` 欄位；若傳入則後端忽略，以 URL path param 為準（AC-2）。

**Response — 200 OK**

```json
{
  "cardType": "H",
  "cardName": "汽車高資產期中名單",
  "prodKind": "01",
  "prodKindName": "汽車",
  "status": "active",
  "updatedAt": "2026-05-14T08:30:00.000Z"
}
```

**錯誤回應**

| HTTP | 錯誤碼 | 說明 |
|---|---|---|
| 401 | AUTH_TOKEN_MISSING | 未登入 |
| 403 | AUTH_FORBIDDEN | `is_sales_manager` 未啟用 |
| 404 | CARD_TYPE_NOT_FOUND | 指定的 cardType 不存在於 active 紀錄 |
| 409 | ASSIGNMENT_RUN_ALREADY_RUNNING | 月跑執行中禁止編輯 |
| 422 | VALIDATION_ERROR | 必填欄位缺失 / `prodKind` 不在啟用期間內 |

## 6. 商業規則

| 規則編號 | 說明 |
|---|---|
| BR-1 | `card_type` 為系統 join key，不可修改；下游 5 張表（`ob_levelcard_version` / `ob_levelcard_column` / `ob_levelcard_score` / `ob_levelcard_level` / `ob_tier`）均依此 join |
| BR-2 | 僅 `card_name` 與 `prod_kind` 可修改；其餘欄位（含稽核欄位）由後端維護 |
| BR-3 | `prod_kind` 變更**不回溯**：既有 `ob_pool_data_list` 歷史分派結果與 `ob_list_definition` 中已使用該 CARD_TYPE 之紀錄不被修改；audit log 記載變更前後完整內容供追溯 |
| BR-4 | 編輯 `ob_card_type.card_name` 是否同步更新 `ob_levelcard_version.card_name` 為設計決策：本 spec 採**不同步**（兩表獨立維護），`ob_levelcard_version.card_name` 由 F054 編輯端點維護；理由：兩者語意不同（CARD_TYPE 主資料 vs 計分版本快照），同步會造成歷史快照語意污染 | ✅ Decided |
| BR-5 | 月跑執行中禁止編輯（`SCORING_VERSION_LOCKED` 不適用此端點；改用 `ASSIGNMENT_RUN_ALREADY_RUNNING` 與 E07 其他 CARD_TYPE 端點一致） |

## 7. UI/UX 需求

- 開啟編輯 Modal，欄位：CARD_TYPE 代碼（input，disabled 灰色背景，附說明）/ CARD_TYPE 名稱（input）/ PROD_KIND（下拉）
- 「儲存」按鈕：送出 PUT；成功後 Modal 關閉、Tab 1 清單刷新
- 必填欄位錯誤行內顯示
- 月跑鎖定時編輯按鈕 disabled

## 8. 相依性

- **Blocked By**：F069（清單入口）、F070（新建後才有紀錄可編輯）
- **Blocks**：無直接下游（編輯不影響計分設定資料）

## 9. 交叉參考

- 資料模型：[data-model.md#ob-card-type-entity](../data-model.md#ob-card-type-entity)
- 錯誤處理：[error-handling.md#assignment-scoring-errors](../error-handling.md#assignment-scoring-errors)（含本次新增之 `CARD_TYPE_NOT_FOUND`）
- 相關功能：[F068](F068-edit-base-code.md)、[F069](F069-view-card-type-list.md)、[F070](F070-create-card-type.md)、[F072](F072-disable-card-type.md)

## 10. 假設

| # | 假設 | 標記 |
|---|------|------|
| A-1 | BR-4（`ob_card_type.card_name` 不同步 `ob_levelcard_version.card_name`）為 spec 層級決策；若 system-architect 認定須同步，spec 後續修訂並調整 BR-4 | [ASSUMPTION] — 建議由 system-architect 於 architecture-spec 中確認最終立場 |
