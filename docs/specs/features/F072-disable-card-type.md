---
spec-id: F072
title: 停用 CARD_TYPE 計分卡類型（級聯刪除）
feature-id: F072
source-story: US-096
epic: E07
module: M02 計分設定
priority: P0-MVP
version: "1.0"
date: 2026-05-14
status: Draft
---

# F072: 停用 CARD_TYPE 計分卡類型（級聯刪除）

Priority: P0-MVP | Status: Draft | Last Updated: 2026-05-14

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + `data-model.md#ob-card-type-entity` + `data-model.md#e07-data-model` + `error-handling.md#assignment-scoring-errors` |
| QA / Tester | 本文件 + `error-handling.md#assignment-scoring-errors` |
| UI/UX Designer | 本文件（第 7 節 UI/UX 需求） |
| Architect | 本文件 + `architecture-spec.md` §3.10 + `architecture-spec.md` 附錄 E07-A（資料分層） |

---

## 1. 功能摘要

提供業務部長停用 CARD_TYPE 計分卡類型。停用操作為**不可復原的破壞性級聯 hard delete**：於同一 DB transaction 內清除 `ob_card_type` 本身與 5 張下游計分設定表（`ob_levelcard_version` / `ob_levelcard_column` / `ob_levelcard_score` / `ob_levelcard_level` / `ob_tier`）所有匹配紀錄；歷史月名單分派快照（`assignment_run_snapshot`）與歷史分派結果（`ob_pool_data_list`）**不被影響**，供 F066 歷史追溯使用。執行前需業務部長二次確認；若該 CARD_TYPE 仍被 `ob_list_definition` active 紀錄引用，顯示警告但允許繼續（OQ-E07-30 ✅ Resolved）。月名單分派執行中禁止停用。

## 2. 使用者故事

**As a** 業務部長
**I want** 停用已不再使用的計分卡類型，並自動清除其所有下游計分設定紀錄
**So that** 系統不再將該 CARD_TYPE 納入月名單分派計算，且資料保持一致，不留孤兒紀錄

## 3. 前置條件

- 業務部長已登入並持有有效 JWT Token
- `businessRole='director'`（M02 寫入端點限部長，依 F002 §4.6.2）
- 待停用之 `cardType` 存在於 `ob_card_type` 且 `status = 'active'`
- `assignment_run` 當下無 `status IN ('pending', 'running')` 紀錄

## 4. 驗收標準

### AC-1：刪除預覽端點顯示級聯範圍

- **Given** 業務部長於 Tab 1 點擊某 CARD_TYPE 的「停用」按鈕
- **When** 前端呼叫刪除預覽端點（`GET /api/v1/assignment/scoring/card-types/:cardType/delete-preview`）
- **Then** 回應內容包含五張下游表的即將刪除筆數：
  - `ob_levelcard_version`：N1 筆
  - `ob_levelcard_column`：N2 筆
  - `ob_levelcard_score`：N3 筆
  - `ob_levelcard_level`：N4 筆
  - `ob_tier`：N5 筆
- **And** 額外回傳 `listDefinitionsAffected`（`ob_list_definition WHERE card_type = :cardType AND status = 'active'` 之紀錄數）供 UI 警示顯示

### AC-2：確認對話框顯示影響範圍與警示

- **Given** 預覽端點回應
- **When** UI 開啟確認對話框
- **Then** 對話框顯示「停用計分卡類型 `{cardType} — {cardName}` 後，以下資料將被永久刪除，此操作不可復原：」並列出 AC-1 之五張下游表筆數
- **And** 若 `listDefinitionsAffected > 0`，額外顯示警示文字：「注意：該計分卡仍有 `{listDefinitionsAffected}` 筆有效名單定義（`ob_list_definition`）。停用後這些名單定義的月名單分派將因無計分設定而無法執行，請確認已妥善處理相關名單定義後再停用」
- **And** 對話框包含「確認停用」（紅色危險按鈕）與「取消」兩個選項

### AC-3：確認後執行級聯 hard delete（同 transaction）

