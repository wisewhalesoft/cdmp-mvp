---
spec-id: F048
title: 查看本月名單定義清單
feature-id: F048
source-story: US-070, US-130, US-131, US-132, US-133
epic: E07
module: M01 名單定義
priority: P0-MVP
version: "2.0"
date: 2026-05-21
status: Draft
---

# F048: 查看本月名單定義清單

Priority: P0-MVP | Status: Draft | Last Updated: 2026-05-21

> **v2.0（2026-05-21 / M01 v2.0~v2.3 Kanban 重構）**：主頁呈現由 v1.0 平鋪表格改為 5 欄 Kanban 看板（GAP-G4 收斂）。核心變更：
> 1. **§4 新增 AC-Kanban 系列**：5 欄看板（draft / dept_ratio / personnel_ratio / approval / ready）/ 卡片格式（LIST_NO / LIST_NM / 篩選條件 chips ≤2 / 建立者 / 建立日期 / CR 狀態 badge）/ KPI 4 卡 / 月份準備度進度條 / 搜尋過濾 / 「查看」按鈕觸發 Detail Drawer（對齊 US-130 / US-131）
> 2. **§4 AC-Toolbar 規則**：Toolbar 僅保留搜尋框 + 「新增名單」按鈕（director / admin 可見）；**移除**「執行月跑」與「Stage 0 試算」重複入口（對齊 US-070 v2.3 / US-132 GAP-G3，月跑唯一入口改為 Ready 欄頂 CTA Banner，spec 見 [F061 v1.4 §9](F061-trigger-assignment-run.md)）
> 3. **§5 GET API 擴充**：response 補 `stageCounts`（5 階段計數，供 KPI 卡與占比進度條計算）；「查看」按鈕觸發 Detail Drawer 之資料來源為 [F050 v2.2 §6.2](F050-create-list-definition.md) `/full-snapshot`
> 4. **§8 UI/UX 全段重寫**：v1.0 之表格列格式 deprecated；改為 Kanban 卡片格式 + Ready 欄頂 CTA Banner（cross-reference F061 v1.4 / F049 v1.1）+ 歷史月份紅色橫幅 + `user` 整頁封鎖（對齊 F077 v1.3 BR-10）
> 5. **v1.0 之 AC-1（表格列格式）/ AC-5（使用中/已停用頁籤）以 strikethrough 保留**；Kanban 版以「已停用 filter」取代頁籤切換語意；操作矩陣統一由 [F077 v1.3 BR-7](F077-month-switch-and-stage-overview.md) 規範，本 spec 不重複定義
> 6. **GAP-G2 sessionStorage signal protocol consumer**：M01 主頁 init 時讀取 `cdmp.pendingToast` 並顯示 toast；規範細節見 [F050 v2.2 §7 BR-13](F050-create-list-definition.md)，本 spec 僅 reference，不重複定義

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + `data-model.md#e07-data-model` + `error-handling.md#assignment-errors` + `F050-create-list-definition.md`（§6.2 Detail Snapshot API + §7 BR-13 sessionStorage signal）+ `F077-month-switch-and-stage-overview.md`（Role × Stage 矩陣 single authority）|
| QA / Tester | 本文件 + `error-handling.md#assignment-errors` + `F050 §6.2 / §7 BR-13` + `F077 §6 BR-7` |
| UI/UX Designer | 本文件（第 8 節 UI/UX 需求）+ `prototypes/27-list-definition.html`（canonical reference） |
| Architect | 本文件 + `architecture-spec.md` §3.10（AssignmentList Service）|

---

## 1. 功能摘要

提供業務部長 / 業務處長 / Admin（`role IN ('admin','user') AND businessRole IN ('director','section_chief')`，admin 視為超集）查看本作業年月（YYYYMM）所有 active 名單定義的入口頁。**v2.0 起頁面採 5 欄 Kanban 看板呈現**（draft / dept_ratio / personnel_ratio / approval / ready），每張名單以卡片形式陳列於其 stage 對應欄；同時提供 KPI 4 卡（總數 / 進行中 / 待簽核 / 準備完成）+ 月份準備度進度條，作為 M01 所有操作的入口（新增 → F050、編輯 → F051、停用 → F052、per-LIST_NO 部門比例 → F079、單一 LIST_NO 案件試算 → F049、推進 / 退回 → F078 / F081 / F085 / F089、簽核 → F086 / F087、Detail Drawer 唯讀檢視 → 觸發 [F050 v2.2 §6.2](F050-create-list-definition.md) `/full-snapshot`）。月跑執行中全部寫入按鈕鎖定（disabled，「查看」不受影響）。寫入類操作（新增 / 編輯 / 停用 / 推進 / 退回 / 簽核）依 [F077 v1.3 BR-7](F077-month-switch-and-stage-overview.md) Role × Stage 矩陣決定；本 spec 不重複定義按鈕渲染條件。

