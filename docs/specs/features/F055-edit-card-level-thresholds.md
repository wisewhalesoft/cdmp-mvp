---
spec-id: F055
title: 編輯 CARD_LEVEL 分級門檻（M02 Tab 4）
feature-id: F055
source-story: US-074
epic: E07
module: M02 計分設定
priority: P0-MVP
version: "1.4"
date: 2026-05-14
status: Draft
---

# F055: 編輯 CARD_LEVEL 分級門檻（M02 Tab 4）

Priority: P0-MVP | Status: Draft | Last Updated: 2026-05-14

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + `data-model.md#e07-data-model` + `data-model.md#ob-card-type-entity` + `error-handling.md#assignment-scoring-errors` |
| QA / Tester | 本文件 + `error-handling.md#assignment-scoring-errors` |
| UI/UX Designer | 本文件（第 7 節 UI/UX 需求） |
| Architect | 本文件 + `architecture-spec.md` §3.10 |

---

## 1. 功能摘要

提供業務部長針對 Tab 1 選中之 CARD_TYPE，調整 CARD_LEVEL 各等級（A/B/C/D 等）的分數下限門檻（`ob_levelcard_level`）。修改時提供「預估各等級客戶分佈」預覽，並驗證門檻不得重疊。亦支援刪除特定等級（DELETE）以反映業務調整等級結構。所有寫入操作之範圍均限定於 Tab 1 選中之 CARD_TYPE。月跑執行中禁止修改。本功能屬 M02 計分設定 5 Tab 結構中的 Tab 4。

## 2. 使用者故事

**As a** 業務部長
**I want** 調整 CARD_LEVEL 的分級門檻（各等級的分數下限）
**So that** 可根據本月客戶評分分佈，重新劃定等級分界線，確保名單分配比例合理

## 3. 前置條件

- 業務部長已登入並持有有效 JWT Token
- `businessRole='director'`（M02 計分卡寫入限部長，後端套用 `DirectorGuard`，依 F002 §4.6.2）
- F069 Tab 1 已有選中之 CARD_TYPE，且該 CARD_TYPE 於 `ob_card_type.status = 'active'`
- `ob_levelcard_level` 已有對應 `card_type + card_version` 的分級資料（若為剛建立之 CARD_TYPE 可為空，依 AC-1 之空狀態處理）
- `assignment_run` 當下無 `status IN ('pending', 'running')` 的紀錄

## 4. 驗收標準

### AC-1：依選中 CARD_TYPE 顯示 CARD_LEVEL 門檻設定

- **Given** 業務部長已在 Tab 1 選中某 CARD_TYPE，並切換至 Tab 4
- **When** 頁面載入完成
- **Then** 顯示該 CARD_TYPE 之 active 版本各等級的分數區間（`score_s` ~ `score_e`）與等級代碼（`card_level`），表格欄位：等級代碼、等級名稱、分數下限、分數上限
- **And** 不同 CARD_TYPE 的等級數可能不同（OBLEVELCARD_LEVEL dump 中 `S5` 僅 A/B 兩級，其餘 H/S/E/E5/M 為 A/B/C/D 四級），UI 與 API 不可硬編碼 4 級邏輯
- **And** 資料來源：`GET /api/v1/assignment/scoring/card-levels?cardType=:selectedCardType`（詳見 §5.1.1）
- **And** 若 selectedCardType 為空（Tab 1 無選中）則 UI 顯示提示「請先在 Tab 1 選擇計分卡類型以查看設定」，不呼叫 API

### AC-2：修改門檻值並儲存

- **Given** 業務部長進入編輯模式
- **When** 業務部長修改某等級的 `score_s` 或 `score_e`，點擊「儲存」
- **Then** `ob_levelcard_level` 對應列 UPDATE，頁面顯示儲存成功提示
- **And** 若修改後導致等級之間的區間重疊（例如 B 的 `score_s` ≤ A 的 `score_e`），顯示驗證錯誤，不允許儲存
- **And** 寫入 `assignment_audit_log`（`action = 'UPDATE'`）

