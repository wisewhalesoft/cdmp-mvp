---
spec-id: F117
title: 部門比例設定頁僅提供「有在職處長」之部門設定
feature-id: F117
source-story: US-180
epic: E07
module: M03a 部門比例設定階段
priority: P1
version: "1.1"
date: 2026-08-04
status: Approved — 已通過人工審閱，可進入 TDD
---

# F117: 部門比例設定頁僅提供「有在職處長」之部門設定

Priority: P1 | Status: **Approved — 已通過人工審閱（可進入 TDD 實作）** | Last Updated: 2026-08-04

> **✅ 本文件已核可**（2026-08-04 人工審閱閘）。阻塞性事項 **OQ-F117-B1（＝US-180 OQ-180-02）已由業務主管裁決**：採「**孤兒部門顯示但鎖定 ＋ 後端強制保留**」，**不**提供「強制歸零」按鈕（出場機制沿用既有 F081「退回草稿」，見 BR-11）。裁決細節見 §12.1 D-6。本文件之 AC 自此為最終契約。
>
> **v1.1（2026-08-04 / 人工審閱閘）**：記錄 OQ-F117-B1 裁決（D-6）；新增 BR-11（孤兒部門出場機制＝F081 rollback，經查證 `stage-action.service.ts:164` 確為 DELETE 全部列）；AC-7 補述「可編輯部門數 = 0 時儲存亦停用」；移除空狀態「重新查詢」按鈕（無對應 AC）。
>
> **v1.0（2026-08-04 / US-180）**：初版。核心貢獻為調和 US-180 AC-1（隱藏無處長部門）與 AC-3（不得靜默刪除既存比例）之直接衝突——兩者於 F079 BR-5「覆寫式寫入」語意下無法同時成立。調和方案見 §12.1。

## Agent Loading Guide

| Agent 角色 | 需載入的檔案 |
|-----------|-------------|
| TDD Developer | 本文件 + [F079](F079-set-dept-ratio.md)（本 feature 為其精煉，主流程契約以 F079 為準） + `data-model.md#ob_dept_pctobmdeptpct--per-list-no-部門比例` + `data-model.md#ob_emphireobemphire--員工主檔` + `error-handling.md#assignment-ratio-errors` |
| QA / Tester | 本文件 §4 / §10 + [F079](F079-set-dept-ratio.md) §4 + `error-handling.md#assignment-ratio-errors` |
| UI/UX Designer | 本文件 §7 + `prototypes/29a-dept-ratio-config.html` |
| Architect | 本文件 §5 / §12 + [F079](F079-set-dept-ratio.md) §5 |

---

## 對應 User Story

- 來源 Story：[US-180-M03a-hide-depts-without-director.md](../../stories/epics/E07-app-customer-list-assignment/US-180-M03a-hide-depts-without-director.md)（**DRAFT**）
- Epic：[E07 — 客戶名單分派](../../stories/epics/E07-app-customer-list-assignment/epic-brief.md)
- 模組：M03a 部門比例設定階段
- 精煉對象：[F079 v1.3 部門比例設定](F079-set-dept-ratio.md)（本 feature **不取代** F079，僅疊加可設定範圍之限縮規則）

---

## 1. 功能摘要

限縮「部門比例設定」頁（F079）之**可設定部門範圍**：只有「目前有在職處長」的部門才可被配置分派比例，避免部長將案件比例配置給無人於流程上負責後續 M03b 個別業務比例設定之部門。

**範圍**：

- 僅影響 F079 GET `/api/v1/assignment/ratios/dept/{listNo}` 之**呈現與可編輯範圍**，以及 PUT 之**防呆驗證與既有列保留規則**
- **不改變** F079 之階段限制、角色限制、歷史月份限制、加總 100% 不變式（I-8）、覆寫式寫入之基本語意
- **不影響**「名單快照 Detail Drawer」（`getFullSnapshot` 為獨立查詢、其 `SnapshotDeptRatio` 型別本就無 `directorName` 欄位，見 §12.1 D-3）

