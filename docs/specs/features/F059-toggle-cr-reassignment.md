---
spec-id: F059
title: 開關 CR 回分規則（DEPRECATED v2.0）
feature-id: F059
source-story: US-080
epic: E07
module: M03 分派比例
priority: P0-MVP
version: "2.0-DEPRECATED"
date: 2026-05-16
status: Deprecated
supersededBy: F050, F051, ob_list_definition.cr_enabled
---

# F059: 開關 CR 回分規則 — DEPRECATED (v2.0)

> **DEPRECATED — 2026-05-16 / v2.0**
>
> 本 spec 已於 AD-E07 v3.0 / F002 v2.0 重構期間廢止，**不再進入 MVP 實作**。
>
> - **取代路徑**：
>   - 名單建立階段 → [F050 v2.0 建立名單定義](F050-create-list-definition.md)（建立時直接設定 `ob_list_definition.cr_enabled`）
>   - 名單編輯階段 → [F051 v2.0 編輯名單定義](F051-edit-list-definition.md)（限草稿狀態調整 `cr_enabled`）
> - **廢止原因**：CR 回分由「全域開關」改為 **per-list flag**（`ob_list_definition.cr_enabled BOOLEAN NOT NULL DEFAULT false`），授權整合至名單 CRUD（`DirectorGuard`）；不再需要獨立切換端點
> - **下游影響**：US-080 已 reroute 至 F050/F051；data-model 不再保留全域 `cr_reassignment_enabled` 設定
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

> **[DEPRECATED]（F102 US-154 / 2026-06-12）**：原設計之「全域開關」已廢止，CR 回分啟用/停用改為 **per-list 欄位** `ob_list_definition.cr_enabled`（BOOLEAN NOT NULL DEFAULT false），於名單建立 / 編輯階段設定；詳見 [F050](F050-create-list-definition.md) / [F051](F051-edit-list-definition.md)。CR 優先分派之執行邏輯由 [F102](F102-cr-priority-assignment.md) 承接（per-list `cr_enabled` 閘控 + 失效清空 + CR 優先指派 + 扣量）。全域旗標 `ob_assign_config.cr_reassignment_enabled` 已正式廢除（F102 US-154）。

提供業務主管切換 CR（Customer Recycling，回收客戶）回分規則的啟用/停用狀態。~~CR 回分規則為全域開關~~（**[DEPRECATED]** 已改為 per-list 欄位 `ob_list_definition.cr_enabled`，見上方說明），於月名單分派 Stage 3（部門分配）執行時作為優先指定機制。月名單分派執行中禁止切換。

## 2. 使用者故事

**As a** 業務主管
**I want** 切換 CR 回分規則的啟用或停用狀態
**So that** 靈活控制本月是否將曾被分派但未成交的客戶重新納入分派名單，而不需要 IT 修改程式邏輯

## 3. 前置條件

- 業務主管已登入並持有有效 JWT Token
- 系統已初始化 CR 回分設定紀錄（`[ASSUMPTION]` 儲存於 `ob_assign_set` 或獨立配置表）
- `assignment_run` 當下無 `status IN ('pending', 'running')` 的紀錄

## 4. 驗收標準

### AC-1：顯示 CR 回分規則目前狀態

- **Given** 業務主管進入分派比例頁面的 CR 回分設定區塊
- **When** 頁面載入完成
- **Then** 顯示 CR 回分規則的目前狀態（啟用 / 停用）及最後更新時間、更新者

### AC-2：切換 CR 回分規則狀態（含確認對話框）

- **Given** 業務主管查看 CR 回分規則區塊
- **When** 業務主管點擊切換開關
- **Then** 顯示確認對話框：「確定將 CR 回分規則{切換至啟用/停用}？此變更將影響下一次月名單分派的 Stage 3 部門分配邏輯。」
- **And** 業務主管點擊「確認」後，對應設定欄位由 `'Y'` ↔ `'N'`
- **And** 寫入 `assignment_audit_log`（`action = 'UPDATE'`, `entity_type = 'cr_reassignment_flag'`）
- **And** 頁面顯示切換成功提示

### AC-3：月名單分派執行中禁止切換

- **Given** `assignment_run` 有 `status IN ('pending', 'running')` 的紀錄
- **When** 業務主管嘗試點擊 CR 切換開關
- **Then** 切換開關為 disabled，提示「分派執行中，無法變更 CR 回分規則」
- **And** API 回傳 409 `ASSIGNMENT_RUN_ALREADY_RUNNING`

## 5. API 規格

### 5.1 GET /api/v1/assignment/ratios/cr-rule

**Response — 200 OK**

```json
{
  "enabled": true,
  "lastUpdatedBy": "sales_manager_01",
  "lastUpdatedAt": "2026-04-20T08:00:00Z"
}
```

### 5.2 PUT /api/v1/assignment/ratios/cr-rule

**Request Body**

```json
{
  "enabled": true
}
```

**Response — 200 OK**

```json
{
  "enabled": true,
  "updatedAt": "2026-04-24T12:00:00Z"
}
```

**錯誤回應**

| HTTP | 錯誤碼 | 說明 |
|---|---|---|
| 401 | AUTH_TOKEN_MISSING | 未登入 |
| 403 | AUTH_FORBIDDEN | `is_sales_manager` 未啟用 |
| 409 | ASSIGNMENT_RUN_ALREADY_RUNNING | 月名單分派執行中 |

## 6. 商業規則

| 規則編號 | 說明 |
|---|---|
| BR-1 | **[DEPRECATED]（F102 US-154）** ~~CR 回分規則為全域開關，影響所有部門的當下以後月名單分派~~ → 已改為 **per-list 開關** `ob_list_definition.cr_enabled`：各名單獨立決定是否啟用 CR 優先分派，僅影響該名單；全域旗標 `ob_assign_config.cr_reassignment_enabled` 已廢除。執行邏輯見 [F102](F102-cr-priority-assignment.md) BR-F102-01~03。 |
| BR-2 | 月名單分派執行中禁止切換；完成後自動恢復可切換 |
| BR-3 | 每次切換必須透過確認對話框，避免誤操作 |
| BR-4 | 目前狀態於月名單分派觸發時由 config 快照記錄，歷史可透過 F066 追溯 |

## 7. UI/UX 需求

- 切換開關（Toggle Switch）+ 當前狀態文字
- 顯示最後更新者與時間
- 確認 Modal：警告切換將影響下一次月名單分派
- 月名單分派鎖定時：開關 disabled + hover 提示

## 8. 相依性

- **Blocked By**：F001（登入驗證）
- **Blocks**：F061（月名單分派 Stage 3 依此開關決定是否執行 CR 回分優先指定）

## 9. 交叉參考

- 資料模型：[data-model.md#e07-data-model](../data-model.md#e07-data-model)（`ob_assign_set` 或等同配置表，由 system-architect 確認）
- 錯誤處理：[error-handling.md#assignment-errors](../error-handling.md#assignment-errors)
- 架構決策：AD-E07-1
- 相關功能：[F061](F061-trigger-assignment-run.md)、[F066](F066-view-run-snapshot-detail.md)

## 10. 假設

| # | 假設 | 標記 |
|---|---|---|
| A-1 | CR 回分全域開關實際儲存位置（表名 / 欄位）由 system-architect 確認；映射自舊系統 `OBASSIGNSET` | [ASSUMPTION] |
