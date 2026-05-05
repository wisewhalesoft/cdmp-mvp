---
spec-id: F055
title: 編輯 CARD_LEVEL 分級門檻
feature-id: F055
source-story: US-074
epic: E07
module: M02 計分設定
priority: P0-MVP
version: "1.0"
date: 2026-04-24
status: Draft
---

# F055: 編輯 CARD_LEVEL 分級門檻

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

### 5.1 PUT /api/v1/assignment/scoring/card-levels

**Request Body**

```json
{
  "cardType": "01",
  "cardVersion": 3,
  "levels": [
    { "cardLevel": "A", "scoreS": 81, "scoreE": 100 },
    { "cardLevel": "B", "scoreS": 61, "scoreE": 80 },
    { "cardLevel": "C", "scoreS": 41, "scoreE": 60 },
    { "cardLevel": "D", "scoreS": 0,  "scoreE": 40 }
  ]
}
```

**Response — 200 OK**

```json
{
  "cardType": "01",
  "cardVersion": 3,
  "updatedLevels": 4
}
```

### 5.2 GET /api/v1/assignment/scoring/card-levels/preview

**Query Parameters**

| 參數 | 型別 | 必填 | 說明 |
|---|---|---|---|
| cardType | string | 是 | 計分卡類型 |
| levels | JSON | 是 | 試算用的新門檻（URL encoded） |

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
