---
spec-id: F054
title: 編輯計分維度與分數（M02 Tab 2 寫入）
feature-id: F054
source-story: US-073
epic: E07
module: M02 計分設定
priority: P0-MVP
version: "1.3"
date: 2026-05-18
status: Draft
---

# F054: 編輯計分維度與分數（M02 Tab 2 寫入）

Priority: P0-MVP | Status: Draft | Last Updated: 2026-05-18

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + `data-model.md#e07-data-model` + `data-model.md#ob-card-type-entity` + `error-handling.md#assignment-scoring-errors` |
| QA / Tester | 本文件 + `error-handling.md#assignment-scoring-errors` |
| UI/UX Designer | 本文件（第 7 節 UI/UX 需求） |
| Architect | 本文件 + `architecture-spec.md` §3.10 |

---

## 1. 功能摘要

提供業務部長針對「Tab 1 選中之 CARD_TYPE」新增、修改、停用計分維度，以及調整各維度的分數區間設定（`ob_levelcard_column` / `ob_levelcard_score`）。採覆寫式儲存（無草稿版本分岔）；月名單分派執行中禁止修改。歷史追溯透過每次月名單分派自動產生的 config 快照（F066）查詢。所有寫入操作之範圍均嚴格限定於 Tab 1 選中之 CARD_TYPE，跨 CARD_TYPE 寫入請求一律拒絕。

每個維度具備明確之 `match_type`（`RANGE` / `CATEGORY` / `COMPOSITE`）以決定分數區間之比對邏輯；切換 `match_type` 時 service 層自動偵測差異並清空既有 `ob_levelcard_score` 列，避免新舊欄位語意衝突。

## 2. 使用者故事

**As a** 業務部長
**I want** 新增、修改或停用計分維度，以及調整各維度的分數區間設定
**So that** 可在不依賴 IT 的情況下，根據當月業務策略靈活調整客戶評分邏輯

## 3. 前置條件

- 業務部長已登入並持有有效 JWT Token
- `businessRole='director'`（M02 計分卡寫入限部長，後端套用 `DirectorGuard`，依 F002 §4.6.2）
- F069 Tab 1 已有選中之 CARD_TYPE，且該 CARD_TYPE 於 `ob_card_type.status = 'active'`
- 該 CARD_TYPE 於 `ob_levelcard_version` 至少有一筆 `status = 'active'` 的版本紀錄（由 F070 新增 CARD_TYPE 時自動建立）
- `assignment_run` 當下無 `status IN ('pending', 'running')` 的紀錄

## 4. 驗收標準

### AC-1：依選中 CARD_TYPE 查看並直接編輯現行計分維度清單

- **Given** 業務部長已在 Tab 1 選中某 CARD_TYPE，進入 M02 Tab 2 編輯模式
- **When** 頁面載入完成
- **Then** 顯示該 CARD_TYPE 目前生效版本的所有計分維度清單（`ob_levelcard_column WHERE card_type = :selectedCardType AND status = 'active'`），可直接點擊進入編輯模式
- **And** 頁面顯示「現行設定」單一視圖，不存在草稿版本或版本切換選單
- **And** 所有寫入操作（新增 / 修改 / 停用）之範圍嚴格限定於 Tab 1 選中之 CARD_TYPE

### AC-1b：歷史殘留 `ALL_SCORES_EMPTY` 防護網（v1.3 新增）

> **定位**：本 AC 為「歷史殘留資料防護網」，與 F061 §AC-7c 寫入端 BR-13 soft check 邏輯重複但時點不同。F061 阻擋新資料污染，F054 AC-1b 對既有資料於進入編輯時做提示。兩者擇一即可救回，但同時存在可降低操作失誤機率。