### AC-3：門檻變更預覽影響

- **Given** 業務部長修改門檻值（尚未儲存）
- **When** 修改完成
- **Then** 頁面顯示預估影響：「預估各等級客戶分佈：A 級 N 人 / B 級 N 人 / C 級 N 人 / D 級 N 人」
- **And** 預覽計算以目前 `ob_pool_data` 套用新門檻（允許最多 1 分鐘的應用層快取）

### AC-4：月跑執行中禁止修改

- **Given** `assignment_run` 有 `status IN ('pending', 'running')` 的紀錄
- **When** 業務部長嘗試進入編輯模式
- **Then** 編輯按鈕 disabled，提示「分派執行中，無法修改 CARD_LEVEL 門檻」
- **And** API 回傳 409 `SCORING_VERSION_LOCKED`

### AC-5：門檻區間不重疊驗證

- **Given** 業務部長修改 B 級 `score_s` 為 65，A 級 `score_e` 為 80
- **When** 業務部長點擊「儲存」
- **Then** 回傳 422 `SCORING_RANGE_OVERLAP`，訊息：「等級 B 下限 65 與等級 A 上限 80 重疊，請調整」

### AC-6：刪除單一 CARD_LEVEL 列

- **Given** 業務部長於 CARD_LEVEL 設定頁面看到某等級列；該等級於 `ob_levelcard_level` 中存在；無月跑鎖
- **When** 業務部長點擊該列的刪除按鈕並於確認對話框點擊「確認刪除」
- **Then** 呼叫 `DELETE /api/v1/assignment/scoring/card-levels`（query: `cardType` + `cardVersion` + `cardLevel`），HTTP 200，DB 中該複合 PK 紀錄被實體刪除（hard delete）
- **And** 寫入 `assignment_audit_log`（`action = 'DELETE'`、`entity_type = 'ob_levelcard_level'`、`entity_id = '{cardType}|{cardVersion}|{cardLevel}'`、`before_value` 含舊 `scoreS` / `scoreE`、`after_value = null`）
- **And** 刪除完成後該等級不再出現於 `GET /scoring/card-levels` 回應

### AC-7：刪除前 cascade 檢查（採方案 A）

- **Given** 業務部長點擊刪除按鈕
- **When** 確認對話框開啟
- **Then** 對話框顯示警告文字：「刪除後此等級不再參與月跑 Stage 2 分級。若 TIER_LEVEL 對應（F056）中仍有此 `(cardType, cardLevel)` 紀錄，將無法刪除。」
- **And** 執行 DELETE 時，後端先檢查 `ob_tier WHERE card_type = :cardType AND card_level = :cardLevel`：
  - 若仍有紀錄存在 → 回 409 `CARD_LEVEL_REFERENCED`，要求業務先於 F056 移除對應後再回來刪除
  - 若無紀錄 → 執行 hard delete

## 5. API 規格

**Controller 規範**（適用於本節所有端點）：GET 端點（5.1.1 / 5.2 preview）使用 `DirectorOrSectionChiefGuard`；寫入端點（5.1 PUT / 5.3 DELETE）使用 `DirectorGuard` + `@RequireDirector()`（依 F002 §4.6.2）。

**CARD_TYPE 範圍鎖**：本節所有端點之 `cardType` 必須對應 `ob_card_type.status = 'active'`，否則回 404 `CARD_TYPE_NOT_FOUND`（v1.4 新增）。

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
| 403 | E07_REQUIRES_DIRECTOR | 寫入端點：`businessRole` 非 `'director'`（`DirectorGuard` 攔截）；GET 端點：`businessRole` 非 `'director'` / `'section_chief'`（`DirectorOrSectionChiefGuard` 攔截，回 `E07_ROLE_NOT_ASSIGNED`）。依 F002 §4.6.2 |
| 404 | CARD_TYPE_NOT_FOUND | `cardType` query 不存在於 `ob_card_type.status = 'active'`（v1.4 新增） |
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
| 403 | E07_REQUIRES_DIRECTOR | 寫入端點：`businessRole` 非 `'director'`（`DirectorGuard` 攔截）；GET 端點：`businessRole` 非 `'director'` / `'section_chief'`（`DirectorOrSectionChiefGuard` 攔截，回 `E07_ROLE_NOT_ASSIGNED`）。依 F002 §4.6.2 |
| 404 | CARD_TYPE_NOT_FOUND | `cardType` query 不存在於 `ob_card_type.status = 'active'`（v1.4 新增；亦適用於 §5.1 PUT 端點 — request body 之 cardType） |
| 409 | SCORING_VERSION_LOCKED | 月跑執行中 |
| 422 | SCORING_RANGE_OVERLAP | 門檻區間重疊 |

