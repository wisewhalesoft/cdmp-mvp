---
spec-id: F056
title: 編輯 TIER_LEVEL 對應表（M02 Tab 5）
feature-id: F056
source-story: US-075
epic: E07
module: M02 計分設定
priority: P0-MVP
version: "1.5"
date: 2026-05-14
status: Draft
---

# F056: 編輯 TIER_LEVEL 對應表（M02 Tab 5）

Priority: P0-MVP | Status: Draft | Last Updated: 2026-05-14

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + `data-model.md#ob-tier-entity` + `data-model.md#e07-data-model` + `data-model.md#ob-card-type-entity` + `error-handling.md#assignment-scoring-errors` |
| QA / Tester | 本文件 + `error-handling.md#assignment-scoring-errors` |
| UI/UX Designer | 本文件(第 7 節 UI/UX 需求) |
| Architect | 本文件 + `architecture-spec.md` §3.10 |

---

## 1. 功能摘要

提供業務部長針對 Tab 1 選中之 CARD_TYPE，維護 TIER_LEVEL 對應表(`ob_tier`，舊系統 `OBTIER`)。對應表用途為將「計分卡類型 CARD_TYPE × 計分卡等級 CARD_LEVEL」映射至外部系統使用的分群代碼 TIER_LEVEL。月跑 Stage 2 完成 CARD_LEVEL 計算後，依本表 join 取得 `tier_level` 寫回 `ob_pool_data_list.tier_level`。

**v1.5 重大變更**(breaking)：

1. **TIER_LEVEL 採固定列舉 T1 ~ T10**(HARDCODE 10 個值)；新增 / 修改之 TIER_LEVEL 必須屬於該列舉，違反回 422 `TIER_LEVEL_INVALID_ENUM`。
2. **依 Tab 1 選中 CARD_TYPE 篩選**：清單僅顯示 `ob_tier WHERE card_type = :selectedCardType`；新增 / 修改之 cardType 必須與 selected 一致。
3. **Fallback / Standard 互斥**：同一 CARD_TYPE 之 `ob_tier` 紀錄不可同時存在 `card_level IS NULL`(Fallback)與 `card_level IS NOT NULL`(Standard)兩種；違反回 422 `CARD_TYPE_FALLBACK_STANDARD_MUTEX`。
4. **舊後綴值遷移**：T1M / T1HM / T2HM / T3M / T3HM / T32 / T3C / T4M / T51 / T52 / T5M / THC 等舊值依 BR-12 規則統一遷移至 T1 ~ T10；遷移後 UI 不再顯示舊後綴值。

> 對應舊系統 SP 邏輯：`reference/SP/Stage2_依照CardType分類TierLevel.sql`
> ```sql
> LEFT JOIN OBTIER C ON A.CARD_LEVEL=C.CARD_LEVEL AND B.CARD_TYPE=C.CARD_TYPE
> ```

## 2. 使用者故事

**As a** 業務部長
**I want** 維護選定計分卡類型(CARD_TYPE)的 TIER_LEVEL 對應設定，包含「標準規則(CARD_LEVEL 非空)」與「Fallback 規則(CARD_LEVEL 為空，不分等級)」兩種對應模式
**So that** 確保月跑 Stage 2 計分結果能正確分群至外部系統使用的 TIER_LEVEL，避免後續分派與通報資料錯誤

## 3. 前置條件

- 業務部長已登入並持有有效 JWT Token
- `businessRole='director'`（M02 計分卡寫入限部長，GET 端點開放處長；後端寫入套用 `DirectorGuard`，GET 套用 `DirectorOrSectionChiefGuard`，依 F002 §4.6.2）
- F069 Tab 1 已有選中之 CARD_TYPE，且該 CARD_TYPE 於 `ob_card_type.status = 'active'`
- `ob_levelcard_level` 已有對應的 `card_level` 等級資料(由 F055 維護)；Standard 規則新增之 `card_level` 必須存在於該 CARD_TYPE 之 active 計分版本
- `assignment_run` 當下無 `status IN ('pending', 'running')` 的紀錄

## 4. 驗收標準

### AC-1：依選中 CARD_TYPE 顯示 TIER_LEVEL 對應表