**本 feature 之核心設計問題**：US-180 AC-1 要求「無處長部門不出現於可設定清單」，AC-3 要求「既存非零比例不得因此被靜默刪除」。在 F079 BR-5「PUT 先 DELETE 該 `(project_workym, list_no)` 全部既有列、再 INSERT payload」之語意下，**單純把無處長部門從清單移除即等同靜默刪除**。§12.1 之調和設計為本 spec 之主要產出。

## 2. 使用者故事

**As a** 部長（Director）/ Admin
**I want** 在部門比例設定頁只對「目前有在職處長」的部門配置比例
**So that** 我不會把案件配給沒有人負責跟進的部門，也不會被畫面上一排「—」誤導為資料同步異常

## 3. 前置條件

- 沿用 [F079 §3](F079-set-dept-ratio.md) 全部前置條件（JWT / `DirectorGuard` / `stage = 'dept_ratio'` / 非歷史月份 / 無執行中月名單分派）
- `ob_emphire` 具備可判定處長之資料（`jfun_nm`、`dept_code`、`hire_date`、`resign_date`）

## 4. 驗收標準

> **判定用語定義（全 AC 共用）**
> - **有處長部門**：依 BR-1 判定存在至少一位在職且 `jfun_nm = '處長'` 之員工的部門。
> - **孤兒部門（orphan）**：無在職處長，**且** `ob_dept_pct` 於本 `(project_workym, list_no)` 已存在 `ration > 0` 之既有紀錄。
> - **無關部門**：無在職處長，且既有 `ration = 0` 或無既有紀錄。

### AC-1：可設定清單只包含「有處長部門」

- **Given** 部長 / Admin 進入某份 `stage = 'dept_ratio'` 名單之部門比例設定頁
- **When** 頁面載入部門清單
- **Then** **可編輯**之部門僅限「有處長部門」
- **And** 「無關部門」**不出現**於畫面任何位置（既不可編輯亦不顯示）
- **And** 「孤兒部門」依 AC-3 以唯讀鎖定列顯示（**此為對 US-180 AC-1 字面之裁決偏離，見 §12.1 D-1**）

### AC-2：處長之在職判定沿用全系統唯一語意

- **Given** 系統判定某部門是否「有在職處長」
- **When** 執行判定
- **Then** 「在職」定義**必須**沿用 `emphire-active.util`（`resign_date` 為 `NULL` **或** `>=` 系統日；哨兵 `9999-12-31` 視為永久在職）
- **And** **不得**為本頁另立一套在職認定邏輯
- **And** 處長判定條件與 [F079 BR-14](F079-set-dept-ratio.md) 完全一致（`TRIM(jfun_nm) = '處長'`），不得另訂職稱字串

### AC-3（★核心）：孤兒部門以唯讀鎖定列呈現，既有比例不被靜默清除

- **Given** 某部門於 `ob_dept_pct` 已存有 `ration > 0`，且目前依 AC-2 判定查無在職處長（＝孤兒部門）
- **When** 部長 / Admin 開啟設定頁
- **Then** 該部門**仍顯示於清單**，但比例輸入框為 `disabled`（唯讀鎖定），並標示「無在職處長」狀態
- **And** 該列之既有 `ration` 值原樣顯示，**計入**畫面加總（見 AC-5）
- **When** 部長 / Admin 執行「儲存」
- **Then** 後端**不得**刪除該孤兒部門之既有紀錄，無論其是否出現於 PUT payload（見 BR-4 伺服器端保留規則）
- **And** 系統於畫面提供可理解之說明，使使用者知悉該部門因無處長而無法調整，需先處理處長派任或另行歸零

### AC-4：孤兒部門之既有比例不得隱含變更；出場機制為既有「退回草稿」

- **Given** 畫面存在一個孤兒部門鎖定列
- **When** 部長 / Admin 未對其執行任何明確操作即儲存
- **Then** 該部門之 `ration` 於儲存前後完全相同（值不變、列不消失）
- **And** `assignment_audit_log` 之 `after_value` 必須包含該孤兒部門之紀錄（不得因未出現在 payload 而於稽核中消失）
- **And** 本 feature **不**提供「強制歸零」按鈕（OQ-F117-B1 裁決，§12.1 D-6）；孤兒部門之出場路徑為既有 [F081](F081-rollback-dept-ratio-to-draft.md)「退回草稿」（清空該名單全部 `ob_dept_pct` 列後重設，BR-11）
- **And** 孤兒鎖定列之「操作」欄不得渲染任何寫入動作（含既有「清空」鈕），以免暗示存在本 feature 未提供之出場操作