- **Given** 某維度在 `ob_levelcard_column.status='active'` 但 `ob_levelcard_score` 為空（歷史殘留 / 已修復前的遺留資料）
- **When** 編輯頁面載入該維度
- **Then** 頁面該維度區塊顯示醒目提示「此維度尚未設定任何分數區間，月名單分派將無法計分」
- **And** 提供「立即補設分數」入口，引導部長進入該維度的編輯流程
- **And** 不阻擋編輯（業務部長可選擇先停用該維度或補設分數）

### AC-2：修改維度分數區間並即時儲存

- **Given** 業務部長修改某維度的分數區間（新增區間、調整條件值或分數）
- **When** 業務部長點擊「儲存」
- **Then** 修改直接寫入生效設定（`ob_levelcard_score` 對應列 UPDATE；新增區間則 INSERT），無草稿暫存流程
- **And** 頁面顯示儲存成功 toast
- **And** 寫入 `assignment_audit_log`（`action = 'UPDATE'`, `before_value` + `after_value` JSONB）

### AC-2b：切換 `match_type` 自動清空既有 scores（v1.3 新增）

- **Given** 某維度原 `match_type` 為 X（如 `RANGE`），業務部長透過 PUT API 將 `match_type` 修改為 Y（如 `CATEGORY` 或 `COMPOSITE`）
- **When** Service 層處理請求並偵測 `match_type` 差異
- **Then** Service 層**自動**刪除該 `column_name` 在 `ob_levelcard_score` 之所有既有列（DELETE WHERE card_type=:ct AND card_version=:cv AND column_name=:cn）
- **And** 依新 `match_type` 寫入 request 中之 scores（若 request 未提供 scores 或為空陣列，則該維度將進入 AC-1b 之 `ALL_SCORES_EMPTY` 狀態）
- **And** Audit log 寫入 `action='UPDATE'`，`before_value` 包含舊 match_type 與舊 scores、`after_value` 包含新 match_type 與新 scores
- **And** 前端**不需**傳遞 `forceResetScores` flag；行為由 service 層自動判定（v1.3 設計決策）

### AC-3：新增維度直接生效（範圍限定選中 CARD_TYPE）

- **Given** 業務部長點擊「新增維度」，填入 `column_name` / `column_label` / `match_type` / 分數區間
- **When** 業務部長點擊「確認新增」
- **Then** 新維度寫入 `ob_levelcard_column`，`card_type` 自動帶入 Tab 1 選中之 CARD_TYPE，`card_version` 帶入該 CARD_TYPE 之 active version；對應區間寫入 `ob_levelcard_score`
- **And** 新維度立即出現於現行設定清單中
- **And** 寫入 `assignment_audit_log`（`action = 'CREATE'`）
- **And** Request body 中之 `cardType` 必須與 URL / context 提供之 selectedCardType 一致，否則 422 `VALIDATION_ERROR`
- **And** Request body 中之 `matchType` 為必填欄位（v1.3 新增，BR-8），缺值或非合法列舉值（`RANGE` / `CATEGORY` / `COMPOSITE`）回 422 `VALIDATION_ERROR`

### AC-4：停用維度（Soft Delete）

- **Given** 業務部長點擊某維度的「停用」按鈕並確認
- **When** 後端處理停用請求
- **Then** 該維度於 `ob_levelcard_column.status` 欄位標記為 `'inactive'`（soft delete 機制；欄位定義由 migration `1711360000143-AddObLevelcardColumnStatus.ts` 補建，VARCHAR(10) NOT NULL DEFAULT 'active'）
- **And** 不刪除既有資料；後續月名單分派 Stage 2 透過 `fn_calc_tier_level` 依 `status = 'active'` 過濾，停用維度不再參與計分
- **And** 寫入 `assignment_audit_log`（`action = 'DISABLE'`）

### AC-5：月名單分派執行中禁止修改（資料鎖）

- **Given** `assignment_run` 有 `status IN ('pending', 'running')` 的紀錄
- **When** 業務部長嘗試進入計分設定編輯模式
- **Then** 編輯功能全部停用，頁面顯示「分派執行中，無法修改計分設定」提示
- **And** API 呼叫回傳 409 `SCORING_VERSION_LOCKED`

