---
spec-id: F077
title: 月份切換與名單五階段總覽
feature-id: F077
source-story: US-104, US-105, US-130, US-131, US-132
epic: E07
module: M01 名單定義
priority: P0-MVP
version: "1.3"
date: 2026-05-21
status: Draft
---

# F077: 月份切換與名單五階段總覽

Priority: P0-MVP | Status: Draft | Last Updated: 2026-05-21

> **v1.3（2026-05-21 / M01 v2.0~v2.3 Kanban 重構 + GAP-G6 收斂）**：依 US-105 v2.3 修正版 + US-130 Kanban + US-131 Detail Drawer + US-132 Ready CTA 補完角色 × 階段操作矩陣（GAP-G6 單一權威）：
> 1. **AC-11 / BR-7 矩陣完整化**：擴增為 5 stage × 4 role 全矩陣（含 `admin` 列、`user` 整頁封鎖列）；按鈕文字以對齊 prototype `27-list-definition.html` 為準，並修正 v1.2 漏列項目。
> 2. **AC-11 新增「查看」按鈕為跨 role / 跨 stage 通用操作**：所有 role 在所有 stage（含歷史月份、月跑鎖中）均可觸發 Detail Drawer（資料來源 `GET /assignment/list-definitions/:listNo/full-snapshot`，spec 見 [F050 v2.2 §6.2](F050-create-list-definition.md)）。
> 3. **AC-11 修正「停」→「停用」全寫**（US-105 v2.3）；ready stage 移除 per-card 月跑觸發按鈕（US-132；月跑唯一入口為 Ready 欄頂 CTA Banner，spec 見 [F061 v1.4 §9](F061-trigger-assignment-run.md)）。
> 4. **AC-11 修正 `director` 可見範圍**：`admin` / `director` 均**全可見**（不過濾轄區）；v1.2 BR-4「處長 `created_by` 過濾」維持不變（修正 US-105 v1 既存 bug 之 spec 描述）。
> 5. **BR-7 矩陣表格之 5 個橫切條件統一收斂**（歷史月份 / 月跑鎖 / 已停用 / 處長轄區 / 「查看」按鈕通用性）以避免每個 cell 重複描述。
> 6. **新增 BR-10 `user` 整頁封鎖**：`role='user'`（business_role 不論值）一律封鎖整頁，顯示「名單定義為部長 / 處長 / Admin 專屬功能」說明卡。
>
> **v1.2 救援重寫（2026-05-16）**：前一輪編碼事故損毀本檔內容，依 US-104 + US-105 + AD-E07 v3.0 一致性決議完整重建；Guard 為 `DirectorOrSectionChiefGuard`（清單瀏覽開放至處長）；業務角色欄位 `business_role`；JWT claim `businessRole`；保留 v1.0 / v1.1 所有設計決議。
> **v1.1 修訂（2026-05-16）**：補完角色 × 階段操作矩陣與 `current_work_ym` 計算規則之單一權威來源。

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + `data-model.md#ob-list-definition` + `data-model.md#current-work-ym-rule` + `error-handling.md#assignment-role-errors` |
| QA / Tester | 本文件 + `error-handling.md#assignment-role-errors` |
| UI/UX Designer | 本文件 §7 + `diagrams/F077-stage-overview.mmd` |
| Architect | 本文件 + `architecture-spec.md` §3.10 + `current_work_ym` 計算規則之單一權威 |

---

## 對應 User Story

- 來源 Story：
  - [US-104-M01-month-switch-history-readonly.md](../../stories/epics/E07-app-customer-list-assignment/US-104-M01-month-switch-history-readonly.md)
  - [US-105-M01-list-stage-overview.md](../../stories/epics/E07-app-customer-list-assignment/US-105-M01-list-stage-overview.md)
- Epic：[E07 — 客戶名單分派](../../stories/epics/E07-app-customer-list-assignment/epic-brief.md)
- 模組：M01 名單定義（月份切換 + 階段總覽）

---

## 1. 功能摘要

提供 M01 名單定義清單頁之**月份切換器**與**五階段狀態總覽**：

