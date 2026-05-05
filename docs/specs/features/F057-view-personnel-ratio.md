---
spec-id: F057
title: 查看人員比例設定
feature-id: F057
source-story: US-078
epic: E07
module: M03 分派比例
priority: P0-MVP
version: "1.0"
date: 2026-04-24
status: Draft
---

# F057: 查看人員比例設定

Priority: P0-MVP | Status: Draft | Last Updated: 2026-04-24

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + `data-model.md#e07-data-model` + `error-handling.md#assignment-errors` |
| QA / Tester | 本文件 + `error-handling.md#assignment-errors` |
| UI/UX Designer | 本文件（第 7 節 UI/UX 需求） |
| Architect | 本文件 + `architecture-spec.md` §3.10 |

---

## 1. 功能摘要

提供業務主管查看各部門內業務人員的名單分配比例設定（`ob_empl_set`）。支援依部門篩選、顯示部門內加總；已停用員工不出現於清單。純唯讀查看，編輯由 F058 負責。

## 2. 使用者故事

**As a** 業務主管
**I want** 查看目前各部門內業務人員的名單分配比例設定
**So that** 確認部門內各人員的工作量分配是否均衡，並決定是否需要調整

## 3. 前置條件

- 業務主管已登入並持有有效 JWT Token
- `ob_empl_set` 已有資料（至少一筆 `ration > 0`）

## 4. 驗收標準

### AC-1：顯示人員比例清單

- **Given** 業務主管進入分派比例頁面並選擇「人員比例」分頁
- **When** 頁面載入完成
- **Then** 顯示所有人員的名單分配比例，欄位包含：LIST_NO（`list_no`）、部門代碼（`deptid_m`）、員工工號（`emplid`）、分配比例（`ration` %）、商品類型（`prod_type`）
- **And** 清單依 `list_no` + `deptid_m` + `emplid` 排序

### AC-2：依部門篩選

- **Given** 人員比例清單已顯示
- **When** 業務主管選擇特定部門（`deptid_m`）篩選
- **Then** 只顯示該部門的人員，並在底部顯示該部門內所有人員比例加總

### AC-3：依 LIST_NO 篩選

- **Given** 人員比例清單已顯示
- **When** 業務主管選擇特定 LIST_NO 篩選
- **Then** 只顯示該 LIST_NO 相關人員的比例設定，並顯示該 LIST_NO 下各部門加總

### AC-4：停用人員不顯示

- **Given** 某員工已離職（`[ASSUMPTION]` `ob_empl_set` 中該員工 `ration = 0` 或標記停用，實作方式待 system-architect 確認）
- **When** 頁面載入
- **Then** 預設不顯示該員工（可透過「顯示停用人員」選項開啟）

## 5. API 規格

### 5.1 GET /api/v1/assignment/ratios/personnel

**Query Parameters**

| 參數 | 型別 | 必填 | 說明 |
|---|---|---|---|
| listNo | string | 否 | 指定名單編號篩選 |
| deptId | string | 否 | 指定部門代碼篩選 |
| includeInactive | boolean | 否 | 是否含停用人員，預設 false |

**Response — 200 OK**

```json
{
  "data": [
    {
      "listNo": "OB202605001",
      "deptIdM": "D01",
      "deptName": "業務一部",
      "emplId": "EMP001",
      "emplName": "王大明",
      "ration": 40.0,
      "prodType": "01$$02"
    }
  ],
  "summary": {
    "deptTotals": { "D01": 100.0, "D02": 100.0 }
  }
}
```

**錯誤回應**

| HTTP | 錯誤碼 | 說明 |
|---|---|---|
| 401 | AUTH_TOKEN_MISSING | 未登入 |
| 403 | AUTH_FORBIDDEN | `is_sales_manager` 未啟用 |

## 6. 商業規則

| 規則編號 | 說明 |
|---|---|
| BR-1 | `ob_empl_set` PK = `(list_no, deptid_m, emplid, ration)` |
| BR-2 | 依部門或 LIST_NO 篩選時，底部加總依篩選範圍計算 |
| BR-3 | 本頁為唯讀查看；編輯操作由 F058 處理 |

## 7. UI/UX 需求

- 篩選器：部門下拉 + LIST_NO 下拉 + 「顯示停用人員」checkbox
- 清單表格：欄位如 §5.1 response
- 底部顯示動態加總

## 8. 相依性

- **Blocked By**：F001（登入驗證）
- **Blocks**：F058（編輯人員比例需先了解現有設定）

## 9. 交叉參考

- 資料模型：[data-model.md#e07-data-model](../data-model.md#e07-data-model)（`ob_empl_set`）
- 錯誤處理：[error-handling.md#assignment-errors](../error-handling.md#assignment-errors)
- 架構決策：AD-E07-1
- 相關功能：[F058](F058-edit-personnel-ratio.md)、[F061](F061-trigger-assignment-run.md)

## 10. 假設

| # | 假設 | 標記 |
|---|---|---|
| A-1 | 員工停用機制（`status` 欄位或 `ration = 0`）由 system-architect 最終確認 | [ASSUMPTION] |