- **Given** 業務部長已在 Tab 1 選中某 CARD_TYPE，並切換至 Tab 5
- **When** Tab 5 載入完成
- **Then** 顯示 `ob_tier WHERE card_type = :selectedCardType` 的所有對應列，欄位：CARD_LEVEL(standard 列顯示等級代碼如 A/B/C/D;fallback 列顯示「(無 — Fallback)」)、TIER_LEVEL(T1~T10 值)、LIST_NM(描述性欄位，可空)
- **And** 預設依 CARD_LEVEL 升冪排序，fallback 列(`card_level IS NULL`)排在末尾
- **And** Fallback 列以視覺提示區分(如紫色底色或「Fallback」標籤)
- **And** Tab 5 頂部標示目前操作的 CARD_TYPE(如「正在編輯：H — 期中」)

### AC-2：修改對應關係(TIER_LEVEL 採 T1~T10 下拉)

- **Given** 對應表已顯示
- **When** 業務部長修改某 `(card_type, card_level)` 之 `tier_level` 並點擊儲存
- **Then** 對應關係更新(針對 `ob_tier` 該複合 PK 紀錄 UPDATE)
- **And** TIER_LEVEL 之輸入方式為下拉選單，僅 T1 / T2 / T3 / T4 / T5 / T6 / T7 / T8 / T9 / T10 共 10 個選項(**不允許自由文字輸入**);後端對 request 之 `tierLevel` 進行列舉驗證，不在 T1~T10 範圍內回 422 `TIER_LEVEL_INVALID_ENUM`
- **And** 寫入 `assignment_audit_log`(`action = 'UPDATE'`、`entity_type = 'ob_tier'`、`entity_id = '{card_type}|{card_level ?? ""}'`)

### AC-3：新增 Standard 對應列(CARD_LEVEL 非空)

- **Given** 對應表已顯示，業務部長點擊「新增對應」，選擇規則類型為「Standard(依等級)」
- **When** 業務部長填入 CARD_LEVEL(必填，下拉來源：目前選中 CARD_TYPE 的 `ob_levelcard_level` 有效等級)、TIER_LEVEL(必填，T1~T10 下拉)、LIST_NM(選填)，點擊確認
- **Then** `ob_tier` 新增一列(`card_type` = 選中之 selectedCardType，`card_level` = 填入值)，顯示新增成功提示
- **And** 若 DB 中 `(card_type, card_level)` 組合已存在，回 422 `TIER_LEVEL_DUPLICATE`，訊息：「CARD_TYPE {cardType} × CARD_LEVEL {cardLevel} 的對應已存在」
- **And** 若該 CARD_TYPE 已存在 fallback 列(`card_level IS NULL`)，回 422 `CARD_TYPE_FALLBACK_STANDARD_MUTEX`，訊息：「CARD_TYPE {cardType} 已有 Fallback 規則，請先移除後再新增 Standard 對應」
- **And** PUT 批次端點(5.2)的同類重複檢查見 BR-9(body 內 PK 重複時亦回傳 422 `TIER_LEVEL_DUPLICATE`)

### AC-4：CARD_LEVEL 必須存在於選中 CARD_TYPE 之 active 計分版本(Standard 規則路徑)

- **Given** 業務部長選擇 Standard 規則，輸入非空之 CARD_LEVEL
- **When** 前端 / 後端驗證
- **Then** 該 CARD_LEVEL 必須存在於該 CARD_TYPE 之 active `ob_levelcard_level`，否則回 422 `CARD_LEVEL_NOT_FOUND_IN_VERSION`
- **And** 若 CARD_LEVEL 留空(Fallback 規則路徑)，改走 AC-4a，不觸發本驗證

### AC-4a：允許新增 CARD_LEVEL 為 NULL 的 Fallback 對應

- **Given** 業務部長選擇規則類型為「Fallback(不分等級)」
- **When** 業務部長填入 TIER_LEVEL(必填，T1~T10 下拉)、LIST_NM(選填)，CARD_LEVEL 欄位自動帶入「不分等級(NULL)」，點擊確認
- **Then** `ob_tier` 新增一列(`card_type` = 選中之 selectedCardType，`card_level IS NULL`)，表示不分等級直接對應 TIER_LEVEL
- **And** 若該 CARD_TYPE 之 fallback 列已存在，回 422 `TIER_LEVEL_DUPLICATE`，訊息：「CARD_TYPE {cardType} 的 Fallback 對應已存在，請修改現有列」
- **And** 若該 CARD_TYPE 已存在任一 Standard 列(`card_level` 非空)，回 422 `CARD_TYPE_FALLBACK_STANDARD_MUTEX`，訊息：「CARD_TYPE {cardType} 已有 {N} 筆 Standard 規則，請先移除後再新增 Fallback 對應」
- **And** 新增 Fallback 列時不觸發 AC-4 之 `CARD_LEVEL_NOT_FOUND_IN_VERSION` 驗證
- **And** UI 須以視覺提示(如標籤 `Fallback` 或不同列底色)區分 fallback 規則與標準規則