### AC-6：分數區間重疊驗證（依 match_type 分流）

- **Given** 業務部長新增或修改某維度之分數區間
- **When** 後端依該維度之 `match_type` 執行驗證
- **Then** 套用以下規則：
  - `match_type = 'RANGE'`：兩筆 score 列之 `[level2_s, level2_e]` 區間交集不為空 → 422 `SCORING_RANGE_OVERLAP`
  - `match_type = 'CATEGORY'`：同一 `column_name` 在 active 版本下，相同 `level1`（經 BR-9 規一化後比對）只允許一筆 score 列 → 422 `SCORING_CATEGORY_DUPLICATE`（v1.3 新增錯誤碼）
  - `match_type = 'COMPOSITE'`：(`level1` 經 BR-9 規一化後, `level2_s`, `level2_e`) 三元組於同 column_name 下需唯一，且 `level2_s` ~ `level2_e` 區間不可重疊（同一 level1 內套用 RANGE 規則）→ 422 `SCORING_RANGE_OVERLAP` 或 `SCORING_CATEGORY_DUPLICATE`

### AC-7：CARD_TYPE 不存在或非 active

- **Given** Request body / query 之 `cardType` 不存在於 `ob_card_type.status = 'active'`
- **When** 後端驗證
- **Then** 所有寫入端點（PUT 5.1 / POST 5.2 / PUT 5.3）回 404 `CARD_TYPE_NOT_FOUND`
- **And** 與 AC-3 對應的 cross-CARD_TYPE 寫入禁止規則一同保護資料一致性

## 5. API 規格

**Controller 規範**（適用於本節所有寫入端點）：使用 `DirectorGuard` + `@RequireDirector()`（依 F002 §4.6.2，M02 計分卡寫入為部長專屬）。

