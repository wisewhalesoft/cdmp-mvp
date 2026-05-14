---
spec-id: F055
title: 編輯 CARD_LEVEL 分級門檻
feature-id: F055
source-story: US-074
epic: E07
module: M02 計分設定
priority: P0-MVP
version: "1.2"
date: 2026-05-13
status: Draft
---

# F055: 編輯 CARD_LEVEL 分級門檻

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

提供業務主管調整 CARD_LEVEL 各等級（A/B/C/D 等）的分數下限門檻（`ob_levelcard_level`）。修改時提供「預估各等級客戶分佈」預覽，並驗證門檻不得重疊。月跑執行中禁止修改。

## 2. 使用者故事

**As a** 業務主管
**I want** 調整 CARD_LEVEL 的分級門檻（各等級的分數下限）
**So that** 可根據本月客戶評分分佈，重新劃定等級分界線，確保名單分配比例合理

## 3. 前置條件

- 業務主管已登入並持有有效 JWT Token
- `ob_levelcard_level` 已有對應 `card_type + card_version` 的分級資料
- `assignment_run` 當下無 `status IN ('pending', 'running')` 的紀錄

## 4. 驗收標準

### AC-1：顯示目前 CARD_LEVEL 門檻設定

- **Given** 業務主管進入 CARD_LEVEL 設定頁面
- **When** 頁面載入完成
- **Then** 顯示目前各等級的分數區間（`score_s` ~ `score_e`）與等級代碼（`card_level`），表格欄位：等級代碼、等級名稱、分數下限、分數上限
- **And** 不同 CARD_TYPE 的等級數可能不同（OBLEVELCARD_LEVEL dump 中 `S5` 僅 A/B 兩級，其餘 H/S/E/E5/M 為 A/B/C/D 四級），UI 與 API 不可硬編碼 4 級邏輯
- **And** 資料來源：`GET /api/v1/assignment/scoring/card-levels`（詳見 §5.1.1）

### AC-2：修改門檻值並儲存

- **Given** 業務主管進入編輯模式
- **When** 業務主管修改某等級的 `score_s` 或 `score_e`，點擊「儲存」
- **Then** `ob_levelcard_level` 對應列 UPDATE，頁面顯示儲存成功提示
- **And** 若修改後導致等級之間的區間重疊（例如 B 的 `score_s` ≤ A 的 `score_e`），顯示驗證錯誤，不允許儲存
- **And** 寫入 `assignment_audit_log`（`action = 'UPDATE'`）

### AC-3：門檻變更預覽影響

- **Given** 業務主管修改門檻值（尚未儲存）
- **When** 修改完成
- **Then** 頁面顯示預估影響：「預估各等級客戶分佈：A 級 N 人 / B 級 N 人 / C 級 N 人 / D 級 N 人」
- **And** 預覽計算以目前 `ob_pool_data` 套用新門檻（允許最多 1 分鐘的應用層快取）

### AC-4：月跑執行中禁止修改

- **Given** `assignment_run` 有 `status IN ('pending', 'running')` 的紀錄
- **When** 業務主管嘗試進入編輯模式
- **Then** 編輯按鈕 disabled，提示「分派執行中，無法修改 CARD_LEVEL 門檻」
- **And** API 回傳 409 `SCORING_VERSION_LOCKED`

### AC-5：門檻區間不重疊驗證

- **Given** 業務主管修改 B 級 `score_s` 為 65，A 級 `score_e` 為 80
- **When** 業務主管點擊「儲存」
- **Then** 回傳 422 `SCORING_RANGE_OVERLAP`，訊息：「等級 B 下限 65 與等級 A 上限 80 重疊，請調整」

## 5. API 規格

### 5.1.1 GET /api/v1/assignment/scoring/card-levels

對應 AC-1：頁面載入時取得目前 `cardType + cardVersion` 之 `ob_levelcard_level` 清單供表格顯示。

**Query Parameters**

| 參數 | 型別 | 必填 | 說明 |
|---|---|---|---|
| cardType | string | 是 | 計分卡類型（如 `H` / `S` / `E` / `S5` / `E5` / `M`） |
| cardVersion | number | 否 | 計分版本；未傳則預設為該 `cardType` 之 active 版本（一般為 1） |

**Response — 200 OK**

```json
{
  "cardType": "H",
  "cardVersion": 1,
  "levels": [
    { "cardLevel": "A", "scoreS": 243, "scoreE": 999 },
    { "cardLevel": "B", "scoreS": 214, "scoreE": 242 },
    { "cardLevel": "C", "scoreS": 185, "scoreE": 213 },
    { "cardLevel": "D", "scoreS": 0,   "scoreE": 184 }
  ]
}
```