**月跑唯一入口為 Ready 欄頂 CTA Banner**（v2.0 / US-132），Toolbar 不再渲染「執行月跑」或「Stage 0 試算」按鈕，避免重複入口；spec 見 [F061 v1.4 §9](F061-trigger-assignment-run.md)。

## 2. 使用者故事

**As a** 業務部長 / 業務處長 / Admin
**I want** 在 M01 名單定義主頁以 Kanban 看板查看本月各階段名單分佈，並能透過「查看」按鈕快速檢視單一名單之完整快照（4 個頁籤）
**So that** 在觸發月跑之前以橫向視角快速掌握全月名單流程進度，識別積壓階段與尚未就緒之名單

## 3. 前置條件

- 使用者已通過驗證（E01），持有有效 JWT Token
- JWT payload `role IN ('admin','user')` 且當 `role='user'` 時 `businessRole IN ('director','section_chief')`；後端套用 `DirectorOrSectionChiefGuard`（依 F002 §4.6.2）
- AppDB 已完成 E07 schema migration（`ob_list_definition`、`assignment_run` 等表已建立）
- `ob_list_definition.stage` 欄位已存在（值為 ENUM：`draft` / `dept_ratio` / `personnel_ratio` / `approval` / `ready`）
- 後端已實作 `current_work_ym` 計算服務（見 [F077 v1.3](F077-month-switch-and-stage-overview.md)）

## 4. 驗收標準

> **v2.0 結構說明**：v1.0 之 AC-1（表格列格式）/ AC-5（使用中/已停用頁籤）以 strikethrough 保留為歷史紀錄；v2.0 新增 AC-K1~AC-K10（Kanban 主頁系列）。其他 AC（AC-2 / AC-3 / AC-4）保留並補 v2.0 補述。

### ~~AC-1（v1.0 deprecated）~~：~~顯示本月名單定義清單（表格列格式）~~

> **v2.0 廢除**：表格列格式由 Kanban 看板取代，見 AC-K1~AC-K3；新增按鈕入口由 AC-K7 規範

- ~~**Given** 業務部長 / 業務處長已登入並進入名單定義頁面~~
- ~~**When** 頁面載入完成~~
- ~~**Then** 顯示本作業年月（YYYYMM）下所有 `status = 'active'` 的名單定義列表，每列包含：`list_no`、`list_nm`、`prod_kind`、篩選條件摘要、預估客戶數量，並提供「編輯」、「停用」、「設定部門比例」、「計算案件數量」操作欄~~
- ~~**And** 清單依 `list_no` 升序排列~~
- ~~**And** 頁面標頭顯示「新增名單定義」按鈕（觸發 F050）~~

### AC-2：展開單一名單條件詳情（v2.0 補述）

- **Given** Kanban 主頁已顯示
- **When** 使用者點擊任一卡片上的「查看」按鈕（依 [F077 v1.3 BR-7 C-5](F077-month-switch-and-stage-overview.md)，所有 role / 所有 stage / 歷史月份 / 月跑鎖中皆可觸發）
- **Then** 頁面右側滑入 Detail Drawer（4 個頁籤：篩選條件 / 部門比例 / 個別比例 / 簽核歷史），資料來源 `GET /api/v1/assignment/list-definitions/:listNo/full-snapshot`（[F050 v2.2 §6.2](F050-create-list-definition.md)）
- **And** 同名單在所有 stage 之 Drawer 行為與 stage-aware null state 規則依 [F050 v2.2 §6.2](F050-create-list-definition.md) 之 Response Schema 規範執行
- **And** 處長帳號於「個別比例」頁籤僅顯示本轄區之 dept members（後端 layer 過濾，對應 [F050 v2.2 §6.2](F050-create-list-definition.md) 「處長轄區隔離」段落）

### AC-3：無資料時的引導提示（v2.0 補述）

- **Given** 本月 `ob_list_definition` 無 `project_workym = :currentYm AND status = 'active'` 記錄
- **When** 頁面載入完成
- **Then** Kanban 5 欄各欄顯示「無名單」灰色提示文字（AC-K2），KPI 4 卡均顯示 0
- **And** Toolbar 之「新增名單」按鈕（director / admin 可見）為 CTA 入口；無 banner 級別之引導提示