### 5.3 DELETE /api/v1/assignment/scoring/card-levels

對應 AC-6 / AC-7：刪除指定 `(cardType, cardVersion, cardLevel)` 的單一等級紀錄。執行前先進行 cascade reference check（見 BR-6）。

**Query Parameters**（皆必填）

| 參數 | 型別 | 必填 | 說明 |
|---|---|---|---|
| cardType | string | 是 | 計分卡類型 |
| cardVersion | number | 是 | 計分版本（必填，避免誤刪 active 版本） |
| cardLevel | string | 是 | 要刪除的等級代碼（VARCHAR(1)） |

**Request Body**：無

**Response — 200 OK**

```json
{
  "cardType": "H",
  "cardVersion": 1,
  "cardLevel": "D",
  "deletedAt": "2026-05-14T08:30:00.000Z"
}
```

**錯誤回應**

| HTTP | 錯誤碼 | 說明 |
|---|---|---|
| 401 | AUTH_TOKEN_MISSING | 未登入 |
| 403 | E07_REQUIRES_DIRECTOR | 寫入端點：`businessRole` 非 `'director'`（`DirectorGuard` 攔截）；GET 端點：`businessRole` 非 `'director'` / `'section_chief'`（`DirectorOrSectionChiefGuard` 攔截，回 `E07_ROLE_NOT_ASSIGNED`）。依 F002 §4.6.2 |
| 404 | CARD_TYPE_NOT_FOUND | `cardType` query 不存在於 `ob_card_type.status = 'active'`（v1.4 新增） |
| 404 | CARD_LEVEL_RECORD_NOT_FOUND | 指定的 `(cardType, cardVersion, cardLevel)` 紀錄不存在於 `ob_levelcard_level` |
| 409 | SCORING_VERSION_LOCKED | 月跑執行中 |
| 409 | CARD_LEVEL_REFERENCED | 仍被 `ob_tier` 引用，禁止刪除（cascade reference check 失敗，見 BR-6） |

## 6. 商業規則

| 規則編號 | 說明 |
|---|---|
| BR-1 | 門檻區間不得重疊；相鄰等級的 `score_e + 1 = 下一級 score_s` 允許 |
| BR-2 | 預覽計算允許應用層快取 60 秒 |
| BR-3 | 月跑鎖定：`assignment_run.status IN ('pending', 'running')` 時禁止修改 |
| BR-4 | `ob_levelcard_version.status` 欄位於遷移時補建（原 OBLEVELCARD_VERSION 無此欄位），初值由 `(SDATE <= 今日 < EDATE)` 計算；本功能仍以 `status = 'active'` 判斷 active 計分版本 |
| BR-5 | **hard delete 決策**：DELETE 採 hard delete（`ob_levelcard_level` 表無 status 欄位；與 F054 軟刪除 `ob_levelcard_column` 的設計刻意不同，理由：等級結構為「業務分級設計」而非「啟用狀態」，被刪除的等級應從歷史結構中移除，歷史追溯依賴月跑 snapshot F066） |
| BR-6 | **cascade reference check**：刪除前必須先檢查 `ob_tier WHERE card_type = :cardType AND card_level = :cardLevel`，若存在紀錄則回 409 `CARD_LEVEL_REFERENCED`，業務需先於 F056 移除對應後才能刪除 |
| BR-7 | **CARD_TYPE 範圍鎖**（v1.4 新增）：所有寫入操作之 `cardType` 必須對應 `ob_card_type.status = 'active'`；違反回 404 `CARD_TYPE_NOT_FOUND`；前端 Tab 4 操作以 Tab 1 selectedCardType 為唯一資料範圍，跨 CARD_TYPE 寫入不開放 |

