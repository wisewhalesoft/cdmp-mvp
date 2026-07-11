---
spec-id: F058
title: 編輯人員比例設定（DEPRECATED v2.0）
feature-id: F058
source-story: US-079
epic: E07
module: M03 分派比例
priority: P0-MVP
version: "2.0-DEPRECATED"
date: 2026-05-16
status: Deprecated
supersededBy: F082
---

# F058: 編輯人員比例設定 — DEPRECATED (v2.0)

> **DEPRECATED — 2026-05-16 / v2.0**
>
> 本 spec 已於 AD-E07 v3.0 / F002 v2.0 重構期間廢止，**不再進入 MVP 實作**。
>
> - **取代路徑**：[F082 v1.3 個別業務比例（Per-Sales Ratio）](F082-set-per-sales-ratio.md)
> - **廢止原因**：原 `ob_empl_set.ration` 「人員比例」概念已併入 M03b 個別業務比例（per-sales ratio），授權層採處長轄區限縮（`DirectorOrSectionChiefGuard` + service 層 `scopeByCreator()`），詳見 [F002 §4.6.1 / §4.6.2](F002-user-login.md)
> - **下游影響**：相關使用者故事（US-079）已 reroute 至 F082；data model 中 `ob_empl_set` 改用 F082 描述的 schema
>
> 以下 v1.0 內容僅供歷史比對，**禁止用於實作**。

Priority: P0-MVP | Status: Deprecated | Last Updated: 2026-05-16

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + `data-model.md#e07-data-model` + `error-handling.md#assignment-errors` |
| QA / Tester | 本文件 + `error-handling.md#assignment-errors` |
| UI/UX Designer | 本文件（第 7 節 UI/UX 需求） |
| Architect | 本文件 + `architecture-spec.md` §3.10 |

---

## 1. 功能摘要

提供業務主管調整各部門內業務人員的名單分配比例（`ob_empl_set.ration`）。同一 `list_no + deptid_m` 下所有人員比例加總必須 = 100%；0% 為合法值（視為「本月不分配」）。月名單分派執行中禁止修改。

## 2. 使用者故事

**As a** 業務主管
**I want** 調整部門內各業務人員的名單分配比例
**So that** 根據人員異動（新進、離職、休假）或業務需求，靈活分配每月客戶名單

## 3. 前置條件

- 業務主管已登入並持有有效 JWT Token
- 目標 `list_no + deptid_m` 在 `ob_empl_set` 中已有人員清單
- `assignment_run` 當下無 `status IN ('pending', 'running')` 的紀錄

## 4. 驗收標準

### AC-1：修改人員分配比例並即時加總

- **Given** 業務主管進入人員比例編輯模式（選定某 `list_no + deptid_m`）
- **When** 業務主管修改某員工的 `ration` 值
- **Then** 頁面即時顯示該部門內所有人員比例的動態加總
- **And** 若加總 = 100%，儲存按鈕啟用；若加總 ≠ 100%，儲存按鈕停用並提示「比例加總為 N%，需調整至 100% 才能儲存」

### AC-2：新增人員至分配清單

- **Given** 新員工已加入人員清單但尚未設定比例
- **When** 業務主管點擊「新增人員」，選擇員工並填入比例
- **Then** 新員工加入該 `list_no + deptid_m` 的人員比例清單，頁面動態更新加總

### AC-3：移除人員（設為 0%）

- **Given** 某員工本月不分配名單（如長期請假）
- **When** 業務主管將該員工 `ration` 設為 0%
- **Then** 系統允許儲存（0% 視為有效值），該員工本月不分到任何名單
- **And** 0% 人員仍顯示於清單，以便日後恢復

### AC-4：儲存成功

- **Given** 所有人員 `ration` 加總 = 100%
- **When** 業務主管點擊「儲存」
- **Then** `ob_empl_set` 對應列 UPDATE（或 INSERT 新人員）
- **And** 寫入 `assignment_audit_log`（`action = 'UPDATE'`）
- **And** 頁面顯示儲存成功提示

### AC-5：月名單分派執行中禁止修改