**通用欄位語意（v1.3 新增）**：所有寫入端點對 `level1` 欄位之處理依 BR-9（§6）規一化規則：
- API 接收 `''` 一律轉為 NULL 寫入
- API 接收尾隨 / 前導空白之 `level1`（如 SQL Server CHAR(10) padding 殘留 `"A         "`），寫入前須 TRIM
- 比對與唯一性判斷時 NULL 與 '' 視為等價

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
      "matchType": "RANGE",
      "scores": [
        { "level1": null, "level2S": "0", "level2E": "3", "score": 10 },
        { "level1": null, "level2S": "4", "level2E": "12", "score": 20 }
      ]
    },
    {
      "columnName": "REGION",
      "columnLabel": "區域",
      "matchType": "CATEGORY",
      "scores": [
        { "level1": "NORTH", "level2S": null, "level2E": null, "score": 30 },
        { "level1": "SOUTH", "level2S": null, "level2E": null, "score": 20 }
      ]
    },
    {
      "columnName": "PROJECT_TP",
      "columnLabel": "案件類型",
      "matchType": "COMPOSITE",
      "scores": [
        { "level1": "A", "level2S": "0", "level2E": "5", "score": 50 },
        { "level1": "A", "level2S": "6", "level2E": "99", "score": 30 },
        { "level1": "B", "level2S": "0", "level2E": "5", "score": 40 }
      ]
    }
  ]
}
```

**欄位規則**

| 欄位 | 必填 | v1.3 變更 | 說明 |
|---|---|---|---|
| `dimensions[].matchType` | **是** | v1.3 新增為必填 | 列舉值 `RANGE` / `CATEGORY` / `COMPOSITE`；無預設值；缺值或非法值 → 422 `VALIDATION_ERROR` |
| `scores[].level1` | 視 `matchType` | v1.3 補 BR-9 規一化 | RANGE 必為 NULL；CATEGORY / COMPOSITE 必為非空字串；`''` 一律轉 NULL；接收值前後 TRIM |
| `scores[].level2S` / `level2E` | 視 `matchType` | — | RANGE / COMPOSITE 必填；CATEGORY 必為 NULL |

**Match Type 切換行為（v1.3 新增）**：若 request 中某 `columnName` 之 `matchType` 與 DB 既有值不同，service 層**自動**清空該 column_name 之既有 `ob_levelcard_score` 列後再依新 matchType 寫入。詳見 AC-2b。

**Response — 200 OK**

```json
{
  "cardType": "01",
  "cardVersion": 3,
  "updatedDimensions": 3,
  "updatedScores": 7,
  "matchTypeChanged": ["PROJECT_TP"]
}
```

> `matchTypeChanged` 欄位列出本次因 match_type 切換而被自動清空 scores 之 column_name 清單（供前端 toast 提示用）。

### 5.2 POST /api/v1/assignment/scoring/dimensions（新增維度）

**Request Body**

```json
{
  "cardType": "01",
  "cardVersion": 3,
  "columnName": "CONTRACT_YEARS",
  "columnLabel": "契約年資",
  "matchType": "RANGE",
  "scores": [
    { "level1": null, "level2S": "0", "level2E": "5", "score": 5 },
    { "level1": null, "level2S": "6", "level2E": "99", "score": 15 }
  ]
}
```

**Response — 201 Created**：新增維度資訊。

**錯誤回應**

| HTTP | 錯誤碼 | 說明 |
|---|---|---|
| 401 | AUTH_TOKEN_MISSING | 未登入 |
| 403 | E07_REQUIRES_DIRECTOR | `businessRole` 非 `'director'`（`DirectorGuard` 攔截，依 F002 §4.6.2） |
| 409 | SCORING_VERSION_LOCKED | 月名單分派執行中禁止修改 |
| 422 | SCORING_COLUMN_DUPLICATE | `column_name` 已存在於 active 版本 |
| 422 | SCORING_RANGE_OVERLAP | 分數區間重疊（RANGE / COMPOSITE 同 level1 內） |
| 422 | SCORING_CATEGORY_DUPLICATE | CATEGORY / COMPOSITE 模式同 column_name + 相同 level1（經 BR-9 規一化後）出現多筆 score 列（v1.3 新增） |
| 404 | CARD_TYPE_NOT_FOUND | request 之 `cardType` 不存在於 `ob_card_type.status = 'active'`（v1.2 新增） |
| 422 | VALIDATION_ERROR | 欄位驗證失敗（含 request body `cardType` 與 selectedCardType 不一致、`matchType` 缺值或非法值 — v1.3 含 matchType 必填驗證） |

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
| 403 | E07_REQUIRES_DIRECTOR | `businessRole` 非 `'director'`（`DirectorGuard` 攔截，依 F002 §4.6.2） |
| 404 | SCORING_COLUMN_NOT_FOUND | 指定的 `cardType + columnName` 不存在或已停用 |
| 404 | CARD_TYPE_NOT_FOUND | `cardType` query 不存在於 `ob_card_type.status = 'active'`（v1.2 新增） |
| 409 | SCORING_VERSION_LOCKED | 月名單分派執行中禁止修改 |

## 6. 商業規則

| 規則編號 | 說明 |
|---|---|
| BR-1 | 覆寫式編輯：無草稿版本、無 rollback；歷史追溯透過月名單分派自動產生的 `config` 快照（F066） |
| BR-2 | `card_version` 寫入規則：覆寫式修改不遞增 `card_version`（OBLEVELCARD_VERSION dump 中 6 種 CARD_TYPE — H/S/E/S5/E5/M — 全部為 v1 為證）；新版本另行建立 `ob_levelcard_version` 紀錄屬未來範疇，本次不支援 |
| BR-3 | 分數區間不可重疊；依 `match_type` 分流驗證（RANGE `[level2_s, level2_e]` 不重疊；CATEGORY 同 level1 唯一；COMPOSITE 同 level1 內 RANGE 規則 + (`level1`, `level2_s`, `level2_e`) 三元組唯一） |
| BR-4 | 月名單分派鎖：`assignment_run.status IN ('pending', 'running')` 時 API 直接回傳 409 |
| BR-5 | 複雜計分邏輯（TIER_LEVEL 對應計算）由 PostgreSQL function 實作（AD-E07-3） |
| BR-6 | `ob_levelcard_version.status` 欄位於遷移時補建（原 OBLEVELCARD_VERSION 無此欄位），初值由 `(SDATE <= 今日 < EDATE)` 計算；本功能仍以 `status = 'active'` 判斷 active 計分版本 |
| BR-7 | **CARD_TYPE 範圍鎖**（v1.2 新增）：所有寫入操作之 `cardType` 必須對應 `ob_card_type.status = 'active'`；request body 中之 `cardType` 必須與 Tab 1 selectedCardType 一致；跨 CARD_TYPE 寫入請求一律拒絕（422 `CARD_TYPE_NOT_FOUND` 或 `VALIDATION_ERROR`） |
| BR-8 | **`match_type` 必填且明確**（v1.3 新增）：寫入 API 必須提供 `matchType`，列舉值為 `RANGE` / `CATEGORY` / `COMPOSITE`，**無預設值**。缺值或非法值 → 422 `VALIDATION_ERROR`。Match type 變更時 service 層自動清空既有 scores（AC-2b），前端**不需**傳遞 `forceResetScores` flag |
| BR-9 | **`level1` NULL / 空字串 / 空白規一化**（v1.3 新增）：<br>(1) API 接收空字串 `''` 一律轉為 NULL 寫入<br>(2) API 接收尾隨 / 前導空白之 `level1`（如 `"A         "` SQL Server CHAR(10) padding 殘留），寫入前須 TRIM<br>(3) 比對與唯一性判斷時 NULL 與 '' 等價（即經規一化後同值）<br>(4) ETL 從舊 OB DB 載入 `OBLEVELCARD_SCORE` 至 `ob_levelcard_score` 時，亦須對 `level1` 執行 RTRIM 以清除 SQL Server CHAR padding 殘留<br>**範圍邊界**：本規則之 (4) 屬 ETL 載入行為，由 system-architect 同步至 architecture-spec.md §E07-C ETL 設計；本 spec 僅規範 API 層行為 |

## 7. UI/UX 需求

- 現行設定視圖：可直接編輯（inline edit 或 Modal）
- 新增維度：開啟 Modal 表單，含 `match_type` 必選下拉（無預設值）；選定後 scores 編輯區依 match_type 動態顯示 level1 / level2_s / level2_e 欄位
- 切換 match_type：UI 應於使用者於編輯介面改變 match_type 時，顯示「儲存後將清空既有分數區間」提示，提醒使用者影響範圍（行為由 service 層自動執行，無需前端 flag）
- 停用維度：Modal 確認對話框
- 月名單分派鎖定時：編輯 / 新增 / 停用按鈕全部 disabled
- 歷史殘留 `ALL_SCORES_EMPTY`：見 AC-1b，於該維度區塊顯示醒目提示

## 8. 相依性

- **Blocked By**：F053（需先查看現有設定）、F069（Tab 1 CARD_TYPE 選中狀態來源）、F070（新建 CARD_TYPE 後才能編輯其維度）
- **Blocks**：F061（月名單分派 Stage 2 計分邏輯使用此設定）

## 9. 交叉參考

- 資料模型：[data-model.md#e07-data-model](../data-model.md#e07-data-model)（`ob_levelcard_version`、`ob_levelcard_column`、`ob_levelcard_score`）、[data-model.md#ob-card-type-entity](../data-model.md#ob-card-type-entity)
  - **待 system-architect 同步（v1.3）**：`ob_levelcard_column.match_type` 欄位為 NOT NULL VARCHAR(20)，列舉值 `RANGE` / `CATEGORY` / `COMPOSITE`；既有 PROJECT_TP 資料已是 COMPOSITE 結構（三欄齊備）無需 migration backfill，但 backfill 既有非 PROJECT_TP 維度之 match_type 預設值（依 `level1` / `level2_s` 是否為 NULL 推導）需於 migration 處理
- 錯誤處理：[error-handling.md#assignment-scoring-errors](../error-handling.md#assignment-scoring-errors)
  - **待 system-architect 同步（v1.3）**：新增錯誤碼 `SCORING_CATEGORY_DUPLICATE`（422，CATEGORY / COMPOSITE 模式同 level1 出現多筆 score 列）
- 架構決策：AD-E07-3（PostgreSQL function）
  - **待 system-architect 同步（v1.3）**：ETL 載入 `OBLEVELCARD_SCORE` 時對 `level1` 執行 RTRIM 之規則須補入 architecture-spec.md §E07-C
- 相關功能：[F053](F053-view-scoring-dimensions.md)、[F055](F055-edit-card-level-thresholds.md)、[F056](F056-edit-tier-mapping.md)、[F061](F061-trigger-assignment-run.md)、[F066](F066-view-run-snapshot-detail.md)、[F069](F069-view-card-type-list.md)、[F070](F070-create-card-type.md)

## 10. 變更紀錄

| 版本 | 日期 | 變更內容 |
|---|---|---|
| v1.1 | 2026-05-13 | 初版（覆寫式編輯、軟刪除 `ob_levelcard_column.status`、OBLEVELCARD_VERSION dump 驗證） |
| v1.2 | 2026-05-14 | 補入 CARD_TYPE 範圍鎖（BR-7）、AC-1 / AC-3 改為 selectedCardType 為範圍、新增 AC-7、各端點補 422/404 `CARD_TYPE_NOT_FOUND`、Controller 規範註記、相依性補 F069 / F070 |
| v1.3 | 2026-05-18 | （1）新增 BR-8 `match_type` 必填且明確、無預設值；切換 match_type 由 service 層自動清空 scores（AC-2b），前端不需 `forceResetScores` flag。（2）AC-6 重構為依 match_type 分流驗證（RANGE / CATEGORY / COMPOSITE 各自規則），CATEGORY / COMPOSITE 同 level1 唯一性新增錯誤碼 `SCORING_CATEGORY_DUPLICATE`。（3）AC-3 / 5.1 / 5.2 API 補 `matchType` 必填欄位。（4）新增 AC-1b 歷史殘留 `ALL_SCORES_EMPTY` 防護網（與 F061 BR-13 寫入端 soft check 互為時點互補）。（5）新增 BR-9 `level1` NULL / 空字串 / 空白規一化規則（API '' → NULL、TRIM 前後空白、比對等價、ETL RTRIM）；既有 PROJECT_TP COMPOSITE 資料無需 backfill。（6）§9 註記待 system-architect 同步 data-model.md / error-handling.md / architecture-spec.md 之項目。 |

## 11. 假設

本版本無未解決假設：

- 原 A-1（`ob_levelcard_column.status` 欄位）已由 migration `1711360000143-AddObLevelcardColumnStatus.ts` 落實，見 AC-4
- 原 A-2（覆寫式修改不遞增 `card_version`）已由 OBLEVELCARD_VERSION dump（6 種 CARD_TYPE 均為 v1）證實，見 BR-2
- **v1.3 新增驗證**：實際查驗 `reference/DumpData/OBLEVELCARD_SCORE_20260505.csv`，PROJECT_TP 既有資料已是 COMPOSITE 結構（三欄齊備）無需 migration backfill；但 level1 帶尾隨空白（SQL Server CHAR(10) padding，例 `"A         "`），ETL 載入時須執行 TRIM（BR-9）
