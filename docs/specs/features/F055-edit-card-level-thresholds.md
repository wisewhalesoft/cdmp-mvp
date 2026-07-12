---
spec-id: F055
title: 編輯 CARD_LEVEL 分級門檻（M02 Tab 4）
feature-id: F055
source-story: US-074, US-174
epic: E07
module: M02 計分設定
priority: P0-MVP
version: "1.8"
date: 2026-07-12
status: Draft
---

# F055: 編輯 CARD_LEVEL 分級門檻（M02 Tab 4）

Priority: P0-MVP | Status: Draft | Last Updated: 2026-07-12

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + `data-model.md#e07-data-model` + `data-model.md#ob-card-type-entity` + `error-handling.md#assignment-scoring-errors` |
| QA / Tester | 本文件 + `error-handling.md#assignment-scoring-errors` |
| UI/UX Designer | 本文件（第 7 節 UI/UX 需求） |
| Architect | 本文件 + `architecture-spec.md` §3.10 + AD-E07-45 v1.2（抽樣估算 + 分數直方圖 + 前端分桶，撰寫中） |

---

## 1. 功能摘要

提供業務部長針對 Tab 1 選中之 CARD_TYPE，調整 CARD_LEVEL 各等級（A/B/C/D 等）的分數下限門檻（`ob_levelcard_level`）。修改時提供「預估各等級客戶分佈」預覽，並驗證門檻不得重疊。亦支援刪除特定等級（DELETE）以反映業務調整等級結構。所有寫入操作之範圍均限定於 Tab 1 選中之 CARD_TYPE。月名單分派執行中禁止修改。本功能屬 M02 計分設定 5 Tab 結構中的 Tab 4。

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

### AC-3：門檻變更預覽影響（v1.8 直方圖 + 前端分桶 / US-174 / AD-E07-45 v1.2）

- **Given** 業務部長修改門檻值（尚未儲存）
- **When** 修改完成
- **Then** 頁面顯示預估影響：「預估各等級客戶分佈：A 級 約 N 人 / B 級 約 N 人 / …」，等級數依 CARD_TYPE 動態決定（不硬編碼 4 級）
- **And** 預覽計算改採**抽樣估算之分數直方圖（score histogram）+ 前端分桶**（AD-E07-45 v1.2 抽樣估算）：後端 §5.2 對選中 CARD_TYPE 之 `ob_pool_data` 取**固定筆數之隨機樣本**，計算並回傳**與門檻 / 等級無關**之分數直方圖 `histogram: [{score, count}]`（對樣本一次掃描即得）；前端**每個 cardType 僅取一次直方圖並快取**，之後依當前草稿門檻於**前端即時分桶（client-side bucketing）**算各等級樣本數並依 `totalCount / sampleSize` 放大推算至母體 — **門檻編輯不再回打後端**（取代 v1.7「每次門檻變更呼叫後端重算」與 v1.6 全量即時計分；後者於生產環境 CARD_TYPE=E 實測達 224.6 秒逾時，見 §11 A-3）
- **And** 樣本筆數為**固定值**（非依當下母體筆數動態變動），實際數值由 AD-E07-45 依統計精度與效能權衡決定，本 spec 不指定數值
- **And** 直方圖須採**可重現（repeatable）種子**：相同 CARD_TYPE + `ob_pool_data` 未變動時，多次呼叫回傳之直方圖必須完全一致（直方圖與門檻無關，故門檻編輯不影響其內容）；前端分桶結果僅在草稿門檻值或（重新取得之）直方圖變動時才改變
- **And** **效能**：後端直方圖掃描為 **每 cardType 一次、約 12 秒（heavy card；取代 224.6 秒全量計分）**，取得後快取；**門檻編輯之前端重新分桶為即時（次秒級 / instant，不再打後端）** — 見 BR-2 / §11 A-3
- **And** 估算結果須明確標示為約略值（UI 呈現見 §7），不得呈現為精確全量計數
- **And** 沿用 CARD_TYPE 範圍鎖（BR-7）：估算與直方圖僅套用 Tab 1 選中之 CARD_TYPE