### AC-4：月跑執行中所有寫入按鈕鎖定（v2.0 補述 / cross-reference [F077 v1.3 BR-7 C-2](F077-month-switch-and-stage-overview.md)）

- **Given** `assignment_run` 存在 `status IN ('pending', 'running')` 的紀錄
- **When** 任一 role 在本頁面
- **Then** Toolbar 之「新增名單」按鈕 disabled；Kanban 卡片所有寫入按鈕（編輯 / 推進 / 停用 / 設定 / 退回 / 核准 / 拒絕 / 快速模板）disabled + hover tooltip「分派執行中，無法 {操作}」
- **And** Ready 欄頂 CTA Banner 改琥珀色 disabled 樣式（主按鈕 + secondary「試算」按鈕均 disabled，spec 見 [F061 v1.4 §9](F061-trigger-assignment-run.md)）
- **And** 「查看」按鈕**不受影響**（依 F077 v1.3 BR-7 C-5）
- **And** 頁面頂部顯示橘色通知列：「分派執行中，名單定義暫時鎖定，無法進行新增、編輯、推進或退回操作」

### ~~AC-5（v1.0 deprecated）~~：~~使用中／已停用頁籤切換~~

> **v2.0 廢除**：Kanban 主頁以「已停用 filter」取代頁籤切換語意；已停用名單**不渲染**於 Kanban 主視圖（依 [F077 v1.3 BR-7 C-3](F077-month-switch-and-stage-overview.md)）。若 UX 需查閱已停用名單，由獨立 view 或 filter chip 提供，本 v2.0 不規範該入口（屬未來 enhancement）

- ~~**Given** 業務部長 / 業務處長已進入名單定義頁面~~
- ~~**When** 頁面載入完成~~
- ~~**Then** 顯示兩個獨立頁籤：「使用中」（`status = 'active'`）與「已停用」（`status = 'inactive'`）~~
- ~~**And** 預設顯示「使用中」頁籤；「已停用」頁籤僅供唯讀查閱，不顯示「編輯」與「停用」按鈕~~

### AC-K1：頁面主體呈現 5 欄 Kanban 看板（v2.0 新增 / US-130 AC-1）

- **Given** 部長 / Admin / 處長進入 M01 名單定義主頁
- **When** 頁面載入完成（依目前作業月份，或月份切換器選定的月份）
- **Then** 頁面主體顯示 5 欄看板，由左至右依序為：草稿（`draft`）/ 部門比例（`dept_ratio`）/ 個別比例（`personnel_ratio`）/ 待簽核（`approval`）/ 準備完成（`ready`）
- **And** 每欄欄頭以顏色區分階段（沿用 [F077 v1.3 §7](F077-month-switch-and-stage-overview.md) stage 配色：草稿灰 / 部門比例藍 / 個別比例青 / 待簽核琥珀 / 準備完成綠）
- **And** 每欄欄頭右側顯示該欄名單數量（數字 badge，白字），值來自 GET API response `stageCounts`
- **And** 欄頭下方顯示 mini progress bar，反映該欄名單數量占當月總數（`stageCounts[s] / sum(stageCounts)`）的百分比

### AC-K2：名單以卡片形式展示於對應欄位（v2.0 新增 / US-130 AC-2）

- **Given** 本月有若干份名單分散於各階段
- **When** 頁面渲染 Kanban
- **Then** 每份名單以卡片形式顯示於其 `stage` 對應的欄位中；每張卡片顯示以下欄位（依 prototype `27-list-definition.html`）：
  - LIST_NO（等寬字體，藍色）
  - LIST_NM（名單名稱，主標）
  - CR 狀態 badge（`crEnabled=true` 顯示綠底「CR」、`false` 顯示灰底「CR 停」）
  - 篩選條件摘要 chips（最多 2 個，超出顯示 `+N`；categorical 顯示 `{displayName}:{label1/label2+N}`、numeric 顯示 `{displayName}:{min}~{max}`；`conditionPayload IS NULL` 之舊名單顯示 `LEGACY` badge）
  - 建立者（含 icon）
  - 建立日期
  - 操作按鈕區（依 [F077 v1.3 BR-7](F077-month-switch-and-stage-overview.md) Role × Stage 矩陣渲染）
- **And** 若某欄無名單，顯示「無名單」灰色提示文字
- **And** 卡片欄位可垂直捲動（超過可見高度 720px 時）

### AC-K3：4 個 KPI 卡顯示月份總覽數據（v2.0 新增 / US-130 AC-3）

