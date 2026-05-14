---
spec-id: F053
title: 查看計分維度設定
feature-id: F053
source-story: US-072
epic: E07
module: M02 計分設定
priority: P0-MVP
version: "1.1"
date: 2026-05-13
status: Draft
---

# F053: 查看計分維度設定

Priority: P0-MVP | Status: Draft | Last Updated: 2026-05-13

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + `data-model.md#e07-data-model` + `error-handling.md#assignment-errors` |
| QA / Tester | 本文件 + `error-handling.md#assignment-errors` |
| UI/UX Designer | 本文件（第 7 節 UI/UX 需求） |
| Architect | 本文件 + `architecture-spec.md` §3.10（AssignmentScoring Service） |

---

## 1. 功能摘要

提供業務主管查看目前生效版本（`ob_levelcard_version` 中 `status = 'active'`）的計分維度清單與各維度詳細分數表。純唯讀查看；寫入操作由 F054 負責。

## 2. 使用者故事

**As a** 業務主管
**I want** 查看目前生效的計分維度設定清單
**So that** 了解系統如何替客戶評分，並評估是否需要調整維度權重或分數

## 3. 前置條件

- 業務主管已登入並持有有效 JWT Token
- `ob_levelcard_version` 至少有一筆 `status = 'active'` 的版本紀錄
- `ob_levelcard_column` 與 `ob_levelcard_score` 已有對應資料

## 4. 驗收標準

### AC-1：顯示當前計分版本的維度清單

- **Given** 業務主管已進入 M02 計分設定頁面
- **When** 頁面載入完成
- **Then** 顯示目前生效版本（`ob_levelcard_version.status = 'active'`）的所有計分維度，每列包含：維度欄位（`column_name`）、維度顯示名稱（`column_label`）、各區間分數設定摘要
- **And** 清單依 `column_name` 升序排列

### AC-2：顯示版本資訊

- **Given** 計分維度清單已顯示
- **When** 業務主管查看頁面頂部
- **Then** 顯示目前生效版本的 `card_type`、`card_name`、`card_version`、`sdate` / `edate`、建立者與建立時間
- **And** `createdBy` / `createdAt` 於 dump 中常為 NULL（OBLEVELCARD_VERSION 6 筆中 4 筆 `A_PRGID` / `A_USERID` / `A_SYSDT` 為 NULL），null 時 UI 顯示為「—」

### AC-3：查看維度詳細分數表

- **Given** 計分維度清單已顯示
- **When** 業務主管點擊某一維度列
- **Then** 展開詳細分數表，顯示各分數區間的條件值（`level1` 類別型 / `level2_s` ~ `level2_e` 數值型）與對應分數（`score`），資料來源 `ob_levelcard_score`

### AC-4：無生效版本的提示

- **Given** `ob_levelcard_version` 無 `status = 'active'` 的版本
- **When** 頁面載入完成
- **Then** 顯示警示：「目前無生效的計分版本，請聯繫 IT 確認設定」

## 5. API 規格

### 5.1 GET /api/v1/assignment/scoring

**Query Parameters**

| 參數 | 型別 | 必填 | 說明 |
|---|---|---|---|
| cardType | string | 否 | 預設查詢所有 active card_type |

**Response — 200 OK**

```json
{
  "version": {
    "cardType": "H",
    "cardName": "期中",
    "cardVersion": 1,
    "sdate": "20190823",
    "edate": "20991231",
    "createdBy": "21251",
    "createdAt": "2019-08-23T00:00:00Z"
  },
  "dimensions": [
    {
      "columnName": "ACCOUNT_AGE",
      "columnLabel": "帳齡",
      "scoreSummary": "4 個區間",
      "scores": [
        { "level1": null, "level2S": "0", "level2E": "3", "score": 10 },
        { "level1": null, "level2S": "4", "level2E": "12", "score": 20 }
      ]
    }
  ]
}
```

**Response 欄位說明**

| 欄位 | 型別 | 說明 |
|------|------|------|
| version.cardType | string | 計分卡類型；OBLEVELCARD_VERSION dump 觀察值為 `H` / `S` / `E` / `S5` / `E5` / `M`（共 6 筆）。注意 OBMLISTDF 另含 `HM` / `M3` / `HC` / `C3` / `HB` / `SEB` / `SEC` 等 CARD_TYPE 但於 OBLEVELCARD_VERSION 缺對應紀錄（屬遷移待補項，由 F056 與 architecture 處理） |
| version.cardName | string | 計分卡名稱（如「期中」/「中結」/「滿期」/「中結5年」/「滿期5年」/「機車」） |
| version.cardVersion | number | 版本號；dump 中所有 CARD_TYPE 均為 `1`（F054 BR-2 規定覆寫式編輯不遞增版本） |
| version.sdate / edate | string | 生效日期區間，格式 `YYYYMMDD` |
| version.createdBy | string \| null | 建立者；對應 `A_USERID`。dump 中 4/6 筆為 NULL；null 時 UI 顯示為「—」 |
| version.createdAt | string \| null | 建立時間，ISO-8601 格式（如 `2019-08-23T00:00:00Z`）。對應 `A_SYSDT`。dump 中 4/6 筆為 NULL；null 時 UI 顯示為「—」 |

**錯誤回應**

| HTTP | 錯誤碼 | 說明 |
|---|---|---|
| 401 | AUTH_TOKEN_MISSING | 未登入 |
| 403 | AUTH_FORBIDDEN | `is_sales_manager` 未啟用 |
| 404 | SCORING_VERSION_NOT_FOUND | 無 active 計分版本 |

## 6. 商業規則

| 規則編號 | 說明 |
|---|---|
| BR-1 | 僅查詢 `ob_levelcard_version.status = 'active'` 的版本 |
| BR-2 | `column_name` 為遷移時修正自原欄位 `COLUNM`（原系統拼字錯誤）；遷移時表名 `OBLEVELCARD_COLUNM` 亦修正為 `ob_levelcard_column` |
| BR-3 | 本頁面為純唯讀，無編輯按鈕；編輯操作由 F054 處理 |

## 7. UI/UX 需求

- 頁面頂部顯示版本卡片（`card_type` / `card_name` / `card_version` / 生效日期區間）
- 維度清單：可展開/收合查看分數詳情
- 無 active 版本：顯示中性提示訊息 + 引導聯絡 IT

## 8. 相依性

- **Blocked By**：F001（登入驗證）
- **Blocks**：F054（編輯計分維度需先了解現有設定）

## 9. 交叉參考

- 資料模型：[data-model.md#e07-data-model](../data-model.md#e07-data-model)（`ob_levelcard_version`、`ob_levelcard_column`、`ob_levelcard_score`）
- 錯誤處理：[error-handling.md#assignment-errors](../error-handling.md#assignment-errors)
- 架構決策：AD-E07-3（複雜計分保留為 PostgreSQL function）
- 相關功能：[F054](F054-edit-scoring-dimension.md)、[F055](F055-edit-card-level-thresholds.md)、[F056](F056-edit-tier-mapping.md)