- 月份切換：可選範圍前後 12 個月（共 25 月）；歷史月份為唯讀；目前作業月份完整操作；未來月份允許預先建立草稿（部長 / Admin 限定）
- 階段總覽：清單每列顯示 `stage` 標籤（draft / dept_ratio / personnel_ratio / approval / ready / disabled），支援單選 / 多選階段篩選
- 處長僅見本轄區名單（依 `created_by` 過濾），且不顯示 M02 計分設定導覽
- 提供「角色 × 階段操作矩陣」單一權威，供 F050 v2.0 / F078 / F079 / F080 / F081 / F082 / F084 / F085 / F086 / F087 / F089 共用

**`current_work_ym` 規則（OQ-C-01 確認）**：每月 1 號 0:00 切換為該月（YYYYMM）；前端讀取後端提供之 `current_work_ym` 值，不自行計算

## 2. 使用者故事

**US-104 (As a)** 部長 / Admin / 處長
**I want** 在 E07 名單定義頁切換作業月份，查看過去或未來月份的名單狀態，並確保歷史月份呈現唯讀
**So that** 可追溯過去月份的名單配置，同時防止誤改已執行的歷史紀錄

**US-105 (As a)** 部長 / Admin / 處長
**I want** 在名單定義清單頁看到每份名單目前所在的五階段狀態，並能依階段篩選
**So that** 快速掌握每份名單的流程進度，識別尚未完成設定或等待確認的名單

## 3. 前置條件

- 使用者持 JWT 且 `business_role IN ('director', 'section_chief')` 或 admin
- 後端已實作 `current_work_ym` 計算服務（系統時鐘 + 可選 config 覆蓋）
- `ob_list_definition.stage` 欄位已存在（值為 ENUM：`draft` / `dept_ratio` / `personnel_ratio` / `approval` / `ready`）

## 4. 驗收標準

### AC-1：月份切換器顯示範圍

- **Given** 任意 E07 使用者進入 M01 名單定義頁
- **When** 頁面載入
- **Then** 頂部顯示月份切換器，可選範圍為目前作業月份前後各 12 個月（共 25 月）
- **And** 預設顯示目前作業月份
- **And** 超出 25 個月範圍的月份不可選取

### AC-2：歷史月份名單呈現唯讀

- **Given** 使用者選擇歷史月份（`< current_work_ym`）
- **When** 清單頁顯示該月份名單
- **Then** 所有操作按鈕（新增、編輯、停用、推進、Rollback、觸發月跑）均**完全不渲染**
- **And** 頁面頂部顯示提示條：「歷史月份資料為唯讀，不可修改」
- **And** 若透過 API 嘗試對歷史月份名單寫入，後端回 403 `LIST_HISTORICAL_READONLY`

### AC-3：`current_work_ym` 判斷規則（OQ-C-01）

- **Given** 後端計算 `current_work_ym`
- **When** 系統時鐘於當月 1 號 0:00（含）之後、下月 1 號 0:00 之前
- **Then** `current_work_ym = YYYYMM of today`（例：2026-06-15 → `202606`）
- **And** 前端透過 GET `/api/v1/system/current-work-ym` 取得，不自行計算
- **And** 若後端存在覆蓋 config（`WORK_YM_SWITCH_DAY` / `OVERRIDE_CURRENT_WORK_YM`），以 config 為準；否則預設每月 1 號 0:00 切換

### AC-4：目前作業月份保有完整操作能力

- **Given** 使用者選擇目前作業月份（或切換回目前月份）
- **When** 清單頁顯示
- **Then** 所有對應角色 × 階段的操作按鈕正常顯示
- **And** 不顯示「歷史月份唯讀」提示條

### AC-5：未來月份允許預先建立草稿（部長 / Admin 限定）

- **Given** 部長 / Admin 選擇未來月份（`> current_work_ym`）
- **When** 進入 M01 頁
- **Then** 顯示該月份名單清單
- **And** 部長 / Admin 可在未來月份新建草稿名單（限草稿階段操作）
- **And** 其他操作（推進、停用）依正常草稿階段邏輯執行

### AC-6：月份切換後 URL 或狀態更新

- **Given** 使用者切換至不同月份
- **When** 月份切換器選擇變更
- **Then** 頁面內容刷新為選定月份的名單清單
- **And** URL 更新（如 query param `?ym=202506`），使用者可直接分享連結

### AC-7：清單頁顯示每份名單之當前階段

