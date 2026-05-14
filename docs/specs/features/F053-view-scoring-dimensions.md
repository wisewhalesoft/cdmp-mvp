---
spec-id: F053
title: 查看計分維度設定（M02 Tab 2）
feature-id: F053
source-story: US-072
epic: E07
module: M02 計分設定
priority: P0-MVP
version: "1.2"
date: 2026-05-14
status: Draft
---

# F053: 查看計分維度設定（M02 Tab 2）

Priority: P0-MVP | Status: Draft | Last Updated: 2026-05-14

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + `data-model.md#e07-data-model` + `data-model.md#ob-card-type-entity` + `error-handling.md#assignment-scoring-errors` |
| QA / Tester | 本文件 + `error-handling.md#assignment-scoring-errors` |
| UI/UX Designer | 本文件(第 7 節 UI/UX 需求) |
| Architect | 本文件 + `architecture-spec.md` §3.10(AssignmentScoring Service) |

---

## 1. 功能摘要

提供業務主管查看目前選中 CARD_TYPE(由 F069 Tab 1 維護)之生效計分版本(`ob_levelcard_version` 中 `card_type = :selectedCardType AND status = 'active'`)的計分維度清單與各維度詳細分數表。純唯讀查看;寫入操作由 F054 負責。本功能屬 M02 計分設定 5 Tab 結構中的 Tab 2。

## 2. 使用者故事

**As a** 業務主管
**I want** 查看目前選定計分卡類型(CARD_TYPE)的生效計分維度設定清單
**So that** 了解該計分卡如何替客戶評分，並評估是否需要調整維度權重或分數

## 3. 前置條件

- 業務主管已登入並持有有效 JWT Token
- `is_sales_manager = TRUE`
- F069 Tab 1 已有選中之 CARD_TYPE(cardType 不為空)
- 選中之 CARD_TYPE 於 `ob_card_type` 存在且 `status = 'active'`

## 4. 驗收標準

### AC-1：依選中 CARD_TYPE 顯示計分維度清單

- **Given** 業務主管已在 Tab 1 選中某 CARD_TYPE，並切換至 Tab 2
- **When** Tab 2 載入完成
- **Then** 顯示該 CARD_TYPE 目前生效版本(`ob_levelcard_version` 中 `card_type = :selectedCardType AND status = 'active'`)的所有計分維度，每列包含：維度欄位(`column_name`)、維度顯示名稱(`column_label`)、各區間分數設定摘要
- **And** 清單依 `column_name` 升序排列

### AC-2：顯示版本資訊與 PROD_KIND badge

- **Given** 計分維度清單已顯示
- **When** 業務主管查看 Tab 2 頂部
- **Then** 顯示目前選中 CARD_TYPE 的生效版本資訊：`card_type`、`card_name`、`card_version`、`sdate` / `edate`、`created_by` / `created_at`
- **And** `created_by` / `created_at` 於 dump 中常為 NULL(OBLEVELCARD_VERSION 6 筆中 4 筆 `A_PRGID` / `A_USERID` / `A_SYSDT` 為 NULL)，null 時 UI 顯示為「—」
- **And** 版本資訊旁顯示該 CARD_TYPE 對應的 PROD_KIND badge(後端 join `ob_card_type.prod_kind` 與 `ob_code_df WHERE tbl_id = 'PROD_KIND'` 取得 `tbl_desc1`)

### AC-3：查看維度詳細分數表

- **Given** 計分維度清單已顯示
- **When** 業務主管點擊某一維度列
- **Then** 展開詳細分數表，顯示各分數區間的條件值(`level1` 類別型 / `level2_s` ~ `level2_e` 數值型)與對應分數(`score`)，資料來源 `ob_levelcard_score`

### AC-4：Tab 切換聯動 — 切換 CARD_TYPE 後 Tab 2 自動刷新

- **Given** 業務主管已在 Tab 2 查看某 CARD_TYPE 的計分維度
- **When** 業務主管切換回 Tab 1 選中不同 CARD_TYPE，再切回 Tab 2(或直接於 Tab 1 點擊另一列觸發 Tab 2 reload)
- **Then** Tab 2 自動依新選中 CARD_TYPE 重新載入計分維度清單
- **And** 既有展開的分數詳情收合

### AC-5：選中 CARD_TYPE 無生效版本時的空狀態

- **Given** 選中 CARD_TYPE 於 `ob_levelcard_version` 無 `status = 'active'` 紀錄(如新建 CARD_TYPE 已建立 v1 但尚未有任何維度)
- **When** Tab 2 載入完成
- **Then** 顯示空狀態提示：「目前無計分維度，請點擊『新增維度』開始設定」(不顯示錯誤訊息)

### AC-6：未選中任何 CARD_TYPE 時的提示

- **Given** Tab 1 之 CARD_TYPE 清單為空，或業務主管尚未在 Tab 1 選中任何一筆
- **When** 業務主管切換至 Tab 2
- **Then** 顯示提示：「請先在 Tab 1 選擇計分卡類型以查看設定」
- **And** API 不被呼叫(前端不送出 request)

### AC-7：CARD_TYPE 不存在於 active scope

- **Given** 業務主管送出之 `cardType` query 不存在於 `ob_card_type` 之 active 紀錄(如已被 F072 停用後 race condition)
- **When** 後端查詢
- **Then** 回 404 `CARD_TYPE_NOT_FOUND`

## 5. API 規格

### 5.1 GET /api/v1/assignment/scoring/dimensions

對應 AC-1：依選中 CARD_TYPE 取得計分維度清單與版本資訊。

**Controller 規範**：使用 `SalesManagerGuard` + `@RequireSalesManager()`。

