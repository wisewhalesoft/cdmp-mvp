---
spec-id: F056
title: 編輯 TIER_LEVEL 對應表
feature-id: F056
source-story: US-075
epic: E07
module: M02 計分設定
priority: P0-MVP
version: "1.4"
date: 2026-05-14
status: Draft
---

# F056: 編輯 TIER_LEVEL 對應表

Priority: P0-MVP | Status: Draft | Last Updated: 2026-05-14

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + `data-model.md#ob-tier-entity` + `data-model.md#e07-data-model` + `error-handling.md#assignment-scoring-errors` |
| QA / Tester | 本文件 + `error-handling.md#assignment-scoring-errors` |
| UI/UX Designer | 本文件（第 7 節 UI/UX 需求） |
| Architect | 本文件 + `architecture-spec.md` §3.10 |

---

## 1. 功能摘要

提供業務主管維護 TIER_LEVEL 對應表（`ob_tier`，舊系統 `OBTIER`），其作用為將「計分卡類型 CARD_TYPE × 計分卡等級 CARD_LEVEL」對應到外部系統使用的分群代碼 TIER_LEVEL（如 T1/T2/T3）。確保月跑 Stage 2 完成 CARD_LEVEL 計算後，能正確套用 TIER_LEVEL 對應規則寫回 `ob_pool_data_list.tier_level`。此對應表為靜態設定（直接修改生效版本）。

> 對應舊系統 SP 邏輯：`reference/SP/Stage2_依照CardType分類TierLevel.sql`
> ```sql
> LEFT JOIN OBTIER C ON A.CARD_LEVEL=C.CARD_LEVEL AND B.CARD_TYPE=C.CARD_TYPE
> ```

## 2. 使用者故事

**As a** 業務主管
**I want** 維護 CARD_TYPE × CARD_LEVEL 對應到 TIER_LEVEL 的關係
**So that** 確保月跑 Stage 2 計分結果能正確分群至外部系統使用的 TIER_LEVEL，避免後續分派與通報資料錯誤

## 3. 前置條件

- 業務主管已登入並持有有效 JWT Token
- `is_sales_manager = TRUE`
- `ob_tier` 表存在於 AppDB（從舊系統 OBTIER 遷移）
- `ob_levelcard_level` 已有對應的 `card_level` 等級資料（由 F055 維護），TIER 對應的 `card_level` 必須存在於當前 active 計分版本中
- `assignment_run` 當下無 `status IN ('pending', 'running')` 的紀錄

## 4. 驗收標準

### AC-1：顯示目前 TIER_LEVEL 對應表

- **Given** 業務主管進入 TIER_LEVEL 對應設定頁
- **When** 頁面載入完成
- **Then** 顯示 `ob_tier` 中所有對應紀錄，欄位：CARD_TYPE、CARD_LEVEL、TIER_LEVEL、LIST_NM
- **And** 預設依 `(card_type, card_level)` 升冪排序
- **And** `list_nm` 為描述性欄位，OBTIER dump 中多數對應有值（如「期中名單」、「中結名單」、「機車中結滿期名單」），僅少數為 NULL；UI 將其顯示為次要欄位

### AC-2：修改對應關係

- **Given** 對應表已顯示
- **When** 業務主管修改某 `(card_type, card_level)` 的 `tier_level` 並點擊儲存
- **Then** 對應關係更新（針對 `ob_tier` 該複合 PK 紀錄 UPDATE），顯示儲存成功提示
- **And** 寫入 `assignment_audit_log`（`action = 'UPDATE'`, `entity_type = 'ob_tier'`, `entity_id = '{card_type}|{card_level}'`）

### AC-3：新增 TIER_LEVEL 對應

- **Given** 對應表已顯示
- **When** 業務主管點擊「新增對應」開啟 Modal，填入 CARD_TYPE、CARD_LEVEL、TIER_LEVEL，並送出 POST 至 5.3 端點
- **Then** 新增一列對應關係（INSERT 至 `ob_tier`），顯示新增成功提示
- **And** 若 DB 中 `(card_type, card_level)` 組合已存在，直接回傳 422 `TIER_LEVEL_DUPLICATE`，訊息：「CARD_TYPE {cardType} × CARD_LEVEL {cardLevel} 的對應已存在」
- **And** PUT 批次端點（5.2）的同類重複檢查見 BR-9（body 內 PK 重複時亦回傳 422 `TIER_LEVEL_DUPLICATE`）

### AC-4：CARD_LEVEL 必須存在（標準規則路徑）