- **Given** 部長 / Admin / 處長進入清單頁
- **When** 頁面載入
- **Then** 清單每列顯示 LIST_NO、LIST_NM、`stage` 標籤（中文：「草稿」/「部門比例設定」/「個別業務比例設定」/「簽核」/「準備完成」）、最後更新時間
- **And** 階段以視覺標籤（Tag / Badge）區分，不同階段使用不同顏色（草稿 = 灰色 / 部門比例 = 藍色 / 個別比例 = 紫色 / 簽核 = 橙色 / 準備完成 = 綠色）
- **And** 「已停用」名單以「已停用」灰色徽章獨立區分

### AC-8：依階段篩選名單列表

- **Given** 使用者在清單頁
- **When** 點擊階段篩選器，選取「草稿」或「部門比例設定」等
- **Then** 列表只顯示符合選取階段的名單
- **And** 可多選階段進行複合篩選
- **And** 清除篩選後恢復顯示所有名單（含停用除外的各階段）

### AC-9：已停用名單顯示規則

- **Given** 清單頁顯示當前月份名單
- **When** 頁面載入
- **Then** 預設不顯示已停用名單
- **And** 使用者可明確選取「已停用」篩選項查看本月已停用名單列表

### AC-10：處長可見範圍限本轄區，不顯示 M02 導覽

- **Given** 帳號持有「處長」角色
- **When** 進入清單頁
- **Then** 僅顯示本處長轄區（`created_by = currentUserId`）的名單；其他處長轄區不顯示
- **And** 頁面（含頂部 Tab 與側邊 Nav）**不顯示 M02 計分設定的任何入口連結**（OQ-C-03 決議）

### AC-11：各角色可見操作按鈕依階段與角色決定（角色 × 階段操作矩陣 / v1.3 完整化）

- **Given** 使用者在 M01 名單定義主頁（Kanban 主頁，見 [F048 v2.0](F048-view-list-definition.md)）查看名單卡片
- **When** 頁面渲染卡片操作按鈕
- **Then** 各名單卡片顯示的操作按鈕依「stage × role」矩陣決定（5 stage × 4 role 完整矩陣，詳見 §6 BR-7 矩陣表）
- **And** 「查看」按鈕為跨 role / 跨 stage / 跨歷史月份 / 跨月跑鎖中之**通用操作**：所有 role（含 `user`，但 `user` 整頁已封鎖故不適用）在所有 stage（draft / dept_ratio / personnel_ratio / approval / ready）皆可點擊「查看」觸發 Detail Drawer；資料來源 `GET /api/v1/assignment/list-definitions/:listNo/full-snapshot`，spec 見 [F050 v2.2 §6.2](F050-create-list-definition.md)
- **And** `ready` stage 無 per-card 月跑觸發按鈕（v1.3 / US-132 GAP-G3）；月跑唯一入口為 Ready 欄頂 CTA Banner（spec 見 [F061 v1.4 §9](F061-trigger-assignment-run.md)）
- **And** `draft` stage 之「停用」按鈕為**全寫**（不可縮寫為「停」；v1.3 / US-105 v2.3 修正）
- **And** 矩陣表中之 5 個橫切條件（歷史月份 / 月跑鎖中 / 已停用名單 / 處長轄區 / 「查看」按鈕通用性）統一收斂於 §6 BR-7 表格下方，避免每 cell 重複描述

### AC-12：階段狀態顯示支援歷史月份

- **Given** 使用者切換至歷史月份
- **When** 清單頁顯示歷史月份名單
- **Then** 顯示歷史月份各名單在當時最終達到的階段狀態
- **And** 歷史月份所有操作按鈕均不顯示（唯讀）

## 5. API 規格

### 5.1 GET /api/v1/system/current-work-ym

| 用途 | 取得當前作業月份 |
|---|---|
| 認證 | JWT 必填 |
| 權限 | 任意已認證使用者 |

**Response — 200 OK**

```json
{
  "currentWorkYm": "202605",
  "calculatedAt": "2026-05-15T13:00:00Z",
  "source": "system_clock"  // 或 "config_override"
}
```

### 5.2 GET /api/v1/assignment/lists

| 用途 | 取得指定月份之名單清單（含 stage 標籤） |
|---|---|
| 認證 | JWT 必填 |
| 權限 | `DirectorOrSectionChiefGuard` |

**Query Params**：
- `ym`（YYYYMM，必填，範圍 `current_work_ym ± 12`）
- `stage`（可選，多值 comma-separated；如 `stage=draft,approval`）
- `includeDisabled`（boolean，預設 false）

**Response — 200 OK**