### AC-5：月跑執行中禁止修改

- **Given** `assignment_run` 有 `status IN ('pending', 'running')` 的紀錄
- **When** 業務部長嘗試修改對應表
- **Then** 編輯按鈕 disabled，API 回 409 `SCORING_VERSION_LOCKED`

### AC-6：刪除單筆 TIER 對應

- **Given** 業務部長於 Tab 5 看到某 `(cardType, cardLevel)` 列;無月跑鎖
- **When** 業務部長點擊該列的刪除按鈕並於確認對話框點擊「確認刪除」
- **Then** 呼叫 `DELETE /api/v1/assignment/scoring/tier-mapping`(query：`cardType` + `cardLevel`)，HTTP 200，DB 中該複合 PK 紀錄被實體刪除(hard delete)
- **And** 寫入 `assignment_audit_log`(`action = 'DELETE'`、`entity_type = 'ob_tier'`、`entity_id = '{cardType}|{cardLevel ?? ""}'`、`before_value` 含 `tierLevel`、`after_value = null`)

### AC-7：刪除 fallback 對應(cardLevel = NULL)

- **Given** fallback 對應紀錄存在(`card_level IS NULL`)
- **When** 業務部長點擊刪除按鈕並確認
- **Then** API 接受 `cardLevel` query 省略(不可用空字串，需與 BR-9 一致)，執行 NULL 紀錄刪除
- **And** 寫入 `assignment_audit_log`，`entity_id = '{cardType}|'`(cardLevel 部份留空)

### AC-8：TIER_LEVEL 列舉約束(HARDCODE T1~T10)

- **Given** 業務部長於 5.2 / 5.3 端點送出 `tierLevel` 值
- **When** 後端驗證
- **Then** `tierLevel` 必須屬於列舉 `["T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8", "T9", "T10"]`;違反回 422 `TIER_LEVEL_INVALID_ENUM`，訊息：「TIER_LEVEL 必須為 T1~T10 之一，目前值：`{value}`」
- **And** 前端 UI 之 TIER_LEVEL 欄位採下拉選單呈現此 10 個選項，不允許自由輸入
- **And** 列舉約束適用於所有寫入端點(5.2 PUT 批次、5.3 POST 單筆)，讀取端點(5.1 GET)不阻擋舊資料顯示

### AC-9：CARD_TYPE 範圍鎖

- **Given** 5.1 / 5.2 / 5.3 / 5.4 端點之 `cardType`(query 或 body)
- **When** 後端驗證
- **Then** `cardType` 必須對應 `ob_card_type.status = 'active'`，否則回 404 `CARD_TYPE_NOT_FOUND`
- **And** 5.2 PUT 批次端點之 request body 中所有 mapping 之 `cardType` 必須與 query 指定之 selectedCardType 一致;混入不同 CARD_TYPE 回 422 `VALIDATION_ERROR`

## 5. API 規格

**Controller 規範**：GET 端點（5.1）使用 `DirectorOrSectionChiefGuard` + `@RequireDirectorOrSectionChief()`；寫入端點（5.2 PUT / 5.3 POST / 5.4 DELETE）使用 `DirectorGuard` + `@RequireDirector()`（依 F002 §4.6.2 M02 計分卡讀取 / 寫入二分）。

**CARD_TYPE 範圍鎖**：所有端點之 `cardType` 必須對應 `ob_card_type.status = 'active'`，否則回 404 `CARD_TYPE_NOT_FOUND`(AC-9)。

**TIER_LEVEL 列舉**：寫入端點(5.2 / 5.3)之 `tierLevel` 必須屬於 T1~T10 列舉(AC-8)。

### 5.1 GET /api/v1/assignment/scoring/tier-mapping

對應 AC-1：依選中 CARD_TYPE 取得對應清單。

**Query Parameters**

| 參數 | 型別 | 必填 | 說明 |
|---|---|---|---|
| cardType | string，maxLength 5 | 是 | 由 Tab 1 選中之 CARD_TYPE;後端驗證該 cardType 存在於 `ob_card_type.status = 'active'`，否則回 404 `CARD_TYPE_NOT_FOUND` |

**Response — 200 OK**