- **Given** 頁面載入完成
- **When** 系統依目前月份取得名單數據
- **Then** 頁面頂部顯示 4 個 KPI 卡：
  - **名單總數** = `stageCounts.draft + dept_ratio + personnel_ratio + approval + ready`
  - **進行中** = `stageCounts.dept_ratio + personnel_ratio + approval`
  - **待簽核** = `stageCounts.approval`
  - **準備完成** = `stageCounts.ready`
- **And** 各 KPI 卡數字隨月份切換即時更新

### AC-K4：月份準備度進度條（v2.0 新增 / US-130 AC-4）

- **Given** 頁面載入完成
- **When** 系統計算本月各階段名單分佈
- **Then** KPI 卡與 Kanban 看板之間顯示一條水平進度條，以五色段（對應五個 stage，配色沿用 [F077 v1.3 §7](F077-month-switch-and-stage-overview.md)）呈現各階段名單數量占比
- **And** 進度條左側標示「YYYY-MM 月份準備度」、已就緒份數（`stageCounts.ready / 總數`）與百分比
- **And** 進度條右側標示「尚有 N 份未完成準備」（N = 總數 - ready）

### AC-K5：搜尋框即時過濾 Kanban 卡片（v2.0 新增 / US-130 AC-5）

- **Given** 頁面顯示 Kanban 看板
- **When** 使用者在 Toolbar 搜尋框輸入關鍵字
- **Then** 各欄僅顯示 LIST_NM 或 LIST_NO 包含關鍵字（case-insensitive）的卡片，其餘卡片隱藏
- **And** 各欄欄頭的名單數量 badge 更新為過濾後的可見數量
- **And** 清空搜尋框後恢復顯示所有卡片，badge 數字恢復

### AC-K6：歷史月份下看板全部進入唯讀模式（v2.0 新增 / US-130 AC-6 / cross-reference [F077 v1.3 BR-7 C-1](F077-month-switch-and-stage-overview.md)）

- **Given** 使用者切換至歷史月份（`ym < current_work_ym`）
- **When** Kanban 渲染歷史月份名單
- **Then** 頁面頂部顯示「歷史月份資料為唯讀」紅色橫幅（含鎖頭 icon + 月份標示）
- **And** 所有卡片上的寫入操作按鈕（編輯 / 推進 / 停用 / 設定 / 退回 / 核准 / 拒絕 / 快速模板）**完全不渲染**；僅保留「查看」按鈕（依 F077 v1.3 BR-7 C-5）
- **And** Toolbar 「新增名單」按鈕**完全不渲染**
- **And** Ready 欄頂 CTA Banner**完全不渲染**（spec 見 [F061 v1.4 §9](F061-trigger-assignment-run.md)）

### AC-K7：Toolbar 規則（v2.0 新增 / US-070 v2.3 AC-1 / GAP-G3）

- **Given** 部長 / Admin / 處長進入 M01 主頁
- **When** 頁面載入完成
- **Then** Toolbar 區域**僅**包含以下元素：
  1. 搜尋框（全 role 可見）：搜尋 LIST_NM 或 LIST_NO
  2. 「新增名單」按鈕（僅 `director` / `admin` 可見，且非歷史月份）：點擊跳轉至 F050 新增名單表單
- **And** Toolbar **不存在**「執行月跑」按鈕（移除重複入口，月跑唯一入口為 Ready 欄頂 CTA Banner，spec 見 [F061 v1.4 §9](F061-trigger-assignment-run.md)）
- **And** Toolbar **不存在**「Stage 0 試算」按鈕（移除重複入口，試算入口為 Ready CTA Banner 之 secondary 按鈕，spec 見 [F049 v1.1 §8](F049-stage0-daily-estimate.md)）
- **And** 月跑執行中（`AssignmentRun.status IN ('pending','running')`）時，「新增名單」按鈕為 disabled + hover tooltip（依 AC-4）

### AC-K8：`user` 角色整頁封鎖（v2.0 新增 / US-130 AC-7 / cross-reference [F077 v1.3 BR-10](F077-month-switch-and-stage-overview.md)）

- **Given** 帳號 `role = 'user'`
- **When** 進入 M01 名單定義主頁
- **Then** Kanban 主體與 Toolbar 均**不渲染**；取而代之顯示封鎖說明卡（圖示 + 「您無此頁面權限」標題 + 「『名單定義』為部長 / 處長 / Admin 專屬功能」說明）
- **And** 對應 GET API 由後端 `DirectorOrSectionChiefGuard` 攔截，回 403 `AUTH_FORBIDDEN`

### AC-K9：sessionStorage `cdmp.pendingToast` 消化（v2.0 新增 / US-133 / cross-reference [F050 v2.2 §7 BR-13](F050-create-list-definition.md)）