### AC-4：月名單分派執行中禁止修改

- **Given** `assignment_run` 有 `status IN ('pending', 'running')` 的紀錄
- **When** 業務部長嘗試進入編輯模式
- **Then** 編輯按鈕 disabled，提示「分派執行中，無法修改 CARD_LEVEL 門檻」
- **And** API 回傳 409 `SCORING_VERSION_LOCKED`

### AC-5：門檻區間不重疊驗證

- **Given** 業務部長修改 B 級 `score_s` 為 65，A 級 `score_e` 為 80
- **When** 業務部長點擊「儲存」
- **Then** 回傳 422 `SCORING_RANGE_OVERLAP`，訊息：「等級 B 下限 65 與等級 A 上限 80 重疊，請調整」

### AC-6：刪除單一 CARD_LEVEL 列

- **Given** 業務部長於 CARD_LEVEL 設定頁面看到某等級列；該等級於 `ob_levelcard_level` 中存在；無月名單分派鎖
- **When** 業務部長點擊該列的刪除按鈕並於確認對話框點擊「確認刪除」
- **Then** 呼叫 `DELETE /api/v1/assignment/scoring/card-levels`（query: `cardType` + `cardVersion` + `cardLevel`），HTTP 200，DB 中該複合 PK 紀錄被實體刪除（hard delete）
- **And** 寫入 `assignment_audit_log`（`action = 'DELETE'`、`entity_type = 'ob_levelcard_level'`、`entity_id = '{cardType}|{cardVersion}|{cardLevel}'`、`before_value` 含舊 `scoreS` / `scoreE`、`after_value = null`）
- **And** 刪除完成後該等級不再出現於 `GET /scoring/card-levels` 回應

### AC-7：刪除前 cascade 檢查（採方案 A）

- **Given** 業務部長點擊刪除按鈕
- **When** 確認對話框開啟
- **Then** 對話框顯示警告文字：「刪除後此等級不再參與月名單分派 Stage 2 分級。若 TIER_LEVEL 對應（F056）中仍有此 `(cardType, cardLevel)` 紀錄，將無法刪除。」
- **And** 執行 DELETE 時，後端先檢查 `ob_tier WHERE card_type = :cardType AND card_level = :cardLevel`：
  - 若仍有紀錄存在 → 回 409 `CARD_LEVEL_REFERENCED`，要求業務先於 F056 移除對應後再回來刪除
  - 若無紀錄 → 執行 hard delete

### AC-8：預覽估算失敗時顯示錯誤狀態（v1.7 新增 / v1.8 直方圖取得 / US-174 AC-4）

- **Given** 「預估各等級客戶分佈」之直方圖 API（§5.2，每 cardType 一次）呼叫失敗（逾時、5xx、網路錯誤等任何原因）
- **When** 前端接收失敗結果
- **Then** 面板**不得直接變回空白**，須顯示明確的錯誤 / 無法載入狀態（如「預估分佈暫時無法取得，請稍後再試」）並提供可重試操作（重新整理按鈕或自動重試）
- **And** 面板須具三態且視覺可清楚區分：載入中（直方圖掃描約 12 秒）/ 已顯示估算（直方圖已快取、門檻編輯即時分桶）/ 錯誤重試
- **And** 修正生產環境現行前端靜默吞噬錯誤（`scoring-config-page.tsx` 之 `catch { setPreview(null) }`）而不告知使用者、直接呈現空白面板之缺陷

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
| levels | JSON | 否（**v1.8 由必填改選填**） | 試算用新門檻陣列的 JSON，需 URL encode（範例：`levels=%5B%7B%22cardLevel%22%3A%22A%22%2C%22scoreS%22%3A243%2C%22scoreE%22%3A999%7D%5D`，解碼後對應 `[{"cardLevel":"A","scoreS":243,"scoreE":999}]`）。**提供時**後端以此門檻回傳伺服器端 `distribution`（供非互動呼叫者）；**省略時**僅回 `histogram`（互動前端於前端分桶，見下方 behavior note，AC-3） |