```json
{
  "cardType": "H",
  "mappings": [
    { "cardType": "H", "cardLevel": "A", "tierLevel": "T1", "listNm": "期中名單" },
    { "cardType": "H", "cardLevel": "B", "tierLevel": "T2", "listNm": "期中名單" },
    { "cardType": "H", "cardLevel": "C", "tierLevel": "T3", "listNm": "期中名單" },
    { "cardType": "H", "cardLevel": "D", "tierLevel": "T4", "listNm": "期中名單" }
  ]
}
```

| 欄位 | 對應 `ob_tier` 欄位 | 說明 |
|------|---------------------|------|
| cardType | card_type | 計分卡類型(VARCHAR(5)，PK 組成) |
| cardLevel | card_level | 計分卡等級(VARCHAR(5)，PK 組成;如 A/B/C/D)。**Fallback 規則允許 null**，表示不分等級的 fallback |
| tierLevel | tier_level | 名單分群結果代碼(T1~T10 之一) |
| listNm | list_nm | 名單名稱(VARCHAR(30)，optional 描述性欄位，不參與 join，可為 null) |

**錯誤回應**

| HTTP | 錯誤碼 | 說明 |
|---|---|---|
| 401 | AUTH_TOKEN_MISSING | 未登入 |
| 403 | E07_REQUIRES_DIRECTOR | 寫入端點：`businessRole` 非 `'director'`（`DirectorGuard`）；GET 端點回 `E07_ROLE_NOT_ASSIGNED`（`DirectorOrSectionChiefGuard`）。依 F002 §4.6.2 |
| 404 | CARD_TYPE_NOT_FOUND | `cardType` query 不存在於 `ob_card_type.status = 'active'`(v1.5 新增) |

### 5.2 PUT /api/v1/assignment/scoring/tier-mapping

批次 UPSERT。Request body 內所有 mapping 之 `cardType` 必須與 query 之 selectedCardType 一致。

**Query Parameters**

| 參數 | 型別 | 必填 | 說明 |
|---|---|---|---|
| cardType | string，maxLength 5 | 是 | selectedCardType;body 內所有 mapping 必須符合此值 |

**Request Body**

```json
{
  "mappings": [
    { "cardType": "H", "cardLevel": "A", "tierLevel": "T1", "listNm": "高資產卡 A 級" },
    { "cardType": "H", "cardLevel": "B", "tierLevel": "T2" }
  ]
}
```

**Request 欄位約束**：

| 欄位 | 型別 | 必填 | 說明 |
|------|------|------|------|
| cardType | string，maxLength 5 | 是 | 必須與 query `cardType` 一致;不一致回 422 `VALIDATION_ERROR` |
| cardLevel | string，maxLength 5 \| null | 是(值可為 null) | 對應 `ob_tier.card_level`;Fallback 場景允許明確傳入 null(詳見 AC-4a) |
| tierLevel | string，T1~T10 列舉 | 是 | 必須屬於 T1~T10 列舉(AC-8)，否則回 422 `TIER_LEVEL_INVALID_ENUM` |
| listNm | string，maxLength 30 \| null | 否 | 對應 `ob_tier.list_nm`;省略時保留現有值，明確傳入 null 則清空 |

**寫入語意**：批次 UPSERT，以 `(card_type, card_level)` 複合 PK 為對應鍵。

- 同一 request body 內 `(card_type, card_level)` 重複出現視為輸入錯誤，回 422 `TIER_LEVEL_DUPLICATE`(body 內 PK 重複，不執行任何寫入)
- 對於 body 中通過驗證的 mapping，若 DB 中已存在對應 PK 紀錄則 UPDATE，否則 INSERT
- request 中未列出的既有對應不會被刪除;如需刪除單筆對應，使用 §5.4 DELETE 端點
- **Fallback / Standard 互斥檢查**(v1.5 新增)：若 body 中任一 mapping 為 Standard(`card_level` 非 null)且 DB 中該 CARD_TYPE 已存在 fallback 紀錄(且 body 中未同時刪除該 fallback)，或反之，回 422 `CARD_TYPE_FALLBACK_STANDARD_MUTEX`

**Response — 200 OK**

```json
{
  "updatedCount": 12,
  "insertedCount": 2
}
```

**錯誤回應**