- **Given** 使用者從子頁（29a F079 / 29b F082 / 29c F086 / F087）完成或取消操作後跳回 M01 主頁
- **When** M01 主頁完成初始化（`DOMContentLoaded` 或 React `useEffect([])`，於 Kanban 渲染**之後**）
- **Then** 主頁依 [F050 v2.2 §7 BR-13](F050-create-list-definition.md) consumer 規範讀取並顯示 toast，並立即 `removeItem` 達 consume-once 語意
- **And** 無 key / 無效 JSON 時靜默不顯示（含清除殘留 key），不拋 uncaught exception
- **And** 本 spec 不重複定義 payload schema / key 命名 / producer 行為 — 該等規範以 [F050 v2.2 §7 BR-13](F050-create-list-definition.md) 為 single authority

### AC-K10：處長轄區隔離（v2.0 新增 / cross-reference [F077 v1.3 BR-7 C-4](F077-month-switch-and-stage-overview.md)）

- **Given** 帳號 `businessRole = 'section_chief'`
- **When** 進入 M01 主頁
- **Then** Kanban 主頁**僅渲染本處長轄區之卡片**（後端依 `created_by = currentUserId` 過濾）；非本轄區卡片不渲染、不計入 `stageCounts`、不計入 KPI 卡
- **And** 頁面 header 顯示「轄區檢視」識別徽章（淺青色背景 + filter icon）
- **And** 處長可見 stage × 操作按鈕依 [F077 v1.3 BR-7](F077-month-switch-and-stage-overview.md) 矩陣決定（多數 cell 僅顯示「查看」）

## 5. API 規格

### 5.1 GET /api/v1/assignment/list-definitions（v2.0 擴充）

| Query Parameter | 型別 | 必填 | 說明 |
|---|---|---|---|
| ym | string（YYYYMM） | 否 | 預設為目前作業年月；超出 `current_work_ym ± 12` 回 400 `INVALID_YM_RANGE`（依 F077 v1.3 BR-2） |
| status | string | 否 | `active` / `inactive`，預設 `active`；v2.0 Kanban 主視圖僅渲染 `active` 卡片，`inactive` 由獨立 filter chip 提供（屬未來 enhancement） |
| stage | string | 否 | 多值 comma-separated（如 `stage=draft,approval`）；不指定則回所有 stage |
| q | string | 否 | 搜尋關鍵字（模糊比對 LIST_NM / LIST_NO，case-insensitive）；v2.0 起前端搜尋亦支援後端 query 為 fallback |

**Response — 200 OK（v2.0 擴充）**

```json
{
  "currentWorkYm": "202605",
  "selectedYm": "202605",
  "isHistorical": false,
  "isFuture": false,
  "data": [
    {
      "listNo": "OB202605001",
      "listNm": "2026-05 業務一部 主力催收",
      "stage": "draft",
      "stageLabel": "草稿",
      "status": "active",
      "cardType": "S5",
      "crEnabled": true,
      "listPeriodStart": 1,
      "listPeriodEnd": 6,
      "listInterval": 1,
      "conditionPayload": {
        "conditions": [
          { "columnName": "prod_kind", "fieldType": "categorical", "values": ["02","03"] }
        ],
        "logic": "AND"
      },
      "legacyEntityFallback": null,
      "createdBy": "user-uuid-001",
      "createdByEmpNm": "王部長",
      "createdAt": "2026-05-02T01:14:00Z",
      "updatedAt": "2026-05-02T01:14:00Z",
      "estimatedCount": 8500
    }
  ],
  "stageCounts": {
    "draft": 2,
    "dept_ratio": 2,
    "personnel_ratio": 3,
    "approval": 1,
    "ready": 3
  },
  "lockState": {
    "locked": false,
    "reason": null,
    "runId": null
  }
}
```