### AC-5：加總 100% 之檢核範圍涵蓋所有將被持久化之列

- **Given** 畫面同時存在「有處長部門」可編輯列與「孤兒部門」鎖定列
- **When** 系統計算加總並判定「儲存」按鈕是否啟用
- **Then** 加總範圍 = 可編輯列 ration 總和 **＋** 孤兒部門鎖定列 ration 總和
- **And** 該加總須落於 [99.99, 100.01]（沿用 I-8 / [F079 BR-2](F079-set-dept-ratio.md)）方可儲存
- **And** 後端 PUT 之加總驗證範圍 = `payload 之列` **∪** `BR-4 保留之孤兒列`，兩者一致；不得出現「畫面顯示 100% 但持久化後不為 100%」之落差
- **And** 「無關部門」ration 恆為 0，不影響加總（**此使「隱藏」對加總為零影響，為 D-1 調和成立之關鍵**）

### AC-6：防呆——不得對無處長部門配置非零比例

- **Given** PUT payload 含某部門 `ration > 0`，該部門依 AC-2 無在職處長，且**非**孤兒部門（即無既有 `ration > 0`）
- **When** 後端執行寫入驗證
- **Then** 回 422 `RATIO_DEPT_DIRECTOR_REQUIRED`，訊息指明該部門代碼
- **And** 此為 defense-in-depth（正常前端流程不應送出此 payload）

### AC-7：全部部門皆無在職處長時之明確空狀態

- **Given** 經 AC-1 過濾後可編輯部門數為 0
- **When** 部長 / Admin 進入設定頁
- **Then** 顯示明確空狀態文案，語意為「目前沒有任何部門具在職處長，無法設定分派比例」
- **And** **不得**沿用既有「目前無在職部門可設定」文案（該文案會誤導為 `ob_emphire` 同步異常）
- **And** 使用者無法推進至 M03b 個別業務比例設定階段，且畫面說明無法推進之原因
- **And** 「儲存」**亦**停用（可編輯列為 0 時無任何可儲存之變更；即使孤兒鎖定列本身加總為 100%，其值依 BR-4 / BR-5 恆由伺服器保留，不需經儲存動作寫入）
- **And** 若此時仍存在孤兒部門鎖定列，其仍依 AC-3 顯示（空狀態僅針對「可編輯部門數 = 0」）
- **And** 空狀態**不**提供「重新查詢」等本 spec 未定義之操作；使用者以瀏覽器重新整理即可重新載入

### AC-8：已隱藏部門之透明度提示

- **Given** 本次載入存在 N 個「無關部門」被隱藏（N > 0）
- **When** 頁面渲染
- **Then** 顯示一則資訊列，說明「有 N 個部門因目前無在職處長而未列出」
- **And** N = 0 時不顯示該資訊列
- **And** 資訊列不得阻擋操作（純告知）

### AC-9：處長角色之既有唯讀限制不受影響

- **Given** 帳號業務角色為處長（`section_chief`）
- **When** 存取設定頁或呼叫 GET / PUT
- **Then** 沿用 [F079 AC-8](F079-set-dept-ratio.md) 既有限制（403 `AUTH_FORBIDDEN`、不渲染入口），行為與本 feature 實作前完全一致

### AC-10：既有消費端回歸不變

- **Given** 本 feature 已實作
- **When** 檢視「準備完成摘要」頁（`excludeZeroRatio: true`）與「名單快照 Detail Drawer」之部門比例呈現
- **Then** 兩者結果與本 feature 實作前**完全一致**（見 §12.1 D-3 之技術論證：對兩者皆為 no-op）

## 5. API 規格

> 端點路徑、認證、權限、既有錯誤碼一律沿用 [F079 §5](F079-set-dept-ratio.md)。本節僅描述**增量**。

### 5.1 GET /api/v1/assignment/ratios/dept/{listNo} — 增量