| HTTP | 錯誤碼 | 說明 |
|---|---|---|
| 401 | AUTH_TOKEN_MISSING | 未登入 |
| 403 | E07_REQUIRES_DIRECTOR | 寫入端點：`businessRole` 非 `'director'`（`DirectorGuard`）；GET 端點回 `E07_ROLE_NOT_ASSIGNED`（`DirectorOrSectionChiefGuard`）。依 F002 §4.6.2 |
| 404 | CARD_TYPE_NOT_FOUND | `cardType` query 不存在於 `ob_card_type.status = 'active'`(v1.5 新增) |
| 409 | SCORING_VERSION_LOCKED | 月跑執行中 |
| 422 | TIER_LEVEL_DUPLICATE | request body 內 `(card_type, card_level)` 組合重複 |
| 422 | TIER_LEVEL_INVALID_ENUM | `tierLevel` 不在 T1~T10 列舉內(v1.5 新增) |
| 422 | CARD_LEVEL_NOT_FOUND_IN_VERSION | 指定的 `(card_type, card_level)` 組合不存在於 active 版本的 `ob_levelcard_level`(非 fallback 場景) |
| 422 | CARD_TYPE_FALLBACK_STANDARD_MUTEX | 同 CARD_TYPE 同時存在 Standard 與 Fallback 規則(v1.5 新增) |
| 422 | VALIDATION_ERROR | body 內 mapping 之 cardType 與 query cardType 不一致 |

### 5.3 POST /api/v1/assignment/scoring/tier-mapping

單筆新增端點。

**Request Body**

```json
{
  "cardType": "H",
  "cardLevel": "A",
  "tierLevel": "T1",
  "listNm": "期中名單"
}
```

欄位約束同 5.2(單一 mapping object);`tierLevel` 列舉約束 T1~T10。

**寫入語意**：以 `(card_type, card_level)` 複合 PK 進行 INSERT;DB 中已存在對應紀錄時直接回 422，不執行 UPDATE(如需修改既有紀錄請走 5.2 PUT)。新增前進行 Fallback / Standard 互斥檢查(見 AC-3 / AC-4a)。

**Response — 201 Created**

```json
{
  "cardType": "H",
  "cardLevel": "A",
  "tierLevel": "T1",
  "listNm": "期中名單"
}
```

**錯誤回應**

| HTTP | 錯誤碼 | 說明 |
|---|---|---|
| 401 | AUTH_TOKEN_MISSING | 未登入 |
| 403 | E07_REQUIRES_DIRECTOR | 寫入端點：`businessRole` 非 `'director'`（`DirectorGuard`）；GET 端點回 `E07_ROLE_NOT_ASSIGNED`（`DirectorOrSectionChiefGuard`）。依 F002 §4.6.2 |
| 404 | CARD_TYPE_NOT_FOUND | request 之 `cardType` 不存在於 `ob_card_type.status = 'active'`(v1.5 新增) |
| 409 | SCORING_VERSION_LOCKED | 月跑執行中 |
| 422 | TIER_LEVEL_DUPLICATE | DB 中 `(card_type, card_level)` 組合已存在 |
| 422 | TIER_LEVEL_INVALID_ENUM | `tierLevel` 不在 T1~T10 列舉內(v1.5 新增) |
| 422 | CARD_LEVEL_NOT_FOUND_IN_VERSION | 指定的 `(card_type, card_level)` 不存在於 active 版本 `ob_levelcard_level`(非 fallback 場景) |
| 422 | CARD_TYPE_FALLBACK_STANDARD_MUTEX | 違反 Fallback / Standard 互斥(v1.5 新增) |

### 5.4 DELETE /api/v1/assignment/scoring/tier-mapping

對應 AC-6 / AC-7：刪除指定 `(cardType, cardLevel)` 的單筆對應紀錄(含 fallback `card_level IS NULL`)。

**Query Parameters**

| 參數 | 型別 | 必填 | 說明 |
|---|---|---|---|
| cardType | string，maxLength 5 | 是 | 必須對應 `ob_card_type.status = 'active'` |
| cardLevel | string，maxLength 5 | 否 | 省略時代表刪除 `card_level IS NULL` 的 fallback 紀錄;不可使用空字串(與 BR-9 一致) |

**Request Body**：無

**Response — 200 OK**

```json
{
  "cardType": "H",
  "cardLevel": "D",
  "deletedAt": "2026-05-14T08:30:00.000Z"
}
```

fallback 刪除回應範例(cardLevel 為 null)：

```json
{
  "cardType": "X",
  "cardLevel": null,
  "deletedAt": "2026-05-14T08:30:00.000Z"
}
```

**錯誤回應**

