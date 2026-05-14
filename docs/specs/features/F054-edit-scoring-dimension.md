---
spec-id: F054
title: 編輯計分維度與分數
feature-id: F054
source-story: US-073
epic: E07
module: M02 計分設定
priority: P0-MVP
version: "1.1"
date: 2026-05-13
status: Draft
---

# F054: 編輯計分維度與分數

Priority: P0-MVP | Status: Draft | Last Updated: 2026-05-13

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + `data-model.md#e07-data-model` + `error-handling.md#assignment-errors` |
| QA / Tester | 本文件 + `error-handling.md#assignment-errors` |
| UI/UX Designer | 本文件（第 7 節 UI/UX 需求） |
| Architect | 本文件 + `architecture-spec.md` §3.10 |

---

## 1. 功能摘要

提供業務主管新增、修改、停用計分維度，以及調整各維度的分數區間設定（`ob_levelcard_column` / `ob_levelcard_score`）。採覆寫式儲存（無草稿版本分岔）；月跑執行中禁止修改。歷史追溯透過每次月跑自動產生的 config 快照（F066）查詢。

## 2. 使用者故事

**As a** 業務主管
**I want** 新增、修改或停用計分維度，以及調整各維度的分數區間設定
**So that** 可在不依賴 IT 的情況下，根據當月業務策略靈活調整客戶評分邏輯

## 3. 前置條件

- 業務主管已登入並持有有效 JWT Token
- `ob_levelcard_version` 至少有一筆 `status = 'active'` 的版本紀錄
- `assignment_run` 當下無 `status IN ('pending', 'running')` 的紀錄

## 4. 驗收標準

### AC-1：查看並直接編輯現行計分維度清單

- **Given** 業務主管進入 M02 計分設定頁面
- **When** 頁面載入完成
- **Then** 顯示目前生效的所有計分維度清單，可直接點擊進入編輯模式
- **And** 頁面顯示「現行設定」單一視圖，不存在草稿版本或版本切換選單

### AC-2：修改維度分數區間並即時儲存

- **Given** 業務主管修改某維度的分數區間（新增區間、調整條件值或分數）
- **When** 業務主管點擊「儲存」
- **Then** 修改直接寫入生效設定（`ob_levelcard_score` 對應列 UPDATE；新增區間則 INSERT），無草稿暫存流程
- **And** 頁面顯示儲存成功 toast
- **And** 寫入 `assignment_audit_log`（`action = 'UPDATE'`, `before_value` + `after_value` JSONB）

### AC-3：新增維度直接生效

- **Given** 業務主管點擊「新增維度」，填入 `column_name` / `column_label` / 分數區間
- **When** 業務主管點擊「確認新增」
- **Then** 新維度寫入 `ob_levelcard_column` 並對應區間寫入 `ob_levelcard_score`
- **And** 新維度立即出現於現行設定清單中
- **And** 寫入 `assignment_audit_log`（`action = 'CREATE'`）

### AC-4：停用維度（Soft Delete）

- **Given** 業務主管點擊某維度的「停用」按鈕並確認
- **When** 後端處理停用請求
- **Then** 該維度於 `ob_levelcard_column.status` 欄位標記為 `'inactive'`（soft delete 機制；欄位定義由 migration `1711360000143-AddObLevelcardColumnStatus.ts` 補建，VARCHAR(10) NOT NULL DEFAULT 'active'）
- **And** 不刪除既有資料；後續月跑 Stage 2 透過 `fn_calc_tier_level` 依 `status = 'active'` 過濾，停用維度不再參與計分
- **And** 寫入 `assignment_audit_log`（`action = 'DISABLE'`）

### AC-5：月跑執行中禁止修改（資料鎖）

- **Given** `assignment_run` 有 `status IN ('pending', 'running')` 的紀錄
- **When** 業務主管嘗試進入計分設定編輯模式
- **Then** 編輯功能全部停用，頁面顯示「分派執行中，無法修改計分設定」提示
- **And** API 呼叫回傳 409 `SCORING_VERSION_LOCKED`

### AC-6：分數區間重疊驗證

- **Given** 業務主管新增或修改某數值型區間（`level2_s` ~ `level2_e`）
- **When** 前端/後端驗證
- **Then** 若新區間與既有區間重疊（交集不為空），回傳 422 `SCORING_RANGE_OVERLAP`，訊息：「分數區間重疊，請調整條件值」

## 5. API 規格

### 5.1 PUT /api/v1/assignment/scoring/dimensions

**Request Body**

```json
{
  "cardType": "01",
  "cardVersion": 3,
  "dimensions": [
    {
      "columnName": "ACCOUNT_AGE",
      "columnLabel": "帳齡",
      "scores": [
        { "level1": null, "level2S": "0", "level2E": "3", "score": 10 },
        { "level1": null, "level2S": "4", "level2E": "12", "score": 20 }
      ]
    }
  ]
}
```

**Response — 200 OK**

```json
{
  "cardType": "01",
  "cardVersion": 3,
  "updatedDimensions": 1,
  "updatedScores": 2
}
```

### 5.2 POST /api/v1/assignment/scoring/dimensions（新增維度）

**Request Body**