- **Given** 業務主管選擇或輸入非空值的 CARD_LEVEL（即非 fallback 場景）
- **When** 前端/後端驗證
- **Then** 該 CARD_LEVEL 必須存在於目前 active 版本的 `ob_levelcard_level` 中（依 CARD_TYPE 對應），否則回傳 422 `CARD_LEVEL_NOT_FOUND_IN_VERSION`
- **And** 若 CARD_LEVEL 留空（fallback 規則路徑），改走 AC-4a，不觸發本驗證

### AC-4a：允許新增 CARD_LEVEL 為 NULL 的 fallback 對應

- **Given** 業務主管選擇某計分卡體系外的 CARD_TYPE（即 OBLEVELCARD_VERSION 中無對應紀錄者，如 `M5`，或過渡期的 `M3` / `HC` / `C3`）
- **When** 業務主管於新增 / 修改表單將 CARD_LEVEL 留空
- **Then** 系統允許寫入 `card_level IS NULL` 紀錄（如 `M5` → `T5M`），表示 fallback 對應規則（不分等級直接對應 TIER_LEVEL）
- **And** UI 須以視覺提示（如標籤 `Fallback` 或不同列底色）區分 fallback 規則與標準規則
- **And** 此情境不觸發 AC-4 的 `CARD_LEVEL_NOT_FOUND_IN_VERSION` 驗證
- **And** 對於 M3 / HC / C3 等過渡期 CARD_TYPE（OBLEVELCARD_VERSION 暫缺、但 OBMLISTDF 仍有名單筆數），允許先於 OBTIER 建立 fallback 對應；待業務補完整計分卡設定後改走標準路徑（CARD_LEVEL 非 NULL，AC-4）

### AC-5：月跑執行中禁止修改

- **Given** `assignment_run` 有 `status IN ('pending', 'running')` 的紀錄
- **When** 業務主管嘗試修改對應表
- **Then** 編輯按鈕 disabled，API 回傳 409 `SCORING_VERSION_LOCKED`

### AC-6：刪除單筆 TIER 對應

- **Given** 業務主管於 TIER_LEVEL 對應頁面看到某 `(cardType, cardLevel)` 列；無月跑鎖
- **When** 業務主管點擊該列的刪除按鈕並於確認對話框點擊「確認刪除」
- **Then** 呼叫 `DELETE /api/v1/assignment/scoring/tier-mapping`（query: `cardType` + `cardLevel`），HTTP 200，DB 中該複合 PK 紀錄被實體刪除（hard delete）
- **And** 寫入 `assignment_audit_log`（`action = 'DELETE'`、`entity_type = 'ob_tier'`、`entity_id = '{cardType}|{cardLevel ?? ""}'`、`before_value` 含 `tierLevel`、`after_value = null`）

### AC-7：刪除 fallback 對應（cardLevel = NULL）

- **Given** fallback 對應紀錄存在（`card_level IS NULL`，如 `M5` → `T5M`）
- **When** 業務主管點擊刪除按鈕並確認
- **Then** API 接受 `cardLevel` query 省略（不可用空字串，需與 BR-9 一致），執行 NULL 紀錄刪除
- **And** 寫入 `assignment_audit_log`，`entity_id = '{cardType}|'`（cardLevel 部份留空）

## 5. API 規格

### 5.1 GET /api/v1/assignment/scoring/tier-mapping

**Response — 200 OK**

```json
{
  "mappings": [
    { "cardType": "H", "cardLevel": "A", "tierLevel": "T1", "listNm": "期中名單" },
    { "cardType": "H", "cardLevel": "B", "tierLevel": "T2", "listNm": "期中名單" },
    { "cardType": "S", "cardLevel": "A", "tierLevel": "T32", "listNm": "中結名單" },
    { "cardType": "S5", "cardLevel": "A", "tierLevel": "T51", "listNm": "中結五年名單" },
    { "cardType": "HM", "cardLevel": "A", "tierLevel": "T1HM", "listNm": "機車期中名單" },
    { "cardType": "M5", "cardLevel": null, "tierLevel": "T5M", "listNm": "機車中結滿期名單" }
  ]
}
```

| 欄位 | 對應 `ob_tier` 欄位 | 說明 |
|------|---------------------|------|
| cardType | card_type | 計分卡類型（VARCHAR(5)，PK 組成） |
| cardLevel | card_level | 計分卡等級（VARCHAR(5)，PK 組成；如 A/B/C/D/E）。**fallback CARD_TYPE（如 M5）允許 null**，表示不分等級的 fallback 規則 |
| tierLevel | tier_level | 名單分群結果代碼（VARCHAR(5)） |
| listNm | list_nm | 名單名稱（VARCHAR(30)，optional 描述性欄位，不參與 join，可為 null） |