| HTTP | 錯誤碼 | 說明 |
|---|---|---|
| 401 | AUTH_TOKEN_MISSING | 未登入 |
| 403 | E07_REQUIRES_DIRECTOR | 寫入端點：`businessRole` 非 `'director'`（`DirectorGuard`）；GET 端點回 `E07_ROLE_NOT_ASSIGNED`（`DirectorOrSectionChiefGuard`）。依 F002 §4.6.2 |
| 404 | CARD_TYPE_NOT_FOUND | `cardType` query 不存在於 `ob_card_type.status = 'active'`(v1.5 新增) |
| 404 | TIER_MAPPING_NOT_FOUND | 指定的 `(cardType, cardLevel)` 對應不存在 |
| 409 | SCORING_VERSION_LOCKED | 月跑執行中 |

## 6. 商業規則

| 規則編號 | 說明 |
|---|---|
| BR-1 | `ob_tier` 以 `(card_type, card_level)` 為複合主鍵(遷移時補建，原 OBTIER 無 PK constraint);同 CARD_TYPE 下 CARD_LEVEL 唯一，跨 CARD_TYPE 可重複。`list_nm` 為 optional 描述性欄位，不參與 PK、不影響 join 與寫入語意 |
| BR-2 | **TIER_LEVEL 列舉約束(v1.5 重大改寫)**：寫入端點之 `tierLevel` 必須屬於 HARDCODE 列舉 `T1 / T2 / T3 / T4 / T5 / T6 / T7 / T8 / T9 / T10`;違反回 422 `TIER_LEVEL_INVALID_ENUM`。舊系統觀察值(T1M / T1HM / T2HM / T3M / T3HM / T32 / T3C / T4M / T51 / T52 / T5M / THC)於遷移時依 BR-12 規則統一轉換 |
| BR-3 | Standard 規則之 CARD_LEVEL 必須存在於該 CARD_TYPE 之 active `ob_levelcard_level`;Fallback 規則(`card_level IS NULL`)例外(見 AC-4a) |
| BR-4 | 此對應表為靜態設定，直接修改生效版本(與 F054 的覆寫式設計一致);歷史追溯依賴月跑 `assignment_run_snapshot.config_payload` |
| BR-5 | 月跑鎖定：`assignment_run.status IN ('pending', 'running')` 時禁止修改 |
| BR-6 | **遷移範圍限定 6 個正規 CARD_TYPE**(v1.5 改寫)：遷移腳本(D3：OBTIER → ob_tier)僅匯入 `ob_card_type` seed 之 6 個正規 CARD_TYPE(H / S / E / S5 / E5 / M)所對應的 OBTIER 紀錄;HM / M3 / HC / C3 / M5 等過渡 / fallback CARD_TYPE 之 OBTIER 紀錄**不匯入**(避免違反 `ob_card_type` 業務層 1:1 綁定)。若業務後續需保留 HM / M3 / HC / C3，由業務部長於 F070 新增 CARD_TYPE 後再於 F056 補設對應;舊 SP 中 M3→T5M、HC→THC、C3→T3C 之硬編碼語意不於新系統保留 |
| BR-7 | `ob_tier` 原表無稽核欄位;本功能對 `ob_tier` 的 INSERT / UPDATE / DELETE 透過 `assignment_audit_log`(`entity_type = 'ob_tier'`)統一記錄稽核軌跡，與 E07 其他設定一致 |
| BR-8 | Fallback 語意：`card_level IS NULL` 表示該 CARD_TYPE 不分等級全部對應至設定之 TIER;UI 須以視覺提示區分。**同一 CARD_TYPE 之 Fallback 列與 Standard 列互斥**(BR-13) |
| BR-9 | `ob_tier.card_level` 為 VARCHAR(5)、`ob_levelcard_level.card_level` 為 VARCHAR(1);兩表 join 與驗證以字串精確比對;TIER 對應輸入超過 1 字元視為對應失敗，回 422 `CARD_LEVEL_NOT_FOUND_IN_VERSION`(fallback 場景 NULL 例外，見 AC-4a) |
| BR-10 | Fallback 規則(`card_level IS NULL`)於 PostgreSQL `fn_calc_tier_level` 中必須以顯式 `IS NULL` 分支處理。舊 SP Stage2 L84-88 採 `LEFT JOIN OBTIER C ON A.CARD_LEVEL=C.CARD_LEVEL`，但 SQL 三值邏輯下 `A.CARD_LEVEL = C.CARD_LEVEL` 對 NULL 不會 match。新系統 function 需在 join 條件中顯式判斷 `IS NULL` 以正確啟用 fallback;具體 SQL 實作由 system-architect 於 architecture-spec 描述 |
| BR-11 | **DELETE 採 hard delete**：`ob_tier` 表無 status 欄位，刪除直接從 DB 移除紀錄;歷史追溯依 F066 月跑 snapshot;audit log 記錄 `action = 'DELETE'`、`entity_type = 'ob_tier'`、`entity_id = '{cardType}|{cardLevel ?? ""}'`、`before_value` 含 `tierLevel`、`after_value = null` |
| BR-12 | **TIER 遷移規則(v1.5 新增，OQ-E07-31 ✅ Resolved 2026-05-14)**：遷移腳本對 `ob_tier.tier_level` 既有後綴值依「取前綴數字」規則統一轉換為 T1~T10。規則：正則 `^T(\d+)` 取得 T 後第一個連續數字組合為 `T{N}`，其中 N 取**首位數字**(如 T32 → T3、T51 → T5、T52 → T5)。具體映射表如下(涵蓋 OBTIER dump 觀察之 13 種變體)：<br>• T1 / T2 / T3 / T4 / T5(已是列舉內，不變)<br>• T1M → T1、T1HM → T1<br>• T2HM → T2<br>• T3HM → T3、T3M → T3、T3C → T3、T32 → T3<br>• T4M → T4<br>• T51 → T5、T52 → T5、T5M → T5<br>• **THC → T1**(OQ新-2 ✅ Resolved 2026-05-14：HC 為汽車 high-credit 最高層級，遷移至 T1)<br>遷移腳本由 TDD 開發者於 D3 migration 後執行;D11 驗證需確認 `ob_tier.tier_level` 全部值符合 T1~T10 列舉 |
| BR-13 | **Fallback / Standard 互斥(v1.5 新增)**：對任一 CARD_TYPE，`ob_tier` 中該 CARD_TYPE 的紀錄不可同時存在 `card_level IS NULL`(Fallback)與 `card_level IS NOT NULL`(Standard)兩種。寫入時違反互斥規則回 422 `CARD_TYPE_FALLBACK_STANDARD_MUTEX`。執行檢查的時機點：5.2 PUT 批次(含 body 內互斥 + body 與 DB 既有紀錄互斥)、5.3 POST 單筆(新增前 query DB 既有紀錄)。DB 層約束(如 partial unique index 或 trigger)由 system-architect 決定 |