| 欄位 | 來源 | 說明 |
|---|---|---|
| `currentWorkYm` | system clock | 後端計算之當前作業月份（依 [F077 v1.3 §5.1](F077-month-switch-and-stage-overview.md)） |
| `selectedYm` | query `ym` | 使用者選定查看的月份 |
| `isHistorical` | `selectedYm < currentWorkYm` | 是否為歷史月份；前端依此渲染唯讀橫幅與隱藏寫入按鈕 |
| `isFuture` | `selectedYm > currentWorkYm` | 是否為未來月份 |
| `data[]` | `ob_list_definition` join | 依 `selectedYm` 過濾之 active 名單清單；處長帳號後端依 `created_by` 過濾 |
| `data[].conditionPayload` | `ob_list_definition.condition_payload` | JSONB；可為 `null`（舊名單） |
| `data[].legacyEntityFallback` | `ob_list_definition` 5 個 backward-compat entity column | 僅當 `conditionPayload IS NULL` 時非 null |
| `data[].estimatedCount` | 實時計算 | 對共享案件池 `ob_pool_data` 套用 WHERE 子句 COUNT；v2.0 起為選填欄位（前端 Kanban 卡片不顯示此值，僅 Detail Drawer / Stage 0 試算用） |
| `stageCounts` | aggregate | 5 個 stage 之名單計數，供 KPI 卡（AC-K3）與 mini progress bar（AC-K1）/ 月份準備度進度條（AC-K4）計算 |
| `lockState.locked` | `assignment_run.status IN ('pending','running')` | 月跑鎖狀態；前端依此渲染寫入按鈕 disabled 狀態（AC-4） |
| `lockState.runId` | `assignment_run.run_id` | 月跑鎖中時對應的 run_id（供 deep-link 至 F062 進度頁，選填） |

**錯誤回應**

| HTTP | 錯誤碼 | 說明 |
|---|---|---|
| 400 | INVALID_YM_RANGE | `ym` 超出 `current_work_ym ± 12`（依 [F077 v1.3](F077-month-switch-and-stage-overview.md) BR-2） |
| 400 | INVALID_YM_FORMAT | `ym` 非 YYYYMM 格式 |
| 401 | AUTH_TOKEN_MISSING / AUTH_TOKEN_EXPIRED | 未登入或 Token 無效 |
| 403 | AUTH_FORBIDDEN | `role = 'user'` 或 `businessRole` 不在 `('director','section_chief')`（`DirectorOrSectionChiefGuard` 攔截，依 F002 §4.6.2 / 對應 AC-K8） |
| 500 | SYSTEM_INTERNAL_ERROR | 伺服器內部錯誤 |

### 5.2 「查看」按鈕觸發 Detail Drawer

- 端點規格見 [F050 v2.2 §6.2 GET /api/v1/assignment/list-definitions/:listNo/full-snapshot](F050-create-list-definition.md)
- 本 spec 不重複定義；F048 為**呼叫方**（caller），F050 為**端點來源**（owner）

## 6. 商業規則

| 規則編號 | 說明 |
|---|---|
| BR-1 | GET 端點僅 `role = 'admin'` 或（`role = 'user'` 且 `businessRole IN ('director','section_chief')`）可存取（`DirectorOrSectionChiefGuard`，依 F002 §4.6.2）；寫入類按鈕之渲染條件由 [F077 v1.3 BR-7](F077-month-switch-and-stage-overview.md) Role × Stage 矩陣決定，本 spec 不重複定義 |
| BR-2 | `ym` 預設值為當前伺服器作業年月（依 [F077 v1.3 BR-1](F077-month-switch-and-stage-overview.md)）；範圍限制依 F077 v1.3 BR-2（`current_work_ym ± 12`，共 25 月） |
| BR-3 | 月跑鎖由 `assignment_run.status IN ('pending','running')` 即時判斷，回傳於 `lockState.locked` |
| BR-4 | **v2.0 廢除（沿用 F077 BR-4）**：處長轄區隔離由後端 `created_by = currentUserId` 過濾實作；admin / director 可跨轄區查看所有名單（修正 v1 director 誤過濾 bug） |
| BR-5 | `estimatedCount` 於清單 API 為選填欄位；v2.0 Kanban 卡片不顯示此值，避免每月 N 筆案件 COUNT 拖慢列表載入；若前端需顯示 estimatedCount，建議於 Detail Drawer 或 F049 試算頁延遲計算 |
| BR-6 | **v2.0 新增**：Kanban 主視圖僅渲染 `status='active'` 卡片；`inactive` 名單不渲染（依 [F077 v1.3 BR-7 C-3](F077-month-switch-and-stage-overview.md)） |
| BR-7 | **v2.0 新增**：`stageCounts` 為後端 aggregate 計算，需與 `data[]` 過濾結果一致（同 ym / 同 status / 同處長轄區過濾）；前端搜尋框過濾屬 client-side，不影響 `stageCounts` 之服務端值（client-side 過濾另計 visible badge） |

## 7. 錯誤場景

| 場景 | 系統回應 | 參考 |
|---|---|---|
| 未登入存取 | HTTP 401 | error-handling.md#auth-errors |
| `role='user'` 或 `businessRole` 不符 | HTTP 403 `AUTH_FORBIDDEN` | AC-K8 / error-handling.md#auth-errors |
| `ym` 超範圍 | HTTP 400 `INVALID_YM_RANGE` | F077 v1.3 |
| 伺服器錯誤 | HTTP 500 | error-handling.md#system-errors |

