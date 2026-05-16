---
spec-id: F070
title: 新增 CARD_TYPE 計分卡類型
feature-id: F070
source-story: US-094
epic: E07
module: M02 計分設定
priority: P0-MVP
version: "1.0"
date: 2026-05-14
status: Draft
---

# F070: 新增 CARD_TYPE 計分卡類型

Priority: P0-MVP | Status: Draft | Last Updated: 2026-05-14

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + `data-model.md#ob-card-type-entity` + `data-model.md#e07-data-model` + `error-handling.md#assignment-scoring-errors` |
| QA / Tester | 本文件 + `error-handling.md#assignment-scoring-errors` |
| UI/UX Designer | 本文件（第 7 節 UI/UX 需求） |
| Architect | 本文件 + `architecture-spec.md` §3.10 |

---

## 1. 功能摘要

提供業務部長新增一筆 CARD_TYPE 計分卡類型，包含代碼、名稱、PROD_KIND 綁定。新增操作在**同一 DB transaction** 內完成兩件事：① 寫入 `ob_card_type` 新紀錄；② 自動建立對應的 v1 空白 `ob_levelcard_version`，讓後續維度 / 分數 / 等級 / TIER 對應可即時於 Tab 2~5 設定。任一步驟失敗整體 rollback。月跑執行中禁止新增。

## 2. 使用者故事

**As a** 業務部長
**I want** 新增一種新的計分卡類型，並指定其代碼、名稱及對應的產品類別
**So that** 業務擴展新卡種時，可立即在系統中建立對應的計分設定結構，不需依賴 IT 直接操作資料庫

## 3. 前置條件

- 業務部長已登入並持有有效 JWT Token
- `businessRole='director'`（M02 寫入端點限部長，依 F002 §4.6.2）
- `assignment_run` 當下無 `status IN ('pending', 'running')` 紀錄
- `ob_code_df` 中至少有一筆 `tbl_id = 'PROD_KIND'` 啟用期間內的紀錄（由 F068 維護）

## 4. 驗收標準

### AC-1：填入基本資料新增，同 transaction 自動建立 v1 版本

- **Given** 業務部長在 Tab 1 點擊「新增計分卡類型」，開啟新增 Modal
- **When** 填入 `cardType`（必填，VARCHAR(5) 以內，英數字）、`cardName`（必填）、`prodKind`（必填，下拉來源：`ob_code_df WHERE tbl_id = 'PROD_KIND'` 啟用期間內紀錄），點擊「確認新增」
- **Then** 系統在同一 transaction 中執行：
  1. INSERT `ob_card_type`（`card_type` / `card_name` / `prod_kind` / `status = 'active'`）
  2. INSERT `ob_levelcard_version`（`card_type` = 同新建之 cardType、`card_name` = 同新建之 cardName、`card_version` = 1、`sdate` = 今日 YYYYMMDD、`edate` = `'20991231'`、`status` = `'active'`）
- **And** 任一步驟失敗整體 rollback，回傳 500 通用錯誤
- **And** 寫入 `assignment_audit_log`（`action = 'CREATE'`、`entity_type = 'ob_card_type'`、`entity_id = cardType`、`after_value` 含完整新增紀錄）
- **And** Modal 關閉，Tab 1 清單刷新，新 CARD_TYPE 列出並自動成為選中狀態

### AC-2：代碼唯一性驗證

- **Given** 業務部長於新增 Modal 輸入的 `cardType` 與 `ob_card_type` 中既有 `status = 'active'` 紀錄重複
- **When** 業務部長點擊「確認新增」
- **Then** API 回傳 422 `CARD_TYPE_DUPLICATE`，訊息：「計分卡代碼 `{cardType}` 已存在，請使用其他代碼」
- **And** 資料庫無寫入，Modal 不關閉，UI 於 cardType 欄位下方顯示錯誤訊息

### AC-3：新增後 Tab 2~5 顯示空狀態提示

- **Given** 業務部長成功新增 CARD_TYPE，系統自動建立 v1 空白計分版本
- **When** 業務部長切換至 Tab 2 / 3 / 4 / 5
- **Then** Tab 2（計分維度）顯示「目前無計分維度，請點擊『新增維度』開始設定」
- **And** Tab 3 / 4 / 5 顯示對應之空狀態提示（無錯誤訊息）

### AC-4：必填欄位驗證

- **Given** 業務部長未填入必填欄位（`cardType` / `cardName` / `prodKind` 任一為空）
- **When** 業務部長點擊「確認新增」
- **Then** 前端阻擋送出；若 client 跳過前端驗證直接呼叫 API，後端回 422 `VALIDATION_ERROR`，`details` 標明缺失欄位

### AC-5：PROD_KIND 必須屬於啟用期間內紀錄

- **Given** 業務部長送出之 `prodKind` 不存在於 `ob_code_df WHERE tbl_id = 'PROD_KIND'` 之啟用期間內紀錄
- **When** 後端驗證
- **Then** 回 422 `VALIDATION_ERROR`，`details` 註明 `prodKind` 欄位不合法

### AC-6：月跑執行中禁止新增

- **Given** `assignment_run` 有 `status IN ('pending', 'running')` 紀錄
- **When** 業務部長嘗試送出新增請求
- **Then** API 回 409 `ASSIGNMENT_RUN_ALREADY_RUNNING`
- **And** UI 端「新增計分卡類型」按鈕 disabled，hover 顯示「分派執行中，無法修改計分設定」

