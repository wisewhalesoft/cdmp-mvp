---
spec-id: F069
title: 查看 CARD_TYPE 計分卡類型清單（M02 Tab 1）
feature-id: F069
source-story: US-093
epic: E07
module: M02 計分設定
priority: P0-MVP
version: "1.0"
date: 2026-05-14
status: Draft
---

# F069: 查看 CARD_TYPE 計分卡類型清單（M02 Tab 1）

Priority: P0-MVP | Status: Draft | Last Updated: 2026-05-14

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + `data-model.md#ob-card-type-entity` + `data-model.md#e07-data-model` + `error-handling.md#assignment-scoring-errors` |
| QA / Tester | 本文件 + `error-handling.md#assignment-scoring-errors` |
| UI/UX Designer | 本文件（第 7 節 UI/UX 需求） |
| Architect | 本文件 + `architecture-spec.md` §3.10（AssignmentScoring Service） |

---

## 1. 功能摘要

提供業務主管查看所有已設定的 CARD_TYPE 計分卡類型清單，作為 M02 計分設定的入口（5 Tab 結構中之 Tab 1）。選中之 CARD_TYPE 為頁面層級脈絡，驅動 Tab 2~5（F053 計分維度 / F054 維度編輯 / F055 CARD_LEVEL 門檻 / F056 TIER_LEVEL 對應）依此 CARD_TYPE 篩選資料。本功能為純唯讀查看；新增 / 編輯 / 停用操作分別由 F070 / F071 / F072 處理。

## 2. 使用者故事

**As a** 業務主管
**I want** 查看所有已設定的計分卡類型（CARD_TYPE）清單，以及每種卡別對應的產品類別（PROD_KIND）
**So that** 我能一眼掌握系統目前支援哪些計分卡種類、各計分卡與哪類產品相關聯，再決定是否需要新增或調整

## 3. 前置條件

- 業務主管已登入並持有有效 JWT Token
- `is_sales_manager = TRUE`
- `ob_code_df` 中至少有一筆 `tbl_id = 'PROD_KIND'` 啟用期間內的紀錄（由 F068 維護）

## 4. 驗收標準

### AC-1：顯示 CARD_TYPE 清單

- **Given** 業務主管已進入 M02 計分設定頁面，停留在 Tab 1
- **When** 頁面載入完成
- **Then** 顯示 `ob_card_type` 中 `status = 'active'` 的所有紀錄，每列包含：`card_type`（代碼）、`card_name`（名稱）、`prod_kind`（代碼）、`prod_kind_name`（產品類別名稱，後端 join `ob_code_df` 取 `tbl_desc1`）、`status`
- **And** 清單依 `card_type` 升序排列

### AC-2：預設選中第一筆並驅動 Tab 2~5

- **Given** CARD_TYPE 清單已顯示且至少有一筆資料
- **When** 頁面初始載入完成
- **Then** 清單自動選中第一列（依 `card_type` 升序的第一筆），以視覺高亮（如左側邊框色或列底色）標示
- **And** Tab 2~5 均依該選中 CARD_TYPE 載入對應資料

### AC-3：手動切換選中 CARD_TYPE 後 Tab 2~5 自動刷新

- **Given** 業務主管已在 Tab 1 查看清單
- **When** 業務主管點擊另一列 CARD_TYPE
- **Then** 頁面更新選中狀態至該列
- **And** Tab 2~5 自動依新選中 CARD_TYPE 重新載入資料；目前停留之 Tab 不變

### AC-4：PROD_KIND 提示（頁面頂部 banner + 列旁 badge）

- **Given** CARD_TYPE 清單已顯示
- **When** 業務主管查看頁面
- **Then** 頁面頂部顯示 info banner：「產品類別（PROD_KIND）由 M06 基礎代碼維護管理；如需新增或修改 PROD_KIND，請前往 M06」，banner 包含可點擊的「前往 M06」連結
- **And** CARD_TYPE 清單中每列的 `prod_kind` 以 badge 形式顯示（顯示 PROD_KIND 代碼與名稱）

### AC-5：清單為空狀態

- **Given** `ob_card_type` 無任何 `status = 'active'` 紀錄
- **When** 業務主管進入 M02 計分設定頁面
- **Then** Tab 1 顯示空狀態提示：「目前尚未設定任何計分卡類型，請點擊『新增計分卡類型』開始設定」
- **And** Tab 2~5 同樣顯示空狀態提示：「請先在 Tab 1 新增並選擇計分卡類型」

### AC-6：月跑執行中清單仍可查看（寫入按鈕 disabled）

- **Given** `assignment_run` 有 `status IN ('pending', 'running')` 的紀錄
- **When** 業務主管進入 M02 Tab 1
- **Then** 清單正常顯示（GET 不受月跑鎖影響）
- **And** 頁面顯示「分派執行中，無法修改計分設定」提示，新增 / 編輯 / 停用按鈕 disabled

## 5. API 規格

### 5.1 GET /api/v1/assignment/scoring/card-types

對應 AC-1：取得 CARD_TYPE 清單。

**Controller 規範**：使用 `SalesManagerGuard` + `@RequireSalesManager()`（與 E07 其他 controller 一致）。