### 5.2 PUT /api/v1/assignment/scoring/tier-mapping

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
| cardType | string，maxLength 5 | 是 | 對應 `ob_tier.card_type` |
| cardLevel | string，maxLength 5 \| null | 是（值可為 null） | 對應 `ob_tier.card_level`；fallback CARD_TYPE 場景允許明確傳入 null（詳見 AC-4a） |
| tierLevel | string，maxLength 5 | 是 | 對應 `ob_tier.tier_level` |
| listNm | string，maxLength 30 \| null | 否 | 對應 `ob_tier.list_nm`；省略時保留現有值，明確傳入 null 則清空 |

**寫入語意**：批次 UPSERT，以 `(card_type, card_level)` 複合 PK 為對應鍵。

- 同一 request body 內 `(card_type, card_level)` 重複出現視為輸入錯誤，回傳 422 `TIER_LEVEL_DUPLICATE`（body 內 PK 重複，不執行任何寫入）
- 對於 body 中通過驗證的 mapping，若 DB 中已存在對應 PK 紀錄則 UPDATE，否則 INSERT
- request 中未列出的既有對應不會被刪除；如需刪除單筆對應，使用 §5.4 DELETE 端點

**Response — 200 OK**：更新筆數。

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
| 403 | AUTH_FORBIDDEN | `is_sales_manager` 未啟用 |
| 409 | SCORING_VERSION_LOCKED | 月跑執行中 |
| 422 | TIER_LEVEL_DUPLICATE | request body 內 `(card_type, card_level)` 組合重複 |
| 422 | CARD_LEVEL_NOT_FOUND_IN_VERSION | 指定的 `(card_type, card_level)` 組合不存在於 active 版本的 `ob_levelcard_level`（非 fallback 場景） |

### 5.3 POST /api/v1/assignment/scoring/tier-mapping

單筆新增端點，對應 prototype 28「新增對應」Modal。

**Request Body**

```json
{
  "cardType": "H",
  "cardLevel": "A",
  "tierLevel": "T1",
  "listNm": "期中名單"
}
```

欄位約束同 5.2（單一 mapping object）。

**寫入語意**：以 `(card_type, card_level)` 複合 PK 進行 INSERT；DB 中已存在對應紀錄時直接回 422，不執行 UPDATE（如需修改既有紀錄請走 5.2 PUT）。

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
| 403 | AUTH_FORBIDDEN | `is_sales_manager` 未啟用 |
| 409 | SCORING_VERSION_LOCKED | 月跑執行中 |
| 422 | TIER_LEVEL_DUPLICATE | DB 中 `(card_type, card_level)` 組合已存在 |
| 422 | CARD_LEVEL_NOT_FOUND_IN_VERSION | 指定的 `(card_type, card_level)` 組合不存在於 active 版本的 `ob_levelcard_level`（非 fallback 場景） |

### 5.4 DELETE /api/v1/assignment/scoring/tier-mapping

對應 AC-6 / AC-7：刪除指定 `(cardType, cardLevel)` 的單筆對應紀錄（包含 fallback 紀錄 `card_level IS NULL`）。

**Query Parameters**

| 參數 | 型別 | 必填 | 說明 |
|---|---|---|---|
| cardType | string | 是 | VARCHAR(5) |
| cardLevel | string | 否 | 省略時代表刪除 `card_level IS NULL` 的 fallback 紀錄；不可使用空字串（與 BR-9 一致，空字串非合法 PK 值） |

**Request Body**：無

**Response — 200 OK**

```json
{
  "cardType": "H",
  "cardLevel": "D",
  "deletedAt": "2026-05-14T08:30:00.000Z"
}
```

fallback 刪除回應範例（cardLevel 為 null）：

```json
{
  "cardType": "M5",
  "cardLevel": null,
  "deletedAt": "2026-05-14T08:30:00.000Z"
}
```

**錯誤回應**

| HTTP | 錯誤碼 | 說明 |
|---|---|---|
| 401 | AUTH_TOKEN_MISSING | 未登入 |
| 403 | AUTH_FORBIDDEN | `is_sales_manager` 未啟用 |
| 404 | TIER_MAPPING_NOT_FOUND | 指定的 `(cardType, cardLevel)` 對應不存在 |
| 409 | SCORING_VERSION_LOCKED | 月跑執行中 |

## 6. 商業規則