- **Given** 業務部長閱讀警示後點擊「確認停用」
- **When** 前端呼叫 DELETE 端點並帶上 `confirmCascade=true` query
- **Then** 後端於同一 transaction 內依以下順序執行 hard delete：
  1. `DELETE FROM ob_tier WHERE card_type = :cardType`
  2. `DELETE FROM ob_levelcard_score WHERE card_type = :cardType`
  3. `DELETE FROM ob_levelcard_level WHERE card_type = :cardType`
  4. `DELETE FROM ob_levelcard_column WHERE card_type = :cardType`
  5. `DELETE FROM ob_levelcard_version WHERE card_type = :cardType`
  6. `DELETE FROM ob_card_type WHERE card_type = :cardType`
- **And** 任一步驟失敗整體 rollback
- **And** 寫入 `assignment_audit_log`（`action = 'DELETE'`、`entity_type = 'ob_card_type'`、`entity_id = cardType`、`before_value` 含 6 張表刪除筆數摘要 + `listDefinitionsAffected`、`after_value = null`）

### AC-4：級聯範圍明確排除項目（OQ新-1 ✅ Resolved）

- **Given** 停用操作成功
- **When** 系統完成 transaction
- **Then** 以下資料**不被刪除，保持原狀**：
  - `assignment_run_snapshot`：歷史月名單分派快照中包含該 CARD_TYPE 的 payload 完整保留，供 F066 歷史追溯
  - `ob_pool_data_list`：歷史分派結果保留（歷史結果不可變更）。**本表不含 `card_type` 欄位**（`card_type` 隸屬 CARD_TYPE / 計分版本層而非分派結果列），實作上無需 join 篩選；級聯刪除概念上不影響此表所有紀錄
  - `ob_list_definition`：名單定義紀錄保留（包含引用該 CARD_TYPE 的 active 紀錄），由業務部長自行處理

### AC-5：缺少 `confirmCascade=true` 時拒絕執行

- **Given** 業務部長或 client 未帶 `confirmCascade=true` query 即呼叫 DELETE
- **When** 後端驗證
- **Then** 回 422 `CARD_TYPE_CASCADE_NOT_CONFIRMED`，訊息：「級聯刪除需要二次確認，請於請求帶上 `confirmCascade=true`」
- **And** 資料庫無任何刪除動作

### AC-6：停用後 Tab 1 清單刷新與 Tab 2~5 切換空狀態

- **Given** 停用成功
- **When** Modal 關閉後
- **Then** Tab 1 清單刷新，已刪除之 CARD_TYPE 不再顯示
- **And** 若該 CARD_TYPE 為當前 Tab 1 之選中狀態，刪除後選中狀態被清除，Tab 2~5 顯示「請選擇計分卡類型以查看設定」空狀態
- **And** 不自動選中其他 CARD_TYPE（由業務部長主動選擇）

### AC-7：cardType 不存在

- **Given** URL path 之 `:cardType` 在 `ob_card_type` 中無紀錄
- **When** 後端查找
- **Then** 回 404 `CARD_TYPE_NOT_FOUND`

### AC-8：月名單分派執行中禁止停用

- **Given** `assignment_run` 有 `status IN ('pending', 'running')` 紀錄
- **When** 業務部長嘗試送出 DELETE 請求
- **Then** API 回 409 `ASSIGNMENT_RUN_ALREADY_RUNNING`
- **And** UI 端「停用」按鈕 disabled

## 5. API 規格

### 5.1 GET /api/v1/assignment/scoring/card-types/:cardType/delete-preview

對應 AC-1：取得刪除預覽資訊供 UI 確認對話框顯示。

**Controller 規範**：使用 `DirectorGuard` + `@RequireDirector()`（依 F002 §4.6.2，M02 計分卡寫入為部長專屬）。

**Path Parameters**

| 參數 | 型別 | 必填 | 說明 |
|---|---|---|---|
| cardType | string | 是 | 待停用之 CARD_TYPE 代碼 |

**Response — 200 OK**