**Response — 200 OK（v1.8 直方圖 + 抽樣估算）**

```json
{
  "histogram": [
    { "score": 243, "count": 5 },
    { "score": 242, "count": 8 },
    { "score": 241, "count": 12 }
  ],
  "distribution": { "A": 2000, "B": 4000, "C": 3000, "D": 500 },
  "isEstimate": true,
  "sampleSize": 50000,
  "totalCount": 1679489
}
```

**Response 欄位說明（v1.7 估算中介資訊 / v1.8 新增 histogram / US-174）**：

| 欄位 | 型別 | 說明 |
|---|---|---|
| histogram | array（**v1.8 新增**） | 選中 CARD_TYPE 之**樣本分數直方圖**：`[{ score, count }]`，`score` = 分數值、`count` = 樣本中該分數之筆數（**樣本層計數，非母體**）。**與門檻 / 等級無關**（門檻編輯不改變其內容）。前端每 cardType 取一次並快取，之後依當前草稿門檻於前端分桶並以 `totalCount / sampleSize` 放大推算各等級人數（AC-3 / BR-2） |
| distribution | object | 各等級之**放大推算後**預估人數（key 為 cardLevel，依 CARD_TYPE 動態，不硬編碼 4 級）；為估算值非精確計數。**v1.8：僅當 `levels` 提供時回傳，供非互動呼叫者**；互動前端改用 `histogram` 於前端分桶，不依賴此欄位 |
| isEstimate | boolean | 固定為 `true`，供前端渲染「約 / 估算」標示（AC-3） |
| sampleSize | number | 本次抽樣之固定樣本筆數（實際數值由 AD-E07-45 決定，範例值僅示意；非依母體動態變動） |
| totalCount | number | 母體（選中 CARD_TYPE 之 `ob_pool_data`）總筆數，供前端放大推算 / 顯示推算基數 |

> **v1.8 behavior note（互動路徑 / US-174 / AD-E07-45 v1.2）**：直方圖對固定樣本一次掃描即得、**與門檻無關**，故前端**每個 cardType 僅呼叫本端點一次**取得 `histogram` 並快取；業務部長於 Tab 4 調整門檻時，各等級分佈由前端就快取直方圖**即時重新分桶（client-side）**，**門檻編輯不再回打後端**。伺服器端 `distribution`（需 `levels`）保留供非互動 / 程式化呼叫者。
>
> **v1.8 效能（US-174 / AD-E07-45 v1.2）**：直方圖掃描實測 **heavy card 約 12 秒（取代 v1.6 全量即時計分 CARD_TYPE=E 224.6 秒逾時）**，每 cardType 一次並快取；**門檻編輯之前端重新分桶為即時（次秒級 / instant）**。抽樣演算法 / 樣本大小 / 種子機制 / 直方圖 SQL / 放大公式由 AD-E07-45 v1.2 owns，本 spec 僅定義行為契約。

**錯誤回應**

| HTTP | 錯誤碼 | 說明 |
|---|---|---|
| 401 | AUTH_TOKEN_MISSING | 未登入 |
| 403 | E07_REQUIRES_DIRECTOR | 寫入端點：`businessRole` 非 `'director'`（`DirectorGuard` 攔截）；GET 端點：`businessRole` 非 `'director'` / `'section_chief'`（`DirectorOrSectionChiefGuard` 攔截，回 `E07_ROLE_NOT_ASSIGNED`）。依 F002 §4.6.2 |
| 404 | CARD_TYPE_NOT_FOUND | `cardType` query 不存在於 `ob_card_type.status = 'active'`（v1.4 新增；亦適用於 §5.1 PUT 端點 — request body 之 cardType） |
| 409 | SCORING_VERSION_LOCKED | 月名單分派執行中 |
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
| 409 | SCORING_VERSION_LOCKED | 月名單分派執行中 |
| 409 | CARD_LEVEL_REFERENCED | 仍被 `ob_tier` 引用，禁止刪除（cascade reference check 失敗，見 BR-6） |