| 規則編號 | 說明 |
|---|---|
| BR-1 | `ob_tier` 以 `(card_type, card_level)` 為複合主鍵（遷移時補建，原 OBTIER 無 PK constraint）；同 CARD_TYPE 下 CARD_LEVEL 唯一，跨 CARD_TYPE 可重複。`list_nm` 為 optional 描述性欄位，不參與 PK、不影響 join 與寫入語意 |
| BR-2 | `tier_level` 值由業務方自由定義（如 T1/T2/T3/T4/T5M/THC/T3C 等，舊 SP 中存在多種值）；本功能不限制特定列舉 |
| BR-3 | 對應 CARD_LEVEL 必須存在於 active 版本的 `ob_levelcard_level`（同 CARD_TYPE 下） |
| BR-4 | 此對應表為靜態設定，直接修改生效版本（與 F054 的覆寫式設計一致）；歷史追溯依賴月跑 `assignment_run_snapshot.config_payload` |
| BR-5 | 月跑鎖定：`assignment_run.status IN ('pending', 'running')` 時禁止修改 |
| BR-6 | 特殊 CARD_TYPE（`M3` → `T5M`、`HC` → `THC`、`C3` → `T3C`）於舊 SP Stage2 L93-123 以 IF 分支硬編碼覆寫；本功能於 `ob_tier` 中以正常對應紀錄表達，不再使用硬編碼。OBMLISTDF dump 證實 M3 (31 筆)、HC (25 筆)、C3 (23 筆) 仍在使用（OQ-E07-28 決策），遷移腳本需：(a) 為 M3 / HC / C3 補 `ob_tier` seed（M3→T5M、HC→THC、C3→T3C），語意參考舊 SP Stage2 L93-123；(b) 為 M3 / HC / C3 補 `ob_levelcard_version` 計分卡（業務需提供計分設定，新系統不再保留 SP 硬編碼分支）。具體 seed 內容由 system-architect 於 data-model 或 open-questions 記載 |
| BR-7 | `ob_tier` 原表無稽核欄位；本功能對 `ob_tier` 的 INSERT / UPDATE 透過 `assignment_audit_log`（`entity_type = 'ob_tier'`）統一記錄稽核軌跡，與 E07 其他設定一致 |
| BR-8 | OBTIER 接受計分卡體系外的 CARD_TYPE（如 `M5`，dump 觀察存在於 OBTIER 但不存在於 OBLEVELCARD_VERSION），對應月跑 Stage 2 fallback 邏輯：當 CARD_TYPE 為 fallback 類型時，CARD_LEVEL 可為 NULL（如 `M5` → `T5M` 直接對應，不分等級）；UI 須以視覺提示區分 fallback 規則。注意：`HM` 雖過去亦缺 OBLEVELCARD_VERSION 紀錄，但依 OQ-E07-27 決策應補建為獨立計分卡（見 A-5），未來不再屬於 fallback 場景 |
| BR-9 | `ob_tier.card_level` 為 VARCHAR(5)、`ob_levelcard_level.card_level` 為 VARCHAR(1)；兩表 join 與驗證以字串精確比對；TIER 對應輸入超過 1 字元視為對應失敗，回 422 `CARD_LEVEL_NOT_FOUND_IN_VERSION`（fallback 場景 NULL 例外，見 AC-4a） |
| BR-10 | fallback 規則（`card_level IS NULL`）於 PostgreSQL `fn_calc_tier_level` 中必須以顯式 `IS NULL` 分支處理。舊 SP Stage2 L84-88 採 `LEFT JOIN OBTIER C ON A.CARD_LEVEL=C.CARD_LEVEL`，但 SQL 三值邏輯下 `A.CARD_LEVEL = C.CARD_LEVEL` 對 NULL 不會 match（OBTIER 中 `M5,,T5M` fallback 紀錄於舊 SP 實際未生效，M5 / M3 / HC / C3 依賴 SP L93-123 硬編碼 IF 分支補上）。新系統 function 需在 join 條件中顯式判斷 `IS NULL` 以正確啟用 fallback；具體 SQL 實作由 system-architect 於 architecture-spec 描述 |
| BR-11 | **DELETE 採 hard delete**：`ob_tier` 表無 status 欄位，刪除直接從 DB 移除紀錄；歷史追溯依 F066 月跑 snapshot；audit log 記錄 `action = 'DELETE'`、`entity_type = 'ob_tier'`、`entity_id = '{cardType}|{cardLevel ?? ""}'`、`before_value` 含 `tierLevel`、`after_value = null` |

## 7. UI/UX 需求