## 5. API 規格

### 5.1 POST /api/v1/assignment/scoring/card-types

**Controller 規範**：使用 `DirectorGuard` + `@RequireDirector()`（依 F002 §4.6.2，M02 計分卡寫入為部長專屬）。

**Request Body**

```json
{
  "cardType": "X1",
  "cardName": "測試卡",
  "prodKind": "01"
}
```

| 欄位 | 型別 | 必填 | 說明 |
|------|------|------|------|
| cardType | string，maxLength 5，僅允許英數字 | 是 | 對應 `ob_card_type.card_type` |
| cardName | string，maxLength 20 | 是 | 對應 `ob_card_type.card_name` |
| prodKind | string | 是 | 對應 `ob_card_type.prod_kind`；須存在於 `ob_code_df WHERE tbl_id = 'PROD_KIND'` 之啟用期間內紀錄 |

**Response — 201 Created**

```json
{
  "cardType": "X1",
  "cardName": "測試卡",
  "prodKind": "01",
  "prodKindName": "汽車",
  "status": "active",
  "cardVersion": 1,
  "createdAt": "2026-05-14T08:30:00.000Z"
}
```

**錯誤回應**

| HTTP | 錯誤碼 | 說明 |
|---|---|---|
| 401 | AUTH_TOKEN_MISSING | 未登入 |
| 403 | E07_REQUIRES_DIRECTOR | `businessRole` 非 `'director'`（`DirectorGuard` 攔截，依 F002 §4.6.2） |
| 409 | ASSIGNMENT_RUN_ALREADY_RUNNING | 月跑執行中禁止新增 |
| 422 | CARD_TYPE_DUPLICATE | `cardType` 與 active 紀錄重複 |
| 422 | VALIDATION_ERROR | 必填欄位缺失 / 欄位格式不合 / `prodKind` 不在啟用期間內 |

## 6. 商業規則

| 規則編號 | 說明 |
|---|---|
| BR-1 | 同 transaction 寫入 `ob_card_type` + `ob_levelcard_version`；任一失敗整體 rollback |
| BR-2 | `cardType` 唯一性檢查範圍為 `ob_card_type.status = 'active'`（停用紀錄不參與唯一性比對） |
| BR-3 | v1 自動建立 version 之初值（OQ-E07-34 ✅ Resolved 2026-05-14）：`sdate` = 今日（`YYYYMMDD`）、`edate` = `'20991231'`、`card_name` = 同新建之 cardName、`status` = `'active'` |
| BR-4 | `prod_kind` 必填，業務層保持 1:1 綁定（同一 CARD_TYPE 僅一個 PROD_KIND）；DB 層 FK 約束由 system-architect 決定 |
| BR-5 | 月跑執行中禁止新增（資料鎖：`assignment_run.status IN ('pending', 'running')` 時 API 直接回 409） |
| BR-6 | 新增成功後 audit log `action = 'CREATE'`，含完整新增紀錄；同 transaction 寫入 |
| BR-7 | 自動建立之 v1 `ob_levelcard_version` 不附帶任何 `ob_levelcard_column` / `score` / `level` 紀錄；業務部長須於 Tab 2~5 自行新增 |

## 7. UI/UX 需求

- 開啟 Modal 表單，欄位：CARD_TYPE 代碼（input，VARCHAR(5)）/ CARD_TYPE 名稱（input）/ PROD_KIND（下拉，顯示代碼 + 名稱）
- 「確認新增」按鈕：送出 API；成功後 Modal 關閉、Tab 1 清單刷新、新紀錄自動選中
- 失敗顯示行內錯誤（必填欄位 / 代碼重複 / PROD_KIND 不合法）
- 月跑鎖定時「新增計分卡類型」按鈕 disabled，視覺與 hover tooltip 由 UI/UX Designer 設計

## 8. 相依性

- **Blocked By**：F069（清單入口）、F068（PROD_KIND 代碼維護就緒）
- **Blocks**：F054（新建後可建立計分維度）、F055 / F056（新建後可設定 CARD_LEVEL / TIER 對應）、F061（月跑前置條件）

## 9. 交叉參考

- 資料模型：[data-model.md#ob-card-type-entity](../data-model.md#ob-card-type-entity)、[data-model.md#e07-data-model](../data-model.md#e07-data-model)（`ob_levelcard_version`）
- 錯誤處理：[error-handling.md#assignment-scoring-errors](../error-handling.md#assignment-scoring-errors)（含本次新增之 `CARD_TYPE_DUPLICATE`）
- 架構決策：AD-E07-1
- 相關功能：[F068](F068-edit-base-code.md)、[F069](F069-view-card-type-list.md)、[F071](F071-edit-card-type.md)、[F072](F072-disable-card-type.md)

## 10. 假設

| # | 假設 | 標記 |
|---|------|------|
| A-1 | OQ-E07-34（v1 自動建立規則）已決議（2026-05-14）：`sdate` = 今日、`edate` = `'20991231'`、`card_name` = 同 CARD_TYPE 名稱、`status` = `'active'` | ✅ Resolved |
| A-2 | `cardType` 字串組成（是否限定大寫英數字、是否禁特殊字元）為前端輸入限制與 DB constraint 細節，由 system-architect 於 data-model.md 與 architecture-spec 決定 | [ASSUMPTION] 交 system-architect |
| A-3 | Transaction isolation level 與 PostgreSQL lock 粒度由 system-architect 決定 | [ASSUMPTION] 交 system-architect |