**Query Parameters**

| 參數 | 型別 | 必填 | 說明 |
|---|---|---|---|
| status | string | 否 | 預設 `'active'`；可傳 `'all'` 取得包含 inactive 之全部紀錄（保留給管理視圖，MVP 前端不使用） |

**Response — 200 OK**

```json
{
  "cardTypes": [
    {
      "cardType": "E",
      "cardName": "滿期",
      "prodKind": "01",
      "prodKindName": "汽車",
      "status": "active"
    },
    {
      "cardType": "H",
      "cardName": "期中",
      "prodKind": "01",
      "prodKindName": "汽車",
      "status": "active"
    }
  ]
}
```

**Response 欄位說明**

| 欄位 | 型別 | 說明 |
|------|------|------|
| cardType | string | `ob_card_type.card_type`（VARCHAR(5)） |
| cardName | string | `ob_card_type.card_name` |
| prodKind | string | `ob_card_type.prod_kind`，對應 `ob_code_df.tbl_cd WHERE tbl_id = 'PROD_KIND'` |
| prodKindName | string \| null | 後端 join `ob_code_df` 之 `tbl_desc1`；若 PROD_KIND 已停用或不存在則為 null（UI 顯示「—」） |
| status | string | `'active'` 或 `'inactive'` |

**錯誤回應**

| HTTP | 錯誤碼 | 說明 |
|---|---|---|
| 401 | AUTH_TOKEN_MISSING | 未登入 |
| 403 | AUTH_FORBIDDEN | `is_sales_manager` 未啟用 |

## 6. 商業規則

| 規則編號 | 說明 |
|---|---|
| BR-1 | 預設僅顯示 `ob_card_type.status = 'active'` 紀錄；停用紀錄不參與 Tab 2~5 篩選下拉 |
| BR-2 | 每筆 `ob_card_type` 必須綁定一個 PROD_KIND（業務層保證非 NULL；DB 層 FK 與唯一性約束由 system-architect 設計，本 spec 不規定）｜ [ASSUMPTION] 交 system-architect |
| BR-3 | 排序：預設依 `card_type` 升冪 |
| BR-4 | 月跑執行中（`assignment_run.status IN ('pending', 'running')`）GET 端點不受鎖影響；UI 層需自行讀取月跑狀態以決定按鈕 disabled 狀態 |

## 7. UI/UX 需求

- Tab 1 採表格佈局，欄位：`card_type` / `card_name` / PROD_KIND badge / status / 操作（編輯 / 停用按鈕）
- Row-click selection：點擊整列觸發選中狀態，前端 State / Context 傳遞給 Tab 2~5
- 頁面頂部 PROD_KIND info banner（具備跳轉 M06 之連結）
- 月跑鎖定時操作按鈕 disabled，視覺呈現由 UI/UX Designer 決定
- 預設 5 Tab 結構：Tab 1（CARD_TYPE）/ Tab 2（計分維度）/ Tab 3（分數設定）/ Tab 4（CARD_LEVEL 門檻）/ Tab 5（TIER_LEVEL 對應）；具體佈局與視覺風格由 UI/UX Designer 設計

## 8. 相依性

- **Blocked By**：F001（登入驗證）、F068（PROD_KIND 代碼維護就緒）
- **Blocks**：F070 / F071 / F072（CARD_TYPE CRUD 鏈）、F053 / F054 / F055 / F056（Tab 2~5 依本功能選中 CARD_TYPE 篩選）

## 9. 交叉參考

- 資料模型：[data-model.md#ob-card-type-entity](../data-model.md#ob-card-type-entity)、[data-model.md#e07-data-model](../data-model.md#e07-data-model)
- 錯誤處理：[error-handling.md#assignment-scoring-errors](../error-handling.md#assignment-scoring-errors)
- 架構決策：AD-E07-1（OB 業務資料遷移至 AppDB）、AD-E07-3（複雜計分保留為 PostgreSQL function）
- 相關功能：[F068](F068-edit-base-code.md)（PROD_KIND 維護）、[F070](F070-create-card-type.md)、[F071](F071-edit-card-type.md)、[F072](F072-disable-card-type.md)、[F053](F053-view-scoring-dimensions.md)、[F054](F054-edit-scoring-dimension.md)、[F055](F055-edit-card-level-thresholds.md)、[F056](F056-edit-tier-mapping.md)

## 10. 假設

| # | 假設 | 標記 |
|---|------|------|
| A-1 | `ob_card_type` 為 AppDB 新建表，無對應舊系統 OB 表；欄位 schema（含 FK / unique index / cascade 行為）由 system-architect 於 data-model.md `#ob-card-type-entity` 與 migration 中設計 | [ASSUMPTION] 交 system-architect |
| A-2 | `ob_card_type.prod_kind` 是否須建立 FK constraint 指向 `ob_code_df` 為 DB 層級設計決策，spec 僅規定業務層 1:1 綁定 | [ASSUMPTION] 交 system-architect |
| A-3 | 月跑鎖（`SCORING_VERSION_LOCKED`）僅作用於寫入端點；GET 端點不受影響（與 F053 / F055 一致） | ✅ Decided |