## 5.4 RBAC 與權限（v1.6 部長 / 處長 Guard 行為導入）

> **權威來源**：本節對齊 [F002 §4.6.2 Controller Guard 對應表](F002-user-login.md#462-controller-guard-對應表) 與 architecture-spec.md AD-E07 v3.0；本節僅描述 F055 端點適用範圍與行為，定義變更以 F002 §4.6.2 為準。

### 5.4.1 端點 Guard 對應表

| 端點 | HTTP Method | Guard | 允許角色 | 行為說明 |
|---|---|---|---|---|
| `/api/v1/assignment/scoring/card-levels`（§5.1.1） | GET | `DirectorOrSectionChiefGuard` | 部長（`businessRole='director'`）、處長（`businessRole='section_chief'`）、Admin | M02 計分卡為全系統共用，處長可讀取以協助業務檢視 |
| `/api/v1/assignment/scoring/card-levels`（§5.1） | PUT | `DirectorGuard` + `@RequireDirector()` | 部長、Admin | M02 計分卡寫入限部長；處長禁止寫入 |
| `/api/v1/assignment/scoring/card-levels`（§5.3） | DELETE | `DirectorGuard` + `@RequireDirector()` | 部長、Admin | 同上 |
| `/api/v1/assignment/scoring/card-levels/preview`（§5.2） | GET | `DirectorOrSectionChiefGuard` | 部長、處長、Admin | 預覽屬唯讀試算，處長可瀏覽 |

### 5.4.2 適用錯誤碼

| HTTP | 錯誤碼 | 觸發情境 | Guard 來源 |
|---|---|---|---|
| 403 | `E07_REQUIRES_DIRECTOR` | 處長（`businessRole='section_chief'`）嘗試呼叫寫入端點（PUT / DELETE） | `DirectorGuard` |
| 403 | `E07_ROLE_NOT_ASSIGNED` | 一般使用者（`businessRole=null`）呼叫本節任一端點 | `DirectorGuard` / `DirectorOrSectionChiefGuard` |

### 5.4.3 設計原則

- **M02 計分卡為「全系統共用」資料**（不分轄區、不分業務），故處長對 GET 端點具讀取權限以利業務檢視，但寫入仍限部長以保持單一決策來源。
- **不採用 `is_sales_manager` 舊旗標**：自 AD-E07 v3.0 起，E07 RBAC 一律以 `users.business_role`（`'director'` / `'section_chief'` / `NULL`）枚舉與對應 Guard 判定；F055 v1.6 完全移除 `is_sales_manager` / `SalesManagerGuard` 引用。
- **權限矩陣同步**：本節任一行為變更，須同步檢視 F002 §4.6.2、error-handling.md `E07_*` 錯誤碼章節、AD-E07 v3.0。

## 6. 商業規則

| 規則編號 | 說明 |
|---|---|
| BR-1 | 門檻區間不得重疊；相鄰等級的 `score_e + 1 = 下一級 score_s` 允許 |
| BR-2 | **預覽採直方圖 + 前端分桶（v1.8 改寫 / US-174 / AD-E07-45 v1.2）**：§5.2 preview 回傳選中 CARD_TYPE 之樣本分數直方圖（`histogram`，對 `ob_pool_data` 固定樣本一次掃描、與門檻無關、可重現種子）；前端**每 cardType 取一次直方圖並快取**，各等級分佈由前端依當前草稿門檻**即時分桶（client-side bucketing）**並以 `totalCount / sampleSize` 放大推算，**門檻編輯不回打後端**。效能：直方圖掃描 **heavy card 約 12 秒（每 cardType 一次、快取；取代 v1.6 全量即時計分 224.6 秒 + 60 秒應用層快取）**；前端重新分桶即時（次秒級）。伺服器端 `distribution`（需 `levels`）保留供非互動呼叫者。直方圖快取 TTL / 失效策略與 SQL 由 system-architect 於 AD-E07-45 v1.2 決定 |
| BR-3 | 月名單分派鎖定：`assignment_run.status IN ('pending', 'running')` 時禁止修改 |
| BR-4 | `ob_levelcard_version.status` 欄位於遷移時補建（原 OBLEVELCARD_VERSION 無此欄位），初值由 `(SDATE <= 今日 < EDATE)` 計算；本功能仍以 `status = 'active'` 判斷 active 計分版本 |
| BR-5 | **hard delete 決策**：DELETE 採 hard delete（`ob_levelcard_level` 表無 status 欄位；與 F054 軟刪除 `ob_levelcard_column` 的設計刻意不同，理由：等級結構為「業務分級設計」而非「啟用狀態」，被刪除的等級應從歷史結構中移除，歷史追溯依賴月名單分派 snapshot F066） |
| BR-6 | **cascade reference check**：刪除前必須先檢查 `ob_tier WHERE card_type = :cardType AND card_level = :cardLevel`，若存在紀錄則回 409 `CARD_LEVEL_REFERENCED`，業務需先於 F056 移除對應後才能刪除 |
| BR-7 | **CARD_TYPE 範圍鎖**（v1.4 新增）：所有寫入操作之 `cardType` 必須對應 `ob_card_type.status = 'active'`；違反回 404 `CARD_TYPE_NOT_FOUND`；前端 Tab 4 操作以 Tab 1 selectedCardType 為唯一資料範圍，跨 CARD_TYPE 寫入不開放 |
| BR-8 | **抽樣估算行為契約（v1.7 新增 / v1.8 直方圖 + 前端分桶 / US-174 / AD-E07-45 v1.2）**：(1) 樣本為固定筆數（非依母體動態變動）；(2) 抽樣使用可重現種子，相同輸入之直方圖結果一致；(3) 後端回傳**與門檻無關**之分數直方圖，前端依門檻分桶並以 `totalCount / sampleSize` 放大推算至母體；(4) 結果標示為估算值（`isEstimate = true`）；(5) **效能**：後端直方圖掃描每 cardType 一次、heavy card 約 12 秒後快取，**門檻編輯之前端重新分桶為即時（次秒級）**；(6) 直方圖取得失敗時前端顯示錯誤重試狀態、不得靜默呈現空白（AC-8）。[F056](F056-edit-tier-mapping.md)（各 TIER 分布預估）**共用本 F055 快取直方圖**於前端衍生（切至 Tab 5 不觸發新掃描）；[F050](F050-create-list-definition.md)（草稿命中筆數預估）共用同一套抽樣估算產品邏輯（D1）、其抽樣 COUNT 維持次秒級。抽樣演算法 / 樣本大小 / 種子機制 / 直方圖 SQL / 放大公式由 AD-E07-45 v1.2 owns，本 spec 僅定義行為契約 |

## 7. UI/UX 需求

- 等級門檻表格：inline edit 或 Modal 編輯
- **預覽影響區：直方圖前端分桶（v1.8 / US-174）**：切換 cardType 時取一次 §5.2 直方圖並快取（載入約 12 秒，顯示載入狀態）；業務部長調整門檻時，各等級分佈由前端就快取直方圖**即時重新分桶**顯示（instant，無需 debounce 打後端 / 無網路等待）。v1.7「debounce 300ms 打後端」語意由前端分桶取代
- **預覽估算標示與三態（v1.7 / US-174）**：預覽面板各等級人數須明確標示為估算值（如「約 N 人」或「基於樣本估算」註記，具體文案由 ui-ux-designer 決定），不得呈現為精確全量計數；面板須具**載入中（直方圖掃描）/ 已顯示估算（直方圖已快取、門檻即時分桶）/ 錯誤重試**三態且視覺可清楚區分。直方圖取得失敗時顯示「預估分佈暫時無法取得，請稍後再試」與可重試操作，**不得**退回空白面板（修正現行 `catch { setPreview(null) }` 靜默吞噬缺陷，AC-8）
- 錯誤提示：直接於有問題的等級列顯示紅色邊框 + 錯誤訊息
- 等級列右側操作區新增「刪除」icon 按鈕（`trash-2` lucide icon，紅色 hover：`hover:text-danger hover:bg-red-50`），與 F056 TIER_LEVEL 對應表的刪除樣式一致
- 點擊刪除按鈕觸發確認對話框（標題：「刪除 CARD_LEVEL 等級」、body：等級代碼 + AC-7 警告文字）
- 月名單分派鎖定時刪除按鈕 disabled
- **prototype 28 註記**：原 prototype L1145-1151 僅繪 `check` icon（單列儲存）；trash 按鈕為 v1.3 本次新增，後續若 prototype 重繪須同步更新

## 8. 相依性

- **Blocked By**：F053（需先了解計分版本結構）、F069（Tab 1 CARD_TYPE 選中狀態來源）
- **Blocks**：F056（TIER_LEVEL 對應依賴 CARD_LEVEL 定義；刪除 cardLevel 前須確認 F056 `ob_tier` 對應已清空 — BR-6 cascade check）、F061（月名單分派 Stage 2 等級劃分）

## 9. 交叉參考

- 資料模型：[data-model.md#e07-data-model](../data-model.md#e07-data-model)（`ob_levelcard_level`）、[data-model.md#ob-card-type-entity](../data-model.md#ob-card-type-entity)
- 錯誤處理：[error-handling.md#assignment-scoring-errors](../error-handling.md#assignment-scoring-errors)（含 v1.3 新增的 `CARD_LEVEL_RECORD_NOT_FOUND`（404）、`CARD_LEVEL_REFERENCED`（409）；v1.4 引用 `CARD_TYPE_NOT_FOUND`（404））
- 架構決策：AD-E07-3、**AD-E07-45 抽樣估算 v1.2**（v1.7 抽樣估算 → v1.8 分數直方圖 + 前端分桶 / US-174 — 抽樣演算法 / 固定樣本大小 / 可重現種子 / 直方圖 SQL / 放大推算公式 / 直方圖快取 TTL 與失效策略；由 system-architect 後續撰寫，本 spec 僅引用其行為契約，不規範內部機制）
- 相關功能：[F053](F053-view-scoring-dimensions.md)、[F054](F054-edit-scoring-dimension.md)（軟刪除維度，作為刪除設計對照）、[F056](F056-edit-tier-mapping.md)（各 TIER 分布預估，共用 AD-E07-45 抽樣估算 D1）、[F050](F050-create-list-definition.md)（草稿命中筆數預估，共用 D1）、[F061](F061-trigger-assignment-run.md)、[F069](F069-view-card-type-list.md)、[F070](F070-create-card-type.md)
- 對應 User Story：US-074（原始門檻與預覽面板）、**US-174（預覽改抽樣估算並修正靜默吞噬缺陷）**

## 10. 變更紀錄

| 版本 | 日期 | 變更內容 |
|---|---|---|
| v1.1 | 2026-05-13 | 初版（依 dump 觀察 5/6 CARD_TYPE 4 級 / S5 2 級，禁止前端硬編碼） |
| v1.2 | 2026-05-13 | 補 GET 5.1.1 端點供頁面載入 |
| v1.3 | 2026-05-14 | 新增 DELETE 端點 + cascade reference check + AC-6/7 |
| v1.4 | 2026-05-14 | CARD_TYPE 範圍鎖（BR-7）；AC-1 改為依 selectedCardType 顯示；所有端點補 404 CARD_TYPE_NOT_FOUND；Controller 規範註記；相依性補 F069 |
| v1.5 | 2026-05-15 | 對齊 spec-index 與 US-097：補 M02 新建 CARD_LEVEL 流程相關 cross-ref（與 F070 / US-097 串接） |
| v1.6 | 2026-05-17 | **RBAC 明文化（§5.4 新增）**：依 AD-E07 v3.0 + F002 §4.6.2 導入部長 / 處長 Guard 行為矩陣；GET 端點採 `DirectorOrSectionChiefGuard`、寫入端點採 `DirectorGuard`；對應錯誤碼 `E07_REQUIRES_DIRECTOR` / `E07_ROLE_NOT_ASSIGNED` 明列；正式廢棄 `is_sales_manager` / `SalesManagerGuard` 引用，全文改採 `businessRole`（`'director'` / `'section_chief'`）+ 新 Guard 名 |
| v1.7 | 2026-07-11 | **§5.2 預覽改抽樣估算 + 修正靜默吞噬缺陷（US-174 / D1）**：(1) AC-3 重寫 — 全量即時計分改為 `ob_pool_data` 固定樣本 + 可重現種子放大推算（AD-E07-45），次秒級、標示估算值（取代生產環境 CARD_TYPE=E 224.6 秒逾時行為）；(2) 新增 AC-8 — 估算失敗顯示錯誤重試三態，修正前端 `catch { setPreview(null) }` 靜默吞噬導致面板空白之缺陷；(3) §5.2 response 補 `isEstimate` / `sampleSize` / `totalCount` 中介資訊；(4) BR-2 改寫（快取語意由抽樣取代）、新增 BR-8 抽樣估算行為契約；(5) §7 UI/UX 補估算標示與三態；(6) 引用 AD-E07-45（與 F056 / F050 共用抽樣估算 D1） |
| v1.8 | 2026-07-12 | **§5.2 預覽改分數直方圖 + 前端分桶（互動效能決議 / US-174 / AD-E07-45 v1.2）**：(1) AC-3 重寫 — 後端回傳與門檻無關之 `histogram: [{score, count}]`（對固定樣本一次掃描），前端每 cardType 取一次並快取、依門檻**即時前端分桶**放大推算，**門檻編輯不再打後端**；(2) §5.2 response 新增 `histogram` 欄位、`levels` 改選填（提供才回伺服器端 `distribution` 供非互動呼叫者）+ behavior / 效能 note；(3) BR-2 改寫、BR-8 補直方圖 + 前端分桶效能契約；(4) AC-8 / §7 UI/UX 對齊直方圖三態；(5) 效能：直方圖掃描 heavy card **約 12 秒（取代 224.6 秒）**、每 cardType 一次快取，前端重新分桶即時（次秒級）；(6) 引用 **AD-E07-45 v1.2**；F056 各 TIER 分布共用本快取直方圖於前端衍生 |

## 11. 假設

| # | 假設 | 標記 |
|---|---|---|
| A-1 | DELETE 採 hard delete 設計（`ob_levelcard_level` 無 status 欄位），歷史結構追溯依賴月名單分派 snapshot F066 | ✅ Decided（PO 2026-05-14） |
| A-2 | AC-6 / AC-7 cascade 行為採方案 A（reference check 阻擋刪除）為 PO 決策；歷史追溯依賴 F066 snapshot；未採方案 B（cascade 連動刪除 `ob_tier` 對應）以避免跨表副作用 | ✅ Decided（PO 2026-05-14） |
| A-3 | 預覽改採**分數直方圖 + 前端分桶**（固定樣本一次掃描得與門檻無關之 histogram + 可重現種子 + 前端依門檻即時分桶放大推算 + 估算標示），取代 v1.6 全量即時計分（生產環境 CARD_TYPE=E 實測 224.6 秒逾時 + 前端 `catch { setPreview(null) }` 靜默吞噬空白）與 v1.7「每次門檻變更打後端」。**效能**：直方圖掃描 heavy card 約 12 秒（每 cardType 一次、快取），門檻編輯之前端重新分桶即時（次秒級）。直方圖 / 快取機制細節交 AD-E07-45 v1.2 | ✅ Decided（D1 + team lead 2026-07-12 互動效能決議 / US-174） |