新增選用 query flag（比照既有 `excludeZeroRatio` 之 API 層 flag 模式）：

| 參數 | 型別 | 預設 | 說明 |
|---|---|---|---|
| `requireDirector` | boolean | `false` | `true` 時套用 AC-1 過濾規則。設定頁帶 `true`；其餘既有消費端不帶（維持既有行為，AC-10） |

> **flag 命名為 [ASSUMPTION]**（§12 A-1），由 system-architect 定案；**行為契約（本節 response 語意）不因命名而改變**。

**Response — 200 OK（增量欄位）**

```json
{
  "deptRatios": [
    { "obdeptId": "XTC0", "obdeptNm": "業務一部", "ration": 60.0, "isActive": true,
      "directorName": "李處長", "hasActiveDirector": true,  "isRatioEditable": true },
    { "obdeptId": "XTE0", "obdeptNm": "業務三部", "ration": 40.0, "isActive": true,
      "directorName": null,   "hasActiveDirector": false, "isRatioEditable": false }
  ],
  "total": 100.0,
  "hiddenNoDirectorCount": 2,
  "isReadOnly": false
}
```

| 欄位 | 語意 |
|---|---|
| `hasActiveDirector` | 依 BR-1 判定；`directorName != null` 之布林投影（獨立欄位以免前端以字串判定） |
| `isRatioEditable` | `hasActiveDirector === true`；孤兒部門為 `false`（前端 `disabled` 依據，AC-3） |
| `hiddenNoDirectorCount` | 本次因 AC-1 被隱藏之「無關部門」數量（AC-8 資訊列來源）；`requireDirector = false` 時恆為 `0` |
| `total` | 依 AC-5 涵蓋所有回傳列（可編輯 + 鎖定），**不含**已隱藏之無關部門（其 ration 恆 0，不影響值） |

### 5.2 PUT /api/v1/assignment/ratios/dept/{listNo} — 增量

Request body 結構不變（沿用 F079 §5.2）。**新增伺服器端規則**：

1. **孤兒列保留（BR-4）**：寫入前先讀取本 `(project_workym, list_no)` 既有列，識別孤兒部門；覆寫式 DELETE + INSERT 時，**孤兒列一律以其既有值重新寫回**，不論是否出現於 payload。
2. **鎖定列不可經 payload 竄改（BR-5）**：payload 若含孤兒部門且值與既有不同，**以既有值為準**（payload 值忽略），不回錯誤。
3. **無處長新配置攔截（BR-6）**：payload 含無在職處長且非孤兒之部門且 `ration > 0` → 422 `RATIO_DEPT_DIRECTOR_REQUIRED`。
4. **加總驗證範圍（BR-7）**：驗證對象為「payload 列（扣除被忽略之孤兒列）∪ 保留之孤兒列」之最終持久化集合，而非 payload 本身。

**新增錯誤碼**

| HTTP | 錯誤碼 | 說明 |
|---|---|---|
| 422 | `RATIO_DEPT_DIRECTOR_REQUIRED` | payload 對無在職處長之非孤兒部門配置 `ration > 0`（AC-6 / BR-6） |

## 6. 業務規則