```json
{
  "currentWorkYm": "202605",
  "selectedYm": "202605",
  "isHistorical": false,
  "isFuture": false,
  "lists": [
    {
      "listNo": "OB202605001",
      "listNm": "車貸催收名單",
      "stage": "draft",
      "stageLabel": "草稿",
      "status": "active",
      "createdBy": "user-uuid-xxx",
      "createdAt": "...",
      "updatedAt": "..."
    }
  ],
  "stageCounts": {
    "draft": 2,
    "dept_ratio": 1,
    "personnel_ratio": 1,
    "approval": 0,
    "ready": 1,
    "disabled": 0
  }
}
```

**錯誤代碼**

| HTTP | 錯誤碼 | 說明 |
|---|---|---|
| 401 | AUTH_TOKEN_MISSING / AUTH_TOKEN_EXPIRED | 未登入或 Token 過期 |
| 403 | AUTH_FORBIDDEN | 非 admin / director / section_chief |
| 400 | INVALID_YM_RANGE | `ym` 超出 `current_work_ym ± 12` |
| 400 | INVALID_YM_FORMAT | `ym` 非 YYYYMM 格式 |

## 6. 業務規則

| 規則編號 | 說明 |
|---|---|
| BR-1 | **`current_work_ym` 計算單一權威**：後端依系統時鐘判斷每月 1 號 0:00 切換；前端不自行計算，一律由 GET `/api/v1/system/current-work-ym` 取得；後端可由 config 覆蓋 |
| BR-2 | **月份範圍限制**：可選範圍 `current_work_ym ± 12`（共 25 月）；超出 → 400 `INVALID_YM_RANGE` |
| BR-3 | **歷史月份唯讀（單一權威）**：所有 E07 寫入端點（F050 / F078 / F079 / F080 / F081 / F082 / F084 / F085 / F086 / F087 / F089）依 `request.ym < current_work_ym` 攔截並回 403 `LIST_HISTORICAL_READONLY`；本 spec 為此規則之單一權威 |
| BR-4 | **處長轄區隔離**：處長 GET 列表時，後端依 `created_by = currentUserId` 過濾；admin / director 可跨轄區 |
| BR-5 | **預設不顯示已停用名單**：GET 列表預設 `includeDisabled = false`；使用者可選擇顯示 |
| BR-6 | **stage ENUM 定義**：`draft` / `dept_ratio` / `personnel_ratio` / `approval` / `ready`；UI 對應中文標籤定義於本 spec §7 |
| BR-7 | **角色 × 階段操作矩陣（v1.3 / GAP-G6 單一權威）**：本表為其他 E07 spec 之共用權威；各 spec 之 §7 UI/UX 渲染條件須對齊本表（不重複定義）。完整矩陣（5 stage × 4 role）見下方表格，5 個橫切條件統一於矩陣下方收斂。

**Role × Stage 操作矩陣（M01 Kanban 卡片可見按鈕，v1.3）**：

| stage | admin | director | section_chief | user |
|---|---|---|---|---|
| `draft` | 編輯 / 推進（F078） / **停用**（F052，全寫） / 查看 | 編輯 / 推進（F078） / **停用**（F052，全寫） / 查看 | 查看 | **整頁封鎖**（BR-10） |
| `dept_ratio` | 設定（F079） / 退回（F081） / 查看 | 設定（F079） / 退回（F081） / 查看 | 查看 | **整頁封鎖**（BR-10） |
| `personnel_ratio` | 檢視（F082 唯讀進入） / 退回（F085） / 查看 / 快速模板（F083） | 檢視（F082 唯讀進入） / 退回（F085） / 查看 / 快速模板（F083） | **設定本部門**（F082，限轄區） / 查看 | **整頁封鎖**（BR-10） |
| `approval` | 核准（F086） / 拒絕（F087） / 查看 | 核准（F086） / 拒絕（F087） / 查看 | 查看 | **整頁封鎖**（BR-10） |
| `ready` | 退回（F089） / 查看（**無** per-card 月跑觸發按鈕） | 退回（F089） / 查看（**無** per-card 月跑觸發按鈕） | 查看 | **整頁封鎖**（BR-10） |

**5 個橫切條件（套用於上述所有 cell）**：