- 對應表 inline edit：CARD_TYPE / CARD_LEVEL / TIER_LEVEL 三欄為主，LIST_NM 為次要描述欄位（可摺疊）
- 預設先按 CARD_TYPE 分組顯示，組內依 CARD_LEVEL 升冪排序
- CARD_LEVEL 下拉選項依當前選定的 CARD_TYPE 動態載入：來自 `ob_levelcard_level` 中該 CARD_TYPE 的 active 版本 `card_level`
- TIER_LEVEL 採文字輸入（業務方自定義代碼）
- LIST_NM 採 optional 文字輸入（最多 30 字元），允許空白；不影響 PK 唯一性與寫入結果
- 新增按鈕開啟 Modal 表單
- 對應列右側操作區提供「刪除」icon 按鈕（trash icon，紅色 hover），點擊觸發確認對話框；月跑鎖定時 disabled
- **prototype 28 註記**：prototype L1165-1172 即為此功能 trash icon UI，現有設計可直接沿用，本次（v1.4）無需重繪

## 8. 相依性

- **Blocked By**：F055（需先確認 CARD_LEVEL 等級定義）
- **Blocks**：F061（月跑 Stage 2 TIER 對應邏輯依賴此設定）

## 9. 交叉參考

- 資料模型：[data-model.md#ob-tier-entity](../data-model.md#ob-tier-entity)（`ob_tier` 表定義，含 SP 證據與假設說明）
- 相關資料模型：[data-model.md#e07-data-model](../data-model.md#e07-data-model)（`ob_levelcard_level` CARD_LEVEL 分級門檻 — 由 F055 維護）
- 錯誤處理：[error-handling.md#assignment-scoring-errors](../error-handling.md#assignment-scoring-errors)（v1.4 新增 `TIER_MAPPING_NOT_FOUND`（404）；原 `CARD_LEVEL_NOT_FOUND` 已拆分重新命名為 `CARD_LEVEL_NOT_FOUND_IN_VERSION`（422，TIER 對應驗證用））
- 架構決策：AD-E07-3
- SP 來源：`reference/SP/Stage2_依照CardType分類TierLevel.sql`
- 相關功能：[F055](F055-edit-card-level-thresholds.md)、[F061](F061-trigger-assignment-run.md)

## 10. 假設

| # | 假設 | 標記 |
|---|---|---|
| A-1 | ~~`ob_tier` 完整 schema 待 DBA 提供~~ **已解決（2026-05-05）**：OBTIER schema 已取得（`reference/TableSchema/OB/OBTIER.sql`），共 4 欄（`LIST_NM` / `CARD_TYPE` / `CARD_LEVEL` / `TIER_LEVEL`）全部 NULLABLE、無 PK 約束、無稽核欄位。data-model.md `#ob-tier-entity` 已對應修正 | ✅ Resolved（OQ-E07-14 / A53） |
| A-2 | TIER_LEVEL 值不採系統列舉約束，由業務自定（舊 SP 中存在 T1~T5、T5M、THC、T3C 等變體） | [ASSUMPTION]（待業務確認） |
| A-3 | 舊 SP 中 `M3/HC/C3` CARD_TYPE 的硬編碼 TIER_LEVEL 覆寫，於遷移時轉為 `ob_tier` 正常對應紀錄；本功能不再保留硬編碼分支 | [ASSUMPTION]（待 system-architect 於遷移腳本確認；OQ-E07-28 已決策 M3/HC/C3 仍在使用，見 BR-6） |
| A-4 | `ob_tier` 遷移時補建 PK `(card_type, card_level)`（原 OBTIER 無 PK constraint），並將該兩欄與 `tier_level` 補上 NOT NULL 約束以保證 join 與輸出語意；`list_nm` 維持 NULLABLE | [ASSUMPTION]（記入 open-questions.md A54，待 system-architect 於遷移腳本確認） |
| A-5 | **OQ-E07-27 已決策（2026-05-13）**：不延續舊系統 `SP_OBLEVELCARD_HM` L80-82 借用 `A.CARD_TYPE='M'` 的 OBLEVELCARD_VERSION / COLUMN / SCORE 計算 HM 分數的設計。HM 須於 `ob_levelcard_version` 補建為獨立計分卡（業務需提供完整計分維度與分數設定）。OBMLISTDF dump 證實 HM 有 63 筆名單仍在月跑使用，此補建為月跑 prerequisite。對應 architecture-spec 預計新增的 AD-E07-15（HM 計分卡獨立化） | ✅ Decided（OQ-E07-27） |
| A-6 | OBMLISTDF dump 中含 `HB` (1 筆) / `SEB` (1 筆) / `SEC` (1 筆) 三種異常 CARD_TYPE，於 OBLEVELCARD_VERSION 與 OBTIER 均無對應紀錄。本次實作不處理（月跑遇此 CARD_TYPE 走 fallback 路徑或跳過），記入 open-questions 待業務確認後續方針 | [ASSUMPTION]（待業務確認） |