```json
{
  "cardType": "H",
  "cardName": "期中",
  "cascade": {
    "versions": 1,
    "columns": 8,
    "scores": 40,
    "levels": 4,
    "tierMappings": 4
  },
  "listDefinitionsAffected": 3
}
```

**錯誤回應**

| HTTP | 錯誤碼 | 說明 |
|---|---|---|
| 401 | AUTH_TOKEN_MISSING | 未登入 |
| 403 | E07_REQUIRES_DIRECTOR | `businessRole` 非 `'director'`（`DirectorGuard` 攔截，依 F002 §4.6.2） |
| 404 | CARD_TYPE_NOT_FOUND | 指定的 cardType 不存在 |

### 5.2 DELETE /api/v1/assignment/scoring/card-types/:cardType

**Controller 規範**：使用 `DirectorGuard` + `@RequireDirector()`（依 F002 §4.6.2，M02 計分卡寫入為部長專屬）。

**Path Parameters**

| 參數 | 型別 | 必填 | 說明 |
|---|---|---|---|
| cardType | string | 是 | 待停用之 CARD_TYPE 代碼 |

**Query Parameters**

| 參數 | 型別 | 必填 | 說明 |
|---|---|---|---|
| confirmCascade | boolean | 是 | 必須為 `true`，作為二次確認 |

**Request Body**：無

**Response — 200 OK**

```json
{
  "cardType": "H",
  "deletedCascade": {
    "versions": 1,
    "columns": 8,
    "scores": 40,
    "levels": 4,
    "tierMappings": 4
  },
  "listDefinitionsAffected": 3,
  "deletedAt": "2026-05-14T08:30:00.000Z"
}
```

**錯誤回應**

| HTTP | 錯誤碼 | 說明 |
|---|---|---|
| 401 | AUTH_TOKEN_MISSING | 未登入 |
| 403 | E07_REQUIRES_DIRECTOR | `businessRole` 非 `'director'`（`DirectorGuard` 攔截，依 F002 §4.6.2） |
| 404 | CARD_TYPE_NOT_FOUND | 指定的 cardType 不存在 |
| 409 | ASSIGNMENT_RUN_ALREADY_RUNNING | 月名單分派執行中禁止停用 |
| 422 | CARD_TYPE_CASCADE_NOT_CONFIRMED | 缺少 `confirmCascade=true` query |

## 6. 商業規則

| 規則編號 | 說明 |
|---|---|
| BR-1 | 採級聯 hard delete（與 F052 名單軟刪除模式不同；理由：CARD_TYPE 為「計分卡定義」非「業務狀態」，刪除應從歷史結構中清除；歷史追溯由 F066 月名單分派 snapshot 提供）。`ob_card_type` 本身亦為 hard delete，與下游 5 張表一致 |
| BR-2 | 級聯範圍嚴格限定下列 5 張下游表：`ob_levelcard_version` / `ob_levelcard_column` / `ob_levelcard_score` / `ob_levelcard_level` / `ob_tier`；不擴及其他 E07 表 |
| BR-3 | **明確排除項目**（OQ新-1 ✅ Resolved 2026-05-14）：`ob_pool_data_list`（歷史分派結果）、`assignment_run_snapshot`（歷史快照）、`ob_list_definition`（名單定義）**不在級聯範圍**；歷史資料保留原則優先於資料一致性。**`ob_pool_data_list` 不含 `card_type` 欄位**（`card_type` 隸屬 CARD_TYPE / 計分版本層而非分派結果列），實作上無需 join 篩選此表；級聯刪除概念上不影響此表所有紀錄 |
| BR-4 | **`ob_list_definition` 引用警告**（OQ-E07-30 ✅ Resolved 2026-05-14）：刪除前後端先 query `ob_list_definition WHERE card_type = :cardType AND status = 'active'` 計算 `listDefinitionsAffected`；非零時 audit log 額外記載，UI 顯示警告但**不強制攔截**（允許停用） |
| BR-5 | 兩階段確認：刪除前必須先呼叫預覽端點（5.1），DELETE 請求必須帶 `confirmCascade=true` query；違反回 422 `CARD_TYPE_CASCADE_NOT_CONFIRMED` |
| BR-6 | 6 個刪除步驟（5 張下游表 + `ob_card_type` 本身）必須於**同一 transaction** 完成；任一失敗整體 rollback |
| BR-7 | 月名單分派執行中禁止停用（`assignment_run.status IN ('pending', 'running')` 時 API 直接回 409 `ASSIGNMENT_RUN_ALREADY_RUNNING`） |
| BR-8 | Audit log 寫入與業務寫入須於同 transaction（與 E07 其他 audit 設計一致） |
| BR-9 | 刪除順序：依現有業務邏輯 FK 依賴關係由「子表」至「父表」執行；具體順序與 DB 層 FK constraint 是否補建（含 `ON DELETE CASCADE` 是否使用）由 system-architect 於 data-model.md / migration 決定 | [ASSUMPTION] 交 system-architect |