| # | 條件 | 行為 |
|---|---|---|
| C-1 | **歷史月份**（`ym < current_work_ym`） | 所有 role 之**寫入按鈕完全不渲染**（編輯 / 推進 / 停用 / 設定 / 退回 / 核准 / 拒絕 / 快速模板）；僅保留「查看」按鈕；頁面頂部紅色「歷史月份資料為唯讀」橫幅（AC-2） |
| C-2 | **月跑鎖中**（`AssignmentRun.status IN ('pending','running')`） | 所有 role 之**寫入按鈕 disabled** + hover tooltip「分派執行中，無法 {操作}」；「查看」按鈕**不受影響**；Ready 欄頂 CTA Banner 改琥珀色 disabled 樣式（spec 見 [F061 v1.4 §9](F061-trigger-assignment-run.md)） |
| C-3 | **已停用名單**（`status = 'inactive'`） | Kanban 主視圖**不渲染**該卡片（隱藏）；若 [F048 v2.0](F048-view-list-definition.md) 提供「已停用」filter 顯示時，所有 role 僅顯示「查看」按鈕，無任何寫入操作 |
| C-4 | **處長轄區隔離**（`role = 'section_chief'`） | 後端依 `created_by = currentUserId` 過濾 Kanban 卡片來源；非本轄區卡片**不渲染於 Kanban**；本轄區卡片之 cell 按鈕仍依矩陣決定（沿用 BR-4） |
| C-5 | **「查看」按鈕通用性** | 「查看」按鈕在所有 role / 所有 stage / 歷史月份 / 月跑鎖中**皆可用**（不受 C-1 / C-2 影響）；觸發 Detail Drawer，資料來源 `GET /assignment/list-definitions/:listNo/full-snapshot`（spec 見 [F050 v2.2 §6.2](F050-create-list-definition.md)），不跳頁 |

| BR-8 | **未來月份預先建立草稿**：限部長 / Admin；其他階段操作（推進 / 設定比例）於未來月份不受限（但依矩陣決定可否顯示）|
| BR-9 | **M02 對處長隱藏（OQ-C-03）**：M02 計分設定之頂部 Tab + 側邊 Nav 入口連結對處長**完全隱藏**；F077 對應 SidebarNav 元件須依 `business_role` 條件渲染 |
| BR-10 | **`user` 整頁封鎖（v1.3 / US-130 AC-7）**：`role = 'user'`（business_role 不論值）一律封鎖整頁，Kanban 主體與 Toolbar 均不渲染；頁面顯示封鎖說明卡（圖示 + 「您無此頁面權限」標題 + 「『名單定義』為部長 / 處長 / Admin 專屬功能」說明）；對應 API（GET `/api/v1/assignment/lists`）後端 `DirectorOrSectionChiefGuard` 攔截，回 403 `AUTH_FORBIDDEN` |

## 7. UI/UX 需求

- **月份切換器**：
  - 位於頁面頂部（Sticky）
  - 元件：下拉選單或年月選擇器；格式「YYYY年MM月」
  - 預設顯示 `current_work_ym`
  - 範圍 `current_work_ym ± 12`，超出灰色不可選
  - 歷史月份顯示「歷史月份唯讀」灰色 banner
  - 未來月份顯示「未來月份預先建立」藍色 banner（限部長 / Admin）
- **階段標籤**（Badge / Tag 配色）：
  - 草稿 = 灰色（#9ca3af）
  - 部門比例設定 = 藍色（#3b82f6）
  - 個別業務比例設定 = 紫色（#8b5cf6）
  - 簽核 = 橙色（#f97316）
  - 準備完成 = 綠色（#22c55e）
  - 已停用 = 深灰色（#4b5563）+ 「停用」徽章
- **階段篩選器**：
  - 位於月份切換器下方
  - 多選 chips，可組合
  - 預設不勾選任何階段（顯示全部）
  - 「已停用」獨立選項，預設不勾選
  - 階段計數顯示（依 GET 回傳的 `stageCounts`）
- **清單表格**：
  - 欄位：LIST_NO / LIST_NM / 階段標籤 / 建立者 / 最後更新時間 / 操作
  - 操作欄按鈕依 BR-7 矩陣動態渲染
  - 處長轄區外名單**不渲染於列表**（後端已過濾）
- **SidebarNav**：
  - 處長身份**完全不渲染**「M02 計分設定」連結（OQ-C-03）
- **歷史月份唯讀提示條**：
  - 黃色 banner 顯示：「歷史月份資料為唯讀，不可修改」
  - 所有操作按鈕**完全不渲染**

## 8. 依賴關係

- **Blocked By**：
  - F048 v2.0（M01 清單頁基礎骨架）
  - F002（角色定義 + JWT claim `businessRole`）