## 7. UI/UX 需求

- 對應表 inline edit 或 Modal：CARD_TYPE 由 selectedCardType 自動帶入(不顯示為可編輯欄位)、CARD_LEVEL / TIER_LEVEL 三欄為主，LIST_NM 為次要描述欄位(可摺疊)
- 預設依 CARD_LEVEL 升冪排序，Fallback 列排末尾
- CARD_LEVEL 下拉選項依當前選定的 CARD_TYPE 動態載入：來自 `ob_levelcard_level` 中該 CARD_TYPE 的 active 版本 `card_level`
- **TIER_LEVEL 採下拉選單 T1~T10**(10 個固定選項，不允許自由輸入)
- LIST_NM 採 optional 文字輸入(最多 30 字元)，允許空白
- 新增按鈕開啟 Modal，Modal 中先選擇規則類型(Standard 依等級 / Fallback 不分等級)，依選擇切換顯示 CARD_LEVEL 欄位
- 對應列右側操作區提供「刪除」icon 按鈕;月跑鎖定時 disabled
- 未選中 CARD_TYPE 時顯示「請先在 Tab 1 選擇計分卡類型以查看設定」
- **prototype 28 註記**：prototype L1165-1172 即為此功能 trash icon UI，現有設計可沿用;TIER_LEVEL 下拉改為 T1~T10 後 prototype 需同步更新

## 8. 相依性

- **Blocked By**：F055(需先確認 CARD_LEVEL 等級定義)、F069(Tab 1 CARD_TYPE 選中狀態來源)、F070(新建 CARD_TYPE 後才能設定 TIER 對應)
- **Blocks**：F061(月跑 Stage 2 TIER 對應邏輯依賴此設定)

## 9. 交叉參考