## 8. UI/UX 需求（v2.0 重寫）

**Prototype canonical reference**：`prototypes/27-list-definition.html`（v2.3.1，2026-05-21 起）

### 8.1 整體佈局（top → bottom）

1. **Sidebar**（左側 collapsible，沿用全站規範；M02 對處長隱藏依 [F077 v1.3 BR-9](F077-month-switch-and-stage-overview.md)）
2. **Header**：頁面標題「客戶名單分派 — 名單定義」+ 月份切換器（[F077 v1.3 §7](F077-month-switch-and-stage-overview.md)）+ 處長身份「轄區檢視」識別徽章 + role switcher（僅 prototype demo，落地時 React 不渲染）+ user-name
3. **歷史月份紅色橫幅**（僅歷史月份顯示，AC-K6）
4. **KPI 4 卡**（AC-K3）：grid 4 欄，總數 / 進行中 / 待簽核 / 準備完成
5. **月份準備度進度條**（AC-K4）：水平五色 segment + 左側 readyHeader + 右側 readyHint
6. **Toolbar**（AC-K7）：左側搜尋框（min-width 240px） + 右側「新增名單」按鈕（director / admin 可見）
7. **Kanban 5 欄看板**（AC-K1 / AC-K2）：grid 5 欄等寬，每欄含欄頭 + occupancy bar + Ready CTA Banner（僅 ready 欄）+ 卡片區（max-height 720px scrollable）
8. **Detail Drawer**（AC-2，右側 slide-in，580px 寬，max 92vw）：4 個頁籤（篩選條件 / 部門比例 / 個別比例 / 簽核歷史），資料來源 [F050 v2.2 §6.2](F050-create-list-definition.md)
9. **Toast container**（右上角）：sessionStorage signal toast 顯示位置（依 AC-K9）

### 8.2 stage 卡片配色（沿用 [F077 v1.3 §7](F077-month-switch-and-stage-overview.md)）

| stage | 欄頭背景 | 欄頭文字 | mini bar 與 KPI 主色 |
|---|---|---|---|
| `draft` | `#F9FAFB` | `#6B7280` | `#9CA3AF` |
| `dept_ratio` | `#EFF6FF` | `#1E40AF` | `#3B82F6` |
| `personnel_ratio` | `#ECFEFF` | `#0E7490` | `#06B6D4` |
| `approval` | `#FFFBEB` | `#92400E` | `#F59E0B` |
| `ready` | `#F0FDF4` | `#15803D` | `#22C55E` |

### 8.3 Ready 欄頂 CTA Banner

詳細規格見 [F061 v1.4 §9](F061-trigger-assignment-run.md)（月跑唯一入口）+ [F049 v1.1 §8](F049-stage0-daily-estimate.md)（secondary「試算」按鈕入口）。本 spec 僅 reference，不重複定義。

### 8.4 卡片操作按鈕渲染條件

依 [F077 v1.3 BR-7](F077-month-switch-and-stage-overview.md) Role × Stage 矩陣 + 5 個橫切條件（歷史月份 / 月跑鎖 / 已停用 / 處長轄區 / 「查看」按鈕通用性）。本 spec 不重複定義，下游 UI/UX agent 與 TDD agent 應同時載入 F077 v1.3 §6 作為渲染權威。

### 8.5 Detail Drawer 樣式（沿用 prototype `27-list-definition.html` § Detail Drawer v2.1）

- 位置：頁面右側 slide-in，580px 寬，max 92vw
- backdrop：`rgba(0,0,0,0.4)`，z-index 49
- 開關動畫：`transform: translateX(...)`，250ms cubic-bezier
- 頁籤 4 個：篩選條件（預設）/ 部門比例 / 個別比例 / 簽核歷史
- 頁腳顯示 API 端點 hint（`GET /assignment/list-definitions/{listNo}/full-snapshot`）+「關閉」按鈕

### 8.6 sessionStorage `cdmp.pendingToast` 消化

- Consumer 行為依 [F050 v2.2 §7 BR-13](F050-create-list-definition.md)（4 點 consumer 規範）
- 消化時機：M01 主頁 `DOMContentLoaded` / React `useEffect([])`，於 Kanban 渲染**之後**
- Toast 顯示位置：頁面右上角 `toastContainer`（依 prototype）
- 本 spec 不重複定義 payload schema / key 命名

## 9. 相依性