**Query Parameters**

| 參數 | 型別 | 必填 | 說明 |
|---|---|---|---|
| cardType | string | 是 | 由 Tab 1 選中之 CARD_TYPE;後端先驗證該 cardType 存在於 `ob_card_type.status = 'active'`，否則回 404 `CARD_TYPE_NOT_FOUND` |

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
  "prodKind": "01",
  "prodKindName": "汽車",
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
| version.cardType | string | 計分卡類型，與 query 一致 |
| version.cardName | string | 計分卡名稱(dump 觀察值如「期中」/「中結」/「滿期」/「中結5年」/「滿期5年」/「機車」) |
| version.cardVersion | number | 版本號;dump 中所有 CARD_TYPE 均為 `1`(F054 BR-2 規定覆寫式編輯不遞增版本) |
| version.sdate / edate | string | 生效日期區間，格式 `YYYYMMDD` |
| version.createdBy | string \| null | 建立者;對應 `A_USERID`。dump 中 4/6 筆為 NULL;null 時 UI 顯示為「—」 |
| version.createdAt | string \| null | 建立時間，ISO-8601 格式。對應 `A_SYSDT`。dump 中 4/6 筆為 NULL;null 時 UI 顯示為「—」 |
| prodKind | string | 該 CARD_TYPE 綁定之 PROD_KIND(來自 `ob_card_type.prod_kind`) |
| prodKindName | string \| null | PROD_KIND 名稱(後端 join `ob_code_df.tbl_desc1`);若 PROD_KIND 已停用或不存在則為 null |
| dimensions[] | array | 計分維度與分數列表，依 `column_name` 升冪排列 |

**錯誤回應**

| HTTP | 錯誤碼 | 說明 |
|---|---|---|
| 401 | AUTH_TOKEN_MISSING | 未登入 |
| 403 | AUTH_FORBIDDEN | `is_sales_manager` 未啟用 |
| 404 | CARD_TYPE_NOT_FOUND | `cardType` query 不存在於 `ob_card_type` 之 active 紀錄 |
| 404 | SCORING_VERSION_NOT_FOUND | `ob_levelcard_version` 中該 CARD_TYPE 無 `status = 'active'` 紀錄(AC-5 空狀態情境，前端應預先以 cardType 是否新建判斷;如後端回 404 前端轉為空狀態提示) |

## 6. 商業規則

| 規則編號 | 說明 |
|---|---|
| BR-1 | 僅查詢 `ob_levelcard_version.status = 'active'` 且 `card_type = :selectedCardType` 的版本;同 CARD_TYPE 同一時間僅應有一筆 active version(業務不變式由 system-architect 於 data-model 補述) |
| BR-2 | `column_name` 為遷移時修正自原欄位 `COLUNM`(原系統拼字錯誤);遷移時表名 `OBLEVELCARD_COLUNM` 亦修正為 `ob_levelcard_column` |
| BR-3 | 本頁面為純唯讀(Tab 2)，無編輯按鈕;編輯操作由 F054 處理 |
| BR-4 | `cardType` query 必填且必須對應 `ob_card_type.status = 'active'`;否則 404 `CARD_TYPE_NOT_FOUND` |
| BR-5 | `prodKind` / `prodKindName` 由後端 join 取得，前端無需另外呼叫 F068 API |

## 7. UI/UX 需求

- Tab 2 頂部顯示版本資訊卡片(`card_type` / `card_name` / `card_version` / 生效日期區間 / PROD_KIND badge)
- 維度清單：可展開 / 收合查看分數詳情
- 選中 CARD_TYPE 無 active 版本：顯示空狀態提示「目前無計分維度，請點擊『新增維度』開始設定」
- 未選中 CARD_TYPE：顯示提示「請先在 Tab 1 選擇計分卡類型以查看設定」，不呼叫 API
- 切換 CARD_TYPE 時 Tab 2 自動刷新(既有展開狀態收合)

## 8. 相依性

- **Blocked By**：F001(登入驗證)、F068(PROD_KIND 代碼維護就緒)、F069(Tab 1 CARD_TYPE 選中狀態來源)
- **Blocks**：F054(編輯計分維度需先了解現有設定)

## 9. 交叉參考

- 資料模型：[data-model.md#e07-data-model](../data-model.md#e07-data-model)(`ob_levelcard_version`、`ob_levelcard_column`、`ob_levelcard_score`)、[data-model.md#ob-card-type-entity](../data-model.md#ob-card-type-entity)
- 錯誤處理：[error-handling.md#assignment-scoring-errors](../error-handling.md#assignment-scoring-errors)(含 v1.2 新增之 `CARD_TYPE_NOT_FOUND`)
- 架構決策：AD-E07-3(複雜計分保留為 PostgreSQL function)
- 相關功能：[F069](F069-view-card-type-list.md)、[F054](F054-edit-scoring-dimension.md)、[F055](F055-edit-card-level-thresholds.md)、[F056](F056-edit-tier-mapping.md)

## 10. 變更紀錄

| 版本 | 日期 | 變更內容 |
|---|---|---|
| v1.1 | 2026-05-13 | 初版(AC 對齊 OBLEVELCARD_VERSION dump) |
| v1.2 | 2026-05-14 | 補入 CARD_TYPE 篩選聯動(AC-1)、PROD_KIND 提示(AC-2)、Tab 切換 AC-4、空狀態 AC-5/6、404 CARD_TYPE_NOT_FOUND;API path 由 `/api/v1/assignment/scoring` 改為 `/api/v1/assignment/scoring/dimensions`(與 US-072 v2 對齊);`cardType` query 改為必填 |