## 7. UI/UX 需求

- Tab 1 每列右側顯示「停用」icon 按鈕（紅色語意，月名單分派鎖定時 disabled）
- 點擊停用觸發兩階段確認：
  1. 前端先呼叫 5.1 預覽端點取得級聯筆數
  2. 開啟確認對話框，顯示影響範圍 + 警告（若有 `listDefinitionsAffected > 0`）
  3. 業務部長點擊「確認停用」（紅色危險按鈕）後呼叫 5.2 DELETE 端點帶 `confirmCascade=true`
- 停用成功後 Tab 1 清單刷新；若被停用之 CARD_TYPE 為當前選中，清除選中狀態，Tab 2~5 切換為空狀態提示
- 月名單分派鎖定時「停用」按鈕 disabled，hover tooltip 顯示「分派執行中，無法修改計分設定」
- 失敗（404 / 409 / 422）以 toast 或 inline error 顯示

## 8. 相依性

- **Blocked By**：F069（清單入口）、F070（新建後才有紀錄可停用）
- **Blocks**：無（停用為終點操作）

## 9. 交叉參考

- 資料模型：[data-model.md#ob-card-type-entity](../data-model.md#ob-card-type-entity)、[data-model.md#e07-data-model](../data-model.md#e07-data-model)（下游 5 張表）、[data-model.md#ob-tier-entity](../data-model.md#ob-tier-entity)
- 錯誤處理：[error-handling.md#assignment-scoring-errors](../error-handling.md#assignment-scoring-errors)（含本次新增之 `CARD_TYPE_CASCADE_NOT_CONFIRMED`、`CARD_TYPE_NOT_FOUND`）
- 架構決策：AD-E07-1
- 相關功能：[F066](F066-view-run-snapshot-detail.md)（歷史快照追溯）、[F068](F068-edit-base-code.md)、[F069](F069-view-card-type-list.md)、[F070](F070-create-card-type.md)、[F071](F071-edit-card-type.md)

## 10. 假設

| # | 假設 | 標記 |
|---|------|------|
| A-1 | OQ-E07-30（`ob_list_definition` 引用警告）✅ Resolved 2026-05-14：警告但允許停用，audit 記錄引用數 | ✅ Resolved |
| A-2 | OQ新-1（級聯範圍排除 `ob_pool_data_list`）✅ Resolved 2026-05-14：歷史保留，級聯不擴及 | ✅ Resolved |
| A-3 | `ob_card_type` 本身採 hard delete（與下游一致）為 PO 決策；歷史追溯交 F066 snapshot | ✅ Decided（PO 2026-05-14） |
| A-4 | DB 層 FK constraint 是否補建（含 `ON DELETE CASCADE` 是否啟用）、transaction isolation level、刪除順序之 lock 粒度由 system-architect 於 data-model / migration 決定 | [ASSUMPTION] 交 system-architect |
| A-5 | 預覽端點與 DELETE 端點之間可能有 race condition（如另一 admin 同時新增下游紀錄），由 system-architect 決定鎖定策略；本 spec 預設「最後一刻為準」（DELETE 內部重新計數寫入 audit） | [ASSUMPTION] 交 system-architect |