- **Blocked By**：F001（登入驗證）、F002 §4.6（角色矩陣 + Guard）、F045（`business_role` 欄位設計）、[F077 v1.3](F077-month-switch-and-stage-overview.md)（月份切換 + Role × Stage 矩陣 single authority）、[F050 v2.2](F050-create-list-definition.md)（Detail Snapshot API + sessionStorage signal protocol single authority）
- **Blocks**：F049（Stage 0 試算）、F050（新增名單）、F051（編輯名單）、F052（停用名單）、F061（觸發月跑）、F078~F089（M01 階段操作之入口）
- **Detail Drawer 資料來源**：[F050 v2.2 §6.2](F050-create-list-definition.md) `GET /assignment/list-definitions/:listNo/full-snapshot`
- **Ready CTA Banner 規範**：[F061 v1.4 §9](F061-trigger-assignment-run.md)（月跑主按鈕）+ [F049 v1.1 §8](F049-stage0-daily-estimate.md)（試算 secondary 按鈕）
- **sessionStorage signal protocol**：[F050 v2.2 §7 BR-13](F050-create-list-definition.md)

## 10. 交叉參考

- 資料模型：[data-model.md#e07-data-model](../data-model.md#e07-data-model)
- 錯誤處理：[error-handling.md#assignment-errors](../error-handling.md#assignment-errors)
- 非功能需求：[nfr.md](../nfr.md)（NFR-003 執行效能）
- 架構決策：AD-E07-1（OB 遷移至 AppDB）
- 相關功能：[F049 v1.1](F049-stage0-daily-estimate.md)（Stage 0 估算 + CTA Banner secondary 入口）、[F050 v2.2](F050-create-list-definition.md)（新增名單 + §6.2 Detail Snapshot API + §7 BR-13 sessionStorage signal）、[F051](F051-edit-list-definition.md)、[F052 v2.1](F052-disable-list-definition.md)、[F061 v1.4](F061-trigger-assignment-run.md)（月跑 + CTA Banner 主按鈕）、[F077 v1.3](F077-month-switch-and-stage-overview.md)（Role × Stage 矩陣 + 月份切換 single authority）、[F078](F078-draft-advance-to-dept-ratio.md) / [F081 v1.3](F081-rollback-to-draft.md) / [F085 v1.3](F085-rollback-to-dept-ratio.md) / [F089 v1.3](F089-rollback-to-approval.md)（推進 / 退回操作）、[F002 §4.6 角色矩陣](F002-user-login.md)
- 對應 User Story：[US-070 v2.3](../../stories/epics/E07-app-customer-list-assignment/US-070-M01-view-list-definition.md)、[US-130](../../stories/epics/E07-app-customer-list-assignment/US-130-M01-kanban-board-view.md)、[US-131](../../stories/epics/E07-app-customer-list-assignment/US-131-M01-detail-drawer.md)、[US-132](../../stories/epics/E07-app-customer-list-assignment/US-132-M01-ready-cta-banner.md)、[US-133](../../stories/epics/E07-app-customer-list-assignment/US-133-M01-pending-toast-signal.md)

## 11. 變更紀錄

| 版本 | 日期 | 變更內容 |
|---|---|---|
| v1.0 | 2026-04-24 | 初版（平鋪表格 + 使用中/已停用頁籤；操作按鈕欄含編輯 / 停用 / 設定部門比例 / 計算案件數量） |
| v2.0 | 2026-05-21 | **M01 v2.0~v2.3 Kanban 重構**：(1) 主頁呈現由平鋪表格改為 5 欄 Kanban 看板，新增 AC-K1~AC-K10 涵蓋 5 欄看板 / 卡片格式 / KPI 4 卡 / 月份準備度進度條 / 搜尋過濾 / 歷史月份唯讀 / Toolbar 規則 / user 整頁封鎖 / sessionStorage signal consumer / 處長轄區隔離；(2) v1.0 AC-1（表格列）/ AC-5（頁籤）以 strikethrough 保留，由 Kanban 視圖取代；(3) GET API 補 `stageCounts` / `currentWorkYm` / `isHistorical` / `isFuture` / `conditionPayload` / `legacyEntityFallback` 欄位；(4) Toolbar 移除「執行月跑」/「Stage 0 試算」按鈕（月跑唯一入口改為 Ready 欄頂 CTA Banner / 試算改為 CTA secondary 按鈕，cross-reference F061 v1.4 + F049 v1.1）；(5) 操作按鈕渲染條件統一 reference F077 v1.3 BR-7 矩陣，不重複定義；(6) Detail Drawer 入口為「查看」按鈕，端點規格 reference F050 v2.2 §6.2；(7) sessionStorage signal protocol consumer，規範 reference F050 v2.2 §7 BR-13 |