| 規則編號 | 說明 |
|---|---|
| BR-1 | **處長判定唯一來源**：`TRIM(jfun_nm) = '處長'` AND 在職（`activeEmphireCondition`，即 `resign_date IS NULL OR resign_date >= 系統日`，哨兵 `9999-12-31`）AND `TRIM(dept_code)` 對應該部門。同部門多位處長取最早 `hire_date`（沿用 [F079 BR-14](F079-set-dept-ratio.md)）。**禁止**新增第二套在職 / 職稱判定 |
| BR-2 | **三分類**：每個候選部門依 (有無在職處長) × (既有 ration 是否 > 0) 落入「有處長部門（可編輯）」/「孤兒部門（鎖定顯示）」/「無關部門（隱藏）」三類之一。分類於 GET 回應時計算，**不落表** |
| BR-3 | **隱藏之零影響性**：無關部門既有 ration 必為 0 或無紀錄，故隱藏對 I-8 加總不變式為零影響。此為 AC-1 與 [F079 BR-2](F079-set-dept-ratio.md) 可並存之根據 |
| BR-4 | **孤兒列伺服器端保留**：PUT 之覆寫式寫入（[F079 BR-5](F079-set-dept-ratio.md)）必須以「既有孤兒列一律重新寫回」為前置步驟。此規則為 AC-3 不變式之**伺服器端保證**，即使前端送出不含孤兒列之 payload 亦不得遺失 |
| BR-5 | **鎖定列以既有值為準**：孤兒列不可經 payload 修改；payload 帶入之不同值一律忽略，不回錯誤（避免前端狀態同步問題造成誤擋） |
| BR-6 | **無處長不可新配置**：對無在職處長且非孤兒之部門配置 `ration > 0` → 422 `RATIO_DEPT_DIRECTOR_REQUIRED` |
| BR-7 | **加總驗證對象為最終持久化集合**：`RATIO_SUM_NOT_100` 之判定基準為 BR-4 / BR-5 套用後之最終列集合，非原始 payload |
| BR-8 | **既有 flag 相容**：`requireDirector` 與既有 `excludeZeroRatio` 正交，可並存；兩者皆不帶時行為與本 feature 實作前完全相同（AC-10 回歸基準） |
| BR-9 | **稽核完整性**：`assignment_audit_log` 之 `before_value` / `after_value` 記錄**最終持久化集合**（含保留之孤兒列），不得只記錄 payload |
| BR-11 | **孤兒部門出場機制＝既有 F081「退回草稿」**（OQ-F117-B1 裁決）：[F081](F081-rollback-dept-ratio-to-draft.md) 之 rollback 會 `DELETE` 該 `(project_workym, list_no)` 之**全部** `ob_dept_pct` 列（已查證 `stage-action.service.ts:164`），**含孤兒列**。此為刻意保留之逃生口，**不視為與 BR-4 衝突**：BR-4 約束的是「PUT 儲存路徑不得靜默刪除」，rollback 則為使用者明確發起、且既有 UI 已警示「資料將清空且無法復原」之破壞性操作。本 feature **不**修改 F081 語意，亦**不**新增「強制歸零」操作 |
| BR-10 | **`isActive` 與 `hasActiveDirector` 為正交概念**：`isActive`（[F079 AC-2](F079-set-dept-ratio.md) 之「部門已下線」）指部門是否仍有在職員工；`hasActiveDirector` 指是否有在職處長。一個部門可為 `isActive = true` 但 `hasActiveDirector = false`。UI 需可同時呈現兩種狀態且不混淆 |

## 7. UI/UX 需求

> Prototype = UI ground truth（CLAUDE.md）。本 feature 需 ui-ux-designer 更新 `prototypes/29a-dept-ratio-config.html`。

- **可編輯列**：沿用 F079 既有樣式
- **孤兒部門鎖定列**：比例輸入框 `disabled`；標示「無在職處長」狀態；視覺上須與既有「已下線」徽章（`isActive = false`）**明確可區分**（BR-10）
- **已隱藏資訊列**（AC-8）：`hiddenNoDirectorCount > 0` 時顯示，純告知不阻擋
- **空狀態**（AC-7）：文案語意須排除「資料同步異常」之誤讀
- **加總顯示**：涵蓋鎖定列（AC-5），使用者可理解為何加總已包含一個不可編輯的值
- **孤兒鎖定列之操作欄**：不渲染任何寫入動作（AC-4）
- **「未設代理」紅點須保留（人工審閱裁決）**：`prototypes/29a-dept-ratio-config.html` 現有「未設代理」紅點指示為「**顯示且標示**」語意，與本 feature 三分類不同；且「代理」與「處長」為**不同業務概念**，本 feature **不得**沿用其視覺語彙，亦**不得**將其移除。孤兒鎖定列須設計可與「已下線」徽章及「未設代理」紅點三者互不混淆之樣式（OQ-F117-04 已裁決：保留既有、另設新樣式）

## 8. 依賴關係