- **Given** `assignment_run` 有 `status IN ('pending', 'running')` 的紀錄
- **When** 業務主管嘗試進入編輯模式
- **Then** 編輯按鈕 disabled，提示「分派執行中，無法修改比例設定」
- **And** API 回傳 409 `ASSIGNMENT_RUN_ALREADY_RUNNING`

### AC-6：加總不等於 100% 阻擋儲存

- **Given** 業務主管調整後 `list_no + deptid_m` 下人員比例加總 = 95%
- **When** 業務主管點擊「儲存」
- **Then** 後端回傳 422 `PERSONNEL_RATIO_SUM_INVALID`，訊息：「部門 {deptid_m} 人員比例加總為 {N}%，需調整至 100%」

## 5. API 規格

### 5.1 PUT /api/v1/assignment/ratios/personnel/:listNo

**Request Body**

```json
{
  "deptIdM": "D01",
  "personnel": [
    { "emplId": "EMP001", "ration": 40.0, "prodType": "01$$02" },
    { "emplId": "EMP002", "ration": 35.0, "prodType": "01$$02" },
    { "emplId": "EMP003", "ration": 25.0, "prodType": "01$$02" }
  ]
}
```

**Response — 200 OK**

```json
{
  "listNo": "OB202605001",
  "deptIdM": "D01",
  "updatedCount": 3,
  "totalRation": 100.0
}
```

**錯誤回應**

| HTTP | 錯誤碼 | 說明 |
|---|---|---|
| 401 | AUTH_TOKEN_MISSING | 未登入 |
| 403 | AUTH_FORBIDDEN | `is_sales_manager` 未啟用 |
| 409 | ASSIGNMENT_RUN_ALREADY_RUNNING | 月名單分派執行中 |
| 422 | PERSONNEL_RATIO_SUM_INVALID | 部門人員比例加總 ≠ 100% |
| 422 | VALIDATION_ERROR | 欄位驗證失敗（`ration` 超出 0~100 範圍等） |

## 6. 商業規則

| 規則編號 | 說明 |
|---|---|
| BR-1 | 同一 `list_no + deptid_m` 下所有人員比例加總必須 = 100% |
| BR-2 | 0% 為合法值，視為「本月不分配」；0% 員工仍保留於清單 |
| BR-3 | 月名單分派鎖定：`assignment_run.status IN ('pending', 'running')` 時禁止修改 |
| BR-4 | `ration` 範圍：0.0 ~ 100.0（`NUMERIC(10,1)`） |
| BR-5 | 修改僅針對指定 `list_no + deptid_m`，不影響其他 LIST_NO 或部門 |
| BR-6 | 「新增人員」員工下拉清單來源為 AppDB `ob_emphire`（採 E04 + E05 雙層 ETL 從舊 OB DB 同步，OBEMPHIRE 採 full 全量重抓策略，詳見 [architecture-spec.md §E07-C](../architecture-spec.md#e07-c-etl-設計)），過濾條件 `WHERE resign_date IS NULL`（在職員工）；可進一步依目標 `deptid_m` 過濾 `dept_code = :deptIdM` |

## 7. UI/UX 需求

- 即時加總顯示於部門行底部
- 儲存按鈕依加總狀態動態啟用/停用
- 新增人員 Modal：員工下拉 + 比例輸入
- 月名單分派鎖定時：編輯按鈕 disabled + hover 提示

## 8. 相依性

- **Blocked By**：F057（需先查看人員比例設定）
- **Blocks**：F061（月名單分派 Stage 4 人員分配需要人員比例已設定正確）

## 9. 交叉參考

- 資料模型：[data-model.md#e07-data-model](../data-model.md#e07-data-model)（`ob_empl_set`）；[data-model.md#ob-emphire-entity](../data-model.md#ob-emphire-entity)（員工主檔，採 E04 + E05 雙層 ETL 同步）
- 錯誤處理：[error-handling.md#assignment-errors](../error-handling.md#assignment-errors)
- 架構決策：AD-E07-1
- 相關功能：[F057](F057-view-personnel-ratio.md)、[F061](F061-trigger-assignment-run.md)