```json
{
  "cardType": "01",
  "cardVersion": 3,
  "columnName": "CONTRACT_YEARS",
  "columnLabel": "契約年資",
  "scores": [
    { "level2S": "0", "level2E": "5", "score": 5 },
    { "level2S": "6", "level2E": "99", "score": 15 }
  ]
}
```

**Response — 201 Created**：新增維度資訊。

**錯誤回應**

| HTTP | 錯誤碼 | 說明 |
|---|---|---|
| 401 | AUTH_TOKEN_MISSING | 未登入 |
| 403 | AUTH_FORBIDDEN | `is_sales_manager` 未啟用 |
| 409 | SCORING_VERSION_LOCKED | 月跑執行中禁止修改 |
| 422 | SCORING_COLUMN_DUPLICATE | `column_name` 已存在於 active 版本 |
| 422 | SCORING_RANGE_OVERLAP | 分數區間重疊 |
| 422 | VALIDATION_ERROR | 欄位驗證失敗 |

### 5.3 PUT /api/v1/assignment/scoring/dimensions/:columnName/disable（停用維度）

對應 AC-4 soft delete：將 `ob_levelcard_column.status` 由 `'active'` 標記為 `'inactive'`，不刪除既有 `ob_levelcard_score` 資料。動詞採用 `PUT` 並以 `/disable` 子路徑表示動作，沿用 E07 模組既有慣例（參見 F068 §5.4）。

**Path Parameters**

| 參數 | 型別 | 必填 | 說明 |
|---|---|---|---|
| columnName | string | 是 | 計分維度欄位名稱（如 `ACCOUNT_AGE`） |

**Query Parameters**

| 參數 | 型別 | 必填 | 說明 |
|---|---|---|---|
| cardType | string | 是 | 卡別代碼（如 `H` / `S` / `E` / `S5` / `E5` / `M`） |

**Request Body**：無

**Response — 200 OK**

```json
{
  "cardType": "H",
  "cardVersion": 1,
  "columnName": "ACCOUNT_AGE",
  "status": "inactive",
  "disabledAt": "2026-05-13T08:30:00.000Z"
}
```

**錯誤回應**

| HTTP | 錯誤碼 | 說明 |
|---|---|---|
| 401 | AUTH_TOKEN_MISSING | 未登入 |
| 403 | AUTH_FORBIDDEN | `is_sales_manager` 未啟用 |
| 404 | SCORING_COLUMN_NOT_FOUND | 指定的 `cardType + columnName` 不存在或已停用 |
| 409 | SCORING_VERSION_LOCKED | 月跑執行中禁止修改 |

## 6. 商業規則

| 規則編號 | 說明 |
|---|---|
| BR-1 | 覆寫式編輯：無草稿版本、無 rollback；歷史追溯透過月跑自動產生的 `config` 快照（F066） |
| BR-2 | `card_version` 寫入規則：覆寫式修改不遞增 `card_version`（OBLEVELCARD_VERSION dump 中 6 種 CARD_TYPE — H/S/E/S5/E5/M — 全部為 v1 為證）；新版本另行建立 `ob_levelcard_version` 紀錄屬未來範疇，本次不支援 |
| BR-3 | 分數區間不可重疊；類別型（`level1`）與數值型（`level2_s` ~ `level2_e`）為二擇一 |
| BR-4 | 月跑鎖：`assignment_run.status IN ('pending', 'running')` 時 API 直接回傳 409 |
| BR-5 | 複雜計分邏輯（TIER_LEVEL 對應計算）由 PostgreSQL function 實作（AD-E07-3） |
| BR-6 | `ob_levelcard_version.status` 欄位於遷移時補建（原 OBLEVELCARD_VERSION 無此欄位），初值由 `(SDATE <= 今日 < EDATE)` 計算；本功能仍以 `status = 'active'` 判斷 active 計分版本 |

## 7. UI/UX 需求

- 現行設定視圖：可直接編輯（inline edit 或 Modal）
- 新增維度：開啟 Modal 表單
- 停用維度：Modal 確認對話框
- 月跑鎖定時：編輯 / 新增 / 停用按鈕全部 disabled

## 8. 相依性

- **Blocked By**：F053（需先查看現有設定）
- **Blocks**：F061（月跑 Stage 2 計分邏輯使用此設定）

## 9. 交叉參考

- 資料模型：[data-model.md#e07-data-model](../data-model.md#e07-data-model)（`ob_levelcard_version`、`ob_levelcard_column`、`ob_levelcard_score`）
- 錯誤處理：[error-handling.md#assignment-errors](../error-handling.md#assignment-errors)
- 架構決策：AD-E07-3（PostgreSQL function）
- 相關功能：[F053](F053-view-scoring-dimensions.md)、[F055](F055-edit-card-level-thresholds.md)、[F056](F056-edit-tier-mapping.md)、[F061](F061-trigger-assignment-run.md)、[F066](F066-view-run-snapshot-detail.md)

## 10. 假設

本版本無未解決假設：

- 原 A-1（`ob_levelcard_column.status` 欄位）已由 migration `1711360000143-AddObLevelcardColumnStatus.ts` 落實，見 AC-4
- 原 A-2（覆寫式修改不遞增 `card_version`）已由 OBLEVELCARD_VERSION dump（6 種 CARD_TYPE 均為 v1）證實，見 BR-2