## 7. UI/UX 需求

- 等級門檻表格：inline edit 或 Modal 編輯
- 預覽影響區：以即時查詢或 debounce 300ms 顯示更新後分佈
- 錯誤提示：直接於有問題的等級列顯示紅色邊框 + 錯誤訊息
- 等級列右側操作區新增「刪除」icon 按鈕（`trash-2` lucide icon，紅色 hover：`hover:text-danger hover:bg-red-50`），與 F056 TIER_LEVEL 對應表的刪除樣式一致
- 點擊刪除按鈕觸發確認對話框（標題：「刪除 CARD_LEVEL 等級」、body：等級代碼 + AC-7 警告文字）
- 月跑鎖定時刪除按鈕 disabled
- **prototype 28 註記**：原 prototype L1145-1151 僅繪 `check` icon（單列儲存）；trash 按鈕為 v1.3 本次新增，後續若 prototype 重繪須同步更新

## 8. 相依性

- **Blocked By**：F053（需先了解計分版本結構）、F069（Tab 1 CARD_TYPE 選中狀態來源）
- **Blocks**：F056（TIER_LEVEL 對應依賴 CARD_LEVEL 定義；刪除 cardLevel 前須確認 F056 `ob_tier` 對應已清空 — BR-6 cascade check）、F061（月跑 Stage 2 等級劃分）

## 9. 交叉參考

- 資料模型：[data-model.md#e07-data-model](../data-model.md#e07-data-model)（`ob_levelcard_level`）、[data-model.md#ob-card-type-entity](../data-model.md#ob-card-type-entity)
- 錯誤處理：[error-handling.md#assignment-scoring-errors](../error-handling.md#assignment-scoring-errors)（含 v1.3 新增的 `CARD_LEVEL_RECORD_NOT_FOUND`（404）、`CARD_LEVEL_REFERENCED`（409）；v1.4 引用 `CARD_TYPE_NOT_FOUND`（404））
- 架構決策：AD-E07-3
- 相關功能：[F053](F053-view-scoring-dimensions.md)、[F054](F054-edit-scoring-dimension.md)（軟刪除維度，作為刪除設計對照）、[F056](F056-edit-tier-mapping.md)、[F061](F061-trigger-assignment-run.md)、[F069](F069-view-card-type-list.md)、[F070](F070-create-card-type.md)

## 10. 變更紀錄

| 版本 | 日期 | 變更內容 |
|---|---|---|
| v1.1 | 2026-05-13 | 初版（依 dump 觀察 5/6 CARD_TYPE 4 級 / S5 2 級，禁止前端硬編碼） |
| v1.2 | 2026-05-13 | 補 GET 5.1.1 端點供頁面載入 |
| v1.3 | 2026-05-14 | 新增 DELETE 端點 + cascade reference check + AC-6/7 |
| v1.4 | 2026-05-14 | CARD_TYPE 範圍鎖（BR-7）；AC-1 改為依 selectedCardType 顯示；所有端點補 404 CARD_TYPE_NOT_FOUND；Controller 規範註記；相依性補 F069 |

## 11. 假設

| # | 假設 | 標記 |
|---|---|---|
| A-1 | DELETE 採 hard delete 設計（`ob_levelcard_level` 無 status 欄位），歷史結構追溯依賴月跑 snapshot F066 | ✅ Decided（PO 2026-05-14） |
| A-2 | AC-6 / AC-7 cascade 行為採方案 A（reference check 阻擋刪除）為 PO 決策；歷史追溯依賴 F066 snapshot；未採方案 B（cascade 連動刪除 `ob_tier` 對應）以避免跨表副作用 | ✅ Decided（PO 2026-05-14） |