- **Blocked By**：[F079 v1.3](F079-set-dept-ratio.md)（部門比例設定主流程）、[F073](F073-define-director-role.md) / [F074](F074-define-section-chief-role.md)（角色定義）
- **Blocks**：無
- **回歸關注對象**：[F088](F088-ready-stage-summary.md)（準備完成摘要，既有 `excludeZeroRatio` 消費端）、[F066](F066-view-run-snapshot-detail.md)（快照 Detail Drawer，經查證不受影響）
- **下游語意關聯**：[F080](F080-advance-to-personnel-ratio.md)（推進前置條件為加總 100%）、M03b 個別業務比例（由該部門處長設定——即本 feature 之業務動機）

## 9. 交叉參照

- **主流程**：[F079 v1.3](F079-set-dept-ratio.md)（**契約母體，衝突時以 F079 為準，本檔僅疊加限縮**）
- **資料模型**：[data-model.md#ob_dept_pctobmdeptpct--per-list-no-部門比例](../data-model.md#ob_dept_pctobmdeptpct--per-list-no-部門比例)、[data-model.md#ob_emphireobemphire--員工主檔](../data-model.md#ob_emphireobemphire--員工主檔)
- **錯誤代碼**：[error-handling.md#assignment-ratio-errors](../error-handling.md#assignment-ratio-errors)
- **待決事項**：[open-questions.md](../open-questions.md)（OQ-F117-01 ~ OQ-F117-04）
- **圖表**：[diagrams/F117-dept-ratio-director-filter-flow.mmd](../diagrams/F117-dept-ratio-director-filter-flow.mmd)
- **Prototype**：`prototypes/29a-dept-ratio-config.html`

## 10. 測試覆蓋目標

- 單元測試覆蓋率 ≥ 80%；後端測試須同時涵蓋 SQLite unit 與 MSSQL spec 兩軌
- **後端關鍵案例**：
  - GET `requireDirector=true`：4 部門皆有處長 → 全數可編輯、`hiddenNoDirectorCount = 0`
  - GET：5 部門其中 1 無處長且既有 ration = 0 → 回 4 列、`hiddenNoDirectorCount = 1`
  - GET：1 部門無處長但既有 ration = 20 → 回該列且 `isRatioEditable = false`、`hiddenNoDirectorCount` 不含之
  - GET：處長已離職（`resign_date` < 系統日，非哨兵）→ 判定無處長
  - GET：處長 `resign_date = 9999-12-31`（哨兵）→ 判定**有**處長（在職語意迴歸）
  - GET：同部門 2 位在職處長 → 取最早 `hire_date`（BR-1）
  - GET `requireDirector` 不帶 → 回應與本 feature 前完全一致（AC-10）
  - **PUT 孤兒保留（★核心）**：既有 {A:60(有處長), B:40(無處長)}，payload 僅送 {A:60} → 持久化為 {A:60, B:40}，總和 100，**B 未消失**（AC-3 / BR-4）
  - PUT 孤兒列竄改：payload 送 {A:60, B:0} → B 仍為 40（BR-5），加總驗證以 {A:60,B:40} 為準
  - PUT 無處長新配置：payload 對無處長且無既有比例之 C 配 10% → 422 `RATIO_DEPT_DIRECTOR_REQUIRED`
  - PUT 加總範圍：payload {A:100} + 孤兒 B:40 → 最終 140 → 422 `RATIO_SUM_NOT_100`（BR-7）
  - PUT 稽核：`after_value` 含保留之孤兒列（AC-4 / BR-9）
  - PUT 處長角色 → 403 `AUTH_FORBIDDEN`（AC-9 回歸）
- **前端關鍵案例**：
  - 孤兒列輸入框 `disabled` 且與「已下線」徽章視覺可區分
  - 加總包含鎖定列（AC-5）
  - `hiddenNoDirectorCount > 0` → 資訊列顯示；= 0 → 不顯示
  - 可編輯部門數 = 0 → 空狀態文案、推進**與儲存**皆停用（AC-7）
  - 孤兒鎖定列之操作欄不渲染任何寫入動作（AC-4）
  - 孤兒鎖定列樣式與「已下線」徽章、「未設代理」紅點三者互不混淆（§7）
- **回歸**：準備完成摘要與 Detail Drawer 之部門比例呈現逐欄位比對實作前後一致（AC-10 / D-3）
- **回歸（BR-11）**：F081「退回草稿」對含孤兒列之名單仍清空**全部** `ob_dept_pct` 列，行為與本 feature 實作前一致（此為刻意保留之出場機制，非 BR-4 違反）

## 11. 實作 Checklist

- [ ] 後端 GET 新增 `requireDirector` flag + `hasActiveDirector` / `isRatioEditable` / `hiddenNoDirectorCount` 欄位
- [ ] 後端 PUT 實作 BR-4 孤兒列保留 + BR-5 鎖定值優先 + BR-6 防呆 + BR-7 加總範圍
- [ ] `error-handling.md` 新增 `RATIO_DEPT_DIRECTOR_REQUIRED`（本輪已登錄）
- [ ] 前端設定頁三分類渲染 + 鎖定列 + 資訊列 + 空狀態（含 AC-7 儲存亦停用）
- [x] `prototypes/29a-dept-ratio-config.html` 已由 ui-ux-designer 更新並經人工審閱合併（保留既有「未設代理」紅點）
- [ ] 回歸測試：準備完成摘要 / Detail Drawer（AC-10）+ F081 rollback（BR-11）

## 12. 假設與裁決偏離

### 12.1 對 US-180 之裁決偏離（★ 本 spec 之核心產出）

> 下列為 spec-writer 依既有實作事實所做之調和裁決。**每一項都改變了 US-180 字面 AC 之可測契約**，故 TDD / test-designer 應以本表為準，並在人工審閱時優先確認。

| # | US-180 原文 | 本 spec 裁決 | 理由（技術事實） |
|---|---|---|---|
| **D-1** | AC-1：「無在職處長的在職部門**不出現**於可設定清單中」（一律隱藏） | **三分類**：無處長且既有 ration = 0 → 隱藏；無處長但既有 ration > 0（孤兒）→ **顯示但鎖定** | US-180 AC-1（隱藏）與 AC-3（不得靜默刪除）在 [F079 BR-5](F079-set-dept-ratio.md)「PUT 先 DELETE 全部既有列再 INSERT payload」語意下**互相矛盾**：純隱藏 ⇒ 該列不在 payload ⇒ 儲存即刪除。已於 `dept-ratio.service.ts` 確認覆寫式寫入為實際行為。三分類使兩條 AC 同時成立，且隱藏集合恆為 ration = 0，對加總零影響（BR-3）。**此即 OQ-180-02 三個候選方案中 (a)＋(c) 之組合**，並非新方案 |
| **D-2** | AC-5：「加總 100% 的檢核範圍**僅涵蓋畫面上實際顯示（有處長）的部門**」 | 加總範圍 = 可編輯列 **＋ 孤兒鎖定列**（即所有將被持久化之列） | US-180 AC-5 字面會**違反 I-8 / [F079 BR-2](F079-set-dept-ratio.md)**（同 `(project_workym, list_no)` 全部 `ob_dept_pct` 列加總須為 100）。若孤兒列被保留（D-1）卻不計入加總，持久化後總和必 > 100，且 US-180 AC-5 自身之「不可造成畫面 100% 但實際不是 100%」要求同時被違反。故取其**意圖**（一致性）而棄其**字面**（僅顯示列） |
| **D-3** | OQ-180-04：「過濾是否也要套用到『準備完成摘要』」列為待裁 | **裁定：不套用，且無須套用——對其為 no-op** | 準備完成摘要呼叫時帶 `excludeZeroRatio: true`，已隱藏所有 ration = 0 之部門；而本 feature 之隱藏集合（無關部門）**恆為 ration = 0 之子集**。故套用與否結果完全相同。孤兒部門（ration > 0）於摘要頁**應**顯示（該部門確有配額），套用過濾反而會使其消失。Detail Drawer 走獨立 `deptPctRepo.find()`、其 `SnapshotDeptRatio` 無 `directorName`，結構上不受影響。**⇒ OQ-180-04 於技術上自動收斂，無需業務裁示** |
| **D-4** | 未提及 | **新增錯誤碼 `RATIO_DEPT_DIRECTOR_REQUIRED`（422）** | AC-1 若僅由前端過濾實現則無伺服器端保證；直接呼叫 API 仍可對無處長部門配額，違背本 feature 業務目的。補 defense-in-depth 攔截（BR-6），沿用 E07「422 = 業務規則違反」慣例 |
| **D-5** | OQ-180-01：過濾在 API 層或前端層 | **裁定：API 層 flag**（比照既有 `excludeZeroRatio`） | 前端層過濾無法提供 BR-4 孤兒保留與 BR-6 防呆之伺服器端保證（AC-3 為不變式，必須由後端保證）。flag **命名**仍交 architect（A-1） |
| **D-6** | OQ-F117-B1（＝US-180 OQ-180-02）：孤兒部門最終處理方式 | **業務主管已裁決（2026-08-04）：採「顯示但鎖定 ＋ 後端強制保留」，不提供「強制歸零」按鈕** | 三項確認皆已回覆：①接受該列在處長派任前無法調整②**不需要**強制歸零操作——既有 [F081](F081-rollback-dept-ratio-to-draft.md)「退回草稿」已 DELETE 全部 `ob_dept_pct` 列（含孤兒列），足為出場機制（BR-11），另做強制歸零會使 BR-5「payload 對孤兒列之值一律忽略」需開例外通道，徒增複雜度③加總含鎖定列符合業務預期。**此裁決解除本 feature 之實作阻塞** |

### 12.2 假設清單

| # | 假設 | 標記 |
|---|---|---|
| A-1 | **flag 命名**：`requireDirector`（system-architect 已定案採本 spec 建議，見 [AD-E07-48 §3.1 A-1](../implementation-log/AD-E07-48-f117-f118-ux-refinements.md)） | ✅ 已定案 |
| A-2 | **孤兒判定之時間點**：以 GET / PUT 當下即時查詢 `ob_emphire` 為準，不快取、不落表。處長於使用者停留頁面期間離職之競態視為可接受（下次載入即修正）；PUT 之 BR-4 / BR-6 以寫入當下重新判定為準。**system-architect 已確認不引入樂觀鎖**（[AD-E07-48 §3.1 A-2](../implementation-log/AD-E07-48-f117-f118-ux-refinements.md)：最差結果為多保留或少保留一列孤兒，皆非資料損壞） | ✅ 已定案 |
| A-3 | **`hiddenNoDirectorCount` 之語意**：僅計「無關部門」，不含孤兒部門（孤兒有顯示故不算隱藏） | spec-writer 裁定 |
| A-4 | **孤兒部門之最終出場機制**：**已裁決**——處長派任後自動恢復可編輯；或經既有 [F081](F081-rollback-dept-ratio-to-draft.md)「退回草稿」清空全部列（BR-11）。**不**新增「強制歸零」操作（D-6） | ✅ 業務主管已裁決 |
| A-5 | **`isActive = false` 且無處長且 ration > 0**：同時為「已下線」與「孤兒」；本 spec 依 BR-10 視為孤兒處理（鎖定顯示），並同時顯示兩種狀態標示 | spec-writer 裁定 |

## 13. 變更紀錄

| 版本 | 日期 | 變更內容 |
|---|---|---|
| v1.1 | 2026-08-04 | **人工審閱閘通過，狀態 Draft → Approved**。OQ-F117-B1 業務裁決＝「顯示但鎖定＋後端保留、不做強制歸零」（D-6）；新增 BR-11（出場機制＝F081 rollback，經查證 `stage-action.service.ts:164`）；AC-4 補「不渲染寫入動作」；AC-7 補「儲存亦停用」＋移除未定義之「重新查詢」；§7 裁定保留既有「未設代理」紅點（與「處長」為不同概念）；A-1 / A-2 / A-4 假設全數解除 |
| v1.0 | 2026-08-04 | 初版（DRAFT，依 DRAFT 狀態之 US-180 撰寫）。核心為 §12.1 D-1 ~ D-5 之裁決偏離：三分類調和 AC-1/AC-3 衝突、加總範圍改為最終持久化集合、OQ-180-04 技術收斂為 no-op、新增 `RATIO_DEPT_DIRECTOR_REQUIRED`、過濾定於 API 層。**OQ-180-02 之業務確認仍為進入實作之硬性前置** |
