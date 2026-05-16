---
spec-id: F057
title: 查看人員比例設定
feature-id: F057
source-story: US-078
epic: E07
module: M03 分派比例
priority: P0-MVP
version: "1.1"
date: 2026-05-16
status: Draft
---

# F057: 查看人員比例設定

Priority: P0-MVP | Status: Draft | Last Updated: 2026-05-16

> **v1.1（2026-05-16）**：依 F002 v2.0 / AD-E07 v3.0 重構：本端點隸屬 M03b 個別業務比例查詢；Guard 改為 `DirectorOrSectionChiefGuard` + service 層 `scopeByCreator()`（處長僅可查詢 `created_by = currentUser.id` 之紀錄，部長與 admin 可查全部）；本頁定位為「流程外查詢入口」（M03 主流程之輔助查詢，非 M03 流程步驟）。

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + `data-model.md#e07-data-model` + `error-handling.md#assignment-errors` |
| QA / Tester | 本文件 + `error-handling.md#assignment-errors` |
| UI/UX Designer | 本文件（第 7 節 UI/UX 需求） |
| Architect | 本文件 + `architecture-spec.md` §3.10 |

---

## 1. 功能摘要

提供業務部長 / 業務處長查看各部門內業務人員的名單分配比例設定（`ob_empl_set`）。支援依部門篩選、顯示部門內加總；已停用員工不出現於清單。純唯讀查看；編輯由 [F082 v1.3 個別業務比例（Per-Sales Ratio）](F082-set-per-sales-ratio.md) 負責（原 F058 已 DEPRECATED v2.0）。**本頁為「流程外查詢入口」**：M03 主流程之輔助查詢面板，非 M03 流程步驟；處長透過 sidebar 直達進行轄區內查詢，部長可瀏覽全範圍。

## 2. 使用者故事

**As a** 業務部長 / 業務處長
**I want** 查看目前各部門內業務人員的名單分配比例設定
**So that** 確認部門內各人員的工作量分配是否均衡，並決定是否需要調整

## 3. 前置條件

- 業務部長 / 業務處長已登入並持有有效 JWT Token
- `businessRole IN ('director','section_chief')`（後端套用 `DirectorOrSectionChiefGuard`，依 F002 §4.6.2 M03b 個別業務比例查詢）
- `ob_empl_set` 已有資料（至少一筆 `ration > 0`）
- **處長轄區限縮**：service 層執行 `scopeByCreator()`，僅回傳 `created_by = currentUser.id` 之紀錄；部長與 admin 不套此限制（依 F002 §4.6.1 / §4.6.2 M03b 註記）

## 4. 驗收標準

### AC-1：顯示人員比例清單

- **Given** 業務部長 / 業務處長進入分派比例頁面並選擇「人員比例」分頁
- **When** 頁面載入完成
- **Then** 顯示所有人員的名單分配比例，欄位包含：LIST_NO（`list_no`）、部門代碼（`deptid_m`）、員工工號（`emplid`）、分配比例（`ration` %）、商品類型（`prod_type`）
- **And** 清單依 `list_no` + `deptid_m` + `emplid` 排序

### AC-2：依部門篩選

- **Given** 人員比例清單已顯示
- **When** 業務部長 / 業務處長選擇特定部門（`deptid_m`）篩選
- **Then** 只顯示該部門的人員，並在底部顯示該部門內所有人員比例加總

### AC-3：依 LIST_NO 篩選

- **Given** 人員比例清單已顯示
- **When** 業務部長 / 業務處長選擇特定 LIST_NO 篩選
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
| 403 | E07_ROLE_NOT_ASSIGNED | `businessRole` 非 `'director'` / `'section_chief'`（`DirectorOrSectionChiefGuard` 攔截，依 F002 §4.6.2） |

## 6. 商業規則

| 規則編號 | 說明 |
|---|---|
| BR-1 | `ob_empl_set` PK = `(list_no, deptid_m, emplid, ration)` |
| BR-2 | 依部門或 LIST_NO 篩選時，底部加總依篩選範圍計算 |
| BR-3 | 本頁為唯讀查看；編輯操作由 [F082 v1.3](F082-set-per-sales-ratio.md) 處理（原 F058 v2.0-DEPRECATED） |
| BR-4 | **處長轄區限縮（v1.1 新增）**：當 `businessRole='section_chief'` 時，service 層強制 `WHERE created_by = currentUser.id` 過濾；部長 / admin 不套此限制；違反此規則導致處長越權查詢即為 spec 違反（依 F002 §4.6.1 M03b 註記、§4.6.2 M03b 端點規則） |
| BR-5 | **流程外查詢定位（v1.1 新增）**：本頁不參與 M03 主流程推進（F078 / F080 / F084），僅作為查詢入口；UI sidebar 應將其放置於「客戶名單分派 → 分派比例 → 個別業務比例（查詢）」獨立節點 |

## 7. UI/UX 需求

- 篩選器：部門下拉 + LIST_NO 下拉 + 「顯示停用人員」checkbox
- 清單表格：欄位如 §5.1 response
- 底部顯示動態加總

## 8. 相依性

- **Blocked By**：F001（登入驗證）、F002 §4.6（角色矩陣 + Guard）
- **Blocks**：[F082 v1.3](F082-set-per-sales-ratio.md)（編輯個別業務比例需先了解現有設定）

## 9. 交叉參考

- 資料模型：[data-model.md#e07-data-model](../data-model.md#e07-data-model)（`ob_empl_set`）
- 錯誤處理：[error-handling.md#assignment-errors](../error-handling.md#assignment-errors)
- 架構決策：AD-E07-1
- 相關功能：~~F058（已 DEPRECATED → [F082](F082-set-per-sales-ratio.md)）~~、[F061](F061-trigger-assignment-run.md)、[F002 §4.6 角色矩陣](F002-user-login.md)

## 10. 假設

| # | 假設 | 標記 |
|---|---|---|
| A-1 | 員工停用機制（`status` 欄位或 `ration = 0`）由 system-architect 最終確認 | [ASSUMPTION] |