- **Blocks（本 spec 為下列 spec 之操作矩陣權威）**：
  - F050 v2.0（建立草稿名單）
  - F078 / F079 / F080 / F081（M03a 階段操作）
  - F082 / F083 / F084 / F085（M03b 階段操作）
  - F086 / F087（M03c 簽核操作）
  - F088 / F089（M03d 準備完成操作）

## 9. 交叉參照

- **權限矩陣**：[F002 §4.6 E07 角色矩陣](F002-user-login.md#e07-角色矩陣)
- **資料模型**：
  - [data-model.md#ob-list-definition](../data-model.md#ob_list_definition)（`stage` 欄位）
  - [data-model.md#current-work-ym-rule](../data-model.md#current-work-ym-rule)（單一權威來源）
- **錯誤代碼**：
  - [error-handling.md#assignment-role-errors](../error-handling.md#assignment-role-errors)
  - [error-handling.md](../error-handling.md)（新增 `INVALID_YM_RANGE` / `INVALID_YM_FORMAT`）
- **架構決議**：AD-E07-1、`current_work_ym` 計算服務（沿用 system-architect Phase 1 設計）
- **相關功能**：所有 E07 名單操作 spec 之操作矩陣均對齊本 spec BR-7
- **圖表**：
  - [diagrams/F077-stage-overview.mmd](../diagrams/F077-stage-overview.mmd)（五階段總覽流程）
  - [diagrams/F077-role-stage-matrix.mmd](../diagrams/F077-role-stage-matrix.mmd)（角色 × 階段操作矩陣視覺化）

## 10. 測試覆蓋目標

- 單元測試覆蓋率 ≥ 80%
- 後端關鍵測試案例：
  - GET `/api/v1/system/current-work-ym` → 回正確 YYYYMM
  - 系統時鐘 = 2026-06-15 → `currentWorkYm = '202606'`
  - 系統時鐘 = 2026-05-31 23:59 → `currentWorkYm = '202605'`
  - 系統時鐘 = 2026-06-01 00:00 → `currentWorkYm = '202606'`
  - Config 覆蓋 → 回 config 值
  - GET `/api/v1/assignment/lists?ym=202605` → 回該月名單
  - GET `?ym=202506`（歷史月份）→ 回該月最終 stage、`isHistorical = true`
  - GET `?ym=202610`（未來月份）→ 回該月名單（可能為空）
  - GET `?ym=202417`（超出範圍）→ 400 `INVALID_YM_RANGE`
  - GET `?ym=20260`（格式錯誤）→ 400 `INVALID_YM_FORMAT`
  - GET `?stage=draft,approval` → 多階段篩選
  - 處長 GET → 僅本轄區名單（依 `created_by` 過濾）
  - 部長 GET → 跨轄區全部名單
  - 已停用名單：預設不回傳；`?includeDisabled=true` 回傳
- 前端關鍵測試案例：
  - 月份切換器預設值 = `current_work_ym`
  - 歷史月份切換後顯示 banner + 操作按鈕**完全不渲染**
  - 未來月份切換後顯示 banner（限部長 / Admin）
  - 階段篩選器多選 / 取消
  - 處長 SidebarNav **無**「M02 計分設定」連結
  - 部長 SidebarNav **有**「M02 計分設定」連結
  - 階段標籤顏色與文案
  - URL `?ym=` query param 同步
- E2E：切換月份 → 顯示對應月份名單 → 篩選階段 → 處長僅見本轄區 → 切換歷史月份 → 所有操作消失

## 11. 實作 Checklist

- [ ] 後端新增 `current_work_ym` 計算服務（系統時鐘 + config 覆蓋）
- [ ] 後端新增 `GET /api/v1/system/current-work-ym` 端點
- [ ] 後端新增 `GET /api/v1/assignment/lists` 端點（含 `ym` / `stage` / `includeDisabled` query）
- [ ] 後端套 `DirectorOrSectionChiefGuard` + 處長 `created_by` 過濾
- [ ] 後端 `ym` 範圍與格式驗證
- [ ] error-handling.md 新增 `INVALID_YM_RANGE` / `INVALID_YM_FORMAT`（`LIST_HISTORICAL_READONLY` 沿用既有）
- [ ] 前端 M01 頁面月份切換器元件
- [ ] 前端階段篩選器 + 階段標籤配色
- [ ] 前端歷史月份唯讀 banner
- [ ] 前端未來月份預先建立 banner
- [ ] 前端 SidebarNav 處長角色 M02 隱藏邏輯
- [ ] 前端 URL query param 同步
- [ ] 圖表：[diagrams/F077-stage-overview.mmd](../diagrams/F077-stage-overview.mmd) / [diagrams/F077-role-stage-matrix.mmd](../diagrams/F077-role-stage-matrix.mmd)
- [ ] 整合測試：切月份 → 階段篩選 → 處長轄區隔離 → 歷史月份唯讀 → 跨 spec 操作矩陣一致性驗證

## 12. 假設

| # | 假設 | 標記 |
|---|---|---|
| A-1 | **`WORK_YM_SWITCH_DAY` config 命名**：本 spec 預設每月 1 號切換；建議以 application config 提供覆蓋（`WORK_YM_SWITCH_DAY` / `OVERRIDE_CURRENT_WORK_YM`），便於測試 / 災難復原；命名由 system-architect 決議 | [ASSUMPTION] 待 system-architect |
| A-2 | **歷史月份 stage 顯示**：歷史月份名單之 stage 顯示為「當時最終達到的 stage」（即 `ob_list_definition.stage` 之最新值），不重建歷史快照；若需歷史快照需另設 `ob_list_definition_history` 表（MVP 不實作） | [ASSUMPTION] 待 PO |
| A-3 | **月份切換器範圍 25 月**：前後 12 + 當月 = 25；若 PO 要求其他範圍（如前 24 月）需更新 BR-2 與 §7 UI | [ASSUMPTION] 沿用 US-104 確認值 |
| A-4 | **未來月份草稿之 `created_by` 處長轄區隔離**：若部長在未來月份建立草稿，處長是否可於未來月份目睹該草稿？本 spec 預設「處長僅見本轄區 `created_by = currentUserId`」即可，未來月份草稿若由部長建立則處長不可見；如需處長預覽部長建立的未來草稿需新需求 | [ASSUMPTION] 待 PO |
| A-5 | **stage 配色**：本 spec 提供建議色碼，UI/UX Designer 可於 design system 統一調整；BR-6 之中文標籤須對齊 | [ASSUMPTION] 待 UI/UX |

## 13. 變更紀錄

| 版本 | 日期 | 變更內容 |
|---|---|---|
| v1.0 | 2026-05-15 | 初版（取代 US-104 + US-105，E07 補修批次 4）：合併兩 story 為「月份切換 + 階段總覽」單一 spec；新增 `current_work_ym` 計算服務；定義階段 ENUM + 中文標籤 + 配色；定義角色 × 階段操作矩陣（BR-7）作為其他 spec 之單一權威；處長 M02 隱藏（OQ-C-03） |
| v1.1 | 2026-05-16 | 補完角色 × 階段操作矩陣（明列 F082 / F083 / F087 / F088 / F089）與 `current_work_ym` 計算規則之單一權威說明 |
| v1.2 | 2026-05-16 | **救援重寫**：前一輪編碼事故損毀本檔內容，依 US-104 + US-105 + AD-E07 v3.0 一致性決議完整重建；Guard 名稱統一為 `DirectorOrSectionChiefGuard`（廢除 `SalesManagerGuard`）；保留 v1.0 / v1.1 所有設計決議 |
| v1.3 | 2026-05-21 | **M01 v2.0~v2.3 Kanban 重構 + GAP-G6 收斂**：(1) AC-11 完整化為 5 stage × 4 role 全矩陣，含 `admin` 列、`user` 整頁封鎖列；(2) AC-11 新增「查看」按鈕為跨 role / 跨 stage 通用操作，觸發 Detail Drawer（資料來源 F050 v2.2 §6.2 `/full-snapshot`）；(3) AC-11 修正「停」→「停用」全寫（US-105 v2.3）；ready stage 移除 per-card 月跑觸發按鈕（US-132），月跑唯一入口為 Ready 欄頂 CTA Banner（F061 v1.4 §9）；(4) 修正 `director` 全可見（不過濾轄區，BR-4 處長轄區隔離不變）；(5) BR-7 矩陣 5 個橫切條件統一收斂（C-1 歷史月份 / C-2 月跑鎖 / C-3 已停用 / C-4 處長轄區 / C-5「查看」通用性）；(6) 新增 BR-10 `user` 整頁封鎖（對應 US-130 AC-7） |