- 資料模型：[data-model.md#ob-tier-entity](../data-model.md#ob-tier-entity)(`ob_tier` 表定義，含 SP 證據與假設說明;v1.5 對應 data-model 補入 TIER_LEVEL 列舉約束與遷移規則)、[data-model.md#ob-card-type-entity](../data-model.md#ob-card-type-entity)
- 相關資料模型：[data-model.md#e07-data-model](../data-model.md#e07-data-model)(`ob_levelcard_level` CARD_LEVEL 分級門檻 — 由 F055 維護)
- 錯誤處理：[error-handling.md#assignment-scoring-errors](../error-handling.md#assignment-scoring-errors)(v1.5 新增 `TIER_LEVEL_INVALID_ENUM`、`CARD_TYPE_FALLBACK_STANDARD_MUTEX`、`CARD_TYPE_NOT_FOUND`;既有 `TIER_LEVEL_DUPLICATE` / `CARD_LEVEL_NOT_FOUND_IN_VERSION` 之說明補上 Fallback / Standard 情境)
- 架構決策：AD-E07-3
- SP 來源：`reference/SP/Stage2_依照CardType分類TierLevel.sql`
- 相關功能：[F055](F055-edit-card-level-thresholds.md)、[F061](F061-trigger-assignment-run.md)、[F069](F069-view-card-type-list.md)、[F070](F070-create-card-type.md)、[F072](F072-disable-card-type.md)

## 10. 變更紀錄

| 版本 | 日期 | 變更內容 |
|---|---|---|
| v1.1 | 2026-05-04 | 修正 TIER_LEVEL 對應表資料來源為獨立 OBTIER(非 ob_levelcard_level) |
| v1.2 | 2026-05-05 | OBTIER schema 確認;補 listNm 欄位、cardType / cardLevel maxLength 5、BR-7 |
| v1.3 | 2026-05-13 | 補 fallback CARD_TYPE 觀察(AC-4a / BR-8)、M3/HC/C3 ob_tier seed(BR-6) |
| v1.4 | 2026-05-14 | 新增 DELETE 端點(5.4) + AC-6/AC-7 + BR-11;TIER_MAPPING_NOT_FOUND 錯誤碼 |
| v1.5 | 2026-05-14 | **重大變更**：(1) TIER_LEVEL 列舉約束 T1~T10(AC-8 / BR-2 / `TIER_LEVEL_INVALID_ENUM`);(2) 依 Tab 1 CARD_TYPE 篩選(AC-1 / AC-9 / `CARD_TYPE_NOT_FOUND`);(3) Fallback / Standard 互斥(AC-3 / AC-4a / BR-13 / `CARD_TYPE_FALLBACK_STANDARD_MUTEX`);(4) TIER 遷移規則 BR-12(含 OQ新-2 THC → T1 決議);(5) 遷移範圍限 6 個正規 CARD_TYPE(BR-6 改寫);(6) 所有端點補 Controller 規範與 cardType 範圍鎖;(7) US-097 內容併入 |

## 11. 假設

| # | 假設 | 標記 |
|---|---|---|
| A-1 | ~~`ob_tier` 完整 schema 待 DBA 提供~~ **已解決(2026-05-05)**：OBTIER schema 已取得(`reference/TableSchema/OB/OBTIER.sql`)，共 4 欄全部 NULLABLE、無 PK 約束、無稽核欄位 | ✅ Resolved(OQ-E07-14 / A53) |
| A-2 | ~~TIER_LEVEL 值不採系統列舉約束~~ **已解決(2026-05-14，v1.5)**：採固定列舉 T1~T10;舊後綴值依 BR-12 遷移 | ✅ Resolved |
| A-3 | ~~舊 SP 中 M3/HC/C3 之硬編碼 TIER_LEVEL~~ **已解決(2026-05-14，v1.5)**：新系統不保留硬編碼分支;M3 / HC / C3 / HM / M5 等過渡 CARD_TYPE 之 OBTIER 紀錄遷移時略過(BR-6) | ✅ Resolved |
| A-4 | `ob_tier` 遷移時補建 PK `(card_type, card_level)`，並將 `card_type` / `tier_level` 補上 NOT NULL;`list_nm` 維持 NULLABLE | [ASSUMPTION] 交 system-architect |
| A-5 | OQ-E07-27(HM 計分卡獨立化)保留 architecture-spec AD-E07-15 之原決議，但 v1.5 BR-6 將 HM 遷移範圍排除(待業務確認後重新處理) | ✅ Decided(PO 2026-05-14) |
| A-6 | DB 層 Fallback / Standard 互斥之約束實作(partial unique index 或 trigger 或應用層保證)由 system-architect 於 data-model.md 決定 | [ASSUMPTION] 交 system-architect |
| A-7 | OQ新-2(THC → T1)為 PO 決議，理由：HC 為汽車 high-credit 最高層級 | ✅ Decided(PO 2026-05-14) |