**Response 欄位說明**：`levels` 依 `score_s` 降冪排列（A 級門檻最高），長度依 CARD_TYPE 動態決定（`S5` = 2、`H` / `S` / `E` / `E5` / `M` = 4），前端不可硬編碼等級數量。

**錯誤回應**

| HTTP | 錯誤碼 | 說明 |
|---|---|---|
| 401 | AUTH_TOKEN_MISSING | 未登入 |
| 403 | AUTH_FORBIDDEN | `is_sales_manager` 未啟用 |
| 404 | SCORING_VERSION_NOT_FOUND | 該 `cardType` 無 active 計分版本，或指定 `cardVersion` 不存在 |

### 5.1 PUT /api/v1/assignment/scoring/card-levels

**Request Body**

```json
{
  "cardType": "H",
  "cardVersion": 1,
  "levels": [
    { "cardLevel": "A", "scoreS": 243, "scoreE": 999 },
    { "cardLevel": "B", "scoreS": 214, "scoreE": 242 },
    { "cardLevel": "C", "scoreS": 185, "scoreE": 213 },
    { "cardLevel": "D", "scoreS": 0,   "scoreE": 184 }
  ]
}
```

**寫入語意**：依 `(card_type, card_version, card_level)` 三欄複合鍵定位 `ob_levelcard_level` 紀錄並執行 UPDATE；request 不傳 surrogate `id`，PK 三欄為唯一比對鍵。`levels` 陣列長度由前端依當前 CARD_TYPE 既有等級數動態決定（如 `S5` 為 2 筆、`H` 為 4 筆）。

**Response — 200 OK**

```json
{
  "cardType": "H",
  "cardVersion": 1,
  "updatedLevels": 4
}
```

### 5.2 GET /api/v1/assignment/scoring/card-levels/preview

**Query Parameters**

| 參數 | 型別 | 必填 | 說明 |
|---|---|---|---|
| cardType | string | 是 | 計分卡類型（如 `H` / `S` / `E` / `S5` / `E5` / `M`） |
| levels | JSON | 是 | 試算用新門檻陣列的 JSON，需 URL encode。範例：`levels=%5B%7B%22cardLevel%22%3A%22A%22%2C%22scoreS%22%3A243%2C%22scoreE%22%3A999%7D%5D`，解碼後對應 `[{"cardLevel":"A","scoreS":243,"scoreE":999}]` |

**Response — 200 OK**

```json
{
  "distribution": { "A": 2000, "B": 4000, "C": 3000, "D": 500 }
}
```

**錯誤回應**

| HTTP | 錯誤碼 | 說明 |
|---|---|---|
| 401 | AUTH_TOKEN_MISSING | 未登入 |
| 403 | AUTH_FORBIDDEN | `is_sales_manager` 未啟用 |
| 409 | SCORING_VERSION_LOCKED | 月跑執行中 |
| 422 | SCORING_RANGE_OVERLAP | 門檻區間重疊 |

## 6. 商業規則

| 規則編號 | 說明 |
|---|---|
| BR-1 | 門檻區間不得重疊；相鄰等級的 `score_e + 1 = 下一級 score_s` 允許 |
| BR-2 | 預覽計算允許應用層快取 60 秒 |
| BR-3 | 月跑鎖定：`assignment_run.status IN ('pending', 'running')` 時禁止修改 |
| BR-4 | `ob_levelcard_version.status` 欄位於遷移時補建（原 OBLEVELCARD_VERSION 無此欄位），初值由 `(SDATE <= 今日 < EDATE)` 計算；本功能仍以 `status = 'active'` 判斷 active 計分版本 |

## 7. UI/UX 需求

- 等級門檻表格：inline edit 或 Modal 編輯
- 預覽影響區：以即時查詢或 debounce 300ms 顯示更新後分佈
- 錯誤提示：直接於有問題的等級列顯示紅色邊框 + 錯誤訊息

## 8. 相依性

- **Blocked By**：F053（需先了解計分版本結構）
- **Blocks**：F056（TIER_LEVEL 對應依賴 CARD_LEVEL 定義）、F061（月跑 Stage 2 等級劃分）

## 9. 交叉參考

- 資料模型：[data-model.md#e07-data-model](../data-model.md#e07-data-model)（`ob_levelcard_level`）
- 錯誤處理：[error-handling.md#assignment-errors](../error-handling.md#assignment-errors)
- 架構決策：AD-E07-3
- 相關功能：[F053](F053-view-scoring-dimensions.md)、[F054](F054-edit-scoring-dimension.md)、[F056](F056-edit-tier-mapping.md)、[F061](F061-trigger-assignment-run.md)
